export async function onigWasm(): Promise<ArrayBuffer> {
  const response = await fetch(new URL('onig.wasm', location.href));
  if (!response.ok) {
    throw new Error(`onig.wasm answered ${response.status}`);
  }
  return response.arrayBuffer();
}
