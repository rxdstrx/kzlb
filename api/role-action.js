export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password, action, ...params } = req.body || {};

  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Supabase not configured' });

  const sbH = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  try {
    if (action === 'create_role') {
      const name = (params.name || '').trim().toUpperCase();
      if (!name) return res.status(400).json({ error: 'Role name required' });
      const r = await fetch(`${sbUrl}/rest/v1/roles`, {
        method: 'POST',
        headers: { ...sbH, Prefer: 'return=representation' },
        body: JSON.stringify({ name, color: params.color || '#fbbf24', icon: params.icon || '' }),
      });
      if (!r.ok) return res.status(400).json({ error: await r.text() });
      return res.json({ ok: true, name });
    }

    if (action === 'delete_role') {
      const { name } = params;
      if (!name) return res.status(400).json({ error: 'Role name required' });
      // Remove all player assignments first
      await fetch(`${sbUrl}/rest/v1/player_roles?role=eq.${encodeURIComponent(name)}`, {
        method: 'DELETE', headers: sbH,
      });
      const r = await fetch(`${sbUrl}/rest/v1/roles?name=eq.${encodeURIComponent(name)}`, {
        method: 'DELETE', headers: sbH,
      });
      if (!r.ok) return res.status(400).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    if (action === 'assign_role') {
      const { steamid, role } = params;
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
      const { steamid, role } = params;
      if (!steamid || !role) return res.status(400).json({ error: 'steamid and role required' });
      const r = await fetch(
        `${sbUrl}/rest/v1/player_roles?steamid=eq.${steamid}&role=eq.${encodeURIComponent(role)}`,
        { method: 'DELETE', headers: sbH }
      );
      if (!r.ok) return res.status(400).json({ error: await r.text() });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
