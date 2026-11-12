// 2026-11-12 전체 점검에서 나온 문제의 되돌아감 방지 시험
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp, createFakeDB, plain, ROOT } = require('./helpers/load-app');

const NOW = '2026-11-12T10:00:00+09:00';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('연락: 같은 날 여러 번은 한 번', () => {
  const load = (db) => loadApp({ now: NOW, db, files: ['js/app.js', 'js/pages/dashboard.js'] });
  test('같은 날 문자·전화를 다 눌러도 1번으로 센다', () => {
    const { App } = load();
    const c = { contactLog: ['2026-11-10T09:00:00+09:00', '2026-11-10T09:05:00+09:00', '2026-11-10T18:00:00+09:00'] };
    assert.equal(App.contactsSinceVisit(c, '2026-10-01'), 1);
    assert.equal(App.applyContactRule('remind', c, '2026-10-01'), 'remind');
  });
  test('다른 날 두 번이면 오래 안 옴', () => {
    const { App } = load();
    const c = { contactLog: ['2026-11-03T09:00:00+09:00', '2026-11-10T09:00:00+09:00'] };
    assert.equal(App.contactsSinceVisit(c, '2026-10-01'), 2);
    assert.equal(App.applyContactRule('remind', c, '2026-10-01'), 'churned');
  });
  test('버튼을 두 번 눌러도 기록은 한 줄, 취소 한 번에 오늘 연락이 모두 없던 일', async () => {
    const db = createFakeDB({ stores: { customers: [{ id: 7, name: '김' }] } });
    const P = load(db).App.pages.dashboard;
    await P._markContacted(7); await P._markContacted(7);
    assert.equal(db.peek('customers', 7).contactLog.length, 1);
    await P._undoContact(7);
    assert.equal(db.peek('customers', 7).contactLog, undefined);
  });
  test('되돌리기(복원 전 상태로)는 기기 것과 합치지 않는다', () => {
    assert.match(read('js/pages/settings.js'), /importAll\(autoBackup\.data, null, \{ keepDeviceAssets: false \}\)/);
    assert.match(read('js/db.js'), /if \(opts\.keepDeviceAssets !== false\)/);
  });
  test('취소는 누른 그 손님 것만 되돌린다', async () => {
    const db = createFakeDB({ stores: { customers: [{ id: 1, name: '가' }, { id: 2, name: '나' }] } });
    const P = load(db).App.pages.dashboard;
    await P._markContacted(1); await P._markContacted(2);
    await P._undoContact(1);
    assert.equal(db.peek('customers', 1).contactLog, undefined);
    assert.equal(db.peek('customers', 2).contactLog.length, 1);
  });
  test('목록에 다 못 그린 손님 안내', () => {
    const P = load().App.pages.dashboard;
    assert.equal(P._capNote(15, 15), '');
    assert.match(P._capNote(40, 15), /나머지 25명/);
  });
});

