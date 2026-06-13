// Fast new-player registration — writes directly to GitHub JSON via API.
// Skips GitHub Actions entirely for players with no records.
// Full Cybershoke scrape (add-player.yml) still runs in background to pick up any stats.

const REPO   = 'rxdstrx/kzlb';
const BRANCH = 'main';

async function ghGet(path, token) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) return null;
  const d = await r.json();
  const content = JSON.parse(Buffer.from(d.content, 'base64').toString('utf8'));
  return { content, sha: d.sha };
}

async function ghPut(path, content, sha, message, token) {
  const body = {
    message,
    branch: BRANCH,
    content: Buffer.from(JSON.stringify(content, null, 2), 'utf8').toString('base64'),
  };
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.ok;
}

async function triggerRebuildWorld(token) {
  await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/rebuild-world.yml/dispatches`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: BRANCH }),
  }).catch(() => {});
}

const ALLOWED_ORIGINS = ['https://rxdstrx.github.io', 'https://kzlb.vercel.app'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const { steamid } = req.query;
  if (!steamid || !/^\d{17}$/.test(steamid)) return res.status(400).json({ error: 'Invalid steamid' });

  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) return res.status(500).json({ error: 'GH_TOKEN not configured' });

  // ── 1. Fetch player info from playerdb (free, no API key) ──
  let nickname = steamid, avatar = '', country = 'xx';
  try {
    const r = await fetch(`https://playerdb.co/api/player/steam/${steamid}`);
    const d = await r.json();
    const p = d?.data?.player;
    if (p) {
      nickname = p.username || steamid;
      avatar   = p.avatar   || '';
      country  = p.meta?.loccountrycode?.toLowerCase() || 'xx';
    }
  } catch {}

  // ── 2. Try Faceit for country if still unknown ──
  if (country === 'xx') {
    const faceitKey = process.env.FACEIT_KEY;
    if (faceitKey) {
      try {
        const r = await fetch(`https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamid}`, {
          headers: { Authorization: `Bearer ${faceitKey}` },
        });
        if (r.ok) {
          const d = await r.json();
          if (d.country) country = d.country.toLowerCase();
        }
      } catch {}
    }
  }

  const player = {
    steamid, nickname, avatar, country,
    kz_points: 0, kz_place: null, kz_maps: 0, maps_list: [],
  };

  // ── 3. Write individual cache file (only if it doesn't already exist) ──
  const indPath = `cache/${steamid}.json`;
  const indExisting = await ghGet(indPath, ghToken);

  if (indExisting) {
    // Removed by admin — do not re-register
    if (indExisting.content.removed) return res.status(200).json({ ok: true, removed: true });

    // Cache already exists — player was scraped before.
    // Check if they're already in the world leaderboard too.
    const world = await ghGet('cache/world-kz-players.json', ghToken);
    const inWorld = world?.content?.players?.find(p => p.steamid === steamid);
    if (inWorld) return res.status(200).json({ ok: true, already: true, country: inWorld.country, nickname: inWorld.nickname, avatar: inWorld.avatar });
    // In cache but not in world — fall through to add them to country + rebuild world.
    // Do NOT overwrite their existing cache file (may contain real scraped stats).
  } else {
    // Brand new player — create a minimal cache file so the profile page loads
    const indContent = {
      steamid, country,
      cached_at: new Date().toISOString(),
      user: {},
      maps: {
        list: [],
        header: {
          title: nickname, avatar,
          desc: { '{{Position}}': 9999, '{{Points}}': 0, '{{COMPLETIONS-MAP}}': '0 (0%)', '{{COMPLETIONS-BONUS}}': '0', WR: 0 },
        },
      },
    };
    await ghPut(indPath, indContent, null, `register: ${nickname} (${steamid})`, ghToken);
  }

  // ── 4. Write to country leaderboard file ──
  const countryPath = `cache/${country}-kz-players.json`;
  const countryFile = await ghGet(countryPath, ghToken);
  let countryContent, countrySha;

  if (countryFile) {
    const players = countryFile.content.players || [];
    const existingInCountry = players.find(p => p.steamid === steamid);
    if (existingInCountry) {
      // Already in this country — skip country write, trigger world rebuild
      await triggerRebuildWorld(ghToken);
      return res.status(200).json({ ok: true, already: true, country: existingInCountry.country, nickname: existingInCountry.nickname, avatar: existingInCountry.avatar });
    }
    players.push(player);
    players.sort((a, b) => b.kz_points - a.kz_points);
    countryContent = { updated_at: new Date().toISOString(), players };
    countrySha = countryFile.sha;
  } else {
    countryContent = { updated_at: new Date().toISOString(), players: [player] };
    countrySha = null;
  }

  const wrote = await ghPut(countryPath, countryContent, countrySha, `register: add ${nickname} to ${country}`, ghToken);

  // ── 5. Trigger lightweight world rebuild Action ──
  await triggerRebuildWorld(ghToken);

  // ── Sync to Supabase immediately so leaderboard shows without CDN delay ──
  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (sbUrl && sbKey) {
    fetch(`${sbUrl}/rest/v1/players`, {
      method: 'POST',
      headers: {
        apikey: sbKey, Authorization: `Bearer ${sbKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ steamid, nickname, avatar, country, kz_points: 0, kz_place: 0, kz_maps: 0, updated_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  return res.status(200).json({ ok: wrote, nickname, country, avatar });
}
