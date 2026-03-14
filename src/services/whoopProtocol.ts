/**
 * Whoop 4.0 BLE Protocol Implementation
 * Based on reverse engineering from openwhoop + bWanShiTong research
 */

// ─── Custom Whoop Service UUIDs ───
export const WHOOP_SERVICE_UUID = '61080001-8d6d-82b8-614a-1c8cb0f8dcc6';
export const CMD_TO_STRAP_UUID = '61080002-8d6d-82b8-614a-1c8cb0f8dcc6';
export const CMD_FROM_STRAP_UUID = '61080003-8d6d-82b8-614a-1c8cb0f8dcc6';
export const EVENTS_FROM_STRAP_UUID = '61080004-8d6d-82b8-614a-1c8cb0f8dcc6';
export const DATA_FROM_STRAP_UUID = '61080005-8d6d-82b8-614a-1c8cb0f8dcc6';

// Standard BLE Heart Rate
export const HR_SERVICE_UUID = 0x180d;
export const HR_MEASUREMENT_UUID = 0x2a37;

// ─── CRC32 ───
// Custom Whoop CRC32: poly=0x4C11DB7, reflect, init=0, finalXor=0xF43F44AC
const CRC_TABLE = new Uint32Array(256);
(function buildTable() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    CRC_TABLE[i] = crc;
  }
})();

export function whoopCrc32(data: Uint8Array): number {
  let crc = 0x00000000; // init=0
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xf43f44ac) >>> 0; // finalXor
}

// ─── Command Builder ───
export const WhoopCommand = {
  SetClock: 0x0a,
  GetClock: 0x0b,
  ToggleRealtimeHr: 0x03,
  ToggleGenericHrProfile: 0x0e,
  StartSync: 0x16,
  AckSyncBatch: 0x17,
  GetBatteryLevel: 0x1a,
  GetHelloHarvard: 0x23,
  GetAlarm: 0x43,
  EnterHighFreqSync: 0x60,
  GetExtendedBatteryInfo: 0x62,
} as const;
type WhoopCommand = (typeof WhoopCommand)[keyof typeof WhoopCommand];

let packetSeq = 0;

export function buildCommand(cmd: WhoopCommand, payload: number[] = []): Uint8Array {
  // Pad payload to 9 bytes
  const padded = new Uint8Array(9);
  for (let i = 0; i < Math.min(payload.length, 9); i++) {
    padded[i] = payload[i];
  }

  const buf = new Uint8Array(20);
  buf[0] = 0xaa; // SOF
  buf[1] = 0x10; // length indicator
  buf[2] = 0x00;
  buf[3] = 0x57; // device byte
  buf[4] = 0x23; // command type
  buf[5] = (packetSeq++) & 0xff;
  buf[6] = cmd;
  buf.set(padded, 7);

  const crc = whoopCrc32(buf.subarray(0, 16));
  buf[16] = crc & 0xff;
  buf[17] = (crc >>> 8) & 0xff;
  buf[18] = (crc >>> 16) & 0xff;
  buf[19] = (crc >>> 24) & 0xff;

  return buf;
}

// ─── Packet Types ───
export const PacketType = {
  Command: 0x23,
  CommandResponse: 0x24,
  RealtimeData: 0x28,
  HistoricalData: 0x2f,
  Event: 0x30,
  Metadata: 0x31,
} as const;

// ─── Event Types ───
export const EventType = {
  BatteryLevel: 3,
  ChargingOn: 7,
  ChargingOff: 8,
  WristOn: 9,
  WristOff: 10,
  DoubleTap: 14,
  TemperatureLevel: 17,
} as const;
type EventType = (typeof EventType)[keyof typeof EventType];

// ─── Data Parsing ───

export interface WhoopHRReading {
  timestamp: number; // unix seconds
  hr: number; // BPM
  rrIntervals: number[]; // ms
}

export interface WhoopSensorData {
  timestamp: number;
  hr: number;
  rrIntervals: number[];
  accelX: number;
  accelY: number;
  accelZ: number;
  skinTempRaw?: number;
  spo2Red?: number;
  spo2Ir?: number;
  signalQuality?: number;
  skinContact?: boolean;
}

export interface WhoopEvent {
  type: EventType;
  value?: number;
  timestamp: number;
}

/**
 * Parse a real-time HR packet from DATA_FROM_STRAP
 * Format: [header 6B] [unix 4B LE] [sub 2B] [HR 1B] [RR count 1B] [RR data] [CRC 4B]
 */
export function parseRealtimeHR(data: DataView): WhoopHRReading | null {
  if (data.byteLength < 18) return null;

  const timestamp = data.getUint32(6, true);
  const hr = data.getUint8(10);
  const rrCount = data.getUint8(11);

  const rrIntervals: number[] = [];
  for (let i = 0; i < rrCount && 12 + i * 2 + 1 < data.byteLength - 4; i++) {
    const rr = data.getUint16(12 + i * 2, true);
    if (rr > 0) rrIntervals.push(rr);
  }

  return { timestamp, hr, rrIntervals };
}

/**
 * Parse historical/sync data packet (kind 0x05)
 * Contains HR + accelerometer + potentially more sensor data
 */
