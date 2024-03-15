# S3 (or Compatible) Object Storage Nephele Adapter

A Nephele adapter that uses an S3 or S3 compatible object storage service as the storage backend.

It is tested using [MinIO](https://min.io/), which is an S3 compatible object storage server, but it should also work with AWS S3, Cloudflare R2, Backblaze B2, Digital Ocean Spaces, Ceph, etc. If you encounter any issues with an S3 compatible object store, please file a bug report in the Nephele repository.

# Installation

```sh
npm i -s @nephele/adapter-s3
```

# Usage

The default export is the adapter, and it's also a named export "Adapter". Instantiate this class, providing an options object, and give that to Nephele as the adapter.

```js
import express from 'express';
import nepheleServer from 'nephele';
import S3Adapter from '@nephele/adapter-s3';
import ExampleAuthenticator from '@nephele/authenticator-example';

const app = express();
const port = 8080;

app.use(
  '/',
  nepheleServer({
    adapter: new S3Adapter({
      s3Config: {
        endpoint: 'https://mys3endpointurl/',
        region: 'us-east-1,
        credentials: {
          accessKeyId: 'my-s3-access-key',
          secretAccessKey: 'my-s3-secret-key-shh-dont-tell',
        },
      },
      bucket: 'MyBucket,
    }),
    authenticator: new ExampleAuthenticator(),
  })
);

app.listen(port, () => {
  console.log(`Nephele WebDAV server listening on port ${port}`);
});
```

# Options / Defaults

- `s3Config`: The S3 client config object.
- `bucket`: The S3 bucket.
- `uploadQueueSize` = `4`: The number of chunks to upload simultaneously to the storage.
- `root` = `''`: The path in the S3 bucket to be the root of the adapter. '' means the root of the bucket.

## s3Config

See https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/TypeAlias/S3ClientConfigType/

# Properties and Locks

WebDAV properties and locks are stored in the metadata of objects. There is no support for properties or locks on a directory, since S3 doesn't really have "real" directories.

# Empty Directories

S3 does not have the concept of an empty directory, since "directories" are just common prefixes among keys. As such, Nephele represents an empty directory in S3 by creating an empty object under the directory with the name ".nepheleempty". It is safe to delete these objects. It is the same as deleting the empty directory.

# License

Copyright 2022-2024 SciActive Inc

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
