import { strings } from '../../../lib/shared/strings';
import type { Page } from '../../../shell/main/toolContract';
import { maxFindLength, type CommanderToHost } from '../shared/protocol';
import { isTextEncoding } from '../shared/textEncodings';
import { readingFile } from './fileBlocks';
import { findInFile } from './textFind';
import { plainSearch } from '../../../lib/shared/searchOptions';
import { reasonOf } from './reasons';
import type { Sides } from './sides';
import { post } from './post';

const findProgressEvery = 150;

export class ViewerFind {
  constructor(private readonly sides: Sides) {}

  async findText(
    page: Page,
    {
      tab,
      request,
      encoding,
      query,
    }: Extract<CommanderToHost, { type: 'findText' }>,
  ): Promise<void> {
    const showing = this.sides.shown.get(page);
    const viewing = showing?.viewing;
    if (
      showing === undefined ||
      viewing === undefined ||
      viewing.tab !== tab ||
      !Number.isSafeInteger(request) ||
      !isTextEncoding(encoding) ||
      typeof query !== 'string' ||
      query.length > maxFindLength
    ) {
      return;
    }
    showing.finding?.abort();
    const finding = new AbortController();
    showing.finding = finding;
    showing.findingRequest = request;
    let told = Date.now();
    let failed: unknown;
    const found = await readingFile(viewing.file, (read) =>
      findInFile(read, viewing.size, query, plainSearch, encoding, {
        signal: finding.signal,
        onChunk: (matches) => {
          if (Date.now() - told >= findProgressEvery) {
            told = Date.now();
            post(page, {
              type: 'found',
              tab,
              request,
              matches: [...matches],
              capped: false,
              done: false,
            });
          }
        },
      }),
    ).catch((error: unknown) => {
      failed = error;
      return undefined;
    });
    if (finding.signal.aborted) {
      return;
    }
    showing.finding = undefined;
    showing.findingRequest = undefined;
    if (found === undefined) {
      if (
        failed !== undefined &&
        this.sides.shown.get(page)?.viewing === viewing
      ) {
        post(page, {
          type: 'viewing',
          tab,
          size: undefined,
          error: strings.commander.couldNotRead(viewing.file, reasonOf(failed)),
        });
      }
      return;
    }
    post(page, {
      type: 'found',
      tab,
      request,
      matches: found.matches,
      capped: found.capped,
      done: true,
    });
  }

  stopFind(
    page: Page,
    message: Extract<CommanderToHost, { type: 'stopFind' }>,
  ): void {
    const showing = this.sides.shown.get(page);
    if (
      showing?.findingRequest !== undefined &&
      message.request === showing.findingRequest &&
      message.tab === showing.viewing?.tab
    ) {
      showing.finding?.abort();
      showing.finding = undefined;
      showing.findingRequest = undefined;
    }
  }
}
