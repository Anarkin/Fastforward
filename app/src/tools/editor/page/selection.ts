import type { Extension } from '@codemirror/state';
import type { CursorLook } from '../../../lib/shared/cursorSettings';
import type { Binding } from '../../../lib/shared/keymap';
import { cursorLayer } from './cursor';
import { editorPointing } from './pointing';
import { gridReveal } from './reveal';
import { rowEndKeys, type RowEnd } from './rowEnd';

export function appSelection(
  binding: Binding<RowEnd>,
  look: CursorLook,
): Extension {
  return [cursorLayer(look), editorPointing, gridReveal, rowEndKeys(binding)];
}
