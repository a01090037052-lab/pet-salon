// 사진 포함 백업 (DB.exportAllBlob) — 사진을 한 장씩 조각으로 붙여 만든 파일이
// 예전 방식(exportAll → JSON.stringify 한 번)과 똑같은 JSON 으로 읽히는지 본다. 복원 코드는 그 모양을 읽는다.
'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadDB(stores) {
  const ctx = { console, Blob, Date, JSON, Promise, Object, Math, Number, String, Array, TextDecoder, ReadableStream };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'db.js'), 'utf8');
  const DB = vm.runInContext(src + '\n;DB', ctx);
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  DB.mode = 'idb';
  DB.getAll = async (s) => (stores[s] || []).map(clone);
  DB.get = async (s, id) => clone((stores[s] || []).find(x => x.id === id));
  DB._photoIds = async () => (stores.photos || []).map(p => p.id);
  // FileReader 가 없는 node 에서 같은 결과(data URL)를 만든다
  DB._blobToDataUrl = async (b) => `data:${b.type};base64,` + Buffer.from(await b.arrayBuffer()).toString('base64');
  ctx.Blob = Blob; // instanceof Blob 이 같은 생성자를 보게
  return DB;
}

const jpeg = (txt) => new Blob([Buffer.from(txt)], { type: 'image/jpeg' });
const STORES = () => ({
  customers: [{ id: 1, name: '김손님', phone: '010-1111-2222', memo: '따옴표 " 와 줄바꿈\n 테스트' }],
  pets: [{ id: 1, customerId: 1, name: '콩이', photo: 'data:image/jpeg;base64,' + 'A'.repeat(2000) }],
  services: [], appointments: [],
  records: [{ id: 5, petId: 1, date: '2026-11-01', photoBefore: 'data:image/jpeg;base64,QUJD' }],
  settings: [{ key: 'shopName', value: '펫살롱' }, { key: '_autoBackupBeforeImport', value: { big: 1 } }, { key: 'security', value: { pin: 1 } }],
  photos: [
    { id: 1, type: 'pet-profile', ownerId: 1, data: jpeg('사진1') },
    { id: 2, type: 'record-before', ownerId: 5, data: jpeg('photo-two') },
    { id: 3, type: 'legacy', ownerId: 5, data: 'data:image/jpeg;base64,OLD' },
  ],
  prepaid: [{ id: 1, customerId: 1, type: 'charge', amount: 1000, credit: 1000 }],
  syncQueue: [{ id: 1, store: 'pets' }],
});
const strip = (o) => { const c = { ...o }; delete c._exportDate; delete c._photosLast; delete c._photoCount; return c; };

describe('사진 포함 백업을 조각으로 만들기 (exportAllBlob)', () => {
  test('예전 exportAll + JSON.stringify 와 같은 내용 (날짜 제외)', async () => {
    const DB = loadDB(STORES());
    const oldJson = JSON.parse(JSON.stringify(await DB.exportAll({ excludePhotos: false })));
    const blob = await DB.exportAllBlob();
    const parsed = JSON.parse(await blob.text());
    assert.deepEqual(strip(parsed), strip(oldJson));
    assert.equal(typeof parsed._exportDate, 'string');
    assert.equal(parsed._excludePhotos, false);
    assert.equal(parsed._photosLast, true, '사진이 맨 뒤에 있다는 표시 (조각 읽기용)');
    assert.equal(parsed._photoCount, 3);
    assert.equal(parsed.photos.length, 3);
    assert.equal(parsed.photos[0].data, 'data:image/jpeg;base64,' + Buffer.from('사진1').toString('base64'));
    assert.equal(parsed.syncQueue, undefined, '기기 전용 스토어는 빠진다');
    assert.deepEqual(parsed.settings.map(s => s.key), ['shopName'], '내부 설정(_autoBackup·security)은 빠진다');
  });

  test('복원 검사(validateBackup)를 통과한다', async () => {
    const DB = loadDB(STORES());
    const parsed = JSON.parse(await (await DB.exportAllBlob()).text());
    assert.equal(DB.validateBackup(parsed), null);
  });

  test('사진·데이터가 없어도 올바른 JSON', async () => {
    const DB = loadDB({});
    const parsed = JSON.parse(await (await DB.exportAllBlob()).text());
    assert.deepEqual(parsed.photos, []);
    assert.deepEqual(parsed.customers, []);
  });

  test('진행 상황을 사진 한 장마다 알린다', async () => {
    const DB = loadDB(STORES());
    const seen = [];
    await DB.exportAllBlob({ onProgress: (i, t) => seen.push(`${i}/${t}`) });
    assert.deepEqual(seen, ['0/3', '1/3', '2/3', '3/3']);
  });

  test('크기 어림: 사진 수와 base64 크기', async () => {
    const DB = loadDB(STORES());
    const est = await DB.estimatePhotoBackup();
    assert.equal(est.count, 3);
    const b1 = Buffer.from('사진1').length, b2 = Buffer.from('photo-two').length;
    assert.equal(est.bytes, Math.ceil(b1 * 4 / 3) + 200 + Math.ceil(b2 * 4 / 3) + 200 + 'data:image/jpeg;base64,OLD'.length + 200);
  });
});

