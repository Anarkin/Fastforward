import type { BookmarkSystem } from './bookmarks';

export interface PathTyping extends BookmarkSystem {
  readonly variable: (name: string) => string | undefined;
  readonly home: string | undefined;
  readonly knownFolder:
    ((name: string) => Promise<string | undefined>) | undefined;
}

const quoted = /^"[^"]*"$/;
const driveAlone = /^[a-z]:$/i;
const windowsVariable = /%([^%]+)%/g;
const posixVariable = /\$(?:\{([A-Za-z_]\w*)\}|([A-Za-z_]\w*))/g;
const windowsHome = /^~(?=$|[\\/])/;
const posixHome = /^~(?=$|\/)/;
const knownName = /^shell:([^\\/]+)(.*)$/is;

function withVariables(
  typed: string,
  { platform, variable }: PathTyping,
): string {
  return platform === 'win32'
    ? typed.replaceAll(
        windowsVariable,
        (whole, name: string) => variable(name) ?? whole,
      )
    : typed.replaceAll(
        posixVariable,
        (whole, braced: string | undefined, bare: string | undefined) =>
          variable(braced ?? bare ?? '') ?? whole,
      );
}

function withHome(typed: string, { platform, home }: PathTyping): string {
  const tilde = platform === 'win32' ? windowsHome : posixHome;
  return home !== undefined && tilde.test(typed)
    ? `${home}${typed.slice(1)}`
    : typed;
}

async function withKnownFolder(
  typed: string,
  { platform, knownFolder }: PathTyping,
): Promise<string> {
  const known = platform === 'win32' ? knownName.exec(typed) : null;
  if (known === null || knownFolder === undefined) {
    return typed;
  }
  const [, name = '', rest = ''] = known;
  const folder = await knownFolder(`shell:${name}`);
  return folder === undefined ? typed : `${folder}${rest}`;
}

export async function typedPath(
  typed: string,
  from: string,
  system: PathTyping,
): Promise<string | undefined> {
  const trimmed = typed.trim();
  const unquoted = quoted.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed;
  if (unquoted === '') {
    return undefined;
  }
  const whole = await withKnownFolder(
    withHome(withVariables(unquoted, system), system),
    system,
  );
  return system.paths.resolve(
    from,
    system.platform === 'win32' && driveAlone.test(whole)
      ? `${whole}\\`
      : whole,
  );
}
