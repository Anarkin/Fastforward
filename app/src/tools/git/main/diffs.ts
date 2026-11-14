import {
  compareFiles,
  comparePatch,
  comparePatchArgs,
  leftOutOf,
  newSideUnchanged,
  pathspecs,
  readPatch,
  showFiles,
  showPatch,
  showPatchArgs,
  commitPatch,
  whitespaceOnlyChanges,
  withoutFilesInside,
  type PatchScope,
  type ReadPatch,
} from './diff';
import { BlobTexts } from './blobTexts';
import { listIndex, listTree, readBlobs, readFile, uniquePaths } from './files';
import { stashFiles, stashPatch } from './stashes';
import {
  stagedPatch,
  workingTreeFiles,
  workingTreePatch,
  type WorkingTree,
  type WorkingTreeDiff,
} from './workingTree';
import { comparedOf, workingTreeSide } from '../shared/comparisons';
import { isFullHash } from '../shared/hashes';
import {
  includedChanges,
  leftOutChanges,
  workingTreeHash,
  type FileChange,
  type LeftOut,
  type TabMessage,
  type TextRequest,
  type ChangeArea,
} from '../shared/protocol';
import type { ShellAccess } from '../../../shell/main/shell';
import type { GitStorage } from './storage';
import { changesOf, pickable, stillThere } from './tabState';
import {
  type EarlyPatch,
  type Context,
  notInHistory,
  shownCommit,
  uniqueTexts,
} from './tabContext';

export class Diffs {
  private readonly blobTexts = new BlobTexts();

  constructor(
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
  ) {}

  async sendCommit(
    context: Context,
    knownWorkingTree?: WorkingTree,
  ): Promise<void> {
    const { tab } = context;
    const { hash } = tab;
    if (!hash) {
      return;
    }
    const refreshing = knownWorkingTree !== undefined;
    if (!refreshing) {
      tab.loadingFiles.abort();
      tab.loadingDiff.abort();
      tab.loadingFiles = new AbortController();
    }
    const { signal } = tab.loadingFiles;
    let files: readonly FileChange[];
    let staged: readonly FileChange[] | undefined;
    let all: readonly FileChange[] | undefined;
    let workingTree: WorkingTree | undefined;
    let early: EarlyPatch | undefined;
    try {
      if (!stillThere(tab)(hash)) {
        notInHistory(context, hash);
        return;
      }
      if (workingTreeSide(hash)) {
        workingTree =
          (hash === workingTreeHash ? knownWorkingTree : undefined) ??
          (await workingTreeFiles(
            context.gitPath,
            context.root,
            workingTreeDiffOf(hash),
            signal,
            knownWorkingTree?.listedUntracked,
          ));
        files = workingTree.files;
        staged = workingTree.staged;
        all = workingTree.all?.files;
      } else {
        early = this.earlyPatch(context, hash, signal);
        files = await this.commitFiles(context, hash, signal);
      }
    } catch (error) {
      early?.loading.abort();
      if (signal.aborted) {
        return;
      }
      throw error;
    }
    if (tab.hash !== hash || signal.aborted) {
      early?.loading.abort();
      return;
    }
    context.tab.changedFiles = new Map(files.map((file) => [file.path, file]));
    context.tab.stagedFiles = new Map(
      (staged ?? []).map((file) => [file.path, file]),
    );
    context.tab.allFiles =
      all === undefined
        ? undefined
        : new Map(all.map((file) => [file.path, file]));
    if (workingTree) {
      context.tab.workingTree = workingTree;
    }
    const shownFiles = context.tab.shown.files;
    const unchanged =
      shownFiles?.hash === hash &&
      JSON.stringify([shownFiles.files, shownFiles.staged, shownFiles.all]) ===
        JSON.stringify([files, staged, all]);
    if (!(refreshing && unchanged)) {
      context.post({
        type: 'files',
        hash,
        files,
        ...(staged === undefined ? {} : { staged }),
        ...(all === undefined ? {} : { all }),
      });
    }
    await this.sendDiff(context, hash, refreshing, early);
  }

