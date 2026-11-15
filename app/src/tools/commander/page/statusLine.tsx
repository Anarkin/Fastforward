export function StatusLine({
  children,
  font,
  announced = false,
}: {
  children: React.ReactNode;
  font: 'monospace' | 'proportional';
  announced?: boolean;
}) {
  return (
    <footer
      className={
        font === 'monospace' ? 'column-status monospace' : 'column-status'
      }
    >
      <span
        className="column-status-text"
        role={announced ? 'status' : undefined}
      >
        {children}
      </span>
    </footer>
  );
}
