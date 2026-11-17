import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';
import type { Page, ShellAccess } from '../../../shell/main/toolContract';
import { sameRoot } from '../../../lib/main/paths';
import type { WatchFolder } from '../../../lib/main/watch';
import { archiveJob } from './archiveJobs';
import type { Transfers } from './transfers';
import { type Pane, type ShownPane, type Sides } from './sides';
import { listedIn } from './listedEntries';
import { post } from './post';
import { archiveItems } from './archiveItems';
import { itemsAt } from './archiveFiles';
import type { ArchiveAccess, OpenedArchive } from './archives';
import type { ArchivePasswords } from './archivePasswords';

export interface ArchiveCopiesAccess {
  readonly archives?: ArchiveAccess;
  readonly viewedCopies?: string;
  readonly watch: WatchFolder;
  readonly editRefusal?: (
    file: string,
    named?: string,
  ) => Promise<Sentence | undefined>;
}

export interface ArchiveCopiesHost {
  readonly shell: () => ShellAccess;
  readonly refuse: (page: Page, message: Sentence) => void;
  readonly saveQuietly: (saving: Promise<void>) => void;
}

export class ArchiveCopies {
  private updateAsks = 0;
  readonly updatesAsked = new Map<
    number,
    {
      readonly name: string;
      readonly archive: string;
      readonly answer: (update: boolean) => void;
    }
  >();
  readonly copiesWatched = new Set<{
    readonly archive: string;
    readonly copy: string;
    readonly stop: () => void;
  }>();
  readonly editedCopies = new Map<
    string,
    {
      readonly archives: ArchiveAccess;
      readonly archive: OpenedArchive;
      readonly inner: readonly string[];
    }
  >();
  private updateAskedIn: Page | undefined;

  constructor(
    private readonly access: ArchiveCopiesAccess,
    private readonly sides: Sides,
    private readonly passwords: ArchivePasswords,
    private readonly transfers: Transfers,
    private readonly host: ArchiveCopiesHost,
  ) {}

  copyOf(viewed: string): string | undefined {
    const { viewedCopies } = this.access;
    if (viewedCopies === undefined) {
      return undefined;
    }
    const inside = path.relative(viewedCopies, viewed);
    const [entry] = inside.split(path.sep);
    return entry === undefined ||
      inside === '' ||
      entry === '..' ||
      path.isAbsolute(inside)
      ? undefined
      : path.join(viewedCopies, entry);
  }

  removeCopy(viewed: string): void {
    const copy = this.copyOf(viewed);
    if (copy === undefined) {
      return;
    }
    const stillViewed = this.host
      .shell()
      .tabs()
      .some(
        (open) =>
          open.tool === 'viewer' &&
          open.root !== undefined &&
          (open.root === copy || open.root.startsWith(`${copy}${path.sep}`)),
      );
    if (!stillViewed) {
      this.host.saveQuietly(
        fs.promises.rm(copy, { recursive: true, force: true, maxRetries: 3 }),
      );
    }
  }

  async copiesIn(
    page: Page,
    pane: Pane,
    names: readonly string[],
    into?: string,
  ): Promise<string[] | undefined> {
    const found = archiveItems(this.access.archives, pane, names);
    if (found === undefined) {
      return undefined;
    }
    const { archives, archive, inner, paths, withoutFolders, encrypted } =
      found;
    if (
      encrypted &&
      !archives.hasPassword(archive.file) &&
      !(await this.passwords.passwordGiven(page, archive.file, false))
    ) {
      return undefined;
    }
    for (;;) {
      const extracted = await archives.extract(archive, paths, {
        ...(into !== undefined && { into }),
        withoutFolders,
      });
      if (extracted.kind === 'extracted') {
        return itemsAt(extracted.folder, withoutFolders ? 0 : inner.length);
      }
      if (extracted.needsPassword !== true) {
        this.host.refuse(
          page,
          strings.commander.couldNotExtract(extracted.reason),
        );
        return undefined;
      }
      if (
        !(await this.passwords.passwordGiven(
          page,
          archive.file,
          archives.hasPassword(archive.file),
        ))
      ) {
        return undefined;
      }
    }
  }

