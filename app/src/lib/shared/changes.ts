export const workingTreeHash = 'working-tree';

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
