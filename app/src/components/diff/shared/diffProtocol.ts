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
