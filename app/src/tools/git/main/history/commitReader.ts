import { buffersOf, CommitsBuilder, type CommitsParts } from './commits';

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
  | { readonly type: 'drop'; readonly id: number };

export type FromReader =
  | {
      readonly type: 'read';
      readonly id: number;
      readonly commits: CommitsParts;
      readonly read: number;
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
      default:
        message satisfies never;
    }
  });
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
