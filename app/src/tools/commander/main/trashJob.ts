import * as path from 'node:path';
import { reasonOf } from '../../../lib/main/reasons';
import type { ConnectTransfer } from './transfers';

export function trashJob(
  trash: (item: string) => Promise<void>,
): ConnectTransfer {
  return (listener) => {
    let stopped = false;
    let ended = false;
    const told: typeof listener.event = (event) => {
      if (!ended) {
        listener.event(event);
      }
    };
    const run = async (items: readonly string[]) => {
      const totalFiles = items.length;
      for (const [done, item] of items.entries()) {
        if (stopped) {
          return true;
        }
        told({
          type: 'progress',
          progress: {
            files: done,
            totalFiles,
            bytes: 0,
            totalBytes: 0,
            current: item,
          },
        });
        try {
          await trash(item);
        } catch (error) {
          told({
            type: 'failed',
            name: path.basename(item),
            reason: reasonOf(error),
          });
        }
      }
      told({
        type: 'progress',
        progress: { files: totalFiles, totalFiles, bytes: 0, totalBytes: 0 },
      });
      return stopped;
    };
    return {
      send: (command) => {
        if (command.type === 'start') {
          void run(command.plan.sources).then((wasStopped) => {
            told({ type: 'done', stopped: wasStopped });
            ended = true;
          });
        } else if (command.type === 'stop') {
          stopped = true;
        }
      },
      dispose: () => {
        stopped = true;
        ended = true;
      },
    };
  };
}

const trimmedByWindows = /[. ]$/;

export function binTrims(file: string, platform: NodeJS.Platform): boolean {
  return (
    platform === 'win32' &&
    file
      .split(/[\\/]/)
      .slice(1)
      .some(
        (part) => part !== '.' && part !== '..' && trimmedByWindows.test(part),
      )
  );
}
