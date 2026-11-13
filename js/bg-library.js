// ===== 배경 보관함 (2026-11-11) =====
// 틀 없는 사진 카드: 사진 한 장 + '포토존' 배경 그림. 배경 그림에서 초록(#00FF00) 자리 = 사진(강아지)이 보이는 곳.
// 종류 두 가지
//   hole(구멍)   : 사진이 그림의 투명한 구멍 뒤로 보인다 (찢어진 종이·리스·꽃 아치). 사진은 끌고 키울 수 있다.
//   inside(속에) : 강아지가 물건 속에 들어간다 (상자·거품·봉투·가게 진열대). 사진 장면 대신 단색(사진관) 배경 +
//                  입체 꾸미기로 떼어 낸 강아지 · 몸통 선은 물건 앞 테두리(rim)에 자동 · 테두리 위 안쪽 그림자.
// 층: 뒤 사진(또는 단색+강아지) → 배경 그림 → 앞 강아지(입체 꾸미기) → 스티커. 미리보기와 저장이 같은 _generateCardCanvas 를 쓴다.
// 사장님이 직접 넣는 배경('＋ 새 배경 추가')은 설정 customBackgrounds 에 (customFrames 처럼 이 기기에만 · 백업에는 포함).
//   { id:'u_…', name, kind:'hole'|'inside', tintable, part, paper, rim:{y,x0,x1}|null, defaultColor, partColor, defaultScale,
//     image: dataURL(webp 또는 png, 긴 변 1600 이하), thumb: dataURL, hidden, createdAt }
//   '내 버전으로 저장'은 그림을 다시 저장하지 않고 원본을 가리킨다:
//   { id:'v_…', name, base: 원본 id, color, part, flip, defaultScale, ox, oy, backdrop, hidden, createdAt }
// 기본 배경 숨기기: 설정 bgHiddenBuiltins = [id…]
App.bgLib = {
  // 기본 배경 (assets/backgrounds — tools: scratchpad/bglib/build.py 로 초록을 미리 오려 webp 로)
  // paper: 흰 종이 밝기(불투명 화소 밝기 90번째 백분위) · rim: 앞 테두리 (그림 비율 0~1) · sink: 강아지가 테두리 아래로 들어가는 비율
  BUILTIN: [
    { id: 'torn', name: '찢어진 종이', kind: 'hole', tintable: true, paper: 0.928, defaultScale: 1.35, defaultColor: '#F7B3C2' },
    { id: 'ribbonbox', name: '리본 선물 상자', kind: 'inside', tintable: true, paper: 0.838, defaultScale: 1, rim: { y: 0.6883, x0: 0.1898, x1: 0.6506 }, defaultColor: '#FFFFFF', part: true, partColor: null, partName: '리본 색', tintName: '상자 색', sink: 0.4 },
    { id: 'giftbox', name: '흰 선물 상자', kind: 'inside', tintable: true, paper: 0.907, defaultScale: 1, rim: { y: 0.6084, x0: 0.2576, x1: 0.5686 }, defaultColor: '#F4B6C6', tintName: '상자 색', sink: 0.4 },
    { id: 'bubbles', name: '비눗방울 거품', kind: 'inside', tintable: true, paper: 0.955, defaultScale: 1, rim: { y: 0.622, x0: 0.2995, x1: 0.6988 }, defaultColor: '#FFFFFF', keepWhite: 0.35, sink: 0.3 },
    { id: 'envelope', name: '열린 봉투', kind: 'inside', tintable: true, paper: 0.919, defaultScale: 1, rim: { y: 0.62, x0: 0.22, x1: 0.76 }, defaultColor: '#F7DE9A', sink: 0.35 },
    { id: 'wreath', name: '크리스마스 리스', kind: 'hole', tintable: false, paper: 0.972, defaultScale: 1, part: true, partColor: null, partName: '빨간 부분 색' },
    { id: 'dryflower', name: '드라이플라워', kind: 'hole', tintable: false, paper: 0.84, defaultScale: 1 },
    { id: 'flowerarch', name: '꽃 아치', kind: 'hole', tintable: false, paper: 0.914, defaultScale: 1 },
    { id: 'icecream', name: '아이스크림 가게', kind: 'inside', tintable: false, paper: 0.937, defaultScale: 1, rim: { y: 0.7011, x0: 0.2353, x1: 0.7745 }, booth: true, sink: 0.22, sign: { x: 0.146, y: 0.165, w: 0.2 } },
    { id: 'taiyaki', name: '붕어빵 노점', kind: 'inside', tintable: false, paper: 0.897, defaultScale: 1, rim: { y: 0.6904, x0: 0.2879, x1: 0.7968 }, booth: true, sink: 0.22, sign: { x: 0.54, y: 0.1, w: 0.3 } },
    { id: 'bakery', name: '파스텔 베이커리', kind: 'inside', tintable: false, paper: 0.923, defaultScale: 1, rim: { y: 0.6904, x0: 0.2282, x1: 0.787 }, booth: true, sink: 0.22, sign: { x: 0.5, y: 0.1, w: 0.3 } }
  ],
  MAX_SIDE: 1600,
  MAX_USER: 30,
  TINTS: ['#FFFFFF', '#F7B3C2', '#A7D8F0', '#B8E6CF', '#FBE3A0', '#CDBDF2', '#FBC6A4', '#2E3A63'],
  PARTS: [[null, '원래'], ['#D9B45A', '금색'], ['#E79AB0', '분홍'], ['#8EC5E8', '하늘'], ['#2E3A63', '남색'], ['#F4F1EA', '흰색']],
  BACKDROPS: [['auto', '자동'], ['#F6E7EA', '연분홍'], ['#EAF2F8', '하늘'], ['#EEF6EE', '민트'], ['#FBF3E2', '크림'], ['#F0ECF8', '라벤더'], ['#F2F2F2', '연회색']],

  // ---------- 순수 함수 (tests/bg-library.test.js) ----------
  _c01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); },
  hexRgb(h) { const s = String(h || '').replace('#', ''); return [0, 2, 4].map(i => parseInt(s.substr(i, 2), 16) || 0); },
  // 초록 오리기: greenness = g - max(r,b) → alpha = 1 - clip((greenness-0.08)/0.30). 가장자리 초록 번짐: g = min(g, max(r,b))
  keyGreen(d) {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], mx = r > b ? r : b;
      const a = 1 - this._c01(((g - mx) / 255 - 0.08) / 0.30);
      if (g > mx) d[i + 1] = mx;
      d[i + 3] = Math.round(a * d[i + 3]);
    }
    return d;
  },
  // 알파 가장자리를 살짝 부드럽게 (1-2-1 번짐, 파이썬 GaussianBlur(0.6)과 비슷)
  smoothAlpha(d, w, h) {
    const A = new Uint8Array(w * h), T = new Float32Array(w * h);
    for (let i = 0; i < A.length; i++) A[i] = d[i * 4 + 3];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * w + x, l = x > 0 ? A[o - 1] : A[o], r = x < w - 1 ? A[o + 1] : A[o];
      T[o] = (l + 2 * A[o] + r) / 4;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const o = y * w + x, u = y > 0 ? T[o - w] : T[o], v = y < h - 1 ? T[o + w] : T[o];
      d[o * 4 + 3] = Math.round((u + 2 * T[o] + v) / 4);
    }
    return d;
  },
  lum(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b; },
  // 종이(흰 물건) 밝기 = 불투명 화소 밝기의 90번째 백분위 (0~1)
  paperLevel(d) {
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 230) { hist[Math.min(255, Math.round(this.lum(d[i], d[i + 1], d[i + 2])))]++; n++; }
    if (!n) return 1;
    let acc = 0; const want = n * 0.9;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= want) return Math.max(0.2, v / 255); }
    return 1;
  },
  // 빨간 계열(리본·열매)인 정도 0~1 — 색상각 0° 근처 · 채도 · 밝기로 부드럽게
  redWeight(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx <= 0 || mx === mn) return 0;
    const sat = (mx - mn) / mx;
    let hue;
    if (mx === r) hue = 60 * (((g - b) / (mx - mn)) % 6); else if (mx === g) hue = 60 * ((b - r) / (mx - mn) + 2); else hue = 60 * ((r - g) / (mx - mn) + 4);
    if (hue < 0) hue += 360;
    const dh = Math.min(hue, 360 - hue);
    return this._c01((35 - dh) / 15) * this._c01((sat - 0.3) / 0.2) * this._c01((mx / 255 - 0.15) / 0.15);
  },
  // 흰 물건에 색 입히기: 밝기/종이밝기(최대 1.05) × 색. keepWhite: 반짝임 남기기(거품). skipRed: 빨간 부분은 그대로(리본 상자)
  tint(d, hex, paper, opts = {}) {
    const [cr, cg, cb] = this.hexRgb(hex), p = paper || 1, kw = opts.keepWhite || 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const L = Math.min(1.05, this.lum(r, g, b) / 255 / p), Lw = Math.min(1, L);
      let nr = L * cr, ng = L * cg, nb = L * cb;
      if (kw) { nr = nr * (1 - kw) + Lw * 255 * kw; ng = ng * (1 - kw) + Lw * 255 * kw; nb = nb * (1 - kw) + Lw * 255 * kw; }
      const w = opts.skipRed ? this.redWeight(r, g, b) : 0;
      d[i] = Math.min(255, Math.round(nr * (1 - w) + r * w));
      d[i + 1] = Math.min(255, Math.round(ng * (1 - w) + g * w));
      d[i + 2] = Math.min(255, Math.round(nb * (1 - w) + b * w));
    }
    return d;
  },
  rgbHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  },
  hslRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255));
  },
  // 빨간 부분의 대표 밝기 (HSL 명도 중앙값)
  redRef(d) {
    const hist = new Uint32Array(101); let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128 || this.redWeight(d[i], d[i + 1], d[i + 2]) < 0.5) continue;
      hist[Math.round(this.rgbHsl(d[i], d[i + 1], d[i + 2])[2] * 100)]++; n++;
    }
    if (!n) return 0.4;
    let acc = 0;
    for (let v = 0; v <= 100; v++) { acc += hist[v]; if (acc >= n / 2) return v / 100; }
    return 0.4;
  },
  // 빨간 부분만 다른 색으로 — 고른 색의 색상·채도를 쓰고, 명암은 원래 빨강의 밝고 어두움을 고른 색 밝기 둘레로 옮긴다.
  // (곱하기로 하면 금색이 어두운 곳에서 올리브색이 된다 → 노랑 계열은 그늘을 주황 쪽으로 돌려 '금빛'으로)
  recolorPart(d, hex, ref) {
    const [th, ts, tl] = this.rgbHsl(...this.hexRgb(hex)), R = ref == null ? 0.4 : ref;
    const warm = th >= 35 && th <= 70;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2], w = this.redWeight(r, g, b);
      if (w <= 0) continue;
      const pl = this.rgbHsl(r, g, b)[2];
      const nl = Math.max(tl * 0.45, Math.min(Math.min(0.97, tl + 0.3), tl + (pl - R) * 0.8));
      const nh = warm ? th - Math.max(0, tl - nl) * 40 : th;
      const ns = warm ? Math.min(1, ts * (1 + Math.max(0, tl - nl) * 0.6)) : ts;
      const [nr, ng, nb] = this.hslRgb(nh, ns, nl);
      d[i] = Math.round(nr * w + r * (1 - w)); d[i + 1] = Math.round(ng * w + g * (1 - w)); d[i + 2] = Math.round(nb * w + b * (1 - w));
    }
    return d;
  },
  // 색 바꾸기가 되는 그림인가: 불투명 화소(빨간 부분 빼고) 대부분이 흰·회색(채도 낮고 밝음)
  isTintable(d) {
    let n = 0, ok = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (this.redWeight(r, g, b) > 0.5) continue;
      n++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if ((mx ? (mx - mn) / mx : 0) < 0.2 && this.lum(r, g, b) > 140) ok++;
    }
    return n > 0 && ok / n >= 0.6;
  },
  // 빨간 부분이 조금이라도 있나 (불투명의 1% 이상)
  hasRed(d) {
    let n = 0, red = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; n++; if (this.redWeight(d[i], d[i + 1], d[i + 2]) > 0.5) red++; }
    return n > 0 && red / n >= 0.01;
  },
  alphaOf(d) { const A = new Uint8Array(d.length / 4); for (let i = 0; i < A.length; i++) A[i] = d[i * 4 + 3]; return A; },
  // 종류 고르기: 투명한 곳이 위 가장자리에 닿고 아래쪽에 불투명 물건이 있으면 'inside', 아니면 'hole'
  detectKind(A, w, h) {
    let top = 0;
    for (let y = 0; y < Math.min(3, h); y++) for (let x = 0; x < w; x++) if (A[y * w + x] < 128) top++;
    if (top / (w * Math.min(3, h)) < 0.3) return 'hole';
    let low = 0; const y0 = Math.floor(h * 0.75);
    for (let y = y0; y < h; y++) for (let x = 0; x < w; x++) if (A[y * w + x] >= 128) low++;
    return low / (w * (h - y0)) >= 0.3 ? 'inside' : 'hole';
  },
  // 앞 테두리: 아래 30% 줄에 있는 물건의 가로 가운데 40% 칸들을 아래에서 위로 — 빈 곳 건너뛰고, 앞판(불투명) 지나, 처음 투명해지는 줄.
  // 여러 칸의 가운데값. x0·x1 은 그 줄 바로 위의 투명한 폭(구멍 입구). 모두 0~1 비율. 못 찾으면 null
  findRim(A, w, h) {
    const op = (x, y) => A[y * w + x] >= 128;
    let x0 = w, x1 = -1;
    for (let y = Math.floor(h * 0.7); y < h; y++) for (let x = 0; x < w; x++) if (op(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    if (x1 < 0) return null;
    const c = (x0 + x1) / 2, half = (x1 - x0) * 0.2, step = Math.max(1, Math.round(w / 280)), ys = [];
    for (let x = Math.round(c - half); x <= Math.round(c + half); x += step) {
      let y = h - 1;
      while (y > 0 && !op(x, y)) y--;
      while (y > 0 && op(x, y)) y--;
      if (y > 0) ys.push(y);
    }
    if (!ys.length) return null;
    ys.sort((a, b) => a - b);
    const ry = ys[Math.floor(ys.length / 2)], row = Math.max(0, ry - 3), cx = Math.round(c);
    let l = Math.round(c - half), r = Math.round(c + half);
    if (!op(cx, row)) { l = r = cx; while (l > 0 && !op(l - 1, row)) l--; while (r < w - 1 && !op(r + 1, row)) r++; }
    const k = v => Math.round(v * 10000) / 10000;
    return { y: k(ry / h), x0: k(l / w), x1: k(r / w) };
  },
  // 카드 위 배경 자리: 카드를 덮게(cover) × 크기. ox·oy(카드 비율)는 남는 만큼 + SLACK 까지 —
  // 100%(남는 곳 없음)에서도 옮겨진다. 밖으로 나간 자리는 drawCard 가 그림 끝 줄을 늘여 채운다 (미리보기·저장 같음)
  SLACK: 0.12,
  geom(bw, bh, W, H, sc) {
    const k = Math.max(W / bw, H / bh) * Math.max(1, Math.min(1.7, sc.scale || 1));
    const w = bw * k, h = bh * k, mx = (w - W) / 2 / W + this.SLACK, my = (h - H) / 2 / H + this.SLACK;
    const ox = Math.max(-mx, Math.min(mx, sc.ox || 0)), oy = Math.max(-my, Math.min(my, sc.oy || 0));
    return { x: (W - w) / 2 + ox * W, y: (H - h) / 2 + oy * H, w, h, ox, oy };
  },
  // 그림이 카드를 다 덮지 못한 띠: 그림 끝을 거울처럼 비춰 채운다 (꽃·종이 무늬가 자연스럽게 이어지게). g: geom
  // 순수 함수: 채울 띠 목록 [{ sx, sy, sw, sh, dx, dy, dw, dh, fx, fy }] (그림 화소 → 카드 좌표, fx·fy: 가로·세로 뒤집어 그리기)
  edgeStrips(bw, bh, g, W, H) {
    const out = [], x0 = g.x, y0 = g.y, x1 = g.x + g.w, y1 = g.y + g.h;
    const L = Math.max(0, x0), R = Math.max(0, W - x1), T = Math.max(0, y0), B = Math.max(0, H - y1);
    const cx0 = Math.max(0, x0), cx1 = Math.min(W, x1), cy0 = Math.max(0, y0), cy1 = Math.min(H, y1);
    const kx = bw / g.w, ky = bh / g.h;
    const midX = { sx: (cx0 - x0) * kx, sw: (cx1 - cx0) * kx, dx: cx0, dw: cx1 - cx0 };
    const midY = { sy: (cy0 - y0) * ky, sh: (cy1 - cy0) * ky, dy: cy0, dh: cy1 - cy0 };
    const left = { sx: 0, sw: Math.min(bw, L * kx), dx: 0, dw: L }, right = { sx: Math.max(0, bw - R * kx), sw: Math.min(bw, R * kx), dx: x1, dw: R };
    const top = { sy: 0, sh: Math.min(bh, T * ky), dy: 0, dh: T }, bottom = { sy: Math.max(0, bh - B * ky), sh: Math.min(bh, B * ky), dy: y1, dh: B };
    if (L > 0.5) out.push({ ...left, ...midY, fx: true, fy: false });
    if (R > 0.5) out.push({ ...right, ...midY, fx: true, fy: false });
    if (T > 0.5) out.push({ ...midX, ...top, fx: false, fy: true });
    if (B > 0.5) out.push({ ...midX, ...bottom, fx: false, fy: true });
    if (L > 0.5 && T > 0.5) out.push({ ...left, ...top, fx: true, fy: true });
    if (R > 0.5 && T > 0.5) out.push({ ...right, ...top, fx: true, fy: true });
    if (L > 0.5 && B > 0.5) out.push({ ...left, ...bottom, fx: true, fy: true });
    if (R > 0.5 && B > 0.5) out.push({ ...right, ...bottom, fx: true, fy: true });
    return out;
  },
  // 배경 그림 안 비율 x → 뒤집기 반영
  fx(def, sc, x) { return sc.flip ? 1 - x : x; },
  // 속에 들어가는 배경: 떼어 낸 강아지 자리 (bb: 강아지 네모 0~1, 사진 iw×ih, g: 배경 자리)
  dogPlace(def, sc, bb, iw, ih, g, W, H, meta) {
    const rim = def.rim || { y: 0.7, x0: 0.25, x1: 0.75 };
    const b = bb || { x: 0, y: 0, w: 1, h: 1 }, m = meta || {};
    const zoom = Math.max(0.3, Math.min(3, m.zoom || 1));
    const openW = Math.abs(rim.x1 - rim.x0) * g.w;
    const dogW = Math.min(openW * 0.85, W * 0.62) * zoom;
    const k = dogW / Math.max(1, b.w * iw), dogH = b.h * ih * k;
    const rimY = g.y + rim.y * g.h;
    const cx = g.x + this.fx(def, sc, (rim.x0 + rim.x1) / 2) * g.w - (m.offsetX || 0) / 100 * W;
    const top = rimY - dogH * (1 - (def.sink == null ? 0.35 : def.sink)) - (m.offsetY || 0) / 100 * H;
    const ox = cx - (b.x + b.w / 2) * iw * k, oy = top - b.y * ih * k;
    return { ox, oy, k, rimY, cx, dogW, line: { a: 0, x: (cx - ox) / (iw * k), y: (rimY - oy) / (ih * k) } };
  },
  // 단색 배경 '자동': 물건 색을 아주 옅게 (흰 물건이면 연분홍)
  autoBackdrop(color) {
    const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#FFFFFF';
    const [r, g, b] = this.hexRgb(c), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx - mn < 18) return mx < 120 ? '#E9ECF5' : '#F6E7EA';
    return '#' + [r, g, b].map(v => Math.round(v * 0.3 + 255 * 0.7).toString(16).padStart(2, '0')).join('');
  },

  // ---------- 보관함 ----------
  state: null,      // 카드 창 안 지금 배경 { id, color, part, backdrop, scale, ox, oy, flip }
  _user: null,      // customBackgrounds
  _hidden: null,    // bgHiddenBuiltins
  _showHidden: false,
  dragOn: false,
  async load() {
    if (this._user) return;
    this._user = (await DB.getSetting('customBackgrounds')) || [];
    this._hidden = (await DB.getSetting('bgHiddenBuiltins')) || [];
  },
  async _saveUser() { await DB.setSetting('customBackgrounds', this._user); },
  _builtin(id) { const b = this.BUILTIN.find(x => x.id === id); return b ? { ...b, src: `assets/backgrounds/${b.id}.webp`, thumb: `assets/backgrounds/thumbs/${b.id}.webp`, builtin: true } : null; },
  // id → 쓸 정보 (내 버전은 원본 위에 덮어쓴다)
  def(id, depth = 0) {
    if (!id || depth > 3) return null;
    const b = this._builtin(id);
    if (b) return b;
    const u = (this._user || []).find(x => x.id === id);
    if (!u) return null;
    if (u.base) {
      const base = this.def(u.base, depth + 1);
      if (!base) return null;
      return { ...base, id: u.id, name: u.name, base: u.base, builtin: false, version: true, hidden: u.hidden,
        defaultColor: u.color ?? base.defaultColor, partColor: u.part ?? base.partColor, flip: !!u.flip,
        defaultScale: u.defaultScale || base.defaultScale, ox: u.ox || 0, oy: u.oy || 0, backdrop: u.backdrop || null };
    }
    return { ...u, src: u.image, builtin: false };
  },
  list(withHidden) {
    const b = this.BUILTIN.map(x => this._builtin(x.id)).map(x => ({ ...x, hidden: (this._hidden || []).includes(x.id) }));
    const u = (this._user || []).map(x => this.def(x.id)).filter(Boolean);
    return [...u, ...b].filter(x => withHidden || !x.hidden);
  },
  stateFor(def) {
    return { id: def.id, color: def.tintable ? (def.defaultColor || '#FFFFFF') : null, part: def.part ? (def.partColor || null) : null,
      backdrop: def.backdrop || 'auto', scale: def.defaultScale || 1, ox: def.ox || 0, oy: def.oy || 0, flip: !!def.flip };
  },
  // _designFrom 이 카드 설정에 넣는다 (미리보기·저장 같은 값)
  cardScene() {
    if (!this.state) { const d = this.def('torn'); this.state = this.stateFor(d); }
    return { ...this.state };
  },

  // ---------- 그림 준비 (색 입히기는 색마다 한 번만 · 최근 6개 기억) ----------
  _prep: new Map(),
  // 색 입힌 배경 그림을 놓아 준다 (카드 창을 닫고 한참 뒤 — records._releaseCardMemory). 다음에 쓰면 다시 만든다
  releaseMemory() {
    for (const c of this._prep.values()) { try { c.width = c.height = 0; } catch (_) {} }
    this._prep.clear();
  },
  _refs: new Map(),
  async prepared(def, color, part) {
    const R = App.pages.records;
    const img = await R._loadImg(def.src);
    if (!img) return null;
    const tintOn = def.tintable && color && color.toUpperCase() !== '#FFFFFF';
    const partOn = def.part && part;
    if (!tintOn && !partOn) return img;
    const key = def.src.length + '|' + def.src.slice(-40) + '|' + (tintOn ? color : '') + '|' + (partOn ? part : '');
    const hit = this._prep.get(key);
    if (hit) { this._prep.delete(key); this._prep.set(key, hit); return hit; }
    // 1600px 넘는 그림은 줄여서 (휴대폰이 멈추지 않게)
    const s = Math.min(1, this.MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, c.width, c.height);
    const id = x.getImageData(0, 0, c.width, c.height);
    // 색 입히기 먼저 (빨간 부분은 건너뜀) → 그다음 빨간 부분 색 바꾸기 (거꾸로 하면 바꾼 리본 색이 다시 물든다)
    if (tintOn) this.tint(id.data, color, def.paper, { keepWhite: def.keepWhite, skipRed: !!def.part });
    // 빨간 부분 대표 밝기는 그림마다 한 번만 (def 는 부를 때마다 새 객체라 그림 주소로 기억)
    if (partOn) {
      const rk = def.src.length + '|' + def.src.slice(-40);
      if (!this._refs.has(rk)) this._refs.set(rk, this.redRef(id.data));
      this.recolorPart(id.data, part, this._refs.get(rk));
    }
    x.putImageData(id, 0, 0);
    this._prep.set(key, c);
    while (this._prep.size > 6) { const [k0, c0] = this._prep.entries().next().value; this._prep.delete(k0); c0.width = c0.height = 0; }
    return c;
  },

  // ---------- 카드에 그리기 (_generateCardCanvas 'scene') ----------
  // o: { img, drawPhoto(x,y,w,h), front: 입체 꾸미기 상태|null, pushFront(place) }
  async drawCard(ctx, W, H, sc, o) {
    await this.load();
    const def = this.def(sc && sc.id);
    const bg = def ? await this.prepared(def, sc.color, sc.part) : null;
    if (!bg) {
      // 배경 그림을 못 받았다(인터넷 없음 등) — 사진만 그리고, 왜 배경이 없는지 한 번 알린다
      if (def && (!this._warnAt || Date.now() - this._warnAt > 8000)) { this._warnAt = Date.now(); App.showToast(def.builtin ? '배경 그림을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.' : '배경 그림을 읽지 못했어요. 다른 배경을 골라 주세요.', 'error'); }
      o.drawPhoto(0, 0, W, H); return;
    }
    const g = this.geom(bg.width, bg.height, W, H, sc);
    if (this.state && this.state.id === sc.id) { this.state.ox = g.ox; this.state.oy = g.oy; } // 끌다 끝에 닿으면 거기서 멈춤
    const img = o.img, st = o.front;
    const inside = def.kind === 'inside' && img && st && st.mask;
    let P = null;
    if (inside) {
      // 사진 장면 대신 단색 배경 (아래로 갈수록 아주 조금 어둡게 — 사진관 배경지 느낌)
      const bd = sc.backdrop && sc.backdrop !== 'auto' ? sc.backdrop : this.autoBackdrop(sc.color);
      ctx.fillStyle = bd; ctx.fillRect(0, 0, W, H);
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.07)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      P = this.dogPlace(def, sc, st.bbox, img.width, img.height, g, W, H, img._meta);
      const dw = img.width * P.k, dh = img.height * P.k;
      const mc = await App.cutout.maskCanvas(st, st.mw / dw);
      if (mc) {
        // 뒤 강아지 (떼어 낸 모양) + 뒤 벽에 옅은 그림자
        const t = document.createElement('canvas'); t.width = W; t.height = H;
        const tx = t.getContext('2d');
        tx.imageSmoothingQuality = 'high';
        tx.drawImage(img, P.ox, P.oy, dw, dh);
        tx.globalCompositeOperation = 'destination-in';
        tx.drawImage(mc, P.ox, P.oy, dw, dh);
        const s = W / 1080, far = W + 60;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 28 * s; ctx.shadowOffsetX = far + 12 * s; ctx.shadowOffsetY = 14 * s;
        ctx.drawImage(t, -far, 0);
        ctx.restore();
        ctx.drawImage(t, 0, 0);
        t.width = t.height = 0;
      }
    } else {
      o.drawPhoto(0, 0, W, H);
    }
    ctx.save();
    // 뒤집기는 카드 전체를 거울로 비춘 좌표에서 그린다 (그림 자리 g 는 그대로, 띠 채우기도 같은 좌표에서)
    if (sc.flip) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    const gx = sc.flip ? { ...g, x: W - g.x - g.w } : g;
    ctx.drawImage(bg, gx.x, gx.y, gx.w, gx.h);
    for (const t of this.edgeStrips(bg.width, bg.height, gx, W, H)) {
      if (t.sw < 0.5 || t.sh < 0.5) continue;
      ctx.save();
      ctx.translate(t.fx ? t.dx + t.dw : t.dx, t.fy ? t.dy + t.dh : t.dy);
      ctx.scale(t.fx ? -1 : 1, t.fy ? -1 : 1);
      ctx.drawImage(bg, t.sx, t.sy, t.sw, t.sh, -0.25, -0.25, t.dw + 0.5, t.dh + 0.5);
      ctx.restore();
    }
    ctx.restore();
    if (inside) {
      if (def.booth) {
        // 진열대 위 발밑 그림자
        const rx = P.dogW * 0.42, ry = Math.max(6, rx * 0.09), cy = P.rimY + ry * 0.4;
        ctx.save();
        ctx.translate(P.cx, cy); ctx.scale(1, ry / rx);
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        rg.addColorStop(0, 'rgba(40,25,10,0.38)'); rg.addColorStop(0.6, 'rgba(40,25,10,0.16)'); rg.addColorStop(1, 'rgba(40,25,10,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      o.pushFront({ slot: img._slot, img, ox: P.ox, oy: P.oy, k: P.k, line: P.line, shade: def.booth ? null : { y: P.rimY, h: 120 * W / 1080 } });
    }
  },

  // ---------- 카드 창 ----------
  _R() { return App.pages.records; },
  _layout() { return document.querySelector('#card-pick-layout .card-pick-btn.active')?.dataset.key; },
  _on() { return this._layout() === 'scene'; },
  _changed() { this._R()._scheduleCardPreview(); },
  // 카드 창이 열릴 때 (openPhotoCard 의 Wire up)
  async wire() {
    await this.load();
    // 지운 배경을 가리키던 상태면 기본 배경으로 바꾸고 미리보기도 다시 (첫 미리보기가 먼저 그려졌을 수 있다)
    const gone = !!(this.state && !this.def(this.state.id));
    if (!this.state || gone) this.state = this.stateFor(this.def('torn'));
    if (gone) this._changed();
    this.dragOn = false;
    const stage = document.querySelector('.card-maker .card-live-stage');
    if (stage && !document.getElementById('card-live-bgmove')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'card-live-bgmove'; b.className = 'card-live-move card-live-bgmove'; b.hidden = true; b.textContent = '✥ 배경 옮기기';
      b.addEventListener('click', () => this.setDrag(!this.dragOn));
      stage.appendChild(b);
    }
    this._wireDrag();
    this.renderPanel();
  },
  setDrag(on) {
    this.dragOn = !!on && this._on();
    const R = this._R();
    if (this.dragOn && R._photoDragOn) { R._photoDragOn = false; R._syncPhotoDrag(); }
    this.sync();
    if (this.dragOn) App.showToast('미리보기를 끌어 배경을 옮기세요.', 'info');
  },
  _wireDrag() {
    const layer = document.getElementById('card-sticker-layer');
    if (!layer || layer._bglWired) return;
    layer._bglWired = true;
    let d = null;
    layer.addEventListener('pointerdown', (e) => {
      if (!this.dragOn || !this._on() || e.target.closest('.card-sticker')) return;
      e.preventDefault(); e.stopImmediatePropagation();
      try { layer.setPointerCapture(e.pointerId); } catch (_) {}
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: this.state.ox || 0, oy: this.state.oy || 0 };
    }, true);
    layer.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      e.stopImmediatePropagation();
      const r = layer.getBoundingClientRect(); if (!r.width) return;
      this.state.ox = d.ox + (e.clientX - d.x) / r.width;
      this.state.oy = d.oy + (e.clientY - d.y) / r.height;
      this._R()._photoDragPreview();
    }, true);
    const end = (e) => { if (d && e.pointerId === d.id) { d = null; e.stopImmediatePropagation(); } };
    layer.addEventListener('pointerup', end, true);
    layer.addEventListener('pointercancel', end, true);
  },
  // 미리보기마다 (_renderCardPreview) — 단추 보이기 · 떼기 안내 · 투명 사진은 바로 떼기
  sync() {
    const on = this._on(), R = this._R();
    const photo = (R._cardPhotos || [])[0];
    const bm = document.getElementById('card-live-bgmove');
    if (!on) this.dragOn = false;
    if (bm) {
      bm.hidden = !on || !photo || !!document.getElementById('card-live-img')?.hidden;
      bm.classList.toggle('on', this.dragOn); bm.textContent = this.dragOn ? '✓ 옮기기 끝' : '✥ 배경 옮기기';
      bm.setAttribute('aria-pressed', this.dragOn ? 'true' : 'false');
    }
    R._syncMoveSurface?.();
    const def = on ? this.def(this.state?.id) : null;
    const st = (R._cardFront || [])[0];
    const needCut = !!(def && def.kind === 'inside' && photo && !(st && st.on && st.src === photo && st.mask));
    const cut = document.getElementById('bgl-cut');
    if (cut) cut.hidden = !needCut;
    if (needCut && !this._autoCutBusy && this._autoCutFor !== photo) {
      // 아이폰에서 떼어 낸(배경 투명) 사진은 묻지 않고 바로 쓴다
      this._autoCutFor = photo; this._autoCutBusy = true;
      R._loadImg(photo).then(img => {
        if (img && R._imgHasAlpha(img) && R._cardPhotos[0] === photo) return App.cutout.onFrontBtn(0);
      }).catch(() => {}).finally(() => { this._autoCutBusy = false; });
    }
    // 속에 들어가는 배경에서는 몸통 선이 자동 — 손잡이는 감춘다
    if (def && def.kind === 'inside' && R._frontEditSlot === 0) { R._frontEditSlot = null; App.cutout.syncLineUI?.(); }
  },
  onLayout(isScene) {
    const box = document.getElementById('scene-options');
    if (box) box.style.display = isScene ? 'block' : 'none';
    if (isScene) {
      // 배경 그림과 내 프레임은 같이 못 쓴다 — 프레임을 고른 상태면 흰 배경으로
      const act = document.querySelector('#card-pick-theme .card-pick-btn.active');
      if (act && String(act.dataset.key || '').startsWith('frame:')) document.querySelector('#card-pick-theme .card-pick-btn[data-key="classic"]')?.click();
      this._signSticker();
    }
    this.sync();
  },
  _chips(row, list, cur, custom) {
    return `<div class="card-bg-row bgl-row" data-row="${row}">${list.map(([v, n]) => `<button type="button" class="card-bg-chip${(cur || null) === v ? ' active' : ''}" data-v="${v == null ? '' : v}" title="${n}" aria-label="${n}"${v && v !== 'auto' ? ` style="--c:${v}"` : ' data-auto="1"'}><i></i><span>${n}</span></button>`).join('')}
      <label class="card-bg-chip card-bg-add" title="원하는 색 고르기"><i>＋</i><span>직접</span><input type="color" data-custom="${row}" value="${/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : custom}" aria-label="색 직접 고르기"></label></div>`;
  },
  renderPanel() {
    const box = document.getElementById('scene-options');
    if (!box) return;
    const sc = this.state, def = this.def(sc.id) || {};
    const items = this.list(this._showHidden), nHidden = this.list(true).length - this.list(false).length;
    const esc = s => App.escapeHtml(String(s || ''));
    const tintRow = def.tintable ? `<label class="form-label bgl-lab">${esc(def.tintName || '색')}</label>${this._chips('color', this.TINTS.map(c => [c, c === '#FFFFFF' ? '흰색' : '색']), sc.color, '#F7B3C2')}` : '';
    const partRow = def.part ? `<label class="form-label bgl-lab">${esc(def.partName || '빨간 부분 색')}</label>${this._chips('part', this.PARTS, sc.part, '#D9B45A')}` : '';
    const bdRow = def.kind === 'inside' ? `<label class="form-label bgl-lab">뒤 배경색 <span class="card-sub">· 강아지 뒤 사진관 배경</span></label>${this._chips('backdrop', this.BACKDROPS, sc.backdrop || 'auto', '#F6E7EA')}` : '';
    box.innerHTML = `
      <label class="form-label">배경 그림 <span class="card-sub">· 사진 한 장 + 포토존 그림</span></label>
      <div class="bgl-grid" role="list">
        ${items.map(it => `<button type="button" class="bgl-item${it.id === sc.id ? ' active' : ''}${it.hidden ? ' is-hidden' : ''}" data-id="${esc(it.id)}" role="listitem">
          <span class="bgl-thumb"><img src="${esc(it.thumb || it.src)}" alt="" loading="lazy"${it.version && it.flip ? ' style="transform:scaleX(-1)"' : ''}></span>
          <span class="bgl-name">${esc(it.name)}</span>${it.kind === 'inside' ? '<small>속에 쏙</small>' : ''}</button>`).join('')}
        <button type="button" class="bgl-item bgl-add" id="bgl-add"><span class="bgl-thumb"><b>＋</b></span><span class="bgl-name">새 배경 추가</span></button>
      </div>
      ${nHidden ? `<button type="button" class="btn btn-sm btn-ghost" id="bgl-show-hidden">${this._showHidden ? '숨긴 배경 다시 감추기' : `숨긴 배경 ${nHidden}개 보기`}</button>` : ''}
      <div id="bgl-cut" class="bgl-cut" hidden><span>이 배경은 강아지가 속에 들어가요. 강아지를 먼저 떼어내요.</span><button type="button" class="btn btn-sm btn-primary" id="bgl-cut-btn">✂ 강아지 떼어내기</button></div>
      <label class="form-label bgl-lab">크기 <b id="bgl-scale-v">${Math.round((sc.scale || 1) * 100)}%</b></label>
      <input type="range" id="bgl-scale" min="100" max="170" step="1" value="${Math.round((sc.scale || 1) * 100)}" class="bgl-range" aria-label="배경 크기">
      ${tintRow}${partRow}${bdRow}
      <div class="bgl-acts">
        <button type="button" class="btn btn-sm btn-secondary" id="bgl-flip">↔ 좌우 뒤집기</button>
        <button type="button" class="btn btn-sm btn-secondary" id="bgl-reset">↺ 처음대로</button>
        <button type="button" class="btn btn-sm btn-primary" id="bgl-savever">☆ 내 버전으로 저장</button>
      </div>
      <div class="bgl-acts bgl-manage">
        ${def.builtin ? '' : '<button type="button" class="btn btn-sm btn-ghost" id="bgl-rename">이름 바꾸기</button>'}
        <button type="button" class="btn btn-sm btn-ghost" id="bgl-hide">${def.hidden ? '다시 보이기' : '목록에서 숨기기'}</button>
        ${def.builtin ? '' : '<button type="button" class="btn btn-sm btn-ghost bgl-del" id="bgl-del">지우기</button>'}
      </div>
      <div class="form-hint">미리보기 위 [✥ 배경 옮기기]로 배경을 끌어 옮기고, [✥ 강아지 옮기기]로 사진을 옮겨요. 매장 이름은 '글자' 탭에서 넣어요.</div>`;
    this._wirePanel(box);
    this.sync();
  },
  _wirePanel(box) {
    const sc = this.state;
    box.querySelectorAll('.bgl-item[data-id]').forEach(b => b.addEventListener('click', () => this.pick(b.dataset.id)));
    box.querySelector('#bgl-add')?.addEventListener('click', () => this.openImport());
    box.querySelector('#bgl-show-hidden')?.addEventListener('click', () => { this._showHidden = !this._showHidden; this.renderPanel(); });
    box.querySelector('#bgl-cut-btn')?.addEventListener('click', () => {
      if (!(this._R()._cardPhotos || [])[0]) { App.showToast('사진을 먼저 골라 주세요.', 'info'); return; }
      App.cutout.onFrontBtn(0);
    });
    const sl = box.querySelector('#bgl-scale'), sv = box.querySelector('#bgl-scale-v');
    sl?.addEventListener('input', () => { sc.scale = Number(sl.value) / 100; if (sv) sv.textContent = sl.value + '%'; this._R()._photoDragPreview(); this._signSticker(); });
    box.querySelectorAll('.bgl-row').forEach(row => {
      const k = row.dataset.row;
      const set = (v) => {
        sc[k] = v || null;
        row.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('active', (x.dataset.v || null) === (v || null)));
        this._changed();
      };
      row.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => set(b.dataset.v)));
      // 색 고르는 창은 움직일 때마다가 아니라 놓을 때 (색마다 한 번씩 색 입히기를 하므로)
      row.querySelector('input[type=color]')?.addEventListener('change', (e) => set(e.target.value));
    });
    box.querySelector('#bgl-flip')?.addEventListener('click', () => { sc.flip = !sc.flip; sc.ox = -(sc.ox || 0); this._changed(); this._signSticker(); });
    box.querySelector('#bgl-reset')?.addEventListener('click', () => this.pick(sc.id));
    box.querySelector('#bgl-savever')?.addEventListener('click', () => this.saveVersion());
    box.querySelector('#bgl-rename')?.addEventListener('click', () => this.rename(sc.id));
    box.querySelector('#bgl-hide')?.addEventListener('click', () => this.toggleHide(sc.id));
    box.querySelector('#bgl-del')?.addEventListener('click', () => this.remove(sc.id));
  },
  pick(id) {
    const def = this.def(id);
    if (!def) return;
    this.state = this.stateFor(def);
    this.renderPanel();
    this._changed();
    this._signSticker();
  },
  // 가게 진열대의 빈 둥근 간판 자리에 매장 이름 글자 스티커 (한 번만, 배경을 바꾸면 따라 옮기거나 뺀다)
  async _signSticker() {
    const R = this._R();
    if (!R._cardStickers) return;
    const def = this._on() ? this.def(this.state?.id) : null;
    const old = R._cardStickers.find(s => s.signText);
    if (!def || !def.sign) {
      if (old) { R._cardStickers = R._cardStickers.filter(s => !s.signText); R._stickerSel = -1; R._renderStickerLayer(); }
      return;
    }
    const img = await R._loadImg(def.src).catch(() => null);
    if (!img) return;
    const W = 1080, H = 1350, g = this.geom(img.width, img.height, W, H, this.state);
    const pos = { x: (g.x + this.fx(def, this.state, def.sign.x) * g.w) / W, y: (g.y + def.sign.y * g.h) / H, size: def.sign.w * g.w / W * 0.8 };
    if (old) { Object.assign(old, pos); R._renderStickerLayer(); return; }
    if (this._signBusy) return;
    const shop = await DB.getSetting('shopName');
    if (!shop) return;
    this._signBusy = true;
    try {
      const r = await R._makeTextSticker(String(shop).slice(0, 14), 'plain', 'system', '#5B4636');
      if (!this._on() || !this.def(this.state?.id)?.sign || R._cardStickers.some(s => s.signText)) return;
      R._cardStickers.push({ text: String(shop).slice(0, 14), style: 'plain', color: '#5B4636', fontKey: 'system', src: r.src, w: r.w, ...pos, rot: 0, signText: true });
      R._renderStickerLayer();
    } catch (e) { console.warn('간판 글자 실패:', e); }
    finally { this._signBusy = false; }
  },
  _newId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  async saveVersion() {
    const sc = this.state, def = this.def(sc.id);
    if (!def) return;
    if ((this._user || []).length >= this.MAX_USER) { App.showToast(`내 배경은 ${this.MAX_USER}개까지예요. 안 쓰는 것을 지워 주세요.`, 'error'); return; }
    const n = (this._user || []).filter(u => u.base === (def.base || def.id)).length + 1;
    const name = prompt('이 버전 이름', `${def.name} ${n}`);
    if (name == null) return;
    const it = { id: this._newId('v_'), name: String(name).trim().slice(0, 20) || `${def.name} ${n}`, base: def.base || def.id,
      color: sc.color, part: sc.part, flip: !!sc.flip, defaultScale: sc.scale, ox: sc.ox || 0, oy: sc.oy || 0, backdrop: sc.backdrop || null, hidden: false, createdAt: new Date().toISOString() };
    this._user.unshift(it);
    await this._saveUser();
    this.state = { ...sc, id: it.id };
    this.renderPanel();
    App.showToast('내 배경에 저장했어요.');
  },
  async rename(id) {
    const u = (this._user || []).find(x => x.id === id);
    if (!u) return;
    const name = prompt('새 이름', u.name);
    if (name == null || !String(name).trim()) return;
    u.name = String(name).trim().slice(0, 20);
    await this._saveUser();
    this.renderPanel();
  },
  async toggleHide(id) {
    const u = (this._user || []).find(x => x.id === id);
    let hidden;
    if (u) { u.hidden = !u.hidden; hidden = u.hidden; await this._saveUser(); }
    else {
      const set = new Set(this._hidden || []);
      hidden = !set.has(id);
      if (hidden) set.add(id); else set.delete(id);
      this._hidden = [...set];
      await DB.setSetting('bgHiddenBuiltins', this._hidden);
    }
    App.showToast(hidden ? '목록에서 숨겼어요. 아래 \'숨긴 배경 보기\'로 다시 볼 수 있어요.' : '다시 보이게 했어요.');
    this.renderPanel();
  },
  async remove(id) {
    const u = (this._user || []).find(x => x.id === id);
    if (!u) return;
    const kids = this._user.filter(x => x.base === id);
    if (!confirm(`'${u.name}'을(를) 지울까요?${kids.length ? `\n이 그림으로 만든 내 버전 ${kids.length}개도 같이 지워져요.` : ''}`)) return;
    this._user = this._user.filter(x => x.id !== id && x.base !== id);
    await this._saveUser();
    this.state = this.stateFor(this.def('torn'));
    this.renderPanel();
    this._changed();
    App.showToast('지웠어요.');
  },

  // ---------- 소품 스티커(작은 선물 상자) — 지금 배경의 상자 색·리본 색을 같이 입힌다 ----------
  async propSrc(id) {
    const sc = this._on() ? this.state : null;
    const def = sc ? this.def(sc.id) : null;
    const color = def && def.tintable && def.part && sc.color && sc.color.toUpperCase() !== '#FFFFFF' ? sc.color : null;
    const part = def && def.part && def.kind === 'inside' ? sc.part : null;
    if (!color && !part) return null;
    const img = await this._R()._loadImg(this._R()._stickerSrc(id)).catch(() => null);
    if (!img) return null;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    if (color) this.tint(d.data, color, this.paperLevel(d.data), { skipRed: true });
    if (part) this.recolorPart(d.data, part, this.redRef(d.data));
    x.putImageData(d, 0, 0);
    const url = c.toDataURL('image/png');
    c.width = c.height = 0;
    return url;
  },

  // ---------- '＋ 새 배경 추가' ----------
  openImport() {
    if ((this._user || []).length >= this.MAX_USER) { App.showToast(`내 배경은 ${this.MAX_USER}개까지예요. 안 쓰는 것을 지워 주세요.`, 'error'); return; }
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) this._importFile(f); };
    // 처음 한 번은 어떤 그림을 넣는지 먼저 알려 준다
    this._importScreen(null, inp);
  },
  async _importFile(file) {
    const R = this._R();
    file = await App.readableImage(file); // 아이폰 원본(HEIC)도
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }).catch(() => null);
    const img = url ? await R._loadImg(url, true) : null;
    if (!img) { App.showToast('그림을 읽지 못했어요.', 'error'); return; }
    const s = Math.min(1, this.MAX_SIDE / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, c.width, c.height);
    const id = x.getImageData(0, 0, c.width, c.height);
    this.keyGreen(id.data);
    this.smoothAlpha(id.data, c.width, c.height);
    x.putImageData(id, 0, 0);
    const A = this.alphaOf(id.data);
    let clear = 0; for (let i = 0; i < A.length; i++) if (A[i] < 128) clear++;
    const info = {
      canvas: c, w: c.width, h: c.height, clear: clear / A.length,
      kind: this.detectKind(A, c.width, c.height), tintable: this.isTintable(id.data), part: this.hasRed(id.data),
      paper: Math.round(this.paperLevel(id.data) * 1000) / 1000, rim: this.findRim(A, c.width, c.height)
    };
    this._importScreen(info);
  },
  _importScreen(info, inp) {
    // 안내 화면 → 그림을 고르면 같은 화면을 바꿔 쓴다 (뒤로가기 항목은 하나만)
    let ov = document.querySelector('.bglib-ed');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'cutout-ed bglib-ed';
      document.body.appendChild(ov);
      let closed = false;
      ov._close = (viaHistory) => { if (closed) return; closed = true; if (!viaHistory) App.popOverlayHistory(); ov.remove(); };
      App.pushOverlayHistory(() => ov._close(true)); // 휴대폰 뒤로가기 → 이 화면만 닫힘
    }
    const n = (this._user || []).filter(u => !u.base).length + 1;
    ov.innerHTML = `
      <div class="cutout-ed-top"><b>새 배경 추가</b><button type="button" class="btn btn-sm btn-ghost" data-act="close">닫기</button></div>
      <div class="bglib-ed-body">
        <p class="bglib-hint">강아지가 들어갈 자리를 초록(#00FF00)으로 만든 그림을 넣어 주세요</p>
        ${info ? `
        <div class="bglib-prev"><canvas></canvas></div>
        ${info.clear < 0.03 ? '<p class="bglib-warn">초록 자리를 찾지 못했어요. 초록(#00FF00)으로 칠한 그림인지 확인해 주세요.</p>' : ''}
        <label class="form-label">이름</label>
        <input type="text" class="form-input" id="bgi-name" maxlength="20" value="내 배경 ${n}">
        <label class="form-label">강아지가 어떻게 들어가나요?</label>
        <div class="card-sticker-styles" id="bgi-kind">
          <button type="button" class="card-tstyle-btn${info.kind === 'hole' ? ' active' : ''}" data-kind="hole">구멍으로 보여요 (종이·리스)</button>
          <button type="button" class="card-tstyle-btn${info.kind === 'inside' ? ' active' : ''}" data-kind="inside">속에 쏙 들어가요 (상자·거품)</button>
        </div>
        <label class="bglib-check"><input type="checkbox" id="bgi-tint"${info.tintable ? ' checked' : ''}> 색 바꾸기 (흰·회색 그림)</label>
        <div id="bgi-color-row"${info.tintable ? '' : ' hidden'}><label class="form-label">처음 색</label><input type="color" id="bgi-color" value="#FFFFFF"></div>
        <label class="bglib-check"${info.part ? '' : ' hidden'}><input type="checkbox" id="bgi-part"${info.part ? ' checked' : ''}> 빨간 부분 색 바꾸기 (리본·열매)</label>
        <label class="form-label">처음 크기 <b id="bgi-scale-v">100%</b></label>
        <input type="range" id="bgi-scale" min="100" max="170" value="100" class="bgl-range">
        <div class="bglib-ed-acts"><button type="button" class="btn btn-secondary" data-act="again">다른 그림</button><button type="button" class="btn btn-primary" data-act="save">보관함에 저장</button></div>
        ` : `
        <ol class="bglib-steps"><li>AI 그림 도구에서 강아지 자리를 초록(#00FF00)으로 칠해 달라고 해요.</li><li>그 그림을 여기서 고르면 초록이 저절로 지워져요.</li><li>흰 그림이면 카드에서 원하는 색으로 바꿀 수 있어요.</li></ol>
        <button type="button" class="btn btn-primary" data-act="pickfile">그림 고르기</button>`}
      </div>`;
    const close = () => ov._close();
    ov.querySelector('[data-act="close"]').onclick = close;
    const pickAgain = () => { const i2 = document.createElement('input'); i2.type = 'file'; i2.accept = 'image/*'; i2.onchange = () => { const f = i2.files && i2.files[0]; if (f) this._importFile(f); }; i2.click(); };
    ov.querySelector('[data-act="pickfile"]')?.addEventListener('click', () => (inp ? inp.click() : pickAgain()));
    if (!info) return;
    ov.querySelector('[data-act="again"]').onclick = pickAgain;
    let kind = info.kind;
    const cv = ov.querySelector('.bglib-prev canvas');
    const draw = () => {
      const s = Math.min(1, 480 / Math.max(info.w, info.h));
      cv.width = Math.round(info.w * s); cv.height = Math.round(info.h * s);
      const x = cv.getContext('2d');
      // 투명 자리는 체크무늬로
      for (let yy = 0; yy < cv.height; yy += 16) for (let xx = 0; xx < cv.width; xx += 16) { x.fillStyle = ((xx + yy) / 16) % 2 ? '#E9E4F5' : '#FFFFFF'; x.fillRect(xx, yy, 16, 16); }
      x.drawImage(info.canvas, 0, 0, cv.width, cv.height);
      const rim = info.rim || { y: 0.7, x0: 0.25, x1: 0.75 };
      if (kind === 'inside') {
        x.strokeStyle = '#EF4444'; x.lineWidth = 3; x.setLineDash([8, 6]);
        x.beginPath(); x.moveTo(rim.x0 * cv.width, rim.y * cv.height); x.lineTo(rim.x1 * cv.width, rim.y * cv.height); x.stroke();
      }
    };
    draw();
    ov.querySelectorAll('#bgi-kind [data-kind]').forEach(b => b.addEventListener('click', () => {
      kind = b.dataset.kind;
      ov.querySelectorAll('#bgi-kind [data-kind]').forEach(x => x.classList.toggle('active', x === b));
      draw();
    }));
    const tintCb = ov.querySelector('#bgi-tint');
    tintCb.onchange = () => { ov.querySelector('#bgi-color-row').hidden = !tintCb.checked; };
    const scl = ov.querySelector('#bgi-scale');
    scl.oninput = () => { ov.querySelector('#bgi-scale-v').textContent = scl.value + '%'; };
    ov.querySelector('[data-act="save"]').onclick = async (e) => {
      e.target.disabled = true;
      try {
        let image = info.canvas.toDataURL('image/webp', 0.9);
        if (!image.startsWith('data:image/webp')) { // 아이폰 사파리는 webp 로 못 만든다 → png 가 너무 크면 줄여서 다시
          image = info.canvas.toDataURL('image/png');
          for (let side = 1200; image.length > 1200000 && side >= 700; side -= 250) {
            const k = side / Math.max(info.canvas.width, info.canvas.height);
            if (k >= 1) continue;
            const sm = document.createElement('canvas'); sm.width = Math.round(info.canvas.width * k); sm.height = Math.round(info.canvas.height * k);
            sm.getContext('2d').drawImage(info.canvas, 0, 0, sm.width, sm.height);
            image = sm.toDataURL('image/png'); sm.width = sm.height = 0;
          }
          if (image.length > 1600000) { App.showToast('그림이 너무 커요. 더 작은 그림으로 넣어 주세요.'); e.target.disabled = false; return; }
        }
        const t = document.createElement('canvas'); t.width = 120; t.height = Math.round(120 * info.h / info.w);
        const tx = t.getContext('2d'); tx.fillStyle = '#E9E4F5'; tx.fillRect(0, 0, t.width, t.height); tx.drawImage(info.canvas, 0, 0, t.width, t.height);
        const thumb = t.toDataURL('image/jpeg', 0.8); t.width = t.height = 0;
        const tint = tintCb.checked, part = !!ov.querySelector('#bgi-part')?.checked;
        const it = { id: this._newId('u_'), name: ov.querySelector('#bgi-name').value.trim().slice(0, 20) || `내 배경 ${n}`, kind, tintable: tint, part,
          paper: info.paper, rim: kind === 'inside' ? (info.rim || { y: 0.7, x0: 0.25, x1: 0.75 }) : null,
          defaultColor: tint ? ov.querySelector('#bgi-color').value : null, partColor: null, defaultScale: Number(scl.value) / 100,
          sink: kind === 'inside' ? 0.38 : undefined, partName: part ? '빨간 부분 색' : undefined,
          image, thumb, hidden: false, createdAt: new Date().toISOString() };
        this._user.unshift(it);
        try { await this._saveUser(); } catch (err) { this._user = this._user.filter(x => x !== it); throw err; }
        info.canvas.width = info.canvas.height = 0;
        close();
        this.pick(it.id);
        App.showToast('내 배경에 넣었어요.');
      } catch (err) {
        console.warn('배경 저장 실패:', err);
        App.showToast('저장하지 못했어요. 저장 공간을 확인해 주세요.', 'error');
        e.target.disabled = false;
      }
    };
  }
};
