import * as path from 'node:path';

export const appScheme = 'fastforward';
export const appOrigin = `${appScheme}://app`;

export function appFile(root: string, url: string): string | undefined {
  const parsed = new URL(url);
  if (!fromApp(parsed)) {
    return undefined;
  }
  const relative = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative || 'index.html');
  const inside = path.relative(root, file);
  return inside && !inside.startsWith('..') && !path.isAbsolute(inside)
    ? file
    : undefined;
}

export function isAppUrl(url: string): boolean {
  const parsed = URL.parse(url);
  return parsed !== null && fromApp(parsed);
}

export function startsAppPage(details: {
  readonly url: string;
  readonly isMainFrame: boolean;
  readonly isSameDocument: boolean;
}): boolean {
  return (
    details.isMainFrame && !details.isSameDocument && isAppUrl(details.url)
  );
}

function fromApp(url: URL): boolean {
  return `${url.protocol}//${url.host}` === appOrigin;
}

export function opensExternally(url: string): boolean {
  const protocol = URL.parse(url)?.protocol;
  return protocol === 'https:' || protocol === 'mailto:';
}

interface LockedSession {
  setPermissionRequestHandler(
    handler: (
      contents: unknown,
      permission: string,
      answer: (granted: boolean) => void,
    ) => void,
  ): void;
  setPermissionCheckHandler(handler: () => boolean): void;
  on(
    event: 'will-download',
    listener: (event: { preventDefault(): void }) => void,
  ): unknown;
}

export function lockDown(session: LockedSession): void {
  session.setPermissionRequestHandler((_contents, _permission, answer) =>
    answer(false),
  );
  session.setPermissionCheckHandler(() => false);
  session.on('will-download', (event) => event.preventDefault());
}
