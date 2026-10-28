export function TerminalTool({ active }: { active: boolean }) {
  return active ? <div className="repository terminal" /> : null;
}
