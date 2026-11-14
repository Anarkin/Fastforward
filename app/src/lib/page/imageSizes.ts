import { useSyncExternalStore } from 'react';
import { watchDevicePixels } from './devicePixels';

export interface Size {
  readonly width: number;
  readonly height: number;
}

export function realSizeOf(
  natural: Size,
  pixelRatio: number,
  vector: boolean,
): Size {
  return vector
    ? natural
    : {
        width: natural.width / pixelRatio,
        height: natural.height / pixelRatio,
      };
}

const subscribeToPixelRatio = (onChange: () => void) =>
  watchDevicePixels(onChange);

export function usePixelRatio(): number {
  return useSyncExternalStore(
    subscribeToPixelRatio,
    () => window.devicePixelRatio,
    () => 1,
  );
}

export interface ImageSizing {
  readonly vector: boolean;
  readonly realSize: boolean;
  readonly onRealSize: () => void;
}
