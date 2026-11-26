import { markCharacter } from '../../../components/encodings/shared/byteOrderMarks';
import type { Json } from '../../../lib/main/json';

export interface Layout {
  readonly style: 'objectsALine' | 'indented' | 'oneLine';
  readonly indent: string;
  readonly ending: '\n' | '\r\n';
  readonly finalEnding: boolean;
  readonly bom: boolean;
}

const objectStartingALine = /^[ \t]*\{"/m;

const keyWithoutSpace = /^[ \t]+"(?:[^"\\]|\\.)*":[^ ]/m;

const firstIndent = /^([ \t]+)\S/m;

export function layoutOf(text: string): Layout {
  const bom = text.startsWith(markCharacter);
  const json = bom ? text.slice(1) : text;
  const ending = json.includes('\r\n') ? '\r\n' : '\n';
  const body = json.trimEnd();
  const indent = firstIndent.exec(body)?.[1] ?? '\t';
  const style =
    body !== '' && !body.includes('\n')
      ? 'oneLine'
      : body === '' ||
          objectStartingALine.test(body) ||
          keyWithoutSpace.test(body)
        ? 'objectsALine'
        : 'indented';
  return {
    style,
    indent,
    ending,
    finalEnding: body !== '' && json.endsWith('\n'),
    bom,
  };
}

function objectsALine(raw: Json, unit: string): string {
  const entries = Object.entries(raw).map(([key, value]) => {
    const named = `${unit}${JSON.stringify(key)}:`;
    if (!Array.isArray(value)) {
      return `${named}${JSON.stringify(value)}`;
    }
    if (value.length === 0) {
      return `${named}[]`;
    }
    const items = value.map((item) => `${unit}${unit}${JSON.stringify(item)}`);
    return `${named}[\n${items.join(',\n')}\n${unit}]`;
  });
  return entries.length === 0 ? '{}' : `{\n${entries.join(',\n')}\n}`;
}

export function written(raw: Json, layout: Layout): string {
  const body =
    layout.style === 'objectsALine'
      ? objectsALine(raw, layout.indent)
      : layout.style === 'indented'
        ? JSON.stringify(raw, null, layout.indent)
        : JSON.stringify(raw);
  const ended = body.replaceAll('\n', layout.ending);
  return `${layout.bom ? markCharacter : ''}${ended}${layout.finalEnding ? layout.ending : ''}`;
}
