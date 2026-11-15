export function sharedBytes(length: number): Uint8Array<SharedArrayBuffer> {
  return new Uint8Array(new SharedArrayBuffer(length));
}

export function sharedInts(length: number): Int32Array<SharedArrayBuffer> {
  return new Int32Array(
    new SharedArrayBuffer(length * Int32Array.BYTES_PER_ELEMENT),
  );
}

export function sharedTimes(length: number): Float64Array<SharedArrayBuffer> {
  return new Float64Array(
    new SharedArrayBuffer(length * Float64Array.BYTES_PER_ELEMENT),
  );
}

export function grownBytes(array: Uint8Array): Uint8Array<ArrayBuffer> {
  const bigger = new Uint8Array(array.length * 2);
  bigger.set(array);
  return bigger;
}

export function grownInts(array: Int32Array): Int32Array<ArrayBuffer> {
  const bigger = new Int32Array(array.length * 2);
  bigger.set(array);
  return bigger;
}

export function grownTimes(array: Float64Array): Float64Array<ArrayBuffer> {
  const bigger = new Float64Array(array.length * 2);
  bigger.set(array);
  return bigger;
}
