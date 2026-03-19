// ========== Dual-Mode Database Layer (Server API / IndexedDB) ==========
const DB = {
  mode: 'idb', // 'server' or 'idb'
  db: null,
  name: 'PetGroomingShop',
  version: 2,

  stores: {
    customers: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'name', keyPath: 'name' }, { name: 'phone', keyPath: 'phone' }] },
    pets: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'name', keyPath: 'name' }] },
    services: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'name', keyPath: 'name' }, { name: 'isActive', keyPath: 'isActive' }] },
    appointments: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'petId', keyPath: 'petId' }, { name: 'date', keyPath: 'date' }, { name: 'status', keyPath: 'status' }] },
    records: { keyPath: 'id', autoIncrement: true, indexes: [{ name: 'customerId', keyPath: 'customerId' }, { name: 'petId', keyPath: 'petId' }, { name: 'date', keyPath: 'date' }] },
    settings: { keyPath: 'key' }
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
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
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
      req.onerror = () => reject(req.error);
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
      req.onerror = () => reject(req.error);
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

  async search(storeName, fields, query) {
    const all = await this.getAll(storeName);
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter(item => fields.some(f => item[f] && String(item[f]).toLowerCase().includes(q)));
  },

  async exportAll() {
    if (this.mode === 'server') {
      const res = await fetch('/api/export');
      return await res.json();
    }
    const data = {};
    for (const storeName of Object.keys(this.stores)) {
      data[storeName] = await this.getAll(storeName);
    }
    data._exportDate = new Date().toISOString();
    data._version = this.version;
    return data;
  },

  async importAll(data) {
    if (this.mode === 'server') {
      await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return;
    }
    for (const [storeName, items] of Object.entries(data)) {
      if (storeName.startsWith('_') || !this.stores[storeName] || !Array.isArray(items)) continue;
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      await new Promise((resolve, reject) => { store.clear(); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
      for (const item of items) {
        const addTx = this.db.transaction(storeName, 'readwrite');
        await new Promise((resolve, reject) => {
          const r = addTx.objectStore(storeName).add(item);
          r.onsuccess = resolve; r.onerror = () => reject(r.error);
        });
      }
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
  }
};
