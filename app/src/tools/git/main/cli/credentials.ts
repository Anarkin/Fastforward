const userInfo = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#]*@/gi;

export function withoutCredentials(text: string): string {
  return text.replace(userInfo, '$1');
}
