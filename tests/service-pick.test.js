// 서비스 빨리 고르기: 많이 쓴 순서, 작은 칩 + 8개 더보기, '지난번처럼'
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, createFakeDB, plain } = require('./helpers/load-app');

const { App } = loadApp();

const SVCS = [
  { id: 1, name: '전체미용', category: 'grooming', sortOrder: 1, lengthOptions: [{ name: '3mm', price: 0 }, { name: '7F', price: 10000 }] },
  { id: 2, name: '위생미용', category: 'grooming', sortOrder: 2 },
  { id: 3, name: '양송이', category: 'style', sortOrder: 1 },
  { id: 4, name: '테디', category: 'style', sortOrder: 2 },
  { id: 5, name: '약욕', category: 'addon', sortOrder: 1 },
  { id: 6, name: '옛 스타일', category: 'style', sortOrder: 3, isActive: false },
];

describe('serviceUseCounts — 최근 많이 쓴 서비스 세기', () => {
  test('예약 serviceIds + 기록 주 서비스·추가 항목(이름 맞추기)', () => {
    const appts = [
      { date: '2026-11-01', status: 'pending', serviceIds: [1, 3] },
      { date: '2026-11-02', status: 'confirmed', serviceIds: ['1', 4] },
    ];
    const recs = [
      { date: '2026-11-03', service: ' 전체미용 ', addons: ['양송이', '7F', '없는 항목'] },
      { date: '2026-11-04', service: '전체미용 + 위생미용', addons: ['약욕'] },
    ];
    // 전체미용: 예약 2 + 기록 2 = 4 / 양송이 2 / 테디 1 / 위생미용 1 / 약욕 1
    assert.deepEqual(plain(App.serviceUseCounts(appts, recs, SVCS, '2026-08-01')), { 1: 4, 3: 2, 4: 1, 2: 1, 5: 1 });
  });
  test('기간 전·취소·노쇼·완료 예약은 안 센다, 한 예약에 같은 id 두 번은 한 번', () => {
    const appts = [
      { date: '2026-07-01', status: 'pending', serviceIds: [1] },
      { date: '2026-11-01', status: 'cancelled', serviceIds: [1] },
      { date: '2026-11-01', status: 'noshow', serviceIds: [1] },
      { date: '2026-11-01', status: 'completed', serviceIds: [1] },
      { date: '2026-11-01', status: 'pending', serviceIds: [3, 3] },
    ];
    const recs = [{ date: '2026-07-31', service: '전체미용' }];
    assert.deepEqual(plain(App.serviceUseCounts(appts, recs, SVCS, '2026-08-01')), { 3: 1 });
  });
});

describe('sortServicesByUse — 많이 쓴 순, 같으면 sortOrder', () => {
  test('횟수 → sortOrder → 이름', () => {
    const list = [{ id: 1, name: '나', sortOrder: 1 }, { id: 2, name: '가', sortOrder: 2 }, { id: 3, name: '다', sortOrder: 2 }, { id: 4, name: '라' }];
    assert.deepEqual(plain(App.sortServicesByUse(list, { 4: 3, 3: 1 }).map(s => s.id)), [4, 3, 1, 2]);
    assert.deepEqual(plain(App.sortServicesByUse(list, {}).map(s => s.id)), [1, 2, 3, 4]);
    assert.deepEqual(list.map(s => s.id), [1, 2, 3, 4]); // 원래 배열은 그대로
  });
});

