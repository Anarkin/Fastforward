import { keyPressed } from '../../../lib/page/shortcuts';
import { viewerKeymap, type ViewMode } from './keymap';

export type ViewerAct =
  | { readonly kind: 'find' }
  | { readonly kind: 'edit' }
  | { readonly kind: 'viewAs'; readonly mode: ViewMode }
  | { readonly kind: 'encoding' }
  | { readonly kind: 'language' }
  | { readonly kind: 'wrap' }
  | { readonly kind: 'whitespace' }
  | { readonly kind: 'realSize' }
  | { readonly kind: 'version' }
  | { readonly kind: 'compareVersions' };

export interface ViewerKeys {
  readonly mode: ViewMode;
  readonly readsText: boolean;
  readonly showsImage: boolean;
  readonly showsCode?: boolean;
}

export function viewerKey(
  event: Parameters<typeof keyPressed>[1],
  { mode, readsText, showsImage, showsCode = false }: ViewerKeys,
): ViewerAct | undefined {
  if (keyPressed(viewerKeymap.find, event) !== undefined) {
    return { kind: 'find' };
  }
  if (keyPressed(viewerKeymap.edit, event) !== undefined) {
    return { kind: 'edit' };
  }
  if (keyPressed(viewerKeymap.version, event) !== undefined) {
    return { kind: 'version' };
  }
  if (keyPressed(viewerKeymap.compareVersions, event) !== undefined) {
    return { kind: 'compareVersions' };
  }
  const wanted = keyPressed(viewerKeymap.viewAs, event);
  if (wanted !== undefined) {
    return { kind: 'viewAs', mode: wanted };
  }
  if (
    mode === 'text' &&
    keyPressed(viewerKeymap.encoding, event) !== undefined
  ) {
    return { kind: 'encoding' };
  }
  if (readsText && keyPressed(viewerKeymap.language, event) !== undefined) {
    return { kind: 'language' };
  }
  if (readsText && keyPressed(viewerKeymap.wrap, event) !== undefined) {
    return { kind: 'wrap' };
  }
  if (
    (mode !== 'preview' || showsCode) &&
    keyPressed(viewerKeymap.showWhitespace, event) !== undefined
  ) {
    return { kind: 'whitespace' };
  }
  if (showsImage && keyPressed(viewerKeymap.realSize, event) !== undefined) {
    return { kind: 'realSize' };
  }
  return undefined;
}
