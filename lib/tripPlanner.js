// tripPlanner.js — deterministic trip-planning engine over the normalized
// resort dataset. All credit/cash math lives here so the AI layer only has to
// call planTrip() and narrate the structured result (never do arithmetic).
//
// Credit model (from the WorldMark charts in Resort_Info_WBW):
//   Each night is priced by that night's SEASON (prime/average/slow) and its
//   DAY OF WEEK: Sun / Mon–Thu / Fri–Sat. A 7-night "week" rate is offered and
//   is usually cheaper than 7 individual nights, so we apply it when a full
//   7-night block sits inside one season and beats the nightly sum.

const { loadResorts, seasonForDate } = require('./resortData');

const MS_DAY = 86400000;
const DOLLARS_PER_CREDIT = 0.041; // Personal Choice, Diamond VIP+ (from wbw-rules)

function addDays(date, n) {
  return new Date(date.getTime() + n * MS_DAY);
}

// Rate bucket for a given calendar date: 'sun' | 'mon_thur' | 'fri_sat'.
function dowBucket(date) {
  const d = date.getUTCDay(); // 0=Sun … 6=Sat
  if (d === 0) return 'sun';
  if (d >= 1 && d <= 4) return 'mon_thur';
  return 'fri_sat';
}

// Credits for one night in a given room at a resort. Returns null if the night
// falls outside every defined season (no price available).
function nightlyCredits(resort, room, date) {
  const seasonName = seasonForDate(resort, date);
  if (!seasonName) return null;
  const season = resort.seasons.find(s => s.name === seasonName);
  const roomInSeason = season && season.rooms.find(r => r.raw === room.raw);
  if (!roomInSeason) return null;
  return {
    season: seasonName,
    bucket: dowBucket(date),
    credits: roomInSeason.credits[dowBucket(date)]
  };
}

// Total credits for a stay of `nights` nights starting at checkIn, in `room`.
// Applies the 7-night week rate per full week when the whole week is in one
// season and the week rate beats nightly. Returns { credits, nightly[],
// seasons[], usedWeekRate, ok }.
function costForStay(resort, room, checkIn, nights) {
  const nightly = [];
  for (let i = 0; i < nights; i++) {
    const date = addDays(checkIn, i);
    const nc = nightlyCredits(resort, room, date);
    if (!nc) return { ok: false, reason: `no price for ${date.toISOString().slice(0, 10)}`, credits: null };
    nightly.push({ date: date.toISOString().slice(0, 10), ...nc });
  }

  let credits = 0;
  let usedWeekRate = false;
  let i = 0;
  while (i < nights) {
    // Try a full-week block if 7 nights remain and all share one season.
    if (nights - i >= 7) {
      const block = nightly.slice(i, i + 7);
      const oneSeason = block.every(n => n.season === block[0].season);
      if (oneSeason) {
        const season = resort.seasons.find(s => s.name === block[0].season);
        const roomInSeason = season.rooms.find(r => r.raw === room.raw);
        const weekRate = roomInSeason.credits.week;
        const nightlySum = block.reduce((a, n) => a + n.credits, 0);
        if (weekRate && weekRate < nightlySum) {
          credits += weekRate;
          usedWeekRate = true;
          i += 7;
          continue;
        }
      }
    }
    credits += nightly[i].credits;
    i += 1;
  }

  const seasons = [...new Set(nightly.map(n => n.season))];
  return { ok: true, credits, nightly, seasons, usedWeekRate };
}

// Pick the best room in a resort for a party: smallest that sleeps everyone,
// tie-broken by cheapest prime mon_thur rate. Falls back to largest room if
// nobody sleeps the whole party (flagged via `fits`).
function chooseRoom(resort, partySize) {
  const allRooms = [];
  const seen = new Set();
  for (const s of resort.seasons) {
    for (const r of s.rooms) {
      if (!seen.has(r.raw)) { seen.add(r.raw); allRooms.push(r); }
    }
  }
  if (!allRooms.length) return null;

  const priceOf = (room) => {
    const prime = resort.seasons.find(s => s.name === 'prime') || resort.seasons[0];
    const pr = prime.rooms.find(r => r.raw === room.raw);
    return pr ? pr.credits.mon_thur : Infinity;
  };

  const fitting = allRooms.filter(r => r.sleeps != null && r.sleeps >= partySize);
  if (fitting.length) {
    fitting.sort((a, b) => (a.sleeps - b.sleeps) || (priceOf(a) - priceOf(b)));
    return { room: fitting[0], fits: true };
  }
  // Nobody fits — return the largest-capacity room and flag it.
  allRooms.sort((a, b) => (b.sleeps || 0) - (a.sleeps || 0));
  return { room: allRooms[0], fits: false };
}

