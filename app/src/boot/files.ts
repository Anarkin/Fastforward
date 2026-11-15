import * as path from 'node:path';

export const appScheme = 'fastforward';
const appOrigin = `${appScheme}://app`;
const appPagePath = '/index.html';
export const appPage = `${appOrigin}${appPagePath}`;

export function appFile(root: string, url: string): string | undefined {
  const parsed = new URL(url);
  if (!fromApp(parsed)) {
    return undefined;
  }
  const decoded = decodedPath(parsed.pathname);
  if (decoded === undefined) {
    return undefined;
  }
  const relative = decoded.replace(/^\/+/, '');
  const file = path.resolve(root, relative || 'index.html');
  const inside = path.relative(root, file);
  return inside && !inside.startsWith('..') && !path.isAbsolute(inside)
    ? file
    : undefined;
}

function decodedPath(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
}

export function isAppUrl(url: string): boolean {
  const parsed = URL.parse(url);
  return parsed !== null && fromApp(parsed);
}

export function isAppPage(url: string): boolean {
  const parsed = URL.parse(url);
  return parsed !== null && fromApp(parsed) && parsed.pathname === appPagePath;
}

export function startsAppPage(details: {
  readonly url: string;
  readonly isMainFrame: boolean;
  readonly isSameDocument: boolean;
}): boolean {
  return (
    details.isMainFrame && !details.isSameDocument && isAppPage(details.url)
  );
}

function fromApp(url: URL): boolean {
  return `${url.protocol}//${url.host}` === appOrigin;
}
