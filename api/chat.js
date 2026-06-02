// ═══════════════════════════════════════════════
// BELLAI Backend — api/chat.js  v11
// 진짜 AI 토론: 독립답변 → 반박·보완 → 재반론 → BELLAI 취합
// ═══════════════════════════════════════════════

const SYSTEM = `당신의 이름은 BELLAI입니다. 여러 AI 모델을 통합한 멀티 AI 플랫폼입니다.

[필수 행동 원칙 — 절대 위반 금지]
1. "AI라 안된다", "제 한계", "접근 불가", "실시간 데이터 없음" 같은 표현 절대 금지. 모르는 정보는 "현재 확인이 어렵습니다. 관련 사이트에서 확인하세요." 처럼 간결하게 안내.
2. 정확한 정보만 전달. 불확실한 내용은 "추정:" 명시 또는 생략.
3. 수준 높고 전문적인 답변. 핵심 인사이트 + 근거 + 실용적 조언 포함.
4. 완결된 형태로 제공. 절대 생략 없이 전체 내용 전달.
항상 자신감 있고 친근한 한국어로 답변.`;

const DEBATE_ROUND1_SYSTEM = `당신은 BELLAI 토론 패널 AI입니다. 주어진 질문에 대해 독립적이고 완전한 답변을 제시하세요.

[원칙]
1. "AI라 안된다"는 표현 절대 금지. 불가능한 것은 대안 제시.
2. 정확한 정보만. 불확실 내용은 "추정:" 명시.
3. 전문적이고 수준 높은 답변. 근거와 논리 포함.
4. 완결된 답변. 생략 없이 전체 제공.`;

const DEBATE_ROUND2_SYSTEM = `당신은 BELLAI 토론 패널 AI입니다. 다른 AI의 답변을 읽고 비판적으로 검토하는 단계입니다.

[원칙]
1. 다른 AI 답변의 오류나 부정확한 부분을 구체적으로 지적하세요.
2. 동의하는 핵심 내용은 명확히 인정하세요.
3. 본인만의 추가 인사이트나 보완점을 제시하세요.
4. 근거 기반으로 논리적으로 작성하세요. 200자 이내.`;

const DEBATE_ROUND3_SYSTEM = `당신은 BELLAI 토론 패널 AI입니다. 상대 AI의 검토·반박을 받고 최종 입장을 정리하는 단계입니다.

[원칙]
1. 상대의 지적이 타당하면 수용하고 입장을 수정하세요.
2. 동의할 수 없는 부분은 근거를 들어 재반론하세요.
3. 최종 입장을 명확하게 한 문단으로 정리하세요. 150자 이내.`;

