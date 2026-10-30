export function CommanderTool({ active }: { active: boolean }) {
  return active ? <div className="repository commander" /> : null;
}
