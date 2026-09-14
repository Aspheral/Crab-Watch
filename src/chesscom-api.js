/** Public Chess.com PubAPI client. Post-game/background use only. */
const API = 'https://api.chess.com/pub';
const MAX_GAMES = 300;
const CACHE_MS = 15 * 60 * 1000;

function validUsername(username) {
  return typeof username === 'string' && /^[A-Za-z0-9_-]{2,25}$/.test(username);
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Chess.com API ${response.status}`);
  return response.json();
}

export async function getPlayer(username) {
  if (!validUsername(username)) throw new Error('Invalid Chess.com username.');
  return getJson(`${API}/player/${encodeURIComponent(username)}`);
}

export async function getArchives(username) {
  if (!validUsername(username)) throw new Error('Invalid Chess.com username.');
  return getJson(`${API}/player/${encodeURIComponent(username)}/games/archives`);
}

export async function getArchive(url) {
  if (!url?.startsWith(`${API}/player/`)) throw new Error('Invalid archive URL.');
  return getJson(url);
}

export async function getRecentGames(username, limit = MAX_GAMES) {
  const player = await getPlayer(username);
  const archives = await getArchives(username);
  const urls = Array.isArray(archives.archives) ? [...archives.archives].reverse() : [];
  const games = [];

  for (const url of urls) {
    if (games.length >= limit) break;
    const month = await getArchive(url);
    if (Array.isArray(month.games)) games.push(...month.games);
  }

  games.sort((a, b) => (b.end_time || b.start_time || 0) - (a.end_time || a.start_time || 0));
  return { player, games: games.slice(0, limit), fetchedAt: Date.now(), cacheMs: CACHE_MS };
}

export { validUsername, MAX_GAMES, CACHE_MS };
