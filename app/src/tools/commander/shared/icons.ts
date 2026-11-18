import { isSide, type Side } from './sides';

export const iconRoute = '/commander-icon';

export interface IconSource {
  readonly tab: string;
  readonly side: Side;
  readonly folder: string;
  readonly name: string;
}

const part = (name: string, value: string) =>
  `${name}=${encodeURIComponent(value.toWellFormed())}`;

export function iconUrl(
  { tab, side, folder, name }: IconSource,
  ticket?: string,
): string {
  return `${iconRoute}?${part('tab', tab)}&${part('side', side)}&${part('folder', folder)}&${part('name', name)}${ticket === undefined ? '' : `&${part('ticket', ticket)}`}`;
}

export function iconTicketOf(url: URL): string | undefined {
  return url.searchParams.get('ticket') ?? undefined;
}

export const maxDroppedIcons = 1000;

export function paneFileOf(url: URL, route: string): IconSource | undefined {
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
