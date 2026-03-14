import { useDeviceStore } from '@/store/useDeviceStore';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ConnectionStatus() {
  const deviceName = useDeviceStore((s) => s.deviceName);
  const connected = useDeviceStore((s) => s.connected);
  const reconnecting = useDeviceStore((s) => s.reconnecting);
  const isWhoop = useDeviceStore((s) => s.isWhoop);
  const battery = useDeviceStore((s) => s.battery);
  const skinContact = useDeviceStore((s) => s.skinContact);

  if (!deviceName) return null;

  return (
    <Card className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={
            connected
              ? { background: '#06d6a0', boxShadow: '0 0 8px #06d6a0' }
              : reconnecting
                ? {
                    background: '#fee440',
                    boxShadow: '0 0 8px #fee440',
                    animation: 'pulse-dot 1.2s ease-in-out infinite',
                  }
                : { background: 'oklch(0.55 0 0)' }
          }
        />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{deviceName}</span>
          <span className="text-xs text-muted-foreground">
            {connected
              ? 'Connected'
              : reconnecting
                ? 'Reconnecting\u2026'
                : 'Disconnected'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isWhoop && (
          <Badge variant="outline" className="text-xs">
            Whoop
          </Badge>
        )}
        {skinContact != null && (
          <Badge variant={skinContact ? 'default' : 'secondary'} className="text-xs">
            {skinContact ? 'On Wrist' : 'Off Wrist'}
          </Badge>
        )}
        {battery != null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <svg
              width="16"
              height="10"
              viewBox="0 0 16 10"
              fill="none"
              className="opacity-60"
            >
              <rect
                x="0.5"
                y="0.5"
                width="13"
                height="9"
                rx="1.5"
                stroke="currentColor"
              />
              <rect x="14" y="3" width="2" height="4" rx="0.5" fill="currentColor" />
              <rect
                x="2"
                y="2"
                width={Math.max(1, (battery / 100) * 10)}
                height="6"
                rx="0.5"
                fill={battery > 20 ? '#06d6a0' : '#ff006e'}
              />
            </svg>
            {battery}%
          </div>
        )}
      </div>
    </Card>
  );
}
