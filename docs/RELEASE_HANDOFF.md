# 0.11.0 Beta Release Handoff

The codebase is prepared for the final packaging stage.

Before packaging, add the final PNG icons at 48x48 and 128x128, wire them into `manifest.json`, then run:

```text
npm test
npm run validate:release
npm run package:extension
```

Inspect the ZIP, load its extracted contents into Chrome, and run the manual acceptance checklist in `docs/WEBSTORE_RELEASE.md` before uploading the ZIP as a Chrome Web Store draft.
