import * as fs from 'node:fs';
import * as path from 'node:path';
import { sentencesOf, strings, type Sentence } from '../../../shared/strings';
import type { Page, ShellAccess } from '../../../shell/main/shell';
import {
  otherSide,
  parentFolder,
  sides as bothSides,
  isDrop,
  type CommanderToHost,
  type Side,
} from '../shared/protocol';
import { folderKey } from '../shared/paths';
import { archiveJob, archiveTests } from './packing';
import { copiedBetween } from './betweenArchives';
import {
  firstVolumeOf,
  isPackFormat,
  isPackLevel,
  isZipCipher,
  packPasswordProblem,
  smallestVolume,
} from '../shared/packing';
import type {
  ArchiveAccess,
  ArchiveBranch,
  OpenedArchive,
  PackPlan,
} from './archives';
import { unpackingFirst } from './unpacking';
import { reasonOf } from './reasons';
import type { ConnectTransfer, TransferAsk, Transfers } from './transfers';
import { nameProblem } from '../shared/names';
import {
  type Pane,
  type ShownPane,
  type Sides,
  post,
  type Listing,
  listedIn,
  parentOf,
} from './sides';
import { archiveItems } from './archiveItems';
import type { ArchiveCopies } from './archiveCopies';

export interface TransferCommandsAccess {
  readonly archives?: ArchiveAccess;
  readonly platform: NodeJS.Platform;
  readonly remove?: (file: string) => Promise<void>;
  readonly connectTransfer: ConnectTransfer;
  readonly clipboardFiles?: {
    readonly read: () => Promise<readonly string[]>;
  };
}

export interface TransferCommandsHost {
  readonly shell: () => ShellAccess;
  readonly refuse: (page: Page, message: Sentence) => void;
  readonly list: (
    page: Page,
    tab: string,
    side: Side,
    folder: string,
    how: Listing,
    fallback?: string,
    selecting?: string,
  ) => Promise<void>;
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

export class TransferCommands {
  constructor(
    private readonly access: TransferCommandsAccess,
    private readonly sides: Sides,
    private readonly copies: ArchiveCopies,
    private readonly transfers: Transfers,
    private readonly host: TransferCommandsHost,
  ) {}

  dropped(page: Page, files: unknown, message: unknown): Promise<void> {
    const shown = isDrop(message)
      ? this.sides.diskPane(page, message.tab, message.side, message.folder)
      : undefined;
    if (
      shown === undefined ||
      !isDrop(message) ||
      !Array.isArray(files) ||
      files.length === 0 ||
      !files.every(
        (file: unknown) => typeof file === 'string' && path.isAbsolute(file),
      )
    ) {
      return Promise.resolve();
    }
    const { folder } = shown.pane;
    const { into, move } = message;
    const target =
      into === undefined
        ? folder
        : into === parentFolder
          ? parentOf(folder)
          : listedIn(shown.pane, into)?.folder === true
            ? path.join(folder, into)
            : undefined;
    if (target === undefined) {
      return Promise.resolve();
    }
    if (shown.pane.elevated === true) {
      this.host.refuse(page, strings.commander.transferAsAdministrator);
      return Promise.resolve();
    }
    const sources: readonly string[] = files;
    this.startTransfer(page, {
      plan: { sources, target, move },
      folder: path.dirname(sources[0]),
      names: sources.map((source) => path.basename(source)),
    });
    return Promise.resolve();
  }

  transfer(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
      target,
      move,
      existing,
    }: Extract<CommanderToHost, { type: 'transfer' }>,
  ): void {
    const shown = this.sides.namingPane(page, tab, side, folder);
    const other =
      shown && this.sides.panes.get(shown.tab)?.[otherSide(shown.side)];
    if (
      shown === undefined ||
      other === undefined ||
      other.folder !== target ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      typeof move !== 'boolean'
    ) {
      return;
    }
    if (shown.pane.elevated === true || other.elevated === true) {
      this.host.refuse(page, strings.commander.transferAsAdministrator);
      return;
    }
    if (other.archive !== undefined) {
      if (shown.pane.archive === undefined) {
        this.transferIn(page, shown, other, names, move, existing);
      } else {
        void this.host
          .shell()
          .track(
            this.transferBetween(page, shown, other, names, move, existing),
          );
      }
      return;
    }
    if (shown.pane.archive !== undefined) {
      void this.host
        .shell()
        .track(this.transferOut(page, shown.pane, target, names, move));
      return;
    }
    this.startTransfer(page, {
      plan: {
        sources: names.map((name) => path.join(shown.pane.folder, name)),
        target,
        move,
      },
      folder: shown.pane.folder,
      names,
    });
  }

