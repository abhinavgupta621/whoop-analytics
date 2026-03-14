import { create } from 'zustand';
import {
  connectToDevice,
  reconnectToDevice,
  disconnectDevice,
} from '@/services/heartRateService';
import type { BLEConnection, WhoopSensorData } from '@/services/heartRateService';
import {
  computeRMSSD,
  computeSDNN,
  computeStressIndex,
  computeSpO2,
  rawToCelsius,
} from '@/services/whoopProtocol';

const MAX_HISTORY = 3600; // 1 hour at 1Hz
const MAX_RR = 600; // ~10 min of RR intervals
const MAX_SPO2 = 120; // 2 min window for SpO2 calc

export interface DataPoint {
  time: number; // epoch seconds
  value: number;
}

export interface DeviceState {
  // Connection
  deviceName: string | null;
  connected: boolean;
  reconnecting: boolean;
  connecting: boolean;
  isWhoop: boolean;
  battery: number | null;

  // Real-time values
  hr: number;
  hrv: number | null; // RMSSD
  sdnn: number | null;
  stressIndex: number | null;
  spo2: number | null;
  skinTemp: number | null; // Celsius
  skinContact: boolean | null;
  accel: { x: number; y: number; z: number } | null;

  // History
  hrHistory: DataPoint[];
  hrvHistory: DataPoint[];
  stressHistory: DataPoint[];
  spo2History: DataPoint[];
  skinTempHistory: DataPoint[];

  // HR zone time tracking (seconds spent in each zone)
  zoneTime: [number, number, number, number, number]; // Rest, Fat Burn, Cardio, Hard, Peak

  // Time window for charts
  timeWindowSeconds: number;

  // Internals (not rendered directly)
  _rrBuffer: number[];
  _spo2RedBuffer: number[];
  _spo2IrBuffer: number[];
  _connection: BLEConnection | null;
  _device: BluetoothDevice | null;
  _reconnectTimer: ReturnType<typeof setTimeout> | null;
}

interface DeviceActions {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  setTimeWindow: (seconds: number) => void;
  clearHistory: () => void;
}

type DeviceStore = DeviceState & DeviceActions;

let isConnecting = false;

function appendCapped<T>(arr: T[], item: T, max: number): T[] {
  const next = arr.length >= max ? arr.slice(1) : [...arr];
  next.push(item);
  return next;
}

