import { Readable, Writable } from 'node:stream';

/**
 * Node.js' Transform stream DOES NOT handle back pressure.
 *
 * So, I wrote my own.
 *
 * @author Hunter Perrin (SciActive Inc) <hperrin@port87.com>
 * @license Apache-2.0
 */
export class BackPressureTransform {
  readable: Readable;
  writable: Writable;

  constructor(
    transform: (chunk: any) => Promise<any> = async (chunk) => chunk,
    flush: () => Promise<any> = async () => null
  ) {
    let writeCallback: ((error?: Error | null | undefined) => void) | null =
      null;

    const readable = new Readable({
      read(_size) {
        if (writeCallback) {
          const callback = writeCallback;
          writeCallback = null;
          callback();
        }
      },
    });
    this.readable = readable;

    readable.on('error', (err) => {
      if (!writable.destroyed) {
        writable.destroy(err);
      }
    });

    const writable = new Writable({
      async write(chunk, _encoding, callback) {
        const output = await transform(chunk);

        const writeData = () => {
          if (output == null || readable.push(output)) {
            callback();
          } else {
            writeCallback = callback;
          }
        };

        if (readable.isPaused()) {
          readable.once('resume', writeData);
        } else {
          writeData();
        }
      },

      async final(callback) {
        const output = await flush();

        const writeData = () => {
          if (output != null) {
            readable.push(output);
          }

          readable.push(null);

          callback();
        };

        if (readable.isPaused()) {
          readable.once('resume', writeData);
        } else {
          writeData();
        }
      },
    });
    this.writable = writable;

    writable.on('error', (err) => {
      if (!readable.destroyed) {
        readable.destroy(err);
      }
    });
  }
}
