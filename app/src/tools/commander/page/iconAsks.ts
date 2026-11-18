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
  if (waiting.size === 0) {
    return;
  }
  const now = performance.now();
  const quiet = sinceScrolled();
  let soonest = Infinity;
  for (const [ask, since] of waiting) {
    const left = Math.max(iconWait - quiet, iconWait - (now - since));
    if (left <= 0) {
      waiting.delete(ask);
      ask();
    } else {
      soonest = Math.min(soonest, left);
    }
  }
  if (waiting.size > 0) {
    checking = setTimeout(check, Math.max(1, Math.ceil(soonest)));
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
