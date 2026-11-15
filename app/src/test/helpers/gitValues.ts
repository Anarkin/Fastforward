import type { CommitInfo, FileChange } from '../../tools/git/shared/protocol';

export const commitInfo = (
  hash: string,
  extra: Partial<CommitInfo> = {},
): CommitInfo => ({
  hash,
  subject: hash,
  body: '',
  authorName: 'Test',
  commitDate: 0,
  ...extra,
});

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
