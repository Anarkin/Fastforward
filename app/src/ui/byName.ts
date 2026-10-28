const collator = new Intl.Collator();

export const byName = (a: { name: string }, b: { name: string }) =>
  collator.compare(a.name, b.name);
