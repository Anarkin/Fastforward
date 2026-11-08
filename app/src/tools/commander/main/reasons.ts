import { strings } from '../../../shared/strings';

export function codeOf(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}

export function reasonOf(error: unknown): string {
  if (codeOf(error) === 'ENOENT') {
    return strings.commander.gone;
  }
  return error instanceof Error ? error.message : String(error);
}
