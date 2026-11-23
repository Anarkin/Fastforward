const mostCharacters = 1_000_000;

export function onceAText<Ways extends readonly unknown[], Found>(
  find: (text: string, ...ways: Ways) => Found,
  most = mostCharacters,
): (text: string, ...ways: Ways) => Found {
  const found = new Map<
    string,
    { readonly ways: Ways; readonly found: Found }[]
  >();
  let characters = 0;
  return (text, ...ways) => {
    const all = found.get(text) ?? [];
    let one = all.find((each) =>
      each.ways.every((way, at) => way === ways[at]),
    );
    if (one === undefined) {
      one = { ways, found: find(text, ...ways) };
      all.push(one);
      characters += text.length;
    }
    found.delete(text);
    found.set(text, all);
    for (const [oldest, old] of found) {
      if (characters <= most || oldest === text) {
        break;
      }
      found.delete(oldest);
      characters -= oldest.length * old.length;
    }
    return one.found;
  };
}
