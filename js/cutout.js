// ===== 입체 꾸미기 1단계 — 강아지 앞으로 (2026-11-11) =====
// 칸 사진에서 강아지만 떼어(마스크) 프레임 '앞'에 한 번 더 그린다 → 머리가 찢어진 구멍·네컷 칸 테두리·빼꼼 벽 밖으로 나온다.
// 층: 뒤 = 칸 사진(지금 그대로) · 가운데 = 프레임 그림 · 앞 = 떼어 낸 강아지(같은 사진·같은 자리, 마스크로 오림, 그림자)
// 떼기는 브라우저 안에서만 (MediaPipe InteractiveSegmenter · MagicTouch 모델, 처음 한 번 약 6MB 받기). 사진은 밖으로 나가지 않는다.
// 이미 배경이 투명한 사진(아이폰 '피사체 들어올리기')은 그 투명도를 그대로 마스크로 쓰고 모델을 부르지 않는다.
//
// 칸마다 상태 (App.pages.records._cardFront[칸]) — 카드 창 안에서만 기억 ('다시 꾸미기'로 다시 열면 그대로):
//   { src: 칸 사진 주소(바뀌면 버림), mask: 알파 PNG dataURL(최대 1024px), mw, mh, bbox: {x,y,w,h}(0~1),
//     grow: 경계 안쪽↔바깥쪽(-10~10, 카드 1080px 기준 화소), feather: 부드럽게(0~12), line: { a: 0|90|180|270, x, y }(0~1), on: true|false, alpha: 투명 사진에서 왔는지 }
//   line.a = 앞으로 나오는 쪽 방향 (0 위 · 90 오른쪽 · 180 아래 · 270 왼쪽). x·y 는 사진 안 손잡이 자리.
App.cutout = {
  MP_BASE: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  MODEL: 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite',
  MAX: 1024, // 떼기·마스크 크기 (긴 변)
  FADE: 10, // 몸통 선 경계를 부드럽게 (카드 1080px 기준 화소)
  stats: { loadMs: null, segMs: [] },

  // ---------- 순수 함수 (tests/cutout.test.js) ----------
  // 모델 확신도(0~1) → 알파(0~255). 0.35 아래는 배경, 0.65 위는 강아지, 그 사이는 부드럽게
  confToAlpha(conf, out) {
    const o = out || new Uint8Array(conf.length);
    for (let i = 0; i < conf.length; i++) { const a = (conf[i] - 0.35) / 0.3; o[i] = a <= 0 ? 0 : (a >= 1 ? 255 : Math.round(a * 255)); }
    return o;
  },
  // 알파가 th 이상인 곳을 감싸는 네모 (0~1 비율). 없으면 null
  bbox(A, w, h, th = 128) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) if (A[o + x] >= th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    return { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h };
  },
  // 처음 몸통 선: 가로선, 강아지 네모 위에서 40% (목 근처), 위쪽이 앞
  defaultLine(bb) {
    const b = bb || { x: 0, y: 0, w: 1, h: 1 };
    return { a: 0, x: b.x + b.w / 2, y: b.y + b.h * 0.4 };
  },
  rotateLine(l) { return { ...l, a: ((l.a || 0) + 90) % 360 }; },
  flipLine(l) { return { ...l, a: ((l.a || 0) + 180) % 360 }; },
  isVertical(l) { return (l.a || 0) % 180 === 90; },
  // 경계 안쪽(음수, 깎기)·바깥쪽(양수, 넓히기) r 칸
  growAlpha(A, w, h, r) {
    const R = App.pages.records;
    if (!r) return A.slice();
    if (r < 0) return R._alphaMin(A, w, h, -r);
    const inv = new Uint8Array(A.length);
    for (let i = 0; i < A.length; i++) inv[i] = 255 - A[i];
    const m = R._alphaMin(inv, w, h, r);
    for (let i = 0; i < m.length; i++) m[i] = 255 - m[i];
    return m;
  },
  // 넓히기/깎기 → 부드럽게 (상자 흐림 두 번 ≈ 가우스)
  processMask(A, w, h, grow, feather) {
    const R = App.pages.records;
    let P = this.growAlpha(A, w, h, Math.round(grow || 0));
    const f = Math.round(feather || 0);
    if (f > 0) { const r = Math.max(1, Math.round(f / 2)); P = R._alphaBlur(R._alphaBlur(P, w, h, r), w, h, r); }
    return P;
  },
  // 붓질 둘레 가중치(0~255): 선에서 R 안은 255, 그 바깥 짧은 띠(R 의 15%, 최소 4칸)에서 줄어들고, 그 밖은 0 — 한 번 칠해 배경 전체를 잡지 않게
  strokeWeight(pts, w, h, R) {
    const Wt = new Uint8Array(w * h);
    if (!pts || pts.length < 2) return Wt;
    const R2 = R + Math.max(4, R * 0.15);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
    const bx0 = Math.max(0, Math.floor(x0 - R2)), bx1 = Math.min(w - 1, Math.ceil(x1 + R2));
    const by0 = Math.max(0, Math.floor(y0 - R2)), by1 = Math.min(h - 1, Math.ceil(y1 + R2));
    const n = pts.length / 2;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      let best = Infinity;
      for (let k = 0; k < n; k++) {
        const ax = pts[k * 2], ay = pts[k * 2 + 1];
        let d;
        if (k + 1 < n) {
          const bx = pts[k * 2 + 2], by = pts[k * 2 + 3], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
          const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
          d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
        } else d = Math.hypot(x - ax, y - ay);
        if (d < best) best = d;
      }
      const v = best <= R ? 1 : (best >= R2 ? 0 : 1 - (best - R) / (R2 - R));
      Wt[y * w + x] = Math.round(v * 255);
    }
    return Wt;
  },
  // 모델이 고른 곳(S)을 붓 둘레(Wt)만큼 더하기(mode 1)·빼기(mode -1)
  applyStroke(A, S, Wt, mode) {
    const out = A.slice();
    for (let i = 0; i < out.length; i++) {
      if (!Wt[i]) continue;
      const s = S[i] * Wt[i] / 255;
      out[i] = mode > 0 ? Math.max(out[i], Math.round(s)) : Math.round(out[i] * (1 - s / 255));
    }
    return out;
  },
  // 손 붓 한 점: 반지름 r 안을 target(되살리기: 원래 값 배열, 지우기: 0)으로. 가장자리 1.5칸은 부드럽게
  dab(A, w, h, cx, cy, r, restoreFrom) {
    const x0 = Math.max(0, Math.floor(cx - r - 2)), x1 = Math.min(w - 1, Math.ceil(cx + r + 2));
    const y0 = Math.max(0, Math.floor(cy - r - 2)), y1 = Math.min(h - 1, Math.ceil(cy + r + 2));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy), t = Math.max(0, Math.min(1, (r - d) / 1.5 + 0.5));
      if (!t) continue;
      const i = y * w + x;
      if (restoreFrom) { const g = restoreFrom === true ? 255 : restoreFrom[i]; if (g > A[i]) A[i] = Math.round(A[i] + (g - A[i]) * t); }
      else A[i] = Math.round(A[i] * (1 - t));
    }
  },
  // 몸통 선 → 카드 위 그라데이션 (x0,y0 = 앞쪽 끝(보임), x1,y1 = 뒤쪽 끝(안 보임))
  // pl: 사진이 카드에 놓인 자리 { ox, oy, k(사진 화소→카드 화소), iw, ih }
  lineGrad(line, pl, fade) {
    const lx = pl.ox + line.x * pl.iw * pl.k, ly = pl.oy + line.y * pl.ih * pl.k;
    const a = ((line.a || 0) % 360) * Math.PI / 180, nx = Math.sin(a), ny = -Math.cos(a), f = fade / 2;
    const r = v => Math.round(v * 1000) / 1000;
    return { x0: r(lx + nx * f), y0: r(ly + ny * f), x1: r(lx - nx * f), y1: r(ly - ny * f) };
  },
  // 칸 사진 목록 → 그리기에 쓸 앞층 상태 (사진이 바뀐 칸·끈 칸은 null)
  frontsFor(photos) {
    const st = App.pages.records._cardFront || [];
    return [0, 1, 2, 3].map(i => { const s = st[i], p = photos && photos[i]; return (p && s && s.on && s.src === p && s.mask) ? s : null; });
  },

  // ---------- 마스크 저장·읽기 ----------
  alphaToUrl(A, w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), d = x.createImageData(w, h);
    for (let i = 0; i < A.length; i++) d.data[i * 4 + 3] = A[i];
    x.putImageData(d, 0, 0);
    const url = c.toDataURL('image/png');
    c.width = c.height = 0;
    return url;
  },
  _alphaCache: new WeakMap(),
  async _alphaOf(st) {
    const hit = this._alphaCache.get(st);
    if (hit && hit.mask === st.mask) return hit.A;
    const img = await App.pages.records._loadImg(st.mask, true);
    if (!img) return null;
    const c = document.createElement('canvas'); c.width = st.mw; c.height = st.mh;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, st.mw, st.mh);
    const d = x.getImageData(0, 0, st.mw, st.mh).data;
    c.width = c.height = 0;
    const A = new Uint8Array(st.mw * st.mh);
    for (let i = 0; i < A.length; i++) A[i] = d[i * 4 + 3];
    this._alphaCache.set(st, { mask: st.mask, A });
    return A;
  },
  // 넓히기·부드럽게를 입힌 마스크 캔버스 (pxPerOut: 카드 1화소 = 마스크 몇 화소)
  _maskCache: new WeakMap(),
  async maskCanvas(st, pxPerOut) {
    const g = Math.round((st.grow || 0) * pxPerOut), f = Math.round((st.feather || 0) * pxPerOut);
    const key = st.mask.length + '|' + g + '|' + f;
    const hit = this._maskCache.get(st);
    if (hit && hit.key === key && hit.mask === st.mask) return hit.c;
    const A = await this._alphaOf(st);
    if (!A) return null;
    const P = this.processMask(A, st.mw, st.mh, g, f);
    const c = document.createElement('canvas'); c.width = st.mw; c.height = st.mh;
    const x = c.getContext('2d'), d = x.createImageData(st.mw, st.mh);
    for (let i = 0; i < P.length; i++) d.data[i * 4 + 3] = P[i];
    x.putImageData(d, 0, 0);
    if (hit) hit.c.width = hit.c.height = 0;
    this._maskCache.set(st, { key, mask: st.mask, c });
    return c;
  },

  // ---------- 카드에 앞층 그리기 (_generateCardCanvas 끝, 프레임 위·스티커 아래) ----------
  // places: [{ slot, img, ox, oy, k, iw, ih }] 카드(최종 크기) 좌표
  async drawFronts(octx, places, fronts, outW, outH) {
    const sc = outW / 1080, fade = this.FADE * sc;
    for (const pl of places) {
      const st = fronts[pl.slot];
      if (!st) continue;
      const dw = pl.iw * pl.k, dh = pl.ih * pl.k;
      const mc = await this.maskCanvas(st, st.mw / dw);
      if (!mc) continue;
      const bb = st.bbox || { x: 0, y: 0, w: 1, h: 1 };
      const blur = 16 * sc, pad = Math.abs(st.grow || 0) * sc + (st.feather || 0) * sc + blur * 2 + 4;
      const rx0 = Math.max(0, Math.floor(pl.ox + bb.x * dw - pad)), ry0 = Math.max(0, Math.floor(pl.oy + bb.y * dh - pad));
      const rx1 = Math.min(outW, Math.ceil(pl.ox + (bb.x + bb.w) * dw + pad)), ry1 = Math.min(outH, Math.ceil(pl.oy + (bb.y + bb.h) * dh + pad));
      if (rx1 - rx0 < 2 || ry1 - ry0 < 2) continue;
      const t = document.createElement('canvas'); t.width = rx1 - rx0; t.height = ry1 - ry0;
      const tx = t.getContext('2d');
      tx.imageSmoothingQuality = 'high';
      tx.drawImage(pl.img, pl.ox - rx0, pl.oy - ry0, dw, dh);
      tx.globalCompositeOperation = 'destination-in';
      tx.drawImage(mc, pl.ox - rx0, pl.oy - ry0, dw, dh);
      // pl.line: 배경 그림(속에 들어가는 배경)이 정한 몸통 선 — 물건 앞 테두리 (js/bg-library.js)
      const g = this.lineGrad(pl.line || st.line || this.defaultLine(st.bbox), pl, fade);
      const gr = tx.createLinearGradient(g.x0 - rx0, g.y0 - ry0, g.x1 - rx0, g.y1 - ry0);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      tx.fillStyle = gr; tx.fillRect(0, 0, t.width, t.height);
      if (pl.shade) { // 상자 속 그림자 — 테두리에 가까울수록 어둡게 (위로 pl.shade.h 만큼 옅어진다)
        const sy1 = pl.shade.y - ry0, sg = tx.createLinearGradient(0, sy1 - pl.shade.h, 0, sy1);
        sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.42)');
        tx.globalCompositeOperation = 'source-atop'; tx.fillStyle = sg; tx.fillRect(0, 0, t.width, t.height);
      }
      // 그림자는 강아지 몸 밖(프레임 위)에만 — 몸통 선 아래 뒤쪽 강아지 위에 띠처럼 생기지 않게
      const sh = document.createElement('canvas'); sh.width = t.width; sh.height = t.height;
      const sx = sh.getContext('2d'), far = t.width + 50;
      sx.shadowColor = 'rgba(0,0,0,0.28)'; sx.shadowBlur = blur; sx.shadowOffsetX = far; sx.shadowOffsetY = 6 * sc;
      sx.drawImage(t, -far, 0);
      sx.shadowColor = 'transparent'; sx.globalCompositeOperation = 'destination-out';
      sx.drawImage(mc, pl.ox - rx0, pl.oy - ry0, dw, dh);
      octx.drawImage(sh, rx0, ry0);
      octx.drawImage(t, rx0, ry0);
      t.width = t.height = sh.width = sh.height = 0;
    }
  },

  // ---------- 모델 ----------
  _segP: null,
  _seg: null,
  // MediaPipe 가 알림 글(INFO: …)을 오류 칸(console.error)으로 내보낸다 — 그 줄만 조용히
  _quiet(fn) {
    const orig = console.error;
    console.error = (...a) => { if (typeof a[0] === 'string' && /^(INFO:|I\d{4} )/.test(a[0])) return; orig.apply(console, a); };
    const done = () => { console.error = orig; };
    try { const r = fn(); if (r && typeof r.then === 'function') return r.finally(done); done(); return r; }
    catch (e) { done(); throw e; }
  },
  // 떼어내기 도구(모델)를 놓아 준다 — 다음에 쓸 때 다시 준비한다(1~2초). 준비하는 중이거나 손질 화면이 열려 있으면 그대로 둔다
  releaseModel() {
    if (!this._seg) return;
    if (typeof document !== 'undefined' && document.querySelector('.cutout-ed')) return;
    try { if (typeof this._seg.close === 'function') this._seg.close(); } catch (_) {}
    this._seg = null; this._segP = null;
  },
  loadSegmenter() {
    if (this._segP) return this._segP;
    const t0 = performance.now();
    this._segP = (async () => {
      const m = await import(this.MP_BASE + '/vision_bundle.mjs');
      const fs = await m.FilesetResolver.forVisionTasks(this.MP_BASE + '/wasm');
      const seg = await this._quiet(() => m.InteractiveSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetPath: this.MODEL, delegate: 'CPU' }, outputCategoryMask: false, outputConfidenceMasks: true
      }));
      this.stats.loadMs = Math.round(performance.now() - t0);
      this._seg = seg;
      return seg;
    })();
    this._segP.catch(() => { this._segP = null; });
    return this._segP;
  },
  // 모델로 고르기 → 알파(W×H). roi: { keypoint } 또는 { scribble }. 마스크는 바로 돌려준다(close)
  _segment(canvas, roi) {
    const seg = this._seg;
    const t0 = performance.now();
    const res = this._quiet(() => seg.segment(canvas, roi));
    try {
      const cm = res.confidenceMasks && res.confidenceMasks[0];
      if (!cm) throw new Error('no mask');
      const conf = cm.getAsFloat32Array();
      let A = this.confToAlpha(conf);
      if (cm.width !== canvas.width || cm.height !== canvas.height) A = this._resizeAlpha(A, cm.width, cm.height, canvas.width, canvas.height);
      this.stats.segMs.push(Math.round(performance.now() - t0));
      if (this.stats.segMs.length > 20) this.stats.segMs.shift();
      return A;
    } finally {
      if (typeof res.close === 'function') res.close();
      else (res.confidenceMasks || []).forEach(m => m.close && m.close());
    }
  },
  _resizeAlpha(A, w, h, W, H) {
    const a = document.createElement('canvas'); a.width = w; a.height = h;
    const ax = a.getContext('2d'), d = ax.createImageData(w, h);
    for (let i = 0; i < A.length; i++) d.data[i * 4 + 3] = A[i];
    ax.putImageData(d, 0, 0);
    const b = document.createElement('canvas'); b.width = W; b.height = H;
    const bx = b.getContext('2d', { willReadFrequently: true });
    bx.imageSmoothingQuality = 'high'; bx.drawImage(a, 0, 0, W, H);
    const e = bx.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = e[i * 4 + 3];
    a.width = a.height = b.width = b.height = 0;
    return out;
  },

  // ---------- 칸 아래 단추 ----------
  syncSlot(slot) {
    const R = App.pages.records;
    R._cardFront = R._cardFront || [];
    const photo = (R._cardPhotos || [])[slot];
    const st = R._cardFront[slot];
    if (st && st.src !== photo) {
      R._cardFront[slot] = null;
      if (R._frontEditSlot === slot) R._frontEditSlot = null;
      if (photo && st.on) App.showToast('사진이 바뀌어서 앞으로 나온 강아지는 지웠어요. 다시 떼어 주세요.', 'info');
    }
    const cur = R._cardFront[slot];
    const main = document.getElementById(`card-front-${slot}`), off = document.getElementById(`card-front-off-${slot}`);
    if (main) { main.hidden = !photo; main.textContent = cur && cur.on ? (cur.alpha ? '✂ 떼어낸 사진 고치기' : '✂ 떼어낸 강아지 고치기') : '✂ 강아지 앞으로'; }
    if (off) off.hidden = !(photo && cur && cur.on);
  },
  async onFrontBtn(slot) {
    const R = App.pages.records;
    const st = (R._cardFront || [])[slot];
    const photo = R._cardPhotos[slot];
    if (!photo) return;
    if (st && st.src === photo && !st.on) { // 꺼 둔 것 다시 켜기
      st.on = true; R._frontEditSlot = slot; this.syncSlot(slot); R._scheduleCardPreview(); return;
    }
    if (!st || st.src !== photo) {
      // 이미 배경이 투명한 사진이면 모델 없이 그 투명도를 그대로
      const img = await R._loadImg(photo).catch(() => null);
      if (img && R._imgHasAlpha(img)) { await this._fromAlpha(slot, photo, img); return; }
    }
    this.openEditor(slot);
  },
  turnOff(slot) {
    const R = App.pages.records;
    const st = (R._cardFront || [])[slot];
    if (st) st.on = false;
    if (R._frontEditSlot === slot) R._frontEditSlot = null;
    this.syncSlot(slot);
    R._scheduleCardPreview();
  },
  _workSize(img) { const s = Math.min(1, this.MAX / Math.max(img.width, img.height)); return [Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s))]; },
  async _fromAlpha(slot, photo, img) {
    const R = App.pages.records;
    const [W, H] = this._workSize(img);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data;
    c.width = c.height = 0;
    const A = new Uint8Array(W * H);
    for (let i = 0; i < A.length; i++) A[i] = d[i * 4 + 3];
    const bb = this.bbox(A, W, H);
    if (R._cardPhotos[slot] !== photo) return;
    R._cardFront[slot] = { src: photo, mask: this.alphaToUrl(A, W, H), mw: W, mh: H, bbox: bb, grow: 0, feather: 0, line: this.defaultLine(bb), on: true, alpha: true };
    R._frontEditSlot = slot;
    this.syncSlot(slot);
    R._scheduleCardPreview();
  },

  // ---------- 미리보기 위 몸통 선 ----------
  syncLineUI() {
    const R = App.pages.records;
    const stage = document.querySelector('.card-maker .card-live-stage');
    const img = document.getElementById('card-live-img');
    if (!stage || !img) return;
    let el = stage.querySelector('.fx-line');
    if (!el) {
      el = document.createElement('div'); el.className = 'fx-line'; el.hidden = true;
      el.innerHTML = '<div class="fx-line-shade"></div><div class="fx-line-l"></div><button type="button" class="fx-line-h" aria-label="몸통 선 옮기기"></button>';
      stage.appendChild(el);
      this._wireHandle(el.querySelector('.fx-line-h'));
    }
    let lb = document.getElementById('card-front-linebtn');
    if (!lb) {
      lb = document.createElement('button'); lb.type = 'button'; lb.id = 'card-front-linebtn'; lb.className = 'fx-linebtn'; lb.hidden = true;
      lb.textContent = '몸통 선';
      lb.addEventListener('click', () => {
        const fv = R._frontView, fr = R._cardFront || [];
        const p = fv && fv.places.find(q => fr[q.slot] && fr[q.slot].on);
        if (p) { R._frontEditSlot = p.slot; this.syncLineUI(); }
      });
      (document.getElementById('card-live-tools') || stage).appendChild(lb); // 그림 아래 도구 줄에
    }
    let bar = document.getElementById('card-front-bar');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'card-front-bar'; bar.className = 'fx-bar'; bar.hidden = true;
      bar.innerHTML = `<div class="fx-bar-row"><b>몸통 선</b>
        <button type="button" class="btn btn-sm btn-secondary" data-fx="rot">↻ 선 돌리기</button>
        <button type="button" class="btn btn-sm btn-secondary" data-fx="flip">⇅ 앞쪽 바꾸기</button>
        <button type="button" class="btn btn-sm btn-primary" data-fx="end">✓ 다 됐어요</button></div>
        <div class="fx-bar-hint">손잡이를 끌어 목 근처에 맞추세요. 어둡게 보이는 쪽은 프레임 뒤로 들어가요.</div>`;
      bar.addEventListener('click', (e) => {
        const b = e.target.closest('[data-fx]'); if (!b) return;
        const st = (R._cardFront || [])[R._frontEditSlot];
        if (b.dataset.fx === 'end' || !st) { R._frontEditSlot = null; this.syncLineUI(); return; }
        st.line = b.dataset.fx === 'rot' ? this.rotateLine(st.line) : this.flipLine(st.line);
        this.syncLineUI(); R._scheduleCardPreview();
      });
      const note = document.getElementById('card-live-note');
      (note || stage).insertAdjacentElement('afterend', bar);
    }
    const fv = R._frontView, fronts = R._cardFront || [];
    const visible = !img.hidden && fv && fv.W;
    const slot = R._frontEditSlot;
    const st = slot != null ? fronts[slot] : null;
    const pl = visible && st && st.on ? fv.places.find(p => p.slot === slot) : null;
    el.hidden = !pl; bar.hidden = !pl;
    lb.hidden = !!pl || !(visible && fv.places.some(p => fronts[p.slot] && fronts[p.slot].on && !p.line)); // p.line: 배경 그림이 정한 선(자동)
    if (!pl) return;
    const l = st.line, v = this.isVertical(l);
    const px = (pl.ox + l.x * pl.iw * pl.k) / fv.W * 100, py = (pl.oy + l.y * pl.ih * pl.k) / fv.H * 100;
    const line = el.querySelector('.fx-line-l'), sh = el.querySelector('.fx-line-shade'), h = el.querySelector('.fx-line-h');
    line.className = 'fx-line-l ' + (v ? 'v' : 'h');
    line.style.cssText = v ? `left:${px}%` : `top:${py}%`;
    // 뒤로 들어가는 쪽을 어둡게
    sh.style.cssText = ({ 0: `top:${py}%;bottom:0;left:0;right:0`, 180: `top:0;height:${py}%;left:0;right:0`,
      90: `left:0;width:${px}%;top:0;bottom:0`, 270: `left:${px}%;right:0;top:0;bottom:0` })[l.a || 0];
    // 손잡이는 선 끝(가로선은 오른쪽, 세로선은 아래쪽 단추 위)에 — 강아지 얼굴을 가리지 않게
    h.style.left = v ? px + '%' : ''; h.style.top = v ? '' : py + '%';
    h.classList.toggle('v', v);
    h.textContent = v ? '↔ 몸통 선' : '↕ 몸통 선';
  },
  _wireHandle(h) {
    const R = App.pages.records;
    let drag = null;
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { h.setPointerCapture(e.pointerId); } catch (_) {}
      drag = { id: e.pointerId };
    });
    h.addEventListener('pointermove', (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const fv = R._frontView, st = (R._cardFront || [])[R._frontEditSlot];
      const pl = fv && st && fv.places.find(p => p.slot === R._frontEditSlot);
      const stage = h.closest('.card-live-stage');
      if (!pl || !stage) return;
      const r = stage.getBoundingClientRect();
      const X = (e.clientX - r.left) / r.width * fv.W, Y = (e.clientY - r.top) / r.height * fv.H;
      const c = v => Math.max(0, Math.min(1, v));
      st.line = { ...st.line, x: c((X - pl.ox) / (pl.iw * pl.k)), y: c((Y - pl.oy) / (pl.ih * pl.k)) };
      this.syncLineUI();
      R._photoDragPreview();
    });
    const up = (e) => { if (!drag || drag.id !== e.pointerId) return; drag = null; R._scheduleCardPreview(); };
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  },

  // ---------- 떼어내기 화면 (하나로: '강아지 떼어내기'·'배경 지우기'·'떼어낸 사진 고치기') ----------
  // 열면 아무것도 지우지 않는다 → 강아지를 콕 누르면 모델이 강아지만 남김 (또는 '천 색으로 한 번에 지우기') → 손 붓으로 고치기
  // opts.out: 'front'(입체 꾸미기 마스크 → _cardFront) | 'photo'(배경을 지운 사진으로 칸 사진을 바꾼다 → _cardPhotos, _cutoutSrc)
  // 순수 함수: 천 색 지우기 결과 → 마스크(알파) (원래 투명한 곳은 그대로 투명)
  keyMask(rgba, origA) {
    const N = rgba.length / 4, A = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const a = rgba[i * 4 + 3]; A[i] = origA && origA[i] < a ? origA[i] : a; }
    return A;
  },
  // 순수 함수: 천 색이 고른 정도(spread) → 처음 지우는 정도
  keyTol(spread) { return Math.round(Math.min(60, Math.max(14, (spread || 0) * 1.3 + 8))); },
  // 순수 함수: 천 색 찍어서 고르기 — 누른 곳 둘레(5×5) 보이는 칸 색의 평균. 사진 밖이면 null
  pickColor(rgba, w, h, x, y) {
    const cx = Math.round(x), cy = Math.round(y);
    if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.max(0, cy - 2); yy <= Math.min(h - 1, cy + 2); yy++) for (let xx = Math.max(0, cx - 2); xx <= Math.min(w - 1, cx + 2); xx++) {
      const q = (yy * w + xx) * 4; if (rgba[q + 3] < 128) continue;
      r += rgba[q]; g += rgba[q + 1]; b += rgba[q + 2]; n++;
    }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null;
  },
  // 순수 함수: 손으로 그은 선 → 얼굴만 남기기 선 { k: 'cut'(턱 아래 선) | 'lasso'(둘레), cp: 끌어 고칠 점, p: 부드러운 선 }
  // 살짝 닿은 것·세로로 그은 턱 선은 null (사진이 통째로 지워지지 않게)
  faceFromPath(path, k, w, h) {
    if (!path || path.length < 6) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < path.length; i += 2) { x0 = Math.min(x0, path[i]); x1 = Math.max(x1, path[i]); y0 = Math.min(y0, path[i + 1]); y1 = Math.max(y1, path[i + 1]); }
    const minSpan = Math.max(w, h) * 0.05;
    const ok = k === 'lasso' ? (x1 - x0 > minSpan && y1 - y0 > minSpan) : (x1 - x0 > minSpan && x1 - x0 > (y1 - y0) * 1.5);
    if (!ok) return null;
    const R = App.pages.records, closed = k === 'lasso';
    const cp = R._resamplePath(path, closed ? 14 : 9, closed);
    return { k, cp, p: R._smoothPath(cp, closed) };
  },
  // 순수 함수: 마스크에 얼굴만 남기기(턱 선·둘레 마스크들, 0~255 남길 정도)를 곱한다
  applyFaces(A, masks) {
    const out = A.slice();
    for (const m of masks || []) if (m) for (let i = 0; i < out.length; i++) out[i] = Math.round(out[i] * m[i] / 255);
    return out;
  },
  async openEditor(slot, opts = {}) {
    const R = App.pages.records;
    const out = opts.out === 'photo' ? 'photo' : 'front';
    const cur = R._cardPhotos[slot];
    if (!cur || this._opening || document.querySelector('.cutout-ed')) return;
    // 이 화면에서 배경을 지운 사진이면 원래 사진에서 다시 (지운 곳도 되살릴 수 있게)
    const kept = out === 'photo' ? R._cutoutSrc.get(cur) : null;
    const known0 = out === 'photo' ? (kept && kept.mask ? kept : null) : (R._cardFront || [])[slot];
    const source = out === 'photo' && known0 ? known0.orig : cur;
    this._opening = true;
    const img = await R._loadImg(source, true).catch(() => null);
    this._opening = false;
    if (R._cardPhotos[slot] !== cur || !document.querySelector('.card-maker')) return;
    if (!img) { App.showToast('사진을 읽지 못했어요.', 'error'); return; }
    const [W, H] = this._workSize(img);
    const pc = document.createElement('canvas'); pc.width = W; pc.height = H;
    const px = pc.getContext('2d', { willReadFrequently: true });
    px.drawImage(img, 0, 0, W, H);
    let raw;
    try { raw = px.getImageData(0, 0, W, H).data; } catch (e) { pc.width = pc.height = 0; App.showToast('사진을 읽지 못했어요.', 'error'); return; }
    const N = W * H;
    const isAlpha = R._alphaShare(raw) > 0.03;
    const origA = new Uint8Array(N);
    for (let i = 0; i < N; i++) origA[i] = raw[i * 4 + 3];
    const known = known0 && (out === 'photo' || known0.src === cur) ? known0 : null;
    let A = null;
    // 얼굴만 남기기 선: 사진은 strokes 에, 강아지 앞으로는 faces 에 (그때는 얼굴을 곱하기 전 마스크가 base)
    const faces0 = known && known.mw === W && known.mh === H ? (out === 'photo' ? known.strokes : (known.base && known.faces)) : null;
    const faces = { cut: null, lasso: null };
    for (const f of faces0 || []) if (f && (f.k === 'cut' || f.k === 'lasso') && f.cp) faces[f.k] = { k: f.k, cp: f.cp.slice(), p: f.p.slice() };
    if (known && known.mw === W && known.mh === H) A = (await this._alphaOf(out === 'front' && faces0 ? { mask: known.base, mw: W, mh: H } : known))?.slice() || null;
    if (!A && isAlpha) A = origA.slice();
    let rgb = raw; // 보이는 색 (천 색을 지우면 털 둘레에 비친 천 색을 걷어 낸 색)
    // 카드 화소 → 마스크 화소 (경계 막대는 카드 1080px 기준)
    const fv = R._frontView, pl0 = out === 'front' && fv && fv.places.find(p => p.slot === slot);
    const pxPerOut = pl0 ? W / (pl0.iw * pl0.k) : Math.max(W, H) / 1080;
    const st = { tool: A ? 'erase' : 'tap', brush: 36, scale: 1, tx: 0, ty: 0, closed: false, cursor: null,
      grow: known ? known.grow || 0 : 0, feather: known ? (known.feather ?? 2) : (isAlpha ? 0 : 2), manual: false, path: null,
      key: known && known.key ? { color: known.key.color.slice(), tol: known.key.tol } : null, faces };
    if (st.key) { const k = raw.slice(); R._chromaKey(k, W, H, st.key.color, st.key.tol); rgb = k; }
    const undo = [];
    const push = () => { undo.push({ A: A ? A.slice() : null, grow: st.grow, feather: st.feather, key: st.key ? { ...st.key } : null, rgb, faces: { ...st.faces } }); if (undo.length > 20) undo.shift(); };
    // 얼굴만 남기기: 선마다 마스크를 한 번만 만든다 (선을 고치면 새 선 = 새 마스크)
    const faceMaskCache = new WeakMap();
    const faceList = () => [st.faces.cut, st.faces.lasso].filter(Boolean);
    const faced = () => {
      if (!A) return null;
      const fl = faceList(); if (!fl.length) return A;
      return this.applyFaces(A, fl.map(f => { let m = faceMaskCache.get(f); if (!m) { m = R._faceMask(f, W, H); faceMaskCache.set(f, m); } return m; }));
    };
    const title = out === 'photo' ? (isAlpha || known ? '떼어낸 사진 고치기' : '배경 지우기') : (known ? '떼어낸 강아지 고치기' : '강아지 떼어내기');
    const wide = window.matchMedia('(min-width: 900px) and (orientation: landscape)').matches;

    const ov = document.createElement('div');
    ov.className = 'cutout-ed fx-ed';
    ov.innerHTML = `
      <div class="cutout-ed-top">
        <button type="button" class="btn btn-sm btn-ghost" data-act="cancel">취소</button>
        <b>${title}</b>
        <span class="cutout-ed-actions"><button type="button" class="btn btn-sm btn-secondary" data-act="undo">↶ 되돌리기</button>
        <button type="button" class="btn btn-sm btn-primary" data-act="done">다 됐어요</button></span>
      </div>
      <div class="cutout-ed-stage"><canvas></canvas><div class="fx-hint" hidden>강아지를 콕 눌러 주세요</div><div class="cutout-ed-busy" hidden></div><div class="cutout-ed-tip" hidden></div></div>
      <div class="cutout-ed-bar">
        <div class="cutout-ed-row fx-start">
          <button type="button" class="card-tstyle-btn fx-big" data-tool="tap">👆 강아지 콕 고르기</button>
          <button type="button" class="card-tstyle-btn fx-big" data-act="key">천 색으로 한 번에 지우기</button>
        </div>
        <div class="cutout-ed-row fx-modes">
          <button type="button" class="card-tstyle-btn fx-big" data-tool="erase">지우기</button>
          <button type="button" class="card-tstyle-btn fx-big" data-tool="restore">되살리기</button>
          <button type="button" class="card-tstyle-btn fx-big" data-tool="move" hidden>✥ 화면 옮기기</button>
        </div>
        <label class="cutout-ed-slider fx-brush">붓 크기 <input type="range" min="10" max="90" step="2" value="${st.brush}" data-brush aria-label="붓 크기"></label>
        <details class="cutout-ed-more"${wide ? ' open' : ''}><summary>더 고치기 (경계·천 색·얼굴만·자동 붓)</summary>
          <label class="cutout-ed-slider">경계를 안쪽으로 <input type="range" min="-10" max="10" step="1" value="${st.grow}" data-grow aria-label="경계 안쪽 바깥쪽"> 바깥으로</label>
          <label class="cutout-ed-slider">가장자리 또렷하게 <input type="range" min="0" max="12" step="1" value="${st.feather}" data-feather aria-label="가장자리 또렷하게 부드럽게"> 부드럽게</label>
          <div class="cutout-ed-row fx-pick"><span class="cutout-ed-lb">천 색</span>
            <i class="cutout-ed-swatch" hidden></i>
            <button type="button" class="card-tstyle-btn" data-tool="pick">천 색 찍어서 고르기</button></div>
          <label class="cutout-ed-slider fx-key" hidden>천 색을 덜 지우기 <input type="range" min="4" max="90" step="1" value="${st.key ? st.key.tol : 30}" data-tol aria-label="천 색 지우는 정도"> 더 지우기</label>
          <div class="cutout-ed-row fx-face"><span class="cutout-ed-lb">얼굴만 남기기</span>
            <button type="button" class="card-tstyle-btn" data-tool="cut">턱 아래 선 긋기</button>
            <button type="button" class="card-tstyle-btn" data-tool="lasso">얼굴 둘레 그리기</button>
            <button type="button" class="card-tstyle-btn" data-act="faceoff" hidden>얼굴만 풀기</button></div>
          <div class="cutout-ed-row fx-auto"><span class="cutout-ed-lb">자동 붓</span>
            <button type="button" class="card-tstyle-btn" data-tool="plus">＋ 빠진 강아지 칠하기</button>
            <button type="button" class="card-tstyle-btn" data-tool="minus">－ 남은 배경 칠하기</button></div>
          <div class="cutout-ed-row"><button type="button" class="card-tstyle-btn" data-act="sticker">내 스티커로 저장</button></div>
        </details>
      </div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('canvas'), stage = ov.querySelector('.cutout-ed-stage'), busyEl = ov.querySelector('.cutout-ed-busy'), tipEl = ov.querySelector('.cutout-ed-tip'), hintEl = ov.querySelector('.fx-hint');
    const TIPS = {
      tap: '강아지 몸 가운데를 한 번 콕 눌러 주세요.',
      plus: '빠진 강아지 부분을 대충 칠하면 그 둘레만 더해요.',
      minus: '남은 배경을 대충 칠하면 그 둘레만 빼요.',
      erase: '문지른 곳을 지워요. 두 손가락으로 크게 볼 수 있어요.',
      restore: '너무 지운 곳을 문지르면 되살아나요.',
      move: '한 손가락으로 화면을 옮겨요.',
      pick: '사진에서 천(배경)을 콕 누르면 그 색을 지워요. 두 손가락으로 크게 볼 수 있어요.',
      cut: '턱 바로 아래를 옆으로 한 번 그으면 그 아래가 지워져요. 그은 뒤 점을 끌어 턱선에 맞추세요.',
      lasso: '얼굴 둘레를 크게 한 바퀴 그리면 안쪽만 남아요. 그은 뒤 점을 끌어 맞추세요.'
    };
    const tip = (t, ms = 3500) => { tipEl.textContent = t; tipEl.hidden = !t; clearTimeout(st.tipT); if (t) st.tipT = setTimeout(() => { tipEl.hidden = true; }, ms); };
    const busy = (t) => { busyEl.textContent = t || ''; busyEl.hidden = !t; };

    // 보이는 그림: 강아지는 그대로, 지운 곳은 흐리게(격자 위), 경계는 분홍 선. 아직 고르기 전이면 사진 그대로
    const vc = document.createElement('canvas'); vc.width = W; vc.height = H;
    const vx = vc.getContext('2d');
    const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    const ox = oc.getContext('2d');
    const finalMask = () => this.processMask(faced(), W, H, st.grow * pxPerOut, st.feather * pxPerOut);
    const rebuild = (fast) => {
      const P = !A ? null : (fast ? faced() : finalMask());
      const d = vx.createImageData(W, H), o = ox.createImageData(W, H);
      for (let i = 0; i < N; i++) {
        const q = i * 4, p = P ? Math.min(P[i], origA[i]) : 255;
        d.data[q] = rgb[q]; d.data[q + 1] = rgb[q + 1]; d.data[q + 2] = rgb[q + 2];
        d.data[q + 3] = P ? Math.round(p + (origA[i] - p) * 0.28) : origA[i];
      }
      if (P) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (P[i] < 128) continue;
        if ((x > 0 && P[i - 1] < 128) || (x < W - 1 && P[i + 1] < 128) || (y > 0 && P[i - W] < 128) || (y < H - 1 && P[i + W] < 128)) {
          const q = i * 4; o.data[q] = 255; o.data[q + 1] = 45; o.data[q + 2] = 149; o.data[q + 3] = 255;
        }
      }
      vx.putImageData(d, 0, 0); ox.putImageData(o, 0, 0);
      draw();
    };
    let rebuildRaf = 0;
    const rebuildSoon = () => { if (!rebuildRaf) rebuildRaf = requestAnimationFrame(() => { rebuildRaf = 0; if (!st.closed) rebuild(); }); };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let fit = 1, ro = null;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
      fit = Math.min(cv.width / W, cv.height / H) * 0.94;
      draw();
    };
    const view = () => { const s = fit * st.scale; return { s, ox: (cv.width - W * s) / 2 + st.tx * dpr, oy: (cv.height - H * s) / 2 + st.ty * dpr }; };
    const clampPan = () => {
      const r = stage.getBoundingClientRect(), s = fit * st.scale / dpr;
      const mx = Math.max(0, (W * s - r.width) / 2 + r.width * 0.3), my = Math.max(0, (H * s - r.height) / 2 + r.height * 0.3);
      st.tx = Math.max(-mx, Math.min(mx, st.tx)); st.ty = Math.max(-my, Math.min(my, st.ty));
    };
    const toImg = (cx, cy) => { const r = cv.getBoundingClientRect(), v = view(); return [((cx - r.left) * dpr - v.ox) / v.s, ((cy - r.top) * dpr - v.oy) / v.s]; };
    const draw = () => {
      if (st.closed) return;
      const g = cv.getContext('2d'), v = view();
      g.setTransform(1, 0, 0, 1, 0, 0);
      const t = 14 * dpr;
      for (let y = 0; y < cv.height; y += t) for (let x = 0; x < cv.width; x += t) { g.fillStyle = ((x / t + y / t) & 1) ? '#D1D5DB' : '#F3F4F6'; g.fillRect(x, y, t, t); }
      g.imageSmoothingQuality = 'high';
      g.drawImage(vc, v.ox, v.oy, W * v.s, H * v.s);
      if (A) {
        g.imageSmoothingEnabled = false;
        const d = 1.2 * dpr;
        for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) g.drawImage(oc, v.ox + dx, v.oy + dy, W * v.s, H * v.s);
        g.imageSmoothingEnabled = true;
      }
      if (st.path && st.path.length >= 2) {
        g.save(); g.lineCap = g.lineJoin = 'round';
        g.strokeStyle = st.tool === 'minus' ? 'rgba(239,68,68,.55)' : 'rgba(34,197,94,.55)';
        g.lineWidth = st.brush * dpr;
        g.beginPath();
        for (let i = 0; i < st.path.length; i += 2) { const X = v.ox + st.path[i] * v.s, Y = v.oy + st.path[i + 1] * v.s; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
        if (st.path.length === 2) g.lineTo(v.ox + st.path[0] * v.s + 0.1, v.oy + st.path[1] * v.s);
        g.stroke(); g.restore();
      }
      // 얼굴만 남기기: 고칠 수 있는 선과 점(보라), 그리는 중인 선(빨강)
      const ef = (st.tool === 'cut' || st.tool === 'lasso') && !st.fpath ? st.faces[st.tool] : null;
      const line = (pp, closed) => { g.beginPath(); for (let i = 0; i < pp.length; i += 2) { const X = v.ox + pp[i] * v.s, Y = v.oy + pp[i + 1] * v.s; i ? g.lineTo(X, Y) : g.moveTo(X, Y); } if (closed) g.closePath(); g.stroke(); };
      if (ef) {
        g.save(); g.lineWidth = 2 * dpr; g.strokeStyle = '#7C3AED'; g.setLineDash([6 * dpr, 5 * dpr]);
        line(ef.p, ef.k === 'lasso'); g.setLineDash([]);
        for (let i = 0; i < ef.cp.length; i += 2) {
          g.beginPath(); g.arc(v.ox + ef.cp[i] * v.s, v.oy + ef.cp[i + 1] * v.s, 10 * dpr, 0, Math.PI * 2);
          g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 3 * dpr; g.strokeStyle = '#7C3AED'; g.stroke();
        }
        g.restore();
      }
      if (st.fpath && st.fpath.length >= 4) {
        g.save(); g.lineWidth = 3 * dpr; g.strokeStyle = '#EF4444'; g.setLineDash([8 * dpr, 6 * dpr]);
        line(st.fpath, st.tool === 'lasso'); g.restore();
      }
      // 붓 동그라미 (손가락에 가려도 둘레가 보이게)
      if (st.cursor && (st.tool === 'erase' || st.tool === 'restore')) {
        const X = v.ox + st.cursor[0] * v.s, Y = v.oy + st.cursor[1] * v.s;
        g.save(); g.beginPath(); g.arc(X, Y, st.brush / 2 * dpr, 0, Math.PI * 2);
        g.lineWidth = 2 * dpr; g.strokeStyle = st.tool === 'erase' ? '#EF4444' : '#22C55E'; g.stroke(); g.restore();
      }
    };
    const sync = () => {
      ov.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === st.tool));
      ov.querySelector('[data-tool="tap"]').disabled = st.manual;
      ov.querySelector('[data-act="key"]').hidden = isAlpha; // 이미 배경이 투명한 사진은 천 색 지우기가 필요 없다
      ov.querySelectorAll('.fx-auto button').forEach(b => { b.disabled = st.manual || !A; });
      ov.querySelector('.fx-auto').hidden = st.manual;
      ov.querySelector('.fx-key').hidden = !st.key;
      ov.querySelector('.fx-pick').hidden = isAlpha; // 이미 배경이 투명한 사진은 천 색이 없다
      const sw = ov.querySelector('.cutout-ed-swatch');
      sw.hidden = !st.key; if (st.key) sw.style.background = `rgb(${st.key.color.join(',')})`;
      ov.querySelector('[data-act="faceoff"]').hidden = !faceList().length;
      ov.querySelector('[data-tool="move"]').hidden = st.scale <= 1.01 && st.tool !== 'move';
      const u = ov.querySelector('[data-act="undo"]'); if (u) u.disabled = !undo.length;
      ov.querySelector('[data-grow]').value = st.grow; ov.querySelector('[data-feather]').value = st.feather;
      if (st.key) ov.querySelector('[data-tol]').value = st.key.tol;
      hintEl.hidden = !!A || st.manual || st.tool !== 'tap';
      if (st.tipFor !== st.tool) { st.tipFor = st.tool; if (st.tool !== 'tap' || A) tip(TIPS[st.tool] || ''); }
      cv.style.cursor = st.tool === 'move' ? 'grab' : 'crosshair';
    };
    const close = (viaHistory) => {
      if (st.closed) return;
      st.closed = true;
      if (!viaHistory) App.popOverlayHistory();
      window.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
      ov.remove(); pc.width = pc.height = vc.width = vc.height = oc.width = oc.height = 0;
    };
    ov._close = close;
    App.pushOverlayHistory(() => close(true));

    // 모델 준비 — 처음 한 번 받는 동안만 '준비 중'. 못 받으면 손 붓으로
    const ready = async () => {
      if (st.manual) return false;
      if (this._seg) return true;
      busy('처음 한 번 준비 중…');
      try { await this.loadSegmenter(); busy(''); return !st.closed; }
      catch (e) {
        console.warn('자동 떼기 준비 실패:', e);
        busy(''); st.manual = true;
        if (!A) { push(); A = new Uint8Array(N); }
        st.tool = 'restore'; st.tipFor = 'restore'; rebuild(); sync();
        tip('자동으로 고르기를 준비하지 못했어요 (인터넷 연결을 확인해 주세요). [되살리기]로 강아지를 칠해 주세요. 한 가지 색 천 앞 사진이면 [천 색으로 한 번에 지우기]를 눌러요.', 9000);
        return false;
      }
    };
    const runSeg = (fn) => new Promise(res => {
      busy('고르는 중…');
      setTimeout(() => { // 글자가 먼저 보이게
        if (st.closed) return res();
        try { fn(); } catch (e) { console.warn('떼기 실패:', e); tip('고르지 못했어요. 다른 곳을 눌러 보거나 붓을 써 주세요.'); }
        busy(''); rebuild(); sync(); res();
      }, 30);
    });
    // 자동 붓 둘레: 칠한 굵기의 2배 또는 사진 긴 변의 6% 중 큰 것
    const strokeRadius = () => Math.max(Math.max(W, H) * 0.06, 2 * st.brush / 2 * dpr / (fit * st.scale));
    const doStroke = async (path, mode) => {
      if (!(await ready())) return;
      await runSeg(() => {
        const pts = [];
        const n = path.length / 2, stepN = Math.max(1, Math.ceil(n / 40));
        for (let k = 0; k < n; k += stepN) pts.push({ x: Math.max(0, Math.min(1, path[k * 2] / W)), y: Math.max(0, Math.min(1, path[k * 2 + 1] / H)) });
        let S;
        try { S = pts.length > 1 ? this._segment(pc, { scribble: pts }) : this._segment(pc, { keypoint: pts[0] }); }
        catch (e) {
          // 낙서(scribble)를 못 받으면 선 위 몇 점을 눌러 합친다
          S = new Uint8Array(N);
          const pick = [0, 0.25, 0.5, 0.75, 1].map(f => pts[Math.min(pts.length - 1, Math.round(f * (pts.length - 1)))]);
          for (const p of pick) { const s = this._segment(pc, { keypoint: p }); for (let i = 0; i < N; i++) if (s[i] > S[i]) S[i] = s[i]; }
        }
        push();
        A = this.applyStroke(A, S, this.strokeWeight(path, W, H, strokeRadius()), mode);
      });
    };
    const doTap = async (ix, iy) => {
      if (!(await ready())) return;
      await runSeg(() => {
        const S = this._segment(pc, { keypoint: { x: Math.max(0, Math.min(1, ix / W)), y: Math.max(0, Math.min(1, iy / H)) } });
        let n = 0; for (let i = 0; i < N; i++) if (S[i] >= 128) n++;
        if (n < N * 0.002) { tip('강아지를 찾지 못했어요. 강아지 몸 가운데를 눌러 보세요.'); return; }
        push();
        if (isAlpha) for (let i = 0; i < N; i++) if (S[i] > origA[i]) S[i] = origA[i];
        A = S; st.tool = 'erase'; st.tipFor = 'erase';
        tip('남은 배경은 [지우기], 빠진 곳은 [되살리기]로 문질러 고쳐요.', 5000);
      });
    };
    // 천 색으로 한 번에 지우기 (한 가지 색 천 앞에서 찍은 사진) — 사진 둘레 색을 천 색으로 짐작
    const applyKey = () => {
      const k = raw.slice();
      R._chromaKey(k, W, H, st.key.color, st.key.tol);
      rgb = k; A = this.keyMask(k, origA);
    };
    const startKey = () => {
      push();
      const g = R._guessKeyColor(raw, W, H);
      st.key = { color: g.color, tol: this.keyTol(g.spread) };
      applyKey();
      st.tool = 'erase'; st.tipFor = 'erase';
      rebuild(); sync();
      tip(g.spread > 40 ? '배경이 한 가지 색이 아니라 깔끔하지 않을 수 있어요. 남은 곳은 [지우기]로 문질러요.'
        : '천 색을 지웠어요. 덜 지우거나 더 지우려면 [더 고치기]에서 맞춰요.', 5000);
      if (!wide && g.spread <= 40) ov.querySelector('.cutout-ed-more').open = true;
    };
    // 지금 결과를 그림으로 (스티커·배경 지운 사진). full 이면 원래 사진 크기, 아니면 작업 크기
    const renderCut = (full) => {
      const P = finalMask();
      const FW = full ? img.width : W, FH = full ? img.height : H;
      const c = document.createElement('canvas'); c.width = FW; c.height = FH;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, FW, FH);
      const d = x.getImageData(0, 0, FW, FH);
      const a0 = new Uint8Array(FW * FH);
      for (let i = 0; i < a0.length; i++) a0[i] = d.data[i * 4 + 3];
      if (st.key) R._chromaKey(d.data, FW, FH, st.key.color, st.key.tol); // 털 둘레에 비친 천 색 걷어 내기 (알파는 아래 마스크로)
      const M = (FW === W && FH === H) ? P : this._resizeAlpha(P, W, H, FW, FH);
      for (let i = 0; i < M.length; i++) d.data[i * 4 + 3] = Math.min(M[i], a0[i]);
      x.putImageData(d, 0, 0);
      return c;
    };

    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b || st.saving) return;
      if (b.dataset.tool) {
        st.tool = b.dataset.tool;
        if (st.tool === 'tap' && A) tip('강아지를 다시 콕 누르면 처음부터 다시 골라요.', 4000);
      }
      else if (b.dataset.act === 'key') { startKey(); return; }
      else if (b.dataset.act === 'undo') {
        const u = undo.pop();
        if (u) { A = u.A; st.grow = u.grow; st.feather = u.feather; st.key = u.key; rgb = u.rgb; st.faces = u.faces; if (!A && !st.manual) st.tool = 'tap'; rebuild(); }
      }
      else if (b.dataset.act === 'faceoff') { push(); st.faces = { cut: null, lasso: null }; rebuild(); tip('얼굴만 남기기를 풀었어요.'); }
      else if (b.dataset.act === 'cancel') { close(); return; }
      else if (b.dataset.act === 'sticker') {
        if (!A || !this.bbox(faced(), W, H)) { tip('강아지를 먼저 골라 주세요. 강아지를 한 번 콕 눌러요.'); return; }
        b.disabled = true;
        const c = renderCut(false);
        try { await R._saveCutoutSticker(c); } finally { c.width = c.height = 0; if (!st.closed) b.disabled = false; }
        return;
      }
      else if (b.dataset.act === 'done') {
        const AF = faced(), fl = faceList().map(f => ({ k: f.k, cp: f.cp.slice(), p: f.p.slice() }));
        const bb = AF && this.bbox(AF, W, H);
        if (!bb) { tip('강아지를 먼저 골라 주세요. 강아지를 한 번 콕 눌러요.'); return; }
        if (R._cardPhotos[slot] !== cur) { App.showToast('그사이 사진이 바뀌어서 고친 것은 넣지 않았어요.', 'error'); close(); return; }
        st.saving = true;
        if (out === 'photo') {
          busy('저장하는 중…');
          await new Promise(r => setTimeout(r, 30));
          if (st.closed) return;
          let url = null;
          try { const c = renderCut(true); url = c.toDataURL('image/png'); c.width = c.height = 0; }
          catch (err) { console.warn('배경 지운 사진 만들기 실패:', err); }
          if (!url) { busy(''); st.saving = false; App.showToast('저장하지 못했어요. 다시 해 주세요.', 'error'); return; }
          R._cardPhotos[slot] = url;
          R._cutoutSrc.set(url, { orig: source, level: 0, strokes: fl, key: st.key, mask: this.alphaToUrl(A, W, H), mw: W, mh: H, grow: st.grow, feather: st.feather });
          R._pruneCutoutSrc();
          R._refreshPhotoPreview(slot);
          R._scheduleCardPreview();
        } else {
          R._cardFront = R._cardFront || [];
          R._cardFront[slot] = { src: cur, mask: this.alphaToUrl(AF, W, H), mw: W, mh: H, bbox: bb, grow: st.grow, feather: st.feather,
            line: known && known.line ? { ...known.line } : this.defaultLine(bb), on: true, alpha: isAlpha };
          // 얼굴만 남겼으면 곱하기 전 마스크·선도 기억 (다시 열면 선을 고칠 수 있게)
          if (fl.length) Object.assign(R._cardFront[slot], { base: this.alphaToUrl(A, W, H), faces: fl });
          R._frontEditSlot = slot;
          this.syncSlot(slot);
          R._scheduleCardPreview();
        }
        close();
        return;
      }
      sync();
    });
    ov.querySelector('[data-brush]').addEventListener('input', (e) => { st.brush = Number(e.target.value); });
    // 경계·가장자리·천 색 막대: 끄는 동안 바로 보이게 (한 번 끌기 = 되돌리기 한 번)
    for (const k of ['grow', 'feather', 'tol']) {
      const inp = ov.querySelector(`[data-${k}]`);
      inp.addEventListener('input', () => {
        if (!st.sliding) { push(); st.sliding = true; }
        if (k === 'tol') { if (!st.key) return; st.key.tol = Number(inp.value); applyKey(); }
        else { st[k] = Number(inp.value); if (!A) return; }
        rebuildSoon();
      });
      inp.addEventListener('change', () => { st.sliding = false; sync(); });
    }
    // 손가락: 하나 = 붓(또는 화면 옮기기), 둘 = 확대·이동
    const pts = new Map();
    let pinch = null, pan = null, brush = null, hdrag = null;
    const restoreTo = () => (isAlpha ? origA : true);
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size >= 2) {
        if (brush) { const u = undo.pop(); if (u) A = u.A; brush = null; rebuild(); }
        st.path = null; pan = null; st.tapAt = null; st.cursor = null; st.fpath = null; st.pickAt = null;
        if (hdrag) { const moved = hdrag.moved; hdrag = null; if (moved) rebuild(); }
        if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: st.scale, tx: st.tx, ty: st.ty, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; }
        draw(); return;
      }
      if (pinch || st.saving || !busyEl.hidden) return;
      if (st.tool === 'move') { pan = { x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty }; return; }
      const [ix, iy] = toImg(e.clientX, e.clientY);
      if (st.tool === 'tap') { st.tapAt = [ix, iy]; return; }
      // 천 색 찍어서 고르기: 손을 뗄 때 고른다 (칠하지 않고 모델도 부르지 않는다)
      if (st.tool === 'pick') { st.pickAt = [ix, iy, e.clientX, e.clientY]; return; }
      if (st.tool === 'cut' || st.tool === 'lasso') {
        // 점 가까이(손가락 크기) 누르면 그 점을 끈다
        const ef = st.faces[st.tool];
        if (ef) {
          const hitR = 26 * dpr / view().s;
          let best = -1, bd = hitR;
          for (let i = 0; i < ef.cp.length; i += 2) { const d = Math.hypot(ef.cp[i] - ix, ef.cp[i + 1] - iy); if (d < bd) { bd = d; best = i; } }
          if (best >= 0) { hdrag = { i: best, moved: false }; return; }
        }
        st.fpath = [Math.round(ix), Math.round(iy)]; draw(); return;
      }
      if (st.tool === 'erase' || st.tool === 'restore') {
        push();
        if (!A) A = isAlpha ? origA.slice() : new Uint8Array(N).fill(255); // 고르기 전에 붓부터 — 사진 전체에서 시작
        brush = { r: st.brush / 2 * dpr / view().s, last: [ix, iy] };
        st.cursor = [ix, iy];
        this.dab(A, W, H, ix, iy, brush.r, st.tool === 'restore' ? restoreTo() : null);
        rebuild(true); return;
      }
      if (!A) return;
      st.path = [Math.round(ix), Math.round(iy)]; draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) {
        // 마우스: 붓 동그라미만 따라다니게
        if (e.pointerType === 'mouse' && (st.tool === 'erase' || st.tool === 'restore')) { st.cursor = toImg(e.clientX, e.clientY); draw(); }
        return;
      }
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const ns = Math.max(1, Math.min(8, pinch.scale * d / Math.max(1, pinch.d)));
        const rc = cv.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
        const k = ns / pinch.scale, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        st.scale = ns;
        st.tx = mx - cx - (pinch.mx - cx - pinch.tx) * k;
        st.ty = my - cy - (pinch.my - cy - pinch.ty) * k;
        clampPan(); draw(); return;
      }
      if (pan) { st.tx = pan.tx + e.clientX - pan.x; st.ty = pan.ty + e.clientY - pan.y; clampPan(); draw(); return; }
      const [ix, iy] = toImg(e.clientX, e.clientY);
      if (brush) {
        const [lx, ly] = brush.last, n = Math.ceil(Math.hypot(ix - lx, iy - ly) / Math.max(1, brush.r / 2));
        for (let k = 1; k <= n; k++) this.dab(A, W, H, lx + (ix - lx) * k / n, ly + (iy - ly) * k / n, brush.r, st.tool === 'restore' ? restoreTo() : null);
        brush.last = [ix, iy]; st.cursor = [ix, iy];
        if (!st.raf) st.raf = requestAnimationFrame(() => { st.raf = 0; if (!st.closed) rebuild(true); });
        return;
      }
      if (hdrag) {
        // 처음 움직일 때 되돌리기 한 번 쌓고 새 선으로 (같은 선을 고치면 마스크 기억이 어긋난다)
        const k = st.tool, f = st.faces[k]; if (!f) { hdrag = null; return; }
        if (!hdrag.moved) { push(); hdrag.moved = true; sync(); }
        const cp = f.cp.slice(); cp[hdrag.i] = Math.round(ix); cp[hdrag.i + 1] = Math.round(iy);
        st.faces = { ...st.faces, [k]: { k, cp, p: R._smoothPath(cp, k === 'lasso') } };
        draw(); rebuildSoon(); return;
      }
      if (st.fpath) { st.fpath.push(Math.round(ix), Math.round(iy)); draw(); return; }
      if (st.path) { st.path.push(Math.round(ix), Math.round(iy)); draw(); }
    });
    const doPick = (ix, iy) => {
      const c = this.pickColor(raw, W, H, ix, iy);
      if (!c) { tip('사진 안의 천(배경)을 눌러 주세요.'); return; }
      push();
      st.key = { color: c, tol: st.key ? st.key.tol : this.keyTol(R._guessKeyColor(raw, W, H).spread) };
      applyKey(); rebuild(); sync();
      tip('누른 색을 지웠어요. 다른 곳을 누르면 다시 골라요. 덜·더 지우기는 아래 막대로 맞춰요.', 5000);
    };
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2 && pinch) { pinch = null; sync(); if (pts.size === 1 && st.tool === 'move') { const [p] = [...pts.values()]; pan = { x: p[0], y: p[1], tx: st.tx, ty: st.ty }; } }
      if (pts.size) return;
      pan = null;
      if (e.pointerType !== 'mouse') st.cursor = null;
      if (brush) { brush = null; rebuild(); sync(); return; }
      if (st.pickAt) { const [ix, iy, sx, sy] = st.pickAt; st.pickAt = null; if (e.type === 'pointerup' && Math.hypot(e.clientX - sx, e.clientY - sy) < 12) doPick(ix, iy); return; } // 끌면 고르지 않는다
      if (hdrag) { const moved = hdrag.moved; hdrag = null; if (moved) { rebuild(); sync(); } return; }
      if (st.fpath) {
        const path = st.fpath; st.fpath = null;
        const f = e.type === 'pointerup' ? this.faceFromPath(path, st.tool, W, H) : null;
        if (!f) { draw(); if (e.type === 'pointerup') tip(st.tool === 'lasso' ? '얼굴 둘레를 크게 한 바퀴 그려 주세요.' : '턱 아래를 옆으로(왼쪽↔오른쪽) 그어 주세요.'); return; }
        push();
        if (!A) A = isAlpha ? origA.slice() : new Uint8Array(N).fill(255); // 고르기 전이면 사진 전체에서
        st.faces = { ...st.faces, [f.k]: f };
        rebuild(); sync();
        return;
      }
      if (st.tapAt) { const [ix, iy] = st.tapAt; st.tapAt = null; if (e.type === 'pointerup') doTap(ix, iy); return; }
      if (st.path) { const p = st.path; st.path = null; draw(); if (e.type === 'pointerup') doStroke(p, st.tool === 'minus' ? -1 : 1); }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && st.cursor && !brush) { st.cursor = null; draw(); } });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); if (!e.deltaY) return; st.scale = Math.max(1, Math.min(8, st.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); clampPan(); draw(); sync(); }, { passive: false });
    window.addEventListener('resize', resize);
    // '더 고치기'를 펼치면 사진 칸이 작아진다 → 그때도 다시 맞춘다
    ro = window.ResizeObserver ? new ResizeObserver(() => { if (!st.closed) resize(); }) : null;
    if (ro) ro.observe(stage);
    sync();
    requestAnimationFrame(() => { resize(); rebuild(); });
    // 모델은 미리 조용히 받아 둔다 (콕 누를 때 기다리지 않게). 실패는 누를 때 알린다
    if (!A) this.loadSegmenter().catch(() => {});
  }
};
