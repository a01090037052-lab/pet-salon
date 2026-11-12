// 미용 주기 한 기준: 기록 '다음 미용'(record.nextCycle) → 반려견 주기, 직접 정한 값과의 우선순위,
// 추천 순서, 실제 평균 표시, 옛 데이터·백업 복원, 연락 두 번 규칙, VIP 기준, 그리고 '주기를 아무 데서나 계산하지 않기' 감시 테스트
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, createFakeDB, plain, ROOT } = require('./helpers/load-app');

const NOW = '2026-11-12T10:00:00+09:00';
const App = loadApp({ now: NOW }).App;
const rec = (id, date, nextCycle, extra) => ({ id, petId: 1, date, nextCycle, createdAt: date + 'T12:00:00.000Z', ...extra });

describe('주기 값 정리 (normalizeCycle·formatCycle)', () => {
  test('글자 숫자는 숫자로, 0·음수·글자·빈 값·365 초과는 0', () => {
    assert.equal(App.normalizeCycle('28'), 28);
    assert.equal(App.normalizeCycle(27.6), 28);
    for (const v of [0, -5, 'abc', '', null, undefined, 400, NaN, {}]) assert.equal(App.normalizeCycle(v), 0, String(v));
  });
  test('7의 배수는 주, 아니면 일', () => {
    assert.equal(App.formatCycle(28), '4주');
    assert.equal(App.formatCycle(33), '33일');
    assert.equal(App.formatCycle(0), '');
  });
  test('이상한 주기 값이 있는 옛 반려견은 견종 → 매장 기준으로', () => {
    assert.equal(App.getGroomingCycle({ breed: '푸들', groomingCycle: 'abc' }, 30), 28);
    assert.equal(App.getGroomingCycle({ breed: '', groomingCycle: 0 }, 40), 40);
    assert.equal(App.getGroomingCycle({ groomingCycle: '21' }, 40), 21);
  });
});

describe('어디서 정한 주기인지 (getGroomingCycleInfo)', () => {
  test('기록 때 정함 · 직접 · 견종 · 매장', () => {
    assert.deepEqual(plain(App.getGroomingCycleInfo({ groomingCycle: 28, groomingCycleFrom: { type: 'record', date: '2026-11-12', recordId: 3 } }, 30)), { days: 28, source: 'record', date: '2026-11-12' });
    assert.equal(App.getGroomingCycleInfo({ groomingCycle: 21 }, 30).source, 'manual'); // 예전 데이터
    assert.equal(App.getGroomingCycleInfo({ breed: '말티즈' }, 30).source, 'breed');
    assert.deepEqual(plain(App.getGroomingCycleInfo({ breed: '믹스' }, 0)), { days: 30, source: 'shop', date: '' });
  });
});

describe('다음 미용 추천 순서 (suggestNextCycle)', () => {
  const styles = [{ name: '곰돌이컷', cycleDays: 21 }];
  test('1) 이 아이 주기가 가장 먼저', () => assert.equal(App.suggestNextCycle({ breed: '푸들', groomingCycle: 42 }, styles, 30).days, 42));
  test('2) 없으면 오늘 고른 스타일·코스 주기 (앞에 있는 것)', () => {
    const r = App.suggestNextCycle({ breed: '푸들' }, [{ name: '목욕' }, ...styles, { name: '전체', cycleDays: 35 }], 30);
    assert.deepEqual(plain(r), { days: 21, source: 'style', name: '곰돌이컷' });
  });
  test('스타일 주기가 이상한 값이면 건너뛴다', () => assert.equal(App.suggestNextCycle({ breed: '푸들' }, [{ name: 'x', cycleDays: '0' }], 30).days, 28));
  test('3) 견종 기본 → 4) 매장 기준', () => {
    assert.deepEqual(plain(App.suggestNextCycle({ breed: '시츄' }, [], 30)), { days: 35, source: 'breed' });
    assert.deepEqual(plain(App.suggestNextCycle({ breed: '믹스' }, [], 45)), { days: 45, source: 'shop' });
    assert.deepEqual(plain(App.suggestNextCycle(null, null, undefined)), { days: 30, source: 'shop' });
  });
});

