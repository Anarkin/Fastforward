export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);
