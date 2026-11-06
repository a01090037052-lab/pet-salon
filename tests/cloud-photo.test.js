// 클라우드 사진 용량 어림·오래 안 온 반려견 사진 정리 계획 (App.estimateCloudPhotoUsage / planOldPetPhotoCleanup)
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/load-app');

const { App } = loadApp();
const rec = (o) => Object.assign({ id: 1, petId: 1, date: '2026-01-01' }, o);

describe('클라우드 사진 용량 어림', () => {
  test('전·후 사진 칸 수 × 평균 + 사진 있는 반려견 × 평균 (5장 미만이면 기본 평균)', () => {
    const records = [rec({ id: 1, photoBeforeId: 11, photoAfterId: 12 }), rec({ id: 2, photoAfterId: 21, photo3Id: 99 }), rec({ id: 3 })];
    const pets = [{ id: 1, photoId: 5 }, { id: 2 }];
    const u = App.estimateCloudPhotoUsage(records, pets, null);
    assert.equal(u.recordPhotos, 3); // photo3 는 클라우드에 안 올라간다
    assert.equal(u.petPhotos, 1);
    assert.equal(u.bytes, 3 * App.CLOUD_PHOTO_DEFAULT_AVG.rec + App.CLOUD_PHOTO_DEFAULT_AVG.pet);
  });
  test('측정 평균을 쓰고, 클라우드에서 뺀 같은 사진은 세지 않는다 (새 사진이면 다시 센다)', () => {
    const stats = { rec: [10, 1000000], pet: [5, 200000] }; // 100,000 / 40,000
    const records = [
      rec({ id: 1, photoBeforeId: 11, _cloudPhotoOff: { photoBefore: 11 } }),
      rec({ id: 2, photoBeforeId: 22, _cloudPhotoOff: { photoBefore: 7 } })
    ];
    const u = App.estimateCloudPhotoUsage(records, [{ photoThumb: 'x' }], stats);
    assert.equal(u.recordPhotos, 1);
    assert.equal(u.bytes, 100000 + 40000);
  });
  test('표시: GB 두 자리 · 퍼센트', () => {
    const u = { bytes: 0.31 * App.CLOUD_PHOTO_LIMIT, pct: 31 };
    assert.equal(App.cloudPhotoUsageText(u), '클라우드 사진 약 0.31GB / 1GB (31%)');
  });
});

describe('오래 안 온 반려견 사진 정리 계획', () => {
  const TODAY = '2026-11-06';
  test('2년 넘게 안 온 반려견: 사진 있는 가장 최근 기록만 남기고 나머지 전·후 칸', () => {
    const records = [
      rec({ id: 1, petId: 1, date: '2023-01-01', photoBeforeId: 1, photoAfterId: 2 }),
      rec({ id: 2, petId: 1, date: '2024-05-01', photoAfterId: 3 }),
      rec({ id: 3, petId: 1, date: '2024-06-01' }),                     // 마지막 방문이지만 사진 없음
      rec({ id: 4, petId: 1, date: '2022-01-01', photoBeforeId: 4, _cloudPhotoOff: { photoBefore: 4 } }) // 이미 뺀 것
    ];
    const plan = App.planOldPetPhotoCleanup(records, { 1: { id: 1, lastVisitDate: '2024-06-01' } }, TODAY, null);
    assert.deepEqual([...plan.items.map(i => `${i.recordId}_${i.field}`)].sort(), ['1_photoAfter', '1_photoBefore']);
    assert.equal(plan.bytes, 2 * App.CLOUD_PHOTO_DEFAULT_AVG.rec);
  });
  test('2년 안에 온 반려견은 건드리지 않는다 (마지막 방문일이 없으면 기록 날짜로)', () => {
    const records = [
      rec({ id: 1, petId: 2, date: '2025-01-01', photoBeforeId: 1 }),
      rec({ id: 2, petId: 2, date: '2025-02-01', photoBeforeId: 2 }),
      rec({ id: 3, petId: 3, date: '2024-11-07', photoBeforeId: 3 }),
      rec({ id: 4, petId: 3, date: '2024-11-08', photoBeforeId: 4 })
    ];
    assert.equal(App.planOldPetPhotoCleanup(records, {}, TODAY, null).items.length, 0);
  });
});
