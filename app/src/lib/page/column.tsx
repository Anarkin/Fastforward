import { focusNameAttribute } from './viewFocus';
import { Toolbar } from './toolbar';
import { FloatingSearch } from './floatingSearch';

export function Column({
  title,
  resizer,
  start,
  actions,
  search,
  searching,
  searchOverTitle = false,
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
  searchOverTitle?: boolean;
  overlay?: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="column search-scope"
      {...{ [focusNameAttribute]: focusName }}
    >
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
      <div className="column-body search-area">{children}</div>
      {searching && (
        <FloatingSearch over={searchOverTitle}>{searching}</FloatingSearch>
      )}
      {status}
      {overlay}
      {resizer}
    </section>
  );
}
