// Player-settings endpoint. Handles the original "change flag" call plus
// the newer Settings page actions — kept in one file (not split into
// get-settings.js / update-settings.js) because Vercel's Hobby plan caps
// serverless functions at 12 and api/ is already at that limit.
//
// POST body shapes:
//   { token, country }                              — legacy: change flag (no `action`)
//   { token, action: 'get-settings' }                — read own settings
//   { token, action: 'update-settings', ...fields }  — write own settings
import crypto from 'crypto';

function verifyJWT(token, secret) {
  try {
    const [header, payload, sig] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', secret)
      .update(`${header}.${payload}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (sig !== expectedSig) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

const NICKNAME_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const NICKNAME_RE = /^[A-Za-z0-9 _\-.]{2,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://rxdstrx.github.io', 'https://kzlb.vercel.app'];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, action, country } = req.body || {};

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not configured' });

  const payload = verifyJWT(token, secret);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  const { steamid } = payload;

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
  const sbH = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' };

  // ── GET SETTINGS ──
  if (action === 'get-settings') {
    const [playerRes, profileRes] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}&select=nickname,country,nickname_updated_at&limit=1`, { headers: sbH }),
      fetch(`${sbUrl}/rest/v1/player_profiles?steamid=eq.${steamid}&select=email,show_location,language,trade_link,safe_talking,hide_online,hide_inventory&limit=1`, { headers: sbH }),
    ]);
    const playerRows = playerRes.ok ? await playerRes.json() : [];
    const player = playerRows[0] || {};

    let profileRows = profileRes.ok ? await profileRes.json() : [];
    let profile = profileRows[0];
    if (!profile) {
      const createRes = await fetch(`${sbUrl}/rest/v1/player_profiles`, {
        method: 'POST',
        headers: { ...sbH, Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify({ steamid }),
      });
      const created = createRes.ok ? await createRes.json() : [];
      profile = created[0] || {};
    }

    let nicknameCooldownRemainingMs = 0;
    if (player.nickname_updated_at) {
      const msSince = Date.now() - new Date(player.nickname_updated_at).getTime();
      nicknameCooldownRemainingMs = Math.max(0, NICKNAME_COOLDOWN_MS - msSince);
    }

    return res.status(200).json({
      ok: true,
      steamid,
      nickname: player.nickname || '',
      country: player.country || 'xx',
      nicknameCooldownRemainingMs,
      email: profile.email || '',
      showLocation: profile.show_location !== false,
      language: profile.language || 'en',
      tradeLink: profile.trade_link || '',
      safeTalking: profile.safe_talking !== false,
      hideOnline: !!profile.hide_online,
      hideInventory: !!profile.hide_inventory,
    });
  }

  // ── UPDATE SETTINGS ──
  if (action === 'update-settings') {
    const { nickname, email, showLocation, language, tradeLink, safeTalking, hideOnline, hideInventory } = req.body || {};

    if (nickname !== undefined) {
      if (!NICKNAME_RE.test(nickname)) {
        return res.status(400).json({ error: 'Nickname must be 2-24 characters (letters, numbers, spaces, - _ .).' });
      }
      const r = await fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}&select=nickname_updated_at&limit=1`, { headers: sbH });
      const rows = r.ok ? await r.json() : [];
      const lastChange = rows[0]?.nickname_updated_at;
      if (lastChange) {
        const msSince = Date.now() - new Date(lastChange).getTime();
        if (msSince < NICKNAME_COOLDOWN_MS) {
          const daysLeft = Math.ceil((NICKNAME_COOLDOWN_MS - msSince) / (24 * 60 * 60 * 1000));
          return res.status(429).json({ error: `You can change your nickname again in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.` });
        }
      }
      const upd = await fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}`, {
        method: 'PATCH',
        headers: { ...sbH, Prefer: 'return=minimal' },
        body: JSON.stringify({ nickname, nickname_manual: true, nickname_updated_at: new Date().toISOString() }),
      });
      if (!upd.ok) return res.status(500).json({ error: 'Failed to update nickname: ' + await upd.text() });

      // forum_threads/forum_replies store a nickname snapshot at post time
      // (not a live join to players), so a rename leaves old posts showing
      // the old name unless we also patch those rows here.
      await Promise.all([
        fetch(`${sbUrl}/rest/v1/forum_threads?steamid=eq.${steamid}`, {
          method: 'PATCH', headers: { ...sbH, Prefer: 'return=minimal' }, body: JSON.stringify({ nickname }),
        }),
        fetch(`${sbUrl}/rest/v1/forum_replies?steamid=eq.${steamid}`, {
          method: 'PATCH', headers: { ...sbH, Prefer: 'return=minimal' }, body: JSON.stringify({ nickname }),
        }),
      ]).catch(() => {});
    }

    const profileUpdate = {};
    if (email !== undefined) {
      if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address.' });
      profileUpdate.email = email || null;
    }
    if (showLocation !== undefined) profileUpdate.show_location = !!showLocation;
    if (language !== undefined) {
      if (!['en', 'ru'].includes(language)) return res.status(400).json({ error: 'Invalid language.' });
      profileUpdate.language = language;
    }
    if (tradeLink !== undefined) profileUpdate.trade_link = tradeLink || null;
    if (safeTalking !== undefined) profileUpdate.safe_talking = !!safeTalking;
    if (hideOnline !== undefined) profileUpdate.hide_online = !!hideOnline;
    if (hideInventory !== undefined) profileUpdate.hide_inventory = !!hideInventory;

    if (Object.keys(profileUpdate).length) {
      const upd = await fetch(`${sbUrl}/rest/v1/player_profiles`, {
        method: 'POST',
        headers: { ...sbH, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ steamid, ...profileUpdate }),
      });
      if (!upd.ok) return res.status(500).json({ error: 'Failed to update settings: ' + await upd.text() });
    }

    return res.status(200).json({ ok: true });
  }

  // ── LEGACY: CHANGE FLAG (no `action` — original behavior, unchanged) ──
  if (!country || !/^[a-z]{2}$/.test(country)) {
    return res.status(400).json({ error: 'Invalid country code' });
  }

  const sbRes = await fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}`, {
    method: 'PATCH',
    headers: { ...sbH, Prefer: 'return=representation' },
    body: JSON.stringify({ country, country_manual: true, updated_at: new Date().toISOString() }),
  });

  if (!sbRes.ok) {
    const err = await sbRes.text();
    return res.status(500).json({ error: 'DB update failed: ' + err });
  }

  const rows = await sbRes.json();
  if (!rows || rows.length === 0) {
    return res.status(404).json({ error: 'not_found' });
  }

  return res.status(200).json({ ok: true });
}
