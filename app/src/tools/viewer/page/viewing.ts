import type { Sentence } from '../../../lib/shared/sentences';
import type { TextEncoding } from '../../../components/encodings/shared/textEncodings';
import type {
  ViewerToHost,
  ViewerToWebview,
  ViewerToWebviewOf,
} from '../shared/protocol';

export interface Viewing {
  readonly tab: string;
  readonly size: number | undefined;
  readonly version?: string;
  readonly binary?: boolean;
  readonly hidden?: readonly boolean[];
  readonly detected?: TextEncoding;
  readonly error?: Sentence;
}

export type ToViewer = ViewerToWebviewOf<
  'rows' | 'text' | 'bytes' | 'found' | 'pdfPlace'
>;

export type ViewerRequest = Extract<
  ViewerToHost,
  { readonly type: 'readText' | 'readRows' | 'readBytes' }
>;

const streams: ReadonlySet<ViewerToWebview['type']> = new Set<ToViewer['type']>(
  ['rows', 'text', 'bytes', 'found', 'pdfPlace'],
);

export function isViewerStream(message: ViewerToWebview): message is ToViewer {
  return streams.has(message.type);
}

export function viewingOf(message: ViewerToWebviewOf<'viewing'>): Viewing {
  return {
    tab: message.tab,
    size: message.size,
    ...(message.version !== undefined && { version: message.version }),
    ...(message.binary !== undefined && { binary: message.binary }),
    ...(message.hidden !== undefined && { hidden: message.hidden }),
    ...(message.detected !== undefined && { detected: message.detected }),
    ...(message.error !== undefined && { error: message.error }),
  };
}

export function sameViewing(
  shown: Viewing | undefined,
  told: Viewing,
): boolean {
  return (
    shown !== undefined &&
    shown.tab === told.tab &&
    shown.size === told.size &&
    shown.version === told.version &&
    shown.binary === told.binary &&
    shown.detected === told.detected &&
    shown.error === told.error &&
    shown.hidden?.length === told.hidden?.length &&
    (shown.hidden ?? []).every((part, index) => part === told.hidden?.[index])
  );
}
