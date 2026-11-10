// 사진 카드: 내 프레임 사진 칸 자동 찾기(_findHolesInAlpha) · 사진 느낌 필터(_applyFilterPixels) · 사진 장수(_cardPhotoCount)
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js'] });
const R = App.pages.records;

// w×h 불투명(255) 판에 rects 자리만 투명(0)으로 뚫는다
function frame(w, h, rects) {
  const a = new Uint8Array(w * h).fill(255);
  for (const [x, y, rw, rh] of rects) {
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) a[yy * w + xx] = 0;
  }
  return a;
}
const near = (v, want) => assert.ok(Math.abs(v - want) < 0.02, `${v} ≈ ${want}`);

describe('프레임 사진 칸 찾기', () => {
  test('네컷 세로: 칸 4개를 위에서부터', () => {
    const w = 100, h = 300;
    const holes = R._findHolesInAlpha(frame(w, h, [[10, 10, 80, 60], [10, 80, 80, 60], [10, 150, 80, 60], [10, 220, 80, 60]]), w, h);
    assert.equal(holes.length, 4);
    near(holes[0].y, 9 / 300); near(holes[3].y, 219 / 300);
    near(holes[0].x, 9 / 100); near(holes[0].w, 82 / 100);
    assert.ok(holes[0].y < holes[1].y && holes[1].y < holes[2].y && holes[2].y < holes[3].y);
  });
  test('2×2: 같은 줄은 왼쪽부터', () => {
    const w = 200, h = 200;
    const holes = R._findHolesInAlpha(frame(w, h, [[110, 10, 80, 80], [10, 10, 80, 80], [110, 110, 80, 80], [10, 110, 80, 80]]), w, h);
    assert.equal(holes.length, 4);
    assert.ok(holes[0].x < holes[1].x && holes[0].y < holes[2].y && holes[2].x < holes[3].x);
  });
  test('작은 투명 점·가는 선은 칸이 아니다', () => {
    const w = 200, h = 200;
    const holes = R._findHolesInAlpha(frame(w, h, [[20, 20, 160, 120], [5, 180, 3, 3], [10, 160, 180, 2]]), w, h);
    assert.equal(holes.length, 1);
  });
  test('투명한 곳이 없으면 빈 배열 (JPG)', () => {
    assert.equal(R._findHolesInAlpha(new Uint8Array(50 * 50).fill(255), 50, 50).length, 0);
  });
  test('가장자리에 닿은 칸도 찾는다 (사진을 끝까지 채운 프레임)', () => {
    const holes = R._findHolesInAlpha(frame(100, 100, [[0, 0, 100, 70]]), 100, 100);
    assert.equal(holes.length, 1);
    near(holes[0].x, 0); near(holes[0].w, 1); near(holes[0].h, 0.71);
  });
});

describe('사진 느낌 필터', () => {
  const px = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);
  test('흑백은 세 색이 같아진다, 투명도는 그대로', () => {
    const d = R._applyFilterPixels(px(200, 50, 50), R._CARD_FILTERS.bw);
    assert.equal(d[0], d[1]); assert.equal(d[1], d[2]); assert.equal(d[3], 255);
  });
  test('따뜻하게는 빨강↑ 파랑↓, 시원하게는 반대', () => {
    const w = R._applyFilterPixels(px(128, 128, 128), R._CARD_FILTERS.warm);
    assert.ok(w[0] > 128 && w[2] < 128);
    const c = R._applyFilterPixels(px(128, 128, 128), R._CARD_FILTERS.cool);
    assert.ok(c[0] < 128 && c[2] > 128);
  });
  test('값은 0~255 안 (넘치지 않는다)', () => {
    const d = R._applyFilterPixels(px(255, 255, 255), R._CARD_FILTERS.soft);
    assert.ok(d[0] <= 255 && d[0] >= 0);
  });
  test('모든 필터에 이름이 있다 (원본 포함)', () => {
    for (const [k, f] of Object.entries(R._CARD_FILTERS)) assert.ok(f.name, k);
    assert.ok(R._CARD_FILTERS.none);
  });
});

describe('사진 카드 장수', () => {
  test('칸을 찾은 프레임이면 칸 수(최대 4)', () => {
    assert.equal(R._cardPhotoCount({ layout: 'single', settings: { frameHoles: [{}, {}] } }), 2);
    assert.equal(R._cardPhotoCount({ layout: 'single', settings: { frameHoles: new Array(6).fill({}) } }), 4);
  });
  test('프레임이 없으면 레이아웃 장수', () => {
    assert.equal(R._cardPhotoCount({ layout: 'photobooth', settings: {} }), 4);
    assert.equal(R._cardPhotoCount({ layout: 'single', settings: { frameHoles: [] } }), 1);
  });
});