describe('복원: 이 기기에만 있는 꾸미기 자료 합치기 (DB.mergeAssetLists)', () => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(read('js/db.js') + '\nthis.DB = DB;', ctx, { filename: 'js/db.js' });
  const DB = ctx.DB;
  test('백업 것 + 기기에만 있는 것, 같은 id 는 백업 것', () => {
    const r = plain(DB.mergeAssetLists([{ id: 'a', name: '백업' }], [{ id: 'a', name: '기기' }, { id: 'b', name: '새로 만든 것' }]));
    assert.deepEqual(r, [{ id: 'a', name: '백업' }, { id: 'b', name: '새로 만든 것' }]);
  });
  test('백업에 없으면 기기 것 그대로, 둘 다 없으면 빈 목록', () => {
    assert.equal(DB.mergeAssetLists(undefined, [{ id: 1 }]).length, 1);
    assert.equal(DB.mergeAssetLists(null, null).length, 0);
  });
  test('복원 코드가 지킬 것들', () => {
    const src = read('js/db.js');
    assert.match(src, /preservedSettings\.forEach\(item => \{ try \{ st\.put\(item\)/);      // 지우는 묶음 안에서 내부 설정 다시 넣기
    assert.match(src, /rollback insert aborted/);                                            // 되돌리기 멈춤 방지
    assert.match(src, /__petsalon_import_running__/);                                        // 끊김 표시
    assert.doesNotMatch(src, /localStorage\.setItem\('__petsalon_import_snapshot__'/);       // 전체 데이터를 글자로 바꾸지 않는다
  });
});

describe('사진 카드', () => {
  const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js'] });
  const R = App.pages.records;
  const fakeCtx = (charW) => ({ font: 'bold 40px sans-serif', drawn: [], measureText(t) { return { width: t.length * charW * parseFloat(this.font.match(/([\d.]+)px/)[1]) / 40 }; }, fillText(t, x, y) { this.drawn.push({ t, font: this.font }); } });
  test('짧은 글자는 그대로', () => {
    const c = fakeCtx(20); R._fitFill(c, '콩이', 0, 0, 400);
    assert.equal(c.drawn[0].t, '콩이'); assert.equal(c.drawn[0].font, 'bold 40px sans-serif');
  });
  test('조금 넘치면 글자 크기만 줄인다', () => {
    const c = fakeCtx(20); R._fitFill(c, '가'.repeat(25), 0, 0, 400); // 500 > 400 → 80%
    assert.equal(c.drawn[0].t, '가'.repeat(25)); assert.match(c.drawn[0].font, /32\.0px/);
    assert.equal(c.font, 'bold 40px sans-serif'); // 글꼴은 되돌려 놓는다
  });
  test('많이 넘치면 65%까지만 줄이고 끝을 … 으로', () => {
    const c = fakeCtx(20); R._fitFill(c, '가'.repeat(60), 0, 0, 400);
    assert.match(c.drawn[0].font, /26\.0px/); assert.ok(c.drawn[0].t.endsWith('...')); assert.ok(c.drawn[0].t.length < 60);
  });
  test('네컷·2컷은 처음부터 1080px 로 그린다', () => {
    const src = read('js/pages/records.js');
    assert.equal((src.match(/ctx = this\._sharpCanvas\(canvas, W, H\)/g) || []).length, 2);
    const cv = { getContext() { return { setTransform(a) { this.k = a; } }; } };
    const ctx = R._sharpCanvas(cv, 400, 900);
    assert.equal(cv.width, 1080); assert.equal(cv.height, 2430); assert.equal(ctx._logicalW, 400); assert.ok(Math.abs(ctx._scale - 2.7) < 1e-9);
  });
  test('틀을 그린 뒤에는 배율을 푼다 (스티커·덮는 프레임·앞 강아지가 2.7배로 그려지지 않게)', () => {
    const src = read('js/pages/records.js');
    const reset = src.indexOf("if (ctx && ctx._scale && ctx._scale !== 1) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx._scale = 1; }");
    assert.ok(reset > 0);
    assert.ok(reset < src.indexOf('// 덮는 프레임(사진 칸을 투명하게 뚫은 PNG)'), '덮는 프레임보다 먼저');
    assert.ok(reset < src.indexOf('const _drawStickers = async'), '스티커보다 먼저');
  });
  test('코드가 지킬 것들', () => {
    const src = read('js/pages/records.js');
    assert.match(src, /const stale = \(\) => session !== this\._cardSession/);   // 앞 강아지 사진이 새 카드에 안 들어가게
    assert.match(src, /if \(this\._frameTextJob\) await this\._frameTextJob/);    // 프레임 글자 만들기를 기다린다
    assert.match(src, /미결제인데 받을 금액이/);                                  // 0원 미결제 확인
  });
});

describe('그 밖', () => {
  test('저장할 것이 없는 창에는 [저장] 버튼을 숨긴다', () => {
    assert.match(read('js/app.js'), /saveBtn\.style\.display = onSave \? '' : 'none'/);
  });
  test('완료한 예약을 바꾸거나 지우면 마지막 방문일을 다시 계산한다', () => {
    const src = read('js/pages/appointments.js');
    assert.equal((src.match(/_recalcPetLastVisit\(/g) || []).length >= 4, true);
    assert.match(src, /wasCompleted && newStatus !== 'completed'/);
  });
  test('휴대폰 고객 상세 [정보 수정]이 돋보기에 가리지 않는다', () => {
    assert.match(read('css/style.css'), /\.detail-topbar \{ padding-right: 52px; \}/);
  });
});
