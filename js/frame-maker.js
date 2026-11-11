// ===== 내 프레임 만들기 (2026-11-10) =====
// 칸 배치 · 배경(단색·그라데이션·무늬·사진) · 칸 모양 · 위/아래 글자를 고르면
// 사진 칸이 투명하게 뚫린 프레임 PNG 를 만들어 '내 프레임'에 저장한다 (사진 카드에서 칸에 사진이 자동으로 들어간다).
// 만든 값(maker)도 같이 저장해 두어 나중에 다시 열어 고칠 수 있다.
App.frameMaker = {
  // 칸 배치 — w×h 는 프레임 크기(px), 사진은 최대 4장 (칸이 더 많으면 돌려 가며 채움)
  TEMPLATES: {
    booth4: { name: '네컷 세로', w: 1080, h: 3240 },
    grid4: { name: '2×2 피드', w: 1080, h: 1350 },
    strip2: { name: '2컷 세로', w: 1080, h: 2160 },
    polaroid: { name: '1칸 폴라로이드', w: 1080, h: 1350 },
    story4: { name: '2×2 스토리', w: 1080, h: 1920 },
    // 사진관 참고 사진 (2026-11-10) — 찢어진 종이 구멍 사이로 얼굴, 한쪽 벽 뒤에서 빼꼼
    torn: { name: '찢어진 종이', w: 1080, h: 1350 },
    peek: { name: '벽 뒤 빼꼼', w: 1080, h: 1350 },
    peek11: { name: '벽 뒤 빼꼼 1:1', w: 1080, h: 1080 }
  },
  PATTERNS: { dots: '도트', gingham: '깅엄 체크', stripe: '사선 줄무늬', paw: '발자국', heart: '하트', star: '반짝이', confetti: '컨페티', film: '필름',
    wave: '물결', leaf: '단풍잎', snow: '눈송이', saekdong: '색동', moon: '보름달', bat: '박쥐', scissors: '가위·빗', bubble: '거품', bow: '리본',
    awning: '차양 지붕', tartan: '타탄 체크', checker: '바둑판', aurora: '오로라', doodle: '낙서', news: '신문', leafline: '잎사귀 선' },
  // 추천 스타일 묶음 (고르는 칸에서 줄을 나눠 보여 준다)
  PRESET_GROUPS: { basic: '기본', season: '계절', holiday: '기념일', salon: '미용실', mood: '분위기', trend: '요즘 느낌' },
  // 추천 스타일 — 한 번 누르면 배경·글자·칸 모양을 한꺼번에. {매장명} 은 매장 이름으로 바뀐다
  PRESETS: {
    picnic: { group: 'basic', name: '피크닉 체크', bgType: 'pattern', pattern: 'gingham', bg1: '#FFF8F0', bg2: '#F9A8D4', radius: 24, border: 'white', title: 'PICNIC DAY', caption: '{매장명}', font: 'gaegu', textColor: '#9D174D', band: false },
    mono: { group: 'basic', name: '블랙 미니멀', bgType: 'solid', bg1: '#111111', bg2: '#333333', radius: 0, border: 'none', title: '', caption: 'PHOTO BOOTH · {매장명}', font: 'dohyeon', textColor: '#FFFFFF', band: false },
    y2k: { group: 'trend', name: 'Y2K 그라데이션', bgType: 'gradient', bg1: '#C4B5FD', bg2: '#F9A8D4', radius: 60, border: 'white', title: 'GROOMED ✦', caption: '{매장명}', font: 'bagel', textColor: '#FFFFFF', band: false },
    mint: { group: 'basic', name: '민트 발자국', bgType: 'pattern', pattern: 'paw', bg1: '#D1FAE5', bg2: '#6EE7B7', radius: 24, border: 'white', title: '', caption: '오늘도 보송보송', font: 'jua', textColor: '#065F46', band: true, bandColor: '#FFFFFF' },
    film: { group: 'mood', name: '레트로 필름', bgType: 'pattern', pattern: 'film', bg1: '#2B2420', bg2: '#F5E6D3', radius: 4, border: 'none', title: '', caption: '35mm · {매장명}', font: 'orbit', textColor: '#F5E6D3', band: false },
    birthday: { group: 'holiday', name: '생일 컨페티', bgType: 'pattern', pattern: 'confetti', bg1: '#FFFBEB', bg2: '#F43F5E', radius: 24, border: 'white', title: 'HAPPY BIRTHDAY', caption: '{매장명}', font: 'bagel', textColor: '#F43F5E', band: false },
    spring: { group: 'season', name: '벚꽃 도트', bgType: 'pattern', pattern: 'dots', bg1: '#FFF1F2', bg2: '#FDA4AF', radius: 60, border: 'white', title: 'SPRING', caption: '봄날의 산책 🌸', font: 'gamja', textColor: '#BE123C', band: false },
    xmas: { group: 'holiday', name: '크리스마스', bgType: 'pattern', pattern: 'stripe', bg1: '#B91C1C', bg2: '#FFFFFF', radius: 24, border: 'white', title: 'MERRY CHRISTMAS', caption: '{매장명}', font: 'blackhan', textColor: '#FFFFFF', band: true, bandColor: '#14532D' },
    star: { group: 'mood', name: '밤하늘 반짝', bgType: 'pattern', pattern: 'star', bg1: '#1E1B4B', bg2: '#FDE68A', radius: 24, border: 'none', title: 'LITTLE STAR', caption: '{매장명}', font: 'orbit', textColor: '#FDE68A', band: false },
    torn: { group: 'basic', name: '찢어진 종이', tpl: 'torn', bgType: 'solid', bg1: '#F7B3C2', bg2: '#FFFFFF', radius: 0, border: 'none', title: '', caption: '{매장명}', font: 'jua', textColor: '#FFFFFF', band: false },
    peek: { group: 'basic', name: '벽 뒤 빼꼼', tpl: 'peek', bgType: 'solid', bg1: '#7FA99B', bg2: '#FFFFFF', radius: 0, border: 'none', title: '', caption: '{매장명}', font: 'dohyeon', textColor: '#FFFFFF', band: false },
    sea: { group: 'season', name: '여름 바다', bgType: 'pattern', pattern: 'wave', bg1: '#E0F2FE', bg2: '#38BDF8', radius: 24, border: 'white', title: 'SUMMER', caption: '{매장명}', font: 'jua', textColor: '#0369A1', band: false },
    autumn: { group: 'season', name: '가을 단풍', bgType: 'pattern', pattern: 'leaf', bg1: '#FFF7ED', bg2: '#EA580C', radius: 24, border: 'white', title: 'AUTUMN', caption: '{매장명}', font: 'gaegu', textColor: '#9A3412', band: true, bandColor: '#FFF7ED' },
    winter: { group: 'season', name: '겨울 눈', bgType: 'pattern', pattern: 'snow', bg1: '#1E3A8A', bg2: '#FFFFFF', radius: 24, border: 'white', title: 'WINTER', caption: '{매장명}', font: 'orbit', textColor: '#FFFFFF', band: false },
    // 2026-11-11 사장님 선택: 색동은 촌스러워 남색 바탕 + 금색 반짝이로 (색동 무늬는 '무늬' 고르기에 그대로 남아 있다)
    newyear: { group: 'holiday', name: '새해 골드 밤하늘', bgType: 'pattern', pattern: 'star', bg1: '#14213D', bg2: '#F2C14E', radius: 24, border: 'white', title: 'Happy New Year', caption: '{매장명}', font: 'batang', textColor: '#F2C14E', band: false },
    chuseok: { group: 'holiday', name: '추석 보름달', bgType: 'pattern', pattern: 'moon', bg1: '#1E1B4B', bg2: '#FDE68A', radius: 24, border: 'none', title: '풍성한 한가위', caption: '{매장명}', font: 'batang', textColor: '#FDE68A', band: false },
    halloween: { group: 'holiday', name: '할로윈', bgType: 'pattern', pattern: 'bat', bg1: '#F97316', bg2: '#1C1917', radius: 24, border: 'black', title: 'HAPPY HALLOWEEN', caption: '{매장명}', font: 'blackhan', textColor: '#1C1917', band: false },
    salon: { group: 'salon', name: '미용실 가위·빗', bgType: 'pattern', pattern: 'scissors', bg1: '#F8FAFC', bg2: '#94A3B8', radius: 16, border: 'white', title: 'GROOMING DAY', caption: '{매장명}', font: 'dohyeon', textColor: '#334155', band: true, bandColor: '#F8FAFC' },
    bath: { group: 'salon', name: '목욕 뽀송 거품', bgType: 'pattern', pattern: 'bubble', bg1: '#BAE6FD', bg2: '#FFFFFF', radius: 60, border: 'white', title: '뽀송뽀송', caption: '{매장명}', font: 'jua', textColor: '#0369A1', band: false },
    firstcut: { group: 'salon', name: '첫 미용 리본', bgType: 'pattern', pattern: 'bow', bg1: '#FFF1F2', bg2: '#F9A8D4', radius: 24, border: 'white', title: '첫 미용 축하해', caption: '{매장명}', font: 'gamja', textColor: '#BE185D', band: false },
    icecream: { group: 'mood', name: '아이스크림 가게', bgType: 'pattern', pattern: 'awning', bg1: '#FFF7ED', bg2: '#FB923C', radius: 24, border: 'white', title: 'ICE CREAM', caption: '{매장명}', font: 'bagel', textColor: '#C2410C', band: false },
    tartan: { group: 'mood', name: '타탄 체크', bgType: 'pattern', pattern: 'tartan', bg1: '#7F1D1D', bg2: '#FDE68A', radius: 8, border: 'white', title: '', caption: '{매장명}', font: 'batang', textColor: '#7F1D1D', band: true, bandColor: '#FFFFFF' },
    neon: { group: 'mood', name: '네온 밤', bgType: 'solid', bg1: '#0B0B1A', bg2: '#1F1F3A', radius: 24, border: 'none', title: 'GOOD BOY ✦', caption: '{매장명}', font: 'orbit', textColor: '#F472B6', band: false, glow: true },
    aurora: { group: 'trend', name: '오로라 그라데이션', bgType: 'pattern', pattern: 'aurora', bg1: '#FDF2F8', bg2: '#C4B5FD', radius: 60, border: 'white', title: '', caption: '{매장명}', font: 'gowun', textColor: '#6D28D9', band: false },
    checker: { group: 'trend', name: '레트로 바둑판', bgType: 'pattern', pattern: 'checker', bg1: '#FFFFFF', bg2: '#111111', radius: 16, border: 'white', title: 'PHOTO TIME', caption: '{매장명}', font: 'bagel', textColor: '#111111', band: true, bandColor: '#FFFFFF' },
    coquette: { group: 'trend', name: '코케트 리본', bgType: 'pattern', pattern: 'bow', bg1: '#FFF5F7', bg2: '#F4A7B9', radius: 60, border: 'white', title: 'lovely day', caption: '{매장명}', font: 'yeonsung', textColor: '#DB2777', band: false },
    doodle: { group: 'trend', name: '낙서 다이어리', bgType: 'pattern', pattern: 'doodle', bg1: '#FFFBEB', bg2: '#111827', radius: 16, border: 'black', title: '오늘의 기록', caption: '{매장명}', font: 'gaegu', textColor: '#111827', band: true, bandColor: '#FFFBEB' },
    news: { group: 'trend', name: '신문 레트로', bgType: 'pattern', pattern: 'news', bg1: '#F5F1E8', bg2: '#1F2937', radius: 0, border: 'black', title: 'PUPPY TIMES', caption: '{매장명}', font: 'batang', textColor: '#1F2937', band: false },
    botanical: { group: 'trend', name: '보태니컬 미니멀', bgType: 'pattern', pattern: 'leafline', bg1: '#F7F5EE', bg2: '#6B8E5A', radius: 60, border: 'white', title: '', caption: '{매장명}', font: 'batang', textColor: '#4D6B3F', band: false },
    heart: { group: 'basic', name: '러블리 하트', bgType: 'pattern', pattern: 'heart', bg1: '#FFE4E6', bg2: '#FB7185', radius: 60, border: 'white', title: '', caption: 'LOVE MY PUPPY ♥', font: 'dongle', textColor: '#BE123C', band: true, bandColor: '#FFFFFF' }
  },
  SWATCHES: ['#FFFFFF', '#111111', '#FFF8F0', '#F5E6D3', '#FFE4E6', '#F9A8D4', '#FB7185', '#F43F5E', '#FDE68A', '#FB923C', '#D1FAE5', '#34D399', '#BAE6FD', '#38BDF8', '#C4B5FD', '#6366F1', '#1E1B4B', '#2B2420'],

  defaults() { return { tpl: 'booth4', ...this.PRESETS.picnic, preset: 'picnic', logo: false, bgPhoto: null }; },

  // 칸 자리 (px) — 위 글자·아래 글자 자리를 먼저 잡고 남은 곳을 칸으로 나눈다
  cells(p) {
    const T = this.TEMPLATES[p.tpl] || this.TEMPLATES.booth4;
    const W = T.w, H = T.h, m = 60, g = 24;
    const top = p.title ? 190 : m;
    const bottom = (p.caption || p.logo) ? (p.tpl === 'booth4' ? 280 : 210) : m;
    const out = [];
    if (p.tpl === 'torn') {
      out.push({ x: (W - 600) / 2, y: Math.round(H * 0.3), w: 600, h: 560 });
    } else if (this._isPeek(p.tpl)) {
      out.push({ x: 420, y: 0, w: W - 420, h: H });
    } else if (p.tpl === 'polaroid') {
      const s = W - m * 2;
      out.push({ x: m, y: top, w: s, h: Math.min(s, H - top - bottom) });
    } else if (p.tpl === 'grid4' || p.tpl === 'story4') {
      const cw = (W - m * 2 - g) / 2, ch = (H - top - bottom - g) / 2;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) out.push({ x: m + c * (cw + g), y: top + r * (ch + g), w: cw, h: ch });
    } else {
      const n = p.tpl === 'strip2' ? 2 : 4;
      const ch = (H - top - bottom - g * (n - 1)) / n;
      for (let r = 0; r < n; r++) out.push({ x: m, y: top + r * (ch + g), w: W - m * 2, h: ch });
    }
    return out.map(c => ({ x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) }));
  },

  _rand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
  _paw(x, cx, cy, s) {
    x.beginPath(); x.ellipse(cx, cy + s * 0.25, s * 0.42, s * 0.34, 0, 0, Math.PI * 2); x.fill();
    [[-0.42, -0.18], [-0.15, -0.45], [0.15, -0.45], [0.42, -0.18]].forEach(([dx, dy]) => { x.beginPath(); x.ellipse(cx + dx * s, cy + dy * s, s * 0.15, s * 0.19, 0, 0, Math.PI * 2); x.fill(); });
  },
  _heart(x, cx, cy, s) {
    x.beginPath(); x.moveTo(cx, cy + s * 0.35);
    x.bezierCurveTo(cx - s * 0.6, cy - s * 0.05, cx - s * 0.35, cy - s * 0.55, cx, cy - s * 0.2);
    x.bezierCurveTo(cx + s * 0.35, cy - s * 0.55, cx + s * 0.6, cy - s * 0.05, cx, cy + s * 0.35); x.fill();
  },
  _sparkle(x, cx, cy, s) {
    x.beginPath(); x.moveTo(cx, cy - s); x.quadraticCurveTo(cx, cy, cx + s, cy); x.quadraticCurveTo(cx, cy, cx, cy + s); x.quadraticCurveTo(cx, cy, cx - s, cy); x.quadraticCurveTo(cx, cy, cx, cy - s); x.fill();
  },
  // 두 색 섞기 (t=0 → a, 1 → b)
  _mix(a, b, t) {
    const h = (c) => { c = String(c).replace('#', ''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) || 0); };
    const A = h(a), B = h(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  },
  // 찢어진 구멍 둘레 점 — 타원을 따라 들쭉날쭉 (같은 칸이면 늘 같은 모양)
  _tornPoints(cl) {
    const rnd = this._rand(11), N = 72, pts = [];
    const cx = cl.x + cl.w / 2, cy = cl.y + cl.h / 2, rx = cl.w / 2, ry = cl.h / 2;
    // 크게 출렁이는 둘레(사인 몇 개) + 작은 톱니 — 별 모양처럼 규칙적이지 않게
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const k = 0.88 + 0.05 * Math.sin(a * 3 + ph[0]) + 0.03 * Math.sin(a * 5 + ph[1]) + 0.02 * Math.sin(a * 9 + ph[2]) + (rnd() - 0.5) * 0.035;
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  },
  _maple(x, cx, cy, s) {
    x.beginPath();
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i / 10 * Math.PI * 2, r = i % 2 ? s * 0.42 : s; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    x.closePath(); x.fill();
    x.fillRect(cx - 2, cy, 4, s * 0.9);
  },
  _bat(x, cx, cy, s) {
    x.beginPath(); x.moveTo(cx, cy - s * 0.2);
    x.quadraticCurveTo(cx - s * 0.5, cy - s * 0.6, cx - s, cy - s * 0.2);
    x.quadraticCurveTo(cx - s * 0.75, cy - s * 0.05, cx - s * 0.66, cy + s * 0.15);
    x.quadraticCurveTo(cx - s * 0.5, cy, cx - s * 0.33, cy + s * 0.15);
    x.quadraticCurveTo(cx - s * 0.18, cy, cx, cy + s * 0.25);
    x.quadraticCurveTo(cx + s * 0.18, cy, cx + s * 0.33, cy + s * 0.15);
    x.quadraticCurveTo(cx + s * 0.5, cy, cx + s * 0.66, cy + s * 0.15);
    x.quadraticCurveTo(cx + s * 0.75, cy - s * 0.05, cx + s, cy - s * 0.2);
    x.quadraticCurveTo(cx + s * 0.5, cy - s * 0.6, cx, cy - s * 0.2);
    x.fill();
  },
  _scissors(x, cx, cy, s) {
    x.beginPath(); x.arc(cx - s * 0.35, cy + s * 0.55, s * 0.25, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(cx + s * 0.35, cy + s * 0.55, s * 0.25, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(cx - s * 0.2, cy + s * 0.35); x.lineTo(cx + s * 0.25, cy - s); x.moveTo(cx + s * 0.2, cy + s * 0.35); x.lineTo(cx - s * 0.25, cy - s); x.stroke();
  },
  _comb(x, cx, cy, s) {
    x.fillRect(cx - s, cy - s * 0.35, s * 2, s * 0.3);
    for (let i = 0; i < 9; i++) x.fillRect(cx - s + i * s * 0.24, cy - s * 0.05, s * 0.1, s * 0.55);
  },
  _bow(x, cx, cy, s) {
    x.beginPath(); x.moveTo(cx, cy); x.bezierCurveTo(cx - s * 0.6, cy - s * 0.7, cx - s * 1.1, cy - s * 0.3, cx - s, cy + s * 0.15); x.bezierCurveTo(cx - s * 0.7, cy + s * 0.4, cx - s * 0.3, cy + s * 0.2, cx, cy); x.fill();
    x.beginPath(); x.moveTo(cx, cy); x.bezierCurveTo(cx + s * 0.6, cy - s * 0.7, cx + s * 1.1, cy - s * 0.3, cx + s, cy + s * 0.15); x.bezierCurveTo(cx + s * 0.7, cy + s * 0.4, cx + s * 0.3, cy + s * 0.2, cx, cy); x.fill();
    x.beginPath(); x.moveTo(cx - s * 0.1, cy); x.lineTo(cx - s * 0.45, cy + s * 0.9); x.lineTo(cx - s * 0.2, cy + s * 0.8); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(cx + s * 0.1, cy); x.lineTo(cx + s * 0.45, cy + s * 0.9); x.lineTo(cx + s * 0.2, cy + s * 0.8); x.closePath(); x.fill();
    x.beginPath(); x.arc(cx, cy, s * 0.18, 0, Math.PI * 2); x.fill();
  },
  _isPeek(t) { return t === 'peek' || t === 'peek11'; },
  // 사진 뒤 배경색 (떼어 낸 강아지 뒤) — 빼꼼·찢어진 종이. 'auto' 면 벽(바탕)보다 조금 연하게
  _holeBg(p) {
    if (!(this._isPeek(p.tpl) || p.tpl === 'torn')) return null;
    if (p.holeBg && p.holeBg !== 'auto') return p.holeBg;
    return this._mix(p.bg1, '#FFFFFF', this._isPeek(p.tpl) ? 0.28 : 0.4);
  },
  _rgba(hex, a) { const h = String(hex).replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; },

  _drawBackground(x, W, H, p, bgImg) {
    x.fillStyle = p.bg1; x.fillRect(0, 0, W, H);
    if (p.bgType === 'gradient') {
      const gr = x.createLinearGradient(0, 0, W, H); gr.addColorStop(0, p.bg1); gr.addColorStop(1, p.bg2);
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
    } else if (p.bgType === 'photo' && bgImg) {
      App.pages.records._drawImageCover(x, bgImg, 0, 0, W, H);
    } else if (p.bgType === 'pattern') {
      const rnd = this._rand(7);
      x.fillStyle = p.bg2;
      const pat = p.pattern;
      if (pat === 'dots') {
        for (let yy = 0, r = 0; yy < H + 60; yy += 60, r++) for (let xx = (r % 2) * 30; xx < W + 60; xx += 60) { x.beginPath(); x.arc(xx, yy, 9, 0, Math.PI * 2); x.fill(); }
      } else if (pat === 'gingham') {
        x.fillStyle = this._rgba(p.bg2, 0.45);
        for (let yy = 0; yy < H; yy += 80) x.fillRect(0, yy, W, 40);
        for (let xx = 0; xx < W; xx += 80) x.fillRect(xx, 0, 40, H);
      } else if (pat === 'stripe') {
        x.save(); x.translate(W / 2, H / 2); x.rotate(-Math.PI / 4);
        const L = W + H;
        for (let k = -L; k < L; k += 90) x.fillRect(k, -L, 45, L * 2);
        x.restore();
      } else if (pat === 'paw') {
        for (let yy = 70, r = 0; yy < H + 100; yy += 170, r++) for (let xx = 70 + (r % 2) * 85; xx < W + 100; xx += 170) {
          x.save(); x.translate(xx, yy); x.rotate((rnd() - 0.5) * 0.9); this._paw(x, 0, 0, 52); x.restore();
        }
      } else if (pat === 'heart') {
        for (let yy = 60, r = 0; yy < H + 80; yy += 130, r++) for (let xx = 60 + (r % 2) * 65; xx < W + 80; xx += 130) this._heart(x, xx, yy, 56);
      } else if (pat === 'star') {
        for (let k = 0; k < Math.round(W * H / 9000); k++) { x.globalAlpha = 0.35 + rnd() * 0.65; this._sparkle(x, rnd() * W, rnd() * H, 6 + rnd() * 18); }
        x.globalAlpha = 1;
      } else if (pat === 'confetti') {
        const cols = [p.bg2, '#FACC15', '#38BDF8', '#34D399', '#A78BFA', '#FB923C'];
        for (let k = 0; k < Math.round(W * H / 5000); k++) {
          x.fillStyle = cols[k % cols.length];
          x.save(); x.translate(rnd() * W, rnd() * H); x.rotate(rnd() * Math.PI);
          if (k % 3 === 0) { x.beginPath(); x.arc(0, 0, 7, 0, Math.PI * 2); x.fill(); } else x.fillRect(-12, -5, 24, 10);
          x.restore();
        }
      } else if (pat === 'wave') {
        x.strokeStyle = p.bg2; x.lineWidth = 10; x.lineCap = 'round'; x.globalAlpha = 0.55;
        for (let yy = 40; yy < H + 60; yy += 90) { x.beginPath(); for (let xx = -20; xx <= W + 20; xx += 12) { const y2 = yy + Math.sin(xx / 46 + yy) * 14; xx < 0 ? x.moveTo(xx, y2) : x.lineTo(xx, y2); } x.stroke(); }
        x.globalAlpha = 1;
      } else if (pat === 'leaf') {
        const cols = [p.bg2, this._mix(p.bg2, '#FACC15', 0.45), this._mix(p.bg2, '#7C2D12', 0.35)];
        for (let k = 0; k < Math.round(W * H / 26000); k++) { x.fillStyle = cols[k % 3]; x.save(); x.translate(rnd() * W, rnd() * H); x.rotate(rnd() * Math.PI * 2); this._maple(x, 0, 0, 26 + rnd() * 26); x.restore(); }
      } else if (pat === 'snow') {
        x.strokeStyle = p.bg2; x.lineCap = 'round';
        for (let k = 0; k < Math.round(W * H / 16000); k++) {
          const cx = rnd() * W, cy = rnd() * H, r = 8 + rnd() * 20; x.globalAlpha = 0.45 + rnd() * 0.55; x.lineWidth = Math.max(2, r / 6);
          x.beginPath(); for (let a = 0; a < 3; a++) { const t = a * Math.PI / 3; x.moveTo(cx - Math.cos(t) * r, cy - Math.sin(t) * r); x.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); } x.stroke();
        }
        x.globalAlpha = 1;
      } else if (pat === 'saekdong') {
        const cols = ['#E11D48', '#FACC15', '#16A34A', '#2563EB', '#F472B6', '#FFFFFF', '#7C3AED'];
        for (let yy = 0, i = 0; yy < H; yy += 44, i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(0, yy, W, 44); }
      } else if (pat === 'moon') {
        x.fillStyle = p.bg2;
        for (let k = 0; k < Math.round(W * H / 14000); k++) { x.globalAlpha = 0.3 + rnd() * 0.7; this._sparkle(x, rnd() * W, rnd() * H, 4 + rnd() * 10); }
        x.globalAlpha = 1;
        const mr = W * 0.13, mx = mr * 1.05, my = H - mr * 1.05; // 왼쪽 아래 (위 제목·가운데 매장명을 가리지 않게)
        x.save(); x.shadowColor = p.bg2; x.shadowBlur = 60; x.beginPath(); x.arc(mx, my, mr, 0, Math.PI * 2); x.fill(); x.restore();
      } else if (pat === 'bat') {
        x.fillStyle = p.bg2;
        for (let yy = 80, r = 0; yy < H + 80; yy += 200, r++) for (let xx = 90 + (r % 2) * 110; xx < W + 80; xx += 220) { x.save(); x.translate(xx, yy); x.rotate((rnd() - 0.5) * 0.5); this._bat(x, 0, 0, 46); x.restore(); }
      } else if (pat === 'scissors') {
        x.strokeStyle = p.bg2; x.fillStyle = p.bg2; x.lineWidth = 6; x.lineCap = 'round'; x.globalAlpha = 0.5;
        for (let yy = 70, r = 0; yy < H + 100; yy += 170, r++) for (let xx = 70 + (r % 2) * 85, c = 0; xx < W + 100; xx += 170, c++) {
          x.save(); x.translate(xx, yy); x.rotate(-0.5 + (r % 2) * 1.0);
          (c + r) % 2 ? this._scissors(x, 0, 0, 34) : this._comb(x, 0, 0, 34); x.restore();
        }
        x.globalAlpha = 1;
      } else if (pat === 'bubble') {
        for (let k = 0; k < Math.round(W * H / 11000); k++) {
          const cx = rnd() * W, cy = rnd() * H, r = 10 + rnd() * 46;
          x.fillStyle = this._rgba(p.bg2, 0.35); x.strokeStyle = this._rgba(p.bg2, 0.9); x.lineWidth = 3;
          x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.stroke();
          x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.18, r * 0.11, -0.7, 0, Math.PI * 2); x.fill();
        }
      } else if (pat === 'bow') {
        x.fillStyle = p.bg2;
        for (let yy = 70, r = 0; yy < H + 80; yy += 150, r++) for (let xx = 70 + (r % 2) * 75; xx < W + 80; xx += 150) { x.save(); x.translate(xx, yy); x.rotate((rnd() - 0.5) * 0.4); this._bow(x, 0, 0, 34); x.restore(); }
      } else if (pat === 'awning') {
        // 위쪽 차양 지붕 (줄무늬 + 둥근 끝), 아래는 바탕색
        const ah = 210, sw = 90;
        for (let xx = 0, i = 0; xx < W; xx += sw, i++) {
          x.fillStyle = i % 2 ? '#FFFFFF' : p.bg2;
          x.beginPath(); x.moveTo(xx, 0); x.lineTo(xx + sw, 0); x.lineTo(xx + sw, ah); x.arc(xx + sw / 2, ah, sw / 2, 0, Math.PI); x.closePath(); x.fill();
        }
      } else if (pat === 'tartan') {
        x.fillStyle = this._rgba(p.bg2, 0.35);
        for (let yy = 0; yy < H; yy += 160) { x.fillRect(0, yy, W, 60); x.fillRect(0, yy + 90, W, 12); }
        for (let xx = 0; xx < W; xx += 160) { x.fillRect(xx, 0, 60, H); x.fillRect(xx + 90, 0, 12, H); }
        x.fillStyle = 'rgba(0,0,0,0.2)';
        for (let yy = 30; yy < H; yy += 160) x.fillRect(0, yy, W, 4);
        for (let xx = 30; xx < W; xx += 160) x.fillRect(xx, 0, 4, H);
      } else if (pat === 'checker') {
        const q = 90;
        for (let yy = 0, r = 0; yy < H; yy += q, r++) for (let xx = (r % 2) * q; xx < W; xx += q * 2) x.fillRect(xx, yy, q, q);
      } else if (pat === 'aurora') {
        const cols = [p.bg2, '#F9A8D4', '#A7F3D0', '#FDE68A', '#BAE6FD'];
        x.globalCompositeOperation = 'multiply';
        for (let k = 0; k < 6; k++) {
          const cx = rnd() * W, cy = rnd() * H, r = Math.max(W, H) * (0.35 + rnd() * 0.3), c = cols[k % cols.length];
          const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, this._rgba(c, 0.85)); g.addColorStop(1, this._rgba(c, 0));
          x.fillStyle = g; x.fillRect(0, 0, W, H);
        }
        x.globalCompositeOperation = 'source-over';
      } else if (pat === 'doodle') {
        x.strokeStyle = p.bg2; x.lineWidth = 5; x.lineCap = 'round'; x.lineJoin = 'round';
        for (let k = 0; k < Math.round(W * H / 22000); k++) {
          const cx = rnd() * W, cy = rnd() * H, sz = 18 + rnd() * 22, t = k % 5;
          x.save(); x.translate(cx, cy); x.rotate(rnd() * 6.28); x.globalAlpha = 0.75; x.beginPath();
          if (t === 0) { for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2, rr = i % 2 ? sz * 0.45 : sz; i ? x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : x.moveTo(rr, 0); } }
          else if (t === 1) { x.moveTo(0, sz * 0.35); x.bezierCurveTo(-sz, -sz * 0.2, -sz * 0.4, -sz, 0, -sz * 0.35); x.bezierCurveTo(sz * 0.4, -sz, sz, -sz * 0.2, 0, sz * 0.35); }
          else if (t === 2) { x.moveTo(-sz, 0); for (let i = 1; i <= 6; i++) x.quadraticCurveTo(-sz + (i - 0.5) * sz / 3, i % 2 ? -sz * 0.35 : sz * 0.35, -sz + i * sz / 3, 0); }
          else if (t === 3) { x.arc(0, 0, sz * 0.5, 0, Math.PI * 2); }
          else { x.moveTo(-sz * 0.5, 0); x.lineTo(sz * 0.5, 0); x.moveTo(0, -sz * 0.5); x.lineTo(0, sz * 0.5); }
          x.stroke(); x.restore();
        }
        x.globalAlpha = 1;
      } else if (pat === 'news') {
        // 신문: 굵은 위·아래 줄 + 단 나눔 + 회색 글줄
        x.fillStyle = p.bg2; x.fillRect(40, 30, W - 80, 6); x.fillRect(40, 42, W - 80, 2); x.fillRect(40, H - 44, W - 80, 6);
        x.fillStyle = this._rgba(p.bg2, 0.18);
        const colW = (W - 80 - 40) / 3;
        for (let c = 0; c < 3; c++) for (let yy = 70; yy < H - 60; yy += 22) x.fillRect(40 + c * (colW + 20), yy, colW * (0.7 + rnd() * 0.3), 8);
      } else if (pat === 'leafline') {
        x.strokeStyle = p.bg2; x.lineWidth = 4; x.lineCap = 'round';
        const sprig = (bx, by, ang, len) => {
          x.save(); x.translate(bx, by); x.rotate(ang); x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.5, -len * 0.08, len, 0); x.stroke();
          for (let i = 1; i <= 5; i++) { const t = i / 6 * len, sd = i % 2 ? 1 : -1; x.beginPath(); x.ellipse(t, sd * 16, 20, 8, sd * 0.6, 0, Math.PI * 2); x.stroke(); }
          x.restore();
        };
        sprig(0, 120, 0.35, 260); sprig(W, 160, Math.PI - 0.35, 240); sprig(0, H - 120, -0.4, 250); sprig(W, H - 160, Math.PI + 0.4, 260); sprig(W * 0.5, H, -Math.PI / 2 - 0.2, 180);
      } else if (pat === 'film') {
        // 필름 양옆 구멍
        x.fillStyle = this._rgba(p.bg2, 0.85);
        for (let yy = 20; yy < H; yy += 64) {
          App.pages.records._roundRect(x, 14, yy, 30, 36, 6); x.fill();
          App.pages.records._roundRect(x, W - 44, yy, 30, 36, 6); x.fill();
        }
      }
    }
  },

  // 글자 한 줄을 폭에 맞춰 그린다 (띠가 켜져 있으면 둥근 띠 위에)
  _drawText(x, text, cx, cy, maxW, size, p, fontStack) {
    if (!text) return;
    let fs = size;
    x.font = `bold ${fs}px ${fontStack}`;
    while (x.measureText(text).width > maxW && fs > 24) { fs -= 4; x.font = `bold ${fs}px ${fontStack}`; }
    const tw = x.measureText(text).width;
    if (p.band) {
      x.fillStyle = p.bandColor || '#FFFFFF';
      App.pages.records._roundRect(x, cx - tw / 2 - 36, cy - fs * 0.75, tw + 72, fs * 1.5, fs * 0.75); x.fill();
    }
    x.fillStyle = p.textColor; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (p.glow) {
      // 네온: 같은 색으로 번지는 빛을 두 번 깔고 가운데는 밝게
      x.save(); x.shadowColor = p.textColor; x.shadowBlur = 28; x.fillText(text, cx, cy + 2); x.shadowBlur = 12; x.fillText(text, cx, cy + 2); x.restore();
      x.save(); x.fillStyle = this._mix(p.textColor, '#FFFFFF', 0.55); x.fillText(text, cx, cy + 2); x.restore();
      return;
    }
    x.fillText(text, cx, cy + 2);
  },

  async render(p) {
    const R = App.pages.records;
    const T = this.TEMPLATES[p.tpl] || this.TEMPLATES.booth4;
    const W = T.w, H = T.h;
    const shop = (await DB.getSetting('shopName')) || '';
    const fill = (t) => String(t || '').replace(/\{매장명\}/g, shop || 'PET SALON').trim();
    const title = fill(p.title), caption = fill(p.caption);
    if (p.font && p.font !== 'system') await R._ensureCardFont(p.font, title + caption);
    const fontStack = R._cardFontStack(p.font);
    const bgImg = p.bgType === 'photo' && p.bgPhoto ? await R._loadImg(p.bgPhoto) : null;
    let logoImg = p.logo ? await R._loadImg(await DB.getSetting('shopLogo')) : null;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    this._drawBackground(x, W, H, p, bgImg);
    const cells = this.cells({ ...p, title, caption });
    const rad = Number(p.radius) || 0;
    const special = p.tpl === 'torn' || this._isPeek(p.tpl);
    // 칸 테두리 (사진 둘레 띠)
    if (!special && p.border && p.border !== 'none') {
      x.fillStyle = p.border === 'black' ? '#111111' : '#FFFFFF';
      cells.forEach(cl => { R._roundRect(x, cl.x - 12, cl.y - 12, cl.w + 24, cl.h + 24, rad ? rad + 10 : 2); x.fill(); });
    }
    // 사진 칸 뚫기
    x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    if (p.tpl === 'torn') {
      const pts = this._tornPoints(cells[0]);
      x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.fill();
    } else cells.forEach(cl => { if (rad && !special) { R._roundRect(x, cl.x, cl.y, cl.w, cl.h, rad); x.fill(); } else x.fillRect(cl.x, cl.y, cl.w, cl.h); });
    x.restore();
    if (p.tpl === 'torn') {
      // 찢긴 종이 가장자리(흰 섬유) + 안쪽으로 말린 종잇조각
      const cl = cells[0], pts = this._tornPoints(cl);
      const cx = cl.x + cl.w / 2, cy = cl.y + cl.h / 2;
      x.save();
      x.strokeStyle = this._mix(p.bg1, '#FFFFFF', 0.55); x.lineWidth = 7; x.lineJoin = 'round';
      x.beginPath(); pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.stroke();
      const flap = this._mix(p.bg1, '#FFFFFF', 0.22);
      [5, 22, 41, 58].forEach((i, n) => {
        const a = pts[i], b = pts[(i + 7) % pts.length];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const k = [0.16, 0.11, 0.14, 0.09][n];
        x.shadowColor = 'rgba(0,0,0,0.22)'; x.shadowBlur = 14; x.shadowOffsetY = 5;
        x.fillStyle = flap;
        x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(mx + (cx - mx) * k, my + (cy - my) * k); x.lineTo(b[0], b[1]); x.closePath(); x.fill();
      });
      x.restore();
    } else if (this._isPeek(p.tpl)) {
      // 벽 모서리 그림자 (사진 쪽으로 살짝) + 벽 끝 밝은 선
      const cl = cells[0];
      const g = x.createLinearGradient(cl.x, 0, cl.x + 70, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(cl.x, 0, 70, H);
      x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(cl.x - 4, 0, 4, H);
    }
    if (this._isPeek(p.tpl)) {
      // 글자·로고는 왼쪽 벽 위아래에
      const wc = cells[0].x / 2, ww = cells[0].x - 70;
      if (title) this._drawText(x, title, wc, 130, ww, 64, p, fontStack);
      if (caption) this._drawText(x, caption, wc, H - 110, ww, 52, p, fontStack);
      if (logoImg) {
        const L = this._logoSpot(p, W, H, cells, !!title, !!caption);
        this._logoMark(x, logoImg, L.cx, L.cy, L.size, p.logoStyle || 'sign', p.bg1);
      }
      const holes = cells.map(cl => ({ x: cl.x / W, y: cl.y / H, w: cl.w / W, h: cl.h / H }));
      return { canvas: c, holes, fw: W, fh: H, holeBg: this._holeBg(p) };
    }
    // 위·아래 글자
    const last = cells[cells.length - 1];
    const bottomTop = last.y + last.h + 12, bottomH = H - bottomTop;
    const tSize = p.tpl === 'booth4' ? 92 : 80, cSize = p.tpl === 'polaroid' ? 88 : (p.tpl === 'booth4' ? 70 : 62);
    if (title) this._drawText(x, title, W / 2, cells[0].y / 2 + 4, W - 120, tSize, p, fontStack);
    // 로고를 끌어 놓았거나 모양·크기를 정했으면 그 자리에 따로 (아래 글자는 혼자)
    const freeLogo = logoImg && (p.logoX != null || (p.logoStyle && p.logoStyle !== 'plain') || p.logoSize != null) ? logoImg : null;
    if (freeLogo) logoImg = null;
    if (logoImg && caption) {
      const lh = 64, lw = logoImg.width * (lh / logoImg.height);
      x.drawImage(logoImg, (W - lw) / 2, bottomTop + bottomH * 0.22, lw, lh);
      this._drawText(x, caption, W / 2, bottomTop + bottomH * 0.66, W - 120, Math.round(cSize * 0.85), p, fontStack);
    } else if (logoImg) {
      const lh = 80, lw = logoImg.width * (lh / logoImg.height);
      x.drawImage(logoImg, (W - lw) / 2, bottomTop + (bottomH - lh) / 2, lw, lh);
    } else if (caption) {
      this._drawText(x, caption, W / 2, bottomTop + bottomH / 2, W - 120, cSize, p, fontStack);
    }
    if (freeLogo) {
      const L = this._logoSpot(p, W, H, cells, !!title, !!caption);
      this._logoMark(x, freeLogo, L.cx, L.cy, L.size, p.logoStyle || 'plain', p.bg1);
    }
    const holes = cells.map(cl => ({ x: cl.x / W, y: cl.y / H, w: cl.w / W, h: cl.h / H }));
    return { canvas: c, holes, fw: W, fh: H, holeBg: this._holeBg(p) };
  },
  // 로고 자리 (px) — 끌어 놓은 자리(logoX·Y, 0~1)가 있으면 그곳, 없으면 틀마다 기본 자리. 크기는 logoSize(가로 비율)
  _logoSpot(p, W, H, cells, hasTitle, hasCaption) {
    const peek = this._isPeek(p.tpl);
    const size = (p.logoSize != null ? p.logoSize : (peek ? 0.28 : 0.16)) * W;
    if (p.logoX != null && p.logoY != null) return { cx: p.logoX * W, cy: p.logoY * H, size };
    if (peek) {
      const pos = p.logoPos || 'middle';
      const cy = pos === 'top' ? (hasTitle ? 360 : 240) : pos === 'bottom' ? H - (hasCaption ? 340 : 230) : H * 0.48;
      return { cx: cells[0].x / 2, cy, size };
    }
    const last = cells[cells.length - 1], bt = last.y + last.h + 12;
    return { cx: W / 2, cy: hasCaption ? bt + (H - bt) * 0.28 : bt + (H - bt) / 2, size };
  },
  // 로고 한 개 그리기 — 모양: sign(흰 동그라미 간판) · plain(그대로) · engrave(새긴 듯 연하게). 한 색 로고는 바탕에 맞춰 색을 바꾼다
  _logoMark(x, img, cx, cy, size, style, bg) {
    const R = App.pages.records;
    const tint = (b) => (R._logoForBg ? R._logoForBg(img, b) : img);
    const fit = (maxW, maxH) => { const r = Math.min(maxW / img.width, maxH / img.height); return [img.width * r, img.height * r]; };
    if (style === 'sign') {
      const r = size / 2;
      x.save(); x.shadowColor = 'rgba(0,0,0,0.25)'; x.shadowBlur = 24; x.shadowOffsetY = 8;
      x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.restore();
      x.strokeStyle = this._rgba(bg, 0.6); x.lineWidth = Math.max(3, r * 0.04); x.beginPath(); x.arc(cx, cy, r * 0.9, 0, Math.PI * 2); x.stroke();
      const [w, h] = fit(r * 1.25, r * 1.1);
      x.drawImage(tint('#FFFFFF'), cx - w / 2, cy - h / 2, w, h);
    } else {
      const [w, h] = fit(size, size);
      x.save(); if (style === 'engrave') x.globalAlpha = 0.4;
      x.drawImage(tint(bg), cx - w / 2, cy - h / 2, w, h); x.restore();
    }
  },

  // 미리보기: 투명한 칸을 회색 '사진 1·2…' 자리로 채워 보여 준다 (투명한 채로는 칸이 바깥과 구분되지 않았다)
  _previewUrl(r) {
    const c = document.createElement('canvas'); c.width = r.canvas.width; c.height = r.canvas.height;
    const x = c.getContext('2d');
    r.holes.forEach((h, i) => {
      const X = h.x * c.width, Y = h.y * c.height, w = h.w * c.width, hh = h.h * c.height;
      x.fillStyle = r.holeBg || '#CBD5E1'; x.fillRect(X, Y, w, hh);
      x.fillStyle = r.holeBg ? 'rgba(0,0,0,0.35)' : '#64748B'; x.font = `bold ${Math.round(Math.min(w, hh) * 0.18)}px -apple-system, sans-serif`;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('사진 ' + (i + 1), X + w / 2, Y + hh / 2);
    });
    x.drawImage(r.canvas, 0, 0);
    const url = c.toDataURL('image/jpeg', 0.85);
    c.width = c.height = 0;
    return url;
  },

  // 만들기 창. frame 을 주면 그 프레임(만든 값 maker)을 고친다
  async open(frame) {
    const editing = !!(frame && frame.maker);
    const saved = []; // 이 창에서 저장한 프레임 이름
    const p = editing ? { ...this.defaults(), ...frame.maker } : this.defaults();
    const R = App.pages.records;
    const hasLogo = !!(await DB.getSetting('shopLogo'));
    if (!hasLogo) p.logo = false; // 로고를 지운 뒤에는 자리만 비지 않게
    const chips = (obj, key, cur) => Object.entries(obj).map(([k, v]) => `<button type="button" class="card-tstyle-btn${k === cur ? ' active' : ''}" data-${key}="${k}">${typeof v === 'string' ? v : v.name}</button>`).join('');
    const sw = (id, cur) => `<div class="fm-swatches" data-for="${id}">${this.SWATCHES.map(c => `<button type="button" class="card-text-color${c.toLowerCase() === String(cur).toLowerCase() ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="색 ${c}"></button>`).join('')}<input type="color" id="${id}" value="${cur}" aria-label="직접 고르기"></div>`;
    App.showModal({
      title: editing ? '프레임 고치기' : '프레임 만들기',
      size: 'lg',
      saveText: editing ? '고친 것 저장' : '내 프레임에 저장',
      content: `
        <div class="fm">
          <div class="fm-preview"><img id="fm-img" alt="프레임 미리보기"><div class="fm-preview-note">투명한 칸에 사진이 들어가요</div><div class="fm-saved-note" id="fm-saved-note" hidden></div></div>
          <div class="fm-panel">
            <div class="form-group"><label class="form-label">추천 스타일 <span class="fm-sub">· 누르면 한 번에 바뀌어요</span></label>
              <div id="fm-presets" class="fm-preset-groups">${Object.entries(this.PRESET_GROUPS).map(([g, gn]) => `<div class="fm-preset-group"><span class="fm-group-name">${gn}</span><div class="fm-row">${Object.entries(this.PRESETS).filter(([, v]) => (v.group || 'basic') === g).map(([k, v]) => `<button type="button" class="card-tstyle-btn${k === p.preset ? ' active' : ''}" data-preset="${k}">${v.name}</button>`).join('')}</div></div>`).join('')}</div></div>
            <div class="form-group"><label class="form-label">칸 배치</label>
              <div class="fm-row" id="fm-tpl">${chips(this.TEMPLATES, 'tpl', p.tpl)}</div></div>
            <div class="form-group"><label class="form-label">배경</label>
              <div class="fm-row" id="fm-bgtype">${chips({ solid: '단색', gradient: '그라데이션', pattern: '무늬', photo: '사진' }, 'bgtype', p.bgType)}</div>
              <div class="fm-row" id="fm-pattern" ${p.bgType === 'pattern' ? '' : 'hidden'}>${chips(this.PATTERNS, 'pattern', p.pattern)}</div>
              <div id="fm-photo-row" ${p.bgType === 'photo' ? '' : 'hidden'}><button type="button" class="btn btn-sm btn-secondary" id="fm-photo-btn">${App.icon('image')} 배경 사진 고르기</button><input type="file" id="fm-photo" accept="image/*" hidden></div>
              <div class="fm-color-label">바탕 색</div>${sw('fm-bg1', p.bg1)}
              <div id="fm-holebg-wrap" hidden><div class="fm-color-label">사진 뒤 배경색 <span class="fm-sub">· 떼어 낸 강아지 뒤 (일반 사진은 사진이 덮어요)</span></div>
                <div class="fm-row" id="fm-holebg-auto"><button type="button" class="card-tstyle-btn" data-holeauto="1">자동 (벽보다 조금 연하게)</button></div>
                ${sw('fm-holebg', p.holeBg && p.holeBg !== 'auto' ? p.holeBg : '#FFFFFF')}</div>
              <div id="fm-bg2-wrap" ${p.bgType === 'gradient' || p.bgType === 'pattern' ? '' : 'hidden'}><div class="fm-color-label">${p.bgType === 'gradient' ? '두 번째 색' : '무늬 색'}</div>${sw('fm-bg2', p.bg2)}</div>
            </div>
            <div class="form-group" id="fm-cellstyle" ${p.tpl === 'torn' || this._isPeek(p.tpl) ? 'hidden' : ''}><label class="form-label">사진 칸</label>
              <div class="fm-row" id="fm-radius">${chips({ 0: '각지게', 24: '둥글게', 60: '많이 둥글게' }, 'radius', String(p.radius))}</div>
              <div class="fm-row" id="fm-border">${chips({ none: '테두리 없음', white: '흰 테두리', black: '검정 테두리' }, 'border', p.border)}</div>
            </div>
            <div class="form-group"><label class="form-label">글자 <span class="fm-sub">· {매장명}은 매장 이름으로 바뀌어요</span></label>
              <input type="text" id="fm-title" maxlength="24" placeholder="위 글자 (비우면 없음)" value="${App.escapeHtml(p.title || '')}">
              <input type="text" id="fm-caption" maxlength="30" placeholder="아래 글자 (비우면 없음)" value="${App.escapeHtml(p.caption || '')}" style="margin-top:6px">
              ${hasLogo ? `<label class="card-toggle" style="margin-top:8px"><input type="checkbox" id="fm-logo" ${p.logo ? 'checked' : ''}> 매장 로고 넣기</label>
              <div id="fm-wall-logo" hidden>
                <div class="fm-color-label">로고 모양</div>
                <div class="fm-row" id="fm-logo-style">${chips({ sign: '흰 동그라미 간판', plain: '그대로', engrave: '새긴 듯 연하게' }, 'lstyle', p.logoStyle || (this._isPeek(p.tpl) ? 'sign' : 'plain'))}</div>
                <div class="fm-color-label">자리 <span class="fm-sub">· 위 미리보기를 누르면 그 자리로 옮겨져요</span></div>
                <div class="fm-row" id="fm-logo-pos">${chips({ top: '위', middle: '가운데', bottom: '아래' }, 'lpos', p.logoPos || 'middle')}</div>
                <label class="fm-logo-size">크기 <input type="range" id="fm-logo-size" min="8" max="45" step="1" value="${Math.round((p.logoSize != null ? p.logoSize : (this._isPeek(p.tpl) ? 0.28 : 0.16)) * 100)}"></label>
                <div class="fm-logo-warn" id="fm-logo-warn" hidden>로고가 사진 칸 위에 있어요 — 사진을 가릴 수 있어요.</div>
              </div>` : `<div class="form-hint" style="margin-top:6px">설정 → 매장 관리에서 매장 로고를 올리면 프레임(벽 뒤 빼꼼은 벽)에 붙일 수 있어요.</div>`}
              <div class="fm-color-label">글꼴</div>
              <div class="card-font-row" id="fm-font">${Object.entries(R._CARD_FONTS).map(([k, f]) => `<button type="button" class="card-font-btn${k === p.font ? ' active' : ''}" data-key="${k}" style="font-family:${App.escapeHtml(R._cardFontStack(k))}">${f.name}</button>`).join('')}</div>
              <div class="fm-color-label">글자 색</div>${sw('fm-text', p.textColor)}
              <label class="card-toggle" style="margin-top:8px"><input type="checkbox" id="fm-band" ${p.band ? 'checked' : ''}> 글자 뒤에 띠 (무늬 위에서 잘 보이게)</label>
              <div id="fm-band-wrap" ${p.band ? '' : 'hidden'}><div class="fm-color-label">띠 색</div>${sw('fm-bandc', p.bandColor || '#FFFFFF')}</div>
            </div>
            <div class="form-group"><label class="form-label">프레임 이름</label>
              <input type="text" id="fm-name" maxlength="30" value="${App.escapeHtml(editing ? frame.name : (this.PRESETS[p.preset]?.name || '내 프레임'))}"></div>
          </div>
        </div>`,
      onSave: async () => {
        let name = (document.getElementById('fm-name')?.value || '').trim();
        if (!name) { App.showToast('프레임 이름을 입력해주세요.', 'error'); return; }
        const all = (await DB.getSetting('customFrames')) || [];
        const max = App.pages.settings.MAX_FRAMES || 50;
        const overwrite = editing && !saved.length; // 고치기: 처음 한 번은 그 프레임을 고치고, 그 뒤 저장은 새 프레임으로
        if (!overwrite && all.length >= max) { App.showToast(`프레임은 최대 ${max}개까지 등록할 수 있어요. 안 쓰는 프레임을 지운 뒤 저장해 주세요.`, 'error'); return; }
        // 같은 이름이 있으면 뒤에 번호 (연달아 저장해도 구분되게)
        if (!overwrite && all.some(f => f.name === name)) { let n = 2; while (all.some(f => f.name === `${name} ${n}`)) n++; name = `${name} ${n}`; }
        const r = await this.render(p);
        const image = r.canvas.toDataURL('image/png');
        r.canvas.width = r.canvas.height = 0;
        const rec = {
          id: overwrite ? frame.id : 'f' + Date.now() + Math.random().toString(36).slice(2, 5), name, image, mode: 'overlay', holes: r.holes, fw: r.fw, fh: r.fh, holeBg: r.holeBg || null,
          accentColor: p.textColor, textColor: p.textColor, enabled: overwrite ? frame.enabled !== false : true,
          maker: { ...p }, createdAt: (overwrite && frame.createdAt) || new Date().toISOString()
        };
        const idx = all.findIndex(f => f.id === rec.id);
        if (idx >= 0) all[idx] = rec; else all.push(rec);
        await DB.setSetting('customFrames', all);
        saved.push(name);
        // 창을 닫지 않는다 — 바로 다른 스타일을 골라 또 저장 (닫기는 아래 [닫기])
        App.showToast(`'${name}' 저장했어요 (${all.length}/${max}). 다른 스타일도 골라 이어서 저장할 수 있어요.`);
        const note = document.getElementById('fm-saved-note');
        if (note) { note.hidden = false; note.textContent = `이번에 저장한 프레임 ${saved.length}개: ${saved.join(', ')}`; }
        const sb = document.getElementById('modal-save'); if (sb) sb.dataset.label = '하나 더 저장';
        if (App.pages.settings._renderFrameLibrary) await App.pages.settings._renderFrameLibrary();
      }
    });
    setTimeout(() => this._wire(p), 50);
  },

  _wire(p) {
    const R = App.pages.records;
    Object.keys(R._CARD_FONTS).forEach(k => R._attachCardFontCss(k));
    let timer = null, token = 0;
    const draw = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const my = ++token;
        try {
          const r = await this.render(p);
          if (my !== token) { r.canvas.width = r.canvas.height = 0; return; }
          const img = document.getElementById('fm-img');
          if (img) img.src = this._previewUrl(r);
          r.canvas.width = r.canvas.height = 0;
        } catch (e) { console.warn('프레임 미리보기 실패:', e); }
      }, 120);
    };
    const $ = (id) => document.getElementById(id);
    const setActive = (box, attr, val) => box?.querySelectorAll(`[data-${attr}]`).forEach(b => b.classList.toggle('active', b.dataset[attr] === String(val)));
    const syncAll = () => {
      setActive($('fm-presets'), 'preset', p.preset);
      setActive($('fm-tpl'), 'tpl', p.tpl);
      setActive($('fm-bgtype'), 'bgtype', p.bgType);
      setActive($('fm-pattern'), 'pattern', p.pattern);
      setActive($('fm-radius'), 'radius', p.radius);
      setActive($('fm-border'), 'border', p.border);
      $('fm-font')?.querySelectorAll('[data-key]').forEach(b => b.classList.toggle('active', b.dataset.key === p.font));
      if ($('fm-pattern')) $('fm-pattern').hidden = p.bgType !== 'pattern';
      if ($('fm-photo-row')) $('fm-photo-row').hidden = p.bgType !== 'photo';
      if ($('fm-bg2-wrap')) { $('fm-bg2-wrap').hidden = !(p.bgType === 'gradient' || p.bgType === 'pattern'); const l = $('fm-bg2-wrap').querySelector('.fm-color-label'); if (l) l.textContent = p.bgType === 'gradient' ? '두 번째 색' : '무늬 색'; }
      if ($('fm-band-wrap')) $('fm-band-wrap').hidden = !p.band;
      if ($('fm-cellstyle')) $('fm-cellstyle').hidden = p.tpl === 'torn' || this._isPeek(p.tpl); // 찢어진 종이·빼꼼은 칸 모서리·테두리를 안 쓴다
      if ($('fm-wall-logo')) $('fm-wall-logo').hidden = !p.logo;
      const holeOn = this._isPeek(p.tpl) || p.tpl === 'torn';
      if ($('fm-holebg-wrap')) $('fm-holebg-wrap').hidden = !holeOn;
      $('fm-holebg-auto')?.querySelector('[data-holeauto]')?.classList.toggle('active', !p.holeBg || p.holeBg === 'auto');
      setActive($('fm-logo-style'), 'lstyle', p.logoStyle || (this._isPeek(p.tpl) ? 'sign' : 'plain'));
      setActive($('fm-logo-pos'), 'lpos', p.logoX != null ? '' : (p.logoPos || 'middle'));
      if ($('fm-logo-size') && document.activeElement !== $('fm-logo-size')) $('fm-logo-size').value = Math.round((p.logoSize != null ? p.logoSize : (this._isPeek(p.tpl) ? 0.28 : 0.16)) * 100);
      // 로고가 사진 칸 위면 알려 준다
      const warn = $('fm-logo-warn');
      if (warn) {
        let over = false;
        if (p.logo && p.logoX != null) { const T = this.TEMPLATES[p.tpl] || this.TEMPLATES.booth4; over = this.cells(p).some(cl => p.logoX * T.w > cl.x && p.logoX * T.w < cl.x + cl.w && p.logoY * T.h > cl.y && p.logoY * T.h < cl.y + cl.h); }
        warn.hidden = !over;
      }
      if ($('fm-band')) $('fm-band').checked = !!p.band;
      if ($('fm-title') && document.activeElement !== $('fm-title')) $('fm-title').value = p.title || '';
      if ($('fm-caption') && document.activeElement !== $('fm-caption')) $('fm-caption').value = p.caption || '';
      [['fm-bg1', p.bg1], ['fm-bg2', p.bg2], ['fm-text', p.textColor], ['fm-bandc', p.bandColor || '#FFFFFF'], ['fm-holebg', p.holeBg && p.holeBg !== 'auto' ? p.holeBg : '#000001']].forEach(([id, v]) => {
        const inp = $(id); if (!inp) return;
        inp.value = v;
        inp.closest('.fm-swatches')?.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('active', b.dataset.color.toLowerCase() === String(v).toLowerCase()));
      });
    };
    const on = (id, attr, fn) => $(id)?.addEventListener('click', (e) => { const b = e.target.closest(`[data-${attr}]`); if (!b) return; fn(b.dataset[attr]); syncAll(); draw(); });
    on('fm-presets', 'preset', (k) => {
      const pr = this.PRESETS[k]; if (!pr) return;
      // 찢어진 종이·빼꼼 스타일에서 일반 스타일로 오면 칸 배치도 네컷으로 돌린다
      // 로고 자리·크기는 칸 배치가 바뀌면 처음 자리로 (빼꼼 벽 자리가 다른 틀에서 사진 칸 위로 가지 않게)
      const nt = pr.tpl || (p.tpl === 'torn' || this._isPeek(p.tpl) ? 'booth4' : p.tpl);
      const keep = { tpl: nt, logo: p.logo, bgPhoto: p.bgPhoto, logoStyle: nt === p.tpl ? p.logoStyle : undefined, logoPos: p.logoPos,
        logoX: nt === p.tpl ? p.logoX : null, logoY: nt === p.tpl ? p.logoY : null, logoSize: nt === p.tpl ? p.logoSize : null };
      Object.keys(p).forEach(key => delete p[key]);
      Object.assign(p, { bandColor: '#FFFFFF', pattern: 'dots' }, pr, keep, { preset: k });
      const nm = $('fm-name'); if (nm && (!nm.value || Object.values(this.PRESETS).some(x => x.name === nm.value))) nm.value = pr.name;
    });
    on('fm-tpl', 'tpl', (k) => { if (p.tpl !== k) { p.logoX = p.logoY = p.logoSize = null; p.logoStyle = undefined; } p.tpl = k; });
    on('fm-bgtype', 'bgtype', (k) => { p.bgType = k; if (k === 'photo' && !p.bgPhoto) $('fm-photo')?.click(); });
    on('fm-pattern', 'pattern', (k) => { p.pattern = k; });
    on('fm-radius', 'radius', (k) => { p.radius = Number(k); });
    on('fm-border', 'border', (k) => { p.border = k; });
    $('fm-font')?.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (!b) return; p.font = b.dataset.key; syncAll(); draw(); });
    document.querySelectorAll('.fm-swatches').forEach(box => {
      const id = box.dataset.for;
      const set = (v) => { if (id === 'fm-bg1') p.bg1 = v; else if (id === 'fm-bg2') p.bg2 = v; else if (id === 'fm-text') p.textColor = v; else if (id === 'fm-holebg') p.holeBg = v; else p.bandColor = v; syncAll(); draw(); };
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) set(b.dataset.color); });
      box.querySelector('input[type="color"]')?.addEventListener('input', (e) => set(e.target.value));
    });
    $('fm-title')?.addEventListener('input', (e) => { p.title = e.target.value; draw(); });
    $('fm-caption')?.addEventListener('input', (e) => { p.caption = e.target.value; draw(); });
    $('fm-logo')?.addEventListener('change', (e) => { p.logo = e.target.checked; syncAll(); draw(); });
    on('fm-logo-style', 'lstyle', (k) => { p.logoStyle = k; });
    on('fm-logo-pos', 'lpos', (k) => {
      // 빠른 자리: 빼꼼은 벽 위·가운데·아래, 그 밖은 끌어 놓은 자리를 지우고 틀 기본 자리(위·가운데·아래 높이)로
      p.logoPos = k;
      if (this._isPeek(p.tpl)) { p.logoX = p.logoY = null; return; }
      const T = this.TEMPLATES[p.tpl] || this.TEMPLATES.booth4;
      // 위: 제목과 겹치지 않게 오른쪽 위 구석 · 가운데: 한가운데 · 아래: 틀의 기본 자리(아래 글자 위)
      if (k === 'bottom') { p.logoX = p.logoY = null; return; }
      const top = this.cells(p)[0].y;
      p.logoX = k === 'top' ? 0.86 : 0.5; p.logoY = k === 'top' ? Math.max(60, top / 2) / T.h : 0.5;
    });
    $('fm-holebg-auto')?.addEventListener('click', (e) => { if (!e.target.closest('[data-holeauto]')) return; p.holeBg = 'auto'; syncAll(); draw(); });
    $('fm-logo-size')?.addEventListener('input', (e) => { p.logoSize = Number(e.target.value) / 100; draw(); });
    // 미리보기를 누르면 로고가 그 자리로 (마우스는 끌기도)
    const img = $('fm-img');
    if (img) {
      let dragging = false;
      const place = (e) => { const r = img.getBoundingClientRect(); if (!r.width) return; p.logoX = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); p.logoY = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); syncAll(); draw(); };
      img.addEventListener('click', (e) => { if (!p.logo) return; place(e); });
      img.addEventListener('pointerdown', (e) => { if (p.logo && e.pointerType === 'mouse') { dragging = true; place(e); } });
      img.addEventListener('pointermove', (e) => { if (dragging) place(e); });
      window.addEventListener('pointerup', () => { dragging = false; });
      img.style.cursor = 'crosshair';
    }
    $('fm-band')?.addEventListener('change', (e) => { p.band = e.target.checked; syncAll(); draw(); });
    $('fm-photo-btn')?.addEventListener('click', () => $('fm-photo')?.click());
    $('fm-photo')?.addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      const data = await R._readCardPhotoFile(f);
      if (!data) { App.showToast('사진을 읽지 못했어요.', 'error'); return; }
      // 배경 사진은 그림 안에 이미 들어가므로, 고치기용 원본은 작게 보관 (프레임 목록이 무거워지지 않게)
      p.bgPhoto = await new Promise(res => App.resizeImage(data, (d) => res(d || data), 800, 0.8));
      p.bgType = 'photo'; syncAll(); draw();
    });
    syncAll();
    draw();
  }
};
