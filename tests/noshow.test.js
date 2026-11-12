// 노쇼 위험 표시: 최근 6개월 노쇼·당일 취소 세기 (예약 목록·예약 폼·고객 상세·홈이 같이 쓴다)
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./helpers/load-app');

const { App } = loadApp();
const TODAY = '2026-11-12';

describe('noShowStats — 고객별 노쇼·당일 취소', () => {
  test('noshow·no_show 둘 다 노쇼로 센다', () => {
    const appts = [
      { customerId: 1, date: '2026-10-01', status: 'noshow' },
      { customerId: 1, date: '2026-10-05', status: 'no_show' },
      { customerId: 2, date: '2026-10-05', status: 'completed' },
    ];
    assert.deepEqual(plain(App.noShowStats(appts, TODAY)), { 1: { noShow: 2, lateCancel: 0 } });
  });

  test('당일 취소 = 취소한 날(내 시간)이 예약 날짜와 같거나 그 뒤', () => {
    const appts = [
      // 예약 당일 오전 9시(KST)에 취소 → 당일 취소
      { customerId: 3, date: '2026-11-10', status: 'cancelled', cancelledAt: '2026-11-10T00:00:00.000Z' },
      // 예약 다음 날 취소 → 당일 취소로 센다
      { customerId: 3, date: '2026-11-01', status: 'cancelled', cancelledAt: '2026-11-02T03:00:00.000Z' },
      // 전날 밤 23시(KST)에 취소 → 미리 취소 (UTC로는 같은 날이지만 내 시간 기준)
      { customerId: 3, date: '2026-11-11', status: 'cancelled', cancelledAt: '2026-11-10T14:00:00.000Z' },
      // 예전 취소(cancelledAt 없음)는 안 센다
      { customerId: 3, date: '2026-11-05', status: 'cancelled' },
      // 취소가 아니면 cancelledAt 이 남아 있어도 안 센다
      { customerId: 3, date: '2026-11-06', status: 'confirmed', cancelledAt: '2026-11-06T01:00:00.000Z' },
    ];
    assert.deepEqual(plain(App.noShowStats(appts, TODAY)), { 3: { noShow: 0, lateCancel: 2 } });
  });

  test('6개월보다 전·오늘 뒤·고객 없는 예약은 안 센다', () => {
    const appts = [
      { customerId: 4, date: '2026-05-11', status: 'noshow' },
      { customerId: 4, date: '2026-05-12', status: 'noshow' },
      { customerId: 4, date: '2026-11-13', status: 'noshow' },
      { customerId: null, date: '2026-10-01', status: 'noshow' },
      { date: '2026-10-01', status: 'noshow' },
    ];
    assert.equal(App.noShowSince(TODAY), '2026-05-12');
    assert.deepEqual(plain(App.noShowStats(appts, TODAY)), { 4: { noShow: 1, lateCancel: 0 } });
  });

  test('빈 목록·이상한 값', () => {
    assert.deepEqual(plain(App.noShowStats(null, TODAY)), {});
    assert.deepEqual(plain(App.noShowStats([null, { customerId: 1, status: 'cancelled', date: '2026-11-01', cancelledAt: 'bad' }], TODAY)), {});
  });
});

describe('noShowLine — 한 줄 문구', () => {
  test('둘 다 0이거나 없으면 빈 문자열', () => {
    assert.equal(App.noShowLine(undefined), '');
    assert.equal(App.noShowLine({ noShow: 0, lateCancel: 0 }), '');
  });
  test('있는 것만 적는다', () => {
    assert.equal(App.noShowLine({ noShow: 2, lateCancel: 1 }), '최근 6개월 노쇼 2회 · 당일 취소 1회');
    assert.equal(App.noShowLine({ noShow: 2, lateCancel: 0 }), '최근 6개월 노쇼 2회');
    assert.equal(App.noShowLine({ noShow: 0, lateCancel: 1 }), '최근 6개월 당일 취소 1회');
  });
});

describe('markCancelledAt — 취소한 때 남기기', () => {
  test('취소면 없을 때만 넣고, 취소가 아니면 지운다', () => {
    const a = { status: 'cancelled' };
    App.markCancelledAt(a, 'cancelled');
    assert.match(a.cancelledAt, /^\d{4}-\d{2}-\d{2}T/);
    a.cancelledAt = '2026-01-01T00:00:00.000Z';
    App.markCancelledAt(a, 'cancelled');
    assert.equal(a.cancelledAt, '2026-01-01T00:00:00.000Z');
    App.markCancelledAt(a, 'confirmed');
    assert.equal('cancelledAt' in a, false);
  });
});
