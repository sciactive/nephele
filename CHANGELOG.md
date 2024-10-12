# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.0.0-alpha.59](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.58...v1.0.0-alpha.59) (2024-10-12)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.58](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.57...v1.0.0-alpha.58) (2024-09-28)


### Bug Fixes

* optimize file deletion in nymph adapter ([bb532d6](https://github.com/sciactive/nephele/commit/bb532d6c1c3e054f7d1b95ad1985a926b608322c))





# [1.0.0-alpha.57](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.56...v1.0.0-alpha.57) (2024-09-28)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.56](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.55...v1.0.0-alpha.56) (2024-09-28)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.55](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.54...v1.0.0-alpha.55) (2024-09-28)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.54](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.53...v1.0.0-alpha.54) (2024-09-27)


### Features

* update nymph and give instructions for db migration ([4e4f1b6](https://github.com/sciactive/nephele/commit/4e4f1b689a3f587c45360364e27310c36bb88a32))





# [1.0.0-alpha.53](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.52...v1.0.0-alpha.53) (2024-09-21)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.52](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.51...v1.0.0-alpha.52) (2024-09-20)


### Bug Fixes

* in nymph, use null parent instead of undefined, because query is faster ([116a15f](https://github.com/sciactive/nephele/commit/116a15f6a7af319f41fb05cce97ca4c78dfc0692))





# [1.0.0-alpha.51](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.50...v1.0.0-alpha.51) (2024-09-20)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.50](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.49...v1.0.0-alpha.50) (2024-09-20)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.49](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.48...v1.0.0-alpha.49) (2024-09-20)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.48](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.47...v1.0.0-alpha.48) (2024-09-19)


### Bug Fixes

* add entity classes before import and export ([3d09a86](https://github.com/sciactive/nephele/commit/3d09a863825c3998d031c18f2db47b8a626fa7c7))





# [1.0.0-alpha.47](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.46...v1.0.0-alpha.47) (2024-09-19)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.46](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.45...v1.0.0-alpha.46) (2024-09-19)


### Bug Fixes

* respond to options request with 200, which is expected by some software ([6b6ec87](https://github.com/sciactive/nephele/commit/6b6ec870d3c41c565a666cbd14e053454e87863e))





# [1.0.0-alpha.45](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.44...v1.0.0-alpha.45) (2024-06-18)


### Bug Fixes

* protect hash update with transaction that gets committed after blob is moved ([5b6b23e](https://github.com/sciactive/nephele/commit/5b6b23e6247bbd336c0510916c2c29b9bf1fceb1))





# [1.0.0-alpha.44](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.43...v1.0.0-alpha.44) (2024-06-17)


### Bug Fixes

* content type check regex ([526ac1b](https://github.com/sciactive/nephele/commit/526ac1b024c213495a78fc488346722983494e2f))
* don't return error on missing blob, don't test hash if same as old hash ([7b85889](https://github.com/sciactive/nephele/commit/7b85889eea370c2453133e96a3cc2092310b3f95))
* don't throw error on missing blob ([671b5ed](https://github.com/sciactive/nephele/commit/671b5edd1b78babdfe399e3fc4aea785006f64de))
* use setNymph methods on user and group ([ea670a0](https://github.com/sciactive/nephele/commit/ea670a0d9446b3ecdd16c6e0d0fe097d29e3a55f))
* validate content-type and remove parameters ([acde7f3](https://github.com/sciactive/nephele/commit/acde7f3099887e2654011faf1923f09ad4a02dc2))





# [1.0.0-alpha.43](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.42...v1.0.0-alpha.43) (2024-06-15)


### Bug Fixes

* update nymph adapter for new version ([838299b](https://github.com/sciactive/nephele/commit/838299b6d8accfcb6162d5420a720b58b7607cfa))





# [1.0.0-alpha.42](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.41...v1.0.0-alpha.42) (2024-05-27)


### Bug Fixes

* don't create sqlite driver on nymph adapter instance ([dc56a5f](https://github.com/sciactive/nephele/commit/dc56a5f319024ef5c21c1025a2b7fedb170054f2))
* report multi-status errors in the console ([1bec58c](https://github.com/sciactive/nephele/commit/1bec58ca9ac693cbfa3897980d6012af5140d39d))


### Features

* add nymph.js based authenticator ([2d0460d](https://github.com/sciactive/nephele/commit/2d0460d7957e3982cf051dbb2e702947c6b06d64))
* add nymph.js based deduplicating file adapter ([6e613e3](https://github.com/sciactive/nephele/commit/6e613e3512085d823570370804b46ff687092fc7))
* allow properties to be set before stream, set encryption iv before stream ([cb90207](https://github.com/sciactive/nephele/commit/cb90207096b7ccdf545bd146cc5fa7e13a35eb08))
* speed up nymph adapter and add more options for nymph to nephele-serve ([471e231](https://github.com/sciactive/nephele/commit/471e2315e3c6c99345a72e2377f4c470ab0786aa))





# [1.0.0-alpha.41](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.40...v1.0.0-alpha.41) (2024-03-15)


### Bug Fixes

* deleting empty collections in s3 adapter ([dd6d10e](https://github.com/sciactive/nephele/commit/dd6d10ebf7a7779fd93b225182b482428a7d3b33))


### Features

* add upload queue size option to s3 adapter ([2a385d4](https://github.com/sciactive/nephele/commit/2a385d44d0546dcf5acd8bc30b062d8f554b2604))





# [1.0.0-alpha.40](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.39...v1.0.0-alpha.40) (2024-03-15)


### Bug Fixes

* support s3 implementations that don't implement GetObjectAttributesCommand ([ee4b50f](https://github.com/sciactive/nephele/commit/ee4b50ffc1c68b6cdd2068b3e5b86432bc3b7f95))





# [1.0.0-alpha.39](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.38...v1.0.0-alpha.39) (2024-02-23)


### Bug Fixes

* require encryption plugin in nephele-serve ([8438b22](https://github.com/sciactive/nephele/commit/8438b22d56417a271815bc514b68873f31cd85b7))





# [1.0.0-alpha.38](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.37...v1.0.0-alpha.38) (2024-02-22)


### Bug Fixes

* can't copy or move files with multibyte utf8 string in web client ([6d4f31f](https://github.com/sciactive/nephele/commit/6d4f31f32cc7b77f29363dbec19d5abf2d2d5f6b))
* end response on errors thrown from plugins ([d0270ff](https://github.com/sciactive/nephele/commit/d0270ff2a6d3e8b2034112735729cb83cb1b1f02))
* issue with moving nephelemeta files during move operation ([ae9aa80](https://github.com/sciactive/nephele/commit/ae9aa807025602f5f6fbda63eedc1a13374d68b3))
* remove unneeded mkdir from dockerfile ([4cd2b21](https://github.com/sciactive/nephele/commit/4cd2b21e361de4654e108df3211fb0b553c6d1bb))
* run plugins on adapters through getAdapter ([6ba0d68](https://github.com/sciactive/nephele/commit/6ba0d68d3742646efb204cfa96393870a12aeda0))


### Features

* add file encryption support to nephele-serve ([37bac30](https://github.com/sciactive/nephele/commit/37bac308b75fd660ebbbe0d93ed86b504237d20c))
* add filename encryption to encryption plugin ([945ba4b](https://github.com/sciactive/nephele/commit/945ba4bcf29ff2a91c00226d87049ed79094b452))
* add new s3 object store adapter ([4a45138](https://github.com/sciactive/nephele/commit/4a451383cd59b395124c6f145f98dbffb8acd640))
* add s3 support to nephele-serve ([45d7ce3](https://github.com/sciactive/nephele/commit/45d7ce395234806a9e13715de2e580aa736e4268))
* allow global password for encryption and setting base64 or ascii85 ([77b7fc7](https://github.com/sciactive/nephele/commit/77b7fc7a975bb08a97396b0120f4bcac64b46fbd))
* new file encryption plugin ([5f18364](https://github.com/sciactive/nephele/commit/5f18364275ec520fdd50bf456086bc0820ae98d2))
* save media type in s3 uploads ([e1e4f86](https://github.com/sciactive/nephele/commit/e1e4f869db9645a26ca53c357dbdb04f25b87d2f))
* switch to modified Ascii85 encoding instead of base64 in encryption plugin ([2080c92](https://github.com/sciactive/nephele/commit/2080c927447300506e2dd7eff1cfc1dd40374b7d))





# [1.0.0-alpha.37](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.36...v1.0.0-alpha.37) (2024-01-27)


### Bug Fixes

* trim username and password and update readmes ([6024a76](https://github.com/sciactive/nephele/commit/6024a76d0f19274338f51c6945c2b4437c849a96))
* use birthtime for creation date ([bf15d7c](https://github.com/sciactive/nephele/commit/bf15d7ceb719c232e951da8fb3997710664272c9))


### Features

* add custom authenticator to nephele-serve ([a74072c](https://github.com/sciactive/nephele/commit/a74072c6ec2fae509aafa8926488bfb3a9a51850))
* add docker build file and readme ([cf7b5f5](https://github.com/sciactive/nephele/commit/cf7b5f59f46d19fb5aa083bfb3e4302cc7c3ebfd))





# [1.0.0-alpha.36](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.35...v1.0.0-alpha.36) (2024-01-21)


### Bug Fixes

* pm2-runtime compatibility ([f7fb3cd](https://github.com/sciactive/nephele/commit/f7fb3cd139275705d5bac28fbb05f9e6f12bc1fd))





# [1.0.0-alpha.35](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.34...v1.0.0-alpha.35) (2024-01-21)


### Bug Fixes

* move other system user dependencies to optional ([2c13507](https://github.com/sciactive/nephele/commit/2c135075aa29dd39388b288b76e08626820e3f7c))





# [1.0.0-alpha.34](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.33...v1.0.0-alpha.34) (2024-01-20)


### Features

* add htpasswd support to nephele-serve ([94ef1c2](https://github.com/sciactive/nephele/commit/94ef1c29a8c3986772339f156b4f23c064ade8c4))
* bump node requirement up to 18, since 16 is eol ([43b6d01](https://github.com/sciactive/nephele/commit/43b6d01354adaec1f6c8a8ea55efa43c7c287716))





# [1.0.0-alpha.33](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.32...v1.0.0-alpha.33) (2023-10-22)


### Bug Fixes

* raise default request timeout to support massive file transfers ([0601fa8](https://github.com/sciactive/nephele/commit/0601fa82039824f5fd9d922fa5a8da85f74418a8))





# [1.0.0-alpha.32](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.31...v1.0.0-alpha.32) (2023-10-21)


### Features

* add configuration options for request timeouts in nephele-serve ([39cd0bc](https://github.com/sciactive/nephele/commit/39cd0bceacc0fa630e3090bb8938c5af06af2bf5))





# [1.0.0-alpha.31](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.30...v1.0.0-alpha.31) (2023-09-10)


### Bug Fixes

* data.destination on move and copy plugin callbacks not the right type ([7d2fb0b](https://github.com/sciactive/nephele/commit/7d2fb0b0aaf1903b803cfb11a5695b1fb4ee170a))





# [1.0.0-alpha.30](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.29...v1.0.0-alpha.30) (2023-09-08)


### Bug Fixes

* handle permission check where the parent directory doesn't exist ([6d2d74d](https://github.com/sciactive/nephele/commit/6d2d74d40cbd3d1e2e689ccb8650789dc7ea6d12))
* remove incorrect if-none-match check ([0110e43](https://github.com/sciactive/nephele/commit/0110e43d4831fd4a8ebb7e6fc659da54b52f9e95))





# [1.0.0-alpha.29](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.28...v1.0.0-alpha.29) (2023-09-06)


### Bug Fixes

* error running chown on non-existent metadata file during directory move and copy ([b7c6ec3](https://github.com/sciactive/nephele/commit/b7c6ec37d3cf5ab4c4aa72f8e1728a958b81f266))





# [1.0.0-alpha.28](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.27...v1.0.0-alpha.28) (2023-09-05)


### Bug Fixes

* index plugin import because svelte only outputs esm now ([d6d9ffe](https://github.com/sciactive/nephele/commit/d6d9ffeee905d3d5884fbc3cb819aadd94abbf87))





# [1.0.0-alpha.27](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.26...v1.0.0-alpha.27) (2023-09-04)


### Bug Fixes

* add types package for mime package ([4eb3dd9](https://github.com/sciactive/nephele/commit/4eb3dd9de8b045ef17de0623df7a5b7e499b6d00))


### Features

* update packages, require node>=18 ([96b9210](https://github.com/sciactive/nephele/commit/96b9210b2111afd969e9679bc9f6ff6d7d3dd5a2))





# [1.0.0-alpha.26](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.25...v1.0.0-alpha.26) (2023-03-01)


### Features

* new htpasswd based authenticator ([2cda122](https://github.com/sciactive/nephele/commit/2cda1226a8bef14c8710b1a79877a1614802f621))





# [1.0.0-alpha.25](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.24...v1.0.0-alpha.25) (2023-02-23)


### Bug Fixes

* nephele-serve script runs in macOS ([0986c72](https://github.com/sciactive/nephele/commit/0986c7223a3591e69454e335c0f7b22ebcd84405))


### Features

* add update check in nephele-serve ([c831baf](https://github.com/sciactive/nephele/commit/c831bafd07d05e8b6341d0afc03e476e4aea6c03))
* change contentEtagMaxMB to contentEtagMaxBytes and set to -1 by default ([183a9f6](https://github.com/sciactive/nephele/commit/183a9f6045058e44a1ff26af63d153846836f2a3))





# [1.0.0-alpha.24](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.23...v1.0.0-alpha.24) (2022-12-14)


### Bug Fixes

* remove unnecessary type check ([1279fd6](https://github.com/sciactive/nephele/commit/1279fd61cd9d509dda6670f84b6dbf1ef1213e05))


### Features

* new plugin to make a path read-only ([59cf973](https://github.com/sciactive/nephele/commit/59cf973da2633b41f7aa0938965c3c71495d85b9))





# [1.0.0-alpha.23](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.22...v1.0.0-alpha.23) (2022-11-15)


### Bug Fixes

* getLockPermission call to wrong object ([3016259](https://github.com/sciactive/nephele/commit/30162599114804ce084d3955e2bd84da2b8df14e))
* hide upload form if there's no JS, also prettier svelte file ([0e38165](https://github.com/sciactive/nephele/commit/0e3816561d16ebc79ba851df9c1511e04f49aea8))
* indices to indexes in index plugin ([d67ce7b](https://github.com/sciactive/nephele/commit/d67ce7bce8cc4cee8d4f7cd5d979abdcccdb140c))


### Features

* add begin plugin calls to handle requests that would be 404 ([fa06f85](https://github.com/sciactive/nephele/commit/fa06f852bce5cc01f387feb1023e8b72d143bb36))
* add index file and directory listing plugin ([e0c46ac](https://github.com/sciactive/nephele/commit/e0c46ac8d66cc242ff6b2d801e3fe4c967712f50))
* add index plugin config and refactor index page ([9248219](https://github.com/sciactive/nephele/commit/92482191780d92bbcf336c721564045daba7ee91))
* add index plugin to nephele-serve ([5c66a0d](https://github.com/sciactive/nephele/commit/5c66a0dddda51557e49a056a31412239ffb17bd6))
* add mkdir and delete support to index plugin ([1b068e4](https://github.com/sciactive/nephele/commit/1b068e422f1a1105fc5b4815196b7f131b797f8d))
* add move and copy support to index plugin ([58344ed](https://github.com/sciactive/nephele/commit/58344ed2786293f87dac8e1f79f90eddf181c1f6))
* add plugin calls to all methods ([a767c96](https://github.com/sciactive/nephele/commit/a767c96322b34020055cfcc2c15321afd2475571))
* add rename support to index plugin ([bc92c1b](https://github.com/sciactive/nephele/commit/bc92c1b777b973bfbbbddd0d886d496848a7c3e9))
* introduce a plugin mechanism ([d76f93c](https://github.com/sciactive/nephele/commit/d76f93c556dd8a2ec47828ec77ddea36f2c31238))
* only show file management forms in index plugin if user can do tasks ([650f3cf](https://github.com/sciactive/nephele/commit/650f3cf20b638db8bed95463425c879f99d3f56d))
* use the same refresh button for all request in index plugin ([98bcc65](https://github.com/sciactive/nephele/commit/98bcc65cc4d0c2838865cae5d79a2156bc0c1602))





# [1.0.0-alpha.22](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.21...v1.0.0-alpha.22) (2022-09-16)


### Bug Fixes

* use non-file-system dependent path functions in virtual adapter ([b800b6e](https://github.com/sciactive/nephele/commit/b800b6e202a49f919edcc37100df0fb015433d95))





# [1.0.0-alpha.21](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.20...v1.0.0-alpha.21) (2022-09-16)


### Bug Fixes

* file system agnostic paths and handle errors on getAll properties ([e258573](https://github.com/sciactive/nephele/commit/e2585730ad473923d0eeb136b4e6cb10b382f987))





# [1.0.0-alpha.20](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.19...v1.0.0-alpha.20) (2022-09-13)


### Features

* remove userid package from file system adapter ([83704da](https://github.com/sciactive/nephele/commit/83704daae1b913625e92a82f3a5c3ef20c490d9a))





# [1.0.0-alpha.19](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.18...v1.0.0-alpha.19) (2022-09-07)


### Bug Fixes

* differently encoded URIs resolving to incorrect path names ([7f694db](https://github.com/sciactive/nephele/commit/7f694db35184aad14df91c1041534b8e7e14ee23))





# [1.0.0-alpha.18](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.17...v1.0.0-alpha.18) (2022-09-05)


### Features

* add redirect server in nephele-serve to redirect insecure traffic ([f35c503](https://github.com/sciactive/nephele/commit/f35c5031cc4238ffe42e866a2a40e412304e77d5))





# [1.0.0-alpha.17](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.16...v1.0.0-alpha.17) (2022-09-05)


### Bug Fixes

* proper URI encoding and decoding for special characters ([1d2ef37](https://github.com/sciactive/nephele/commit/1d2ef3709fd0d8852c0e28317a22997daf86dbfa))





# [1.0.0-alpha.16](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.15...v1.0.0-alpha.16) (2022-09-03)


### Bug Fixes

* don't set usernamesMapToSystemUsers if auth is turned off ([52281c8](https://github.com/sciactive/nephele/commit/52281c817bd19047a71c94d1918f10f0228db3d0))





# [1.0.0-alpha.15](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.14...v1.0.0-alpha.15) (2022-09-03)


### Bug Fixes

* set user and group of file before streaming content into it ([5b42a6c](https://github.com/sciactive/nephele/commit/5b42a6cdd64c7e6cf936a97babd3b19700c1cc09)), closes [#2](https://github.com/sciactive/nephele/issues/2)


### Features

* change new user directory mode to remove other rwx ([81256d8](https://github.com/sciactive/nephele/commit/81256d8dc4e789b9844a0cb22fbc8212e5fb1e00))





# [1.0.0-alpha.14](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.13...v1.0.0-alpha.14) (2022-09-02)


### Bug Fixes

* load server from cjs file for compatibility with pm2 ([cd77579](https://github.com/sciactive/nephele/commit/cd7757955cd66c0a93c9b47e689eddbdc3772d09))





# [1.0.0-alpha.13](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.12...v1.0.0-alpha.13) (2022-09-02)


### Bug Fixes

* properly get script dir when loaded through source ([183192a](https://github.com/sciactive/nephele/commit/183192aad7cffffd3f87ae39dddc72428b333a60))
* use a js file as script loader, which works when globally installed ([74e08a3](https://github.com/sciactive/nephele/commit/74e08a3b54b2e98dbae7f3bcde24cf6865f34b67))





# [1.0.0-alpha.12](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.11...v1.0.0-alpha.12) (2022-09-02)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.11](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.10...v1.0.0-alpha.11) (2022-09-02)


### Features

* add allowedUIDs option to pam authenticator ([d354966](https://github.com/sciactive/nephele/commit/d354966bc4a00a06092a14ecb0fa3abb50841a4f))
* new nephele-serve package to run nephele and serve local files ([aac7218](https://github.com/sciactive/nephele/commit/aac721836b536c2dbaee911cb92f066e57d8fc6a))





# [1.0.0-alpha.10](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.9...v1.0.0-alpha.10) (2022-08-18)


### Features

* add digest auth support to custom authenticator ([ee9a255](https://github.com/sciactive/nephele/commit/ee9a2550e79372fd992aa6e9cbe5c66b9ed055f8))





# [1.0.0-alpha.9](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.8...v1.0.0-alpha.9) (2022-08-11)


### Bug Fixes

* don't fail entire propfind request if sub resource fails to load ([c4d2109](https://github.com/sciactive/nephele/commit/c4d2109a168a5ba8105c01010719b549a1ab2cf8))
* switch from mmmagic to mime, only report regular files with file system adapter ([fde40df](https://github.com/sciactive/nephele/commit/fde40df164a96aab1245938099d4072cab1d1403))





# [1.0.0-alpha.8](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.7...v1.0.0-alpha.8) (2022-08-11)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.7](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.6...v1.0.0-alpha.7) (2022-08-11)

**Note:** Version bump only for package nephele-repo





# [1.0.0-alpha.6](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.5...v1.0.0-alpha.6) (2022-08-11)


### Features

* add custom logic authenticator ([7807916](https://github.com/sciactive/nephele/commit/7807916419d380638dd58bc2fe051dc0cb38b76a))
* use remote host during pam authentication ([feed076](https://github.com/sciactive/nephele/commit/feed07681be143c552280b8c15a6826e54661074))





# [1.0.0-alpha.5](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.4...v1.0.0-alpha.5) (2022-08-11)


### Bug Fixes

* don't move or copy locks with a resource ([0e12543](https://github.com/sciactive/nephele/commit/0e125438ca0571beba54950217938d00a2e7af1a)), closes [#1](https://github.com/sciactive/nephele/issues/1)
* existing lock check and request body checks ([572fa72](https://github.com/sciactive/nephele/commit/572fa7271a64da79b510b04b8fe2c0e179b4de27))
* update modified date on file save in virtual adapter ([77544de](https://github.com/sciactive/nephele/commit/77544de7240fbc8986f4c542388e7ab0743041b2))


### Features

* report collection urls with trailing slash to clients who don't give them, as per spec ([7528d4c](https://github.com/sciactive/nephele/commit/7528d4c06c2abec5aa00cd9bb3dba4478eb4ba98))





# [1.0.0-alpha.4](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.3...v1.0.0-alpha.4) (2022-08-11)


### Features

* add virtual file adapter ([29de79f](https://github.com/sciactive/nephele/commit/29de79fbae3c0140147a8422006dde77a25fc5ee))
* allow conditional and multiple adapters and authenticators per instance ([4d37666](https://github.com/sciactive/nephele/commit/4d37666b151f853d2671547b78a87b6cd3564556))





# [1.0.0-alpha.3](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.2...v1.0.0-alpha.3) (2022-08-09)


### Features

* add unrestricted access authenticator ([8bb728c](https://github.com/sciactive/nephele/commit/8bb728c9d79cd163f5ee46ae254ea8c795c93b1a))
* separate adapter and authenticator, move pam authenticator to own package ([c1fd955](https://github.com/sciactive/nephele/commit/c1fd9556db6eefb3460fcbfc59308c8950986c53))





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