describe('글자 넣기 모양·색', () => {
  test('예전 분홍·검정 라벨은 라벨 + 그 색', () => {
    const a = R._textStickerDefaults('pink');
    assert.equal(a.style, 'label'); assert.equal(a.color, '#FF6B9A');
    const b = R._textStickerDefaults('dark');
    assert.equal(b.style, 'label'); assert.equal(b.color, '#1F2937');
  });
  test('색을 안 고른 글자: 글자만·테두리는 진한 색, 상자 모양은 흰색', () => {
    assert.equal(R._textStickerDefaults('outline').color, '#1F2937');
    assert.equal(R._textStickerDefaults('box').color, '#FFFFFF');
    assert.equal(R._textStickerDefaults('없는모양').style, 'bubble');
  });
  test('밝은 색 위에는 진한 글자, 어두운 색 위에는 흰 글자', () => {
    assert.equal(R._isLightColor('#FFFFFF'), true);
    assert.equal(R._isLightColor('#FACC15'), true);
    assert.equal(R._isLightColor('#1F2937'), false);
    assert.equal(R._isLightColor('#6366F1'), false);
  });
});

describe('프레임 만들기 칸 배치', () => {
  const { App: A2 } = loadApp({ files: ['js/app.js', 'js/pages/records.js', 'js/frame-maker.js'] });
  const FM = A2.frameMaker;
  test('네컷 세로: 칸 4개가 프레임 안에, 겹치지 않고 위에서부터', () => {
    const cells = FM.cells({ tpl: 'booth4', title: 'HI', caption: 'SHOP' });
    assert.equal(cells.length, 4);
    for (let i = 0; i < 4; i++) {
      const c = cells[i];
      assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1080 && c.y + c.h <= 3240);
      if (i) assert.ok(c.y >= cells[i - 1].y + cells[i - 1].h);
    }
  });
  test('2×2·폴라로이드·2컷 칸 수', () => {
    assert.equal(FM.cells({ tpl: 'grid4' }).length, 4);
    assert.equal(FM.cells({ tpl: 'story4' }).length, 4);
    assert.equal(FM.cells({ tpl: 'polaroid', caption: 'x' }).length, 1);
    assert.equal(FM.cells({ tpl: 'strip2' }).length, 2);
  });
  test('위 글자가 있으면 칸이 아래로 내려가 글자 자리를 비운다', () => {
    assert.ok(FM.cells({ tpl: 'grid4', title: '제목' })[0].y > FM.cells({ tpl: 'grid4' })[0].y);
  });
  test('추천 스타일은 모두 이름·배경 방식·글자 색이 있다', () => {
    for (const [k, p] of Object.entries(FM.PRESETS)) {
      assert.ok(p.name && p.bgType && p.textColor, k);
      if (p.bgType === 'pattern') assert.ok(FM.PATTERNS[p.pattern], k + ' 무늬');
    }
  });
});

describe('흰 네모 칸 찾기 (챗GPT 프레임)', () => {
  // w×h 색 판(초록)에 흰 네모를 그린다
  function img(w, h, rects, bg = [120, 200, 120]) {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255; }
    for (const [x, y, rw, rh] of rects) for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) { const i = (yy * w + xx) * 4; d[i] = d[i + 1] = d[i + 2] = 255; }
    return d;
  }
  test('흰 네모 4개를 찾는다', () => {
    assert.equal(R._findWhiteBoxes(img(100, 100, [[5, 5, 40, 40], [55, 5, 40, 40], [5, 55, 40, 40], [55, 55, 40, 40]]), 100, 100).length, 4);
  });
  test('가장자리에 닿은 흰 바탕은 칸이 아니다', () => {
    assert.equal(R._findWhiteBoxes(img(100, 100, [], [255, 255, 255]), 100, 100).length, 0);
    assert.equal(R._findWhiteBoxes(img(100, 100, [[0, 10, 50, 50]]), 100, 100).length, 0);
  });
  test('작은 흰 점(글자 속 흰 부분)은 무시', () => {
    assert.equal(R._findWhiteBoxes(img(100, 100, [[10, 10, 3, 3]]), 100, 100).length, 0);
  });
});
