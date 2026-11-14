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
