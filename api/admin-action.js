export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password, action, steamid, country } = req.body;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || password !== adminPassword) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!steamid || !/^\d{17}$/.test(steamid)) {
    return res.status(400).json({ error: 'Invalid steamid' });
  }

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_KEY;
  const sbH   = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' };

  const token = process.env.GH_TOKEN;
  if (!token) return res.status(500).json({ error: 'No GH_TOKEN configured' });

  let workflow, inputs;

  if (action === 'move') {
    if (!country || !/^[a-z]{2}$/.test(country)) return res.status(400).json({ error: 'Invalid country' });
    // Also update Supabase instantly
    if (sbUrl && sbKey) {
      fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}`, {
        method: 'PATCH',
        headers: { ...sbH, Prefer: 'return=minimal' },
        body: JSON.stringify({ country, updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    workflow = 'admin-action.yml';
    inputs = { action: 'move', steamid, country };
  } else if (action === 'remove') {
    // Delete from Supabase immediately — leaderboard updates instantly
    if (sbUrl && sbKey) {
      await fetch(`${sbUrl}/rest/v1/players?steamid=eq.${steamid}`, {
        method: 'DELETE',
        headers: { ...sbH, Prefer: 'return=minimal' },
      });
    }
    workflow = 'admin-action.yml';
    inputs = { action: 'remove', steamid, country: '' };
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
