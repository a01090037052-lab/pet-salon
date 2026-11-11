// 길이 옵션 (미용 코스의 클리퍼 길이별 고정 추가금 — 예: 3mm 0원 · 7F 10,000원)
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./helpers/load-app');

const { App } = loadApp();

describe('lengthOptionsOf — 미용 코스의 길이 옵션 정리', () => {
  test('이름·추가금 그대로, 빈 추가금은 0원, 글자 숫자는 숫자로', () => {
    const svc = { category: 'grooming', lengthOptions: [{ name: '3mm', price: 0 }, { name: ' 7F ', price: '10000' }, { name: '4F', price: '' }] };
    assert.deepEqual(plain(App.lengthOptionsOf(svc)), [{ name: '3mm', price: 0 }, { name: '7F', price: 10000 }, { name: '4F', price: 0 }]);
  });
  test('분류가 없으면 미용 코스로 본다', () => {
    assert.equal(App.lengthOptionsOf({ lengthOptions: [{ name: '7F', price: 10000 }] }).length, 1);
  });
  test('이름 없음·같은 이름 두 번·음수·글자 값은 버린다', () => {
    const svc = { category: 'grooming', lengthOptions: [{ name: '', price: 5000 }, { name: '7F', price: 10000 }, { name: '7F', price: 1 }, { name: '10F', price: -1 }, { name: '13F', price: 'abc' }, null] };
    assert.deepEqual(plain(App.lengthOptionsOf(svc)), [{ name: '7F', price: 10000 }]);
  });
  test('미용 코스가 아니거나 길이 옵션이 없으면 빈 목록', () => {
    assert.equal(App.lengthOptionsOf({ category: 'style', lengthOptions: [{ name: '7F', price: 1 }] }).length, 0);
    assert.equal(App.lengthOptionsOf({ category: 'grooming' }).length, 0);
    assert.equal(App.lengthOptionsOf({ category: 'grooming', lengthOptions: [] }).length, 0);
    assert.equal(App.lengthOptionsOf(null).length, 0);
  });
});

describe('apptLengthOf — 예약에 저장된 길이', () => {
  test('그 코스가 예약에 있으면 길이를 돌려준다', () => {
    const appt = { serviceIds: [1, 5], length: { serviceId: 1, name: '7F', price: 10000 } };
    assert.deepEqual(plain(App.apptLengthOf(appt)), { serviceId: 1, name: '7F', price: 10000 });
  });
  test('코스를 뺐거나 길이가 없으면 null', () => {
    assert.equal(App.apptLengthOf({ serviceIds: [5], length: { serviceId: 1, name: '7F', price: 10000 } }), null);
    assert.equal(App.apptLengthOf({ serviceIds: [1] }), null);
    assert.equal(App.apptLengthOf({ serviceIds: [1], length: null }), null);
    assert.equal(App.apptLengthOf({ serviceIds: [1], length: { serviceId: 1, name: ' ', price: 1 } }), null);
  });
  test('문자열 id 도 같은 코스로 본다, 이상한 값은 0원', () => {
    assert.deepEqual(plain(App.apptLengthOf({ serviceIds: ['1'], length: { serviceId: 1, name: '4F', price: 'x' } })), { serviceId: 1, name: '4F', price: 0 });
  });
});

describe('apptServiceNames — 길이는 그 코스 이름 뒤에', () => {
  const map = { 1: '전체미용', 5: '테디컷' };
  test('전체미용 7F, 테디컷', () => {
    assert.equal(App.apptServiceNames({ serviceIds: [1, 5], length: { serviceId: 1, name: '7F', price: 10000 } }, map), '전체미용 7F, 테디컷');
  });
  test('길이 없는 예약은 그대로', () => {
    assert.equal(App.apptServiceNames({ serviceIds: [1, 5] }, map), '전체미용, 테디컷');
  });
  test('지워진 코스도 저장된 이름 뒤에 길이', () => {
    const appt = { serviceIds: [9], serviceNames: ['전체미용'], length: { serviceId: 9, name: '4F', price: 5000 } };
    assert.equal(App.apptServiceNames(appt, {}), '전체미용 4F');
    assert.equal(App.apptServiceNames({ serviceIds: [9], length: { serviceId: 9, name: '4F', price: 5000 } }, {}), '삭제된 서비스 4F');
  });
});
