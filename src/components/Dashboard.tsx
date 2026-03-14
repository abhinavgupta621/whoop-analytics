import { useDeviceStore, TIME_WINDOWS } from '@/store/useDeviceStore';
import { MetricCard } from './MetricCard';
import { LiveChart } from './LiveChart';
import { HRZones } from './HRZones';
import { ConnectionStatus } from './ConnectionStatus';
import { Button } from '@/components/ui/button';

function stressLabel(index: number | null): string {
  if (index == null) return '';
  if (index < 2) return 'Relaxed';
  if (index < 4) return 'Low';
  if (index < 6) return 'Moderate';
  if (index < 8) return 'High';
  return 'Very High';
}

function stressColor(index: number | null): string {
  if (index == null) return '#6b6b80';
  if (index < 2) return '#06d6a0';
  if (index < 4) return '#3a86ff';
  if (index < 6) return '#fee440';
  if (index < 8) return '#fb5607';
  return '#ff006e';
}

function hrZone(hr: number): { zone: string; color: string } {
  if (hr === 0) return { zone: '', color: '#6b6b80' };
  if (hr < 100) return { zone: 'Rest', color: '#3a86ff' };
  if (hr < 130) return { zone: 'Fat Burn', color: '#06d6a0' };
  if (hr < 155) return { zone: 'Cardio', color: '#fee440' };
  if (hr < 175) return { zone: 'Hard', color: '#fb5607' };
  return { zone: 'Peak', color: '#ff006e' };
}

export function Dashboard() {
  const hr = useDeviceStore((s) => s.hr);
  const hrv = useDeviceStore((s) => s.hrv);
  const sdnn = useDeviceStore((s) => s.sdnn);
  const stressIndex = useDeviceStore((s) => s.stressIndex);
  const spo2 = useDeviceStore((s) => s.spo2);
  const skinTemp = useDeviceStore((s) => s.skinTemp);
  const accel = useDeviceStore((s) => s.accel);
  const connected = useDeviceStore((s) => s.connected);
  const deviceName = useDeviceStore((s) => s.deviceName);

  const hrHistory = useDeviceStore((s) => s.hrHistory);
  const hrvHistory = useDeviceStore((s) => s.hrvHistory);
  const stressHistory = useDeviceStore((s) => s.stressHistory);
  const spo2History = useDeviceStore((s) => s.spo2History);
  const skinTempHistory = useDeviceStore((s) => s.skinTempHistory);
  const timeWindowSeconds = useDeviceStore((s) => s.timeWindowSeconds);
  const setTimeWindow = useDeviceStore((s) => s.setTimeWindow);
  const clearHistory = useDeviceStore((s) => s.clearHistory);

  const connect = useDeviceStore((s) => s.connect);
  const connecting = useDeviceStore((s) => s.connecting);

  const zone = hrZone(hr);
  const hasData = hrHistory.length > 0;

  if (!connected && !deviceName) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <span
            className="text-6xl text-destructive drop-shadow-[0_0_16px_var(--destructive)]"
            style={{ animation: 'pulse-heart 1.2s ease-in-out infinite' }}
          >
            &#9829;
          </span>
          <h2 className="text-2xl font-bold mt-4">Whoop Analytics</h2>
          <p className="text-muted-foreground text-sm max-w-md">
            Connect your Whoop, Garmin, Polar, or any BLE heart rate monitor to
            see real-time biometric data, HRV analysis, and stress metrics.
          </p>
        </div>
        <Button size="lg" onClick={connect} disabled={connecting}>
          {connecting ? 'Connecting\u2026' : 'Connect Device'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Requires Chrome or Edge with Web Bluetooth
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-6xl mx-auto">
      {/* Connection info */}
      <ConnectionStatus />

      {/* Primary metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Heart Rate"
          value={hr > 0 ? hr : null}
          unit="bpm"
          subtitle={zone.zone}
          color={zone.color}
          size="lg"
        />
        <MetricCard
          label="HRV (RMSSD)"
          value={hrv}
          unit="ms"
          subtitle={sdnn != null ? `SDNN: ${sdnn} ms` : undefined}
          color="#8338ec"
        />
        <MetricCard
          label="Stress"
          value={stressIndex}
          unit="/10"
          subtitle={stressLabel(stressIndex)}
          color={stressColor(stressIndex)}
        />
        <MetricCard
          label="SpO2"
          value={spo2}
          unit="%"
          subtitle={spo2 != null && spo2 >= 95 ? 'Normal' : spo2 != null ? 'Low' : undefined}
          color={spo2 != null && spo2 >= 95 ? '#06d6a0' : '#fb5607'}
        />
        <MetricCard
          label="Skin Temp"
          value={skinTemp}
          unit="°C"
          subtitle={
            skinTemp != null
              ? skinTemp >= 35
                ? 'Normal'
                : skinTemp >= 33
                  ? 'Cool'
                  : 'Cold'
              : undefined
          }
          color="#00f5d4"
        />
      </div>

      {/* Heart Rate Zones */}
      <HRZones />

      {/* Accelerometer (Whoop only) */}
      {accel && (
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="Accel X"
            value={accel.x.toFixed(2)}
            unit="g"
            color="#3a86ff"
          />
          <MetricCard
            label="Accel Y"
            value={accel.y.toFixed(2)}
            unit="g"
            color="#06d6a0"
          />
          <MetricCard
            label="Accel Z"
            value={accel.z.toFixed(2)}
            unit="g"
            color="#fee440"
          />
        </div>
      )}

      {/* Time controls */}
      {hasData && (
        <div className="flex justify-between items-center">
          <div className="flex gap-0.5 bg-secondary rounded-lg p-0.5">
            {TIME_WINDOWS.map((w) => (
              <Button
                key={w.label}
                variant={timeWindowSeconds === w.seconds ? 'default' : 'ghost'}
                size="sm"
                className="text-xs px-3 h-7"
                onClick={() => setTimeWindow(w.seconds)}
              >
                {w.label}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-muted-foreground hover:text-destructive hover:border-destructive"
            onClick={clearHistory}
          >
            Reset
          </Button>
        </div>
      )}

      {/* Charts */}
      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <LiveChart
            data={hrHistory}
            windowSeconds={timeWindowSeconds}
            label="Heart Rate"
            color="#ff006e"
            unit="BPM"
            height={200}
          />
          {hrvHistory.length > 0 && (
            <LiveChart
              data={hrvHistory}
              windowSeconds={timeWindowSeconds}
              label="HRV (RMSSD)"
              color="#8338ec"
              unit="ms"
              height={200}
            />
          )}
          {stressHistory.length > 0 && (
            <LiveChart
              data={stressHistory}
              windowSeconds={timeWindowSeconds}
              label="Stress Index"
              color="#fb5607"
              unit=""
              height={200}
            />
          )}
          {spo2History.length > 0 && (
            <LiveChart
              data={spo2History}
              windowSeconds={timeWindowSeconds}
              label="SpO2"
              color="#06d6a0"
              unit="%"
              height={200}
            />
          )}
          {skinTempHistory.length > 0 && (
            <LiveChart
              data={skinTempHistory}
              windowSeconds={timeWindowSeconds}
              label="Skin Temperature"
              color="#00f5d4"
              unit="°C"
              height={200}
            />
          )}
        </div>
      )}
    </div>
  );
}
