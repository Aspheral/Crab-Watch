# Crab Watch 🦀

Crab Watch is a Chrome extension for **post-game chess forensics** on Chess.com.

The goal is not to provide another engine-accuracy meter. Crab Watch examines a completed game in context: historical play, repeated decisions, position difficulty, timing behavior, strength changes, and other signals that may make a game statistically unusual.

## Design principles

- **Post-game only.** No chess analysis, evaluation, recommendations, or engine process is loaded during an active human-vs-human game.
- **Evidence over verdicts.** An unusual game is not proof of outside assistance.
- **History matters.** The opponent's recent public games form a baseline rather than treating every game in isolation.
- **Human behavior matters.** Expected mistakes, position difficulty, time pressure, and player-specific patterns matter more than raw engine agreement alone.
- **Quiet UI.** The interface uses clean cards, restrained typography, useful visual summaries, and no fake telemetry or sci-fi dashboard language.
- **Account size is context, not immunity.** A large game history can be informative, but there is no arbitrary game-count cutoff that makes an account innocent.

## Current state: 0.4.0

The extension now has a working post-game data path:

1. Detect a completed Chess.com game.
2. Capture visible game identity and move information without analyzing the position.
3. Identify the opponent when the page exposes an unambiguous current-user identity.
4. Collect the opponent's most recent **300 public games** through Chess.com's read-only PubAPI.
5. Cache the history locally and reuse it for up to 12 hours.
6. Match the completed game against the public archive when possible.
7. Build an initial historical-behavior report covering rating context, game count, result profile, account span, and repeated early-game decisions.
8. Store the evidence report for the next analysis layer.

The current history layer is deliberately descriptive. It does **not** claim that repeated opening moves, long account histories, rating changes, or a single unusual game prove cheating.

## Planned analysis layers

1. Completed-game ingestion and PGN validation
2. Public account history collection and caching
3. Full board reconstruction and position indexing
4. Exact repeated-position detection
5. Similar-position matching beyond exact FEN equality
6. Position difficulty and critical-decision modeling
7. Engine agreement and move-quality analysis after game completion
8. Player-specific error signatures
9. Historical strength modeling
10. Change-point detection
11. Move-time behavior analysis where reliable timing data exists
12. Cross-game anomaly clustering
13. Multi-engine / multi-depth agreement analysis
14. Calibrated evidence fusion
15. Human-readable review reports

## API behavior

The public Chess.com API is read-only. Crab Watch uses serial archive requests rather than parallel bursts and caches the resulting history locally. The project does not send moves or other commands to Chess.com.

## Important limitation

Crab Watch must not present an unsupported percentage as a factual probability of cheating. A calibrated probability requires a properly labeled evaluation dataset containing clean and confirmed-cheating examples. Until that exists, results should be presented as evidence-based anomaly assessments with uncertainty.
