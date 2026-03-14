import { useDeviceStore } from '@/store/useDeviceStore';
import { Card } from '@/components/ui/card';

const ZONES = [
  { name: 'Rest', range: '< 100', color: '#3a86ff' },
  { name: 'Fat Burn', range: '100–129', color: '#06d6a0' },
  { name: 'Cardio', range: '130–154', color: '#fee440' },
  { name: 'Hard', range: '155–174', color: '#fb5607' },
  { name: 'Peak', range: '175+', color: '#ff006e' },
] as const;

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

export function HRZones() {
  const hr = useDeviceStore((s) => s.hr);
  const zoneTime = useDeviceStore((s) => s.zoneTime);

  const total = zoneTime.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  // Current zone index
  let currentZone = -1;
  if (hr > 0) {
    if (hr < 100) currentZone = 0;
    else if (hr < 130) currentZone = 1;
    else if (hr < 155) currentZone = 2;
    else if (hr < 175) currentZone = 3;
    else currentZone = 4;
  }

  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
        Heart Rate Zones
      </div>

      {/* Zone bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-px">
        {ZONES.map((zone, i) => {
          const pct = total > 0 ? (zoneTime[i] / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={zone.name}
              className="transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: zone.color,
                opacity: currentZone === i ? 1 : 0.6,
              }}
            />
          );
        })}
      </div>

      {/* Zone breakdown */}
      <div className="flex flex-col gap-2">
        {ZONES.map((zone, i) => {
          const pct = total > 0 ? (zoneTime[i] / total) * 100 : 0;
          const isActive = currentZone === i;

          return (
            <div
              key={zone.name}
              className={`flex items-center justify-between text-sm transition-opacity ${
                isActive ? 'opacity-100' : 'opacity-60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: zone.color,
                    boxShadow: isActive ? `0 0 8px ${zone.color}` : 'none',
                  }}
                />
                <span className={`font-medium ${isActive ? '' : 'text-muted-foreground'}`}>
                  {zone.name}
                </span>
                <span className="text-xs text-muted-foreground">{zone.range} bpm</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                  {pct > 0 ? `${Math.round(pct)}%` : '--'}
                </span>
                <span className="text-xs tabular-nums w-14 text-right" style={isActive ? { color: zone.color } : undefined}>
                  {zoneTime[i] > 0 ? formatDuration(zoneTime[i]) : '--'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total time */}
      <div className="flex justify-between items-center mt-3 pt-3 border-t text-xs text-muted-foreground">
        <span>Total active time</span>
        <span className="tabular-nums">{formatDuration(total)}</span>
      </div>
    </Card>
  );
}
