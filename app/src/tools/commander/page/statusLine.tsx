export function StatusLine({
  children,
  font,
  end,
  tone,
  announced = false,
}: {
  children: React.ReactNode;
  font: 'monospace' | 'proportional';
  end?: React.ReactNode;
  tone?: 'warning' | 'error';
  announced?: boolean;
}) {
  return (
    <footer
      className={['column-status', font === 'monospace' && 'monospace', tone]
        .filter(Boolean)
        .join(' ')}
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
