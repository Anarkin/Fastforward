const flushEvery = 100;

export interface Throttled {
  flushing: NodeJS.Timeout | undefined;
  flushed: number;
}

export function flushThrottled(throttled: Throttled, flush: () => void): void {
  throttled.flushing ??= setTimeout(
    () => {
      throttled.flushing = undefined;
      flush();
    },
    Math.max(0, throttled.flushed + flushEvery - Date.now()),
  );
}
