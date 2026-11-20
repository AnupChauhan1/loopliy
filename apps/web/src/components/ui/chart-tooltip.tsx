'use client';

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200/80 bg-white/95 px-3.5 py-2.5 shadow-xl shadow-gray-900/10 backdrop-blur-sm animate-popover">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 capitalize">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: payload[0]?.payload?.fill ?? payload[0]?.color ?? '#00A878' }} />
        <p className="text-sm font-bold text-gray-900">{payload[0]?.value}</p>
        <p className="text-xs text-gray-500">{payload[0]?.name === 'value' ? 'tasks' : payload[0]?.name}</p>
      </div>
    </div>
  );
}