  private editedCopyOf(folder: string, name: string): string | undefined {
    const inside = this.access.archives?.within(folder);
    if (inside === undefined) {
      return undefined;
    }
    const wanted = [...inside.inner, ...name.split(path.sep)].join('/');
    const editedRoots = this.host
      .shell()
      .tabs()
      .flatMap((open) =>
        open.tool === 'editor' && open.root !== undefined ? [open.root] : [],
      );
    for (const [copy, edited] of this.editedCopies) {
      if (
        edited.archive.file === inside.archive.file &&
        [...edited.inner, path.basename(copy)].join('/') === wanted &&
        editedRoots.some((root) => sameRoot(root, copy))
      ) {
        return copy;
      }
    }
    return undefined;
  }

  async editInArchive(
    page: Page,
    shown: ShownPane,
    name: string,
  ): Promise<void> {
    const editedCopy = this.editedCopyOf(shown.pane.folder, name);
    if (editedCopy !== undefined) {
      await this.host.shell().openEdit(page, editedCopy);
      return;
    }
    const { viewedCopies } = this.access;
    const [copy] =
      (await this.copiesIn(
        page,
        shown.pane,
        [name],
        viewedCopies === undefined
          ? undefined
          : path.join(viewedCopies, randomUUID()),
      )) ?? [];
    if (copy === undefined) {
      return;
    }
    const refusal = await this.access.editRefusal?.(
      copy,
      path.join(shown.pane.folder, name),
    );
    if (refusal !== undefined) {
      this.host.shell().notice(page, { level: 'error', message: refusal });
      return;
    }
    const putBack = this.putBackOf(shown.pane.folder, name, copy);
    if (putBack !== undefined) {
      this.editedCopies.set(copy, putBack);
    }
    await this.host.shell().openEdit(page, copy);
  }

  async newFileInArchive(
    page: Page,
    shown: ShownPane,
    name: string,
  ): Promise<void> {
    if (listedIn(shown.pane, name) !== undefined) {
      await this.editInArchive(page, shown, name);
      return;
    }
    const editedCopy = this.editedCopyOf(shown.pane.folder, name);
    if (editedCopy !== undefined) {
      await this.host.shell().openEdit(page, editedCopy);
      return;
    }
    const { archives, viewedCopies } = this.access;
    const inside = archives?.within(shown.pane.folder);
    if (
      archives === undefined ||
      inside === undefined ||
      viewedCopies === undefined
    ) {
      return;
    }
    const refusal = archives.unchangeable(inside.archive);
    if (refusal !== undefined) {
      this.host.refuse(page, refusal);
      return;
    }
    const folder = path.join(viewedCopies, randomUUID());
    await fs.promises.mkdir(folder, { recursive: true });
    const copy = path.join(folder, name);
    this.editedCopies.set(copy, {
      archives,
      archive: inside.archive,
      inner: inside.inner,
    });
    await this.host.shell().openEdit(page, copy);
  }

  editedCopySaved(copy: string): void {
    const edited = this.editedCopies.get(copy);
    if (edited !== undefined) {
      this.putBack(edited.archives, edited.archive, edited.inner, copy);
    }
  }

  putBackOf(
    folder: string,
    name: string,
    copy: string,
  ):
    | {
        readonly archives: ArchiveAccess;
        readonly archive: OpenedArchive;
        readonly inner: readonly string[];
      }
    | undefined {
    const { archives } = this.access;
    const inside = archives?.within(folder);
    const parts = name.split(path.sep);
    const last = parts.at(-1) ?? name;
    const inner = [...(inside?.inner ?? []), ...parts.slice(0, -1)];
    return archives !== undefined &&
      inside !== undefined &&
      archives.unchangeable(inside.archive) === undefined &&
      path.basename(copy) === last &&
      inside.archive.tree.item(inner, last)?.path === [...inner, last].join('/')
      ? { archives, archive: inside.archive, inner }
      : undefined;
  }

