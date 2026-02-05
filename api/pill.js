/**
 * 공공데이터포털 - 식품의약품안전처_의약품 낱알식별정보 API
 * https://www.data.go.kr/data/15057639/openapi.do
 * getMdcinGrnIdntfcInfoList03
 */
require('dotenv').config();

const API_URL = 'https://apis.data.go.kr/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03';

// 모양 매핑 (앱 → API 검색용 한글, API 반환값: DRUG_SHAPE)
const SHAPE_TO_KR = {
  round: ['원형', '원', '정'],
  oval: ['타원형', '타원', '장타원'],
  capsule: ['캡슐', '캡슐형', '경질캡슐', '연질캡슐'],
  rectangle: ['사각형', '장방형', '방형', '장형', '직사각'],
  diamond: ['다이아몬드', '마름모', '菱形'],
  hexagon: ['육각형', '6각'],
  octagon: ['팔각형', '8각'],
  triangle: ['삼각형', '3각'],
};
// 특정 모양 검색 시 제외할 키워드 (예: 원형 검색 시 타원형 제외)
const SHAPE_EXCLUDE = {
  round: ['타원'],   // 원형만: 타원형 제외
  oval: [],          // 타원형은 별도 제외 없음
  rectangle: ['삼각', '육각', '팔각'], // 사각형만
  hexagon: ['팔각'],
  octagon: ['육각'],
};

// 색상 매핑 (API가 '흰', '연한노랑' 등 다양하게 반환)
const COLOR_TO_KR = {
  white: ['흰색', '백색', '흰', 'white', '하양', '백'],
  yellow: ['노란색', '황색', '노랑', '황', 'yellow', '연한노랑', '진한노랑'],
  orange: ['주황색', '등색', '주황', 'orange', '등', '오렌지'],
  red: ['빨간색', '적색', '빨강', '적', 'red', '홍', '연한빨강', '진한빨강'],
  pink: ['분홍색', '홍색', '분홍', 'pink', '연분홍', '진분홍'],
  blue: ['파란색', '청색', '파랑', '청', 'blue', '연한파랑', '진한파랑'],
  green: ['초록색', '녹색', '초록', '녹', 'green', '연한초록', '진한초록'],
  brown: ['갈색', 'brown', '갈', '연갈', '진갈'],
  gray: ['회색', '회', 'gray', '그레이', '연한회색', '진한회색'],
};

function matchesShape(apiShape, ourShape) {
  if (!ourShape) return true;
  const s = (apiShape || '').replace(/\s/g, '').toLowerCase();
  // 제외 키워드가 있으면 매칭 안 함 (원형 vs 타원형 구분)
  const exclude = SHAPE_EXCLUDE[ourShape];
  if (exclude && exclude.some(ex => s.includes(ex.toLowerCase()))) return false;
  const krs = SHAPE_TO_KR[ourShape];
  if (!krs) return true;
  return krs.some(k => s.includes(k.toLowerCase().replace(/\s/g, '')));
}

function matchesColor(apiColor, ourColor) {
  if (!ourColor) return true;
  const krs = COLOR_TO_KR[ourColor];
  if (!krs) return true;
  const c = (apiColor || '').replace(/\s/g, '').toLowerCase(); // 공백 제거
  return krs.some(k => c.includes(k.toLowerCase().replace(/\s/g, '')));
}

function normalizeForImprint(s) {
  return (s || '').toString().replace(/[\s\-\.\_]/g, '').toUpperCase();
}

