const { loadCSV, searchMedicine } = require('../medicineSearch');

loadCSV();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json([]);
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50);
  const hits = searchMedicine(q, limit);
  res.json(hits);
};
