/**
 * update-player Edge Function
 * Updates an existing player's stats. Called from profile and leaderboard.
 * POST body: { steamid: string }
 * Rate limited: 1 update per 5 minutes per player.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RATE_LIMIT_MS = 5 * 60 * 1000 // 5 minutes

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { steamid } = await req.json()
    if (!steamid || !/^\d{17}$/.test(steamid)) {
      return new Response(JSON.stringify({ error: 'Invalid steamid' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' }
      })
    }

    const sbUrl = Deno.env.get('SUPABASE_URL') || ''
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY') || ''
    const sb    = createClient(sbUrl, sbKey)

    // ── Rate limit check ──
    const { data: player } = await sb.from('players').select('steamid, updated_at').eq('steamid', steamid).single()
    if (player?.updated_at) {
      const lastUpdate = new Date(player.updated_at).getTime()
      const msSince    = Date.now() - lastUpdate
      if (msSince < RATE_LIMIT_MS) {
        const secsLeft = Math.ceil((RATE_LIMIT_MS - msSince) / 1000)
        return new Response(JSON.stringify({
          ok: false,
          rate_limited: true,
          retry_in: secsLeft,
          error: `Please wait ${secsLeft}s before updating again.`
        }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
      }
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

    return new Response(JSON.stringify({
      ok: true,
      steamid,
      nickname: scraped.nickname,
      avatar: scraped.avatar,
      kz_points: scraped.kz_points,
      kz_place: scraped.kz_place,
      kz_maps: scraped.kz_maps,
      maps_count: scraped.maps_count,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' }
    })
  }
})
