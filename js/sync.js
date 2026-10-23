// ========== 기기 간 동기화 (Firebase Auth + Firestore) ==========
// 원칙: 이 기기의 IndexedDB 가 원본이고 클라우드는 중계소다.
//  - 동기화가 꺼져 있거나 오프라인이면 앱은 예전과 똑같이 동작한다 (모든 훅이 즉시 반환).
//  - 로컬 쓰기 → syncQueue(보낼 편지함)에 쌓임 → 온라인·로그인 시 Firestore 로 일괄 전송.
//  - 다른 기기의 변경 → onSnapshot 리스너(마지막으로 받은 시각 이후만) → 로컬에 반영.
//  - 백엔드를 바꿀 때는 이 파일만 교체하면 된다 (db.js 는 Sync.onLocalWrite / allocId / afterImport 만 안다).
// Firestore 경로: shops/main/{customers|pets|appointments|records|services|settings|expenses}/{id}
//                shops/main/petPhotos/{petId}, shops/main/tombstones/{store}_{id}, shops/main/meta/{shop|devices}
const Sync = {
  SDK_VER: '10.14.1',
  SHOP_ID: 'main',
  STORES: ['customers', 'pets', 'appointments', 'records', 'services', 'settings', 'expenses'],
  ID_STORES: ['customers', 'pets', 'services', 'appointments', 'records', 'expenses'],
  ID_RANGE: 1e9, // 기기 번호마다 id 대역을 나눠 두 기기가 같은 번호를 만들지 않게 한다
  MAX_OPS: 450,  // writeBatch 한도 500 미만
  PENDING_ENABLE_KEY: '__petsalon_sync_pending_enable__',
  // 이 기기에만 의미가 있는 필드 — 올리지 않고, 받아올 때는 로컬 값을 유지한다
  // (photoId 는 이 기기 photos 스토어의 번호라 다른 기기에선 엉뚱한 사진을 가리킨다)
  LOCAL_FIELDS: {
    pets: ['photoId', 'photo', '_photoFromSync'],
    records: ['photoBeforeId', 'photoAfterId', 'photo3Id', 'photo4Id']
  },
  // 동기화하지 않는 설정 키 (기기별 설정). DB._isInternalSetting(_autoBackup*, _sync*, sync) 도 제외된다.
  LOCAL_SETTINGS: new Set(['sync', 'security', 'lastBackupDate', 'petVisitStatsVersion', 'lastIntegrityCheck', 'customFrames']),

  _s: null,            // 'sync' 설정 {enabled, deviceId, deviceNo, shopId, lastPullAt:{}, email}
  _auth: null,
  _fs: null,
  _user: null,
  _sdkPromise: null,
  _sdkError: false,
  _unsubs: [],
  _applyingRemote: false,
  _flushing: false,
  _flushTimer: null,
  _retryTimer: null,
  _backoff: 0,
  _pending: 0,
  _lastSyncAt: null,
  _error: null,
  _fatal: false,       // 권한 거부 등 사용자 조치가 필요한 오류 — 자동 재시도 중단
  _applyChain: Promise.resolve(),
  _idChain: {},
  _lastId: {},
  _pendingPhotos: {},
  _photoSig: {},
  _refreshTimer: null,
  _saveTimer: null,
  _settingsChanged: false,
  _busy: false,
  _connecting: null,
  _progress: null,
  _ptoast: null,

  // ========== 공개 API ==========

  async init() {
    try {
      if (typeof DB === 'undefined' || DB.mode !== 'idb' || typeof SYNC_CONFIG === 'undefined') return;
      window.addEventListener('online', () => { this._emit(); this._kick(); });
      window.addEventListener('offline', () => this._emit());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { this._kick(); if (this._refreshWanted) this._scheduleRefresh(); }
      });
      this._s = (await DB.getSetting('sync')) || null;
      this._photoSig = (await DB.getSetting('_syncPhotoSig')) || {};
      // 리다이렉트 로그인(홈 화면 앱)에서 돌아온 경우 → 연결 마법사 이어서 진행
      let pending = null;
      try { pending = sessionStorage.getItem(this.PENDING_ENABLE_KEY); } catch (_) {}
      if (pending) {
        try { sessionStorage.removeItem(this.PENDING_ENABLE_KEY); } catch (_) {}
        await this._resumeRedirect(pending === '1');
        return;
      }
      if (!this.isEnabled()) { this._emit(); return; }
      await this._refreshPending();
      this._emit();
      await this._connect();
    } catch (e) { this._fail(e); }
  },

  isEnabled() { return !!(this._s && this._s.enabled); },

  // db.js 의 add() 가 새 레코드 id 를 정할 때 호출 — 동기화 중이 아니면 null (기존 autoIncrement 사용)
  allocId(store) {
    try {
      if (!this.isEnabled() || this._s.deviceNo == null || !this.ID_STORES.includes(store) || !DB.db) return Promise.resolve(null);
      const p = (this._idChain[store] || Promise.resolve()).then(() => this._nextId(store));
      this._idChain[store] = p.catch(() => {});
      return p.catch(() => null);
    } catch (_) { return Promise.resolve(null); }
  },

  // db.js 쓰기 훅 (트랜잭션 커밋 후). 절대 throw 하지 않는다.
  onLocalWrite(store, op, id, data) {
    try {
      if (!this.isEnabled() || this._applyingRemote) return;
      if (!this.STORES.includes(store) || id == null) return;
      if (store === 'settings' && this.isLocalOnlySetting(id)) return;
      let payload = null;
      if (op === 'put') {
        payload = this._toRemote(store, data);
        if (!payload) return;
        if (store !== 'settings') payload.id = id; // autoIncrement 로 받은 id 는 원본 객체에 없을 수 있다
      }
      const items = [{ store, op, id, data: payload }];
      if (store === 'pets') {
        const ph = this._petPhotoItem(op, id, data);
        if (ph) items.push(ph);
      }
      this._enqueue(items).then(() => { this._refreshPending(); this._scheduleFlush(); })
        .catch(e => console.warn('Sync enqueue 실패:', e));
    } catch (e) { console.warn('Sync.onLocalWrite 오류 (무시):', e); }
  },

  isLocalOnlySetting(key) {
    return typeof key !== 'string' || this.LOCAL_SETTINGS.has(key) || (DB._isInternalSetting && DB._isInternalSetting(key));
  },

  // 백업 복원(가져오기)·되돌리기 직후 — 이 기기 데이터로 클라우드를 맞춘다
  afterImport() {
    try {
      if (!this.isEnabled()) return;
      this._photoSig = {};
      this.pushAll({ replace: true, progress: true }).catch(e => this._fail(e));
    } catch (e) { console.warn('Sync.afterImport 오류:', e); }
  },

  // 전체 초기화 후 — 'sync' 설정도 지워졌으므로 연결을 끊고 꺼진 상태로 돌아간다
  afterClearAll() {
    try {
      this._stopListeners();
      this._s = null;
      this._photoSig = {};
      this._pending = 0;
      this._emit();
    } catch (_) {}
  },

  getStatus() {
    const online = navigator.onLine !== false;
    const signedIn = !!this._user;
    let state;
    if (!this.isEnabled()) state = 'off';
    else if (!online || this._sdkError) state = 'offline';
    else if (!signedIn) state = 'signin';
    else if (this._error) state = 'error';
    else if (this._pending > 0 || this._flushing) state = 'pending';
    else state = 'synced';
    return {
      state,
      enabled: this.isEnabled(),
      online,
      signedIn,
      email: (this._user && this._user.email) || (this._s && this._s.email) || '',
      pending: this._pending,
      lastSyncAt: this._lastSyncAt || (this._s && this._s.lastSyncAt) || null,
      deviceNo: this._s ? this._s.deviceNo : null,
      error: this._error
    };
  },

  // 동기화 켜기 (연결 마법사)
  async enable() {
    if (this._busy) return;
    this._busy = true;
    try {
      if (DB.mode !== 'idb') { App.showToast('이 모드에서는 동기화를 사용할 수 없습니다.', 'error'); return; }
      if (!navigator.onLine) { App.showToast('인터넷에 연결된 상태에서 켜주세요.', 'error'); return; }
      App.showToast('동기화 준비 중...', 'info', { duration: 2000 });
      // SDK 를 먼저 받아 두면, 아래 확인 버튼 클릭 직후 바로 로그인 팝업을 열 수 있다 (팝업 차단 방지)
      await this._loadSdk();
      const ok = await App.confirm(
        '<strong>기기 간 동기화를 켭니다.</strong><br>' +
        '이 기기와 다른 기기에서 같은 예약·고객·기록을 봅니다. ' +
        '반려견 프로필 사진은 작은 크기로 공유되고 미용 사진은 이 기기에만 남습니다. ' +
        '무료 범위 내에서 동작하며 카드 등록이 없습니다.',
        { okLabel: 'Google 계정으로 연결', danger: false }
      );
      if (!ok) return;
      let user = this._auth.currentUser;
      if (!user) user = await this._signIn(true);
      if (!user) return; // 리다이렉트 중 — 돌아오면 init() 이 이어서 진행
      await this._finishEnable(user);
    } catch (e) {
      this._fail(e, true);
    } finally {
      this._busy = false;
      this._emit();
    }
  },

  // 켜져 있지만 로그인이 풀린 경우 다시 로그인
  async signIn() {
    if (this._busy) return;
    this._busy = true;
    try {
      await this._loadSdk();
      const user = this._auth.currentUser || await this._signIn(false);
      if (!user) return;
      if (!this._acceptUser(user)) return;
      this._fatal = false;
      this._error = null;
      await this._connect();
    } catch (e) {
      this._fail(e, true);
    } finally {
      this._busy = false;
      this._emit();
    }
  },

  // 지금 동기화: 보낼 것 보내고, 받을 것 다시 확인
  async syncNow() {
    try {
      this._fatal = false;
      this._error = null;
      this._backoff = 0;
      if (!this._fs || !this._user) { await this._connect(); return; }
      await this.flush();
      this._startListeners();
      this._emit();
    } catch (e) { this._fail(e, true); }
  },

  async disable() {
    try {
      this._stopListeners();
      if (this._s) {
        this._s.enabled = false;
        this._s.lastPullAt = {};
        await this._saveNow();
      }
      await this._clearQueue();
      this._pending = 0;
      this._error = null;
      this._fatal = false;
      try { if (this._auth) await this._auth.signOut(); } catch (_) {}
      this._user = null;
    } catch (e) {
      console.warn('Sync.disable 오류:', e);
    } finally {
      this._emit();
    }
  },

  // ========== SDK · 인증 ==========

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => { s.remove(); reject(new Error('동기화 모듈을 불러오지 못했습니다 (네트워크 확인)')); };
      document.head.appendChild(s);
    });
  },

  _loadSdk() {
    if (this._fs) return Promise.resolve();
    if (!this._sdkPromise) {
      this._sdkPromise = (async () => {
        const base = `https://www.gstatic.com/firebasejs/${this.SDK_VER}/`;
        if (!window.firebase || !window.firebase.initializeApp) await this._loadScript(base + 'firebase-app-compat.js');
        if (!firebase.auth) await this._loadScript(base + 'firebase-auth-compat.js');
        if (!firebase.firestore) await this._loadScript(base + 'firebase-firestore-compat.js');
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(SYNC_CONFIG.firebase);
        const fs = app.firestore();
        try { fs.settings({ ignoreUndefinedProperties: true, merge: true }); } catch (_) {}
        this._auth = app.auth();
        this._fs = fs;
        this._sdkError = false;
        this._auth.onAuthStateChanged(u => {
          if (!u && this._user) { this._user = null; this._stopListeners(); }
          this._emit();
        });
      })().catch(e => {
        this._sdkPromise = null;
        this._sdkError = true;
        this._emit();
        throw e;
      });
    }
    return this._sdkPromise;
  },

  _isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  },

  async _signIn(forEnable) {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (!this._isStandalone()) {
      try {
        const r = await this._auth.signInWithPopup(provider);
        return r.user;
      } catch (e) {
        const fallback = ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'];
        if (!fallback.includes(e && e.code)) throw e;
      }
    }
    // 홈 화면 앱(iOS)·팝업 차단 → 리다이렉트. 페이지가 이동하므로 돌아와서 이어갈 표시를 남긴다
    try { sessionStorage.setItem(this.PENDING_ENABLE_KEY, forEnable ? '1' : 'signin'); } catch (_) {}
    await this._auth.signInWithRedirect(provider);
    return null;
  },

  async _resumeRedirect(forEnable) {
    try {
      await this._loadSdk();
      const res = await this._auth.getRedirectResult();
      const user = (res && res.user) || this._auth.currentUser;
      if (!user) { this._emit(); if (this.isEnabled()) await this._connect(); return; }
      if (this.isEnabled()) {
        if (this._acceptUser(user)) await this._connect();
        return;
      }
      if (!forEnable) { this._emit(); return; }
      await this._finishEnable(user);
    } catch (e) { this._fail(e, true); }
  },

  _waitAuth() {
    return new Promise(resolve => {
      const off = this._auth.onAuthStateChanged(u => { off(); resolve(u || null); });
    });
  },

  // 처음 연결한 계정과 다른 계정이면 받지 않는다 (서버 규칙도 허용 계정만 통과)
  _acceptUser(user) {
    if (this._s && this._s.email && user.email !== this._s.email) {
      this._error = `처음 연결한 계정(${this._s.email})으로 로그인해주세요.`;
      this._fatal = true;
      try { this._auth.signOut(); } catch (_) {}
      this._user = null;
      this._emit();
      return false;
    }
    return true;
  },

  async _connect() {
    if (this._connecting) return this._connecting;
    this._connecting = (async () => {
      try {
        if (!this.isEnabled()) return;
        if (!navigator.onLine) { this._emit(); return; }
        try { await this._loadSdk(); } catch (e) { console.warn('Sync SDK 로드 실패:', e); return; }
        const user = this._auth.currentUser || await this._waitAuth();
        if (!user) { this._user = null; this._emit(); return; }
        if (!this._acceptUser(user)) return;
        this._user = user;
        this._startListeners();
        this.flush();
      } catch (e) { this._fail(e); }
      finally { this._connecting = null; this._emit(); }
    })();
    return this._connecting;
  },

  _kick() {
    if (!this.isEnabled() || this._fatal) return;
    if (!this._fs || !this._user) { this._connect(); return; }
    this._scheduleFlush(0);
  },

  // ========== 연결 마법사 ==========

  async _finishEnable(user) {
    const s = this._s || {};
    s.deviceId = s.deviceId || this._newDeviceId();
    s.shopId = this.SHOP_ID;
    s.email = user.email;
    s.lastPullAt = {};
    s.enabled = false;
    this._s = s;
    this._user = user;
    this._fatal = false;
    this._error = null;

    const shopRef = this._shop().collection('meta').doc('shop');
    const meta = await shopRef.get(); // 허용되지 않은 계정이면 여기서 permission-denied
    const [nc, nr] = await Promise.all([DB.count('customers'), DB.count('records')]);
    const localHas = (nc + nr) > 0;
    // 클라우드에 실제 데이터가 있는지 확인 (meta 문서만 있고 빈 경우 = 빈 기기가 먼저 켠 경우)
    // 예전엔 meta 존재만 봐서, 빈 컴퓨터가 먼저 켠 뒤 폰을 켜면 "클라우드로 교체"를 먼저 물어 폰 데이터가 비워질 수 있었다.
    let remoteHas = false;
    if (meta.exists) {
      const [rc, rr] = await Promise.all([
        this._shop().collection('customers').limit(1).get(),
        this._shop().collection('records').limit(1).get()
      ]);
      remoteHas = !rc.empty || !rr.empty;
    }
    let mode;
    if (!remoteHas) {
      mode = 'push';
    } else if (!localHas) {
      mode = 'pull';
    } else {
      const useCloud = await App.confirm(
        '이 기기와 클라우드 모두에 데이터가 있습니다.<br><strong>클라우드 데이터로 이 기기를 교체</strong>할까요?<br>' +
        '<small style="color:var(--text-muted)">교체 전 이 기기 데이터는 자동 백업(사진 제외)되어 설정 &gt; 데이터에서 되돌릴 수 있습니다. 이 기기의 미용 사진은 기록과의 연결이 끊길 수 있습니다.</small>',
        { okLabel: '클라우드 데이터로 이 기기 교체', cancelLabel: '다른 방법 선택', danger: false }
      );
      if (useCloud) mode = 'pull';
      else {
        const useLocal = await App.confirm(
          '<strong>이 기기 데이터로 클라우드를 교체</strong>할까요?<br>' +
          '<small style="color:var(--text-muted)">클라우드에만 있던 데이터는 삭제되고, 다른 기기도 이 기기 데이터로 바뀝니다.</small>',
          { okLabel: '이 기기 데이터로 클라우드 교체', cancelLabel: '연결 취소', danger: true }
        );
        if (!useLocal) { this._user = null; try { await this._auth.signOut(); } catch (_) {} return; }
        mode = 'push-replace';
      }
    }

    // 기기 번호 (id 대역) — 데이터를 옮기기 전에 정해 둔다
    if (s.deviceNo == null) s.deviceNo = await this._allocDeviceNo();
    await this._clearQueue();

    if (mode === 'pull') {
      if (localHas) await this._backupLocal();
      await this._clearSyncedLocal();
      await this.pullAll();
    } else {
      await shopRef.set({ createdAt: Date.now(), sourceDeviceId: s.deviceId, email: user.email }, { merge: true });
    }
    s.enabled = true;
    await this._saveNow();
    if (mode !== 'pull') {
      await this.pushAll({ replace: mode === 'push-replace', progress: true });
      // 방금 올린 문서를 리스너가 다시 읽지 않도록 받기 기준 시각을 지금으로 맞춘다 (읽기 한도 보호)
      await this._markPulledToNow();
      await this._saveNow();
    }
    this._startListeners();
    App.showToast(mode === 'pull' ? '클라우드 데이터를 받아왔습니다. 동기화가 켜졌습니다.' : '동기화를 켰습니다.');
    App._dashboardDirty = true;
    if (mode === 'pull') {
      try { if (App.applyShopName) await App.applyShopName(); if (App.applyTheme) await App.applyTheme(); } catch (_) {}
      App.handleRoute();
      if (App.updateBadges) App.updateBadges();
    }
  },

  async _allocDeviceNo() {
    const ref = this._shop().collection('meta').doc('devices');
    const deviceId = this._s.deviceId;
    return this._fs.runTransaction(async t => {
      const snap = await t.get(ref);
      const count = snap.exists ? (snap.data().count || 0) : 0;
      t.set(ref, {
        count: count + 1,
        devices: { [deviceId]: { no: count, at: Date.now(), ua: (navigator.userAgent || '').slice(0, 120) } }
      }, { merge: true });
      return count;
    });
  },

  // 클라우드 교체 전 자동 백업 — settings.js 복원 흐름과 같은 키를 써서 '복원 전 상태로 되돌리기' 로 복구 가능
  async _backupLocal() {
    const currentData = await DB.exportAll({ excludePhotos: true });
    const date = new Date().toISOString();
    await DB.setSetting('_autoBackupBeforeImport', { data: currentData, date, reason: 'before-sync-pull' });
    await DB.setSetting('_autoBackupBeforeImportMeta', {
      date,
      customers: (currentData.customers || []).length,
      records: (currentData.records || []).length,
      photosReplaced: false
    });
  },

  async _clearSyncedLocal() {
    const settings = await DB.getAll('settings');
    const drop = settings.filter(it => !this.isLocalOnlySetting(it.key)).map(it => it.key);
    await new Promise((resolve, reject) => {
      const tx = DB.db.transaction(this.STORES, 'readwrite');
      for (const st of this.ID_STORES) tx.objectStore(st).clear();
      const ss = tx.objectStore('settings');
      drop.forEach(k => ss.delete(k));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    this._lastId = {};
  },

  // 전체 받기 (처음 연결 시 1회) — 컬렉션 전체를 읽는다
  async pullAll() {
    this._progressToast('클라우드에서 받는 중...');
    try {
      for (const store of this.STORES) {
        const snap = await this._col(store).get();
        const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
        await this._applyRemote(store, docs, true);
        this._s.lastPullAt[store] = Math.max(this._s.lastPullAt[store] || 0, this._maxServerAt(docs));
      }
      const ph = await this._col('petPhotos').get();
      const phDocs = ph.docs.map(d => ({ id: d.id, data: d.data() }));
      await this._applyPetPhotos(phDocs);
      this._s.lastPullAt.petPhotos = this._maxServerAt(phDocs);
      this._s.lastPullAt.tombstones = await this._latestServerAt('tombstones');
      this._lastSyncAt = Date.now();
      if (App.migratePetVisitStats) { try { await App.migratePetVisitStats(true); } catch (_) {} }
    } finally {
      this._progressDone();
    }
  },

  // 전체 올리기 — 보낼 편지함에 모두 넣고 flush (중간에 끊겨도 다음에 이어서 보낸다)
  async pushAll({ replace = false, progress = false } = {}) {
    const items = [];
    const localIds = {};
    for (const store of this.STORES) {
      let rows = await DB.getAll(store);
      if (store === 'settings') rows = rows.filter(r => !this.isLocalOnlySetting(r.key));
      localIds[store] = new Set();
      for (const r of rows) {
        const id = store === 'settings' ? r.key : r.id;
        const data = this._toRemote(store, r);
        if (!data) continue;
        localIds[store].add(String(id));
        items.push({ store, op: 'put', id, data });
      }
    }
    localIds.petPhotos = new Set();
    const pets = await DB.getAll('pets');
    for (const p of pets) {
      const it = this._petPhotoItem('put', p.id, p, true);
      if (it) { items.push(it); localIds.petPhotos.add(String(p.id)); }
    }
    if (replace) {
      // 클라우드에만 있는 문서 → 삭제(+tombstone) 로 다른 기기에서도 지워지게 한다
      for (const store of [...this.STORES, 'petPhotos']) {
        const snap = await this._col(store).get();
        snap.docs.forEach(d => {
          if (!localIds[store].has(d.id)) {
            const id = store === 'settings' ? d.id : Number(d.id);
            items.push({ store, op: 'delete', id, data: null });
          }
        });
      }
    }
    for (let i = 0; i < items.length; i += 1000) await this._enqueue(items.slice(i, i + 1000));
    await this._refreshPending();
    if (progress && items.length) this._progress = { total: this._pending, done: 0 };
    await this.flush();
  },

  // ========== 보내기 (outbox) ==========

  _scheduleFlush(delay = 500) {
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this.flush(), delay);
  },

  async flush() {
    if (this._flushing || this._fatal) return;
    if (!this._fs || !this._user || !navigator.onLine) { this._emit(); return; }
    this._flushing = true;
    this._emit();
    const FV = firebase.firestore.FieldValue;
    try {
      for (;;) {
        const rows = await this._queuePeek(400);
        if (!rows.length) break;
        const batch = this._fs.batch();
        const done = [];
        let ops = 0;
        for (const row of rows) {
          const need = row.op === 'delete' ? 2 : 1;
          if (ops + need > this.MAX_OPS) break;
          const ref = this._col(row.store).doc(String(row.id));
          if (row.op === 'put') {
            let data = row.data;
            if (row.store === 'petPhotos') data = await this._buildPetPhoto(row.id, row.ts);
            if (!data) { done.push(row.qid); continue; }
            batch.set(ref, { ...data, _serverAt: FV.serverTimestamp() });
          } else {
            batch.set(this._col('tombstones').doc(`${row.store}_${row.id}`), {
              store: row.store, id: row.id, _updatedAt: row.ts, _deviceId: this._s.deviceId, _serverAt: FV.serverTimestamp()
            });
            batch.delete(ref);
          }
          ops += need;
          done.push(row.qid);
        }
        if (ops > 0) {
          try {
            await this._withTimeout(batch.commit(), 60000);
          } catch (e) {
            if (e && e.code === 'invalid-argument') {
              // 한 건의 이상한 데이터 때문에 편지함 전체가 막히지 않도록 한 건씩 보내고 거부된 것만 버린다
              await this._commitOneByOne(rows.filter(r => done.includes(r.qid)));
            } else throw e;
          }
        }
        await this._queueRemove(done);
        if (this._progress) {
          this._progress.done += done.length;
          this._progressToast(`업로드 ${Math.min(this._progress.done, this._progress.total)}/${this._progress.total}`);
        }
      }
      this._lastSyncAt = Date.now();
      if (this._s) this._s.lastSyncAt = this._lastSyncAt;
      this._saveLater();
      this._error = null;
      this._backoff = 0;
      if (this._progress) { this._progress = null; this._progressDone(); App.showToast('클라우드 업로드 완료'); }
    } catch (e) {
      this._progressDone();
      this._progress = null;
      this._handleError(e);
      if (!this._fatal) {
        this._backoff = Math.min((this._backoff || 1000) * 2, 5 * 60 * 1000);
        clearTimeout(this._retryTimer);
        this._retryTimer = setTimeout(() => this.flush(), this._backoff);
      }
    } finally {
      this._flushing = false;
      await this._refreshPending();
      this._emit();
    }
  },

  async _commitOneByOne(rows) {
    const FV = firebase.firestore.FieldValue;
    for (const row of rows) {
      try {
        const ref = this._col(row.store).doc(String(row.id));
        if (row.op === 'put') {
          const data = row.store === 'petPhotos' ? await this._buildPetPhoto(row.id, row.ts) : row.data;
          if (data) await this._withTimeout(ref.set({ ...data, _serverAt: FV.serverTimestamp() }), 30000);
        } else {
          const b = this._fs.batch();
          b.set(this._col('tombstones').doc(`${row.store}_${row.id}`), { store: row.store, id: row.id, _updatedAt: row.ts, _deviceId: this._s.deviceId, _serverAt: FV.serverTimestamp() });
          b.delete(ref);
          await this._withTimeout(b.commit(), 30000);
        }
      } catch (e) {
        if (e && e.code === 'invalid-argument') console.warn(`Sync: 전송 불가 데이터 건너뜀 (${row.store} #${row.id})`, e);
        else throw e;
      }
    }
  },

  _withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('응답 시간 초과'), { code: 'timeout' })), ms))]);
  },

  // ========== 받기 (listeners) ==========

  _startListeners() {
    this._stopListeners();
    if (!this._fs || !this._user || !this.isEnabled()) return;
    const TS = firebase.firestore.Timestamp;
    for (const store of [...this.STORES, 'petPhotos', 'tombstones']) {
      let q = this._col(store);
      const since = this._s.lastPullAt && this._s.lastPullAt[store];
      // 마지막으로 받은 서버 시각 이후만 — 앱을 켤 때마다 전체를 다시 읽지 않는다 (무료 읽기 한도 보호)
      if (since) q = q.where('_serverAt', '>', TS.fromMillis(since));
      const unsub = q.onSnapshot(
        snap => this._onSnapshot(store, snap),
        err => this._handleError(err)
      );
      this._unsubs.push(unsub);
    }
  },

  _stopListeners() {
    this._unsubs.forEach(u => { try { u(); } catch (_) {} });
    this._unsubs = [];
  },

  _onSnapshot(store, snap) {
    try {
      const docs = [];
      let maxTs = 0;
      snap.docChanges().forEach(c => {
        if (c.type === 'removed') return; // 삭제는 tombstone 으로 처리
        const d = c.doc.data();
        const st = d._serverAt && d._serverAt.toMillis ? d._serverAt.toMillis() : 0;
        if (!st) return; // 아직 서버에 기록되지 않은 이 기기의 쓰기
        if (st > maxTs) maxTs = st;
        if (d._deviceId && d._deviceId === this._s.deviceId) return; // 내가 보낸 것
        docs.push({ id: c.doc.id, data: d });
      });
      if (!maxTs) return;
      this._applyChain = this._applyChain.then(async () => {
        if (!this.isEnabled()) return;
        let changed = 0;
        if (docs.length) {
          if (store === 'tombstones') changed = await this._applyTombstones(docs);
          else if (store === 'petPhotos') changed = await this._applyPetPhotos(docs);
          else changed = await this._applyRemote(store, docs, false);
        }
        this._s.lastPullAt[store] = Math.max(this._s.lastPullAt[store] || 0, maxTs);
        this._lastSyncAt = Date.now();
        this._s.lastSyncAt = this._lastSyncAt;
        this._saveLater();
        if (changed) {
          if (store === 'settings') this._settingsChanged = true;
          this._scheduleRefresh();
        }
        this._emit();
      }).catch(e => console.warn('Sync 적용 실패:', e));
    } catch (e) { console.warn('Sync 스냅샷 처리 오류:', e); }
  },

  // 원격 레코드 반영 — 원격이 더 최신일 때만 (마지막 수정 우선). 훅을 타지 않도록 IDB 에 직접 쓴다.
  _applyRemote(store, docs, force) {
    if (!docs.length) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
      let changed = 0;
      const tx = DB.db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const doc of docs) {
        const d = doc.data;
        const key = store === 'settings' ? (d.key || doc.id) : (typeof d.id === 'number' ? d.id : Number(doc.id));
        if (key == null || (store !== 'settings' && !Number.isFinite(key))) continue;
        if (store === 'settings' && this.isLocalOnlySetting(key)) continue;
        const req = os.get(key);
        req.onsuccess = () => {
          const local = req.result;
          const remoteTs = Number(d._updatedAt) || 0;
          if (!force && local && this._localTs(local) >= remoteTs) return;
          const rec = this._fromRemote(store, d, local);
          if (store === 'settings') rec.key = key; else rec.id = key;
          os.put(rec);
          changed++;
        };
      }
      tx.oncomplete = () => { if (changed && App.notifyTabSync) App.notifyTabSync(); resolve(changed); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  _applyTombstones(docs) {
    const byStore = {};
    docs.forEach(doc => {
      const t = doc.data;
      if (!t || !t.store) return;
      (byStore[t.store] = byStore[t.store] || []).push(t);
    });
    let total = 0;
    const jobs = Object.keys(byStore).map(store => {
      if (store === 'petPhotos') return this._clearSyncedPetPhotos(byStore[store].map(t => Number(t.id))).then(n => { total += n; });
      if (!this.STORES.includes(store)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const tx = DB.db.transaction(store, 'readwrite');
        const os = tx.objectStore(store);
        for (const t of byStore[store]) {
          const key = store === 'settings' ? String(t.id) : Number(t.id);
          if (store === 'settings' && this.isLocalOnlySetting(key)) continue;
          const req = os.get(key);
          req.onsuccess = () => {
            const local = req.result;
            // 삭제 이후에 이 기기에서 다시 고친 레코드는 살린다
            if (local && this._localTs(local) <= (Number(t._updatedAt) || 0)) { os.delete(key); total++; }
          };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    });
    return Promise.all(jobs).then(() => { if (total && App.notifyTabSync) App.notifyTabSync(); return total; });
  },

  // 반려견 프로필 사진(400px) — 이 기기에 원본 사진이 없을 때만 넣는다
  _applyPetPhotos(docs) {
    if (!docs.length) return Promise.resolve(0);
    return new Promise((resolve, reject) => {
      let changed = 0;
      const tx = DB.db.transaction('pets', 'readwrite');
      const os = tx.objectStore('pets');
      for (const doc of docs) {
        const petId = Number(doc.id);
        const data = doc.data && doc.data.data;
        if (!Number.isFinite(petId) || !data) continue;
        const req = os.get(petId);
        req.onsuccess = () => {
          const pet = req.result;
          if (!pet) { this._pendingPhotos[petId] = data; return; }
          if (pet.photoId || (pet.photo && !pet._photoFromSync)) return;
          if (pet.photo === data) return;
          pet.photo = data;
          pet._photoFromSync = true;
          os.put(pet);
          changed++;
        };
      }
      tx.oncomplete = () => { if (changed && App.notifyTabSync) App.notifyTabSync(); resolve(changed); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  _clearSyncedPetPhotos(petIds) {
    return new Promise((resolve, reject) => {
      let changed = 0;
      const tx = DB.db.transaction('pets', 'readwrite');
      const os = tx.objectStore('pets');
      petIds.forEach(id => {
        if (!Number.isFinite(id)) return;
        delete this._pendingPhotos[id];
        const req = os.get(id);
        req.onsuccess = () => {
          const pet = req.result;
          if (pet && pet._photoFromSync) { delete pet.photo; delete pet._photoFromSync; os.put(pet); changed++; }
        };
      });
      tx.oncomplete = () => resolve(changed);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  // 화면 갱신 — 입력 중이거나 모달이 열려 있으면 미룬다 (작성 중인 내용이 사라지지 않게)
  _scheduleRefresh(delay = 400) {
    this._refreshWanted = true;
    App._dashboardDirty = true;
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(async () => {
      try {
        const modal = document.getElementById('modal-overlay');
        const confirmEl = document.getElementById('confirm-overlay');
        const busy = (modal && !modal.classList.contains('hidden')) || (confirmEl && !confirmEl.classList.contains('hidden'));
        const ae = document.activeElement;
        const typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest && ae.closest('#page-content');
        const dirtyTab = Array.from(document.querySelectorAll('.settings-tab-content')).some(el => el._modified);
        if (busy || typing || dirtyTab) { this._scheduleRefresh(2000); return; }
        if (document.visibilityState !== 'visible') return; // 다시 보일 때 visibilitychange 에서 처리
        this._refreshWanted = false;
        if (this._settingsChanged) {
          this._settingsChanged = false;
          try { if (App.applyShopName) await App.applyShopName(); if (App.applyTheme) await App.applyTheme(); } catch (_) {}
        }
        App.handleRoute();
        if (App.updateBadges) App.updateBadges();
      } catch (e) { console.warn('Sync 화면 갱신 실패:', e); }
    }, delay);
  },

  // ========== 데이터 변환 ==========

  _toRemote(store, rec) {
    if (!rec) return null;
    let d;
    try { d = JSON.parse(JSON.stringify(rec)); } catch (_) { return null; }
    (this.LOCAL_FIELDS[store] || []).forEach(f => { delete d[f]; });
    const stripped = [];
    this._strip(d, '', stripped, store);
    if (stripped.length) d._stripped = stripped;
    d._updatedAt = Date.parse(rec.updatedAt) || Date.now();
    d._deviceId = this._s.deviceId;
    if (JSON.stringify(d).length > 900000) {
      console.warn(`Sync: 1MB 에 가까운 문서는 올리지 않음 (${store})`);
      return null;
    }
    return d;
  },

  // 큰 base64 이미지(data: URL, 500자 초과)는 올리지 않는다. pets.photoThumb(150px) 만 예외.
  _strip(obj, path, out, store) {
    if (!obj || typeof obj !== 'object') return;
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      const p = path ? `${path}.${k}` : k;
      if (typeof v === 'string') {
        if (v.length > 500 && v.startsWith('data:') && !(store === 'pets' && p === 'photoThumb')) {
          obj[k] = null;
          out.push(p);
        }
      } else if (v && typeof v === 'object') {
        this._strip(v, p, out, store);
      }
    }
  },

  _fromRemote(store, d, local) {
    const rec = { ...d };
    const ts = Number(rec._updatedAt) || 0;
    const stripped = Array.isArray(rec._stripped) ? rec._stripped : [];
    delete rec._updatedAt; delete rec._deviceId; delete rec._serverAt; delete rec._stripped;
    if (ts) rec.updatedAt = new Date(ts).toISOString();
    if (local) {
      for (const path of [...(this.LOCAL_FIELDS[store] || []), ...stripped]) {
        const v = this._getPath(local, path);
        if (v !== undefined && v !== null) this._setPath(rec, path, v);
      }
    }
    if (store === 'pets' && !rec.photoId && !rec.photo && this._pendingPhotos[rec.id]) {
      rec.photo = this._pendingPhotos[rec.id];
      rec._photoFromSync = true;
      delete this._pendingPhotos[rec.id];
    }
    return rec;
  },

  _getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o && typeof o === 'object') ? o[k] : undefined, obj);
  },

  _setPath(obj, path, val) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!o[keys[i]] || typeof o[keys[i]] !== 'object') return; // 구조가 달라졌으면 복구하지 않는다
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = val;
  },

  _localTs(rec) { return Date.parse(rec && rec.updatedAt) || 0; },

  // 반려견 사진이 바뀌었는지(사진 번호/인라인) 기록해 두고, 바뀐 경우에만 petPhotos 로 보낸다
  _petPhotoItem(op, id, pet, force) {
    const prev = this._photoSig[id];
    let sig = null;
    if (op === 'put' && pet) {
      if (pet.photoId) sig = 'id:' + pet.photoId;
      else if (pet.photo && !pet._photoFromSync && typeof pet.photo === 'string') sig = 'in:' + pet.photo.length + ':' + pet.photo.slice(-24);
    }
    if (sig === prev && !force) return null;
    if (sig) this._photoSig[id] = sig; else delete this._photoSig[id];
    this._saveSigLater();
    if (sig) return { store: 'petPhotos', op: 'put', id, data: null };
    if (prev) return { store: 'petPhotos', op: 'delete', id, data: null };
    return null;
  },

  // 400px JPEG 로 줄여서 올린다 (보낼 때 만든다 — 편지함에 큰 사진을 쌓지 않기 위해)
  async _buildPetPhoto(petId, ts) {
    try {
      const pet = await DB.get('pets', petId);
      if (!pet) return null;
      let src = null;
      if (pet.photoId) src = await DB.getPhoto(pet.photoId);
      if (!src && pet.photo && !pet._photoFromSync) src = pet.photo;
      if (!src) return null;
      const cfg = (SYNC_CONFIG && SYNC_CONFIG.photo) || {};
      const data = await DB._createThumb(src, cfg.profileMaxPx || 400, cfg.profileQuality || 0.7);
      if (!data) return null;
      return { data, petId, _updatedAt: ts || Date.now(), _deviceId: this._s.deviceId };
    } catch (e) {
      console.warn('Sync: 반려견 사진 준비 실패', e);
      return null;
    }
  },
  // TODO(sync): SYNC_CONFIG.photo.shareGroomingPhotos 가 true 가 되면 records 의 전·후 사진을
  //   shops/main/recordPhotos/{recordId}_{field} 로 같은 방식(축소 후 업로드)으로 보낸다. 현재는 기본 꺼짐이라 미구현.

  // ========== 기기 id 대역 ==========

  _nextId(store) {
    return new Promise((resolve, reject) => {
      const lo = this._s.deviceNo * this.ID_RANGE;
      const hi = lo + this.ID_RANGE - 1;
      const req = DB.db.transaction(store, 'readonly').objectStore(store)
        .openCursor(IDBKeyRange.bound(lo, hi), 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        const max = cur ? Number(cur.key) : 0;
        const next = Math.max(max + 1, lo + 1, (this._lastId[store] || 0) + 1);
        this._lastId[store] = next;
        resolve(next);
      };
      req.onerror = () => reject(req.error);
    });
  },

  _newDeviceId() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  },

  // ========== 보낼 편지함 (syncQueue) ==========

  _enqueue(items) {
    // 같은 레코드에 대한 대기 항목은 최신 것 하나만 남긴다 (새 행으로 교체 → 전송 중인 행과 섞이지 않음)
    const map = new Map();
    items.forEach(it => map.set(it.store + '|' + it.id, it));
    return new Promise((resolve, reject) => {
      const tx = DB.db.transaction('syncQueue', 'readwrite');
      const os = tx.objectStore('syncQueue');
      const idx = os.index('qk');
      const now = Date.now();
      for (const [qk, it] of map) {
        const row = { qk, store: it.store, op: it.op, id: it.id, data: it.data || null, ts: now };
        const r = idx.getAllKeys(qk);
        r.onsuccess = () => { (r.result || []).forEach(k => os.delete(k)); os.add(row); };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  _queuePeek(n) {
    return new Promise((resolve, reject) => {
      const os = DB.db.transaction('syncQueue', 'readonly').objectStore('syncQueue');
      const req = os.getAll(null, n);
      const keysReq = os.getAllKeys(null, n);
      keysReq.onsuccess = () => {
        const rows = req.result || [];
        rows.forEach((r, i) => { r.qid = keysReq.result[i]; });
        resolve(rows);
      };
      keysReq.onerror = () => reject(keysReq.error);
      req.onerror = () => reject(req.error);
    });
  },

  _queueRemove(ids) {
    if (!ids.length) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const tx = DB.db.transaction('syncQueue', 'readwrite');
      const os = tx.objectStore('syncQueue');
      ids.forEach(id => os.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  _clearQueue() {
    if (!DB.db || !DB.db.objectStoreNames.contains('syncQueue')) return Promise.resolve();
    return new Promise(resolve => {
      const tx = DB.db.transaction('syncQueue', 'readwrite');
      tx.objectStore('syncQueue').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  },

  async _refreshPending() {
    try { this._pending = await DB.count('syncQueue'); } catch (_) {}
  },

  // ========== Firestore 경로 ==========

  _shop() { return this._fs.collection('shops').doc((this._s && this._s.shopId) || this.SHOP_ID); },
  _col(name) { return this._shop().collection(name); },

  _maxServerAt(docs) {
    let m = 0;
    docs.forEach(d => { const t = d.data._serverAt; const ms = t && t.toMillis ? t.toMillis() : 0; if (ms > m) m = ms; });
    return m;
  },

  async _latestServerAt(name) {
    const snap = await this._col(name).orderBy('_serverAt', 'desc').limit(1).get();
    if (snap.empty) return 0;
    const t = snap.docs[0].data()._serverAt;
    return t && t.toMillis ? t.toMillis() : 0;
  },

  // 이 기기가 원본으로 올리는 경우 — 이미 있는 클라우드 문서는 다시 받지 않도록 기준 시각을 맞춘다
  async _markPulledToNow() {
    for (const name of [...this.STORES, 'petPhotos', 'tombstones']) {
      try { this._s.lastPullAt[name] = await this._latestServerAt(name); } catch (_) {}
    }
  },

  // ========== 저장 · 상태 ==========

  async _saveNow() {
    clearTimeout(this._saveTimer);
    if (this._s) await DB.setSetting('sync', this._s);
  },

  _saveLater() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => { this._saveNow().catch(e => console.warn('Sync 설정 저장 실패:', e)); }, 2000);
  },

  _saveSigLater() {
    clearTimeout(this._sigTimer);
    this._sigTimer = setTimeout(() => { DB.setSetting('_syncPhotoSig', this._photoSig).catch(() => {}); }, 1500);
  },

  _handleError(e) {
    const code = e && e.code;
    console.warn('Sync 오류:', code, e);
    if (code === 'permission-denied') {
      this._error = '이 계정은 동기화 권한이 없습니다. 허용된 Google 계정으로 다시 로그인해주세요.';
      this._fatal = true;
      this._stopListeners();
    } else if (code === 'resource-exhausted') {
      this._error = '오늘의 무료 사용량을 넘었습니다. 내일 자동으로 이어서 보냅니다.';
    } else if (code === 'unauthenticated') {
      this._user = null;
      this._error = null;
    } else if (code === 'unavailable' || code === 'timeout' || !navigator.onLine) {
      this._error = null; // 일시적 — 재시도
    } else {
      this._error = (e && e.message) || '동기화 오류';
    }
    this._emit();
  },

  _fail(e, toast) {
    const code = e && e.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      if (toast && typeof App !== 'undefined') App.showToast('로그인을 취소했습니다.', 'info');
      return;
    }
    this._handleError(e);
    if (toast && typeof App !== 'undefined') App.showToast(this._error || (e && e.message) || '동기화 중 오류가 발생했습니다.', 'error');
  },

  _emit() {
    try { window.dispatchEvent(new CustomEvent('sync:status', { detail: this.getStatus() })); } catch (_) {}
  },

  // 진행 상황 토스트 하나를 계속 고쳐 쓴다 (토스트가 쌓이지 않게)
  _progressToast(text) {
    try {
      if (this._ptoast && document.body.contains(this._ptoast)) {
        const span = this._ptoast.querySelector('span:not(.toast-ico)');
        if (span) { span.textContent = text; return; }
      }
      App.showToast(text, 'info', { duration: 60000 });
      const c = document.getElementById('toast-container');
      this._ptoast = c ? c.lastElementChild : null;
    } catch (_) {}
  },

  _progressDone() {
    try { if (this._ptoast) this._ptoast.remove(); } catch (_) {}
    this._ptoast = null;
  }
};