describe('반려견 주기 = 가장 최근 기록의 다음 미용 (computePetCycle)', () => {
  test('가장 최근 날짜 기록의 값', () => {
    const r = App.computePetCycle({}, [rec(1, '2026-09-01', 21), rec(2, '2026-10-01', 35), rec(3, '2026-08-01', 56)]);
    assert.equal(r.days, 35);
    assert.deepEqual(plain(r.from), { type: 'record', date: '2026-10-01', recordId: 2 });
  });
  test('옛 기록을 고쳐도(값 바꿈) 더 최근 기록을 덮지 않는다', () => {
    assert.equal(App.computePetCycle({}, [rec(1, '2026-09-01', 14), rec(2, '2026-10-01', 35)]).days, 35);
  });
  test('최근 기록을 지우면 그 앞 기록 값으로', () => {
    assert.equal(App.computePetCycle({}, [rec(1, '2026-09-01', 21)]).days, 21);
  });
  test('다음 미용 값이 없는 옛 기록은 건너뛴다 (더 최근이어도)', () => {
    assert.equal(App.computePetCycle({}, [rec(1, '2026-09-01', 21), rec(2, '2026-10-01', undefined), rec(3, '2026-10-05', 'abc')]).days, 21);
    assert.equal(App.computePetCycle({}, [rec(2, '2026-10-01')]).days, 0);
  });
  test('같은 날 기록 두 개: 나중에 만든 것 → (같으면) id 큰 것', () => {
    assert.equal(App.computePetCycle({}, [rec(5, '2026-10-01', 21, { createdAt: '2026-10-01T09:00:00Z' }), rec(4, '2026-10-01', 42, { createdAt: '2026-10-01T10:00:00Z' })]).days, 42);
    assert.equal(App.computePetCycle({}, [rec(4, '2026-10-01', 42, { createdAt: '' }), rec(5, '2026-10-01', 21, { createdAt: '' })]).days, 21);
  });
});

describe('직접 정한 값 vs 기록 값 — 날짜가 늦은 쪽', () => {
  test('직접 정한 날이 더 늦으면 직접 값', () => {
    const pet = { groomingCycleManual: { days: 56, date: '2026-11-01', at: '2026-11-01T01:00:00Z' } };
    const r = App.computePetCycle(pet, [rec(1, '2026-10-01', 21)]);
    assert.deepEqual(plain({ d: r.days, f: r.from }), { d: 56, f: { type: 'manual', date: '2026-11-01' } });
  });
  test('그 뒤 미용 기록이 생기면 기록 값', () => {
    const pet = { groomingCycleManual: { days: 56, date: '2026-11-01', at: '2026-11-01T01:00:00Z' } };
    assert.equal(App.computePetCycle(pet, [rec(1, '2026-11-10', 21)]).days, 21);
  });
  test('같은 날이면 나중에 한 쪽 (기록 만든 시각 ↔ 직접 바꾼 시각)', () => {
    const pet = { groomingCycleManual: { days: 56, date: '2026-11-10', at: '2026-11-10T05:00:00Z' } };
    assert.equal(App.computePetCycle(pet, [rec(1, '2026-11-10', 21, { createdAt: '2026-11-10T03:00:00Z' })]).days, 56);
    assert.equal(App.computePetCycle(pet, [rec(1, '2026-11-10', 21, { createdAt: '2026-11-10T06:00:00Z' })]).days, 21);
  });
  test("직접 '정하지 않음'으로 바꾸면 비운다 (예전 기록 값이 되살아나지 않음)", () => {
    const pet = { groomingCycle: 21, groomingCycleManual: { days: 0, date: '2026-11-11', at: 'x' } };
    const r = App.computePetCycle(pet, [rec(1, '2026-11-01', 21)]);
    assert.equal(r.days, 0);
    assert.equal(r.from, null);
  });
  test('setManualCycle + applyPetCycle: 오늘 날짜로 직접 값', () => {
    const pet = { groomingCycle: 21, groomingCycleFrom: { type: 'record', date: '2026-11-01', recordId: 1 } };
    App.setManualCycle(pet, '42');
    assert.equal(App.applyPetCycle(pet, [rec(1, '2026-11-01', 21)]), true);
    assert.equal(pet.groomingCycle, 42);
    assert.deepEqual(plain(pet.groomingCycleFrom), { type: 'manual', date: '2026-11-12' });
  });
});

