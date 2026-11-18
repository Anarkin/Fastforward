export const iconWait = 100;

let watched: Document | undefined;
let scrolledAt = -Infinity;

export function sinceScrolled(): number {
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
