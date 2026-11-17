import type { Readable } from 'node:stream';
import { strings } from '../../../lib/shared/strings';

export class StoppedReading extends Error {}

export class GitOutput {
  private chunks: Buffer[] = [];
  private length = 0;
  private wake: (() => void) | undefined;
  private ended: Error | undefined;

  constructor(stream: Readable) {
    stream.on('data', (chunk: Buffer) => {
      this.chunks.push(chunk);
      this.length += chunk.length;
      this.wake?.();
    });
    const end = () => this.end(new Error(strings.errors.runningGitEnded));
    stream.on('end', end);
    stream.on('close', end);
    stream.on('error', end);
  }

  end(error: Error): void {
    this.ended ??= error;
    this.wake?.();
  }

  async until(byte: number): Promise<Buffer> {
    for (;;) {
      const joined = this.joined();
      const at = joined.indexOf(byte);
      if (at !== -1) {
        this.keep(joined.subarray(at + 1));
        return joined.subarray(0, at);
      }
      await this.more();
    }
  }

  async take(count: number): Promise<Buffer> {
    while (this.length < count) {
      await this.more();
    }
    const joined = this.joined();
    this.keep(joined.subarray(count));
    return joined.subarray(0, count);
  }

  async peek(count: number): Promise<Buffer> {
    while (this.length < count) {
      await this.more();
    }
    return this.joined().subarray(0, count);
  }

  async streamUntil(
    sequence: Buffer,
    onPart: (part: Buffer) => boolean,
  ): Promise<void> {
    for (;;) {
      const joined = this.joined();
      const at = joined.indexOf(sequence);
      if (at !== -1) {
        this.keep(joined.subarray(at + sequence.length));
        if (at > 0 && onPart(joined.subarray(0, at))) {
          throw new StoppedReading();
        }
        return;
      }
      const safe = joined.length - (sequence.length - 1);
      if (safe > 0) {
        this.keep(joined.subarray(safe));
        if (onPart(joined.subarray(0, safe))) {
          throw new StoppedReading();
        }
      }
      await this.more();
    }
  }

  private joined(): Buffer {
    const joined =
      this.chunks.length === 1 && this.chunks[0] !== undefined
        ? this.chunks[0]
        : Buffer.concat(this.chunks);
    this.chunks = [joined];
    return joined;
  }

  private keep(rest: Buffer): void {
    this.chunks = rest.length === 0 ? [] : [rest];
    this.length = rest.length;
  }

  private more(): Promise<void> {
    if (this.ended !== undefined) {
      return Promise.reject(this.ended);
    }
    return new Promise((resolve) => {
      this.wake = () => {
        this.wake = undefined;
        resolve();
      };
    });
  }
}
