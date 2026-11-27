import * as assert from 'node:assert';
import * as fs from 'node:fs';

export const nodesSaved = (board: string) => {
  const saved: unknown = JSON.parse(fs.readFileSync(board, 'utf8'));
  assert.ok(typeof saved === 'object' && saved !== null && 'nodes' in saved);
  assert.ok(Array.isArray(saved.nodes));
  return saved.nodes.flatMap((node: unknown) =>
    typeof node === 'object' &&
    node !== null &&
    'id' in node &&
    'x' in node &&
    'y' in node
      ? [{ id: node.id, x: node.x, y: node.y }]
      : [],
  );
};

export const placeSaved = (board: string, id: string) => {
  const saved: unknown = JSON.parse(fs.readFileSync(board, 'utf8'));
  const nodes: unknown = Reflect.get(Object(saved), 'nodes');
  assert.ok(Array.isArray(nodes));
  const at = nodes.findIndex(
    (each: unknown) => Reflect.get(Object(each), 'id') === id,
  );
  return { at, color: Reflect.get(Object(nodes[at]), 'color') };
};

export const textSaved = (board: string, id: string) => {
  const saved: unknown = JSON.parse(fs.readFileSync(board, 'utf8'));
  assert.ok(typeof saved === 'object' && saved !== null && 'nodes' in saved);
  assert.ok(Array.isArray(saved.nodes));
  const found: unknown = saved.nodes.find(
    (node: unknown) =>
      typeof node === 'object' &&
      node !== null &&
      'id' in node &&
      node.id === id,
  );
  return typeof found === 'object' && found !== null && 'text' in found
    ? found.text
    : undefined;
};

export const edgesSaved = (board: string) => {
  const saved: unknown = JSON.parse(fs.readFileSync(board, 'utf8'));
  assert.ok(typeof saved === 'object' && saved !== null && 'edges' in saved);
  assert.ok(Array.isArray(saved.edges));
  return saved.edges.flatMap((edge: unknown) =>
    typeof edge === 'object' &&
    edge !== null &&
    'fromNode' in edge &&
    'fromSide' in edge &&
    'toSide' in edge
      ? [
          `${String(edge.fromNode)} ${String(edge.fromSide)} ${String(edge.toSide)}`,
        ]
      : [],
  );
};
