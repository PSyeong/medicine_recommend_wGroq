const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const CSV_PATH = path.join(__dirname, 'medicine_data_final_updated.csv');
let medicineData = [];

function loadCSV() {
  try {
    const content = fs.readFileSync(CSV_PATH, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
    medicineData = records.filter(r => r['분류명'] && r['품목명']);
    console.log(`✅ 의약품 데이터 로드: ${medicineData.length}건`);
    return medicineData.length;
  } catch (err) {
    console.warn('⚠️ 의약품 CSV 로드 실패:', err.message);
    return 0;
  }
}

function searchMedicine(query, limit = 15) {
  if (medicineData.length === 0) return [];
  const q = (query || '').trim().toLowerCase();
  if (!q || q.length < 1) return [];

  const terms = q.split(/\s+/).filter(t => t.length >= 1);
  const results = [];

  const ingKey = '주성분_x';
  const effKey = '이 약의 효능은 무엇입니까?';
  for (const row of medicineData) {
    const 품목명 = (row['품목명'] || '').toLowerCase();
    const 분류명 = (row['분류명'] || '').toLowerCase();
    const 주성분 = (row[ingKey] || row['주성분'] || '').toLowerCase();
    const 효능 = (row[effKey] || '').toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (품목명.includes(term)) score += 4;
      if (분류명.includes(term)) score += 3;
      if (효능.includes(term)) score += 3;
      if (주성분.includes(term)) score += 1;
    }
    if (score > 0) {
      results.push({ ...row, _score: score });
    }
  }

  results.sort((a, b) => b._score - a._score);
  return results.slice(0, limit).map(({ _score, ...r }) => r);
}

function getIngredient(row) {
  return row['주성분_x'] || row['주성분'] || '-';
}

function truncate(s, max = 400) {
  if (!s || s.length <= max) return s;
  return s.substring(0, max) + '...';
}

function formatForContext(rows) {
  if (rows.length === 0) return '';
  return rows.map((r, i) => {
    const parts = [`[의약품 ${i + 1}]`];
    parts.push(`품목명: ${r['품목명'] || '-'}`);
    parts.push(`분류명: ${r['분류명'] || '-'}`);
    const eff = truncate(r['이 약의 효능은 무엇입니까?'] || '');
    if (eff) parts.push(`이 약의 효능은 무엇입니까?: ${eff}`);
    const before = truncate(r['이 약을 사용하기 전에 반드시 알아야 할 내용은 무엇입니가?'] || r['이 약을 사용하기 전에 반드시 알아야 할 내용은 무엇입니까?'] || '');
    if (before) parts.push(`이 약을 사용하기 전에 반드시 알아야 할 내용: ${before}`);
    const caution = truncate(r['이 약의 사용상 주의사항은 무엇입니까?'] || '');
    if (caution) parts.push(`이 약의 사용상 주의사항: ${caution}`);
    const interact = truncate(r['이 약을 사용하는 동안 주의해야 할 약 또는 음식은 무엇입니까?'] || '');
    if (interact) parts.push(`주의해야 할 약 또는 음식: ${interact}`);
    return parts.join('\n');
  }).join('\n\n');
}

module.exports = { loadCSV, searchMedicine, formatForContext };
