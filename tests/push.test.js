// 예약 알림 (Web Push) — 서버에 올릴 알림 목록 만들기 (App.Push.buildJobs)
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp();
const P = App.Push;
// 기준: 2026-11-06 10:00 (KST)
const NOW = new Date(2026, 10, 6, 10, 0, 0).getTime();
const pets = { 1: { id: 1, name: '초코' }, 2: { id: 2, name: '콩이' } };
const services = { 10: '전체미용', 11: '발톱' };
const appt = (o) => Object.assign({ id: 1, petId: 1, customerId: 7, date: '2026-11-06', time: '14:00', status: 'confirmed', serviceIds: [10] }, o);

describe('예약 알림: buildJobs', () => {
  test('30분 전: 시각·태그·제목·본문', () => {
    const [j] = P.buildJobs([appt()], pets, services, 30, NOW);
    assert.equal(j.at, new Date(2026, 10, 6, 13, 30).getTime());
    assert.equal(j.tag, 'appt-1-2026-11-06-14:00-30');
    assert.equal(j.title, '30분 뒤 예약');
    assert.equal(j.body, '14:00 초코 · 전체미용');
    assert.equal(j.url, './#appointments');
  });
  test('60분 → 1시간 뒤, 120분 → 2시간 뒤, 10분 → 10분 뒤', () => {
    assert.equal(P.buildJobs([appt()], pets, services, 60, NOW)[0].title, '1시간 뒤 예약');
    assert.equal(P.buildJobs([appt()], pets, services, 120, NOW)[0].title, '2시간 뒤 예약');
    assert.equal(P.buildJobs([appt()], pets, services, 10, NOW)[0].title, '10분 뒤 예약');
    assert.equal(P.buildJobs([appt()], pets, services, 120, NOW)[0].at, new Date(2026, 10, 6, 12, 0).getTime());
  });
  test('90분 → 1시간 30분 뒤, 5분 → 5분 뒤, 180분 → 3시간 뒤', () => {
    assert.equal(P.titleFor(90), '1시간 30분 뒤 예약');
    assert.equal(P.titleFor(5), '5분 뒤 예약');
    assert.equal(P.titleFor(180), '3시간 뒤 예약');
    assert.equal(P.buildJobs([appt()], pets, services, 90, NOW)[0].at, new Date(2026, 10, 6, 12, 30).getTime());
  });
  test('취소·완료·노쇼는 빼고, 시간 없는 예약도 뺀다', () => {
    const jobs = P.buildJobs([
      appt({ id: 1, status: 'cancelled' }), appt({ id: 2, status: 'completed' }), appt({ id: 3, status: 'noshow' }),
      appt({ id: 4, time: '' }), appt({ id: 5, status: 'pending' })
    ], pets, services, 30, NOW);
    assert.deepEqual([...jobs.map(j => j.tag)], ['appt-5-2026-11-06-14:00-30']);
  });
  test('이미 지난 알림(15분 넘게)·어제·15일 뒤는 뺀다, 15분 안쪽은 남긴다', () => {
    const jobs = P.buildJobs([
      appt({ id: 1, time: '09:00' }),            // 08:30 — 지남
      appt({ id: 2, time: '10:20' }),            // 09:50 — 10분 전, 남김
      appt({ id: 3, date: '2026-11-05' }),       // 어제
      appt({ id: 4, date: '2026-11-21' }),       // 15일 뒤
      appt({ id: 5, date: '2026-11-20' })        // 14일 뒤 — 남김
    ], pets, services, 30, NOW);
    assert.deepEqual([...jobs.map(j => j.tag.split('-')[1])], ['2', '5']);
  });
  test('본문에 보호자 이름·전화가 없다 (반려견 이름·시간·서비스만), 시간순 정렬', () => {
    const jobs = P.buildJobs([
      appt({ id: 1, time: '16:00', petId: 2, customerName: '박도준', phone: '010-1234-4444', serviceIds: [] }),
      appt({ id: 2, time: '12:00', serviceIds: [10, 11] })
    ], pets, services, 30, NOW);
    assert.deepEqual([...jobs.map(j => j.body)], ['12:00 초코 · 전체미용, 발톱', '16:00 콩이']);
    jobs.forEach(j => { assert.ok(!/박도준|010|4444/.test(j.body + j.title)); });
  });
  test('최대 300개', () => {
    const many = Array.from({ length: 400 }, (_, i) => appt({ id: i + 1, time: String(11 + (i % 10)).padStart(2, '0') + ':00' }));
    assert.equal(P.buildJobs(many, pets, services, 30, NOW).length, 300);
  });
});

