// 사진 카드: 사진관·잡지 표지·틀 없이 — 배경색 자동 고르기, 투명 사진 알아보기, 한 색 로고 알아보기, 글자색
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js'] });
const R = App.pages.records;

// n 화소를 같은 색으로
const px = (n, r, g, b, a = 255) => { const d = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) d.set([r, g, b, a], i * 4); return d; };
const join = (...arrs) => { const out = new Uint8ClampedArray(arrs.reduce((s, a) => s + a.length, 0)); let o = 0; arrs.forEach(a => { out.set(a, o); o += a.length; }); return out; };

describe('배경색 자동 고르기', () => {
  test('분홍 벽 사진 → 분홍', () => assert.equal(R._pickStudioColor(px(100, 240, 150, 180), false), 'pink'));
  test('하늘색 사진 → 하늘', () => assert.equal(R._pickStudioColor(px(100, 100, 190, 215), false), 'sky'));
  test('흰 강아지(색 거의 없음) → 연보라', () => assert.equal(R._pickStudioColor(px(100, 245, 245, 240), true), 'lavender'));
  test('배경 지운 갈색 강아지 → 반대쪽 색(하늘)', () => {
    const d = join(px(60, 0, 0, 0, 0), px(40, 170, 110, 60));
    assert.equal(R._pickStudioColor(d, true), 'sky');
  });
});

describe('투명한 사진 알아보기', () => {
  test('반이 투명하면 0.5', () => assert.equal(R._alphaShare(join(px(50, 0, 0, 0, 0), px(50, 9, 9, 9))), 0.5));
  test('투명한 곳이 없으면 0', () => assert.equal(R._alphaShare(px(20, 1, 2, 3)), 0));
});

describe('한 가지 색 로고', () => {
  test('투명 배경 + 검은 글자 → 그 색', () => assert.deepEqual(Array.from(R._monoLogoColor(join(px(70, 0, 0, 0, 0), px(30, 20, 20, 20)))), [20, 20, 20]));
  test('여러 색 로고 → 없음', () => assert.equal(R._monoLogoColor(join(px(50, 0, 0, 0, 0), px(25, 250, 30, 30), px(25, 30, 30, 250))), null));
  test('사각(투명 없는) 로고 → 없음', () => assert.equal(R._monoLogoColor(px(100, 20, 20, 20)), null));
  test('검은 로고 + 남색 배경 → 바꾼다 (묻힘)', () => assert.equal(R._logoNeedsTint([20, 20, 20], '#0F172A'), true));
  test('검은 로고 + 흰 배경 → 그대로', () => assert.equal(R._logoNeedsTint([20, 20, 20], '#FFFFFF'), false));
  test('주황 로고 + 흰 배경 → 그대로 (브랜드 색 유지)', () => assert.equal(R._logoNeedsTint([234, 120, 70], '#FFFFFF'), false));
  test('흰 로고 + 레몬 배경 → 바꾼다', () => assert.equal(R._logoNeedsTint([255, 255, 255], '#F5D565'), true));
});

describe('배경 위 글자색', () => {
  test('연보라 → 흰 글자', () => assert.equal(R._studioInk(R._STUDIO_COLORS.lavender.hex), '#FFFFFF'));
  test('레몬 → 짙은 글자', () => assert.equal(R._studioInk(R._STUDIO_COLORS.lemon.hex), '#2B2B2B'));
});

describe('색 섞기', () => {
  test('흰색과 검정 반반 → 회색', () => assert.equal(R._mixHex('#FFFFFF', '#000000', 0.5), '#808080'));
});

describe('새 틀', () => {
  test('틀 없이·사진관·잡지 표지는 사진 1장', () => {
    ['plain', 'studio', 'magazine'].forEach(k => assert.equal(R._cardPhotoCount({ layout: k, settings: {} }), 1));
  });
});

