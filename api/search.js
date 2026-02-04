const { loadCSV, searchMedicine } = require('../medicineSearch');

loadCSV();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json([]);
  }
  const hits = searchMedicine(q, 30);
  res.json(hits);
};
