import { Resizer } from './columns';

export function Column({
  title,
  index,
  start,
  actions,
  footer,
  children,
}: {
  title?: React.ReactNode;
  index?: number;
  start?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="column">
      <header className="column-title">
        {start && <div className="column-start">{start}</div>}
        {title}
        {actions && <div className="column-actions">{actions}</div>}
      </header>
      <div className="column-body">{children}</div>
      {footer && <footer className="column-footer">{footer}</footer>}
      {index !== undefined && <Resizer index={index} />}
    </section>
  );
}
