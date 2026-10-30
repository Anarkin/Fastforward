import { strings } from '../../../shared/strings';

export interface CloneAsk {
  readonly url: string;
  readonly folder: string;
  readonly name: string;
}

export interface CloneProgress {
  readonly phase: string;
  readonly percent: number;
  readonly detail?: string;
}

export type CloneView =
  | ({ readonly kind: 'form'; readonly message?: string } & CloneAsk)
  | {
      readonly kind: 'running';
      readonly url: string;
      readonly target: string;
      readonly progress?: CloneProgress;
    };

const scheme = /^[a-z][a-z0-9+.-]*:\/\//i;
const trailingSeparators = /[\\/]+$/;
const gitSuffix = /(?:[\\/]\.git|\.git)$/i;
const forbiddenCharacters = /[<>:"/\\|?*\p{Cc}]/u;
const reservedNames = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/i;
const urlLike = /^(?:(?:https?|ssh|git|file):\/\/|[\w.-]+@[\w.-]+:)[^\s]+$/i;

export function cloneName(url: string): string {
  const path = url
    .trim()
    .replace(scheme, '')
    .replace(trailingSeparators, '')
    .replace(gitSuffix, '')
    .replace(trailingSeparators, '');
  const name = path.slice(
    Math.max(
      path.lastIndexOf('/'),
      path.lastIndexOf('\\'),
      path.lastIndexOf(':'),
    ) + 1,
  );
  return nameProblem(name) === undefined ? name : '';
}

export function urlProblem(url: string): string | undefined {
  if (/[\r\n]/.test(url.trim())) {
    return strings.clone.urlOneLine;
  }
  const trimmed = url.trim();
  if (trimmed.startsWith('-')) {
    return strings.clone.urlDash;
  }
  if (/^ext::/i.test(trimmed)) {
    return strings.clone.urlExt;
  }
  return undefined;
}

export function nameProblem(name: string): string | undefined {
  if (name === '') {
    return strings.clone.noName;
  }
  return name === '.' ||
    name === '..' ||
    forbiddenCharacters.test(name) ||
    /[. ]$/.test(name) ||
    reservedNames.test(name)
    ? strings.clone.badName(name)
    : undefined;
}

export function cloneProblem(ask: CloneAsk): string | undefined {
  if (ask.url.trim() === '') {
    return strings.clone.noUrl;
  }
  return urlProblem(ask.url) ?? nameProblem(ask.name);
}

export function clonableUrl(text: string): string | undefined {
  const trimmed = text.trim();
  return urlLike.test(trimmed) && urlProblem(trimmed) === undefined
    ? trimmed
    : undefined;
}

export function targetPath(folder: string, name: string): string {
  if (/[\\/]$/.test(folder)) {
    return folder + name;
  }
  return `${folder}${folder.includes('\\') ? '\\' : '/'}${name}`;
}
