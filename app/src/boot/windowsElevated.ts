import koffi from 'koffi';

const tokenQuery = 0x0008;

const tokenElevation = 20;

const elevationBytes = 4;

export function windowsElevated(): boolean {
  const kernel32 = koffi.load('kernel32.dll');
  const advapi32 = koffi.load('advapi32.dll');
  const currentProcess = kernel32.func('void *GetCurrentProcess()');
  const closeHandle = kernel32.func('bool CloseHandle(void *handle)');
  const openProcessToken = advapi32.func(
    'bool OpenProcessToken(void *process, uint32_t access, _Out_ void **token)',
  );
  const tokenInformation = advapi32.func(
    'bool GetTokenInformation(void *token, int kind, _Out_ uint32_t *information, uint32_t length, _Out_ uint32_t *returned)',
  );
  const token: unknown[] = [null];
  if (openProcessToken(currentProcess(), tokenQuery, token) !== true) {
    return false;
  }
  try {
    const elevation = [0];
    const returned = [0];
    return (
      tokenInformation(
        token[0],
        tokenElevation,
        elevation,
        elevationBytes,
        returned,
      ) === true && elevation[0] !== 0
    );
  } finally {
    closeHandle(token[0]);
  }
}
