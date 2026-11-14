export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Strip {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly firstTabLeft: number;
  readonly tabTop: number;
}

export interface Visit {
  readonly tab: string;
  readonly x: number;
  readonly grabX: number;
}

export interface DragStart {
  readonly tab: string;
  readonly index: number;
  readonly grab: Point;
  readonly at: Point;
  readonly alone: boolean;
}

export type DragEvent =
  | ({ readonly kind: 'start' } & DragStart)
  | { readonly kind: 'move'; readonly at: Point }
  | { readonly kind: 'drop' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'strip'; readonly strip: Strip }
  | { readonly kind: 'index'; readonly index: number };
