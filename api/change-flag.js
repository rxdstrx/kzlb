// Allows a logged-in user to change their own flag
import crypto from 'crypto';

function base64url(str) {
  return Buffer.from(str, 'base64').toString('utf8');
}

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

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://rxdstrx.github.io', 'https://kzlb.vercel.app'];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, country } = req.body;

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not configured' });

  const payload = verifyJWT(token, secret);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });

  const { steamid } = payload;

  if (!country || !/^[a-z]{2}$/.test(country)) {
    return res.status(400).json({ error: 'Invalid country code' });
  }

  // Allow flag change even if player cache doesn't exist yet (new player, scrape pending)
  // move-player-country.js handles the new-player case gracefully

  // Trigger GitHub Action to move player
  const ghToken = process.env.GH_TOKEN;
  if (!ghToken) return res.status(500).json({ error: 'GH_TOKEN not configured' });

  const response = await fetch(
    `https://api.github.com/repos/rxdstrx/kzlb/actions/workflows/admin-action.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ghToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { action: 'move', steamid, country } }),
    }
  );

  if (response.status === 204) return res.status(200).json({ ok: true });
  const text = await response.text();
  return res.status(response.status).json({ error: text });
}
