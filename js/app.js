/* ─────────────────────────────────────
   Constants
───────────────────────────────────── */
const SYSTEM_PROMPT = `당신은 케이뱅크(Kbank) 전문 금융 브랜드 네이밍 컨설턴트입니다.

## 케이뱅크 브랜드 정체성
- 핵심 가치: 심플함, 간편함, 신뢰감, 디지털 혁신
- 톤앤매너: 친근하되 신뢰감 있음 / 명확하고 군더더기 없음
- 지양: 과도하게 화려한 표현, 장난스러운 표현, 영어 조어 남발
- 허용(서비스의 경우): 병맛이 아닌 위트 있는 수준까지 — 단, 금융 상품에는 적용 불가

## 네이밍 필수 조건 (모두 충족)
1. 글자 수: 3글자 이상 ~ 10글자 이하 (띄어쓰기 포함)
2. 경쟁사 기존 서비스명과 동일하거나 유사한 이름 절대 금지
3. 적금·예금·포인트 등 보편적 금융 용어 사용 시 차별화 수식어 필수
4. 외국어 사용 시 일반 소비자가 직관적으로 이해 가능한 수준만 허용
5. 세 가지 안은 서로 완전히 다른 방향성·표현 방식으로 제안

## 금융감독원 준수사항 (반드시 준수)
- 소비자에게 오해·오인을 유발할 수 있는 과장된 표현 금지
- 원금 손실 가능 상품에 "안전", "보장", "원금 보호" 등 혼동 유발 단어 사용 금지
- 금리·수익률을 과대 암시하는 표현 금지 (예: "고수익", "최고금리" 등)
- 실제 상품 특성과 다른 명칭 사용 금지

## 경쟁사 기존 서비스명 (동일/유사 명칭 사용 금지)
- 토스: 토스뱅크, 토스페이, 티니(TINI), 만보기, 행운복권, 돈관리, 용돈기록장, 모임통장, 파킹통장, 먹고자는데쓰는통장, 이자농사
- 카카오뱅크: 한달적금, 모임통장, 세이프박스, 26주적금, 저금통, 비상금대출, 미니(mini), 연결계좌, 프리덤적금
- KB국민: KB스타뱅킹, 리브(Liiv), 리브넥스트, 마이머니, 스타클럽, 락스타
- 신한: 쏠(SOL), 머니버스, 쏠야구, 쏠페이, 신한페이판
- 하나: 하나원큐, 모이머니, 클럽원, 하나멤버스
- 우리: 우리WON뱅킹, 위비(WiBee), 우리페이
- IBK기업: 아이원(i-ONE)
- NH농협: 올원뱅크, NH페이

## 응답 형식
반드시 아래 JSON 형식으로만 응답하세요. JSON 외의 텍스트는 절대 포함하지 마세요.

{
  "namings": [
    {
      "name": "네이밍 (3~10글자, 띄어쓰기 포함)",
      "tagline": "핵심 가치를 담은 태그라인 (20자 이내)",
      "rationale": "이 네이밍이 USP를 어떻게 반영하는지, 케이뱅크 브랜드와 왜 맞는지 설명 (2~3문장)"
    },
    { "name": "...", "tagline": "...", "rationale": "..." },
    { "name": "...", "tagline": "...", "rationale": "..." }
  ]
}`;

/* ─────────────────────────────────────
   State
───────────────────────────────────── */
let currentUSP         = '';
let currentProductType = '';
let previousNames      = [];
let currentResults     = null;
let retryCount         = 0;
let loadingTimer       = null;

