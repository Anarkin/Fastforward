export function statesIn(text: string): string[] {
  const named = [
    ...text.matchAll(
      /\bconst\s+(\[[^\]]*\]|\w+)\s*(?::[^=]*)?=\s*use(?:State|Reducer)\b/g,
    ),
  ].map(([, held = '']) => {
    const [first = '', setter = ''] = held.startsWith('[')
      ? held
          .slice(1, -1)
          .split(/,(?![^{]*\})/)
          .map((part) => part.trim())
      : [held];
    return /^\w+$/.test(first)
      ? first
      : setter.replace(/^set(\w)/, (_, letter: string) => letter.toLowerCase());
  });
  const calls = text.match(/\buse(?:State|Reducer)\s*[<(]/g)?.length ?? 0;
  return calls === named.length ? named : [...named, '?'];
}

function argumentAt(text: string, open: number): string {
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    const char = text[at];
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(open + 1, at);
      }
    }
  }
  return text.slice(open + 1);
}

export function seededFromStore(text: string): string[] {
  const actions = [
    ...text.matchAll(/const\s*\{([^}]*)\}\s*=\s*use\w*Actions\(\)/g),
  ].flatMap(([, names = '']) =>
    names
      .split(',')
      .map((name) => name.split(':').at(-1)?.trim() ?? '')
      .filter((name) => name !== ''),
  );
  const selected = [
    ...text.matchAll(
      /\bconst\s+(\w+)\s*(?::[^=]*)?=\s*use(?:Shell|Git|Commander|Viewer|Editor|Diff|Terminal|Canvas|Store)\b/g,
    ),
  ].map(([, name = '']) => name);
  const reads = new RegExp(
    [String.raw`\.getState\(\)`, String.raw`\buse[A-Z]\w*\(`]
      .concat(actions.map((name) => String.raw`\b${name}\(`))
      .concat(selected.map((name) => String.raw`(?<![.\w])${name}\b(?!\s*:)`))
      .join('|'),
  );
  return [
    ...text.matchAll(
      /\bconst\s+(\[[^\]]*\]|\w+)\s*(?::[^=]*)?=\s*use(?:State|Reducer)\s*(?:<[^(]*>)?\(/g,
    ),
  ].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    return reads.test(argumentAt(text, open)) ? [match[1] ?? '?'] : [];
  });
}
