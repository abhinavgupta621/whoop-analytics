/**
 * BLE connection service supporting:
 * 1. Standard Heart Rate Service (any HR monitor)
 * 2. Whoop 4.0 custom protocol (extended sensor data)
 */

import {
  WHOOP_SERVICE_UUID,
  CMD_TO_STRAP_UUID,
  CMD_FROM_STRAP_UUID,
  EVENTS_FROM_STRAP_UUID,
  DATA_FROM_STRAP_UUID,
  HR_SERVICE_UUID,
  HR_MEASUREMENT_UUID,
  buildCommand,
  WhoopCommand,
  parseRealtimeHR,
  parseSyncData,
  parseSyncAck,
  parseEvent,
  parseStandardHR,
} from './whoopProtocol';
import type { WhoopSensorData, WhoopEvent } from './whoopProtocol';

export type { WhoopSensorData, WhoopEvent };

export interface DeviceCallbacks {
  onHeartRate: (hr: number, rrIntervals: number[]) => void;
  onSensorData?: (data: WhoopSensorData) => void;
  onEvent?: (event: WhoopEvent) => void;
  onBattery?: (level: number) => void;
  onDisconnect: () => void;
}

export interface BLEConnection {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  isWhoop: boolean;
  cmdChar?: BluetoothRemoteGATTCharacteristic;
}

// Helper to create a BufferSource from Uint8Array (TS 5.9 ArrayBuffer strictness)
function toBuf(buf: Uint8Array): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export function isBLESupported(): boolean {
  return !!navigator.bluetooth;
}

function assertGatt(device: BluetoothDevice): BluetoothRemoteGATTServer {
  if (!device.gatt) {
    throw new Error(`Device "${device.name ?? device.id}" does not support GATT`);
  }
  return device.gatt;
}

export async function connectToDevice(
  callbacks: DeviceCallbacks,
): Promise<BLEConnection> {
  const device = await navigator.bluetooth.requestDevice({
    filters: [
      { services: [HR_SERVICE_UUID] },
      { namePrefix: 'WHOOP' },
      { namePrefix: 'Garmin' },
      { namePrefix: 'HRM-' },
      { namePrefix: 'Polar' },
    ],
    optionalServices: [HR_SERVICE_UUID, WHOOP_SERVICE_UUID],
  });

  const gatt = assertGatt(device);
  const server = await gatt.connect();

  let isWhoop = false;
  let cmdChar: BluetoothRemoteGATTCharacteristic | undefined;

  // Try Whoop custom service
  try {
    const whoopService = await server.getPrimaryService(WHOOP_SERVICE_UUID);
    isWhoop = true;

    cmdChar = await whoopService.getCharacteristic(CMD_TO_STRAP_UUID);

    // Subscribe to command responses
    const cmdFromStrap = await whoopService.getCharacteristic(CMD_FROM_STRAP_UUID);
    cmdFromStrap.addEventListener('characteristicvaluechanged', (_e: Event) => {
      // Command responses handled here
    });
    await cmdFromStrap.startNotifications();

    // Subscribe to events
    const eventsChar = await whoopService.getCharacteristic(EVENTS_FROM_STRAP_UUID);
    eventsChar.addEventListener('characteristicvaluechanged', (e: Event) => {
      const target = e.target as BluetoothRemoteGATTCharacteristic;
      if (!target.value) return;
      const event = parseEvent(target.value);
      if (event) {
        callbacks.onEvent?.(event);
        if (event.type === 3 && event.value != null) {
          callbacks.onBattery?.(event.value);
        }
      }
    });
    await eventsChar.startNotifications();

    // Subscribe to data stream
    const dataChar = await whoopService.getCharacteristic(DATA_FROM_STRAP_UUID);
    dataChar.addEventListener('characteristicvaluechanged', (e: Event) => {
      const target = e.target as BluetoothRemoteGATTCharacteristic;
      if (!target.value) return;

      const sensor = parseSyncData(target.value);
      if (sensor) {
        callbacks.onHeartRate(sensor.hr, sensor.rrIntervals);
        callbacks.onSensorData?.(sensor);
        return;
      }

      const hrData = parseRealtimeHR(target.value);
      if (hrData) {
        callbacks.onHeartRate(hrData.hr, hrData.rrIntervals);
        return;
      }

      const ackToken = parseSyncAck(target.value);
      if (ackToken && cmdChar) {
        const ackCmd = buildCommand(WhoopCommand.AckSyncBatch, [
          0x01,
          ...Array.from(ackToken),
        ]);
        cmdChar.writeValueWithoutResponse(toBuf(ackCmd)).catch(() => {});
      }
    });
    await dataChar.startNotifications();

    // Initialize device
    const now = Math.floor(Date.now() / 1000);
    const clockPayload = [
      now & 0xff,
      (now >>> 8) & 0xff,
      (now >>> 16) & 0xff,
      (now >>> 24) & 0xff,
    ];
    await cmdChar.writeValueWithoutResponse(
      toBuf(buildCommand(WhoopCommand.SetClock, clockPayload)),
    );
    await cmdChar.writeValueWithoutResponse(
      toBuf(buildCommand(WhoopCommand.ToggleRealtimeHr, [0x01])),
    );
    await cmdChar.writeValueWithoutResponse(
      toBuf(buildCommand(WhoopCommand.ToggleGenericHrProfile, [0x01])),
    );
    await cmdChar.writeValueWithoutResponse(
      toBuf(buildCommand(WhoopCommand.StartSync)),
    );
    await cmdChar.writeValueWithoutResponse(
      toBuf(buildCommand(WhoopCommand.GetBatteryLevel)),
    );
  } catch {
    // Not a Whoop — continue with standard HR only
  }

  // Always try standard HR service too
  try {
    const hrService = await server.getPrimaryService(HR_SERVICE_UUID);
    const hrChar = await hrService.getCharacteristic(HR_MEASUREMENT_UUID);

    hrChar.addEventListener('characteristicvaluechanged', (e: Event) => {
      const target = e.target as BluetoothRemoteGATTCharacteristic;
      if (!target.value) return;
      const { hr, rrIntervals } = parseStandardHR(target.value);
      callbacks.onHeartRate(hr, rrIntervals);
    });
    await hrChar.startNotifications();
  } catch {
    if (!isWhoop) throw new Error('No heart rate service found on device');
  }

  device.addEventListener(
    'gattserverdisconnected',
    () => callbacks.onDisconnect(),
    { once: true },
  );

  return { device, server, isWhoop, cmdChar };
}

export async function reconnectToDevice(
  device: BluetoothDevice,
  callbacks: DeviceCallbacks,
): Promise<BLEConnection> {
  const gatt = assertGatt(device);
  const server = await gatt.connect();

  try {
    const hrService = await server.getPrimaryService(HR_SERVICE_UUID);
    const hrChar = await hrService.getCharacteristic(HR_MEASUREMENT_UUID);

    hrChar.addEventListener('characteristicvaluechanged', (e: Event) => {
      const target = e.target as BluetoothRemoteGATTCharacteristic;
      if (!target.value) return;
      const { hr, rrIntervals } = parseStandardHR(target.value);
      callbacks.onHeartRate(hr, rrIntervals);
    });
    await hrChar.startNotifications();
  } catch {
    throw new Error('Failed to reconnect to heart rate service');
  }

  device.addEventListener(
    'gattserverdisconnected',
    () => callbacks.onDisconnect(),
    { once: true },
  );

  return { device, server, isWhoop: false };
}

export async function disconnectDevice(connection: BLEConnection) {
  try {
    connection.server.disconnect();
  } catch {
    // already disconnected
  }
}
