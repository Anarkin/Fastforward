import { watchDevicePixels } from '../../lib/page/devicePixels';

export const iconOutlines = {
  file: [
    'M4.5 1.5h5l3 3v9a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z',
    'M9.5 1.5v3h3',
  ],
  folder: [
    'M2.5 4.5a1 1 0 0 1 1-1h3l1 1h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1Z',
  ],
} as const;

const box = 16;

const stroke = 1.2;

const darkScheme = '(prefers-color-scheme: dark)';

type IconPage = Window & typeof globalThis;

function drawn(
  page: IconPage,
  outline: readonly string[],
  color: string,
  share: number,
): string | undefined {
  const canvas = page.document.createElement('canvas');
  const size = Math.round(box * page.devicePixelRatio);
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context === null) {
    return undefined;
  }
  context.scale(size / box, size / box);
  context.lineWidth = stroke;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const path of outline) {
    context.stroke(new page.Path2D(path));
  }
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.globalAlpha = share;
  context.fillRect(0, 0, box, box);
  return canvas.toDataURL();
}

export function showGenericIcons(page: IconPage = window): () => void {
  const draw = () => {
    const probe = page.document.createElement('span');
    probe.style.cssText =
      'position:absolute;visibility:hidden;color:var(--muted-foreground);opacity:var(--color-hidden-file)';
    page.document.body.append(probe);
    const { color, opacity } = page.getComputedStyle(probe);
    probe.remove();
    const hidden = Number(opacity);
    for (const [name, outline] of Object.entries(iconOutlines)) {
      for (const [prefix, share] of [
        ['', 1],
        ['hidden-', Number.isFinite(hidden) ? hidden : 1],
      ] as const) {
        const image = drawn(page, outline, color, share);
        if (image !== undefined) {
          page.document.documentElement.style.setProperty(
            `--${prefix}${name}-icon`,
            `url("${image}")`,
          );
        }
      }
    }
  };
  draw();
  const scheme = page.matchMedia(darkScheme);
  scheme.addEventListener('change', draw);
  const stopWatching = watchDevicePixels(draw, page);
  return () => {
    scheme.removeEventListener('change', draw);
    stopWatching();
  };
}
