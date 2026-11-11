// 반려견 상세 — 다음 예약 고르기, 방문 요약 한 줄
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp({ files: ['js/app.js', 'js/pages/pets.js'], now: '2026-11-11T10:00:00+09:00' });
const P = App.pages.pets;

describe('pickNextAppt — 다음 예약', () => {
  test('오늘 이후 가장 빠른 예약 (날짜·시간 순)', () => {
    const appts = [
      { id: 1, date: '2026-11-20', time: '14:00', status: 'confirmed' },
      { id: 2, date: '2026-11-15', time: '16:00', status: 'pending' },
      { id: 3, date: '2026-11-15', time: '10:00', status: 'pending' },
    ];
    assert.equal(P.pickNextAppt(appts, '2026-11-11').id, 3);
  });
  test('오늘 예약도 포함, 지난 예약은 제외', () => {
    const appts = [{ id: 1, date: '2026-11-10', status: 'pending' }, { id: 2, date: '2026-11-11', time: '09:00', status: 'pending' }];
    assert.equal(P.pickNextAppt(appts, '2026-11-11').id, 2);
  });
  test('취소·노쇼·완료는 빼고, 남는 게 없으면 null', () => {
    const appts = [
      { id: 1, date: '2026-11-12', status: 'cancelled' },
      { id: 2, date: '2026-11-13', status: 'noshow' },
      { id: 3, date: '2026-11-14', status: 'completed' },
    ];
    assert.equal(P.pickNextAppt(appts, '2026-11-11'), null);
    assert.equal(P.pickNextAppt([], '2026-11-11'), null);
    assert.equal(P.pickNextAppt(null, '2026-11-11'), null);
  });
});

describe('visitSummary / summaryLine — 방문 요약 한 줄', () => {
  test('횟수·평균 주기·평균 단가·총액·최근 방문', () => {
    const recs = [
      { date: '2026-10-15', finalPrice: 60000 },
      { date: '2026-09-15', finalPrice: 50000 },
      { date: '2026-08-14', finalPrice: 55000 },
    ];
    const s = P.visitSummary(recs);
    assert.equal(s.count, 3);
    assert.equal(s.total, 165000);
    assert.equal(s.avgSpend, 55000);
    assert.equal(s.avgCycle, 31); // 8/14 → 10/15 = 62일 / 2
    assert.equal(s.lastDays, 27);
    assert.equal(P.summaryLine(s), '방문 3회 · 평균 31일마다 · 평균 55,000원 · 총 165,000원');
  });
  test('날짜 없는 기록은 주기·최근 방문에서 빼고, 횟수·금액에는 넣는다', () => {
    const recs = [
      { date: '2026-10-15', finalPrice: 60000 },
      { date: '2026-09-15', finalPrice: 50000 },
      { date: '', finalPrice: 10000 },
      { finalPrice: 20000 },
    ];
    const s = P.visitSummary(recs);
    assert.equal(s.count, 4);
    assert.equal(s.total, 140000);
    assert.equal(s.avgCycle, 30);
    assert.equal(s.lastDate, '2026-10-15');
    assert.equal(s.lastDays, 27);
    // 최신순 정렬에서 날짜 없는 기록이 맨 앞에 와도 최근 방문은 날짜 있는 것 기준
    assert.equal(P.visitSummary([{ finalPrice: 1 }, { date: '2026-11-01', finalPrice: 1 }]).lastDays, 10);
    assert.equal(P.visitSummary([{ finalPrice: 1 }]).lastDays, null);
  });
  test('기록 1건이면 주기는 빼고, 0건이면 빈 줄', () => {
    const s = P.visitSummary([{ date: '2026-11-11', finalPrice: 40000 }]);
    assert.equal(s.avgCycle, null);
    assert.equal(s.lastDays, 0);
    assert.equal(P.summaryLine(s), '방문 1회 · 평균 40,000원 · 총 40,000원');
    assert.equal(P.summaryLine(P.visitSummary([])), '');
  });
});
