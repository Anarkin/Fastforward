import { strings } from '../shared/strings';
import { MenuButton } from './menu';
import {
  type LanguageChoice,
  languageButtonLabel,
  languageMenu,
} from './languageMenu';

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