  private earlyPatch(
    context: Context,
    hash: string,
    signal: AbortSignal,
  ): EarlyPatch | undefined {
    if (context.tab.path !== undefined) {
      return undefined;
    }
    const loading = new AbortController();
    const { ignoreWhitespace } = this.storage;
    const patch = this.budgetedPatch(
      context,
      hash,
      AbortSignal.any([signal, loading.signal]),
      { ignoreWhitespace },
    ).catch(() => undefined);
    return { patch, loading, ignoreWhitespace };
  }

  private budgetedPatch(
    context: Context,
    hash: string,
    signal: AbortSignal,
    scope: PatchScope = { ignoreWhitespace: this.storage.ignoreWhitespace },
  ): Promise<ReadPatch> {
    const compared = comparedOf(hash);
    const stash = context.tab.stashes.get(hash);
    if (
      compared === undefined &&
      stash === undefined &&
      pathspecs(scope).length === 0
    ) {
      return commitPatch(context.gitPath, context.root, hash, scope, signal);
    }
    const commands = compared
      ? [comparePatchArgs(compared.from, compared.to, scope)]
      : stash
        ? [
            showPatchArgs(stash.commit, scope),
            ...(stash.untracked === undefined
              ? []
              : [showPatchArgs(stash.untracked, scope)]),
          ]
        : [showPatchArgs(hash, scope)];
    return readPatch(
      context.gitPath,
      context.root,
      commands.map((args) => [...args, ...pathspecs(scope)]),
      signal,
    );
  }

  private async budgetedFilePatch(
    context: Context,
    hash: string,
    change: FileChange,
    scope: PatchScope,
    signal: AbortSignal,
  ): Promise<{ patch: string; leftOut: readonly LeftOut[] | undefined }> {
    const read = await this.budgetedPatch(context, hash, signal, scope);
    void this.shell().track(read.exited);
    const leftOut = leftOutOf(read, [change]);
    return {
      patch: withoutFilesInside(read.patch, scope),
      leftOut: leftOut.length === 0 ? undefined : leftOut,
    };
  }

  private async wholePatch(
    context: Context,
    hash: string,
    files: readonly FileChange[],
    early: Promise<ReadPatch | undefined> | undefined,
    signal: AbortSignal,
  ): Promise<{ patch: string; leftOut: readonly LeftOut[] }> {
    if (workingTreeSide(hash)) {
      const patch = await this.patchOf(
        context,
        hash,
        {
          include: includedChanges(files),
          ignoreWhitespace: this.storage.ignoreWhitespace,
        },
        signal,
      );
      return { patch, leftOut: leftOutChanges(files) };
    }
    const read =
      (await early) ?? (await this.budgetedPatch(context, hash, signal));
    void this.shell().track(read.exited);
    return { patch: read.patch, leftOut: leftOutOf(read, files) };
  }

  private commitFiles(
    context: Context,
    hash: string,
    signal: AbortSignal,
  ): Promise<FileChange[]> {
    const compared = comparedOf(hash);
    const stash = context.tab.stashes.get(hash);
    return compared
      ? compareFiles(
          context.gitPath,
          context.root,
          compared.from,
          compared.to,
          signal,
        )
      : stash
        ? stashFiles(context.gitPath, context.root, stash, signal)
        : showFiles(context.gitPath, context.root, hash, signal);
  }

