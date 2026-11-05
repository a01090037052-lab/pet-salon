// 정액권 장부 (js/db.js 의 Prepaid) — 잔액·나누기·기록 수정 시 쓸 수 있는 금액·영수증 '사용 후 잔액'·이번 달 실입금
// load-app 의 prepaid: true 로 db.js 의 Prepaid 블록만 올리고, DB 는 메모리 가짜 DB 를 쓴다.
// 기대값은 모두 손으로 계산한 값이다.
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, createFakeDB, plain } = require('./helpers/load-app');

// 고객 1: 충전 100,000(+보너스 10,000) → 기록 #11 에서 40,000 사용 → 환불 20,000 → 조정 −5,000 = 45,000
const LEDGER = () => [
  { id: 1, customerId: 1, type: 'charge', amount: 100000, bonus: 10000, credit: 110000, date: '2026-10-01', createdAt: '2026-10-01T10:00:00' },
  { id: 2, customerId: 1, type: 'use', amount: 40000, credit: -40000, recordId: 11, date: '2026-10-05', createdAt: '2026-10-05T10:00:00' },
  { id: 3, customerId: 1, type: 'refund', amount: 20000, credit: -20000, date: '2026-11-02', createdAt: '2026-11-02T10:00:00' },
  { id: 4, customerId: 1, type: 'adjust', amount: -5000, credit: -5000, memo: '착오', date: '2026-11-03', createdAt: '2026-11-03T10:00:00' },
  // 다른 고객 — 섞이면 안 된다
  { id: 5, customerId: 2, type: 'charge', amount: 50000, bonus: 0, credit: 50000, date: '2026-11-01', createdAt: '2026-11-01T10:00:00' },
];
const load = (stores = { prepaid: LEDGER() }) => loadApp({ prepaid: true, db: createFakeDB({ stores }) });

describe('정액권 잔액 (balanceOf · balanceMap)', () => {
  const { Prepaid } = load();
  const mine = LEDGER().filter(e => e.customerId === 1);
  test('충전 110,000 − 사용 40,000 − 환불 20,000 − 조정 5,000 = 45,000', () => assert.equal(Prepaid.balanceOf(mine), 45000));
  test('빈 장부·없음은 0', () => { assert.equal(Prepaid.balanceOf([]), 0); assert.equal(Prepaid.balanceOf(null), 0); });
  test('조정(+)은 잔액을 늘린다: 45,000 + 3,000 = 48,000', () => {
    assert.equal(Prepaid.balanceOf([...mine, { type: 'adjust', credit: 3000 }]), 48000);
  });
  test('환불로 잔액을 전부 빼면 0: 45,000 − 45,000', () => {
    assert.equal(Prepaid.balanceOf([...mine, { type: 'refund', amount: 40000, credit: -45000 }]), 0);
  });
  test('고객별 잔액표: { 1: 45,000, 2: 50,000 }', () => assert.deepEqual(plain(Prepaid.balanceMap(LEDGER())), { 1: 45000, 2: 50000 }));
});

describe('기록의 정액권 몫 / 나머지 (splitOf)', () => {
  const { Prepaid } = load();
  test('전액 정액권: 50,000 / 나머지 0, 나머지 수단 없음', () => {
    assert.deepEqual(plain(Prepaid.splitOf({ finalPrice: 50000, prepaidUsed: 50000, paymentMethod: 'prepaid' })), { used: 50000, rest: 0, restMethod: null });
  });
  test('일부: 정액권 20,000 + 카드 30,000', () => {
    assert.deepEqual(plain(Prepaid.splitOf({ finalPrice: 50000, prepaidUsed: 20000, paymentMethod: 'card' })), { used: 20000, rest: 30000, restMethod: 'card' });
  });
  test('정액권 안 쓴 기록: 사용 0, 나머지 = 전액', () => {
    assert.deepEqual(plain(Prepaid.splitOf({ finalPrice: 30000, paymentMethod: 'cash' })), { used: 0, rest: 30000, restMethod: 'cash' });
  });
  test('사용액이 금액보다 크게 저장돼 있어도 금액까지만 (10,000)', () => {
    assert.equal(Prepaid.splitOf({ finalPrice: 10000, prepaidUsed: 15000, paymentMethod: 'prepaid' }).used, 10000);
  });
});

describe('기록에 쓸 수 있는 금액 (availableIn · availableFor)', () => {
  test('새 기록: 잔액 그대로 45,000', () => {
    const { Prepaid } = load();
    assert.equal(Prepaid.availableIn(LEDGER().filter(e => e.customerId === 1), null), 45000);
  });
  test('기록 #11 수정: 잔액 45,000 + 이 기록이 이미 쓴 40,000 = 85,000', () => {
    const { Prepaid } = load();
    assert.equal(Prepaid.availableIn(LEDGER().filter(e => e.customerId === 1), 11), 85000);
  });
  test('다른 기록(#12) 수정: 이 기록이 쓴 게 없으니 45,000', () => {
    const { Prepaid } = load();
    assert.equal(Prepaid.availableIn(LEDGER().filter(e => e.customerId === 1), 12), 45000);
  });
  test('DB 경유(availableFor)도 같은 값: 고객 1 · 기록 11 → 85,000', async () => {
    const { Prepaid } = load();
    assert.equal(await Prepaid.availableFor(1, 11), 85000);
  });
});

