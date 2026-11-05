// 금액·전화번호·문자 템플릿·반려견 기준 표시 함수
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp();

describe('금액 표시', () => {
  test('formatCurrency: 1,234,567원 / null·NaN → 0원', () => {
    assert.equal(App.formatCurrency(1234567), '1,234,567원');
    assert.equal(App.formatCurrency(null), '0원');
    assert.equal(App.formatCurrency('abc'), '0원');
  });
  test('formatManwon: 1만 원 이상 1,000원 단위면 "만", 아니면 원', () => {
    assert.equal(App.formatManwon(45000), '4.5만');
    assert.equal(App.formatManwon(10000), '1만');
    assert.equal(App.formatManwon(123000), '12.3만');
    assert.equal(App.formatManwon(15500), '15,500원');
    assert.equal(App.formatManwon(6000), '6,000원');
    assert.equal(App.formatManwon(0), '-');
  });
  test('formatPriceShort: 0 이면 빈 문자열, 아니면 "30,000원"', () => {
    assert.equal(App.formatPriceShort(0), '');
    assert.equal(App.formatPriceShort(30000), '30,000원');
  });
  test('formatKg: 소수 첫째 자리 반올림 (5.25 → 5.3, 10 → 10)', () => {
    assert.equal(App.formatKg(5.25), '5.3');
    assert.equal(App.formatKg(10), '10');
  });
});

describe('전화번호', () => {
  const cases = [
    ['01012345678', '010-1234-5678'],
    ['+82 10-1234-5678', '010-1234-5678'],
    ['0212345678', '02-1234-5678'],
    ['021234567', '02-123-4567'],
    ['05051234567', '0505-123-4567'],
    ['050512345678', '0505-1234-5678'],
    ['0311234567', '031-123-4567'],
  ];
  for (const [input, out] of cases) test(`formatPhone(${input}) → ${out}`, () => assert.equal(App.formatPhone(input), out));
  test('형식이 맞지 않으면 입력 그대로, 빈 값은 "-"', () => {
    assert.equal(App.formatPhone('abc'), 'abc');
    assert.equal(App.formatPhone(''), '-');
  });
  test('phoneDigits: +82 → 0 으로 시작하는 국내 형식', () => {
    assert.equal(App.phoneDigits('+82-10-1234-5678'), '01012345678');
    assert.equal(App.phoneDigits('+82 2 123 4567'), '021234567');
    assert.equal(App.phoneDigits('010-1234-5678'), '01012345678');
  });
});

describe('문자 템플릿 (fillSmsTemplate)', () => {
  test('변수 채우기 + 고객명이 비면 "보호자"', () => {
    assert.equal(App.fillSmsTemplate('{고객명}님, {반려견명} 예약 {날짜}', { 반려견명: '콩이', 날짜: '11월 5일' }), '보호자님, 콩이 예약 11월 5일');
  });
  test('넘기지 않은 변수는 지우고 겹친 공백 정리', () => {
    assert.equal(App.fillSmsTemplate('{반려견명} {시점} 미용 예약', { 반려견명: '콩이' }), '콩이 미용 예약');
  });
  test('지운 변수 뒤 " ." 는 "." 로', () => {
    assert.equal(App.fillSmsTemplate('{반려견명} 맡겨주셔서 감사합니다 {시점}.', { 반려견명: '콩이' }), '콩이 맡겨주셔서 감사합니다.');
  });
  test('전화번호가 비면 끝의 "문의:" 줄을 지운다', () => {
    assert.equal(App.fillSmsTemplate('감사합니다\n문의: {전화번호}', { 전화번호: '' }), '감사합니다');
    assert.equal(App.fillSmsTemplate('감사합니다 (문의: {전화번호})', { 전화번호: '' }), '감사합니다');
  });
  test('전화번호가 있으면 "문의:" 줄을 남긴다', () => {
    assert.equal(App.fillSmsTemplate('감사합니다\n문의: {전화번호}', { 전화번호: '010-1234-5678' }), '감사합니다\n문의: 010-1234-5678');
  });
  test('값 속 "$&" 는 특수문자로 해석되지 않는다', () => {
    assert.equal(App.fillSmsTemplate('{고객명}님', { 고객명: '$&김' }), '$&김님');
  });
});

describe('반려견 가격 기준', () => {
  test('getPetSizeType: 사이즈 우선, 없으면 7kg 미만 소형 / 15kg 미만 중형 / 그 이상 대형', () => {
    assert.equal(App.getPetSizeType({ size: 'large', weight: 3 }), 'large');
    assert.equal(App.getPetSizeType({ weight: 6.9 }), 'small');
    assert.equal(App.getPetSizeType({ weight: 7 }), 'medium');
    assert.equal(App.getPetSizeType({ weight: 15 }), 'large');
    assert.equal(App.getPetSizeType({}), null);
  });
  test('getPetPriceBasis: 몸무게(숫자) → 없으면 사이즈 → 둘 다 없으면 null', () => {
    assert.equal(App.getPetPriceBasis({ weight: '5.5', size: 'large' }), 5.5);
    assert.equal(App.getPetPriceBasis({ size: 'medium' }), 'medium');
    assert.equal(App.getPetPriceBasis({}), null);
  });
});
