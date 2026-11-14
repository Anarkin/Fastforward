export type CommandState = 'installed' | 'missing' | 'outdated' | 'taken';

export type CommandInstall =
  | {
      readonly kind: 'installed';
      readonly path: string;
      readonly onPath: boolean;
    }
  | { readonly kind: 'alreadyInstalled'; readonly path: string }
  | { readonly kind: 'taken'; readonly path: string }
  | { readonly kind: 'notMoved' }
  | { readonly kind: 'cancelled' };

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
