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
