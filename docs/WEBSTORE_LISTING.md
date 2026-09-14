# Chrome Web Store Listing Draft

## Name

Crab Watch

## Short description

Post-game chess forensics for Chess.com. Review completed games in historical context. No live analysis.

## Full description

Crab Watch is a post-game chess forensics tool for Chess.com.

It reviews completed games against the opponent's public playing history and looks at several independent signals, including:

- historical playing strength and result patterns
- difficult and critical decisions
- move timing when clock data is available
- repeated decisions in recurring positions
- structurally similar historical positions
- Stockfish 18 analysis on selected post-game positions
- a personal engine baseline sampled from the player's own recent games
- behavioral change-point signals across the recent history

Crab Watch is deliberately conservative. An unusual game is not proof of cheating, and the extension does not provide a cheating percentage without a properly validated dataset.

Crab Watch is designed for review after a game has finished. It does not provide live move recommendations or live engine assistance during play.

## Key privacy statement

Game and account data used for a review comes from public Chess.com data and the completed game. Recent history and analysis results may be cached locally in Chrome extension storage to reduce repeated requests.

## Audience

Players, coaches, tournament organizers, researchers, and anyone who wants a structured second look at an unusual completed game.
