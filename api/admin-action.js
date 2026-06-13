const ALLOWED_ORIGINS = ['https://rxdstrx.github.io', 'https://kzlb.vercel.app'];

const failedAttempts = new Map();
const LOCKOUT_LIMIT = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const attempts = failedAttempts.get(ip) || { count: 0, until: 0 };
  if (attempts.until > now) return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });

  const { password, action, steamid, country, ...params } = req.body || {};

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || password !== adminPassword) {
    attempts.count++;
    if (attempts.count >= LOCKOUT_LIMIT) attempts.until = now + LOCKOUT_MS;
    failedAttempts.set(ip, attempts);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  failedAttempts.delete(ip);

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  const sbH   = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

  // ── Role actions (no steamid required) ───────────────────────────────────
  if (action === 'create_role') {
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
    const name = (params.name || '').trim().toUpperCase();
    if (!name) return res.status(400).json({ error: 'Role name required' });
    // Get current max priority so new role goes to the bottom
    const maxRes = await fetch(`${sbUrl}/rest/v1/roles?select=priority&order=priority.desc&limit=1`, {
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
    });
    const maxRows = maxRes.ok ? await maxRes.json() : [];
    const priority = maxRows.length > 0 ? (maxRows[0].priority ?? 0) + 1 : 0;
    const r = await fetch(`${sbUrl}/rest/v1/roles`, {
      method: 'POST',
      headers: { ...sbH, Prefer: 'return=representation' },
      body: JSON.stringify({ name, color: params.color || '#fbbf24', icon: params.icon || '', priority }),
    });
    if (!r.ok) return res.status(400).json({ error: await r.text() });
    return res.json({ ok: true, name });
  }

  if (action === 'save_roles_config') {
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
    const roles = params.roles;
    if (!Array.isArray(roles)) return res.status(400).json({ error: 'roles array required' });
    const results = await Promise.all(roles.map(({ name, priority, show_in_filter }) =>
      fetch(`${sbUrl}/rest/v1/roles?name=eq.${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { ...sbH, Prefer: 'return=minimal' },
        body: JSON.stringify({ priority, show_in_filter }),
      })
    ));
    const failed = results.filter(r => !r.ok);
    if (failed.length) return res.status(400).json({ error: `${failed.length} role(s) failed to save` });
    return res.json({ ok: true });
  }

  if (action === 'toggle_filter') {
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
    const name = params.name;
    if (!name) return res.status(400).json({ error: 'Role name required' });
    const r = await fetch(`${sbUrl}/rest/v1/roles?name=eq.${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { ...sbH, Prefer: 'return=minimal' },
      body: JSON.stringify({ show_in_filter: Boolean(params.show) }),
    });
    if (!r.ok) return res.status(400).json({ error: await r.text() });
    return res.json({ ok: true });
  }

  if (action === 'delete_role') {
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
    const name = params.name;
    if (!name) return res.status(400).json({ error: 'Role name required' });
    await fetch(`${sbUrl}/rest/v1/player_roles?role=eq.${encodeURIComponent(name)}`, { method: 'DELETE', headers: sbH });
    const r = await fetch(`${sbUrl}/rest/v1/roles?name=eq.${encodeURIComponent(name)}`, { method: 'DELETE', headers: sbH });
    if (!r.ok) return res.status(400).json({ error: await r.text() });
    return res.json({ ok: true });
  }

  if (action === 'assign_role') {
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
    const { role } = params;
    if (!steamid || !role) return res.status(400).json({ error: 'steamid and role required' });
    const r = await fetch(`${sbUrl}/rest/v1/player_roles`, {
      method: 'POST',
      headers: { ...sbH, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ steamid, role }),
    });
    if (!r.ok) return res.status(400).json({ error: await r.text() });
    return res.json({ ok: true });
  }

  if (action === 'remove_role') {
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
    const { role } = params;
    if (!steamid || !role) return res.status(400).json({ error: 'steamid and role required' });
    const r = await fetch(`${sbUrl}/rest/v1/player_roles?steamid=eq.${steamid}&role=eq.${encodeURIComponent(role)}`, { method: 'DELETE', headers: sbH });
    if (!r.ok) return res.status(400).json({ error: await r.text() });
    return res.json({ ok: true });
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (action === 'verify') {
    return res.status(200).json({ ok: true });
  }

  if (action === 'bulk_update') {
    const token = process.env.GH_TOKEN;
    if (!token) return res.status(500).json({ error: 'No GH_TOKEN configured' });
    const response = await fetch(
      'https://api.github.com/repos/rxdstrx/kzlb/actions/workflows/bulk-update.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main' }),
      }
    );
    if (response.status === 204) return res.status(200).json({ ok: true });
    const text = await response.text();
    return res.status(response.status).json({ error: text });
  }

  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid' });
  }

  const token = process.env.GH_TOKEN;
  if (!token) return res.status(500).json({ error: 'No GH_TOKEN configured' });

  let workflow, inputs;

  if (action === 'move') {
    if (!country || !/^[a-z]{2}$/.test(country)) return res.status(400).json({ error: 'Invalid country' });
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
    const r = await fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}`, {
      method: 'PATCH',
      headers: { ...sbH, Prefer: 'return=representation' },
      body: JSON.stringify({ country }),
    });
    if (!r.ok) return res.status(500).json({ error: 'DB update failed' });
    const rows = await r.json();
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true });
  } else if (action === 'remove') {
    if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });
    await fetch(`${sbUrl}/rest/v1/player_roles?steamid=eq.${steamid}`, { method: 'DELETE', headers: sbH });
    await fetch(`${sbUrl}/rest/v1/player_maps?steamid=eq.${steamid}`, { method: 'DELETE', headers: sbH });
    const r = await fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}`, { method: 'DELETE', headers: sbH });
    if (!r.ok) return res.status(500).json({ error: 'DB delete failed' });
    return res.json({ ok: true });
  } else if (action === 'update') {
    workflow = 'add-player.yml';
    let existingCountry = 'xx';
    try {
      const r = await fetch(`https://raw.githubusercontent.com/rxdstrx/kzlb/main/cache/${steamid}.json`);
      if (r.ok) { const d = await r.json(); if (d.country) existingCountry = d.country; }
    } catch {}
    inputs = { steamid, country: existingCountry, nickname: '' };
  } else if (action === 'add') {
    workflow = 'add-player.yml';
    inputs = { steamid, country: country || 'xx', nickname: '' };
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  const response = await fetch(
    `https://api.github.com/repos/rxdstrx/kzlb/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    }
  );

  if (response.status === 204) return res.status(200).json({ ok: true });
  const text = await response.text();
  return res.status(response.status).json({ error: text });
}
