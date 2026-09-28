// Helpers for commit hashes, shared by the extension and the webview

// What could be the start of a hash, which git needs four characters of
export function isHashPrefix(text: string): boolean {
  return /^[0-9a-f]{4,40}$/i.test(text);
}

// A hash as short as git shows it
export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}
