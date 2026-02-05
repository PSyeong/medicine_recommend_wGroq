/**
 * 공공데이터 API 키 테스트
 * 터미널에서 실행: node test-pill-api.js
 * .env의 DATA_GO_KR_KEY가 올바른지 확인합니다.
 */
require('dotenv').config();

const API_URL = 'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03';

let apiKey = (process.env.DATA_GO_KR_KEY || '').trim().replace(/[\r\n"']/g, '');
if (!apiKey) {
  console.error('❌ .env에 DATA_GO_KR_KEY가 없습니다.');
  process.exit(1);
}

const isEncoding = apiKey.includes('%');
console.log('키 종류:', isEncoding ? 'Encoding' : 'Decoding');
console.log('키 길이:', apiKey.length, '| 앞4자:', apiKey.slice(0, 4) + '...', '| 뒤4자:', '...' + apiKey.slice(-4));

const params = isEncoding
  ? `serviceKey=${apiKey}&numOfRows=1&pageNo=1&type=json`
  : new URLSearchParams({ serviceKey: apiKey, numOfRows: '1', pageNo: '1', type: 'json' }).toString();

const url = `${API_URL}?${params}`;

(async () => {
  try {
    const r = await fetch(url);
    const text = await r.text();
    console.log('\nHTTP 상태:', r.status, r.statusText);
    if (!r.ok) {
      console.log('응답 본문 (일부):', text.slice(0, 500));
      console.log('\n※ 403이면: 1) 활용신청 승인 대기 2) 인증키가 이 API용인지 확인');
      console.log('   공공데이터포털 → 마이페이지 → 활용신청현황 → "의약품 낱알식별정보" 포함 확인');
      process.exit(1);
    }
    const data = JSON.parse(text);
    const errCode = data?.response?.header?.resultCode;
    const errMsg = data?.response?.header?.resultMsg;
    if (errCode && errCode !== '00' && errCode !== '0') {
      console.log('API 에러:', errCode, errMsg);
      process.exit(1);
    }
    const items = data?.response?.body?.items || data?.body?.items;
    const total = data?.response?.body?.totalCount ?? data?.body?.totalCount ?? 0;
    console.log('✅ 성공! totalCount:', total);
    if (items && (Array.isArray(items) ? items.length : 1)) {
      const first = Array.isArray(items) ? items[0] : items;
      console.log('샘플:', first?.ITEM_NAME || first?.item_name || first);
    }
  } catch (e) {
    console.error('오류:', e.message);
    process.exit(1);
  }
})();
