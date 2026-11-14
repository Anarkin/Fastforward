import { strings } from '../shared/strings';
import type { ContextMenuItem } from './menuControls';
import { languages } from './languages';
import { MenuButton } from './menu';

export type LanguageChoice = 'auto' | 'plain' | (string & {});

export function shownLanguage(
  choice: LanguageChoice,
  detected: string | undefined,
): string | undefined {
  return choice === 'auto' ? detected : choice === 'plain' ? undefined : choice;
}

const languageOfId = (id: string | undefined) =>
  languages.find((language) => language.id === id);

export function languageButtonLabel(
  choice: LanguageChoice,
  detected: string | undefined,
  single: boolean,
): string {
  const { auto, plainText } = strings.common;
  if (!single) {
    return choice === 'plain' ? plainText : auto;
  }
  return languageOfId(shownLanguage(choice, detected))?.name ?? plainText;
}

export function languageMenu(
  choice: LanguageChoice,
  detected: string | undefined,
  single: boolean,
  choose: (choice: LanguageChoice) => void,
): ContextMenuItem[] {
  const { auto, autoChoice, plainText } = strings.common;
  const named = single && choice === 'auto';
  const modes: ContextMenuItem[] = [
    {
      label: named
        ? autoChoice(languageOfId(detected)?.name ?? plainText)
        : auto,
      keywords: named ? languageOfId(detected)?.keywords : undefined,
      checked: choice === 'auto',
      onClick: () => choose('auto'),
    },
    {
      label: plainText,
      checked: choice === 'plain',
      onClick: () => choose('plain'),
    },
  ];
  return single
    ? [
        ...modes,
        { separator: true },
        ...languages.map(({ id, name, keywords }) => ({
          label: name,
          keywords,
          checked: choice === id,
          onClick: () => choose(id),
        })),
      ]
    : modes;
}

export interface KeptLanguage {
  readonly language: string | undefined;
  readonly keep: (language: string | undefined) => void;
}

export interface Highlighting {
  readonly on: boolean;
  readonly change: (on: boolean) => void;
}

export function languageChoiceOf(
  file: string | undefined,
  highlighting: Highlighting,
  kept: KeptLanguage,
): {
  readonly choice: LanguageChoice;
  readonly choose: (choice: LanguageChoice) => void;
} {
  const choice = kept.language ?? (highlighting.on ? 'auto' : 'plain');
  const choose = (chosen: LanguageChoice) => {
    if (chosen === 'auto' || chosen === 'plain') {
      kept.keep(undefined);
      highlighting.change(chosen === 'auto');
    } else if (file !== undefined) {
      kept.keep(chosen);
    }
  };
  return { choice, choose };
}

export function LanguageButton({
  choice,
  detected,
  single,
  choose,
  trigger,
  onChosen,
}: {
  choice: LanguageChoice;
  detected: string | undefined;
  single: boolean;
  choose: (choice: LanguageChoice) => void;
  trigger?: React.Ref<HTMLButtonElement>;
  onChosen?: () => void;
}) {
  const { language, findLanguage } = strings.common;
  return (
    <div className="language-button">
      <MenuButton
        title={language}
        trigger={trigger}
        label={languageButtonLabel(choice, detected, single)}
        filter={single ? findLanguage : undefined}
        items={languageMenu(choice, detected, single, choose)}
        onChosen={onChosen}
      />
    </div>
  );
}
