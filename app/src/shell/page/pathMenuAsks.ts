import type { OpenMenu } from '../../lib/page/contextMenuItem';
import type { PathMenuAsk } from '../../lib/page/pathMenu';
import type { PathFacts } from '../../lib/shared/pathFacts';
import type { ToHost } from '../shared/protocol';
import { pathMenuItems, versionMenuItems } from './pathMenu';

interface ShownPathMenu {
  readonly id: number;
  readonly menu: OpenMenu;
}

export interface PathMenuAsks {
  readonly open: (ask: PathMenuAsk) => ShownPathMenu | undefined;
  readonly answered: (ask: number, facts: PathFacts) => OpenMenu | undefined;
}

export function pathMenuAsks(
  post: (message: ToHost) => void,
  platform: () => string | undefined,
): PathMenuAsks {
  let asks = 0;
  let waiting: { readonly id: number; readonly ask: PathMenuAsk } | undefined;
  const copy = (text: string) => post({ type: 'copyText', text });
  return {
    open: (ask) => {
      if (ask.version !== undefined) {
        waiting = undefined;
        return {
          id: ++asks,
          menu: {
            x: ask.at.x,
            y: ask.at.y,
            items: versionMenuItems(ask, { copy }),
          },
        };
      }
      if (ask.extended && platform() === 'win32') {
        waiting = undefined;
        post({
          type: 'pathCommand',
          path: ask.path,
          command: 'systemMenu',
          x: ask.at.x,
          y: ask.at.y,
          extended: true,
        });
        return undefined;
      }
      waiting = { id: ++asks, ask };
      post({ type: 'pathFacts', ask: waiting.id, path: ask.path });
      return undefined;
    },
    answered: (id, facts) => {
      if (waiting?.id !== id) {
        return undefined;
      }
      const { ask } = waiting;
      waiting = undefined;
      return {
        x: ask.at.x,
        y: ask.at.y,
        items: pathMenuItems(ask, facts, platform(), {
          command: (command) =>
            post({
              type: 'pathCommand',
              path: ask.path,
              command,
              ...(command === 'systemMenu' && {
                x: ask.at.x,
                y: ask.at.y,
                extended: false,
              }),
            }),
          copy,
        }),
      };
    },
  };
}
