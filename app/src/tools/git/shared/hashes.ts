export function isHashPrefix(text: string): boolean {
  return /^[0-9a-f]{4,64}$/i.test(text);
}

export function isFullHash(text: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(text);
}

export function shortHash(hash: string): string {
  return hash.slice(0, 7);
}
