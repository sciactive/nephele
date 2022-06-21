export interface Options {
  /**
   * Use compression while transferring files from the server to the client.
   *
   * This can reduce transfer times, but at the cost of not having progress
   * bars, since it's not feasible for the server to know the total size of the
   * transfer before it begins sending data and report that to the client.
   *
   * In the interest of being more user-friendly by default, this feature is
   * turned off. If you regularly transfer large, uncompressed files, you might
   * want to enable this feature. If you mostly transfer files that are already
   * compressed (encoded video, images, audio, compressed file archives, etc)
   * this option won't make a big difference.
   *
   * Compression from client to server is always supported and can't be turned
   * off.
   */
  compression: boolean;
}

export const defaults: Options = {
  compression: false,
};
