// 배경 보관함: 초록 오리기, 색 입히기, 빨간 부분 색 바꾸기, 종류 고르기, 앞 테두리 찾기, 배경 자리
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js', 'js/cutout.js', 'js/bg-library.js'] });
const B = App.bgLib;

const r4 = v => Math.round(v * 10000) / 10000;
const px = (...rgba) => new Uint8ClampedArray(rgba);
// w×h 알파 판: fn(x,y) 가 참이면 255(불투명)
function alpha(w, h, fn) { const A = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) A[y * w + x] = fn(x, y) ? 255 : 0; return A; }

describe('초록 오리기', () => {
  test('순수 초록은 투명, 흰색은 그대로', () => {
    const d = B.keyGreen(px(0, 255, 0, 255, 255, 255, 255, 255));
    assert.equal(d[3], 0);
    assert.deepEqual([...d.slice(4)], [255, 255, 255, 255]);
  });
  test('가장자리 초록 번짐은 g 를 max(r,b) 로 낮춘다', () => {
    const d = B.keyGreen(px(150, 200, 120, 255));
    assert.equal(d[1], 150);
    assert.ok(d[3] > 0 && d[3] < 255); // (200-150)/255=0.196 → 반쯤 투명
  });
  test('살짝 초록빛(0.08 이하)은 불투명 유지', () => {
    const d = B.keyGreen(px(200, 215, 200, 255));
    assert.equal(d[3], 255);
  });
});

describe('색 입히기', () => {
  test('종이 밝기 = 불투명 화소 밝기 90번째 백분위', () => {
    const d = new Uint8ClampedArray(10 * 4);
    for (let i = 0; i < 10; i++) { const v = 100 + i * 10; d.set([v, v, v, 255], i * 4); }
    assert.equal(Math.round(B.paperLevel(d) * 255), 180);
  });
  test('종이색 흰 화소 × 분홍 = 분홍, 그늘은 비례해서 어둡게', () => {
    const d = px(230, 230, 230, 255, 115, 115, 115, 255, 0, 255, 0, 0);
    B.tint(d, '#F7B3C2', 230 / 255);
    assert.deepEqual([...d.slice(0, 3)], [247, 179, 194]);
    assert.deepEqual([...d.slice(4, 7)], [123, 89, 97]); // 절반 밝기 (반올림 오차 1)
    assert.deepEqual([...d.slice(8, 11)], [0, 255, 0]); // 투명 화소는 건드리지 않는다
  });
  test('skipRed: 빨간 리본은 상자 색에 물들지 않는다', () => {
    const d = px(200, 20, 30, 255);
    B.tint(d, '#A7D8F0', 0.9, { skipRed: true });
    assert.deepEqual([...d.slice(0, 3)], [200, 20, 30]);
  });
  test('색 바꾸기 되는 그림: 흰·회색 위주면 참, 알록달록하면 거짓 (빨간 부분은 빼고 센다)', () => {
    const white = new Uint8ClampedArray(40); for (let i = 0; i < 10; i++) white.set(i < 3 ? [200, 20, 30, 255] : [235, 235, 232, 255], i * 4);
    const colorful = new Uint8ClampedArray(40); for (let i = 0; i < 10; i++) colorful.set([40, 120, 200, 255], i * 4);
    assert.equal(B.isTintable(white), true);
    assert.equal(B.isTintable(colorful), false);
    assert.equal(B.hasRed(white), true);
    assert.equal(B.hasRed(colorful), false);
  });
});

describe('빨간 부분 색 바꾸기', () => {
  test('빨강만 바뀌고 흰색·초록 잎은 그대로', () => {
    const d = px(190, 25, 35, 255, 240, 240, 240, 255, 40, 110, 50, 255);
    B.recolorPart(d, '#E79AB0', 0.42);
    assert.notDeepEqual([...d.slice(0, 3)], [190, 25, 35]);
    assert.deepEqual([...d.slice(4, 11)], [240, 240, 240, 255, 40, 110, 50]);
  });
  test('금색: 대표 밝기 빨강은 고른 금색 그대로, 어두운 빨강도 올리브(초록 쪽)가 아니라 주황빛 금색', () => {
    const d = px(190, 25, 35, 255, 90, 10, 15, 255);
    const ref = B.rgbHsl(190, 25, 35)[2];
    B.recolorPart(d, '#D9B45A', ref);
    const [h0, , l0] = B.rgbHsl(d[0], d[1], d[2]);
    const [th, , tl] = B.rgbHsl(0xD9, 0xB4, 0x5A);
    assert.ok(Math.abs(h0 - th) < 2 && Math.abs(l0 - tl) < 0.02);
    const [h1, s1, l1] = B.rgbHsl(d[4], d[5], d[6]);
    assert.ok(h1 < th && h1 > 20, `그늘 색상각 ${h1}`); // 노랑(43°)보다 주황 쪽, 올리브(50°+)로 가지 않는다
    assert.ok(s1 >= 0.55 && l1 >= tl * 0.45 - 0.01, '탁해지지 않는다');
  });
  test('빨강 대표 밝기 (없으면 0.4)', () => {
    assert.equal(B.redRef(px(255, 255, 255, 255)), 0.4);
    assert.equal(B.redRef(px(200, 0, 0, 255)), Math.round(B.rgbHsl(200, 0, 0)[2] * 100) / 100);
  });
});

