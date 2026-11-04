export interface ToThumbnailWorker {
  readonly id: number;
  readonly url: string;
  readonly box: number;
  readonly pixelRatio: number;
}

export interface MadeThumbnail {
  readonly image: Blob;
  readonly width: number;
  readonly height: number;
  readonly fresh: boolean;
}

export interface FromThumbnailWorker {
  readonly id: number;
  readonly made?: MadeThumbnail;
}
