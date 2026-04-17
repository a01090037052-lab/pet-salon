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
      this.setupKeyboard();
      this.setupBottomNav();
      this.setupGlobalSearch();
      this.setupLightbox();
      this.registerSW();
      this.setupOfflineIndicator();
      this.setupTabSync();
      this.setupMobileKeyboard();
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

    // 모바일 키보드가 모달을 가리는 문제 대응
    if (window.visualViewport) {
      const adjustModal = () => {
        const modal = document.getElementById('modal');
        const overlay = document.getElementById('modal-overlay');
        if (!overlay || overlay.classList.contains('hidden') || !modal) return;
        const keyboardHeight = window.innerHeight - window.visualViewport.height;
        if (keyboardHeight > 50) {
          modal.style.maxHeight = window.visualViewport.height - 20 + 'px';
          modal.style.bottom = keyboardHeight + 'px';
          // focus된 input이 보이도록 스크롤
          setTimeout(() => {
            const focused = modal.querySelector(':focus');
            if (focused) focused.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }, 100);
        } else {
          modal.style.maxHeight = '';
          modal.style.bottom = '';
        }
      };
      window.visualViewport.addEventListener('resize', adjustModal);
      window.visualViewport.addEventListener('scroll', adjustModal);
    }
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
    // 메뉴 요소 먼저 선언 (상호 참조를 위해)
    const moreBtn = document.getElementById('bottom-more-btn');
    const moreMenu = document.getElementById('bottom-more-menu');
    const addBtn = document.getElementById('bottom-nav-add');
    const addMenu = document.getElementById('bottom-nav-add-menu');

    // More menu toggle
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addMenu?.classList.remove('open');
        moreMenu.classList.toggle('open');
      });
      document.addEventListener('click', () => moreMenu?.classList.remove('open'));
      moreMenu.querySelectorAll('.bottom-more-item').forEach(item => {
        item.addEventListener('click', () => moreMenu.classList.remove('open'));
      });
    }

    // Bottom nav add button (quick actions)
    if (addBtn && addMenu) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreMenu?.classList.remove('open');
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
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
        // 앱 열 때마다 SW 업데이트 강제 체크 (iOS PWA 대응)
        reg.update().catch(() => {});
        // 업데이트 감지 시 알림
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'activated' && navigator.serviceWorker.controller) {
              this.showToast('앱이 업데이트되었습니다. 앱을 다시 열면 반영됩니다.', 'info');
            }
          });
        });
      }).catch(err => {
        console.warn('SW 등록 실패:', err.message);
      });
    }
  },

  setupTabSync() {
    if (typeof BroadcastChannel === 'undefined') return;
    this._tabChannel = new BroadcastChannel('petsalon-sync');
    this._tabChannel.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'DB_CHANGED') {
        this.handleRoute(); // 현재 페이지 새로고침
        this.updateBadges();
      }
    });
  },

  notifyTabSync() {
    if (this._tabChannel) {
      this._tabChannel.postMessage({ type: 'DB_CHANGED' });
    }
  },

  // 모바일 키패드 올라올 때 모달/오버레이 높이 조정
  setupMobileKeyboard() {
    if (!window.visualViewport) return;
    let pending = false;
    const onResize = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        const overlay = document.getElementById('modal-overlay');
        const modal = overlay?.querySelector('.modal');
        if (!overlay || overlay.classList.contains('hidden') || !modal) return;
        const vvHeight = window.visualViewport.height;
        const vvTop = window.visualViewport.offsetTop;
        // 오버레이를 visualViewport에 맞춤
        overlay.style.height = vvHeight + 'px';
        overlay.style.top = vvTop + 'px';
        // 포커스된 input이 보이도록 스크롤
        const focused = modal.querySelector(':focus');
        if (focused) {
          setTimeout(() => focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
        }
      });
    };
    const onReset = () => {
      const overlay = document.getElementById('modal-overlay');
      if (overlay) { overlay.style.height = ''; overlay.style.top = ''; }
    };
    window.visualViewport.addEventListener('resize', onResize);
    window.visualViewport.addEventListener('scroll', onResize);
    // 모달 닫힐 때 리셋
    const observer = new MutationObserver(() => {
      const overlay = document.getElementById('modal-overlay');
      if (overlay?.classList.contains('hidden')) onReset();
    });
    const overlayEl = document.getElementById('modal-overlay');
    if (overlayEl) observer.observe(overlayEl, { attributes: true, attributeFilter: ['class'] });
  },

  setupOfflineIndicator() {
    const banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:10000;background:var(--danger,#e74c3c);color:#fff;text-align:center;padding:6px;font-size:0.82rem;font-weight:600';
    banner.textContent = '오프라인 상태입니다';
    document.body.prepend(banner);
    const update = () => {
      banner.style.display = navigator.onLine ? 'none' : 'block';
      if (navigator.onLine && banner._wasOffline) this.showToast('네트워크 연결됨');
      banner._wasOffline = !navigator.onLine;
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
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
            <div style="font-size:0.82rem;color:var(--text-muted);margin:8px 0">${App.escapeHtml(err?.message || '')}</div>
            <div style="display:flex;gap:8px;justify-content:center">
              <button class="btn btn-primary" onclick="App.navigate('${page}')">다시 시도</button>
              <button class="btn btn-secondary" onclick="App.navigate('dashboard')">대시보드로 이동</button>
            </div>
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

    // Android 뒤로가기 처리
    history.pushState({ modalOpen: true }, '');
    this._modalPopHandler = () => { this.closeModal(true); };
    window.addEventListener('popstate', this._modalPopHandler, { once: true });

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

  closeModal(fromPopstate) {
    const overlay = document.getElementById('modal-overlay');
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('animate-in');
    const modalBody = document.getElementById('modal-body');
    modalBody.onkeydown = null;
    modalBody.innerHTML = '';
    document.getElementById('modal-save').onclick = null;
    if (this._modalDragCleanup) { this._modalDragCleanup(); this._modalDragCleanup = null; }
    // 모달 닫힘 콜백 (예: 미용완료 취소 시 예약 상태 복원)
    if (this._modalOnClose) { const cb = this._modalOnClose; this._modalOnClose = null; cb(); }
    if (this._lastFocusedElement) {
      try { this._lastFocusedElement.focus(); } catch(e) {}
      this._lastFocusedElement = null;
    }
    // 뒤로가기 히스토리 정리
    if (this._modalPopHandler) {
      window.removeEventListener('popstate', this._modalPopHandler);
      this._modalPopHandler = null;
    }
    if (!fromPopstate && history.state && history.state.modalOpen) {
      history.back();
    }
  },

  // ========== Confirm Dialog ==========
  _confirmResolve: null,

  confirm(message) {
    return new Promise((resolve) => {
      this._confirmResolve = resolve;
      const body = document.getElementById('confirm-body');
      body.innerHTML = `<p>${message}</p>`;
      const overlay = document.getElementById('confirm-overlay');
      overlay.classList.remove('hidden');
      const okBtn = document.getElementById('confirm-ok');
      okBtn.disabled = false;
      okBtn.onclick = () => { okBtn.disabled = true; this.closeConfirm(true); };
      // Android 뒤로가기 처리
      history.pushState({ confirmOpen: true }, '');
      this._confirmPopHandler = () => { this.closeConfirm(false, true); };
      window.addEventListener('popstate', this._confirmPopHandler, { once: true });
      // Focus confirm button
      setTimeout(() => document.getElementById('confirm-ok')?.focus(), 100);
    });
  },

  closeConfirm(result = false, fromPopstate) {
    const overlay = document.getElementById('confirm-overlay');
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    if (this._confirmPopHandler) {
      window.removeEventListener('popstate', this._confirmPopHandler);
      this._confirmPopHandler = null;
    }
    if (!fromPopstate && history.state && history.state.confirmOpen) {
      history.back();
    }
    if (this._confirmResolve) {
      this._confirmResolve(result);
      this._confirmResolve = null;
    }
  },

  // ========== Toast ==========
  showToast(message, type = 'success', opts = {}) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const msgSpan = document.createElement('span');
    if (opts.html) {
      msgSpan.innerHTML = message;
    } else {
      msgSpan.textContent = message;
    }
    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'toast-dismiss';
    dismissBtn.textContent = '\u00D7';
    dismissBtn.onclick = () => { toast.style.animation = 'toastOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); };
    toast.appendChild(msgSpan);
    toast.appendChild(dismissBtn);
    container.appendChild(toast);

    // Duration: html(링크 포함)=10s, error=5s, info=5s, success=2.5s
    const duration = opts.html ? 10000 : type === 'error' ? 5000 : type === 'info' ? 5000 : 2500;
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
  debounce(fn, ms = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  },

  getRecordAmount(r) {
    return Number(r.finalPrice != null ? r.finalPrice : r.totalPrice) || 0;
  },

  formatLocalDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = this.parseLocalDate ? this.parseLocalDate(dateStr) : new Date(dateStr);
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

  // YYYY-MM-DD 문자열을 로컬 시간대로 파싱 (UTC 오프셋 방지)
  parseLocalDate(dateStr) {
    if (!dateStr) return null;
    // ISO datetime 형식(T 포함)은 그대로, 날짜만 있으면 T00:00:00 붙임
    if (dateStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return new Date(dateStr + 'T00:00:00');
    }
    return new Date(dateStr);
  },

  getDaysAgo(dateStr) {
    if (!dateStr) return null;
    const d = this.parseLocalDate(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    return diff;
  },

  // 고객 방문 상태 분류: normal(정상), remind(리마인드), at-risk(이탈위험), churned(이탈)
  classifyVisitStatus(lastVisitDate, groomingCycle) {
    if (!lastVisitDate) return 'churned';
    const daysSince = this.getDaysAgo(lastVisitDate);
    if (daysSince === null) return 'churned';
    const cycle = groomingCycle || 30;
    if (daysSince <= cycle + 3) return 'normal';
    if (daysSince <= cycle * 1.5) return 'remind';
    if (daysSince <= cycle * 2) return 'at-risk';
    return 'churned';
  },

  getVisitStatusLabel(status) {
    const labels = { normal: '정상', remind: '리마인드', 'at-risk': '이탈위험', churned: '이탈' };
    return labels[status] || status;
  },

  getVisitStatusBadge(status) {
    const badges = { normal: 'badge-success', remind: 'badge-warning', 'at-risk': 'badge-danger', churned: 'badge-secondary' };
    return badges[status] || 'badge-secondary';
  },

  // 미용 리포트: 컨디션 기반 관리법 자동 매칭
  getHomeCareAdvice(record) {
    const tips = [];
    const skin = record.skinStatus || [];
    if (skin.includes('건조')) tips.push('피부가 건조해요. 보습 스프레이를 2~3일에 한 번 뿌려주세요.');
    if (skin.includes('발적')) tips.push('피부에 발적이 있어요. 긁거나 핥지 않도록 주의해주시고, 지속되면 병원 방문을 권합니다.');
    if (skin.includes('각질')) tips.push('각질이 보여요. 저자극 샴푸 사용을 추천합니다.');
    if (skin.includes('습진')) tips.push('습진 증상이 있어요. 동물병원에서 진료받으시길 권합니다.');
    if (record.earStatus === 'dirty') tips.push('귀에 경미한 오염이 있어요. 귀 세정제로 주 1회 관리해주세요.');
    if (record.earStatus === 'infected') tips.push('귀에 염증이 의심돼요. 동물병원 방문을 꼭 권합니다.');
    if (record.mattingLevel === 'mild') tips.push('털 엉킴이 약간 있었어요. 주 2~3회 빗질을 해주세요.');
    if (record.mattingLevel === 'severe') tips.push('털 엉킴이 심했어요. 매일 5분 빗질이 필요합니다. 슬리커 브러시를 추천해요.');
    if (tips.length === 0 && record.condition) tips.push('컨디션이 좋아요! 지금처럼 관리해주시면 됩니다.');
    return tips;
  },

  // 미용 리포트 텍스트 생성
  async buildGroomingReport(record) {
    const customer = record.customerId ? await DB.get('customers', record.customerId) : null;
    const pet = record.petId ? await DB.get('pets', record.petId) : null;
    const shopName = await DB.getSetting('shopName') || '펫살롱';
    const conditionLabels = { good: '좋음', normal: '보통', caution: '주의' };
    const earLabels = { clean: '깨끗', dirty: '경미한 오염', infected: '염증 의심' };
    const mattingLabels = { none: '없음', mild: '경미', severe: '심함' };

    let lines = [];
    lines.push(`[${shopName}] ${pet?.name || ''} 미용 리포트`);
    lines.push('');
    lines.push(`날짜: ${App.formatDate(record.date)}`);
    let svcDisplay = '';
    if (record.service) {
      svcDisplay = record.service;
      if (record.style) svcDisplay += ' (' + record.style + ')';
      if (record.addons?.length) svcDisplay += ' + ' + record.addons.join(', ');
    } else {
      svcDisplay = (record.serviceNames || []).join(', ');
    }
    if (svcDisplay) lines.push('서비스: ' + svcDisplay);
    if (record.groomer) lines.push(`미용사: ${record.groomer}`);
    lines.push('');

    if (record.condition) lines.push(`컨디션: ${conditionLabels[record.condition] || record.condition}`);
    if (record.skinStatus && record.skinStatus.length) lines.push(`피부: ${record.skinStatus.join(', ')}`);
    if (record.earStatus) lines.push(`귀: ${earLabels[record.earStatus] || record.earStatus}`);
    if (record.mattingLevel) lines.push(`엉킴: ${mattingLabels[record.mattingLevel] || record.mattingLevel}`);

    const tips = this.getHomeCareAdvice(record);
    if (tips.length > 0) {
      lines.push('');
      lines.push('집에서 관리법:');
      tips.forEach(t => lines.push(`- ${t}`));
    }

    if (record.nextVisitDate) {
      lines.push('');
      lines.push(`다음 미용 추천: ${App.formatDate(record.nextVisitDate)}`);
    }

    lines.push('');
    lines.push('감사합니다!');
    return lines.join('\n');
  },

  // 고객 표시명 (pets 있으면 "반려견 보호자(뒷4자리)", 없으면 "고객(뒷4자리)")
  getCustomerLabel(customer, pets) {
    if (!customer) return '-';
    if (customer.name) return customer.name;
    const petNames = (pets || []).map(p => p.name).filter(Boolean);
    const last4 = (customer.phone || '').replace(/\D/g, '').slice(-4);
    if (petNames.length > 0 && last4) return petNames[0] + ' 보호자(' + last4 + ')';
    if (petNames.length > 0) return petNames[0] + ' 보호자';
    return last4 ? '고객(' + last4 + ')' : '미등록 고객';
  },

  // ========== 서비스/스타일 자동완성 이력 ==========
  async getAutoHistory(key) {
    // key: 'serviceHistory', 'addonHistory', 'styleHistory'
    const data = await DB.getSetting(key);
    return data || [];
  },

  async addAutoHistory(key, value) {
    if (!value || !value.trim()) return;
    const val = value.trim();
    const list = await this.getAutoHistory(key);
    // 중복 제거 후 맨 앞에 추가 (최근 사용 우선)
    const filtered = list.filter(v => v !== val);
    filtered.unshift(val);
    // 최대 50개 유지
    await DB.setSetting(key, filtered.slice(0, 50));
  },

  // 같은 반려견 + 같은 서비스의 최근 기본가 조회
  async getRecentServicePrice(petId, serviceName, sizeType) {
    if (!serviceName) return null;
    const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo', 'condition', 'skinStatus', 'earStatus', 'mattingLevel']);
    // 1순위: 같은 반려견 + 같은 서비스 (추가 없는 것 우선)
    const petRecords = records.filter(r => r.petId === petId && r.service === serviceName).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const noAddon = petRecords.find(r => !r.addons || r.addons.length === 0);
    if (noAddon && noAddon.servicePrice) return noAddon.servicePrice;
    if (petRecords[0]?.servicePrice) return petRecords[0].servicePrice;
    // 2순위: 같은 사이즈 + 같은 서비스
    if (sizeType) {
      const pets = await DB.getAll('pets');
      const sameSizePetIds = new Set(pets.filter(p => (p.size || (p.weight ? (p.weight < 7 ? 'small' : p.weight < 15 ? 'medium' : 'large') : '')) === sizeType).map(p => p.id));
      const sizeRecords = records.filter(r => sameSizePetIds.has(r.petId) && r.service === serviceName && r.servicePrice).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      if (sizeRecords[0]) return sizeRecords[0].servicePrice;
    }
    // 3순위: 같은 서비스 최근
    const anyRecord = records.filter(r => r.service === serviceName && r.servicePrice).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (anyRecord[0]) return anyRecord[0].servicePrice;
    // 4순위: 기존 서비스 등록 가격 (호환)
    const services = await DB.getAll('services');
    const svc = services.find(s => s.name === serviceName && s.isActive !== false);
    if (svc) {
      const priceKey = 'price' + (sizeType || 'small').charAt(0).toUpperCase() + (sizeType || 'small').slice(1);
      return svc[priceKey] || svc.priceSmall || null;
    }
    return null;
  },

  // 미용 기록의 서비스 표시 (신/구 호환)
  getRecordServiceDisplay(r, serviceMap) {
    // 새 구조: service + style + addons
    if (r.service) {
      let display = r.service;
      if (r.style) display += ' (' + r.style + ')';
      if (r.addons && r.addons.length) display += ' + ' + r.addons.join(', ');
      return display;
    }
    // 기존 구조: serviceNames / serviceIds
    if (r.serviceNames && r.serviceNames.length > 0) return r.serviceNames.join(', ');
    if (r.serviceIds && serviceMap) return r.serviceIds.map(id => serviceMap[id]).filter(Boolean).join(', ') || '-';
    return '-';
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
      .map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${this.escapeHtml(App.getCustomerLabel(c))} (${this.formatPhone(c.phone)})</option>`)
      .join('');
  },

  // Render searchable customer select (반려견 이름 검색 지원)
  async renderCustomerSelect(containerId, selectedId, onChange) {
    const [customers, allPets] = await Promise.all([DB.getAll('customers'), DB.getAll('pets')]);
    const sorted = customers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    const container = document.getElementById(containerId);
    if (!container) return;

    // 고객별 반려견 매핑
    const petsByCustomer = {};
    allPets.forEach(p => {
      if (!petsByCustomer[p.customerId]) petsByCustomer[p.customerId] = [];
      petsByCustomer[p.customerId].push(p);
    });
    App._inlinePetsByCustomer = petsByCustomer;

    // 검색어에 따라 매칭된 반려견 라벨 생성
    const _petDisplay = (cId, matchQ) => {
      const cp = petsByCustomer[cId] || [];
      if (cp.length === 0) return '';
      if (matchQ) {
        const matched = cp.find(p => (p.name || '').normalize('NFC').toLowerCase().indexOf(matchQ) === 0);
        if (matched) {
          const rest = cp.length - 1;
          return matched.name + (rest > 0 ? ' 외 ' + rest + '마리' : '');
        }
      }
      if (cp.length === 1) return cp[0].name;
      return cp[0].name + ' 외 ' + (cp.length - 1) + '마리';
    };

    const selected = selectedId ? sorted.find(c => c.id === selectedId) : null;
    const selPets = selected ? (petsByCustomer[selected.id] || []) : [];
    const selectedDisplay = selected
      ? (selPets.length > 0
        ? (selPets.length === 1 ? selPets[0].name : selPets[0].name + ' 외 ' + (selPets.length - 1) + '마리') + ' · ' + this.escapeHtml(selected.name)
        : this.escapeHtml(selected.name) + ' (' + this.formatPhone(selected.phone) + ')')
      : '';

    container.innerHTML = `
      <div class="search-select">
        <input type="text" id="${containerId}-input" placeholder="반려견/고객 이름, 전화번호 검색..."
          value="${selectedDisplay}"
          autocomplete="off">
        <input type="hidden" id="${containerId}-value" value="${selectedId || ''}">
        <div class="search-select-dropdown" id="${containerId}-dropdown"></div>
      </div>
    `;

    const input = document.getElementById(`${containerId}-input`);
    const hidden = document.getElementById(`${containerId}-value`);
    const dropdown = document.getElementById(`${containerId}-dropdown`);

    const renderOptions = (query) => {
      const q = (query || '').trim().normalize('NFC').toLowerCase();
      if (!q) {
        dropdown.innerHTML = `
          <div class="search-select-option"><span style="color:var(--text-muted)">반려견/고객 이름, 전화번호를 입력하세요</span></div>
          <div class="search-select-option" style="color:var(--primary);font-weight:700;border-top:1px solid var(--border);text-align:center" id="btn-inline-new-cust">+ 새 고객 등록</div>
        `;
        dropdown.classList.add('open');
        document.getElementById('btn-inline-new-cust')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          App._showInlineCustomerForm(dropdown, hidden, input, onChange, '');
        });
        return;
      }
      const qDigits = q.replace(/\D/g, '');
      const filtered = sorted.filter(c => {
        const name = (c.name || '').normalize('NFC').toLowerCase();
        if (name.indexOf(q) === 0) return true;
        if (qDigits && (c.phone || '').replace(/\D/g, '').indexOf(qDigits) !== -1) return true;
        const cPets = petsByCustomer[c.id] || [];
        if (cPets.some(p => (p.name || '').normalize('NFC').toLowerCase().indexOf(q) === 0)) return true;
        return false;
      });

      if (filtered.length === 0 && q) {
        if (document.getElementById('quick-cust-phone')) {
          const nameEl = document.getElementById('quick-cust-name-val');
          const labelEl = document.getElementById('quick-cust-label');
          if (nameEl) nameEl.value = q;
          if (labelEl) labelEl.textContent = `"${q}" 새 고객 등록`;
          return;
        }
        dropdown.innerHTML = `
          <div class="search-select-option"><span style="color:var(--text-muted)">검색 결과 없음</span></div>
          <div class="search-select-option" style="color:var(--primary);font-weight:700;border-top:1px solid var(--border);text-align:center" id="btn-inline-new-cust-empty">+ "${App.escapeHtml(q)}" 새 고객 등록</div>
        `;
        document.getElementById('btn-inline-new-cust-empty')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const currentQ = input.value.trim();
          App._showInlineCustomerForm(dropdown, hidden, input, onChange, currentQ);
        });
      } else if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="search-select-option"><span style="color:var(--text-muted)">반려견/고객 이름, 전화번호를 입력하세요</span></div>';
      } else {
        dropdown.innerHTML = filtered.slice(0, 20).map(c => {
          const pl = _petDisplay(c.id, q);
          const display = pl
            ? `${this.escapeHtml(pl)} · ${this.escapeHtml(App.getCustomerLabel(c))} <span class="sub">${this.formatPhone(c.phone)}</span>`
            : `${this.escapeHtml(App.getCustomerLabel(c))} <span class="sub">${this.formatPhone(c.phone)}</span>`;
          const dataName = pl ? `${pl} · ${App.getCustomerLabel(c)}` : `${App.getCustomerLabel(c)} (${this.formatPhone(c.phone)})`;
          return `<div class="search-select-option" data-id="${c.id}" data-name="${this.escapeHtml(dataName)}">
            ${display}
          </div>`;
        }).join('');
      }
      if (filtered.length > 0 && q) {
        dropdown.innerHTML += `<div class="search-select-option" style="color:var(--primary);font-weight:700;border-top:1px solid var(--border);text-align:center" id="btn-inline-new-cust">+ 새 고객 등록</div>`;
      }
      dropdown.classList.add('open');

      document.getElementById('btn-inline-new-cust')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        App._showInlineCustomerForm(dropdown, hidden, input, onChange, input.value.trim());
      });
    };

    input.addEventListener('focus', () => {
      renderOptions(input.value);
      // Scroll input into view above keyboard on mobile
      setTimeout(() => {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    });
    let _searchTimer = null;
    let _isComposing = false;
    input.addEventListener('compositionstart', () => { _isComposing = true; });
    input.addEventListener('compositionend', () => {
      _isComposing = false;
      clearTimeout(_searchTimer);
      renderOptions(input.value);
    });
    input.addEventListener('input', () => {
      hidden.value = '';
      if (onChange) onChange('');
      clearTimeout(_searchTimer);
      // 한글 조합 중에는 긴 디바운스 (조합 완료 대기), 아니면 짧은 디바운스
      const delay = _isComposing ? 400 : 200;
      _searchTimer = setTimeout(() => renderOptions(input.value), delay);
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
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

  // 인라인 빠른 고객+반려견 등록 폼
  _showInlineCustomerForm(dropdown, hidden, input, onChange, nameVal) {
    // 검색어가 한글이면 반려견 이름일 가능성 높음
    const hasDigit = /\d/.test(nameVal);
    const prefillPet = !hasDigit ? nameVal : '';
    const prefillName = hasDigit ? '' : '';

    dropdown.style.maxHeight = 'none';
    dropdown.innerHTML = `
      <div style="padding:14px">
        <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">새 고객 등록</div>
        <label style="font-size:0.82rem;color:var(--text-muted)">보호자 이름 <span style="color:var(--text-muted);font-size:0.75rem">(선택)</span></label>
        <input type="text" id="quick-cust-name" placeholder="보호자 이름 (나중에 입력 가능)" value="${App.escapeHtml(prefillName)}" style="margin-bottom:8px;width:100%;box-sizing:border-box">
        <label style="font-size:0.82rem;color:var(--text-muted)">전화번호 <span style="color:var(--danger)">*</span></label>
        <input type="tel" id="quick-cust-phone" placeholder="전화번호" style="margin-bottom:8px;width:100%;box-sizing:border-box">
        <div id="quick-dup-area"></div>
        <div style="border-top:1px dashed var(--border);padding-top:8px;margin-top:4px;margin-bottom:8px">
          <label style="font-size:0.82rem;color:var(--text-muted)">반려견 이름 <span style="color:var(--text-muted);font-size:0.75rem">(선택)</span></label>
          <input type="text" id="quick-pet-name" placeholder="반려견 이름" value="${App.escapeHtml(prefillPet)}" style="margin-bottom:8px;width:100%;box-sizing:border-box">
          <div style="display:flex;gap:6px;margin-bottom:8px">
            <div style="flex:1"><label style="font-size:0.82rem;color:var(--text-muted)">견종</label><input type="text" id="quick-pet-breed" placeholder="견종" style="width:100%;box-sizing:border-box"></div>
            <div style="width:60px"><label style="font-size:0.82rem;color:var(--text-muted)">나이</label><input type="number" id="quick-pet-age" placeholder="나이" min="0" max="30" style="width:100%;box-sizing:border-box"></div>
          </div>
          <label style="font-size:0.82rem;color:var(--text-muted)">특이사항/알러지</label>
          <input type="text" id="quick-pet-notes" placeholder="특이사항, 알러지 등 (선택)" style="margin-bottom:8px;width:100%;box-sizing:border-box">
          <label style="font-size:0.82rem;color:var(--text-muted)">사이즈</label>
          <div style="display:flex;gap:6px;margin-top:4px;margin-bottom:4px" id="quick-pet-size-group">
            <label style="flex:1;text-align:center;padding:8px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:0.9rem" data-size="소형">소형</label>
            <label style="flex:1;text-align:center;padding:8px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:0.9rem" data-size="중형">중형</label>
            <label style="flex:1;text-align:center;padding:8px;border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:0.9rem" data-size="대형">대형</label>
          </div>
          <input type="hidden" id="quick-pet-size" value="">
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" id="quick-cust-save" style="flex:1;min-height:44px">등록</button>
          <button class="btn btn-secondary" id="quick-cust-cancel" style="flex:1;min-height:44px">취소</button>
        </div>
      </div>
    `;
    setTimeout(() => App.setupPhoneInputs(), 50);
    // 반려견 이름이 채워져 있으면 보호자 이름에 포커스, 아니면 반려견 이름에
    setTimeout(() => document.getElementById(prefillPet ? 'quick-cust-name' : 'quick-pet-name')?.focus(), 100);

    // 사이즈 선택 토글
    document.querySelectorAll('#quick-pet-size-group label').forEach(label => {
      label.addEventListener('click', (ev) => {
        ev.stopPropagation();
        document.querySelectorAll('#quick-pet-size-group label').forEach(l => {
          l.style.background = ''; l.style.color = ''; l.style.borderColor = 'var(--border)';
        });
        label.style.background = 'var(--primary)'; label.style.color = '#fff'; label.style.borderColor = 'var(--primary)';
        document.getElementById('quick-pet-size').value = label.dataset.size;
      });
    });

    // 전화번호 중복 실시간 체크
    const phoneInput = document.getElementById('quick-cust-phone');
    let _dupTimer = null;
    phoneInput?.addEventListener('input', () => {
      clearTimeout(_dupTimer);
      _dupTimer = setTimeout(async () => {
        const ph = phoneInput.value.replace(/\D/g, '');
        const dupArea = document.getElementById('quick-dup-area');
        if (!dupArea || ph.length < 8) { if (dupArea) dupArea.innerHTML = ''; return; }
        const allCusts = await DB.getAll('customers');
        const dup = allCusts.find(c => (c.phone || '').replace(/\D/g, '') === ph);
        if (dup) {
          dupArea.innerHTML = `<div style="background:var(--warning-bg, #fff8e1);border:1px solid var(--warning, #f0ad4e);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:0.85rem">
            이미 등록된 번호입니다: <b>${App.escapeHtml(dup.name)}</b>
            <button class="btn btn-sm btn-primary" id="quick-dup-select" style="margin-left:8px">이 고객 선택</button>
          </div>`;
          document.getElementById('quick-dup-select')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            hidden.value = dup.id;
            const dupPets = App._inlinePetsByCustomer?.[dup.id] || [];
            const pl = dupPets.length > 0
              ? (dupPets.length === 1 ? dupPets[0].name : dupPets[0].name + ' 외 ' + (dupPets.length - 1) + '마리') + ' · ' + dup.name
              : dup.name + ' (' + App.formatPhone(dup.phone) + ')';
            input.value = pl;
            dropdown.style.maxHeight = '';
            dropdown.classList.remove('open');
            if (onChange) onChange(dup.id);
          });
        } else {
          dupArea.innerHTML = '';
        }
      }, 300);
    });

    document.getElementById('quick-cust-save')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const name = document.getElementById('quick-cust-name').value.trim();
      const phone = document.getElementById('quick-cust-phone').value.trim();
      const petName = document.getElementById('quick-pet-name')?.value.trim();
      if (!phone) { App.showToast('전화번호를 입력해주세요.', 'error'); App.highlightField('quick-cust-phone'); return; }
      const allCusts = await DB.getAll('customers');
      const dup = allCusts.find(c => (c.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, ''));
      if (dup) { App.showToast(`이미 등록된 번호입니다 (${App.getCustomerLabel(dup)})`, 'error'); return; }
      try {
        const newId = await DB.add('customers', { name, phone });
        let petId = null;
        if (petName) {
          const petBreed = document.getElementById('quick-pet-breed')?.value.trim() || '';
          const petAge = Number(document.getElementById('quick-pet-age')?.value) || 0;
          const petSize = document.getElementById('quick-pet-size')?.value || '';
          const birthYear = petAge > 0 ? (new Date().getFullYear() - petAge) : null;
          const petNotes = document.getElementById('quick-pet-notes')?.value.trim() || '';
          petId = await DB.add('pets', { customerId: newId, name: petName, breed: petBreed, birthYear, size: petSize, healthNotes: petNotes });
        }
        const displayLabel = App.getCustomerLabel({ name, phone });
        hidden.value = newId;
        input.value = petName ? (petName + ' · ' + displayLabel) : displayLabel;
        dropdown.style.maxHeight = '';
        dropdown.classList.remove('open');
        if (onChange) onChange(newId);
        // 반려견 자동 선택
        if (petId) {
          setTimeout(() => {
            const petSelect = document.getElementById('f-petId');
            if (petSelect) {
              petSelect.innerHTML = `<option value="${petId}" selected>${App.escapeHtml(petName)}${document.getElementById('quick-pet-breed')?.value ? ' (' + App.escapeHtml(document.getElementById('quick-pet-breed').value) + ')' : ''}</option>`;
            }
          }, 200);
        }
        App.showToast(`${petName ? petName + ' · ' : ''}${displayLabel} 등록 완료`);
      } catch(err) {
        App.showToast('등록 중 오류가 발생했습니다.', 'error');
      }
    });
    document.getElementById('quick-cust-cancel')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      dropdown.style.maxHeight = '';
      dropdown.classList.remove('open');
    });
  },

  async getPetOptions(customerId, selectedId) {
    if (!customerId) return '<option value="">먼저 고객을 선택하세요</option>';
    const pets = await DB.getByIndex('pets', 'customerId', Number(customerId));
    if (pets.length === 0) return '<option value="">등록된 반려견이 없습니다</option>';
    return pets
      .map(p => {
        const age = p.birthYear ? (new Date().getFullYear() - p.birthYear) + '살' : (p.birthDate ? this.calculatePetAge(p.birthDate) : '');
        const info = [p.breed, age].filter(Boolean).join(', ');
        return `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>${this.escapeHtml(p.name)}${info ? ' (' + this.escapeHtml(info) + ')' : ''}</option>`;
      })
      .join('');
  },

  calculatePetAge(birthDate) {
    const birth = new Date(birthDate);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth()) years--;
    return years > 0 ? years + '살' : '1살 미만';
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
    const size = sizeType || 'small';
    const catLabels = { grooming: '미용 코스', addon: '추가 옵션', care: '단독 케어' };
    const catOrder = ['grooming', 'addon', 'care'];

    // 카테고리별 그룹 + sortOrder 정렬
    const grouped = {};
    active.forEach(s => {
      const cat = s.category || 'grooming';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    });
    catOrder.forEach(cat => {
      if (grouped[cat]) grouped[cat].sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
    });

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-weight:700;font-size:0.85rem;color:var(--text-secondary)">서비스 선택</span>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-toggle-services">전체 선택</button>
      </div>
    `;
    for (const cat of catOrder) {
      if (!grouped[cat] || grouped[cat].length === 0) continue;
      html += `<div style="font-size:0.78rem;font-weight:700;color:var(--primary);margin:8px 0 4px;padding-bottom:2px;border-bottom:1px solid var(--primary-lighter)">${catLabels[cat] || cat}</div>`;
      html += '<div class="service-select-grid">';
      html += grouped[cat].map(s => {
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
    }
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
  // 미용사 입력 필드 — 등록된 미용사 + 과거 기록의 미용사까지 datalist로 제안,
  // 자유 입력 가능 (1인 살롱·미등록 상태 모두 자연스럽게 동작)
  async getGroomerFieldHTML(selected = '') {
    const registered = (await DB.getSetting('groomers')) || [];
    let pastGroomers = [];
    try {
      const recs = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo', 'serviceIds', 'serviceNames', 'nextVisitDate', 'appointmentId']);
      pastGroomers = [...new Set(recs.map(r => r.groomer).filter(g => g && !registered.includes(g)))];
    } catch (e) { /* ignore */ }
    const suggestions = [...registered, ...pastGroomers];
    const placeholder = registered.length === 0 ? '미용사 이름 (선택 입력)' : '미용사 이름';
    return `<input type="text" id="f-groomer" list="groomer-suggestions" value="${this.escapeHtml(selected || '')}" placeholder="${placeholder}" autocomplete="off" style="min-height:44px;font-size:max(16px,0.95rem)">
      <datalist id="groomer-suggestions">
        ${suggestions.map(g => `<option value="${this.escapeHtml(g)}">`).join('')}
      </datalist>`;
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

      // 날짜 바뀌면 알림 Set 초기화 (메모리 누수 방지)
      if (this._notifiedDate !== today) {
        this._notifiedAppts.clear();
        this._notifiedDate = today;
      }
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
            if (customer) customerName = App.getCustomerLabel(customer);
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
    this._searchPopHandler = () => { this.closeSearch(true); };
    window.addEventListener('popstate', this._searchPopHandler, { once: true });

    // Auto-focus
    setTimeout(() => input.focus(), 50);
  },

  closeSearch(fromPopstate) {
    const overlay = document.getElementById('global-search-overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('animate-in');
    this._searchData = null;
    document.getElementById('global-search-results').innerHTML = '';
    // Remove popstate listener first
    if (this._searchPopHandler) {
      window.removeEventListener('popstate', this._searchPopHandler);
      this._searchPopHandler = null;
    }
    // Clean up history if not called from popstate
    if (!fromPopstate && history.state && history.state.searchOpen) {
      history.back();
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
        const searchQuery = document.getElementById('global-search-input')?.value?.trim() || '';
        App.closeSearch();
        // history.back() popstate가 소화된 후 모달 열기 (타이밍 충돌 방지)
        setTimeout(() => {
          App.pages.customers?.showForm(null, async (newCustomerId) => {
            const newCustomer = await DB.get('customers', newCustomerId);
            App.showToast(`${newCustomer?.name || ''} 고객이 등록되었습니다.`);
            setTimeout(() => {
              App.pages.appointments?.showForm(null, newCustomerId);
            }, 300);
          });
          // 검색어를 고객명 필드에 pre-fill
          if (searchQuery) {
            setTimeout(() => {
              const nameInput = document.getElementById('f-name');
              if (nameInput && !nameInput.value) nameInput.value = searchQuery;
            }, 50);
          }
        }, 150);
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
      const label = App.getCustomerLabel(c);
      const initial = label.charAt(0);
      return `
        <div class="gs-result-item" tabindex="0" data-customer-id="${c.id}">
          <div class="gs-result-avatar">${this.escapeHtml(initial)}</div>
          <div class="gs-result-info" style="flex:1">
            <div class="gs-result-name">${this.escapeHtml(label)}</div>
            <div class="gs-result-phone">${this.formatPhone(c.phone)}</div>
            ${petNames ? `<div class="gs-result-pets">${this.escapeHtml(petNames)}</div>` : ''}
          </div>
          <button class="btn-icon" onclick="event.stopPropagation();App.closeSearch();setTimeout(()=>App.pages.appointments.showForm(null,${c.id}),150)" title="예약" style="color:var(--primary);font-size:1.1rem;flex-shrink:0">&#x1F4C5;</button>
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
          <span class="gs-card-name">${this.escapeHtml(App.getCustomerLabel(customer))}${this.pages.customers.getTagBadges(customer.tags)}</span>
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
            ${cPets.length > 1 ? cPets.map(p =>
              `<button class="gs-action-btn gs-appt-pet" data-customer-id="${customer.id}" data-pet-id="${p.id}">
                <span class="gs-action-btn-icon">&#x1F4C5;</span>
                <span>${App.escapeHtml(p.name)}</span>
              </button>`
            ).join('') : `<button class="gs-action-btn" id="gs-action-appt" data-customer-id="${customer.id}">
              <span class="gs-action-btn-icon">&#x1F4C5;</span>
              <span>예약</span>
            </button>`}
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

    // Appointment button (closeSearch의 history.back() popstate 소화 후 모달 열기)
    document.getElementById('gs-action-appt')?.addEventListener('click', () => {
      const petId = cPets.length === 1 ? cPets[0].id : undefined;
      this.closeSearch();
      setTimeout(() => {
        if (this.pages.appointments?.showForm) {
          this.pages.appointments.showForm(null, customer.id, petId ? { petId } : undefined);
        } else {
          this.navigate('appointments');
        }
      }, 150);
    });

    // Per-pet appointment buttons (다견 고객)
    document.querySelectorAll('.gs-appt-pet').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeSearch();
        setTimeout(() => {
          this.pages.appointments?.showForm(null, Number(btn.dataset.customerId), { petId: Number(btn.dataset.petId) });
        }, 150);
      });
    });

    // Record button
    document.getElementById('gs-action-record')?.addEventListener('click', () => {
      const petId = cPets.length === 1 ? cPets[0].id : undefined;
      this.closeSearch();
      setTimeout(() => {
        if (this.pages.records?.showForm) {
          this.pages.records.showForm(null, { customerId: customer.id, petId: petId || undefined });
        }
      }, 150);
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
      atRisk: '[{매장명}] {고객명}님, {반려견명}이(가) 보고 싶어요! 미용 시기가 많이 지났는데 괜찮으신가요? 예약 문의: {전화번호}',
      churned: '[{매장명}] {고객명}님 안녕하세요! 오랫동안 뵙지 못했네요. {반려견명} 잘 지내고 있나요? 다시 방문해주시면 특별 케어 해드릴게요! 문의: {전화번호}',
      appointment: '[{매장명}] {고객명}님, {날짜} {시간}에 {반려견명} 예약이 확인되었습니다. 담당: {미용사}. 문의: {전화번호}',
      reminder: '[{매장명}] {고객명}님, 내일({날짜}) {시간}에 {반려견명} 미용 예약이 있습니다. 변경/취소는 {전화번호}로 연락 부탁드립니다.',
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

  // ========== Shared Image Resize Utility ==========
  resizeImage(dataUrl, callback, maxSize = 800, quality = 0.7) {
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
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => callback(null);
    img.src = dataUrl;
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
    // 고객명 빈 값 폴백
    if (!allVars['고객명']) allVars['고객명'] = '보호자';

    for (const [key, val] of Object.entries(allVars)) {
      tpl = tpl.replace(new RegExp(`\\{${key}\\}`, 'g'), val || '');
    }

    return tpl;
  },

  // SMS URI 생성 유틸리티
  getSmsSep() {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.maxTouchPoints > 0 && /Macintosh/.test(ua));
    return isIOS ? '&' : '?';
  },

  getSmsUrl(phone, body) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (!cleanPhone) return '';
    if (!body) return `sms:${cleanPhone}`;
    return `sms:${cleanPhone}${this.getSmsSep()}body=${encodeURIComponent(body)}`;
  },

  openSms(phone, body) {
    const url = this.getSmsUrl(phone, body);
    if (url) window.open(url, '_self');
  }
};
