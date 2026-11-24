import { strings } from '../../../lib/shared/strings';
import { namedSigns } from './signNames';

const controls: readonly string[] = [
  'NULL',
  'START OF HEADING',
  'START OF TEXT',
  'END OF TEXT',
  'END OF TRANSMISSION',
  'ENQUIRY',
  'ACKNOWLEDGE',
  'BELL',
  'BACKSPACE',
  'CHARACTER TABULATION',
  'LINE FEED',
  'LINE TABULATION',
  'FORM FEED',
  'CARRIAGE RETURN',
  'SHIFT OUT',
  'SHIFT IN',
  'DATA LINK ESCAPE',
  'DEVICE CONTROL ONE',
  'DEVICE CONTROL TWO',
  'DEVICE CONTROL THREE',
  'DEVICE CONTROL FOUR',
  'NEGATIVE ACKNOWLEDGE',
  'SYNCHRONOUS IDLE',
  'END OF TRANSMISSION BLOCK',
  'CANCEL',
  'END OF MEDIUM',
  'SUBSTITUTE',
  'ESCAPE',
  'INFORMATION SEPARATOR FOUR',
  'INFORMATION SEPARATOR THREE',
  'INFORMATION SEPARATOR TWO',
  'INFORMATION SEPARATOR ONE',
];

const deleteName = 'DELETE';

const highControls: readonly string[] = [
  'PADDING CHARACTER',
  'HIGH OCTET PRESET',
  'BREAK PERMITTED HERE',
  'NO BREAK HERE',
  'INDEX',
  'NEXT LINE',
  'START OF SELECTED AREA',
  'END OF SELECTED AREA',
  'CHARACTER TABULATION SET',
  'CHARACTER TABULATION WITH JUSTIFICATION',
  'LINE TABULATION SET',
  'PARTIAL LINE FORWARD',
  'PARTIAL LINE BACKWARD',
  'REVERSE LINE FEED',
  'SINGLE SHIFT TWO',
  'SINGLE SHIFT THREE',
  'DEVICE CONTROL STRING',
  'PRIVATE USE ONE',
  'PRIVATE USE TWO',
  'SET TRANSMIT STATE',
  'CANCEL CHARACTER',
  'MESSAGE WAITING',
  'START OF GUARDED AREA',
  'END OF GUARDED AREA',
  'START OF STRING',
  'SINGLE GRAPHIC CHARACTER INTRODUCER',
  'SINGLE CHARACTER INTRODUCER',
  'CONTROL SEQUENCE INTRODUCER',
  'STRING TERMINATOR',
  'OPERATING SYSTEM COMMAND',
  'PRIVACY MESSAGE',
  'APPLICATION PROGRAM COMMAND',
];

const named = new Map(namedSigns);

const variationSelector = (code: number): number | undefined =>
  code >= 0xfe00 && code <= 0xfe0f
    ? code - 0xfe00 + 1
    : code >= 0xe0100 && code <= 0xe01ef
      ? code - 0xe0100 + 17
      : undefined;

const isNoncharacter = (code: number): boolean =>
  (code >= 0xfdd0 && code <= 0xfdef) || (code & 0xfffe) === 0xfffe;

function nameOf(code: number): string {
  if (code < 0x20) {
    return controls[code] ?? strings.characters.unassigned;
  }
  if (code === 0x7f) {
    return deleteName;
  }
  if (code >= 0x80 && code <= 0x9f) {
    return highControls[code - 0x80] ?? strings.characters.unassigned;
  }
  const selector = variationSelector(code);
  if (selector !== undefined) {
    return `VARIATION SELECTOR-${selector}`;
  }
  return (
    named.get(code) ??
    (isNoncharacter(code)
      ? strings.characters.noncharacter
      : strings.characters.unassigned)
  );
}

const codePoint = (code: number): string =>
  `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

export function characterLines(text: string): readonly string[] {
  return Array.from(text, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return strings.characters.line(codePoint(code), nameOf(code));
  });
}

export const characterTipText = (text: string): string =>
  characterLines(text).join('\n');
