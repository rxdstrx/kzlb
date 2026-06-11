"""
Test Cybershoke leaderboard pagination params.
Usage: python scripts/test-pagination.py
Needs: CYBERSHOKE_COOKIE env var
"""
import json, sys, os, time
from curl_cffi import requests as cf_requests

COOKIE = os.environ.get('CYBERSHOKE_COOKIE', '')
session = cf_requests.Session(impersonate='chrome120')
for part in COOKIE.split('; '):
    if '=' in part:
        k, v = part.split('=', 1)
        session.cookies.set(k.strip(), v.strip(), domain='cybershoke.net')

headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://cybershoke.net',
    'Referer': 'https://cybershoke.net/ru/cs2/leaderboard/kz',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
}

def test_body(label, body):
    r = session.post('https://cybershoke.net/api/api/v2/leaderboard/data', json=body, headers=headers, timeout=20)
    data = r.json() if r.status_code == 200 else {}
    lst = data.get('list', [])
    first = lst[0].get('name', '') if lst else 'N/A'
    last = lst[-1].get('name', '') if lst else 'N/A'
    print(f'{label}: status={r.status_code} count={len(lst)} first={first} last={last}')
    time.sleep(1)

base = {'mode': 18, 'season': 0, 'only_friends': False, 'only_pro': False,
        'id_games': '2', 'map': None, 'category': None,
        'steamid64': None, 'sub_type': 0, 'type': 0}

print('Testing pagination params...')
test_body('page=0 (default)', {**base})
test_body('page=1', {**base, 'page': 1})
test_body('page=2', {**base, 'page': 2})
test_body('offset=100', {**base, 'offset': 100})
test_body('offset=100,limit=100', {**base, 'offset': 100, 'limit': 100})
test_body('start=100', {**base, 'start': 100})
test_body('skip=100', {**base, 'skip': 100})
test_body('sub_type=1', {**base, 'sub_type': 1})
test_body('sub_type=2', {**base, 'sub_type': 2})
test_body('type=2', {**base, 'type': 2})
test_body('type=3', {**base, 'type': 3})
