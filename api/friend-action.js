// Merged: friend-request + friend-respond
// action=send    : send a friend request
// action=respond : accept or decline a request

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

const CORS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://rxdstrx.github.io', 'https://kzlb.vercel.app'];
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { token, action, to_steamid, request_id, respond } = req.body;
  if (!token || !action) return res.status(400).json({ error: 'Missing fields' });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'JWT_SECRET not configured' });
  const payload = verifyJWT(token, secret);
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token' });

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
  const sbH = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' };

  // ── SEND FRIEND REQUEST ──
  if (action === 'send') {
    if (!to_steamid || !/^\d{17}$/.test(to_steamid)) return res.status(400).json({ error: 'Invalid steamid' });
    const from_steamid = payload.steamid;
    if (from_steamid === to_steamid) return res.status(400).json({ error: 'Cannot add yourself' });

    const checkRes = await fetch(
      `${sbUrl}/rest/v1/friend_requests?or=(and(from_steamid.eq.${from_steamid},to_steamid.eq.${to_steamid}),and(from_steamid.eq.${to_steamid},to_steamid.eq.${from_steamid}))&select=id,status`,
      { headers: sbH }
    );
    const existing = await checkRes.json();
    if (existing.length > 0) {
      const row = existing[0];
      if (row.status === 'accepted') return res.status(400).json({ error: 'Already friends' });
      if (row.status === 'pending') return res.status(400).json({ error: 'Request already pending' });
      await fetch(`${sbUrl}/rest/v1/friend_requests?id=eq.${row.id}`, { method: 'DELETE', headers: sbH });
    }

    let to_nickname = '', to_avatar = '', from_nickname = '', from_avatar = '';
    try {
      const worldRes = await fetch('https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache/world-kz-players.json');
      const world = await worldRes.json();
      const players = world.players || [];
      const toFound   = players.find(p => p.steamid === to_steamid);
      const fromFound = players.find(p => p.steamid === from_steamid);
      if (toFound)   { to_nickname   = toFound.nickname   || ''; to_avatar   = toFound.avatar   || ''; }
      if (fromFound) { from_nickname = fromFound.nickname || ''; from_avatar = fromFound.avatar || ''; }
    } catch {}

    const insertRes = await fetch(`${sbUrl}/rest/v1/friend_requests`, {
      method: 'POST',
      headers: { ...sbH, Prefer: 'return=minimal' },
      body: JSON.stringify({ from_steamid, to_steamid, from_nickname, from_avatar, to_nickname, to_avatar, status: 'pending' }),
    });
    if (insertRes.ok) return res.status(200).json({ ok: true });
    return res.status(500).json({ error: await insertRes.text() });
  }

  // ── RESPOND TO REQUEST (accept / decline / remove) ──
  if (action === 'respond') {
    if (!request_id || !respond) return res.status(400).json({ error: 'Missing request_id or respond' });
    if (!['accept', 'decline'].includes(respond)) return res.status(400).json({ error: 'Invalid respond value' });

    const getRes = await fetch(
      `${sbUrl}/rest/v1/friend_requests?id=eq.${request_id}&select=id,to_steamid,from_steamid,status`,
      { headers: sbH }
    );
    const rows = await getRes.json();
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    const row = rows[0];

    // Accept/decline: only to_steamid can respond. Remove (decline on accepted): either party.
    const isSender = row.from_steamid === payload.steamid;
    const isReceiver = row.to_steamid === payload.steamid;
    if (!isSender && !isReceiver) return res.status(403).json({ error: 'Not your request' });
    if (respond === 'accept' && !isReceiver) return res.status(403).json({ error: 'Only the recipient can accept' });

    // Decline on a pending request = reject. Decline on an accepted row = remove friend.
    // Either way: just DELETE the row — no point keeping declined/removed rows.
    let updateRes;
    if (respond === 'decline') {
      updateRes = await fetch(`${sbUrl}/rest/v1/friend_requests?id=eq.${request_id}`, {
        method: 'DELETE',
        headers: { ...sbH, Prefer: 'return=minimal' },
      });
    } else {
      updateRes = await fetch(`${sbUrl}/rest/v1/friend_requests?id=eq.${request_id}`, {
        method: 'PATCH',
        headers: { ...sbH, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'accepted', updated_at: new Date().toISOString() }),
      });
    }
    if (!updateRes.ok) return res.status(500).json({ error: await updateRes.text() });

    // ── Insert notifications for both players when accepted ──
    if (respond === 'accept') {
      // Fetch both players' info in parallel
      let acceptorNickname = '', acceptorAvatar = '';
      let senderNickname   = '', senderAvatar   = '';
      try {
        const [aRes, sRes] = await Promise.all([
          fetch(`${sbUrl}/rest/v1/players?steamid=eq.${payload.steamid}&select=nickname,avatar&limit=1`, { headers: sbH }),
          fetch(`${sbUrl}/rest/v1/players?steamid=eq.${row.from_steamid}&select=nickname,avatar&limit=1`, { headers: sbH }),
        ]);
        const aRows = await aRes.json();
        const sRows = await sRes.json();
        if (aRows.length) { acceptorNickname = aRows[0].nickname || ''; acceptorAvatar = aRows[0].avatar || ''; }
        if (sRows.length) { senderNickname   = sRows[0].nickname || ''; senderAvatar   = sRows[0].avatar || ''; }
      } catch {}

      // Notify sender: "[Acceptor] accepted your friend request"
      // Notify acceptor: "You accepted [Sender]'s friend request"
      await Promise.all([
        fetch(`${sbUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...sbH, Prefer: 'return=minimal' },
          body: JSON.stringify({
            steamid: row.from_steamid, type: 'friend_accepted',
            from_steamid: payload.steamid, from_nickname: acceptorNickname, from_avatar: acceptorAvatar,
          }),
        }),
        fetch(`${sbUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...sbH, Prefer: 'return=minimal' },
          body: JSON.stringify({
            steamid: payload.steamid, type: 'friend_you_accepted',
            from_steamid: row.from_steamid, from_nickname: senderNickname, from_avatar: senderAvatar,
          }),
        }),
      ]);
    }

    return res.status(200).json({ ok: true });
  }

  // ── SET BANNER ──
  if (action === 'set-banner') {
    const { banner_url } = req.body;
    const steamid = payload.steamid;
    // Allow empty string to remove banner; limit base64 size (~400KB)
    if (banner_url !== '' && typeof banner_url !== 'string') return res.status(400).json({ error: 'Invalid banner_url' });
    if (banner_url.length > 2000000) return res.status(400).json({ error: 'Banner too large (max ~1.5MB)' });

    const upsertRes = await fetch(`${sbUrl}/rest/v1/player_profiles`, {
      method: 'POST',
      headers: { ...sbH, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ steamid, banner_url, updated_at: new Date().toISOString() }),
    });
    if (upsertRes.ok) return res.status(200).json({ ok: true });
    return res.status(500).json({ error: await upsertRes.text() });
  }

  // ── GET NOTIFICATIONS ──
  if (action === 'get-notifications') {
    const steamid = payload.steamid;
    const notifRes = await fetch(
      `${sbUrl}/rest/v1/notifications?steamid=eq.${steamid}&order=created_at.desc&limit=10`,
      { headers: sbH }
    );
    if (!notifRes.ok) return res.status(500).json({ error: await notifRes.text() });
    const items = await notifRes.json();
    return res.status(200).json({ ok: true, notifications: items });
  }

  // ── MARK NOTIFICATIONS AS READ ──
  if (action === 'notifications-read') {
    const steamid = payload.steamid;
    await fetch(`${sbUrl}/rest/v1/notifications?steamid=eq.${steamid}&read=eq.false`, {
      method: 'PATCH',
      headers: { ...sbH, Prefer: 'return=minimal' },
      body: JSON.stringify({ read: true }),
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
