import type { Bookmark } from './protocol';

// Helpers for ref names, shared by the extension and the webview

// origin/main is main
export function withoutRemote(name: string): string {
  return name.slice(name.indexOf('/') + 1);
}

// The same branch, remote, tag or pinned commit
export function sameRef(a: Bookmark, b: Bookmark): boolean {
  return a.kind === b.kind && a.name === b.name;
}
