# Crab Watch 🦀

Crab Watch is a Chrome extension for **post-game chess forensics** on Chess.com.

The goal is not to provide another engine-accuracy meter. Crab Watch examines a completed game in context: historical play, repeated decisions, position difficulty, timing behavior, strength changes, personal engine behavior, and other signals that may make a game statistically unusual.

## Design principles

- **Post-game only.** No chess analysis, evaluation, recommendations, or engine process is loaded during an active human-vs-human game.
- **Evidence over verdicts.** An unusual game is not proof of outside assistance.
- **History matters.** The opponent's recent public games form a baseline rather than treating every game in isolation.
- **Human behavior matters.** Expected mistakes, position difficulty, time pressure, and player-specific patterns matter more than raw engine agreement alone.
- **Quiet UI.** The interface uses clean cards, restrained typography, useful visual summaries, and no fake telemetry or sci-fi dashboard language.
- **Account size is context, not immunity.** A 351+ game history is retained as account-context evidence, not used as an innocence cutoff.

## Current state: 0.8.0

The extension now has a working post-game analysis path:

1. Detect a completed Chess.com game.
2. Capture visible game identity and move information without analyzing the position.
3. Identify the opponent when the page exposes an unambiguous current-user identity.
4. Collect up to **351 recent public games** through Chess.com's read-only PubAPI.
5. Use the most recent **300 games** as the main behavioral-analysis window while retaining the extra account-context sample.
6. Cache the history locally and reuse it for up to 12 hours.
7. Match the completed game against the public archive when possible, falling back to captured PGN/move text when necessary.
8. Reconstruct standard chess positions from PGN and fingerprint exact positions.
9. Look for recurring position-and-move decisions across the recent history.
10. Scan the completed game for **critical decision points**, using tactical forcing moves, material swings, king pressure, branching/mobility, and pawn tension to prioritize positions for deeper analysis.
11. Extract post-game **clock annotations** when the PGN provides them, measuring move-time distributions, fast-response shares, and compressed think-time patterns without inventing timing evidence when clocks are absent.
12. Run **Stockfish 18** only after game completion and only on selected critical positions.
13. Sample up to **six spaced historical games** and score one critical decision from each to establish a cached personal engine baseline.
14. Compare the current game's engine agreement and centipawn loss against that player's own sampled baseline, rather than treating a generic engine metric as the whole case.
15. Build an evidence report separating account context, position difficulty, engine agreement, timing, repeated decisions, and the personal baseline.
16. Keep calibrated cheating probabilities disabled until a labeled validation corpus exists.

The current layers are deliberately conservative. They do **not** claim that repeated opening moves, long account histories, rating changes, a difficult position, fast moves, engine agreement, or a single personal-baseline improvement prove cheating.

## Engine architecture

Stockfish is run through a bundled browser worker in a Chrome MV3 offscreen document. The engine path is strictly post-game. The repository includes a reproducible vendor script so executable engine code is not fetched from a remote CDN at review time.

The personal baseline is intentionally small rather than a 300-game engine sweep. Historical positions are spaced across the recent behavioral window, scored at a lower depth, and cached for up to seven days. A personal-baseline signal is only promoted into the evidence report when at least four historical games and four scored positions are available.

## Planned analysis layers

1. Harden completed-game ingestion and PGN validation
2. Similar-position matching beyond exact position equality
3. Player-specific error signatures beyond engine agreement
4. Historical strength modeling
5. Change-point detection
6. Cross-game anomaly clustering
7. Multi-engine / multi-depth agreement analysis
8. Calibrated evidence fusion
9. Human-readable review reports

## API behavior

The public Chess.com API is read-only. Crab Watch uses serial archive requests rather than parallel bursts and caches the resulting history locally. The collector is intentionally conservative about request volume and reuses cached history.

## Important limitation

Crab Watch must not present an unsupported percentage as a factual probability of cheating. A calibrated probability requires a properly labeled evaluation dataset containing clean and confirmed-cheating examples. Until that exists, results should be presented as evidence-based anomaly assessments with uncertainty.
