const SCRAPER_KEY = 'f82a470beb9e99edde93f92a21a91219';

const COOKIE = `hideFullAmong=false; sCategories={}; competitionsLeague=high; gMapFilerv=[]; gCategoryFiler=[]; glocationFilerNewv=[]; gSortFiler=online; gPrimeFiler=both; gSortShopFiler2=down; gCompetitionsDataStats=month; gCompetitionsDataId=12; gCompetitionsDataClass=low; gCompetitionsDataHalfmonth=0; gProfileSkinchangerFilterQ=%E2%98%85%20Karambit; gProfileSkinchangerFilterCollection=1; hideFullServers=true; gSkipPremiumModal=0; gServersPrimeMode=all; gHideFilledServers=1; _g_gtag_ree1qqa=08678722b27826292b90382f7409ec84; multitoken=YoXQFm1ka9utDYaGPCmx9wrHJp1772321827628t9yzf0GAdiUoGv4pjmnJVyhKQk3oYa5q65yHTyVmNYroRvWumE0Km; multitoken_created=1; cookie_read=1; view=grid; pinsFeatured=[]; mission_update=true; categories={}; maps=[]; showFull=true; vip-group=LITE; vip-expires-timer=0; featured_modes_csgo=[%22DANGERZONE%22%2C%22RETAKE%22]; vip=true; raffleModalShown=true; cf_clearance=YAeZS7d5pfjPAH1gV9LWXG_Y39UmEkFo36re77As3t8-1776971765-1.2.1.1-94Yxksgjo1Kmi4oaCjxh2BiyIR4HHqUZIgz1Gny8Zj_0B.6uZTml_1n0DajmnzKbaRCECk7164nDtx0FP4nyCAvwu1bBWF2VcHbNJf_MJjpt3iidPgCcGk_nrVd5m0Qw.cJ1H5cRPNKe5rfLiGzaxG.xllHaFm0YI_vsFo8wqCtth455LYvOg5mrTfEpjIEWFxZqBcnqhU.NP0IxMoBYBVgsIrt7MzFuhdickC38GMEPRRf4XvJM4yhKl0DrATgSIV1kbnn074dn2R.8Pk1.8Az_KY7e7uqr04VWEWCGobWqGwWuCF758kMHEXTDKouCKwCRuOCLwf7GFtOpnco1dA; cookie_domain=cybershoke.net; current-game=2; vip-expires-date=1780861895; lang_g=ru`;

export default {
  async fetch(request) {

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const url = new URL(request.url);
    const steamid = url.searchParams.get('steamid');

    if (!steamid || !/^\d{17}$/.test(steamid)) {
      return new Response(JSON.stringify({ error: 'Invalid steamid' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const cybershokeHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Origin': 'https://cybershoke.net',
      'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Cookie': COOKIE,
    };

    const mapsBody = JSON.stringify({
      mode: 18, season: 0, only_friends: false, only_pro: false,
      id_games: "2", map: null, category: null,
      steamid64: steamid, sub_type: 0, type: 1,
    });

    const userBody = JSON.stringify({
      mode: 18, season: 0, id_games: "2",
      steamid64: steamid, sub_type: 0, type: 1,
    });

    // Route both requests through ScraperAPI
    const scraperBase = `https://api.scraperapi.com/?api_key=${SCRAPER_KEY}&ultra_premium=true&url=`;

    const userRes = await fetch(scraperBase + encodeURIComponent('https://cybershoke.net/api/api/v1/leaderboard/user'), {
      method: 'POST',
      headers: cybershokeHeaders,
      body: userBody,
    });

    const mapsRes = await fetch(scraperBase + encodeURIComponent('https://cybershoke.net/api/api/v2/leaderboard/data'), {
      method: 'POST',
      headers: cybershokeHeaders,
      body: mapsBody,
    });

    const result = {
      user_status: userRes.status,
      maps_status: mapsRes.status,
      user_raw: await userRes.text(),
      maps_raw: await mapsRes.text(),
    };

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      }
    });
  }
};
