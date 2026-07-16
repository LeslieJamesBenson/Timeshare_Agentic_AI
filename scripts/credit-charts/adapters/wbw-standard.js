// wbw-standard.js — the single adapter for the WBW credit-chart schema family.
//
// The whole Resort_Info_WBW dataset is one schema, so this adapter wraps the
// normalizer in lib/credits/normalize.js. Additional schema families would each
// get their own adapter file here (see docs/adding-new-resorts.md).

const { detectSchema, normalizeChart } = require('../../../lib/credits/normalize');

module.exports = {
  id: 'wbw-standard',
  // supports(raw) -> confidence 0..1
  supports(raw) {
    return detectSchema(raw).confidence;
  },
  normalize(raw, meta) {
    return normalizeChart(raw, meta);
  },
};
