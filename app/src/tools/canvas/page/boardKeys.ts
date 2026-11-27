import { useBinding } from '../../../lib/page/shortcuts';
import { nextEnds } from './arrows';
import { canvasKeymap } from './keymap';
import { useShellActions } from '../../../shell/page/store';
import { openNode, openedOf } from './links';
import {
  boardShown,
  filesShown,
  selectedShown,
  typingShown,
  type Placing,
} from './state';
import { useCanvas, useCanvasActions } from './store';

export function useBoardKeys(startPlacing: (kind: Placing) => void): void {
  const tab = useCanvas((state) => state.tab);
  const board = useCanvas((state) => boardShown(state)?.board);
  const selected = useCanvas(selectedShown);
  const placing = useCanvas((state) => state.placing);
  const typing = useCanvas(typingShown);
  const files = useCanvas(filesShown);
  const { followPath } = useShellActions();
  const { select, place, edit, undo, redo, save, startTyping, stopTyping } =
    useCanvasActions();
  const shownTab = tab !== undefined && board !== undefined;
  const calm = shownTab && typing === undefined;
  const [only] = selected.length === 1 ? selected : [];
  const onlyNode = board?.nodes.find((node) => node.id === only);
  const typeable = onlyNode?.type === 'text' || onlyNode?.type === 'group';
  const opened = openedOf(onlyNode, files);

  useBinding(canvasKeymap.placeText, () => startPlacing('text'), shownTab);
  useBinding(canvasKeymap.placeGroup, () => startPlacing('group'), shownTab);
  useBinding(
    canvasKeymap.delete,
    () => {
      if (tab !== undefined) {
        const edges = new Set(board?.edges.map((each) => each.id));
        edit(tab, {
          kind: 'delete',
          nodes: selected.filter((id) => !edges.has(id)),
          edges: selected.filter((id) => edges.has(id)),
        });
      }
    },
    calm && selected.length > 0,
  );
  useBinding(
    canvasKeymap.selectAll,
    () => {
      if (tab !== undefined && board !== undefined) {
        select(
          tab,
          board.nodes.map((node) => node.id),
        );
      }
    },
    calm,
  );
  useBinding(
    canvasKeymap.leave,
    () => {
      if (placing !== undefined) {
        place(undefined);
      } else if (tab !== undefined) {
        select(tab, []);
      }
    },
    calm && (placing !== undefined || selected.length > 0),
  );
  const selectedEdges =
    board?.edges.filter((edge) => selected.includes(edge.id)) ?? [];
  useBinding(
    canvasKeymap.point,
    () => {
      const [first] = selectedEdges;
      if (tab !== undefined && first !== undefined) {
        edit(tab, {
          kind: 'ends',
          edges: selectedEdges.map((edge) => edge.id),
          ...nextEnds(first),
        });
      }
    },
    calm && selectedEdges.length > 0,
  );
  useBinding(
    canvasKeymap.typeIn,
    () => {
      if (tab !== undefined && only !== undefined) {
        startTyping(tab, only);
      }
    },
    calm && placing === undefined && typeable,
  );
  const settled = (then: (tab: string) => void) => {
    if (tab === undefined) {
      return;
    }
    stopTyping(tab);
    then(tab);
  };
  useBinding(canvasKeymap.undo, () => settled(undo), shownTab);
  useBinding(canvasKeymap.redo, () => settled(redo), shownTab);
  useBinding(canvasKeymap.save, () => tab !== undefined && save(tab), shownTab);
  useBinding(
    canvasKeymap.openNode,
    () => opened !== undefined && openNode(opened, followPath),
    calm && placing === undefined && opened !== undefined,
  );
}
