import { useRef, useEffect, useCallback } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { DataPoint } from '@/store/useDeviceStore';
import { useThemeStore } from '@/store/useThemeStore';
import { Card } from '@/components/ui/card';

interface LiveChartProps {
  data: DataPoint[];
  windowSeconds: number;
  label: string;
  color: string;
  unit?: string;
  height?: number;
  showArea?: boolean;
}

function formatRelativeTime(secAgo: number): string {
  const abs = Math.abs(secAgo);
  if (abs <= 2) return 'now';
  if (abs < 60) return `${Math.round(abs)}s`;
  const m = Math.floor(abs / 60);
  const s = Math.round(abs % 60);
  if (s === 0) return `${m}m`;
  return `${m}m${s}s`;
}

function getChartColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    axis: style.getPropertyValue('--chart-axis').trim() || '#555',
    grid: style.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.05)',
    tick: style.getPropertyValue('--chart-tick').trim() || 'rgba(255,255,255,0.08)',
    text: style.getPropertyValue('--chart-text').trim() || '#888',
  };
}

export function LiveChart({
  data,
  windowSeconds,
  label,
  color,
  unit = '',
  height = 180,
  showArea = true,
}: LiveChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  const theme = useThemeStore((s) => s.theme);

  const buildOpts = useCallback(
    (width: number): uPlot.Options => {
      const c = getChartColors();
      return {
        width,
        height,
        cursor: { show: true },
        legend: { show: false },
        padding: [8, 8, 0, 0],
        scales: {
          x: {
            time: false,
            range: () => [-windowSeconds, 0] as uPlot.Range.MinMax,
          },
          y: { auto: true },
        },
        axes: [
          {
            stroke: c.axis,
            grid: { stroke: c.grid, width: 1 },
            ticks: { stroke: c.tick, width: 1 },
            font: `10px 'Geist Variable', system-ui`,
            values: (_u: uPlot, vals: number[]) =>
              vals.map((v) => formatRelativeTime(v)),
            size: 28,
          },
          {
            stroke: c.axis,
            grid: { stroke: c.grid, width: 1 },
            ticks: { stroke: c.tick, width: 1 },
            font: `10px 'Geist Variable', system-ui`,
            size: 44,
          },
        ],
        series: [
          { label: 'Time' },
          {
            label,
            stroke: color,
            width: 2,
            fill: showArea ? `${color}18` : undefined,
            paths: uPlot.paths.spline!(),
            points: { show: false } as uPlot.Series.Points,
            value: (_u: uPlot, v: number) =>
              v == null ? '\u2014' : `${Math.round(v)} ${unit}`,
          },
        ],
      };
    },
    [windowSeconds, label, color, unit, height, showArea, theme],
  );

  // Destroy + rebuild on theme change
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
  }, [theme]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || data.length === 0) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }

    const nowSec = Date.now() / 1000;
    const cutoff = nowSec - windowSeconds;
    const filtered = data.filter((d) => d.time >= cutoff);
    if (filtered.length === 0) return;

    const xData = filtered.map((d) => d.time - nowSec);
    const yData = filtered.map((d) => d.value);
    const uData: uPlot.AlignedData = [xData, yData];

    if (!chartRef.current) {
      el.innerHTML = '';
      const w = Math.max(el.clientWidth, 200);
      chartRef.current = new uPlot(buildOpts(w), uData, el);
    } else {
      chartRef.current.setData(uData);
    }
  }, [data, windowSeconds, buildOpts, theme]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (chartRef.current && el.clientWidth > 0) {
        chartRef.current.setSize({ width: el.clientWidth, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  useEffect(
    () => () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    },
    [],
  );

  if (data.length === 0) return null;

  return (
    <Card className="p-3 overflow-hidden">
      <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">
        {label}
      </div>
      <div ref={wrapRef} />
    </Card>
  );
}
