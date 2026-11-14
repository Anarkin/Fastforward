import { plainOf, type Sentence } from '../../lib/shared/strings';

export interface Notice {
  readonly id: number;
  readonly level: 'info' | 'error';
  readonly message: Sentence;
  readonly shownAt: number;
}

const readAtLeast = 6000;

const readAtMost = 15_000;

const readPerCharacter = 40;

const errorTimes = 3;

const errorAtLeast = 20_000;

const errorAtMost = 45_000;

export function shownFor({
  level,
  message,
}: Pick<Notice, 'level' | 'message'>): number {
  const read = Math.min(
    readAtMost,
    readAtLeast + readPerCharacter * plainOf(message).length,
  );
  return level === 'info'
    ? read
    : Math.min(errorAtMost, Math.max(errorAtLeast, errorTimes * read));
}

export function fading(
  notices: readonly Notice[],
  now: number,
): { id: number; after: number }[] {
  return notices.map((notice) => ({
    id: notice.id,
    after: Math.max(0, notice.shownAt + shownFor(notice) - now),
  }));
}
