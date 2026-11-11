// 내 프레임 글자: 저장 값 다듬기(normalizeFrameText) · {매장명} 바꾸기(fillShop) · 글자 스티커 크기(textStickerSize)
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js', 'js/frame-maker.js'] });
const FM = App.frameMaker;

describe('프레임 글자 값 다듬기', () => {
  test('예전 프레임(글자 값 없음)·이상한 값은 null', () => {
    assert.equal(FM.normalizeFrameText(undefined), null);
    assert.equal(FM.normalizeFrameText(null), null);
    assert.equal(FM.normalizeFrameText('PICNIC'), null);
    assert.equal(FM.normalizeFrameText({ items: 'x' }), null);
    assert.equal(FM.normalizeFrameText({ items: [{ role: 'title', text: '   ' }] }), null);
  });
  test('정상 값은 그대로, 빠진 값은 기본값', () => {
    const t = FM.normalizeFrameText({ font: 'gaegu', color: '#9D174D', band: true, bandColor: '#FFFFFF', items: [
      { role: 'title', text: ' PICNIC DAY ', x: 0.5, y: 0.03, size: 0.085, maxW: 0.89 },
      { role: 'caption', text: '{매장명}' }
    ] });
    assert.equal(t.v, 1);
    assert.equal(t.font, 'gaegu');
    assert.equal(t.color, '#9D174D');
    assert.equal(t.band, true);
    assert.equal(t.glow, false);
    assert.equal(t.items.length, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(t.items[0])), { role: 'title', text: 'PICNIC DAY', x: 0.5, y: 0.03, size: 0.085, maxW: 0.89 });
    const c = t.items[1];
    assert.equal(c.role, 'caption'); assert.equal(c.text, '{매장명}');
    assert.equal(c.x, 0.5); assert.equal(c.y, 0.94); assert.equal(c.size, 0.06); assert.equal(c.maxW, 0.9);
  });
  test('범위 밖 숫자는 잘라 넣고, 색이 이상하면 기본 색', () => {
    const t = FM.normalizeFrameText({ color: 'red', bandColor: 123, items: [{ role: 'x', text: 'A', x: 5, y: -1, size: 9, maxW: 0 }] });
    assert.equal(t.color, '#FFFFFF'); assert.equal(t.bandColor, '#FFFFFF'); assert.equal(t.font, 'system');
    const i = t.items[0];
    assert.equal(i.role, 'caption'); assert.equal(i.x, 1); assert.equal(i.y, 0); assert.equal(i.size, 0.3); assert.equal(i.maxW, 0.05);
  });
  test('빈 글자는 빼고, 너무 긴 글자는 자른다', () => {
    const t = FM.normalizeFrameText({ items: [{ role: 'title', text: '' }, { role: 'caption', text: 'ㄱ'.repeat(100) }] });
    assert.equal(t.items.length, 1);
    assert.equal(t.items[0].text.length, 60);
  });
});

describe('{매장명} 바꾸기', () => {
  test('매장 이름으로, 없으면 PET SALON', () => {
    assert.equal(FM.fillShop('{매장명} · {매장명}', '콩콩살롱'), '콩콩살롱 · 콩콩살롱');
    assert.equal(FM.fillShop('PHOTO · {매장명}', ''), 'PHOTO · PET SALON');
    assert.equal(FM.fillShop(null, 'x'), '');
  });
});

describe('글자 스티커 크기', () => {
  test('폭이 넉넉하면 프레임 글자 크기 그대로 (88px 그림 기준)', () => {
    // 글자 크기 0.08(프레임 가로), 그림 가로 440px → 440 × 0.08 / 88 = 0.4
    assert.ok(Math.abs(FM.textStickerSize({ size: 0.08, maxW: 0.9 }, 440, 400) - 0.4) < 1e-9);
  });
  test('긴 글자는 최대 폭에 맞춰 줄인다', () => {
    // 글자 폭 1760px(88px) → 0.08 크기면 1.6 > 0.5 이므로 0.5×88/1760 = 0.025 로 줄인다 → 1800 × 0.025 / 88
    const s = FM.textStickerSize({ size: 0.08, maxW: 0.5 }, 1800, 1760);
    assert.ok(Math.abs(s - 1800 * 0.025 / 88) < 1e-9);
  });
});
