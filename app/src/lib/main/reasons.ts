import { codeOf, messageOf } from '../shared/errors';
import { strings } from '../shared/strings';

export function reasonOf(error: unknown): string {
  if (codeOf(error) === 'ENOENT') {
    return strings.commander.gone;
  }
  return messageOf(error);
}
