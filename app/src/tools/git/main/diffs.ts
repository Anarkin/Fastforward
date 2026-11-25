import { tabSizesOf } from './tabSizes';
import {
  compareFiles,
  comparePatch,
  showFiles,
  showPatch,
  commitPatch,
} from './diff';
import {
  comparePatchArgs,
  pathspecs,
  showPatchArgs,
  type PatchScope,
} from '../../../components/diff/main/args';
import { leftOutOf, readPatch, type ReadPatch } from './patchBudget';
import {
  newSideUnchanged,
  whitespaceOnlyChanges,
  withoutFilesInside,
} from './patchText';
import { readFile } from './files';
import { stashFiles, stashPatch } from './stashes';
import {
  workingTreeFiles,
  type WorkingTree,
  type WorkingTreeDiff,
} from './workingTree';
import { stagedPatch, workingTreePatch } from './workingTreePatch';
import {
  comparedOf,
  shownCommit,
  workingTreeSide,
} from '../../../lib/shared/comparisons';
import { isFullHash } from '../../../lib/shared/hashes';
import {
  workingTreeHash,
  type FileChange,
  type LeftOut,
  type ChangeArea,
} from '../shared/protocol';
import {
  includedChanges,
  leftOutChanges,
} from '../../../components/diff/shared/patchBudget';
import type { ShellAccess } from '../../../shell/main/toolContract';
import type { GitStorage } from './storage';
import { changesOf, pickable, stillThere } from './tabState';
import { type EarlyPatch, type Context, notInHistory } from './tabContext';
import type { TreePaths } from './treePaths';
import { decodedPatch, mayNeedDecoding } from './decodedPatch';
import { decodedHunks } from './decodedHunks';
import { blobOf, readObjects } from './objects';
import { maxFileSize, repositoryFile } from './files';
import { systemCodePage } from '../../../components/encodings/main/codePages';
import { fsPromises as fs } from '../../../lib/main/files';

export class Diffs {
  constructor(
    private readonly storage: GitStorage,
    private readonly shell: () => ShellAccess,
    private readonly treePaths: TreePaths,
    private readonly decodedCopies: string,
  ) {}

  private async decoded(
    context: Context,
    hash: string,
    patch: string,
    scope: Pick<PatchScope, 'entireFile' | 'ignoreWhitespace'>,
  ): Promise<string> {
    if (!mayNeedDecoding(patch)) {
      return patch;
    }
    const { gitPath, root } = context;
    const onDisk = workingTreeSide(hash) && context.tab.area !== 'staged';
    return decodedPatch(patch, {
      blobsOf: async (ids) => {
        const found = new Map<string, Buffer>();
        for (const read of await readObjects(gitPath, root, ids, maxFileSize)) {
          const blob = blobOf(read);
          if (blob?.kind === 'object') {
            found.set(blob.id, blob.content);
          }
        }
        return found;
      },
      fileOf: async (path) => {
        if (!onDisk) {
          return undefined;
        }
        const file = repositoryFile(root, path);
        const stats = await fs.stat(file).catch(() => undefined);
        return stats?.isFile() === true && stats.size <= maxFileSize
          ? fs.readFile(file)
          : undefined;
      },
      hunksOf: (old, changed) =>
        decodedHunks(gitPath, this.decodedCopies, old, changed, scope),
      codePage: await systemCodePage(process.platform),
    });
  }

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
    await this.sendTabSizes(
      context,
      hash,
      files.map((file) => file.path),
    );
  }

  private async sendTabSizes(
    context: Context,
    hash: string,
    paths: readonly string[],
  ): Promise<void> {
    const sizes = await tabSizesOf(context.root, paths).catch(() => ({}));
    if (Object.keys(sizes).length > 0 && context.tab.hash === hash) {
      context.post({ type: 'tabSizes', hash, sizes });
    }
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
    const { ignoreWhitespace } = this.storage.preferences;
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
    scope: PatchScope = {
      ignoreWhitespace: this.storage.preferences.ignoreWhitespace,
    },
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
          ignoreWhitespace: this.storage.preferences.ignoreWhitespace,
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
    const { ignoreWhitespace } = this.storage.preferences;
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
    patch = await this.decoded(context, hash, patch, {
      entireFile: scope.entireFile,
      ignoreWhitespace: ignoreWhitespace && !whitespaceOnly,
    });
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
      this.storage.preferences.showEntireFile
    );
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
    const patch = await this.decoded(context, hash, read.patch, {
      ignoreWhitespace: this.storage.preferences.ignoreWhitespace,
    });
    if (!signal.aborted) {
      context.post({ type: 'prefetchedDiff', hash, patch });
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
        early.ignoreWhitespace === this.storage.preferences.ignoreWhitespace
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
        commit === undefined &&
        !(await this.treePaths.inWorkingTree(context, file))
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
      await this.sendTabSizes(context, hash, [file]);
      return;
    }
    const { ignoreWhitespace } = this.storage.preferences;
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
          early?.ignoreWhitespace === this.storage.preferences.ignoreWhitespace
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
      patch = await this.decoded(context, hash, patch, {
        entireFile,
        ignoreWhitespace: ignoreWhitespace && whitespaceOnly.length === 0,
      });
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
