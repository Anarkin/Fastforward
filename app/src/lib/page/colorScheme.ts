const darkScheme = '(prefers-color-scheme: dark)';

export function watchScheme(told: () => void): () => void {
  const scheme = window.matchMedia(darkScheme);
  scheme.addEventListener('change', told);
  return () => scheme.removeEventListener('change', told);
}

export const darkNow = () => window.matchMedia(darkScheme).matches;
