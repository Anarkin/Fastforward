import { Resizer } from './columns';

// Columns with an index have a resizer on their right edge; actions sit on the
// right of the title
export function Column({
  title,
  index,
  actions,
  children,
}: {
  title: React.ReactNode;
  index?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="column">
      <header className="column-title">
        {title}
        {actions && <div className="column-actions">{actions}</div>}
      </header>
      <div className="column-body">{children}</div>
      {index !== undefined && <Resizer index={index} />}
    </section>
  );
}
