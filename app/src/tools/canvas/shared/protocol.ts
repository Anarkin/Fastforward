import type { Sentence } from '../../../lib/shared/sentences';
import type { Board, EdgeEnd, NodeSide } from './board';

export const viewVersion = 1;

export interface NodeBox {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const addedKinds = ['text', 'group'] as const;

export const nodeOrders = ['front', 'back'] as const;

export type NodeOrder = (typeof nodeOrders)[number];

export const isBoardColor = (color: string): boolean =>
  /^(?:[1-6]|#[\da-f]{3}|#[\da-f]{6})$/i.test(color);

type AddedKind = (typeof addedKinds)[number];

export type BoardEdit =
  | { readonly kind: 'place'; readonly boxes: readonly NodeBox[] }
  | {
      readonly kind: 'add';
      readonly node: Omit<NodeBox, 'id'> & { readonly type: AddedKind };
    }
  | {
      readonly kind: 'delete';
      readonly nodes: readonly string[];
      readonly edges: readonly string[];
    }
  | {
      readonly kind: 'connect';
      readonly fromNode: string;
      readonly fromSide: NodeSide;
      readonly toNode: string;
      readonly toSide: NodeSide;
    }
  | {
      readonly kind: 'ends';
      readonly edges: readonly string[];
      readonly fromEnd: EdgeEnd;
      readonly toEnd: EdgeEnd;
    }
  | {
      readonly kind: 'text';
      readonly id: string;
      readonly text: string;
      readonly session: number;
    }
  | {
      readonly kind: 'color';
      readonly nodes: readonly string[];
      readonly edges: readonly string[];
      readonly color?: string;
    }
  | {
      readonly kind: 'order';
      readonly nodes: readonly string[];
      readonly to: NodeOrder;
    };

export type CanvasToHost =
  | { readonly type: 'edit'; readonly tab: string; readonly edit: BoardEdit }
  | { readonly type: 'undo'; readonly tab: string }
  | { readonly type: 'redo'; readonly tab: string }
  | { readonly type: 'save'; readonly tab: string };

export type CanvasToWebview =
  | { readonly type: 'show'; readonly tab: string; readonly file: string }
  | { readonly type: 'hide' }
  | { readonly type: 'closed'; readonly tab: string }
  | {
      readonly type: 'board';
      readonly tab: string;
      readonly file: string;
      readonly board?: Board;
      readonly error?: Sentence;
      readonly changed?: true;
      readonly made?: string;
    }
  | {
      readonly type: 'titles';
      readonly titles: Readonly<Record<string, string>>;
    };
