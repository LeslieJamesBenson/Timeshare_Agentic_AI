// routes.js — Express routes for the resort credit calculator. Deterministic,
// no AI, no API key required. Mounted by server.js.
//
//   GET  /api/credit-resorts            search/list the catalog (?q=, ?limit=)
//   GET  /api/credit-resorts/:id        one resort (units, seasons, period)
//   POST /api/credit-calc               calculate a stay -> StayCalculation
//   GET  /api/credit-status             validation report for /data-status

const repo = require('./repository');
const { calculateStayCredits } = require('./calculation');
const { CalculationError } = require('./errors');

function registerCreditRoutes(app) {
  app.get('/api/credit-resorts', (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const list = req.query.q ? repo.searchResorts(req.query.q, limit) : repo.getAllResorts().slice(0, limit);
      const { totals } = repo.getResortIndex();
      res.json({ ok: true, totals, count: list.length, resorts: list });
    } catch (err) {
      res.status(500).json({ ok: false, error: { code: 'DATA_UNAVAILABLE', message: err.message } });
    }
  });

  app.get('/api/credit-resorts/:id', (req, res) => {
    try {
      const r = repo.getResortById(req.params.id);
      if (!r) return res.status(404).json({ ok: false, error: { code: 'RESORT_NOT_FOUND', message: 'Resort not found or not active.' } });
      // Trim to what the UI needs (units + season summary + rules + period).
      res.json({
        ok: true,
        resort: {
          resortId: r.resortId, resortName: r.resortName, destination: r.destination,
          region: r.region, state: r.state, country: r.country, status: r.status,
          unitTypes: r.unitTypes,
          seasons: r.seasons.map((s) => ({ id: s.id, name: s.name, meaning: s.meaning, ranges: s.dateRanges })),
          rules: r.rules,
          effectiveStart: r.source.effectiveStart, effectiveEnd: r.source.effectiveEnd,
          sourceFile: r.source.sourceFile,
        },
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: { code: 'DATA_UNAVAILABLE', message: err.message } });
    }
  });

  app.post('/api/credit-calc', (req, res) => {
    const body = req.body || {};
    let resort;
    try {
      resort = repo.getResortById(body.resortId);
    } catch (err) {
      return res.status(500).json({ ok: false, error: { code: 'DATA_UNAVAILABLE', message: err.message } });
    }
    if (!resort) return res.status(404).json({ ok: false, error: { code: 'RESORT_NOT_FOUND', message: 'Resort not found or not active in the calculator.' } });
    try {
      const result = calculateStayCredits(resort, {
        resortId: body.resortId, unitTypeId: body.unitTypeId,
        checkIn: body.checkIn, checkOut: body.checkOut, roomCount: body.roomCount,
      });
      // optional owner-credit comparison
      let comparison = null;
      const avail = body.ownerCredits != null && body.ownerCredits !== '' ? Number(body.ownerCredits) : null;
      if (avail != null && !Number.isNaN(avail)) {
        const diff = avail - result.totalCredits;
        comparison = {
          available: avail,
          required: result.totalCredits,
          difference: Math.abs(diff),
          status: diff >= 0 ? 'surplus' : 'short',
          coveragePct: result.totalCredits > 0 ? Math.round((avail / result.totalCredits) * 100) : 100,
        };
      }
      res.json({ ok: true, result, comparison });
    } catch (err) {
      if (err instanceof CalculationError) {
        return res.status(422).json({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
      }
      console.error('credit-calc error:', err);
      res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'Calculation failed.' } });
    }
  });

  app.get('/api/credit-status', (req, res) => {
    try {
      const report = repo.getValidationReport();
      if (!report) return res.status(503).json({ ok: false, error: { code: 'NO_REPORT', message: 'Run npm run credits:build.' } });
      res.json({ ok: true, importedAt: report.importedAt, totals: report.totals, resorts: report.resorts });
    } catch (err) {
      res.status(500).json({ ok: false, error: { code: 'DATA_UNAVAILABLE', message: err.message } });
    }
  });
}

module.exports = { registerCreditRoutes };
