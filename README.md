# BELLAI 배포 가이드

## 🚀 Vercel 무료 배포 (10분 완성)

### 1단계 — GitHub 업로드
1. https://github.com 가입
2. 새 저장소(Repository) 생성 → 이름: `bellai`
3. 이 폴더 전체 업로드

### 2단계 — Vercel 연결
1. https://vercel.com 가입 (GitHub 계정으로)
2. "New Project" → GitHub 저장소 선택
3. "Deploy" 클릭

### 3단계 — API 키 설정 (핵심!)
Vercel 대시보드 → Settings → Environment Variables

| 변수명 | 값 | 발급처 |
|--------|-----|--------|
| GEMINI_API_KEY | AIza... | aistudio.google.com (무료) |
| GROQ_API_KEY | gsk_... | console.groq.com (무료) |
| CLAUDE_API_KEY | sk-ant-... | console.anthropic.com |
| GPT_API_KEY | sk-proj-... | platform.openai.com |
| DEEPSEEK_API_KEY | sk-... | platform.deepseek.com |

> ⚡ Gemini + Groq만 입력해도 완전 무료로 작동!

### 4단계 — 재배포
Settings → Environment Variables 저장 후
Deployments → 최신 배포 → "Redeploy"

### 완료!
https://bellai.vercel.app 으로 접속 가능

---

## 💰 비용
- Vercel 서버: **무료** (월 100GB 트래픽)
- Gemini API: **무료** (1,500회/일)
- Groq API: **무료** (14,400회/일)
- Claude/GPT: 사용량만큼 과금

---

## 📱 플레이스토어 등록
백엔드 서버 완성 후 → PWA 변환 → 스토어 등록
(별도 가이드 제공 예정)
