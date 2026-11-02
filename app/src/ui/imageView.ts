import { createContext, useContext } from 'react';
import type { ImageView } from '../shell/shared/protocol';

export const defaultImageView: ImageView = { realSize: false };

export const ImageViewContext = createContext<{
  readonly view: ImageView;
  readonly change: (view: ImageView) => void;
}>({ view: defaultImageView, change: () => undefined });

export function useImageView() {
  return useContext(ImageViewContext);
}
