import type { Page } from '../../../shell/main/toolContract';
import type { CommanderToHost } from '../shared/protocol';
import { isPdf, isPdfFingerprint, pdfPlaceOf } from '../shared/pdf';
import type { PdfPlaceStore } from './pdfPlaces';
import type { Sides } from './sides';
import { post } from './post';

export interface ViewedPdfPlacesAccess {
  readonly pdfPlaces: PdfPlaceStore;
}

export class ViewedPdfPlaces {
  private readonly pdfTabs = new Map<string, string>();

  constructor(
    private readonly access: ViewedPdfPlacesAccess,
    private readonly sides: Sides,
  ) {}

  viewed(tab: string, file: string): void {
    if (isPdf(file)) {
      this.pdfTabs.set(tab, file);
    }
  }

  private viewedPdf(page: Page, tab: unknown, fingerprint: unknown) {
    const viewing = this.sides.shown.get(page)?.viewing;
    return viewing !== undefined &&
      viewing.tab === tab &&
      isPdf(viewing.file) &&
      isPdfFingerprint(fingerprint)
      ? { file: viewing.file, fingerprint }
      : undefined;
  }

  async readPdfPlace(
    page: Page,
    {
      tab,
      fingerprint,
      request,
    }: Extract<CommanderToHost, { type: 'readPdfPlace' }>,
  ): Promise<void> {
    const viewed = this.viewedPdf(page, tab, fingerprint);
    if (viewed === undefined || !Number.isSafeInteger(request)) {
      return;
    }
    const place = await this.access.pdfPlaces
      .of(viewed.fingerprint)
      .catch(() => undefined);
    post(page, {
      type: 'pdfPlace',
      tab,
      request,
      ...(place !== undefined && { place }),
    });
  }

  async savePdfPlace(
    _page: Page,
    {
      tab,
      fingerprint,
      place,
    }: Extract<CommanderToHost, { type: 'savePdfPlace' }>,
  ): Promise<void> {
    const file = typeof tab === 'string' ? this.pdfTabs.get(tab) : undefined;
    const checked = pdfPlaceOf(place);
    if (
      file === undefined ||
      !isPdfFingerprint(fingerprint) ||
      checked === undefined
    ) {
      return;
    }
    await this.access.pdfPlaces
      .save(fingerprint, checked, file)
      .catch(() => undefined);
  }
}
