# Crab Watch 0.11.0 Beta Release Gate

## Code

- [x] Manifest bumped to 0.11.0
- [x] `version_name` set to `0.11.0 Beta`
- [x] Runtime version constant aligned with manifest
- [x] Reproducible packaging command added
- [x] Web Store listing draft added
- [x] Web Store privacy disclosure added

## Remaining hard blockers

- [ ] Add final PNG extension icons at 48x48 and 128x128 and reference them from `manifest.json`.
- [ ] Run `npm test` on the release commit.
- [ ] Run `npm run package:extension` and inspect the ZIP contents.
- [ ] Load the ZIP's extracted contents as an unpacked extension in Chrome.
- [ ] Complete the manual acceptance test in `docs/WEBSTORE_RELEASE.md`.
- [ ] Capture final Web Store screenshots.
- [ ] Upload the ZIP to the Chrome Web Store as a draft.
- [ ] Resolve any automated installation/review warnings.

## Publication rule

Do not publish the public listing until the uploaded ZIP has been manually tested and the Store Listing and Privacy sections accurately match the shipped implementation.
