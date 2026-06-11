"""
Cybershoke KZ scraper using curl_cffi (bypasses Cloudflare without Puppeteer).

Modes:
  python scrape-cybershoke.py <steamid>         -- scrape single player, JSON to stdout
  python scrape-cybershoke.py --top100          -- fetch top100 list + scrape all, JSON array to stdout
  python scrape-cybershoke.py --batch a,b,c     -- scrape comma-separated steamids, JSON array to stdout

Needs: CYBERSHOKE_COOKIE env var
"""
import json, sys, os, time

COOKIE = os.environ.get('CYBERSHOKE_COOKIE', '')
if not COOKIE:
    print(json.dumps({'error': 'CYBERSHOKE_COOKIE not set'}))
    sys.exit(1)

try:
    from curl_cffi import requests as cf_requests
except ImportError:
    print(json.dumps({'error': 'curl_cffi not installed. Run: pip install curl_cffi'}))
    sys.exit(1)

BASE_HEADERS = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-GB,en;q=0.7',
    'Origin': 'https://cybershoke.net',
    'Sec-Ch-Ua': '"Brave";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Gpc': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
}

def make_session():
    session = cf_requests.Session(impersonate='chrome120')
    for part in COOKIE.split('; '):
        if '=' in part:
            k, v = part.split('=', 1)
            session.cookies.set(k.strip(), v.strip(), domain='cybershoke.net')
    return session

def api_post(session, body, referer_steamid=None, retries=3):
    headers = {**BASE_HEADERS, 'Referer': f'https://cybershoke.net/ru/cs2/leaderboard/kz/maps/{referer_steamid or ""}'}
    for attempt in range(retries):
        try:
            r = session.post(
                'https://cybershoke.net/api/api/v2/leaderboard/data',
                json=body, headers=headers, timeout=20,
            )
            if r.status_code == 429:
                wait = 15 * (attempt + 1)
                sys.stderr.write(f'429 rate limit, waiting {wait}s...\n')
                time.sleep(wait)
                continue
            if r.status_code != 200:
                sys.stderr.write(f'HTTP {r.status_code}: {r.text[:200]}\n')
                return None
            return r.json()
        except Exception as e:
            sys.stderr.write(f'Attempt {attempt+1} error: {e}\n')
            if attempt < retries - 1:
                time.sleep(5)
    return None

def parse_player(steamid, data):
    if not data:
        return {'error': f'No data for {steamid}', 'steamid': steamid}
    header = data.get('header', {})
    desc = header.get('desc', {})
    map_list = data.get('list', [])
    maps_out = []
    for m in map_list:
        place_raw = m.get('place_num', '')
        place_clean = place_raw.replace(' ', ' ').strip()
        maps_out.append({
            'map': m.get('map', ''),
            'points': m.get('points', '0'),
            'time_record': m.get('time_record', ''),
            'unixtime_record': m.get('unixtime_record', 0),
            'place_num': place_clean,
            'tier': m.get('tier', 0),
            'completions': m.get('completions', '0'),
        })
    return {
        'steamid': steamid,
        'nickname': header.get('title', ''),
        'avatar': header.get('avatar', ''),
        'kz_points': desc.get('{{Points}}', '0'),
        'kz_place': desc.get('{{Position}}', '0'),
        'kz_maps': desc.get('{{COMPLETIONS-MAP}}', '0'),
        'maps': maps_out,
    }

def scrape_one(session, steamid):
    body = {'mode': 18, 'season': 0, 'only_friends': False, 'only_pro': False,
            'id_games': '2', 'map': None, 'category': None,
            'steamid64': steamid, 'sub_type': 0, 'type': 1}
    data = api_post(session, body, referer_steamid=steamid)
    return parse_player(steamid, data)

def fetch_top100_list(session):
    body = {'mode': 18, 'season': 0, 'only_friends': False, 'only_pro': False,
            'id_games': '2', 'map': None, 'category': None,
            'steamid64': None, 'sub_type': 0, 'type': 0}
    data = api_post(session, body)
    if not data:
        return []
    return data.get('list', [])

# ── Main ──
mode = sys.argv[1] if len(sys.argv) > 1 else None
session = make_session()

if mode == '--top100':
    sys.stderr.write('Fetching top 100 leaderboard list...\n')
    top_list = fetch_top100_list(session)
    sys.stderr.write(f'Got {len(top_list)} players. Scraping each...\n')
    results = []
    for i, p in enumerate(top_list):
        sid = p.get('steamid64')
        if not sid:
            continue
        result = scrape_one(session, sid)
        if not result.get('nickname'):
            result['nickname'] = p.get('name', sid)
        if not result.get('avatar'):
            result['avatar'] = p.get('avatar', '')
        results.append(result)
        sys.stderr.write(f'[{i+1}/{len(top_list)}] {result.get("nickname")} -- {len(result.get("maps", []))} maps\n')
        time.sleep(0.5)
    print(json.dumps(results, ensure_ascii=False))

elif mode == '--batch':
    steamids = sys.argv[2].split(',') if len(sys.argv) > 2 else []
    results = []
    for i, sid in enumerate(steamids):
        sid = sid.strip()
        if not sid:
            continue
        result = scrape_one(session, sid)
        results.append(result)
        sys.stderr.write(f'[{i+1}/{len(steamids)}] {result.get("nickname", sid)} -- {len(result.get("maps", []))} maps\n')
        time.sleep(0.5)
    print(json.dumps(results, ensure_ascii=False))

else:
    steamid = mode
    if not steamid or not steamid.isdigit():
        print(json.dumps({'error': 'Usage: scrape-cybershoke.py <steamid> | --top100 | --batch id1,id2,...'}))
        sys.exit(1)
    result = scrape_one(session, steamid)
    print(json.dumps(result, ensure_ascii=False))
