// 기록 금액 (getRecordAmount · revenuePacing) 과 영수증 금액 줄 (App.pages.records.showReceipt)
// 영수증은 App.showModal 을 가로채 HTML 을 받아 줄(이름, 금액)만 뽑아 비교한다.
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, createFakeDB } = require('./helpers/load-app');

describe('기록 받은 금액 (getRecordAmount)', () => {
  const { App } = loadApp();
  test('finalPrice 가 있으면 그 값', () => assert.equal(App.getRecordAmount({ finalPrice: 52000, totalPrice: 55000 }), 52000));
  test('finalPrice 0(전액 할인·서비스)은 0 — totalPrice 로 되돌아가지 않는다', () => {
    assert.equal(App.getRecordAmount({ finalPrice: 0, totalPrice: 30000 }), 0);
  });
  test('finalPrice 가 없으면 totalPrice (옛 기록)', () => assert.equal(App.getRecordAmount({ totalPrice: '12000' }), 12000));
  test('둘 다 없으면 0', () => assert.equal(App.getRecordAmount({}), 0));
});

describe('전월 같은 날짜까지 비교 (revenuePacing)', () => {
  const { App } = loadApp();
  test('3월 31일 기준: 2월(28일까지) 40,000 vs 3월 50,000 → +25%', () => {
    const r = App.revenuePacing([
      { date: '2026-03-05', finalPrice: 50000 },
      { date: '2026-02-28', totalPrice: 40000 },
      { date: '2026-02-27', finalPrice: 0, totalPrice: 30000 },
      { date: '2026-01-31', finalPrice: 99000 },
    ], '2026-03-31');
    assert.equal(r.thisMonth, 50000);
    assert.equal(r.lastToDate, 40000);
    assert.equal(r.compareDay, 28);
    assert.equal(r.pct, 25);
  });
  test('1월 15일 기준: 전월은 작년 12월, 16일 이후 매출은 비교에서 빠진다', () => {
    const r = App.revenuePacing([
      { date: '2025-12-10', finalPrice: 30000 },
      { date: '2025-12-20', finalPrice: 70000 },
      { date: '2026-01-03', finalPrice: 15000 },
    ], '2026-01-15');
    assert.deepEqual([r.thisMonth, r.lastToDate, r.lastFull], [15000, 30000, 100000]);
    assert.equal(r.pct, -50);
  });
});

