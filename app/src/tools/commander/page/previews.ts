import { imageType } from '../../../shared/images';
import { isPdf } from '../../../shared/pdf';
import { languageOf } from '../../../ui/languages';
import { viewedFileUrl } from '../shared/files';
import type { ViewMode } from '../shared/keymap';
import type { Viewing } from './viewer';

export type Preview = 'image' | 'markdown' | 'pdf';

export function previewOf(file: string): Preview | undefined {
  if (imageType(file) !== undefined) {
    return 'image';
  }
  if (isPdf(file)) {
    return 'pdf';
  }
  return languageOf(file) === 'markdown' ? 'markdown' : undefined;
}

export function firstMode(file: string): ViewMode {
  return previewOf(file) === undefined ? 'text' : 'preview';
}

export function previewUrl(viewing: Viewing, file: string): string {
  return viewedFileUrl(viewing.tab, file, viewing.version);
}
