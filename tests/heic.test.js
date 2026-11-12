// 아이폰 원본 사진(HEIC): 크롬에서 읽을 수 있게 바꾸는 길 — HEIC가 아닌 사진은 절대 건드리지 않는다
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp, ROOT } = require('./helpers/load-app');

const { App } = loadApp({ files: ['js/app.js'] });

describe('HEIC 알아보기 (isHeicFile)', () => {
  test('종류나 이름으로 HEIC·HEIF를 알아본다', () => {
    assert.equal(App.isHeicFile({ type: 'image/heic', name: 'a' }), true);
    assert.equal(App.isHeicFile({ type: 'image/heif', name: 'a' }), true);
    assert.equal(App.isHeicFile({ type: '', name: 'IMG_0001.HEIC' }), true);
    assert.equal(App.isHeicFile({ type: '', name: 'x.heif' }), true);
  });
  test('JPG·PNG·빈 값은 HEIC가 아니다', () => {
    for (const f of [{ type: 'image/jpeg', name: 'a.jpg' }, { type: 'image/png', name: 'heic.png' }, null, undefined, {}]) assert.equal(App.isHeicFile(f), false);
  });
});

describe('readableImage', () => {
  test('HEIC가 아니면 받은 파일 그대로 (변환기를 부르지 않는다)', async () => {
    const f = { type: 'image/jpeg', name: 'a.jpg' };
    assert.equal(await App.readableImage(f), f);
    assert.equal(App._heicMod, undefined);
  });
  test('빈 값도 그대로', async () => { assert.equal(await App.readableImage(undefined), undefined); });
});

describe('앱에 넣어 둔 변환기', () => {
  test('고정 버전 파일과 라이선스가 있다', () => {
    const js = fs.readFileSync(path.join(ROOT, 'js/vendor/heic-to-1.6.7.js'), 'utf8');
    assert.match(js, /export\{\w+ as heicTo/);
    assert.ok(fs.existsSync(path.join(ROOT, 'js/vendor/heic-to-LICENSE.txt')));
  });
  test('변환기 일꾼(worker)이 보안 설정에 막히지 않는다', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /worker-src 'self' blob:/);
  });
  test('사진·그림을 읽는 곳이 모두 변환을 거친다', () => {
    const count = (f) => (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/App\.readableImage\(/g) || []).length;
    // 기록 사진 · 사진 카드 칸(프레임 배경 사진 포함) · 내 스티커 · 꾸미기 배경 이미지
    assert.equal(count('js/pages/records.js'), 4);
    assert.equal(count('js/pages/pets.js'), 1);       // 반려견 사진
    assert.equal(count('js/pages/settings.js'), 1);   // 매장 로고 (설정·프레임 만들기)
    assert.equal(count('js/bg-library.js'), 1);       // 새 배경 추가
  });
});

describe('변환기 보관 (sw.js)', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  test('앱 버전이 바뀌어도 지우지 않는 따로 보관함', () => {
    assert.match(sw, /const VENDOR_CACHE = 'petsalon-vendor-v1'/);
    assert.match(sw, /k !== VENDOR_CACHE/);
    assert.match(sw, /url\.pathname\.includes\('\/js\/vendor\/'\)/);
  });
});

describe('늦게 끝난 사진이 엉뚱한 곳에 들어가지 않게', () => {
  test('기록 사진: 폼 표와 칸 번호를 확인', () => {
    const rec = fs.readFileSync(path.join(ROOT, 'js/pages/records.js'), 'utf8');
    assert.match(rec, /const current = \(\) => formToken === this\._formPhotoToken && seq === photoSeq\[field\]/);
  });
  test('반려견 사진: 저장은 바꾸기를 기다리고, 닫힌 폼에는 넣지 않는다', () => {
    const pets = fs.readFileSync(path.join(ROOT, 'js/pages/pets.js'), 'utf8');
    assert.match(pets, /await this\._pendingPetPhoto/);
    assert.match(pets, /input\.isConnected && seq === this\._petPhotoSeq/);
  });
});

describe('파일 앞부분으로 HEIC 알아보기 (sniffHeic)', () => {
  const heic = fs.readFileSync(path.join(__dirname, 'fixtures/tiny.heic'));
  test('이름을 .jpg 로 바꾸고 종류가 image/jpeg 여도 HEIC로 안다', async () => {
    const f = new Blob([heic], { type: 'image/jpeg' }); f.name = 'IMG_1.jpg';
    assert.equal(await App.sniffHeic(f), true);
  });
  test('진짜 JPG·PNG·짧은 파일은 HEIC가 아니다', async () => {
    const jpg = new Blob([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1, 1])], { type: 'image/jpeg' });
    const png = new Blob([Buffer.from([0x89, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72])], { type: 'image/png' });
    assert.equal(await App.sniffHeic(jpg), false);
    assert.equal(await App.sniffHeic(png), false);
    assert.equal(await App.sniffHeic(new Blob([Buffer.from('abc')])), false);
  });
  test('AVIF(크롬이 직접 읽음)는 HEIC로 보지 않는다', async () => {
    const avif = Buffer.from([0, 0, 0, 28, 102, 116, 121, 112, 97, 118, 105, 102, 0, 0, 0, 0]);
    assert.equal(await App.sniffHeic(new Blob([avif])), false);
  });
});

describe('HEIC를 직접 읽는 브라우저 기억 (_heicNative)', () => {
  const { ctx } = loadApp({ files: ['js/app.js'] });
  const A = require('node:vm').runInContext('App', ctx);
  const heic = fs.readFileSync(path.join(__dirname, 'fixtures/tiny.heic'));
  test('상표를 돌려준다 (heic) · JPG는 빈 값', async () => {
    assert.equal(await App.heicBrand(new Blob([heic])), 'heic');
    assert.equal(await App.heicBrand(new Blob([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1])])), '');
  });
  test('mif1 파일이 바로 열려도 "이 브라우저는 HEIC를 읽는다"고 기억하지 않는다', async () => {
    const mif1 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 109, 105, 102, 49, 0, 0, 0, 0, 109, 105, 102, 49, 97, 118, 105, 102]);
    ctx.createImageBitmap = async () => ({ close() {} }); // '브라우저가 바로 연다'고 가정
    const f = new Blob([mif1]);
    assert.equal(await A.readableImage(f), f);
    assert.equal(A._heicNative, undefined);
    const h = new Blob([heic]);
    assert.equal(await A.readableImage(h), h);
    assert.equal(A._heicNative, true);
  });
});
