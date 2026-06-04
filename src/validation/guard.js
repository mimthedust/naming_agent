/* ─────────────────────────────────────────────────────────
   Input Guard — src/validation/guard.js
   욕설: 키워드 즉시 차단 (실시간)
   개인·무의미 / 금융+비일관: AI 의미 분류
───────────────────────────────────────────────────────── */

const PROFANITY = [
  '씨발','씨바','시발','시바','시팔','씨팔','ㅅㅂ','ㅆㅂ',
  '개새끼','개새','새끼','개년','미친년','미친놈','병신','ㅂㅅ',
  '지랄','좆','자지','보지','창녀','걸레','꺼져','뒤져',
  'fuck','shit','bitch','asshole','bastard','cunt',
];

const MEME_RESPONSES = [
  {
    emoji: '🤔',
    main: '저는 네이밍 전문가인데요...',
    sub: '개인 상담은 전공이 아니에요. 근데 케이뱅크 네이밍은 진짜 잘 해요. 한 번 믿어봐요.',
  },
  {
    emoji: '🐧',
    main: '펭수도 힘들 때 일한다고 했어요.',
    sub: '"나 돌아갈래... 남극으로..." 하지 말고, USP 입력칸에 아이디어 하나 적어봐요.',
  },
  {
    emoji: '🧘',
    main: '심호흡 한 번 하고요.',
    sub: '저도 고민이 많아요. 늘 "이 네이밍이 맞나?" 고민해요. 같이 고민해봐요.',
  },
  {
    emoji: '🫡',
    main: '"열심히 일한 당신, 퇴근하라!" — 근데 딱 하나만요.',
    sub: '네이밍 하나 뽑고 퇴근해요. USP 입력해 주세요.',
  },
  {
    emoji: '🤖',
    main: 'AI라 공감 능력은 0.3% 정도지만',
    sub: '이건 할 수 있어요 → 케이뱅크 브랜드에 딱 맞는 네이밍 3개. 한번 써볼까요?',
  },
];

function hasProfanity(text) {
  const t = text.toLowerCase().replace(/\s/g, '');
  return PROFANITY.some(w => t.includes(w.replace(/\s/g, '')));
}

function randomMeme() {
  return MEME_RESPONSES[Math.floor(Math.random() * MEME_RESPONSES.length)];
}

/**
 * AI로 입력 의도를 분류합니다.
 * @returns {{ category: 'ok'|'personal'|'offcontext', summary: string }}
 *
 * - ok:         금융 상품/서비스의 USP를 명확하게 서술한 내용
 * - personal:   개인 감정 토로, 신변잡기, 무의미한 말, 헛소리 등 업무 무관
 * - offcontext: 금융/업무 맥락은 있으나 앞뒤가 맞지 않거나 의도 파악이 어려운 내용
 */
async function classifyUSP(text) {
  const prompt = `케이뱅크(Kbank) 내부 금융 상품·서비스 네이밍 생성 도구입니다.
사용자는 네이밍 생성을 위해 상품·서비스의 핵심 USP를 입력해야 합니다.

아래 텍스트를 엄격하게 분류하고, personal인 경우 해당 입력을 직접 받아치는 위트 있는 반응을 생성하세요.

분류 기준:
- "ok": 금융 상품·서비스·업무의 구체적인 특징·USP·대상·기능을 명확하게 설명한 내용. 네이밍을 만들기에 충분한 정보가 담겨 있어야 함.
- "personal": 아래 중 하나라도 해당하면 무조건 personal —
  ① 무의미한 음절 나열, 헛소리
  ② 개인 감정·일상·업무 무관 내용
  ③ 금융/경제 키워드가 있더라도 내용이 두루뭉실하고 구체성이 없는 경우 (예: "적금 상품이에요", "대출 관련입니다", "금융 서비스", "좋은 앱" 등 — 차별점·기능·대상이 전혀 없는 단순 나열)
  ④ 의도 불분명
- "offcontext": 구체적인 금융·업무 의도가 보이지만 문장이 앞뒤가 안 맞는 경우만.

핵심 원칙: 금융 키워드가 있어도 "이걸로 네이밍을 만들 수 있을 만큼 구체적인가?"를 기준으로 판단. 구체성이 없으면 personal.

personal인 경우 meme 필드를 반드시 채우세요:
- emoji: 입력 내용에 반응하는 이모지 1개
- main: 사용자가 입력한 내용을 직접 언급하거나 받아치는 짧고 위트 있는 한 마디 (예: 입력이 "솰라솰라"면 → "솰라솰라가 뭔지는 모르겠지만...")
- sub: 부드럽게 본론으로 유도하는 한 문장 (케이뱅크 네이밍 도구임을 상기시키며 USP 입력 유도)
- 톤: 친근하고 유쾌하게. 비꼬거나 무시하는 느낌 금지.

반드시 JSON만 출력하세요:
{
  "category": "ok" 또는 "personal" 또는 "offcontext",
  "summary": "offcontext일 때만 핵심 의도 한 문장, 나머지는 빈 문자열",
  "meme": {
    "emoji": "이모지",
    "main": "받아치는 한 마디",
    "sub": "본론 유도 문장"
  }
}
(ok/offcontext일 때 meme은 null로)

분류할 텍스트:
"${text.replace(/"/g, '\\"')}"`;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: '당신은 입력 텍스트의 의도를 분류하는 분류기입니다. 반드시 JSON만 출력하세요.' },
          { role: 'user',   content: prompt },
        ],
      }),
    });
    const raw = await res.text();
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (['ok', 'personal', 'offcontext'].includes(parsed?.category)) {
      return { category: parsed.category, summary: parsed.summary || '', meme: parsed.meme || null };
    }
  } catch {
    // 분류 실패 시 통과 처리
  }
  return { category: 'ok', summary: '', meme: null };
}
