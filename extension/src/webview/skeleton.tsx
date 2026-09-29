import { useEffect, useState } from 'react';

const skeletonDelay = 150;

export function useSkeleton(loading: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!loading) {
      setShown(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), skeletonDelay);
    return () => clearTimeout(timer);
  }, [loading]);
  return loading && shown;
}

const widths = ['62%', '45%', '78%', '53%', '70%', '38%', '66%', '49%'];

export function SkeletonRows({
  count,
  className = 'row',
  indent = false,
}: {
  count: number;
  className?: string;
  indent?: boolean;
}) {
  return (
    <div className="skeleton" aria-busy="true">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`${className} skeleton-row`}
          style={indent ? { paddingLeft: 8 + (index % 3) * 10 } : undefined}
        >
          <span
            className="bar"
            style={{ width: widths[index % widths.length] }}
          />
        </div>
      ))}
    </div>
  );
}
