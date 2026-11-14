import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { strings } from '../lib/shared/strings';
import type { Settings } from '../shell/main/settings';
import { themeCss } from '../shell/main/theme';
import { viewedFileRoute } from '../tools/commander/shared/files';
import { iconRoute, thumbnailRoute } from '../tools/commander/shared/icons';
import type { CommanderTool } from '../tools/commander/main/tool';
import type { GitTool } from '../tools/git/main/tool';
import { imageRoute } from '../tools/git/shared/images';
import { appFile, appScheme } from './files';

export function serveApp(
  dist: string,
  settings: () => Settings,
  tools: Promise<{ readonly git: GitTool; readonly commander: CommanderTool }>,
): void {
  protocol.handle(appScheme, (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/theme.css') {
      return new Response(themeCss(settings()), {
        headers: { 'content-type': 'text/css', 'cache-control': 'no-store' },
      });
    }
    if (url.pathname === imageRoute) {
      return tools.then(({ git }) => git.image(url));
    }
    if (url.pathname === iconRoute) {
      return tools.then(({ commander }) => commander.icon(url));
    }
    if (url.pathname === thumbnailRoute) {
      return tools.then(({ commander }) => commander.thumbnail(url));
    }
    if (url.pathname === viewedFileRoute) {
      return tools.then(({ commander }) =>
        commander.file(url, request.headers.get('range')),
      );
    }
    const file = appFile(dist, request.url);
    return file
      ? net.fetch(pathToFileURL(file).toString())
      : new Response(strings.errors.notFound, { status: 404 });
  });
}
