// ========== Dual-Mode Database Layer (Server API / IndexedDB) ==========
// Enhanced for 100K+ records with pagination, date-range queries, and photo-separated storage
const DB = {
  mode: 'idb', // 'server' or 'idb'
  db: null,
  name: 'PetGroomingShop',
  version: 5,

  stores: {
    customers: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'name', keyPath: 'name' }, { name: 'phone', keyPath: 'phone' }] },
    pets: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'name', keyPath: 'name' }] },
    services: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'name', keyPath: 'name' }, { name: 'isActive', keyPath: 'isActive' }] },
    appointments: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'petId', keyPath: 'petId' }, { name: 'date', keyPath: 'date' }, { name: 'status', keyPath: 'status' }] },
    records: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'petId', keyPath: 'petId' }, { name: 'date', keyPath: 'date' }, { name: 'paymentMethod', keyPath: 'paymentMethod' }] },
    settings: { keyPath: 'key' },
    photos: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'ownerId', keyPath: 'ownerId' }, { name: 'type', keyPath: 'type' }] },
    expenses: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'month', keyPath: 'month' }, { name: 'category', keyPath: 'category' }] }
  },

  async init() {
    // Try server API first (when served via server.js)
    if (window.location.protocol !== 'file:') {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('/api/customers', { method: 'GET', signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          this.mode = 'server';
          return;
        }
      } catch (e) { /* server not available */ }
    }
    // Fall back to IndexedDB
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
      req.onsuccess = (e) => {
        this.db = e.target.result;
        // Safari ITP 데이터 자동 삭제 방지
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(granted => {
            if (!granted && typeof App !== 'undefined' && App.showToast) {
              const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
              if (isIOS && !isStandalone) {
                // iOS 비홈스크린: 7일 미사용 시 데이터 삭제 위험 — 강력 경고
                setTimeout(() => {
                  App.showToast('⚠️ iPhone에서는 홈 화면에 추가하지 않으면 7일 미사용 시 데이터가 삭제될 수 있습니다. 정기 백업을 권장합니다.', 'warning', { duration: 15000 });
                }, 2000);
              } else if (!isStandalone) {
                setTimeout(() => {
                  App.showToast('데이터 보호를 위해 앱을 홈 화면에 추가해주세요.', 'warning', { duration: 8000 });
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
    return new Promise((resolve, reject) => {
      const store = this._idbStore(storeName, 'readwrite');
      data.createdAt = data.createdAt || new Date().toISOString();
      data.updatedAt = new Date().toISOString();
      const req = store.add(data);
      req.onsuccess = () => { if (typeof App !== 'undefined' && App.notifyTabSync) App.notifyTabSync(); resolve(req.result); };
      req.onerror = () => {
        if (req.error && req.error.name === 'QuotaExceededError') {
          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast('저장 공간이 부족합니다. 오래된 사진을 삭제하거나 데이터를 백업 후 정리해주세요.', 'error');
          }
        }
        reject(req.error);
      };
    });
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
      const req = this._idbStore(storeName, 'readwrite').put(data);
      req.onsuccess = () => { if (typeof App !== 'undefined' && App.notifyTabSync) App.notifyTabSync(); resolve(req.result); };
      req.onerror = () => {
        if (req.error && req.error.name === 'QuotaExceededError') {
          if (typeof App !== 'undefined' && App.showToast) {
            App.showToast('저장 공간이 부족합니다. 오래된 사진을 삭제하거나 데이터를 백업 후 정리해주세요.', 'error');
          }
        }
        reject(req.error);
      };
    });
  },

  async delete(storeName, id) {
    if (this.mode === 'server') {
      const res = await fetch(`/api/${storeName}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DB delete 실패: ${res.status}`);
      return;
    }
    return new Promise((resolve, reject) => {
      const req = this._idbStore(storeName, 'readwrite').delete(id);
      req.onsuccess = () => { if (typeof App !== 'undefined' && App.notifyTabSync) App.notifyTabSync(); resolve(); };
      req.onerror = () => reject(req.error);
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
      tx.oncomplete = () => resolve();
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

  validateBackup(data) {
    if (!data || typeof data !== 'object') return '유효하지 않은 백업 파일입니다.';
    // 미래 버전 백업 차단 (앱 업데이트 필요)
    if (typeof data._version === 'number' && data._version > this.version) {
      return `이 백업은 더 최신 버전(v${data._version})에서 생성되었습니다. 앱을 업데이트한 후 다시 시도해주세요.`;
    }
    const validStores = Object.keys(data).filter(k => !k.startsWith('_') && this.stores[k]);
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

    const storeNames = Object.keys(data).filter(
      k => !k.startsWith('_') && this.stores[k] && Array.isArray(data[k])
    );

    const CHUNK_SIZE = 500; // 사진 5만 장 + 트랜잭션 시간 초과 방지
    const totalItems = storeNames.reduce((sum, s) => sum + (data[s] ? data[s].length : 0), 0);
    let processed = 0;

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
      throw new Error('기존 데이터 정리 중 오류가 발생했습니다.');
    }

    // 3. 스토어별로 청크 단위 insert (트랜잭션 시간 초과 방지)
    for (const storeName of storeNames) {
      const items = data[storeName];
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        try {
          await new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            for (const item of chunk) {
              if (storeName === 'settings' && !item.key) continue;
              // photos: export 시 Blob을 base64로 직렬화한 데이터 → 다시 Blob으로 복원 (저장 공간 33% 절약)
              if (storeName === 'photos' && item.data && typeof item.data === 'string' && item.data.startsWith('data:')) {
                try {
                  const parts = item.data.split(',');
                  const mime = parts[0].match(/:(.*?);/)[1];
                  const binary = atob(parts[1]);
                  const arr = new Uint8Array(binary.length);
                  for (let j = 0; j < binary.length; j++) arr[j] = binary.charCodeAt(j);
                  item.data = new Blob([arr], { type: mime });
                } catch (e) {
                  console.warn('photo blob 복원 실패, 문자열로 저장:', item.id, e);
                }
              }
              try {
                store.add(item);
              } catch (e) {
                console.warn(`importAll: skipped bad item in ${storeName}`, e);
              }
            }
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
          processed += chunk.length;
          if (onProgress) {
            try { onProgress({ processed, total: totalItems, store: storeName }); } catch (_) {}
          }
        } catch (e) {
          console.error(`importAll: ${storeName} chunk ${i}~${i + chunk.length} 실패:`, e);
          throw new Error(`${storeName} 저장 중 오류 (${processed}/${totalItems} 처리됨)`);
        }
      }
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
      for (const ph of photos) {
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
