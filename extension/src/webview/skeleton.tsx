import { useEffect, useState } from 'react';

// Most answers come within this, and a placeholder that flashes up for a
// moment is worse than none
const skeletonDelay = 150;

// Whether something has been loading long enough to show placeholders for
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

// Widths that look like text of different lengths, the same every time
const widths = ['62%', '45%', '78%', '53%', '70%', '38%', '66%', '49%'];

// Grey bars in the shape of the rows that are loading, like the commit list's
// placeholders
export function SkeletonRows({
  count,
  className = 'row',
  indent = false,
}: {
  count: number;
  className?: string;
  // Stepped in and out, like a tree
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

// Bubble-shaped bars, for the refs that are loading
export function SkeletonBubbles({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="skeleton-bubble"
          style={{ width: 44 + (index % 3) * 18 }}
        />
      ))}
    </>
  );
}