describe('떼어 낸 사진 가장자리 다듬기', () => {
  // 100×100: 가운데 60×60 털(빨강), 둘레 3칸 배경 띠(초록)가 남은 사진
  const make = () => {
    const w = 100, h = 100, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      if (x >= 20 && x < 80 && y >= 20 && y < 80) d.set([200, 50, 50, 255], q);
      else if (x >= 17 && x < 83 && y >= 17 && y < 83) d.set([0, 200, 0, 255], q);
    }
    return { w, h, d };
  };
  const px = (d, w, x, y) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
  test('보통: 초록 띠가 사라지고(털 색으로) 가운데는 그대로', () => {
    const { w, h, d } = make();
    R._refineCutout(d, w, h, 2, null);
    for (let x = 14; x < 22; x++) { const p = px(d, w, x, 50); assert.ok(p[3] === 0 || p[1] < 100, `x=${x} ${p}`); }
    assert.deepEqual(px(d, w, 50, 50), [200, 50, 50, 255]);
  });
  test('가장자리는 부드럽게 (중간 투명도가 생긴다)', () => {
    const { w, h, d } = make();
    R._refineCutout(d, w, h, 2, null);
    const a = [];
    for (let x = 14; x < 30; x++) a.push(px(d, w, x, 50)[3]);
    assert.ok(a.some(v => v > 0 && v < 255), a.join(','));
  });
  test('끄기: 그대로', () => {
    const { w, h, d } = make(); const before = d.slice();
    R._refineCutout(d, w, h, 0, null);
    assert.deepEqual(Array.from(d), Array.from(before));
  });
  test('지우기 붓 → 투명, 되살리기 붓 → 원래대로', () => {
    const { w, h, d } = make();
    R._refineCutout(d, w, h, 0, [{ m: -1, r: 5, p: [50, 50] }]);
    assert.equal(px(d, w, 50, 50)[3], 0);
    const m2 = make();
    R._refineCutout(m2.d, w, h, 3, [{ m: 1, r: 4, p: [18, 50] }]);
    assert.deepEqual(px(m2.d, w, 18, 50), [0, 200, 0, 255]);
  });
  test('사진 끝에서 잘린 몸통은 끝선이 깎이지 않는다', () => {
    const w = 60, h = 60, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 20; y < h; y++) for (let x = 10; x < 50; x++) d.set([180, 150, 120, 255], (y * w + x) * 4);
    R._refineCutout(d, w, h, 3, null);
    assert.equal(d[((h - 1) * w + 30) * 4 + 3], 255);
  });
  test('아주 작은 그림은 다듬지 않는다 (사라지지 않게)', () => {
    const d = new Uint8ClampedArray(10 * 10 * 4).fill(255);
    R._refineCutout(d, 10, 10, 3, null);
    assert.equal(d[3], 255);
  });
  test('붓 선은 점 사이를 메운다', () => {
    const mask = R._strokeMask([{ m: -1, r: 2, p: [10, 10, 40, 10] }], 50, 20);
    for (let x = 10; x <= 40; x++) assert.equal(mask[10 * 50 + x], -1, `x=${x}`);
  });
});

describe('한 가지 색 천 지우기 · 얼굴만', () => {
  const px = (d, w, x, y) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 4));
  // 40×40 파란 천 가운데 20×20 크림색 강아지, 둘레 1칸은 반반 섞인 털, 그 바깥 1칸은 털이 조금(25%)
  const scene = () => {
    const w = 40, h = 40, d = new Uint8ClampedArray(w * h * 4), blue = [30, 90, 200], dog = [235, 215, 185];
    const ring = (x, y, k) => x >= 10 - k && x < 30 + k && y >= 10 - k && y < 30 + k;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = ring(x, y, 0) ? dog : ring(x, y, 1) ? dog.map((v, i) => (v + blue[i]) / 2)
        : ring(x, y, 2) ? dog.map((v, i) => v * 0.25 + blue[i] * 0.75) : blue;
      d.set([...c, 255], (y * w + x) * 4);
    }
    return { w, h, d, blue, dog };
  };
  test('천 색을 둘레에서 찾는다', () => {
    const { w, h, d } = scene();
    const g = R._guessKeyColor(d, w, h);
    assert.deepEqual(Array.from(g.color), [30, 90, 200]);  // 천 색
    assert.ok(g.spread < 5);
  });
  test('천은 투명, 강아지는 그대로, 섞인 털 끝은 반투명이고 파란 기가 빠진다', () => {
    const { w, h, d, blue } = scene();
    R._chromaKey(d, w, h, blue, 20);
    assert.equal(px(d, w, 2, 2)[3], 0);
    assert.deepEqual(px(d, w, 20, 20), [235, 215, 185, 255]);
    const e = px(d, w, 9, 20);
    assert.ok(Math.abs(e[0] - 235) < 20 && Math.abs(e[2] - 185) < 20, `섞인 털은 털 색으로 ${e}`);
    const o = px(d, w, 8, 20);
    assert.ok(o[3] > 0 && o[3] < 255, `털 끝 반투명 ${o}`);
  });
  test('다각형 채우기', () => {
    const m = R._polyFill([2, 2, 8, 2, 8, 8, 2, 8], 10, 10);
    assert.equal(m[5 * 10 + 5], 255); assert.equal(m[0], 0);
  });
  test('턱 아래 선: 선 아래는 지우고 위는 남긴다', () => {
    const w = 60, h = 60;
    const fm = R._faceMask({ k: 'cut', p: [5, 30, 55, 30] }, w, h);
    assert.ok(fm[10 * w + 30] > 250); assert.ok(fm[50 * w + 30] < 5);
  });
  test('둘레: 안만 남긴다', () => {
    const w = 60, h = 60;
    const fm = R._faceMask({ k: 'lasso', p: [10, 10, 50, 10, 50, 50, 10, 50] }, w, h);
    assert.ok(fm[30 * w + 30] > 250); assert.ok(fm[2 * w + 2] < 5);
  });
  test('비슷한 색만 지우는 붓은 다른 색(털)을 남긴다', () => {
    const { w, h, d } = scene();
    const out = d.slice();
    R._refineCutout(out, w, h, 0, [{ m: -1, r: 30, p: [20, 20], c: [30, 90, 200], t: 30 }], d.slice());
    assert.equal(px(out, w, 2, 2)[3], 0);
    assert.equal(px(out, w, 20, 20)[3], 255);
  });
});

