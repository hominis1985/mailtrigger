const { GoogleGenerativeAI } = require('@google/generative-ai');

const KEYWORDS = ['발주', '견적'];

const PROMPT = `다음 이메일을 분석해주세요.

이메일:
제목: {subject}
보낸 사람: {sender}
본문:
{body}
{attachment_section}
다음 세 가지 작업을 수행해주세요:

1. 카테고리 분류: 반드시 아래 3가지 중 하나로 분류하세요:
   - 발주서: 제품/서비스 구매 주문 요청 메일
   - 견적서: 제품/서비스 가격 견적을 보내온 메일
   - 견적의뢰서: 제품/서비스 가격 견적을 요청하는 메일

2. 한국어 요약: 이메일 핵심 내용을 2-3문장으로 요약

3. 품목 정보: 본문과 첨부파일에서 품목명, 수량, 단가, 납기일 등 핵심 정보를 추출

응답 형식 (정확히 이 형식을 따르세요):
CATEGORY: [카테고리명]
SUMMARY: [한국어 요약]
PRODUCTS: [품목 정보]`;

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

function parseCategory(text) {
  if (text.includes('발주')) return '발주서';
  if (text.includes('견적의뢰')) return '견적의뢰서';
  if (text.includes('견적')) return '견적서';
  return '발주서';
}

function parseResponse(text) {
  const lines = text.split('\n');
  let category = null, summary = null, products = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('CATEGORY:')) {
      category = parseCategory(line.replace('CATEGORY:', '').trim());
    } else if (line.startsWith('SUMMARY:')) {
      const parts = [line.replace('SUMMARY:', '').trim()];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('CATEGORY:') || lines[j].startsWith('PRODUCTS:')) break;
        parts.push(lines[j]);
      }
      summary = parts.filter(Boolean).join(' ').trim() || null;
    } else if (line.startsWith('PRODUCTS:')) {
      const parts = [line.replace('PRODUCTS:', '').trim()];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith('CATEGORY:') || lines[j].startsWith('SUMMARY:')) break;
        parts.push(lines[j]);
      }
      const prod = parts.filter(Boolean).join(' ').trim();
      products = (prod && !['해당없음', '해당 없음', '-'].includes(prod)) ? prod : null;
    }
  }

  return { category: category || '발주서', summary, products };
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
