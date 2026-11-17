import { dragColumn } from './columns';
import { useGit, useGitActions } from './store';
import { commitsShownOf, searchingOf } from './selectors';

export function ColumnResizer({ index }: { index: number }) {
  const widths = useGit((state) => state.columnWidths);
  const commitsHidden = useGit(
    (state) => !commitsShownOf(state) && !searchingOf(state),
  );
  const { resizeColumns, resetColumn } = useGitActions();
  return (
    <div
      className="resizer"
      onPointerDown={(event) =>
        dragColumn(event, index, widths, [commitsHidden, false], resizeColumns)
      }
      onDoubleClick={() => resetColumn(index)}
    />
  );
}
