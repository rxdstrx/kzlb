// Redirects user to Steam OpenID login
export default function handler(req, res) {
  const base = 'https://kzlb.vercel.app';
  const returnTo = encodeURIComponent(`${base}/api/steam-callback`);
  const realm = encodeURIComponent(base);

  const steamUrl =
    `https://steamcommunity.com/openid/login` +
    `?openid.ns=${encodeURIComponent('http://specs.openid.net/auth/2.0')}` +
    `&openid.mode=checkid_setup` +
    `&openid.return_to=${returnTo}` +
    `&openid.realm=${realm}` +
    `&openid.identity=${encodeURIComponent('http://specs.openid.net/auth/2.0/identifier_select')}` +
    `&openid.claimed_id=${encodeURIComponent('http://specs.openid.net/auth/2.0/identifier_select')}`;

  res.redirect(steamUrl);
}
