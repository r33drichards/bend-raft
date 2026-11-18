# Third-party provenance

The generated JS and WASM artifacts contain code from Bend at
`4f99f4c19e1a91fd4c3a9377363d580171d4d40c`, distributed under the Apache License 2.0
included in `licenses/BEND-APACHE-2.0.txt`. See https://github.com/bendlang/bend.
The build derives a temporary compiler copy solely to retain an additional root,
then applies the documented runtime ABI changes. Upstream source is not modified.

The build imports the runtime adapter from the user's `r33drichards/bend-wasm`
repository at `24cf4cfbf145d209ec0a1d1523095d1d8612bd32`. This repository does not
vendor that project's source or assign it a new license.

WASM binaries are linked with the Emscripten 4.0.21 toolchain and its system
libraries. Emscripten licensing and third-party library notices are available at
https://github.com/emscripten-core/emscripten/blob/4.0.21/LICENSE . Retain applicable
notices if redistributing a packaged runtime or toolchain.

Applicable copies of the Emscripten, musl, compiler-rt, libc++ and libc++abi
notices are included under `licenses/` alongside the Bend notice.
