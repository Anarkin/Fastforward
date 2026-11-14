export interface ToThumbnailWorker {
  readonly id: number;
  readonly url: string;
  readonly box: number;
  readonly pixelRatio: number;
  readonly filling: boolean;
}

export interface MadeThumbnail {
  readonly image: Blob;
  readonly width: number;
  readonly height: number;
  readonly fresh: boolean;
}

export type FillOutcome = 'stored' | 'online' | 'full';

export interface FromThumbnailWorker {
  readonly id: number;
  readonly made?: MadeThumbnail;
  readonly outcome?: FillOutcome;
}
