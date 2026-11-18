export const iconWait = 100;

let watched: Document | undefined;
let scrolledAt = -Infinity;

function sinceScrolled(): number {
  if (watched !== document) {
    watched = document;
    scrolledAt = -Infinity;
    document.addEventListener(
      'scroll',
      () => {
        scrolledAt = performance.now();
      },
      { capture: true, passive: true },
    );
  }
  return performance.now() - scrolledAt;
}

const waiting = new Map<() => void, number>();

let checking: ReturnType<typeof setTimeout> | undefined;

function check(): void {
  checking = undefined;
  const now = performance.now();
  const rested = sinceScrolled() >= iconWait;
  for (const [ask, since] of waiting) {
    if (rested && now - since >= iconWait) {
      waiting.delete(ask);
      ask();
    }
  }
  if (waiting.size > 0) {
    checking = setTimeout(check, iconWait / 2);
  }
}

export function whenStayed(ask: () => void): () => void {
  sinceScrolled();
  waiting.set(ask, performance.now());
  checking ??= setTimeout(check, iconWait);
  return () => {
    waiting.delete(ask);
  };
}
