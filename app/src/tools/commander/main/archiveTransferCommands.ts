import * as path from 'node:path';
import { sentencesOf } from '../../../lib/shared/sentences';
import { strings } from '../../../lib/shared/strings';
import type { Page } from '../../../shell/main/toolContract';
import { folderKey } from '../shared/paths';
import { archiveJob } from './archiveJobs';
import { copiedBetween } from './betweenArchives';
import { unpackingFirst } from './unpacking';
import { reasonOf } from '../../../lib/main/reasons';
import type { ConnectTransfer, Transfers } from './transfers';
import type { Pane, ShownPane } from './sides';
import { post } from './post';
import { archiveItems } from './archiveItems';
import type { ArchivePasswords } from './archivePasswords';
import type { ArchiveCommands } from './archiveCommands';
import type { ArchiveAccess, OpenedArchive } from './archives';
import type { ArchiveBranch } from './archiveTree';
import type { TransferCommandsHost } from './transferCommands';
import { refusedTarget } from './transferTargets';

export interface ArchiveTransferCommandsAccess {
  readonly archives?: ArchiveAccess;
  readonly platform: NodeJS.Platform;
  readonly remove?: (file: string) => Promise<void>;
  readonly connectTransfer: ConnectTransfer;
}

function branchesNamed(
  archive: OpenedArchive,
  inner: readonly string[],
  names: readonly string[],
): ArchiveBranch[] {
  return names.flatMap((name) => {
    const parts = name.split(path.sep);
    return (
      archive.tree.branch(
        [...inner, ...parts.slice(0, -1)],
        parts.at(-1) ?? name,
      ) ?? []
    );
  });
}

function nameShared(
  names: readonly string[],
  key: (name: string) => string,
): string | undefined {
  const seen = new Set<string>();
  for (const name of names) {
    const base = path.basename(name);
    const each = key(base);
    if (seen.has(each)) {
      return base;
    }
    seen.add(each);
  }
  return undefined;
}

export class ArchiveTransferCommands {
  constructor(
    private readonly access: ArchiveTransferCommandsAccess,
    private readonly passwords: ArchivePasswords,
    private readonly archiveCommands: ArchiveCommands,
    private readonly transfers: Transfers,
    private readonly host: Pick<TransferCommandsHost, 'refuse'>,
  ) {}

  transferIn(
    page: Page,
    shown: ShownPane,
    other: Pane,
    names: readonly string[],
    move: boolean,
    existing: unknown,
  ): void {
    const { archives, platform, remove } = this.access;
    const inside = archives?.within(other.folder);
    if (
      archives === undefined ||
      inside === undefined ||
      (move && remove === undefined)
    ) {
      return;
    }
    const { archive, inner } = inside;
    const key = (each: string) => folderKey(each, platform);
    const there = new Set(
      (archive.tree.entries(inner) ?? []).map((entry) => key(entry.name)),
    );
    const clashing = names.filter((name) =>
      there.has(key(path.basename(name))),
    );
    if (clashing.length > 0 && existing !== 'replace' && existing !== 'skip') {
      this.askExisting(page, shown, other, names, move, clashing);
      return;
    }
    const kept =
      existing === 'skip'
        ? names.filter((name) => !clashing.includes(name))
        : names;
    const alike = nameShared(kept, key);
    if (alike !== undefined) {
      this.host.refuse(page, strings.commander.namesAlike(alike));
      return;
    }
    const { folder } = shown.pane;
    const into = kept.find((name) => {
      const item = key(path.join(folder, name));
      return (
        key(archive.file) === item ||
        key(archive.file).startsWith(`${item}${path.sep}`)
      );
    });
    if (into !== undefined) {
      this.host.refuse(
        page,
        strings.commander.intoItself(path.join(folder, into)),
      );
      return;
    }
    if (kept.length === 0 || !this.archiveCommands.changeable(page, archive)) {
      return;
    }
    this.transfers.start(
      {
        plan: {
          sources: kept.map((name) => path.join(folder, name)),
          target: other.folder,
          move,
        },
        folder,
        names: kept,
        archive: {
          job: move ? 'moveIn' : 'copyIn',
          file: archive.file,
          at: other.folder,
        },
      },
      archiveJob(path.basename(archive.file), async (options) => {
        const added = await archives.addItems(
          archive,
          inner,
          folder,
          kept,
          options,
        );
        if (!move || added.kind === 'refused') {
          return added;
        }
        if (added.warning !== undefined) {
          return {
            kind: 'packed',
            warning: sentencesOf([
              added.warning,
              strings.commander.originalsKept,
            ]),
          };
        }
        const failures: string[] = [];
        for (const name of kept) {
          try {
            await remove?.(path.join(folder, name));
          } catch (error) {
            failures.push(`${name}: ${reasonOf(error)}`);
          }
        }
        return failures.length === 0
          ? added
          : { kind: 'packed', warning: failures.join(' ') };
      }),
    );
  }

