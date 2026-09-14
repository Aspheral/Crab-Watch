# Crab Watch Store Assets

Required before the 0.11.0 Beta package can be built:

- `assets/icon-48.png`
- `assets/icon-128.png`

These should be the final Crab Watch mark on a transparent background, exported as PNG at the exact dimensions above.

The existing `assets/crab.svg` remains useful inside the extension UI, but the store package must ship the required PNG icon files and reference them from `manifest.json`.
