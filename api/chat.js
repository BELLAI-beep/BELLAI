// ═══════════════════════════════════════════════
// BELLAI Backend — api/chat.js  v8
// 자동 최신 모델 감지 + 스마트 라우팅 + 토론 모드
// Gemini 제거됨
// ═══════════════════════════════════════════════

const SYSTEM = `당신의 이름은 BELLAI입니다. 친절하고 유능한 AI 어시스턴트로, 한국어로 대화합니다. 전문적이면서도 친근한 톤을 유지합니다.`;

// ── 모델 캐시 (24시간 유지) ──
let modelCache = {
  models: {
    claude:   'claude-sonnet-latest',
    gpt:      'gpt-4o',
    deepseek: 'deepseek-chat',
    groq:     'llama-3.3-70b-versatile',
    grok:     'grok-latest',
  },
  lastChecked: 0,
};
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

// ── GPT 최신 모델 우선순위 ──
const GPT_PRIORITY = [
  'gpt-5','gpt-4.5','gpt-4o-latest','gpt-4o-2025',
  'gpt-4o-2024','gpt-4o','gpt-4-turbo','gpt-4',
];

// ── Groq 최신 모델 우선순위 ──
const GROQ_PRIORITY = [
  'llama-4','llama3-70b','llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile','mixtral-8x7b-32768',
];

// ── Grok 최신 모델 우선순위 ──
const GROK_PRIORITY = [
  'grok-4','grok-3','grok-2','grok-latest',
];

// ── DeepSeek 최신 모델 우선순위 ──
const DEEPSEEK_PRIORITY = [
  'deepseek-r2','deepseek-v3','deepseek-chat','deepseek-reasoner',
];

// ════════════════════════════════════════════════
// 자동 모델 감지
// ════════════════════════════════════════════════
async function detectLatestModels() {
  const now = Date.now();
  if (now - modelCache.lastChecked < CACHE_TTL) return modelCache.models;

  console.log('[BELLAI] 최신 모델 감지 시작...');
  const updated = { ...modelCache.models };

  // GPT 최신 모델 감지
  if (process.env.GPT_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.GPT_API_KEY}` },
      });
      const data = await res.json();
      if (data.data) {
        const ids = data.data.map(m => m.id);
        for (const preferred of GPT_PRIORITY) {
          const match = ids.find(id => id.startsWith(preferred));
          if (match) { updated.gpt = match; console.log(`[BELLAI] GPT 최신: ${match}`); break; }
        }
      }
    } catch (e) { console.log('[BELLAI] GPT 모델 감지 실패, 기본값 유지'); }
  }

  // Groq 최신 모델 감지
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      });
      const data = await res.json();
      if (data.data) {
        const ids = data.data.map(m => m.id);
        for (const preferred of GROQ_PRIORITY) {
          const match = ids.find(id => id.includes(preferred.replace('llama-','llama').replace('-versatile','')));
          if (match) { updated.groq = match; console.log(`[BELLAI] Groq 최신: ${match}`); break; }
        }
      }
    } catch (e) { console.log('[BELLAI] Groq 모델 감지 실패, 기본값 유지'); }
  }

  // Grok 최신 모델 감지
  if (process.env.GROK_API_KEY) {
    try {
      const res = await fetch('https://api.x.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.GROK_API_KEY}` },
      });
      const data = await res.json();
      if (data.data) {
        const ids = data.data.map(m => m.id);
        for (const preferred of GROK_PRIORITY) {
          const match = ids.find(id => id.startsWith(preferred.replace('-latest','')));
          if (match) { updated.grok = match; console.log(`[BELLAI] Grok 최신: ${match}`); break; }
        }
      }
    } catch (e) { console.log('[BELLAI] Grok 모델 감지 실패, 기본값 유지'); }
  }

  // DeepSeek 최신 모델 감지
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const res = await fetch('https://api.deepseek.com/v1/models', {
        headers: { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      });
      const data = await res.json();
      if (data.data) {
        const ids = data.data.map(m => m.id);
        for (const preferred of DEEPSEEK_PRIORITY) {
          if (ids.includes(preferred)) { updated.deepseek = preferred; console.log(`[BELLAI] DeepSeek 최신: ${preferred}`); break; }
        }
      }
    } catch (e) { console.log('[BELLAI] DeepSeek 모델 감지 실패, 기본값 유지'); }
  }

  modelCache = { models: updated, lastChecked: now };
  console.log('[BELLAI] 현재 모델:', updated);
  return updated;
}

