// 몸무게 구간 가격 계산 (js/app.js — priceBands / calcServicePrice / 초과 kg 요금)
// 기대값은 모두 손으로 계산한 값이다 (코드를 불러 기대값을 만들지 않는다).
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, plain } = require('./helpers/load-app');

const { App } = loadApp();

// 기본 5단계: ~3 · 3~5 · 5~7 · 7~10 · 10kg~ / 10kg 넘으면 1kg당 5,000원(올림) / 1,000원 반올림
const T = () => App.normalizePriceBands(null);
const PRICES = { b1: 30000, b2: 35000, b3: 40000, b4: 50000, b5: 60000 };
const weightSvc = (extra = {}) => ({
  name: '전체미용', category: 'grooming',
  pricing: { mode: 'weight', flat: 0, prices: { ...PRICES }, overKgMode: 'inherit', ...extra },
});
const price = (svc, w, table = T()) => App.calcServicePrice(svc, w, table).price;

describe('구간표 정규화 (normalizePriceBands)', () => {
  test('값이 없으면 기본 5단계 + 10kg 초과 1kg당 5,000원', () => {
    const t = T();
    assert.deepEqual(plain(t.bands), [
      { id: 'b1', upTo: 3 }, { id: 'b2', upTo: 5 }, { id: 'b3', upTo: 7 }, { id: 'b4', upTo: 10 }, { id: 'b5', upTo: null },
    ]);
    assert.deepEqual(plain(t.overKg), { from: 10, perKg: 5000, ceil: true });
    assert.equal(t.rounding, 1000);
    assert.ok(!t.bandsOff, '구간 사용 안 함이 켜져 있으면 안 된다');
  });

  test('뒤섞인 경계는 오름차순 정렬, 같은 경계·같은 id 중복은 하나만', () => {
    const t = App.normalizePriceBands({ bands: [
      { id: 'b3', upTo: 10 }, { id: 'b1', upTo: 5 }, { id: 'b2', upTo: 5 }, { id: 'b1', upTo: 7 }, { id: 'b9', upTo: null },
    ] });
    assert.deepEqual(plain(t.bands), [{ id: 'b1', upTo: 5 }, { id: 'b3', upTo: 10 }, { id: 'b9', upTo: null }]);
  });

  test('열린(마지막) 구간이 없으면 새 id 로 하나 붙이고, 지운 id 는 다시 쓰지 않는다 (nextId)', () => {
    const t = App.normalizePriceBands({ nextId: 8, bands: [{ id: 'b1', upTo: 5 }] });
    assert.deepEqual(plain(t.bands), [{ id: 'b1', upTo: 5 }, { id: 'b8', upTo: null }]);
  });

  test('perKg 가 0 이면 초과 요금 없음(null), 이상한 반올림 단위는 1,000원', () => {
    const t = App.normalizePriceBands({ bands: [{ id: 'b1', upTo: null }], overKg: { from: 10, perKg: 0 }, rounding: 300 });
    assert.equal(t.overKg, null);
    assert.equal(t.rounding, 1000);
  });
});

describe('구간 찾기 (resolveBand, "이하" 규칙)', () => {
  const cases = [
    [3.0, 'b1', '~3kg'], [3.1, 'b2', '3~5kg'], [5, 'b2', '3~5kg'], [7.0, 'b3', '5~7kg'],
    [10.0, 'b4', '7~10kg'], [10.3, 'b5', '10kg~'], [45, 'b5', '10kg~'],
  ];
  for (const [w, id, label] of cases) {
    test(`${w}kg → ${label}`, () => {
      const r = App.resolveBand(T(), w);
      assert.equal(r.band.id, id);
      assert.equal(r.label, label);
    });
  }
  test('몸무게 0·음수·빈 값이면 구간 없음(null)', () => {
    assert.equal(App.resolveBand(T(), 0), null);
    assert.equal(App.resolveBand(T(), -2), null);
    assert.equal(App.resolveBand(T(), ''), null);
  });
});

