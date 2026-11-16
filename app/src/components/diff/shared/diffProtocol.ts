export const diffLayouts = ['inline', 'sideBySide'] as const;

export type DiffLayout = (typeof diffLayouts)[number];

export interface LeftOut {
  readonly path: string;
  readonly lines: number | undefined;
}

export interface TextRequest {
  readonly path: string;
  readonly side: 'old' | 'new';
  readonly blob: string;
}

export type DiffSettingMessage =
  | { readonly type: 'setShowEntireFile'; readonly show: boolean }
  | { readonly type: 'setIgnoreWhitespace'; readonly ignore: boolean }
  | { readonly type: 'setDiffLayout'; readonly layout: DiffLayout };
