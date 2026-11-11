// 예약 화면 도우미 — 주간 띠의 월~일, 날짜 머리줄 글자, 날짜끼리 묶기
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./helpers/load-app');

const page = () => loadApp({ now: '2026-11-11T10:00:00+09:00', files: ['js/app.js', 'js/pages/appointments.js'] }).App.pages.appointments;

describe('weekDays — 고른 날짜가 든 주의 월~일', () => {
  const P = page();
  test('수요일 2026-11-11 → 11/9(월) ~ 11/15(일)', () => {
    assert.deepEqual(plain(P.weekDays('2026-11-11')), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  });
  test('월요일은 그 주 첫날, 일요일은 그 주 마지막 날', () => {
    assert.equal(P.weekDays('2026-11-09')[0], '2026-11-09');
    const sun = P.weekDays('2026-11-15');
    assert.equal(sun[0], '2026-11-09');
    assert.equal(sun[6], '2026-11-15');
  });
  test('달·해를 넘는 주 (2026-01-01 목) → 2025-12-29 ~ 2026-01-04', () => {
    const w = P.weekDays('2026-01-01');
    assert.equal(w[0], '2025-12-29');
    assert.equal(w[6], '2026-01-04');
  });
});

describe('dayLabel — 날짜 머리줄 글자', () => {
  const P = page();
  test('2026-11-13 → "11월 13일 (금)"', () => assert.equal(P.dayLabel('2026-11-13'), '11월 13일 (금)'));
  test('빈 날짜 → 빈 글자', () => assert.equal(P.dayLabel(''), ''));
});

describe('groupByDate — 이어진 같은 날짜끼리 묶기 (순서 유지)', () => {
  const P = page();
  test('날짜가 바뀔 때마다 새 묶음', () => {
    const list = [
      { id: 1, date: '2026-11-11' }, { id: 2, date: '2026-11-11' },
      { id: 3, date: '2026-11-12' }, { id: 4, date: '2026-11-03' }
    ];
    const g = plain(P.groupByDate(list));
    assert.deepEqual(g.map(x => x.date), ['2026-11-11', '2026-11-12', '2026-11-03']);
    assert.deepEqual(g.map(x => x.items.map(a => a.id)), [[1, 2], [3], [4]]);
  });
  test('빈 목록·날짜 없는 예약', () => {
    assert.deepEqual(plain(P.groupByDate([])), []);
    assert.deepEqual(plain(P.groupByDate([{ id: 9 }])), [{ date: '', items: [{ id: 9 }] }]);
  });
});
