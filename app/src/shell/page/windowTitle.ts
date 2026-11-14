import { useEffect } from 'react';
import { strings } from '../../lib/shared/strings';

export function windowTitle(root: string | undefined, app: string): string {
  return root === undefined ? app : strings.app.windowTitle(root, app);
}

interface Pixel {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, width: number, height: number): void;
  getImageData(
    x: number,
    y: number,
    width: number,
    height: number,
  ): { readonly data: ArrayLike<number> };
}

export function windowButtonColor(
  color: string,
  pixel: Pixel | null = new OffscreenCanvas(1, 1).getContext('2d'),
): string {
  if (!pixel) {
    return color;
  }
  pixel.fillStyle = color;
  pixel.fillRect(0, 0, 1, 1);
  const { data } = pixel.getImageData(0, 0, 1, 1);
  return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${data[3] / 255})`;
}

export function useWindowTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
