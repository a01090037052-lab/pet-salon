// 새 사진 카드: 가게 스타일만 이어 쓰고, 틀·배경·프레임·배경 그림·사진 느낌·큰 제목은 처음부터
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./helpers/load-app');

const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js'] });
const R = App.pages.records;

describe('새 카드 시작값 (_freshCardSettings)', () => {
  const last = {
    layout: 'scene', template: 'frame:f1', bgPick: '#F7B3C2', slotColor: 'pink', lastUsedFrameId: 'f1', photoFilter: 'film',
    headline: '{반려견명} 첫 미용', subline: '축하해요', polaroidShape: 'square', plainRatio: '1:1', scene: { id: 'giftbox', color: '#A7D8F0' },
    fontKey: 'jua', logoPosition: 'bottom', logoSize: 'large', showPet: false, showDate: true, showShop: true, showService: true,
    showNextVisit: false, footerMessage: '또 만나요', customBgColor: '#000000',
  };
  const fresh = R._freshCardSettings(last);
  test('가게 스타일은 이어 쓴다', () => {
    for (const k of ['fontKey', 'logoPosition', 'logoSize', 'showPet', 'showDate', 'showShop', 'showService', 'showNextVisit', 'footerMessage'])
      assert.deepEqual(fresh[k], last[k], k);
  });
  test('카드마다 다른 것은 비운다', () => {
    for (const k of ['layout', 'template', 'bgPick', 'slotColor', 'lastUsedFrameId', 'photoFilter', 'headline', 'subline', 'polaroidShape', 'plainRatio', 'scene'])
      assert.equal(fresh[k], undefined, k);
  });
  test('지난 설정 원본은 바꾸지 않는다', () => { assert.equal(last.layout, 'scene'); });
  test('빈 설정·없는 설정도 괜찮다', () => {
    assert.deepEqual(plainObj(R._freshCardSettings({})), {});
    assert.deepEqual(plainObj(R._freshCardSettings(null)), {});
  });
});

describe('지켜야 할 줄 (코드 감시)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js/pages/records.js'), 'utf8');
  test('새 카드의 기본값으로 지난 꾸미기를 덮어쓰지 않는다', () => {
    assert.match(src, /if \(useLast && \(saved\.layout !== selectedLayout/);
  });
  test('배경 그림도 지난 꾸미기에 남긴다', () => {
    assert.match(src, /if \(layout === 'scene' && App\.bgLib\) settings\.scene = App\.bgLib\.cardScene\(\)/);
  });
});

function plainObj(o) { return JSON.parse(JSON.stringify(o)); }

describe('지난 카드가 내 프레임이었을 때', () => {
  test('프레임 그림·색(custom*)은 새 카드로 넘기지 않는다', () => {
    const fresh = R._freshCardSettings({ lastUsedFrameId: 'f1', customBgImage: 'data:x', customBgColor: '#FFFFFF', customTextColor: '#111111', customAccentColor: '#6366F1', fontKey: 'jua' });
    for (const k of ['customBgImage', 'customBgColor', 'customTextColor', 'customAccentColor']) assert.equal(fresh[k], undefined, k);
    assert.equal(fresh.fontKey, 'jua');
  });
  test('직접 꾸민 색은 이어 쓴다', () => {
    const fresh = R._freshCardSettings({ customBgColor: '#000000', customBgImage: 'data:y' });
    assert.equal(fresh.customBgColor, '#000000'); assert.equal(fresh.customBgImage, 'data:y');
  });
});
