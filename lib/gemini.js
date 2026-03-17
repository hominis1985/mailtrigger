const { GoogleGenerativeAI } = require('@google/generative-ai');

// Light pre-filter — cast wide net; AI does the real classification
const KEYWORDS = ['발주', '견적', '주문', 'order', 'quote', 'rfq', 'p.o.', 'po#', '단가', '납기', '수량', '품목'];

const PROMPT = `당신은 B2B 비즈니스 이메일 분류 전문가입니다. 다음 이메일이 아래 3가지 문서 유형 중 하나인지 엄격하게 판단하세요.

【분류 기준】
- 발주서: 구매자가 공급자에게 특정 제품/서비스의 구매를 확정하는 주문 문서. 품목·수량·납기가 명시됨.
- 견적서: 공급자가 구매자에게 제품/서비스의 가격과 조건을 제시하는 문서. 단가·금액 정보 포함.
- 견적의뢰서: 구매자가 공급자에게 가격·조건 견적을 요청하는 문서. 품목·수량 등 견적 요청 내용 포함.
- 없음: 위 3가지에 해당하지 않는 모든 메일.

【중요 — 엄격 적용】 관련 단어가 있어도 실제 문서가 아니면 반드시 "없음"으로 분류하세요.
예) "발주 관련 문의드립니다" → 없음
예) "견적서 잘 받았습니다 감사합니다" → 없음
예) "이전 발주 건 배송 문의" → 없음

이메일:
제목: {subject}
보낸 사람: {sender}
본문:
{body}
{attachment_section}
아래 JSON 형식으로만 응답하세요 (다른 텍스트 없이, null 필드는 null로):
{
  "category": "발주서 또는 견적서 또는 견적의뢰서 또는 없음",
  "reason": "분류 근거 한 줄",
  "summary": "없음이면 null, 아니면 2-3문장 한국어 요약",
  "table": {
    "거래처": "회사명/담당자 또는 null",
    "문서번호": "번호 또는 null",
    "날짜": "날짜 또는 null",
    "납기": "납기일 또는 null",
    "합계": "총금액 또는 null",
    "비고": "특이사항 또는 null",
    "items": [
      {
        "제품명": "품목명",
        "규격": "규격/사양 또는 null",
        "수량": "수량 또는 null",
        "단가": "단가 또는 null",
        "금액": "금액 또는 null"
      }
    ]
  }
}`;

function containsKeywords(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return KEYWORDS.some(kw => lower.includes(kw));
}

function hasKeywords(email) {
  return containsKeywords(email.subject) ||
         containsKeywords(email.snippet) ||
         containsKeywords(email.body_text || '');
}

function truncate(text, max = 3000) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function normalizeCategory(text) {
  if (!text) return null;
  if (text.includes('없음') || text.toLowerCase().includes('none')) return null;
  if (text.includes('발주')) return '발주서';
  if (text.includes('견적의뢰') || text.includes('견적 의뢰')) return '견적의뢰서';
  if (text.includes('견적')) return '견적서';
  return null; // unrecognized → discard
}

function parseResponse(text) {
  try {
    const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const data = JSON.parse(jsonMatch[0]);
    const category = normalizeCategory(data.category || '');

    return {
      category,                             // null means discard
      summary: category ? (data.summary || null) : null,
      table: category ? (data.table || null) : null,
      reason: data.reason || '',            // for server-side debug logging
    };
  } catch (e) {
    console.error('parseResponse error:', e.message, '\nRaw:', text.slice(0, 300));
    return { category: null, summary: null, table: null, reason: 'parse error' };
  }
}

async function classifyEmail(email, attachmentTexts, apiKey, model = 'gemini-2.5-flash-lite') {
  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({ model });

  const sender = `${email.sender.name || ''} <${email.sender.email}>`;
  const body = truncate(email.body_text || email.snippet, 2500);

  let attachSection = '';
  if (attachmentTexts && attachmentTexts.length > 0) {
    const parts = attachmentTexts.map(([fn, txt]) => `[첨부파일: ${fn}]\n${truncate(txt, 1500)}`);
    attachSection = '\n첨부파일 내용:\n' + parts.join('\n\n') + '\n';
  }

  const prompt = PROMPT
    .replace('{subject}', email.subject)
    .replace('{sender}', sender)
    .replace('{body}', body)
    .replace('{attachment_section}', attachSection);

  const result = await geminiModel.generateContent(prompt);
  return parseResponse(result.response.text());
}

async function testApiKey(apiKey, model = 'gemini-2.5-flash-lite') {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    await genAI.getGenerativeModel({ model }).generateContent('Say OK');
    return { valid: true, message: 'API key is valid' };
  } catch (e) {
    return { valid: false, message: e.message };
  }
}

module.exports = { hasKeywords, containsKeywords, classifyEmail, testApiKey, KEYWORDS };
