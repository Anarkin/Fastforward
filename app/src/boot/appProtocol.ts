import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import type { Settings } from '../shell/main/settings';
import { appScheme } from './files';
import { appRoutes, type RoutedTools } from './appRoutes';

export function serveApp(
  dist: string,
  settings: () => Settings,
  tools: Promise<RoutedTools>,
): void {
  protocol.handle(
    appScheme,
    appRoutes(dist, settings, tools, (file) =>
      net.fetch(pathToFileURL(file).toString()),
    ),
  );
}
