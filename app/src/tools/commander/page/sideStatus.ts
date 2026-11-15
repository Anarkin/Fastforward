import { type Row } from './listing';
import { type PaneView } from './paneView';
import { pathIn } from './copiedText';

export function goesOn(pane: PaneView | undefined): boolean {
  return (
    pane?.flat?.progress.reading === true ||
    pane?.duplicates?.reading === true ||
    (pane?.counting ?? 0) > 0
  );
}

export function selectedPathOf(
  pane: PaneView | undefined,
  selected: Row | undefined,
  platform: string | undefined,
): string | undefined {
  return pane === undefined ||
    (pane.flat === undefined && pane.duplicates === undefined) ||
    goesOn(pane) ||
    selected?.entry === undefined ||
    selected.entry.folder
    ? undefined
    : pathIn(pane.folder, selected.key, platform);
}
