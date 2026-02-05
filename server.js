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

const CHAT_SYSTEM_PROMPT = `너는 의료·건강 정보에 대해 일상적인 질문에 답하는 친절한 도우미다.

- 사용자의 질문(증상, 약, 건강 습관, 병원·약국 이용 등)에 맞춰 짧고 이해하기 쉽게 답한다.
- 진단·처방·복용량 결정은 하지 않고, 참고 정보만 제공한다.
- 필요하면 "의사·약사와 상담하세요" 같은 안내를 문장 끝에 자연스럽게 넣는다.
- JSON이나 특정 형식을 강제하지 말고, 자연스러운 문장으로만 답한다.`;

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
    if (is429) return QUOTA_FALLBACK;
    // API 키 오류, 접근 거부, 네트워크 제한 등 → 사용자용 안내 반환 (500 대신 채팅 연속 가능)
    const isAccessDenied = res.status === 401 || res.status === 403 || /access denied|invalid.*api|network settings/i.test(text);
    if (isAccessDenied) {
      console.error('Groq API 접근 거부:', text);
      return 'AI 연결에 제한이 있어 기본 안내로 답변드립니다. Groq API 키(.env의 GROQ_API_KEY)와 네트워크(방화벽·VPN)를 확인해 주세요. ⚠️ 본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요.';
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
    const enhancedMessages = messages
      .filter(m => m.role !== 'system')
      .reduce((acc, m) => {
        if (acc.length === 0) acc.push({ role: 'system', content: CHAT_SYSTEM_PROMPT });
        acc.push(m);
        return acc;
      }, []);
    if (enhancedMessages[0]?.role !== 'system') {
      enhancedMessages.unshift({ role: 'system', content: CHAT_SYSTEM_PROMPT });
    }

    const reply = await callGroq(enhancedMessages);
    res.json({ reply });
  } catch (err) {
    console.error('Groq API 오류:', err.message);
    const friendly = 'LLM 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    res.status(500).json({
      error: friendly,
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
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
