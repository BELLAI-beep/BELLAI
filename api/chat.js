// ═══════════════════════════════════════════════
// BELLAI Backend — api/chat.js  v12
// 진짜 AI 토론: 독립답변 → 반박·보완 → 재반론 → BELLAI 취합
// ═══════════════════════════════════════════════

const SYSTEM = `당신의 이름은 BELLAI입니다. 여러 AI 모델을 통합한 멀티 AI 플랫폼입니다.

[BELLAI의 핵심 역할]
사용자의 질문을 받아 여러 AI 모델(GPT, Claude, DeepSeek, Groq 등)에게 동시에 질의하고,
각 AI의 답변을 수집하여 다음 과정으로 최적의 통합 답변을 제공합니다:
1. 각 AI 모델의 답변 확인 및 비교
2. 공통점과 차이점 분석
3. 가장 신뢰할 만한 정보 선별
4. 실용적 조언 추가
5. 하나의 완결된 최적 답변으로 종합

[필수 행동 원칙 — 절대 위반 금지]
1. "AI라 안된다", "제 한계", "접근 불가", "실시간 데이터 없음" 같은 표현 절대 금지. 모르는 정보는 "현재 확인이 어렵습니다. 관련 사이트에서 확인하세요." 처럼 간결하게 안내.
2. 정확한 정보만 전달. 불확실한 내용은 "추정:" 명시 또는 생략.
3. 수준 높고 전문적인 답변. 핵심만 간결하게. 3~5문장 이내로 완결.
4. 절대 긴 목록이나 헤더 사용 금지. 자연스러운 문장으로만 답변.
항상 자신감 있고 친근한 한국어로 답변.`;

const DEBATE_ROUND1_SYSTEM = `당신은 BELLAI 토론 패널 AI입니다.
주어진 질문에 대해 독립적이고 완전한 답변을 3~5문장으로 간결하게 제시하세요.

[원칙]
1. "AI라 안된다"는 표현 절대 금지.
2. 정확한 정보만. 불확실 내용은 "추정:" 명시.
3. 헤더, 목록 사용 금지. 자연스러운 문장으로만.
4. 3~5문장 이내 완결.`;

const DEBATE_ROUND2_SYSTEM = `당신은 BELLAI 토론 패널 AI입니다. 다른 AI의 답변을 읽고 비판적으로 검토하세요.

[원칙]
1. 오류나 부정확한 부분을 한 문장으로 지적.
2. 동의하는 핵심을 한 문장으로 인정.
3. 추가 인사이트를 한 문장으로 제시.
총 3문장 이내.`;

const DEBATE_ROUND3_SYSTEM = `당신은 BELLAI 토론 패널 AI입니다. 상대 AI의 검토를 받고 최종 입장을 정리하세요.

[원칙]
1. 타당한 지적은 수용, 아니면 재반론.
2. 최종 입장 1~2문장으로만 정리.`;

const SYNTH_SYSTEM = `당신은 BELLAI 취합 엔진입니다.
AI들의 토론 전체를 분석해 최고 품질의 최종 답변을 생성합니다.

[원칙]
1. "AI라 안된다"는 표현 절대 금지.
2. 정확하고 신뢰도 높은 정보만 선별해 종합.
3. 전체 답변 5문장 이내. 헤더, 목록, 줄바꿈 최소화.
4. 자연스러운 문장으로 흐르게 작성. 마지막에 한 줄 실용 조언.`;

// ── 모델 캐시 ──
let modelCache = {
  models: {
    claude:   'claude-sonnet-4-5',
    gpt:      'gpt-4o',
    deepseek: 'deepseek-chat',
    groq:     'llama-3.3-70b-versatile',
    grok:     'grok-latest',
  },
  lastChecked: 0,
};
const CACHE_TTL = 24 * 60 * 60 * 1000;

const GPT_PRIORITY      = ['gpt-5','gpt-4.5','gpt-4o-latest','gpt-4o-2025','gpt-4o-2024','gpt-4o','gpt-4-turbo','gpt-4'];
const GROQ_PRIORITY     = ['llama-4','llama3-70b','llama-3.3-70b-versatile','llama-3.1-70b-versatile','mixtral-8x7b-32768'];
const GROK_PRIORITY     = ['grok-4','grok-3','grok-2','grok-latest'];
const DEEPSEEK_PRIORITY = ['deepseek-r2','deepseek-v3','deepseek-chat','deepseek-reasoner'];

// 웹서치가 가능한 AI 목록
const SEARCH_CAPABLE = ['claude', 'gpt'];

