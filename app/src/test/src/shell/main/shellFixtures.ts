import type { Sentence } from '../../../../lib/shared/strings';
import type { FakePage } from '../../../helpers/harness';

export const saying = (note?: string) => ({ quitNote: () => note });

export function noticesOf(page: FakePage): (readonly [string, Sentence])[] {
  return page.messages.flatMap((message) =>
    message.type === 'notice'
      ? [[message.level, message.message] as const]
      : [],
  );
}
