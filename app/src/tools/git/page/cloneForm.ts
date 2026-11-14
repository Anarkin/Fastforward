import { nameProblem, urlProblem } from '../shared/clone';
import { type Sentence } from '../../../lib/shared/strings';

export interface ChosenFolder {
  readonly folder: string;
}

export interface CloneTarget {
  readonly folder: string;
  readonly name: string;
  readonly problem?: Sentence;
}

export function formProblem(
  url: string,
  folder: string,
  name: string,
  checked: CloneTarget | undefined,
): Sentence | undefined {
  if (url.trim() === '') {
    return undefined;
  }
  return (
    urlProblem(url) ??
    nameProblem(name) ??
    (checked?.folder === folder && checked.name === name
      ? checked.problem
      : undefined)
  );
}