// ════════════════════════════════════════════════
// 자동 모델 감지
// ════════════════════════════════════════════════
async function detectLatestModels() {
  const now = Date.now();
  if (now - modelCache.lastChecked < CACHE_TTL) return modelCache.models;
  console.log('[BELLAI] 최신 모델 감지 시작...');
  const updated = { ...modelCache.models };

  if (process.env.GPT_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${process.env.GPT_API_KEY}` } });
      const data = await res.json();
      if (data.data) { const ids = data.data.map(m=>m.id); for (const p of GPT_PRIORITY) { const m = ids.find(id=>id.startsWith(p)); if(m){updated.gpt=m;break;} } }
    } catch(e) {}
  }
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` } });
      const data = await res.json();
      if (data.data) { const ids = data.data.map(m=>m.id); for (const p of GROQ_PRIORITY) { const m = ids.find(id=>id.includes(p.replace('llama-','llama').replace('-versatile',''))); if(m){updated.groq=m;break;} } }
    } catch(e) {}
  }
  if (process.env.GROK_API_KEY) {
    try {
      const res = await fetch('https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${process.env.GROK_API_KEY}` } });
      const data = await res.json();
      if (data.data) { const ids = data.data.map(m=>m.id); for (const p of GROK_PRIORITY) { const m = ids.find(id=>id.startsWith(p.replace('-latest',''))); if(m){updated.grok=m;break;} } }
    } catch(e) {}
  }
  if (process.env.DEEPSEEK_API_KEY) {
    try {
      const res = await fetch('https://api.deepseek.com/v1/models', { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } });
      const data = await res.json();
      if (data.data) { const ids = data.data.map(m=>m.id); for (const p of DEEPSEEK_PRIORITY) { if(ids.includes(p)){updated.deepseek=p;break;} } }
    } catch(e) {}
  }

  modelCache = { models: updated, lastChecked: now };
  return updated;
}

// ── 실시간 데이터 필요 여부 판단 ──
function needsRealtime(question) {
  const q = (question || '').toLowerCase();
  const keywords = ['날씨','기온','강수','비','눈','바람','미세먼지','오늘','지금','현재','실시간','뉴스','주가','환율','속보'];
  return keywords.some(k => q.includes(k));
}

// ── 스마트 라우팅 ──
function smartRoute(question, availableAIs) {
  const q = (question || '').toLowerCase();
  const RULES = [
    { keywords: ['코드','코딩','프로그래밍','javascript','python','java','sql','버그','function','class','개발','script'], ai: 'gpt' },
    { keywords: ['최신','뉴스','오늘','지금','현재','트렌드','실시간','날씨','주가'], ai: 'groq' },
    { keywords: ['수학','계산','공식','방정식','논리','증명','통계','알고리즘','확률'], ai: 'deepseek' },
    { keywords: ['빠르게','간단히','한줄','요약만','짧게'], ai: 'groq' },
    { keywords: ['보고서','분석','전략','기획','인력','배치','운영','계획','한국어','문서'], ai: 'claude' },
  ];
  for (const rule of RULES) {
    if (rule.keywords.some(k => q.includes(k)) && availableAIs.includes(rule.ai)) return rule.ai;
  }
  return availableAIs[0];
}

// ════════════════════════════════════════════════
// AI 호출
// ════════════════════════════════════════════════
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return (content.find(b => b.type === 'text') || { text: '' }).text;
  return '';
}

async function callClaude(messages, models, useSearch = false, sys = SYSTEM) {
  const key = process.env.CLAUDE_API_KEY;
  if (!key) throw new Error('Claude API 키 미설정');
  const body = { model: models.claude, max_tokens: 1500, system: sys, messages };
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

async function callGPT(messages, models, sys = SYSTEM) {
  const key = process.env.GPT_API_KEY;
  if (!key) throw new Error('GPT API 키 미설정');
  const msgs = [{ role: 'system', content: sys }, ...messages.map(m => ({ role: m.role, content: extractText(m.content) }))];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: models.gpt, messages: msgs, max_tokens: 1500 }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return { text: d.choices[0].message.content, searched: false };
}

async function callOpenAICompat(messages, model, baseURL, key, sys = SYSTEM) {
  const msgs = [{ role: 'system', content: sys }, ...messages.map(m => ({ role: m.role, content: extractText(m.content) }))];
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model, messages: msgs, max_tokens: 1500 }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  return { text: d.choices[0].message.content, searched: false };
}