describe('기록 저장 뒤 장부 맞추기 (syncRecordUse) — 수정으로 금액 증감', () => {
  test('금액 인상: 사용 40,000 → 60,000 으로 고치면 사용 줄이 −60,000, 잔액 25,000', async () => {
    const { Prepaid, DB } = load();
    await Prepaid.syncRecordUse({ id: 11, customerId: 1, date: '2026-10-05', prepaidUsed: 60000 }, 1);
    assert.equal(DB.peek('prepaid', 2).credit, -60000);
    assert.equal(await Prepaid.getBalance(1), 25000); // 110,000 − 60,000 − 20,000 − 5,000
  });
  test('금액 인하: 40,000 → 30,000 이면 잔액 55,000', async () => {
    const { Prepaid } = load();
    await Prepaid.syncRecordUse({ id: 11, customerId: 1, date: '2026-10-05', prepaidUsed: 30000 }, 1);
    assert.equal(await Prepaid.getBalance(1), 55000);
  });
  test('정액권을 안 쓰게 고치면(사용 0) 사용 줄이 지워지고 잔액 85,000', async () => {
    const { Prepaid, DB } = load();
    await Prepaid.syncRecordUse({ id: 11, customerId: 1, date: '2026-10-05', prepaidUsed: 0 }, 1);
    assert.equal(DB.peek('prepaid', 2), undefined);
    assert.equal(await Prepaid.getBalance(1), 85000);
  });
  test('새 기록 #12 에서 15,000 사용 → 새 사용 줄, 잔액 30,000', async () => {
    const { Prepaid } = load();
    await Prepaid.syncRecordUse({ id: 12, customerId: 1, date: '2026-11-04', prepaidUsed: 15000 }, 1);
    const e = await Prepaid.getUseEntry(12);
    assert.deepEqual([e.type, e.amount, e.credit, e.customerId], ['use', 15000, -15000, 1]);
    assert.equal(await Prepaid.getBalance(1), 30000);
  });
  test('같은 값으로 다시 저장하면 장부에 쓰지 않는다', async () => {
    const { Prepaid, DB } = load();
    await Prepaid.syncRecordUse({ id: 11, customerId: 1, date: '2026-10-05', prepaidUsed: 40000 }, 1);
    assert.equal(DB.writes.length, 0);
  });
});

describe("영수증 '사용 후 잔액' (balanceAfterIn · balanceAfter)", () => {
  test('사용 줄(#2)까지: 110,000 − 40,000 = 70,000 (뒤의 환불·조정은 빼지 않는다)', () => {
    const { Prepaid } = load();
    assert.equal(Prepaid.balanceAfterIn(LEDGER().filter(e => e.customerId === 1), 2), 70000);
  });
  test('입력 순서가 뒤섞여 있어도 날짜순으로 더한다', () => {
    const { Prepaid } = load();
    const shuffled = LEDGER().filter(e => e.customerId === 1).reverse();
    assert.equal(Prepaid.balanceAfterIn(shuffled, 3), 50000); // 110,000 − 40,000 − 20,000
  });
  test('같은 날 두 번 쓰면 입력 시각 순: 충전 30,000 → 10,000 사용(#2) → 5,000 사용(#3) → #2 뒤 20,000', () => {
    const { Prepaid } = load();
    const day = [
      { id: 1, customerId: 9, type: 'charge', credit: 30000, date: '2026-11-05', createdAt: '2026-11-05T09:00:00' },
      { id: 3, customerId: 9, type: 'use', credit: -5000, date: '2026-11-05', createdAt: '2026-11-05T15:00:00' },
      { id: 2, customerId: 9, type: 'use', credit: -10000, date: '2026-11-05', createdAt: '2026-11-05T11:00:00' },
    ];
    assert.equal(Prepaid.balanceAfterIn(day, 2), 20000);
    assert.equal(Prepaid.balanceAfterIn(day, 3), 15000);
  });
  test('DB 경유(balanceAfter): 사용 줄 #2 → 70,000', async () => {
    const { Prepaid } = load();
    assert.equal(await Prepaid.balanceAfter({ id: 2, customerId: 1 }), 70000);
  });
  test('줄이 없으면 null', async () => {
    const { Prepaid } = load();
    assert.equal(await Prepaid.balanceAfter(null), null);
  });
});

