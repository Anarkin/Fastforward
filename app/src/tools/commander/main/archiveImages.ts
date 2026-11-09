import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArchiveAccess, OpenedArchive } from './archives';

type Answer = (bytes: Buffer | undefined) => void;

export class ArchiveImages {
  private readonly waiting = new Map<OpenedArchive, Map<string, Answer[]>>();
  private readonly taking = new Set<OpenedArchive>();

  constructor(private readonly archives: ArchiveAccess) {}

  read(archive: OpenedArchive, item: string): Promise<Buffer | undefined> {
    return new Promise((resolve) => {
      const waiting = this.waiting.get(archive) ?? new Map<string, Answer[]>();
      this.waiting.set(archive, waiting);
      waiting.set(item, [...(waiting.get(item) ?? []), resolve]);
      if (!this.taking.has(archive)) {
        this.taking.add(archive);
        setImmediate(() => void this.takeOut(archive));
      }
    });
  }

  private async takeOut(archive: OpenedArchive): Promise<void> {
    try {
      for (
        let waiting = this.waiting.get(archive);
        waiting !== undefined;
        waiting = this.waiting.get(archive)
      ) {
        this.waiting.delete(archive);
        await this.taken(archive, waiting);
      }
    } finally {
      this.taking.delete(archive);
    }
  }

  private async taken(
    archive: OpenedArchive,
    waiting: ReadonlyMap<string, readonly Answer[]>,
  ): Promise<void> {
    const extracted = await this.archives
      .extract(archive, [...waiting.keys()])
      .catch(() => undefined);
    const folder =
      extracted?.kind === 'extracted' ? extracted.folder : undefined;
    const read: (Buffer | undefined)[] = [];
    if (folder !== undefined) {
      read.push(
        ...(await Promise.all(
          [...waiting.keys()].map((item) =>
            fs.promises
              .readFile(path.join(folder, ...item.split('/')))
              .catch(() => undefined),
          ),
        )),
      );
      await fs.promises
        .rm(folder, { recursive: true, force: true })
        .catch(() => undefined);
    }
    for (const [at, answers] of [...waiting.values()].entries()) {
      for (const answer of answers) {
        answer(read[at]);
      }
    }
  }
}
