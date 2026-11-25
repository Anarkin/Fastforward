import type { ContextMenuItem } from './contextMenuItem';
import { set, sourceItems, unset } from './sourceRows';
import { strings } from '../shared/strings';
import type { FileTabSize } from '../shared/tabSize';

export interface TabSizeShown {
  readonly file?: FileTabSize;
  readonly settings: number;
}

export interface TabSizeOpening {
  readonly file: (file: string) => void;
  readonly settings: () => void;
}

const { indentation } = strings;

export function drawnSize({ file, settings }: TabSizeShown): number {
  return file?.size ?? settings;
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
  return sourceItems(indentation.drawnHeading, [
    fileRow(shown.file, opening),
    set(
      indentation.widthFromSettings(indentation.columns(shown.settings)),
      opening.settings,
    ),
  ]);
}