function matchesImprint(apiPrint, imprint) {
  if (!imprint || !imprint.trim()) return true;
  const search = imprint.trim().toUpperCase();
  const searchNorm = normalizeForImprint(imprint);
  const front = (apiPrint?.print_front || '').toString();
  const back = (apiPrint?.print_back || '').toString();
  const frontNorm = normalizeForImprint(front);
  const backNorm = normalizeForImprint(back);
  return front.toUpperCase().includes(search) || back.toUpperCase().includes(search)
    || frontNorm.includes(searchNorm) || backNorm.includes(searchNorm);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let apiKey = (process.env.DATA_GO_KR_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({ error: '공공데이터 API 키가 설정되지 않았습니다. .env에 DATA_GO_KR_KEY를 설정해 주세요.' });
  }
  // 줄바꿈·쌍따옴표 제거 (복사 시 혼입 방지)
  apiKey = apiKey.replace(/[\r\n"']/g, '');
  // Encoding 키(% 포함): 그대로 URL에 사용. Decoding 키(+,=): URLSearchParams가 인코딩함.
  const isEncodingKey = apiKey.includes('%');

  const shape = (req.query.shape || '').trim();
  const color = (req.query.color || '').trim();
  const imprint = (req.query.imprint || '').trim();

  if (!shape && !color && !imprint) {
    return res.status(400).json({ error: '모양, 색상, 각인 중 하나 이상을 입력해 주세요.' });
  }

  try {
    const allItems = [];
    let pageNo = 1;
    const numOfRows = 100;
    let hasMore = true;

    while (hasMore) {
      let url;
      if (isEncodingKey) {
        const other = new URLSearchParams({ numOfRows: String(numOfRows), pageNo: String(pageNo), type: 'json' }).toString();
        url = `${API_URL}?serviceKey=${apiKey}&${other}`;
      } else {
        const params = new URLSearchParams({ serviceKey: apiKey, numOfRows: String(numOfRows), pageNo: String(pageNo), type: 'json' });
        url = `${API_URL}?${params.toString()}`;
      }
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) medicine-recommend/1.0' },
      });

      if (!r.ok) {
        const text = await r.text();
        console.error('공공데이터 API 오류:', r.status, text.slice(0, 500));
        return res.status(502).json({
          error: `공공데이터 API 요청 실패(${r.status}). 공공데이터포털 마이페이지에서 '일반 인증키(Encoding)' 또는 '일반 인증키(Decoding)'를 복사해 .env에 넣어 보세요. 활용신청 승인 여부도 확인하세요.`,
        });
      }

      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('공공데이터 API 응답 파싱 오류:', parseErr.message, text.slice(0, 300));
        return res.status(502).json({ error: '공공데이터 API 응답 형식 오류. 잠시 후 다시 시도해 주세요.' });
      }
      // API가 200이지만 body에 에러인 경우 (인증키 오류 등)
      const errMsg = data?.response?.header?.resultMsg || data?.header?.resultMsg || data?.resultMsg;
      const errCode = data?.response?.header?.resultCode || data?.header?.resultCode || data?.resultCode;
      if (errCode && String(errCode) !== '00' && String(errCode) !== '0') {
        console.error('공공데이터 API 응답 오류:', errCode, errMsg);
        return res.status(502).json({
          error: errMsg || '공공데이터 API 오류. 인증키(일반 인증키 Decoding)와 활용신청을 확인해 주세요.',
        });
      }
      const body = data?.response?.body || data?.body || {};
      let items = body.items;

      // API 응답: body.items.item (단일=객체, 복수=배열)
      if (items && typeof items === 'object' && 'item' in items) {
        items = items.item;
      }
      if (!items) items = [];
      if (!Array.isArray(items)) items = [items];

      // API 필드: ITEM_NAME, DRUG_SHAPE, COLOR_CLASS1, COLOR_CLASS2, PRINT_FRONT, PRINT_BACK, CLASS_NAME, ETC_OTC_NAME
      const itemsNormalized = items.map(it => {
        const raw = it || {};
        const color1 = raw.COLOR_CLASS1 || raw.color_class1 || '';
        const color2 = raw.COLOR_CLASS2 || raw.color_class2 || '';
        const colorClass = [color1, color2].filter(Boolean).join(' ') || raw.COLOR_CLASS || raw.color_class || '';
        const itemImage = raw.ITEM_IMAGE || raw.item_image || raw.itemImage || '';
        const pf = raw.PRINT_FRONT || raw.print_front || raw.printFront || raw.MARK_CODE_FRONT || raw.mark_code_front || '';
        const pb = raw.PRINT_BACK || raw.print_back || raw.printBack || raw.MARK_CODE_BACK || raw.mark_code_back || '';
        return {
          item_name: raw.ITEM_NAME || raw.item_name || raw.itemName || '-',
          material_name: raw.CLASS_NAME || raw.class_name || raw.MATERIAL_NAME || raw.material_name || '-',
          drug_shape: raw.DRUG_SHAPE || raw.drug_shape || raw.drugShape || '',
          color_class: colorClass,
          print_front: pf,
          print_back: pb,
          etc_otc_name: raw.ETC_OTC_NAME || raw.etc_otc_name || raw.etcOtcName || '',
          item_image: (itemImage && (itemImage.startsWith('http://') || itemImage.startsWith('https://'))) ? itemImage : '',
          entp_name: raw.ENTP_NAME || raw.entp_name || '',
          item_permit_date: raw.ITEM_PERMIT_DATE || raw.item_permit_date || '',
          leng_long: raw.LENG_LONG || raw.leng_long || '',
          leng_short: raw.LENG_SHORT || raw.leng_short || '',
          thick: raw.THICK || raw.thick || '',
          form_code_name: raw.FORM_CODE_NAME || raw.form_code_name || '',
          item_seq: raw.ITEM_SEQ || raw.item_seq || '',
        };
      });

      const filtered = itemsNormalized.filter(it => {
        const shapeOk = matchesShape(it.drug_shape, shape);
        const colorOk = matchesColor(it.color_class, color);
        const imprintOk = matchesImprint({ print_front: it.print_front, print_back: it.print_back }, imprint);
        return shapeOk && colorOk && imprintOk;
      });

      allItems.push(...filtered);

      const total = body.totalCount ?? 0;
      const maxPages = imprint ? 30 : 10;
      if (items.length < numOfRows || allItems.length >= 15) {
        hasMore = false;
      } else {
        pageNo++;
        if (pageNo > maxPages) hasMore = false;
      }
    }

    const results = allItems.slice(0, 15).map(it => ({
      name: it.item_name,
      ingredient: it.material_name,
      shape_kr: it.drug_shape,
      color_kr: it.color_class,
      imprint: [it.print_front, it.print_back].filter(Boolean).join(' / '),
      type: it.etc_otc_name,
      image: it.item_image || '',
      entp_name: it.entp_name || '',
      item_permit_date: it.item_permit_date || '',
      leng_long: it.leng_long || '',
      leng_short: it.leng_short || '',
      thick: it.thick || '',
      form_code_name: it.form_code_name || '',
      item_seq: it.item_seq || '',
    }));

    res.json(results);
  } catch (err) {
    console.error('알약 식별 API 오류:', err);
    res.status(500).json({ error: err.message || '알약 식별 조회 중 오류가 발생했습니다.' });
  }
};
