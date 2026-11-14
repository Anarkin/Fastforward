import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings, type Sentence } from '../../../lib/shared/strings';
import type { Page, ShellAccess } from '../../../shell/main/shell';
import { folderKey } from '../shared/paths';
import type { WatchFolder } from './watch';
import { archiveJob } from './packing';
import type { ArchiveJob } from '../shared/transfers';
import type { Editing } from './editing';
import type { Transfers } from './transfers';
import { nameProblem } from '../shared/names';
import { type Pane, type ShownPane, type Sides, post, listedIn } from './sides';
import { archiveItems } from './archiveItems';
import { itemsAt } from './archiveFiles';
import type {
  ArchiveAccess,
  OpenedArchive,
  PackOptions,
  Packing,
} from './archives';

export interface ArchiveCopiesAccess {
  readonly archives?: ArchiveAccess;
  readonly viewedCopies?: string;
  readonly watch: WatchFolder;
  readonly platform: NodeJS.Platform;
}

export interface ArchiveCopiesHost {
  readonly shell: () => ShellAccess;
  readonly refuse: (page: Page, message: Sentence) => void;
  readonly saveQuietly: (saving: Promise<void>) => void;
}

export class ArchiveCopies {
  private passwordAsks = 0;
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
      readonly name: string;
    }
  >();
  private readonly passwordsAsked = new Map<
    number,
    {
      readonly page: Page;
      readonly answer: (password: string | undefined) => void;
    }
  >();
  private updateAskedIn: Page | undefined;

  constructor(
    private readonly access: ArchiveCopiesAccess,
    private readonly sides: Sides,
    private readonly editing: Editing,
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
          open.view === true &&
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
      !(await this.passwordGiven(page, archive.file, false))
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
        !(await this.passwordGiven(
          page,
          archive.file,
          archives.hasPassword(archive.file),
        ))
      ) {
        return undefined;
      }
    }
  }

  async passwordGiven(
    page: Page,
    file: string,
    wrong: boolean,
  ): Promise<boolean> {
    const { archives } = this.access;
    if (archives === undefined) {
      return false;
    }
    archives.usePassword(file, undefined);
    this.cancelPasswords(page);
    const ask = ++this.passwordAsks;
    const password = await new Promise<string | undefined>((resolve) => {
      this.passwordsAsked.set(ask, { page, answer: resolve });
      post(page, {
        type: 'askPassword',
        ask,
        name: path.basename(file),
        wrong,
      });
    });
    if (password === undefined) {
      return false;
    }
    archives.usePassword(file, password);
    return true;
  }

  cancelPasswords(of: Page): void {
    for (const [ask, { page, answer }] of this.passwordsAsked) {
      if (page === of || page.disposed) {
        this.passwordsAsked.delete(ask);
        answer(undefined);
      }
    }
  }

  answerPassword(ask: unknown, password: unknown): void {
    if (
      typeof ask !== 'number' ||
      (password !== undefined && typeof password !== 'string')
    ) {
      return;
    }
    const asked = this.passwordsAsked.get(ask);
    if (asked !== undefined) {
      this.passwordsAsked.delete(ask);
      asked.answer(password);
    }
  }

  async editInArchive(
    page: Page,
    shown: ShownPane,
    name: string,
  ): Promise<void> {
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
    const refusal = await this.editing.refusal(copy, name);
    if (refusal !== undefined) {
      this.host.shell().notice(page, { level: 'error', message: refusal });
      return;
    }
    const putBack = this.putBackOf(shown.pane.folder, name, copy);
    if (putBack !== undefined) {
      this.editedCopies.set(copy, { ...putBack, name });
    }
    await this.host.shell().openEdit(page, 'commander', copy);
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
      name,
    });
    await this.host.shell().openEdit(page, 'commander', copy);
  }

  editedCopySaved(copy: string): void {
    const edited = this.editedCopies.get(copy);
    if (edited !== undefined) {
      this.putBack(
        edited.archives,
        edited.archive,
        edited.inner,
        copy,
        edited.name,
      );
    }
  }

  deleteInArchive(page: Page, shown: ShownPane, names: unknown): void {
    const { pane } = shown;
    if (
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every((name: unknown) => listedIn(pane, name) !== undefined)
    ) {
      return;
    }
    const found = archiveItems(this.access.archives, pane, names);
    if (found === undefined) {
      return;
    }
    const { archives, archive, paths } = found;
    if (this.changeable(page, archive)) {
      this.archiveChange(shown, archive, names, 'delete', (options) =>
        archives.remove(archive, paths, options),
      );
    }
  }

  changeable(page: Page, archive: OpenedArchive): boolean {
    const refusal = this.access.archives?.unchangeable(archive);
    if (refusal === undefined) {
      return true;
    }
    this.host.refuse(page, refusal);
    return false;
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
              name,
              path.basename(archive.file),
            );
            stamp = (await stampNow()) ?? now;
            if (update) {
              this.putBack(archives, archive, inner, copy, name);
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
    name: string,
  ): void {
    this.transfers.start(
      {
        plan: {
          sources: [archive.file],
          target: path.dirname(archive.file),
          move: false,
        },
        folder: path.join(archive.file, ...inner),
        names: [name],
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

  private takenIn(
    page: Page,
    archive: OpenedArchive,
    inner: readonly string[],
    name: string,
    except?: string,
  ): boolean {
    const key = (each: string) => folderKey(each, this.access.platform);
    const taken =
      archive.tree
        .entries(inner)
        ?.some(
          (entry) =>
            key(entry.name) === key(name) &&
            (except === undefined || key(entry.name) !== key(except)),
        ) === true;
    if (taken) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.nameTaken(name),
      });
    }
    return taken;
  }

  private archiveChange(
    shown: ShownPane,
    archive: OpenedArchive,
    names: readonly string[],
    job: ArchiveJob,
    run: (options: PackOptions) => Promise<Packing>,
    select?: string,
  ): void {
    this.transfers.start(
      {
        plan: {
          sources: [archive.file],
          target: path.dirname(archive.file),
          move: false,
        },
        folder: shown.pane.folder,
        names,
        archive: {
          job,
          file: archive.file,
          ...(select !== undefined &&
            shown.pane.flat === undefined && { select }),
        },
      },
      archiveJob(path.basename(archive.file), run),
    );
  }

  renameInArchive(
    page: Page,
    shown: ShownPane,
    name: unknown,
    to: unknown,
  ): void {
    const { pane } = shown;
    if (
      typeof name !== 'string' ||
      listedIn(pane, name) === undefined ||
      typeof to !== 'string' ||
      to !== path.basename(to) ||
      nameProblem(to, this.access.platform) !== undefined
    ) {
      return;
    }
    const found = archiveItems(this.access.archives, pane, [name]);
    const [from] = found?.paths ?? [];
    if (found === undefined || from === undefined) {
      return;
    }
    const { archives, archive } = found;
    const parts = name.split(path.sep);
    const inner = [...found.inner, ...parts.slice(0, -1)];
    if (
      !this.changeable(page, archive) ||
      this.takenIn(page, archive, inner, to, parts.at(-1))
    ) {
      return;
    }
    const slash = from.lastIndexOf('/');
    const renamed = slash < 0 ? to : `${from.slice(0, slash)}/${to}`;
    this.archiveChange(
      shown,
      archive,
      [name],
      'rename',
      (options) => archives.rename(archive, from, renamed, options),
      to,
    );
  }

  folderInArchive(page: Page, shown: ShownPane, name: unknown): void {
    const { archives } = this.access;
    const inside = archives?.within(shown.pane.folder);
    if (
      archives === undefined ||
      inside === undefined ||
      typeof name !== 'string' ||
      name !== path.basename(name) ||
      nameProblem(name, this.access.platform) !== undefined
    ) {
      return;
    }
    const { archive, inner } = inside;
    if (
      !this.changeable(page, archive) ||
      this.takenIn(page, archive, inner, name)
    ) {
      return;
    }
    this.archiveChange(
      shown,
      archive,
      [name],
      'folder',
      (options) => archives.addFolder(archive, inner, name, options),
      name,
    );
  }
}
