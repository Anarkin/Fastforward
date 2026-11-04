import type { TextEncoding } from '../shared/protocol';

const windowsCodePages = new Map<number, TextEncoding>([
  [874, 'windows-874'],
  [1250, 'windows-1250'],
  [1251, 'windows-1251'],
  [1252, 'windows-1252'],
  [1253, 'windows-1253'],
  [1254, 'windows-1254'],
  [1255, 'windows-1255'],
  [1256, 'windows-1256'],
  [1257, 'windows-1257'],
  [1258, 'windows-1258'],
]);

const languageCodePages: readonly (readonly [
  TextEncoding,
  readonly string[],
])[] = [
  ['windows-1250', ['bs', 'cs', 'hr', 'hu', 'pl', 'ro', 'sk', 'sl', 'sq']],
  [
    'windows-1251',
    ['ba', 'be', 'bg', 'kk', 'ky', 'mk', 'mn', 'ru', 'tg', 'tt', 'uk'],
  ],
  ['windows-1253', ['el']],
  ['windows-1254', ['az', 'tr']],
  ['windows-1255', ['he', 'yi']],
  ['windows-1256', ['ar', 'fa', 'ur']],
  ['windows-1257', ['et', 'lt', 'lv']],
  ['windows-1258', ['vi']],
  ['windows-874', ['th']],
];

export function encodingOfLocale(locale: string): TextEncoding {
  const [language = '', ...rest] = locale.toLowerCase().split(/[-_]/);
  if (language === 'sr') {
    return rest.includes('latn') ? 'windows-1250' : 'windows-1251';
  }
  const found = languageCodePages.find(([, languages]) =>
    languages.includes(language),
  );
  return found?.[0] ?? 'windows-1252';
}

export function encodingOfCodePage(
  codePage: number,
  locale: string,
): TextEncoding {
  return windowsCodePages.get(codePage) ?? encodingOfLocale(locale);
}

let known: Promise<TextEncoding> | undefined;

async function lookedUp(platform: NodeJS.Platform): Promise<TextEncoding> {
  const { locale } = Intl.DateTimeFormat().resolvedOptions();
  if (platform !== 'win32') {
    return encodingOfLocale(locale);
  }
  const { windowsCodePage } = await import('./windowsCodePage.js');
  return encodingOfCodePage(windowsCodePage(), locale);
}

export function systemCodePage(
  platform: NodeJS.Platform,
): Promise<TextEncoding> {
  known ??= lookedUp(platform);
  return known;
}
