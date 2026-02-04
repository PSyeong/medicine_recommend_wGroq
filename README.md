# 의약품 정보 웹사이트 (Pharma Info)

의약품 검색, 약물 상호작용 검사, 알약 식별, 내 복용약 관리 기능을 제공하는 웹 애플리케이션입니다.

## 기능

- **의약품 검색**: OpenFDA API를 활용한 의약품 검색 (상품명, 성분명)
- **상세 정보**: 효능·효과, 용법·용량, 주의사항, 부작용, 금기, 약물 상호작용, 임신·수유 정보
- **약물 상호작용 검사**: 복용 중인 약 2개 이상 입력 시 상호작용 가능성 검사
- **알약 식별**: 모양, 색상, 각인(문자/숫자)으로 알약 검색
- **내 복용약**: 로컬 저장소에 복용 약 목록 저장, 알레르기·상호작용 검사 연동
- **💬 LLM 챗봇**: 우측 하단 챗봇으로 의약품 관련 질문 (Groq 연동, 무료)

## 실행 방법

### 1) 기본 실행 (LLM 없이, 모의 응답만)

```bash
python -m http.server 8080
# 또는
npx serve .
```

브라우저에서 접속. 챗봇은 기본 규칙 기반 응답만 제공합니다.

### 2) LLM 챗봇 포함 실행 (Groq, 무료)

```bash
npm install
cp .env.example .env
# .env에서 GROQ_API_KEY 설정 (console.groq.com에서 무료 발급)
npm start
```

브라우저에서 `http://localhost:3001` 접속. 챗봇이 Groq를 사용합니다.

### 3) Vercel 배포

```bash
# Vercel CLI 설치 (최초 1회)
npm i -g vercel

# 배포
vercel
```

또는 [vercel.com](https://vercel.com)에서 GitHub 저장소 연결 후 자동 배포.

**환경 변수 설정 (필수):** Vercel 대시보드 → 프로젝트 → Settings → Environment Variables
- `GROQ_API_KEY`: Groq API 키

## 기술 스택

- HTML5, CSS3, Vanilla JavaScript
- OpenFDA Drug Label API
- localStorage (내 복용약 저장)

## 주의사항

본 정보는 참고용이며, 의료 상담을 대체하지 않습니다. 약물 복용 관련 결정은 반드시 의사 또는 약사와 상담하세요.
