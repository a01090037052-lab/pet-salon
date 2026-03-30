// ========== Dual-Mode Database Layer (Server API / IndexedDB) ==========
// Enhanced for 100K+ records with pagination, date-range queries, and photo-separated storage
const DB = {
  mode: 'idb', // 'server' or 'idb'
  db: null,
  name: 'PetGroomingShop',
  version: 4,

  stores: {
    customers: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'name', keyPath: 'name' }, { name: 'phone', keyPath: 'phone' }] },
    pets: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'name', keyPath: 'name' }] },
    services: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'name', keyPath: 'name' }, { name: 'isActive', keyPath: 'isActive' }] },
    appointments: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'petId', keyPath: 'petId' }, { name: 'date', keyPath: 'date' }, { name: 'status', keyPath: 'status' }] },
    records: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'petId', keyPath: 'petId' }, { name: 'date', keyPath: 'date' }] },
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
          console.log('DB: Server mode (data shared across devices)');
          return;
        }
      } catch (e) { /* server not available */ }
    }
    // Fall back to IndexedDB
    this.mode = 'idb';
    console.log('DB: IndexedDB mode (local only)');
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
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
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
      req.onsuccess = () => resolve(req.result);
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
      return await res.json();
    }
    return new Promise((resolve, reject) => {
      data.updatedAt = new Date().toISOString();
      const req = this._idbStore(storeName, 'readwrite').put(data);
      req.onsuccess = () => resolve(req.result);
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
      await fetch(`/api/${storeName}/${id}`, { method: 'DELETE' });
      return;
    }
    return new Promise((resolve, reject) => {
      const req = this._idbStore(storeName, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
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

  // ========== Existing Methods ==========

  async exportAll() {
    if (this.mode === 'server') {
      const res = await fetch('/api/export');
      return await res.json();
    }
    const data = {};
    for (const storeName of Object.keys(this.stores)) {
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
      data[storeName] = await this.getAll(storeName);
    }
    data._exportDate = new Date().toISOString();
    data._version = this.version;
    return data;
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
    const storeNames = Object.keys(data).filter(
      k => !k.startsWith('_') && this.stores[k] && Array.isArray(data[k])
    );

    const errors = [];
    let completed = 0;
    const total = storeNames.length;

    // 2. Process each store in a single transaction (clear + all adds)
    for (const storeName of storeNames) {
      try {
        const items = data[storeName];
        const tx = this.db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        for (const item of items) {
          try {
            if (storeName === 'settings' && !item.key) continue;
            store.add(item);
          } catch (e) {
            console.warn(`importAll: skipped bad item in ${storeName}`, e);
          }
        }
        await new Promise((resolve, reject) => {
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      } catch (e) {
        // 3. If any store fails, report error but continue with others
        console.error(`importAll: failed for ${storeName}`, e);
        errors.push({ store: storeName, error: e.message || String(e) });
      }
      completed++;
      // 4. Progress callback for UI
      if (onProgress) onProgress({ completed, total, storeName });
    }

    if (errors.length > 0) {
      console.warn('importAll completed with errors:', errors);
    }
  },

  async clearAll() {
    if (this.mode === 'server') {
      await fetch('/api/clear', { method: 'DELETE' });
      return;
    }
    for (const storeName of Object.keys(this.stores)) {
      const tx = this.db.transaction(storeName, 'readwrite');
      await new Promise((resolve, reject) => {
        const r = tx.objectStore(storeName).clear();
        r.onsuccess = resolve; r.onerror = () => reject(r.error);
      });
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
