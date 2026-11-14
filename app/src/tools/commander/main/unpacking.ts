import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings, type Sentence } from '../../../lib/shared/strings';
import { folderKey } from '../shared/paths';
import type { TransferEvent } from './transferProtocol';
import type { ConnectTransfer } from './transfers';
import { itemsAt } from './archiveFiles';
import type { ArchiveAccess, OpenedArchive } from './archives';
import type { ArchiveBranch } from './archiveTree';

interface Moving {
  readonly roots: readonly ArchiveBranch[];
  readonly platform: NodeJS.Platform;
}

export interface Unpacking {
  readonly archives: ArchiveAccess;
  readonly archive: OpenedArchive;
  readonly paths: readonly string[];
  readonly depth: number;
  readonly withoutFolders: boolean;
  readonly files: number;
  readonly bytes: number;
  readonly moving?: Moving;
}

type Done = Extract<TransferEvent, { readonly type: 'done' }>;

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function presentIn(
  folder: string,
  platform: NodeJS.Platform,
): Promise<ReadonlySet<string>> {
  const found = await fs.promises
    .readdir(folder, { recursive: true, encoding: 'utf8' })
    .catch(() => []);
  return new Set(found.map((each) => folderKey(each, platform)));
}

function branchesOf(roots: readonly ArchiveBranch[]): ArchiveBranch[] {
  return roots.flatMap((root) => [root, ...branchesOf(root.children)]);
}

export function movedOut(
  roots: readonly ArchiveBranch[],
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
  withoutFolders: boolean,
  platform: NodeJS.Platform,
): { readonly paths: readonly string[]; readonly unmatched: number } {
  const keyOf = ({ parts }: ArchiveBranch) =>
    folderKey(
      withoutFolders ? (parts.at(-1) ?? '') : parts.join(path.sep),
      platform,
    );
  const all = branchesOf(roots);
  const counts = new Map<string, number>();
  for (const branch of all) {
    const key = keyOf(branch);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const matched = (branch: ArchiveBranch) =>
    counts.get(keyOf(branch)) === 1 && before.has(keyOf(branch));
  const whole = (branch: ArchiveBranch): boolean =>
    matched(branch) && branch.children.every(whole);
  const paths: string[] = [];
  const visit = (branch: ArchiveBranch) => {
    if (whole(branch) && !after.has(keyOf(branch))) {
      paths.push(branch.path);
      return;
    }
    for (const child of branch.children) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return {
    paths,
    unmatched: all.filter((branch) => !branch.folder && !matched(branch))
      .length,
  };
}

export function unpackingFirst(
  {
    archives,
    archive,
    paths,
    depth,
    withoutFolders,
    files,
    bytes,
    moving,
  }: Unpacking,
  connect: ConnectTransfer,
): ConnectTransfer {
  return (listener) => {
    const aborting = new AbortController();
    const name = path.basename(archive.file);
    let inner: ReturnType<ConnectTransfer> | undefined;
    let staging: string | undefined;
    let deleting = false;
    let ended = false;
    const removeStaging = () => {
      if (staging !== undefined) {
        void fs.promises
          .rm(staging, { recursive: true, force: true, maxRetries: 3 })
          .catch(() => undefined);
      }
    };
    const end = (event: TransferEvent) => {
      if (!ended) {
        ended = true;
        removeStaging();
        listener.event(event);
      }
    };
    const warn = (reason: Sentence) => {
      if (!ended) {
        listener.event({ type: 'warned', reason });
      }
    };
    const fail = (reason: Sentence) => {
      listener.event({ type: 'failed', name, reason });
      end({ type: 'done', stopped: false });
    };
    const deleteMoved = async (
      done: Done,
      { roots, platform }: Moving,
      folder: string,
      before: ReadonlySet<string>,
    ) => {
      const { paths: moved, unmatched } = movedOut(
        roots,
        before,
        await presentIn(folder, platform),
        withoutFolders,
        platform,
      );
      if (unmatched > 0) {
        warn(strings.commander.keptUnmatched(name, unmatched));
      }
      if (moved.length === 0) {
        end(done);
        return;
      }
      const removed = await archives.remove(archive, moved, {
        signal: aborting.signal,
        onProgress: ({ percent }) => {
          if (!ended) {
            listener.event({
              type: 'progress',
              progress: {
                files,
                totalFiles: files,
                bytes: Math.round((bytes * percent) / 100),
                totalBytes: bytes,
                current: name,
                deleting: true,
              },
            });
          }
        },
      });
      if (aborting.signal.aborted) {
        end({ type: 'done', stopped: true });
        return;
      }
      if (removed.kind === 'refused') {
        warn(strings.commander.movedOutKept(name, removed.reason));
      } else if (removed.warning !== undefined) {
        warn(strings.commander.movedOutWarned(name, removed.warning));
      }
      end(done);
    };
    const finished = (
      done: Done,
      folder: string,
      before: ReadonlySet<string> | undefined,
    ) => {
      if (
        moving === undefined ||
        before === undefined ||
        done.stopped ||
        done.error !== undefined
      ) {
        end(done);
        return;
      }
      deleting = true;
      inner?.dispose();
      deleteMoved(done, moving, folder, before).catch((error: unknown) => {
        if (aborting.signal.aborted) {
          end({ type: 'done', stopped: true });
        } else {
          warn(strings.commander.movedOutKept(name, reasonOf(error)));
          end(done);
        }
      });
    };
    const begin = async (target: string) => {
      const extracted = await archives.extract(archive, paths, {
        signal: aborting.signal,
        withoutFolders,
        onProgress: (progress) =>
          listener.event({
            type: 'progress',
            progress: {
              files: progress.files,
              totalFiles: files,
              bytes: Math.round((bytes * progress.percent) / 100),
              totalBytes: bytes,
              ...(progress.current !== undefined && {
                current: progress.current,
              }),
            },
          }),
      });
      if (aborting.signal.aborted) {
        end({ type: 'done', stopped: true });
        return;
      }
      if (extracted.kind === 'refused') {
        if (extracted.needsPassword === true) {
          archives.usePassword(archive.file, undefined);
        }
        fail(extracted.reason);
        return;
      }
      const folder = extracted.folder;
      staging = folder;
      const before =
        moving === undefined
          ? undefined
          : await presentIn(folder, moving.platform);
      const sources = await itemsAt(folder, withoutFolders ? 0 : depth);
      if (aborting.signal.aborted) {
        end({ type: 'done', stopped: true });
        return;
      }
      inner = connect({
        event: (event) =>
          event.type === 'done'
            ? finished(event, folder, before)
            : listener.event(event),
        stopped: (code) => {
          if (!deleting) {
            removeStaging();
            listener.stopped(code);
          }
        },
      });
      inner.send({ type: 'start', plan: { sources, target, move: true } });
    };
    return {
      send: (command) => {
        if (deleting) {
          if (command.type === 'stop') {
            aborting.abort();
          }
        } else if (inner !== undefined) {
          inner.send(command);
        } else if (command.type === 'start') {
          begin(command.plan.target).catch((error: unknown) => {
            if (aborting.signal.aborted) {
              end({ type: 'done', stopped: true });
            } else {
              fail(reasonOf(error));
            }
          });
        } else if (command.type === 'stop') {
          aborting.abort();
        }
      },
      dispose: () => {
        aborting.abort();
        inner?.dispose();
        removeStaging();
      },
    };
  };
}
