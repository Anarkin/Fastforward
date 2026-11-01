import { imageType } from '../../../shared/images';
import { languageOf } from '../../../ui/languages';
import type { ViewMode } from '../shared/keymap';

export type Preview = 'image' | 'markdown';

export function previewOf(file: string): Preview | undefined {
  if (imageType(file) !== undefined) {
    return 'image';
  }
  return languageOf(file) === 'markdown' ? 'markdown' : undefined;
}

export function firstMode(file: string, binary: boolean): ViewMode {
  if (previewOf(file) !== undefined) {
    return 'preview';
  }
  return binary ? 'hex' : 'text';
}
