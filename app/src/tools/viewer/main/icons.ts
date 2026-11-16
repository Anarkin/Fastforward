import { fileTabIconUrl } from '../../../lib/main/fileTabIcons';

export const viewerIconRoute = '/viewer-icon';

export function viewerIconUrl(tab: string, file: string): string {
  return fileTabIconUrl(viewerIconRoute, tab, file);
}
