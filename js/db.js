// ========== Dual-Mode Database Layer (Server API / IndexedDB) ==========
// Enhanced for 100K+ records with pagination, date-range queries, and photo-separated storage
const DB = {
  mode: 'idb', // 'server' or 'idb'
  db: null,
  name: 'PetGroomingShop',
  version: 6, // v6: syncQueue (기기 간 동기화 보낼 편지함)

  stores: {
    customers: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'name', keyPath: 'name' }, { name: 'phone', keyPath: 'phone' }] },
    pets: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'name', keyPath: 'name' }] },
    services: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'name', keyPath: 'name' }, { name: 'isActive', keyPath: 'isActive' }] },
    appointments: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'petId', keyPath: 'petId' }, { name: 'date', keyPath: 'date' }, { name: 'status', keyPath: 'status' }] },
    records: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'petId', keyPath: 'petId' }, { name: 'date', keyPath: 'date' }, { name: 'paymentMethod', keyPath: 'paymentMethod' }] },
    settings: { keyPath: 'key' },
    photos: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'ownerId', keyPath: 'ownerId' }, { name: 'type', keyPath: 'type' }] },
    expenses: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'month', keyPath: 'month' }, { name: 'category', keyPath: 'category' }] },
    // 기기 간 동기화 대기열 — 이 기기 전용. 백업·복원·무결성 점검 대상이 아니다.
    syncQueue: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'qk', keyPath: 'qk' }] }
  },

  // 백업/복원/스냅샷에 포함하지 않는 기기 전용 스토어
  _localOnlyStores: ['syncQueue'],

  // 동기화 훅 — Sync 가 없거나 꺼져 있으면 아무것도 하지 않는다. 절대 throw 하지 않는다.
  _syncHook(storeName, op, id, data) {
    try { if (typeof Sync !== 'undefined' && Sync.onLocalWrite) Sync.onLocalWrite(storeName, op, id, data); } catch (e) { console.warn('sync hook error:', e); }
  },

  async init() {
    // 서버 모드(server.js)는 로컬 개발용이며 배포본(GitHub Pages)에는 없다.
    // 매 실행마다 /api 를 탐색하던 코드는 404 로그 + 느린 네트워크에서 최대 2초 지연을 만들고,
    // 알 수 없는 경로에 200 을 주는 호스팅(SPA rewrite)에서는 모든 저장이 조용히 실패할 수 있어 제거했다.
    // 필요 시 ?mode=server 로만 명시적 전환.
    const explicit = new URLSearchParams(location.search).get('mode');
    if (explicit === 'server' && window.location.protocol !== 'file:') {
      try {
        const res = await fetch('/api/customers', { headers: { Accept: 'application/json' } });
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
          this.mode = 'server';
          return;
        }
      } catch (e) { /* server not available */ }
    }
    this.mode = 'idb';
    return this._initIDB();
  },

  // ========== IndexedDB Setup ==========
  _initIDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.name, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        for (const [storeName, config] of Object.entries(this.stores)) {
          let store;
          if (!db.objectStoreNames.contains(storeName)) {
            store = db.createObjectStore(storeName, { keyPath: config.keyPath, autoIncrement: config.autoIncrement || false });
          } else {
            store = e.target.transaction.objectStore(storeName);
          }
          if (config.indexes) {
            for (const idx of config.indexes) {
              if (!store.indexNames.contains(idx.name)) store.createIndex(idx.name, idx.keyPath, { unique: false });
            }
          }
        }
      };
      // 다른 탭/PWA 창이 구버전 연결을 쥐고 있으면 스키마 업그레이드가 영원히 대기한다.
      // 로딩 화면에 갇히지 않도록 사용자에게 알린다.
      req.onblocked = () => {
        const el = document.querySelector('#loading-screen .text');
        if (el) el.textContent = '다른 탭(또는 창)에서 앱이 열려 있습니다. 모두 닫은 뒤 다시 열어주세요.';
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        // 다른 탭이 새 버전으로 업그레이드하면 이 연결을 즉시 놓아주고 새로고침 (업그레이드 차단 방지)
        this.db.onversionchange = () => {
          try { this.db.close(); } catch (_) {}
          location.reload();
        };
        // iOS가 백그라운드에서 연결을 끊는 경우 — 이후 모든 호출이 실패하므로 재연결
        this.db.onclose = () => {
          console.warn('IndexedDB 연결이 외부 요인으로 닫힘 — 재연결 시도');
          this.db = null;
          this._initIDB().catch(() => {
            if (typeof App !== 'undefined' && App.showToast) App.showToast('저장소 연결이 끊어졌습니다. 앱을 다시 열어주세요.', 'error');
          });
        };
        // Safari ITP 데이터 자동 삭제 방지
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(granted => {
            if (!granted && typeof App !== 'undefined' && App.showToast) {
              const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
              if (isIOS && !isStandalone) {
                // iOS 비홈스크린: 7일 미사용 시 데이터 삭제 위험 — 강력 경고
                setTimeout(() => {
                  App.showToast('iPhone에서는 홈 화면에 추가하지 않으면 7일 미사용 시 데이터가 삭제될 수 있습니다. 정기 백업을 권장합니다.', 'warning', { duration: 15000 });
                }, 2000);
              } else if (!isStandalone) {
                setTimeout(() => {
                  // 동기화 중이면 데이터는 클라우드에 있으므로 띄우지 않는다. 아니어도 일주일에 한 번만 (매번 떠서 화면을 가렸다)
                  if (typeof Sync !== 'undefined' && Sync.isEnabled()) return;
                  try {
                    if (Number(localStorage.getItem('installHintAt') || 0) > Date.now() - 7 * 864e5) return;
                    localStorage.setItem('installHintAt', String(Date.now()));
                  } catch (_) {}
                  App.showToast('데이터 보호를 위해 앱을 홈 화면에 추가해주세요.', 'info', { duration: 6000 });
                }, 3000);
              }
            }
          }).catch(() => {});
        }
        resolve();
      };
      req.onerror = (e) => reject(e.target.error);
    });
  },

  _idbStore(name, mode) {
    return this.db.transaction(name, mode).objectStore(name);
  },

  // ========== Unified API ==========
  async add(storeName, data) {
    if (this.mode === 'server') {
      const d = { ...data };
      delete d.id;
      const res = await fetch(`/api/${storeName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(d)
      });
      const result = await res.json();
      return result.id;
    }
    // 동기화 중이면 기기별 id 대역에서 번호를 받는다 (두 기기가 같은 id 를 만들지 않게). 꺼져 있으면 null → autoIncrement.
    if (data.id == null && typeof Sync !== 'undefined' && Sync.allocId) {
      try { const nid = await Sync.allocId(storeName); if (nid != null) data.id = nid; } catch (_) {}
    }
    return new Promise((resolve, reject) => {
      // 요청 성공(onsuccess)이 아니라 트랜잭션 커밋(oncomplete) 시점에 resolve 한다.
      // 커밋 단계에서 나는 quota 초과/abort 는 onsuccess 이후에 발생하므로,
      // 그 전에 "저장되었습니다" 토스트를 띄우면 조용한 데이터 손실이 된다.
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      data.createdAt = data.createdAt || new Date().toISOString();
      data.updatedAt = new Date().toISOString();
      let result;
      const req = store.add(data);
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => {
        if (typeof App !== 'undefined' && App.notifyTabSync) App.notifyTabSync();
        if (storeName !== 'photos') this._syncHook(storeName, 'put', result, data);
        resolve(result);
      };
      const fail = () => reject(this._txError(tx, req));
      tx.onerror = fail;
      tx.onabort = fail;
    });
  },

  // 트랜잭션 실패 원인 추출 + quota 초과 시 사용자 안내
  _txError(tx, req) {
    const err = (tx && tx.error) || (req && req.error) || new Error('IndexedDB 트랜잭션 실패');
    if (tx && tx._errHandled) return err; // onerror → onabort 연속 호출 시 토스트 1회만
    if (tx) tx._errHandled = true;
    if (err && err.name === 'QuotaExceededError') {
      if (typeof App !== 'undefined' && App.showToast) {
        App.showToast('저장 공간이 부족합니다. 오래된 사진을 삭제하거나 데이터를 백업 후 정리해주세요.', 'error');
      }
    }
    return err;
  },

  async get(storeName, id) {
    if (this.mode === 'server') {
      const res = await fetch(`/api/${storeName}/${id}`);
      if (!res.ok) throw new Error(`DB get 실패: ${res.status}`);
      const data = await res.json();
      return data;
    }
    return new Promise((resolve, reject) => {
      const req = this._idbStore(storeName, 'readonly').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(storeName) {
    if (this.mode === 'server') {
      const res = await fetch(`/api/${storeName}`);
      if (!res.ok) throw new Error(`DB getAll 실패: ${res.status}`);
      return await res.json() || [];
    }
    return new Promise((resolve, reject) => {
      const req = this._idbStore(storeName, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async update(storeName, data) {
    if (this.mode === 'server') {
      const res = await fetch(`/api/${storeName}/${data.id || data.key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(`DB update 실패: ${res.status}`);
      return await res.json();
    }
    return new Promise((resolve, reject) => {
      data.updatedAt = new Date().toISOString();
      const tx = this.db.transaction(storeName, 'readwrite');
      let result;
      const req = tx.objectStore(storeName).put(data);
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => {
        if (typeof App !== 'undefined' && App.notifyTabSync) App.notifyTabSync();
        if (storeName !== 'photos') this._syncHook(storeName, 'put', result, data);
        resolve(result);
      };
      const fail = () => reject(this._txError(tx, req));
      tx.onerror = fail;
      tx.onabort = fail;
    });
  },

  async delete(storeName, id) {
    if (this.mode === 'server') {
      const res = await fetch(`/api/${storeName}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DB delete 실패: ${res.status}`);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => {
        if (typeof App !== 'undefined' && App.notifyTabSync) App.notifyTabSync();
        if (storeName !== 'photos') this._syncHook(storeName, 'delete', id, null);
        resolve();
      };
      const fail = () => reject(this._txError(tx, req));
      tx.onerror = fail;
      tx.onabort = fail;
    });
  },

  // 여러 스토어에서 원자적으로 삭제 (단일 트랜잭션)
  async deleteCascade(ops) {
    if (this.mode === 'server') {
      for (const { store, id } of ops) await fetch(`/api/${store}/${id}`, { method: 'DELETE' });
      return;
    }
    const storeNames = [...new Set(ops.map(o => o.store))];
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeNames, 'readwrite');
      for (const { store, id } of ops) tx.objectStore(store).delete(id);
      tx.oncomplete = () => {
        for (const { store, id } of ops) if (store !== 'photos') this._syncHook(store, 'delete', id, null);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },

  async getByIndex(storeName, indexName, value) {
    if (this.mode === 'server') {
      const res = await fetch(`/api/${storeName}?indexName=${encodeURIComponent(indexName)}&indexValue=${encodeURIComponent(value)}`);
      return await res.json() || [];
    }
    return new Promise((resolve, reject) => {
      const index = this._idbStore(storeName, 'readonly').index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async count(storeName) {
    if (this.mode === 'server') {
      const res = await fetch(`/api/${storeName}?count=true`);
      const data = await res.json();
      return data.count;
    }
    return new Promise((resolve, reject) => {
      const req = this._idbStore(storeName, 'readonly').count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  // ========== Efficient Query Methods ==========

  // Paginated query with cursor
  async getPage(storeName, options = {}) {
    const { page = 0, pageSize = 50, indexName, direction = 'next', filterFn } = options;

    if (this.mode === 'server') {
      const params = new URLSearchParams();
      params.set('page', page);
      params.set('pageSize', pageSize);
      const res = await fetch(`/api/${storeName}?${params.toString()}`);
      const result = await res.json();
      // Server returns { items, total, page, pageSize }
      if (result.items) {
        return {
          items: filterFn ? result.items.filter(filterFn) : result.items,
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          hasMore: (result.page + 1) * result.pageSize < result.total
        };
      }
      // Fallback if server doesn't support pagination
      const all = Array.isArray(result) ? result : [];
      const filtered = filterFn ? all.filter(filterFn) : all;
      const start = page * pageSize;
      return {
        items: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        pageSize,
        hasMore: start + pageSize < filtered.length
      };
    }

    // IndexedDB: cursor-based pagination
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const items = [];
      let total = 0;
      let skipped = 0;
      const skip = page * pageSize;

      // First get total count
      const countReq = store.count();
      countReq.onsuccess = () => {
        total = countReq.result;
      };

      const cursorReq = source.openCursor(null, direction === 'prev' ? 'prev' : 'next');
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          resolve({
            items,
            total: filterFn ? total : total, // approximate if filtered
            page,
            pageSize,
            hasMore: (page + 1) * pageSize < total
          });
          return;
        }
        if (filterFn && !filterFn(cursor.value)) {
          cursor.continue();
          return;
        }
        if (skipped < skip) {
          skipped++;
          cursor.continue();
          return;
        }
        if (items.length < pageSize) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve({
            items,
            total,
            page,
            pageSize,
            hasMore: true
          });
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  },

  // Count by index value
  async countByIndex(storeName, indexName, value) {
    const items = await this.getByIndex(storeName, indexName, value);
    return items.length;
  },

  // Get records by date range (uses IDBKeyRange.bound for efficient querying)
  async getByDateRange(storeName, indexName, startDate, endDate) {
    if (this.mode === 'server') {
      const params = new URLSearchParams();
      if (startDate) params.set('dateFrom', startDate);
      if (endDate) params.set('dateTo', endDate);
      params.set('dateIndex', indexName);
      const res = await fetch(`/api/${storeName}?${params.toString()}`);
      return await res.json() || [];
    }
    return new Promise((resolve, reject) => {
      const index = this._idbStore(storeName, 'readonly').index(indexName);
      let range;
      if (startDate && endDate) {
        range = IDBKeyRange.bound(startDate, endDate);
      } else if (startDate) {
        range = IDBKeyRange.lowerBound(startDate);
      } else if (endDate) {
        range = IDBKeyRange.upperBound(endDate);
      }
      const req = index.getAll(range);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  // Get records WITHOUT specified large fields (for list views)
  async getAllLight(storeName, excludeFields) {
    if (this.mode === 'server') {
      const exclude = (excludeFields || []).join(',');
      const res = await fetch(`/api/${storeName}?light=true&exclude=${encodeURIComponent(exclude)}`);
      return await res.json() || [];
    }
    // IndexedDB: load all then strip fields (IDB doesn't support partial reads)
    const all = await this.getAll(storeName);
    if (!excludeFields || excludeFields.length === 0) return all;
    return all.map(item => {
      const copy = { ...item };
      for (const f of excludeFields) {
        delete copy[f];
      }
      return copy;
    });
  },

  // Storage quota check (browser-native navigator.storage API)
  async checkStorageQuota() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          used: estimate.usage || 0,
          quota: estimate.quota || 0,
          percentage: estimate.quota > 0 ? Math.round((estimate.usage / estimate.quota) * 100) : 0
        };
      } catch (e) {
        console.warn('Storage estimate failed:', e);
        return null;
      }
    }
    return null;
  },

  // ========== Photo-Separated Storage ==========

  // Store photo as separate record, return photo ID
  async savePhoto(photoData, metadata) {
    if (!photoData) return null;

    // Convert base64 to Blob for ~33% storage savings
    let blob;
    try {
      if (photoData.startsWith('data:')) {
        const parts = photoData.split(',');
        const mime = parts[0].match(/:(.*?);/)[1];
        const binary = atob(parts[1]);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          array[i] = binary.charCodeAt(i);
        }
        blob = new Blob([array], { type: mime });
      } else {
        blob = new Blob([photoData], { type: 'image/jpeg' });
      }
    } catch (e) {
      console.warn('savePhoto: blob conversion failed, storing as string', e);
      blob = photoData; // fallback: store as-is
    }

    const record = {
      data: blob,
      type: metadata.type || 'unknown',
      ownerId: metadata.ownerId || 0,
      date: metadata.date || new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    try {
      const id = await this.add('photos', record);
      return id;
    } catch (e) {
      console.error('savePhoto error:', e);
      throw e;
    }
  },

  // Load single photo by ID, returns base64 dataURL for display
  async getPhoto(photoId) {
    if (!photoId) return null;
    try {
      const record = await this.get('photos', photoId);
      if (!record) return null;

      // If stored as Blob, convert back to base64 dataURL
      if (record.data instanceof Blob) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(record.data);
        });
      }
      // Already a string (base64 or dataURL)
      return record.data;
    } catch (e) {
      console.warn('getPhoto error:', e);
      return null;
    }
  },

  // Delete photo by ID
  async deletePhoto(photoId) {
    if (!photoId) return;
    try {
      await this.delete('photos', photoId);
    } catch (e) {
      console.warn('deletePhoto error:', e);
    }
  },

  // 저장 공간 최적화: 인라인 base64 사진 → photos 스토어 마이그레이션
  async optimizeStorage() {
    const photoFields = ['photoBefore', 'photoAfter', 'photo3', 'photo4'];
    let migratedCount = 0;
    let savedBytes = 0;

    // 1) Records: 인라인 사진 → photos 스토어
    const records = await this.getAll('records');
    for (const r of records) {
      let changed = false;
      for (const field of photoFields) {
        if (r[field] && typeof r[field] === 'string' && r[field].length > 500) {
          try {
            const photoId = await this.savePhoto(r[field], { type: 'record-' + field, ownerId: r.id });
            savedBytes += r[field].length;
            r[field + 'Id'] = photoId;
            r[field] = null;
            changed = true;
            migratedCount++;
          } catch (e) { console.warn('Record photo migration failed:', r.id, field, e); }
        }
      }
      if (changed) await this.update('records', r);
    }

    // 2) Pets: 큰 사진 → photos 스토어 + 작은 썸네일 유지
    const pets = await this.getAll('pets');
    for (const p of pets) {
      if (p.photo && typeof p.photo === 'string' && p.photo.length > 10000) {
        try {
          const photoId = await this.savePhoto(p.photo, { type: 'pet-profile', ownerId: p.id });
          savedBytes += p.photo.length;
          p.photoId = photoId;
          // 작은 썸네일 생성 (동기 표시용)
          p.photoThumb = await this._createThumb(p.photo, 150, 0.5);
          p.photo = null;
          await this.update('pets', p);
          migratedCount++;
        } catch (e) { console.warn('Pet photo migration failed:', p.id, e); }
      }
    }

    const savedMB = (savedBytes / (1024 * 1024)).toFixed(1);
    return { migratedCount, savedMB };
  },

  // 썸네일 생성 (base64 → 작은 base64)
  _createThumb(dataUrl, maxSize = 150, quality = 0.5) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
          else { w = Math.round(w * maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  },

  // ========== Existing Methods ==========

  async exportAll(options = {}) {
    if (this.mode === 'server') {
      const res = await fetch('/api/export');
      return await res.json();
    }
    const excludePhotos = options.excludePhotos || false;
    const photoFields = ['photo', 'photoBefore', 'photoAfter', 'photo3', 'photo4'];
    const data = {};
    for (const storeName of Object.keys(this.stores)) {
      if (this._localOnlyStores.includes(storeName)) continue;
      // 사진 제외 모드: photos 스토어 건너뛰기
      if (storeName === 'photos' && excludePhotos) { data[storeName] = []; continue; }
      // photos 스토어는 별도 처리 (Blob을 base64로 변환)
      if (storeName === 'photos') {
        const photos = await this.getAll('photos');
        const exportPhotos = [];
        for (const p of photos) {
          if (p.data instanceof Blob) {
            const base64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(p.data);
            });
            exportPhotos.push({ ...p, data: base64 });
          } else {
            exportPhotos.push(p);
          }
        }
        data[storeName] = exportPhotos;
        continue;
      }
      let items = await this.getAll(storeName);
      // 복원 전 자동 백업(_autoBackup*)은 DB 전체 사본이다. 백업 파일에 넣으면
      // 복원할 때마다 사본이 중첩되어 파일이 매번 2배로 커진다 → 항상 제외.
      if (storeName === 'settings') items = items.filter(item => !this._isInternalSetting(item.key));
      // 사진 제외 모드: 인라인 base64 사진 필드 제거 (pets, records, settings)
      if (excludePhotos && (storeName === 'pets' || storeName === 'records')) {
        items = items.map(item => {
          const cleaned = { ...item };
          photoFields.forEach(f => { if (cleaned[f] && typeof cleaned[f] === 'string' && cleaned[f].length > 500) delete cleaned[f]; });
          return cleaned;
        });
      }
      if (excludePhotos && storeName === 'settings') {
        items = items.map(item => {
          if (item.key === 'cardDesignSettings' && item.value?.customBgImage) {
            return { ...item, value: { ...item.value, customBgImage: null } };
          }
          if (item.key === 'shopLogo' && item.value && typeof item.value === 'string' && item.value.length > 500) {
            return { ...item, value: null };
          }
          return item;
        });
      }
      data[storeName] = items;
    }
    data._exportDate = new Date().toISOString();
    data._version = this.version;
    data._excludePhotos = excludePhotos;
    return data;
  },

  // 백업 파일에 포함하지 않고, 복원 시에도 덮어쓰지 않는 기기 내부 설정 키
  // 'sync'(동기화 연결 정보: 기기 id·기기 번호·마지막 받은 시각) 와 '_sync*' 도 기기 전용이다.
  _isInternalSetting(key) {
    return typeof key === 'string' && (key.startsWith('_autoBackup') || key.startsWith('_sync') || key === 'sync');
  },

  validateBackup(data) {
    if (!data || typeof data !== 'object') return '유효하지 않은 백업 파일입니다.';
    // 미래 버전 백업 차단 (앱 업데이트 필요)
    if (typeof data._version === 'number' && data._version > this.version) {
      return `이 백업은 더 최신 버전(v${data._version})에서 생성되었습니다. 앱을 업데이트한 후 다시 시도해주세요.`;
    }
    const validStores = Object.keys(data).filter(k => !k.startsWith('_') && this.stores[k] && !this._localOnlyStores.includes(k));
    if (validStores.length === 0) return '인식 가능한 데이터가 없습니다.';
    for (const store of validStores) {
      if (!Array.isArray(data[store])) return `"${store}" 데이터가 올바른 형식이 아닙니다.`;
    }
    // 필수 스토어 확인
    const required = ['customers', 'pets', 'services'];
    const missing = required.filter(r => !data[r] || !Array.isArray(data[r]));
    if (missing.length > 0) return `필수 데이터 누락: ${missing.join(', ')}`;
    // 고객 데이터 필수 필드 검증 (샘플)
    if (data.customers.length > 0) {
      const sample = data.customers[0];
      if (!sample.name && !sample.phone) return '고객 데이터에 이름/연락처가 없습니다.';
    }
    return null; // 유효
  },

  // 백업 데이터 마이그레이션 (구버전 → 현재 버전)
  // 향후 schema 변경 시 여기에 단계별 변환 함수 추가
  async _migrateBackup(data) {
    const sourceVer = (typeof data._version === 'number') ? data._version : 1;
    if (sourceVer === this.version) return data;

    // 마이그레이션 레지스트리: { fromVersion: async (data) => transformedData }
    const migrations = {
      // v1 → v2: paymentMethod 인덱스 추가 (데이터 변환 불필요, schema only)
      // v2 → v3: photos 스토어 추가 (없으면 빈 배열로 초기화)
      // v3 → v4: pets.photoId/photoThumb 도입 (구버전은 photo 인라인 → import 시 그대로 두고 추후 optimizeStorage로 변환)
      // v4 → v5: paymentMethod 인덱스 (기존 데이터 호환)
      // 향후 추가: 6 → 7, 7 → 8 등
    };

    let v = sourceVer;
    let migrated = data;
    while (v < this.version) {
      const fn = migrations[v];
      if (fn) {
        try {
          migrated = await fn(migrated);
          console.log(`Backup migrated: v${v} → v${v + 1}`);
        } catch (e) {
          console.error(`Migration v${v}→v${v + 1} failed:`, e);
          throw new Error(`백업 마이그레이션 실패 (v${v}→v${v + 1}): ${e.message}`);
        }
      }
      v++;
    }

    // photos 스토어가 없으면 빈 배열 보장 (v3 미만 백업)
    if (!Array.isArray(migrated.photos)) migrated.photos = [];
    if (!Array.isArray(migrated.expenses)) migrated.expenses = [];
    migrated._version = this.version;
    return migrated;
  },

  async importAll(data, onProgress) {
    if (this.mode === 'server') {
      await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return;
    }

    // 1. Validate data structure first (don't delete existing data yet)
    const validationError = this.validateBackup(data);
    if (validationError) throw new Error(validationError);

    // 1b. 구버전 백업 마이그레이션
    data = await this._migrateBackup(data);

    // ⚠ 사진 보호: '사진 제외 백업'은 photos: [] 로 저장된다. 이를 복원 대상에 넣으면
    //   photos 스토어가 통째로 clear 되어 기기의 사진이 전부 사라진다 (되돌릴 수 없음).
    //   사진이 없는 백업은 기존 사진을 그대로 두고, 참조가 끊긴 사진은 무결성 점검이 정리한다.
    const skipPhotos = data._excludePhotos === true || !Array.isArray(data.photos) || data.photos.length === 0;
    const storeNames = Object.keys(data).filter(
      k => !k.startsWith('_') && this.stores[k] && Array.isArray(data[k]) && !(skipPhotos && k === 'photos') && !this._localOnlyStores.includes(k)
    );

    // 기기 내부 설정(_autoBackup*)은 복원으로 덮어쓰지 않는다 — 복원 직후 "되돌리기"의 유일한 근거이므로.
    let preservedSettings = [];
    try {
      const curSettings = await this.getAll('settings');
      preservedSettings = curSettings.filter(item => this._isInternalSetting(item.key));
    } catch (_) {}
    if (Array.isArray(data.settings)) {
      data.settings = data.settings.filter(item => !this._isInternalSetting(item && item.key));
    }

    const CHUNK_SIZE = 500; // 사진 5만 장 + 트랜잭션 시간 초과 방지
    const totalItems = storeNames.reduce((sum, s) => sum + (data[s] ? data[s].length : 0), 0);
    let processed = 0;

    // 1c. ⚠ 인-플라이트 안전망 — 사진 외 데이터 snapshot (메모리 + localStorage)
    //     clear-insert 사이 crash 시 자동 rollback. settings는 IDB에 저장되므로 이 snapshot은 별도 보관.
    const snapshotStores = storeNames.filter(sn => sn !== 'photos');
    const snapshot = {};
    try {
      for (const sn of snapshotStores) {
        snapshot[sn] = await new Promise((resolve, reject) => {
          const req = this.db.transaction(sn, 'readonly').objectStore(sn).getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
        // 자동 백업 사본은 snapshot 에서 제외 (localStorage 용량 초과 방지) — rollback 후 별도로 복구
        if (sn === 'settings') snapshot[sn] = snapshot[sn].filter(item => !this._isInternalSetting(item.key));
      }
      try {
        localStorage.setItem('__petsalon_import_snapshot__', JSON.stringify({ ts: Date.now(), data: snapshot }));
      } catch (lse) {
        console.warn('snapshot localStorage 저장 실패 (메모리만 보관):', lse);
      }
    } catch (snapErr) {
      console.warn('snapshot 생성 실패 — import 계속:', snapErr);
    }

    // 2. 모든 스토어를 단일 트랜잭션으로 clear (원자적, 빠름)
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeNames, 'readwrite');
        for (const storeName of storeNames) tx.objectStore(storeName).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) {
      console.error('importAll: clear phase failed:', e);
      try { localStorage.removeItem('__petsalon_import_snapshot__'); } catch (_) {}
      // clear 는 단일 트랜잭션(원자적) → 실패해도 기존 데이터는 그대로다
      const err = new Error('기존 데이터 정리 중 오류가 발생했습니다. (현재 데이터는 그대로입니다)');
      err.dbState = 'untouched';
      throw err;
    }

    // 3. 스토어별로 청크 단위 insert — 실패 시 snapshot으로 자동 rollback
    try {
      for (const storeName of storeNames) {
        const items = data[storeName];
        for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE);
          await new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            for (const item of chunk) {
              if (storeName === 'settings' && !item.key) continue;
              // photos: export 시 Blob을 base64로 직렬화한 데이터 → 다시 Blob으로 복원
              if (storeName === 'photos' && item.data && typeof item.data === 'string' && item.data.startsWith('data:')) {
                try {
                  const parts = item.data.split(',');
                  const mime = parts[0].match(/:(.*?);/)[1];
                  const binary = atob(parts[1]);
                  const arr = new Uint8Array(binary.length);
                  for (let j = 0; j < binary.length; j++) arr[j] = binary.charCodeAt(j);
                  item.data = new Blob([arr], { type: mime });
                } catch (e) { console.warn('photo blob 복원 실패:', item.id, e); }
              }
              try { store.add(item); } catch (e) { console.warn(`importAll: skipped bad item in ${storeName}`, e); }
            }
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
          processed += chunk.length;
          if (onProgress) {
            try { onProgress({ processed, total: totalItems, store: storeName }); } catch (_) {}
          }
        }
      }
    } catch (insertError) {
      console.error(`importAll insert 실패 — snapshot으로 rollback 시도:`, insertError);
      try {
        await this._rollbackFromSnapshot(snapshot, preservedSettings);
        try { localStorage.removeItem('__petsalon_import_snapshot__'); } catch (_) {}
        const err = new Error('복원 중 오류 — 이전 데이터로 자동 복구되었습니다. 백업 파일을 확인 후 다시 시도해주세요.');
        err.dbState = 'rolled-back';
        throw err;
      } catch (rbErr) {
        if (rbErr.dbState === 'rolled-back') throw rbErr;
        console.error('rollback도 실패 — snapshot이 localStorage에 보관됨:', rbErr);
        // 되돌리기 사본만이라도 다시 써 둔다 — 그래야 설정의 '복원 전 상태로 되돌리기'가 동작한다
        await this._restoreInternalSettings(preservedSettings);
        const err = new Error('심각한 오류 — 앱을 닫지 마시고 즉시 개발자에게 문의하세요. (snapshot 보관 중)');
        err.dbState = 'dirty';
        throw err;
      }
    }

    // 4. 기기 내부 설정 복구 (자동 백업 사본 등)
    await this._restoreInternalSettings(preservedSettings);

    // 4b. 사진을 건너뛴 복원이면, 복원된 반려견/기록이 가리키는 사진이 실제로 그 소유자의 것인지 확인한다.
    //     (다른 기기의 백업이면 photoId 가 이 기기의 엉뚱한 사진과 번호만 같을 수 있다)
    if (skipPhotos) {
      try { await this._pruneMismatchedPhotoRefs(); } catch (e) { console.warn('사진 참조 점검 실패 (무시):', e); }
    }

    // 5. 성공 — snapshot 정리
    try { localStorage.removeItem('__petsalon_import_snapshot__'); } catch (_) {}

    // 6. 동기화 중이면 복원된 데이터로 클라우드를 맞춘다 (백그라운드, 실패해도 복원 결과에는 영향 없음)
    try { if (typeof Sync !== 'undefined' && Sync.afterImport) Sync.afterImport(); } catch (e) { console.warn('Sync.afterImport 실패 (무시):', e); }
  },

  async _restoreInternalSettings(items) {
    if (!items || items.length === 0) return;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        items.forEach(item => { try { store.put(item); } catch (_) {} });
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) { console.warn('내부 설정 복구 실패 (무시):', e); }
  },

  // photoId 가 가리키는 사진의 ownerId 가 소유자와 다르면 참조를 끊는다 (사진 자체는 무결성 점검이 정리)
  async _pruneMismatchedPhotoRefs() {
    const photos = await this.getAllLight('photos', ['data']);
    const owner = {}; photos.forEach(ph => { owner[ph.id] = ph; });
    const pets = await this.getAll('pets');
    for (const p of pets) {
      if (!p.photoId) continue;
      const ph = owner[p.photoId];
      if (!ph || (ph.ownerId && ph.ownerId !== p.id)) { p.photoId = null; await this.update('pets', p); }
    }
    const records = await this.getAll('records');
    const fields = ['photoBeforeId', 'photoAfterId', 'photo3Id', 'photo4Id'];
    for (const r of records) {
      let changed = false;
      for (const f of fields) {
        if (!r[f]) continue;
        const ph = owner[r[f]];
        if (!ph || (ph.ownerId && ph.ownerId !== r.id)) { r[f] = null; changed = true; }
      }
      if (changed) await this.update('records', r);
    }
  },

  // 인-플라이트 snapshot으로부터 rollback (importAll catch에서 호출)
  async _rollbackFromSnapshot(snapshot, preservedSettings = []) {
    const stores = Object.keys(snapshot);
    if (stores.length === 0) throw new Error('snapshot 비어있음');
    if (preservedSettings.length > 0 && Array.isArray(snapshot.settings)) {
      snapshot.settings = snapshot.settings.filter(item => !this._isInternalSetting(item.key)).concat(preservedSettings);
    }
    // 1) clear (photos 제외)
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, 'readwrite');
      stores.forEach(sn => tx.objectStore(sn).clear());
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    // 2) re-insert
    for (const sn of stores) {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(sn, 'readwrite');
        const store = tx.objectStore(sn);
        for (const item of snapshot[sn]) {
          if (sn === 'settings' && !item.key) continue;
          try { store.add(item); } catch (_) {}
        }
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    }
  },

  async clearAll() {
    if (this.mode === 'server') {
      await fetch('/api/clear', { method: 'DELETE' });
      return;
    }
    const storeNames = Object.keys(this.stores);
    const tx = this.db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) {
      tx.objectStore(storeName).clear();
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    // 'sync' 설정과 대기열도 지워졌다 → 동기화 연결을 끊는다 (클라우드 데이터는 건드리지 않음)
    try { if (typeof Sync !== 'undefined' && Sync.afterClearAll) Sync.afterClearAll(); } catch (_) {}
  },

  // ========== Data Integrity Check ==========
  // 앱 시작 시 자동 호출되어 orphan 참조를 감지/보수
  // TODO: 데이터 100K+ 시 cursor 기반 배치로 전환 필요 (현재 getAll 사용)
  async runIntegrityCheck() {
    if (this.mode === 'server') return null; // 서버 모드는 서버가 보장
    const report = {
      orphanPhotoRefs: 0,    // pet/record의 photoId가 photos 스토어에 없음
      orphanPhotos: 0,       // 어디서도 참조 안 되는 photos
      repaired: 0,
      issues: []             // 자동 보수 안 한 모순 (사용자 확인 필요)
    };
    try {
      const [customers, pets, records, photos] = await Promise.all([
        this.getAll('customers'),
        this.getAll('pets'),
        this.getAll('records'),
        this.getAll('photos')
      ]);
      const customerIds = new Set(customers.map(c => c.id));
      const petIds = new Set(pets.map(p => p.id));
      const photoIds = new Set(photos.map(ph => ph.id));
      const referencedPhotoIds = new Set();

      // 1) pets.photoId orphan 보수
      for (const p of pets) {
        if (p.photoId) {
          if (!photoIds.has(p.photoId)) {
            report.orphanPhotoRefs++;
            p.photoId = null;
            await this.update('pets', p);
            report.repaired++;
          } else {
            referencedPhotoIds.add(p.photoId);
          }
        }
      }

      // 2) records.photo*Id orphan 보수
      const recordPhotoFields = ['photoBeforeId', 'photoAfterId', 'photo3Id', 'photo4Id'];
      for (const r of records) {
        let changed = false;
        for (const field of recordPhotoFields) {
          if (r[field]) {
            if (!photoIds.has(r[field])) {
              report.orphanPhotoRefs++;
              r[field] = null;
              changed = true;
              report.repaired++;
            } else {
              referencedPhotoIds.add(r[field]);
            }
          }
        }
        if (changed) await this.update('records', r);
      }

      // 3) photos 스토어에서 어디서도 참조 안 되는 orphan 삭제
      // 10분 안에 저장된 사진은 건너뛴다 — 동기화가 사진을 먼저 저장하고 기록을 바꾸는 사이에 고아로 오인해 지웠다
      const recentCut = Date.now() - 10 * 60 * 1000;
      for (const ph of photos) {
        if (ph.createdAt && new Date(ph.createdAt).getTime() > recentCut) continue;
        if (!referencedPhotoIds.has(ph.id)) {
          report.orphanPhotos++;
          await this.delete('photos', ph.id);
          report.repaired++;
        }
      }

      // 4) 모순 감지 (자동 보수 안 함 — 사용자 의도 모를 수 있음)
      for (const p of pets) {
        if (p.customerId && !customerIds.has(p.customerId)) {
          report.issues.push(`반려견 #${p.id}(${p.name || '이름없음'}): 소유 고객 ID ${p.customerId} 없음`);
        }
      }
      for (const r of records) {
        if (r.customerId && !customerIds.has(r.customerId)) {
          report.issues.push(`기록 #${r.id}(${r.date}): 고객 ID ${r.customerId} 없음`);
        }
        if (r.petId && !petIds.has(r.petId)) {
          report.issues.push(`기록 #${r.id}(${r.date}): 반려견 ID ${r.petId} 없음`);
        }
      }

      return report;
    } catch (e) {
      console.error('runIntegrityCheck failed:', e);
      return null;
    }
  },

  async getSetting(key) {
    if (this.mode === 'server') {
      const res = await fetch(`/api/settings/${encodeURIComponent(key)}`);
      const data = await res.json();
      return data ? data.value : null;
    }
    const result = await this.get('settings', key);
    return result ? result.value : null;
  },

  async setSetting(key, value) {
    if (this.mode === 'server') {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, updatedAt: new Date().toISOString() })
      });
      return;
    }
    return this.update('settings', { key, value, updatedAt: new Date().toISOString() });
  },

};
