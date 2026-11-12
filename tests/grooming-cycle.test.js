// 견종별 권장 미용 주기 + 집에서 관리법 문구
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const App = loadApp({ now: '2026-11-05T10:00:00+09:00' }).App;

describe('getGroomingCycle', () => {
  test('개별 설정이 가장 우선', () => assert.equal(App.getGroomingCycle({ breed: '푸들', groomingCycle: 21 }, 30), 21));
  test('견종 기본값 (별칭 포함)', () => {
    assert.equal(App.getGroomingCycle({ breed: '푸들' }, 30), 28);
    assert.equal(App.getGroomingCycle({ breed: '말티' }, 30), 35);
    assert.equal(App.getGroomingCycle({ breed: '시바' }, 30), 49);
    assert.equal(App.getGroomingCycle({ breed: '프불' }, 30), 56);
  });
  test('믹스견·모르는 견종·견종 없음 → 매장 기준', () => {
    assert.equal(App.getGroomingCycle({ breed: '믹스견' }, 40), 40);
    assert.equal(App.getGroomingCycle({ breed: '' }, 40), 40);
    assert.equal(App.getGroomingCycle({}, 0), 30);
  });
  test('사장님이 바꾼 견종 묶음 값이 기본값보다 우선', () => {
    assert.equal(App.getGroomingCycle({ breed: '푸들' }, 30, { curly: 21 }), 21);
    assert.equal(App.getGroomingCycle({ breed: '말티즈' }, 30, { curly: 21 }), 35);
  });
  test('방문 상태도 같은 주기를 쓴다', () => {
    // 푸들 28일: 마지막 방문 40일 전이면 정상(31일 이내)이 아님
    const d = new Date(); d.setDate(d.getDate() - 40);
    const last = App.formatLocalDate(d);
    assert.notEqual(App.getPetVisitStatus({ breed: '푸들', lastVisitDate: last }, 30), 'normal');
    assert.equal(App.getPetVisitStatus({ breed: '치와와', lastVisitDate: last }, 30), 'normal');
  });
});

describe('getHomeCareAdvice', () => {
  test('병원 권유가 맨 앞 (3개 제한에 안 잘림)', () => {
    const tips = App.getHomeCareAdvice({ skinStatus: ['건조', '각질', '습진'], earStatus: 'dirty', mattingLevel: 'mild' });
    assert.match(tips[0], /동물병원/);
    assert.ok(tips.slice(0, 3).some(t => /습진/.test(t)));
  });
  test('컨디션 좋음만 칭찬, 주의는 중립 문구', () => {
    assert.match(App.getHomeCareAdvice({ condition: 'good' })[0], /컨디션이 좋았어요/);
    assert.match(App.getHomeCareAdvice({ condition: 'caution' })[0], /살펴 주시고/);
    assert.equal(App.getHomeCareAdvice({}).length, 0);
  });
  test('단모종은 슬리커 브러시를 권하지 않음', () => {
    const r = { mattingLevel: 'severe' };
    assert.match(App.getHomeCareAdvice(r, { breed: '푸들' })[0], /슬리커/);
    assert.doesNotMatch(App.getHomeCareAdvice(r, { breed: '치와와' })[0], /슬리커/);
    assert.match(App.getHomeCareAdvice(r)[0], /슬리커/);
  });
  test("'정상'은 문제 항목과 같이 체크되면 무시", () => {
    const tips = App.getHomeCareAdvice({ skinStatus: ['정상', '건조'] });
    assert.equal(tips.length, 1);
    assert.match(tips[0], /보습/);
  });
});
