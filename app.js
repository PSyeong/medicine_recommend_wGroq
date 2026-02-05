const API_BASE = ''; // Vercel 배포 시 같은 도메인, 로컬 시 상대경로 사용

// 국립중앙의료원 전국 약국 정보 조회 API (공공데이터포털)
const PHARMACY_API = 'https://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire';
const CORS_PROXIES = [
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u)
];

// DOM
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.nav-btn');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const viewDetail = document.getElementById('viewDetail');
const detailContent = document.getElementById('detailContent');
const backBtn = document.getElementById('backBtn');

// 라우팅: 해시 + History API로 뒤로가기 지원
const ROUTES = ['search', 'interaction', 'pill', 'pharmacy', 'notebook', 'detail'];
const VIEW_ID_MAP = {
  search: 'viewSearch',
  interaction: 'viewInteraction',
  pill: 'viewPill',
  pharmacy: 'viewPharmacy',
  notebook: 'viewNotebook',
  detail: 'viewDetail',
};

function getRouteFromHash() {
  const hash = (location.hash || '#search').replace(/^#/, '') || 'search';
  const [view, ...rest] = hash.split('/');
  const name = rest.length ? decodeURIComponent(rest.join('/')) : null;
  if (ROUTES.includes(view)) return { view, name };
  return { view: 'search', name: null };
}

function getRouteFromState() {
  const s = history.state;
  if (s && s.view === 'detail' && s.drug) return { view: 'detail', drug: s.drug };
  return null;
}

function applyView(viewName) {
  // 라우트 전환 시 알약 식별 팝오버 닫기 (뒤로가기 시에도 사라지도록)
  const pillPopover = document.getElementById('pillPopover');
  if (pillPopover && !pillPopover.hidden) pillPopover.hidden = true;

  const viewId = VIEW_ID_MAP[viewName];
  if (!viewId) return;
  navBtns.forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewName);
  });
  views.forEach(v => {
    const on = v.id === viewId;
    v.classList.toggle('active', on);
    v.classList.toggle('hidden', !on);
  });
}

function pushRoute(viewName, state) {
  const hash = viewName === 'detail' && state && state.drug && state.drug['품목명']
    ? '#detail/' + encodeURIComponent(state.drug['품목명'])
    : '#' + viewName;
  history.pushState(state || { view: viewName }, '', hash);
}

function replaceRoute(viewName, state) {
  const hash = viewName === 'detail' && state && state.drug && state.drug['품목명']
    ? '#detail/' + encodeURIComponent(state.drug['품목명'])
    : '#' + viewName;
  history.replaceState(state || { view: viewName }, '', hash);
}

function showViewByRoute(viewName, stateOrName) {
  if (viewName === 'detail') {
    if (stateOrName && stateOrName.drug) {
      renderDetailContent(stateOrName.drug);
      applyView('detail');
      return;
    }
    if (stateOrName && typeof stateOrName === 'string') {
      fetch(`${API_BASE}/api/search?q=${encodeURIComponent(stateOrName)}&limit=1`)
        .then(r => r.json())
        .then(arr => {
          if (Array.isArray(arr) && arr[0]) {
            const drug = arr[0];
            replaceRoute('search'); // 뒤로가기 시 검색으로 돌아가도록 한 단계 넣음
            pushRoute('detail', { view: 'detail', drug });
            renderDetailContent(drug);
            applyView('detail');
          } else {
            replaceRoute('search');
            applyView('search');
          }
        })
        .catch(() => { replaceRoute('search'); applyView('search'); });
      return;
    }
  }
  applyView(viewName);
}

// 초기 라우트 및 popstate
function initRoute() {
  const fromState = getRouteFromState();
  if (fromState && fromState.view === 'detail' && fromState.drug) {
    showViewByRoute('detail', fromState);
    return;
  }
  const { view, name } = getRouteFromHash();
  if (view === 'detail' && name) {
    showViewByRoute('detail', name);
    return;
  }
  if (view === 'detail') {
    replaceRoute('search');
    applyView('search');
    return;
  }
  applyView(view);
}

window.addEventListener('popstate', (e) => {
  const s = e.state;
  if (s && s.view === 'detail' && s.drug) {
    showViewByRoute('detail', s);
    return;
  }
  if (s && ROUTES.includes(s.view)) {
    applyView(s.view);
    return;
  }
  const { view, name } = getRouteFromHash();
  if (view === 'detail' && name) {
    showViewByRoute('detail', name);
    return;
  }
  applyView(view);
});

// 카테고리별 증상 매핑 (증상별 검색)
const CATEGORY_SYMPTOMS = {
  '머리': ['두통', '발열'],
  '가슴': ['기침', '가래', '천식'],
  '배': ['복통', '속쓰림', '소화불량', '설사', '구토'],
  '관절': ['관절통', '근육통', '몸살'],
  '피부': ['염증', '피부염', '습진', '두드러기'],
};

const symptomRow = document.getElementById('symptomRow');
const iconSymptoms = document.getElementById('iconSymptoms');
const openedCategories = new Set();
const selectedSymptoms = new Set();

function getSymptomsByCategory(cat) {
  return CATEGORY_SYMPTOMS[cat] || [];
}

function hasSelectedInCategory(cat) {
  return getSymptomsByCategory(cat).some(s => selectedSymptoms.has(s));
}

function toggleCategory(cat) {
  if (openedCategories.has(cat)) {
    openedCategories.delete(cat);
    getSymptomsByCategory(cat).forEach(s => selectedSymptoms.delete(s));
  } else {
    openedCategories.add(cat);
  }
}

function updateCategoryHighlights() {
  document.querySelectorAll('.category-btn').forEach(cb => {
    const cat = cb.dataset.category;
    cb.classList.toggle('active', openedCategories.has(cat) || hasSelectedInCategory(cat));
  });
  document.querySelectorAll('.body-part').forEach(part => {
    const cats = part.dataset.categories ? part.dataset.categories.split(',') : [part.dataset.category];
    const isActive = cats.some(c => openedCategories.has(c) || hasSelectedInCategory(c));
    part.classList.toggle('active', !!isActive);
  });
}

function clearSearchInputForSymptomMode() {
  if (searchInput) searchInput.value = '';
  const dd = document.getElementById('autocompleteDropdown');
  if (dd) {
    dd.hidden = true;
    dd.innerHTML = '';
  }
}

