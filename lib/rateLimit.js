// rateLimit.js — tiny in-memory fixed-window rate limiter (Phase 4).
//
// No dependency, good enough for a single-instance pilot. Every API request
// spends real Anthropic tokens, so this caps abuse/runaway cost. If you scale to
// multiple instances, move this to a shared store (Redis) — an in-memory limiter
// only sees its own instance's traffic.

function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Occasional sweep so the map doesn't grow unbounded.
  setInterval(() => {
    const now = Date.now();
    for (const [key, rec] of hits) if (rec.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || rec.resetAt <= now) {
      rec = { count: 0, resetAt: now + windowMs };
      hits.set(key, rec);
    }
    rec.count += 1;

    const remaining = Math.max(0, max - rec.count);
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (rec.count > max) {
      res.setHeader('Retry-After', Math.ceil((rec.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests — slow down and retry shortly.' });
    }
    next();
  };
}

module.exports = { createRateLimiter };
