# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.0.0-alpha.2](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2022-08-09)


### Features

* convert into proper monorepo packages ([be54d3c](https://github.com/sciactive/nephele/commit/be54d3cd3c06c0691f46593bbcac24203a9cebe3))





# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.0.0-alpha.1](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.0...v1.0.0-alpha.1) (2022-08-08)


### Features

* use crc32c for etags for files 100mb or less in filesystem adapter ([437d010](https://github.com/sciactive/nephele/commit/437d01010a3818c9c7b55a7759fed7fca2a0f80d))


### Bug Fixes

* correct error on mkcol request on an existing non-collection resource ([1654602](https://github.com/sciactive/nephele/commit/165460251b27fa92d55ab149a8e98e6734b06865))
* don't allow put or mkcol to run unless the parent resource is a collection ([6a46088](https://github.com/sciactive/nephele/commit/6a46088940c4ff0e58c86224ea9b94cd61b8c325))
* don't send content length header on partial content response ([46359d0](https://github.com/sciactive/nephele/commit/46359d00d1ba6032a0ae8184097d4f45fe783ce5))
* properly terminate a get response when the request is aborted ([78c0d83](https://github.com/sciactive/nephele/commit/78c0d8331108b38a5d5b547a3638baa68bbdfee2))
* update old id spawn username and groupname method to userid package ([f7040d0](https://github.com/sciactive/nephele/commit/f7040d0fa51a87c32e766c6d3f2f6b53ff32fe64))

## 1.0.0-alpha.0 (2022-08-08)


### Features

* add debug messages ([52171b5](https://github.com/sciactive/nephele/commit/52171b57e9097571e92f4c7a2335d3dfed4c6147))
* add delete method support ([d59da37](https://github.com/sciactive/nephele/commit/d59da37d13890904a67cf8a5d1a47e47a7873f8a))
* add example filesystem adapter strictly meant for testing ([d7b2de5](https://github.com/sciactive/nephele/commit/d7b2de53bcec33ca9fa4c443e81df489909602b3))
* add lock and unlock method support ([92ae750](https://github.com/sciactive/nephele/commit/92ae750ce771f145070ac7ae5bac848a333cd0f5))
* add logic for mkcol method ([5df0a8c](https://github.com/sciactive/nephele/commit/5df0a8c7d2ff56098c804e673c79d8c75d44395e))
* add more audio mime type to compressed formats list ([ba48f5e](https://github.com/sciactive/nephele/commit/ba48f5e5d677723223fa578a9a7fd142cc6eac9a))
* add more live properties and improve xml prefix resolution ([cd97e57](https://github.com/sciactive/nephele/commit/cd97e570a27a329f3cb13018148b18d9fce6f364))
* add more text, video, and image mime type to compressed formats list ([4cf26ee](https://github.com/sciactive/nephele/commit/4cf26ee9eb5b63bf9ef7acb88c91b75ad06a9540))
* add move method support ([e5304e6](https://github.com/sciactive/nephele/commit/e5304e6e65117a29870f344c696ec83b5e5b3265))
* add multistatus class, with status and propstatstatus classes, which render to xml ([ca8e09b](https://github.com/sciactive/nephele/commit/ca8e09bf35a1c7a8edd96782ed83383f0ed1a5a3))
* add options method support ([9c99fb3](https://github.com/sciactive/nephele/commit/9c99fb31810f6584a31ee4f5f77ca2310b787285))
* add options object and compression option ([daa5dd4](https://github.com/sciactive/nephele/commit/daa5dd4cfc259d996a66a155ed215995fd8d47ca))
* add proppatch method support ([1387f07](https://github.com/sciactive/nephele/commit/1387f07689e7a4bb4e75eb4e4b8e71c6682bd7b5))
* add request id for debug logging and fix put responses ([eec229a](https://github.com/sciactive/nephele/commit/eec229ac1d8be4232c88526a5bd3f9945d0a8440))
* add testing server root dir setting ([2810ee9](https://github.com/sciactive/nephele/commit/2810ee983615a3257613b1b817f61665e4c69d61))
* added property storage logic, more error types, custom method handling ([7c0b4ec](https://github.com/sciactive/nephele/commit/7c0b4ecb9101623bb19cf5b3ce091b79d84e2eb8))
* check requests for forbidden path segments ([0500b3b](https://github.com/sciactive/nephele/commit/0500b3b92aac9bf921009429acb72b7a22234da8))
* chown new files to the correct user ([7f15c68](https://github.com/sciactive/nephele/commit/7f15c68e42b633c357d4b7e6bc977b1f9fc3e2aa))
* delete orphaned config files on folder delete ([33f7baa](https://github.com/sciactive/nephele/commit/33f7baacf8667dc1f2b77269db3e4baf6b068644))
* error handler function for http errors ([10786d9](https://github.com/sciactive/nephele/commit/10786d931ea3e800c268bb759b510ab8cc7ad4b7))
* finish response portion of propfind, request parsing is stil to do ([c49109a](https://github.com/sciactive/nephele/commit/c49109a7ec0e525bbaade8adb13bfd60b0ca0610))
* finished copy method ([0cbb602](https://github.com/sciactive/nephele/commit/0cbb602c9f57a74f2f6dc1473171296b8b050be1))
* finished most of copy method, still needs to delete existing collections ([3f97afe](https://github.com/sciactive/nephele/commit/3f97afe6349b86a80e5e311c9f016f8bc4c83da7))
* finished propfind method ([ae92095](https://github.com/sciactive/nephele/commit/ae92095a9b72acd488c0c6ac0a507255d5ef4016))
* implement compression options and media type based conditional compression ([954cca3](https://github.com/sciactive/nephele/commit/954cca31c5c424f055bd5b3a2c94f8ddac7952bd))
* implement GET, HEAD, and PUT ([e1c72cd](https://github.com/sciactive/nephele/commit/e1c72cd8c6a486c2f637c0539a7630c4ecc9778a))
* initial commit ([20aac3a](https://github.com/sciactive/nephele/commit/20aac3ab88a1a6eb89a0fa56c310aa6075ffcc5d))
* move body parsing to separate functions, introduce xml parser, start propfind method ([55db0ab](https://github.com/sciactive/nephele/commit/55db0ab2f482f571b62ad9ba44029613b47836e2))
* parse and follow the If header, move conditional request logic to Method class ([7194e30](https://github.com/sciactive/nephele/commit/7194e3040e2b1affdb403950ae667ae5ad70bcbf))
* properly implement and check for locks in all required methods ([a391a9c](https://github.com/sciactive/nephele/commit/a391a9cb7fe112dfefec2b897b04107d5a4a099a))
* send partial content on range requests ([4df4dd8](https://github.com/sciactive/nephele/commit/4df4dd8df4ba6c369cfd7e4e0dabe205c4f41756))
* sort compressed mime types object ([dc082f8](https://github.com/sciactive/nephele/commit/dc082f8fac63eb15eac79392fda111c1397a5bee))
* use prefixes the client provides and improve xml rendering ([7c37114](https://github.com/sciactive/nephele/commit/7c37114b2b103a33efdf044ede805f005c701b87))


### Bug Fixes

* a problem with file paths ([8de1f9b](https://github.com/sciactive/nephele/commit/8de1f9b7e8312e35ecd33be03419e81ea2bf5034))
* add node engine requirement ([d28787d](https://github.com/sciactive/nephele/commit/d28787db310aad76971bac89f00ae8b59295a814))
* add pretty print format for errors in debug log ([7f315c1](https://github.com/sciactive/nephele/commit/7f315c117a8b89df8183d0a077d5ed24f14ccda9))
* always use a trailing slash in a collection's canonical path ([5732f6f](https://github.com/sciactive/nephele/commit/5732f6f063a71f265ac35b77624f16494c73e649))
* broken stream timeout ([8078386](https://github.com/sciactive/nephele/commit/8078386119c9816a7857e094cb0e15672aa32ef8))
* error code for unretrievable properties ([3ef7da6](https://github.com/sciactive/nephele/commit/3ef7da6745444a387d66231b382c6e8939d3ef67))
* export interfaces from regular files instead of declaration files ([b478eee](https://github.com/sciactive/nephele/commit/b478eeed9653f0956456bbb330de72311a83afb8))
* lint script name in prepare script ([b53805f](https://github.com/sciactive/nephele/commit/b53805fb76a169c270a7d01d9457157f996e63cb))
* no authentication required for options request ([67ebb64](https://github.com/sciactive/nephele/commit/67ebb64439e2245c6a70626332413f84ee1c9983))
* only check file permissions if pam auth is enabled in file system adapter ([6fe5979](https://github.com/sciactive/nephele/commit/6fe597928e12ec56789fcd5e6e25a58c72b15501))
* only manipulate file ownership if pam auth is enabled in file system adapter ([10ba385](https://github.com/sciactive/nephele/commit/10ba385331102f699afe2646bdf50894bf31d080))
* prop element in propstat response ([44cab44](https://github.com/sciactive/nephele/commit/44cab447bf30a992971024624ea2cb86fbac49fd))
* resource not found error on put ([183bf00](https://github.com/sciactive/nephele/commit/183bf002f550098f4fa98b30909c456bba626e62))
* use a much better method of getting user ids ([7560d19](https://github.com/sciactive/nephele/commit/7560d19e7bdc1d56c6b442b2e23b2233d1fb5758))
* various issues ([e6ae85b](https://github.com/sciactive/nephele/commit/e6ae85bd947922ec42e355a78432bc3a4ff99100))