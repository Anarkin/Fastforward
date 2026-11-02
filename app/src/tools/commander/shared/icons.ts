import { isSide, type Side } from './protocol';

export const iconRoute = '/commander-icon';

export const thumbnailRoute = '/commander-thumbnail';

export interface IconSource {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly name: string;
}

export function iconUrl({ tab, side, folder, name }: IconSource): string {
  return `${iconRoute}?${new URLSearchParams({ tab, side, folder, name })}`;
}

export function viewerIconUrl(tab: string, file: string): string {
  return `${iconRoute}?${new URLSearchParams({ view: tab, file })}`;
}

export function viewerOfIcon(
  url: URL,
): { readonly tab: string; readonly file: string } | undefined {
  const tab = url.searchParams.get('view');
  const file = url.searchParams.get('file');
  return url.pathname === iconRoute && tab && file ? { tab, file } : undefined;
}

function paneFileOf(url: URL, route: string): IconSource | undefined {
  const query = url.searchParams;
  const tab = query.get('tab');
  const side = query.get('side');
  const folder = query.get('folder');
  const name = query.get('name');
  return url.pathname === route && tab && isSide(side) && folder && name
    ? { tab, side, folder, name }
    : undefined;
}

export function iconSourceOf(url: URL): IconSource | undefined {
  return paneFileOf(url, iconRoute);
}

export function thumbnailUrl(
  { tab, side, folder, name }: IconSource,
  version: string,
): string {
  return `${thumbnailRoute}?${new URLSearchParams({ tab, side, folder, name, version })}`;
}

export function thumbnailSourceOf(url: URL): IconSource | undefined {
  return paneFileOf(url, thumbnailRoute);
}
