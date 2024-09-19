# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [1.0.0-alpha.48](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.47...v1.0.0-alpha.48) (2024-09-19)

**Note:** Version bump only for package @nephele/adapter-nymph





# [1.0.0-alpha.47](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.46...v1.0.0-alpha.47) (2024-09-19)

**Note:** Version bump only for package @nephele/adapter-nymph





# [1.0.0-alpha.46](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.45...v1.0.0-alpha.46) (2024-09-19)

**Note:** Version bump only for package @nephele/adapter-nymph





# [1.0.0-alpha.45](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.44...v1.0.0-alpha.45) (2024-06-18)


### Bug Fixes

* protect hash update with transaction that gets committed after blob is moved ([5b6b23e](https://github.com/sciactive/nephele/commit/5b6b23e6247bbd336c0510916c2c29b9bf1fceb1))





# [1.0.0-alpha.44](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.43...v1.0.0-alpha.44) (2024-06-17)


### Bug Fixes

* don't return error on missing blob, don't test hash if same as old hash ([7b85889](https://github.com/sciactive/nephele/commit/7b85889eea370c2453133e96a3cc2092310b3f95))
* don't throw error on missing blob ([671b5ed](https://github.com/sciactive/nephele/commit/671b5edd1b78babdfe399e3fc4aea785006f64de))
* use setNymph methods on user and group ([ea670a0](https://github.com/sciactive/nephele/commit/ea670a0d9446b3ecdd16c6e0d0fe097d29e3a55f))





# [1.0.0-alpha.43](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.42...v1.0.0-alpha.43) (2024-06-15)


### Bug Fixes

* update nymph adapter for new version ([838299b](https://github.com/sciactive/nephele/commit/838299b6d8accfcb6162d5420a720b58b7607cfa))





# [1.0.0-alpha.42](https://github.com/sciactive/nephele/compare/v1.0.0-alpha.41...v1.0.0-alpha.42) (2024-05-27)


### Bug Fixes

* don't create sqlite driver on nymph adapter instance ([dc56a5f](https://github.com/sciactive/nephele/commit/dc56a5f319024ef5c21c1025a2b7fedb170054f2))


### Features

* add nymph.js based authenticator ([2d0460d](https://github.com/sciactive/nephele/commit/2d0460d7957e3982cf051dbb2e702947c6b06d64))
* add nymph.js based deduplicating file adapter ([6e613e3](https://github.com/sciactive/nephele/commit/6e613e3512085d823570370804b46ff687092fc7))
* speed up nymph adapter and add more options for nymph to nephele-serve ([471e231](https://github.com/sciactive/nephele/commit/471e2315e3c6c99345a72e2377f4c470ab0786aa))