// 조각으로 읽기 (DB.readBackupFile) — 사진 포함 큰 파일을 폰 메모리에 한 번에 올리지 않는다
describe('백업 파일 조각으로 읽기 (readBackupFile)', () => {
  const drain = async (next) => { const out = []; let p; while ((p = await next()) !== null) out.push(p); return out; };
  test('새 모양 파일: 사진 없는 데이터 + 사진을 한 장씩', async () => {
    const DB = loadDB(STORES());
    const blob = await DB.exportAllBlob();
    const { data, photoStream } = await DB.readBackupFile(blob);
    assert.deepEqual(data.photos, []);
    assert.equal(data._photosLast, true);
    assert.equal(data._photoCount, 3);
    assert.equal(data.customers[0].memo, '따옴표 " 와 줄바꿈\n 테스트');
    assert.equal(DB.validateBackup(data), null);
    const photos = await drain(photoStream);
    assert.deepEqual(photos.map(p => p.id), [1, 2, 3]);
    assert.equal(photos[1].data, 'data:image/jpeg;base64,' + Buffer.from('photo-two').toString('base64'));
    assert.equal(await photoStream(), null, '끝난 뒤에도 null');
  });
  test('아주 작은 조각(7바이트)으로 들어와도 같다 — 표시·줄이 조각 경계에 걸릴 때', async () => {
    const DB = loadDB(STORES());
    const text = await (await DB.exportAllBlob()).text();
    const bytes = Buffer.from(text);
    const file = { stream() { let i = 0; return new ReadableStream({ pull(c) { if (i >= bytes.length) return c.close(); c.enqueue(bytes.subarray(i, i + 7)); i += 7; } }); } };
    const { data, photoStream } = await DB.readBackupFile(file);
    assert.equal(data.customers.length, 1);
    assert.deepEqual((await drain(photoStream)).map(p => p.id), [1, 2, 3]);
  });
  test('옛 모양 파일(사진이 중간에): 통째로 읽고 photoStream 은 없다', async () => {
    const DB = loadDB(STORES());
    const old = JSON.stringify(await DB.exportAll({ excludePhotos: false }));
    const { data, photoStream } = await DB.readBackupFile(new Blob([old]));
    assert.equal(photoStream, null);
    assert.equal(data.photos.length, 3);
    assert.equal(data.prepaid.length, 1, '사진 뒤에 오는 스토어도 그대로');
  });
  test('사진 제외 백업(photos 없음·[])도 그대로', async () => {
    const DB = loadDB(STORES());
    const light = JSON.stringify(await DB.exportAll({ excludePhotos: true }));
    const { data, photoStream } = await DB.readBackupFile(new Blob([light]));
    assert.equal(photoStream, null);
    assert.deepEqual(data.photos, []);
  });
  test('사진이 0장인 새 모양 파일: 첫 호출에 바로 끝', async () => {
    const DB = loadDB({ customers: [{ id: 1, name: '김' }], pets: [], services: [] });
    const { data, photoStream } = await DB.readBackupFile(await DB.exportAllBlob());
    assert.equal(data._photoCount, 0);
    assert.equal(await photoStream(), null);
  });
});