function clearSymptomAndCategoryState() {
  openedCategories.clear();
  selectedSymptoms.clear();
  renderSymptomButtons();
  updateCategoryHighlights();
}

function bindSymptomClick(btn, s) {
  btn.addEventListener('click', () => {
    clearSearchInputForSymptomMode();
    if (selectedSymptoms.has(s)) {
      selectedSymptoms.delete(s);
    } else {
      selectedSymptoms.add(s);
    }
    renderSymptomButtons();
    updateCategoryHighlights();
    if (selectedSymptoms.size > 0) {
      searchDrugs(Array.from(selectedSymptoms).join(' '));
    } else {
      searchResults.innerHTML = '';
    }
  });
}

function renderSymptomButtons() {
  const allSymptoms = [];
  openedCategories.forEach(cat => {
    getSymptomsByCategory(cat).forEach(s => {
      if (!allSymptoms.includes(s)) allSymptoms.push(s);
    });
  });
  const buttonsHtml = allSymptoms.map(s => `
    <button class="symptom-btn ${selectedSymptoms.has(s) ? 'active' : ''}" data-symptom="${s}">${s}</button>
  `).join('');
  if (allSymptoms.length === 0) {
    symptomRow.innerHTML = '';
    if (iconSymptoms) iconSymptoms.innerHTML = '';
    updateCategoryHighlights();
    return;
  }
  symptomRow.innerHTML = buttonsHtml;
  if (iconSymptoms) iconSymptoms.innerHTML = buttonsHtml;
  symptomRow.querySelectorAll('.symptom-btn').forEach(btn => {
    bindSymptomClick(btn, btn.dataset.symptom);
  });
  iconSymptoms?.querySelectorAll('.symptom-btn').forEach(btn => {
    bindSymptomClick(btn, btn.dataset.symptom);
  });
  updateCategoryHighlights();
}

document.querySelectorAll('.category-btn')?.forEach(btn => {
  btn.addEventListener('click', () => {
    searchInput.value = '';
    toggleCategory(btn.dataset.category);
    renderSymptomButtons();
    if (selectedSymptoms.size > 0) {
      searchDrugs(Array.from(selectedSymptoms).join(' '));
    } else {
      searchResults.innerHTML = '';
    }
  });
});

document.querySelectorAll('.body-part')?.forEach(part => {
  part.addEventListener('click', () => {
    clearSearchInputForSymptomMode();
    const cats = (part.dataset.categories ? part.dataset.categories.split(',') : [part.dataset.category]).map(c => c.trim());
    const anyOpen = cats.some(c => openedCategories.has(c));
    if (anyOpen) {
      cats.forEach(cat => {
        openedCategories.delete(cat);
        getSymptomsByCategory(cat).forEach(s => selectedSymptoms.delete(s));
      });
    } else {
      cats.forEach(cat => openedCategories.add(cat));
    }
    renderSymptomButtons();
    if (selectedSymptoms.size > 0) {
      searchDrugs(Array.from(selectedSymptoms).join(' '));
    } else {
      searchResults.innerHTML = '';
    }
  });
});

// Navigation: 라우트 푸시 후 화면 전환 (뒤로가기 가능)
navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const viewName = btn.dataset.view;
    pushRoute(viewName);
    applyView(viewName);
  });
});

// Search - CSV 의약품 허가정보 기반
async function searchDrugs(query) {
  if (!query.trim()) {
    searchResults.innerHTML = '';
    return;
  }
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

const DEFAULT_IMAGE = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22120%22%20height%3D%22120%22%20viewBox%3D%220%200%20120%20120%22%3E%3Crect%20width%3D%22120%22%20height%3D%22120%22%20fill%3D%22%23f1f5f9%22%2F%3E%3Cellipse%20cx%3D%2260%22%20cy%3D%2260%22%20rx%3D%2235%22%20ry%3D%2218%22%20fill%3D%22%23e2e8f0%22%20stroke%3D%22%23cbd5e1%22%20stroke-width%3D%221%22%2F%3E%3Ctext%20x%3D%2260%22%20y%3D%2295%22%20text-anchor%3D%22middle%22%20fill%3D%22%2394a3b8%22%20font-size%3D%2211%22%3E%EC%9D%B4%EB%AF%B8%EC%A7%80%20%EC%97%86%EC%9D%8C%3C%2Ftext%3E%3C%2Fsvg%3E';

function safeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function getProductImage(drug) {
  const url = (drug['큰 제품 이미지'] || drug['큰제품이미지'] || '').trim();
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    if (url.includes('nedrug.mfds.go.kr')) {
      return `${API_BASE || ''}/api/image?url=${encodeURIComponent(url)}`;
    }
    return url;
  }
  return DEFAULT_IMAGE;
}

function renderSearchResults(results) {
  searchResults.innerHTML = results.map((drug, i) => {
    const name = drug['품목명'] || '-';
    const cls = drug['분류명'] || '-';
    const ing = getIngredient(drug).substring(0, 80);
    const imgSrc = getProductImage(drug);
    const interact = drug['이 약을 사용하는 동안 주의해야 할 약 또는 음식은 무엇입니까?'] || '';
    const hasInteract = interact && interact.trim() !== '' && interact.trim() !== '-';
    const interactHtml = hasInteract
      ? ` <a href="#" class="interaction-link" data-id="${i}">상호작용 확인</a>`
      : '';
    const panelHtml = hasInteract
      ? `<div class="interaction-panel" id="interaction-panel-${i}" hidden><h4 class="interaction-panel-title">이 약을 사용하는 동안 주의해야 할 약 또는 음식</h4><p class="interaction-panel-content">${escapeHtml(interact)}</p></div>`
      : '';
    return `
      <div class="drug-card-wrap" data-id="${i}">
        <div class="drug-card">
          <img class="drug-card-img" src="${safeAttr(imgSrc)}" alt="${escapeHtml(name)}" onerror="this.src=this.dataset.fb" data-fb="${safeAttr(DEFAULT_IMAGE)}">
          <div class="drug-card-body">
            <h3>${escapeHtml(name)}${interactHtml}</h3>
            <p>분류: ${escapeHtml(cls)}</p>
            <p>주성분: ${escapeHtml(ing)}${getIngredient(drug).length > 80 ? '...' : ''}</p>
          </div>
        </div>
        ${panelHtml}
      </div>
    `;
  }).join('');

  document.querySelectorAll('.drug-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.interaction-link')) return;
      showDetail(results[parseInt(card.closest('.drug-card-wrap').dataset.id)]);
    });
  });
  document.querySelectorAll('.interaction-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wrap = link.closest('.drug-card-wrap');
      const id = wrap.dataset.id;
      const panel = document.getElementById(`interaction-panel-${id}`);
      if (panel) panel.hidden = !panel.hidden;
    });
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderDetailContent(drug) {
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

  const imgSrc = getProductImage(drug);
  detailContent.innerHTML = `<div class="detail-image-wrap"><img class="detail-product-img" src="${safeAttr(imgSrc)}" alt="${escapeHtml(name)}" onerror="this.src=this.dataset.fb" data-fb="${safeAttr(DEFAULT_IMAGE)}"></div>` + sections.map(s => {
    if (s.items) {
      return `<div class="detail-section"><h3>${s.title}</h3>${s.items.map(([k, v]) => v ? `<p><strong>${k}:</strong> ${escapeHtml(String(v))}</p>` : '').join('')}</div>`;
    }
    return `<div class="detail-section"><h3>${s.title}</h3><p>${escapeHtml(s.text)}</p></div>`;
  }).join('') + '<p class="disclaimer">※ 본 정보는 의약품 허가정보 공공데이터를 기반으로 합니다. 참고용이며, 반드시 의사나 약사와 상담하세요.</p>';
}

