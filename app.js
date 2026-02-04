const API_BASE = typeof CHAT_API_URL !== 'undefined' ? CHAT_API_URL : 'http://localhost:3001';

// DOM
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.nav-btn');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const viewDetail = document.getElementById('viewDetail');
const detailContent = document.getElementById('detailContent');
const backBtn = document.getElementById('backBtn');

// Navigation
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const viewName = btn.dataset.view;
    navBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    views.forEach(v => {
      v.classList.remove('active');
      v.classList.add('hidden');
      if (v.id === `view${viewName.charAt(0).toUpperCase() + viewName.slice(1)}`) {
        v.classList.add('active');
        v.classList.remove('hidden');
      }
    });
  });
});

// Search - CSV 의약품 허가정보 기반
async function searchDrugs(query) {
  if (!query.trim()) return;
  searchResults.innerHTML = '<div class="loading">검색 중...</div>';
  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query.trim())}`);
    const results = await res.json();
    if (!Array.isArray(results) || results.length === 0) {
      searchResults.innerHTML = '<p class="error">검색 결과가 없습니다. 품목명, 분류(해열제·진해거담제 등), 성분명으로 검색해 보세요.</p>';
      return;
    }
    renderSearchResults(results);
  } catch (err) {
    searchResults.innerHTML = `<p class="error">검색 실패: ${err.message}. 서버(npm start)가 실행 중인지 확인하세요.</p>`;
  }
}

function getIngredient(drug) {
  return drug['주성분_x'] || drug['주성분'] || '-';
}

function renderSearchResults(results) {
  searchResults.innerHTML = results.map((drug, i) => {
    const name = drug['품목명'] || '-';
    const cls = drug['분류명'] || '-';
    const ing = getIngredient(drug).substring(0, 80);
    return `
      <div class="drug-card" data-id="${i}">
        <h3>${escapeHtml(name)}</h3>
        <p>분류: ${escapeHtml(cls)}</p>
        <p>주성분: ${escapeHtml(ing)}${getIngredient(drug).length > 80 ? '...' : ''}</p>
      </div>
    `;
  }).join('');
  document.querySelectorAll('.drug-card').forEach(card => {
    card.addEventListener('click', () => showDetail(results[parseInt(card.dataset.id)]));
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function showDetail(drug) {
  const name = drug['품목명'] || '알 수 없음';
  const cls = drug['분류명'] || '-';
  const ing = getIngredient(drug);
  const type = drug['전문일반구분'] || '-';
  const permitNo = drug['품목허가번호'] || '-';
  const company = drug['업체명'] || '';
  const eff = drug['이 약의 효능은 무엇입니까?'] || '';
  const usage = drug['이 약은 어떻게 사용합니까?'] || '';
  const before = drug['이 약을 사용하기 전에 반드시 알아야 할 내용은 무엇입니가?'] || drug['이 약을 사용하기 전에 반드시 알아야 할 내용은 무엇입니까?'] || '';
  const caution = drug['이 약의 사용상 주의사항은 무엇입니까?'] || '';
  const interact = drug['이 약을 사용하는 동안 주의해야 할 약 또는 음식은 무엇입니까?'] || '';
  const sideEffect = drug['이 약은 어떤 이상반응이 나타날 수 있습니까?'] || '';
  const storage = drug['이 약은 어떻게 보관해야 합니까?'] || '';

  const sections = [
    { title: '기본 정보', items: [
      ['품목명', name],
      ['분류명', cls],
      ['주성분', ing],
      ['전문/일반', type],
      ['품목허가번호', String(permitNo)],
      ...(company ? [['업체명', company]] : []),
    ]},
    ...(eff ? [{ title: '효능·효과', text: eff }] : []),
    ...(usage ? [{ title: '용법·용량', text: usage }] : []),
    ...(before ? [{ title: '사용 전 확인사항', text: before }] : []),
    ...(caution ? [{ title: '사용상 주의사항', text: caution }] : []),
    ...(interact ? [{ title: '약물·음식 상호작용', text: interact }] : []),
    ...(sideEffect ? [{ title: '이상반응', text: sideEffect }] : []),
    ...(storage ? [{ title: '보관방법', text: storage }] : []),
  ];

  detailContent.innerHTML = sections.map(s => {
    if (s.items) {
      return `<div class="detail-section"><h3>${s.title}</h3>${s.items.map(([k, v]) => v ? `<p><strong>${k}:</strong> ${escapeHtml(String(v))}</p>` : '').join('')}</div>`;
    }
    return `<div class="detail-section"><h3>${s.title}</h3><p>${escapeHtml(s.text)}</p></div>`;
  }).join('') + '<p class="disclaimer">※ 본 정보는 의약품 허가정보 공공데이터를 기반으로 합니다. 참고용이며, 반드시 의사나 약사와 상담하세요.</p>';
  document.getElementById('viewSearch').classList.remove('active');
  document.getElementById('viewSearch').classList.add('hidden');
  viewDetail.classList.add('active');
  viewDetail.classList.remove('hidden');
}

backBtn.addEventListener('click', () => {
  viewDetail.classList.remove('active');
  viewDetail.classList.add('hidden');
  document.getElementById('viewSearch').classList.add('active');
  document.getElementById('viewSearch').classList.remove('hidden');
});

searchBtn.addEventListener('click', () => searchDrugs(searchInput.value));
searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') searchDrugs(searchInput.value); });

// Interaction Checker
const interactionDrugInput = document.getElementById('interactionDrugInput');
const addDrugBtn = document.getElementById('addDrugBtn');
const interactionDrugList = document.getElementById('interactionDrugList');
const checkInteractionBtn = document.getElementById('checkInteractionBtn');
const interactionResult = document.getElementById('interactionResult');

let interactionDrugs = [];

addDrugBtn.addEventListener('click', () => {
  const name = interactionDrugInput.value.trim();
  if (name && !interactionDrugs.includes(name)) {
    interactionDrugs.push(name);
    renderInteractionList();
    interactionDrugInput.value = '';
  }
});

function renderInteractionList() {
  interactionDrugList.innerHTML = interactionDrugs.map((d, i) => `
    <span class="drug-tag">${d} <button data-i="${i}">×</button></span>
  `).join('');
  interactionDrugList.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      interactionDrugs.splice(parseInt(btn.dataset.i), 1);
      renderInteractionList();
    });
  });
}

function normalizeDrugName(name) {
  return name.toLowerCase().replace(/\s/g, '');
}

checkInteractionBtn.addEventListener('click', () => {
  if (interactionDrugs.length < 2) {
    interactionResult.innerHTML = '<p class="warning">2개 이상의 약을 추가해 주세요.</p>';
    return;
  }
  const found = [];
  for (let i = 0; i < interactionDrugs.length; i++) {
    for (let j = i + 1; j < interactionDrugs.length; j++) {
      const d1 = normalizeDrugName(interactionDrugs[i]);
      const d2 = normalizeDrugName(interactionDrugs[j]);
      for (const [drug, interactions] of Object.entries(INTERACTION_DATABASE)) {
        const drugNorm = normalizeDrugName(drug);
        const match1 = drugNorm.includes(d1) || d1.includes(drugNorm);
        const match2 = interactions.some(int => {
          const intNorm = normalizeDrugName(int);
          return intNorm.includes(d2) || d2.includes(intNorm);
        });
        if (match1 && match2) found.push(`${interactionDrugs[i]} ↔ ${interactionDrugs[j]}: 상호작용 가능`);
      }
    }
  }
  if (found.length > 0) {
    interactionResult.innerHTML = '<p class="danger"><strong>⚠️ 상호작용 주의:</strong></p>' + [...new Set(found)].map(f => `<p>• ${f}</p>`).join('');
  } else {
    interactionResult.innerHTML = '<p class="success">등록된 데이터에서 알려진 상호작용이 없습니다. 전문가 상담을 권장합니다.</p>';
  }
});

// Pill Identifier
const pillShape = document.getElementById('pillShape');
const pillColor = document.getElementById('pillColor');
const pillImprint = document.getElementById('pillImprint');
const identifyPillBtn = document.getElementById('identifyPillBtn');
const pillResults = document.getElementById('pillResults');

identifyPillBtn.addEventListener('click', () => {
  const shape = pillShape.value;
  const color = pillColor.value;
  const imprint = pillImprint.value.trim().toUpperCase();
  if (!shape && !color && !imprint) {
    pillResults.innerHTML = '<p class="warning">모양, 색상, 각인 중 하나 이상을 선택해 주세요.</p>';
    return;
  }
  const matches = PILL_DATABASE.filter(p => {
    const shapeMatch = !shape || p.shape === shape;
    const colorMatch = !color || p.color === color;
    const imprintMatch = !imprint || p.imprint.toUpperCase().includes(imprint) || imprint.includes(p.imprint.toUpperCase());
    return shapeMatch && colorMatch && imprintMatch;
  });
  const shapeLabels = { round: '원형', oval: '타원형', capsule: '캡슐형', rectangle: '사각형', diamond: '다이아몬드', hexagon: '육각형', octagon: '팔각형', triangle: '삼각형' };
  const colorLabels = { white: '흰색', yellow: '노란색', orange: '주황색', red: '빨간색', pink: '분홍색', blue: '파란색', green: '초록색', brown: '갈색', gray: '회색' };
  if (matches.length === 0) {
    pillResults.innerHTML = '<p class="warning">검색 조건에 맞는 알약이 없습니다. 조건을 완화하거나 다른 각인을 입력해 보세요.</p>';
    return;
  }
  pillResults.innerHTML = matches.map(p => `
    <div class="drug-card pill-card">
      <h3>${p.name}</h3>
      <p>성분: ${p.ingredient} | ${p.strength}</p>
      <p class="pill-meta">모양: ${shapeLabels[p.shape] || p.shape} / 색: ${colorLabels[p.color] || p.color} / 각인: ${p.imprint}</p>
    </div>
  `).join('');
});

// My Medications
const medicationInput = document.getElementById('medicationInput');
const addMedicationBtn = document.getElementById('addMedicationBtn');
const medicationList = document.getElementById('medicationList');
const checkAllergyBtn = document.getElementById('checkAllergyBtn');
const checkMyInteractionsBtn = document.getElementById('checkMyInteractionsBtn');

let myMedications = JSON.parse(localStorage.getItem('myMedications') || '[]');

function saveMedications() {
  localStorage.setItem('myMedications', JSON.stringify(myMedications));
  renderMedicationList();
}

function renderMedicationList() {
  medicationList.innerHTML = myMedications.map((m, i) => `
    <span class="med-tag">${m} <button data-i="${i}">×</button></span>
  `).join('');
  medicationList.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      myMedications.splice(parseInt(btn.dataset.i), 1);
      saveMedications();
    });
  });
}

addMedicationBtn.addEventListener('click', () => {
  const name = medicationInput.value.trim();
  if (name && !myMedications.includes(name)) {
    myMedications.push(name);
    saveMedications();
    medicationInput.value = '';
  }
});

checkMyInteractionsBtn.addEventListener('click', () => {
  interactionDrugs = [...myMedications];
  renderInteractionList();
  document.querySelector('[data-view="interaction"]').click();
  setTimeout(() => checkInteractionBtn.click(), 100);
});

checkAllergyBtn.addEventListener('click', () => {
  if (myMedications.length === 0) {
    alert('먼저 복용 중인 약을 추가해 주세요.');
    return;
  }
  const allergy = prompt('알레르기가 있는 성분을 입력하세요 (예: 페니실린, 아스피린):');
  if (!allergy || !allergy.trim()) return;
  const allergyKey = Object.keys(ALLERGY_INGREDIENTS).find(k => k.toLowerCase().includes(allergy.toLowerCase()) || allergy.toLowerCase().includes(k.toLowerCase()));
  const group = allergyKey ? ALLERGY_INGREDIENTS[allergyKey] : null;
  if (!group) {
    const found = myMedications.filter(m => m.toLowerCase().includes(allergy.toLowerCase()) || allergy.toLowerCase().includes(m.toLowerCase()));
    if (found.length > 0) {
      alert(`⚠️ 알레르기 주의: "${found.join(', ')}"에 "${allergy}" 성분이 포함될 수 있습니다. 의사와 상담하세요.`);
    } else {
      alert('저장된 약 목록에서 해당 알레르기 성분이 발견되지 않았습니다. 등록된 알레르기 그룹: 페니실린, 설폰아마이드, 아스피린, 세팔로스포린');
    }
    return;
  }
  const found = myMedications.filter(m => group.some(g => m.toLowerCase().includes(g.toLowerCase()) || g.toLowerCase().includes(m.toLowerCase())));
  if (found.length > 0) {
    alert(`⚠️ 알레르기 주의: ${found.join(', ')}에 ${allergyKey} 계열 성분이 포함될 수 있습니다. 반드시 의사와 상담하세요.`);
  } else {
    alert('저장된 약 목록에서 해당 알레르기 성분이 발견되지 않았습니다.');
  }
});

renderMedicationList();

// ========== 챗봇 (LLM) ==========
const chatbotPanel = document.getElementById('chatbotPanel');
const chatbotToggle = document.getElementById('chatbotToggle');
const chatbotClose = document.getElementById('chatbotClose');
const chatbotMessages = document.getElementById('chatbotMessages');
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');

const CHAT_API_BASE = typeof CHAT_API_URL !== 'undefined' ? CHAT_API_URL : 'http://localhost:3001';

chatbotToggle.addEventListener('click', () => chatbotPanel.classList.add('open'));
chatbotClose.addEventListener('click', () => chatbotPanel.classList.remove('open'));

function formatJsonReply(text) {
  try {
    const json = JSON.parse(text.trim());
    let html = '';
    if (json.추천의약품 && Array.isArray(json.추천의약품)) {
      html += json.추천의약품.map((m, i) => {
        let block = `<div class="chat-med-card"><strong>${i + 1}. ${escapeHtml(m.품목명 || '-')}</strong>`;
        if (m.분류명) block += `<br><span class="chat-med-meta">분류: ${escapeHtml(m.분류명)}</span>`;
        if (m.효능요약) block += `<p>효능: ${escapeHtml(m.효능요약)}</p>`;
        if (m.사용전확인) block += `<p>사용 전 확인: ${escapeHtml(m.사용전확인)}</p>`;
        if (m.사용상주의사항 || m.주의사항) block += `<p>주의사항: ${escapeHtml(m.사용상주의사항 || m.주의사항)}</p>`;
        if (m.약물음식주의 || m.상호작용) block += `<p>약물·음식 주의: ${escapeHtml(m.약물음식주의 || m.상호작용)}</p>`;
        return block + '</div>';
      }).join('');
    }
    if (json.안내) html += `<p class="chat-disclaimer">⚠️ ${escapeHtml(json.안내)}</p>`;
    if (html) return html;
  } catch (_) {}
  return null;
}

function appendMessage(text, isUser) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isUser ? 'user' : 'bot'}`;
  const formatted = !isUser && formatJsonReply(text);
  div.innerHTML = formatted ? `<div>${formatted}</div>` : `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function appendLoading() {
  const div = document.createElement('div');
  div.className = 'chat-msg bot loading';
  div.id = 'chatLoading';
  div.innerHTML = '<p>생각 중...</p>';
  chatbotMessages.appendChild(div);
  chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function removeLoading() {
  const el = document.getElementById('chatLoading');
  if (el) el.remove();
}

const SYSTEM_PROMPT = `당신은 의약품 정보를 안내하는 친절한 챗봇입니다. 
한국어로 답변하세요. 약물의 효능, 용법·용량, 부작용, 상호작용 등에 대해 일반적인 정보를 제공할 수 있습니다.
반드시 "본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요"와 같은 의료 상담 대체 불가 안내를 포함하세요.
의료 진단이나 처방은 하지 마세요.`;

async function sendToLLM(messages) {
  try {
    const res = await fetch(`${CHAT_API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) throw new Error(await res.text() || res.statusText);
    const data = await res.json();
    return data.reply || data.message || data.content || '응답을 생성할 수 없습니다.';
  } catch (err) {
    console.error('LLM API 오류:', err);
    return null;
  }
}

