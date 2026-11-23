import { useCallback } from 'react';
import type { KeptText } from '../../../components/cells/page/cellView';
import { useViewer, useViewerActions } from './store';

export const mostKeptText = 65_536;

export interface KeptViewerSelection {
  readonly body: string;
  readonly version?: string | undefined;
  readonly anchor: { readonly start: number; readonly char: number };
  readonly focus: { readonly start: number; readonly char: number };
  readonly text: string;
}

function keptSelectionOf(
  kept: KeptViewerSelection | undefined,
  body: string,
  version: string | undefined,
): KeptText | undefined {
  return kept === undefined || kept.body !== body || kept.version !== version
    ? undefined
    : {
        selection: { anchor: kept.anchor, focus: kept.focus },
        text: kept.text,
      };
}

function selectionKept(
  kept: KeptText | undefined,
  body: string,
  version: string | undefined,
): KeptViewerSelection | undefined {
  return kept === undefined || kept.text.length > mostKeptText
    ? undefined
    : {
        body,
        version,
        anchor: kept.selection.anchor,
        focus: kept.selection.focus,
        text: kept.text,
      };
}

export function useKeptSelection(
  tab: string,
  body: string,
  version: string | undefined,
): {
  readonly kept: KeptText | undefined;
  readonly onKept: (kept: KeptText | undefined) => void;
} {
  const { keepViewer } = useViewerActions();
  const selected = useViewer((state) => state.tabViews.get(tab)?.selected);
  const onKept = useCallback(
    (next: KeptText | undefined) =>
      keepViewer(tab, { selected: selectionKept(next, body, version) }),
    [keepViewer, tab, body, version],
  );
  return { kept: keptSelectionOf(selected, body, version), onKept };
}
