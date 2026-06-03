// ═══════════════════════════════════════════════
// BELLAI Backend — api/chat.js  v13
// Gemini + Mistral 추가 / BELLAI 자체 취합 엔진
// ═══════════════════════════════════════════════

const SYSTEM = `당신의 이름은 BELLAI입니다. 여러 AI 모델을 통합한 멀티 AI 플랫폼입니다.

[BELLAI의 핵심 역할]
사용자의 질문을 받아 여러 AI 모델(GPT, Claude, Gemini, Mistral, DeepSeek, Groq 등)에게 동시에 질의하고,
각 AI의 답변을 수집하여 최적의 통합 답변을 제공합니다.

[필수 행동 원칙 — 절대 위반 금지]
1. "AI라 안된다", "제 한계", "접근 불가", "실시간 데이터 없음" 같은 표현 절대 금지.
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
오류 지적(1문장), 동의(1문장), 추가 인사이트(1문장). 총 3문장 이내.`;

const DEBATE_ROUND3_SYSTEM = `당신은 BELLAI 토론 패널 AI입니다.
타당한 지적은 수용, 아니면 재반론. 최종 입장 1~2문장으로만 정리.`;

// ── 모델 캐시 ──
let modelCache = {
  models: {
    claude:   'claude-sonnet-4-5',
    gpt:      'gpt-4o',
    gemini:   'gemini-2.5-flash',
    mistral:  'mistral-small-latest',
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
const GEMINI_PRIORITY   = ['gemini-2.5-flash','gemini-2.5-pro','gemini-2.0-flash','gemini-1.5-pro'];
const MISTRAL_PRIORITY  = ['mistral-large-latest','mistral-medium-latest','mistral-small-latest','open-mistral-7b'];

const SEARCH_CAPABLE = ['claude', 'gpt'];

// ════════════════════════════════════════════════
// 자동 모델 감지
// ════════════════════════════════════════════════
async function detectLatestModels() {
  const now = Date.now();
  if (now - modelCache.lastChecked < CACHE_TTL) return modelCache.models;
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
  if (process.env.GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
      const data = await res.json();
      if (data.models) {
        const ids = data.models.map(m => m.name.replace('models/',''));
        for (const p of GEMINI_PRIORITY) { if(ids.includes(p)){updated.gemini=p;break;} }
      }
    } catch(e) {}
  }
  if (process.env.MISTRAL_API_KEY) {
    try {
      const res = await fetch('https://api.mistral.ai/v1/models', { headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` } });
      const data = await res.json();
      if (data.data) { const ids = data.data.map(m=>m.id); for (const p of MISTRAL_PRIORITY) { if(ids.includes(p)){updated.mistral=p;break;} } }
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
    { keywords: ['유럽','프랑스','영어','번역','언어'], ai: 'mistral' },
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

async function callGemini(messages, models, sys = SYSTEM) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API 키 미설정');
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: extractText(m.content) }]
  }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${models.gemini}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { maxOutputTokens: 1500 }
      }),
    }
  );
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  const text = d.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || '';
  return { text, searched: false };
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
    case 'gemini':   return callGemini(messages, models, sys);
    case 'mistral':  return callOpenAICompat(messages, models.mistral, 'https://api.mistral.ai/v1', process.env.MISTRAL_API_KEY, sys);
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
    gemini:   'GEMINI_API_KEY',
    mistral:  'MISTRAL_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    groq:     'GROQ_API_KEY',
    grok:     'GROK_API_KEY',
  }).filter(([, env]) => process.env[env]).map(([id]) => id);
}

// ════════════════════════════════════════════════
// BELLAI 자체 취합 엔진 (API 비용 0)
// ════════════════════════════════════════════════
function bellaiSynth(question, round1, round2, round3) {
  const valid = round1.filter(r => r.ok && r.text && !r.text.startsWith('오류'));
  if (!valid.length) return '답변을 수집하지 못했습니다.';

  // 1. 각 AI 답변을 문장 단위로 분리
  const allSentences = [];
  valid.forEach(r => {
    const sentences = r.text
      .split(/(?<=[.!?。])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
    sentences.forEach(s => allSentences.push({ ai: r.ai, text: s }));
  });

  // 2. 문장 유사도 기반 공통 의견 추출 (키워드 겹침)
  const scored = allSentences.map(s => {
    const words = s.text.replace(/[^\w\s가-힣]/g, '').split(/\s+/).filter(w => w.length > 1);
    let score = 0;
    allSentences.forEach(other => {
      if (other.ai === s.ai) return;
      const otherWords = other.text.replace(/[^\w\s가-힣]/g, '').split(/\s+/).filter(w => w.length > 1);
      const overlap = words.filter(w => otherWords.includes(w)).length;
      score += overlap;
    });
    return { ...s, score };
  });

  // 3. 점수 높은 순 정렬 → 중복 AI 제거하여 핵심 문장 선별
  scored.sort((a, b) => b.score - a.score);
  const usedAIs = new Set();
  const coreSentences = [];
  for (const s of scored) {
    if (coreSentences.length >= 3) break;
    if (!usedAIs.has(s.ai)) {
      coreSentences.push(s.text);
      usedAIs.add(s.ai);
    }
  }

  // 4. 단독 인사이트 추가 (다른 AI가 언급 안 한 유니크한 내용)
  const lowScored = scored.filter(s => s.score === 0 && !usedAIs.has(s.ai));
  if (lowScored.length > 0) {
    coreSentences.push(lowScored[0].text);
  }

  // 5. 3라운드 최종 입장 중 가장 합의된 내용 추가
  if (round3 && round3.length > 0) {
    const r3valid = round3.filter(r => r.ok && r.text && r.text.length > 10);
    if (r3valid.length > 0) {
      const r3sentences = r3valid[0].text.split(/(?<=[.!?。])\s+/).filter(s => s.length > 10);
      if (r3sentences.length > 0) coreSentences.push(r3sentences[0]);
    }
  }

  // 6. 최종 포맷 조합
  const result = coreSentences.slice(0, 4).join(' ');
  return result || valid.map(r => r.text.split(/(?<=[.!?。])\s+/)[0]).join(' ');
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

    const isRealtime = needsRealtime(question);
    const debateAIs = isRealtime ? validAIs.filter(id => SEARCH_CAPABLE.includes(id)) : validAIs;
    const finalDebateAIs = debateAIs.length >= 2 ? debateAIs : validAIs;

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

      // ━━ 1라운드: 독립 답변 ━━
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
            const prompt = `[질문] ${question}\n\n[다른 AI 답변]\n${othersText}\n\n오류 지적(1문장), 동의(1문장), 추가 인사이트(1문장).`;
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
            const prompt = `[내 답변] ${r.text}\n\n[검토] ${reviewsOnMe}\n\n최종 입장 1~2문장.`;
            try {
              const rv = await callAI(r.ai, [{ role:'user', content:prompt }], models, false, DEBATE_ROUND3_SYSTEM);
              return { ai:r.ai, text:rv.text, ok:true };
            } catch(e) {
              return { ai:r.ai, text:'', ok:false };
            }
          })
        );
      }

      // ━━ BELLAI 자체 취합 (API 비용 0) ━━
      const finalText = bellaiSynth(question, round1, round2, round3);

      return res.json({
        mode: 'debate',
        realtimeMode: isRealtime,
        round1,
        round2: round2.filter(r=>r.ok),
        round3: round3.filter(r=>r.ok && r.text),
        final: { ai:'bellai', model:'BELLAI 취합 엔진 v13', text:finalText },
        modelsUsed: models,
      });
    }

    return res.status(400).json({ error: '알 수 없는 mode' });

  } catch (err) {
    console.error('[BELLAI Error]', err);
    return res.status(500).json({ error: err.message });
  }
}