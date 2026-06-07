exports.handler = async (event) => {
  const input = event.queryStringParameters?.input?.trim();

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (!input) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'No input' }) };
  }

  // Already a steamid64
  if (/^\d{17}$/.test(input)) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ steamid: input }) };
  }

  // Extract vanity name or steamid from URL
  let vanity = input;

  const profileMatch = input.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profileMatch) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ steamid: profileMatch[1] }) };
  }

  const vanityMatch = input.match(/steamcommunity\.com\/id\/([^/?#]+)/);
  if (vanityMatch) vanity = vanityMatch[1].replace(/\/$/, '');

  // Fetch Steam XML to resolve vanity name
  try {
    const res  = await fetch(`https://steamcommunity.com/id/${vanity}/?xml=1`);
    const text = await res.text();
    const match = text.match(/<steamID64>(\d{17})<\/steamID64>/);
    if (match) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ steamid: match[1] }) };
    }
  } catch {}

  return { statusCode: 404, headers: cors, body: JSON.stringify({ error: 'Could not resolve Steam ID' }) };
};
