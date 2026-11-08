import { dragColumn } from './columns';
import { useGit, useGitActions } from './store';

function Resizer({ index }: { index: number }) {
  const widths = useGit((state) => state.columnWidths);
  const commitsHidden = useGit(
    (state) => !state.commitsShown && !state.searching,
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

export function Column({
  title,
  index,
  start,
  actions,
  search,
  searching,
  overlay,
  status,
  children,
}: {
  title?: React.ReactNode;
  index?: number;
  start?: React.ReactNode;
  actions?: React.ReactNode;
  search?: React.ReactNode;
  searching?: React.ReactNode;
  overlay?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="column">
      {searching ? (
        <header className="column-title searching">{searching}</header>
      ) : (
        <header className="column-title">
          {start && <div className="column-start">{start}</div>}
          {typeof title === 'string' ? (
            <span className="column-name">{title}</span>
          ) : (
            title
          )}
          {(actions || search) && (
            <div className="column-actions">
              {actions}
              {search}
            </div>
          )}
        </header>
      )}
      <div className="column-body">{children}</div>
      {status}
      {overlay}
      {index !== undefined && <Resizer index={index} />}
    </section>
  );
}
