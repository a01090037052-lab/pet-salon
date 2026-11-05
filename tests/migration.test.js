// v182(priceSmall/Medium/Large) → v184 구간 가격 변환 (App.migratePriceBands) — 메모리 가짜 DB 사용
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, createFakeDB, plain } = require('./helpers/load-app');

const v182Services = () => [
  { id: 1, name: '전체미용', category: 'grooming', priceSmall: 30000, priceMedium: 40000, priceLarge: 55000 },
  { id: 2, name: '목욕', category: 'grooming', priceSmall: 20000, priceMedium: 25000, priceLarge: 35000 },
  { id: 3, name: '발톱', category: 'addon', priceSmall: 5000, priceMedium: 5000, priceLarge: 5000 },
];

async function migrated() {
  const db = createFakeDB({ stores: { services: v182Services() } });
  const env = loadApp({ db });
  const result = await env.App.migratePriceBands();
  return { ...env, db, result };
}

describe('구간 가격 변환 (migratePriceBands) — v182 데이터', () => {
  test('서비스 3개 변환, 구간표·완료 표시 저장', async () => {
    const { db, result } = await migrated();
    assert.deepEqual(plain(result), { migrated: 3, adopted: 0 });
    assert.equal(db._settings.priceBandsMigrated, 1);
    assert.equal(db._settings.priceBands.bands.length, 5);
  });

  test('미용 코스: 7kg 미만 소형가, 7kg 이상 중형가, 원래 값은 migratedFrom 에 보존', async () => {
    const { db } = await migrated();
    const s = db.peek('services', 1);
    assert.deepEqual(s.pricing.prices, { b1: 30000, b2: 30000, b3: 30000, b4: 40000, b5: 40000 });
    assert.deepEqual(s.pricing.migratedFrom, { small: 30000, medium: 40000, large: 55000 });
  });

  test('미용 코스 구버전 호환가: 대형(20kg) = 40,000 + 10kg × 5,000 = 90,000원', async () => {
    const { db } = await migrated();
    const s = db.peek('services', 1);
    assert.deepEqual([s.priceSmall, s.priceMedium, s.priceLarge], [30000, 40000, 90000]);
  });

  test('추가 요금 없는 목욕: 무거운 구간(10kg~) = 대형가 35,000원, 20kg 도 35,000원', async () => {
    const { db } = await migrated();
    const s = db.peek('services', 2);
    assert.equal(s.pricing.overKgMode, 'off');
    assert.equal(s.pricing.prices.b5, 35000);
    assert.equal(s.priceLarge, 35000);
  });

  test('세 값이 같은 추가 옵션은 단일가 5,000원', async () => {
    const { db } = await migrated();
    const s = db.peek('services', 3);
    assert.deepEqual([s.pricing.mode, s.pricing.flat], ['flat', 5000]);
  });

  test('두 번째 실행은 아무것도 다시 쓰지 않는다 (멱등)', async () => {
    const { App, db } = await migrated();
    const before = db.serviceWrites();
    const r2 = await App.migratePriceBands();
    assert.deepEqual(plain(r2), { migrated: 0, adopted: 0 });
    assert.equal(db.serviceWrites(), before);
  });

  test('변환 후 구버전 기기가 소형가를 고치면 다음 실행에서 차이만큼 반영 (+5,000)', async () => {
    const { App, db } = await migrated();
    db._stores.services.find(s => s.id === 1).priceSmall = 35000;
    const r = await App.migratePriceBands();
    assert.equal(r.adopted, 1);
    const s = db.peek('services', 1);
    assert.deepEqual(s.pricing.prices, { b1: 35000, b2: 35000, b3: 35000, b4: 40000, b5: 40000 });
    assert.ok(s.priceChangedAt, '가격 변경 시각이 남아야 한다');
  });

  test('pricing 은 있지만 overKgMode 가 없는 서비스(스파) → off 로 적고 알림', async () => {
    const svc = { id: 9, name: '스파', category: 'grooming', pricing: { mode: 'weight', prices: { b1: 10000, b5: 20000 } } };
    const db = createFakeDB({ stores: { services: [svc] }, settings: { priceBandsMigrated: 1 } });
    const { App, toasts } = loadApp({ db });
    await App.migratePriceBands();
    assert.equal(db.peek('services', 9).pricing.overKgMode, 'off');
    assert.ok(toasts.some(t => t.msg.includes('스파')));
  });

  test('서버 모드에서는 아무것도 하지 않는다', async () => {
    const db = createFakeDB({ mode: 'server', stores: { services: v182Services() } });
    const { App } = loadApp({ db });
    await App.migratePriceBands();
    assert.equal(db.writes.length, 0);
  });
});
