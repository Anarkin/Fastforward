import { imageExtensions, imageType } from '../../../lib/shared/images';
import { isPdf, pdfExtensions } from '../shared/pdf';
import { extensionsOf, languageOf } from '../../../lib/page/languages';
import type { TipRow } from '../../../lib/page/tips';
import { strings } from '../../../lib/shared/strings';
import { viewedFileUrl } from '../shared/files';
import type { ViewMode } from './keymap';
import type { Viewing } from './viewing';

export type Preview = 'image' | 'markdown' | 'pdf';

const dotted = (extensions: readonly string[]) =>
  extensions.map((extension) => `.${extension}`).join(' ');

export function previewKinds(): TipRow[] {
  return [
    {
      name: strings.viewer.markdownFiles,
      values: dotted(extensionsOf('markdown')),
    },
    { name: strings.viewer.pdfFiles, values: dotted(pdfExtensions) },
    { name: strings.viewer.imageFiles, values: dotted(imageExtensions) },
  ];
}

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
