// 메뉴 가격 조회 (getMenuPrice) · 기록 폼 가격 자동 채움 (getRecentServicePrice)
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, createFakeDB } = require('./helpers/load-app');

const PRICES = { b1: 30000, b2: 35000, b3: 40000, b4: 50000, b5: 60000 };
const services = () => [
  { id: 1, name: '전체 미용', category: 'grooming', isActive: false, pricing: { mode: 'flat', flat: 99000, overKgMode: 'inherit' } },
  { id: 2, name: '전체 미용', category: 'grooming', priceChangedAt: '2026-10-01T03:00:00.000Z',
    pricing: { mode: 'weight', prices: { ...PRICES }, overKgMode: 'inherit' } },
  { id: 3, name: '발톱', category: 'addon', pricing: { mode: 'flat', flat: 5000, overKgMode: 'off' } },
];
const env = (records = [], pets = []) => loadApp({ db: createFakeDB({ stores: { services: services(), records, pets } }) });

describe('메뉴 가격 조회 (getMenuPrice)', () => {
  test('이름 앞뒤·연속 공백을 정리해 찾고, 같은 이름이면 사용 중인 메뉴를 고른다 (5.2kg → 40,000원)', async () => {
    const { App } = env();
    const m = await App.getMenuPrice('  전체   미용 ', 5.2);
    assert.equal(m.service.id, 2);
    assert.deepEqual([m.price, m.bandId, m.hasSizePrices], [40000, 'b3', true]);
  });
  test('메뉴에 없는 이름 → null', async () => {
    const { App } = env();
    assert.equal(await App.getMenuPrice('없는메뉴', 5), null);
  });
  test('구간 가격인데 몸무게를 모르면 needsWeight', async () => {
    const { App } = env();
    const m = await App.getMenuPrice('전체 미용', null);
    assert.equal(m.needsWeight, true);
  });
});

describe('기록 폼 가격 자동 채움 (getRecentServicePrice)', () => {
  const rec = (o) => ({ id: 1, petId: 7, service: '전체 미용', servicePrice: 45000, date: '2026-10-15', priceBandId: 'b3', menuPriceAtVisit: 40000, ...o });

  test('기록이 없으면 메뉴 현재 가격 (5.2kg → 40,000원)', async () => {
    const { App } = env();
    assert.equal(await App.getRecentServicePrice(7, '전체 미용', 5.2), 40000);
  });
  test('가격 변경 이후 같은 구간에서 협의가(45,000원)를 받았으면 그 값을 따른다', async () => {
    const { App } = env([rec()]);
    assert.equal(await App.getRecentServicePrice(7, '전체 미용', 5.2), 45000);
  });
  test('구간이 바뀌었으면(8kg → 7~10kg) 메뉴 가격 50,000원', async () => {
    const { App } = env([rec()]);
    assert.equal(await App.getRecentServicePrice(7, '전체 미용', 8), 50000);
  });
  test('가격 변경 이전 기록이면 메뉴 가격', async () => {
    const { App } = env([rec({ date: '2026-09-20' })]);
    assert.equal(await App.getRecentServicePrice(7, '전체 미용', 5.2), 40000);
  });
  test('그날 메뉴 가격 그대로 받은 기록은 협의가가 아니다 → 메뉴 가격', async () => {
    const { App } = env([rec({ servicePrice: 38000, menuPriceAtVisit: 38000 })]);
    assert.equal(await App.getRecentServicePrice(7, '전체 미용', 5.2), 40000);
  });
  test('구간 가격 메뉴인데 몸무게를 모르면 null (추측하지 않음)', async () => {
    const { App } = env([rec()]);
    assert.equal(await App.getRecentServicePrice(7, '전체 미용', null), null);
  });
  test('메뉴에 없는 자유 입력 서비스 → 이 반려견의 가장 최근 기록 가격', async () => {
    const { App } = env([
      rec({ id: 1, service: '특수컷', servicePrice: 70000, date: '2026-08-01' }),
      rec({ id: 2, service: '특수컷', servicePrice: 75000, date: '2026-09-01' }),
    ]);
    assert.equal(await App.getRecentServicePrice(7, '특수컷', 5), 75000);
  });
  test('자유 입력 + 이 반려견 기록 없음 → 같은 몸무게 구간이었던 다른 반려견 기록', async () => {
    const { App } = env([
      { id: 1, petId: 1, service: '특수컷', servicePrice: 70000, date: '2026-09-01', weightAtVisit: 4 },
      { id: 2, petId: 2, service: '특수컷', servicePrice: 90000, date: '2026-10-01', weightAtVisit: 12 },
    ], [{ id: 1, weight: 4 }, { id: 2, weight: 12 }]);
    assert.equal(await App.getRecentServicePrice(7, '특수컷', 4.5), 70000);
  });
});