export function parseSyncData(data: DataView): WhoopSensorData | null {
  if (data.byteLength < 45) return null;

  const kind = data.getUint8(6);
  if (kind !== 0x05 && kind !== 0x07) return null;

  const subSecond = data.getUint32(7, true);
  const timestamp = data.getUint32(11, true) + subSecond / 1e9;
  const hr = data.getUint8(21);
  const rrCount = data.getUint8(22);

  const rrIntervals: number[] = [];
  for (let i = 0; i < rrCount && 23 + i * 2 + 1 < data.byteLength - 4; i++) {
    const rr = data.getUint16(23 + i * 2, true);
    if (rr > 0) rrIntervals.push(rr);
  }

  let accelX = 0, accelY = 0, accelZ = 0;
  if (data.byteLength >= 52) {
    accelX = data.getFloat32(40, true);
    accelY = data.getFloat32(44, true);
    accelZ = data.getFloat32(48, true);
  }

  const result: WhoopSensorData = {
    timestamp,
    hr,
    rrIntervals,
    accelX,
    accelY,
    accelZ,
  };

  // Extended sensor data (V12+ packets, 96+ bytes)
  if (data.byteLength >= 70) {
    result.skinContact = data.getUint8(55) !== 0;
    result.spo2Red = data.getUint16(68, true);
    result.spo2Ir = data.getUint16(70, true);
  }

  if (data.byteLength >= 60) {
    result.skinTempRaw = data.getUint16(58, true);
  }

  return result;
}

/**
 * Parse sync batch ACK token (kind 0x02)
 */
export function parseSyncAck(data: DataView): Uint8Array | null {
  if (data.byteLength < 25) return null;
  const kind = data.getUint8(6);
  if (kind !== 0x02) return null;

  return new Uint8Array(data.buffer, data.byteOffset + 17, 8);
}

/**
 * Parse event from EVENTS_FROM_STRAP
 */
export function parseEvent(data: DataView): WhoopEvent | null {
  if (data.byteLength < 8) return null;
  const type = data.getUint8(6) as EventType;
  let value: number | undefined;

  if (type === EventType.BatteryLevel && data.byteLength >= 8) {
    value = data.getUint8(7);
  }

  return { type, value, timestamp: Date.now() / 1000 };
}

/**
 * Parse standard BLE Heart Rate Measurement characteristic
 */
export function parseStandardHR(value: DataView): { hr: number; rrIntervals: number[] } {
  const flags = value.getUint8(0);
  const is16Bit = flags & 0x01;
  const hasRR = flags & 0x10;

  let offset = 1;
  const hr = is16Bit ? value.getUint16(offset, true) : value.getUint8(offset);
  offset += is16Bit ? 2 : 1;

  // Skip energy expended if present
  if (flags & 0x08) offset += 2;

  const rrIntervals: number[] = [];
  if (hasRR) {
    while (offset + 1 < value.byteLength) {
      // RR intervals are in 1/1024 seconds, convert to ms
      const rr = value.getUint16(offset, true);
      rrIntervals.push(Math.round((rr / 1024) * 1000));
      offset += 2;
    }
  }

  return { hr, rrIntervals };
}

// ─── Derived Metrics ───

/**
 * Compute RMSSD (root mean square of successive differences) from RR intervals
 * Standard short-term HRV metric
 */
export function computeRMSSD(rrIntervals: number[]): number | null {
  if (rrIntervals.length < 2) return null;

  let sumSquaredDiffs = 0;
  let count = 0;
  for (let i = 1; i < rrIntervals.length; i++) {
    const diff = rrIntervals[i] - rrIntervals[i - 1];
    sumSquaredDiffs += diff * diff;
    count++;
  }

  return Math.sqrt(sumSquaredDiffs / count);
}

/**
 * Compute SDNN (standard deviation of NN intervals)
 */
export function computeSDNN(rrIntervals: number[]): number | null {
  if (rrIntervals.length < 2) return null;

  const mean = rrIntervals.reduce((a, b) => a + b, 0) / rrIntervals.length;
  const variance =
    rrIntervals.reduce((sum, rr) => sum + (rr - mean) ** 2, 0) /
    (rrIntervals.length - 1);
  return Math.sqrt(variance);
}

/**
 * Baevsky Stress Index from RR intervals
 * Returns 0-10 scale (0 = relaxed, 10 = max stress)
 */
export function computeStressIndex(rrIntervals: number[]): number | null {
  if (rrIntervals.length < 30) return null;

  const binSize = 50; // ms
  const bins = new Map<number, number>();
  let maxBin = 0;
  let maxBinCount = 0;

  for (const rr of rrIntervals) {
    const bin = Math.floor(rr / binSize) * binSize;
    const count = (bins.get(bin) || 0) + 1;
    bins.set(bin, count);
    if (count > maxBinCount) {
      maxBinCount = count;
      maxBin = bin;
    }
  }

  const amo = (maxBinCount / rrIntervals.length) * 100; // mode amplitude %
  const mo = (maxBin + binSize / 2) / 1000; // mode in seconds
  const sorted = [...rrIntervals].sort((a, b) => a - b);
  const vr = (sorted[sorted.length - 1] - sorted[0]) / 1000; // range in seconds

  if (vr === 0 || mo === 0) return 10;

  const si = amo / (2 * vr * mo);
  return Math.min(si / 100, 10);
}

/**
 * Compute SpO2 from red and IR readings
 * Uses AC/DC ratio method
 */
export function computeSpO2(
  redReadings: number[],
  irReadings: number[],
): number | null {
  if (redReadings.length < 30 || irReadings.length < 30) return null;

  const stats = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = Math.sqrt(
      arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length,
    );
    return { mean, std };
  };

  const red = stats(redReadings);
  const ir = stats(irReadings);

  if (red.mean === 0 || ir.mean === 0 || ir.std === 0) return null;

  const r = (red.std / red.mean) / (ir.std / ir.mean);
  const spo2 = 110 - 25 * r;
  return Math.max(70, Math.min(100, Math.round(spo2)));
}

/**
 * Convert raw skin temp to Celsius
 */
export function rawToCelsius(raw: number): number | null {
  if (raw < 100) return null; // off-wrist
  return raw * 0.04;
}
