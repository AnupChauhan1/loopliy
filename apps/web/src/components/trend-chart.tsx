'use client';

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { motion } from 'motion/react';
import type { TrendPoint } from '@/lib/hooks/dashboard';

const SERIES = [
  { key: 'created', label: 'Created', color: '#111827', light: '#6B7280' },
  { key: 'completed', label: 'Completed', color: '#00A878', light: '#57CDA7' },
] as const;

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="rounded-xl border border-white/10 bg-gray-950/90 px-3.5 py-2.5 text-white shadow-2xl backdrop-blur-xl"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{fmtDay(label)}</p>
      {SERIES.map((s) => {
        const v = payload.find((p: any) => p.dataKey === s.key)?.value ?? 0;
        return (
          <div key={s.key} className="mt-1 flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
            <span className="text-gray-300">{s.label}</span>
            <span className="ml-auto pl-4 font-bold tabular">{v}</span>
          </div>
        );
      })}
    </motion.div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.created, d.completed]));
  return (
    <div className="min-w-0 w-full">
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-xs font-semibold text-gray-600">
            <span className="h-2.5 w-6 rounded-full" style={{ background: `linear-gradient(90deg, ${s.light}, ${s.color})`, boxShadow: `0 0 10px ${s.color}66` }} />
            {s.label}
            <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-bold text-gray-500 tabular">
              {data.reduce((sum, d) => sum + d[s.key], 0)}
            </span>
          </span>
        ))}
      </div>
      <div className="h-[240px] min-w-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
            <defs>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`tr-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
              {SERIES.map((s) => (
                <filter key={s.key} id={`tr-glow-${s.key}`} x="-10%" y="-50%" width="120%" height="200%">
                  <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor={s.color} floodOpacity="0.45" />
                </filter>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="rgba(107,114,128,0.16)" strokeDasharray="4 6" />
            <XAxis dataKey="date" tickFormatter={fmtDay} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} domain={[0, Math.ceil(max * 1.2)]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} width={36} />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#00A878', strokeOpacity: 0.35, strokeDasharray: '4 4' }} />
            {SERIES.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2.5}
                fill={`url(#tr-${s.key})`}
                style={{ filter: `url(#tr-glow-${s.key})` }}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff', fill: s.color }}
                animationDuration={650}
                animationBegin={80 + i * 100}
                animationEasing="ease-out"
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
