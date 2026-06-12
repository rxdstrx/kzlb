"""
Bulk update all players in Supabase via parallel Cybershoke scraping.
~15 concurrent scrapes — 10k players in ~15-20 minutes.
Direct Supabase REST writes — 0 Edge Function invocations.
"""
import asyncio, json, os, sys, time

COOKIE = os.environ.get('CYBERSHOKE_COOKIE', '')
SB_URL  = os.environ.get('SUPABASE_URL', '')
SB_KEY  = os.environ.get('SUPABASE_SERVICE_KEY', '')
CONCURRENCY = 5

if not COOKIE:
    print('CYBERSHOKE_COOKIE not set', flush=True)
    sys.exit(1)
if not SB_URL or not SB_KEY:
    print('SUPABASE_URL or SUPABASE_SERVICE_KEY not set', flush=True)
    sys.exit(1)

try:
    from curl_cffi.requests import AsyncSession
except ImportError:
    print('curl_cffi not installed. Run: pip install curl_cffi', flush=True)
    sys.exit(1)

SB_HDR = {
    'apikey': SB_KEY,
    'Authorization': f'Bearer {SB_KEY}',
    'Content-Type': 'application/json',
}

CY_HDR = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-GB,en;q=0.7',
    'Origin': 'https://cybershoke.net',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
}

async def get_all_steamids(s):
    r = await s.get(
        f"{SB_URL}/rest/v1/players?select=steamid&limit=50000",
        headers=SB_HDR,
    )
    return [row['steamid'] for row in r.json()]

async def scrape(s, steamid, sem):
    async with sem:
        body = {
            'mode': 18, 'season': 0, 'only_friends': False, 'only_pro': False,
            'id_games': '2', 'map': None, 'category': None,
            'steamid64': steamid, 'sub_type': 0, 'type': 1,
        }
        hdrs = {**CY_HDR, 'Referer': f'https://cybershoke.net/ru/cs2/leaderboard/kz/maps/{steamid}'}
        await asyncio.sleep(0.3)  # space out requests to avoid 429
        for attempt in range(3):
            try:
                r = await s.post(
                    'https://cybershoke.net/api/api/v2/leaderboard/data',
                    json=body, headers=hdrs, timeout=20,
                )
                if r.status_code == 429:
                    wait = 15 * (attempt + 1)
                    print(f'[{steamid}] 429 rate limit, waiting {wait}s...', flush=True)
                    await asyncio.sleep(wait)
                    continue
                if r.status_code != 200:
                    print(f'[{steamid}] HTTP {r.status_code}', flush=True)
                    return None
                return r.json()
            except Exception as e:
                print(f'[{steamid}] error attempt {attempt+1}: {e}', flush=True)
                if attempt < 2:
                    await asyncio.sleep(5)
        return None

def parse(steamid, data):
    if not data:
        return None
    h = data.get('header', {})
    d = h.get('desc', {})
    maps = []
    for m in data.get('list', []):
        if not m.get('map'):
            continue
        maps.append({
            'steamid': steamid,
            'map': m.get('map', ''),
            'points': str(m.get('points', '0')),
            'time_record': m.get('time_record', ''),
            'unixtime_record': m.get('unixtime_record', 0),
            'place_num': str(m.get('place_num', '')).strip(),
            'tier': m.get('tier', 0),
            'completions': str(m.get('completions', '0')),
        })
    pts   = str(d.get('{{Points}}', '0'))
    place = str(d.get('{{Position}}', '0'))
    nick  = h.get('title', '') or steamid  # fall back to steamid if no nickname
    return {
        'steamid':   steamid,
        'nickname':  nick,
        'avatar':    h.get('avatar', ''),
        'kz_points': int(pts)   if pts.isdigit()   else 0,
        'kz_place':  int(place) if place.isdigit() else 0,
        'kz_maps':   len(maps),
        'maps':      maps,
    }

async def write_player(s, player):
    sid = player['steamid']
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    # PATCH players table — never touch country (preserves flag)
    await s.patch(
        f"{SB_URL}/rest/v1/players?steamid=eq.{sid}",
        json={
            'nickname':  player['nickname'],
            'avatar':    player['avatar'],
            'kz_points': player['kz_points'],
            'kz_place':  player['kz_place'],
            'kz_maps':   player['kz_maps'],
            'cached_at': now,
        },
        headers={**SB_HDR, 'Prefer': 'return=minimal'},
    )

    # UPSERT player_maps in batches of 200
    maps = player['maps']
    for i in range(0, len(maps), 200):
        await s.post(
            f"{SB_URL}/rest/v1/player_maps",
            json=maps[i:i+200],
            headers={**SB_HDR, 'Prefer': 'resolution=merge-duplicates,return=minimal'},
        )

async def main():
    sem   = asyncio.Semaphore(CONCURRENCY)
    done  = 0
    errors = 0
    start = time.time()

    async with AsyncSession(impersonate='chrome120') as s:
        # Set Cybershoke cookies on session (only sent to cybershoke.net domain)
        for part in COOKIE.split('; '):
            if '=' in part:
                k, v = part.split('=', 1)
                s.cookies.set(k.strip(), v.strip(), domain='cybershoke.net')

        print('Fetching all player steamids from Supabase...', flush=True)
        steamids = await get_all_steamids(s)
        total = len(steamids)
        print(f'Found {total} players. Starting bulk update ({CONCURRENCY} concurrent)...', flush=True)

        async def process(steamid):
            nonlocal done, errors
            raw    = await scrape(s, steamid, sem)
            player = parse(steamid, raw)
            if player:
                await write_player(s, player)
                done += 1
                if done % 100 == 0 or done <= 5:
                    elapsed = time.time() - start
                    rate = done / elapsed if elapsed > 0 else 0
                    eta  = (total - done) / rate / 60 if rate > 0 else 0
                    print(f'[{done}/{total}] {rate*60:.0f}/min — ETA {eta:.1f}min', flush=True)
            else:
                errors += 1
                print(f'[SKIP] {steamid} — no data returned', flush=True)

        async def staggered(idx, sid):
            await asyncio.sleep(idx * 0.5)  # stagger startup so tasks don't all fire at once
            await process(sid)

        await asyncio.gather(*[staggered(i, sid) for i, sid in enumerate(steamids)])

        elapsed = (time.time() - start) / 60
        print(f'\nDone! {done}/{total} updated, {errors} skipped, {elapsed:.1f}min total', flush=True)

asyncio.run(main())
