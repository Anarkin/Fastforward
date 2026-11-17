import { strings } from '../lib/shared/strings';
import type { Settings } from '../shell/main/settings';
import { themeCss } from '../shell/main/theme';
import { viewedFileRoute } from '../tools/viewer/shared/files';
import type { ViewerTool } from '../tools/viewer/main/tool';
import { iconRoute } from '../tools/commander/shared/icons';
import { thumbnailRoute } from '../tools/commander/shared/thumbnails';
import type { CommanderTool } from '../tools/commander/main/tool';
import type { GitTool } from '../tools/git/main/tool';
import { gitImageRoute } from '../tools/git/shared/images';
import { comparedImageRoute } from '../tools/diff/shared/images';
import type { DiffTool } from '../tools/diff/main/tool';
import { appFile } from './files';

export interface RoutedTools {
  readonly git: Pick<GitTool, 'image'>;
  readonly commander: Pick<CommanderTool, 'icon' | 'thumbnail'>;
  readonly viewer: Pick<ViewerTool, 'file'>;
  readonly diff: Pick<DiffTool, 'image'>;
}

const fileHeaders = {
  'content-security-policy':
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
  'x-content-type-options': 'nosniff',
};

function servedFile(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(fileHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function appRoutes(
  dist: string,
  settings: () => Settings,
  tools: Promise<RoutedTools>,
  fetchFile: (file: string) => Promise<Response>,
): (request: Request) => Response | Promise<Response> {
  return (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/theme.css') {
      return new Response(themeCss(settings()), {
        headers: { 'content-type': 'text/css', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === gitImageRoute) {
      return tools.then(({ git }) => git.image(url)).then(servedFile);
    }
    if (url.pathname === comparedImageRoute) {
      return tools.then(({ diff }) => diff.image(url)).then(servedFile);
    }
    if (url.pathname === iconRoute) {
      return tools
        .then(({ commander }) => commander.icon(url))
        .then(servedFile);
    }
    if (url.pathname === thumbnailRoute) {
      return tools
        .then(({ commander }) => commander.thumbnail(url))
        .then(servedFile);
    }
    if (url.pathname === viewedFileRoute) {
      return tools
        .then(({ viewer }) => viewer.file(url, request.headers.get('range')))
        .then(servedFile);
    }
    const file = appFile(dist, request.url);
    return file
      ? fetchFile(file)
      : new Response(strings.errors.notFound, { status: 404 });
  };
}