  async sendFileDiff(
    context: Context,
    hash: string,
    file: string,
    diff: number,
    shownPatch?: string,
  ): Promise<void> {
    const change = changesOf(context.tab).get(file);
    const { ignoreWhitespace } = this.storage;
    const scope = {
      path: file,
      oldPath: change?.oldPath,
      entireFile: this.showsEntire(context, file),
    };
    let patch = await this.patchOf(context, hash, {
      ...scope,
      ignoreWhitespace,
    });
    const whitespaceOnly =
      ignoreWhitespace &&
      change !== undefined &&
      whitespaceOnlyChanges(patch, [change]).length > 0;
    if (scope.entireFile && whitespaceOnly) {
      patch = newSideUnchanged(await this.patchOf(context, hash, scope));
    }
    if (context.tab.hash === hash && patch !== shownPatch) {
      context.post({
        type: 'fileDiff',
        hash,
        path: file,
        patch,
        diff,
        ...(whitespaceOnly ? { whitespaceOnly } : {}),
      });
    }
  }

  private showsEntire(context: Context, file: string | undefined): boolean {
    return (
      file !== undefined &&
      file === context.tab.path &&
      this.storage.showEntireFile
    );
  }

  async sendTexts(
    context: Context,
    { hash, diff, texts: asked }: Extract<TabMessage, { type: 'loadTexts' }>,
  ): Promise<void> {
    const { gitPath, root } = context;
    const texts = uniqueTexts(asked);
    const fromDisk = (request: TextRequest) =>
      context.tab.area !== 'staged' && request.side === workingTreeSide(hash);
    const blobs = await this.blobTexts.read(
      texts
        .filter((request) => !fromDisk(request) && isFullHash(request.blob))
        .map(({ blob }) => blob),
      (ids) => readBlobs(gitPath, root, ids),
    );
    const read = await Promise.all(
      texts.map(async (request) => {
        if (!fromDisk(request)) {
          return {
            ...request,
            text: isFullHash(request.blob)
              ? blobs.get(request.blob)
              : undefined,
          };
        }
        const onDisk =
          (request.side === 'old'
            ? changesOf(context.tab).get(request.path)?.oldPath
            : undefined) ?? request.path;
        if (!(await this.inWorkingTree(context, onDisk))) {
          return { ...request, text: undefined };
        }
        const file = await readFile(gitPath, root, undefined, onDisk);
        return { ...request, text: file.binary ? undefined : file.content };
      }),
    );
    if (context.tab.hash === hash) {
      context.post({ type: 'texts', hash, diff, texts: read });
    }
  }

  async prefetchDiff(context: Context, hash: string): Promise<void> {
    const { tab } = context;
    if (
      tab.path !== undefined ||
      !isFullHash(hash) ||
      workingTreeSide(hash) ||
      comparedOf(hash) !== undefined ||
      tab.stashes.has(hash) ||
      !pickable(tab, hash)
    ) {
      return;
    }
    tab.prefetching?.controller.abort();
    const prefetching = { hash, controller: new AbortController() };
    tab.prefetching = prefetching;
    const { signal } = prefetching.controller;
    let read: ReadPatch;
    try {
      read = await this.budgetedPatch(context, hash, signal);
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      throw error;
    }
    void this.shell().track(read.exited);
    if (!signal.aborted) {
      context.post({ type: 'prefetchedDiff', hash, patch: read.patch });
    }
  }

  async prefetchTexts(
    context: Context,
    hash: string,
    asked: readonly TextRequest[],
  ): Promise<void> {
    const { gitPath, root } = context;
    const texts = uniqueTexts(asked).filter(({ blob }) => isFullHash(blob));
    const blobs = await this.blobTexts.read(
      texts.map(({ blob }) => blob),
      (ids) => readBlobs(gitPath, root, ids),
    );
    const { prefetching } = context.tab;
    if (prefetching?.hash === hash && !prefetching.controller.signal.aborted) {
      context.post({
        type: 'prefetchedTexts',
        hash,
        texts: texts.map((request) => ({
          ...request,
          text: blobs.get(request.blob),
        })),
      });
    }
  }

