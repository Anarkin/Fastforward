import { isSide, type Side } from './protocol';

export const iconRoute = '/commander-icon';

export interface IconSource {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly name: string;
}

export function iconUrl({ tab, side, folder, name }: IconSource): string {
  return `${iconRoute}?${new URLSearchParams({ tab, side, folder, name })}`;
}

export function iconSourceOf(url: URL): IconSource | undefined {
  const query = url.searchParams;
  const tab = query.get('tab');
  const side = query.get('side');
  const folder = query.get('folder');
  const name = query.get('name');
  return url.pathname === iconRoute && tab && isSide(side) && folder && name
    ? { tab, side, folder, name }
    : undefined;
}
