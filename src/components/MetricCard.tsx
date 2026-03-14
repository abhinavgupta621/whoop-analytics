import { Card } from '@/components/ui/card';

interface MetricCardProps {
  label: string;
  value: string | number | null;
  unit?: string;
  subtitle?: string;
  color?: string;
  size?: 'sm' | 'lg';
  children?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  unit,
  subtitle,
  color,
  size = 'sm',
  children,
}: MetricCardProps) {
  const hasValue = value != null;
  const displayValue = hasValue ? value : '--';
  const isLarge = size === 'lg';

  return (
    <Card className="p-4 flex flex-col gap-1 hover:shadow-md transition-shadow">
      <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-bold tabular-nums leading-none ${
            isLarge ? 'text-5xl' : 'text-3xl'
          } ${!hasValue ? 'opacity-20' : ''}`}
          style={
            hasValue && color
              ? { color, filter: `drop-shadow(0 0 8px ${color})` }
              : undefined
          }
        >
          {displayValue}
        </span>
        {unit && (
          <span className={`text-xs text-muted-foreground uppercase tracking-wider ${!hasValue ? 'opacity-30' : ''}`}>
            {unit}
          </span>
        )}
      </div>
      {subtitle ? (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      ) : !hasValue ? (
        <span className="text-[10px] text-muted-foreground opacity-40">
          Waiting for data...
        </span>
      ) : null}
      {children}
    </Card>
  );
}
