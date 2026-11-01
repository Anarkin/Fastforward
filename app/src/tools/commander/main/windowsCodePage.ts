import koffi from 'koffi';

export function windowsCodePage(): number {
  const getCodePage = koffi.load('kernel32.dll').func('uint32_t GetACP()');
  return Number(getCodePage());
}
