const { GoogleGenerativeAI } = require('@google/generative-ai');

const KEYWORDS = ['발주', '견적'];

const PROMPT = `다음 이메일을 분석하여 아래 JSON 형식으로만 응답하세요. JSON 외에 다른 텍스트는 절대 출력하지 마세요.

이메일:
제목: {subject}
보낸 사람: {sender}
본문:
{body}
{attachment_section}

응답 JSON 형식 (필드가 없으면 null):
{
  "category": "발주서 또는 견적서 또는 견적의뢰서",
  "summary": "2-3문장 한국어 요약",
  "table": {
    "거래처": "발주처 또는 견적처 회사명/담당자",
    "문서번호": "발주번호 또는 견적번호",
    "날짜": "문서 날짜",
    "납기": "납기일 또는 납품 요청일",
    "합계": "총 금액",
    "비고": "특이사항",
    "items": [
      {
        "제품명": "제품 또는 품목명",
        "규격": "규격 또는 사양",
        "수량": "수량",
        "단가": "단가",
        "금액": "금액"
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
  if (!text) return '발주서';
  if (text.includes('발주')) return '발주서';
  if (text.includes('견적의뢰') || text.includes('견적 의뢰')) return '견적의뢰서';
  if (text.includes('견적')) return '견적서';
  return '발주서';
}

function parseResponse(text) {
  try {
    // Strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const data = JSON.parse(jsonMatch[0]);
    return {
      category: normalizeCategory(data.category || ''),
      summary: data.summary || null,
      table: data.table || null,
    };
  } catch (e) {
    console.error('parseResponse error:', e.message, '\nRaw:', text.slice(0, 200));
    return { category: '발주서', summary: null, table: null };
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