describe('얼굴 선 점으로 고치기', () => {
  test('그은 선을 같은 간격 점으로', () => {
    assert.deepEqual(Array.from(R._resamplePath([0, 0, 100, 0], 5, false)), [0, 0, 25, 0, 50, 0, 75, 0, 100, 0]);
  });
  test('둘레는 닫힌 모양으로 점 n개', () => {
    assert.equal(R._resamplePath([0, 0, 100, 0, 100, 100, 0, 100], 8, true).length, 16);
  });
  test('곡선은 점을 지난다 (첫 점·끝 점)', () => {
    const p = R._smoothPath([0, 0, 50, 50, 100, 0], false);
    assert.deepEqual([p[0], p[1]], [0, 0]);
    assert.deepEqual([p[p.length - 2], p[p.length - 1]], [100, 0]);
  });
});

describe('가장자리 막대 값', () => {
  const make = () => {
    const w = 100, h = 100, d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      if (x >= 20 && x < 80 && y >= 20 && y < 80) d.set([200, 50, 50, 255], q);
      else if (x >= 17 && x < 83 && y >= 17 && y < 83) d.set([0, 200, 0, 255], q);
    }
    return d;
  };
  test('단계 숫자 → 막대 값', () => {
    assert.deepEqual({ ...R._edgeOf(2) }, { e: 2, f: 2, c: 1 });
    assert.deepEqual({ ...R._edgeOf(0) }, { e: 0, f: 0, c: 0 });
  });
  test('막대 값은 범위 안으로', () => assert.deepEqual({ ...R._edgeOf({ e: 20, f: -1, c: 3 }) }, { e: 8, f: 0, c: 1 }));
  test('모두 0이면 그대로', () => {
    const d = make(), before = d.slice();
    R._refineCutout(d, 100, 100, { e: 0, f: 0, c: 0 }, null);
    assert.deepEqual(Array.from(d), Array.from(before));
  });
  test('많이 깎으면 초록 띠가 사라지고, 덜 깎으면 남는다', () => {
    const a = make(); R._refineCutout(a, 100, 100, { e: 5, f: 0, c: 0 }, null);
    assert.equal(a[(50 * 100 + 18) * 4 + 3], 0);
    const b = make(); R._refineCutout(b, 100, 100, { e: 0, f: 0, c: 0 }, null);
    assert.equal(b[(50 * 100 + 18) * 4 + 3], 255);
  });
  test('털 색 0%면 색은 원래대로, 100%면 털 색 쪽으로', () => {
    const a = make(); R._refineCutout(a, 100, 100, { e: 0, f: 2, c: 0 }, null);
    const b = make(); R._refineCutout(b, 100, 100, { e: 0, f: 2, c: 1 }, null);
    const g = (d) => d[(50 * 100 + 17) * 4 + 1];
    assert.ok(g(a) > g(b), `${g(a)} > ${g(b)}`);
  });
});
