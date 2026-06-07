export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const input = req.query.input?.trim();
  if (!input) return res.status(400).json({ error: 'No input' });

  if (/^\d{17}$/.test(input)) return res.status(200).json({ steamid: input });

  const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profileMatch) return res.status(200).json({ steamid: profileMatch[1] });

  let vanity = input;
  const vanityMatch = input.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  if (vanityMatch) vanity = vanityMatch[1].replace(/\/$/, '');

  try {
    const r = await fetch(`https://steamcommunity.com/id/${vanity}/?xml=1`);
    const text = await r.text();
    const match = text.match(/<steamID64>(\d{17})<\/steamID64>/);
    if (match) return res.status(200).json({ steamid: match[1] });
  } catch {}

  return res.status(404).json({ error: 'Could not resolve Steam ID' });
}
