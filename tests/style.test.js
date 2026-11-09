// 1.08 스타일 추가: 스타일 칩으로 고른 스타일은 style(괄호)과 addons 양쪽에 들어간다 — 표시가 두 번 나오면 안 된다
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp();

describe('스타일 표시', () => {
  test('괄호에 보인 스타일은 추가 항목에서 다시 쓰지 않는다', () => {
    assert.equal(App.getRecordServiceDisplay({ service: '스포팅', style: '테디컷', addons: ['테디컷', '약욕'] }), '스포팅 (테디컷) + 약욕');
    assert.equal(App.getRecordServiceDisplay({ service: '스포팅', style: '테디컷 + 귀 둥글게', addons: ['테디컷', '귀 둥글게'] }), '스포팅 (테디컷 + 귀 둥글게)');
  });
  test('직접 적은 스타일 메모·옛 기록은 그대로', () => {
    assert.equal(App.getRecordServiceDisplay({ service: '전체미용', style: '하이바', addons: ['약욕'] }), '전체미용 (하이바) + 약욕');
    assert.equal(App.getRecordServiceDisplay({ service: '목욕', addons: [] }), '목욕');
  });
  test('추가로 붙는 분류', () => {
    assert.equal(App.isExtraCategory('style'), true);
    assert.equal(App.isExtraCategory('addon'), true);
    assert.equal(App.isExtraCategory('care'), true);
    assert.equal(App.isExtraCategory('grooming'), false);
  });
});

// vm 안에서 만든 객체라 deepEqual 이 프로토타입까지 비교한다 — 값만 비교
const eq = (r, price, why) => { assert.equal(r.price, price); assert.equal(r.why, why); };

describe('추가 항목 값 정하기 (resolveExtraPrice) — 포함 → 이 아이 가격 → 코스별 다른 값 → 메뉴 값', () => {
  const teddy = { name: '테디컷', category: 'style', byCourse: { '스포팅': 15000 } };
  const sporting = { name: '스포팅', category: 'grooming' };
  const scissors = { name: '전체 가위컷', category: 'grooming', styleIncluded: true };
  test('코스가 스타일 값 포함이면 0원 (이 아이 가격보다 먼저)', () => {
    const pet = { customPrices: { '테디컷': 20000 } };
    eq(App.resolveExtraPrice(teddy, 10000, { courses: [scissors], pet }), 0, 'included');
  });
  test('이 아이 가격이 있으면 코스별 값보다 먼저, 0원도 값', () => {
    eq(App.resolveExtraPrice(teddy, 10000, { courses: [sporting], pet: { customPrices: { '테디컷': 20000 } } }), 20000, 'pet');
    eq(App.resolveExtraPrice(teddy, 10000, { courses: [sporting], pet: { customPrices: { '테디컷': 0 } } }), 0, 'pet');
    assert.equal(App.resolveExtraPrice(teddy, 10000, { courses: [sporting], pet: { customPrices: { '테디컷': '' } } }).why, 'course');
  });
  test('코스별 다른 값 — 고른 코스에 있으면 그 값, 없으면 메뉴 값', () => {
    eq(App.resolveExtraPrice(teddy, 10000, { courses: [sporting] }), 15000, 'course');
    eq(App.resolveExtraPrice(teddy, 10000, { courses: [{ name: '전체미용', category: 'grooming' }] }), 10000, 'menu');
    eq(App.resolveExtraPrice(teddy, 10000, {}), 10000, 'menu');
  });
  test('합친 코스 — 하나라도 포함이면 0원, 아니면 먼저 맞는 코스별 값', () => {
    assert.equal(App.resolveExtraPrice(teddy, 10000, { courses: [sporting, scissors] }).why, 'included');
    assert.equal(App.resolveExtraPrice(teddy, 10000, { courses: [{ name: '목욕' }, sporting] }).price, 15000);
  });
  test('스타일이 아닌 추가 옵션은 포함·코스별 값을 보지 않는다', () => {
    const bath = { name: '약욕', category: 'addon', byCourse: { '스포팅': 1 } };
    eq(App.resolveExtraPrice(bath, 20000, { courses: [scissors] }), 20000, 'menu');
    eq(App.resolveExtraPrice(bath, 20000, { courses: [scissors], pet: { customPrices: { '약욕': 15000 } } }), 15000, 'pet');
  });
  test('getPetPrice: 이름 정규화, 없으면 null, 음수·글자는 null', () => {
    const pet = { customPrices: { '전체미용': 55000, '약욕': -1, '염색': 'abc' } };
    assert.equal(App.getPetPrice(pet, ' 전체미용 '), 55000);
    assert.equal(App.getPetPrice(pet, '목욕'), null);
    assert.equal(App.getPetPrice(pet, '약욕'), null);
    assert.equal(App.getPetPrice(pet, '염색'), null);
    assert.equal(App.getPetPrice(null, '전체미용'), null);
  });
});
