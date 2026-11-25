import { useState } from 'react';
import { formatUsd } from '../lib/roi';

export interface ChartPoint {
  label: string;
  value: number;
  yieldDelta?: number;
}

interface PortfolioChartProps {
  points: ChartPoint[];
  height?: number;
  accentColor?: string;
}

export function PortfolioChart({
  points,
  height = 220,
  accentColor = '#F59E0B'
}: PortfolioChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div
        className="w-full flex items-center justify-center text-xs text-slate-500 border border-white/5 rounded-xl bg-[#0B0E14]"
        style={{ height }}
      >
        Awaiting portfolio data points
      </div>
    );
  }

  const width = 680;
  const padX = 16;
  const padY = 20;
  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = Math.max(1, maxVal - minVal);

  const coords = points.map((pt, i) => {
    const x = padX + (i / (points.length - 1)) * (width - padX * 2);
    const y = height - padY - ((pt.value - minVal) / range) * (height - padY * 2);
    return { x, y, ...pt };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${height - padY} L ${coords[0].x.toFixed(1)} ${height - padY} Z`;

  const activePoint = hoverIdx !== null ? coords[hoverIdx] : coords[coords.length - 1];

  return (
    <div className="w-full space-y-2">
      <div className="flex items-baseline justify-between text-xs text-slate-400">
        <span>{activePoint.label}</span>
        <div className="flex items-center gap-3 font-mono tabular-nums">
          <span className="text-slate-100 font-semibold">{formatUsd(activePoint.value)}</span>
          {typeof activePoint.yieldDelta === 'number' && (
            <span className="text-emerald-400">+{formatUsd(activePoint.yieldDelta)}</span>
          )}
        </div>
      </div>

      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="eraEarnAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.24" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((tick) => {
            const yPos = padY + tick * (height - padY * 2);
            return (
              <line
                key={tick}
                x1={padX}
                y1={yPos}
                x2={width - padX}
                y2={yPos}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="3 4"
              />
            );
          })}

          <path d={areaPath} fill="url(#eraEarnAreaGrad)" />
          <path
            d={linePath}
            fill="none"
            stroke={accentColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {hoverIdx !== null && (
            <line
              x1={activePoint.x}
              y1={padY}
              x2={activePoint.x}
              y2={height - padY}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="2 3"
            />
          )}

          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r="4.5"
            fill="#07090D"
            stroke={accentColor}
            strokeWidth="2.2"
          />

          {coords.map((c, idx) => (
            <rect
              key={c.label}
              x={c.x - (width / coords.length) / 2}
              y={0}
              width={width / coords.length}
              height={height}
              fill="transparent"
              className="cursor-crosshair"
              onMouseEnter={() => setHoverIdx(idx)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
