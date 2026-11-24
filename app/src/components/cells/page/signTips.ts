import { blankSignOf } from '../../../lib/page/blankSigns';
import { invisibleParts } from '../../../lib/page/invisibles';
import { characterTip } from '../../../lib/page/tips';
import { characterTipText } from './characterNames';
import { strings } from '../../../lib/shared/strings';

export interface ClientBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function signedText(text: string): string {
  if (blankSignOf(text, true) === strings.symbols.invisible) {
    return text;
  }
  return (invisibleParts(text) ?? [])
    .filter((part) => part.hidden)
    .map((part) => part.text)
    .join('');
}

const keyApart = '|';

export class SignTips {
  private anchor: HTMLElement | undefined;
  private key: string | undefined;

  constructor(private readonly page: Document) {}

  at(place: string, text: string, box: ClientBox): HTMLElement | undefined {
    const key = `${place}${keyApart}${text}`;
    if (this.anchor === undefined || this.key !== key) {
      this.clear();
      const signed = signedText(text);
      if (signed === '') {
        return undefined;
      }
      this.anchor = this.page.createElement('span');
      this.anchor.className = 'sign-tip';
      this.anchor.setAttribute('data-tip', characterTipText(signed));
      this.anchor.setAttribute(characterTip, '');
      this.page.body.append(this.anchor);
      this.key = key;
    }
    const { style } = this.anchor;
    style.left = `${box.left}px`;
    style.top = `${box.top}px`;
    style.width = `${box.width}px`;
    style.height = `${box.height}px`;
    return this.anchor;
  }

  clear(): void {
    this.anchor?.remove();
    this.anchor = undefined;
    this.key = undefined;
  }
}
