# Release Status

Current target: **0.11.0 Beta**

The repository has the release metadata, packaging workflow, store listing draft, privacy disclosure, and release gate documentation in place.

The package is intentionally blocked until the final PNG icons are added and referenced by `manifest.json`. Once those assets exist, run `npm run validate:release`, then `npm run package:extension`, inspect the resulting ZIP, and perform the manual Chrome installation test.