function showDetail(drug) {
  pushRoute('detail', { view: 'detail', drug });
  renderDetailContent(drug);
  applyView('detail');
}

// 상세 화면 "← 목록으로" = 브라우저 뒤로가기 (이전 화면 복원)
backBtn.addEventListener('click', () => history.back());

searchBtn.addEventListener('click', () => {
  clearSymptomAndCategoryState();
  searchDrugs(searchInput.value);
});
searchInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    clearSymptomAndCategoryState();
    searchDrugs(searchInput.value);
  }
});

// 검색 자동완성 (품목명 기준)
const autocompleteDropdown = document.getElementById('autocompleteDropdown');
let autocompleteTimeout = null;
let autocompleteItems = [];

function hideAutocomplete() {
  if (autocompleteDropdown) {
    autocompleteDropdown.hidden = true;
    autocompleteDropdown.innerHTML = '';
    autocompleteItems = [];
  }
}

async function fetchAutocompleteSuggestions(q) {
  if (!q.trim()) return [];
  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q.trim())}&limit=10`);
    const results = await res.json();
    if (!Array.isArray(results)) return [];
    const names = [...new Set(results.map(r => r['품목명']).filter(Boolean))].slice(0, 8);
    return names;
  } catch {
    return [];
  }
}

function renderAutocomplete(items) {
  if (!autocompleteDropdown || !items || items.length === 0) {
    hideAutocomplete();
    return;
  }
  autocompleteItems = items;
  autocompleteDropdown.innerHTML = items.map(name => `
    <div class="autocomplete-item" data-name="${escapeHtml(name)}">${escapeHtml(name)}</div>
  `).join('');
  autocompleteDropdown.hidden = false;
  autocompleteDropdown.querySelectorAll('.autocomplete-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = el.dataset.name;
      if (name) {
        searchInput.value = name;
        hideAutocomplete();
        clearSymptomAndCategoryState();
        searchDrugs(name);
      }
    });
  });
}

searchInput.addEventListener('input', () => {
  clearTimeout(autocompleteTimeout);
  const q = searchInput.value;
  if (!q.trim()) {
    hideAutocomplete();
    return;
  }
  autocompleteTimeout = setTimeout(async () => {
    const names = await fetchAutocompleteSuggestions(q);
    renderAutocomplete(names);
  }, 250);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideAutocomplete();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-box-wrap')) hideAutocomplete();
});

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

identifyPillBtn.addEventListener('click', async () => {
  const shape = (pillShape.value || '').trim();
  const color = (pillColor.value || '').trim();
  const imprint = (pillImprint.value || '').trim();
  if (!shape && !color && !imprint) {
    pillResults.innerHTML = '<p class="warning">모양, 색상, 각인 중 하나 이상을 선택해 주세요.</p>';
    return;
  }
  pillResults.innerHTML = '<div class="loading">공공데이터 API에서 알약 정보를 조회 중...</div>';
  try {
    const params = new URLSearchParams();
    if (shape) params.set('shape', shape);
    if (color) params.set('color', color);
    if (imprint) params.set('imprint', imprint);
    const res = await fetch(`${API_BASE}/api/pill?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      pillResults.innerHTML = `<p class="error">${data.error || '알약 조회에 실패했습니다.'} (.env에 DATA_GO_KR_KEY 설정 및 공공데이터포털 활용신청을 확인하세요.)</p>`;
      return;
    }
    const matches = Array.isArray(data) ? data : [];
    if (matches.length === 0) {
      pillResults.innerHTML = '<p class="warning">검색 조건에 맞는 알약이 없습니다. 조건을 완화하거나 다른 각인을 입력해 보세요.</p>';
      return;
    }
    pillResults._pillMatches = matches;
    pillResults.innerHTML = matches.map((p, i) => {
      const imgUrl = (p.image && (p.image.startsWith('http://') || p.image.startsWith('https://')))
        ? (p.image.includes('nedrug.mfds.go.kr') ? `${API_BASE || ''}/api/image?url=${encodeURIComponent(p.image)}` : p.image)
        : '';
      const imgSrc = imgUrl || DEFAULT_IMAGE;
      return `
      <div class="drug-card pill-card pill-card-clickable" data-pill-index="${i}">
        <img class="drug-card-img" src="${safeAttr(imgSrc)}" alt="${escapeHtml(p.name || '')}" onerror="this.src=this.dataset.fb" data-fb="${safeAttr(DEFAULT_IMAGE)}">
        <div class="drug-card-body">
          <h3>${escapeHtml(p.name || '-')}</h3>
          <p>성분: ${escapeHtml(p.ingredient || '-')}${p.type ? ' | ' + escapeHtml(p.type) : ''}</p>
          <p class="pill-meta">모양: ${escapeHtml(p.shape_kr || '-')} / 색: ${escapeHtml(p.color_kr || '-')} / 각인: ${escapeHtml(p.imprint || '-')}</p>
        </div>
      </div>
    `;
    }).join('');
    pillResults.querySelectorAll('.pill-card-clickable').forEach(card => {
      card.addEventListener('click', () => showPillPopover(card.dataset.pillIndex));
    });
  } catch (err) {
    pillResults.innerHTML = `<p class="error">알약 조회 실패: ${err.message}. 서버가 실행 중인지 확인하세요.</p>`;
  }
});

