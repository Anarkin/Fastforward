import { plainOf, type Sentence } from '../../lib/shared/sentences';
import { defaultNoticeTimes, type NoticeTimes } from '../shared/notices';

export interface Notice {
  readonly id: number;
  readonly level: 'info' | 'error';
  readonly message: Sentence;
  readonly shownAt: number;
}

const readPerCharacter = 40;

const errorTimes = 3;

export function shownFor(
  { level, message }: Pick<Notice, 'level' | 'message'>,
  times: NoticeTimes = defaultNoticeTimes,
): number {
  const read = Math.min(
    times.most,
    times.least + readPerCharacter * plainOf(message).length,
  );
  return level === 'info'
    ? read
    : Math.min(times.errorMost, Math.max(times.errorLeast, errorTimes * read));
}

export function fading(
  notices: readonly Notice[],
  now: number,
  times: NoticeTimes = defaultNoticeTimes,
): { id: number; after: number }[] {
  return notices.map((notice) => ({
    id: notice.id,
    after: Math.max(0, notice.shownAt + shownFor(notice, times) - now),
  }));
}
