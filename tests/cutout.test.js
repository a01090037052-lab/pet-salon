// 입체 꾸미기(강아지 앞으로): 확신도→알파, 강아지 네모, 몸통 선, 넓히기·깎기, 붓 둘레, 더하기·빼기, 앞층 고르기
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp({ files: ['js/app.js', 'js/pages/records.js', 'js/cutout.js'] });
const C = App.cutout;
const R = App.pages.records;

// w×h 판에 [x,y,rw,rh] 자리만 255
function box(w, h, x, y, rw, rh) {
  const a = new Uint8Array(w * h);
  for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) a[yy * w + xx] = 255;
  return a;
}
const plain = (o) => JSON.parse(JSON.stringify(o));
const count = (a, th = 128) => a.reduce((n, v) => n + (v >= th ? 1 : 0), 0);

describe('확신도 → 알파', () => {
  test('0.35 아래 0, 0.65 위 255, 가운데 반쯤', () => {
    const a = C.confToAlpha(new Float32Array([0, 0.35, 0.5, 0.65, 1]));
    assert.deepEqual([...a], [0, 0, 128, 255, 255]);
  });
});

describe('강아지 네모·몸통 선 처음 자리', () => {
  test('네모는 0~1 비율', () => {
    const bb = C.bbox(box(100, 50, 20, 10, 40, 30), 100, 50);
    assert.deepEqual(plain(bb), { x: 0.2, y: 0.2, w: 0.4, h: 0.6 });
  });
  test('아무것도 없으면 null', () => assert.equal(C.bbox(new Uint8Array(16), 4, 4), null));
  test('선은 가로, 네모 위에서 40%, 위쪽이 앞', () => {
    const l = C.defaultLine({ x: 0.2, y: 0.2, w: 0.4, h: 0.5 });
    assert.equal(l.a, 0); assert.ok(Math.abs(l.x - 0.4) < 1e-9); assert.ok(Math.abs(l.y - 0.4) < 1e-9);
  });
  test('돌리기는 90도씩, 앞쪽 바꾸기는 180도', () => {
    let l = { a: 0, x: 0.5, y: 0.5 };
    l = C.rotateLine(l); assert.equal(l.a, 90); assert.ok(C.isVertical(l));
    l = C.flipLine(l); assert.equal(l.a, 270); assert.ok(C.isVertical(l));
    l = C.rotateLine(l); assert.equal(l.a, 0); assert.ok(!C.isVertical(l));
  });
});

describe('몸통 선 그라데이션', () => {
  const pl = { ox: 100, oy: 50, k: 2, iw: 200, ih: 300 };
  test('가로선 위쪽이 앞: 위 끝이 보이는 쪽', () => {
    const g = C.lineGrad({ a: 0, x: 0.5, y: 0.5 }, pl, 10);
    assert.deepEqual(plain(g), { x0: 300, y0: 345, x1: 300, y1: 355 });
  });
  test('앞쪽 바꾸면 반대로', () => {
    const g = C.lineGrad({ a: 180, x: 0.5, y: 0.5 }, pl, 10);
    assert.deepEqual(plain(g), { x0: 300, y0: 355, x1: 300, y1: 345 });
  });
  test('세로선 오른쪽이 앞', () => {
    const g = C.lineGrad({ a: 90, x: 0.25, y: 0.5 }, pl, 10);
    assert.deepEqual(plain(g), { x0: 205, y0: 350, x1: 195, y1: 350 });
  });
});

describe('경계 넓히기·깎기·부드럽게', () => {
  const w = 20, h = 20, A = box(w, h, 5, 5, 10, 10);
  test('바깥쪽(+2)은 넓어지고 안쪽(-2)은 좁아진다', () => {
    assert.equal(count(C.growAlpha(A, w, h, 2)), 14 * 14);
    assert.equal(count(C.growAlpha(A, w, h, -2)), 6 * 6);
    assert.equal(count(C.growAlpha(A, w, h, 0)), 100);
  });
  test('부드럽게는 중간 값이 생기고 원본은 그대로', () => {
    const P = C.processMask(A, w, h, 0, 4);
    assert.ok(P.some(v => v > 0 && v < 255));
    assert.equal(count(A), 100);
  });
});

describe('＋/－ 붓은 둘레만', () => {
  const w = 100, h = 10;
  test('붓 둘레 가중치: 가까우면 255, 멀면 0', () => {
    const Wt = C.strokeWeight([10, 5, 20, 5], w, h, 5);
    assert.equal(Wt[5 * w + 15], 255);
    assert.equal(Wt[5 * w + 90], 0);
  });
  test('더하기: 모델이 배경 전체를 골라도 붓 둘레만 더해진다', () => {
    const A = new Uint8Array(w * h), S = new Uint8Array(w * h).fill(255);
    const out = C.applyStroke(A, S, C.strokeWeight([10, 5, 20, 5], w, h, 5), 1);
    assert.equal(out[5 * w + 15], 255);
    assert.equal(out[5 * w + 80], 0);
  });
  test('빼기: 붓 둘레의 고른 곳만 빠진다', () => {
    const A = new Uint8Array(w * h).fill(255), S = new Uint8Array(w * h).fill(255);
    const out = C.applyStroke(A, S, C.strokeWeight([10, 5, 20, 5], w, h, 5), -1);
    assert.equal(out[5 * w + 15], 0);
    assert.equal(out[5 * w + 80], 255);
  });
  test('손 붓: 지우기·되살리기(원래 투명도까지만)', () => {
    const A = new Uint8Array(w * h).fill(255);
    C.dab(A, w, h, 50, 5, 3, null);
    assert.equal(A[5 * w + 50], 0);
    const orig = new Uint8Array(w * h).fill(200);
    C.dab(A, w, h, 50, 5, 3, orig);
    assert.equal(A[5 * w + 50], 200);
  });
});

