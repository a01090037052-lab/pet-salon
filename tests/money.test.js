// 기록 금액 계산 (App.calcRecordTotals · App.calcPrepaidUse · App.getUnpaidAmount)
// records.js 의 화면 합계(calcTotal)와 저장(saveRecord)이 같은 함수를 쓴다 — 여기서 그 식을 고정한다.
// 기대값은 모두 손으로 계산한 값이다.
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./helpers/load-app');

const { App } = loadApp();
const totals = (o) => plain(App.calcRecordTotals(o));

describe('기록 합계 (calcRecordTotals)', () => {
  test('기본가 50,000 + 추가 10,000 = 합계 60,000 / 받을 금액 60,000', () => {
    const t = totals({ servicePrice: 50000, addonPrice: 10000 });
    assert.equal(t.servicePrice, 50000);
    assert.equal(t.totalPrice, 60000);
    assert.equal(t.finalPrice, 60000);
    assert.equal(t.negative, false);
    assert.equal(t.complimentaryTotal, 0);
  });
  test('할인 5,000: 60,000 − 5,000 = 55,000', () => {
    assert.equal(totals({ servicePrice: 50000, addonPrice: 10000, discount: 5000 }).finalPrice, 55000);
  });
  test('추가 요금 3,000: 60,000 + 3,000 = 63,000 (합계 totalPrice 는 60,000 그대로)', () => {
    const t = totals({ servicePrice: 50000, addonPrice: 10000, extraCharge: 3000 });
    assert.deepEqual([t.totalPrice, t.finalPrice], [60000, 63000]);
  });
  test('할인 5,000 + 추가 요금 2,000: 60,000 − 5,000 + 2,000 = 57,000', () => {
    assert.equal(totals({ servicePrice: 50000, addonPrice: 10000, discount: 5000, extraCharge: 2000 }).finalPrice, 57000);
  });
  test('할인이 소계보다 크면 negative (30,000 − 40,000 = −10,000) — 저장을 막는 조건', () => {
    const t = totals({ servicePrice: 30000, discount: 40000 });
    assert.equal(t.finalPrice, -10000);
    assert.equal(t.negative, true);
  });
  test('할인 = 소계면 0원, negative 아님', () => {
    const t = totals({ servicePrice: 30000, discount: 30000 });
    assert.deepEqual([t.finalPrice, t.negative], [0, false]);
  });
  test('할인이 소계보다 커도 추가 요금으로 0 이상이면 통과 (30,000 − 35,000 + 5,000 = 0)', () => {
    assert.equal(totals({ servicePrice: 30000, discount: 35000, extraCharge: 5000 }).negative, false);
  });
  test('기본가 서비스(무료): 받는 기본가 0, 합계는 추가만 (10,000), 서비스 제공 금액 50,000', () => {
    const t = totals({ servicePrice: 50000, addonPrice: 10000, mainFree: true });
    assert.deepEqual([t.servicePrice, t.totalPrice, t.finalPrice, t.complimentaryTotal], [0, 10000, 10000, 50000]);
  });
  test('추가 옵션 서비스(무료): 화면의 추가 금액(이미 무료 항목 제외)은 그대로, 서비스 제공 금액 = 5,000 + 3,000', () => {
    const t = totals({ servicePrice: 50000, addonPrice: 10000, freeAddons: [{ name: '발톱', price: 5000 }, { name: '귀청소', price: 3000 }] });
    assert.deepEqual([t.totalPrice, t.finalPrice, t.complimentaryTotal], [60000, 60000, 8000]);
  });
  test('기본가·추가 둘 다 무료 + 할인 없음: 0원, 서비스 제공 금액 50,000 + 5,000 = 55,000', () => {
    const t = totals({ servicePrice: 50000, addonPrice: 0, mainFree: true, freeAddons: [{ name: '발톱', price: 5000 }] });
    assert.deepEqual([t.finalPrice, t.complimentaryTotal, t.negative], [0, 55000, false]);
  });
  test('기본가 무료인데 할인이 있으면 음수 (0 + 0 − 1,000) → negative', () => {
    assert.equal(totals({ servicePrice: 50000, mainFree: true, discount: 1000 }).negative, true);
  });
  test('입력 칸 값(문자열·빈 칸)도 숫자로: "40000" + "" − "abc" + "2000" = 42,000', () => {
    const t = totals({ servicePrice: '40000', addonPrice: '', discount: 'abc', extraCharge: '2000' });
    assert.deepEqual([t.totalPrice, t.finalPrice], [40000, 42000]);
  });
  test('가격 없는 무료 추가 항목은 서비스 제공 금액 0', () => {
    assert.equal(totals({ servicePrice: 20000, freeAddons: [{ name: '리본' }] }).complimentaryTotal, 0);
  });
  test('정액권을 고르지 않으면 prepaid 결과가 없다', () => {
    assert.equal(totals({ servicePrice: 20000 }).prepaid, null);
  });
  test('정액권 잔액 100,000 · 합계 57,000 → 전액 정액권 (사용 57,000, 나머지 0, 남는 잔액 43,000)', () => {
    const t = totals({ servicePrice: 50000, addonPrice: 10000, discount: 5000, extraCharge: 2000, prepaidAvailable: 100000, restMethod: 'card' });
    assert.deepEqual(t.prepaid, { used: 57000, rest: 0, balanceLeft: 43000, paymentMethod: 'prepaid' });
  });
});