describe('초과 kg 시작점 (overKgFrom)', () => {
  test('설정값(10)이 마지막 구간 시작(10)과 같으면 10', () => assert.equal(App.overKgFrom(T()), 10));
  test('설정값이 마지막 구간 시작보다 낮으면(8) 마지막 구간 시작(10)으로 올린다', () => {
    assert.equal(App.overKgFrom({ ...T(), overKg: { from: 8, perKg: 5000 } }), 10);
  });
  test('설정값이 더 높으면(12) 그대로 12', () => {
    assert.equal(App.overKgFrom({ ...T(), overKg: { from: 12, perKg: 5000 } }), 12);
  });
  test('초과 요금이 꺼져 있으면 null', () => assert.equal(App.overKgFrom({ ...T(), overKg: null }), null));
});

describe('구간 가격 계산 (calcServicePrice) — 경계값', () => {
  test('3.0kg = 첫 구간 30,000원', () => assert.equal(price(weightSvc(), 3.0), 30000));
  test('3.1kg = 둘째 구간 35,000원', () => assert.equal(price(weightSvc(), 3.1), 35000));
  test('7.0kg = 5~7kg 구간 40,000원', () => assert.equal(price(weightSvc(), 7.0), 40000));
  test('10.0kg = 7~10kg 구간 50,000원, 초과 요금 없음', () => {
    const r = App.calcServicePrice(weightSvc(), 10.0, T());
    assert.equal(r.price, 50000);
    assert.equal(r.over, null);
  });
  test('10.3kg = 마지막 구간 60,000 + 초과 0.3kg→1kg 올림 × 5,000 = 65,000원', () => {
    const r = App.calcServicePrice(weightSvc(), 10.3, T());
    assert.equal(r.base, 60000);
    assert.deepEqual([r.over.kg, r.over.extra], [1, 5000]);
    assert.equal(r.price, 65000);
  });
  test('12.0kg = 60,000 + 2kg × 5,000 = 70,000원 (딱 떨어지면 올리지 않음)', () => assert.equal(price(weightSvc(), 12.0), 70000));
  test('12.01kg = 60,000 + 3kg × 5,000 = 75,000원', () => assert.equal(price(weightSvc(), 12.01), 75000));
  test('몸무게 문자열 "5.2" 도 숫자로 해석 → 40,000원', () => assert.equal(price(weightSvc(), '5.2'), 40000));
});

describe('몸무게 없음 / 사이즈만 있는 반려견', () => {
  test('몸무게도 사이즈도 없으면 needsWeight, 0원', () => {
    const r = App.calcServicePrice(weightSvc(), null, T());
    assert.equal(r.needsWeight, true);
    assert.equal(r.price, 0);
  });
  test('small → 대표 4kg → 3~5kg 35,000원 (bySize)', () => {
    const r = App.calcServicePrice(weightSvc(), 'small', T());
    assert.equal(r.price, 35000);
    assert.equal(r.bySize, true);
  });
  test('medium → 대표 9kg → 7~10kg 50,000원', () => assert.equal(price(weightSvc(), 'medium'), 50000));
  test('large → 대표 20kg → 기본 5단계에선 마지막 구간 60,000원, 몸무게를 모르니 초과 요금 없음', () => {
    const r = App.calcServicePrice(weightSvc(), 'large', T());
    assert.equal(r.price, 60000);
    assert.equal(r.over, null);
  });
  test('40kg 까지 있는 구간표(~10·~20·~30·~40·40~)에서 large → 10~20kg 구간 (맨 끝 구간 아님)', () => {
    const t = App.normalizePriceBands({ bands: [{ id: 'k1', upTo: 10 }, { id: 'k2', upTo: 20 }, { id: 'k3', upTo: 30 }, { id: 'k4', upTo: 40 }, { id: 'k5', upTo: null }], overKg: null });
    const svc = { name: '전체미용', category: 'grooming', pricing: { mode: 'weight', prices: { k1: 40000, k2: 60000, k3: 80000, k4: 100000, k5: 120000 }, overKgMode: 'inherit' } };
    const r = App.calcServicePrice(svc, 'large', t);
    assert.equal(r.bandId, 'k2');
    assert.equal(r.bandLabel, '10~20kg');
    assert.equal(r.price, 60000);
  });
});

