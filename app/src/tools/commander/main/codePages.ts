import type { TextEncoding } from '../shared/protocol';

const centralEuropean = new Set([
  'bs',
  'cs',
  'hr',
  'hu',
  'pl',
  'ro',
  'sk',
  'sl',
  'sq',
]);

const cyrillic = new Set([
  'ba',
  'be',
  'bg',
  'kk',
  'ky',
  'mk',
  'mn',
  'ru',
  'tg',
  'tt',
  'uk',
]);

export function encodingOfCodePage(codePage: number): TextEncoding {
  if (codePage === 1250) {
    return 'windows-1250';
  }
  return codePage === 1251 ? 'windows-1251' : 'windows-1252';
}

export function encodingOfLocale(locale: string): TextEncoding {
  const [language = '', ...rest] = locale.toLowerCase().split(/[-_]/);
  if (language === 'sr') {
    return rest.includes('latn') ? 'windows-1250' : 'windows-1251';
  }
  if (centralEuropean.has(language)) {
    return 'windows-1250';
  }
  return cyrillic.has(language) ? 'windows-1251' : 'windows-1252';
}

let known: Promise<TextEncoding> | undefined;

async function lookedUp(platform: NodeJS.Platform): Promise<TextEncoding> {
  if (platform !== 'win32') {
    return encodingOfLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  }
  const { windowsCodePage } = await import('./windowsCodePage.js');
  return encodingOfCodePage(windowsCodePage());
}

export function systemCodePage(
  platform: NodeJS.Platform,
): Promise<TextEncoding> {
  known ??= lookedUp(platform);
  return known;
}
