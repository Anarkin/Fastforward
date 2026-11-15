import {
  watchDevicePixels,
  type DisplayWindow,
} from '../../lib/page/devicePixels';

export interface MeasuringWindow extends DisplayWindow {
  readonly document: Document;
  readonly ResizeObserver: typeof ResizeObserver;
}

const fonts = [
  {
    variable: '--text-height',
    family: 'var(--font-family)',
    size: 'var(--font-size)',
  },
  {
    variable: '--monospace-text-height',
    family: 'var(--monospace-font-family)',
    size: 'var(--monospace-font-size)',
  },
] as const;

export function installTextHeights(view: MeasuringWindow = window): () => void {
  const { document } = view;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre',
  });
  const samples = fonts.map(({ variable, family, size }) => {
    const line = document.createElement('div');
    Object.assign(line.style, {
      width: 'max-content',
      fontFamily: family,
      fontSize: size,
    });
    const text = document.createElement('span');
    text.textContent = 'x';
    line.append(text);
    probe.append(line);
    return { variable, line, text };
  });
  document.body.append(probe);
  const measure = () => {
    for (const { variable, text } of samples) {
      document.documentElement.style.setProperty(
        variable,
        `${text.getBoundingClientRect().height}px`,
      );
    }
  };
  const resized = new view.ResizeObserver(measure);
  for (const { line } of samples) {
    resized.observe(line);
  }
  const stopWatching = watchDevicePixels(measure, view);
  measure();
  return () => {
    resized.disconnect();
    stopWatching();
    probe.remove();
  };
}
