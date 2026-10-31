export function Viewer({ file }: { file: string }) {
  return (
    <section className="column viewer" tabIndex={-1}>
      <header className="column-title">
        <span className="column-name">{file}</span>
      </header>
      <div className="column-body viewer-body" />
    </section>
  );
}
