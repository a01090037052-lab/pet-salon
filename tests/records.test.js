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

describe('다음 미용 추천일 (calcNextVisitDate)', () => {
  const { App } = loadApp();
  test('반려견 권장 주기가 있으면 그 주기', () => assert.equal(App.calcNextVisitDate('2026-03-01', 28, 30), '2026-03-29'));
  test('주기가 없으면 재방문 기준(fallback) 일수', () => assert.equal(App.calcNextVisitDate('2026-01-31', null, 30), '2026-03-02'));
  test('월말·연말을 넘어도 로컬 날짜로', () => assert.equal(App.calcNextVisitDate('2026-12-20', 0, 14), '2027-01-03'));
  test('주기·기준 모두 없거나 날짜가 없으면 빈 값', () => {
    assert.equal(App.calcNextVisitDate('2026-03-01', 0, 0), '');
    assert.equal(App.calcNextVisitDate('', 28, 30), '');
  });
});

describe('가격 미입력 메뉴 (getMenuPrice)', () => {
  const svcs = [
    { id: 1, name: '위생미용', category: 'grooming', pricing: { mode: 'flat', flat: 0, overKgMode: 'inherit' } },
    { id: 2, name: '서비스 양치', category: 'addon', pricing: { mode: 'flat', flat: 0, free: true, overKgMode: 'off' } },
  ];
  const env = () => loadApp({ db: createFakeDB({ stores: { services: svcs.map(s => ({ ...s })), records: [], pets: [] } }) });
  test('가격을 안 적은 메뉴는 price null (0원 아님) — 기록 폼 기본가는 빈칸', async () => {
    const { App } = env();
    const m = await App.getMenuPrice('위생미용', 5);
    assert.equal(m.price, null);
    assert.equal(await App.getRecentServicePrice(null, '위생미용', 5), null);
  });
  test('무료로 정한 메뉴는 0원 + free', async () => {
    const { App } = env();
    const m = await App.getMenuPrice('서비스 양치', 5);
    assert.equal(m.price, 0);
    assert.equal(m.free, true);
  });
});

// ---------- 예약 → 기록: 미용 코스 2개는 주 서비스로 합친다 (추가 옵션으로 세지 않게) ----------
describe('예약 서비스 나누기 (_splitAppointmentServices · _splitCourseName)', () => {
  const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js'] });
  const R = App.pages.records;
  const full = { id: 1, name: '전체미용', category: 'grooming' };
  const hyg = { id: 4, name: '위생미용', category: 'grooming' };
  const nail = { id: 2, name: '발톱', category: 'addon' };
  const bath = { id: 5, name: '목욕', category: 'care' };
  const plain = (x) => JSON.parse(JSON.stringify(x)); // 앱 쪽(vm) 배열·객체를 비교용으로
  test('미용 코스 2개 + 추가 옵션 → 코스 2개는 주 서비스, 추가 옵션만 추가 항목', () => {
    const r = R._splitAppointmentServices([full, nail, hyg]);
    assert.deepEqual(plain(r.courses.map(s => s.name)), ['전체미용', '위생미용']);
    assert.deepEqual(plain(r.extras.map(s => s.name)), ['발톱']);
  });
  test('미용 코스가 없으면 첫 번째가 주 서비스', () => {
    const r = R._splitAppointmentServices([bath, nail]);
    assert.deepEqual(plain(r.courses.map(s => s.name)), ['목욕']);
    assert.deepEqual(plain(r.extras.map(s => s.name)), ['발톱']);
  });
  test('빈 목록', () => assert.deepEqual(plain(R._splitAppointmentServices([])), { courses: [], extras: [] }));
  test('합친 이름은 코스별로 다시 나뉜다', () => {
    assert.deepEqual(plain(R._splitCourseName('전체미용' + R._COURSE_SEP + '위생미용')), ['전체미용', '위생미용']);
    assert.deepEqual(plain(R._splitCourseName(' 전체미용 ')), ['전체미용']);
    assert.deepEqual(plain(R._splitCourseName('')), []);
  });
});

describe('사진 카드 기본 틀 (_defaultCardLayout)', () => {
  const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js'] });
  const R = App.pages.records;
  test('1장 폴라로이드 · 2장 2컷 · 3~4장 네컷', () => {
    assert.deepEqual([1, 2, 3, 4].map(n => R._defaultCardLayout(n)), ['single', 'strip2', 'photobooth', 'photobooth']);
    for (const k of ['single', 'strip2', 'photobooth']) assert.ok(R._CARD_LAYOUTS[k], k);
  });
});
