import { focusNameAttribute } from './viewFocus';
import { Toolbar } from './toolbar';

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
          {start && <Toolbar className="column-start">{start}</Toolbar>}
          {typeof title === 'string' ? (
            <span className="column-name">{title}</span>
          ) : (
            title
          )}
          {(actions || search) && (
            <Toolbar className="column-actions">
              {actions}
              {search}
            </Toolbar>
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
