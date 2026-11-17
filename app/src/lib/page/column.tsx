import { focusNameAttribute } from './viewFocus';

export function Column({
  title,
  resizer,
  start,
  actions,
  search,
  searching,
  overlay,
  status,
  focusName,
  children,
}: {
  focusName?: string;
  title?: React.ReactNode;
  resizer?: React.ReactNode;
  start?: React.ReactNode;
  actions?: React.ReactNode;
  search?: React.ReactNode;
  searching?: React.ReactNode;
  overlay?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="column" {...{ [focusNameAttribute]: focusName }}>
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
      {resizer}
    </section>
  );
}