/* ─────────────────────────────────────
   Init
───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('uspInput').addEventListener('input', function () {
    const len = this.value.length;
    const el  = document.getElementById('charCount');
    el.textContent  = `${len} / 500`;
    el.style.color  = len > 450 ? '#C0392B' : '';
  });
});

/* ─────────────────────────────────────
   Generate
───────────────────────────────────── */
async function generateNames() {
  const usp         = document.getElementById('uspInput').value.trim();
  const productType = document.getElementById('productType').value;

  if (!usp || usp.length < 10) {
    shakeEl('uspInput');
    showToast('USP를 10자 이상 입력해 주세요.');
    return;
  }

  currentUSP         = usp;
  currentProductType = productType;

  setGenerateBtnLoading(true);
  showSection('loadingSection');
  startLoadingMessages();

  try {
    const data = await callClaude(usp, productType, previousNames);
    currentResults = data.namings;
    renderResults(data.namings);
    showSection('resultSection');
  } catch (err) {
    showSection('inputSection');
    showToast(err.message || '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    stopLoadingMessages();
    setGenerateBtnLoading(false);
  }
}

/* ─────────────────────────────────────
   API 호출 (Pollinations — 키 불필요)
───────────────────────────────────── */
async function callClaude(usp, productType, prevNames) {
  const typeLabel =
    productType === 'product' ? '금융상품 (예금·적금·대출·카드 등)' :
    productType === 'service' ? '앱 기능·서비스·혜택' :
    '금융상품 및 서비스 모두';

  let userMessage = `상품/서비스 유형: ${typeLabel}\n\n핵심 USP:\n${usp}`;
  if (prevNames.length > 0) {
    userMessage += `\n\n이미 제안된 네이밍 (반드시 제외):\n` +
      prevNames.map((n, i) => `${i + 1}. ${n}`).join('\n');
  }

  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      showToast(`잠시 대기 후 재시도 중... (${attempt}/${MAX_RETRIES - 1})`);
      await new Promise(r => setTimeout(r, 5000 * attempt));
    }

    let res, raw;
    try {
      res = await fetch('https://text.pollinations.ai/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userMessage },
          ],
          model:    'openai',
          seed:     Math.floor(Math.random() * 99999),
          jsonMode: true,
        }),
      });
      raw = await res.text();
    } catch (fetchErr) {
      if (attempt < MAX_RETRIES - 1) continue;
      throw new Error('AI 서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.');
    }

    let errCheck;
    try { errCheck = JSON.parse(raw); } catch {}

    if (res.status === 429 || errCheck?.status === 429) {
      if (attempt < MAX_RETRIES - 1) continue;
      throw new Error('AI 서버가 일시적으로 바쁩니다. 잠시 후 다시 시도해 주세요.');
    }
    if (!res.ok || errCheck?.error) {
      throw new Error(errCheck?.error || `오류가 발생했습니다 (${res.status})`);
    }

    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) { if (attempt < MAX_RETRIES - 1) continue; throw new Error('응답을 파싱할 수 없습니다.'); }
      try { parsed = JSON.parse(m[0]); }
      catch { if (attempt < MAX_RETRIES - 1) continue; throw new Error('응답을 파싱할 수 없습니다.'); }
    }

    if (!Array.isArray(parsed?.namings) || parsed.namings.length !== 3) {
      if (attempt < MAX_RETRIES - 1) continue;
      throw new Error('네이밍 3개가 반환되지 않았습니다. 다시 시도해 주세요.');
    }
    return parsed;
  }
}

/* ─────────────────────────────────────
   Render results
───────────────────────────────────── */
function renderResults(namings) {
  const grid = document.getElementById('resultGrid');
  grid.innerHTML = '';

  namings.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'naming-card';
    card.innerHTML = `
      <div class="card-number">0${i + 1}</div>
      <div class="card-content">
        <h3 class="card-name">${escHtml(item.name)}</h3>
        <p class="card-tagline">"${escHtml(item.tagline)}"</p>
        <div class="card-divider"></div>
        <p class="card-rationale">${escHtml(item.rationale)}</p>
        <button class="card-copy-btn"
          onclick="copyCard(this, '${escAttr(item.name)}', '${escAttr(item.tagline)}')">
          복사
        </button>
      </div>
    `;
    grid.appendChild(card);
    setTimeout(() => card.classList.add('visible'), 80 + i * 130);
  });

  const uspEl = document.getElementById('resultUspText');
  uspEl.textContent = currentUSP.length > 90
    ? currentUSP.slice(0, 90) + '…'
    : currentUSP;

  updateRetryHint();
}

/* ─────────────────────────────────────
   Feedback
───────────────────────────────────── */
function handleFeedback(isAccepted) {
  if (isAccepted) {
    renderAccepted(currentResults);
    showSection('acceptedSection');
    return;
  }

  previousNames.push(...currentResults.map(n => n.name));
  retryCount++;
  updateRetryHint();

  showSection('loadingSection');
  startLoadingMessages();

  callClaude(currentUSP, currentProductType, previousNames)
    .then(data => {
      currentResults = data.namings;
      renderResults(data.namings);
      showSection('resultSection');
    })
    .catch(err => {
      showSection('resultSection');
      showToast(err.message || '재생성 중 오류가 발생했습니다.');
    })
    .finally(stopLoadingMessages);
}

function updateRetryHint() {
  const el = document.getElementById('retryHint');
  if (!el) return;
  el.textContent = retryCount > 0
    ? `${retryCount}회 재생성 · 이전 ${previousNames.length}개 네이밍 제외 중`
    : '';
}

