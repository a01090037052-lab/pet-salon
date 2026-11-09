// 날짜 함수 — 한국 시간(KST) 기준, 오늘 날짜는 가짜 시계로 고정
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const at = (now) => loadApp({ now }).App;

describe('오늘 날짜 (getToday) — KST', () => {
  test('2026-11-05 10:00 → "2026-11-05"', () => assert.equal(at('2026-11-05T10:00:00+09:00').getToday(), '2026-11-05'));
  test('KST 1월 1일 00:30 (UTC 로는 전날 15:30) → "2027-01-01"', () => {
    assert.equal(at('2027-01-01T00:30:00+09:00').getToday(), '2027-01-01');
  });
});

describe('날짜 파싱·포맷', () => {
  const App = at('2026-11-05T10:00:00+09:00');
  test('parseLocalDate("2026-03-01") 은 KST 자정 (UTC 로 밀려 2월 28일이 되지 않음)', () => {
    const d = App.parseLocalDate('2026-03-01');
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 2, 1, 0]);
  });
  test('parseLocalDate 빈 값 → null', () => assert.equal(App.parseLocalDate(''), null));
  test('formatLocalDate: Date·문자열 모두 YYYY-MM-DD', () => {
    assert.equal(App.formatLocalDate(new Date(2026, 0, 31)), '2026-01-31');
    assert.equal(App.formatLocalDate('2026-02-01T00:00:00'), '2026-02-01');
  });
  test('formatDateKo("2026-10-23") → "10월 23일(금)"', () => assert.equal(App.formatDateKo('2026-10-23'), '10월 23일(금)'));
  test('getMonthKey: 1월의 지난달 = 작년 12월, 12월의 다음달 = 내년 1월', () => {
    assert.equal(App.getMonthKey(-1, new Date(2026, 0, 15)), '2025-12');
    assert.equal(App.getMonthKey(1, new Date(2026, 11, 1)), '2027-01');
  });
});

describe('남은 일수 / 시점 표현 — 연말·월말 경계', () => {
  test('12월 31일 23:30 기준: 1월 1일 = 1, 12월 30일 = -1', () => {
    const App = at('2026-12-31T23:30:00+09:00');
    assert.equal(App.daysUntil('2027-01-01'), 1);
    assert.equal(App.daysUntil('2026-12-30'), -1);
  });
  test('1월 30일 기준 relativeDayLabel: 오늘/내일/모레/N일 후, 지난 날은 빈 값', () => {
    const App = at('2026-01-30T09:00:00+09:00');
    assert.equal(App.relativeDayLabel('2026-01-30'), '오늘');
    assert.equal(App.relativeDayLabel('2026-01-31'), '내일');
    assert.equal(App.relativeDayLabel('2026-02-01'), '모레');
    assert.equal(App.relativeDayLabel('2026-02-05'), '6일 후');
    assert.equal(App.relativeDayLabel('2026-01-29'), '');
  });
});

describe('반려견 나이 (calculatePetAge) — 생일 당일 기준', () => {
  const App = at('2026-11-05T10:00:00+09:00');
  test('생일 당일이면 한 살 더: 2020-11-05 → 6살', () => assert.equal(App.calculatePetAge('2020-11-05'), '6살'));
  test('생일 하루 전: 2020-11-06 → 5살', () => assert.equal(App.calculatePetAge('2020-11-06'), '5살'));
  test('ISO 시각이 붙어 있어도 날짜만 본다: 2020-11-06T00:00:00.000Z → 5살', () => {
    assert.equal(App.calculatePetAge('2020-11-06T00:00:00.000Z'), '5살');
  });
  test('딱 1년: 2025-11-05 → 1살', () => assert.equal(App.calculatePetAge('2025-11-05'), '1살'));
  test('1년 안 됨: 2026-03-01 → "1살 미만"', () => assert.equal(App.calculatePetAge('2026-03-01'), '1살 미만'));
});

describe('오래 안 온 반려견 (사진 정리 기준)', () => {
  const App = at('2026-11-09T10:00:00+09:00');
  test('2년 전 날짜 — 윤년·연말 넘김', () => {
    assert.equal(App.oldPetCutoff('2026-11-09'), '2024-11-09');
    assert.equal(App.oldPetCutoff('2028-02-29'), '2026-03-01'); // 윤일은 2년 전 3/1 (하루 늦게 — 더 보수적)
    assert.equal(App.oldPetCutoff('2027-01-01'), '2025-01-01');
  });
  test('마지막 방문이 2년보다 오래면 참, 딱 2년·그 뒤·방문일 없음은 거짓', () => {
    assert.equal(App.isPetAbsentLong({ lastVisitDate: '2024-11-08' }, '2026-11-09'), true);
    assert.equal(App.isPetAbsentLong({ lastVisitDate: '2024-11-09' }, '2026-11-09'), false);
    assert.equal(App.isPetAbsentLong({ lastVisitDate: '2026-10-01' }, '2026-11-09'), false);
    assert.equal(App.isPetAbsentLong({}, '2026-11-09'), false);
    assert.equal(App.isPetAbsentLong(null, '2026-11-09'), false);
  });
});
