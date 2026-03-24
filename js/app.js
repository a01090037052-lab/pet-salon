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
      this.setupGlobalSearch();
      this.setupLightbox();
      this.registerSW();
      this.handleRoute();
      window.addEventListener('hashchange', () => this.handleRoute());
      await this.updateBadges();
      await this.applyShopName();
      await this.applyTheme();
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
    // FAB removed - bottom nav "+" button replaces this
  },

  setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close search overlay first if open
        const searchOverlay = document.getElementById('global-search-overlay');
        if (searchOverlay && !searchOverlay.classList.contains('hidden')) {
          this.closeSearch();
          return;
        }
        if (!document.getElementById('confirm-overlay').classList.contains('hidden')) {
          this.closeConfirm(false);
        } else if (!document.getElementById('modal-overlay').classList.contains('hidden')) {
          this.closeModal();
        }
      }
      // "/" shortcut to open search (when not in input/textarea/select)
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          this.openSearch();
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

    // Bottom nav add button (quick actions)
    const addBtn = document.getElementById('bottom-nav-add');
    const addMenu = document.getElementById('bottom-nav-add-menu');
    if (addBtn && addMenu) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addMenu.classList.toggle('open');
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#bottom-nav-add') && !e.target.closest('#bottom-nav-add-menu')) {
          addMenu.classList.remove('open');
        }
      });
      addMenu.querySelectorAll('.bottom-add-item').forEach(item => {
        item.addEventListener('click', () => {
          addMenu.classList.remove('open');
          const action = item.dataset.action;
          switch (action) {
            case 'customer': this.pages.customers?.showForm(); break;
            case 'pet': this.pages.pets?.showForm(); break;
            case 'appointment': this.pages.appointments?.showForm(); break;
            case 'record': this.pages.records?.showForm(); break;
          }
        });
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
    window.scrollTo(0, 0);
    document.getElementById('main-content').scrollTop = 0;
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
      // 효율적 쿼리: 오늘 날짜의 예약만 인덱스로 조회 (전체 로드 대신)
      const todayAppointments = await DB.getByIndex('appointments', 'date', today);
      const todayCount = todayAppointments.filter(a => a.status !== 'cancelled' && a.status !== 'completed').length;
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
    this._lastFocusedElement = document.activeElement;
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

    // Mobile drag-to-close
    if (window.innerWidth <= 768) {
      const modal = document.getElementById('modal');
      const header = modal.querySelector('.modal-header');
      let startY = 0, dy = 0;
      const onStart = (e) => { startY = e.touches[0].clientY; modal.style.transition = 'none'; };
      const onMove = (e) => { dy = e.touches[0].clientY - startY; if (dy > 0) modal.style.transform = `translateY(${dy}px)`; };
      const onEnd = () => { modal.style.transition = ''; if (dy > 100) { this.closeModal(); } modal.style.transform = ''; dy = 0; };
      header.addEventListener('touchstart', onStart, { passive: true });
      header.addEventListener('touchmove', onMove, { passive: true });
      header.addEventListener('touchend', onEnd);
      this._modalDragCleanup = () => {
        header.removeEventListener('touchstart', onStart);
        header.removeEventListener('touchmove', onMove);
        header.removeEventListener('touchend', onEnd);
      };
    }

    // Auto-format phone inputs inside modal
    setTimeout(() => this.setupPhoneInputs(), 50);

    // Focus first input
    setTimeout(() => {
      const firstInput = document.querySelector('#modal-body input:not([type="hidden"]):not([type="checkbox"]), #modal-body select');
      firstInput?.focus();
    }, 100);

    // Enter key to save (use onkeydown to avoid listener accumulation)
    const modalBody = document.getElementById('modal-body');
    modalBody.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        const saveBtn = document.getElementById('modal-save');
        if (saveBtn && saveBtn.onclick) saveBtn.click();
      }
    };
  },

  closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    overlay.classList.remove('animate-in');
    const modalBody = document.getElementById('modal-body');
    modalBody.onkeydown = null;
    modalBody.innerHTML = '';
    document.getElementById('modal-save').onclick = null;
    if (this._modalDragCleanup) { this._modalDragCleanup(); this._modalDragCleanup = null; }
    if (this._lastFocusedElement) {
      try { this._lastFocusedElement.focus(); } catch(e) {}
      this._lastFocusedElement = null;
    }
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

  closeConfirm(result = false) {
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
    toast.innerHTML = `<span>${message}</span><button class="toast-dismiss" onclick="this.parentElement.style.animation='toastOut 0.3s ease forwards';setTimeout(()=>this.parentElement.remove(),300)">&times;</button>`;
    container.appendChild(toast);

    // Duration based on type: success=2.5s, info=2s, error=5s
    const duration = type === 'error' ? 5000 : type === 'info' ? 2000 : 2500;
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);

    // Update badges after data changes
    if (type === 'success') {
      setTimeout(() => this.updateBadges(), 200);
      App._dashboardDirty = true;
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

  // ========== Field Validation Highlight ==========
  highlightField(elementId, errorMessage) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.add('field-error');
    // Add error message
    if (errorMessage) {
      let msg = el.parentElement?.querySelector('.field-error-msg');
      if (!msg) {
        msg = document.createElement('div');
        msg.className = 'field-error-msg';
        el.parentElement?.appendChild(msg);
      }
      msg.textContent = errorMessage;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const removeError = () => {
      el.classList.remove('field-error');
      el.parentElement?.querySelector('.field-error-msg')?.remove();
      el.removeEventListener('input', removeError);
      el.removeEventListener('change', removeError);
    };
    el.addEventListener('input', removeError);
    el.addEventListener('change', removeError);
    setTimeout(() => removeError(), 5000);
  },

  // ========== Utility Functions ==========
  getRecordAmount(r) {
    return Number(r.finalPrice != null ? r.finalPrice : r.totalPrice) || 0;
  },

  formatLocalDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

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
    const day = new Date().getDay();
    const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const todayName = dayNames[day];
    if (h < 6) return '새벽에도 수고하세요 🌙';
    if (h < 9) return `${todayName} 아침, 오늘도 화이팅!`;
    if (h < 12) return '좋은 오전이에요 ☀️';
    if (h < 14) return '맛있는 점심 드세요 🍽';
    if (h < 18) return '오후도 힘내세요 💪';
    if (h < 21) return '오늘 하루 수고했어요 ✨';
    return '편안한 밤 보내세요 🌙';
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
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
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
      // Add "new customer" option at the bottom
      dropdown.innerHTML += '<div class="search-select-option search-select-add" style="color:var(--primary);font-weight:700;border-top:1px solid var(--border)">+ 새 고객 등록</div>';
      dropdown.classList.add('open');
    };

    input.addEventListener('focus', () => {
      renderOptions(input.value);
      // Scroll input into view above keyboard on mobile
      setTimeout(() => {
        input.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    });
    input.addEventListener('input', () => {
      hidden.value = '';
      renderOptions(input.value);
      if (onChange) onChange('');
    });

    dropdown.addEventListener('click', (e) => {
      const addOpt = e.target.closest('.search-select-add');
      if (addOpt) {
        dropdown.classList.remove('open');
        // afterSaveCallback: 고객 저장 후 선택 필드에 자동 반영
        App.pages.customers?.showForm(null, async (newCustomerId) => {
          const newCustomer = await DB.get('customers', newCustomerId);
          if (newCustomer) {
            hidden.value = newCustomerId;
            input.value = App.escapeHtml(newCustomer.name) + ' (' + App.formatPhone(newCustomer.phone) + ')';
            if (onChange) onChange(newCustomerId);
          }
        });
        return;
      }
      const opt = e.target.closest('.search-select-option');
      if (opt && opt.dataset.id) {
        hidden.value = opt.dataset.id;
        input.value = opt.dataset.name;
        dropdown.classList.remove('open');
        if (onChange) onChange(Number(opt.dataset.id));
      }
    });

    const outsideClickHandler = (e) => {
      if (!e.target.closest(`#${containerId}`)) dropdown.classList.remove('open');
    };
    if (container._outsideClickHandler) {
      document.removeEventListener('click', container._outsideClickHandler);
    }
    container._outsideClickHandler = outsideClickHandler;
    document.addEventListener('click', outsideClickHandler);
  },

  async getPetOptions(customerId, selectedId) {
    if (!customerId) return '<option value="">먼저 고객을 선택하세요</option>';
    const pets = await DB.getByIndex('pets', 'customerId', Number(customerId));
    if (pets.length === 0) return '<option value="">등록된 반려견이 없습니다</option>';
    return pets
      .map(p => `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${this.escapeHtml(p.name)} (${this.escapeHtml(p.breed || '')})</option>`)
      .join('');
  },

  // 가격을 축약 표시 (예: 50000 -> "5만", 15000 -> "1.5만")
  formatPriceShort(price) {
    const p = Number(price) || 0;
    if (p === 0) return '';
    if (p >= 10000) {
      const man = p / 10000;
      return (man % 1 === 0 ? man : man.toFixed(1)) + '만';
    }
    return p.toLocaleString() + '원';
  },

  async getServiceCheckboxes(selectedIds = [], sizeType) {
    const services = await DB.getAll('services');
    const active = services.filter(s => s.isActive !== false);
    if (active.length === 0) return '<p style="color:var(--text-muted)">등록된 서비스가 없습니다. 서비스 메뉴에서 먼저 등록해주세요.</p>';
    // 현재 사이즈에 맞는 가격 표시 (기본 small)
    const size = sizeType || 'small';
    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:0.85rem;color:var(--text-secondary)">서비스 선택</span>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-toggle-services">전체 선택</button>
      </div>
      <div class="service-select-grid">
    `;
    html += active.map(s => {
      const checked = selectedIds.includes(s.id);
      const price = Number(s['price' + size.charAt(0).toUpperCase() + size.slice(1)]) || 0;
      return `
        <label class="service-chip${checked ? ' checked' : ''}">
          <input type="checkbox" name="serviceIds" value="${s.id}"
            ${checked ? 'checked' : ''}
            data-price-small="${s.priceSmall || 0}"
            data-price-medium="${s.priceMedium || 0}"
            data-price-large="${s.priceLarge || 0}">
          <span class="service-chip-name">${this.escapeHtml(s.name)}</span>
          <span class="service-chip-price">${this.formatPriceShort(price)}</span>
        </label>`;
    }).join('');
    html += '</div>';
    return html;
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

  async applyTheme(color) {
    if (!color) color = await DB.getSetting('themeColor');
    if (!color) return;
    const r = document.documentElement;
    r.style.setProperty('--primary', color);
    // Derive hover (darken by ~10%)
    const hex = color.replace('#', '');
    const num = parseInt(hex, 16);
    const dr = Math.max(0, ((num >> 16) & 0xFF) - 25);
    const dg = Math.max(0, ((num >> 8) & 0xFF) - 25);
    const db = Math.max(0, (num & 0xFF) - 25);
    r.style.setProperty('--primary-hover', `#${((1 << 24) + (dr << 16) + (dg << 8) + db).toString(16).slice(1)}`);
    // Derive light (mix with white ~90%)
    const lr = Math.round(((num >> 16) & 0xFF) * 0.1 + 255 * 0.9);
    const lg = Math.round(((num >> 8) & 0xFF) * 0.1 + 255 * 0.9);
    const lb = Math.round((num & 0xFF) * 0.1 + 255 * 0.9);
    r.style.setProperty('--primary-light', `#${((1 << 24) + (lr << 16) + (lg << 8) + lb).toString(16).slice(1)}`);
    r.style.setProperty('--primary-lighter', `#${((1 << 24) + (Math.round(lr * 0.97) << 16) + (Math.round(lg * 0.97) << 8) + Math.round(lb * 0.97)).toString(16).slice(1)}`);
    // Sidebar active
    r.style.setProperty('--sidebar-active', color);
    // Meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
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
      // 효율적 쿼리: 오늘 날짜의 예약만 인덱스로 조회
      const appointments = await DB.getByIndex('appointments', 'date', today);

      for (const appt of appointments) {
        if (!appt.time) continue;
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

  // ========== Global Quick Search ==========
  _searchData: null,
  _searchDebounceTimer: null,

  setupGlobalSearch() {
    const btn = document.getElementById('global-search-btn');
    const overlay = document.getElementById('global-search-overlay');
    const input = document.getElementById('global-search-input');
    const closeBtn = document.getElementById('global-search-close');

    if (!btn || !overlay) return;

    btn.addEventListener('click', () => this.openSearch());
    closeBtn.addEventListener('click', () => this.closeSearch());

    // Close on background click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeSearch();
    });

    // Real-time search on input
    input.addEventListener('input', () => {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = setTimeout(() => {
        this.performSearch(input.value.trim());
      }, 80);
    });
  },

  async openSearch() {
    const overlay = document.getElementById('global-search-overlay');
    const input = document.getElementById('global-search-input');
    if (!overlay) return;

    // Preload data for instant search (lightweight - no photo/memo fields)
    try {
      const [customers, pets, records, services] = await Promise.all([
        DB.getAll('customers'),
        DB.getAllLight('pets', ['photo', 'preferredStyle']),
        DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo']),
        DB.getAll('services')
      ]);

      // Build lookup maps
      const petsByCustomer = {};
      pets.forEach(p => {
        if (!petsByCustomer[p.customerId]) petsByCustomer[p.customerId] = [];
        petsByCustomer[p.customerId].push(p);
      });

      const recordsByCustomer = {};
      records.forEach(r => {
        if (!recordsByCustomer[r.customerId]) recordsByCustomer[r.customerId] = [];
        recordsByCustomer[r.customerId].push(r);
      });
      // Sort records desc by date for each customer
      for (const cid of Object.keys(recordsByCustomer)) {
        recordsByCustomer[cid].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      }

      const serviceMap = {};
      services.forEach(s => { serviceMap[s.id] = s.name; });

      const petMap = {};
      pets.forEach(p => { petMap[p.id] = p; });

      this._searchData = { customers, petsByCustomer, recordsByCustomer, serviceMap, petMap };
    } catch (err) {
      console.error('Search data load error:', err);
      this._searchData = null;
    }

    overlay.classList.remove('hidden');
    overlay.classList.add('animate-in');
    input.value = '';
    document.getElementById('global-search-results').innerHTML = '';

    history.pushState({ searchOpen: true }, '');
    this._searchPopHandler = () => { this.closeSearch(); };
    window.addEventListener('popstate', this._searchPopHandler, { once: true });

    // Auto-focus
    setTimeout(() => input.focus(), 50);
  },

  closeSearch() {
    const overlay = document.getElementById('global-search-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('animate-in');
    this._searchData = null;
    document.getElementById('global-search-results').innerHTML = '';
    if (this._searchPopHandler) {
      window.removeEventListener('popstate', this._searchPopHandler);
      this._searchPopHandler = null;
    }
  },

  performSearch(query) {
    const resultsContainer = document.getElementById('global-search-results');
    if (!resultsContainer || !this._searchData) return;

    if (!query) {
      resultsContainer.innerHTML = '';
      return;
    }

    const { customers, petsByCustomer } = this._searchData;
    const q = query.toLowerCase();
    const qDigits = query.replace(/\D/g, '');

    const matched = customers.filter(c => {
      // Match by name
      if ((c.name || '').toLowerCase().includes(q)) return true;
      // Match by phone (including partial - last digits)
      const phoneDigits = (c.phone || '').replace(/\D/g, '');
      if (qDigits && phoneDigits.includes(qDigits)) return true;
      // Match by pet name
      const cPets = petsByCustomer[c.id] || [];
      if (cPets.some(p => (p.name || '').toLowerCase().includes(q))) return true;
      return false;
    });

    if (matched.length === 0) {
      resultsContainer.innerHTML = `
        <div class="gs-no-results">
          <div class="gs-no-results-icon">&#x1F50D;</div>
          <div class="gs-no-results-text">검색 결과 없음</div>
          <button class="btn btn-primary" id="gs-new-customer-btn">+ 새 고객 등록</button>
        </div>`;
      document.getElementById('gs-new-customer-btn')?.addEventListener('click', () => {
        App.closeSearch();
        App.pages.customers?.showForm(null, async (newCustomerId) => {
          const newCustomer = await DB.get('customers', newCustomerId);
          const customerName = newCustomer ? newCustomer.name : '';
          App.showToast(`${customerName} 고객이 등록되었습니다.`);
        });
      });
      return;
    }

    // If only 1 result, auto-expand the detail card
    if (matched.length === 1) {
      this._renderSearchCard(resultsContainer, matched[0]);
      return;
    }

    // Multiple results - show list
    resultsContainer.innerHTML = matched.slice(0, 20).map(c => {
      const cPets = petsByCustomer[c.id] || [];
      const petNames = cPets.map(p => p.name).join(', ');
      const initial = c.name ? c.name.charAt(0) : '?';
      return `
        <div class="gs-result-item" tabindex="0" data-customer-id="${c.id}">
          <div class="gs-result-avatar">${this.escapeHtml(initial)}</div>
          <div class="gs-result-info" style="flex:1">
            <div class="gs-result-name">${this.escapeHtml(c.name)}</div>
            <div class="gs-result-phone">${this.formatPhone(c.phone)}</div>
            ${petNames ? `<div class="gs-result-pets">${this.escapeHtml(petNames)}</div>` : ''}
          </div>
          <button class="btn-icon" onclick="event.stopPropagation();App.closeSearch();App.pages.appointments.showForm(null,${c.id})" title="예약" style="color:var(--primary);font-size:1.1rem;flex-shrink:0">&#x1F4C5;</button>
          <div class="gs-result-arrow">&#x276F;</div>
        </div>`;
    }).join('');

    // Click handler for result items
    resultsContainer.querySelectorAll('.gs-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const cid = Number(item.dataset.customerId);
        const customer = matched.find(c => c.id === cid);
        if (customer) {
          this._renderSearchCard(resultsContainer, customer);
        }
      });
    });
  },

  _renderSearchCard(container, customer) {
    const { petsByCustomer, recordsByCustomer, serviceMap, petMap } = this._searchData;
    const cPets = petsByCustomer[customer.id] || [];
    const cRecords = recordsByCustomer[customer.id] || [];
    const recentRecords = cRecords.slice(0, 3);

    // Calculate unpaid balance
    const unpaidRecords = cRecords.filter(r => r.paymentMethod === 'unpaid');
    const unpaidBalance = unpaidRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    const phoneClean = (customer.phone || '').replace(/\D/g, '');

    // Build pets HTML
    let petsHtml = '';
    if (cPets.length > 0) {
      petsHtml = `
        <div class="gs-card-section">
          <div class="gs-card-section-title">&#x1F415; 반려견</div>
          ${cPets.map(p => {
            const hasPhoto = p.photo;
            const photoHtml = hasPhoto
              ? `<img src="${p.photo}" alt="${this.escapeHtml(p.name)}">`
              : '&#x1F436;';
            const details = [p.breed, p.weight ? p.weight + 'kg' : null].filter(Boolean).join(' | ');
            const notes = [p.temperament, p.healthNotes, p.allergies].filter(Boolean);
            return `
              <div class="gs-pet-item">
                <div class="gs-pet-photo">${photoHtml}</div>
                <div class="gs-pet-info">
                  <div class="gs-pet-name">${this.escapeHtml(p.name)}</div>
                  ${details ? `<div class="gs-pet-detail">${this.escapeHtml(details)}</div>` : ''}
                  ${notes.length > 0 ? `<div class="gs-pet-notes">${notes.map(n => this.escapeHtml(n)).join(', ')}</div>` : ''}
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }

    // Build records HTML
    let recordsHtml = '';
    if (recentRecords.length > 0) {
      recordsHtml = `
        <div class="gs-card-section">
          <div class="gs-card-section-title">&#x1F4CB; 최근 미용 기록</div>
          ${recentRecords.map(r => {
            const sNames = (r.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ') || '-';
            const pet = petMap[r.petId];
            const petLabel = pet ? pet.name + ' | ' : '';
            return `
              <div class="gs-record-item">
                <span class="gs-record-date">${this.formatDate(r.date)}</span>
                <span class="gs-record-service">${this.escapeHtml(petLabel)}${this.escapeHtml(sNames)}</span>
                <span class="gs-record-amount">${this.formatCurrency(this.getRecordAmount(r))}</span>
              </div>`;
          }).join('')}
        </div>`;
    }

    // Unpaid balance section
    let unpaidHtml = '';
    if (unpaidBalance > 0) {
      unpaidHtml = `
        <div class="gs-card-section">
          <div class="gs-unpaid">
            <span class="gs-unpaid-label">&#x1F4B0; 미수금</span>
            <span class="gs-unpaid-amount">${this.formatCurrency(unpaidBalance)}</span>
          </div>
        </div>`;
    } else {
      unpaidHtml = `
        <div class="gs-card-section">
          <div style="display:flex;align-items:center;gap:6px;font-size:0.9rem;color:var(--success);font-weight:600">
            <span>&#x1F4B0;</span> 미수금: 0원
          </div>
        </div>`;
    }

    // Memo section
    let memoHtml = '';
    if (customer.memo) {
      memoHtml = `
        <div class="gs-card-section">
          <div class="gs-card-section-title">&#x1F4DD; 메모</div>
          <div class="gs-memo">${this.escapeHtml(customer.memo)}</div>
        </div>`;
    }

    // Show back link if there might be multiple results
    const showBack = document.getElementById('global-search-input')?.value.trim();

    container.innerHTML = `
      <div class="gs-customer-card">
        ${showBack ? `<button class="gs-back-link" id="gs-back-btn">&#x2190; 검색 결과로 돌아가기</button>` : ''}
        <div class="gs-card-header">
          <span class="gs-card-name">${this.escapeHtml(customer.name)}${this.pages.customers.getTagBadges(customer.tags)}</span>
          <a href="tel:${this.escapeHtml(phoneClean)}" class="gs-card-phone">${this.formatPhone(customer.phone)}</a>
        </div>
        <div class="gs-card-body">
          ${petsHtml}
          ${recordsHtml}
          ${unpaidHtml}
          ${memoHtml}
          <div class="gs-card-actions">
            <a href="tel:${this.escapeHtml(phoneClean)}" class="gs-action-btn">
              <span class="gs-action-btn-icon">&#x1F4DE;</span>
              <span>전화</span>
            </a>
            <a href="sms:${this.escapeHtml(phoneClean)}" class="gs-action-btn">
              <span class="gs-action-btn-icon">&#x1F4AC;</span>
              <span>문자</span>
            </a>
            <button class="gs-action-btn" id="gs-action-appt" data-customer-id="${customer.id}">
              <span class="gs-action-btn-icon">&#x1F4C5;</span>
              <span>예약</span>
            </button>
            <button class="gs-action-btn" id="gs-action-record" data-customer-id="${customer.id}">
              <span class="gs-action-btn-icon">&#x2702;</span>
              <span>미용기록</span>
            </button>
            <button class="gs-action-btn" id="gs-action-detail" data-customer-id="${customer.id}">
              <span class="gs-action-btn-icon">&#x1F4CB;</span>
              <span>상세</span>
            </button>
          </div>
        </div>
      </div>`;

    // Back button
    document.getElementById('gs-back-btn')?.addEventListener('click', () => {
      const q = document.getElementById('global-search-input')?.value.trim();
      if (q) this.performSearch(q);
    });

    // Appointment button
    document.getElementById('gs-action-appt')?.addEventListener('click', () => {
      const petId = cPets.length === 1 ? cPets[0].id : undefined;
      this.closeSearch();
      if (this.pages.appointments?.showForm) {
        this.pages.appointments.showForm(null, customer.id, petId ? { petId } : undefined);
      } else {
        this.navigate('appointments');
      }
    });

    // Record button
    document.getElementById('gs-action-record')?.addEventListener('click', () => {
      const petId = cPets.length === 1 ? cPets[0].id : undefined;
      this.closeSearch();
      if (this.pages.records?.showForm) {
        this.pages.records.showForm(null, { customerId: customer.id, petId: petId || undefined });
      }
    });

    // Detail button
    document.getElementById('gs-action-detail')?.addEventListener('click', () => {
      this.closeSearch();
      this.navigate('customers/' + customer.id);
    });
  },

  // Check auto-backup
  async checkBackup() {
    const lastBackup = await DB.getSetting('lastBackupDate');
    if (!lastBackup) return true; // never backed up
    const days = this.getDaysAgo(lastBackup);
    return days >= 30;
  },

  // ========== SMS Template System ==========
  async getSmsTemplate(type) {
    const templates = await DB.getSetting('messageTemplates');
    const defaults = {
      revisit: '[{매장명}] {고객명}님 안녕하세요! {반려견명}의 마지막 미용 후 {경과일수}일이 지났습니다. 예약 문의: {전화번호}',
      appointment: '[{매장명}] {고객명}님, {날짜} {시간}에 {반려견명} 예약이 확인되었습니다. 담당: {미용사}. 문의: {전화번호}',
      birthday: '[{매장명}] {고객명}님! {반려견명}의 생일을 축하합니다! 🎂 생일 기념 특별 할인을 준비했어요. 문의: {전화번호}',
      complete: '[{매장명}] {고객명}님, {반려견명}의 미용이 완료되었습니다! 서비스: {서비스}, 금액: {금액}원. 감사합니다! 💕'
    };
    return (templates && templates[type]) || defaults[type] || '';
  },

  // ========== Photo Lightbox ==========
  _lightboxImages: [],
  _lightboxIndex: 0,

  setupLightbox() {
    document.getElementById('lightbox-close').addEventListener('click', () => this.closeLightbox());
    document.querySelector('.lightbox-backdrop').addEventListener('click', () => this.closeLightbox());
    document.getElementById('lightbox-prev').addEventListener('click', () => this.lightboxNav(-1));
    document.getElementById('lightbox-next').addEventListener('click', () => this.lightboxNav(1));

    // Global click handler for photos with .photo-viewable class
    document.addEventListener('click', (e) => {
      const img = e.target.closest('.photo-viewable');
      if (img) {
        e.preventDefault();
        e.stopPropagation();
        const src = img.dataset.fullSrc || img.src;
        const caption = img.dataset.caption || '';
        const group = img.dataset.group || '';

        if (group) {
          this._lightboxImages = Array.from(document.querySelectorAll(`.photo-viewable[data-group="${group}"]`))
            .map(el => ({ src: el.dataset.fullSrc || el.src, caption: el.dataset.caption || '' }));
          this._lightboxIndex = this._lightboxImages.findIndex(i => i.src === src);
        } else {
          this._lightboxImages = [{ src, caption }];
          this._lightboxIndex = 0;
        }

        this.openLightbox();
      }
    });

    // Keyboard nav
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('photo-lightbox').classList.contains('hidden')) return;
      if (e.key === 'Escape') this.closeLightbox();
      if (e.key === 'ArrowLeft') this.lightboxNav(-1);
      if (e.key === 'ArrowRight') this.lightboxNav(1);
    });

    // Touch swipe support
    let touchStartX = 0;
    const content = document.querySelector('.lightbox-content');
    content.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    content.addEventListener('touchend', (e) => {
      const diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) > 50) {
        this.lightboxNav(diff > 0 ? -1 : 1);
      }
    });
  },

  openLightbox() {
    const lb = document.getElementById('photo-lightbox');
    const item = this._lightboxImages[this._lightboxIndex];
    document.getElementById('lightbox-img').src = item.src;
    document.getElementById('lightbox-caption').textContent = item.caption;
    lb.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const hasMultiple = this._lightboxImages.length > 1;
    document.getElementById('lightbox-prev').style.display = hasMultiple ? 'block' : 'none';
    document.getElementById('lightbox-next').style.display = hasMultiple ? 'block' : 'none';
  },

  closeLightbox() {
    document.getElementById('photo-lightbox').classList.add('hidden');
    document.body.style.overflow = '';
  },

  lightboxNav(dir) {
    this._lightboxIndex = (this._lightboxIndex + dir + this._lightboxImages.length) % this._lightboxImages.length;
    const item = this._lightboxImages[this._lightboxIndex];
    const img = document.getElementById('lightbox-img');
    img.style.opacity = '0';
    setTimeout(() => {
      img.src = item.src;
      document.getElementById('lightbox-caption').textContent = item.caption;
      img.style.opacity = '1';
    }, 150);
  },

  async buildSms(type, vars) {
    let tpl = await this.getSmsTemplate(type);
    const shopName = await DB.getSetting('shopName') || '펫살롱';
    const shopPhone = await DB.getSetting('shopPhone') || '';
    const allVars = {
      '매장명': shopName,
      '전화번호': shopPhone,
      ...vars
    };

    for (const [key, val] of Object.entries(allVars)) {
      tpl = tpl.replace(new RegExp(`\\{${key}\\}`, 'g'), val || '');
    }

    return tpl;
  }
};
