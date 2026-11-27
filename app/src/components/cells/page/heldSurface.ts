import { CellSurface } from './cellSurface';
import { gpuDevice } from './gpuDevice';

export class HeldSurface {
  private surface: CellSurface | undefined;

  constructor(private readonly className: string) {}

  in(host: HTMLElement): CellSurface | undefined {
    const device = gpuDevice();
    if (device === undefined) {
      return undefined;
    }
    if (this.surface?.device !== device) {
      this.surface?.dispose();
      this.surface = new CellSurface(device);
      this.surface.canvas.className = this.className;
      host.append(this.surface.canvas);
    }
    return this.surface;
  }

  dispose(): void {
    this.surface?.dispose();
    this.surface = undefined;
  }
}
