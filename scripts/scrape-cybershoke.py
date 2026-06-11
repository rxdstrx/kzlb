"""
Cybershoke KZ scraper using curl_cffi (bypasses Cloudflare without Puppeteer).
Usage: python scripts/scrape-cybershoke.py <steamid>
Needs: CYBERSHOKE_COOKIE env var
Output: JSON to stdout (same format as Puppeteer scraper)
"""
import json, sys, os, re, time

steamid = sys.argv[1] if len(sys.argv) > 1 else None
if not steamid:
    print(json.dumps({'error': 'No steamid provided'}))
    sys.exit(1)

COOKIE = os.environ.get('CYBERSHOKE_COOKIE', '')
if not COOKIE:
    print(json.dumps({'error': 'CYBERSHOKE_COOKIE not set'}))
    sys.exit(1)

try:
    from curl_cffi import requests as cf_requests
except ImportError:
    print(json.dumps({'error': 'curl_cffi not installed. Run: pip install curl_cffi'}))
    sys.exit(1)

headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-GB,en;q=0.7',
    'Origin': 'https://cybershoke.net',
    'Referer': f'https://cybershoke.net/ru/cs2/leaderboard/kz/maps/{steamid}',
    'Sec-Ch-Ua': '"Brave";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Gpc': '1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
}

body = {
    'mode': 18, 'season': 0, 'only_friends': False, 'only_pro': False,
    'id_games': '2', 'map': None, 'category': None,
    'steamid64': steamid, 'sub_type': 0, 'type': 1,
}

def scrape(retries=3):
    session = cf_requests.Session(impersonate='chrome120')

    # Inject cookies
    for part in COOKIE.split('; '):
        if '=' in part:
            k, v = part.split('=', 1)
            session.cookies.set(k.strip(), v.strip(), domain='cybershoke.net')

    for attempt in range(retries):
        try:
            r = session.post(
                'https://cybershoke.net/api/api/v2/leaderboard/data',
                json=body, headers=headers, timeout=20,
            )
            if r.status_code == 429:
                wait = 10 * (attempt + 1)
                sys.stderr.write(f'429 rate limit, waiting {wait}s...\n')
                time.sleep(wait)
                continue
            if r.status_code != 200:
                return {'error': f'HTTP {r.status_code}: {r.text[:200]}'}

            data = r.json()
            header = data.get('header', {})
            desc = header.get('desc', {})
            map_list = data.get('list', [])

            # Parse place_num — format is "36 / 57 168" (non-breaking space in total)
            maps_out = []
            for m in map_list:
                place_raw = m.get('place_num', '')
                # Normalize: replace non-breaking space with regular space
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

            result = {
                'steamid': steamid,
                'nickname': header.get('title', ''),
                'avatar': header.get('avatar', ''),
                'kz_points': desc.get('{{Points}}', '0'),
                'kz_place': desc.get('{{Position}}', '0'),
                'kz_maps': desc.get('{{COMPLETIONS-MAP}}', '0'),
                'maps': maps_out,
            }
            return result

        except Exception as e:
            sys.stderr.write(f'Attempt {attempt+1} error: {e}\n')
            if attempt < retries - 1:
                time.sleep(5)

    return {'error': 'All retries failed'}

result = scrape()
print(json.dumps(result, ensure_ascii=False))
