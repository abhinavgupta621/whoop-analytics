import { useDeviceStore } from '@/store/useDeviceStore';
import { useThemeStore } from '@/store/useThemeStore';
import { isBLESupported } from '@/services/heartRateService';
import { Button } from '@/components/ui/button';

export function Header() {
  const connected = useDeviceStore((s) => s.connected);
  const connecting = useDeviceStore((s) => s.connecting);
  const connect = useDeviceStore((s) => s.connect);
  const disconnect = useDeviceStore((s) => s.disconnect);
  const bleSupported = isBLESupported();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 bg-background/85 backdrop-blur-xl border-b">
      <div className="flex items-center gap-3">
        <span
          className="text-2xl text-destructive drop-shadow-[0_0_8px_var(--destructive)]"
          style={{ animation: 'pulse-heart 1.2s ease-in-out infinite' }}
        >
          &#9829;
        </span>
        <div className="flex flex-col">
          <h1 className="text-lg font-bold tracking-wide leading-tight">
            Whoop Analytics
          </h1>
          <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
            Real-time biometrics
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </Button>
        {!bleSupported ? (
          <span className="text-destructive text-sm">
            Web Bluetooth not supported — use Chrome or Edge
          </span>
        ) : connected ? (
          <Button
            variant="outline"
            size="sm"
            className="text-xs text-muted-foreground hover:text-destructive hover:border-destructive"
            onClick={disconnect}
          >
            Disconnect
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={connect}
            disabled={connecting}
          >
            {connecting ? 'Connecting\u2026' : 'Connect Device'}
          </Button>
        )}
      </div>
    </header>
  );
}