describe('lastServicePick — 지난번처럼', () => {
  const opt = { today: '2026-11-11' };
  test('기록이 더 최근이면 기록에서: 코스 + 길이 태그 + 스타일 (메뉴 없는 항목은 버림)', () => {
    const appts = [{ id: 7, date: '2026-10-01', status: 'completed', serviceIds: [2] }];
    const recs = [{ date: '2026-10-20', service: '전체미용', addons: ['양송이', '7F', '엉킴'] }];
    const r = App.lastServicePick(appts, recs, SVCS, opt);
    assert.deepEqual(plain(r), { serviceIds: [1, 3], length: { serviceId: 1, name: '7F', price: 10000 }, label: '전체미용 7F · 양송이' });
  });
  test('예약이 더 최근이면 예약에서: 길이는 지금 메뉴 값, 지운·안 쓰는 서비스는 빼고, 코스를 앞에', () => {
    const appts = [{ id: 8, date: '2026-11-05', status: 'pending', serviceIds: [4, 1, 6, 99], length: { serviceId: 1, name: '7F', price: 8000 } }];
    const recs = [{ date: '2026-10-20', service: '위생미용' }];
    const r = App.lastServicePick(appts, recs, SVCS, opt);
    assert.deepEqual(plain(r), { serviceIds: [1, 4], length: { serviceId: 1, name: '7F', price: 10000 }, label: '전체미용 7F · 테디' });
  });
  test('같은 날이면 기록, 지금 고치는 예약·취소·미래 예약은 안 본다', () => {
    const recs = [{ date: '2026-11-05', service: '위생미용' }];
    const appts = [
      { id: 8, date: '2026-11-05', status: 'pending', serviceIds: [1] },
      { id: 9, date: '2026-11-09', status: 'pending', serviceIds: [4] },
      { id: 10, date: '2026-11-10', status: 'cancelled', serviceIds: [3] },
      { id: 11, date: '2026-12-01', status: 'pending', serviceIds: [5] },
    ];
    assert.equal(App.lastServicePick(appts, recs, SVCS, { ...opt, excludeId: 9 }).label, '위생미용');
    assert.equal(App.lastServicePick(appts, recs, SVCS, opt).label, '테디');
  });
  test('이력이 없거나 고를 게 없으면 null', () => {
    assert.equal(App.lastServicePick([], [], SVCS, opt), null);
    assert.equal(App.lastServicePick([], [{ date: '2026-11-01', service: '없는 코스', addons: ['7F'] }], SVCS, opt), null);
    assert.equal(App.lastServicePick([{ id: 1, date: '2026-11-01', serviceIds: [6] }], [], SVCS, opt), null);
  });
});

describe('getServiceCheckboxes — 많이 쓴 순, 스타일·옵션·케어는 작은 칩 8개 + 더보기', () => {
  const services = [{ id: 1, name: '전체미용', category: 'grooming', sortOrder: 1, pricing: { mode: 'flat', flat: 50000 } }];
  for (let i = 0; i < 10; i++) services.push({ id: 10 + i, name: '스타일' + i, category: 'style', sortOrder: i + 1, pricing: { mode: 'flat', flat: 10000 } });
  for (let i = 0; i < 9; i++) services.push({ id: 30 + i, name: '코스' + i, category: 'grooming', sortOrder: i + 2, pricing: { mode: 'flat', flat: 40000 } });
  // 최근: 스타일9 두 번, 코스8 한 번 (오늘 기준 90일 안)
  const appointments = [{ id: 1, date: '2026-11-01', status: 'pending', serviceIds: [19, 38] }];
  const records = [{ id: 1, date: '2026-10-30', service: '전체미용', addons: ['스타일9'] }, { id: 2, date: '2026-01-01', service: '코스0' }];
  const { App: A } = loadApp({ now: '2026-11-11T10:00:00', db: createFakeDB({ stores: { services, appointments, records } }) });
  const hiddenCount = (html) => (html.match(/data-more-hidden="1"/g) || []).length;
  const order = (html) => [...html.matchAll(/value="(\d+)"/g)].map(m => Number(m[1]));
  test('스타일 10개 → 2개 숨김 + 더보기 2, 코스는 다 보임, 길이 자리 1개', async () => {
    const html = await A.getServiceCheckboxes([], null);
    assert.equal(hiddenCount(html), 2);
    assert.match(html, /\+ 더보기 2/);
    assert.equal((html.match(/svc-length-slot/g) || []).length, 1);
    assert.equal((html.match(/name="serviceIds"/g) || []).length, 20); // 숨긴 칩도 화면 안에 있다
    assert.equal((html.match(/service-chip-compact/g) || []).length, 10); // 스타일만 작은 칩
  });
  test('많이 쓴 것이 앞 (같으면 sortOrder): 전체미용·코스8 각 1회 → 코스0 / 스타일9(2회) 맨 앞, 90일 전 기록은 안 셈', async () => {
    const ids = order(await A.getServiceCheckboxes([], null));
    assert.deepEqual(ids.slice(0, 3), [1, 38, 30]); // 전체미용 1회·sortOrder 1, 코스8 1회·sortOrder 10, 코스0 0회
    assert.equal(ids[10], 19);
  });
  test('이미 고른 스타일은 뒤쪽이어도 보인다', async () => {
    const html = await A.getServiceCheckboxes([18], null);
    assert.equal(hiddenCount(html), 1);
    assert.match(html, /\+ 더보기 1/);
  });
});
