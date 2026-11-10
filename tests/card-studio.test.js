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
