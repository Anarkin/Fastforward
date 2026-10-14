import { Resizer } from './columns';

export function Column({
  title,
  index,
  start,
  actions,
  search,
  overlay,
  children,
}: {
  title?: React.ReactNode;
  index?: number;
  start?: React.ReactNode;
  actions?: React.ReactNode;
  search?: React.ReactNode;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="column">
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
      <div className="column-body">{children}</div>
      {overlay}
      {index !== undefined && <Resizer index={index} />}
    </section>
  );
}
