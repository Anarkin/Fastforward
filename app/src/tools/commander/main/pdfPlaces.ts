import * as fs from 'node:fs';
import { writeAtomically } from '../../../shell/main/settings';
import {
  isPdfFingerprint,
  pdfPlaceOf,
  type PdfPlace,
} from '../../../shared/pdf';

const keptPlaces = 1000;

interface Kept extends PdfPlace {
  readonly file: string;
  readonly read: number;
}

function keptOf(value: unknown): Kept | undefined {
  const place = pdfPlaceOf(value);
  if (place === undefined || typeof value !== 'object' || value === null) {
    return undefined;
  }
  const fields = new Map(Object.entries(value));
  const file = fields.get('file');
  const read = fields.get('read');
  return typeof file === 'string' && typeof read === 'number'
    ? { ...place, file, read }
    : undefined;
}

export class PdfPlaces {
  private places: Promise<Map<string, Kept>> | undefined;
  private writing: Promise<void> = Promise.resolve();
  private unreadable = false;

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
    private readonly kept = keptPlaces,
  ) {}

  async of(fingerprint: string): Promise<PdfPlace | undefined> {
    const kept = (await this.loaded()).get(fingerprint);
    return kept && pdfPlaceOf(kept);
  }

  async save(
    fingerprint: string,
    place: PdfPlace,
    file: string,
  ): Promise<void> {
    const places = await this.loaded();
    places.delete(fingerprint);
    places.set(fingerprint, { ...place, file, read: this.now() });
    const oldest = [...places]
      .toSorted(([, one], [, other]) => one.read - other.read)
      .slice(0, Math.max(0, places.size - this.kept));
    for (const [forgotten] of oldest) {
      places.delete(forgotten);
    }
    if (this.unreadable) {
      return;
    }
    const text = JSON.stringify(Object.fromEntries(places), null, 2);
    const written = this.writing.then(() => writeAtomically(this.file, text));
    this.writing = written.catch(() => undefined);
    await written;
  }

  saved(): Promise<void> {
    return this.writing;
  }

  private async putAside(): Promise<void> {
    await fs.promises.copyFile(this.file, `${this.file}.corrupt`).catch(() => {
      this.unreadable = true;
    });
  }

  private loaded(): Promise<Map<string, Kept>> {
    this.places ??= fs.promises
      .readFile(this.file, 'utf8')
      .then(
        async (text) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            await this.putAside();
            return new Map<string, Kept>();
          }
          const places = new Map<string, Kept>();
          if (typeof parsed === 'object' && parsed !== null) {
            for (const [fingerprint, value] of Object.entries(parsed)) {
              const kept = keptOf(value);
              if (isPdfFingerprint(fingerprint) && kept !== undefined) {
                places.set(fingerprint, kept);
              }
            }
          }
          return places;
        },
        (error: unknown) => {
          if (Reflect.get(Object(error), 'code') !== 'ENOENT') {
            this.unreadable = true;
          }
          return new Map<string, Kept>();
        },
      )
      .catch(() => new Map<string, Kept>());
    return this.places;
  }
}
