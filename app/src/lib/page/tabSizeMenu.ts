import type { ContextMenuItem } from './contextMenuItem';
import { set, sourceItems, unset } from './sourceRows';
import { strings } from '../shared/strings';
import type { FileTabSize } from '../shared/tabSize';

export interface TabSizeShown {
  readonly chosen?: number;
  readonly file?: FileTabSize;
  readonly settings: number;
}

export interface TabSizeOpening {
  readonly file: (file: string) => void;
  readonly settings: () => void;
  readonly choose: (size: number | undefined) => void;
}

const choices = [2, 4, 8];

const { indentation } = strings;

export function drawnSize({ chosen, file, settings }: TabSizeShown): number {
  return chosen ?? file?.size ?? settings;
}

function fileRow(file: FileTabSize | undefined, opening: TabSizeOpening) {
  if (file === undefined) {
    return unset(indentation.widthNotInEditorConfig);
  }
  const named = file.file;
  return named === undefined
    ? unset(indentation.widthNotInEditorConfig)
    : set(
        indentation.widthFromEditorConfig(
          indentation.columns(file.size),
          file.key,
          named,
        ),
        () => opening.file(named),
      );
}

export function tabSizeItems(
  shown: TabSizeShown,
  opening: TabSizeOpening,
): ContextMenuItem[] {
  const { chosen, settings } = shown;
  return [
    ...sourceItems(indentation.drawnHeading, [
      chosen === undefined
        ? unset(indentation.noChosenWidth)
        : set(indentation.chosenWidth(indentation.columns(chosen))),
      fileRow(shown.file, opening),
      set(
        indentation.widthFromSettings(indentation.columns(settings)),
        opening.settings,
      ),
    ]),
    { separator: true },
    ...choices.map((size): ContextMenuItem => ({
      label: indentation.drawTabs(indentation.columns(size)),
      checked: chosen === size,
      onClick: () => opening.choose(size),
    })),
    {
      label: indentation.drawAsAsked,
      checked: chosen === undefined,
      onClick: () => opening.choose(undefined),
    },
  ];
}
