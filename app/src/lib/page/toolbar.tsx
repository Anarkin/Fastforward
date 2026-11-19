export function Toolbar({ className, ...rest }: React.ComponentProps<'div'>) {
  return (
    <div
      className={className === undefined ? 'toolbar' : `toolbar ${className}`}
      {...rest}
    />
  );
}

export function ToolbarSpace() {
  return <span className="toolbar-space" />;
}