function parseDate(str) {
  // Accept YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// Resolve which resorts to consider from the request.
//   locationText: free text matched against resort name / state
//   region: exact region bucket
// If neither is given, all resorts are candidates ("suggest for me").
function resolveCandidates(resorts, { locationText, region } = {}) {
  // No constraints at all -> "suggest anywhere".
  if (!region && !(locationText && locationText.trim())) return resorts.slice();

  let list = resorts;
  if (region) {
    list = list.filter(r => r.region === region);
  }
  if (locationText && locationText.trim()) {
    const q = locationText.toLowerCase().trim();
    // A location WAS given: return exactly what matches (possibly empty) rather
    // than silently falling back to every resort.
    list = list.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.state.toLowerCase().includes(q) ||
      r.region.toLowerCase().includes(q.replace(/\s+/g, '-'))
    );
  }
  return list;
}

// Main entry point.
// request = {
//   locationText?, region?,           // where (optional; omit = suggest anywhere)
//   secondaryLocationText?,           // fallback locale for extra suggestions
//   checkIn (YYYY-MM-DD), nights,     // when
//   flexDays?,                        // +/- window to search for a cheaper start
//   partySize = 2,
//   maxResults = 5,
//   dollarsPerCredit = 0.041
// }
// Returns { ok, options[], notes[] }.
function planTrip(request, dataset) {
  const { resorts } = dataset || loadResorts();
  const notes = [];

  const nights = Number(request.nights);
  if (!nights || nights < 1) return { ok: false, errorType: 'validation', error: 'nights must be >= 1', options: [] };
  const partySize = Number(request.partySize) || 2;
  const flexDays = Number(request.flexDays) || 0;
  const rate = Number(request.dollarsPerCredit) || DOLLARS_PER_CREDIT;
  const maxResults = Number(request.maxResults) || 5;

  const baseDate = parseDate(request.checkIn);
  if (!baseDate) return { ok: false, errorType: 'validation', error: 'checkIn must be YYYY-MM-DD', options: [] };

  let candidates = resolveCandidates(resorts, request);
  if (request.secondaryLocationText) {
    const extra = resolveCandidates(resorts, { locationText: request.secondaryLocationText });
    const ids = new Set(candidates.map(c => c.id));
    for (const e of extra) if (!ids.has(e.id)) candidates.push(e);
  }
  if (!candidates.length) return { ok: false, errorType: 'no_results', error: 'no resorts matched the location', options: [] };

  const options = [];
  for (const resort of candidates) {
    const pick = chooseRoom(resort, partySize);
    if (!pick) continue;

    // Search the flex window for the cheapest valid start date.
    let best = null;
    for (let off = -flexDays; off <= flexDays; off++) {
      const checkIn = addDays(baseDate, off);
      const cost = costForStay(resort, pick.room, checkIn, nights);
      if (!cost.ok) continue;
      if (!best || cost.credits < best.cost.credits) {
        best = { checkIn, cost };
      }
    }
    if (!best) continue;

    const checkOut = addDays(best.checkIn, nights);
    options.push({
      resortId: resort.id,
      resort: resort.name,
      state: resort.state,
      region: resort.region,
      room: pick.room.raw,
      roomSleeps: pick.room.sleeps,
      roomFitsParty: pick.fits,
      checkIn: best.checkIn.toISOString().slice(0, 10),
      checkOut: checkOut.toISOString().slice(0, 10),
      nights,
      seasons: best.cost.seasons,
      usedWeekRate: best.cost.usedWeekRate,
      credits: best.cost.credits,
      cashEquivalentUSD: Math.round(best.cost.credits * rate * 100) / 100,
      partySize
    });
  }

  if (!options.length) {
    return { ok: false, errorType: 'no_results', error: 'no bookable options in the given date window', options: [] };
  }

  options.sort((a, b) => a.credits - b.credits);
  const trimmed = options.slice(0, maxResults);

  if (options.some(o => !o.roomFitsParty)) {
    notes.push(`Some resorts have no single unit that sleeps ${partySize}; the largest available unit was shown and flagged.`);
  }
  notes.push('Cash figures are Personal Choice credit-value estimates ($' + rate +
    '/credit, Diamond VIP+). Housekeeping, guest-certificate, and any resort fees are NOT included.');

  return { ok: true, options: trimmed, totalMatches: options.length, notes };
}

module.exports = {
  planTrip,
  costForStay,
  chooseRoom,
  nightlyCredits,
  resolveCandidates,
  dowBucket,
  DOLLARS_PER_CREDIT
};
