// Steam OpenID callback - verifies login and issues JWT
import crypto from 'crypto';

function base64url(str) {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function createJWT(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return `${header}.${body}.${sig}`;
}

export default async function handler(req, res) {
  const params = req.query;

  // Must be in id_res mode
  if (params['openid.mode'] !== 'id_res') {
    return res.redirect('/?login=cancelled');
  }

  // Verify with Steam
  const verifyParams = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    verifyParams.set(k, v);
  }
  verifyParams.set('openid.mode', 'check_authentication');

  const verifyRes = await fetch('https://steamcommunity.com/openid/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString(),
  });

  const verifyText = await verifyRes.text();
  if (!verifyText.includes('is_valid:true')) {
    return res.redirect('/?login=invalid');
  }

  // Extract SteamID from claimed_id
  const claimedId = params['openid.claimed_id'] || '';
  const match = claimedId.match(/\/(\d{17})$/);
  if (!match) return res.redirect('/?login=error');

  const steamid = match[1];
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not configured' });

  // Create JWT valid for 30 days
  const token = createJWT({ steamid, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 30 }, secret);

  // Redirect back to GitHub Pages with token in URL fragment (never sent to server)
  res.redirect(`https://rxdstrx.github.io/kzlb/index.html#token=${token}:${steamid}`);
}