describe('서비스별 초과 kg 규칙 (inherit / off / custom)', () => {
  test('inherit: 15kg = 60,000 + 5kg × 5,000 = 85,000원', () => assert.equal(price(weightSvc(), 15), 85000));
  test('off: 15kg 이어도 60,000원', () => assert.equal(price(weightSvc({ overKgMode: 'off' }), 15), 60000));
  test('custom 12kg부터 7,000원: 15kg = 60,000 + 3 × 7,000 = 81,000원', () => {
    assert.equal(price(weightSvc({ overKgMode: 'custom', overKgCustom: { from: 12, perKg: 7000 } }), 15), 81000);
  });
  test('custom 시작 5kg(마지막 구간 시작보다 낮음) → 10kg 로 올림: 12kg = 60,000 + 2 × 7,000 = 74,000원', () => {
    const svc = weightSvc({ overKgMode: 'custom', overKgCustom: { from: 5, perKg: 7000 } });
    assert.equal(App.getOverKgRule(svc, T()).from, 10);
    assert.equal(price(svc, 12), 74000);
  });
  test('custom 시작 5kg 이어도 8kg(가벼운 구간)에는 붙지 않음 → 50,000원', () => {
    assert.equal(price(weightSvc({ overKgMode: 'custom', overKgCustom: { from: 5, perKg: 7000 } }), 8), 50000);
  });
  test('custom 인데 kg당 금액이 0 이면 규칙 없음 → 15kg 60,000원', () => {
    const svc = weightSvc({ overKgMode: 'custom', overKgCustom: { from: 12, perKg: 0 } });
    assert.equal(App.getOverKgRule(svc, T()), null);
    assert.equal(price(svc, 15), 60000);
  });
  test('초과 요금은 반올림하지 않는다: 1kg × 7,500원 = 7,500원 (10.5kg = 67,500원)', () => {
    assert.equal(price(weightSvc({ overKgMode: 'custom', overKgCustom: { from: 10, perKg: 7500 } }), 10.5), 67500);
  });
  test('반올림 단위 10,000원이어도 1kg당 5,500원은 그대로: 11kg = 60,000 + 5,500 = 65,500원', () => {
    const t = App.normalizePriceBands({ bands: T().bands, overKg: { from: 10, perKg: 5500, ceil: true }, rounding: 10000 });
    assert.equal(t.rounding, 10000);
    const r = App.calcServicePrice(weightSvc(), 11, t);
    assert.equal(r.over.extra, 5500);
    assert.equal(r.price, 65500);
  });
  test('올림 끔(ceil:false): 10.34kg → 0.3kg × 5,000 = 1,500원 → 61,500원', () => {
    const t = App.normalizePriceBands({ bands: T().bands, overKg: { from: 10, perKg: 5000, ceil: false } });
    assert.equal(price(weightSvc(), 10.34, t), 61500);
  });
  test('가게 초과 요금이 꺼진 구간표(overKg null): 15kg = 60,000원', () => {
    assert.equal(price(weightSvc(), 15, { ...T(), overKg: null }), 60000);
  });
});

