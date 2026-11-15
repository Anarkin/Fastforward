import { useState } from 'react';
import { parentFolder, type Side } from '../shared/protocol';
import { pathParts } from '../shared/paths';
import { plainOf } from '../../../lib/shared/sentences';
import { strings } from '../../../lib/shared/strings';
import { useShellActions } from '../../../shell/page/store';
import { useCommander, useCommanderActions } from './store';
import { whatOf } from './items';

export function dropTargetOf(
  folder: string,
  into: string | undefined,
  platform: string | undefined,
): string {
  if (into === undefined) {
    return folder;
  }
  if (into === parentFolder) {
    return pathParts(folder).at(-2)?.path ?? folder;
  }
  const separator = platform === 'win32' ? '\\' : '/';
  return /[\\/]$/.test(folder)
    ? `${folder}${into}`
    : `${folder}${separator}${into}`;
}

function dropIntoOf(target: EventTarget | null): string | null {
  const row = target instanceof Element ? target.closest('[data-drop]') : null;
  return row?.getAttribute('data-drop') ?? null;
}

export function useFileDrop(side: Side) {
  const inArchive = useCommander(
    (state) => state.view.panes[side]?.archive !== undefined,
  );
  const folder = useCommander((state) => state.view.panes[side]?.folder);
  const platform = useCommander((state) => state.view.platform);
  const actions = useCommanderActions();
  const { showMenu } = useShellActions();
  const [dropInto, setDropInto] = useState<string | null>();
  const onDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files') || inArchive) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const into = dropIntoOf(event.target);
    if (into !== dropInto) {
      setDropInto(into);
    }
  };
  const onDragLeave = (event: React.DragEvent) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !event.currentTarget.contains(event.relatedTarget)
    ) {
      setDropInto(undefined);
    }
  };
  const onDrop = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('Files') || inArchive) {
      return;
    }
    event.preventDefault();
    setDropInto(undefined);
    const dropped = [...event.dataTransfer.files];
    const [first] = dropped;
    if (first === undefined || folder === undefined) {
      return;
    }
    const into = dropIntoOf(event.target) ?? undefined;
    const what = whatOf(dropped.length, first.name);
    const target = dropTargetOf(folder, into, platform);
    showMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: strings.commander.dropCopy,
          title: plainOf(strings.commander.dropCopyTitle(what, target)),
          onClick: () => actions.dropOn(side, dropped, into, false),
        },
        {
          label: strings.commander.dropMove,
          title: plainOf(strings.commander.dropMoveTitle(what, target)),
          onClick: () => actions.dropOn(side, dropped, into, true),
        },
      ],
    });
  };
  return { dropInto, onDragOver, onDragLeave, onDrop };
}
