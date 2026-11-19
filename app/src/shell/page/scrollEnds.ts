const ways = [
  ['data-scrolled-vertical', 'scrollTop', 'scrollHeight', 'clientHeight'],
  ['data-scrolled-horizontal', 'scrollLeft', 'scrollWidth', 'clientWidth'],
] as const;

export function scrolledTo(
  at: number,
  room: number,
): 'middle' | 'end' | undefined {
  if (at <= 0) {
    return undefined;
  }
  return at >= room - 1 ? 'end' : 'middle';
}

function mark(scroller: Element): void {
  for (const [attribute, at, size, shown] of ways) {
    const place = scrolledTo(scroller[at], scroller[size] - scroller[shown]);
    if (place === undefined) {
      if (scroller.hasAttribute(attribute)) {
        scroller.removeAttribute(attribute);
      }
    } else if (scroller.getAttribute(attribute) !== place) {
      scroller.setAttribute(attribute, place);
    }
  }
}

export function watchScrollEnds(page: Document): void {
  const view = page.defaultView;
  page.addEventListener(
    'scroll',
    ({ target }) => {
      if (view !== null && target instanceof view.Element) {
        mark(target);
      }
    },
    { capture: true, passive: true },
  );
}
