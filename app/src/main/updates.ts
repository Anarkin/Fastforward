// Squirrel.Mac only installs signed updates, and the macOS app isn't signed;
// the portable Windows exe, which sets PORTABLE_EXECUTABLE_DIR, has nothing
// installed to update
export function checksForUpdates(
  development: boolean,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): boolean {
  return !development && platform !== 'darwin' && !env.PORTABLE_EXECUTABLE_DIR;
}
