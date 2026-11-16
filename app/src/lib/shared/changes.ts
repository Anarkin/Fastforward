export const workingTreeHash = 'working-tree';

export const diffLayouts = ['inline', 'sideBySide'] as const;

export type DiffLayout = (typeof diffLayouts)[number];

export interface LeftOut {
  readonly path: string;
  readonly lines: number | undefined;
}

export type ChangeArea = 'staged' | 'unstaged';

export const linkMode = '120000';

export interface FileChange {
  readonly path: string;
  readonly oldPath: string | undefined;
  readonly status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | '?';
  readonly insertions: number;
  readonly deletions: number;
  readonly bytes?: number;
  readonly uncounted?: boolean;
  readonly id?: string;
  readonly link?: true;
}

export interface TextRequest {
  readonly path: string;
  readonly side: 'old' | 'new';
  readonly blob: string;
}
