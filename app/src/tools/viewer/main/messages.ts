import type { Page } from '../../../shell/main/toolContract';
import {
  isTextEncoding,
  type TextEncoding,
} from '../../../components/encodings/shared/textEncodings';
import type { CopiedAs, ViewerToHost } from '../shared/protocol';
import type { ViewerPages } from './pages';
import type { Viewers } from './viewers';
import type { ViewerFind } from './find';
import type { ViewedPdfPlaces } from './viewedPdfPlaces';

const copiedAs: readonly unknown[] = ['text', 'hex', 'bytes'];

export class ViewerMessages {
  constructor(
    private readonly pages: ViewerPages,
    private readonly viewers: Viewers,
    private readonly find: ViewerFind,
    private readonly pdfPlaces: ViewedPdfPlaces,
    private readonly editViewed: (
      page: Page,
      tab: string,
      at: { readonly byte: number; readonly encoding?: TextEncoding },
    ) => Promise<void>,
    private readonly editTabSizeSource: (
      page: Page,
      tab: string,
    ) => Promise<void>,
    private readonly chooseVersion: (
      page: Page,
      tab: string,
      rev: string | undefined,
    ) => Promise<void>,
    private readonly compareVersions: (
      page: Page,
      tab: string,
    ) => Promise<void>,
    private readonly copyWhole: (
      page: Page,
      as: CopiedAs,
      encoding: TextEncoding,
    ) => Promise<void>,
  ) {}

  receive(page: Page, message: ViewerToHost): Promise<void> {
    switch (message.type) {
      case 'readRows':
        return this.viewers.readRows(page, message);
      case 'readText':
        return this.viewers.readText(page, message);
      case 'readBytes':
        return this.viewers.readBytes(page, message);
      case 'findText':
        return this.find.findText(page, message);
      case 'stopFind':
        this.find.stopFind(page, message);
        return Promise.resolve();
      case 'readPdfPlace':
        return this.pdfPlaces.readPdfPlace(page, message);
      case 'savePdfPlace':
        return this.pdfPlaces.savePdfPlace(page, message);
      case 'editTabSizeSource':
        return this.pages.shown.get(page)?.tab === message.tab
          ? this.editTabSizeSource(page, message.tab)
          : Promise.resolve();
      case 'editViewed': {
        const { tab, at, encoding } = message;
        if (
          this.pages.shown.get(page)?.tab !== tab ||
          !Number.isSafeInteger(at) ||
          at < 0 ||
          (encoding !== undefined && !isTextEncoding(encoding))
        ) {
          return Promise.resolve();
        }
        return this.editViewed(page, tab, {
          byte: at,
          ...(encoding !== undefined && { encoding }),
        });
      }
      case 'chooseVersion': {
        const { tab, rev } = message;
        return this.pages.shown.get(page)?.tab !== tab ||
          (rev !== undefined && typeof rev !== 'string')
          ? Promise.resolve()
          : this.chooseVersion(page, tab, rev);
      }
      case 'compareVersions':
        return this.pages.shown.get(page)?.tab === message.tab
          ? this.compareVersions(page, message.tab)
          : Promise.resolve();
      case 'refresh': {
        const viewing = this.pages.shown.get(page)?.viewing;
        if (viewing?.tab === message.tab) {
          viewing.refresh();
        }
        return Promise.resolve();
      }
      case 'copyWhole': {
        const { tab, as, encoding } = message;
        return this.pages.shown.get(page)?.viewing?.tab === tab &&
          copiedAs.includes(as) &&
          isTextEncoding(encoding)
          ? this.copyWhole(page, as, encoding)
          : Promise.resolve();
      }
      default:
        return message satisfies never;
    }
  }
}
