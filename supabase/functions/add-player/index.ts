/**
 * add-player Edge Function
 * Handles adding a new player to the leaderboard.
 * POST body: { steamid: string, country: string }
 * - Validates steamid
 * - Gets country from Faceit → Steam → passed country
 * - Scrapes via scrape-player
 * - Returns player data
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getFaceitData(steamid: string, faceitKey: string) {
  if (!faceitKey) return null
  try {
    const r = await fetch(
      `https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamid}`,
      { headers: { Authorization: `Bearer ${faceitKey}` } }
    )
    if (!r.ok) return null
    const d = await r.json()
    return { country: d.country?.toLowerCase() || null, nickname: d.nickname || null }
  } catch { return null }
}

async function getSteamData(steamid: string, steamKey: string) {
  if (!steamKey) return null
  try {
    const r = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamKey}&steamids=${steamid}`
    )
    const d = await r.json()
    const p = d?.response?.players?.[0]
    if (!p) return null
    return {
      country: p.loccountrycode?.toLowerCase() || null,
      nickname: p.personaname || null,
      avatar: p.avatarfull || null,
    }
  } catch { return null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { steamid, country } = await req.json()
    if (!steamid || !/^\d{17}$/.test(steamid)) {
      return new Response(JSON.stringify({ error: 'Invalid steamid' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const sbUrl    = Deno.env.get('SUPABASE_URL') || ''
    const sbKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY') || ''
    const faceitKey = Deno.env.get('FACEIT_KEY') || ''
    const steamKey  = Deno.env.get('STEAM_API_KEY') || ''
    const sb       = createClient(sbUrl, sbKey)

    // ── Check if already registered ──
    const { data: existing } = await sb.from('players').select('steamid,nickname').eq('steamid', steamid).single()
    if (existing) {
      return new Response(JSON.stringify({
        ok: false,
        already_exists: true,
        nickname: existing.nickname,
        error: `Player "${existing.nickname}" is already on the leaderboard. Use Update Records to refresh stats.`
      }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    // ── Resolve country ──
    let resolvedCountry = country || 'xx'
    let resolvedNickname = ''
    let resolvedAvatar = ''

    // Try Faceit first
    const faceit = await getFaceitData(steamid, faceitKey)
    if (faceit?.country) resolvedCountry = faceit.country
    if (faceit?.nickname) resolvedNickname = faceit.nickname

    // Try Steam if no country yet
    if (resolvedCountry === 'xx') {
      const steam = await getSteamData(steamid, steamKey)
      if (steam?.country) resolvedCountry = steam.country
      if (!resolvedNickname && steam?.nickname) resolvedNickname = steam.nickname
      if (steam?.avatar) resolvedAvatar = steam.avatar
    }

    // ── Trigger scrape ──
    const scrapeUrl = `${sbUrl}/functions/v1/scrape-player`
    const scrapeRes = await fetch(scrapeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sbKey}`,
      },
      body: JSON.stringify({ steamid }),
    })
    const scraped = await scrapeRes.json()
    if (!scrapeRes.ok || scraped.error) {
      return new Response(JSON.stringify({ error: scraped.error || 'Scrape failed' }), {
        status: 502, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    // ── Update country in players table (scrape-player saves without country) ──
    await sb.from('players').update({ country: resolvedCountry, updated_at: new Date().toISOString() }).eq('steamid', steamid)

    return new Response(JSON.stringify({
      ok: true,
      steamid,
      nickname: scraped.nickname || resolvedNickname,
      avatar: scraped.avatar || resolvedAvatar,
      country: resolvedCountry,
      kz_points: scraped.kz_points,
      kz_place: scraped.kz_place,
      kz_maps: scraped.kz_maps,
      maps_count: scraped.maps_count,
      detected_country: resolvedCountry,
      country_source: faceit?.country ? 'faceit' : (resolvedCountry !== 'xx' ? 'steam' : 'manual'),
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