  async watchCopy(
    {
      archives,
      archive,
      inner,
    }: {
      readonly archives: ArchiveAccess;
      readonly archive: OpenedArchive;
      readonly inner: readonly string[];
    },
    copy: string,
  ): Promise<void> {
    const stampNow = () =>
      fs.promises.stat(copy).then(
        (stats) => `${stats.size}:${stats.mtimeMs}`,
        () => undefined,
      );
    const name = [...inner, path.basename(copy)].join(path.sep);
    let stamp = await stampNow();
    let busy = false;
    let again = false;
    const changed = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        do {
          again = false;
          const now = await stampNow();
          if (now !== undefined && now !== stamp) {
            const update = await this.updateWanted(
              path.join(archive.file, name),
              archive.file,
            );
            stamp = (await stampNow()) ?? now;
            if (update) {
              this.putBack(archives, archive, inner, copy);
            }
          }
        } while (again);
      } finally {
        busy = false;
      }
    };
    this.copiesWatched.add({
      archive: archive.file,
      copy,
      stop: this.access.watch(path.dirname(copy), () => {
        void this.host.shell().track(changed());
      }),
    });
    this.letGoOfCopies();
  }

  letGoOfCopies(): void {
    const folders = this.sides.allPanes().map((pane) => pane.folder);
    for (const watched of this.copiesWatched) {
      const { archive, copy, stop } = watched;
      if (
        !folders.some(
          (folder) =>
            folder === archive || folder.startsWith(`${archive}${path.sep}`),
        )
      ) {
        stop();
        this.copiesWatched.delete(watched);
        void this.host
          .shell()
          .track(fs.promises.chmod(copy, 0o444).catch(() => undefined));
      }
    }
  }

  private updateWanted(name: string, archive: string): Promise<boolean> {
    return new Promise((answer) => {
      this.updatesAsked.set(++this.updateAsks, { name, archive, answer });
      if (this.updatesAsked.size === 1) {
        this.askNextUpdate();
      }
    });
  }

  askNextUpdate(): void {
    const [next] = this.updatesAsked;
    if (next === undefined) {
      this.updateAskedIn = undefined;
      return;
    }
    const page = this.pageToAsk();
    this.updateAskedIn = page;
    if (page !== undefined) {
      const [ask, { name, archive }] = next;
      post(page, { type: 'askUpdate', ask, name, archive });
    }
  }

  private pageToAsk(): Page | undefined {
    const asked = this.updateAskedIn;
    if (asked !== undefined && this.sides.shown.has(asked)) {
      return asked;
    }
    const focused = this.host.shell().page();
    if (focused !== undefined && this.sides.shown.has(focused)) {
      return focused;
    }
    return [...this.sides.shown.keys()].at(0);
  }

  answerUpdate(ask: unknown, update: unknown): void {
    if (typeof ask !== 'number' || typeof update !== 'boolean') {
      return;
    }
    const asked = this.updatesAsked.get(ask);
    if (asked === undefined) {
      return;
    }
    this.updatesAsked.delete(ask);
    asked.answer(update);
    this.askNextUpdate();
  }

  private putBack(
    archives: ArchiveAccess,
    archive: OpenedArchive,
    inner: readonly string[],
    copy: string,
  ): void {
    this.transfers.start(
      {
        plan: {
          sources: [archive.file],
          target: path.dirname(archive.file),
          move: false,
        },
        folder: path.join(archive.file, ...inner),
        names: [path.basename(copy)],
        archive: { job: 'update', file: archive.file },
      },
      archiveJob(path.basename(archive.file), (options) =>
        archives.addItems(
          archive,
          inner,
          path.dirname(copy),
          [path.basename(copy)],
          options,
        ),
      ),
    );
  }
}
