const invisible =
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}\p{Noncharacter_Code_Point}\uFFFC]/u;

const drawnOtherwise = (character: string): boolean =>
  character === '\t' || character === '\n' || character === '\r';

const emojiStart =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3)/u;

const modifier = /\p{Emoji_Modifier}/u;

const escaped = (code: number) => `\\u${code.toString(16).padStart(4, '0')}`;

const controlCodes = [
  ...Array.from({ length: 0x20 }, (_, code) => code).filter(
    (code) => code !== 0x09 && code !== 0x0a && code !== 0x0d,
  ),
  0x7f,
];

const controlClass = `[${controlCodes.map(escaped).join('')}]`;

export const controlCharacters = (): RegExp => new RegExp(controlClass, 'g');

export interface InvisiblePart {
  readonly text: string;
  readonly hidden: boolean;
}

const isInvisible = (character: string): boolean =>
  invisible.test(character) && !drawnOtherwise(character);

export function invisibleParts(
  cluster: string,
): readonly InvisiblePart[] | undefined {
  if (emojiStart.test(cluster)) {
    return undefined;
  }
  const parts: InvisiblePart[] = [];
  let visible = '';
  for (const character of cluster) {
    const hidden = isInvisible(character);
    if (hidden || modifier.test(character)) {
      if (visible !== '') {
        parts.push({ text: visible, hidden: false });
        visible = '';
      }
      parts.push({ text: character, hidden });
    } else {
      visible += character;
    }
  }
  if (visible !== '') {
    parts.push({ text: visible, hidden: false });
  }
  return parts.length > 1 || parts.some((part) => part.hidden)
    ? parts
    : undefined;
}