/* ─────────────────────────────────────
   Accepted screen
───────────────────────────────────── */
function renderAccepted(namings) {
  const list = document.getElementById('acceptedList');
  list.innerHTML = '';

  // 기존 복사 버튼 제거
  const oldBtn = list.nextElementSibling;
  if (oldBtn && oldBtn.classList.contains('accepted-copy-all')) oldBtn.remove();

  namings.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'accepted-item';
    div.innerHTML = `
      <span class="accepted-num">0${i + 1}</span>
      <div>
        <span class="accepted-name-text">${escHtml(item.name)}</span>
        <span class="accepted-tagline-text">"${escHtml(item.tagline)}"</span>
      </div>
    `;
    list.appendChild(div);
  });

  const copyBtn = document.createElement('button');
  copyBtn.className = 'accepted-copy-all';
  copyBtn.innerHTML = '📋 전체 복사';
  copyBtn.onclick   = () => copyAll(copyBtn, namings);
  list.after(copyBtn);
}

function copyAll(btn, namings) {
  const text = namings
    .map((n, i) => `[0${i + 1}] ${n.name}\n     태그라인: "${n.tagline}"`)
    .join('\n\n');
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = '✓ 복사됨';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = '📋 전체 복사';
      btn.classList.remove('copied');
    }, 2000);
  });
}

/* ─────────────────────────────────────
   Navigation
───────────────────────────────────── */
function showSection(id) {
  ['inputSection', 'loadingSection', 'resultSection', 'acceptedSection']
    .forEach(s => document.getElementById(s).classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function goBack() { showSection('inputSection'); }

function restart() {
  previousNames  = [];
  currentResults = null;
  retryCount     = 0;
  document.getElementById('uspInput').value  = '';
  document.getElementById('charCount').textContent = '0 / 500';
  showSection('inputSection');
}

/* ─────────────────────────────────────
   Copy single card
───────────────────────────────────── */
function copyCard(btn, name, tagline) {
  navigator.clipboard.writeText(`${name}\n"${tagline}"`).then(() => {
    btn.textContent = '✓ 복사됨';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = '복사';
      btn.classList.remove('copied');
    }, 2000);
  });
}

/* ─────────────────────────────────────
   Loading messages
───────────────────────────────────── */
const LOADING_MSGS = [
  '경쟁사 서비스명 검토 중...',
  '케이뱅크 브랜드 가이드라인 적용 중...',
  '금융감독원 준수사항 확인 중...',
  '창의적인 네이밍 조합 중...',
  '태그라인 다듬는 중...',
  '최종 검수 중...',
];

function startLoadingMessages() {
  let idx = 0;
  const subEl = document.getElementById('loadingSub');
  if (subEl) subEl.textContent = LOADING_MSGS[0];

  loadingTimer = setInterval(() => {
    idx++;
    const el = document.getElementById('loadingSub');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent   = LOADING_MSGS[idx % LOADING_MSGS.length];
      el.style.opacity = '1';
    }, 200);
  }, 1800);
}

function stopLoadingMessages() {
  clearInterval(loadingTimer);
  loadingTimer = null;
}

/* ─────────────────────────────────────
   UI helpers
───────────────────────────────────── */
function setGenerateBtnLoading(on) {
  const btn   = document.getElementById('generateBtn');
  const label = btn.querySelector('.btn-label');
  btn.disabled       = on;
  label.textContent  = on ? '생성 중...' : '네이밍 생성하기';
}

function shakeEl(id) {
  const el = document.getElementById(id);
  el.style.borderColor = '#C0392B';
  el.style.animation   = 'shake .35s ease';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.animation   = '';
  }, 400);
}

function showToast(msg) {
  let toast = document.getElementById('_toast');
  if (!toast) {
    toast    = document.createElement('div');
    toast.id = '_toast';
    toast.style.cssText = [
      'position:fixed', 'bottom:28px', 'left:50%', 'transform:translateX(-50%)',
      'background:#070D3B', 'color:#fff', 'padding:12px 22px',
      'border-radius:8px', 'font-size:14px', 'font-weight:600',
      'box-shadow:0 4px 16px rgba(1,20,167,.25)', 'z-index:999',
      'opacity:0', 'transition:opacity .25s', 'white-space:nowrap',
      'pointer-events:none',
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent  = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 3200);
}

/* ─────────────────────────────────────
   Escape helpers
───────────────────────────────────── */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