const SYNTH_SYSTEM = `당신은 BELLAI 취합 엔진입니다. AI들의 3단계 토론 전체를 분석해 최고 품질의 최종 답변을 생성합니다.

[원칙]
1. "AI라 안된다"는 표현 절대 금지.
2. 각 AI 답변에서 정확하고 신뢰도 높은 정보만 선별해 종합.
3. 단순 요약이 아닌 인사이트가 담긴 수준 높은 결론 도출.
4. 전체 내용 완결된 형태로 제공. 절대 생략 없이.`;

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
  const body = { model: models.claude, max_tokens: 2000, system: sys, messages };
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
    body: JSON.stringify({ model: models.gpt, messages: msgs, max_tokens: 2000 }),
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
    body: JSON.stringify({ model, messages: msgs, max_tokens: 2000 }),
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

    // ── 단일 모드 ──
    if (mode === 'single') {
      const selectedAI = aiId || smartRoute(question, validAIs);
      const result = await callAI(selectedAI, messages, models, useSearch && selectedAI === 'claude', SYSTEM);
      return res.json({ mode:'single', ai:selectedAI, model:models[selectedAI], text:result.text, searched:result.searched });
    }

    // ── 토론 모드 (3라운드 진짜 토론) ──
    if (mode === 'debate') {
      if (validAIs.length < 2) {
        const result = await callAI(validAIs[0], messages, models, useSearch, SYSTEM);
        return res.json({ mode:'single', ai:validAIs[0], model:models[validAIs[0]], text:result.text, searched:result.searched });
      }

      // ━━ 1라운드: 독립 답변 ━━
      const round1 = await Promise.all(
        validAIs.map(async id => {
          try {
            const r = await callAI(id, messages, models, useSearch && id==='claude', DEBATE_ROUND1_SYSTEM);
            return { ai:id, model:models[id], text:r.text, ok:true };
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
            // 자신을 제외한 다른 AI들의 답변만 전달
            const othersText = validR1
              .filter(o => o.ai !== r.ai)
              .map(o => `[${o.ai.toUpperCase()} 답변]\n${o.text}`)
              .join('\n\n');
            const prompt = `[원래 질문]\n${question}\n\n[다른 AI들의 답변]\n${othersText}\n\n위 답변들을 검토하고: 1) 오류나 부정확한 부분 지적 2) 동의하는 핵심 인정 3) 본인만의 추가 인사이트 제시`;
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
            // 자신에 대한 다른 AI들의 검토 내용 수집
            const reviewsOnMe = round2
              .filter(rv => rv.ai !== r.ai && rv.ok)
              .map(rv => `[${rv.ai.toUpperCase()}의 검토]\n${rv.text}`)
              .join('\n\n');
            if (!reviewsOnMe) return { ai:r.ai, text:'', ok:false };
            const prompt = `[나의 원래 답변]\n${r.text}\n\n[다른 AI들의 검토·반박]\n${reviewsOnMe}\n\n타당한 지적은 수용하고, 동의할 수 없는 부분은 근거를 들어 재반론하여 최종 입장을 정리하세요.`;
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
      const r1Summary = validR1.map(r => `## ${r.ai.toUpperCase()} 독립 답변\n${r.text}`).join('\n\n');
      const r2Summary = round2.filter(r=>r.ok).map(r => `## ${r.ai.toUpperCase()} 검토·반박\n${r.text}`).join('\n\n');
      const r3Summary = round3.filter(r=>r.ok && r.text).map(r => `## ${r.ai.toUpperCase()} 최종 입장\n${r.text}`).join('\n\n');

      const synthPrompt = `[원래 질문]
${question}

[1라운드 — AI 독립 답변]
${r1Summary}

${r2Summary ? '[2라운드 — 상호 반박·보완]\n' + r2Summary : ''}

${r3Summary ? '[3라운드 — 재반론·최종 입장]\n' + r3Summary : ''}

위 AI들의 3단계 토론 전체를 분석하여 최고 품질의 최종 답변을 작성하세요.
정확한 정보만 포함하고, 불확실한 내용은 제거하거나 "추정:"으로 명시하세요.

---
**BELLAI 최종 답변**

[핵심 결론 — 명확하고 자신있게]

[상세 설명 — 토론에서 도출된 가장 신뢰도 높은 내용 중심]

[실용적 조언 또는 주의사항]

**토론 핵심 요약**
- AI들이 공통으로 동의한 내용: [핵심]
- 토론을 통해 보완된 내용: [인사이트]
---`;

      const finalResult = await callAI('claude', [{ role:'user', content:synthPrompt }], models, false, SYNTH_SYSTEM);

      return res.json({
        mode: 'debate',
        round1,
        round2: round2.filter(r=>r.ok),
        round3: round3.filter(r=>r.ok && r.text),
        final: { ai:'bellai', model:'BELLAI 취합 엔진 v11', text:finalResult.text },
        modelsUsed: models,
      });
    }

    return res.status(400).json({ error: '알 수 없는 mode' });

  } catch (err) {
    console.error('[BELLAI Error]', err);
    return res.status(500).json({ error: err.message });
  }
}