// ── 스마트 라우팅 ──
function smartRoute(question, availableAIs) {
  const q = (question || '').toLowerCase();
  const RULES = [
    { keywords: ['코드','코딩','프로그래밍','javascript','python','java','sql','버그','function','class','개발','script'], ai: 'gpt' },
    { keywords: ['최신','뉴스','오늘','지금','현재','트렌드','2025','2026','실시간','날씨','주가'], ai: 'grok' },
    { keywords: ['수학','계산','공식','방정식','논리','증명','통계','알고리즘','확률'], ai: 'deepseek' },
    { keywords: ['빠르게','간단히','한줄','요약만','짧게','간단하게'], ai: 'groq' },
    { keywords: ['보고서','분석','전략','기획','인력','배치','운영','계획','한국어','문서'], ai: 'claude' },
  ];
  for (const rule of RULES) {
    if (rule.keywords.some(k => q.includes(k)) && availableAIs.includes(rule.ai)) return rule.ai;
  }
  return availableAIs[0];
}

// ════════════════════════════════════════════════
// AI 호출 함수들
// ════════════════════════════════════════════════

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return (content.find(b => b.type === 'text') || { text: '' }).text;
  return '';
}

async function callClaude(messages, models, useSearch = false) {
  const key = process.env.CLAUDE_API_KEY;
  if (!key) throw new Error('Claude API 키 미설정');
  const body = { model: models.claude, max_tokens: 1500, system: SYSTEM, messages };
  if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  const text = d.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { text, searched: useSearch && d.content.some(b => b.type === 'tool_use') };
}

async function callGPT(messages, models) {
  const key = process.env.GPT_API_KEY;
  if (!key) throw new Error('GPT API 키 미설정');
  const msgs = [{ role: 'system', content: SYSTEM }, ...messages.map(m => ({ role: m.role, content: extractText(m.content) }))];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: models.gpt, messages: msgs, max_tokens: 1500 }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return { text: d.choices[0].message.content, searched: false };
}

async function callOpenAICompat(messages, model, baseURL, key) {
  const msgs = [{ role: 'system', content: SYSTEM }, ...messages.map(m => ({ role: m.role, content: extractText(m.content) }))];
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model, messages: msgs, max_tokens: 1500 }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.choices[0].message.content, searched: false };
}

async function callAI(aiId, messages, models, useSearch = false) {
  switch (aiId) {
    case 'claude':   return callClaude(messages, models, useSearch);
    case 'gpt':      return callGPT(messages, models);
    case 'deepseek': return callOpenAICompat(messages, models.deepseek, 'https://api.deepseek.com/v1', process.env.DEEPSEEK_API_KEY);
    case 'groq':     return callOpenAICompat(messages, models.groq, 'https://api.groq.com/openai/v1', process.env.GROQ_API_KEY);
    case 'grok':     return callOpenAICompat(messages, models.grok, 'https://api.x.ai/v1', process.env.GROK_API_KEY);
    default: throw new Error(`알 수 없는 AI: ${aiId}`);
  }
}

function getAvailableAIs() {
  return Object.entries({
    claude:   'CLAUDE_API_KEY',
    gpt:      'GPT_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    groq:     'GROQ_API_KEY',
    grok:     'GROK_API_KEY',
  }).filter(([, env]) => process.env[env]).map(([id]) => id);
}

