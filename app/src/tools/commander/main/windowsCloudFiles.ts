import koffi from 'koffi';

const apartmentThreaded = 0x2;
const inProcess = 0x1;
const isMember = 0;
const pointerSize = 8;

function guid(text: string): Buffer {
  const hex = text.replaceAll('-', '');
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(Number.parseInt(hex.slice(0, 8), 16), 0);
  bytes.writeUInt16LE(Number.parseInt(hex.slice(8, 12), 16), 4);
  bytes.writeUInt16LE(Number.parseInt(hex.slice(12, 16), 16), 6);
  Buffer.from(hex.slice(16), 'hex').copy(bytes, 8);
  return bytes;
}

const googleDriveCloudOverlay = guid('A8E52322-8734-481D-A7E2-27B309EF8D56');
const overlayIdentifierId = guid('0C6C4200-C589-11D0-999A-00C04FD655E1');

function created(): (file: string) => boolean {
  const ole32 = koffi.load('ole32.dll');
  const initialize = ole32.func(
    'int32_t CoInitializeEx(void *reserved, uint32_t flags)',
  );
  const createInstance = ole32.func(
    'int32_t CoCreateInstance(const void *clsid, void *outer, uint32_t context, const void *iid, _Out_ void **object)',
  );
  const isMemberOf = koffi.proto(
    'int32_t __stdcall OverlayIsMemberOf(void *self, const char16_t *path, uint32_t attributes)',
  );
  initialize(null, apartmentThreaded);
  const handler: unknown[] = [null];
  const result = Number(
    createInstance(
      googleDriveCloudOverlay,
      null,
      inProcess,
      overlayIdentifierId,
      handler,
    ),
  );
  const object = handler[0];
  if (result < 0 || object === null) {
    return () => false;
  }
  const table: unknown = koffi.decode(object, 'void *');
  const method: unknown = koffi.decode(table, 3 * pointerSize, 'void *');
  return (file) =>
    Number(koffi.call(method, isMemberOf, object, file, 0)) === isMember;
}

let streams: ((file: string) => boolean) | undefined;

export function streamsFromGoogleDrive(file: string): boolean {
  streams ??= created();
  return streams(file);
}