describe('옛 데이터 (groomingCycle 만 있는 반려견)', () => {
  test('기록 값이 없으면 그대로 — 저장도 안 한다', () => {
    const pet = { id: 1, groomingCycle: 42 };
    assert.equal(App.applyPetCycle(pet, [rec(1, '2026-10-01')]), false);
    assert.deepEqual(plain(pet), { id: 1, groomingCycle: 42 });
  });
  test('새 기록 값이 이기고, 옛 값은 직접 값으로 남아 그 기록을 지우면 돌아온다', () => {
    const pet = { id: 1, groomingCycle: 42 };
    assert.equal(App.applyPetCycle(pet, [rec(9, '2026-11-10', 28)]), true);
    assert.equal(pet.groomingCycle, 28);
    assert.equal(pet.groomingCycleManual.days, 42);
    assert.equal(App.applyPetCycle(pet, []), true); // 기록 삭제
    assert.equal(pet.groomingCycle, 42);
    assert.equal(App.getGroomingCycleInfo(pet, 30).source, 'manual');
  });
  test('주기가 전혀 없던 아이는 기록이 없어지면 견종·매장 기준으로', () => {
    const pet = { breed: '푸들' };
    App.applyPetCycle(pet, [rec(1, '2026-11-10', 42)]);
    assert.equal(App.getGroomingCycle(pet, 30), 42);
    App.applyPetCycle(pet, []);
    assert.equal(pet.groomingCycle, null);
    assert.equal(pet.groomingCycleFrom, undefined);
    assert.equal(App.getGroomingCycleInfo(pet, 30).source, 'breed');
  });
  test('같은 결과면 다시 저장하지 않는다', () => {
    const pet = {};
    assert.equal(App.applyPetCycle(pet, [rec(1, '2026-11-10', 42)]), true);
    assert.equal(App.applyPetCycle(pet, [rec(1, '2026-11-10', 42)]), false);
  });
});

describe('기록 저장·수정·삭제 뒤 다시 계산 (records._recalcPetLastVisit)', () => {
  const setup = (records, pet) => {
    const db = createFakeDB({ stores: { pets: [{ id: 1, name: '콩', breed: '푸들', ...pet }], records, appointments: [] } });
    const { App: A } = loadApp({ now: NOW, db, files: ['js/app.js', 'js/pages/pets.js', 'js/pages/records.js'] });
    return { db, P: A.pages.records };
  };
  test('최근 기록 값 → 반려견, 최근 기록 삭제 → 앞 기록 값', async () => {
    const { db, P } = setup([rec(1, '2026-09-01', 21), rec(2, '2026-10-20', 35)]);
    await P._recalcPetLastVisit(1);
    assert.equal(db.peek('pets', 1).groomingCycle, 35);
    assert.equal(db.peek('pets', 1).lastVisitDate, '2026-10-20');
    await db.delete('records', 2);
    await P._recalcPetLastVisit(1);
    assert.equal(db.peek('pets', 1).groomingCycle, 21);
    assert.equal(db.peek('pets', 1).groomingCycleFrom.recordId, 1);
  });
  test('옛 기록의 값을 고쳐 저장해도 반려견 주기는 최근 기록 값', async () => {
    const { db, P } = setup([rec(1, '2026-09-01', 21), rec(2, '2026-10-20', 35)]);
    const r1 = db.peek('records', 1); r1.nextCycle = 56; await db.update('records', r1);
    await P._recalcPetLastVisit(1);
    assert.equal(db.peek('pets', 1).groomingCycle, 35);
  });
  test('실제 평균은 3번 이상 온 아이만', () => {
    const { P } = setup([]);
    assert.equal(P._cycleAvgNote([rec(1, '2026-09-01'), rec(2, '2026-09-29')]), '');
    assert.equal(P._cycleAvgNote([rec(1, '2026-09-01'), rec(2, '2026-09-29'), rec(3, '2026-10-27')]), '실제 평균 4주');
    assert.equal(P._cycleAvgNote([rec(1, '2026-09-01'), rec(2, '2026-09-30'), rec(3, '2026-11-01')]), '실제 평균 31일');
    assert.equal(P._cycleAvgNote(null), '');
  });
});

