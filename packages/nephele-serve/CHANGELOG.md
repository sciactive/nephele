# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.0.0-alpha.48](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.47...v1.0.0-alpha.48) (2024-09-19)


### Bug Fixes

* add entity classes before import and export ([3d09a86](https://github.com/sciactive/nephele/commit/3d09a863825c3998d031c18f2db47b8a626fa7c7))





# [1.0.0-alpha.47](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.46...v1.0.0-alpha.47) (2024-09-19)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.46](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.45...v1.0.0-alpha.46) (2024-09-19)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.45](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.44...v1.0.0-alpha.45) (2024-06-18)


### Bug Fixes

* protect hash update with transaction that gets committed after blob is moved ([5b6b23e](https://github.com/sciactive/nephele/commit/5b6b23e6247bbd336c0510916c2c29b9bf1fceb1))





# [1.0.0-alpha.44](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.43...v1.0.0-alpha.44) (2024-06-17)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.43](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.42...v1.0.0-alpha.43) (2024-06-15)


### Bug Fixes

* update nymph adapter for new version ([838299b](https://github.com/sciactive/nephele/commit/838299b6d8accfcb6162d5420a720b58b7607cfa))





# [1.0.0-alpha.42](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.41...v1.0.0-alpha.42) (2024-05-27)


### Features

* add nymph.js based authenticator ([2d0460d](https://github.com/sciactive/nephele/commit/2d0460d7957e3982cf051dbb2e702947c6b06d64))
* add nymph.js based deduplicating file adapter ([6e613e3](https://github.com/sciactive/nephele/commit/6e613e3512085d823570370804b46ff687092fc7))
* speed up nymph adapter and add more options for nymph to nephele-serve ([471e231](https://github.com/sciactive/nephele/commit/471e2315e3c6c99345a72e2377f4c470ab0786aa))





# [1.0.0-alpha.41](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.40...v1.0.0-alpha.41) (2024-03-15)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.40](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.39...v1.0.0-alpha.40) (2024-03-15)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.39](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.38...v1.0.0-alpha.39) (2024-02-23)


### Bug Fixes

* require encryption plugin in nephele-serve ([8438b22](https://github.com/sciactive/nephele/commit/8438b22d56417a271815bc514b68873f31cd85b7))





# [1.0.0-alpha.38](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.37...v1.0.0-alpha.38) (2024-02-22)


### Features

* add file encryption support to nephele-serve ([37bac30](https://github.com/sciactive/nephele/commit/37bac308b75fd660ebbbe0d93ed86b504237d20c))
* add s3 support to nephele-serve ([45d7ce3](https://github.com/sciactive/nephele/commit/45d7ce395234806a9e13715de2e580aa736e4268))





# [1.0.0-alpha.37](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.36...v1.0.0-alpha.37) (2024-01-27)


### Bug Fixes

* trim username and password and update readmes ([6024a76](https://github.com/sciactive/nephele/commit/6024a76d0f19274338f51c6945c2b4437c849a96))


### Features

* add custom authenticator to nephele-serve ([a74072c](https://github.com/sciactive/nephele/commit/a74072c6ec2fae509aafa8926488bfb3a9a51850))





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

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.30](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.29...v1.0.0-alpha.30) (2023-09-08)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.29](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.28...v1.0.0-alpha.29) (2023-09-06)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.28](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.27...v1.0.0-alpha.28) (2023-09-05)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.27](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.26...v1.0.0-alpha.27) (2023-09-04)


### Features

* update packages, require node>=18 ([96b9210](https://github.com/sciactive/nephele/commit/96b9210b2111afd969e9679bc9f6ff6d7d3dd5a2))





# [1.0.0-alpha.26](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.25...v1.0.0-alpha.26) (2023-03-01)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.25](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.24...v1.0.0-alpha.25) (2023-02-23)


### Bug Fixes

* nephele-serve script runs in macOS ([0986c72](https://github.com/sciactive/nephele/commit/0986c7223a3591e69454e335c0f7b22ebcd84405))


### Features

* add update check in nephele-serve ([c831baf](https://github.com/sciactive/nephele/commit/c831bafd07d05e8b6341d0afc03e476e4aea6c03))





# [1.0.0-alpha.24](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.23...v1.0.0-alpha.24) (2022-12-14)


### Bug Fixes

* remove unnecessary type check ([1279fd6](https://github.com/sciactive/nephele/commit/1279fd61cd9d509dda6670f84b6dbf1ef1213e05))





# [1.0.0-alpha.23](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.22...v1.0.0-alpha.23) (2022-11-15)


### Features

* add index plugin to nephele-serve ([5c66a0d](https://github.com/sciactive/nephele/commit/5c66a0dddda51557e49a056a31412239ffb17bd6))





# [1.0.0-alpha.22](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.21...v1.0.0-alpha.22) (2022-09-16)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.21](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.20...v1.0.0-alpha.21) (2022-09-16)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.20](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.19...v1.0.0-alpha.20) (2022-09-13)


### Features

* remove userid package from file system adapter ([83704da](https://github.com/sciactive/nephele/commit/83704daae1b913625e92a82f3a5c3ef20c490d9a))





# [1.0.0-alpha.19](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.18...v1.0.0-alpha.19) (2022-09-07)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.18](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.17...v1.0.0-alpha.18) (2022-09-05)


### Features

* add redirect server in nephele-serve to redirect insecure traffic ([f35c503](https://github.com/sciactive/nephele/commit/f35c5031cc4238ffe42e866a2a40e412304e77d5))





# [1.0.0-alpha.17](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.16...v1.0.0-alpha.17) (2022-09-05)

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.16](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.15...v1.0.0-alpha.16) (2022-09-03)


### Bug Fixes

* don't set usernamesMapToSystemUsers if auth is turned off ([52281c8](https://github.com/sciactive/nephele/commit/52281c817bd19047a71c94d1918f10f0228db3d0))





# [1.0.0-alpha.15](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.14...v1.0.0-alpha.15) (2022-09-03)


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

**Note:** Version bump only for package nephele-serve





# [1.0.0-alpha.11](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.10...v1.0.0-alpha.11) (2022-09-02)


### Features

* new nephele-serve package to run nephele and serve local files ([aac7218](https://github.com/sciactive/nephele/commit/aac721836b536c2dbaee911cb92f066e57d8fc6a))
