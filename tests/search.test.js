// 찾기 공통 검색어 맞추기 (App.searchMatch / App.toChosung)
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp();

describe('찾기: searchMatch', () => {
  test('빈 검색어는 모두 맞음', () => {
    assert.equal(App.searchMatch('초코', ''), true);
    assert.equal(App.searchMatch('초코', '   '), true);
    assert.equal(App.searchMatch(null, null), true);
  });
  test('대소문자 무시·부분 글자', () => {
    assert.equal(App.searchMatch('Coco 푸들', 'coco'), true);
    assert.equal(App.searchMatch('초코', '코'), true);
    assert.equal(App.searchMatch('초코', '바둑'), false);
  });
  test('초성: ㅊㅋ → 초코, ㅂㄷㅈ → 박도준, 이어진 부분만', () => {
    assert.equal(App.toChosung('박도준 a'), 'ㅂㄷㅈ a');
    assert.equal(App.searchMatch('초코', 'ㅊㅋ'), true);
    assert.equal(App.searchMatch('박도준', 'ㅂㄷㅈ'), true);
    assert.equal(App.searchMatch('박도준', 'ㄷㅈ'), true);
    assert.equal(App.searchMatch('박도준', 'ㅂㅈ'), false); // 떨어진 글자는 아님
    assert.equal(App.searchMatch('콩이', 'ㅊㅋ'), false);
  });
  test('전화 숫자: 하이픈·띄어쓰기 무시', () => {
    assert.equal(App.searchMatch('010-1234-4444', '4444'), true);
    assert.equal(App.searchMatch('010-1234-4444', '010-1234'), true);
    assert.equal(App.searchMatch('010 1234 4444', '010 1234'), true); // 띄어 친 검색어는 낱말별로
    assert.equal(App.searchMatch('01012344444', '010-1234-4444'), true);
    assert.equal(App.searchMatch('010-1234-4444', '5555'), false);
  });
  test('띄어 이어 붙인 목록 검색 글자: 전화 뒷자리와 메모 숫자가 붙지 않는다', () => {
    const listText = '김철수 010-1111-2222 01011112222 3개월 미용 초코 푸들';
    assert.equal(App.searchMatch(listText, '22223'), false);
    assert.equal(App.searchMatch(listText, '2222'), true);
    assert.equal(App.searchMatch(listText, '010-1111'), true);
  });
  test('배열 항목끼리는 숫자가 이어 붙지 않는다', () => {
    assert.equal(App.searchMatch(['5', '010-1234-4444'], '5010'), false);
    assert.equal(App.searchMatch(['초코', null, '010-1234-4444'], '4444'), true);
  });
  test('띄어 쓴 낱말은 모두 맞아야 (AND, 섞어 쓰기)', () => {
    const h = ['박도준', '010-1234-4444', '초코', '푸들'];
    assert.equal(App.searchMatch(h, '초코 푸들'), true);
    assert.equal(App.searchMatch(h, 'ㅊㅋ 4444'), true);
    assert.equal(App.searchMatch(h, '초코 말티즈'), false);
  });
});