// ════════════════════════════════════════════════
// 메인 핸들러
// ════════════════════════════════════════════════
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 자동 최신 모델 감지 (24시간 캐시)
  const models = await detectLatestModels();
  const available = getAvailableAIs();

  // 상태 조회
  if (req.method === 'GET') {
    return res.json({
      available,
      models: Object.fromEntries(available.map(id => [id, models[id]])),
      lastChecked: new Date(modelCache.lastChecked).toISOString(),
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!available.length) return res.status(400).json({ error: '연결된 AI가 없습니다.' });

  try {
    const { mode, messages, aiId, activeAIs, useSearch, question } = req.body;
    const validAIs = (activeAIs || available).filter(id => available.includes(id));

    // ── 단일 모드 ──
    if (mode === 'single') {
      const selectedAI = aiId || smartRoute(question, validAIs);
      const result = await callAI(selectedAI, messages, models, useSearch && selectedAI === 'claude');
      return res.json({ mode:'single', ai:selectedAI, model:models[selectedAI], text:result.text, searched:result.searched });
    }

    // ── 토론 모드 ──
    if (mode === 'debate') {
      if (validAIs.length < 2) {
        const result = await callAI(validAIs[0], messages, models, useSearch);
        return res.json({ mode:'single', ai:validAIs[0], model:models[validAIs[0]], text:result.text, searched:result.searched });
      }

      // 1단계: 병렬 독립 답변
      const round1 = await Promise.all(
        validAIs.map(async id => {
          try {
            const r = await callAI(id, messages, models, useSearch && id === 'claude');
            return { ai:id, model:models[id], text:r.text, ok:true };
          } catch(e) {
            return { ai:id, model:models[id], text:`오류: ${e.message}`, ok:false };
          }
        })
      );
      const validR1 = round1.filter(r => r.ok);

      // 2단계: 병렬 상호 검토
      let round2 = [];
      if (validR1.length > 1) {
        const othersText = validR1.map(r => `[${r.ai}]\n${r.text}`).join('\n\n');
        round2 = await Promise.all(
          validR1.map(async r => {
            const prompt = `다음 AI들의 답변을 검토하고 보완점·동의점·추가인사이트를 100자 이내로 제시하세요.\n\n${othersText}`;
            try {
              const rv = await callAI(r.ai, [{ role:'user', content:prompt }], models, false);
              return { ai:r.ai, text:rv.text };
            } catch(e) {
              return { ai:r.ai, text:'검토 생략' };
            }
          })
        );
      }

      // 3단계: BELLAI 최종 취합 (Claude 담당)
      const synthAI = smartRoute(question, validAIs);
      const bellaiSynthPrompt = `당신은 BELLAI입니다. 여러 AI들의 토론 결과를 분석하고 최고의 답변을 취합하는 역할입니다.

[질문]
${question}

[AI 토론 결과]
${validR1.map(r => `## ${r.ai.toUpperCase()} 답변\n${r.text}`).join('\n\n')}
${round2.length ? '\n[상호 검토]\n' + round2.map(r => `${r.ai}: ${r.text}`).join('\n') : ''}

위 AI들의 답변을 종합 분석하여 다음 형식으로 최종 답변을 작성하세요:

**BELLAI 최종 답변**

[핵심 결론을 먼저 명확하게]

[상세 설명 - AI들이 공통으로 동의한 내용 중심으로]

**AI 의견 요약**
- 동의한 내용: [공통 의견]
- 추가 인사이트: [보완 내용]

자연스럽고 친근한 한국어로 작성하세요.`;

      const finalResult = await callAI('claude', [{ role:'user', content:bellaiSynthPrompt }], models, false);

      return res.json({
        mode: 'debate',
        round1,
        round2,
        final: { ai:'bellai', model:'BELLAI 취합 엔진', text:finalResult.text },
        modelsUsed: models,
      });
    }

    return res.status(400).json({ error: '알 수 없는 mode' });

  } catch (err) {
    console.error('[BELLAI Error]', err);
    return res.status(500).json({ error: err.message });
  }
}