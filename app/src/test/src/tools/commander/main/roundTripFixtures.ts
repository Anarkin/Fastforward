import { createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  sevenZipAt,
  sevenZipProgram,
  sevenZipReader,
} from '../../../../../tools/commander/main/sevenZip';
import type { ClashReply } from '../../../../../tools/commander/main/transfer';
import type { ConnectTransfer } from '../../../../../tools/commander/main/transfers';
import { transferServer } from '../../../../../tools/commander/main/transferServer';

const appFolder = path.join(__dirname, '..', '..', '..', '..', '..', '..');

export const reader = sevenZipReader(
  sevenZipAt(
    sevenZipProgram({
      packaged: false,
      resourcesPath: '',
      appPath: appFolder,
      platform: process.platform,
      arch: process.arch,
    }),
  ),
);

export const old = new Date(Date.UTC(2001, 1, 3, 4, 5, 6));

export const byText = (one: string, other: string) =>
  one.localeCompare(other, 'en');

export function made(
  root: string,
  relative: string,
  content: string | Buffer,
): void {
  const file = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function madeTree(root: string): void {
  made(root, 'docs/readme.md', 'A line of the readme.\n'.repeat(2000));
  made(root, 'docs/deep/deeper/notes.txt', 'Notes deep down.\n');
  fs.mkdirSync(path.join(root, 'empty-folder'), { recursive: true });
  made(root, 'empty.txt', '');
  made(root, 'random.bin', randomBytes(1024 * 1024));
  made(root, 'ünïcödé – 名前.txt', 'A name beyond ASCII.\n');
  made(root, 'with space and.dots.v2.txt', 'Spaces and dots.\n');
  made(root, '.dot-file', 'Named with a leading dot.\n');
  made(root, 'old.txt', 'Old.\n');
  fs.utimesSync(path.join(root, 'old.txt'), old, old);
  made(root, 'read-only.txt', 'Read only.\n');
  fs.chmodSync(path.join(root, 'read-only.txt'), 0o444);
}

export const rootItems = [
  '.dot-file',
  'docs',
  'empty-folder',
  'empty.txt',
  'old.txt',
  'random.bin',
  'read-only.txt',
  'with space and.dots.v2.txt',
  'ünïcödé – 名前.txt',
];

export function treeOf(root: string): Map<string, string> {
  const tree = new Map<string, string>();
  const walk = (folder: string, under: string) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const relative = `${under}${entry.name}`;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        tree.set(relative, 'folder');
        walk(file, `${relative}/`);
      } else {
        const content = fs.readFileSync(file);
        const seconds = Math.floor(fs.statSync(file).mtimeMs / 1000);
        tree.set(
          relative,
          `${content.length} ${createHash('sha256').update(content).digest('hex')} ${seconds}`,
        );
      }
    }
  };
  walk(root, '');
  return new Map([...tree].toSorted(([one], [other]) => byText(one, other)));
}

export function writable(root: string): void {
  if (!fs.existsSync(root)) {
    return;
  }
  for (const entry of fs.readdirSync(root, {
    recursive: true,
    encoding: 'utf8',
  })) {
    fs.chmodSync(path.join(root, entry), 0o777);
  }
}

export const withoutDates = (tree: Map<string, string>) =>
  new Map([...tree].map(([name, kind]) => [name, kind.replace(/ \d+$/, '')]));

export const inProcess =
  (answers: ClashReply[]): ConnectTransfer =>
  (listener) => {
    const receive = transferServer((event) => {
      if (event.type === 'clash') {
        setImmediate(() =>
          receive({
            type: 'answer',
            reply: answers.shift() ?? { answer: 'stop', all: false },
          }),
        );
      }
      listener.event(event);
    });
    return { send: receive, dispose: () => undefined };
  };

export const only = (
  tree: Map<string, string>,
  kept: (name: string) => boolean,
) => new Map([...tree].filter(([name]) => kept(name)));

const underDocs = (name: string) => name === 'docs' || name.startsWith('docs/');

export const docsOrOld = (name: string) =>
  underDocs(name) || name === 'old.txt';

export const deepOrOld = (name: string) =>
  name.startsWith('docs/deep') || name === 'old.txt';

export const sortedTree = (tree: Map<string, string>) =>
  new Map([...tree].toSorted(([one], [other]) => byText(one, other)));
