import { plainOf, type Sentence } from '../../lib/shared/strings';
import { maxNotices } from './protocol';

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
