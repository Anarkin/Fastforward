import { useEffect, useState } from 'react';
import { readingShownAfter } from '../shared/readingDelay';

export function useShownAfter(going: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!going) {
      setShown(false);
      return undefined;
    }
    const timer = setTimeout(() => setShown(true), readingShownAfter);
    return () => clearTimeout(timer);
  }, [going]);
  return going && shown;
}
