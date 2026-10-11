import { maxNotices } from './protocol';

export function addNotice<Notice extends { readonly message: string }>(
  notices: readonly Notice[],
  notice: Notice,
): readonly Notice[] {
  return [
    ...notices.filter((shown) => shown.message !== notice.message),
    notice,
  ].slice(-maxNotices);
}