function closePillPopover() {
  const popover = document.getElementById('pillPopover');
  if (popover) popover.hidden = true;
}

function showPillPopover(indexStr) {
  const matches = pillResults._pillMatches;
  if (!matches || !Array.isArray(matches)) return;
  const i = parseInt(indexStr, 10);
  const p = matches[i];
  if (!p) return;
  const imgUrl = (p.image && (p.image.startsWith('http://') || p.image.startsWith('https://')))
    ? (p.image.includes('nedrug.mfds.go.kr') ? `${API_BASE || ''}/api/image?url=${encodeURIComponent(p.image)}` : p.image)
    : '';
  const imgSrc = imgUrl || DEFAULT_IMAGE;
  const sizeInfo = [p.leng_long, p.leng_short, p.thick].filter(Boolean).join(' × ');
  const body = document.getElementById('pillPopoverBody');
  body.innerHTML = `
    <div class="pill-popover-image-wrap">
      <img class="pill-popover-img" src="${safeAttr(imgSrc)}" alt="${escapeHtml(p.name || '')}" onerror="this.src=this.dataset.fb" data-fb="${safeAttr(DEFAULT_IMAGE)}">
    </div>
    <h2 class="pill-popover-title">${escapeHtml(p.name || '-')}</h2>
    <dl class="pill-popover-dl">
      ${(p.ingredient && p.ingredient !== '-') ? `<dt>성분</dt><dd>${escapeHtml(p.ingredient)}</dd>` : ''}
      ${(p.type && p.type.trim()) ? `<dt>구분</dt><dd>${escapeHtml(p.type)}</dd>` : ''}
      ${(p.shape_kr && p.shape_kr.trim()) ? `<dt>모양</dt><dd>${escapeHtml(p.shape_kr)}</dd>` : ''}
      ${(p.color_kr && p.color_kr.trim()) ? `<dt>색상</dt><dd>${escapeHtml(p.color_kr)}</dd>` : ''}
      ${(p.imprint && p.imprint.trim()) ? `<dt>각인</dt><dd>${escapeHtml(p.imprint)}</dd>` : ''}
      ${sizeInfo ? `<dt>크기</dt><dd>${escapeHtml(sizeInfo)} mm</dd>` : ''}
      ${(p.form_code_name && p.form_code_name.trim()) ? `<dt>제형</dt><dd>${escapeHtml(p.form_code_name)}</dd>` : ''}
      ${(p.entp_name && p.entp_name.trim()) ? `<dt>업체명</dt><dd>${escapeHtml(p.entp_name)}</dd>` : ''}
    </dl>
  `;
  const popover = document.getElementById('pillPopover');
  if (popover) popover.hidden = false;
}

(function initPillPopoverClose() {
  const closeBtn = document.getElementById('pillPopoverClose');
  const backdrop = document.getElementById('pillPopoverBackdrop');
  if (closeBtn) closeBtn.addEventListener('click', closePillPopover);
  if (backdrop) backdrop.addEventListener('click', closePillPopover);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const popover = document.getElementById('pillPopover');
      if (popover && !popover.hidden) closePillPopover();
    }
  });
})();

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

const CHAT_API_BASE = '';

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
    const body = await res.text();
    if (!res.ok) {
      let errMsg = body;
      try {
        const j = JSON.parse(body);
        errMsg = j.error || j.message || body;
      } catch (_) {}
      console.error('LLM API 오류:', res.status, errMsg);
      return null;
    }
    const data = JSON.parse(body);
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

