export function StatusLine({
  children,
  end,
  tone,
  announced = false,
}: {
  children: React.ReactNode;
  end?: React.ReactNode;
  tone?: 'warning' | 'error';
  announced?: boolean;
}) {
  return (
    <footer
      className={tone === undefined ? 'column-status' : `column-status ${tone}`}
    >
      <span
        className="column-status-text"
        role={announced ? 'status' : undefined}
      >
        {children}
      </span>
      {end !== undefined && <span className="column-status-end">{end}</span>}
    </footer>
  );
}
