// Turns one spoken/typed sentence into landing form fields. Pure function, no page access.
//   "enemy 2 45 8, about 3 million, lands in 2 hours 15 minutes"
//   -> { side: 'theirs', galaxy: 2, system: 45, position: 8, strength: '3M', hours: 2, minutes: 15, missing: [] }
// Best effort: whatever it can't find goes in `missing`, and the person fixes it in the form.
// Digits only (phone dictation writes "45", not "forty five").
const SCALE = { million: 'M', mil: 'M', m: 'M', billion: 'B', b: 'B', thousand: 'K', k: 'K' }
const UNITS = 'points?|pts|ships?|battleships?|battlecruisers?|bc|bs|bb|cruisers?|destroyers?|deathstars?|rips?|ds|bombers?|reapers?|pathfinders?|fighters?|cargos?|lc|sc|lf|hf|recyclers?|probes?'

function parseLanding(input) {
  let text = ' ' + input.toLowerCase().replace(/[,;]/g, ' ') + ' '
  const out = { side: 'ours', galaxy: null, system: null, position: null, strength: '', hours: 0, minutes: 0, missing: [] }
  const take = (re, fn) => { // find re, hand its match to fn, cut it out of the text
    const m = text.match(re)
    if (m) { fn(m); text = text.replace(m[0], ' ') }
    return !!m
  }

  // who: enemy words flip it to "theirs"; moving-our-own-fleet words make it a "move"
  if (/\b(enemy|incoming|inbound|hostile|theirs|attacking us|coming at us|pma)\b/.test(text)) out.side = 'theirs'
  else if (/\b(mov(?:e|es|ing)|deploy(?:ing|ment)?|relocat\w*|transfer(?:ring)?|rebas\w*)\b/.test(text)) out.side = 'move'

  // when: "2 hours", "15 minutes", "2h", "an hour", "half an hour"
  take(/\bhalf an hour\b/, () => (out.minutes += 30))
  take(/\ban hour\b/, () => (out.hours += 1))
  take(/(\d+)\s*(?:hours?|hrs?|h)\b/, (m) => (out.hours += Number(m[1])))
  take(/(\d+)\s*(?:minutes?|mins?)\b/, (m) => (out.minutes += Number(m[1])))
  out.hours += Math.floor(out.minutes / 60)
  out.minutes %= 60
  if (!out.hours && !out.minutes) out.missing.push('time')

  // how big: needs a scale (3m, 2 million, 500k) or a unit (200 battleships, 4M points)
  const strength = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(million|mil|billion|thousand|[mkb])?\\b\\s*(${UNITS})?\\b`, 'g')
  const big = [...text.matchAll(strength)].find((m) => m[2] || m[3])
  if (big) {
    out.strength = `${big[1]}${big[2] ? SCALE[big[2]] : ''}${big[3] ? ' ' + big[3] : ''}`
    text = text.replace(big[0], ' ')
  }

  // where: "galaxy 3 system 100 planet 7", or three numbers like 2 45 8 / 2:45:8 / 2.45.8
  const labeled = text.match(/galaxy\s*(\d+).*?system\s*(\d+).*?(?:planet|position|slot)\s*(\d+)/)
  const triples = [...text.matchAll(/\b(\d)\s*[:.\-\s]\s*(\d{1,3})\s*[:.\-\s]\s*(\d{1,2})\b/g)]
  const found = labeled ?? triples.find((m) => Number(m[1]) >= 1 && Number(m[1]) <= MAX_GALAXY && Number(m[2]) >= 1 && Number(m[2]) <= 499 && Number(m[3]) >= 1 && Number(m[3]) <= 15)
  if (found) {
    ;[out.galaxy, out.system, out.position] = [Number(found[1]), Number(found[2]), Number(found[3])]
    text = text.replace(found[0], ' ')
  } else {
    out.missing.push('coordinates')
  }

  // a bare big number left over (e.g. "3000000") is the fleet size
  if (!out.strength) out.strength = text.match(/\b\d{4,}\b/)?.[0] ?? ''

  if (!out.strength) out.missing.push('fleet size')
  return out
}
