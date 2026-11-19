import { plainOf, type Sentence } from '../../lib/shared/sentences';

const maxNotices = 4;

export interface NoticeTimes {
  readonly least: number;
  readonly most: number;
  readonly errorLeast: number;
  readonly errorMost: number;
}

export const defaultNoticeTimes: NoticeTimes = {
  least: 6000,
  most: 15_000,
  errorLeast: 20_000,
  errorMost: 45_000,
};

export const defaultTipDelay = 500;

export function addNotice<Notice extends { readonly message: Sentence }>(
  notices: readonly Notice[],
  notice: Notice,
): readonly Notice[] {
  return [
    ...notices.filter(
      (shown) => plainOf(shown.message) !== plainOf(notice.message),
    ),
    notice,
  ].slice(-maxNotices);
}
