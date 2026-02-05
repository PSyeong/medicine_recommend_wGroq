const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const QUOTA_FALLBACK = '현재 AI 사용 한도에 도달했습니다. 잠시(약 1분) 후 다시 시도해 주세요. ⚠️ 본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요.';

const SYSTEM_PROMPT = `당신은 의료·건강 정보에 대해 일상적인 질문에 답해 주는 친절한 도우미입니다.

[역할]
- 두통, 감기, 소화, 피로, 비타민, 약 복용법, 부작용, 음식·약 상호작용 등 일상적인 의료·건강 질문에 쉽고 짧게 답합니다.
- 한국어로만 답변합니다.
- 일반적으로 알려진 상식 수준의 정보를 바탕으로 안내합니다.

[규칙]
- 진단, 처방, 복용량 결정은 하지 않습니다.
- "본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요" 또는 이와 같은 의미의 문구를 답변 끝에 꼭 포함합니다.
- 답변은 자연스러운 문장으로, 2~5문장 정도로 간결하게 작성합니다. 필요 시 불렛 포인트를 쓸 수 있습니다.`;

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
    throw new Error(text || res.statusText);
  }

  const data = JSON.parse(text);
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error(data.error?.message || '응답을 생성할 수 없습니다.');
  return reply;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  if (!GROQ_API_KEY) {
    return res.status(503).json({
      error: 'LLM API가 설정되지 않았습니다. GROQ_API_KEY를 설정해 주세요.',
    });
  }

  try {
    const enhancedMessages = messages
      .filter(m => m.role !== 'system')
      .reduce((acc, m) => {
        if (acc.length === 0) acc.push({ role: 'system', content: SYSTEM_PROMPT });
        acc.push(m);
        return acc;
      }, []);
    if (enhancedMessages[0]?.role !== 'system') {
      enhancedMessages.unshift({ role: 'system', content: SYSTEM_PROMPT });
    }

    const reply = await callGroq(enhancedMessages);
    res.json({ reply });
  } catch (err) {
    console.error('Groq API 오류:', err.message);
    res.status(500).json({ error: err.message || 'LLM 처리 중 오류가 발생했습니다.' });
  }
};
