import { strings } from '../../../shared/strings';
import type { ContextMenuItem } from '../../../ui/contextMenu';
import { languageOf, languages } from '../../../ui/languages';

export type LanguageChoice = 'auto' | 'plain' | (string & {});

export function shownLanguage(
  choice: LanguageChoice,
  file: string,
): string | undefined {
  return choice === 'auto'
    ? languageOf(file)
    : choice === 'plain'
      ? undefined
      : choice;
}

const languageOfId = (id: string | undefined) =>
  languages.find((language) => language.id === id);

export function languageLabel(language: string | undefined): string {
  return languageOfId(language)?.name ?? strings.commander.plainText;
}

export function languageMenu(
  choice: LanguageChoice,
  file: string,
  choose: (choice: LanguageChoice) => void,
): ContextMenuItem[] {
  const { autoChoice, encodings, plainText } = strings.commander;
  const detected = languageOf(file);
  return [
    {
      label:
        choice === 'auto'
          ? autoChoice(languageLabel(detected))
          : encodings.auto,
      keywords: languageOfId(detected)?.keywords,
      checked: choice === 'auto',
      onClick: () => choose('auto'),
    },
    {
      label: plainText,
      checked: choice === 'plain',
      onClick: () => choose('plain'),
    },
    { separator: true },
    ...languages.map(({ id, name, keywords }) => ({
      label: name,
      keywords,
      checked: choice === id,
      onClick: () => choose(id),
    })),
  ];
}
