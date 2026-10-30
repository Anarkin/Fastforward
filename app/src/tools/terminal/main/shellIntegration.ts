import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IntegrationSystem {
  readonly platform: NodeJS.Platform;
  readonly integration: string;
  readonly isFile: (file: string) => boolean;
}

interface Command {
  readonly file: string;
  readonly args: readonly string[];
}

type Env = Readonly<Record<string, string>>;

const powerShellPrompt = String.raw`$global:__fastforwardPrompt = $function:prompt
function global:prompt {
  $prompt = & $global:__fastforwardPrompt
  $location = $ExecutionContext.SessionState.Path.CurrentLocation
  if ($location.Provider.Name -eq 'FileSystem') {
    "$([char]27)]9;9;$($location.ProviderPath)$([char]7)$prompt"
  } else {
    $prompt
  }
}`;

function bashPromptCommand(platform: NodeJS.Platform): string {
  const folder =
    platform === 'win32'
      ? String.raw`if [[ $PWD != "$__fastforward_pwd" ]]; then __fastforward_pwd=$PWD; __fastforward_folder=$(pwd -W 2>/dev/null || cygpath -w "$PWD" 2>/dev/null || pwd); fi; printf '\e]9;9;%s\a' "$__fastforward_folder"`
      : String.raw`printf '\e]9;9;%s\a' "$PWD"`;
  return String.raw`__fastforward_status=$?; ${folder}; __fastforward_return() { return $__fastforward_status; }; __fastforward_return`;
}

const zshEnv = `if (( \${+FASTFORWARD_ZDOTDIR} )); then
  ZDOTDIR=$FASTFORWARD_ZDOTDIR
  unset FASTFORWARD_ZDOTDIR
else
  unset ZDOTDIR
fi
if [[ -f "\${ZDOTDIR:-$HOME}/.zshenv" ]]; then
  source "\${ZDOTDIR:-$HOME}/.zshenv"
fi
if [[ -o interactive ]]; then
  __fastforward_folder() {
    printf '\\e]9;9;%s\\a' "$PWD"
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook precmd __fastforward_folder
fi
`;

const fishInit = String.raw`function __fastforward_folder --on-event fish_prompt; printf '\e]9;9;%s\a' $PWD; end`;

const cmdPrompt = '$E]9;9;$P$E\\';

const powerShellCommands = [
  'command',
  'file',
  'encodedcommand',
  'commandwithargs',
];

function zshFolder(integration: string): string {
  return path.join(integration, 'zsh');
}

export function writeShellIntegration(integration: string): void {
  const folder = zshFolder(integration);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, '.zshenv'), zshEnv);
}

function shellOf(file: string): string {
  return path.win32
    .basename(file)
    .toLowerCase()
    .replace(/\.exe$/, '');
}

function parameterOf(arg: string): string | undefined {
  return /^[-/](.+)$/.exec(arg)?.[1]?.toLowerCase();
}

function runsCommand(args: readonly string[]): boolean {
  return args
    .map(parameterOf)
    .some(
      (name) =>
        name !== undefined &&
        (name === 'ec' ||
          name === 'cwa' ||
          powerShellCommands.some((command) => command.startsWith(name))),
    );
}

function staysOpen(args: readonly string[]): boolean {
  return args
    .map(parameterOf)
    .some(
      (name) =>
        name !== undefined && name.length >= 3 && 'noexit'.startsWith(name),
    );
}

function withVariable(
  env: Env,
  name: string,
  value: (existing: string | undefined) => string,
  platform: NodeJS.Platform,
): Env {
  const same = (other: string) =>
    platform === 'win32'
      ? other.toUpperCase() === name.toUpperCase()
      : other === name;
  const existing = Object.entries(env).find(([other]) => same(other))?.[1];
  return {
    ...Object.fromEntries(
      Object.entries(env).filter(([other]) => !same(other)),
    ),
    [name]: value(existing),
  };
}

export function integrated(
  { file, args }: Command,
  env: Env,
  { platform, integration, isFile }: IntegrationSystem,
): Command & { readonly env: Env } {
  switch (shellOf(file)) {
    case 'pwsh':
    case 'powershell':
      return runsCommand(args)
        ? { file, args, env }
        : {
            file,
            args: [
              ...args,
              ...(staysOpen(args) ? [] : ['-NoExit']),
              '-EncodedCommand',
              Buffer.from(powerShellPrompt, 'utf16le').toString('base64'),
            ],
            env,
          };
    case 'bash':
      return {
        file,
        args,
        env: withVariable(
          env,
          'PROMPT_COMMAND',
          (existing) =>
            existing
              ? `${bashPromptCommand(platform)}; ${existing}`
              : bashPromptCommand(platform),
          platform,
        ),
      };
    case 'zsh': {
      const folder = zshFolder(integration);
      return isFile(path.join(folder, '.zshenv'))
        ? {
            file,
            args,
            env: {
              ...env,
              ZDOTDIR: folder,
              ...(env.ZDOTDIR !== undefined && {
                FASTFORWARD_ZDOTDIR: env.ZDOTDIR,
              }),
            },
          }
        : { file, args, env };
    }
    case 'fish':
      return { file, args: ['--init-command', fishInit, ...args], env };
    case 'cmd':
      return {
        file,
        args,
        env: withVariable(
          env,
          'PROMPT',
          (existing) => `${cmdPrompt}${existing ?? '$P$G'}`,
          platform,
        ),
      };
    default:
      return { file, args, env };
  }
}
