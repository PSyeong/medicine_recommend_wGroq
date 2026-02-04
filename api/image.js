module.exports = async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    res.status(400).send('url 필요');
    return;
  }
  const url = rawUrl.trim();
  if (!url.startsWith('https://nedrug.mfds.go.kr/') && !url.startsWith('http://nedrug.mfds.go.kr/')) {
    res.status(400).send('허용된 도메인만 가능');
    return;
  }
  try {
    const imgRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!imgRes.ok) {
      res.status(404).send('이미지를 찾을 수 없습니다');
      return;
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error('이미지 프록시 오류:', err.message);
    res.status(502).send('이미지 로드 실패');
  }
};
