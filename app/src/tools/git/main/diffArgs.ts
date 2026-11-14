export const diffArgs = [
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--histogram',
  '--full-index',
  '--src-prefix=a/',
  '--dst-prefix=b/',
  '-O/dev/null',
];

export const showArgs = [
  'show',
  '--diff-merges=first-parent',
  '--format=',
  '-M',
  ...diffArgs,
];

export const changesArgs = ['--raw', '--numstat', '-z', '--no-abbrev'];

export const listArgs = ['--raw', '-z', '--no-abbrev'];

export const compareArgs = ['diff', '-M', ...diffArgs];

export function showPatchArgs(hash: string, scope: PatchScope): string[] {
  return [...showArgs, '--patch', ...diffOptionArgs(scope), hash, '--'];
}

export function comparePatchArgs(
  from: string,
  to: string,
  scope: PatchScope,
): string[] {
  return [...compareArgs, ...diffOptionArgs(scope), from, to, '--'];
}

export interface PatchScope {
  readonly path?: string;
  readonly oldPath?: string;
  readonly include?: readonly string[];
  readonly entireFile?: boolean;
  readonly ignoreWhitespace?: boolean;
}

export function diffOptionArgs({
  entireFile,
  ignoreWhitespace,
}: PatchScope): string[] {
  return [
    ...(entireFile ? ['--unified=2147483647'] : []),
    ...(ignoreWhitespace ? ['--ignore-all-space'] : []),
  ];
}

export function pathspecs({ path, oldPath, include }: PatchScope): string[] {
  if (path !== undefined) {
    return oldPath ? [oldPath, path] : [path];
  }
  return include ? [...include] : [];
}