describe('백업 복원·동기화 뒤 (migratePetVisitStats(true))', () => {
  test('옛 백업(다음 미용 값 없음): 직접 정한 주기 그대로, 주기 때문에 다시 쓰지 않음', async () => {
    const db = createFakeDB({ stores: {
      pets: [{ id: 1, groomingCycle: 42, firstVisitDate: '2026-09-01', lastVisitDate: '2026-10-01', visitCount: 2 }, { id: 2, breed: '푸들', firstVisitDate: null, lastVisitDate: null, visitCount: 0 }],
      records: [{ id: 1, petId: 1, date: '2026-09-01' }, { id: 2, petId: 1, date: '2026-10-01' }]
    } });
    const { App: A } = loadApp({ now: NOW, db });
    await A.migratePetVisitStats(true);
    assert.equal(db.writes.filter(w => w.store === 'pets').length, 0);
    assert.equal(A.getGroomingCycle(db.peek('pets', 1), 30), 42);
    assert.equal(A.getGroomingCycle(db.peek('pets', 2), 30), 28);
  });
  test('새 백업: 기록의 다음 미용 값으로 반려견 주기를 다시 맞춘다', async () => {
    const db = createFakeDB({ stores: {
      pets: [{ id: 1, firstVisitDate: '2026-09-01', lastVisitDate: '2026-10-01', visitCount: 2 }],
      records: [rec(1, '2026-09-01', 21), rec(2, '2026-10-01', 35)]
    } });
    const { App: A } = loadApp({ now: NOW, db });
    await A.migratePetVisitStats(true);
    assert.equal(db.peek('pets', 1).groomingCycle, 35);
    assert.equal(db.peek('pets', 1).groomingCycleFrom.type, 'record');
  });
});

describe('한 기준 — 고객 목록 상태·VIP', () => {
  const daysAgo = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return App.formatLocalDate(d); };
  test('두 번 연락해도 안 오면 고객 목록에서도 오래 안 옴 (홈과 같은 규칙)', () => {
    const pet = { id: 1, customerId: 1, lastVisitDate: daysAgo(40), groomingCycle: 30 };
    const c = { id: 1, contactLog: [daysAgo(10) + 'T09:00:00+09:00', daysAgo(3) + 'T09:00:00+09:00'] };
    assert.equal(App.getCustomerVisitStatus([pet], 30, null), 'remind');
    assert.equal(App.getCustomerVisitStatus([pet], 30, null, c), 'churned');
    assert.equal(App.getCustomerVisitStatus([pet], 30, null, { id: 1, contactLog: [daysAgo(3) + 'T09:00:00+09:00'] }), 'remind');
    // 정상인 아이는 연락 횟수와 상관없이 정상
    assert.equal(App.getCustomerVisitStatus([{ ...pet, lastVisitDate: daysAgo(5) }], 30, null, c), 'normal');
  });
  test('VIP 미방문은 반려견마다 자기 주기 기준', () => {
    const customers = [{ id: 1, tags: ['vip'] }, { id: 2, tags: ['vip'] }, { id: 3, tags: ['vip'] }];
    const pets = [
      { id: 1, customerId: 1, lastVisitDate: daysAgo(40), groomingCycle: 56 }, // 8주 주기 — 아직
      { id: 2, customerId: 2, lastVisitDate: daysAgo(40), groomingCycle: 28 } // 4주 — 지남
    ];
    const r = App.computeVipUnvisited(customers, pets, { 3: daysAgo(31) }, 30); // 3번은 반려견 없이 기록만 → 매장 기준
    assert.deepEqual(plain(r.map(x => x.customer.id).sort()), [2, 3]);
  });
});

