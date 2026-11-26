import { hasCode } from '../shared/errors';
export function isMissing(error: unknown): boolean {
  return hasCode(error, 'ENOENT', 'ENOTDIR');
}
