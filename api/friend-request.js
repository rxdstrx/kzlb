import crypto from 'crypto';

function verifyJWT(token, secret) {
  try {
    const [header, payload, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret)
      .update(`${header}.${payload}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://rxdstrx.github.io', 'https://kzlb.vercel.app'];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, to_steamid } = req.body;
  if (!token || !to_steamid) return res.status(400).json({ error: 'Missing fields' });
  if (!/^\d{17}$/.test(to_steamid)) return res.status(400).json({ error: 'Invalid steamid' });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not configured' });
  const payload = verifyJWT(token, secret);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

  const from_steamid = payload.steamid;
  if (from_steamid === to_steamid) return res.status(400).json({ error: 'Cannot add yourself' });

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });

  // Check no existing relationship
  const checkRes = await fetch(
    `${sbUrl}/rest/v1/friend_requests?or=(and(from_steamid.eq.${from_steamid},to_steamid.eq.${to_steamid}),and(from_steamid.eq.${to_steamid},to_steamid.eq.${from_steamid}))&select=id,status`,
    { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
  );
  const existing = await checkRes.json();
  if (existing.length > 0) {
    const row = existing[0];
    if (row.status === 'accepted') return res.status(400).json({ error: 'Already friends' });
    if (row.status === 'pending') return res.status(400).json({ error: 'Request already pending' });
    // declined — allow re-send by deleting old row
    await fetch(`${sbUrl}/rest/v1/friend_requests?id=eq.${row.id}`, {
      method: 'DELETE',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` }
    });
  }

  // Fetch to_steamid nickname/avatar from world cache
  let to_nickname = '', to_avatar = '';
  try {
    const worldRes = await fetch(`https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache/world-kz-players.json`);
    const world = await worldRes.json();
    const found = (world.players || []).find(p => p.steamid === to_steamid);
    if (found) { to_nickname = found.nickname || ''; to_avatar = found.avatar || ''; }
  } catch {}

  // Insert request
  const insertRes = await fetch(`${sbUrl}/rest/v1/friend_requests`, {
    method: 'POST',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      from_steamid,
      to_steamid,
      from_nickname: payload.nickname || '',
      from_avatar: payload.avatar || '',
      to_nickname,
      to_avatar,
      status: 'pending',
    }),
  });

  if (insertRes.ok) return res.status(200).json({ ok: true });
  const err = await insertRes.text();
  return res.status(500).json({ error: err });
}
