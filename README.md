# Crab Watch 🦀

Crab Watch is a Chrome extension for **post-game chess forensics** on Chess.com.

The goal is not to provide another engine-accuracy meter. Crab Watch examines a completed game in context: historical play, repeated decisions, position difficulty, timing behavior, strength changes, and other signals that may make a game statistically unusual.

## Design principles

- **Post-game only.** No chess analysis, evaluation, recommendations, or engine process is loaded during an active human-vs-human game.
- **Evidence over verdicts.** An unusual game is not proof of outside assistance.
- **History matters.** The opponent's recent public games form a baseline rather than treating every game in isolation.
- **Human behavior matters.** Expected mistakes, position difficulty, time pressure, and player-specific patterns matter more than raw engine agreement alone.
- **Quiet UI.** The interface uses clean cards, restrained typography, useful visual summaries, and no fake telemetry or sci-fi dashboard language.
- **Account size is context, not immunity.** A 351+ game history is retained as account-context evidence, not used as an innocence cutoff.

## Current state: 0.6.0

The extension now has a working post-game data path:

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
12. Build a descriptive historical-behavior report covering rating context, result profile, account span, repeated opening behavior, exact repeated-position decisions, critical-position findings, and available timing signals.
13. Store the evidence report for the next analysis layer.

The current history, critical-position, and timing layers are deliberately descriptive. They do **not** claim that repeated opening moves, long account histories, rating changes, a difficult position, fast moves, or a single unusual game prove cheating.

## Planned analysis layers

1. Harden completed-game ingestion and PGN validation
2. Similar-position matching beyond exact position equality
3. **Engine agreement and move-quality analysis after game completion**
4. Player-specific error signatures
5. Historical strength modeling
6. Change-point detection
7. Cross-game anomaly clustering
8. Multi-engine / multi-depth agreement analysis
9. Calibrated evidence fusion
10. Human-readable review reports

## API behavior

The public Chess.com API is read-only. Crab Watch uses serial archive requests rather than parallel bursts and caches the resulting history locally. The collector is intentionally conservative about request volume and reuses cached history.

## Important limitation

Crab Watch must not present an unsupported percentage as a factual probability of cheating. A calibrated probability requires a properly labeled evaluation dataset containing clean and confirmed-cheating examples. Until that exists, results should be presented as evidence-based anomaly assessments with uncertainty.
