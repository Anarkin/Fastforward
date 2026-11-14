import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { strings } from '../../../../../lib/shared/strings';
import { ArchiveTree } from '../../../../../tools/commander/main/archiveTree';
import type {
  ArchiveAccess,
  ArchiveItem,
  OpenedArchive,
  PackPlan,
} from '../../../../../tools/commander/main/archives';

export function fakeArchives() {
  const archived = new Map<string, readonly ArchiveItem[] | string>();
  const openedArchives = new Map<string, OpenedArchive>();
  const archivesOf = new WeakMap<readonly ArchiveItem[], OpenedArchive>();
  const copies = { folder: '', refused: undefined as string | undefined };
  let extractions = 0;
  const opensHeld: { until: Promise<unknown> | undefined } = {
    until: undefined,
  };
  const extractsHeld: { until: Promise<unknown> | undefined } = {
    until: undefined,
  };
  const passwords = new Map<string, string>();
  const secrets = new Map<string, string>();
  const extracted: (readonly string[])[] = [];
  const packed: PackPlan[] = [];
  const removedFromArchives: (readonly [string, readonly string[]])[] = [];
  const changedInArchives: unknown[] = [];
  const tested: string[] = [];
  const archiveTests = new Map<string, string>();
  const passwordRight = (archive: string) =>
    !secrets.has(archive) || passwords.get(archive) === secrets.get(archive);
  const archives: ArchiveAccess = {
    usePassword: (archive, password) => {
      if (password === undefined) {
        passwords.delete(archive);
      } else {
        passwords.set(archive, password);
      }
    },
    hasPassword: (archive) => passwords.has(archive),
    pack: (plan) => {
      packed.push(plan);
      return Promise.resolve({ kind: 'packed' });
    },
    remove: (archive, paths) => {
      removedFromArchives.push([archive.file, paths]);
      return Promise.resolve({ kind: 'packed' });
    },
    rename: (archive, from, to) => {
      changedInArchives.push(['rename', archive.file, from, to]);
      return Promise.resolve({ kind: 'packed' });
    },
    addFolder: (archive, inner, name) => {
      changedInArchives.push(['folder', archive.file, inner, name]);
      return Promise.resolve({ kind: 'packed' });
    },
    unchangeable: (archive) =>
      archive.outer !== undefined || archive.source !== archive.file
        ? strings.commander.archiveUnchangeable(path.basename(archive.file))
        : undefined,
    test: (tried) => {
      tested.push(tried);
      const refused = archiveTests.get(tried);
      if (refused === 'locked') {
        return Promise.resolve(
          passwordRight(tried)
            ? { kind: 'packed' }
            : {
                kind: 'refused',
                reason: 'Wrong password',
                needsPassword: true,
              },
        );
      }
      return Promise.resolve(
        refused === undefined
          ? { kind: 'packed' }
          : { kind: 'refused', reason: refused },
      );
    },
    addItems: (archive, inner, from, items) => {
      changedInArchives.push(['add', archive.file, inner, from, items]);
      return Promise.resolve({ kind: 'packed' });
    },
    extract: async (archive, paths, options) => {
      extracted.push(paths);
      await extractsHeld.until;
      const into = options?.into;
      if (copies.refused !== undefined) {
        return { kind: 'refused', reason: copies.refused };
      }
      const items = archived.get(archive.file);
      if (
        typeof items !== 'string' &&
        items?.some(
          (item) =>
            item.encrypted &&
            paths.some(
              (each) => item.path === each || item.path.startsWith(`${each}/`),
            ),
        ) === true &&
        !passwordRight(archive.file)
      ) {
        return {
          kind: 'refused',
          reason: 'Wrong password',
          needsPassword: true,
        };
      }
      assert.notStrictEqual(copies.folder, '', 'a folder for the copies');
      const extractedInto =
        into ?? path.join(copies.folder, `work-${++extractions}`);
      for (const item of typeof items === 'string' ? [] : (items ?? [])) {
        if (
          paths.some(
            (asked) => item.path === asked || item.path.startsWith(`${asked}/`),
          )
        ) {
          const copy =
            options?.withoutFolders === true
              ? path.join(extractedInto, path.posix.basename(item.path))
              : path.join(extractedInto, ...item.path.split('/'));
          await fs.promises.mkdir(path.dirname(copy), { recursive: true });
          await fs.promises.writeFile(copy, `the ${item.path} of the archive`);
        }
      }
      return { kind: 'extracted', folder: extractedInto };
    },
    open: async (opening, signal) => {
      if (opensHeld.until !== undefined) {
        await Promise.race([
          opensHeld.until,
          new Promise((_resolve, reject) =>
            signal?.addEventListener('abort', () =>
              reject(new Error('The operation was aborted')),
            ),
          ),
        ]);
      }
      const known = openedArchives.get(opening);
      if (known?.outer !== undefined) {
        return { kind: 'opened', archive: known };
      }
      const items = archived.get(opening);
      if (
        typeof items !== 'string' &&
        items?.some((item) => item.encrypted) !== true &&
        !passwordRight(opening)
      ) {
        return {
          kind: 'refused',
          reason: 'Cannot open encrypted archive. Wrong password?',
          needsPassword: true,
        };
      }
      if (items === undefined) {
        return Promise.resolve({
          kind: 'refused',
          reason: 'Cannot open the file as archive',
          noArchive: true,
        });
      }
      if (typeof items === 'string') {
        return Promise.resolve({ kind: 'refused', reason: items });
      }
      const archive = archivesOf.get(items) ?? {
        file: opening,
        version: String(openedArchives.size),
        source: opening,
        tree: new ArchiveTree(items, 'linux'),
      };
      archivesOf.set(items, archive);
      openedArchives.set(opening, archive);
      return Promise.resolve({ kind: 'opened', archive });
    },
    openInside: async (inside, outer, _path, signal) => {
      const inner = await archives.open(inside, signal);
      if (inner.kind !== 'opened') {
        return inner;
      }
      const nested = {
        ...inner.archive,
        outer: { file: outer.file, version: outer.version },
      };
      openedArchives.set(inside, nested);
      return { kind: 'opened', archive: nested };
    },
    within: (inside) => {
      for (const [archiveFile, archive] of openedArchives
        .entries()
        .toArray()
        .toSorted(([one], [other]) => other.length - one.length)) {
        if (
          inside === archiveFile ||
          inside.startsWith(`${archiveFile}${path.sep}`)
        ) {
          return {
            archive,
            inner: path
              .relative(archiveFile, inside)
              .split(path.sep)
              .filter((part) => part !== ''),
          };
        }
      }
      return undefined;
    },
    fileHolding: (inside) =>
      Promise.resolve(
        [...archived.keys()].find(
          (archiveFile) =>
            inside === archiveFile ||
            inside.startsWith(`${archiveFile}${path.sep}`),
        ),
      ),
  };
  return {
    archives,
    archived,
    copies,
    opensHeld,
    extractsHeld,
    secrets,
    passwords,
    extracted,
    packed,
    removedFromArchives,
    changedInArchives,
    tested,
    archiveTests,
  };
}
