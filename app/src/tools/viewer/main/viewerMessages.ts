import type { Page } from '../../../shell/main/toolContract';
import {
  isTextEncoding,
  type TextEncoding,
} from '../../../lib/shared/textEncodings';
import type { ViewerToHost } from '../shared/protocol';
import type { ViewerPages } from './viewerPages';
import type { Viewers } from './viewers';
import type { ViewerFind } from './viewerFind';
import type { ViewedPdfPlaces } from './viewedPdfPlaces';

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
      default:
        return message satisfies never;
    }
  }
}