function getMockReply(userText) {
  const lower = userText.toLowerCase();
  if (lower.includes('타이레놀') || lower.includes('아세트아미노펜')) {
    return '타이레놀(아세트아미노펜)은 해열·진통제입니다. 성인 1회 500~1000mg, 1일 3~4회 복용이 일반적입니다. 과다복용 시 간손상 우려가 있으니 1일 최대 4000mg을 넘기지 마세요. ⚠️ 본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요.';
  }
  if (lower.includes('부작용')) {
    return '약물별로 부작용이 다릅니다. 의약품명을 알려주시면 해당 약의 주요 부작용을 안내해 드릴 수 있습니다. ⚠️ 본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요.';
  }
  if (lower.includes('상호작용')) {
    return '여러 약을 함께 복용할 때 상호작용이 발생할 수 있습니다. 이 앱의 "상호작용" 메뉴에서 복용 중인 약을 추가해 검사해 보세요. ⚠️ 본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요.';
  }
  return '의약품명이나 궁금한 내용을 구체적으로 입력해 주시면 안내해 드리겠습니다. (예: 타이레놀 부작용, 이부프로펜 사용법) ⚠️ 본 정보는 참고용이며, 반드시 의사나 약사와 상담하세요.';
}

async function handleChatSend() {
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = '';
  appendMessage(text, true);
  appendLoading();

  let reply = null;
  try {
    reply = await sendToLLM([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ]);
  } catch (_) {}
  if (!reply) reply = getMockReply(text);

  removeLoading();
  appendMessage(reply, false);
}

chatSendBtn.addEventListener('click', handleChatSend);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleChatSend(); });