// ---------- 영수증 ----------
const SERVICES = [
  { id: 1, name: '전체미용', category: 'grooming', pricing: { mode: 'flat', flat: 50000, overKgMode: 'inherit' } },
  { id: 2, name: '발톱', category: 'addon', pricing: { mode: 'flat', flat: 5000, overKgMode: 'off' } },
  { id: 3, name: '귀청소', category: 'addon', pricing: { mode: 'flat', flat: 5000, overKgMode: 'off' } },
];
async function receipt(record) {
  const db = createFakeDB({ stores: {
    records: [{ id: 100, customerId: 1, petId: 1, date: '2026-11-01', service: '전체미용', ...record }],
    customers: [{ id: 1, name: '김보호' }],
    pets: [{ id: 1, name: '콩이', weight: 4 }],
    services: SERVICES,
  } });
  const { App, modals } = loadApp({ db, files: ['js/app.js', 'js/pages/records.js'] });
  await App.pages.records.showReceipt(100);
  const html = modals[0].content;
  const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const rows = [...html.matchAll(/<div class="receipt-row[^"]*"[^>]*><span>([\s\S]*?)<\/span><span>([\s\S]*?)<\/span><\/div>/g)]
    .map(m => [strip(m[1]), strip(m[2])]);
  const get = (label) => (rows.find(r => r[0] === label) || [])[1];
  return { rows, get };
}

describe('영수증 금액 (showReceipt)', () => {
  test('소계 = 기본가 + 추가, 합계 = 소계 − 할인 + 기타 추가 (55,000 − 3,000 + 2,000 = 54,000원)', async () => {
    const r = await receipt({ servicePrice: 50000, addons: ['발톱'], addonPrice: 5000, totalPrice: 55000, discount: 3000, extraCharge: 2000 });
    assert.equal(r.get('소계'), '55,000원');
    assert.equal(r.get('할인'), '-3,000원');
    assert.equal(r.get('기타 추가'), '+2,000원');
    assert.equal(r.get('합계'), '54,000원');
    assert.equal(r.get('+ 발톱'), '5,000원');
  });
  test('저장된 finalPrice 가 있으면 합계는 그 값', async () => {
    const r = await receipt({ servicePrice: 50000, addonPrice: 0, totalPrice: 50000, finalPrice: 47000 });
    assert.equal(r.get('합계'), '47,000원');
  });
  test('기본가를 서비스(무료)로 제공: 원래 가격 줄 긋고 "서비스", 합계 0원', async () => {
    const r = await receipt({ servicePrice: 0, totalPrice: 0, finalPrice: 0, complimentary: [{ name: '전체미용', price: 50000, main: true }] });
    assert.equal(r.get('전체미용'), '50,000원 서비스');
    assert.equal(r.get('합계'), '0원');
  });
  test('무료로 준 추가 옵션은 유료 추가 목록에서 빠지고 "서비스" 줄로', async () => {
    const r = await receipt({ servicePrice: 50000, addons: ['발톱', '귀청소'], addonPrice: 5000, totalPrice: 55000,
      complimentary: [{ name: '귀청소', price: 5000 }] });
    assert.equal(r.get('+ 발톱'), '5,000원');
    assert.equal(r.get('+ 귀청소'), '5,000원 서비스');
    assert.equal(r.get('합계'), '55,000원');
  });
  test('메뉴 가격 그대로 받은 초과 kg 요금은 따로 한 줄 (65,000 = 60,000 + 5,000)', async () => {
    const r = await receipt({ servicePrice: 65000, menuPriceAtVisit: 65000, addonPrice: 0, totalPrice: 65000,
      weightAtVisit: 10.3, priceBandLabel: '10kg~', priceOver: { kg: 1, perKg: 5000, extra: 5000 } });
    assert.equal(r.get('전체미용 · 10.3kg (10kg~)'), '60,000원');
    assert.equal(r.get('+ 초과 1kg × 5,000원'), '5,000원');
    assert.equal(r.get('소계'), '65,000원');
  });
  test('직접 고친 금액이면 초과 요금을 나누지 않는다', async () => {
    const r = await receipt({ servicePrice: 70000, menuPriceAtVisit: 65000, addonPrice: 0, totalPrice: 70000,
      priceOver: { kg: 1, perKg: 5000, extra: 5000 } });
    assert.equal(r.get('전체미용'), '70,000원');
    assert.equal(r.get('+ 초과 1kg × 5,000원'), undefined);
  });
  test('추가 2개: 메뉴가 5,000 + 5,000 이고 받은 금액 12,000 이면 차액 2,000원은 "기타 추가" 줄', async () => {
    const r = await receipt({ servicePrice: 50000, addons: ['발톱', '귀청소'], addonPrice: 12000, totalPrice: 62000 });
    assert.equal(r.get('+ 발톱'), '5,000원');
    assert.equal(r.get('+ 귀청소'), '5,000원');
    assert.equal(r.get('+ 기타 추가'), '2,000원');
    assert.equal(r.get('소계'), '62,000원');
  });
  test('기본가가 비어 있는 옛 기록: 기본가 = totalPrice − addonPrice', async () => {
    const r = await receipt({ servicePrice: undefined, addons: ['발톱'], addonPrice: 5000, totalPrice: 45000 });
    assert.equal(r.get('전체미용'), '40,000원');
    assert.equal(r.get('소계'), '45,000원');
  });
});