describe('종류 고르기·앞 테두리', () => {
  const W = 100, H = 120;
  // 상자: 위는 비고, 아래 x 20~80, y 70~110 앞판, 그 위 y 60~70 은 속(투명), 뒤 벽 y 55~60
  const box = alpha(W, H, (x, y) => x >= 20 && x < 80 && ((y >= 70 && y < 110) || (y >= 55 && y < 60) || ((x < 24 || x >= 76) && y >= 55)));
  // 찢어진 종이: 온통 불투명, 가운데 구멍
  const torn = alpha(W, H, (x, y) => !(x > 30 && x < 70 && y > 40 && y < 80));
  test('위가 비고 아래에 물건 → inside, 가운데 구멍 → hole', () => {
    assert.equal(B.detectKind(box, W, H), 'inside');
    assert.equal(B.detectKind(torn, W, H), 'hole');
    assert.equal(B.detectKind(alpha(W, H, () => false), W, H), 'hole'); // 다 투명(물건 없음)
  });
  test('앞 테두리 = 아래에서 앞판을 지나 처음 투명해지는 줄, 입구 폭은 옆벽 사이', () => {
    const r = B.findRim(box, W, H);
    assert.equal(r.y, r4(69 / H));
    assert.deepEqual([r.x0, r.x1], [24 / W, 75 / W]);
  });
  test('가게 진열대: 창 아래 첫 불투명 줄', () => {
    // 위 간판(0~15) · 기둥 · 가운데 창(16~79 투명) · 진열대(80~)
    const booth = alpha(W, H, (x, y) => y < 16 || y >= 80 || x < 12 || x >= 88);
    const r = B.findRim(booth, W, H);
    assert.equal(r.y, r4(79 / H));
    assert.deepEqual([r.x0, r.x1], [12 / W, 87 / W]);
  });
  test('물건이 없으면 null', () => assert.equal(B.findRim(alpha(W, H, () => false), W, H), null));
});

describe('카드 위 배경 자리', () => {
  test('언제나 카드를 덮는다 — 크기·옮기기 범위 제한', () => {
    const g = B.geom(1122, 1402, 1080, 1350, { scale: 1.35, ox: 5, oy: -5 });
    assert.ok(g.x <= 0 && g.y <= 0 && g.x + g.w >= 1080 - 1e-6 && g.y + g.h >= 1350 - 1e-6);
    const g1 = B.geom(1122, 1402, 1080, 1350, { scale: 0.5 });
    assert.ok(g1.w >= 1080 - 1e-6 && g1.h >= 1350 - 1e-6); // 100% 아래로는 안 줄어든다
  });
  test('속에 들어가는 배경: 몸통 선이 테두리에, 가로선·위쪽이 앞', () => {
    const def = { rim: { y: 0.6, x0: 0.3, x1: 0.7 }, sink: 0.4 };
    const g = B.geom(1000, 1250, 1080, 1350, { scale: 1 });
    const p = B.dogPlace(def, {}, { x: 0.2, y: 0.1, w: 0.6, h: 0.8 }, 500, 500, g, 1080, 1350, null);
    assert.equal(p.line.a, 0);
    assert.ok(Math.abs(p.oy + p.line.y * 500 * p.k - p.rimY) < 1e-6);
    assert.ok(Math.abs(p.rimY - 0.6 * 1350) < 1e-6);
    // 강아지 네모 아래 40% 가 테두리 아래로
    const top = p.oy + 0.1 * 500 * p.k, bottom = p.oy + 0.9 * 500 * p.k;
    assert.ok(Math.abs((p.rimY - top) / (bottom - top) - 0.6) < 1e-6);
  });
  test('뒤집으면 입구 가운데도 거울처럼', () => {
    const def = { rim: { y: 0.6, x0: 0.1, x1: 0.3 } };
    const g = B.geom(1080, 1350, 1080, 1350, { scale: 1 });
    const a = B.dogPlace(def, { flip: false }, null, 100, 100, g, 1080, 1350);
    const b = B.dogPlace(def, { flip: true }, null, 100, 100, g, 1080, 1350);
    assert.ok(Math.abs(a.cx - 0.2 * 1080) < 1e-6 && Math.abs(b.cx - 0.8 * 1080) < 1e-6);
  });
  test('단색 배경 자동: 흰 물건이면 연분홍, 색 물건이면 옅게', () => {
    assert.equal(B.autoBackdrop('#FFFFFF'), '#F6E7EA');
    assert.equal(B.autoBackdrop('#A7D8F0'), '#e5f3fb');
  });
});

describe('보관함 목록', () => {
  test('내 버전은 원본 그림을 가리키고 색·뒤집기·크기만 덮는다', () => {
    B._user = [{ id: 'v_1', name: '분홍 종이', base: 'torn', color: '#A7D8F0', flip: true, defaultScale: 1.5 }];
    B._hidden = ['wreath'];
    const d = B.def('v_1');
    assert.equal(d.src, 'assets/backgrounds/torn.webp');
    assert.equal(d.kind, 'hole');
    assert.deepEqual(JSON.parse(JSON.stringify(B.stateFor(d))), { id: 'v_1', color: '#A7D8F0', part: null, backdrop: 'auto', scale: 1.5, ox: 0, oy: 0, flip: true });
    const ids = B.list(false).map(x => x.id);
    assert.equal(ids[0], 'v_1');
    assert.ok(!ids.includes('wreath') && B.list(true).some(x => x.id === 'wreath'));
    B._user = null; B._hidden = null;
  });
});