// ===== 감시: 주기·재방문 기준으로 날짜·상태를 계산하는 곳은 정해진 함수뿐이어야 한다 =====
// pet.groomingCycle 을 직접 읽거나, revisitDays 를 더하기·비교에 쓰면 화면마다 다른 숫자가 나온다 → App.getGroomingCycle 등 헬퍼를 쓰세요.
describe('주기 계산은 정해진 곳에서만 (소스 감시)', () => {
  // 파일 → 허용 함수(최상위 메서드 이름)
  const ALLOWED = {
    'js/app.js': ['getRevisitDays', 'getGroomingCycleInfo', 'suggestNextCycle', 'computePetCycle', 'applyPetCycle', 'setManualCycle', 'migratePetVisitStats'],
    'js/pages/pets.js': ['showForm'], // 반려견 수정 화면 (주기 고르기)
    'js/pages/settings.js': ['render', 'init'], // 매장 기준 설정 칸 (읽기·저장)
  };
  const files = [];
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => {
    const rel = d + '/' + e.name;
    if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js')) files.push(rel);
  });
  walk('js');
  // 줄 번호 → 그 줄을 감싸는 최상위 메서드 이름 (App = { name(...) { 형태: 들여쓰기 2칸)
  const methodAt = (lines, i) => {
    for (let j = i; j >= 0; j--) {
      const m = lines[j].match(/^ {2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);
      if (m) return m[1];
    }
    return '';
  };
  const BAD = [
    { re: /\.groomingCycle\b(?!Manual|From)|\[['"]groomingCycle['"]\]/, why: 'pet.groomingCycle 직접 읽기 — App.getGroomingCycle/Info 를 쓰세요' },
    { re: /\brevisitDays\w*\s*(?:[-+*/%]|[<>]=?)(?![=>])|(?:[-+*/%<>]|[<>]=)\s*revisitDays\w*\b|getSetting\(\s*['"]revisitDays['"]/, why: 'revisitDays 로 직접 계산 — App.getGroomingCycle 을 쓰세요' }
  ];
  test('감시 규칙이 예전의 잘못된 코드를 실제로 잡는다', () => {
    const caught = (code) => BAD.some(b => b.re.test(code));
    assert.ok(caught("if (avgCycle <= revisitDaysSetting) x();"));
    assert.ok(caught("const limit = revisitDays * 2;"));
    assert.ok(caught("} else if (p.groomingCycle && p.lastVisitDate) {"));
    assert.ok(caught("const d = await DB.getSetting('revisitDays');"));
    assert.ok(!caught("App.getGroomingCycle(pet, revisitDays)"));
    assert.ok(!caught("const revisitDays = await App.getRevisitDays();"));
    assert.ok(!caught("pet.groomingCycleFrom = r.from;"));
  });
  test('js 폴더 전체 검사', () => {
    const problems = [];
    for (const f of files) {
      const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        BAD.forEach(b => {
          if (!b.re.test(code)) return;
          const fn = methodAt(lines, i);
          if ((ALLOWED[f] || []).includes(fn)) return;
          problems.push(`${f}:${i + 1} (${fn || '?'}) ${b.why}\n    ${line.trim().slice(0, 140)}`);
        });
      });
    }
    assert.deepEqual(problems, [], '\n' + problems.join('\n'));
  });
});

describe('리뷰 지적 회귀', () => {
  const daysAgo = (n) => { const d = new Date(NOW); d.setDate(d.getDate() - n); return App.formatLocalDate(d); };
  test('동기화로 groomingCycleFrom 키 순서가 바뀌어도 다시 쓰지 않는다', () => {
    const pet = { groomingCycle: 42, groomingCycleFrom: { date: '2026-11-10', recordId: 1, type: 'record' } };
    assert.equal(App.applyPetCycle(pet, [rec(1, '2026-11-10', 42)]), false);
    const pet2 = { groomingCycle: 42, groomingCycleFrom: { date: '2026-11-10', recordId: 2, type: 'record' } };
    assert.equal(App.applyPetCycle(pet2, [rec(1, '2026-11-10', 42)]), true); // 다른 기록이면 바뀜
  });
  test('복원 뒤 마지막 방문일: 기록 없이 완료한 예약도 센다 (_recalcPetLastVisit 와 같은 답)', async () => {
    const stores = {
      pets: [{ id: 1, firstVisitDate: '2026-09-01', lastVisitDate: '2026-11-05', visitCount: 1 }],
      records: [{ id: 1, petId: 1, date: '2026-09-01', appointmentId: 7 }],
      appointments: [
        { id: 7, petId: 1, date: '2026-09-01', status: 'completed' },
        { id: 8, petId: 1, date: '2026-11-05', status: 'completed' },
        { id: 9, petId: 1, date: '2026-11-20', status: 'completed' }, // 미래
        { id: 10, petId: 1, date: '2026-11-08', status: 'cancelled' }
      ]
    };
    const db = createFakeDB({ stores });
    const { App: A } = loadApp({ now: NOW, db });
    await A.migratePetVisitStats(true);
    assert.equal(db.peek('pets', 1).lastVisitDate, '2026-11-05');
    assert.equal(db.writes.filter(w => w.store === 'pets').length, 0);
    const db2 = createFakeDB({ stores });
    const { App: B } = loadApp({ now: NOW, db: db2, files: ['js/app.js', 'js/pages/pets.js', 'js/pages/records.js'] });
    await B.pages.records._recalcPetLastVisit(1);
    assert.equal(db2.peek('pets', 1).lastVisitDate, '2026-11-05');
  });
  test('VIP: 반려견 날짜보다 최근에 온 손님(반려견 없는 기록)은 미방문이 아니다', () => {
    const customers = [{ id: 1, tags: ['vip'] }, { id: 2, tags: ['vip'] }];
    const pets = [
      { id: 1, customerId: 1, lastVisitDate: daysAgo(60), groomingCycle: 28 },
      { id: 2, customerId: 2, lastVisitDate: daysAgo(60), groomingCycle: 28 }
    ];
    const r = App.computeVipUnvisited(customers, pets, { 1: daysAgo(3), 2: daysAgo(40) }, 30);
    assert.deepEqual(plain(r.map(x => x.customer.id)), [2]); // 2번은 40일 전 방문 — 주기 28일 지남
  });
  test('같은 날: 직접 정한 뒤 오늘 기록을 고쳐 다른 값을 고르면 기록 값', () => {
    const pet = {};
    App.setManualCycle(pet, 42); // at = 지금
    const r1 = rec(1, '2026-11-12', 21, { createdAt: '2026-11-12T00:00:00.000Z' });
    assert.equal(App.computePetCycle(pet, [r1]).days, 42);
    const edited = { ...r1, updatedAt: '2026-11-12T23:00:00.000Z' };
    assert.equal(App.computePetCycle(pet, [edited]).days, 21);
  });
});