describe('기본 초과 규칙 (defaultOverKgMode)', () => {
  test('미용 코스 → 가게 기본(inherit)', () => assert.equal(App.defaultOverKgMode({ name: '전체미용', category: 'grooming' }), 'inherit'));
  test('카테고리 없음 → 미용 코스로 보고 inherit', () => assert.equal(App.defaultOverKgMode({ name: '가위컷' }), 'inherit'));
  test('이름은 보지 않는다: 미용 코스 목욕/스파/약욕 → inherit', () => {
    for (const name of ['목욕', '스파 목욕', '약욕']) assert.equal(App.defaultOverKgMode({ name, category: 'grooming' }), 'inherit', name);
  });
  test('추가 옵션·단독 케어 → off', () => {
    assert.equal(App.defaultOverKgMode({ name: '발톱', category: 'addon' }), 'off');
    assert.equal(App.defaultOverKgMode({ name: '귀청소', category: 'care' }), 'off');
  });
});

describe('단일가 / 무료 / 구간 사용 안 함', () => {
  const flat = (extra = {}) => ({ name: '가위컷', category: 'grooming', pricing: { mode: 'flat', flat: 20000, prices: {}, overKgMode: 'inherit', ...extra } });
  test('단일가 + 가게 기본 규칙 → 15kg 이어도 20,000원 (단일가엔 가게 초과 요금 안 붙음)', () => assert.equal(price(flat(), 15), 20000));
  test('단일가 + 이 서비스만(custom 10kg, 5,000원): 13kg = 20,000 + 3 × 5,000 = 35,000원', () => {
    assert.equal(price(flat({ overKgMode: 'custom', overKgCustom: { from: 10, perKg: 5000 } }), 13), 35000);
  });
  test('무료 서비스 → 0원, free 표시, 초과 요금 없음', () => {
    const r = App.calcServicePrice({ name: '얼굴컷', pricing: { mode: 'flat', flat: 0, free: true } }, 20, T());
    assert.equal(r.price, 0);
    assert.equal(r.free, true);
    assert.equal(r.over, null);
  });
  test('구간 사용 안 함(bandsOff): 구간 가격 서비스 → 첫 구간 30,000원, 가게 초과 요금 없음 (15kg)', () => {
    const r = App.calcServicePrice(weightSvc(), 15, { ...T(), bandsOff: true });
    assert.equal(r.mode, 'flat');
    assert.equal(r.price, 30000);
  });
  test('bandsOff + custom 12kg/7,000원: 15kg = 30,000 + 3 × 7,000 = 51,000원 (마지막 구간 하한 적용 안 함)', () => {
    const svc = weightSvc({ overKgMode: 'custom', overKgCustom: { from: 12, perKg: 7000 } });
    assert.equal(price(svc, 15, { ...T(), bandsOff: true }), 51000);
  });
  test('bandsOff + 단일가가 적혀 있으면 단일가 우선 (flat 45,000원)', () => {
    assert.equal(price(weightSvc({ flat: 45000 }), 5, { ...T(), bandsOff: true }), 45000);
  });
});

describe('빈 칸 대체 가격 (fallback) — 가격이 있으면 0원이 되지 않는다', () => {
  const sparse = (prices) => ({ name: '전체미용', category: 'grooming', pricing: { mode: 'weight', prices, overKgMode: 'inherit' } });
  test('빈 3~5kg 칸 → 앞 구간 30,000원 (prev)', () => {
    const r = App.calcServicePrice(sparse({ b1: 30000, b3: 40000, b5: 60000 }), 4, T());
    assert.deepEqual([r.price, r.fallback], [30000, 'prev']);
  });
  test('앞이 모두 비면 뒤 구간 40,000원 (next)', () => {
    const r = App.calcServicePrice(sparse({ b3: 40000 }), 2, T());
    assert.deepEqual([r.price, r.fallback], [40000, 'next']);
  });
  test('구간 id 가 하나도 안 맞으면(bandsAt 없음) 최저가 38,000원 (min)', () => {
    const r = App.calcServicePrice(sparse({ x9: 45000, x8: 38000 }), 6, T());
    assert.deepEqual([r.price, r.fallback], [38000, 'min']);
  });
  test('가격 칸 자체가 비었으면 0원 (가격 없음)', () => assert.equal(price(sparse({}), 6), 0));
});