export const useDeviceStore = create<DeviceStore>((set, get) => ({
  // Initial state
  deviceName: null,
  connected: false,
  reconnecting: false,
  connecting: false,
  isWhoop: false,
  battery: null,
  hr: 0,
  hrv: null,
  sdnn: null,
  stressIndex: null,
  spo2: null,
  skinTemp: null,
  skinContact: null,
  accel: null,
  hrHistory: [],
  hrvHistory: [],
  stressHistory: [],
  spo2History: [],
  skinTempHistory: [],
  zoneTime: [0, 0, 0, 0, 0],
  timeWindowSeconds: 300,
  _rrBuffer: [],
  _spo2RedBuffer: [],
  _spo2IrBuffer: [],
  _connection: null,
  _device: null,
  _reconnectTimer: null,

  connect: async () => {
    if (isConnecting || get().connected) return;
    isConnecting = true;
    set({ connecting: true });

    try {
      const onHeartRate = (hr: number, rrIntervals: number[]) => {
        if (hr <= 0) return;
        const now = Date.now() / 1000;
        const state = get();

        // Use real RR intervals if available, otherwise derive from HR
        // Derived RR = 60000/HR (approximate but enables HRV/stress computation)
        const effectiveRR =
          rrIntervals.length > 0
            ? rrIntervals
            : [Math.round(60000 / hr)];

        const newRR = [...state._rrBuffer, ...effectiveRR];
        const rrBuffer = newRR.length > MAX_RR ? newRR.slice(-MAX_RR) : newRR;

        // Compute HRV metrics from recent RR intervals
        const recentRR = rrBuffer.slice(-120); // last ~2 min
        const hrv = computeRMSSD(recentRR);
        const sdnn = computeSDNN(recentRR);
        const stressIndex = computeStressIndex(rrBuffer);

        const hrHistory = appendCapped(state.hrHistory, { time: now, value: hr }, MAX_HISTORY);
        const hrvHistory = hrv != null
          ? appendCapped(state.hrvHistory, { time: now, value: Math.round(hrv) }, MAX_HISTORY)
          : state.hrvHistory;
        const stressHistory = stressIndex != null
          ? appendCapped(state.stressHistory, { time: now, value: Math.round(stressIndex * 10) / 10 }, MAX_HISTORY)
          : state.stressHistory;

        // Track time in each HR zone (~1 sec per reading)
        const zoneTime = [...state.zoneTime] as [number, number, number, number, number];
        if (hr < 100) zoneTime[0]++;
        else if (hr < 130) zoneTime[1]++;
        else if (hr < 155) zoneTime[2]++;
        else if (hr < 175) zoneTime[3]++;
        else zoneTime[4]++;

        set({
          hr,
          hrv: hrv != null ? Math.round(hrv) : state.hrv,
          sdnn: sdnn != null ? Math.round(sdnn) : state.sdnn,
          stressIndex: stressIndex != null ? Math.round(stressIndex * 10) / 10 : state.stressIndex,
          hrHistory,
          hrvHistory,
          stressHistory,
          zoneTime,
          _rrBuffer: rrBuffer,
        });
      };

      const onSensorData = (data: WhoopSensorData) => {
        const now = Date.now() / 1000;
        const state = get();

        const updates: Partial<DeviceState> = {
          accel: { x: data.accelX, y: data.accelY, z: data.accelZ },
        };

        if (data.skinContact != null) {
          updates.skinContact = data.skinContact;
        }

        if (data.skinTempRaw != null) {
          const temp = rawToCelsius(data.skinTempRaw);
          if (temp != null) {
            updates.skinTemp = Math.round(temp * 10) / 10;
            updates.skinTempHistory = appendCapped(
              state.skinTempHistory,
              { time: now, value: updates.skinTemp },
              MAX_HISTORY,
            );
          }
        }

        if (data.spo2Red != null && data.spo2Ir != null) {
          const redBuf = appendCapped(state._spo2RedBuffer, data.spo2Red, MAX_SPO2);
          const irBuf = appendCapped(state._spo2IrBuffer, data.spo2Ir, MAX_SPO2);
          updates._spo2RedBuffer = redBuf;
          updates._spo2IrBuffer = irBuf;

          const spo2 = computeSpO2(redBuf, irBuf);
          if (spo2 != null) {
            updates.spo2 = spo2;
            updates.spo2History = appendCapped(
              state.spo2History,
              { time: now, value: spo2 },
              MAX_HISTORY,
            );
          }
        }

        set(updates as DeviceState);
      };

      const onBattery = (level: number) => {
        set({ battery: level });
      };

      const attemptReconnect = (device: BluetoothDevice, attempt = 0) => {
        if (!get()._device) return;
        const delay = Math.min(1000 * 2 ** attempt, 30000);
        set({ reconnecting: true });

        const timer = setTimeout(async () => {
          if (!get()._device) return;
          try {
            const conn = await reconnectToDevice(device, {
              onHeartRate,
              onSensorData,
              onBattery,
              onDisconnect,
            });
            set({ connected: true, reconnecting: false, _connection: conn });
          } catch {
            attemptReconnect(device, attempt + 1);
          }
        }, delay);

        set({ _reconnectTimer: timer });
      };

      const onDisconnect = () => {
        set({ connected: false, _connection: null });
        const device = get()._device;
        if (device) attemptReconnect(device);
      };

      const connection = await connectToDevice({
        onHeartRate,
        onSensorData,
        onBattery,
        onDisconnect,
      });

      set({
        deviceName: connection.device.name || 'Unknown Device',
        connected: true,
        connecting: false,
        isWhoop: connection.isWhoop,
        _connection: connection,
        _device: connection.device,
      });
    } catch {
      set({ connecting: false });
    } finally {
      isConnecting = false;
    }
  },

  disconnect: async () => {
    const state = get();
    const timer = state._reconnectTimer;
    if (timer) clearTimeout(timer);

    if (state._connection) {
      await disconnectDevice(state._connection);
    }

    set({
      connected: false,
      reconnecting: false,
      connecting: false,
      _connection: null,
      _device: null,
      _reconnectTimer: null,
    });
  },

  setTimeWindow: (seconds) => set({ timeWindowSeconds: seconds }),

  clearHistory: () =>
    set({
      hrHistory: [],
      hrvHistory: [],
      stressHistory: [],
      spo2History: [],
      skinTempHistory: [],
      zoneTime: [0, 0, 0, 0, 0],
      _rrBuffer: [],
      _spo2RedBuffer: [],
      _spo2IrBuffer: [],
      hrv: null,
      sdnn: null,
      stressIndex: null,
      spo2: null,
      skinTemp: null,
    }),
}));

export const TIME_WINDOWS = [
  { label: '1m', seconds: 60 },
  { label: '5m', seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h', seconds: 3600 },
] as const;
