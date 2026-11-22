type Listener = () => void;

export const bufferUsage = { copyDst: 8, vertex: 32, uniform: 64 } as const;

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

interface Gpu {
  device: GPUDevice | undefined;
  generation: number;
  asked: boolean;
}

const gpu: Gpu = { device: undefined, generation: 0, asked: false };

const listeners = new Set<Listener>();

function told(): void {
  gpu.generation++;
  for (const listener of listeners) {
    listener();
  }
}

function ask(): void {
  gpu.asked = true;
  void navigator.gpu
    .requestAdapter()
    .then((adapter) => adapter?.requestDevice())
    .then(
      (made) => {
        if (made === undefined) {
          return;
        }
        gpu.device = made;
        told();
        void made.lost.then(() => {
          if (gpu.device === made) {
            gpu.device = undefined;
            told();
            ask();
          }
        });
      },
      () => undefined,
    );
}

export function gpuSupported(
  page: { readonly gpu?: unknown } = navigator,
): boolean {
  return typeof page.gpu === 'object' && page.gpu !== null;
}

export function gpuDevice(): GPUDevice | undefined {
  if (!gpu.asked && gpuSupported()) {
    ask();
  }
  return gpu.device;
}

export const gpuGeneration = (): number => gpu.generation;

export function watchGpu(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