describe('구간 id 불일치 + bandsAt 스냅샷', () => {
  // 다른 기기가 구간표를 b6~b8 로 바꿨는데 서비스는 아직 옛 구간(b1~b5) 가격만 가진 상태
  const newTable = () => App.normalizePriceBands({
    bands: [{ id: 'b6', upTo: 4 }, { id: 'b7', upTo: 8 }, { id: 'b8', upTo: null }], overKg: { from: 8, perKg: 5000 },
  });
  const snapSvc = () => weightSvc({ bandsAt: T().bands.map(b => ({ id: b.id, upTo: b.upTo })) });
  test('6kg → 저장된 옛 경계로 5~7kg(b3) 40,000원', () => {
    const r = App.calcServicePrice(snapSvc(), 6, newTable());
    assert.deepEqual([r.price, r.bandId], [40000, 'b3']);
  });
  test('12kg → 옛 경계 마지막 구간 60,000 + (초과 시작 max(8,10)=10) 2kg × 5,000 = 70,000원', () => {
    assert.equal(price(snapSvc(), 12, newTable()), 70000);
  });
  test('bandsAt 이 없으면 최저가(30,000원)로 내려간다', () => {
    assert.equal(price(weightSvc(), 6, newTable()), 30000);
  });
});

describe('가격 설명 문구 (describeBandPrice)', () => {
  const d = (svc, w, t = T()) => App.describeBandPrice(App.calcServicePrice(svc, w, t), w);
  test('구간 가격', () => assert.equal(d(weightSvc(), 5.2), '5.2kg → 5~7kg 구간 40,000원'));
  test('초과 요금 포함', () => assert.equal(d(weightSvc(), 10.3), '10.3kg → 10kg~ 구간 60,000원 + 초과 1kg × 5,000원 = 65,000원'));
  test('빈 칸 → 앞 구간 가격 표시', () => {
    const svc = { name: 'x', category: 'grooming', pricing: { mode: 'weight', prices: { b1: 30000 }, overKgMode: 'inherit' } };
    assert.equal(d(svc, 4), '4kg → 3~5kg 구간 (앞 구간 가격) 30,000원');
  });
  test('사이즈 기준', () => {
    assert.equal(App.describeBandPrice(App.calcServicePrice(weightSvc(), 'small', T()), null), '사이즈 기준 → 3~5kg 구간 35,000원');
  });
  test('단일가 + 이 서비스만 초과 요금', () => {
    const svc = { name: '가위컷', pricing: { mode: 'flat', flat: 20000, overKgMode: 'custom', overKgCustom: { from: 10, perKg: 5000 } } };
    assert.equal(d(svc, 13), '13kg → 기본 20,000원 + 초과 3kg × 5,000원 = 35,000원');
  });
  test('단일가(초과 없음)는 빈 문자열', () => {
    assert.equal(d({ name: '가위컷', pricing: { mode: 'flat', flat: 20000 } }, 5), '');
  });
});

describe('목록 가격 글자 (formatServicePrice)', () => {
  test('몸무게 모르는 구간 가격 → "3만~6만"', () => assert.equal(App.formatServicePrice(weightSvc(), T()), '3만~6만'));
  test('"~부터" 표시를 고른 경우 끝에 ~', () => assert.equal(App.formatServicePrice(weightSvc({ fromPrice: true }), T()), '3만~6만~'));
  test('몸무게를 알면 그 가격 "40,000원"', () => assert.equal(App.formatServicePrice(weightSvc(), T(), 5.2), '40,000원'));
  test('단일가 "20,000원", fromPrice → "20,000원~"', () => {
    assert.equal(App.formatServicePrice({ pricing: { mode: 'flat', flat: 20000 } }, T()), '20,000원');
    assert.equal(App.formatServicePrice({ pricing: { mode: 'flat', flat: 20000, fromPrice: true } }, T()), '20,000원~');
  });
  test('무료 서비스 → "무료"', () => assert.equal(App.formatServicePrice({ pricing: { mode: 'flat', flat: 0, free: true } }, T()), '무료'));
  test('구간 가격이 모두 비어 있으면 "가격 미입력"', () => {
    assert.equal(App.formatServicePrice({ pricing: { mode: 'weight', prices: {} } }, T()), '가격 미입력');
  });
  test('단일가 0원인데 무료 표시가 없으면 "가격 미입력" (무료 아님)', () => {
    assert.equal(App.formatServicePrice({ pricing: { mode: 'flat', flat: 0 } }, T()), '가격 미입력');
  });
  test('단일가 칸이 비어 있으면(빈 문자열) "가격 미입력"', () => {
    assert.equal(App.formatServicePrice({ pricing: { mode: 'flat', flat: '' } }, T()), '가격 미입력');
  });
  test('가격 0 + fromPrice 여도 "가격 미입력" 뒤에 ~ 를 붙이지 않는다', () => {
    assert.equal(App.formatServicePrice({ pricing: { mode: 'flat', flat: 0, fromPrice: true } }, T()), '가격 미입력');
  });
});

