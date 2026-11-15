import * as fs from 'node:fs';
import { strings } from '../../../lib/shared/strings';
import type { Page } from '../../../shell/main/toolContract';
import {
  maxBytesAsked,
  maxColoredBytes,
  maxRowsAsked,
  type CommanderToHost,
} from '../shared/protocol';
import { isTextEncoding, type TextEncoding } from '../shared/textEncodings';
import type { WatchFolder } from './watch';
import { fileVersion } from '../shared/files';
import { readBudgetBytes, rowsBefore, rowsFrom, rowStartAt } from './textRows';
import { codingOf } from './textCodings';
import {
  byteOrderMarkOf,
  firstBytes,
  isUtf8,
  looksBinary,
  utf16Order,
} from './encodingDetection';
import { blockCache, readingFile } from './fileBlocks';
import { reasonOf } from './reasons';
import type { Sides } from './sides';
import { post } from './post';

export interface ViewersAccess {
  readonly codePage: () => Promise<TextEncoding>;
  readonly watch: WatchFolder;
}

export class Viewers {
  constructor(
    private readonly access: ViewersAccess,
    private readonly sides: Sides,
    private readonly hiddenParts: (file: string) => Promise<readonly boolean[]>,
    private readonly viewed: (tab: string, file: string) => void,
  ) {}

  async startViewing(page: Page, tab: string, file: string): Promise<void> {
    const showing = this.sides.shown.get(page);
    if (showing === undefined) {
      return;
    }
    const asked = ++showing.viewingsAsked;
    const current = () =>
      this.sides.shown.get(page) === showing &&
      showing.viewingsAsked === asked &&
      showing.tab === tab;
    let size: number;
    let version: string;
    let binary: boolean;
    let detected: TextEncoding | undefined;
    let hidden: readonly boolean[];
    try {
      const stats = await fs.promises.stat(file);
      hidden = await this.hiddenParts(file);
      size = stats.size;
      version = fileVersion(stats);
      const first = await firstBytes(file);
      binary = looksBinary(first);
      detected =
        byteOrderMarkOf(first) ??
        utf16Order(first) ??
        (binary || isUtf8(first) ? undefined : await this.access.codePage());
    } catch (error) {
      if (current()) {
        post(page, {
          type: 'viewing',
          tab,
          size: undefined,
          error: strings.commander.couldNotRead(file, reasonOf(error)),
        });
      }
      return;
    }
    if (!current()) {
      return;
    }
    const viewing = {
      tab,
      file,
      size,
      binary,
      blocks: blockCache(),
      stop: this.access.watch(file, () => {
        void fs.promises.stat(file).then(
          (stats) => {
            if (
              showing.viewing === viewing &&
              this.sides.shown.get(page) === showing
            ) {
              viewing.blocks.forget();
              viewing.size = stats.size;
              post(page, {
                type: 'viewing',
                tab,
                size: stats.size,
                version: fileVersion(stats),
                binary,
                hidden,
                ...(detected !== undefined && { detected }),
              });
            }
          },
          (error: unknown) => {
            if (
              showing.viewing === viewing &&
              this.sides.shown.get(page) === showing
            ) {
              post(page, {
                type: 'viewing',
                tab,
                size: undefined,
                error: strings.commander.couldNotRead(file, reasonOf(error)),
              });
            }
          },
        );
      }),
    };
    showing.finding?.abort();
    showing.finding = undefined;
    showing.viewing = viewing;
    this.viewed(tab, file);
    post(page, {
      type: 'viewing',
      tab,
      size,
      version,
      binary,
      hidden,
      ...(detected !== undefined && { detected }),
    });
  }

  async readBytes(
    page: Page,
    message: Extract<CommanderToHost, { type: 'readBytes' }>,
  ): Promise<void> {
    const viewing = this.sides.shown.get(page)?.viewing;
    const { tab, request, start, length } = message;
    if (
      viewing === undefined ||
      viewing.tab !== tab ||
      !Number.isSafeInteger(request) ||
      !Number.isSafeInteger(start) ||
      start < 0 ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > maxBytesAsked
    ) {
      return;
    }
    const { blocks } = viewing;
    try {
      const data = await readingFile(viewing.file, (read) =>
        blocks.reader(read)(start, length),
      );
      post(page, { type: 'bytes', tab, request, start, data: [...data] });
    } catch (error) {
      if (this.sides.shown.get(page)?.viewing === viewing) {
        post(page, {
          type: 'viewing',
          tab,
          size: undefined,
          error: strings.commander.couldNotRead(viewing.file, reasonOf(error)),
        });
      }
    }
  }

  async readText(
    page: Page,
    { tab, request, encoding }: Extract<CommanderToHost, { type: 'readText' }>,
  ): Promise<void> {
    const viewing = this.sides.shown.get(page)?.viewing;
    if (
      viewing === undefined ||
      viewing.tab !== tab ||
      !Number.isSafeInteger(request) ||
      !isTextEncoding(encoding)
    ) {
      return;
    }
    const text =
      viewing.size > maxColoredBytes
        ? undefined
        : await fs.promises
            .readFile(viewing.file)
            .then((bytes) =>
              new TextDecoder(encoding, { ignoreBOM: true }).decode(bytes),
            )
            .catch(() => undefined);
    post(page, { type: 'text', tab, request, text });
  }

  async readRows(
    page: Page,
    message: Extract<CommanderToHost, { type: 'readRows' }>,
  ): Promise<void> {
    const viewing = this.sides.shown.get(page)?.viewing;
    const { request, anchor, exact, before, after, least, encoding } = message;
    const counts = [before, after, least].every(
      (count) => Number.isInteger(count) && count >= 0 && count <= maxRowsAsked,
    );
    if (
      viewing === undefined ||
      viewing.tab !== message.tab ||
      !Number.isSafeInteger(request) ||
      !Number.isSafeInteger(anchor) ||
      anchor < 0 ||
      typeof exact !== 'boolean' ||
      !isTextEncoding(encoding) ||
      !counts
    ) {
      return;
    }
    const { size, blocks } = viewing;
    try {
      const [earlier, later] = await readingFile(
        viewing.file,
        async (direct) => {
          const read = blocks.reader(direct);
          const coding = codingOf(encoding);
          const start = exact
            ? Math.min(anchor, size)
            : await rowStartAt(read, Math.min(anchor, size), coding);
          const budget = { least, bytes: readBudgetBytes };
          return Promise.all([
            rowsBefore(read, size, start, before, coding, budget),
            rowsFrom(read, size, start, after, coding, budget),
          ]);
        },
      );
      post(page, {
        type: 'rows',
        tab: viewing.tab,
        request,
        size,
        rows: [...earlier, ...later],
        anchorIndex: earlier.length,
      });
    } catch (error) {
      if (this.sides.shown.get(page)?.viewing === viewing) {
        post(page, {
          type: 'viewing',
          tab: viewing.tab,
          size: undefined,
          error: strings.commander.couldNotRead(viewing.file, reasonOf(error)),
        });
      }
    }
  }
}
