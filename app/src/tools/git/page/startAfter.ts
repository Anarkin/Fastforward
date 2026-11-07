export function startAfter(delay: number, start: () => () => void): () => void {
  let stop: (() => void) | undefined;
  const timer = setTimeout(() => {
    stop = start();
  }, delay);
  return () => {
    clearTimeout(timer);
    stop?.();
  };
}
