module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.query.url;
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return res.status(400).json({ error: '유효한 URL이 필요합니다.' });
  }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!r.ok) {
      return res.status(r.status).send(r.statusText);
    }
    const contentType = r.headers.get('content-type') || 'image/png';
    const buffer = await r.arrayBuffer();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(502).json({ error: '이미지를 불러올 수 없습니다.' });
  }
};
