// ========== Main Application Controller ==========
const App = {
  currentPage: 'dashboard',
  pages: {},

  async init() {
    try {
      await DB.init();
      // 잠금 게이트 — PIN 설정되어 있고 신뢰 만료된 경우 잠금 화면 표시
      if (typeof Security !== 'undefined') {
        try { await Security.showLockScreen(); } catch (e) { console.warn('lock screen err', e); }
      }
      this.setupNavigation();
      this.setupSidebar();
      this.setupModal();
      this.setupKeyboard();
      this.setupBottomNav();
      this.setupGlobalSearch();
      this.setupLightbox();
      this.setupVersionDisplay();
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
      // 저장 공간 quota 체크 (fire-and-forget, UI 차단 안 함)
      this.setupStorageQuotaCheck();
      // 데이터 무결성 점검 (fire-and-forget, 하루 1회)
      this.setupIntegrityCheck();
      // 인라인 등록 폼이 한글 사이즈를 저장하던 시기의 데이터 정정 (1회)
      this.migratePetSizes();
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
    // confirm 모달은 외부 클릭으로 닫지 않음 (실수 방지 — 데이터 삭제 등 위험 작업)
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

  setupVersionDisplay() {
    // sw.js의 CACHE_NAME에서 버전 추출 → sidebar 표시 (배포 시 자동 동기화)
    fetch('./sw.js?v=' + Date.now()).then(r => r.text()).then(t => {
      const m = t.match(/petsalon-offline-v(\d+)/);
      const el = document.getElementById('app-version');
      if (m && el) el.textContent = 'v' + m[1];
    }).catch(() => {});
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

  // 데이터 무결성 자동 점검 (orphan 참조 보수, 모순 감지) — 하루 1회
  // 예약/기록의 인라인 등록 폼이 pet.size를 '소형/중형/대형'(한글)으로 저장하던 시기가 있었다.
  // 나머지 코드는 전부 small/medium/large를 전제하므로(서비스 가격 키가 priceSmall 등)
  // 그대로 두면 영수증 금액이 0원으로 찍힌다. 1회만 정정한다.
  async migratePetSizes() {
    if (DB.mode === 'server') return;
    if (localStorage.getItem('petSizeMigrated') === '1') return;
    const map = { '소형': 'small', '중형': 'medium', '대형': 'large' };
    try {
      const pets = await DB.getAllLight('pets', ['photo', 'photoThumb']);
      const targets = pets.filter(p => p.size && map[p.size]);
      for (const t of targets) {
        const full = await DB.get('pets', t.id);
        if (!full || !map[full.size]) continue;
        full.size = map[full.size];
        await DB.update('pets', full);
      }
      localStorage.setItem('petSizeMigrated', '1');
      if (targets.length > 0) console.info(`[migrate] pet.size 정규화 ${targets.length}건`);
    } catch (e) {
      console.warn('pet size migration failed', e);
    }
  },

  async setupIntegrityCheck() {
    if (DB.mode === 'server') return;
    const today = new Date().toDateString();
    const lastCheck = localStorage.getItem('lastIntegrityCheck');
    if (lastCheck === today) return; // 하루 1회만
    try {
      const report = await DB.runIntegrityCheck();
      if (!report) return;
      localStorage.setItem('lastIntegrityCheck', today);
      if (report.repaired > 0) {
        console.log('[Integrity] 자동 보수 완료:', report);
        this.showToast(
          `데이터 자동 정리: 누락 사진 참조 ${report.orphanPhotoRefs}건, 고아 사진 ${report.orphanPhotos}건 정리됨.`,
          'info'
        );
      }
      if (report.issues.length > 0) {
        console.warn('[Integrity] 모순 감지 (수동 확인 필요):', report.issues);
        this.showToast(
          `⚠️ 데이터 모순 ${report.issues.length}건 감지. 백업 후 설정에서 점검하세요. (콘솔 로그 확인)`,
          'error'
        );
      }
    } catch (e) {
      console.warn('integrity check failed:', e);
    }
  },

  // 저장 공간 자동 모니터링: 80%+ 안내, 95%+ 경고 (하루 1회)
  async setupStorageQuotaCheck() {
    if (DB.mode === 'server') return;
    if (!navigator.storage || !navigator.storage.estimate) return;
    try {
      const quota = await DB.checkStorageQuota();
      if (!quota || !quota.quota) return;
      const usedMB = (quota.used / (1024 * 1024)).toFixed(0);
      const quotaMB = (quota.quota / (1024 * 1024)).toFixed(0);
      const today = new Date().toDateString();
      const lastWarned = localStorage.getItem('lastQuotaWarning');
      if (quota.percentage >= 95) {
        // CRITICAL: 항상 경고 (하루 1회 제한 무시)
        this.showToast(
          `⚠️ 저장 공간 위험 (${quota.percentage}%, ${usedMB}/${quotaMB}MB) — 즉시 백업 후 사진을 정리해주세요.`,
          'error'
        );
        localStorage.setItem('lastQuotaWarning', today + '-critical');
      } else if (quota.percentage >= 80 && lastWarned !== today) {
        this.showToast(
          `저장 공간 ${quota.percentage}% 사용 중 (${usedMB}/${quotaMB}MB). 백업 후 정리를 권장합니다.`,
          'info'
        );
        localStorage.setItem('lastQuotaWarning', today);
      }
    } catch (e) {
      console.warn('quota check failed:', e);
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
    saveBtn.disabled = false;
    saveBtn.onclick = onSave ? async () => {
      // 중복 탭/Enter 연타로 같은 레코드가 두 번 저장되는 것을 막는다.
      if (saveBtn.disabled) return;
      saveBtn.disabled = true;
      saveBtn.classList.add('loading');
      saveBtn.textContent = '저장 중...';
      try {
        await onSave();
      } catch (err) {
        console.error('Save error:', err);
        App.showToast('저장 중 오류가 발생했습니다.', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.classList.remove('loading');
        saveBtn.textContent = saveText || '저장';
      }
    } : null;

    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('animate-in');
    this._lockBody();

    // Android 뒤로가기 처리
    history.pushState({ modalOpen: true }, '');
    this._modalPopHandler = () => {
      // 모달 위에서 열린 confirm이 자기 history 항목을 정리하며 낸 popstate는 모달을 닫지 않는다.
      // (once 리스너라 이미 소모되었으므로 다시 등록해준다)
      if (this._suppressModalPop) {
        this._suppressModalPop = false;
        window.addEventListener('popstate', this._modalPopHandler, { once: true });
        return;
      }
      this.closeModal(true);
    };
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
    this._unlockBody();
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

  confirm(message, options = {}) {
    // options: { okLabel, danger, cancelLabel }
    return new Promise((resolve) => {
      this._confirmResolve = resolve;
      const body = document.getElementById('confirm-body');
      body.innerHTML = `<p>${message}</p>`;
      const overlay = document.getElementById('confirm-overlay');
      overlay.classList.remove('hidden');
      this._lockBody();
      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');
      okBtn.textContent = options.okLabel || '확인';
      if (cancelBtn) cancelBtn.textContent = options.cancelLabel || '취소';
      // danger 옵션이면 빨강 강조 (default도 btn-danger지만 명시적 처리)
      okBtn.classList.toggle('btn-danger', options.danger !== false);
      okBtn.classList.toggle('btn-primary', options.danger === false);
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
    this._unlockBody();
    if (this._confirmPopHandler) {
      window.removeEventListener('popstate', this._confirmPopHandler);
      this._confirmPopHandler = null;
    }
    if (!fromPopstate && history.state && history.state.confirmOpen) {
      // 모달 위에서 열린 confirm이면 back()이 만드는 popstate가 모달까지 닫지 않도록 표시
      if (this._modalPopHandler) this._suppressModalPop = true;
      history.back();
    }
    if (this._confirmResolve) {
      this._confirmResolve(result);
      this._confirmResolve = null;
    }
  },

  // ========== Toast ==========
  // 인라인 로딩 표시 (페이지/카드/모달 안의 비동기 작업)
  // 사용: const restore = App.showLoadingInline(container, '집계 중...'); ...; restore();
  showLoadingInline(container, message = '로딩 중...') {
    if (!container) return () => {};
    const prev = container.innerHTML;
    container.innerHTML = `
      <div class="loading-inline">
        <div class="spinner-inline"></div>
        <div>${this.escapeHtml(message)}</div>
      </div>
    `;
    return () => { container.innerHTML = prev; };
  },

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

  // 주의: 속성(attribute) 컨텍스트에서도 안전해야 하므로 따옴표까지 이스케이프한다.
  // textContent→innerHTML 방식은 &, <, > 만 변환하고 " ' 를 그대로 통과시켜
  // title="${escapeHtml(memo)}" 같은 지점이 정상 입력('푸들 "티컵"')에도 깨졌다.
  escapeHtml(str) {
    if (str == null || str === '') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  async getCustomerOptions(selectedId) {
    const customers = await DB.getAll('customers');
    return customers
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'))
      .map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${this.escapeHtml(App.getCustomerLabel(c))} (${this.formatPhone(c.phone)})</option>`)
      .join('');
  },

  // ========== 공통 고객 등록 폼 ==========
  // 고객 페이지 모달 / 예약·기록 인라인 드롭다운이 같은 필드·같은 규칙을 쓰도록 한 곳에서 만든다.
  // 필수는 연락처뿐이고, 반려견 이름을 비우면 저장 직전에 한 번 확인한다.
  customerFormHtml(prefill) {
    const p = prefill || {};
    return `
      <div class="form-group">
        <label class="form-label">&#x1F436; 반려견 이름</label>
        <input type="text" id="cf-petName" value="${this.escapeHtml(p.petName || '')}" placeholder="반려견 이름" maxlength="30">
      </div>
      <div class="form-group">
        <label class="form-label">&#x1F4DE; 연락처 <span class="required">*</span></label>
        <input type="tel" id="cf-phone" value="${this.escapeHtml(p.phone || '')}" placeholder="010-0000-0000">
        <div id="cf-dup-area"></div>
      </div>
      <div class="form-group">
        <label class="form-label">보호자 이름 <span class="form-optional">(선택)</span></label>
        <input type="text" id="cf-name" value="${this.escapeHtml(p.name || '')}" placeholder="보호자 이름" maxlength="50">
      </div>
      <button type="button" class="cf-more-toggle" id="cf-more-toggle">+ 견종 &middot; 몸무게 &middot; 특이사항 &middot; 메모</button>
      <div id="cf-more" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">견종</label>
            <input type="text" id="cf-breed" placeholder="예: 말티즈, 푸들">
          </div>
          <div class="form-group">
            <label class="form-label">몸무게 (kg)</label>
            <input type="number" id="cf-weight" placeholder="예: 3.5" step="0.1" min="0" max="120">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">특이사항 &middot; 알러지</label>
          <input type="text" id="cf-notes" placeholder="건강 특이사항, 알러지 등">
        </div>
        <div class="form-group">
          <label class="form-label">고객 메모</label>
          <input type="text" id="cf-memo" placeholder="주차, 요청사항 등">
        </div>
      </div>
    `;
  },

  // opts: { onPick(customer) } — 중복 후보를 눌렀을 때 그 고객을 쓰는 동작
  bindCustomerForm(opts) {
    const o = opts || {};
    setTimeout(() => this.setupPhoneInputs(), 50);

    document.getElementById('cf-more-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const more = document.getElementById('cf-more');
      if (!more) return;
      const show = more.style.display === 'none';
      more.style.display = show ? 'block' : 'none';
      e.currentTarget.textContent = show ? '− 추가 항목 접기' : '+ 견종 · 몸무게 · 특이사항 · 메모';
    });

    const phoneInput = document.getElementById('cf-phone');
    const dupArea = document.getElementById('cf-dup-area');
    if (!phoneInput || !dupArea) return;

    // 뒤 4자리만 입력해도 후보가 뜨도록 부분일치로 검사한다 (완전일치는 11자리를 다 쳐야 떠서 사실상 안 뜬다)
    const check = this.debounce(async () => {
      const digits = (phoneInput.value || '').replace(/\D/g, '');
      dupArea.innerHTML = '';
      if (digits.length < 4) return;
      const [all, pets] = await Promise.all([
        DB.getAll('customers'),
        DB.getAllLight('pets', ['photo', 'photoThumb', 'temperament', 'healthNotes', 'preferredStyle'])
      ]);
      const byCustomer = {};
      pets.forEach(p => {
        if (!byCustomer[p.customerId]) byCustomer[p.customerId] = [];
        byCustomer[p.customerId].push(p);
      });
      const matches = all.filter(c => {
        const d = (c.phone || '').replace(/\D/g, '');
        return d && d.includes(digits);
      }).slice(0, 3);
      if (matches.length === 0) return;
      dupArea.innerHTML = `
        <div class="cf-dup">
          <div class="cf-dup-title">&#x26A0; 번호가 겹치는 고객이 있습니다</div>
          ${matches.map(c => {
            const cp = byCustomer[c.id] || [];
            const petPart = cp.length === 0 ? '' : cp.map(p => p.name).filter(Boolean).join(', ');
            return `<div class="cf-dup-row">
              <div class="cf-dup-info">
                <strong>${this.escapeHtml(this.getCustomerLabel(c, cp))}</strong>
                <span>${this.formatPhone(c.phone)}${petPart ? ' &middot; ' + this.escapeHtml(petPart) : ''}</span>
              </div>
              <button type="button" class="btn btn-sm btn-primary cf-dup-pick" data-id="${c.id}">이 고객 사용</button>
            </div>`;
          }).join('')}
        </div>`;
      dupArea.querySelectorAll('.cf-dup-pick').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const picked = all.find(c => c.id === Number(btn.dataset.id));
          if (picked && o.onPick) o.onPick(picked);
        });
      });
    }, 300);

    phoneInput.addEventListener('input', check);
    if (phoneInput.value) check(); // 검색어에서 넘어온 번호도 바로 검사
  },

  // 폼을 읽어 고객(+반려견)을 저장한다. 저장했으면 결과 객체, 중단했으면 null.
  async saveCustomerForm(opts) {
    const o = opts || {};
    const g = (id) => document.getElementById(id);
    const name = g('cf-name')?.value.trim() || '';
    const phone = g('cf-phone')?.value.trim() || '';
    const petName = g('cf-petName')?.value.trim() || '';
    const digits = phone.replace(/\D/g, '');

    if (!digits) {
      this.showToast('연락처를 입력해주세요.', 'error');
      this.highlightField('cf-phone');
      return null;
    }
    if (digits.length < 8) {
      this.showToast('연락처를 정확히 입력해주세요. (숫자 8자리 이상)', 'error');
      this.highlightField('cf-phone');
      return null;
    }

    const all = await DB.getAll('customers');
    const dup = all.find(c => (c.phone || '').replace(/\D/g, '') === digits);
    if (dup) {
      const use = await this.confirm(
        `이미 등록된 연락처입니다.<br><strong>${this.escapeHtml(this.getCustomerLabel(dup))}</strong><br>이 고객을 사용하시겠습니까?`,
        { okLabel: '이 고객 사용', danger: false }
      );
      if (use && o.onPick) { o.onPick(dup); return null; }
      this.highlightField('cf-phone');
      return null;
    }

    if (!petName) {
      const ok = await this.confirm(
        '반려견 이름 없이 보호자만 등록할까요?<br><small style="color:var(--text-muted)">반려견은 나중에 추가할 수 있습니다.</small>',
        { okLabel: '보호자만 등록', danger: false }
      );
      if (!ok) { this.highlightField('cf-petName'); return null; }
    }

    const memo = g('cf-memo')?.value.trim() || '';
    const customerId = await DB.add('customers', { name, phone, memo, tags: [] });

    let petId = null;
    if (petName) {
      try {
        const petData = {
          customerId,
          name: petName,
          breed: g('cf-breed')?.value.trim() || '',
          healthNotes: g('cf-notes')?.value.trim() || ''
        };
        const weight = parseFloat(g('cf-weight')?.value);
        if (weight > 0) {
          petData.weight = weight;
          // 사이즈는 항상 영문 키로 저장한다 (서비스 가격 키가 priceSmall/Medium/Large)
          petData.size = weight < 7 ? 'small' : weight < 15 ? 'medium' : 'large';
        }
        petId = await DB.add('pets', petData);
      } catch (e) {
        console.warn('Pet registration error:', e);
        this.showToast('보호자는 등록되었지만 반려견 등록에 실패했습니다.', 'warning');
      }
    }

    const label = petName
      ? petName + (name ? ' (' + name + ')' : '')
      : this.getCustomerLabel({ name, phone });
    return { customerId, petId, petName, name, phone, label };
  },

  // ========== 고객 검색·선택 컴포넌트 ==========
  // 이름/반려견 이름/전화번호를 모두 부분일치로 찾고, 선택하면 칩으로 잠긴다.
  // (예전에는 선택 후 한 글자만 쳐도 선택이 조용히 풀려서 저장 때 "고객을 선택해주세요"가 떴다)
  async renderCustomerSelect(containerId, selectedId, onChange) {
    const [customers, allPets] = await Promise.all([DB.getAll('customers'), DB.getAll('pets')]);
    const sorted = customers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    const container = document.getElementById(containerId);
    if (!container) return;
    // 이전 모달에서 등록 폼을 연 채 닫았을 수 있으므로 플래그를 초기화한다
    App._quickCustFormOpen = false;

    const petsByCustomer = {};
    allPets.forEach(p => {
      if (!petsByCustomer[p.customerId]) petsByCustomer[p.customerId] = [];
      petsByCustomer[p.customerId].push(p);
    });
    App._inlinePetsByCustomer = petsByCustomer;

    // 보호자 표기. 반려견 이름과 나란히 쓸 때는 "초코 · 초코 보호자(5678)" 같은 중복을 피한다.
    const whoOf = (c) => {
      if (c.name) return c.name;
      const last4 = (c.phone || '').replace(/\D/g, '').slice(-4);
      return last4 ? '보호자(' + last4 + ')' : '보호자';
    };
    // 목록·칩에 공통으로 쓰는 한 줄 표기
    const labelOf = (c) => {
      const cp = petsByCustomer[c.id] || [];
      const petPart = cp.length === 0 ? ''
        : (cp.length === 1 ? cp[0].name : cp[0].name + ' 외 ' + (cp.length - 1) + '마리');
      if (petPart) return petPart + ' · ' + whoOf(c);
      return App.getCustomerLabel(c, cp) + (c.phone ? ' (' + this.formatPhone(c.phone) + ')' : '');
    };

    container.innerHTML = `
      <div class="search-select">
        <div class="cust-chip" id="${containerId}-chip" style="display:none">
          <span class="cust-chip-text" id="${containerId}-chip-text"></span>
          <button type="button" class="cust-chip-clear" id="${containerId}-chip-clear" aria-label="고객 선택 해제">&#x2715;</button>
        </div>
        <input type="text" id="${containerId}-input" placeholder="반려견/고객 이름, 전화번호 검색..." autocomplete="off">
        <input type="hidden" id="${containerId}-value" value="">
        <div class="search-select-dropdown" id="${containerId}-dropdown"></div>
      </div>
    `;

    const input = document.getElementById(`${containerId}-input`);
    const hidden = document.getElementById(`${containerId}-value`);
    const dropdown = document.getElementById(`${containerId}-dropdown`);
    const chip = document.getElementById(`${containerId}-chip`);
    const chipText = document.getElementById(`${containerId}-chip-text`);

    const closeDropdown = () => {
      dropdown.classList.remove('open');
      dropdown.classList.remove('search-select-dropdown-form');
      App._quickCustFormOpen = false;
    };

    // 선택 확정 → 칩으로 잠금
    const lockSelection = (cid, text) => {
      hidden.value = String(cid);
      chipText.textContent = text;
      chip.style.display = 'flex';
      input.style.display = 'none';
      input.value = '';
      closeDropdown();
    };
    const unlockSelection = () => {
      hidden.value = '';
      chip.style.display = 'none';
      input.style.display = '';
    };

    // 인라인 등록 결과를 이 컴포넌트의 캐시에도 반영 (다시 열었을 때 검색되도록)
    const addLocal = (cust, pet) => {
      sorted.push(cust);
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      if (pet) {
        if (!petsByCustomer[cust.id]) petsByCustomer[cust.id] = [];
        petsByCustomer[cust.id].push(pet);
      }
    };

    // 일치 위치를 점수로 쓴다. 0이면 앞글자 일치 → 위로 올린다.
    const matchScore = (c, q, qDigits) => {
      let best = -1;
      const consider = (s) => {
        if (!s) return;
        const i = s.indexOf(q);
        if (i !== -1 && (best === -1 || i < best)) best = i;
      };
      if (q) {
        consider((c.name || '').normalize('NFC').toLowerCase());
        (petsByCustomer[c.id] || []).forEach(p => consider((p.name || '').normalize('NFC').toLowerCase()));
      }
      if (qDigits) {
        const i = (c.phone || '').replace(/\D/g, '').indexOf(qDigits);
        if (i !== -1 && (best === -1 || i < best)) best = i;
      }
      return best;
    };

    const newCustomerRow = (label, id) =>
      `<div class="search-select-option search-select-new" id="${id}">${label}</div>`;

    const openInlineForm = (query) => {
      App._showInlineCustomerForm({
        dropdown, onChange, lockSelection, labelOf, addLocal,
        query: query || ''
      });
    };

    const renderOptions = (query) => {
      // 신규 등록 폼을 작성 중이면 목록을 다시 그리지 않는다.
      // (검색창을 다시 터치하면 focus 이벤트로 폼이 통째로 지워지던 경로)
      if (App._quickCustFormOpen) return;
      const q = (query || '').trim().normalize('NFC').toLowerCase();
      const qDigits = q.replace(/\D/g, '');

      if (!q) {
        dropdown.innerHTML =
          `<div class="search-select-option"><span style="color:var(--text-muted)">반려견/고객 이름, 전화번호를 입력하세요</span></div>` +
          newCustomerRow('+ 새 고객 등록', 'btn-inline-new-cust');
        dropdown.classList.add('open');
        document.getElementById('btn-inline-new-cust')?.addEventListener('click', (ev) => {
          ev.stopPropagation();
          openInlineForm('');
        });
        return;
      }

      const filtered = sorted
        .map(c => ({ c, s: matchScore(c, q, qDigits) }))
        .filter(x => x.s >= 0)
        .sort((a, b) => a.s - b.s)
        .map(x => x.c);

      if (filtered.length === 0) {
        dropdown.innerHTML =
          `<div class="search-select-option"><span style="color:var(--text-muted)">검색 결과 없음</span></div>` +
          newCustomerRow(`+ "${App.escapeHtml(query.trim())}" 새 고객 등록`, 'btn-inline-new-cust');
      } else {
        dropdown.innerHTML = filtered.slice(0, 20).map(c => {
          const cp = petsByCustomer[c.id] || [];
          const petPart = cp.length === 0 ? '' : (() => {
            const hit = cp.find(p => (p.name || '').normalize('NFC').toLowerCase().includes(q));
            const head = hit || cp[0];
            const rest = cp.length - 1;
            return head.name + (rest > 0 ? ' 외 ' + rest + '마리' : '');
          })();
          const display = petPart
            ? `${this.escapeHtml(petPart)} · ${this.escapeHtml(whoOf(c))} <span class="sub">${this.formatPhone(c.phone)}</span>`
            : `${this.escapeHtml(App.getCustomerLabel(c, cp))} <span class="sub">${this.formatPhone(c.phone)}</span>`;
          return `<div class="search-select-option" data-id="${c.id}">${display}</div>`;
        }).join('') + newCustomerRow('+ 새 고객 등록', 'btn-inline-new-cust');
      }
      dropdown.classList.add('open');
      document.getElementById('btn-inline-new-cust')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openInlineForm(input.value.trim());
      });
    };

    document.getElementById(`${containerId}-chip-clear`)?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      unlockSelection();
      if (onChange) onChange('');
      input.focus();
      renderOptions('');
    });

    input.addEventListener('focus', () => {
      renderOptions(input.value);
      setTimeout(() => input.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
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
      clearTimeout(_searchTimer);
      // 한글 조합 중에는 조합이 끝나길 조금 더 기다린다
      _searchTimer = setTimeout(() => renderOptions(input.value), _isComposing ? 400 : 200);
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const opt = e.target.closest('.search-select-option');
      if (opt && opt.dataset.id) {
        const picked = sorted.find(c => c.id === Number(opt.dataset.id));
        lockSelection(opt.dataset.id, picked ? labelOf(picked) : '');
        if (onChange) onChange(Number(opt.dataset.id));
      }
    });

    const outsideClickHandler = (e) => {
      // 신규 등록 폼을 작성 중일 때는 바깥 터치로 닫지 않는다 (입력 내용 소실 방지)
      if (App._quickCustFormOpen) return;
      if (!e.target.closest(`#${containerId}`)) dropdown.classList.remove('open');
    };
    if (container._outsideClickHandler) {
      document.removeEventListener('click', container._outsideClickHandler);
    }
    container._outsideClickHandler = outsideClickHandler;
    document.addEventListener('click', outsideClickHandler);

    // 기존 선택값 복원
    if (selectedId) {
      const selected = sorted.find(c => c.id === Number(selectedId));
      if (selected) lockSelection(selected.id, labelOf(selected));
    }
  },

  // 인라인 빠른 고객+반려견 등록 폼 (검색 드롭다운 안에서 뜬다)
  _showInlineCustomerForm(ctx) {
    const { dropdown, onChange, lockSelection, labelOf, addLocal, query } = ctx;
    // 숫자가 섞였으면 전화번호로, 아니면 반려견 이름으로 프리필한다
    const prefill = /\d/.test(query) ? { phone: query } : { petName: query };

    App._quickCustFormOpen = true;
    dropdown.classList.add('open', 'search-select-dropdown-form');
    dropdown.innerHTML = `
      <div class="cf-inline">
        <div class="cf-inline-title">새 고객 등록</div>
        ${App.customerFormHtml(prefill)}
        <div class="cf-inline-actions">
          <button type="button" class="btn btn-primary" id="cf-inline-save">등록</button>
          <button type="button" class="btn btn-secondary" id="cf-inline-cancel">취소</button>
        </div>
      </div>
    `;

    const pickExisting = (c) => {
      lockSelection(c.id, labelOf(c));
      if (onChange) onChange(c.id);
    };

    App.bindCustomerForm({ onPick: pickExisting });
    setTimeout(() => document.getElementById(prefill.petName ? 'cf-phone' : 'cf-petName')?.focus(), 120);

    document.getElementById('cf-inline-save')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const btn = ev.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = '등록 중...';
      try {
        const result = await App.saveCustomerForm({ onPick: pickExisting });
        if (!result) return;
        const cust = await DB.get('customers', result.customerId);
        const pet = result.petId ? await DB.get('pets', result.petId) : null;
        if (cust) addLocal(cust, pet);
        lockSelection(result.customerId, cust ? labelOf(cust) : result.label);
        // 반려견 셀렉트 갱신은 onChange에 맡긴다 (예전엔 200ms 뒤 innerHTML로 덮어써서
        // change 이벤트가 안 나가 사이즈·이전기록 버튼이 뜨지 않았다)
        if (onChange) await onChange(result.customerId, result.petId);
        App.showToast(`${result.label} 등록 완료`);
      } catch (err) {
        console.error('Inline customer save error:', err);
        App.showToast('등록 중 오류가 발생했습니다.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '등록';
      }
    });

    document.getElementById('cf-inline-cancel')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      App._quickCustFormOpen = false;
      dropdown.classList.remove('open', 'search-select-dropdown-form');
    });
  },

  // 고객이 바뀌면 반려견 셀렉트를 다시 채운다.
  // 반려견이 하나도 없으면 그 자리에서 등록할 수 있는 버튼을 띄운다 (예전엔 여기서 막혔다).
  async refreshPetSelect(customerId, preferPetId) {
    const select = document.getElementById('f-petId');
    if (!select) return;

    let area = document.getElementById('f-pet-add-area');
    if (!area) {
      area = document.createElement('div');
      area.id = 'f-pet-add-area';
      select.parentElement?.appendChild(area);
    }
    area.innerHTML = '';

    if (!customerId) {
      select.innerHTML = '<option value="">먼저 고객을 선택하세요</option>';
      select.dispatchEvent(new Event('change'));
      return;
    }

    const pets = await DB.getByIndex('pets', 'customerId', Number(customerId));
    if (pets.length === 0) {
      select.innerHTML = '<option value="">등록된 반려견이 없습니다</option>';
      area.innerHTML = `
        <button type="button" class="btn btn-sm btn-primary" id="btn-inline-add-pet" style="margin-top:6px;width:100%;min-height:44px">+ 이 고객의 반려견 등록</button>
        <div id="inline-pet-form"></div>`;
      document.getElementById('btn-inline-add-pet')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._showInlinePetForm(Number(customerId));
      });
    } else {
      select.innerHTML = '<option value="">반려견 선택</option>' + await this.getPetOptions(customerId, null);
      const prefer = preferPetId && pets.some(p => p.id === Number(preferPetId)) ? Number(preferPetId)
        : (pets.length === 1 ? pets[0].id : null);
      if (prefer) select.value = String(prefer);
    }
    select.dispatchEvent(new Event('change'));
  },

  _showInlinePetForm(customerId) {
    const host = document.getElementById('inline-pet-form');
    if (!host) return;
    const addBtn = document.getElementById('btn-inline-add-pet');
    if (addBtn) addBtn.style.display = 'none';

    host.innerHTML = `
      <div class="cf-inline" style="margin-top:8px">
        <div class="form-group">
          <label class="form-label">반려견 이름 <span class="required">*</span></label>
          <input type="text" id="ip-name" placeholder="반려견 이름" maxlength="30">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">견종</label>
            <input type="text" id="ip-breed" placeholder="예: 말티즈">
          </div>
          <div class="form-group">
            <label class="form-label">몸무게 (kg)</label>
            <input type="number" id="ip-weight" placeholder="예: 3.5" step="0.1" min="0" max="120">
          </div>
        </div>
        <div class="cf-inline-actions">
          <button type="button" class="btn btn-primary" id="ip-save">반려견 등록</button>
          <button type="button" class="btn btn-secondary" id="ip-cancel">취소</button>
        </div>
      </div>`;
    setTimeout(() => document.getElementById('ip-name')?.focus(), 80);

    document.getElementById('ip-cancel')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      host.innerHTML = '';
      const b = document.getElementById('btn-inline-add-pet');
      if (b) b.style.display = '';
    });

    document.getElementById('ip-save')?.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const btn = ev.currentTarget;
      if (btn.disabled) return;
      const name = document.getElementById('ip-name')?.value.trim();
      if (!name) {
        this.showToast('반려견 이름을 입력해주세요.', 'error');
        this.highlightField('ip-name');
        return;
      }
      btn.disabled = true;
      btn.textContent = '등록 중...';
      try {
        const data = {
          customerId: Number(customerId),
          name,
          breed: document.getElementById('ip-breed')?.value.trim() || ''
        };
        const weight = parseFloat(document.getElementById('ip-weight')?.value);
        if (weight > 0) {
          data.weight = weight;
          data.size = weight < 7 ? 'small' : weight < 15 ? 'medium' : 'large';
        }
        const petId = await DB.add('pets', data);
        this.showToast(`${name} 등록 완료`);
        await this.refreshPetSelect(customerId, petId); // area를 다시 그리므로 이 폼은 사라진다
      } catch (err) {
        console.error('Inline pet save error:', err);
        this.showToast('반려견 등록 중 오류가 발생했습니다.', 'error');
        btn.disabled = false;
        btn.textContent = '반려견 등록';
      }
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
    // 1인 매장 자동 채움: 등록 미용사 1명 + 선택 안 됨 → 자동
    if (!selected && registered.length === 1) selected = registered[0];
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
          <button class="btn btn-primary" id="gs-new-customer-btn">+ 새 반려견 등록</button>
        </div>`;
      document.getElementById('gs-new-customer-btn')?.addEventListener('click', () => {
        const searchQuery = document.getElementById('global-search-input')?.value?.trim() || '';
        App.closeSearch();
        // history.back() popstate가 소화된 후 모달 열기 (타이밍 충돌 방지)
        setTimeout(() => {
          // 검색어가 숫자면 전화번호로, 아니면 반려견 이름으로 프리필한다
          const prefill = /\d/.test(searchQuery) ? { phone: searchQuery } : { petName: searchQuery };
          App.pages.customers?.showForm(null, (newCustomerId, _name, result) => {
            // 표시 라벨은 폼이 지워지기 전에 만들어진 result에서 가져온다
            App.showToast(`${result?.label || '고객'} 등록되었습니다.`);
            setTimeout(() => {
              App.pages.appointments?.showForm(null, newCustomerId, result?.petId ? { petId: result.petId } : undefined);
            }, 300);
          }, prefill);
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
            const hasPhoto = p.photoThumb || p.photo;
            const photoHtml = hasPhoto
              ? `<img src="${p.photoThumb || p.photo}" alt="${this.escapeHtml(p.name)}">`
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
    // iOS Safari는 7일 미사용 시 데이터 삭제 위험 → 7일 주기, 그 외 14일
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const threshold = isIOS ? 7 : 14;
    return days >= threshold;
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

  // 강력한 body 스크롤 잠금 (iOS Safari 호환 — position:fixed 트릭, 중첩 카운팅 안전)
  _bodyLockCount: 0,
  _bodyScrollY: 0,
  _lockBody() {
    if (this._bodyLockCount > 0) { this._bodyLockCount++; return; }
    this._bodyScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${this._bodyScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    this._bodyLockCount = 1;
  },
  _unlockBody() {
    if (this._bodyLockCount > 1) { this._bodyLockCount--; return; }
    if (this._bodyLockCount === 0) return;
    const y = this._bodyScrollY;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    this._bodyLockCount = 0;
    this._bodyScrollY = 0;
    if (y) window.scrollTo(0, y);
  },

  openLightbox() {
    const lb = document.getElementById('photo-lightbox');
    const item = this._lightboxImages[this._lightboxIndex];
    document.getElementById('lightbox-img').src = item.src;
    document.getElementById('lightbox-caption').textContent = item.caption;
    lb.classList.remove('hidden');
    this._lockBody();

    const hasMultiple = this._lightboxImages.length > 1;
    document.getElementById('lightbox-prev').style.display = hasMultiple ? 'block' : 'none';
    document.getElementById('lightbox-next').style.display = hasMultiple ? 'block' : 'none';
  },

  closeLightbox() {
    document.getElementById('photo-lightbox').classList.add('hidden');
    this._unlockBody();
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
