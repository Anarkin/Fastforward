import { useEffect, useState } from 'react';

const settleDelay = 200;

export function useSettled<T>(value: T, settles: boolean): T {
  const [settled, setSettled] = useState(value);
  if (!settles && !Object.is(settled, value)) {
    setSettled(value);
  }
  useEffect(() => {
    if (!settles) {
      return undefined;
    }
    const timer = setTimeout(() => setSettled(value), settleDelay);
    return () => clearTimeout(timer);
  }, [value, settles]);
  return settles ? settled : value;
}