describe('이번 달 실입금 (monthCollected)', () => {
  const { Prepaid } = load();
  const records = [
    { date: '2026-11-03', finalPrice: 50000, paymentMethod: 'card' },                       // 50,000
    { date: '2026-11-04', finalPrice: 60000, prepaidUsed: 60000, paymentMethod: 'prepaid' }, // 정액권 → 0
    { date: '2026-11-04', finalPrice: 50000, prepaidUsed: 20000, paymentMethod: 'cash' },    // 나머지 30,000
    { date: '2026-11-05', finalPrice: 40000, paymentMethod: 'unpaid' },                      // 미수 → 0
    { date: '2026-10-20', paidAt: '2026-11-02', finalPrice: 35000, paymentMethod: 'transfer' }, // 지난달 미수를 이번 달 수금 → 35,000
    { date: '2026-11-01', paidAt: '2026-12-01', finalPrice: 99000, paymentMethod: 'card' },  // 다음 달 수금 → 0
    { date: '2026-10-30', finalPrice: 70000, paymentMethod: 'card' },                        // 지난달 → 0
  ];
  test('기록 115,000 + 이번 달 충전 50,000 − 환불 20,000 = 145,000', () => {
    // 기록: 50,000 + 30,000 + 35,000 = 115,000 / 11월 장부: 충전(고객 2) 50,000, 환불 20,000 (조정·사용은 돈이 오가지 않음)
    assert.deepEqual(plain(Prepaid.monthCollected(records, LEDGER(), '2026-11')), { collected: 145000, charge: 50000, refund: 20000 });
  });
  test('10월: 기록 70,000 (10-20 건은 11월 수금이라 제외) + 충전 100,000(보너스 제외) = 170,000', () => {
    assert.deepEqual(plain(Prepaid.monthCollected(records, LEDGER(), '2026-10')), { collected: 170000, charge: 100000, refund: 0 });
  });
  test('기록·장부가 없으면 0', () => {
    assert.deepEqual(plain(Prepaid.monthCollected([], [], '2026-11')), { collected: 0, charge: 0, refund: 0 });
  });
});

describe('이번 달 실입금 결제 수단별 (monthByMethod) — 합계가 monthCollected 와 맞는다', () => {
  const { Prepaid } = load();
  const records = [
    { date: '2026-11-03', finalPrice: 50000, paymentMethod: 'card' },                          // 카드 50,000
    { date: '2026-11-04', finalPrice: 60000, prepaidUsed: 60000, paymentMethod: 'prepaid' },    // 정액권 사용 60,000
    { date: '2026-11-04', finalPrice: 50000, prepaidUsed: 20000, paymentMethod: 'cash' },       // 정액권 20,000 + 현금 30,000
    { date: '2026-11-05', finalPrice: 40000, paymentMethod: 'unpaid' },                         // 미수 → 0
    { date: '2026-10-20', paidAt: '2026-11-02', finalPrice: 35000, paymentMethod: 'transfer' }, // 이번 달 수금 계좌 35,000
    { date: '2026-11-06', finalPrice: 10000 },                                                  // 수단 미선택 10,000
  ];
  const entries = [
    { customerId: 1, type: 'charge', amount: 100000, bonus: 10000, credit: 110000, method: 'card', date: '2026-11-01' },
    { customerId: 2, type: 'charge', amount: 20000, bonus: 0, credit: 20000, method: 'transfer', date: '2026-11-02' }, // 예약금
    { customerId: 1, type: 'refund', amount: 15000, credit: -20000, method: 'cash', date: '2026-11-03' },               // 돌려준 돈 15,000
    { customerId: 2, type: 'adjust', amount: -20000, credit: -20000, memo: '노쇼 예약금', date: '2026-11-04' },
    { customerId: 1, type: 'adjust', amount: 3000, credit: 3000, memo: '착오', date: '2026-11-04' },
    { customerId: 1, type: 'charge', amount: 70000, credit: 70000, method: 'cash', date: '2026-10-31' },                // 지난달 → 제외
  ];
  const r = plain(Prepaid.monthByMethod(records, entries, '2026-11'));
  test('기록 나머지: 카드 50,000 · 현금 30,000 · 계좌 35,000 · 미선택 10,000', () => {
    assert.deepEqual(r.records, { card: 50000, cash: 30000, transfer: 35000, none: 10000 });
  });
  test('충전 받은 돈(보너스 제외): 카드 100,000 · 계좌 20,000 / 환불: 현금 15,000', () => {
    assert.deepEqual(r.charge, { card: 100000, cash: 0, transfer: 20000, none: 0 });
    assert.deepEqual(r.refund, { card: 0, cash: 15000, transfer: 0, none: 0 });
  });
  test('합계 125,000 + 120,000 − 15,000 = 230,000 = monthCollected', () => {
    assert.equal(r.total, 230000);
    assert.equal(r.total, Prepaid.monthCollected(records, entries, '2026-11').collected);
  });
  test('참고값: 정액권 사용 80,000 · 조정으로 줄인 잔액 20,000 · 늘린 잔액 3,000', () => {
    assert.deepEqual([r.used, r.adjustOut, r.adjustIn], [80000, 20000, 3000]);
  });
  test('위 monthCollected 테스트 데이터로도 합계가 같다 (11월 145,000)', () => {
    const recs = [
      { date: '2026-11-03', finalPrice: 50000, paymentMethod: 'card' },
      { date: '2026-11-04', finalPrice: 50000, prepaidUsed: 20000, paymentMethod: 'cash' },
      { date: '2026-10-20', paidAt: '2026-11-02', finalPrice: 35000, paymentMethod: 'transfer' },
    ];
    assert.equal(Prepaid.monthByMethod(recs, LEDGER(), '2026-11').total, 145000);
  });
});
