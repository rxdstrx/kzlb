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

  const { token, request_id, action } = req.body;
  if (!token || !request_id || !action) return res.status(400).json({ error: 'Missing fields' });
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not configured' });
  const payload = verifyJWT(token, secret);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });

  // Fetch the request and verify it belongs to this user
  const getRes = await fetch(
    `${sbUrl}/rest/v1/friend_requests?id=eq.${request_id}&select=id,to_steamid,status`,
    { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
  );
  const rows = await getRes.json();
  if (!rows.length) return res.status(404).json({ error: 'Request not found' });
  const row = rows[0];
  if (row.to_steamid !== payload.steamid) return res.status(403).json({ error: 'Not your request' });
  if (row.status !== 'pending') return res.status(400).json({ error: 'Request already handled' });

  const newStatus = action === 'accept' ? 'accepted' : 'declined';

  const updateRes = await fetch(`${sbUrl}/rest/v1/friend_requests?id=eq.${request_id}`, {
    method: 'PATCH',
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
  });

  if (updateRes.ok) return res.status(200).json({ ok: true });
  const err = await updateRes.text();
  return res.status(500).json({ error: err });
}
