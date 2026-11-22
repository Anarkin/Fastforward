type Listener = () => void;

export const bufferUsage = { copyDst: 8, uniform: 64, storage: 128 } as const;

export const textureUsage = {
  copyDst: 2,
  textureBinding: 4,
  renderAttachment: 16,
} as const;

export const shaderStage = { vertex: 1, fragment: 2 } as const;

export function isGpuContext(context: unknown): context is GPUCanvasContext {
  return (
    typeof context === 'object' && context !== null && 'configure' in context
  );
}

interface Lost {
  readonly lost: Promise<unknown>;
}

interface Asked<Device> {
  requestAdapter(): Promise<{
    requestDevice(): Promise<Device | undefined>;
  } | null>;
}

interface Gpu<Device> {
  readonly device: () => Device | undefined;
  readonly generation: () => number;
  readonly refused: () => boolean;
  readonly watch: (listener: Listener) => () => void;
}

export function gpuOf<Device extends Lost>(page: {
  readonly gpu?: Asked<Device> | undefined;
}): Gpu<Device> {
  const listeners = new Set<Listener>();
  let device: Device | undefined;
  let generation = 0;
  let asked = false;
  let refused = false;
  const told = () => {
    generation++;
    for (const listener of listeners) {
      listener();
    }
  };
  const refuse = () => {
    refused = true;
    told();
  };
  const ask = (gpu: Asked<Device>) => {
    asked = true;
    void gpu
      .requestAdapter()
      .then((adapter) => adapter?.requestDevice())
      .then((made) => {
        if (made === undefined) {
          refuse();
          return;
        }
        device = made;
        told();
        void made.lost.then(() => {
          if (device === made) {
            device = undefined;
            told();
            ask(gpu);
          }
        });
      }, refuse);
  };
  return {
    device: () => {
      if (!asked && page.gpu !== undefined) {
        ask(page.gpu);
      }
      return device;
    },
    generation: () => generation,
    refused: () => refused || page.gpu === undefined,
    watch: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const gpu = gpuOf<GPUDevice>(navigator);

export const gpuDevice = gpu.device;

export const gpuGeneration = gpu.generation;

export const gpuRefused = gpu.refused;

export const watchGpu = gpu.watch;
