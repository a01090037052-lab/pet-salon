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
    story4: { name: '2×2 스토리', w: 1080, h: 1920 }
  },
  PATTERNS: { dots: '도트', gingham: '깅엄 체크', stripe: '사선 줄무늬', paw: '발자국', heart: '하트', star: '반짝이', confetti: '컨페티', film: '필름' },
  // 추천 스타일 — 한 번 누르면 배경·글자·칸 모양을 한꺼번에. {매장명} 은 매장 이름으로 바뀐다
  PRESETS: {
    picnic: { name: '피크닉 체크', bgType: 'pattern', pattern: 'gingham', bg1: '#FFF8F0', bg2: '#F9A8D4', radius: 24, border: 'white', title: 'PICNIC DAY', caption: '{매장명}', font: 'gaegu', textColor: '#9D174D', band: false },
    mono: { name: '블랙 미니멀', bgType: 'solid', bg1: '#111111', bg2: '#333333', radius: 0, border: 'none', title: '', caption: 'PHOTO BOOTH · {매장명}', font: 'paperlogy', textColor: '#FFFFFF', band: false },
    y2k: { name: 'Y2K 그라데이션', bgType: 'gradient', bg1: '#C4B5FD', bg2: '#F9A8D4', radius: 60, border: 'white', title: 'GROOMED ✦', caption: '{매장명}', font: 'bagel', textColor: '#FFFFFF', band: false },
    mint: { name: '민트 발자국', bgType: 'pattern', pattern: 'paw', bg1: '#D1FAE5', bg2: '#6EE7B7', radius: 24, border: 'white', title: '', caption: '오늘도 보송보송', font: 'jua', textColor: '#065F46', band: true, bandColor: '#FFFFFF' },
    film: { name: '레트로 필름', bgType: 'pattern', pattern: 'film', bg1: '#2B2420', bg2: '#F5E6D3', radius: 4, border: 'none', title: '', caption: '35mm · {매장명}', font: 'orbit', textColor: '#F5E6D3', band: false },
    birthday: { name: '생일 컨페티', bgType: 'pattern', pattern: 'confetti', bg1: '#FFFBEB', bg2: '#F43F5E', radius: 24, border: 'white', title: 'HAPPY BIRTHDAY', caption: '{매장명}', font: 'bagel', textColor: '#F43F5E', band: false },
    spring: { name: '벚꽃 도트', bgType: 'pattern', pattern: 'dots', bg1: '#FFF1F2', bg2: '#FDA4AF', radius: 60, border: 'white', title: 'SPRING', caption: '봄날의 산책 🌸', font: 'gamja', textColor: '#BE123C', band: false },
    xmas: { name: '크리스마스', bgType: 'pattern', pattern: 'stripe', bg1: '#B91C1C', bg2: '#FFFFFF', radius: 24, border: 'white', title: 'MERRY CHRISTMAS', caption: '{매장명}', font: 'blackhan', textColor: '#FFFFFF', band: true, bandColor: '#14532D' },
    star: { name: '밤하늘 반짝', bgType: 'pattern', pattern: 'star', bg1: '#1E1B4B', bg2: '#FDE68A', radius: 24, border: 'none', title: 'LITTLE STAR', caption: '{매장명}', font: 'orbit', textColor: '#FDE68A', band: false },
    heart: { name: '러블리 하트', bgType: 'pattern', pattern: 'heart', bg1: '#FFE4E6', bg2: '#FB7185', radius: 60, border: 'white', title: '', caption: 'LOVE MY PUPPY ♥', font: 'dongle', textColor: '#BE123C', band: true, bandColor: '#FFFFFF' }
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
    if (p.tpl === 'polaroid') {
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
    const logoImg = p.logo ? await R._loadImg(await DB.getSetting('shopLogo')) : null;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    this._drawBackground(x, W, H, p, bgImg);
    const cells = this.cells({ ...p, title, caption });
    const rad = Number(p.radius) || 0;
    // 칸 테두리 (사진 둘레 띠)
    if (p.border && p.border !== 'none') {
      x.fillStyle = p.border === 'black' ? '#111111' : '#FFFFFF';
      cells.forEach(cl => { R._roundRect(x, cl.x - 12, cl.y - 12, cl.w + 24, cl.h + 24, rad ? rad + 10 : 2); x.fill(); });
    }
    // 사진 칸 뚫기
    x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    cells.forEach(cl => { if (rad) { R._roundRect(x, cl.x, cl.y, cl.w, cl.h, rad); x.fill(); } else x.fillRect(cl.x, cl.y, cl.w, cl.h); });
    x.restore();
    // 위·아래 글자
    const last = cells[cells.length - 1];
    const bottomTop = last.y + last.h + 12, bottomH = H - bottomTop;
    const tSize = p.tpl === 'booth4' ? 92 : 80, cSize = p.tpl === 'polaroid' ? 88 : (p.tpl === 'booth4' ? 70 : 62);
    if (title) this._drawText(x, title, W / 2, cells[0].y / 2 + 4, W - 120, tSize, p, fontStack);
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
    const holes = cells.map(cl => ({ x: cl.x / W, y: cl.y / H, w: cl.w / W, h: cl.h / H }));
    return { canvas: c, holes, fw: W, fh: H };
  },

  // 미리보기: 투명한 칸을 회색 '사진 1·2…' 자리로 채워 보여 준다 (투명한 채로는 칸이 바깥과 구분되지 않았다)
  _previewUrl(r) {
    const c = document.createElement('canvas'); c.width = r.canvas.width; c.height = r.canvas.height;
    const x = c.getContext('2d');
    r.holes.forEach((h, i) => {
      const X = h.x * c.width, Y = h.y * c.height, w = h.w * c.width, hh = h.h * c.height;
      x.fillStyle = '#CBD5E1'; x.fillRect(X, Y, w, hh);
      x.fillStyle = '#64748B'; x.font = `bold ${Math.round(Math.min(w, hh) * 0.18)}px -apple-system, sans-serif`;
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
    const p = editing ? { ...this.defaults(), ...frame.maker } : this.defaults();
    const R = App.pages.records;
    const hasLogo = !!(await DB.getSetting('shopLogo'));
    if (!hasLogo) p.logo = false; // 로고를 지운 뒤에는 자리만 비지 않게
    const chips = (obj, key, cur) => Object.entries(obj).map(([k, v]) => `<button type="button" class="card-tstyle-btn${k === cur ? ' active' : ''}" data-${key}="${k}">${typeof v === 'string' ? v : v.name}</button>`).join('');
    const sw = (id, cur) => `<div class="fm-swatches" data-for="${id}">${this.SWATCHES.map(c => `<button type="button" class="card-text-color${c.toLowerCase() === String(cur).toLowerCase() ? ' active' : ''}" data-color="${c}" style="background:${c}" aria-label="색 ${c}"></button>`).join('')}<input type="color" id="${id}" value="${cur}" aria-label="직접 고르기"></div>`;
    App.showModal({
      title: editing ? '프레임 고치기' : '프레임 만들기',
      size: 'lg',
      saveText: '내 프레임에 저장',
      content: `
        <div class="fm">
          <div class="fm-preview"><img id="fm-img" alt="프레임 미리보기"><div class="fm-preview-note">투명한 칸에 사진이 들어가요</div></div>
          <div class="fm-panel">
            <div class="form-group"><label class="form-label">추천 스타일 <span class="fm-sub">· 누르면 한 번에 바뀌어요</span></label>
              <div class="fm-row" id="fm-presets">${chips(this.PRESETS, 'preset', p.preset)}</div></div>
            <div class="form-group"><label class="form-label">칸 배치</label>
              <div class="fm-row" id="fm-tpl">${chips(this.TEMPLATES, 'tpl', p.tpl)}</div></div>
            <div class="form-group"><label class="form-label">배경</label>
              <div class="fm-row" id="fm-bgtype">${chips({ solid: '단색', gradient: '그라데이션', pattern: '무늬', photo: '사진' }, 'bgtype', p.bgType)}</div>
              <div class="fm-row" id="fm-pattern" ${p.bgType === 'pattern' ? '' : 'hidden'}>${chips(this.PATTERNS, 'pattern', p.pattern)}</div>
              <div id="fm-photo-row" ${p.bgType === 'photo' ? '' : 'hidden'}><button type="button" class="btn btn-sm btn-secondary" id="fm-photo-btn">${App.icon('image')} 배경 사진 고르기</button><input type="file" id="fm-photo" accept="image/*" hidden></div>
              <div class="fm-color-label">바탕 색</div>${sw('fm-bg1', p.bg1)}
              <div id="fm-bg2-wrap" ${p.bgType === 'gradient' || p.bgType === 'pattern' ? '' : 'hidden'}><div class="fm-color-label">${p.bgType === 'gradient' ? '두 번째 색' : '무늬 색'}</div>${sw('fm-bg2', p.bg2)}</div>
            </div>
            <div class="form-group"><label class="form-label">사진 칸</label>
              <div class="fm-row" id="fm-radius">${chips({ 0: '각지게', 24: '둥글게', 60: '많이 둥글게' }, 'radius', String(p.radius))}</div>
              <div class="fm-row" id="fm-border">${chips({ none: '테두리 없음', white: '흰 테두리', black: '검정 테두리' }, 'border', p.border)}</div>
            </div>
            <div class="form-group"><label class="form-label">글자 <span class="fm-sub">· {매장명}은 매장 이름으로 바뀌어요</span></label>
              <input type="text" id="fm-title" maxlength="24" placeholder="위 글자 (비우면 없음)" value="${App.escapeHtml(p.title || '')}">
              <input type="text" id="fm-caption" maxlength="30" placeholder="아래 글자 (비우면 없음)" value="${App.escapeHtml(p.caption || '')}" style="margin-top:6px">
              ${hasLogo ? `<label class="card-toggle" style="margin-top:8px"><input type="checkbox" id="fm-logo" ${p.logo ? 'checked' : ''}> 매장 로고 넣기</label>` : ''}
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
        const name = (document.getElementById('fm-name')?.value || '').trim();
        if (!name) { App.showToast('프레임 이름을 입력해주세요.', 'error'); return; }
        const all = (await DB.getSetting('customFrames')) || [];
        const max = App.pages.settings.MAX_FRAMES || 20;
        if (!editing && all.length >= max) { App.showToast(`프레임은 최대 ${max}개까지 등록할 수 있어요.`, 'error'); return; }
        const r = await this.render(p);
        const image = r.canvas.toDataURL('image/png');
        r.canvas.width = r.canvas.height = 0;
        const rec = {
          id: editing ? frame.id : 'f' + Date.now(), name, image, mode: 'overlay', holes: r.holes, fw: r.fw, fh: r.fh,
          accentColor: p.textColor, textColor: p.textColor, enabled: editing ? frame.enabled !== false : true,
          maker: { ...p }, createdAt: (editing && frame.createdAt) || new Date().toISOString()
        };
        const idx = all.findIndex(f => f.id === rec.id);
        if (idx >= 0) all[idx] = rec; else all.push(rec);
        await DB.setSetting('customFrames', all);
        App.closeModal();
        App.showToast(editing ? '프레임을 고쳤어요.' : '내 프레임에 저장했어요. 사진 카드 → 꾸미기에서 고르세요.');
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
      if ($('fm-band')) $('fm-band').checked = !!p.band;
      if ($('fm-title') && document.activeElement !== $('fm-title')) $('fm-title').value = p.title || '';
      if ($('fm-caption') && document.activeElement !== $('fm-caption')) $('fm-caption').value = p.caption || '';
      [['fm-bg1', p.bg1], ['fm-bg2', p.bg2], ['fm-text', p.textColor], ['fm-bandc', p.bandColor || '#FFFFFF']].forEach(([id, v]) => {
        const inp = $(id); if (!inp) return;
        inp.value = v;
        inp.closest('.fm-swatches')?.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('active', b.dataset.color.toLowerCase() === String(v).toLowerCase()));
      });
    };
    const on = (id, attr, fn) => $(id)?.addEventListener('click', (e) => { const b = e.target.closest(`[data-${attr}]`); if (!b) return; fn(b.dataset[attr]); syncAll(); draw(); });
    on('fm-presets', 'preset', (k) => {
      const pr = this.PRESETS[k]; if (!pr) return;
      const keep = { tpl: p.tpl, logo: p.logo, bgPhoto: p.bgPhoto };
      Object.keys(p).forEach(key => delete p[key]);
      Object.assign(p, { bandColor: '#FFFFFF', pattern: 'dots' }, pr, keep, { preset: k });
      const nm = $('fm-name'); if (nm && (!nm.value || Object.values(this.PRESETS).some(x => x.name === nm.value))) nm.value = pr.name;
    });
    on('fm-tpl', 'tpl', (k) => { p.tpl = k; });
    on('fm-bgtype', 'bgtype', (k) => { p.bgType = k; if (k === 'photo' && !p.bgPhoto) $('fm-photo')?.click(); });
    on('fm-pattern', 'pattern', (k) => { p.pattern = k; });
    on('fm-radius', 'radius', (k) => { p.radius = Number(k); });
    on('fm-border', 'border', (k) => { p.border = k; });
    $('fm-font')?.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (!b) return; p.font = b.dataset.key; syncAll(); draw(); });
    document.querySelectorAll('.fm-swatches').forEach(box => {
      const id = box.dataset.for;
      const set = (v) => { if (id === 'fm-bg1') p.bg1 = v; else if (id === 'fm-bg2') p.bg2 = v; else if (id === 'fm-text') p.textColor = v; else p.bandColor = v; syncAll(); draw(); };
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) set(b.dataset.color); });
      box.querySelector('input[type="color"]')?.addEventListener('input', (e) => set(e.target.value));
    });
    $('fm-title')?.addEventListener('input', (e) => { p.title = e.target.value; draw(); });
    $('fm-caption')?.addEventListener('input', (e) => { p.caption = e.target.value; draw(); });
    $('fm-logo')?.addEventListener('change', (e) => { p.logo = e.target.checked; draw(); });
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
