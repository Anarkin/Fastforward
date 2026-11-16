import { comparedOf, comparisonLabel } from '../../../lib/shared/comparisons';
import { shortHash } from '../../../lib/shared/hashes';
import { workingTreeHash, type ChangeArea } from '../shared/protocol';
import { strings } from '../../../lib/shared/strings';
import type { Sentence } from '../../../lib/shared/sentences';

export function filesTitle(selection: string | undefined): string {
  if (selection === undefined) {
    return strings.files.title;
  }
  const compared = comparedOf(selection);
  if (compared) {
    return comparisonLabel(compared);
  }
  return selection === workingTreeHash ? '' : shortHash(selection);
}

export function noChangesText(
  selection: string | undefined,
  error: Sentence | undefined,
): string | undefined {
  if (selection === undefined || error !== undefined) {
    return undefined;
  }
  return comparedOf(selection)
    ? strings.files.noDifferences
    : strings.files.noChanges;
}

export function headerTitle(area: ChangeArea | undefined): string {
  return area === undefined
    ? strings.files.allChanges
    : area === 'staged'
      ? strings.files.staged
      : strings.files.unstaged;
}