  private async patchOf(
    context: Context,
    hash: string,
    scope: PatchScope,
    signal?: AbortSignal,
  ): Promise<string> {
    const { gitPath, root } = context;
    if (!workingTreeSide(hash)) {
      const compared = comparedOf(hash);
      const stash = context.tab.stashes.get(hash);
      return compared
        ? comparePatch(gitPath, root, compared.from, compared.to, scope, signal)
        : stash
          ? stashPatch(gitPath, root, stash, scope, signal)
          : showPatch(gitPath, root, hash, scope, signal);
    }
    if (context.tab.area === 'staged') {
      return stagedPatch(gitPath, root, scope, signal);
    }
    const workingTree =
      context.tab.workingTree ??
      (await workingTreeFiles(gitPath, root, workingTreeDiffOf(hash), signal));
    return workingTreePatch(
      gitPath,
      root,
      (context.tab.area === undefined ? workingTree.all : undefined) ??
        workingTree,
      scope,
      context.tab.untrackedPatches,
      signal,
    );
  }

  private async inWorkingTree(
    context: Context,
    file: string,
  ): Promise<boolean> {
    const { tab } = context;
    if (
      [tab.changedFiles, tab.stagedFiles].some((changes) =>
        [...changes.values()].some(
          (change) => change.path === file || change.oldPath === file,
        ),
      ) ||
      tab.workingTree?.untracked.includes(file)
    ) {
      return true;
    }
    tab.indexPaths ??= await listIndex(context.gitPath, context.root);
    return tab.indexPaths.includes(file);
  }

  async sendTree(
    context: Context,
    hash: string,
    refreshed?: WorkingTree,
  ): Promise<void> {
    const { gitPath, root } = context;
    const commit = shownCommit(hash);
    let paths: string[];
    if (refreshed === undefined || commit !== undefined) {
      paths = await listTree(gitPath, root, commit);
    } else {
      context.tab.indexPaths ??= await listIndex(gitPath, root);
      paths = uniquePaths(refreshed.untracked, context.tab.indexPaths);
    }
    if (context.tab.hash !== hash) {
      return;
    }
    const shown = context.tab.shown.tree;
    const unchanged =
      refreshed !== undefined &&
      shown?.hash === hash &&
      shown.paths.length === paths.length &&
      shown.paths.every((file, index) => file === paths[index]);
    if (!unchanged) {
      context.post({ type: 'tree', hash, paths });
    }
  }

