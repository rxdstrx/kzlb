/**
 * scrape-player Edge Function
 * Scrapes a player's KZ stats from Cybershoke and saves to Supabase.
 * Called by add-player and update-player functions.
 * POST body: { steamid: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { steamid } = await req.json()
    if (!steamid || !/^\d{17}$/.test(steamid)) {
      return new Response(JSON.stringify({ error: 'Invalid steamid' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const cookie = Deno.env.get('CYBERSHOKE_COOKIE') || ''
    const sbUrl  = Deno.env.get('SUPABASE_URL') || ''
    const sbKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY') || ''
    const sb     = createClient(sbUrl, sbKey)

    // ── Scrape Cybershoke ──
    const apiBody = {
      mode: 18, season: 0, only_friends: false, only_pro: false,
      id_games: '2', map: null, category: null,
      steamid64: steamid, sub_type: 0, type: 1,
    }
    const apiHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-GB,en;q=0.7',
      'Origin': 'https://cybershoke.net',
      'Referer': `https://cybershoke.net/ru/cs2/leaderboard/kz/maps/${steamid}`,
      'Sec-Ch-Ua': '"Brave";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      'Cookie': cookie,
    }

    const r = await fetch('https://cybershoke.net/api/api/v2/leaderboard/data', {
      method: 'POST', headers: apiHeaders, body: JSON.stringify(apiBody),
    })

    if (!r.ok) {
      return new Response(JSON.stringify({ error: `Cybershoke returned ${r.status}` }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const data   = await r.json()
    const header = data?.header || {}
    const desc   = header?.desc || {}
    const maps   = data?.list  || []

    const nickname  = header?.title || ''
    const avatar    = header?.avatar || ''
    const kz_points = Number(desc['{{Points}}']) || 0
    const kz_place  = Number(desc['{{Position}}']) || 0
    const kz_maps   = desc['{{COMPLETIONS-MAP}}'] || '0'
    const now       = new Date().toISOString()

    // ── If no avatar from Cybershoke, fetch from playerdb ──
    let finalAvatar = avatar
    if (!finalAvatar) {
      try {
        const pdb = await fetch(`https://playerdb.co/api/player/steam/${steamid}`)
        const pd  = await pdb.json()
        finalAvatar = pd?.data?.player?.avatar || ''
      } catch {}
    }

    // ── Save player to Supabase players table ──
    const playerRow = {
      steamid,
      nickname,
      avatar: finalAvatar,
      kz_points,
      kz_place,
      kz_maps,
      cached_at: now,
      updated_at: now,
    }
    await sb.from('players').upsert(playerRow, { onConflict: 'steamid' })

    // ── Save map records to player_maps table ──
    if (maps.length > 0) {
      const mapRows = maps.map((m: any) => ({
        steamid,
        map: m.map || '',
        points: String(m.points || '0'),
        time_record: m.time_record || '',
        unixtime_record: Number(m.unixtime_record) || 0,
        place_num: (m.place_num || '').replace(/ /g, ' ').trim(),
        tier: Number(m.tier) || 0,
        completions: String(m.completions || '0'),
        updated_at: now,
      }))
      // Delete old records first, then insert fresh
      await sb.from('player_maps').delete().eq('steamid', steamid)
      await sb.from('player_maps').insert(mapRows)
    }

    // ── Write to player_cache so profile page detects completion instantly ──
    await sb.from('player_cache').upsert({
      steamid,
      data: { steamid, nickname, avatar: finalAvatar, cached_at: now, maps: data },
      updated_at: now,
    }, { onConflict: 'steamid' })

    return new Response(JSON.stringify({
      ok: true,
      steamid,
      nickname,
      avatar: finalAvatar,
      kz_points,
      kz_place,
      kz_maps,
      maps_count: maps.length,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
