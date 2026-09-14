# Crab Watch Web Store Release Checklist

Target release: 0.11.0 Beta

## Package contents

The upload ZIP should contain only files required at runtime:

- `manifest.json`
- `popup.html`
- `popup.js`
- `offscreen.html`
- `src/`
- `assets/`
- `vendor/`

Do not include tests, Git metadata, `node_modules`, development scripts, or package-management files.

## Store positioning

Crab Watch is a **post-game chess forensics** extension. It analyzes completed Chess.com games and compares them with public account history and other behavioral signals.

It does not provide live analysis during an active game and it should not be described as a definitive cheating detector.

Recommended disclosure language:

> Crab Watch reviews completed Chess.com games using locally bundled analysis code and publicly available Chess.com game/account data. Analysis is performed only after a game has finished. Results are evidence-based anomaly indicators, not proof of cheating.

## Privacy review

The listing should accurately explain:

- Chess.com public game/account data accessed for review.
- Locally stored history and analysis cache.
- No live-game analysis.
- No sale of user data.
- No unrelated browsing-data collection.

Only request permissions required by the implementation.

## Manual acceptance test

1. Load the packaged extension in Chrome as an unpacked extension.
2. Confirm the extension installs without manifest errors.
3. Confirm the toolbar icon and popup render correctly.
4. Open a finished Chess.com game.
5. Confirm Crab Watch identifies the completed game.
6. Run a review and confirm the popup produces a report.
7. Confirm Stockfish loads only after review is requested.
8. Open an active game and confirm no engine analysis is started.
9. Confirm history caching works across a second review.
10. Confirm the extension still works when clock annotations are absent.
11. Confirm the extension handles insufficient history without inventing evidence.
12. Remove/reinstall the extension and repeat the basic flow.

## Before publication

- Replace placeholder or missing Web Store icons with final PNG assets.
- Capture Store screenshots from the real packaged build.
- Fill Store Listing and Privacy sections.
- Upload as a draft first.
- Inspect automated installation checks and reviewer warnings.
- Test the uploaded package, not only the repository checkout.
- Publish only after the manual acceptance test passes.
