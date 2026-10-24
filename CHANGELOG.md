# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [1.4.1] - 2026-10-24

### Security

- build the image on Node.js 24.22.1 or later ([4a5bef5](https://github.com/William-De71/gladys-pellet-stock/commit/4a5bef5daf399367150cd392fd6803b33f09c2a4))

## [1.4.0] - 2026-10-12

### Added

- **i18n:** name the devices in the language of the user who looks at the widgets ([cd88a5d](https://github.com/William-De71/gladys-pellet-stock/commit/cd88a5d16d0fadb6cd0866fe8e93ca356f08df39))
- **widgets:** a "Pellet prices" widget, the price history and the heating seasons compared ([6f02fb2](https://github.com/William-De71/gladys-pellet-stock/commit/6f02fb2a602bba5ed3a51b593233e05aedb665fe))

## [1.3.0] - 2026-10-12

### Added

- **widget:** enter the bags and the price paid when a pallet is delivered ([2f5508e](https://github.com/William-De71/gladys-pellet-stock/commit/2f5508eb02b8a862cfe076ccaa475cece78bdd93))
- **prices:** price per bag on "Add bag(s)", bag weight per delivery, price per kg ([a08a83c](https://github.com/William-De71/gladys-pellet-stock/commit/a08a83ce1ddbb18ab4dab89d3d166364813f4b96))
- **stocks:** one stock per house of Gladys, with settings of its own ([53d8883](https://github.com/William-De71/gladys-pellet-stock/commit/53d888305636ed3a6d528cd4f5ce7bdaaaa9cb91))
- **cost:** heating cost first in, first out, and the exact remaining weight ([394f582](https://github.com/William-De71/gladys-pellet-stock/commit/394f582c764d7ee4fd658d7ac4e55fc78483e31b))
- **silo:** a silo of bulk pellets, counted in kg, with its widget and device ([a82e083](https://github.com/William-De71/gladys-pellet-stock/commit/a82e083f40c409faa8133f8efd813cac3a9c9e35))
- **scenes:** bags bought on their own are never a delivery; season cost in scenes ([b31658f](https://github.com/William-De71/gladys-pellet-stock/commit/b31658f96e8749867d3a3a84c89a3c67aa6e6fda))
- **i18n:** German and Spanish, and a setting for the language of the device names ([1b78919](https://github.com/William-De71/gladys-pellet-stock/commit/1b78919c00d214f51d7f1093817177c985309abe))

### Fixed

- **prices:** pre-fill a pallet at the last price per bag, price on "Record a delivery" ([8a925ab](https://github.com/William-De71/gladys-pellet-stock/commit/8a925ab425c780bf32f24fb0fa61ceaf03c15a2f))
- **widgets:** refresh both widgets as soon as a stock or a device is added ([2a7be81](https://github.com/William-De71/gladys-pellet-stock/commit/2a7be819c2135105081d64e0b97f81edc6ddbd0c))

## [1.2.0](https://github.com/William-De71/gladys-pellet-stock/compare/v1.1.1...v1.2.0) (2026-10-09)

### Bug Fixes

* **ledger:** keep the last 2,000 movements instead of 500 ([e1b7522](https://github.com/William-De71/gladys-pellet-stock/commit/e1b7522fcd54c9bd5727b0ea37550d6332650c61))
* **stocks:** never write a ledger before the stored ones are loaded ([be90ae9](https://github.com/William-De71/gladys-pellet-stock/commit/be90ae9a0c1e0b915bd41f4e75b55e69be71625e))

### Continuous Integration

* fail early on an existing release tag, optional Docker Hub login ([11c4cd3](https://github.com/William-De71/gladys-pellet-stock/commit/11c4cd32b8080eefb72559c4f9ea5e7e2048fa5d))

### Miscellaneous

* use npm ci only in the image, small cleanups ([5022cbf](https://github.com/William-De71/gladys-pellet-stock/commit/5022cbf7350e9c93ff2a9b8740013fc0d5d4b0c7))

## [1.1.1](https://github.com/William-De71/gladys-pellet-stock/compare/v1.1.0...v1.1.1) (2026-10-09)

### Bug Fixes

* **manifest:** declare the local transport ([9296f58](https://github.com/William-De71/gladys-pellet-stock/commit/9296f588243a010bef0e2c20d441a783d2e17e33))

## [1.1.0](https://github.com/William-De71/gladys-pellet-stock/compare/v1.0.1...v1.1.0) (2026-09-25)

### Bug Fixes

* **config:** enter the pallet price instead of the bag price ([c98b659](https://github.com/William-De71/gladys-pellet-stock/commit/c98b6599061cdc4f473c21b4db7896d8822d13e0))

## [1.0.1](https://github.com/William-De71/gladys-pellet-stock/compare/v1.0.0...v1.0.1) (2026-09-25)

## 1.0.0 (2026-09-24)

### Features

* initial pellet stock integration with dashboard widget ([65e3eec](https://github.com/William-De71/gladys-pellet-stock/commit/65e3eece7a9db64effb45b7825c89c2db5a9193b))
* **scenes:** add, set and read stock actions, low/empty/pallet triggers ([5ff24ea](https://github.com/William-De71/gladys-pellet-stock/commit/5ff24eaa033cc889b77b2e4fe30634b478fb0da9))
* several stocks, consumption chart and device always discoverable ([03b4c2e](https://github.com/William-De71/gladys-pellet-stock/commit/03b4c2ea23282ba2de564e04116c77f5e05294b5))
* **widget:** order date, last bag, cost and use since the last pallet ([55703b1](https://github.com/William-De71/gladys-pellet-stock/commit/55703b1a1c0ff02b07f23a5b4756b324caa51588))

### Documentation

* enrich the README and add a widget example image ([bfd5023](https://github.com/William-De71/gladys-pellet-stock/commit/bfd5023f327eddedb9cf348cfb0646f5dcaf42f3))

[1.4.1]: https://github.com/William-De71/gladys-pellet-stock/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/William-De71/gladys-pellet-stock/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/William-De71/gladys-pellet-stock/compare/v1.2.0...v1.3.0
