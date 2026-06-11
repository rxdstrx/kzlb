import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  const cookie = Deno.env.get('CYBERSHOKE_COOKIE') || ''

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-GB,en;q=0.7',
    'Origin': 'https://cybershoke.net',
    'Referer': 'https://cybershoke.net/ru/cs2/leaderboard/kz/maps/76561199381926813',
    'Sec-Ch-Ua': '"Brave";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
    'Cookie': cookie,
  }

  const body = {
    mode: 18, season: 0, only_friends: false, only_pro: false,
    id_games: '2', map: null, category: null,
    steamid64: '76561199381926813', sub_type: 0, type: 1,
  }

  try {
    const r = await fetch('https://cybershoke.net/api/api/v2/leaderboard/data', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    const text = await r.text()
    let data: any = {}
    try { data = JSON.parse(text) } catch {}

    return new Response(JSON.stringify({
      status: r.status,
      maps: data?.list?.length ?? 0,
      nickname: data?.header?.title ?? null,
      points: data?.header?.desc?.['{{Points}}'] ?? null,
      raw_preview: text.slice(0, 300),
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