  private transferIn(
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
      this.host.refuse(page, strings.commander.intoItself(into));
      return;
    }
    if (kept.length === 0 || !this.copies.changeable(page, archive)) {
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

  private async transferBetween(
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
    const resolved = (each: string) => key(path.resolve(each));
    if (
      sources.some((each) => resolved(path.dirname(each)) === resolved(target))
    ) {
      this.host.refuse(page, strings.commander.alreadyIn(target));
      return;
    }
    const intoItself = sources.find((each) => {
      const relative = path.relative(resolved(each), resolved(target));
      return (
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    });
    if (intoItself !== undefined) {
      this.host.refuse(
        page,
        strings.commander.intoItself(path.basename(intoItself)),
      );
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
      !this.copies.changeable(page, into.archive) ||
      (move && !this.copies.changeable(page, archive))
    ) {
      return;
    }
    if (
      encrypted &&
      !archives.hasPassword(archive.file) &&
      !(await this.copies.passwordGiven(page, archive.file, false))
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

  private async transferOut(
    page: Page,
    pane: Pane,
    target: string,
    names: readonly string[],
    move: boolean,
  ): Promise<void> {
    const found = archiveItems(this.access.archives, pane, names);
    if (
      found === undefined ||
      (move && !this.copies.changeable(page, found.archive))
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
      !(await this.copies.passwordGiven(page, archive.file, false))
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

  private startTransfer(page: Page, ask: TransferAsk): void {
    const { sources, target } = ask.plan;
    const key = (each: string) =>
      folderKey(path.resolve(each), this.access.platform);
    if (sources.some((source) => key(path.dirname(source)) === key(target))) {
      this.host.refuse(page, strings.commander.alreadyIn(target));
      return;
    }
    const intoItself = sources.find((source) => {
      const relative = path.relative(key(source), key(target));
      return (
        relative !== '..' &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
      );
    });
    if (intoItself !== undefined) {
      this.host.refuse(
        page,
        strings.commander.intoItself(path.basename(intoItself)),
      );
      return;
    }
    this.transfers.start(ask);
  }

  async paste(
    page: Page,
    { tab, side, folder }: Extract<CommanderToHost, { type: 'paste' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { clipboardFiles } = this.access;
    if (shown === undefined || clipboardFiles === undefined) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.refuse(page, strings.commander.transferAsAdministrator);
      return;
    }
    const sources = await clipboardFiles.read();
    const [first] = sources;
    if (first === undefined) {
      this.host.shell().notice(page, {
        level: 'info',
        message: strings.commander.nothingToPaste,
      });
      return;
    }
    this.startTransfer(page, {
      plan: { sources, target: shown.pane.folder, move: false },
      folder: path.dirname(first),
      names: sources.map((source) => path.basename(source)),
    });
  }

  testArchives(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
    }: Extract<CommanderToHost, { type: 'testArchives' }>,
  ): void {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { archives } = this.access;
    if (
      shown === undefined ||
      archives === undefined ||
      !Array.isArray(names) ||
      !names.every((name: unknown) => listedIn(shown.pane, name) !== undefined)
    ) {
      return;
    }
    const files = names.filter(
      (name: string) => listedIn(shown.pane, name)?.folder === false,
    );
    if (files.length === 0) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.refuse(page, strings.commander.testAsAdministrator);
      return;
    }
    const paths = files.map((name) => path.join(shown.pane.folder, name));
    this.transfers.start(
      {
        plan: { sources: paths, target: shown.pane.folder, move: false },
        folder: shown.pane.folder,
        names: files,
        archive: { job: 'test', file: paths[0] ?? '', at: shown.pane.folder },
      },
      archiveTests(paths, async (file, options) => {
        for (;;) {
          const tested = await archives.test(file, options);
          if (tested.kind !== 'refused' || tested.needsPassword !== true) {
            return tested;
          }
          if (
            !(await this.copies.passwordGiven(
              page,
              file,
              archives.hasPassword(file),
            ))
          ) {
            return {
              kind: 'refused',
              reason: strings.commander.noPasswordGiven,
            };
          }
        }
      }),
    );
  }

  async pack(
    page: Page,
    {
      tab,
      side,
      folder,
      names,
      archive,
      format,
      level,
      password,
      encryptNames,
      zipCipher,
      volumeBytes,
      test,
      replace,
    }: Extract<CommanderToHost, { type: 'pack' }>,
  ): Promise<void> {
    const shown = this.sides.diskPane(page, tab, side, folder);
    const { archives, platform } = this.access;
    if (
      shown === undefined ||
      archives === undefined ||
      !Array.isArray(names) ||
      names.length === 0 ||
      !names.every(
        (name: unknown) => listedIn(shown.pane, name) !== undefined,
      ) ||
      typeof archive !== 'string' ||
      !path.isAbsolute(archive) ||
      nameProblem(path.basename(archive), platform) !== undefined ||
      !isPackFormat(format) ||
      !isPackLevel(level) ||
      (password !== undefined &&
        (typeof password !== 'string' ||
          packPasswordProblem(password, format) !== undefined)) ||
      (encryptNames !== undefined && typeof encryptNames !== 'boolean') ||
      (zipCipher !== undefined && !isZipCipher(zipCipher)) ||
      (volumeBytes !== undefined &&
        (!Number.isSafeInteger(volumeBytes) || volumeBytes < smallestVolume)) ||
      (test !== undefined && typeof test !== 'boolean') ||
      (replace !== undefined && typeof replace !== 'boolean')
    ) {
      return;
    }
    if (shown.pane.elevated === true) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.packAsAdministrator,
      });
      return;
    }
    const key = (each: string) => folderKey(each, platform);
    const into = names.find((name) => {
      const item = key(path.join(shown.pane.folder, name));
      return (
        key(archive) === item || key(archive).startsWith(`${item}${path.sep}`)
      );
    });
    if (into !== undefined) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.intoItself(into),
      });
      return;
    }
    const first = volumeBytes === undefined ? archive : firstVolumeOf(archive);
    if (
      replace !== true &&
      (await fs.promises.lstat(first).then(
        () => true,
        () => false,
      ))
    ) {
      this.host.shell().notice(page, {
        level: 'error',
        message: strings.commander.archiveThereKept(archive),
      });
      return;
    }
    const plan: PackPlan = {
      folder: shown.pane.folder,
      items: names,
      archive,
      format,
      level,
      ...(password !== undefined && { password }),
      ...(encryptNames !== undefined && { encryptNames }),
      ...(zipCipher !== undefined && { zipCipher }),
      ...(volumeBytes !== undefined && { volumeBytes }),
      ...(test !== undefined && { test }),
    };
    this.transfers.start(
      {
        plan: {
          sources: [archive],
          target: path.dirname(archive),
          move: false,
        },
        folder: shown.pane.folder,
        names,
        archive: { job: 'pack', file: archive },
      },
      archiveJob(path.basename(archive), (options) =>
        archives.pack(plan, options),
      ),
    );
  }

  transferred(ask: TransferAsk): void {
    for (const [page, showing] of this.sides.shown) {
      this.transferredIn(page, showing.tab, ask);
    }
  }

  private transferredIn(
    page: Page,
    tab: string,
    { plan, folder, names, archive }: TransferAsk,
  ): void {
    const panes = this.sides.panes.get(tab);
    if (panes === undefined) {
      return;
    }
    const key = (each: string) => folderKey(each, this.access.platform);
    for (const side of archive === undefined ? [] : bothSides) {
      const pane = panes[side];
      const inside = this.access.archives?.within(pane.folder);
      if (
        archive === undefined ||
        inside === undefined ||
        key(inside.archive.file) !== key(archive.file)
      ) {
        continue;
      }
      if (pane.flat === undefined) {
        void this.host
          .shell()
          .track(
            this.host.list(
              page,
              tab,
              side,
              pane.folder,
              'show',
              undefined,
              key(pane.folder) === key(folder) ? archive.select : undefined,
            ),
          );
      } else {
        pane.flat.tree.changedAll();
      }
    }
    const changes = (each: string) =>
      (plan.move && key(each) === key(folder)) ||
      key(each) === key(plan.target);
    for (const side of bothSides) {
      const pane = panes[side];
      const { flat } = pane;
      if (!changes(pane.folder)) {
        continue;
      }
      if (flat === undefined) {
        void this.host
          .shell()
          .track(this.host.list(page, tab, side, pane.folder, 'show'));
        continue;
      }
      if (plan.move && key(pane.folder) === key(folder)) {
        for (const name of names) {
          flat.tree.changed(name);
        }
      }
      if (key(pane.folder) === key(plan.target)) {
        for (const source of plan.sources) {
          flat.tree.changed(path.basename(source));
        }
      }
    }
  }
}
