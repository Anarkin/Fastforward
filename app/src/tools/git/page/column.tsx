import { Resizer } from './columns';

export function Column({
  title,
  index,
  start,
  actions,
  search,
  searching,
  overlay,
  children,
}: {
  title?: React.ReactNode;
  index?: number;
  start?: React.ReactNode;
  actions?: React.ReactNode;
  search?: React.ReactNode;
  searching?: React.ReactNode;
  overlay?: React.ReactNode;
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
      {overlay}
      {index !== undefined && <Resizer index={index} />}
    </section>
  );
}
