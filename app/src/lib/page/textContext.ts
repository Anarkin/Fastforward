export interface TextUpdate extends Event {
  readonly updateRangeStart: number;
  readonly updateRangeEnd: number;
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export interface CharacterBoundsUpdate extends Event {
  readonly rangeStart: number;
  readonly rangeEnd: number;
}

interface TextContextEvents {
  readonly textupdate: TextUpdate;
  readonly characterboundsupdate: CharacterBoundsUpdate;
  readonly compositionstart: Event;
  readonly compositionend: Event;
}

export interface TextContext {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  updateText(rangeStart: number, rangeEnd: number, text: string): void;
  updateSelection(start: number, end: number): void;
  updateControlBounds(bounds: DOMRect): void;
  updateSelectionBounds(bounds: DOMRect): void;
  updateCharacterBounds(rangeStart: number, bounds: DOMRect[]): void;
  addEventListener<Kind extends keyof TextContextEvents>(
    kind: Kind,
    listener: (event: TextContextEvents[Kind]) => void,
  ): void;
  removeEventListener<Kind extends keyof TextContextEvents>(
    kind: Kind,
    listener: (event: TextContextEvents[Kind]) => void,
  ): void;
}

interface TextContextInit {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

declare global {
  interface HTMLElement {
    editContext?: TextContext | null;
  }

  interface Window {
    EditContext?: new (init: TextContextInit) => TextContext;
  }
}

export function textContextIn(
  element: HTMLElement,
  init: TextContextInit,
): TextContext | undefined {
  const Context = element.ownerDocument.defaultView?.EditContext;
  if (Context === undefined) {
    return undefined;
  }
  const context = new Context(init);
  element.editContext = context;
  return context;
}

export const takesText = (element: HTMLElement): boolean =>
  (element.editContext ?? null) !== null;
