import type { Compared } from '../../../shell/main/savedTabs';
import { CompareTooLarge } from './compare';

type VersionCopy =
  | { readonly kind: 'file'; readonly file: string }
  | { readonly kind: 'missing' | 'tooLarge' };

export type CopyOf = (file: string, rev: string) => Promise<VersionCopy>;

export class VersionMissing extends Error {
  constructor(readonly file: string) {
    super(file);
  }
}

export async function readableSides(
  compared: Compared,
  copyOf: CopyOf,
): Promise<Compared> {
  const side = async (
    file: string,
    rev: string | undefined,
  ): Promise<string> => {
    if (rev === undefined) {
      return file;
    }
    const copy = await copyOf(file, rev);
    if (copy.kind === 'file') {
      return copy.file;
    }
    throw copy.kind === 'tooLarge'
      ? new CompareTooLarge()
      : new VersionMissing(file);
  };
  const [old, changed] = await Promise.all([
    side(compared.old, compared.oldVersion?.rev),
    side(compared.new, compared.newVersion?.rev),
  ]);
  return { old, new: changed };
}
