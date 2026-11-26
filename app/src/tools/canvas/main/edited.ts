import { withoutMark } from '../../../components/encodings/shared/byteOrderMarks';
import { isObject, type Json } from '../../../lib/main/json';
import type { BoardEdit } from '../shared/protocol';
import { layoutOf, written, type Layout } from './layout';
import { boardFrom, type BoardRead } from './reading';

const mostUndone = 500;

const idOf = (item: unknown): string | undefined =>
  isObject(item) && typeof item.id === 'string' ? item.id : undefined;

function listIn(raw: Json, key: 'nodes' | 'edges'): unknown[] {
  const listed = raw[key];
  if (Array.isArray(listed)) {
    return listed;
  }
  const made: unknown[] = [];
  raw[key] = made;
  return made;
}

function applied(
  raw: Json,
  edit: BoardEdit,
  newId: () => string,
): string | boolean {
  switch (edit.kind) {
    case 'place': {
      const nodes = listIn(raw, 'nodes');
      let moved = false;
      for (const { id, ...box } of edit.boxes) {
        const node = nodes.find((each) => idOf(each) === id);
        if (
          isObject(node) &&
          (node.x !== box.x ||
            node.y !== box.y ||
            node.width !== box.width ||
            node.height !== box.height)
        ) {
          Object.assign(node, box);
          moved = true;
        }
      }
      return moved;
    }
    case 'add': {
      const nodes = listIn(raw, 'nodes');
      if (!Array.isArray(raw.edges)) {
        raw.edges = [];
      }
      const id = newId();
      const { type, x, y, width, height } = edit.node;
      if (type === 'group') {
        nodes.unshift({ id, type, x, y, width, height });
      } else {
        nodes.push({ id, type, text: '', x, y, width, height });
      }
      return id;
    }
    case 'delete': {
      const gone = new Set(edit.nodes);
      const cut = new Set(edit.edges);
      const nodes = listIn(raw, 'nodes');
      const edges = listIn(raw, 'edges');
      const keptNodes = nodes.filter((node) => !gone.has(idOf(node) ?? ''));
      const keptEdges = edges.filter(
        (edge) =>
          !(
            cut.has(idOf(edge) ?? '') ||
            (isObject(edge) &&
              (gone.has(String(edge.fromNode)) ||
                gone.has(String(edge.toNode))))
          ),
      );
      if (
        keptNodes.length === nodes.length &&
        keptEdges.length === edges.length
      ) {
        return false;
      }
      raw.nodes = keptNodes;
      raw.edges = keptEdges;
      return true;
    }
    case 'connect': {
      const nodes = listIn(raw, 'nodes');
      const there = (id: string) => nodes.some((each) => idOf(each) === id);
      if (
        edit.fromNode === edit.toNode ||
        !there(edit.fromNode) ||
        !there(edit.toNode)
      ) {
        return false;
      }
      const id = newId();
      const { fromNode, fromSide, toNode, toSide } = edit;
      listIn(raw, 'edges').push({ id, fromNode, fromSide, toNode, toSide });
      return id;
    }
    case 'ends': {
      const chosen = new Set(edit.edges);
      let changed = false;
      for (const edge of listIn(raw, 'edges')) {
        if (!isObject(edge) || !chosen.has(idOf(edge) ?? '')) {
          continue;
        }
        for (const [key, value, unsaid] of [
          ['fromEnd', edit.fromEnd, 'none'],
          ['toEnd', edit.toEnd, 'arrow'],
        ] as const) {
          const now = edge[key] ?? unsaid;
          if (now === value) {
            continue;
          }
          changed = true;
          if (value === unsaid) {
            delete edge[key];
          } else {
            edge[key] = value;
          }
        }
      }
      return changed;
    }
    case 'text': {
      const node = listIn(raw, 'nodes').find((each) => idOf(each) === edit.id);
      const key =
        isObject(node) && node.type === 'group'
          ? 'label'
          : isObject(node) &&
              node.type === 'text' &&
              typeof node.text === 'string'
            ? 'text'
            : undefined;
      if (!isObject(node) || key === undefined || node[key] === edit.text) {
        return false;
      }
      node[key] = edit.text;
      return true;
    }
    default:
      return edit satisfies never;
  }
}

export class EditedBoard {
  private raw: Json;
  private readonly layout: Layout;
  private readonly undone: Json[] = [];
  private readonly redone: Json[] = [];
  private at = 0;
  private savedAt: number | undefined = 0;
  private typing: { readonly id: string; readonly session: number } | undefined;

  constructor(text: string) {
    this.layout = layoutOf(text);
    const json = withoutMark(text);
    const parsed: unknown = json.trim() === '' ? {} : JSON.parse(json);
    this.raw = isObject(parsed) ? parsed : {};
  }

  read(): BoardRead {
    return boardFrom(this.raw);
  }

  apply(
    edit: BoardEdit,
    newId: () => string,
  ): { readonly made?: string } | undefined {
    const typing =
      edit.kind === 'text' ? { id: edit.id, session: edit.session } : undefined;
    const joined =
      typing !== undefined &&
      this.typing?.id === typing.id &&
      this.typing.session === typing.session;
    const before = joined ? undefined : structuredClone(this.raw);
    const done = applied(this.raw, edit, newId);
    if (done === false) {
      return undefined;
    }
    this.typing = typing;
    if (before === undefined) {
      return {};
    }
    this.undone.push(before);
    if (this.undone.length > mostUndone) {
      this.undone.shift();
    }
    this.redone.length = 0;
    if (this.savedAt !== undefined && this.savedAt > this.at) {
      this.savedAt = undefined;
    }
    this.at++;
    return typeof done === 'string' ? { made: done } : {};
  }

  undo(): boolean {
    this.typing = undefined;
    const before = this.undone.pop();
    if (before === undefined) {
      return false;
    }
    this.redone.push(this.raw);
    this.raw = before;
    this.at--;
    return true;
  }

  redo(): boolean {
    this.typing = undefined;
    const after = this.redone.pop();
    if (after === undefined) {
      return false;
    }
    this.undone.push(this.raw);
    this.raw = after;
    this.at++;
    return true;
  }

  changed(): boolean {
    return this.at !== this.savedAt;
  }

  text(): string {
    return written(this.raw, this.layout);
  }

  saved(): void {
    this.typing = undefined;
    this.savedAt = this.at;
  }
}
