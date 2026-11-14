import { strings } from '../../../lib/shared/strings';
import { folded } from '../../../lib/shared/textMatches';
import { byName } from '../../../lib/page/byName';
import type { RefInfo, RefKind } from '../shared/protocol';

const groups: readonly { kind: RefKind; title: string }[] = [
  { kind: 'branch', title: strings.search.localBranches },
  { kind: 'remote', title: strings.search.remoteBranches },
  { kind: 'tag', title: strings.search.tags },
];

export interface TreeNode {
  readonly name: string;
  readonly ref: RefInfo | undefined;
  readonly children: readonly TreeNode[];
}

export interface RefGroup {
  readonly kind: RefKind;
  readonly title: string;
  readonly refs: readonly RefInfo[];
  readonly names: readonly string[];
  readonly tree: TreeNode;
}

export function indexRefs(refs: readonly RefInfo[]): RefGroup[] {
  return groups.map((group) => {
    const sorted = refs
      .filter((ref) => ref.kind === group.kind)
      .toSorted(byName);
    return {
      ...group,
      refs: sorted,
      names: sorted.map((ref) => folded(ref.name)),
      tree: buildTree(sorted),
    };
  });
}

interface GrowingNode {
  name: string;
  ref: RefInfo | undefined;
  children: Map<string, GrowingNode>;
}

const foldersFirst = (a: TreeNode, b: TreeNode) =>
  Number(b.children.length > 0) - Number(a.children.length > 0) || byName(a, b);

function sortedTree({ name, ref, children }: GrowingNode): TreeNode {
  return {
    name,
    ref,
    children: [...children.values()].map(sortedTree).toSorted(foldersFirst),
  };
}

export function buildTree(refs: readonly RefInfo[]): TreeNode {
  const root: GrowingNode = { name: '', ref: undefined, children: new Map() };
  for (const ref of refs) {
    let node = root;
    for (const part of ref.name.split('/')) {
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, ref: undefined, children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
    node.ref = ref;
  }
  return sortedTree(root);
}