// ========== 근처 약국 (심야운영약국) ==========
function formatNightPharmacyHours(p) {
  const days = [
    { k: 'mon', l: '월' }, { k: 'tue', l: '화' }, { k: 'wed', l: '수' }, { k: 'thu', l: '목' },
    { k: 'fri', l: '금' }, { k: 'sat', l: '토' }, { k: 'sun', l: '일' }, { k: 'holiday', l: '공휴일' }
  ];
  const parts = days.map(d => {
    const v = (p[d.k] || '').trim();
    return v ? `${d.l}: ${v}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join(' | ') : '영업시간 정보 없음';
}

function matchPharmacyName(name, query) {
  if (!query || !name) return !query;
  const words = query.trim().split(/\s+/).filter(Boolean).map(w => w.toLowerCase());
  const n = (name || '').toLowerCase();
  return words.every(w => n.indexOf(w) >= 0);
}

// 공공데이터 약국 API 응답의 요일별 영업시간 포맷 (dutyTime1s~8c)
const DAY_LABELS_PHARMACY = { 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토', 7: '일', 8: '공휴일' };
function formatAllPharmacyHours(item) {
  const parts = [];
  for (let d = 1; d <= 8; d++) {
    const s = item[`dutyTime${d}s`] || item[`dutyTime${d}S`] || item[`dutytime${d}s`];
    const c = item[`dutyTime${d}c`] || item[`dutyTime${d}C`] || item[`dutytime${d}c`];
    if (s || c) {
      const start = (s || '').replace(/^(\d{2})(\d{2})$/, '$1:$2') || '-';
      const end = (c || '').replace(/^(\d{2})(\d{2})$/, '$1:$2') || '-';
      parts.push(DAY_LABELS_PHARMACY[d] + ': ' + start + '~' + end);
    }
  }
  return parts.length ? parts.join(' | ') : '영업시간 정보 없음';
}

async function fetchPharmacyList(params) {
  const pharmacyKey = (typeof DATA_GO_KR_PHARMACY_API_KEY !== 'undefined' && DATA_GO_KR_PHARMACY_API_KEY) ? DATA_GO_KR_PHARMACY_API_KEY.trim() : '';
  const commonKey = (typeof DATA_GO_KR_API_KEY !== 'undefined' && DATA_GO_KR_API_KEY) ? DATA_GO_KR_API_KEY.trim() : '';
  const apiKey = pharmacyKey || commonKey;
  if (!apiKey) return { items: [], total: 0, error: 'API_KEY_REQUIRED' };
  const q = new URLSearchParams({
    serviceKey: apiKey,
    pageNo: String(params.pageNo || 1),
    numOfRows: String(params.numOfRows || 20)
  });
  if (params.Q0) q.set('Q0', params.Q0);
  if (params.Q1) q.set('Q1', params.Q1);
  if (params.QN) q.set('QN', params.QN);
  if (params.QT) q.set('QT', params.QT);
  const url = PHARMACY_API + '?' + q.toString();
  const tryFetch = async (targetUrl) => {
    const res = await fetch(targetUrl);
    if (!res.ok) throw new Error(res.statusText);
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const err = doc.querySelector('OpenAPI_ServiceResponse cmmMsgHeader errMsg, OpenAPI_ServiceResponse errMsg, error errMsg');
    if (err && err.textContent && err.textContent.trim()) throw new Error(err.textContent.trim());
    const items = [];
    const list = doc.querySelectorAll('item');
    list.forEach(node => {
      const o = {};
      node.childNodes.forEach(c => {
        if (c.nodeType === 1) {
          const k = c.nodeName;
          const v = (c.textContent || '').trim();
          o[k] = v;
          o[k.toLowerCase()] = v;
        }
      });
      items.push(o);
    });
    const total = doc.querySelector('totalCount');
    return { items, total: total ? parseInt(total.textContent, 10) || items.length : items.length };
  };
  try {
    return await tryFetch(url);
  } catch (e) {
    for (const toProxyUrl of CORS_PROXIES) {
      try {
        return await tryFetch(toProxyUrl(url));
      } catch (_) { continue; }
    }
    return { items: [], total: 0, error: e.message || '약국 정보를 불러오지 못했습니다.' };
  }
}

function filterPharmacyData(Q0, Q1, QN) {
  if (typeof PHARMACY_DATA === 'undefined' || !Array.isArray(PHARMACY_DATA)) return [];
  let list = PHARMACY_DATA;
  if (Q0) list = list.filter(p => (p.dutyAddr || '').indexOf(Q0) >= 0);
  if (Q1) list = list.filter(p => (p.dutyAddr || '').indexOf(Q1) >= 0);
  if (QN) list = list.filter(p => matchPharmacyName(p.dutyName, QN));
  return list;
}

function filterNightPharmacies(Q0, Q1, QN) {
  if (typeof NIGHT_PHARMACY === 'undefined' || !Array.isArray(NIGHT_PHARMACY)) return [];
  let list = NIGHT_PHARMACY;
  if (Q0) list = list.filter(p => (p.addr || '').indexOf(Q0) >= 0 || (p.addr2 || '').indexOf(Q0) >= 0);
  if (Q1) list = list.filter(p => (p.addr || '').indexOf(Q1) >= 0 || (p.addr2 || '').indexOf(Q1) >= 0);
  if (QN) list = list.filter(p => matchPharmacyName(p.name, QN));
  return list;
}

function getPharmacyNameSuggestions(q, Q0, Q1, mode) {
  const qTrim = (q || '').trim().toLowerCase();
  if (!qTrim || qTrim.length < 1) return [];
  const words = qTrim.split(/\s+/).filter(Boolean);
  function matches(name) {
    const n = (name || '').toLowerCase();
    return words.every(w => n.indexOf(w) >= 0);
  }
  const m = mode || (document.querySelector('input[name="pharmacyMode"]:checked')?.value || 'night');
  if (m === 'night' && typeof NIGHT_PHARMACY !== 'undefined' && Array.isArray(NIGHT_PHARMACY)) {
    let list = NIGHT_PHARMACY;
    if (Q0) list = list.filter(p => (p.addr || '').indexOf(Q0) >= 0 || (p.addr2 || '').indexOf(Q0) >= 0);
    if (Q1) list = list.filter(p => (p.addr || '').indexOf(Q1) >= 0 || (p.addr2 || '').indexOf(Q1) >= 0);
    list = list.filter(p => matches(p.name));
    return [...new Set(list.map(p => p.name))].slice(0, 12);
  }
  const hasEmbedded = typeof PHARMACY_DATA !== 'undefined' && Array.isArray(PHARMACY_DATA) && PHARMACY_DATA.length > 0;
  if (hasEmbedded) {
    let list = PHARMACY_DATA;
    if (Q0) list = list.filter(p => (p.dutyAddr || '').indexOf(Q0) >= 0);
    if (Q1) list = list.filter(p => (p.dutyAddr || '').indexOf(Q1) >= 0);
    list = list.filter(p => matches(p.dutyName));
    return [...new Set(list.map(p => p.dutyName))].slice(0, 12);
  }
  return [];
}

function initPharmacy() {
  const sidoSelect = document.getElementById('pharmacySido');
  const sigugunSelect = document.getElementById('pharmacySigugun');
  const searchBtn = document.getElementById('searchPharmacyBtn');
  const resultsEl = document.getElementById('pharmacyResults');
  const pharmacyNameInput = document.getElementById('pharmacyName');
  const pharmacyNameSuggestions = document.getElementById('pharmacyNameSuggestions');
  if (!sidoSelect || !sigugunSelect || !searchBtn || !resultsEl) return;

  const hasEmbeddedData = typeof PHARMACY_DATA !== 'undefined' && Array.isArray(PHARMACY_DATA) && PHARMACY_DATA.length > 0;
  const pharmacyKey = (typeof DATA_GO_KR_PHARMACY_API_KEY !== 'undefined' && DATA_GO_KR_PHARMACY_API_KEY) ? DATA_GO_KR_PHARMACY_API_KEY.trim() : '';
  const commonKey = (typeof DATA_GO_KR_API_KEY !== 'undefined' && DATA_GO_KR_API_KEY) ? DATA_GO_KR_API_KEY.trim() : '';
  const hasApiKey = !!(pharmacyKey || commonKey);
  const apiNotice = document.getElementById('pharmacyApiNotice');
  if (!hasEmbeddedData && !hasApiKey && apiNotice) apiNotice.classList.remove('hidden');
  else if (apiNotice) apiNotice.classList.add('hidden');
  if (!hasEmbeddedData && !hasApiKey) {
    const nightRadio = document.querySelector('input[name="pharmacyMode"][value="night"]');
    if (nightRadio) nightRadio.checked = true;
  }

  if (typeof SIDO_SIGUGUN !== 'undefined') {
    Object.keys(SIDO_SIGUGUN).forEach(sido => {
      const opt = document.createElement('option');
      opt.value = sido;
      opt.textContent = sido;
      sidoSelect.appendChild(opt);
    });
  }

  sidoSelect.addEventListener('change', () => {
    sigugunSelect.innerHTML = '<option value="">선택</option>';
    const sigugunList = typeof SIDO_SIGUGUN !== 'undefined' ? SIDO_SIGUGUN[sidoSelect.value] : [];
    if (sigugunList && sigugunList.length) {
      sigugunList.forEach(sg => {
        const opt = document.createElement('option');
        opt.value = sg;
        opt.textContent = sg;
        sigugunSelect.appendChild(opt);
      });
    }
  });

  function getMapUrl(addr) {
    const a = (addr || '').trim();
    if (!a || a === '-') return null;
    return 'https://www.google.com/maps?q=' + encodeURIComponent(a);
  }
  function getMapEmbedHtml(addr) {
    const a = (addr || '').trim();
    if (!a || a === '-') return '';
    const q = encodeURIComponent(a);
    return '<iframe class="pharmacy-map-embed" src="https://www.google.com/maps?q=' + q + '&output=embed" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe>';
  }

  let pharmacySuggestTimeout = null;
  function showPharmacySuggestions(items) {
    if (!pharmacyNameSuggestions) return;
    if (!items || items.length === 0) {
      pharmacyNameSuggestions.classList.remove('visible');
      pharmacyNameSuggestions.innerHTML = '';
      return;
    }
    pharmacyNameSuggestions.innerHTML = items.map(name => `
      <div class="suggestion-item" data-name="${(name || '').replace(/"/g, '&quot;')}">${(name || '-').replace(/</g, '&lt;')}</div>
    `).join('');
    pharmacyNameSuggestions.classList.add('visible');
    pharmacyNameSuggestions.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const name = el.dataset.name;
        if (name && pharmacyNameInput) {
          pharmacyNameInput.value = name;
          pharmacyNameSuggestions.classList.remove('visible');
          pharmacyNameSuggestions.innerHTML = '';
        }
      });
    });
  }

  if (pharmacyNameInput && pharmacyNameSuggestions) {
    pharmacyNameInput.addEventListener('input', () => {
      clearTimeout(pharmacySuggestTimeout);
      const q = pharmacyNameInput.value.trim();
      const Q0 = sidoSelect.value.trim();
      const Q1 = sigugunSelect.value.trim();
      const mode = document.querySelector('input[name="pharmacyMode"]:checked')?.value || 'api';
      if (!q || q.length < 1) {
        pharmacyNameSuggestions.classList.remove('visible');
        pharmacyNameSuggestions.innerHTML = '';
        return;
      }
      pharmacySuggestTimeout = setTimeout(() => {
        showPharmacySuggestions(getPharmacyNameSuggestions(q, Q0, Q1, mode));
      }, 150);
    });
    pharmacyNameInput.addEventListener('focus', () => {
      const q = pharmacyNameInput.value.trim();
      if (q && q.length >= 1) {
        const mode = document.querySelector('input[name="pharmacyMode"]:checked')?.value || 'api';
        showPharmacySuggestions(getPharmacyNameSuggestions(q, sidoSelect.value.trim(), sigugunSelect.value.trim(), mode));
      } else {
        pharmacyNameSuggestions.classList.remove('visible');
      }
    });
    pharmacyNameInput.addEventListener('blur', () => setTimeout(() => pharmacyNameSuggestions.classList.remove('visible'), 200));
    pharmacyNameInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') pharmacyNameSuggestions.classList.remove('visible'); });
  }

  searchBtn.addEventListener('click', async () => {
    const Q0 = sidoSelect.value.trim();
    const Q1 = sigugunSelect.value.trim();
    const QN = pharmacyNameInput?.value.trim() || '';
    const mode = document.querySelector('input[name="pharmacyMode"]:checked')?.value || 'api';

    if (!Q0 && !QN) {
      resultsEl.innerHTML = '<p class="pharmacy-empty">시·도를 선택하거나 약국명을 입력해 주세요.</p>';
      return;
    }

    if (mode === 'night') {
      let items = filterNightPharmacies(Q0, Q1, QN);
      let usedFallback = false;
      if (items.length === 0 && (Q0 || Q1)) {
        items = filterNightPharmacies('', '', QN);
        usedFallback = items.length > 0;
      }
      if (items.length === 0) {
        resultsEl.innerHTML = '<p class="pharmacy-empty">해당 지역에 심야운영약국이 없습니다.</p>';
        return;
      }
      const cardsHtml = items.slice(0, 50).map((p, i) => {
        const addr = ((p.addr || '') + ' ' + (p.addr2 || '')).trim() || '-';
        const tel = (p.tel || '').trim() || '-';
        const hours = formatNightPharmacyHours(p);
        const mapUrl = getMapUrl(addr);
        const mapEmbed = getMapEmbedHtml(addr);
        return `
          <div class="pharmacy-card pharmacy-card-night" data-i="${i}">
            <h3 class="pharmacy-name">🌙 ${(p.name + '').replace(/</g, '&lt;')}</h3>
            <p class="pharmacy-hours"><strong>영업시간</strong> ${(hours + '').replace(/</g, '&lt;')}</p>
            <p class="pharmacy-addr">📍 ${(addr + '').replace(/</g, '&lt;')}</p>
            ${mapEmbed ? `<div class="pharmacy-map-wrap">${mapEmbed}${mapUrl ? `<a href="${mapUrl}" target="_blank" rel="noopener" class="pharmacy-map-link">🗺️ 크게 보기</a>` : ''}</div>` : ''}
            ${tel !== '-' ? `<p class="pharmacy-tel">📞 <a href="tel:${tel.replace(/\D/g, '')}">${tel}</a></p>` : ''}
          </div>
        `;
      }).join('');
      const more = items.length > 50 ? `<p class="pharmacy-more">외 ${items.length - 50}곳 (상위 50곳만 표시)</p>` : '';
      const fallbackNote = usedFallback ? '<p class="pharmacy-empty" style="padding:0.5rem 0;">※ 해당 지역에 주소가 등록된 약국이 없어, 약국명 검색 결과를 표시합니다.</p>' : '';
      resultsEl.innerHTML = fallbackNote + cardsHtml + more + '<p class="pharmacy-source-note">심야운영약국 680곳 (E-GEN·대한약사회). 방문 전 전화 확인 권장.</p>';
      return;
    }

    if (hasEmbeddedData) {
      const embeddedItems = filterPharmacyData(Q0, Q1, QN);
      if (embeddedItems.length > 0) {
        const cardsHtml = embeddedItems.slice(0, 50).map((item, i) => {
          const name = item.dutyName || '-';
          const addr = item.dutyAddr || '-';
          const tel = item.dutyTel1 || '-';
          const hours = formatAllPharmacyHours(item);
          const mapUrl = getMapUrl(addr);
          const mapEmbed = getMapEmbedHtml(addr);
          return `
            <div class="pharmacy-card" data-i="${i}">
              <h3 class="pharmacy-name">${(name + '').replace(/</g, '&lt;')}</h3>
              <p class="pharmacy-hours"><strong>영업시간</strong> ${(hours + '').replace(/</g, '&lt;')}</p>
              <p class="pharmacy-addr">📍 ${(addr + '').replace(/</g, '&lt;')}</p>
              ${mapEmbed ? `<div class="pharmacy-map-wrap">${mapEmbed}${mapUrl ? `<a href="${mapUrl}" target="_blank" rel="noopener" class="pharmacy-map-link">🗺️ 크게 보기</a>` : ''}</div>` : ''}
              ${tel !== '-' ? `<p class="pharmacy-tel">📞 <a href="tel:${tel.replace(/\D/g, '')}">${tel}</a></p>` : ''}
            </div>
          `;
        }).join('');
        const more = embeddedItems.length > 50 ? `<p class="pharmacy-more">외 ${embeddedItems.length - 50}곳 (상위 50곳만 표시)</p>` : '';
        resultsEl.innerHTML = cardsHtml + more + '<p class="pharmacy-source-note">전국 약국 ' + (PHARMACY_DATA ? PHARMACY_DATA.length.toLocaleString() : '') + '곳 (공공데이터). 방문 전 전화 확인 권장. · <a href="https://www.e-gen.or.kr/egen/search_pharmacy.do" target="_blank" rel="noopener">E-GEN 약국 찾기</a></p>';
      } else {
        resultsEl.innerHTML = '<p class="pharmacy-empty">해당 지역에 등록된 약국이 없습니다. 시·군·구를 바꾸거나 약국명으로 검색해 보세요.</p>';
      }
      return;
    }

    resultsEl.innerHTML = '<div class="loading">약국 정보를 검색 중...</div>';
    const { items, total, error } = await fetchPharmacyList({ Q0, Q1, QN, numOfRows: 30 });
    if (error) {
      if (error === 'API_KEY_REQUIRED') {
        resultsEl.innerHTML = `
          <div class="pharmacy-api-error">
            <p class="error">일반 약국 검색에는 공공데이터 API 키가 필요합니다.</p>
            <p class="pharmacy-api-hint">🌙 <strong>심야운영약국(680곳)</strong>은 API 없이 바로 사용할 수 있습니다. 위에서 "심야운영약국"을 선택한 뒤 검색해 보세요.</p>
            <p class="pharmacy-api-setup">공공데이터포털 <a href="https://www.data.go.kr" target="_blank" rel="noopener">data.go.kr</a>에서 "전국 약국 정보 조회" API 활용신청 후 인증키를 발급받아 설정하세요.</p>
          </div>
        `;
      } else {
        resultsEl.innerHTML = '<p class="error">' + (error || '').replace(/</g, '&lt;') + '</p>';
      }
      return;
    }
    if (!items || items.length === 0) {
      resultsEl.innerHTML = '<p class="pharmacy-empty">해당 지역에 검색된 약국이 없습니다.</p>';
      return;
    }
    const cardsHtml = items.map((item, i) => {
      const name = item.dutyName || item.dutyname || item.DUTYNAME || '-';
      const addr = item.dutyAddr || item.dutyaddr || item.DUTYADDR || '-';
      const tel = item.dutyTel1 || item.dutytel1 || item.DUTYTEL1 || '-';
      const hours = formatAllPharmacyHours(item);
      const mapUrl = getMapUrl(addr);
      const mapEmbed = getMapEmbedHtml(addr);
      return `
        <div class="pharmacy-card" data-i="${i}">
          <h3 class="pharmacy-name">${(name + '').replace(/</g, '&lt;')}</h3>
          <p class="pharmacy-hours"><strong>영업시간</strong> ${(hours + '').replace(/</g, '&lt;')}</p>
          <p class="pharmacy-addr">📍 ${(addr + '').replace(/</g, '&lt;')}</p>
          ${mapEmbed ? `<div class="pharmacy-map-wrap">${mapEmbed}${mapUrl ? `<a href="${mapUrl}" target="_blank" rel="noopener" class="pharmacy-map-link">🗺️ 크게 보기</a>` : ''}</div>` : ''}
          ${tel !== '-' ? `<p class="pharmacy-tel">📞 <a href="tel:${tel.replace(/\D/g, '')}">${tel}</a></p>` : ''}
        </div>
      `;
    }).join('');
    resultsEl.innerHTML = cardsHtml + '<p class="pharmacy-source-note">운영시간 변동 가능. 방문 전 약국에 전화 확인 권장. · <a href="https://www.e-gen.or.kr/egen/search_pharmacy.do" target="_blank" rel="noopener">E-GEN 약국 찾기</a></p>';
  });
}
initPharmacy();

// ========== 복약수첩 ==========
const NOTEBOOK_KEY = 'medicine_notebook';
let notebookData = {
  name: '', birth: '', blood: '', emergency: '',
  conditions: '', allergy: '', pregnancy: '',
  medications: [],
  notes: ''
};

function loadNotebook() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTEBOOK_KEY) || '{}');
    notebookData = {
      name: saved.name || '',
      birth: saved.birth || '',
      blood: saved.blood || '',
      emergency: saved.emergency || '',
      conditions: saved.conditions || '',
      allergy: saved.allergy || '',
      pregnancy: saved.pregnancy || '',
      medications: Array.isArray(saved.medications) ? saved.medications : [],
      notes: saved.notes || ''
    };
  } catch (_) {}
}

function saveNotebook() {
  localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(notebookData));
}

function getNotebookFormData() {
  return {
    name: (document.getElementById('notebookName')?.value || '').trim(),
    birth: (document.getElementById('notebookBirth')?.value || '').trim(),
    blood: (document.getElementById('notebookBlood')?.value || '').trim(),
    emergency: (document.getElementById('notebookEmergency')?.value || '').trim(),
    conditions: (document.getElementById('notebookConditions')?.value || '').trim(),
    allergy: (document.getElementById('notebookAllergy')?.value || '').trim(),
    pregnancy: (document.getElementById('notebookPregnancy')?.value || '').trim(),
    medications: notebookData.medications,
    notes: (document.getElementById('notebookNotes')?.value || '').trim()
  };
}

function setNotebookFormData(data) {
  const d = data || notebookData;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('notebookName', d.name);
  set('notebookBirth', d.birth);
  set('notebookBlood', d.blood);
  set('notebookEmergency', d.emergency);
  set('notebookConditions', d.conditions);
  set('notebookAllergy', d.allergy);
  set('notebookPregnancy', d.pregnancy);
  set('notebookNotes', d.notes);
}

function renderNotebookMedList() {
  const listEl = document.getElementById('notebookMedList');
  if (!listEl) return;
  if (notebookData.medications.length === 0) {
    listEl.innerHTML = '<p class="notebook-med-empty">등록된 약이 없습니다.</p>';
    return;
  }
  listEl.innerHTML = notebookData.medications.map((m, i) => `
    <div class="notebook-med-item">
      <span class="notebook-med-name">${(m.name || '').replace(/</g, '&lt;')}</span>
      ${(m.dosage || '') ? `<span class="notebook-med-dosage">${(m.dosage || '').replace(/</g, '&lt;')}</span>` : ''}
      <button type="button" class="notebook-med-remove" data-i="${i}">×</button>
    </div>
  `).join('');
  listEl.querySelectorAll('.notebook-med-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      notebookData.medications.splice(parseInt(btn.dataset.i), 1);
      renderNotebookMedList();
    });
  });
}

function notebookToViewerUrl(data) {
  const d = data || getNotebookFormData();
  const payload = JSON.stringify({
    name: d.name, birth: d.birth, blood: d.blood, emergency: d.emergency,
    conditions: d.conditions, allergy: d.allergy, pregnancy: d.pregnancy,
    medications: d.medications || [],
    notes: d.notes,
    updatedAt: new Date().toISOString()
  });
  const base64 = btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, '-').replace(/\//g, '_');
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  return base + 'notebook-view.html#' + base64;
}

function initNotebook() {
  loadNotebook();
  const nameEl = document.getElementById('notebookName');
  const syncProfileBtn = document.getElementById('notebookSyncProfile');
  const syncMedsBtn = document.getElementById('notebookSyncMeds');
  const medInput = document.getElementById('notebookMedInput');
  const medDosage = document.getElementById('notebookMedDosage');
  const addMedBtn = document.getElementById('notebookAddMed');
  const saveBtn = document.getElementById('notebookSaveBtn');
  const qrBtn = document.getElementById('notebookQrBtn');
  const qrSection = document.getElementById('notebookQrSection');
  const qrWrap = document.getElementById('notebookQrWrap');
  const qrDownloadBtn = document.getElementById('notebookQrDownload');
  const qrPreviewBtn = document.getElementById('notebookQrPreview');

  if (!nameEl) return;

  setNotebookFormData();
  renderNotebookMedList();

  addMedBtn?.addEventListener('click', () => {
    const name = (medInput?.value || '').trim();
    if (!name) return;
    const dosage = (medDosage?.value || '').trim();
    notebookData.medications.push({ name, dosage });
    renderNotebookMedList();
    if (medInput) medInput.value = '';
    if (medDosage) medDosage.value = '';
  });

  saveBtn?.addEventListener('click', () => {
    notebookData = { ...notebookData, ...getNotebookFormData() };
    saveNotebook();
    alert('복약수첩이 저장되었습니다.');
  });

  qrBtn?.addEventListener('click', async () => {
    notebookData = { ...notebookData, ...getNotebookFormData() };
    saveNotebook();
    const viewerUrl = notebookToViewerUrl(notebookData);
    qrWrap.innerHTML = '<p class="loading">QR 코드 생성 중...</p>';
    qrSection?.classList.remove('hidden');
    const showQr = () => {
      const apiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=' + encodeURIComponent(viewerUrl);
      const img = document.createElement('img');
      img.src = apiUrl;
      img.alt = '복약수첩 QR코드';
      img.onerror = () => { qrWrap.innerHTML = '<p class="warning">QR 코드 생성에 실패했습니다. 네트워크를 확인해 주세요.</p>'; };
      qrWrap.innerHTML = '';
      qrWrap.appendChild(img);
    };
    try {
      if (typeof QRCode !== 'undefined') {
        qrWrap.innerHTML = '';
        new QRCode(qrWrap, { text: viewerUrl, width: 256, height: 256 });
        if (!qrWrap.querySelector('canvas') && !qrWrap.querySelector('img')) showQr();
      } else {
        showQr();
      }
    } catch (e) {
      showQr();
    }
  });

  qrPreviewBtn?.addEventListener('click', () => {
    const viewerUrl = notebookToViewerUrl(notebookData);
    window.open(viewerUrl, '_blank');
  });

  qrDownloadBtn?.addEventListener('click', async () => {
    const canvas = qrWrap.querySelector('canvas');
    const img = qrWrap.querySelector('img');
    let dataUrl = '';
    if (canvas) dataUrl = canvas.toDataURL('image/png');
    else if (img?.src && img.src.startsWith('data:')) dataUrl = img.src;
    if (dataUrl) {
      const link = document.createElement('a');
      link.download = '복약수첩-QR코드.png';
      link.href = dataUrl;
      link.click();
    } else {
      const viewerUrl = notebookToViewerUrl(notebookData);
      const apiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=' + encodeURIComponent(viewerUrl);
      try {
        const res = await fetch(apiUrl);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = '복약수첩-QR코드.png';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      } catch (_) {
        window.open(apiUrl, '_blank');
      }
    }
  });

  document.querySelector('[data-view="notebook"]')?.addEventListener('click', () => {
    loadNotebook();
    setNotebookFormData();
    renderNotebookMedList();
  });
}

// 초기 URL에 따라 화면 복원 (뒤로가기 지원)
if (!location.hash || location.hash === '#') {
  replaceRoute('search');
}
initRoute();
initNotebook();
