import koffi, { type TypeObject } from 'koffi';

type Defined = TypeObject;

function reused(name: string | undefined, define: () => Defined): Defined {
  if (name !== undefined) {
    try {
      return koffi.type(name);
    } catch {
      return define();
    }
  }
  return define();
}

export function protoOnce(definition: string): Defined {
  return reused(/(\w+)\s*\(/.exec(definition)?.[1], () =>
    koffi.proto(definition),
  );
}

export function structOnce(
  name: string,
  fields: Record<string, string | TypeObject>,
): Defined {
  return reused(name, () => koffi.struct(name, fields));
}
