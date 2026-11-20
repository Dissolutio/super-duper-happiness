// The DEMO's stand-in for the database and the game. Loaded right after demo/config.js and demo/data.js, before the app.
// Every request the app makes is answered here, from DEMO (data.js), in memory: nothing is sent anywhere, and anything you
// add is gone when you reload. The login is skipped (you are a demo member), and your real War Room login on this site,
// if you have one, is never read or changed: the demo keeps its own pretend session.
;(() => {
  // ---- a pretend session, kept apart from the real one ----
  const MINE = new Set(['sb-session'])
  const mem = new Map([['sb-session', JSON.stringify({ access_token: 'demo', refresh_token: 'demo', expires_at: 4102444800 })]])
  const real = { get: Storage.prototype.getItem, set: Storage.prototype.setItem, del: Storage.prototype.removeItem }
  Storage.prototype.getItem = function (k) { return this === window.localStorage && MINE.has(k) ? (mem.get(k) ?? null) : real.get.call(this, k) }
  Storage.prototype.setItem = function (k, v) { if (this === window.localStorage && MINE.has(k)) mem.set(k, String(v)); else real.set.call(this, k, v) }
  Storage.prototype.removeItem = function (k) { if (this === window.localStorage && MINE.has(k)) mem.delete(k); else real.del.call(this, k) }

  const db = DEMO.db
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  const fail = (message, status = 400) => json({ message }, status)
  const profileOf = (id) => db.profiles.find((p) => p.id === id)
  const withName = (row) => ({ ...row, profiles: { display_name: profileOf(row.author)?.display_name ?? '?' } })
  const minutes = (m) => new Date(Date.now() + m * 60000).toISOString()

  // ---- the Supabase API, just the parts the app uses ----
  function rest(method, path, q, body) {
    const eq = (k) => q.get(k)?.replace(/^eq\./, '')
    switch (path) {
      case '/auth/v1/token': return json({ access_token: 'demo', refresh_token: 'demo', expires_in: 86400 })
      case '/auth/v1/user': return method === 'PUT' ? json({}) : json({ id: DEMO.me, email: 'you@demo.invalid' })
      case '/auth/v1/logout': case '/auth/v1/recover': return json({})
      case '/rest/v1/profiles':
        if (method === 'PATCH') { const p = profileOf(eq('id')); if (p && p.id === DEMO.me) p.display_name = String(body.display_name).slice(0, 32); return json(null, 204) }
        if (q.get('id')) return json(db.profiles.filter((p) => p.id === eq('id')))
        return json(db.profiles.map(({ id, display_name }) => ({ id, display_name })))
      case '/rest/v1/messages': {
        if (method === 'POST') {
          const text = String(body.body ?? '').trim()
          if (!text || text.length > 2000) return fail('Message must be 1 to 2000 characters')
          db.messages.push({ id: db.messages.length + 1, channel: body.channel, body: text, created_at: new Date().toISOString(), author: DEMO.me })
          return json(null, 201)
        }
        let rows = db.messages.filter((m) => m.channel === eq('channel'))
        const gt = Number(q.get('id')?.replace(/^gt\./, ''))
        if (gt) rows = rows.filter((m) => m.id > gt)
        if (q.get('order') === 'id.desc') rows = [...rows].reverse()
        if (q.get('limit')) rows = rows.slice(0, Number(q.get('limit')))
        return json(rows.map(withName))
      }
      case '/rest/v1/landings': {
        if (method === 'DELETE') { const i = db.landings.findIndex((l) => String(l.id) === eq('id') && l.author === DEMO.me); if (i >= 0) db.landings.splice(i, 1); return json(null, 204) }
        const since = Date.now() - 30 * 60000
        return json(db.landings.filter((l) => Date.parse(l.arrives_at) > since || (l.returns_at && Date.parse(l.returns_at) > since)).sort((a, b) => a.arrives_at.localeCompare(b.arrives_at)).map(withName))
      }
      case '/rest/v1/rpc/add_flight': case '/rest/v1/rpc/add_landing': {
        const b = body
        if (!(b.p_minutes >= 1 && b.p_minutes <= 10080)) return fail('Arrival must be between 1 minute and 7 days from now')
        db.landings.push({ id: Date.now(), side: b.p_side, mission: b.p_mission ?? 'attack', category: b.p_category ?? (b.p_side === 'theirs' ? 'alert' : 'info'), galaxy: b.p_galaxy, system: b.p_system, position: b.p_position, strength: String(b.p_strength).trim().slice(0, 40), arrives_at: minutes(b.p_minutes), origin_galaxy: b.p_origin_galaxy ?? null, origin_system: b.p_origin_system ?? null, origin_position: b.p_origin_position ?? null, returns_at: b.p_return_minutes ? minutes(b.p_return_minutes) : null, source: b.p_source ?? null, author: DEMO.me })
        return json(null)
      }
      case '/rest/v1/player_intel': return json([...db.player_intel].sort((a, b) => a.name.localeCompare(b.name)))
      case '/rest/v1/rpc/add_intel': {
        const p = body.p ?? {}
        if (db.intel_reports.some((r) => r.hash === p.hash)) return json('duplicate')
        db.intel_reports.push({ hash: p.hash, summary: p })
        if (p.kind === 'spy' && p.player_id) {
          let row = db.player_intel.find((r) => r.player_id === Number(p.player_id))
          if (!row) db.player_intel.push(row = { player_id: Number(p.player_id), name: p.name, tech: {}, speed_bonus: {}, combat_pct: {} })
          Object.assign(row, { name: p.name, character_class: p.class ?? row.character_class, tech: { ...row.tech, ...p.tech }, speed_bonus: { ...row.speed_bonus, ...p.speed_bonus }, tech_at: new Date(p.at * 1000).toISOString(), tech_via: p.via ?? 'html' })
        }
        return json('added')
      }
      case '/rest/v1/moons': return json(db.moons)
      case '/rest/v1/rpc/set_moon': case '/rest/v1/rpc/set_moon_seen': {
        const b = body, i = db.moons.findIndex((m) => m.galaxy === b.p_galaxy && m.system === b.p_system && m.position === b.p_position)
        if (i >= 0) db.moons.splice(i, 1)
        if (b.p_gate || b.p_phalanx != null) db.moons.push({ galaxy: b.p_galaxy, system: b.p_system, position: b.p_position, gate: !!b.p_gate, phalanx: b.p_phalanx, observed_at: new Date().toISOString() })
        return json(path.endsWith('seen') ? (i >= 0 ? 'updated' : 'new') : null)
      }
      case '/rest/v1/scans': return json(db.scans)
      case '/rest/v1/rpc/add_scan': {
        const b = body, i = db.scans.findIndex((s) => s.galaxy === b.p_galaxy && s.system === b.p_system && s.position === b.p_position && s.moon === !!b.p_moon)
        if (i >= 0) db.scans.splice(i, 1)
        db.scans.push({ galaxy: b.p_galaxy, system: b.p_system, position: b.p_position, moon: !!b.p_moon, player_id: b.p_player, fleet_value: b.p_fleet, defense_value: b.p_defense, observed_at: new Date(b.p_seen_at * 1000).toISOString(), ships: b.p_ships ?? null, defense_units: b.p_defense_units ?? null, buildings: b.p_buildings ?? null, resources: b.p_resources ?? null })
        return json(i >= 0 ? 'updated' : 'new')
      }
      case '/rest/v1/push_subscriptions': return json([])
      case '/rest/v1/rpc/save_push': return fail('Alerts are switched off in the demo.')
    }
    return fail('The demo does not know ' + path, 404)
  }

  // ---- every request goes through here; nothing leaves the page except loading the app's own files ----
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    const method = (init.method ?? 'GET').toUpperCase()
    if (url.origin === new URL(SUPABASE_URL).origin) {
      let body = null
      try { body = init.body ? JSON.parse(init.body) : null } catch { /* not JSON */ }
      await new Promise((r) => setTimeout(r, 60)) // feel a little like a network
      return rest(method, url.pathname, url.searchParams, body)
    }
    if (url.origin !== location.origin) throw new TypeError('The demo does not contact other sites')
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5) + url.search
      return DEMO.xml[name] ? new Response(DEMO.xml[name], { headers: { 'Content-Type': 'text/xml' } }) : new Response('not in the demo', { status: 404 })
    }
    if (url.pathname.startsWith('/.netlify/functions/')) return json({ sent: 0 })
    if (url.pathname.startsWith('/ogapi/')) return new Response('off in the demo', { status: 404 })
    return realFetch(input, init) // the app's own files
  }
})()
