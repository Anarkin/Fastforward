import {
  buffersOf,
  Commits,
  CommitsBuilder,
  type CommitsParts,
} from './commits';
import { headsOf } from './merges';

export type ToReader =
  | {
      readonly type: 'start';
      readonly id: number;
      readonly stashes: readonly string[];
      readonly timestamped: boolean;
      readonly tips: readonly string[];
    }
  | { readonly type: 'add'; readonly id: number; readonly chunk: Uint8Array }
  | { readonly type: 'finish'; readonly id: number }
  | { readonly type: 'drop'; readonly id: number }
  | {
      readonly type: 'join';
      readonly id: number;
      readonly top: CommitsParts;
      readonly older: CommitsParts;
      readonly dropped: number;
    };

export type FromReader =
  | {
      readonly type: 'read';
      readonly id: number;
      readonly commits: CommitsParts;
      readonly read: number;
      readonly heads?: readonly string[];
    }
  | { readonly type: 'failed'; readonly id: number; readonly message: string };

export interface ReaderPort {
  postMessage(message: FromReader, transfer?: readonly ArrayBuffer[]): void;
  on(event: 'message', listener: (message: ToReader) => void): unknown;
}

export function serveCommitReads(port: ReaderPort): void {
  const builders = new Map<number, CommitsBuilder>();
  port.on('message', (message) => {
    switch (message.type) {
      case 'start':
        builders.set(
          message.id,
          new CommitsBuilder(
            message.stashes,
            message.timestamped,
            message.tips,
          ),
        );
        return;
      case 'add':
        builders.get(message.id)?.add(message.chunk);
        return;
      case 'finish': {
        const builder = builders.get(message.id);
        builders.delete(message.id);
        if (builder !== undefined) {
          void answer(port, message.id, builder);
        }
        return;
      }
      case 'drop':
        builders.delete(message.id);
        return;
      case 'join':
        join(port, message);
        return;
      default:
        message satisfies never;
    }
  });
}

function join(
  port: ReaderPort,
  { id, top, older, dropped }: Extract<ToReader, { type: 'join' }>,
): void {
  try {
    const joined = Commits.replacingTop(
      Commits.fromParts(top),
      Commits.fromParts(older),
      dropped,
    );
    const commits = joined.parts();
    port.postMessage(
      { type: 'read', id, commits, read: 0, heads: [...headsOf(joined)] },
      buffersOf(commits),
    );
  } catch (error) {
    port.postMessage({
      type: 'failed',
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function answer(
  port: ReaderPort,
  id: number,
  builder: CommitsBuilder,
): Promise<void> {
  try {
    const commits = (await builder.finish()).parts();
    port.postMessage(
      { type: 'read', id, commits, read: builder.read },
      buffersOf(commits),
    );
  } catch (error) {
    port.postMessage({
      type: 'failed',
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
