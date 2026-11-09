import { strings, type Sentence } from '../../../shared/strings';

const keptByWindows = /[<>:"/\\|?*\p{Cc}]/u;
const devicesOfWindows = /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/i;

export function nameProblem(
  name: string,
  platform: string | undefined,
): Sentence | undefined {
  const { commander } = strings;
  if (name === '') {
    return commander.noName;
  }
  if (name === '.' || name === '..') {
    return commander.dotName;
  }
  if (platform !== 'win32') {
    return /[/\0]/.test(name) ? commander.nameCantHold('/') : undefined;
  }
  if (keptByWindows.test(name)) {
    return commander.nameCantHold('\\ / : * ? " < > |');
  }
  if (devicesOfWindows.test(name)) {
    return commander.reservedName(name);
  }
  return /[. ]$/.test(name) ? commander.nameEnd : undefined;
}
