export function textKey(path: string, side: 'old' | 'new'): string {
  return `${side}:${path}`;
}

export interface LoadedText {
  readonly blob: string;
  readonly text: string | undefined;
}