  async transferBetween(
    page: Page,
    shown: ShownPane,
    other: Pane,
    names: readonly string[],
    move: boolean,
    existing: unknown,
  ): Promise<void> {
    const { archives, platform } = this.access;
    const into = archives?.within(other.folder);
    if (archives === undefined || into === undefined) {
      return;
    }
    const key = (each: string) => folderKey(each, platform);
    const { folder } = shown.pane;
    const sources = names.map((name) => path.join(folder, name));
    const target = other.folder;
    const refused = refusedTarget(sources, target, platform);
    if (refused !== undefined) {
      this.host.refuse(page, refused);
      return;
    }
    const there = new Set(
      (into.archive.tree.entries(into.inner) ?? []).map((entry) =>
        key(entry.name),
      ),
    );
    const clashing = names.filter((name) =>
      there.has(key(path.basename(name))),
    );
    if (clashing.length > 0 && existing !== 'replace' && existing !== 'skip') {
      this.askExisting(page, shown, other, names, move, clashing);
      return;
    }
    const kept =
      existing === 'skip'
        ? names.filter((name) => !clashing.includes(name))
        : names;
    const found = archiveItems(this.access.archives, shown.pane, kept);
    if (kept.length === 0 || found === undefined) {
      return;
    }
    const { archive, inner, paths, withoutFolders, files, bytes, encrypted } =
      found;
    const alike = withoutFolders ? nameShared(kept, key) : undefined;
    if (alike !== undefined) {
      this.host.refuse(page, strings.commander.namesAlike(alike));
      return;
    }
    if (
      !this.archiveCommands.changeable(page, into.archive) ||
      (move && !this.archiveCommands.changeable(page, archive))
    ) {
      return;
    }
    if (
      encrypted &&
      !archives.hasPassword(archive.file) &&
      !(await this.passwords.passwordGiven(page, archive.file, false))
    ) {
      return;
    }
    this.transfers.start(
      {
        plan: {
          sources: kept.map((name) => path.join(folder, name)),
          target,
          move,
        },
        folder,
        names: kept,
        archive: {
          job: move ? 'moveIn' : 'copyIn',
          file: into.archive.file,
          at: target,
        },
      },
      archiveJob(path.basename(into.archive.file), (options) =>
        copiedBetween(
          archives,
          {
            archive,
            paths,
            depth: inner.length,
            withoutFolders,
            files,
            bytes,
            roots: branchesNamed(archive, inner, kept),
            platform,
          },
          into,
          move,
          options,
        ),
      ),
    );
  }

  async transferOut(
    page: Page,
    pane: Pane,
    target: string,
    names: readonly string[],
    move: boolean,
  ): Promise<void> {
    const found = archiveItems(this.access.archives, pane, names);
    if (
      found === undefined ||
      (move && !this.archiveCommands.changeable(page, found.archive))
    ) {
      return;
    }
    const {
      archives,
      archive,
      inner,
      paths,
      withoutFolders,
      files,
      bytes,
      encrypted,
    } = found;
    if (
      encrypted &&
      !archives.hasPassword(archive.file) &&
      !(await this.passwords.passwordGiven(page, archive.file, false))
    ) {
      return;
    }
    this.transfers.start(
      {
        plan: {
          sources: names.map((name) => path.join(pane.folder, name)),
          target,
          move,
        },
        folder: pane.folder,
        names,
      },
      unpackingFirst(
        {
          archives,
          archive,
          paths,
          depth: inner.length,
          withoutFolders,
          files,
          bytes,
          ...(move && {
            moving: {
              roots: branchesNamed(archive, inner, names),
              platform: this.access.platform,
            },
          }),
        },
        this.access.connectTransfer,
      ),
    );
  }

  private askExisting(
    page: Page,
    shown: ShownPane,
    other: Pane,
    names: readonly string[],
    move: boolean,
    existing: readonly string[],
  ): void {
    post(page, {
      type: 'askExisting',
      tab: shown.tab,
      side: shown.side,
      folder: shown.pane.folder,
      names,
      target: other.folder,
      move,
      existing,
    });
  }
}
