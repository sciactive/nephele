export class ResourceNotModifiedError extends Error {
  etag?: string;
  lastModified?: Date;

  constructor(etag?: string, lastModified?: Date) {
    super();
    this.etag = etag;
    this.lastModified = lastModified;
  }
}
