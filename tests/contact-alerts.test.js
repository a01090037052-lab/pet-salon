// 홈 '연락할 손님': 오늘 연락할 순서, 두 번 연락해도 안 오면 '오래 안 옴'으로 넘기기
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, createFakeDB, plain } = require('./helpers/load-app');

const NOW = '2026-11-12T10:00:00+09:00';
const load = (db) => loadApp({ now: NOW, db, files: ['js/app.js', 'js/pages/dashboard.js'] });
const D = load().App.pages.dashboard;

const alert = (id, o) => ({ customer: { id }, pet: { id }, days: 40, daysUntilChurn: 20, visitStatus: 'remind', contactCount: 0, ...o });

describe('연락 횟수 (마지막 방문 뒤)', () => {
  test('방문일 다음 날부터 센다 — 새로 방문하면 0', () => {
    const c = { contactLog: ['2026-10-01T09:00:00+09:00', '2026-10-20T09:00:00+09:00', '2026-11-01T09:00:00+09:00'] };
    assert.equal(D._contactsSinceVisit(c, '2026-09-15'), 3);
    assert.equal(D._contactsSinceVisit(c, '2026-10-01'), 2);
    assert.equal(D._contactsSinceVisit(c, '2026-11-05'), 0);
  });
  test('예전 데이터(lastContactedAt 만)는 한 번으로 본다', () => {
    assert.equal(D._contactsSinceVisit({ lastContactedAt: '2026-10-20T09:00:00+09:00' }, '2026-09-01'), 1);
    assert.equal(D._contactsSinceVisit({}, '2026-09-01'), 0);
    assert.equal(D._contactsSinceVisit(null, '2026-09-01'), 0);
  });
});

describe('올 때 됨 / 오래 안 옴 나누기', () => {
  test('주기 2배 초과·두 번 연락한 손님은 오래 안 옴으로 (지우지 않음)', () => {
    const r = D._splitContactAlerts([
      alert(1), alert(2, { visitStatus: 'churned' }), alert(3, { contactCount: 2 }), alert(4, { contactCount: 1 })
    ]);
    assert.deepEqual(plain(r.due.map(a => a.customer.id)), [1, 4]);
    assert.deepEqual(plain(r.gone.map(a => a.customer.id)), [2, 3]);
  });
  test('오래 안 옴이 될 날이 가까운 순 → 단골 순 → 오래 지난 순', () => {
    const r = D._splitContactAlerts([
      alert(1, { daysUntilChurn: 10, days: 50 }),
      alert(2, { daysUntilChurn: 3 }),
      alert(3, { daysUntilChurn: 10, days: 60 }),
      alert(4, { daysUntilChurn: 10, days: 40 })
    ], { 4: 12, 1: 3 });
    assert.deepEqual(plain(r.due.map(a => a.customer.id)), [2, 4, 1, 3]);
  });
});

describe('연락 기록·취소', () => {
  test('연락할 때마다 쌓이고 취소하면 되돌린다', async () => {
    const db = createFakeDB({ stores: { customers: [{ id: 7, name: '김', lastContactedAt: '2026-10-01T09:00:00+09:00' }] } });
    const { App } = load(db);
    const P = App.pages.dashboard;
    await P._markContacted(7);
    let c = db.peek('customers', 7);
    assert.equal(c.contactLog.length, 2);
    assert.equal(P._contactsSinceVisit(c, '2026-09-01'), 2);
    await P._undoContact();
    c = db.peek('customers', 7);
    assert.equal(c.contactLog, undefined);
    assert.equal(c.lastContactedAt, '2026-10-01T09:00:00+09:00');
  });
  test('기록은 최근 5번만 남긴다', async () => {
    const db = createFakeDB({ stores: { customers: [{ id: 1, contactLog: ['a1', 'a2', 'a3', 'a4', 'a5'] }] } });
    const { App } = load(db);
    await App.pages.dashboard._markContacted(1);
    const log = db.peek('customers', 1).contactLog;
    assert.equal(log.length, 5);
    assert.equal(log[0], 'a2');
  });
  test('_computeRevisitAlerts 가 연락 횟수를 붙인다', () => {
    const pets = [{ id: 1, customerId: 1, lastVisitDate: '2026-09-01', groomingCycle: 30 }];
    const cm = { 1: { id: 1, contactLog: ['2026-10-05T09:00:00+09:00', '2026-10-20T09:00:00+09:00'] } };
    const a = D._computeRevisitAlerts(pets, cm, 30, 14, new Set());
    assert.equal(a.length, 1);
    assert.equal(a[0].contactCount, 2);
    assert.equal(D._splitContactAlerts(a).gone.length, 1);
  });
});
