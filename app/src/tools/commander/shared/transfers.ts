const clashAnswers = ['overwrite', 'skip', 'keepBoth'] as const;

export type ClashAnswer = (typeof clashAnswers)[number];

export function isClashAnswer(value: unknown): value is ClashAnswer {
  return clashAnswers.some((answer) => answer === value);
}

export interface ClashSide {
  readonly size: number | undefined;
  readonly modified: number;
  readonly readOnly?: true;
}

export interface Clash {
  readonly name: string;
  readonly source: ClashSide;
  readonly target: ClashSide;
}

export interface TransferProgress {
  readonly files: number;
  readonly totalFiles: number;
  readonly bytes: number;
  readonly totalBytes: number;
  readonly current?: string;
}

export interface TransferView {
  readonly id: number;
  readonly move: boolean;
  readonly packing?: true;
  readonly items: number;
  readonly name?: string;
  readonly target: string;
  readonly progress?: TransferProgress;
  readonly clash?: Clash & { readonly asked: number };
  readonly stopping: boolean;
}
