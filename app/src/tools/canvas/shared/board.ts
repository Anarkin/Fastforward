export const nodeSides = ['top', 'right', 'bottom', 'left'] as const;

type NodeSide = (typeof nodeSides)[number];

export const edgeEnds = ['none', 'arrow'] as const;

type EdgeEnd = (typeof edgeEnds)[number];

interface Placed {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: string;
}

export type BoardNode =
  | (Placed & { readonly type: 'text'; readonly text: string })
  | (Placed & {
      readonly type: 'file';
      readonly file: string;
      readonly subpath?: string;
    })
  | (Placed & { readonly type: 'link'; readonly url: string })
  | (Placed & { readonly type: 'group'; readonly label?: string });

export interface BoardEdge {
  readonly id: string;
  readonly fromNode: string;
  readonly fromSide?: NodeSide;
  readonly fromEnd?: EdgeEnd;
  readonly toNode: string;
  readonly toSide?: NodeSide;
  readonly toEnd?: EdgeEnd;
  readonly color?: string;
  readonly label?: string;
}

export interface Board {
  readonly nodes: readonly BoardNode[];
  readonly edges: readonly BoardEdge[];
}