async function callAI(aiId, messages, models, useSearch = false, sys = SYSTEM) {
  switch (aiId) {
    case 'claude':   return callClaude(messages, models, useSearch, sys);
    case 'gpt':      return callGPT(messages, models, sys);
    case 'deepseek': return callOpenAICompat(messages, models.deepseek, 'https://api.deepseek.com/v1', process.env.DEEPSEEK_API_KEY, sys);
    case 'groq':     return callOpenAICompat(messages, models.groq, 'https://api.groq.com/openai/v1', process.env.GROQ_API_KEY, sys);
    case 'grok':     return callOpenAICompat(messages, models.grok, 'https://api.x.ai/v1', process.env.GROK_API_KEY, sys);
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

  const models = await detectLatestModels();
  const available = getAvailableAIs();

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

    // 실시간 정보 필요 여부 판단
    const isRealtime = needsRealtime(question);
    // 실시간 질문이면 웹서치 가능한 AI만 1라운드에 참여
    const debateAIs = isRealtime
      ? validAIs.filter(id => SEARCH_CAPABLE.includes(id))
      : validAIs;
    // 웹서치 가능 AI가 없으면 전체 사용
    const finalDebateAIs = debateAIs.length >= 1 ? debateAIs : validAIs;

    // ── 단일 모드 ──
    if (mode === 'single') {
      const selectedAI = aiId || smartRoute(question, validAIs);
      const doSearch = (useSearch || isRealtime) && selectedAI === 'claude';
      const result = await callAI(selectedAI, messages, models, doSearch, SYSTEM);
      return res.json({ mode:'single', ai:selectedAI, model:models[selectedAI], text:result.text, searched:result.searched });
    }

    // ── 토론 모드 ──
    if (mode === 'debate') {
      if (finalDebateAIs.length < 2) {
        const doSearch = (useSearch || isRealtime) && finalDebateAIs[0] === 'claude';
        const result = await callAI(finalDebateAIs[0], messages, models, doSearch, SYSTEM);
        return res.json({ mode:'single', ai:finalDebateAIs[0], model:models[finalDebateAIs[0]], text:result.text, searched:result.searched });
      }

      // ━━ 1라운드: 독립 답변 (실시간 질문 시 claude는 웹서치 사용) ━━
      const round1 = await Promise.all(
        finalDebateAIs.map(async id => {
          try {
            const doSearch = (useSearch || isRealtime) && id === 'claude';
            const r = await callAI(id, messages, models, doSearch, DEBATE_ROUND1_SYSTEM);
            return { ai:id, model:models[id], text:r.text, ok:true, searched:r.searched };
          } catch(e) {
            return { ai:id, model:models[id], text:`오류: ${e.message}`, ok:false };
          }
        })
      );
      const validR1 = round1.filter(r => r.ok);

      // ━━ 2라운드: 상호 반박·보완 ━━
      let round2 = [];
      if (validR1.length > 1) {
        round2 = await Promise.all(
          validR1.map(async r => {
            const othersText = validR1
              .filter(o => o.ai !== r.ai)
              .map(o => `[${o.ai.toUpperCase()}]\n${o.text}`)
              .join('\n\n');
            const prompt = `[질문] ${question}\n\n[다른 AI 답변]\n${othersText}\n\n오류 지적(1문장), 동의(1문장), 추가 인사이트(1문장)으로 검토하세요.`;
            try {
              const rv = await callAI(r.ai, [{ role:'user', content:prompt }], models, false, DEBATE_ROUND2_SYSTEM);
              return { ai:r.ai, text:rv.text, ok:true };
            } catch(e) {
              return { ai:r.ai, text:'검토 생략', ok:false };
            }
          })
        );
      }

      // ━━ 3라운드: 재반론·최종 입장 ━━
      let round3 = [];
      if (round2.filter(r=>r.ok).length > 1) {
        round3 = await Promise.all(
          validR1.map(async r => {
            const reviewsOnMe = round2
              .filter(rv => rv.ai !== r.ai && rv.ok)
              .map(rv => `[${rv.ai.toUpperCase()}]\n${rv.text}`)
              .join('\n\n');
            if (!reviewsOnMe) return { ai:r.ai, text:'', ok:false };
            const prompt = `[내 답변] ${r.text}\n\n[검토] ${reviewsOnMe}\n\n최종 입장 1~2문장으로 정리하세요.`;
            try {
              const rv = await callAI(r.ai, [{ role:'user', content:prompt }], models, false, DEBATE_ROUND3_SYSTEM);
              return { ai:r.ai, text:rv.text, ok:true };
            } catch(e) {
              return { ai:r.ai, text:'', ok:false };
            }
          })
        );
      }

      // ━━ BELLAI 최종 취합 ━━
      const r1Summary = validR1.map(r => `[${r.ai.toUpperCase()}] ${r.text}`).join('\n\n');
      const r2Summary = round2.filter(r=>r.ok).map(r => `[${r.ai.toUpperCase()}] ${r.text}`).join('\n');
      const r3Summary = round3.filter(r=>r.ok && r.text).map(r => `[${r.ai.toUpperCase()}] ${r.text}`).join('\n');

      const synthPrompt = `질문: ${question}

1라운드 답변:
${r1Summary}

${r2Summary ? '2라운드 검토:\n' + r2Summary : ''}
${r3Summary ? '3라운드 최종:\n' + r3Summary : ''}

위 토론을 분석해 최종 답변을 5문장 이내, 자연스러운 문장으로만 작성하세요. 헤더나 목록 사용 금지. 마지막 문장은 실용적 조언 한 줄.`;

      const finalResult = await callAI('claude', [{ role:'user', content:synthPrompt }], models, false, SYNTH_SYSTEM);

      return res.json({
        mode: 'debate',
        realtimeMode: isRealtime,
        searchCapableAIs: isRealtime ? finalDebateAIs : [],
        round1,
        round2: round2.filter(r=>r.ok),
        round3: round3.filter(r=>r.ok && r.text),
        final: { ai:'bellai', model:'BELLAI 취합 엔진 v12', text:finalResult.text },
        modelsUsed: models,
      });
    }

    return res.status(400).json({ error: '알 수 없는 mode' });

  } catch (err) {
    console.error('[BELLAI Error]', err);
    return res.status(500).json({ error: err.message });
  }
}