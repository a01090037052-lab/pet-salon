// 앱 코드(js/app.js 등)를 node:vm 컨텍스트에 그대로 올리고, 브라우저·IndexedDB 는 최소한의 가짜로 바꾼다.
// 앱 파일은 절대 수정하지 않는다 — 여기서 읽어서 실행만 한다.
'use strict';
// node --test 로 직접 돌려도 한국 시간으로 계산되게
if (!process.env.TZ) process.env.TZ = 'Asia/Seoul';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..', '..');
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// 메모리 DB — DB.getSetting / getAll / get / update / getByIndex / getAllLight 만 흉내낸다.
function createFakeDB(seed = {}) {
  const settings = Object.assign({}, clone(seed.settings || {}));
  const stores = {};
  for (const [k, arr] of Object.entries(seed.stores || {})) stores[k] = clone(arr);
  const writes = [];
  const DB = {
    mode: seed.mode || 'local',
    writes,
    _settings: settings,
    _stores: stores,
    async getSetting(key) { return clone(settings[key]); },
    async setSetting(key, value) { settings[key] = clone(value); writes.push({ op: 'setSetting', key }); },
    async getAll(store) { return clone(stores[store] || []); },
    async getAllLight(store) { return clone(stores[store] || []); },
    async get(store, id) { return clone((stores[store] || []).find(x => x.id === id)); },
    async getByIndex(store, idx, val) { return clone((stores[store] || []).filter(x => x[idx] === val)); },
    async update(store, obj) {
      const arr = stores[store] || (stores[store] = []);
      const i = arr.findIndex(x => x.id === obj.id);
      if (i >= 0) arr[i] = clone(obj); else arr.push(clone(obj));
      writes.push({ op: 'update', store, id: obj.id });
    },
    async add(store, obj) {
      const arr = stores[store] || (stores[store] = []);
      const id = arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
      arr.push(clone({ ...obj, id }));
      writes.push({ op: 'add', store, id });
      return id;
    },
    async delete(store, id) {
      const arr = stores[store] || [];
      const i = arr.findIndex(x => x.id === id);
      if (i >= 0) arr.splice(i, 1);
      writes.push({ op: 'delete', store, id });
    },
    // 테스트용: 저장된 값 직접 보기
    peek(store, id) { return clone((stores[store] || []).find(x => x.id === id)); },
    serviceWrites() { return writes.filter(w => w.op === 'update' && w.store === 'services').length; },
  };
  return DB;
}

function makeDate(nowIso) {
  if (!nowIso) return Date;
  const NOW = new Date(nowIso).getTime();
  class FakeDate extends Date {
    constructor(...args) { if (args.length === 0) super(NOW); else super(...args); }
    static now() { return NOW; }
  }
  return FakeDate;
}

/**
 * @param {object} opts
 *   db: createFakeDB 결과 (없으면 빈 DB)
 *   now: 'YYYY-MM-DDTHH:mm:ss' — new Date()/Date.now() 를 이 시각으로 고정 (로컬=KST)
 *   files: 추가로 올릴 파일 (기본: js/app.js 만)
 *   prepaid: true 면 js/db.js 의 정액권(Prepaid) 부분만 올린다 (DB 는 위의 가짜 DB 를 그대로 쓴다)
 */
function loadApp(opts = {}) {
  const DB = opts.db || createFakeDB();
  const noop = () => {};
  const fakeEl = () => null;
  const storage = {};
  const ctx = {
    console: { log: noop, info: noop, warn: noop, error: console.error },
    DB,
    Date: makeDate(opts.now),
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    },
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    document: {
      getElementById: fakeEl, querySelector: fakeEl, querySelectorAll: () => [],
      addEventListener: noop, createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop }),
      body: { appendChild: noop, classList: { add: noop, remove: noop } },
    },
    location: { protocol: 'file:', hash: '' },
    history: { state: null, pushState: noop, back: noop },
    matchMedia: () => ({ matches: false }),
    addEventListener: noop,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const files = opts.files || ['js/app.js'];
  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  if (opts.prepaid) {
    // db.js 전체를 올리면 진짜 IndexedDB 용 DB 가 가짜 DB 를 가린다 → 정액권 블록만 잘라 실행
    const src = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
    const at = src.indexOf('const Prepaid = {');
    if (at < 0) throw new Error('js/db.js 에서 const Prepaid 를 찾지 못했습니다');
    vm.runInContext(src.slice(at), ctx, { filename: 'js/db.js#Prepaid' });
  }
  const App = vm.runInContext('App', ctx);
  const Prepaid = opts.prepaid ? vm.runInContext('Prepaid', ctx) : undefined;
  // 화면 출력 함수는 기록만 한다
  const toasts = [];
  App.showToast = (msg, type) => { toasts.push({ msg: String(msg), type }); };
  const modals = [];
  App.showModal = (o) => { modals.push(o); };
  return { App, DB, ctx, toasts, modals, Prepaid };
}

// vm 컨텍스트에서 만든 객체는 프로토타입이 달라 deepStrictEqual 이 실패한다 → 일반 객체로 바꿔 비교
const plain = (v) => clone(v);

module.exports = { loadApp, createFakeDB, plain, ROOT };
