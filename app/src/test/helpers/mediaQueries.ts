import type { JSDOM } from 'jsdom';

export function withStillMediaQueries(window: JSDOM['window']): void {
  window.matchMedia = () =>
    Object.assign(new window.EventTarget(), {
      matches: false,
      media: '',
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    });
}
