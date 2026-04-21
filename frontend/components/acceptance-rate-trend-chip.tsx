type AcceptanceRateTrendPoint = {
  acceptance_rate_percent: number | null;
};

type AcceptanceRateTrendChipProps = {
  acceptanceRatePercent?: number | null;
  reviewCount?: number | null;
  points?: AcceptanceRateTrendPoint[];
  tone?: 'light' | 'dark';
  compact?: boolean;
  className?: string;
  emptyLabel?: string;
};

function buildSparklineHeights(points: AcceptanceRateTrendPoint[]): number[] {
  const values = points
    .map((point) => point.acceptance_rate_percent)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (values.length === 0) {
    return [];
  }

  return values.slice(-8).map((value) => Math.max(18, Math.min(100, value)))
}

export default function AcceptanceRateTrendChip({
  acceptanceRatePercent,
  reviewCount,
  points = [],
  tone = 'dark',
  compact = false,
  className,
  emptyLabel = 'Acceptance n/a',
}: AcceptanceRateTrendChipProps) {
  const sparklineHeights = buildSparklineHeights(points);
  const containerClassName = [
    'inline-flex items-center gap-2 rounded-full border font-medium',
    compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]',
    tone === 'dark'
      ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-100'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const sparklineBarClassName = tone === 'dark' ? 'bg-emerald-300' : 'bg-emerald-500';
  const label = acceptanceRatePercent === null || acceptanceRatePercent === undefined
    ? emptyLabel
    : `${acceptanceRatePercent.toFixed(1)}% accept`;
  const reviewLabel = reviewCount !== null && reviewCount !== undefined
    ? `${reviewCount} review${reviewCount === 1 ? '' : 's'}`
    : null;

  return (
    <div className={containerClassName}>
      {sparklineHeights.length > 0 ? (
        <div className="flex h-4 items-end gap-0.5" aria-hidden="true">
          {sparklineHeights.map((height, index) => (
            <span
              key={`${index}-${height}`}
              className={`w-1.5 rounded-full ${sparklineBarClassName}`}
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      ) : null}
      <span>{label}</span>
      {reviewLabel ? <span className={tone === 'dark' ? 'text-emerald-100/70' : 'text-emerald-700/70'}>{reviewLabel}</span> : null}
    </div>
  );
}