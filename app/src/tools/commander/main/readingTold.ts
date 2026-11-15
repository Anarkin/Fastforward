import type { Page } from '../../../shell/main/toolContract';
import { readingShownAfter } from '../shared/readingDelay';
import type { Side } from '../shared/sides';
import { post } from './post';

export function tellReading(page: Page, tab: string, side: Side): () => void {
  let told = false;
  const telling = setTimeout(() => {
    told = true;
    post(page, { type: 'reading', tab, side, reading: true });
  }, readingShownAfter);
  return () => {
    clearTimeout(telling);
    if (told) {
      told = false;
      post(page, { type: 'reading', tab, side, reading: false });
    }
  };
}

export async function toldReading<T>(
  page: Page,
  tab: string,
  side: Side,
  read: () => Promise<T>,
): Promise<T> {
  const done = tellReading(page, tab, side);
  try {
    return await read();
  } finally {
    done();
  }
}
