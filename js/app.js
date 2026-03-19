// ========== Main Application Controller ==========
const App = {
  currentPage: 'dashboard',
  pages: {},

  async init() {
    try {
      await DB.init();
      this.setupNavigation();
      this.setupSidebar();
      this.setupModal();
      this.setupFAB();
      this.setupKeyboard();
      this.setupBottomNav();
      this.registerSW();
      this.handleRoute();
      window.addEventListener('hashchange', () => this.handleRoute());
      await this.updateBadges();
      await this.applyShopName();
      // 예약 알림 체커 시작
      await this.setupNotificationChecker();
      // Hide loading screen
      setTimeout(() => {
        document.getElementById('loading-screen')?.classList.add('hidden');
      }, 300);
    } catch (err) {
      console.error('App init error:', err);
      document.getElementById('loading-screen')?.classList.add('hidden');
      this.showToast('앱 초기화 중 오류가 발생했습니다.', 'error');
    }
  },

  setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        const page = link.dataset.page;
        if (page) {
          document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
          link.classList.add('active');
        }
      });
    });
  },

  setupSidebar() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
    });
    // Restore sidebar state
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
      sidebar.classList.add('collapsed');
    }
  },

  setupModal() {
    document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
    document.getElementById('confirm-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeConfirm(false);
    });
    document.getElementById('confirm-cancel').addEventListener('click', () => this.closeConfirm(false));
  },

  setupFAB() {
    const fabBtn = document.getElementById('fab-btn');
    const fabMenu = document.getElementById('fab-menu');
    let isOpen = false;

    fabBtn.addEventListener('click', () => {
      isOpen = !isOpen;
      fabBtn.classList.toggle('open', isOpen);
      fabMenu.classList.toggle('open', isOpen);
    });

    // Close FAB when clicking outside
    document.addEventListener('click', (e) => {
      if (isOpen && !e.target.closest('.fab-container')) {
        isOpen = false;
        fabBtn.classList.remove('open');
        fabMenu.classList.remove('open');
      }
    });

    // FAB menu items
    document.querySelectorAll('.fab-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        isOpen = false;
        fabBtn.classList.remove('open');
        fabMenu.classList.remove('open');

        switch (action) {
          case 'customer':
            this.pages.customers?.showForm();
            break;
          case 'pet':
            this.pages.pets?.showForm();
            break;
          case 'appointment':
            this.pages.appointments?.showForm();
            break;
          case 'record':
            this.pages.records?.showForm();
            break;
        }
      });
    });
  },

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!document.getElementById('confirm-overlay').classList.contains('hidden')) {
          this.closeConfirm(false);
        } else if (!document.getElementById('modal-overlay').classList.contains('hidden')) {
          this.closeModal();
        }
      }
    });
  },

  setupBottomNav() {
    document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      });
    });
    // More menu toggle
    const moreBtn = document.getElementById('bottom-more-btn');
    const moreMenu = document.getElementById('bottom-more-menu');
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu.classList.toggle('open');
      });
      document.addEventListener('click', () => moreMenu?.classList.remove('open'));
      moreMenu.querySelectorAll('.bottom-more-item').forEach(item => {
        item.addEventListener('click', () => moreMenu.classList.remove('open'));
      });
    }
  },

  registerSW() {
    if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  },

  handleRoute() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const [page, ...params] = hash.split('/');
    this.currentPage = page;

    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });
    // Sync bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    this.renderPage(page, params);
  },

  async renderPage(page, params) {
    const pageModule = this.pages[page];
    if (pageModule && pageModule.render) {
      const content = document.getElementById('page-content');
      // Fade transition
      content.style.animation = 'none';
      content.offsetHeight; // trigger reflow
      content.style.animation = 'pageIn 0.3s ease';

      try {
        await pageModule.render(content, params);
        if (pageModule.init) {
          await pageModule.init(params);
        }
        // Auto-format phone inputs
        this.setupPhoneInputs();
      } catch (err) {
        console.error(`Page render error (${page}):`, err);
        content.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">&#x26A0;</div>
            <div class="empty-state-text">페이지를 불러오는 중 오류가 발생했습니다.</div>
            <button class="btn btn-primary" onclick="App.navigate('dashboard')">대시보드로 이동</button>
          </div>`;
      }
    }
  },

  navigate(page) {
    window.location.hash = page;
  },

  // ========== Badges ==========
  async updateBadges() {
    try {
      const today = this.getToday();
      const appointments = await DB.getAll('appointments');
      const todayCount = appointments.filter(a => a.date === today && a.status !== 'cancelled' && a.status !== 'completed').length;
      // Sidebar badge
      const badge = document.getElementById('badge-appointments');
      if (badge) {
        badge.textContent = todayCount;
        badge.style.display = todayCount > 0 ? 'flex' : 'none';
      }
      // Bottom nav badge
      const bbadge = document.getElementById('bottom-badge');
      if (bbadge) {
        bbadge.textContent = todayCount;
        bbadge.style.display = todayCount > 0 ? 'flex' : 'none';
      }
    } catch (e) { /* ignore */ }
  },

  // ========== Modal ==========
  showModal(options) {
    const { title, content, onSave, size, hideFooter, saveText } = options;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;

    const modal = document.getElementById('modal');
    modal.classList.toggle('modal-lg', size === 'lg');

    const footer = document.getElementById('modal-footer');
    footer.style.display = hideFooter ? 'none' : 'flex';

    const saveBtn = document.getElementById('modal-save');
    saveBtn.textContent = saveText || '저장';
    saveBtn.onclick = onSave ? async () => {
      saveBtn.classList.add('loading');
      saveBtn.textContent = '저장 중...';
      try {
        await onSave();
      } catch (err) {
        console.error('Save error:', err);
        App.showToast('저장 중 오류가 발생했습니다.', 'error');
      } finally {
        saveBtn.classList.remove('loading');
        saveBtn.textContent = saveText || '저장';
      }
    } : null;

    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('animate-in');

    // Auto-format phone inputs inside modal
    setTimeout(() => this.setupPhoneInputs(), 50);

    // Focus first input
    setTimeout(() => {
      const firstInput = document.querySelector('#modal-body input:not([type="hidden"]):not([type="checkbox"]), #modal-body select');
      firstInput?.focus();
    }, 100);

    // Enter key to save
    const modalBody = document.getElementById('modal-body');
    modalBody.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        const saveBtn = document.getElementById('modal-save');
        if (saveBtn && saveBtn.onclick) saveBtn.click();
      }
    });
  },

  closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('animate-in');
    document.getElementById('modal-body').innerHTML = '';
    document.getElementById('modal-save').onclick = null;
  },

  // ========== Confirm Dialog ==========
  _confirmResolve: null,

  confirm(message) {
    return new Promise((resolve) => {
      this._confirmResolve = resolve;
      document.getElementById('confirm-body').innerHTML = `<p>${message}</p>`;
      const overlay = document.getElementById('confirm-overlay');
      overlay.classList.remove('hidden');
      document.getElementById('confirm-ok').onclick = () => this.closeConfirm(true);
      // Focus confirm button
      setTimeout(() => document.getElementById('confirm-ok')?.focus(), 100);
    });
  },

  closeConfirm(result) {
    document.getElementById('confirm-overlay').classList.add('hidden');
    if (this._confirmResolve) {
      this._confirmResolve(result);
      this._confirmResolve = null;
    }
  },

  // ========== Toast ==========
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2800);

    // Update badges after data changes
    if (type === 'success') {
      setTimeout(() => this.updateBadges(), 200);
    }
  },

  // ========== Phone Auto-Format ==========
  setupPhoneInputs() {
    document.querySelectorAll('input[type="tel"]').forEach(input => {
      if (input.dataset.formatted) return;
      input.dataset.formatted = 'true';
      input.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, '');
        if (val.length > 11) val = val.slice(0, 11);
        if (val.length >= 8) {
          e.target.value = val.replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3').replace(/-$/, '');
        } else if (val.length >= 4) {
          e.target.value = val.replace(/(\d{3})(\d{0,4})/, '$1-$2');
        }
      });
    });
  },

  // ========== Utility Functions ==========
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${this.formatDate(dateStr)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  formatCurrency(amount) {
    if (amount == null || isNaN(amount)) return '0원';
    return Number(amount).toLocaleString('ko-KR') + '원';
  },

  formatPhone(phone) {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  },

  getToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  getDaysAgo(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    return diff;
  },

  getRelativeTime(dateStr) {
    const days = this.getDaysAgo(dateStr);
    if (days === null) return '-';
    if (days === 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return `${days}일 전`;
    if (days < 30) return `${Math.floor(days / 7)}주 전`;
    if (days < 365) return `${Math.floor(days / 30)}개월 전`;
    return `${Math.floor(days / 365)}년 전`;
  },

  getGreeting() {
    const h = new Date().getHours();
    if (h < 6) return '새벽에도 수고하세요';
    if (h < 12) return '좋은 아침이에요';
    if (h < 14) return '점심 맛있게 드세요';
    if (h < 18) return '오후도 화이팅';
    if (h < 22) return '오늘 하루도 수고했어요';
    return '늦은 시간까지 고생이에요';
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  async getCustomerOptions(selectedId) {
    const customers = await DB.getAll('customers');
    return customers
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${this.escapeHtml(c.name)} (${this.formatPhone(c.phone)})</option>`)
      .join('');
  },

  // Render searchable customer select
  async renderCustomerSelect(containerId, selectedId, onChange) {
    const customers = await DB.getAll('customers');
    const sorted = customers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    const container = document.getElementById(containerId);
    if (!container) return;

    const selected = selectedId ? sorted.find(c => c.id === selectedId) : null;
    container.innerHTML = `
      <div class="search-select">
        <input type="text" id="${containerId}-input" placeholder="고객 이름 또는 전화번호 검색..."
          value="${selected ? this.escapeHtml(selected.name) + ' (' + this.formatPhone(selected.phone) + ')' : ''}"
          autocomplete="off">
        <input type="hidden" id="${containerId}-value" value="${selectedId || ''}">
        <div class="search-select-dropdown" id="${containerId}-dropdown"></div>
      </div>
    `;

    const input = document.getElementById(`${containerId}-input`);
    const hidden = document.getElementById(`${containerId}-value`);
    const dropdown = document.getElementById(`${containerId}-dropdown`);

    const renderOptions = (query) => {
      const q = (query || '').toLowerCase();
      const filtered = q ? sorted.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
      ) : sorted;

      if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="search-select-option"><span style="color:var(--text-muted)">검색 결과 없음</span></div>';
      } else {
        dropdown.innerHTML = filtered.slice(0, 20).map(c =>
          `<div class="search-select-option" data-id="${c.id}" data-name="${this.escapeHtml(c.name)} (${this.formatPhone(c.phone)})">
            ${this.escapeHtml(c.name)} <span class="sub">${this.formatPhone(c.phone)}</span>
          </div>`
        ).join('');
      }
      dropdown.classList.add('open');
    };

    input.addEventListener('focus', () => renderOptions(input.value));
    input.addEventListener('input', () => {
      hidden.value = '';
      renderOptions(input.value);
      if (onChange) onChange('');
    });

    dropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.search-select-option');
      if (opt && opt.dataset.id) {
        hidden.value = opt.dataset.id;
        input.value = opt.dataset.name;
        dropdown.classList.remove('open');
        if (onChange) onChange(Number(opt.dataset.id));
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest(`#${containerId}`)) dropdown.classList.remove('open');
    });
  },

  async getPetOptions(customerId, selectedId) {
    if (!customerId) return '<option value="">먼저 고객을 선택하세요</option>';
    const pets = await DB.getByIndex('pets', 'customerId', Number(customerId));
    if (pets.length === 0) return '<option value="">등록된 반려견이 없습니다</option>';
    return pets
      .map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${this.escapeHtml(p.name)} (${this.escapeHtml(p.breed || '')})</option>`)
      .join('');
  },

  async getServiceCheckboxes(selectedIds = []) {
    const services = await DB.getAll('services');
    const active = services.filter(s => s.isActive !== false);
    if (active.length === 0) return '<p style="color:var(--text-muted)">등록된 서비스가 없습니다. 서비스 메뉴에서 먼저 등록해주세요.</p>';
    return active.map(s => `
      <label class="checkbox-label">
        <input type="checkbox" name="serviceIds" value="${s.id}"
          ${selectedIds.includes(s.id) ? 'checked' : ''}
          data-price-small="${s.priceSmall || 0}"
          data-price-medium="${s.priceMedium || 0}"
          data-price-large="${s.priceLarge || 0}">
        ${this.escapeHtml(s.name)}
        <span style="color:var(--text-muted);font-size:0.78rem;margin-left:auto">
          소${this.formatCurrency(s.priceSmall)} / 중${this.formatCurrency(s.priceMedium)} / 대${this.formatCurrency(s.priceLarge)}
        </span>
      </label>
    `).join('');
  },

  async getServiceNames(serviceIds) {
    if (!serviceIds || serviceIds.length === 0) return '-';
    const services = await DB.getAll('services');
    const map = {};
    services.forEach(s => map[s.id] = s.name);
    return serviceIds.map(id => map[id] || '알 수 없음').join(', ');
  },

  // Get groomer dropdown options
  async getGroomerOptions(selected) {
    const groomers = await DB.getSetting('groomers');
    if (!groomers || groomers.length === 0) return '<option value="">미용사 직접 입력</option>';
    return groomers.map(g => `<option value="${this.escapeHtml(g)}" ${g === selected ? 'selected' : ''}>${this.escapeHtml(g)}</option>`).join('') + '<option value="">직접 입력...</option>';
  },

  // Apply shop name throughout the app
  async applyShopName() {
    const name = await DB.getSetting('shopName');
    const display = name || '펫살롱';
    document.title = `${display} - 애견 미용 고객 관리`;
    const logo = document.querySelector('.logo');
    if (logo) logo.innerHTML = `&#x2702; ${this.escapeHtml(display)}`;
  },

  // ========== 예약 알림 시스템 ==========
  _notifInterval: null,
  _notifiedAppts: new Set(),

  async setupNotificationChecker() {
    // 기존 인터벌 정리
    if (this._notifInterval) {
      clearInterval(this._notifInterval);
      this._notifInterval = null;
    }

    const enabled = await DB.getSetting('notifEnabled');
    if (!enabled) return;

    // 브라우저 알림 지원 확인
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    // 1분마다 체크
    this._notifInterval = setInterval(() => this.checkUpcomingAppointments(), 60000);
    // 즉시 한번 실행
    this.checkUpcomingAppointments();
  },

  async checkUpcomingAppointments() {
    try {
      const enabled = await DB.getSetting('notifEnabled');
      if (!enabled) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const minutes = Number(await DB.getSetting('notifMinutes')) || 30;
      const now = new Date();
      const today = this.getToday();
      const appointments = await DB.getAll('appointments');

      for (const appt of appointments) {
        if (appt.date !== today || !appt.time) continue;
        if (appt.status === 'cancelled' || appt.status === 'completed') continue;

        // 알림 키 (중복 방지)
        const key = `${appt.id}-${appt.date}-${appt.time}`;
        if (this._notifiedAppts.has(key)) continue;

        // 예약 시간 계산
        const [h, m] = appt.time.split(':').map(Number);
        const apptTime = new Date(now);
        apptTime.setHours(h, m, 0, 0);

        const diffMs = apptTime.getTime() - now.getTime();
        const diffMin = diffMs / (1000 * 60);

        // 설정된 시간 전~예약 시간 사이에 알림
        if (diffMin > 0 && diffMin <= minutes) {
          this._notifiedAppts.add(key);

          // 고객/반려견 이름 조회
          let customerName = '고객';
          let petName = '반려견';
          try {
            const customer = await DB.get('customers', appt.customerId);
            const pet = await DB.get('pets', appt.petId);
            if (customer) customerName = customer.name;
            if (pet) petName = pet.name;
          } catch (e) { /* ignore */ }

          const minLeft = Math.round(diffMin);
          new Notification('예약 알림 - 펫살롱', {
            body: `${minLeft}분 후 예약: ${customerName}님의 ${petName} (${appt.time})`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%236366F1"/><text x="50" y="68" font-size="55" text-anchor="middle" fill="white">✂</text></svg>',
            tag: key
          });
        }
      }
    } catch (e) {
      // 알림 체크 오류 무시
    }
  },

  // Check auto-backup
  async checkBackup() {
    const lastBackup = await DB.getSetting('lastBackupDate');
    if (!lastBackup) return true; // never backed up
    const days = this.getDaysAgo(lastBackup);
    return days >= 7;
  }
};