describe('정액권 나누기 (calcPrepaidUse)', () => {
  const use = (...a) => plain(App.calcPrepaidUse(...a));
  test('잔액 80,000 ≥ 합계 50,000 → 사용 50,000, 나머지 0, 결제 = 정액권', () => {
    assert.deepEqual(use(80000, 50000, 'card'), { used: 50000, rest: 0, balanceLeft: 30000, paymentMethod: 'prepaid' });
  });
  test('잔액 = 합계 50,000 → 잔액 0 남고 전액 정액권', () => {
    assert.deepEqual(use(50000, 50000, 'cash'), { used: 50000, rest: 0, balanceLeft: 0, paymentMethod: 'prepaid' });
  });
  test('잔액 20,000 < 합계 50,000 → 사용 20,000, 나머지 30,000 은 고른 수단(현금)', () => {
    assert.deepEqual(use(20000, 50000, 'cash'), { used: 20000, rest: 30000, balanceLeft: 0, paymentMethod: 'cash' });
  });
  test('나머지를 미수로: 결제 수단 unpaid, 나머지 30,000', () => {
    const r = use(20000, 50000, 'unpaid');
    assert.deepEqual([r.paymentMethod, r.rest], ['unpaid', 30000]);
  });
  test('잔액 0 → 사용 0, 전액 나머지 수단(카드)', () => {
    assert.deepEqual(use(0, 50000, 'card'), { used: 0, rest: 50000, balanceLeft: 0, paymentMethod: 'card' });
  });
  test('잔액이 마이너스(−5,000)면 쓰지 않는다 — 사용 0, 남는 잔액 −5,000 그대로', () => {
    assert.deepEqual(use(-5000, 50000, 'card'), { used: 0, rest: 50000, balanceLeft: -5000, paymentMethod: 'card' });
  });
  test('합계 0원 → 사용 0, 나머지 0, 결제는 나머지 수단 (정액권 줄을 만들지 않는다)', () => {
    assert.deepEqual(use(30000, 0, 'card'), { used: 0, rest: 0, balanceLeft: 30000, paymentMethod: 'card' });
  });
  test('화면 합계가 음수(할인 초과 입력 중)면 0 으로 보고 계산', () => {
    assert.deepEqual(use(30000, -10000, 'card'), { used: 0, rest: 0, balanceLeft: 30000, paymentMethod: 'card' });
  });
  test('기록 수정 — 금액 인상: 잔액 10,000 + 이 기록이 이미 쓴 40,000 = 50,000 → 새 합계 60,000 이면 사용 50,000 · 나머지 10,000', () => {
    const r = use(10000 + 40000, 60000, 'card');
    assert.deepEqual([r.used, r.rest, r.balanceLeft, r.paymentMethod], [50000, 10000, 0, 'card']);
  });
  test('기록 수정 — 금액 인하: 잔액 10,000 + 이미 쓴 40,000 = 50,000 → 새 합계 30,000 이면 사용 30,000 · 남는 잔액 20,000', () => {
    const r = use(10000 + 40000, 30000, 'card');
    assert.deepEqual([r.used, r.rest, r.balanceLeft, r.paymentMethod], [30000, 0, 20000, 'prepaid']);
  });
});

describe('미수금으로 남은 금액 (getUnpaidAmount)', () => {
  test('전액 미수: finalPrice 50,000 → 50,000', () => {
    assert.equal(App.getUnpaidAmount({ paymentMethod: 'unpaid', finalPrice: 50000 }), 50000);
  });
  test('정액권 20,000 + 나머지 미수: 50,000 − 20,000 = 30,000', () => {
    assert.equal(App.getUnpaidAmount({ paymentMethod: 'unpaid', finalPrice: 50000, prepaidUsed: 20000 }), 30000);
  });
  test('옛 기록(finalPrice 없음): totalPrice 40,000 − 정액권 0 = 40,000', () => {
    assert.equal(App.getUnpaidAmount({ paymentMethod: 'unpaid', totalPrice: 40000 }), 40000);
  });
  test('정액권 사용액이 금액보다 커도 음수가 되지 않는다 (0)', () => {
    assert.equal(App.getUnpaidAmount({ paymentMethod: 'unpaid', finalPrice: 10000, prepaidUsed: 15000 }), 0);
  });
});
