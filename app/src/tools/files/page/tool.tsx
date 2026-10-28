export function FilesTool({ active }: { active: boolean }) {
  return active ? <div className="repository files" /> : null;
}
