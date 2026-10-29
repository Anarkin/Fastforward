interface ChangingQuery {
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface DisplayWindow {
  readonly devicePixelRatio: number;
  matchMedia(query: string): ChangingQuery;
  readonly document: {
    readonly documentElement: {
      readonly style: { setProperty(name: string, value: string): void };
    };
  };
}

export function devicePixelSize(ratio: number): string {
  return `${1 / ratio}px`;
}

const onGrid = 0.01;

export function snapOffset(position: number, ratio: number): number {
  const device = position * ratio;
  return Math.abs(device - Math.round(device)) < onGrid
    ? 0
    : Math.round(device - onGrid) / ratio - position;
}

export function watchDevicePixels(
  onChange: () => void,
  display: DisplayWindow = window,
): () => void {
  let query: ChangingQuery | undefined;
  const follow = () => {
    display.document.documentElement.style.setProperty(
      '--device-pixel',
      devicePixelSize(display.devicePixelRatio),
    );
    query?.removeEventListener('change', changed);
    query = display.matchMedia(`(resolution: ${display.devicePixelRatio}dppx)`);
    query.addEventListener('change', changed);
  };
  const changed = () => {
    follow();
    onChange();
  };
  follow();
  return () => query?.removeEventListener('change', changed);
}
