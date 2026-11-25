import type { FileTabSize } from '../../../lib/shared/tabSize';
import { fs } from '../../../lib/main/files';
import { strings } from '../../../lib/shared/strings';
import type { Page } from '../../../shell/main/toolContract';
import {
  maxBytesAsked,
  maxRowsAsked,
  type ViewerToHost,
} from '../shared/protocol';
import { maxColoredBytes } from '../../../components/syntax/shared/colorLimit';
import {
  isTextEncoding,
  type TextEncoding,
} from '../../../components/encodings/shared/textEncodings';
import type { WatchFolder } from '../../../lib/main/watch';
import { sampledVersion } from '../../../lib/main/fileVersions';
import { readBudgetBytes, rowsBefore, rowsFrom, rowStartAt } from './textRows';
import { codingOf } from '../../../components/encodings/main/textCodings';
import {
  byteOrderMarkOf,
  firstBytes,
  isUtf8,
  looksBinary,
  utf16Order,
} from '../../../components/encodings/main/encodingDetection';
import { blockCache, readingFile } from '../../../lib/main/fileBlocks';
import { reasonOf } from '../../../lib/main/reasons';
import type { ViewerPages } from './pages';
import { post } from './post';

export interface ViewersAccess {
  readonly codePage: () => Promise<TextEncoding>;
  readonly fileTabSize: (file: string) => Promise<FileTabSize | undefined>;
  readonly watch: WatchFolder;
}

export class Viewers {
  constructor(
    private readonly access: ViewersAccess,
    private readonly pages: ViewerPages,
    private readonly hiddenParts: (file: string) => Promise<readonly boolean[]>,
    private readonly viewed: (tab: string, file: string) => void,
  ) {}

  async startViewing(
    page: Page,
    tab: string,
    file: string,
    read = file,
  ): Promise<void> {
    const showing = this.pages.shown.get(page);
    if (showing === undefined) {
      return;
    }
    const asked = ++showing.viewingsAsked;
    const current = () =>
      this.pages.shown.get(page) === showing &&
      showing.viewingsAsked === asked &&
      showing.tab === tab;
    let size: number;
    let version: string;
    let binary: boolean;
    let detected: TextEncoding | undefined;
    let hidden: readonly boolean[];
    try {
      const stats = await fs.promises.stat(read);
      hidden = await this.hiddenParts(file);
      size = stats.size;
      version = await sampledVersion(read, stats);
      const first = await firstBytes(read);
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
          error: strings.textFile.couldNotRead(file, reasonOf(error)),
        });
      }
      return;
    }
    if (!current()) {
      return;
    }
    let refreshes = 0;
    const readAgain = (refreshed: boolean) => {
      void fs.promises
        .stat(read)
        .then(async (stats) => ({
          stats,
          changed: await sampledVersion(read, stats),
        }))
        .then(
          ({ stats, changed }) => {
            if (
              showing.viewing === viewing &&
              this.pages.shown.get(page) === showing
            ) {
              viewing.blocks.forget();
              viewing.size = stats.size;
              post(page, {
                type: 'viewing',
                tab,
                size: stats.size,
                version: refreshed ? `${changed} ${++refreshes}` : changed,
                binary,
                hidden,
                ...(detected !== undefined && { detected }),
              });
            }
          },
          (error: unknown) => {
            if (
              showing.viewing === viewing &&
              this.pages.shown.get(page) === showing
            ) {
              post(page, {
                type: 'viewing',
                tab,
                size: undefined,
                error: strings.textFile.couldNotRead(file, reasonOf(error)),
              });
            }
          },
        );
    };
    const viewing = {
      tab,
      file: read,
      size,
      binary,
      blocks: blockCache(),
      stop: this.access.watch(read, () => readAgain(false)),
      refresh: () => readAgain(true),
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
    const tabSize = await this.access.fileTabSize(file);
    if (current()) {
      post(page, { type: 'tabSize', tab, ...(tabSize && { tabSize }) });
    }
  }

  async readBytes(
    page: Page,
    message: Extract<ViewerToHost, { type: 'readBytes' }>,
  ): Promise<void> {
    const viewing = this.pages.shown.get(page)?.viewing;
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
      if (this.pages.shown.get(page)?.viewing === viewing) {
        post(page, {
          type: 'viewing',
          tab,
          size: undefined,
          error: strings.textFile.couldNotRead(viewing.file, reasonOf(error)),
        });
      }
    }
  }

  async readText(
    page: Page,
    { tab, request, encoding }: Extract<ViewerToHost, { type: 'readText' }>,
  ): Promise<void> {
    const viewing = this.pages.shown.get(page)?.viewing;
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
    message: Extract<ViewerToHost, { type: 'readRows' }>,
  ): Promise<void> {
    const viewing = this.pages.shown.get(page)?.viewing;
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
      if (this.pages.shown.get(page)?.viewing === viewing) {
        post(page, {
          type: 'viewing',
          tab: viewing.tab,
          size: undefined,
          error: strings.textFile.couldNotRead(viewing.file, reasonOf(error)),
        });
      }
    }
  }
}