describe('예약 알림: 브라우저 오류 → 한국어 안내 (errorMessage)', () => {
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120';
  test('권한 거부: 아이폰은 설정 › 알림 › 펫살롱, 맥은 시스템 설정 › 알림', () => {
    const e = { name: 'NotAllowedError', message: 'Registration failed - permission denied' };
    assert.match(P.errorMessage(e, IOS), /설정 › 알림 › 펫살롱/);
    assert.match(P.errorMessage(e, MAC), /시스템 설정 › 알림/);
    assert.match(P.errorMessage({ message: 'Registration failed - permission denied' }, MAC), /시스템 설정/);
  });
  test('AbortError·네트워크·알 수 없는 오류도 영어 원문 없이', () => {
    for (const e of [{ name: 'AbortError', message: 'Registration failed - push service error' },
      { name: 'TypeError', message: 'Failed to fetch' }, { name: 'Weird', message: 'Something odd' }]) {
      const m = P.errorMessage(e, IOS);
      assert.ok(m && !/[A-Za-z]{4,}/.test(m.replace(/Mac/g, '')), m);
    }
  });
});

describe('미결제 결제 창 요약 (payUnpaidSummary)', () => {
  test('반려견 · 보호자 · 날짜 · 서비스 / 받을 금액(정액권 쓴 몫 뺀 나머지)', () => {
    const sm = App.payUnpaidSummary(
      { date: '2026-11-06', service: '전체미용', finalPrice: 50000, prepaidUsed: 5000, paymentMethod: 'unpaid' },
      { name: '초코' }, { name: '박도준' });
    assert.ok(sm.who.startsWith('초코 · 박도준 · '), sm.who);
    assert.ok(sm.who.endsWith(' · 전체미용'), sm.who);
    assert.equal(sm.amount, '45,000원');
  });
  test('반려견·보호자·서비스가 없어도 빈 칸·"-" 없이', () => {
    const sm = App.payUnpaidSummary({ date: '2026-11-06', finalPrice: 10000 }, null, null);
    assert.ok(!/ · ·|^ · | · $|-$/.test(sm.who), sm.who);
  });
});

describe('예약 알림: 길이 (예: 전체미용 7F)', () => {
  test('고른 길이는 그 코스 이름 뒤에', () => {
    const [j] = P.buildJobs([appt({ serviceIds: [10, 11], length: { serviceId: 10, name: '7F', price: 10000 } })], pets, services, 30, NOW);
    assert.equal(j.body, '14:00 초코 · 전체미용 7F, 발톱');
  });
  test('코스를 뺀 예약에 남은 길이는 안 쓴다, 지운 코스는 저장된 이름 뒤에', () => {
    assert.equal(P.buildJobs([appt({ serviceIds: [11], length: { serviceId: 10, name: '7F', price: 10000 } })], pets, services, 30, NOW)[0].body, '14:00 초코 · 발톱');
    assert.equal(P.buildJobs([appt({ serviceIds: [99], serviceNames: ['전체미용'], length: { serviceId: 99, name: '4F', price: 5000 } })], pets, services, 30, NOW)[0].body, '14:00 초코 · 전체미용 4F');
  });
});
