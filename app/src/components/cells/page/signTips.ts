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

export class SignTips {
  private anchor: HTMLElement | undefined;
  private key: string | undefined;

  constructor(private readonly page: Document) {}

  at(key: string, text: string, box: ClientBox): HTMLElement | undefined {
    if (this.anchor !== undefined && this.key === key) {
      return this.anchor;
    }
    this.clear();
    const signed = signedText(text);
    if (signed === '') {
      return undefined;
    }
    const anchor = this.page.createElement('span');
    anchor.className = 'sign-tip';
    anchor.setAttribute('data-tip', characterTipText(signed));
    anchor.setAttribute(characterTip, '');
    anchor.style.left = `${box.left}px`;
    anchor.style.top = `${box.top}px`;
    anchor.style.width = `${box.width}px`;
    anchor.style.height = `${box.height}px`;
    this.page.body.append(anchor);
    this.anchor = anchor;
    this.key = key;
    return anchor;
  }

  clear(): void {
    this.anchor?.remove();
    this.anchor = undefined;
    this.key = undefined;
  }
}
