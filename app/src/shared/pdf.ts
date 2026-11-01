export const pdfType = 'application/pdf';

export function isPdf(path: string): boolean {
  return /\.pdf$/i.test(path);
}

const pdfFits = ['auto', 'page-width', 'page-fit', 'page-actual'] as const;

type PdfZoom = number | (typeof pdfFits)[number];

export interface PdfPlace {
  readonly page: number;
  readonly zoom: PdfZoom;
  readonly left: number;
  readonly top: number;
}

const maxPage = 1_000_000;
const minPercent = 1;
const maxPercent = 10_000;
const maxOffset = 1_000_000;

function zoomOf(value: unknown): PdfZoom | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= minPercent && value <= maxPercent
      ? value
      : undefined;
  }
  return pdfFits.find((fit) => fit === value);
}

function offsetOf(value: unknown): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= maxOffset
    ? Math.round(value)
    : undefined;
}

export function pdfPlaceOf(value: unknown): PdfPlace | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const fields = new Map(Object.entries(value));
  const page = fields.get('page') ?? fields.get('pageNumber');
  const zoom = zoomOf(fields.get('zoom') ?? fields.get('scale'));
  const left = offsetOf(fields.get('left'));
  const top = offsetOf(fields.get('top'));
  return typeof page === 'number' &&
    Number.isInteger(page) &&
    page >= 1 &&
    page <= maxPage &&
    zoom !== undefined &&
    left !== undefined &&
    top !== undefined
    ? { page, zoom, left, top }
    : undefined;
}

export function isPdfFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{1,128}$/i.test(value);
}
