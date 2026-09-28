import type { CommitInfo, FileChange } from '../shared/protocol';
import type { CardCommit } from '../webview/commitCard';

// What the tests build their data from, and read markup with; without
// vscode, so the unit tests can use it outside VS Code

// A commit whose subject and message are its hash
export const commitInfo = (
  hash: string,
  extra: Partial<CommitInfo> = {},
): CommitInfo => ({
  hash,
  subject: hash,
  message: hash,
  parents: [],
  authorName: 'Test',
  authorEmail: 'test@example.com',
  authorDate: 0,
  committerName: 'Test',
  committerEmail: 'test@example.com',
  commitDate: 0,
  files: 1,
  ...extra,
});

// A modified file with one line added and two removed
export const fileChange = (
  path: string,
  extra: Partial<FileChange> = {},
): FileChange => ({
  path,
  oldPath: undefined,
  status: 'M',
  insertions: 1,
  deletions: 2,
  ...extra,
});

// A commit as the address bar's peek shows it, by one author, committed by
// them at the same time
export const cardCommit = (extra: Partial<CardCommit> = {}): CardCommit => ({
  hash: 'a'.repeat(40),
  subject: 'only',
  message: 'only',
  authorName: 'A',
  authorEmail: 'a@example.com',
  authorDate: 0,
  committerName: 'A',
  committerEmail: 'a@example.com',
  commitDate: 0,
  refs: [],
  detachedHead: false,
  ...extra,
});

// The opening tags in the markup that have all these classes, whatever their
// order and whatever other classes they have
export function tagsWith(html: string, ...classes: string[]): string[] {
  return [...html.matchAll(/<[a-z][^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => {
      const own = classesOf(tag);
      return classes.every((name) => own.has(name));
    });
}

// The classes of an opening tag
export function classesOf(tag: string): Set<string> {
  const [, names = ''] = /\sclass="([^"]*)"/.exec(tag) ?? [];
  return new Set(names.split(/\s+/).filter(Boolean));
}

// The terms of each <dl> in the markup with their descriptions, as text, and
// the classes of the description
export function definitions(html: string): [string, string, string][] {
  return [...html.matchAll(/<dt[^>]*>(.*?)<\/dt>(<dd[^>]*>)(.*?)<\/dd>/gs)].map(
    ([, term, dd, description]) => [
      textOf(term),
      textOf(description),
      [...classesOf(dd)].toSorted().join(' '),
    ],
  );
}

// Markup as the text it shows
function textOf(html: string): string {
  return html
    .replaceAll(/<[^>]*>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&amp;', '&');
}

// Waits for something that happens in its own time, like the Git extension
// reading a change
export async function waitFor(
  condition: () => boolean,
  what: string,
  timeout = 15_000,
): Promise<void> {
  const until = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > until) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
