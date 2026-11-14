const widths = ['62%', '45%', '78%', '53%', '70%', '38%', '66%', '49%'];

export function SkeletonRows({
  count,
  className = 'row',
  offset = 0,
}: {
  count: number;
  className?: string;
  offset?: number;
}) {
  return (
    <div className="skeleton" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`${className} skeleton-row`}>
          <span
            className="bar"
            style={{ width: widths[(index + offset) % widths.length] }}
          />
        </div>
      ))}
    </div>
  );
}
