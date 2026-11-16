import { fileTabIconUrl } from '../../../lib/main/fileTabIcons';

export const editorIconRoute = '/editor-icon';

export function editorIconUrl(tab: string, file: string): string {
  return fileTabIconUrl(editorIconRoute, tab, file);
}
