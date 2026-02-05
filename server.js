require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { loadCSV, searchMedicine, formatForContext } = require('./medicineSearch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

loadCSV();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const QUOTA_FALLBACK = '현재 AI 사용 한도에 도달했습니다. 잠시(약 1분) 후 다시 시도해 주세요. 의약품 검색은 상단 검색창을 이용해 보세요. ⚠️ 본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요.';

const BASE_SYSTEM = `너는 일반의약품 정보를 바탕으로 사용자에게 관련 가능성이 높은 의약품을 추천하고, 해당 의약품의 공식 정보를 요약해 함께 제공하는 도우미다. 반드시 다음 규칙을 따른다.

[규칙 1: 추천 판단 기준]
- 추천 여부 판단은 오직 다음 정보만 근거로 한다.
  1) 품목명
  2) 분류명
  3) 이 약의 효능은 무엇입니까?
- 사용법, 주의사항, 이상반응, 보관법 정보는 추천 여부 판단에는 사용하지 않는다.

[규칙 2: 부가 정보 출력]
- 추천 결과를 출력할 때, 아래 정보가 존재한다면 간략히 요약해 함께 제공한다.
  - 이 약을 사용하기 전에 반드시 알아야 할 내용
  - 이 약의 사용상 주의사항
  - 이 약을 사용하는 동안 주의해야 할 약 또는 음식
- 각 항목은 1~2문장으로 요약한다.
- 정보가 비어 있거나 없는 항목은 출력하지 않는다.

[규칙 3: 안전]
- 진단, 처방, 복용량 결정은 하지 않는다.
- 모든 답변은 정보 제공 목적임을 유지한다.

항상 JSON 형식으로만 출력한다. 예시: {"추천의약품":[{"품목명":"...","분류명":"...","효능요약":"...","사용법":"...","주의사항":"..."}],"안내":"본 정보는 참고용이며 반드시 의사나 약사와 상담하세요."}`;

async function callGroq(messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    const is429 = res.status === 429 || text.includes('rate_limit') || text.includes('quota');
    if (is429) {
      return QUOTA_FALLBACK;
    }
    throw new Error(text || res.statusText);
  }

  const data = JSON.parse(text);
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) {
    throw new Error(data.error?.message || '응답을 생성할 수 없습니다.');
  }
  return reply;
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  if (!GROQ_API_KEY) {
    return res.status(503).json({
      error: 'LLM API가 설정되지 않았습니다. .env에 GROQ_API_KEY를 설정해 주세요.',
    });
  }

  try {
    const userMsg = messages.filter(m => m.role === 'user').pop();
    const userText = userMsg?.content || '';
    const hits = searchMedicine(userText, 15);
    const contextText = formatForContext(hits);

    const dataSection = contextText
      ? `\n\n[의약품 허가정보 데이터]\n${contextText}\n\n위 데이터만 사용하여 사용자 질문에 맞는 의약품을 추천하고, 규칙에 따라 JSON으로 출력하세요.`
      : '';
    const systemContent = BASE_SYSTEM + dataSection;

    const enhancedMessages = messages
      .filter(m => m.role !== 'system')
      .reduce((acc, m) => {
        if (acc.length === 0) acc.push({ role: 'system', content: systemContent });
        acc.push(m);
        return acc;
      }, []);
    if (enhancedMessages[0]?.role !== 'system') {
      enhancedMessages.unshift({ role: 'system', content: systemContent });
    }

    const reply = await callGroq(enhancedMessages);
    res.json({ reply });
  } catch (err) {
    console.error('Groq API 오류:', err.message);
    res.status(500).json({
      error: err.message || 'LLM 처리 중 오류가 발생했습니다.',
    });
  }
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) {
    return res.json([]);
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 50);
  const hits = searchMedicine(q, limit);
  res.json(hits);
});

const pillHandler = require('./api/pill');
app.get('/api/pill', pillHandler);

app.get('/api/image', async (req, res) => {
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
    console.error('이미지 프록시 오류:', err.message);
    res.status(502).json({ error: '이미지를 불러올 수 없습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`서버: http://localhost:${PORT}`);
  if (!GROQ_API_KEY) {
    console.log('⚠️ GROQ_API_KEY가 없습니다. .env 파일을 확인해 주세요. 챗봇은 기본 응답만 사용합니다.');
  } else {
    console.log('✅ Groq API 연결됨');
  }
  if (!process.env.DATA_GO_KR_KEY) {
    console.log('⚠️ DATA_GO_KR_KEY가 없습니다. 알약 식별 기능이 동작하지 않습니다. 공공데이터포털에서 활용신청 후 .env에 추가하세요.');
  } else {
    console.log('✅ 공공데이터 API(알약 식별) 연결됨');
  }
});
