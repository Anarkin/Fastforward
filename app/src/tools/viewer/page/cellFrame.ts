export const tileBytes = 16;

export const rectBytes = 12;

const tileShorts = tileBytes / 2;

const tileWords = tileBytes / 4;

const rectShorts = rectBytes / 2;

const rectWords = rectBytes / 4;

function doubled(data: ArrayBuffer): ArrayBuffer {
  const grown = new ArrayBuffer(data.byteLength * 2);
  new Uint8Array(grown).set(new Uint8Array(data));
  return grown;
}

export interface KeptCells {
  readonly tiles: Uint8Array;
  readonly rects: Uint8Array;
}

export class CellFrame {
  private tileData = new ArrayBuffer(tileBytes * 8192);
  private tilePlaces = new Int16Array(this.tileData);
  private tileGrounds = new Uint32Array(this.tileData);
  private rectData = new ArrayBuffer(rectBytes * 2048);
  private rectPlaces = new Int16Array(this.rectData);
  private rectColors = new Uint32Array(this.rectData);
  tileCount = 0;
  rectCount = 0;
  missing = 0;

  get tiles(): ArrayBuffer {
    return this.tileData;
  }

  get rects(): ArrayBuffer {
    return this.rectData;
  }

  reset(): void {
    this.tileCount = 0;
    this.rectCount = 0;
    this.missing = 0;
  }

  tile(
    x: number,
    y: number,
    u: number,
    v: number,
    width: number,
    height: number,
    ground: number,
  ): void {
    if ((this.tileCount + 1) * tileBytes > this.tileData.byteLength) {
      this.tileData = doubled(this.tileData);
      this.tilePlaces = new Int16Array(this.tileData);
      this.tileGrounds = new Uint32Array(this.tileData);
    }
    const at = this.tileCount * tileShorts;
    const places = this.tilePlaces;
    places[at] = x;
    places[at + 1] = y;
    places[at + 2] = u;
    places[at + 3] = v;
    places[at + 4] = width;
    places[at + 5] = height;
    this.tileGrounds[this.tileCount * tileWords + 3] = ground;
    this.tileCount++;
  }

  kept(tilesFrom: number, rectsFrom: number): KeptCells {
    return {
      tiles: new Uint8Array(
        this.tileData.slice(tilesFrom * tileBytes, this.tileCount * tileBytes),
      ),
      rects: new Uint8Array(
        this.rectData.slice(rectsFrom * rectBytes, this.rectCount * rectBytes),
      ),
    };
  }

  append({ tiles, rects }: KeptCells, right: number, down: number): void {
    while (
      this.tileCount * tileBytes + tiles.length >
      this.tileData.byteLength
    ) {
      this.tileData = doubled(this.tileData);
      this.tilePlaces = new Int16Array(this.tileData);
      this.tileGrounds = new Uint32Array(this.tileData);
    }
    while (
      this.rectCount * rectBytes + rects.length >
      this.rectData.byteLength
    ) {
      this.rectData = doubled(this.rectData);
      this.rectPlaces = new Int16Array(this.rectData);
      this.rectColors = new Uint32Array(this.rectData);
    }
    new Uint8Array(this.tileData).set(tiles, this.tileCount * tileBytes);
    new Uint8Array(this.rectData).set(rects, this.rectCount * rectBytes);
    const tileEnd = this.tileCount + tiles.length / tileBytes;
    const rectEnd = this.rectCount + rects.length / rectBytes;
    if (right !== 0 || down !== 0) {
      const tilePlaces = this.tilePlaces;
      for (
        let at = this.tileCount * tileShorts;
        at < tileEnd * tileShorts;
        at += tileShorts
      ) {
        tilePlaces[at] += right;
        tilePlaces[at + 1] += down;
      }
      const rectPlaces = this.rectPlaces;
      for (
        let at = this.rectCount * rectShorts;
        at < rectEnd * rectShorts;
        at += rectShorts
      ) {
        rectPlaces[at] += right;
        rectPlaces[at + 1] += down;
      }
    }
    this.tileCount = tileEnd;
    this.rectCount = rectEnd;
  }

  rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
  ): void {
    if ((this.rectCount + 1) * rectBytes > this.rectData.byteLength) {
      this.rectData = doubled(this.rectData);
      this.rectPlaces = new Int16Array(this.rectData);
      this.rectColors = new Uint32Array(this.rectData);
    }
    const at = this.rectCount * rectShorts;
    const places = this.rectPlaces;
    places[at] = x;
    places[at + 1] = y;
    places[at + 2] = width;
    places[at + 3] = height;
    this.rectColors[this.rectCount * rectWords + 2] = color;
    this.rectCount++;
  }
}
