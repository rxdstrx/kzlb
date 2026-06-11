"""
Test Cloudflare bypass methods for Cybershoke API
Method 1: curl_cffi (impersonates Chrome TLS fingerprint)
Method 2: cloudscraper
"""
import json, sys, os

steamid = sys.argv[1] if len(sys.argv) > 1 else '76561198842886915'
COOKIE = os.environ.get('CYBERSHOKE_COOKIE', '')

body = {
    'mode': 18, 'season': 0, 'only_friends': False, 'only_pro': False,
    'id_games': '2', 'map': None, 'category': None,
    'steamid64': steamid, 'sub_type': 0, 'type': 1,
}

headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://cybershoke.net',
    'Referer': f'https://cybershoke.net/ru/cs2/leaderboard/kz/maps/{steamid}',
    'Accept-Language': 'ru-RU,ru;q=0.9',
}
if COOKIE:
    headers['Cookie'] = COOKIE

# ── Method 1: curl_cffi (Chrome TLS impersonation) ──
print('=' * 50)
print('Method 1: curl_cffi (Chrome TLS fingerprint)')
print('=' * 50)
try:
    from curl_cffi import requests as cf_requests
    r = cf_requests.post(
        'https://cybershoke.net/api/api/v2/leaderboard/data',
        json=body, headers=headers,
        impersonate='chrome120',
        timeout=15,
    )
    print(f'Status: {r.status_code}')
    if r.status_code == 200:
        data = r.json()
        maps = data.get('list', [])
        desc = data.get('header', {}).get('desc', {})
        print(f'✅ SUCCESS!')
        print(f'Player: {data.get("header", {}).get("name")}')
        print(f'Points: {desc.get("{{Points}}")} | Maps: {len(maps)}')
    else:
        print(f'❌ Failed: {r.text[:300]}')
except ImportError:
    print('curl_cffi not installed')
except Exception as e:
    print(f'❌ Error: {e}')

# ── Method 2: cloudscraper ──
print()
print('=' * 50)
print('Method 2: cloudscraper')
print('=' * 50)
try:
    import cloudscraper
    scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows'})
    if COOKIE:
        scraper.headers.update({'Cookie': COOKIE})
    r = scraper.post(
        'https://cybershoke.net/api/api/v2/leaderboard/data',
        json=body, headers=headers, timeout=15,
    )
    print(f'Status: {r.status_code}')
    if r.status_code == 200:
        data = r.json()
        maps = data.get('list', [])
        desc = data.get('header', {}).get('desc', {})
        print(f'✅ SUCCESS!')
        print(f'Player: {data.get("header", {}).get("name")}')
        print(f'Points: {desc.get("{{Points}}")} | Maps: {len(maps)}')
    else:
        print(f'❌ Failed: {r.text[:300]}')
except ImportError:
    print('cloudscraper not installed')
except Exception as e:
    print(f'❌ Error: {e}')
