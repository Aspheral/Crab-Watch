# Crab Watch 🦀

Crab Watch is a Chrome extension for **post-game chess forensics** on Chess.com.

The goal is not to provide another "engine accuracy" meter. Crab Watch is being designed to examine a completed game in context: historical play, repeated decisions, position difficulty, timing behavior, strength changes, and other signals that may make a game statistically unusual.

## Design principles

- **Post-game only.** No chess analysis, evaluation, recommendations, or engine process is loaded during an active human-vs-human game.
- **Evidence over verdicts.** An unusual game is not proof of outside assistance.
- **History matters.** The account's recent games form an important baseline rather than treating every game in isolation.
- **Human behavior matters.** Expected mistakes, position difficulty, time pressure, and player-specific patterns are more useful than raw engine agreement alone.
- **Quiet UI.** The interface follows the visual language of chess tools: clean cards, restrained typography, useful visual summaries, and no fake telemetry.

## Current state

`0.1.0` establishes the Chrome MV3 shell, Crab Watch visual system, logo asset, storage bridge, and a deliberately limited game-completion detector. The forensic analyzer is not implemented yet.

## Planned analysis layers

1. Completed-game ingestion and PGN validation
2. Public account history collection and caching
3. Position indexing and repeated-position detection
4. Similar-position matching
5. Position difficulty and critical-decision modeling
6. Engine agreement and move-quality analysis
7. Player-specific error signatures
8. Historical strength modeling
9. Change-point detection
10. Move-time behavior analysis where reliable timing data exists
11. Cross-game anomaly clustering
12. Calibrated evidence fusion
13. Human-readable review reports

## Important limitation

Crab Watch must not present an unsupported percentage as a factual probability of cheating. A calibrated probability requires a properly labeled evaluation dataset. Until such calibration exists, results should be presented as evidence-based anomaly assessments with uncertainty.
