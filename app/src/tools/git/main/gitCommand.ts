import { inheritedEnv } from '../../../lib/main/gitCommand';

export function userCodeEnv(): NodeJS.ProcessEnv {
  return { ...inheritedEnv(), GIT_TERMINAL_PROMPT: '0', GIT_ADVICE: '0' };
}

export function gitProcessOptions(platform = process.platform): {
  readonly windowsHide: true;
  readonly detached: boolean;
} {
  return { windowsHide: true, detached: platform !== 'win32' };
}