describe('구버전 가격 → 구간 가격 (legacyToPricing)', () => {
  const v182 = (name, category, s, m, l) => ({ name, category, priceSmall: s, priceMedium: m, priceLarge: l });
  test('미용 코스(초과 요금 붙음): 7kg 미만 = 소형, 7~10·10kg~ = 중형', () => {
    const p = App.legacyToPricing(v182('전체미용', 'grooming', 30000, 40000, 55000), T());
    assert.equal(p.mode, 'weight');
    assert.equal(p.overKgMode, 'inherit');
    assert.deepEqual(plain(p.prices), { b1: 30000, b2: 30000, b3: 30000, b4: 40000, b5: 40000 });
  });
  test('목욕(미용 코스)도 가게 기본: 마지막 구간(10kg~) = 중형가 (kg당 요금이 위에 더해짐)', () => {
    const p = App.legacyToPricing(v182('목욕', 'grooming', 20000, 25000, 35000), T());
    assert.equal(p.overKgMode, 'inherit');
    assert.deepEqual(plain(p.prices), { b1: 20000, b2: 20000, b3: 20000, b4: 25000, b5: 25000 });
  });
  test('추가 옵션도 초과 요금 없음 → 마지막 구간 = 대형가', () => {
    const p = App.legacyToPricing(v182('엉킴', 'addon', 5000, 8000, 10000), T());
    assert.deepEqual(plain(p.prices), { b1: 5000, b2: 5000, b3: 5000, b4: 8000, b5: 10000 });
  });
  test('초과 요금 없는 3단계표(~7·7~15·15kg~): 15kg~ = 대형가', () => {
    const t3 = App.normalizePriceBands({ bands: [{ id: 'b1', upTo: 7 }, { id: 'b2', upTo: 15 }, { id: 'b3', upTo: null }], overKg: null });
    const p = App.legacyToPricing(v182('전체미용', 'grooming', 30000, 40000, 55000), t3);
    assert.deepEqual(plain(p.prices), { b1: 30000, b2: 40000, b3: 55000 });
  });
  test('세 값이 같으면 단일가', () => {
    const p = App.legacyToPricing(v182('발톱', 'addon', 5000, 5000, 5000), T());
    assert.deepEqual([p.mode, p.flat], ['flat', 5000]);
  });
  test('0원 칸은 있는 값으로 채운다 (중형만 40,000 → 단일가 40,000)', () => {
    const p = App.legacyToPricing(v182('전체미용', 'grooming', 0, 40000, 0), T());
    assert.deepEqual([p.mode, p.flat], ['flat', 40000]);
  });
});

