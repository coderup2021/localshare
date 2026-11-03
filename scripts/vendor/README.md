# Vendored Windows resource editor

`resedit.mjs` is a Bun bundle of `resedit@3.1.0` and its `pe-library@2.0.1`
dependency. It is used only while cross-assembling Windows executables on
macOS to embed the LocalShare icon into `launcher.exe` and the installer.

Both packages are MIT-licensed; their license notices are preserved in
`RESEDIT-LICENSES.txt`.

To regenerate the bundle from an installed copy:

```bash
bun build node_modules/resedit/dist/index.js \
  --target=node \
  --format=esm \
  --minify \
  --outfile=scripts/vendor/resedit.mjs
```
