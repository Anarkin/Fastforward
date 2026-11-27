import { scratchRange } from '../../../lib/page/scratchRange';
import { metricsIn } from '../../../lib/page/textWidths';

export function probed(host: Element, html: string): HTMLDivElement {
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.innerHTML = html;
  host.append(probe);
  return probe;
}

export const shapedSample =
  'The quick brown fox jumps over the lazy dog, 0123456789 times';

export function textScaleOf(sample: HTMLElement, scale: number): number {
  if (scale === 1) {
    return 1;
  }
  const style = getComputedStyle(sample);
  const size = parseFloat(style.fontSize);
  const widthAt = (pixels: number) =>
    metricsIn(
      `${style.fontWeight} ${pixels}px ${style.fontFamily}`,
      shapedSample,
    )?.width ?? 0;
  const range = scratchRange();
  range.selectNodeContents(sample);
  const laid = range.getBoundingClientRect().width;
  const asDevice = widthAt(size * scale) / scale;
  const asCss = widthAt(size);
  return Math.abs(asCss - laid) < Math.abs(asDevice - laid) ? scale : 1;
}

let swatch: OffscreenCanvasRenderingContext2D | null | undefined;

export function fadedOf(color: string, opacity: number): string {
  swatch ??= new OffscreenCanvas(1, 1).getContext('2d', {
    willReadFrequently: true,
  });
  if (swatch === null) {
    return color;
  }
  swatch.clearRect(0, 0, 1, 1);
  swatch.fillStyle = color;
  swatch.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0, alpha = 255] = swatch.getImageData(
    0,
    0,
    1,
    1,
  ).data;
  const share = (alpha / 255) * opacity;
  return `rgba(${red}, ${green}, ${blue}, ${share})`;
}