describe('구버전 호환 가격 쓰기 (applyLegacyPrices)', () => {
  test('대표 5/10/20kg 가격 = 35,000 / 50,000 / 60,000+10kg×5,000=110,000, 서명·bandsAt 저장', () => {
    const svc = App.applyLegacyPrices(weightSvc(), T());
    assert.deepEqual([svc.priceSmall, svc.priceMedium, svc.priceLarge], [35000, 50000, 110000]);
    assert.equal(svc.pricing.legacySig, '35000|50000|110000');
    assert.equal(svc.pricing.bandsAt.length, 5);
  });
  test('단일가는 세 값 모두 단일가, bandsAt 없음', () => {
    const svc = App.applyLegacyPrices({ name: '가위컷', pricing: { mode: 'flat', flat: 20000, bandsAt: [{ id: 'b1', upTo: 3 }] } }, T());
    assert.deepEqual([svc.priceSmall, svc.priceMedium, svc.priceLarge], [20000, 20000, 20000]);
    assert.equal(svc.pricing.bandsAt, undefined);
  });
});

describe('구버전 기기 가격 수정 반영 (adoptLegacyEdit)', () => {
  const synced = () => App.applyLegacyPrices(weightSvc(), T()); // 서명 35000|50000|110000
  test('소형 +5,000 → 7kg 미만 구간(b1~b3)만 +5,000', () => {
    const svc = synced(); svc.priceSmall = 40000;
    App.adoptLegacyEdit(svc, T());
    assert.deepEqual(plain(svc.pricing.prices), { b1: 35000, b2: 40000, b3: 45000, b4: 50000, b5: 60000 });
    assert.deepEqual(plain(svc.pricing.prevBeforeLegacy.prices), PRICES);
    assert.equal(svc.pricing.legacySig, '40000|50000|110000');
  });
  test('중형 +10,000 → 7~10kg·10kg~ 구간 +10,000 (초과 요금 붙는 서비스)', () => {
    const svc = synced(); svc.priceMedium = 60000;
    App.adoptLegacyEdit(svc, T());
    assert.deepEqual(plain(svc.pricing.prices), { b1: 30000, b2: 35000, b3: 40000, b4: 60000, b5: 70000 });
  });
  test('대형 +20,000 → 마지막 구간만 +20,000', () => {
    const svc = synced(); svc.priceLarge = 130000;
    App.adoptLegacyEdit(svc, T());
    assert.deepEqual(plain(svc.pricing.prices), { ...PRICES, b5: 80000 });
  });
  test('대형 −30,000 → 마지막 구간은 앞 구간(50,000)보다 싸지지 않는다', () => {
    const svc = synced(); svc.priceLarge = 80000;
    App.adoptLegacyEdit(svc, T());
    assert.equal(svc.pricing.prices.b5, 50000);
  });
  test('단일가: 세 값을 같이 +5,000 → 단일가 25,000', () => {
    const svc = App.applyLegacyPrices({ name: '가위컷', category: 'grooming', pricing: { mode: 'flat', flat: 20000, overKgMode: 'inherit' } }, T());
    svc.priceSmall = svc.priceMedium = svc.priceLarge = 25000;
    App.adoptLegacyEdit(svc, T());
    assert.deepEqual([svc.pricing.mode, svc.pricing.flat], ['flat', 25000]);
  });
  test('단일가: 소형만 고치면 구간 가격으로 바뀐다 (7kg 미만 25,000 / 나머지 20,000)', () => {
    const svc = App.applyLegacyPrices({ name: '가위컷', category: 'grooming', pricing: { mode: 'flat', flat: 20000, overKgMode: 'inherit' } }, T());
    svc.priceSmall = 25000;
    App.adoptLegacyEdit(svc, T());
    assert.equal(svc.pricing.mode, 'weight');
    assert.deepEqual(plain(svc.pricing.prices), { b1: 25000, b2: 25000, b3: 25000, b4: 20000, b5: 20000 });
  });
  test('결과가 0원 이하가 되면 그대로 둔다 (단일가 20,000 에서 −25,000)', () => {
    const svc = App.applyLegacyPrices({ name: '가위컷', category: 'grooming', pricing: { mode: 'flat', flat: 20000, overKgMode: 'inherit' } }, T());
    svc.priceSmall = svc.priceMedium = svc.priceLarge = -5000;
    App.adoptLegacyEdit(svc, T());
    assert.equal(svc.pricing.flat, 20000);
  });
});