describe('앞층 고르기', () => {
  test('사진이 바뀐 칸·끈 칸은 그리지 않는다', () => {
    R._cardFront = [{ src: 'a', mask: 'm', on: true }, { src: 'b', mask: 'm', on: false }, { src: 'c', mask: 'm', on: true }, null];
    const f = C.frontsFor(['a', 'b', 'x', 'd']);
    assert.ok(f[0]); assert.equal(f[1], null); assert.equal(f[2], null); assert.equal(f[3], null);
    R._cardFront = [];
  });
});

describe('떼어 낸 사진 발끝 찾기 (바닥 그림자)', () => {
  test('아래 투명 여백은 무시하고 실제 발끝 줄·발 폭', () => {
    const w = 10, h = 20, A = new Uint8Array(w * h);
    for (let y = 2; y <= 15; y++) for (let x = 3; x <= 6; x++) A[y * w + x] = 255; // 몸
    for (let x = 2; x <= 8; x++) A[15 * w + x] = 255; // 발 줄 (넓게)
    const f = R._footLine(A, w, h);
    assert.equal(f.foot, 16 / 20);
    assert.equal(f.l, 0.2); assert.equal(f.r, 0.9);
  });
  test('흐린 털(알파 40 이하)은 발로 치지 않는다', () => {
    const w = 4, h = 4, A = new Uint8Array(16);
    A[1 * 4 + 1] = 255; A[3 * 4 + 1] = 30;
    assert.equal(R._footLine(A, w, h).foot, 2 / 4);
  });
  test('다 투명하면 null', () => assert.equal(R._footLine(new Uint8Array(9), 3, 3), null));
});

describe('천 색으로 한 번에 지우기', () => {
  test('지운 결과의 투명도가 마스크, 원래 투명한 곳은 그대로', () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 0, 1, 2, 3, 255, 1, 2, 3, 200]);
    assert.deepEqual([...C.keyMask(rgba, new Uint8Array([255, 255, 100]))], [0, 255, 100]);
  });
  test('천 색이 고를수록 덜 지우고, 시작 정도는 14~60', () => {
    assert.equal(C.keyTol(0), 14);
    assert.equal(C.keyTol(20), 34);
    assert.equal(C.keyTol(200), 60);
  });
});

describe('천 색 찍어서 고르기', () => {
  // 4×4: 왼쪽 두 줄 초록 천, 오른쪽 두 줄 갈색 털
  const w = 4, h = 4, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const x = i % w, q = i * 4; rgba.set(x < 2 ? [0, 200, 0, 255] : [120, 80, 40, 255], q); }
  test('누른 곳 둘레 평균 색', () => {
    const one = new Uint8ClampedArray([10, 20, 30, 255]);
    assert.deepEqual(plain(C.pickColor(one, 1, 1, 0.4, 0.2)), [10, 20, 30]);
    const c = C.pickColor(rgba, w, h, 0, 0); // 둘레 3×3 안: 초록 6칸 + 갈색 3칸
    assert.deepEqual(plain(c), [40, 160, 13]);
  });
  test('사진 밖·투명한 곳은 null', () => {
    assert.equal(C.pickColor(rgba, w, h, -1, 2), null);
    assert.equal(C.pickColor(rgba, w, h, 4, 0), null);
    assert.equal(C.pickColor(new Uint8ClampedArray(16), 2, 2, 0, 0), null);
  });
});

describe('얼굴만 남기기', () => {
  test('턱 선은 옆으로 그어야, 둘레는 크게 그려야 선이 된다', () => {
    assert.equal(C.faceFromPath([10, 50, 12, 52], 'cut', 100, 100), null); // 점이 너무 적다
    assert.equal(C.faceFromPath([50, 10, 51, 50, 52, 90], 'cut', 100, 100), null); // 세로
    assert.equal(C.faceFromPath([10, 10, 12, 11, 13, 12], 'lasso', 100, 100), null); // 살짝 닿음
    const cut = C.faceFromPath([10, 50, 50, 55, 90, 50], 'cut', 100, 100);
    assert.equal(cut.k, 'cut'); assert.equal(cut.cp.length, 18); assert.ok(cut.p.length > cut.cp.length);
    const las = C.faceFromPath([20, 20, 80, 20, 80, 80, 20, 80, 20, 22], 'lasso', 100, 100);
    assert.equal(las.k, 'lasso'); assert.equal(las.cp.length, 28);
  });
  test('마스크에 곱한다: 턱 선 아래·둘레 밖은 지워지고 원래 지운 곳은 그대로', () => {
    const w = 60, h = 60, A = box(w, h, 0, 0, 30, 60); // 왼쪽 반만 강아지
    const cut = R._faceMask({ k: 'cut', p: [0, 30, 60, 30] }, w, h);
    const out = C.applyFaces(A, [cut]);
    assert.equal(out[10 * w + 10], 255); // 턱 위 강아지
    assert.equal(out[50 * w + 10], 0); // 턱 아래
    assert.equal(out[10 * w + 45], 0); // 원래 배경
    assert.equal(A[50 * w + 10], 255); // 원래 마스크는 그대로
    const las = R._faceMask({ k: 'lasso', p: [5, 5, 25, 5, 25, 25, 5, 25] }, w, h);
    const both = C.applyFaces(A, [cut, las]);
    assert.equal(both[15 * w + 15], 255); assert.equal(both[15 * w + 0], 0); // 둘레 밖 (경계는 몇 칸 부드럽게)
    assert.deepEqual([...C.applyFaces(A, [])], [...A]);
  });
});