  async sendDiff(
    context: Context,
    hash: string,
    refreshing = false,
    early?: EarlyPatch,
  ): Promise<void> {
    const { tab } = context;
    const { path: file, area } = tab;
    const request = ++tab.diffRequest;
    if (!refreshing) {
      tab.diffOwed = true;
    }
    tab.loadingDiff.abort();
    const loading = new AbortController();
    tab.loadingDiff = loading;
    if (early) {
      if (
        file === undefined &&
        early.ignoreWhitespace === this.storage.ignoreWhitespace
      ) {
        loading.signal.addEventListener('abort', () => early.loading.abort(), {
          once: true,
        });
      } else {
        early.loading.abort();
      }
    }
    const stale = () =>
      tab.diffRequest !== request ||
      tab.hash !== hash ||
      tab.path !== file ||
      tab.area !== area;
    const changes = changesOf(tab);
    const change = file === undefined ? undefined : changes.get(file);
    if (file !== undefined && !change) {
      const commit = shownCommit(hash);
      const { content, binary, id, link } =
        commit === undefined && !(await this.inWorkingTree(context, file))
          ? { content: '', binary: false, id: undefined, link: undefined }
          : await readFile(context.gitPath, context.root, commit, file);
      const shownDiff = context.tab.shown.diff;
      const unchanged =
        !tab.diffOwed &&
        shownDiff?.type === 'fileContent' &&
        shownDiff.hash === hash &&
        shownDiff.path === file &&
        shownDiff.area === area &&
        shownDiff.content === content &&
        shownDiff.binary === binary &&
        shownDiff.id === id &&
        shownDiff.link === link;
      if (!stale() && !unchanged) {
        tab.diffOwed = false;
        context.post({
          type: 'fileContent',
          hash,
          path: file,
          ...areaOf(area),
          content,
          binary,
          ...(id === undefined ? {} : { id }),
          ...(link ? { link } : {}),
        });
      }
      return;
    }
    const { ignoreWhitespace } = this.storage;
    let patch: string;
    let leftOut: readonly LeftOut[] | undefined;
    let whitespaceOnly: string[] = [];
    try {
      const scope = { path: file, oldPath: change?.oldPath };
      const entireFile = this.showsEntire(context, file);
      const selectedLeftOut = change ? leftOutWhenSelected(change) : [];
      if (file === undefined) {
        ({ patch, leftOut } = await this.wholePatch(
          context,
          hash,
          [...changes.values()],
          early?.ignoreWhitespace === this.storage.ignoreWhitespace
            ? early.patch
            : undefined,
          loading.signal,
        ));
      } else if (selectedLeftOut.length > 0) {
        patch = '';
        leftOut = selectedLeftOut;
      } else if (change && !workingTreeSide(hash)) {
        ({ patch, leftOut } = await this.budgetedFilePatch(
          context,
          hash,
          change,
          { ...scope, entireFile, ignoreWhitespace },
          loading.signal,
        ));
      } else {
        patch = await this.patchOf(
          context,
          hash,
          { ...scope, entireFile, ignoreWhitespace },
          loading.signal,
        );
      }
      if (ignoreWhitespace) {
        const deferred = new Set(leftOut?.map((out) => out.path));
        whitespaceOnly = whitespaceOnlyChanges(
          patch,
          (change ? [change] : [...changes.values()]).filter(
            (shown) => !deferred.has(shown.path),
          ),
        );
      }
      if (entireFile && whitespaceOnly.length > 0) {
        patch = newSideUnchanged(
          await this.patchOf(
            context,
            hash,
            { ...scope, entireFile },
            loading.signal,
          ),
        );
      }
    } catch (error) {
      if (loading.signal.aborted) {
        return;
      }
      throw error;
    }
    const shownDiff = context.tab.shown.diff;
    const unchanged =
      !tab.diffOwed &&
      shownDiff?.type === 'diff' &&
      shownDiff.hash === hash &&
      shownDiff.path === file &&
      shownDiff.area === area &&
      shownDiff.patch === patch &&
      JSON.stringify(shownDiff.leftOut) === JSON.stringify(leftOut) &&
      JSON.stringify(shownDiff.whitespaceOnly ?? []) ===
        JSON.stringify(whitespaceOnly);
    if (stale()) {
      return;
    }
    if (!unchanged) {
      tab.diffOwed = false;
      context.post({
        type: 'diff',
        hash,
        path: file,
        ...areaOf(area),
        patch,
        ...(leftOut === undefined ? {} : { leftOut }),
        ...(whitespaceOnly.length === 0 ? {} : { whitespaceOnly }),
      });
    } else {
      await this.sendFileDiffsAgain(context, hash);
    }
  }

  private async sendFileDiffsAgain(
    context: Context,
    hash: string,
  ): Promise<void> {
    const { shown } = context.tab;
    const changes = changesOf(context.tab);
    await Promise.all(
      [...(shown.fileDiffs?.values() ?? [])]
        .filter((sent) => sent.hash === hash && changes.has(sent.path))
        .map((sent) =>
          this.sendFileDiff(context, hash, sent.path, sent.diff, sent.patch),
        ),
    );
  }
}

function leftOutWhenSelected(change: FileChange): LeftOut[] {
  const measured = !change.uncounted || change.bytes !== undefined;
  return measured ? leftOutChanges([change]) : [];
}

function workingTreeDiffOf(hash: string): WorkingTreeDiff | undefined {
  const compared = comparedOf(hash);
  if (!compared) {
    return undefined;
  }
  return compared.to === workingTreeHash
    ? { base: compared.from, reverse: false }
    : { base: compared.to, reverse: true };
}

function areaOf(area: ChangeArea | undefined): { area?: ChangeArea } {
  return area === undefined ? {} : { area };
}