describe('몸무게 오타 확인 기준 (weightConfirmThreshold / needsWeightConfirm)', () => {
  const T40 = () => App.normalizePriceBands({ bands: [{ id: 'k1', upTo: 10 }, { id: 'k2', upTo: 20 }, { id: 'k3', upTo: 30 }, { id: 'k4', upTo: 40 }, { id: 'k5', upTo: null }], overKg: null });
  test('기본 5단계(마지막 구간 10kg~) → max(30, 15) = 30kg', () => assert.equal(App.weightConfirmThreshold(T()), 30));
  test('40kg 구간표(마지막 구간 40kg~) → 60kg', () => assert.equal(App.weightConfirmThreshold(T40()), 60));
  test('구간 사용 안 함 → Infinity, 묻지 않음', () => {
    const t = { ...T(), bandsOff: true };
    assert.equal(App.weightConfirmThreshold(t), Infinity);
    assert.equal(App.needsWeightConfirm(52, 5.2, t), false);
  });
  test('프로필 없음: 기본표 52kg 은 묻고 25kg 은 안 묻는다', () => {
    assert.equal(App.needsWeightConfirm(52, null, T()), true);
    assert.equal(App.needsWeightConfirm(25, 0, T()), false);
  });
  test('프로필 5.2kg 에 52 입력(오타) → 묻는다, 40kg 표에서도', () => {
    assert.equal(App.needsWeightConfirm(52, 5.2, T()), true);
    assert.equal(App.needsWeightConfirm(52, 5.2, T40()), true);
  });
  test('40kg 표 가게의 45kg 아이(프로필 45) → 안 묻는다', () => assert.equal(App.needsWeightConfirm(45, 45, T40()), false));
  test('프로필과 50% 넘게 차이: 5.2 → 0.52(줄어듦) 묻고, 5.2 → 7(35%) 안 묻는다', () => {
    assert.equal(App.needsWeightConfirm(0.52, 5.2, T()), true);
    assert.equal(App.needsWeightConfirm(7, 5.2, T()), false);
  });
  test('기준 kg 을 넘으면 프로필과 같아도 묻는다 (기본표 35kg)', () => assert.equal(App.needsWeightConfirm(35, 35, T()), true));
});

describe('견종 맞춤 서비스 (serviceMatchesBreed)', () => {
  test('이름에 견종이 들어 있으면 true', () => assert.equal(App.serviceMatchesBreed('말티즈 전체미용', '말티즈'), true));
  test("괄호 안 '·' 항목 중 하나와 같으면 true", () => assert.equal(App.serviceMatchesBreed('스포팅 (말티즈·푸들)', '푸들'), true));
  test("견종이 '토이 푸들'이면 괄호 안 '푸들'도 맞음", () => assert.equal(App.serviceMatchesBreed('가위컷 (푸들·비숑)', '토이 푸들'), true));
  test('맞지 않거나 견종이 없으면 false', () => {
    assert.equal(App.serviceMatchesBreed('스포팅 (말티즈·푸들)', '시츄'), false);
    assert.equal(App.serviceMatchesBreed('전체미용', ''), false);
    assert.equal(App.serviceMatchesBreed('전체미용', null), false);
  });
});

describe('가격 미입력 메뉴', () => {
  test("구간 가격이 비어 있으면 describeBandPrice 가 '0원'을 쓰지 않는다", () => {
    const svc = { name: '전체미용', category: 'grooming', pricing: { mode: 'weight', prices: {}, overKgMode: 'inherit' } };
    const r = App.calcServicePrice(svc, 5.2, T());
    const s = App.describeBandPrice(r, 5.2);
    assert.ok(!s.includes('0원'), s);
    assert.ok(s.includes('가격 미입력'), s);
  });
});
