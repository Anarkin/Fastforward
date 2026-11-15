import { isAppPage } from './files';

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

interface Navigation {
  readonly url: string;
  preventDefault(): void;
}

interface NavigatedContents {
  on(event: 'will-navigate', listener: (event: Navigation) => void): unknown;
  on(event: 'will-redirect', listener: (event: Navigation) => void): unknown;
}

function keepOn(event: Navigation): void {
  if (!isAppPage(event.url)) {
    event.preventDefault();
  }
}

export function keepOnAppPage(contents: NavigatedContents): void {
  contents.on('will-navigate', keepOn);
  contents.on('will-redirect', keepOn);
}
