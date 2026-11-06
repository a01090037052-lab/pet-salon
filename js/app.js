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
      this.setupApptResultActions();
      this.setupGlobalSearch();
      this.setupLightbox();
      this.setupVersionDisplay();
      this.registerSW();
      this.setupOfflineIndicator();
      this.setupTabSync();
      this.setupMobileKeyboard();
      this.handleRoute();
      window.addEventListener('hashchange', () => this.handleRoute());
      // 저장 안 한 변경이 있는 화면(App.leaveGuardDirty)에서 새로고침·닫기 → 브라우저가 한 번 묻는다
      window.addEventListener('beforeunload', (e) => {
        if (this.leaveGuardDirty) { e.preventDefault(); e.returnValue = ''; }
      });
      // 기기 간 동기화 (켜져 있을 때만 동작, 앱 시작을 막지 않는다)
      this.setupSyncDot();
      if (typeof Sync !== 'undefined') {
        Sync.init().catch(e => console.warn('Sync.init 실패 (무시):', e));
      }
      await this.updateBadges();
      await this.applyShopName();
      await this.applyTheme();
      // 예약 알림 (Web Push): 이 기기 등록 확인 → 알림 목록 올리기. 다시 보일 때도 (기다리지 않는다)
      this.Push.ensureDevice().then(() => this.Push.scheduleUpload());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.Push.ensureDevice().then(() => this.Push.scheduleUpload());
      });
      // 저장 공간 quota 체크 (fire-and-forget, UI 차단 안 함)
      this.setupStorageQuotaCheck();
      // 데이터 무결성 점검 (fire-and-forget, 하루 1회)
      this.setupIntegrityCheck();
      // 인라인 등록 폼이 한글 사이즈를 저장하던 시기의 데이터 정정 (1회)
      this.migratePetSizes();
      // v184 몸무게 구간 가격: 구간표 만들기 + 사이즈 가격 → 구간 가격 변환 (매번 확인, 안내는 처음 1회)
      this.migratePriceBands();
      // 반려견 방문 통계(firstVisitDate·lastVisitDate·visitCount) 1회 채우기 — 목록 페이지가 기록 전체를 읽지 않게 한다
      this.migratePetVisitStats();
      // v175 이전에 기록 본문에 박혀 있던 사진을 photos 스토어로 1회 옮긴다 — 그래야 반려견 상세 사진 줄에 보이고 동기화·보관 정리 대상이 된다
      setTimeout(() => this.migrateInlinePhotos().catch(e => console.warn('인라인 사진 변환 실패 (무시):', e)), 8000);
      // 복원이 중간에 실패하면 남는 임시 사본(최대 수 MB)이 휴대폰 저장 공간을 계속 차지했다 → 7일 지나면 지운다
      try {
        const snap = localStorage.getItem('__petsalon_import_snapshot__');
        if (snap) {
          const ts = Number((snap.match(/"ts":(\d+)/) || [])[1]) || 0;
          if (!ts || Date.now() - ts > 7 * 86400000) localStorage.removeItem('__petsalon_import_snapshot__');
        }
      } catch (_) {}
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
    // ×·닫기 버튼도 바깥 누름과 같이 — 작성 중이면 한 번 묻는다
    document.getElementById('modal-close').addEventListener('click', () => this.requestCloseModal());
    document.getElementById('modal-cancel').addEventListener('click', () => this.requestCloseModal());
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.requestCloseModal();
    });
    // 작성 중 표시: 모달을 연 뒤 사장님이 직접 입력·선택하면 '작성 중' (자동 채움 같은 코드 이벤트는 제외)
    const mb = document.getElementById('modal-body');
    const markDirty = (e) => { if (e.isTrusted) this._modalDirty = true; };
    mb.addEventListener('input', markDirty);
    mb.addEventListener('change', markDirty);
    // 값을 바꾸는 칩·토글을 누른 것도 작성으로 본다 (접기·펼치기 같은 버튼은 제외)
    mb.addEventListener('click', (e) => {
      if (e.isTrusted && e.target.closest('.payment-chip, .condition-chip, .free-toggle, .addon-tag, .service-chip, .custom-included-tag, #btn-copy-last-record, .rec-photo-del')) this._modalDirty = true;
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
        } else if (Array.from(document.querySelectorAll('#modal-body .search-select-dropdown')).some(d => d.style.display !== 'none' && d.offsetParent !== null)) {
          // 자동완성 목록이 열려 있으면 목록만 닫는다 (창을 닫거나 '작성 중' 확인을 띄우지 않는다)
          // 고객 고르기 목록은 .open 클래스로, 기록 폼 자동완성은 style.display 로 열고 닫는다 — 둘 다 같은 방식으로 닫아야
          // (예전엔 고객 목록에 display:none 을 박아 두어, 그 뒤로는 칸을 눌러도 목록이 다시 안 열렸다)
          document.querySelectorAll('#modal-body .search-select-dropdown').forEach(d => {
            if (d.classList.contains('open')) { d.classList.remove('open', 'search-select-dropdown-form'); this._quickCustFormOpen = false; }
            if (d.style.display) d.style.display = 'none';
          });
        } else if (!document.getElementById('modal-overlay').classList.contains('hidden')) {
          this.requestCloseModal();
        }
      }
      // 창(모달·확인)이 열려 있으면 찾기를 열지 않는다 — 찾기를 닫을 때 뒤로가기가 그 창까지 닫는다
      const overOpen = ['modal-overlay', 'confirm-overlay'].some(id => !document.getElementById(id)?.classList.contains('hidden'));
      // Ctrl/Cmd+K — 어디서든 찾기 (입력 중이어도)
      if (!overOpen && (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const so = document.getElementById('global-search-overlay');
        if (so && so.classList.contains('hidden')) this.openSearch();
        else document.getElementById('global-search-input')?.focus();
        return;
      }
      // "/" shortcut to open search (when not in input/textarea/select)
      if (!overOpen && e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
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
    // 키보드(Enter/Space)로도 열리게 — div 기반 버튼이라 기본 동작이 없다
    [moreBtn, addBtn].forEach(btn => btn && btn.addEventListener('keydown', (e) => {
      if (e.target !== btn) return; // 메뉴 안의 링크에서 누른 Enter 는 링크가 처리
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    }));

    // More menu toggle
    if (moreBtn && moreMenu) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addMenu?.classList.remove('open');
        moreMenu.classList.toggle('open');
      });
      document.addEventListener('click', () => moreMenu?.classList.remove('open'));
      moreMenu.querySelectorAll('.bottom-more-item').forEach(item => {
        // 메뉴 항목이 토글 버튼의 자식이라 클릭이 버블링되면 메뉴가 닫혔다가 다시 열린다
        item.addEventListener('click', (e) => { e.stopPropagation(); moreMenu.classList.remove('open'); });
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
        item.addEventListener('click', (e) => {
          e.stopPropagation();
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
        // 아이폰 홈 화면 앱은 껐다 켜지 않고 돌아오기만 해서 며칠씩 옛 버전으로 돌았다 → 돌아올 때도 확인 (1시간에 한 번)
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 3600000) return;
          lastCheck = Date.now();
          reg.update().catch(() => {});
        });
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

  // 사이드바 버전 옆 동기화 상태 점 (꺼져 있으면 숨김)
  setupSyncDot() {
    const labels = { synced: '동기화됨', pending: '보낼 변경 대기 중', error: '동기화 오류', offline: '오프라인', signin: '로그인 필요' };
    window.addEventListener('sync:status', (e) => {
      const dot = document.getElementById('sync-dot');
      if (!dot) return;
      const st = (e.detail) || (typeof Sync !== 'undefined' ? Sync.getStatus() : null);
      if (!st || st.state === 'off') { dot.hidden = true; return; }
      dot.hidden = false;
      const cls = st.state === 'signin' ? 'offline' : st.state;
      dot.className = 'sync-dot ' + cls;
      const label = labels[st.state] || '';
      dot.title = st.pending > 0 ? `${label} · 대기 ${st.pending}건` : label;
      dot.setAttribute('aria-label', dot.title);
    });
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
  // 반려견별 방문 통계 비정규화. 고객/반려견 목록·분석이 매번 records 전체를 읽지 않도록
  // pet.firstVisitDate / lastVisitDate / visitCount 를 채운다. 이후엔 기록 저장·삭제 시 records.js 가 유지.
  // 플래그는 IDB 설정에 두어 백업 복원(구버전 데이터) 후에도 다시 실행되게 한다 (force=true 로 호출).
  async migratePetVisitStats(force = false) {
    if (DB.mode === 'server') return;
    try {
      if (!force && (await DB.getSetting('petVisitStatsVersion')) === 1) return;
      const [pets, records] = await Promise.all([
        DB.getAll('pets'),
        DB.getAllLight('records', ['photoBefore', 'photoAfter', 'photo3', 'photo4', 'memo', 'addons', 'skinStatus'])
      ]);
      const stat = {};
      records.forEach(r => {
        if (!r.petId || !r.date) return;
        const s = stat[r.petId] || (stat[r.petId] = { first: null, last: null, count: 0 });
        s.count++;
        if (!s.first || r.date < s.first) s.first = r.date;
        if (!s.last || r.date > s.last) s.last = r.date;
      });
      let changed = 0;
      for (const p of pets) {
        const s = stat[p.id] || { first: null, last: null, count: 0 };
        if (p.firstVisitDate !== s.first || p.lastVisitDate !== s.last || p.visitCount !== s.count) {
          p.firstVisitDate = s.first; p.lastVisitDate = s.last; p.visitCount = s.count;
          await DB.update('pets', p); changed++;
        }
      }
      await DB.setSetting('petVisitStatsVersion', 1);
      if (changed > 0) console.info(`[migrate] 반려견 방문 통계 ${changed}건 갱신`);
    } catch (e) {
      console.warn('pet visit stats migration failed', e);
    }
  },

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
          `데이터 모순 ${report.issues.length}건 감지. 백업 후 설정에서 점검하세요. (콘솔 로그 확인)`,
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
          `저장 공간 위험 (${quota.percentage}%, ${usedMB}/${quotaMB}MB) — 즉시 백업 후 사진을 정리해주세요.`,
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
    // 이미 키패드가 올라온 채 다음 칸(예: 서비스 수정의 가격)을 누르면 viewport resize 가 안 나서 칸이 키패드 밑에 숨었다.
    // → 모달 안 입력 칸에 포커스가 오면 잠시 뒤 한 번만, 화면 아래쪽에 있을 때만 가운데로 올린다.
    //   그 사이 사용자가 직접 스크롤(터치 이동)하면 건드리지 않는다.
    let userMoved = false;
    document.addEventListener('touchmove', () => { userMoved = true; }, { passive: true });
    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!el || !el.matches || !el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea')) return;
      if (!el.closest('#modal-overlay')) return;
      userMoved = false;
      setTimeout(() => {
        if (userMoved || document.activeElement !== el) return;
        const vh = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : window.innerHeight;
        const r = el.getBoundingClientRect();
        if (r.bottom > vh * 0.6 || r.top < 0) {
          try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) { el.scrollIntoView(); }
        }
      }, 300);
    });
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
    banner.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;z-index:10000;background:var(--danger,#e74c3c);color:#fff;text-align:center;padding:6px;font-size:0.93rem;font-weight:600';
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

  // 화면 떠나기 확인 (leaveGuard) 약속:
  //  - App.leaveGuard = async (nextHash) => boolean. 다른 화면(해시가 바뀜)으로 갈 때 라우터가 먼저 부른다.
  //    false → 주소를 지금 화면으로 되돌리고(다시 그리지 않음) 멈춘다. true(또는 오류) → 지우고 이동한다.
  //  - App.leaveGuardDirty = true 이면 새로고침·앱 닫기 때 브라우저가 한 번 묻는다 (beforeunload).
  //  - 실제로 다른 화면으로 넘어가면 둘 다 자동으로 지워진다 (화면이 다시 설정할 것).
  //  - 같은 화면 새로고침(handleRoute() 직접 호출)은 묻지 않는다. App.navigate 도 hashchange 를 거치므로 같은 길.
  handleRoute() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const prevHash = this._routeHash;
    // 떠나기 거절 후 history.back()/forward() 로 되돌린 hashchange — 지금 화면 그대로 둔다
    if (this._leaveRestoring && hash === prevHash) { this._leaveRestoring = false; return; }
    if (prevHash != null && hash !== prevHash) {
      if (typeof this.leaveGuard === 'function') return this._runLeaveGuard(hash, prevHash);
      this.leaveGuard = null;
      this.leaveGuardDirty = false;
    }
    this._routeHash = hash;
    this._stampRouteIdx();
    const [page, ...params] = hash.split('/');
    this.currentPage = page;

    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });
    // Sync bottom nav
    // 고객 탭은 반려견 상세에서도, 더보기는 그 안의 화면(매출·분석·설정 등)에서도 켜 둔다
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
      const also = (item.dataset.also || '').split(' ');
      item.classList.toggle('active', item.dataset.page === page || also.includes(page));
    });

    this.renderPage(page, params);
  },

  // 느린 폰에서 메뉴를 연달아 누르면 앞 화면의 render 가 늦게 끝나 새 화면을 덮어썼다.
  // → 그리는 중이면 끝날 때까지 기다렸다가, 마지막으로 누른 화면만 그린다. (서로 기다리다 멈추지 않게 최대 3초)
  async renderPage(page, params) {
    const seq = this._renderSeq = (this._renderSeq || 0) + 1;
    if (this._renderBusy) {
      try { await Promise.race([this._renderBusy, new Promise(r => setTimeout(r, 3000))]); } catch (_) {}
    }
    if (seq !== this._renderSeq) return;
    let done;
    const busy = new Promise(r => { done = r; });
    this._renderBusy = busy;
    try { await this._renderPageNow(page, params); }
    finally { done(); if (this._renderBusy === busy) this._renderBusy = null; }
  },

  async _renderPageNow(page, params) {
    window.scrollTo(0, 0);
    document.getElementById('main-content').scrollTop = 0;
    const pageModule = this.pages[page];
    if (pageModule && pageModule.render) {
      const content = document.getElementById('page-content');
      // 화면별 레이아웃(CSS)용 표시 — 데스크톱에서 화면마다 폭·단 나눔을 다르게 준다
      content.dataset.page = page;
      content.dataset.view = params && params.length ? 'detail' : 'list';
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
            <div class="empty-state-icon">${this.icon('alert', 'ico-xl')}</div>
            <div class="empty-state-text">페이지를 불러오는 중 오류가 발생했습니다.</div>
            <div style="font-size:0.93rem;color:var(--text-muted);margin:8px 0">${App.escapeHtml(err?.message || '')}</div>
            <div style="display:flex;gap:8px;justify-content:center">
              <button class="btn btn-primary" onclick="App.navigate('${page}')">다시 시도</button>
              <button class="btn btn-secondary" onclick="App.navigate('dashboard')">홈으로</button>
            </div>
          </div>`;
      }
    }
  },

  // 화면 이동마다 history 항목에 순번(routeIdx)을 붙여 둔다 — 떠나기 거절 때 뒤로/앞으로 중 어느 쪽으로 왔는지 알려고.
  // 모달·확인창이 쌓은 항목(modalOpen/confirmOpen)에는 붙이지 않는다.
  _stampRouteIdx() {
    const st = history.state;
    if (st && st.routeIdx != null) { this._curRouteIdx = st.routeIdx; return; }
    if (st && (st.modalOpen || st.confirmOpen)) return;
    const idx = (this._curRouteIdx || 0) + 1;
    try { history.replaceState(Object.assign({}, st || {}, { routeIdx: idx }), ''); } catch (_) {}
    this._curRouteIdx = idx;
  },

  async _runLeaveGuard(nextHash, prevHash) {
    if (this._leaveGuardBusy) return; // 묻는 중에 또 바뀐 주소는 답을 받은 뒤 현재 주소 기준으로 처리
    this._leaveGuardBusy = true;
    // 확인창이 history 를 쌓기 전에 방향을 읽는다: 순번 없음 = 새로 연 주소(앞으로 쌓임), 작으면 뒤로가기, 크면 앞으로가기
    const arrivedIdx = history.state && history.state.routeIdx;
    const cameBack = arrivedIdx != null && this._curRouteIdx != null && arrivedIdx < this._curRouteIdx;
    let ok = true;
    try { ok = (await this.leaveGuard(nextHash)) !== false; }
    catch (err) { console.warn('leaveGuard 오류 (이동 허용):', err); ok = true; }
    // 확인창이 닫히며 낸 history.back() 이 끝난 뒤에 주소를 만져야 엉뚱한 항목을 바꾸지 않는다
    const t0 = Date.now();
    while (history.state && history.state.confirmOpen && Date.now() - t0 < 600) {
      await new Promise(r => setTimeout(r, 30));
    }
    this._leaveGuardBusy = false;
    if (!ok) {
      // 들어온 이동을 되감는다 (주소만 바꿔 치우면 같은 항목이 두 번 남거나 앞 화면이 지워져 뒤로가기가 꼬였다)
      if (cameBack) {
        // 뒤로가기로 왔으면: 확인창의 pushState 가 앞 항목(지금 화면)을 이미 지웠다 → forward() 로는 못 돌아간다.
        // 지금 화면 주소를 같은 순번으로 다시 쌓는다 (pushState 는 hashchange 를 내지 않아 다시 묻거나 그리지 않는다)
        history.pushState({ routeIdx: this._curRouteIdx }, '', '#' + prevHash);
      } else {
        // 새로 연 주소·앞으로가기로 왔으면: 한 칸 뒤로 — 그 hashchange 는 _leaveRestoring 으로 다시 묻거나 그리지 않는다
        this._leaveRestoring = true;
        clearTimeout(this._leaveRestoreTimer);
        this._leaveRestoreTimer = setTimeout(() => { this._leaveRestoring = false; }, 1000);
        history.back();
      }
      return; // leaveGuard 는 그대로 — 다음 이동 때도 다시 묻는다
    }
    this.leaveGuard = null;
    this.leaveGuardDirty = false;
    this.handleRoute();
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
      const todayCount = todayAppointments.filter(a => !['cancelled', 'completed', 'noshow'].includes(a.status)).length;
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
    // 이전 confirm 이 남긴 억제 플래그가 새 모달의 첫 뒤로가기를 삼키지 않도록 초기화
    this._suppressModalPop = false;
    this._lastFocusedElement = document.activeElement;
    const { title, content, onSave, size, hideFooter, saveText, noAutoFocus } = options;
    this._modalDirty = false;
    document.getElementById('modal-title').textContent = title;
    const modalBodyEl = document.getElementById('modal-body');
    modalBodyEl.innerHTML = content;

    const modal = document.getElementById('modal');
    modal.classList.toggle('modal-lg', size === 'lg');
    // 새로 여는 창은 항상 맨 위부터 — 앞 창(예: 미용 기록)에서 내려 둔 스크롤 위치가 남아 중간부터 보였다
    const resetModalScroll = () => { modalBodyEl.scrollTop = 0; modal.scrollTop = 0; };
    resetModalScroll();
    requestAnimationFrame(resetModalScroll); // 내용이 그린 직후 높이가 바뀌는 창도 맨 위로

    const footer = document.getElementById('modal-footer');
    footer.style.display = hideFooter ? 'none' : 'flex';
    footer.querySelectorAll('.modal-extra-btn').forEach(b => b.remove()); // 이전 모달이 붙인 보조 버튼 (예: 저장하고 이어서 등록)

    const saveBtn = document.getElementById('modal-save');
    saveBtn.textContent = saveText || '저장';
    saveBtn.disabled = false;
    delete saveBtn.dataset.label; // 저장 버튼 글자를 화면이 바꿔 둔 경우(예: 미리보기 → 'N개 적용') 저장 뒤 그 글자로 돌린다
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
        saveBtn.textContent = saveBtn.dataset.label || saveText || '저장';
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
      const onEnd = () => { modal.style.transition = ''; if (dy > 100) { this.requestCloseModal(); } modal.style.transform = ''; dy = 0; };
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

    // Focus first input (noAutoFocus: 숫자 칸이 많은 모달은 아이폰 키패드가 화면을 가리지 않게 열 때 포커스하지 않는다)
    if (!noAutoFocus) setTimeout(() => {
      const firstInput = document.querySelector('#modal-body input:not([type="hidden"]):not([type="checkbox"]), #modal-body select');
      firstInput?.focus();
    }, 100);

    // Enter key to save (use onkeydown to avoid listener accumulation)
    const modalBody = document.getElementById('modal-body');
    modalBody.onkeydown = (e) => {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      // 한글 조합 중 Enter 는 마지막 글자 확정용 — 저장하면 글자가 잘린 채 저장된다
      if (e.isComposing || e.keyCode === 229) return;
      // 모달 안의 보조 폼(인라인 고객 등록, 즉석 서비스 등록)에서는 그 폼의 Enter 동작만 수행
      if (e.target.closest('.cf-inline, #quickadd-service-form, [data-no-enter-save]')) return;
      e.preventDefault();
      const saveBtn = document.getElementById('modal-save');
      if (saveBtn && saveBtn.onclick) saveBtn.click();
    };
  },

  // 바깥 누름·Esc·끌어내리기로 닫을 때: 저장 버튼이 있는 입력 창에서 작성 중이면 한 번 묻는다
  async requestCloseModal() {
    const overlay = document.getElementById('modal-overlay');
    if (overlay.classList.contains('hidden')) return;
    const saveBtn = document.getElementById('modal-save');
    const isForm = saveBtn && saveBtn.onclick && document.getElementById('modal-footer').style.display !== 'none';
    if (this._modalDirty && isForm) {
      const ok = await this.confirm('작성 중인 내용이 있어요. 닫을까요?', { okLabel: '닫기', cancelLabel: '계속 작성' });
      if (!ok) return;
    }
    this.closeModal();
  },

  closeModal(fromPopstate) {
    const overlay = document.getElementById('modal-overlay');
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    overlay.classList.remove('animate-in');
    this._unlockBody();
    const modalBody = document.getElementById('modal-body');
    modalBody.onkeydown = null;
    // records.js 사진 카드가 심은 핸들러 정리 (다른 모달에 새지 않게)
    modalBody.oninput = null;
    modalBody.onchange = null;
    modalBody.onclick = null;
    // 사진 카드용으로 풀어 둔 그림도 놓아 준다 (iOS 메모리)
    if (this.pages?.records?._imgCache) this.pages.records._imgCache.clear();
    modalBody.innerHTML = '';
    document.getElementById('modal-save').onclick = null;
    document.querySelectorAll('#modal-footer .modal-extra-btn').forEach(b => b.remove());
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
    this._suppressModalPop = false;
    this._modalDirty = false;
    if (!fromPopstate) {
      // 확인창이 막 닫히며 낸 history.back() 이 아직 처리 전이면 겹쳐 두 번 뒤로 가거나 항목이 남는다 — 잠깐 뒤에 정리
      const since = Date.now() - (this._lastConfirmCloseAt || 0);
      const doBack = () => {
        if (!document.getElementById('modal-overlay').classList.contains('hidden')) return; // 그새 다른 모달이 열렸으면 건드리지 않는다
        if (history.state && history.state.modalOpen) history.back();
      };
      if (since < 200) setTimeout(doBack, 200 - since); else doBack();
    }
  },

  // ========== Confirm Dialog ==========
  _confirmResolve: null,

  confirm(message, options = {}) {
    // 직전 confirm 이 닫히며 낸 history.back() 이 아직 처리 전이면, 그 popstate 가 새 confirm 을 즉시 '취소'로 닫아 버린다
    // (예: 전체 데이터 초기화의 2단계 확인이 눌러도 아무 일 없이 끝나던 문제). 잠깐 기다렸다가 연다.
    const since = Date.now() - (this._lastConfirmCloseAt || 0);
    if (since < 300) return new Promise(r => setTimeout(r, 300 - since)).then(() => this.confirm(message, options));
    // options: { okLabel, danger, cancelLabel }
    return new Promise((resolve) => {
      // 이전 confirm 이 아직 대기 중이면 취소로 종료시켜 호출자가 영원히 멈추지 않게 한다
      if (this._confirmResolve) { try { this._confirmResolve(false); } catch (_) {} }
      this._confirmResolve = resolve;
      const body = document.getElementById('confirm-body');
      body.innerHTML = `<p>${message}</p>`;
      const overlay = document.getElementById('confirm-overlay');
      overlay.classList.remove('hidden');
      this._lockBody();
      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');
      okBtn.textContent = options.okLabel || '확인';
      // 기본 '돌아가기' — '취소'는 '예약 취소'와 헷갈린다
      if (cancelBtn) cancelBtn.textContent = options.cancelLabel || '돌아가기';
      // danger 옵션이면 빨강 강조 (default도 btn-danger지만 명시적 처리)
      okBtn.classList.toggle('btn-danger', options.danger !== false);
      okBtn.classList.toggle('btn-primary', options.danger === false);
      okBtn.disabled = false;
      okBtn.style.display = '';
      okBtn.onclick = () => { okBtn.disabled = true; this.closeConfirm(true); };
      if (options.onOpen) { try { options.onOpen(body, okBtn); } catch (_) {} }
      // Android 뒤로가기 처리
      history.pushState({ confirmOpen: true }, '');
      this._confirmPopHandler = () => { this.closeConfirm(false, true); };
      window.addEventListener('popstate', this._confirmPopHandler, { once: true });
      // Focus confirm button
      setTimeout(() => document.getElementById('confirm-ok')?.focus(), 100);
    });
  },

  // 여러 갈래 중 하나 고르기. choices: [{ value, label(html) }]. 반환: 고른 value, 취소면 null
  choose(message, choices, opts = {}) {
    let picked = null;
    return this.confirm(message, {
      cancelLabel: opts.cancelLabel || '돌아가기', danger: false,
      onOpen: (body, okBtn) => {
        okBtn.style.display = 'none';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-top:14px';
        choices.forEach((c, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn ' + (i === 0 ? 'btn-primary' : 'btn-secondary');
          b.style.cssText = 'width:100%;min-height:48px;white-space:normal;line-height:1.35;justify-content:center';
          b.innerHTML = c.label;
          b.onclick = () => { picked = c.value; this.closeConfirm(true); };
          wrap.appendChild(b);
        });
        body.appendChild(wrap);
      }
    }).then(ok => {
      const okBtn = document.getElementById('confirm-ok');
      if (okBtn) okBtn.style.display = '';
      return ok ? picked : null;
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
    this._lastConfirmCloseAt = Date.now();
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

  // 선 아이콘 (index.html 스프라이트). 템플릿 문자열 안에서 ${App.icon('phone')} 로 사용.
  // 이모지는 OS마다 모양·크기가 달라 미니멀 디자인과 맞지 않아 전부 이 아이콘으로 통일했다.
  icon(name, cls = '') {
    return `<svg class="ico${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  },

  showToast(message, type = 'success', opts = {}) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icoName = type === 'success' ? 'check-circle' : type === 'error' ? 'close' : type === 'warning' ? 'alert' : 'info';
    const icoWrap = document.createElement('span');
    icoWrap.className = 'toast-ico';
    icoWrap.innerHTML = this.icon(icoName, 'toast-ico');
    toast.appendChild(icoWrap);
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
    // opts.action = { label, onClick } — 토스트 안 동작 링크 하나 (예: 저장 뒤 '문자 보내기'). 누르면 실행하고 토스트를 닫는다
    if (opts.action && opts.action.label && typeof opts.action.onClick === 'function') {
      const actBtn = document.createElement('button');
      actBtn.type = 'button';
      actBtn.className = 'toast-action';
      actBtn.textContent = opts.action.label;
      actBtn.style.cssText = 'background:none;border:none;color:inherit;font-weight:800;text-decoration:underline;cursor:pointer;padding:4px 6px;min-height:32px;white-space:nowrap;font-size:inherit';
      actBtn.onclick = () => { try { opts.action.onClick(); } finally { dismissBtn.onclick(); } };
      toast.appendChild(actBtn);
    }
    toast.appendChild(dismissBtn);
    container.appendChild(toast);

    // Duration: opts.duration 우선 → 동작 링크=8s, html(링크 포함)=10s, error=5s, warning=6s, info=5s, success=2.5s
    const duration = (typeof opts.duration === 'number' && opts.duration > 0) ? opts.duration
      : opts.action ? 8000 : opts.html ? 10000 : type === 'error' ? 5000 : type === 'warning' ? 6000 : type === 'info' ? 5000 : 2500;
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
        // +82 붙여넣기 → 0 으로 (국내 번호는 8로 시작하지 않는다. '82' 두 글자만일 땐 아직 판단 보류)
        if (val.length > 2 && val.startsWith('82')) {
          val = val.slice(2);
          if (!val.startsWith('0')) val = '0' + val;
        }
        if (val.startsWith('02')) {
          // 서울 지역번호: 02-XXX-XXXX(9자리) / 02-XXXX-XXXX(10자리)
          if (val.length > 10) val = val.slice(0, 10);
          if (val.length === 10) e.target.value = `02-${val.slice(2, 6)}-${val.slice(6)}`;
          else if (val.length >= 6) e.target.value = `02-${val.slice(2, 5)}-${val.slice(5)}`;
          else if (val.length >= 3) e.target.value = `02-${val.slice(2)}`;
          else e.target.value = val;
          return;
        }
        if (val.length > 11) val = val.slice(0, 11);
        if (val.length === 10 && !val.startsWith('010')) {
          e.target.value = `${val.slice(0, 3)}-${val.slice(3, 6)}-${val.slice(6)}`;
        } else if (val.length >= 8) {
          e.target.value = val.replace(/(\d{3})(\d{4})(\d{0,4})/, '$1-$2-$3').replace(/-$/, '');
        } else if (val.length >= 4) {
          e.target.value = val.replace(/(\d{3})(\d{0,4})/, '$1-$2');
        } else {
          e.target.value = val;
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

  // ========== 예약 ↔ 미용 기록 ==========
  // 완료된 예약 카드에 그 미용의 결과(금액·결제)를 붙여, 오늘 일은 예약 화면 하나에서 끝나게 한다.
  apptRecordMap(records) {
    const m = {};
    (records || []).forEach(r => { if (r.appointmentId) m[String(r.appointmentId)] = r; });
    return m;
  },

  // recordKnown=false: 기록을 불러오지 않은 오래된 예약 — '기록 없음'이라고 단정하지 않는다
  apptResultHtml(appt, rec, recordKnown = true) {
    if (!appt || appt.status !== 'completed') return '';
    if (rec) {
      const amt = this.formatCurrency(rec.paymentMethod === 'unpaid' ? this.getUnpaidAmount(rec) : this.getRecordAmount(rec));
      if (rec.paymentMethod === 'unpaid') {
        return `<div class="appt-result unpaid"><span>${this.icon('alert')} 미결제 <strong>${amt}</strong></span>` +
          `<button type="button" class="btn btn-sm btn-success btn-pay-unpaid" data-id="${rec.id}">결제</button></div>`;
      }
      const pay = this.pages.records ? this.pages.records.getPaymentLabel(rec.paymentMethod, rec) : '';
      // 금액·결제는 글자로만 보여주고, 누르는 건 '기록 보기' 하나 (줄 전체가 버튼이라 '완료' 표시인지 헷갈렸다)
      return `<div class="appt-result paid" style="cursor:default">` +
        `<span>${this.icon('check-circle')} 미용 완료 <strong>${amt}</strong>${pay && pay !== '-' ? ' · ' + pay : ''}</span>` +
        `<button type="button" class="btn btn-sm btn-secondary btn-open-record" data-record-id="${rec.id}">기록 보기</button></div>`;
    }
    if (!recordKnown) return '';
    return `<div class="appt-result none"><span>기록 없음 · 매출에 안 잡혔어요</span>` +
      `<button type="button" class="btn btn-sm btn-primary btn-appt-write-record" data-id="${appt.id}">기록 작성</button></div>`;
  },

  // 결과 줄의 버튼은 어느 화면에서 그려도 같은 동작 — 문서 한 곳에서 받는다
  setupApptResultActions() {
    document.addEventListener('click', (e) => {
      const open = e.target.closest('.btn-open-record');
      const pay = e.target.closest('.btn-pay-unpaid');
      const write = e.target.closest('.btn-appt-write-record');
      if (!open && !pay && !write) return;
      e.preventDefault();
      e.stopPropagation();
      // '기록 보기'는 읽기 전용 영수증 화면으로 연다 (수정 폼이 열려 실수로 고칠 수 있었다)
      if (open) this.pages.records?.showReceipt(Number(open.dataset.recordId));
      else if (pay) this.showPayUnpaid(Number(pay.dataset.id));
      else this.pages.appointments?.completeToRecord(Number(write.dataset.id));
    }, true);
  },

  // 미결제 기록 결제 처리 (홈 미결제·예약 카드 공용) — 기록 폼 결제 칩과 같은 순서·기본값(카드)
  showPayUnpaid(recordId) {
    this.showModal({
      title: '결제 완료 처리',
      content: `
        <div class="form-group">
          <label class="form-label">결제 수단을 선택하세요</label>
          <select id="f-pay-method">
            <option value="card" selected>카드</option>
            <option value="cash">현금</option>
            <option value="transfer">계좌이체</option>
          </select>
        </div>
      `,
      saveText: '결제 완료',
      onSave: async () => {
        const method = document.getElementById('f-pay-method').value;
        try {
          const record = await DB.get('records', recordId);
          if (record) {
            record.paymentMethod = method;
            // 수금일 기록 — 지난주 미용비를 오늘 받은 경우를 추적할 수 있게 한다
            record.paidAt = this.getToday();
            record.paidMethod = method;
            await DB.update('records', record);
            this.showToast('결제가 완료 처리되었습니다.');
            this.closeModal();
            this._dashboardDirty = true;
            this.handleRoute();
          }
        } catch (err) {
          console.error('Payment update error:', err);
          this.showToast('처리 중 오류가 발생했습니다.', 'error');
        }
      }
    });
  },

  getRecordAmount(r) {
    return Number(r.finalPrice != null ? r.finalPrice : r.totalPrice) || 0;
  },

  // 미수금으로 남은 금액 — 정액권으로 일부 낸 기록은 나머지만 (매출은 getRecordAmount 그대로)
  getUnpaidAmount(r) {
    return Math.max(0, this.getRecordAmount(r) - (Number(r.prepaidUsed) || 0));
  },

  // 기록 폼의 금액 식 — 화면 합계(calcTotal)와 저장(saveRecord)이 같이 쓴다 (화면 없이 테스트 가능)
  //  servicePrice: 기본가 칸 값 (mainFree 면 받는 금액은 0, 원래 가격은 서비스 제공 금액으로)
  //  addonPrice: 추가 금액 칸 값 (무료 추가 항목은 화면에서 이미 빠져 있다) / freeAddons: [{ name, price }]
  //  prepaidAvailable 를 주면 정액권 나누기(calcPrepaidUse)도 함께 — 안 주면 prepaid: null
  calcRecordTotals({ servicePrice, addonPrice, discount, extraCharge, mainFree, freeAddons, prepaidAvailable, restMethod } = {}) {
    const inputPrice = Number(servicePrice) || 0;
    const charged = mainFree ? 0 : inputPrice;
    const totalPrice = charged + (Number(addonPrice) || 0);
    const finalPrice = totalPrice - (Number(discount) || 0) + (Number(extraCharge) || 0);
    const complimentaryTotal = (mainFree ? inputPrice : 0) + (freeAddons || []).reduce((t, a) => t + (Number(a && a.price) || 0), 0);
    return {
      servicePrice: charged, totalPrice, finalPrice,
      negative: finalPrice < 0, // 할인이 금액보다 큼 → 저장 막음
      complimentaryTotal,
      prepaid: prepaidAvailable == null ? null : this.calcPrepaidUse(prepaidAvailable, finalPrice, restMethod)
    };
  },

  // 정액권 나누기: 쓸 금액 = min(잔액, 합계) (잔액이 0 이하면 0), 나머지는 restMethod.
  // 다 정액권으로 냈으면 결제 수단 'prepaid'. available = 잔액 (+ 수정 중인 기록이 이미 쓴 금액)
  calcPrepaidUse(available, total, restMethod) {
    const avail = Number(available) || 0;
    const t = Math.max(0, Number(total) || 0);
    const used = Math.max(0, Math.min(avail, t));
    const rest = t - used;
    return { used, rest, balanceLeft: avail - used, paymentMethod: used > 0 && rest <= 0 ? 'prepaid' : restMethod };
  },

  formatLocalDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },

  // 손님에게 보내는 문자용 한국어 날짜: '10월 23일(목)'
  formatDateKo(dateStr) {
    if (!dateStr) return '';
    const d = this.parseLocalDate(dateStr);
    if (!d || isNaN(d.getTime())) return dateStr;
    const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return `${d.getMonth() + 1}월 ${d.getDate()}일(${dow})`;
  },

  // 오늘 기준 시점 표현: 오늘 / 내일 / 모레 / N일 후 / N일 전
  relativeDayLabel(dateStr) {
    const n = this.daysUntil(dateStr);
    if (n === null) return '';
    if (n === 0) return '오늘';
    if (n === 1) return '내일';
    if (n === 2) return '모레';
    // 지난 날짜는 손님 문자에 '2일 전' 같은 말이 들어가면 어색하므로 빈 값
    return n > 0 ? `${n}일 후` : '';
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

  // 전화·문자 링크용 숫자만. +82 로 저장된 번호는 국내 형식(0으로 시작)으로 바꾼다 (+82 10… → 010…)
  phoneDigits(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.length >= 10 && d.startsWith('82')) {
      d = d.slice(2);
      if (!d.startsWith('0')) d = '0' + d;
    }
    return d;
  },

  formatPhone(phone) {
    if (!phone) return '-';
    let cleaned = String(phone).replace(/\D/g, '');
    // +82 로 저장된 번호 → 국내 형식
    if (cleaned.length >= 10 && cleaned.startsWith('82')) {
      cleaned = cleaned.slice(2);
      if (!cleaned.startsWith('0')) cleaned = '0' + cleaned;
    }
    if (cleaned.startsWith('02') && (cleaned.length === 9 || cleaned.length === 10)) {
      const mid = cleaned.length === 9 ? 3 : 4;
      return `02-${cleaned.slice(2, 2 + mid)}-${cleaned.slice(2 + mid)}`;
    }
    // 050X 안심번호: 0505-123-4567 (11자리) / 0505-1234-5678 (12자리)
    if (cleaned.startsWith('050') && (cleaned.length === 11 || cleaned.length === 12)) {
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4, cleaned.length - 4)}-${cleaned.slice(-4)}`;
    }
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    // 형식이 맞지 않으면 입력값 그대로 (textContent 사용처도 있어 여기서 escape 하지 않는다 — innerHTML 사용처는 formatPhoneHtml)
    return phone;
  },

  // innerHTML 템플릿용: 형식 불일치 입력값이 그대로 들어가도 안전하게
  formatPhoneHtml(phone) {
    return this.escapeHtml(this.formatPhone(phone));
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

  // ========== 방문 상태 (모든 페이지가 이 헬퍼만 사용 — 화면마다 숫자가 달라지는 것을 막는다) ==========
  // 상태: normal(정상) · new(방문 전) · remind(리마인드) · at-risk(이탈위험) · churned(이탈)
  // 'new' = 아직 미용 기록이 없는 반려견. 예전엔 이 경우를 '이탈'로 분류해서
  // 오늘 등록한 손님이 대시보드 이탈 카운트와 이탈 필터에 바로 잡혔다.
  VISIT_STATUS_PRIORITY: { normal: 0, new: 1, remind: 2, 'at-risk': 3, churned: 4 },

  async getRevisitDays() {
    return Number(await DB.getSetting('revisitDays')) || 30;
  },

  // 다음 미용 추천일: 방문일 + 반려견 권장 주기(없으면 fallbackDays — 설정 '재방문 기준', 기본 30일). 'YYYY-MM-DD' 또는 ''
  calcNextVisitDate(dateStr, cycleDays, fallbackDays) {
    const days = Number(cycleDays) > 0 ? Number(cycleDays) : Number(fallbackDays) > 0 ? Number(fallbackDays) : 0;
    const base = dateStr ? this.parseLocalDate(dateStr) : null;
    if (!days || !base || isNaN(base.getTime())) return '';
    base.setDate(base.getDate() + days);
    return this.formatLocalDate(base);
  },

  classifyVisitStatus(lastVisitDate, groomingCycle) {
    if (!lastVisitDate) return 'new';
    const daysSince = this.getDaysAgo(lastVisitDate);
    if (daysSince === null) return 'new';
    const cycle = groomingCycle || 30;
    if (daysSince <= cycle + 3) return 'normal';
    if (daysSince <= cycle * 1.5) return 'remind';
    if (daysSince <= cycle * 2) return 'at-risk';
    return 'churned';
  },

  // 반려견 1마리의 상태. 주기 미설정 시 매장 기본 재방문 주기(revisitDays)를 쓴다.
  // (예전엔 대시보드만 revisitDays 를 쓰고 고객/분석 페이지는 30일 고정이라 서로 다른 수가 나왔다)
  getPetVisitStatus(pet, revisitDays, fallbackLastVisit) {
    const last = pet.lastVisitDate || fallbackLastVisit || null;
    return this.classifyVisitStatus(last, pet.groomingCycle || revisitDays || 30);
  },

  // 고객 단위 상태 = 활성 반려견 중 가장 좋은 상태 (반려견 없으면 기록 기준)
  getCustomerVisitStatus(customerPets, revisitDays, fallbackLastVisit) {
    let best = null;
    (customerPets || []).forEach(p => {
      if (p.petStatus && p.petStatus !== 'active') return;
      const s = this.getPetVisitStatus(p, revisitDays, fallbackLastVisit);
      if (best === null || this.VISIT_STATUS_PRIORITY[s] < this.VISIT_STATUS_PRIORITY[best]) best = s;
    });
    return best || this.classifyVisitStatus(fallbackLastVisit, revisitDays);
  },

  getVisitStatusLabel(status) {
    // 화면에 보이는 말은 쉬운 말로 통일 (홈 '연락할 손님'·고객 목록 필터와 같은 단어)
    const labels = { normal: '정상', new: '방문 전', remind: '올 때 됨', 'at-risk': '많이 늦음', churned: '오래 안 옴' };
    return labels[status] || status;
  },

  getVisitStatusBadge(status) {
    const badges = { normal: 'badge-success', new: 'badge-info', remind: 'badge-warning', 'at-risk': 'badge-danger', churned: 'badge-secondary' };
    return badges[status] || 'badge-secondary';
  },

  // VIP 미방문: 활성 반려견 lastVisitDate 와 전달받은 기록 기반 최근 방문일 중 최신값 기준.
  // 방문 기록이 전혀 없는 VIP 는 제외 (데이터 입력 중인 손님을 '미방문'으로 몰지 않는다).
  computeVipUnvisited(customers, pets, recordLastVisitMap, thresholdDays) {
    const lastMap = { ...(recordLastVisitMap || {}) };
    (pets || []).forEach(p => {
      if (p.petStatus && p.petStatus !== 'active') return;
      if (p.lastVisitDate && (!lastMap[p.customerId] || p.lastVisitDate > lastMap[p.customerId])) lastMap[p.customerId] = p.lastVisitDate;
    });
    const limit = thresholdDays || 30;
    return (customers || [])
      .filter(c => (c.tags || []).includes('vip'))
      .map(c => {
        const lv = lastMap[c.id] || null;
        const days = lv ? this.getDaysAgo(lv) : null;
        return { customer: c, lastVisit: lv, days };
      })
      .filter(x => x.lastVisit && x.days > limit)
      .sort((a, b) => b.days - a.days);
  },

  // ========== 기간 헬퍼 ==========
  // 'YYYY-MM' (offset 개월 이동). 1일 기준으로 계산해 말일 오버플로(3/31 → 3/3)를 막는다.
  getMonthKey(offset = 0, base) {
    const b = base || new Date();
    const d = new Date(b.getFullYear(), b.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  // dateStr(YYYY-MM-DD)까지 남은 일수. 오늘=0, 내일=1, 어제=-1 (자정 기준 정수)
  daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = this.parseLocalDate(dateStr);
    if (!target || isNaN(target)) return null;
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - todayMid) / 86400000);
  },

  // 전월 동기 대비 (same-day pacing). 이번 달 1일~오늘 vs 지난달 1일~같은 일차.
  // records 는 최소 지난달 1일부터의 기록을 포함해야 한다. 지난달 비교 기준이 0원이면 pct=null.
  revenuePacing(records, today) {
    const t = today || this.getToday();
    const [y, m, d] = t.split('-').map(Number);
    const thisKey = this.getMonthKey(0, new Date(y, m - 1, 1));
    const lastKey = this.getMonthKey(-1, new Date(y, m - 1, 1));
    const lastMonthDays = new Date(y, m - 1, 0).getDate();
    const compareDay = Math.min(d, lastMonthDays);
    let thisMonth = 0, lastToDate = 0, lastFull = 0;
    (records || []).forEach(r => {
      if (!r.date) return;
      const amt = this.getRecordAmount(r);
      if (r.date.startsWith(thisKey)) thisMonth += amt;
      else if (r.date.startsWith(lastKey)) {
        lastFull += amt;
        if (parseInt(r.date.slice(8, 10), 10) <= compareDay) lastToDate += amt;
      }
    });
    const pct = lastToDate > 0 ? Math.round(((thisMonth - lastToDate) / lastToDate) * 100) : null;
    return { thisMonth, lastToDate, lastFull, pct, compareDay };
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
    return last4 ? '보호자(' + last4 + ')' : '미등록 고객';
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
  // ========== 서비스 가격 조회 ==========
  // 서비스명 정규화 (앞뒤 공백·연속 공백 제거). 저장·비교 양쪽에서 같은 규칙을 쓴다.
  normalizeServiceName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ');
  },

  // 반려견 사이즈 (size 우선, 없으면 체중으로 추정, 둘 다 없으면 null — 조용히 소형으로 가정하지 않는다)
  getPetSizeType(pet) {
    if (!pet) return null;
    if (pet.size) return pet.size;
    if (pet.weight) return pet.weight < 7 ? 'small' : pet.weight < 15 ? 'medium' : 'large';
    return null;
  },

  // ========== 몸무게 구간 가격 (v184) ==========
  // 가게 공통 구간표 1개 (settings 'priceBands', 기기 간 동기화). 경계는 "이하" 규칙: 5kg 은 3~5kg 구간.
  // 가격은 구간 id(b1…)에 붙어 있어 경계를 고쳐도 가격이 따라간다.
  // 서비스: pricing = { mode:'flat'|'weight', flat, prices:{ [bandId]: 원 }, legacySig, fromPrice }
  // 구버전 기기 호환: priceSmall/Medium/Large 에 대표 체중 5/10/20kg 가격을 계속 적고, 그 값의 서명(legacySig)을 남긴다.
  //   서명이 다르면 구버전 기기에서 가격을 고친 것 → 그 값을 다시 구간 가격으로 받아들인다.
  DEFAULT_PRICE_BANDS: {
    version: 1,
    bands: [{ id: 'b1', upTo: 3 }, { id: 'b2', upTo: 5 }, { id: 'b3', upTo: 7 }, { id: 'b4', upTo: 10 }, { id: 'b5', upTo: null }],
    overKg: { from: 10, perKg: 5000, ceil: true },
    rounding: 1000
  },
  PRICE_BAND_PRESETS: {
    three: { bands: [{ upTo: 5 }, { upTo: 10 }, { upTo: null }], overKg: null },
    five: { bands: [{ upTo: 3 }, { upTo: 5 }, { upTo: 7 }, { upTo: 10 }, { upTo: null }], overKg: { from: 10, perKg: 5000, ceil: true } }
  },
  LEGACY_REP_WEIGHTS: { small: 5, medium: 10, large: 20 }, // 구버전 priceSmall/Medium/Large 에 적는 대표 체중
  SIZE_REP_WEIGHTS: { small: 4, medium: 9, large: 20 },    // 몸무게 없이 사이즈만 있는 반려견의 대표 체중 (구간이 40kg 까지 있는 가게에서 대형이 맨 끝 구간으로 가지 않게)

  // 저장된 값이 깨졌거나 없으면 기본 5단계로
  normalizePriceBands(v) {
    const def = this.DEFAULT_PRICE_BANDS;
    if (!v || !Array.isArray(v.bands) || v.bands.length === 0) return JSON.parse(JSON.stringify(def));
    const seen = new Set();
    const bands = [];
    v.bands.forEach(b => {
      if (!b || !b.id || seen.has(b.id)) return;
      seen.add(b.id);
      const up = b.upTo == null || b.upTo === '' ? null : Number(b.upTo);
      bands.push({ id: String(b.id), upTo: (up != null && up > 0) ? up : null });
    });
    if (bands.length === 0) return JSON.parse(JSON.stringify(def));
    // 경계 오름차순, 경계 없는(=마지막) 구간은 하나만 맨 끝에
    const bounded = bands.filter(b => b.upTo != null).sort((a, b) => a.upTo - b.upTo);
    const open = bands.filter(b => b.upTo == null);
    const out = bounded.filter((b, i) => i === 0 || b.upTo !== bounded[i - 1].upTo);
    out.push(open[0] || { id: this._newBandId({ bands: out, nextId: v.nextId }), upTo: null });
    const ok = v.overKg && Number(v.overKg.perKg) > 0 && Number(v.overKg.from) > 0;
    // 구간 id 는 다시 쓰지 않는다 — 지운 구간 id 를 새 구간이 받으면 다른 기기의 옛 가격이 엉뚱한 구간에 붙는다
    const maxNum = out.reduce((m, b) => Math.max(m, Number(String(b.id).replace(/^b/, '')) || 0), 0);
    return {
      version: 1,
      nextId: Math.max(Number(v.nextId) || 0, maxNum + 1),
      bands: out,
      overKg: ok ? { from: Number(v.overKg.from), perKg: Number(v.overKg.perKg), ceil: v.overKg.ceil !== false } : null,
      rounding: [100, 500, 1000, 5000, 10000].includes(Number(v.rounding)) ? Number(v.rounding) : 1000,
      // 몸무게 구간 사용 안 함 (가게 전체 단일가). 구간 가격은 지우지 않고 쓰지만 않는다
      bandsOff: v.bandsOff === true
    };
  },

  // 새 구간 id. tableOrState.nextId(증가 카운터)를 쓰고 올린다 — 한 번 쓴 id 는 다시 나오지 않는다
  _newBandId(tableOrState) {
    const st = tableOrState || {};
    const bands = st.bands || [];
    const maxNum = bands.reduce((m, b) => Math.max(m, Number(String(b.id).replace(/^b/, '')) || 0), 0);
    const n = Math.max(Number(st.nextId) || 0, maxNum + 1);
    st.nextId = n + 1;
    return 'b' + n;
  },

  // 구간표 읽기 (짧게 캐시 — 목록에서 서비스마다 IDB 를 다시 읽지 않게)
  async getPriceBands() {
    const now = Date.now();
    if (this._priceBandsCache && now - this._priceBandsCache.at < 1500) return this._priceBandsCache.table;
    let raw = null;
    try { raw = await DB.getSetting('priceBands'); } catch (_) {}
    const table = this.normalizePriceBands(raw);
    this._priceBandsCache = { at: now, table };
    return table;
  },

  async savePriceBands(table) {
    const t = this.normalizePriceBands(table);
    await DB.setSetting('priceBands', t);
    this._priceBandsCache = null;
    return t;
  },

  formatKg(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '';
    return String(Math.round(v * 10) / 10);
  },

  // 구간 이름: '~3kg', '3~5kg', '10kg~'
  getBandLabel(table, idx) {
    const bands = table.bands;
    const b = bands[idx];
    if (!b) return '';
    const lower = idx > 0 ? bands[idx - 1].upTo : null;
    if (b.upTo == null) return lower != null ? this.formatKg(lower) + 'kg~' : '전체';
    if (lower == null) return '~' + this.formatKg(b.upTo) + 'kg';
    return this.formatKg(lower) + '~' + this.formatKg(b.upTo) + 'kg';
  },

  // 초과 kg 요금이 실제로 시작되는 몸무게 = max(설정값, 마지막 구간 시작).
  // 마지막 구간보다 가벼운 구간 안에서는 절대 붙지 않는다.
  overKgFrom(table) {
    if (!table || !table.overKg) return null;
    const bands = table.bands || [];
    const lastLower = bands.length > 1 ? Number(bands[bands.length - 2].upTo) || 0 : 0;
    return Math.max(Number(table.overKg.from) || 0, lastLower);
  },

  // 몸무게 오타(52 → 5.2) 확인 기준 kg = max(30, 마지막 구간 시작 × 1.5). 구간 사용 안 함이면 묻지 않는다(Infinity)
  weightConfirmThreshold(table) {
    if (!table || table.bandsOff) return Infinity;
    const bands = table.bands || [];
    const lastFrom = bands.length > 1 ? Number(bands[bands.length - 2].upTo) || 0 : 0;
    return Math.max(30, lastFrom * 1.5);
  },

  // 입력한 몸무게를 한 번 물어볼지: 기준 kg 초과, 또는 프로필 몸무게와 50% 넘게 차이(늘거나 줄거나)
  needsWeightConfirm(weight, profileWeight, table) {
    const w = Number(weight);
    if (!(w > 0) || !table || table.bandsOff) return false;
    if (w > this.weightConfirmThreshold(table)) return true;
    const pw = Number(profileWeight);
    return pw > 0 && Math.abs(w - pw) > pw * 0.5;
  },

  // 반려견 견종에 맞는 서비스인지: 이름에 견종이 들어 있거나, 이름 괄호 안 '·'로 나눈 말 중 하나가 견종과 맞으면 true
  // 예: 견종 '말티즈' → '말티즈 전체미용', '스포팅 (말티즈·푸들)'. 견종 '토이 푸들' → '(푸들·비숑)'
  serviceMatchesBreed(serviceName, breed) {
    const norm = (v) => String(v || '').replace(/\s+/g, '').toLowerCase();
    const b = norm(breed), name = norm(serviceName);
    if (b.length < 2 || !name) return false;
    if (name.includes(b)) return true;
    const m = String(serviceName).match(/\(([^)]*)\)/);
    if (!m) return false;
    return m[1].split('·').map(norm).some(t => t.length >= 2 && (t === b || b.includes(t)));
  },

  // 몸무게 → 구간 ("이하" 규칙: upTo 이하면 그 구간)
  resolveBand(table, weight) {
    const w = Number(weight);
    if (!(w > 0)) return null;
    const bands = table.bands;
    let idx = bands.findIndex(b => b.upTo != null && w <= b.upTo);
    if (idx < 0) idx = bands.length - 1;
    return { band: bands[idx], index: idx, label: this.getBandLabel(table, idx) };
  },

  // 몸무게 또는 사이즈 문자열을 해석. 숫자(또는 숫자 문자열) → 몸무게, 'small'… → 사이즈
  _parseWeightOrSize(v) {
    if (v == null || v === '') return {};
    if (typeof v === 'number') return v > 0 ? { weight: v } : {};
    if (['small', 'medium', 'large'].includes(v)) return { size: v };
    const n = parseFloat(v);
    return n > 0 ? { weight: n } : {};
  },

  // 반려견 가격 기준: 몸무게가 있으면 몸무게(숫자), 없으면 사이즈 문자열, 둘 다 없으면 null
  getPetPriceBasis(pet) {
    if (!pet) return null;
    const w = Number(pet.weight);
    if (w > 0) return w;
    return this.getPetSizeType(pet);
  },

  // 구버전 priceSmall/Medium/Large → 구간 가격.
  // 기본 5단계: ~3·3~5·5~7 = 소형가, 7~10 = 중형가, 10kg~ = 중형가(초과 kg 규칙이 위에 더함).
  // 초과 규칙이 꺼져 있으면 15kg 이상 구간은 대형가. 0원 칸은 소형→중형→대형 순으로 있는 값을 쓴다(예전 동작과 같음).
  // 큰 아이 추가 요금이 붙지 않는 서비스('없음')는 무거운 구간이 대형가를 받는다 — 15kg 이상 구간, 그리고
  // 마지막 구간(10kg 이상부터 시작). 추가 요금이 붙는 서비스(가게 기본·따로)는 그 구간 = 중형가 + kg당 요금.
  legacyToPricing(svc, table) {
    const s = Number(svc.priceSmall) || 0, m = Number(svc.priceMedium) || 0, l = Number(svc.priceLarge) || 0;
    const pick = (k) => ({ small: s, medium: m, large: l })[k] || s || m || l;
    const overKgMode = (svc.pricing && ['inherit', 'off', 'custom'].includes(svc.pricing.overKgMode)) ? svc.pricing.overKgMode : this.defaultOverKgMode(svc);
    const overOn = overKgMode === 'custom' || (overKgMode === 'inherit' && !!table.overKg && !table.bandsOff);
    const prices = {};
    const last = table.bands.length - 1;
    table.bands.forEach((b, i) => {
      const lower = i > 0 ? table.bands[i - 1].upTo : 0;
      const heavy = !overOn && (lower >= 15 || (i === last && lower >= 10));
      const key = lower < 7 ? 'small' : (heavy ? 'large' : 'medium');
      prices[b.id] = pick(key);
    });
    const vals = Object.values(prices);
    if (vals.every(v => v === vals[0])) return { mode: 'flat', flat: vals[0] || 0, prices: {}, overKgMode };
    return { mode: 'weight', flat: 0, prices, overKgMode };
  },

  // ===== 서비스별 큰 아이(초과 kg) 추가 요금 (v184) =====
  // pricing.overKgMode: 'inherit'(가게 기본) | 'off'(추가 요금 없음) | 'custom'(이 서비스만 overKgCustom {from, perKg})
  // 값이 없을 때 기본값: 미용 코스 = 가게 기본, 추가 옵션·단독 케어 = 없음 (작은 추가 메뉴에 kg당 요금이 붙지 않게).
  // 이름은 보지 않는다 — '스파 목욕'도 미용 코스면 가게 기본 (이름 규칙이 몰래 요금을 끄던 문제).
  defaultOverKgMode(svc) {
    return ((svc && svc.category) || 'grooming') === 'grooming' ? 'inherit' : 'off';
  },

  getOverKgMode(svc, p) {
    const m = p && p.overKgMode;
    return (m === 'inherit' || m === 'off' || m === 'custom') ? m : this.defaultOverKgMode(svc);
  },

  // 이 서비스에 실제로 붙는 규칙 { from, perKg, ceil, source:'shop'|'custom' } 또는 null.
  //  - 구간 가격: 가게 기본 또는 이 서비스만. 시작 kg 은 마지막 구간 시작보다 낮아지지 않는다 (가벼운 구간 안에서는 안 붙음)
  //  - 단일가(또는 '구간 사용 안 함'): '이 서비스만'을 고른 경우에만 (예전 단일가 가격이 바뀌지 않게)
  getOverKgRule(svc, table, pIn) {
    const p = pIn || this.getServicePricing(svc, table);
    if (p.free) return null;
    const mode = this.getOverKgMode(svc, p);
    if (mode === 'off') return null;
    const byBand = p.mode === 'weight' && !table.bandsOff;
    const bands = table.bands || [];
    const lastLower = byBand && bands.length > 1 ? Number(bands[bands.length - 2].upTo) || 0 : 0;
    if (mode === 'custom') {
      const c = p.overKgCustom || {};
      const from = Number(c.from) || 0, perKg = Number(c.perKg) || 0;
      if (!(from > 0) || !(perKg > 0)) return null;
      return { from: Math.max(from, lastLower), perKg, ceil: true, source: 'custom' };
    }
    if (!byBand || !table.overKg) return null;
    return { from: this.overKgFrom(table), perKg: Number(table.overKg.perKg), ceil: table.overKg.ceil !== false, source: 'shop' };
  },

  // 규칙 짧은 글: '10kg 초과 1kg당 +7,000원' / '추가 요금 없음'
  describeOverKgRule(rule) {
    if (!rule) return '추가 요금 없음';
    return `${this.formatKg(rule.from)}kg 넘으면 1kg당 +${this.formatCurrency(rule.perKg)}`;
  },

  _overCharge(rule, weight, base, table) {
    if (!rule || !(weight > rule.from) || !(base > 0)) return null;
    const kg = rule.ceil === false ? Math.round((weight - rule.from) * 10) / 10 : Math.ceil(Math.round((weight - rule.from) * 1000) / 1000);
    // 사장님이 적은 1kg당 금액 그대로 (반올림 단위는 일괄 조정·한 번에 채우기에만 쓴다)
    const extra = Math.round(kg * rule.perKg);
    return extra > 0 ? { kg, perKg: rule.perKg, extra, from: rule.from, source: rule.source } : null;
  },

  // 구간 가격 서비스의 대표 단일가 ('구간 사용 안 함'일 때): 단일가가 적혀 있으면 그 값, 없으면 첫(가장 가벼운) 구간 가격
  _firstBandPrice(p, table) {
    const prices = (p && p.prices) || {};
    for (const b of table.bands) { const v = Number(prices[b.id]) || 0; if (v > 0) return v; }
    const vals = Object.values(prices).map(Number).filter(v => v > 0);
    return vals.length ? Math.min(...vals) : 0;
  },

  // 서비스의 가격 설정 (아직 변환 안 된 서비스는 그 자리에서 변환해 쓴다 — 저장은 migratePriceBands 가)
  getServicePricing(svc, table) {
    const p = svc && svc.pricing;
    if (p && (p.mode === 'flat' || p.mode === 'weight')) return p;
    return this.legacyToPricing(svc || {}, table);
  },

  // 서비스 1개의 가격 계산.
  // 반환: { price, mode, bandId, bandLabel, needsWeight, bySize, weight, base, over:{kg,perKg,extra}|null, fromPrice }
  // 서비스 가격이 붙어 있는 구간표. 지금 구간표에 이 서비스의 구간 id 가 하나도 없으면
  // (다른 기기가 구간표를 바꾸고 아직 서비스만/구간표만 받은 경우 등) 서비스에 저장된 구간 경계(bandsAt)로 계산한다.
  _pricingTable(p, table) {
    const prices = (p && p.prices) || {};
    const known = table.bands.some(b => Number(prices[b.id]) > 0);
    if (known || !Array.isArray(p.bandsAt) || p.bandsAt.length === 0) return table;
    const own = this.normalizePriceBands({ bands: p.bandsAt, overKg: table.overKg, rounding: table.rounding });
    return own.bands.some(b => Number(prices[b.id]) > 0) ? own : table;
  },

  calcServicePrice(svc, weightOrSize, tableIn) {
    const p = this.getServicePricing(svc, tableIn);
    const fromPrice = !!(p.fromPrice || (svc && svc.fromPrice));
    const { weight, size } = this._parseWeightOrSize(weightOrSize);
    // 무료 서비스 (일부러 0원으로 등록한 메뉴)
    if (p.free) return { price: 0, mode: 'flat', free: true, bandId: null, bandLabel: '', needsWeight: false, bySize: false, weight: weight || null, base: 0, over: null, fromPrice: false };
    if (p.mode !== 'weight' || tableIn.bandsOff) {
      // 단일가 — '구간 사용 안 함'이면 구간 가격 서비스도 단일가(없으면 첫 구간 가격)로
      const base = p.mode === 'weight' ? (Number(p.flat) || this._firstBandPrice(p, this._pricingTable(p, tableIn))) : (Number(p.flat) || 0);
      const over = weight ? this._overCharge(this.getOverKgRule(svc, tableIn, p), weight, base, tableIn) : null;
      return { price: base + (over ? over.extra : 0), mode: 'flat', bandId: null, bandLabel: '', needsWeight: false, bySize: false, weight: weight || null, base, over, fromPrice };
    }
    const table = this._pricingTable(p, tableIn);
    let r = null, bySize = false;
    if (weight) r = this.resolveBand(table, weight);
    else if (size) {
      bySize = true;
      r = this.resolveBand(table, this.SIZE_REP_WEIGHTS[size]);
    }
    if (!r) return { price: 0, mode: 'weight', bandId: null, bandLabel: '', needsWeight: true, bySize: false, over: null, fromPrice };
    // 그 구간 칸이 비었으면 가까운 아래 구간 → 위 구간 가격 (0원으로 떨어지지 않게). 어느 칸 값을 썼는지 fallback 에 남겨 화면에 솔직히 적는다
    let base = Number(p.prices && p.prices[r.band.id]) || 0;
    let fallback = null;
    if (!base) {
      const ids = table.bands.map(b => b.id);
      for (let i = r.index - 1; i >= 0 && !base; i--) { base = Number(p.prices[ids[i]]) || 0; if (base) fallback = 'prev'; }
      for (let i = r.index + 1; i < ids.length && !base; i++) { base = Number(p.prices[ids[i]]) || 0; if (base) fallback = 'next'; }
    }
    // 그래도 0 이면(구간 id 가 전혀 안 맞음) 가격이 있는 칸 중 최저가 — 가격이 있는 서비스를 0원으로 내지 않는다
    if (!base) {
      const vals = Object.values(p.prices || {}).map(Number).filter(v => v > 0);
      if (vals.length) { base = Math.min(...vals); fallback = 'min'; }
    }
    // 초과 kg 요금은 서비스별 규칙 (가게 기본 / 없음 / 이 서비스만) — 기준은 마지막 구간 시작 이상
    const over = weight ? this._overCharge(this.getOverKgRule(svc, table, p), weight, base, table) : null;
    return {
      price: base + (over ? over.extra : 0), mode: 'weight', bandId: r.band.id, bandLabel: r.label,
      needsWeight: false, bySize, weight: weight || null, base, over, fromPrice, fallback
    };
  },

  // 가격 설명 한 줄: '5.2kg → 5~7kg 구간 50,000원' (+ 초과분). 빈 칸이라 다른 구간 값을 쓴 경우 '(앞 구간 가격)'
  // 단일가 + 이 서비스만 초과 요금: '12.3kg → 기본 50,000원 + 초과 3kg × 7,000원 = 71,000원'
  describeBandPrice(res, weight) {
    if (!res) return '';
    let s;
    if (res.mode === 'weight' && res.bandLabel) {
      const head = res.bySize ? '사이즈 기준' : this.formatKg(weight) + 'kg';
      const fb = res.fallback === 'prev' ? ' (앞 구간 가격)' : res.fallback === 'next' ? ' (뒤 구간 가격)' : res.fallback === 'min' ? ' (가장 낮은 구간 가격)' : '';
      // 가격을 안 적은 메뉴 — '0원'으로 보이지 않게
      if (!(res.base > 0)) return `${head} → ${res.bandLabel} 구간 (가격 미입력)`;
      s = `${head} → ${res.bandLabel} 구간${fb} ${this.formatCurrency(res.base)}`;
    } else if (res.mode === 'flat' && res.over) {
      s = `${this.formatKg(weight)}kg → 기본 ${this.formatCurrency(res.base)}`;
    } else return '';
    if (res.over) s += ` + 초과 ${res.over.kg}kg × ${this.formatCurrency(res.over.perKg)} = ${this.formatCurrency(res.price)}`;
    return s;
  },

  // 목록·칩용 가격 글자. 몸무게를 모르는 구간 가격 서비스는 '3.5만~5.5만' 범위로.
  // 끝의 '~'는 사장님이 '~부터'로 표시를 고른 경우에만 붙는다.
  formatServicePrice(svc, table, weightOrSize) {
    // '무료'는 사장님이 무료로 표시한 서비스(pricing.free)만 — 가격 칸이 비었거나 0원이면 '가격 미입력'
    const fmt = (v) => this.formatPriceShort(v) || '가격 미입력';
    const r = this.calcServicePrice(svc, weightOrSize, table);
    if (r.free) return '무료';
    const tail = r.fromPrice ? '~' : '';
    if (!r.needsWeight) return fmt(r.price) + (r.price > 0 ? tail : '');
    const vals = this.getServiceBandRows(svc, table).map(x => x.price).filter(v => v > 0);
    if (vals.length === 0) return '가격 미입력';
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return (lo === hi ? this.formatManwon(lo) : this.formatManwon(lo) + '~' + this.formatManwon(hi)) + tail;
  },

  // 구간별 가격 목록 [{ id, label, price }] — 지금 구간표 기준(서비스 id 가 안 맞으면 대표 몸무게로 계산)
  getServiceBandRows(svc, table) {
    const p = this.getServicePricing(svc, table);
    return table.bands.map((b, i) => {
      let price = Number(p.prices && p.prices[b.id]) || 0;
      if (!price && p.mode === 'weight' && this._pricingTable(p, table) !== table) {
        const lower = i > 0 ? table.bands[i - 1].upTo : 0;
        price = this.calcServicePrice({ ...svc, category: 'addon' }, b.upTo != null ? b.upTo : lower + 0.1, { ...table, bandsOff: false }).base || 0;
      }
      return { id: b.id, label: this.getBandLabel(table, i), price };
    });
  },

  // 짧은 가격: 1만 원 이상이고 1,000원 단위면 '4.5만', 아니면 '6,000원'·'12,345원' (소수점 긴 '1.2345만'·'0.6만' 방지)
  formatManwon(v) {
    const n = Number(v) || 0;
    if (!n) return '-';
    return n >= 10000 && n % 1000 === 0 ? (n / 10000) + '만' : n.toLocaleString('ko-KR') + '원';
  },

  // 구버전 기기 호환 필드(priceSmall/Medium/Large) + 서명 갱신. svc.pricing 이 있어야 한다.
  applyLegacyPrices(svc, table) {
    const rep = this.LEGACY_REP_WEIGHTS;
    ['small', 'medium', 'large'].forEach(k => {
      const key = 'price' + k.charAt(0).toUpperCase() + k.slice(1);
      svc[key] = this.calcServicePrice(svc, rep[k], table).price;
    });
    svc.pricing.legacySig = this._legacySig(svc);
    // 가격을 적을 때의 구간 경계 — 구간표가 늦게 오거나 바뀌어도 이 서비스 가격을 계산할 수 있게
    if (svc.pricing.mode === 'weight' && this._pricingTable(svc.pricing, table) === table) svc.pricing.bandsAt = table.bands.map(b => ({ id: b.id, upTo: b.upTo }));
    else if (svc.pricing.mode !== 'weight') delete svc.pricing.bandsAt;
    return svc;
  },

  _legacySig(svc) {
    return [svc.priceSmall, svc.priceMedium, svc.priceLarge].map(v => Number(v) || 0).join('|');
  },

  // 구버전 기기가 고친 priceSmall/Medium/Large 를 구간 가격에 반영한다 — 바뀐 칸만, 차이(새 값 − 저장된 서명 값)만큼 더한다.
  //  소형 = 시작이 7kg 미만인 구간, 중형 = 그 밖의 구간(초과 kg 요금이 꺼져 있으면 15kg 이상 구간은 대형),
  //  대형 = 마지막 구간(20kg 대표 가격이 그 차이만큼 움직이게). 마지막 구간은 대형이 바뀌었으면 대형 차이만 쓴다.
  //  결과가 0원 이하가 되는 칸은 그대로 둔다. 바꾸기 전 가격은 pricing.prevBeforeLegacy 에 남긴다.
  adoptLegacyEdit(svc, table) {
    const p = this.getServicePricing(svc, table);
    const old = String(p.legacySig || '').split('|').map(Number);
    const cur = [svc.priceSmall, svc.priceMedium, svc.priceLarge].map(v => Number(v) || 0);
    const [dS, dM, dL] = cur.map((v, i) => v - (old[i] || 0));
    const prev = JSON.parse(JSON.stringify(p)); delete prev.prevBeforeLegacy;
    const tb = this._pricingTable(p, table);
    // legacyToPricing 과 같은 규칙: 큰 아이 추가 요금이 붙지 않는 서비스는 무거운 구간(15kg~ 또는 10kg 이상에서 시작하는 마지막 구간) = 대형
    const om = this.getOverKgMode(svc, p);
    const overOn = om === 'custom' || (om === 'inherit' && !!tb.overKg && !tb.bandsOff);
    const keyOf = (i) => {
      const lower = i > 0 ? tb.bands[i - 1].upTo : 0;
      const heavy = !overOn && (lower >= 15 || (i === tb.bands.length - 1 && lower >= 10));
      return lower < 7 ? 'S' : (heavy ? 'L' : 'M');
    };
    const deltaOf = { S: dS, M: dM, L: dL };
    const next = { ...prev, prices: { ...(prev.prices || {}) } };
    if (prev.mode !== 'weight') {
      if (dS === dM && dM === dL) {
        if ((Number(prev.flat) || 0) + dS > 0) next.flat = (Number(prev.flat) || 0) + dS;
      } else {
        // 크기마다 다르게 고쳤으면 구간 가격으로 바꾼다 (모든 칸 = 원래 단일가에서 시작)
        next.mode = 'weight';
        tb.bands.forEach(b => { next.prices[b.id] = Number(prev.flat) || 0; });
      }
    }
    if (next.mode === 'weight') {
      tb.bands.forEach((b, i) => {
        const before = Number(next.prices[b.id]) || 0;
        if (!before) return; // 비어 있는 칸은 그대로
        const isLast = i === tb.bands.length - 1;
        const d = isLast && dL !== 0 ? dL : deltaOf[keyOf(i)];
        let after = before + d;
        // 대형가를 내려도 마지막 구간이 바로 앞 구간보다 싸지지는 않게 (10kg 바로 위가 7~10kg보다 싸지는 역전 방지)
        if (isLast && dL !== 0 && i > 0) after = Math.max(after, Number(next.prices[tb.bands[i - 1].id]) || 0);
        if (after > 0) next.prices[b.id] = after;
      });
    }
    next.prevBeforeLegacy = prev;
    svc.pricing = next;
    this.applyLegacyPrices(svc, table);
    return svc;
  },

  // 새 서비스(템플릿·즉석 등록)에 pricing 을 붙인다
  withPricing(svc, table) {
    if (!svc.pricing) svc.pricing = this.legacyToPricing(svc, table);
    return this.applyLegacyPrices(svc, table);
  },

  // 구간표·서비스 가격 변환. 매 실행 시:
  //  - 구간표가 없으면 기본 5단계를 만든다
  //  - pricing 이 없는 서비스(구버전 데이터·구버전 기기에서 새로 만든 메뉴)는 변환
  //  - 구버전 기기가 priceSmall 등을 고친 서비스(서명 불일치)는 그 값을 다시 받아들이고 알린다
  // 첫 변환(또는 복원 후 force) 때만 "구간표 확인" 안내를 띄운다. 완료 표시는 이 기기 IDB 설정(동기화 안 함).
  async migratePriceBands(force = false) {
    if (DB.mode === 'server') return;
    if (this._priceMigrating) return this._priceMigrating;
    this._priceMigrating = (async () => {
      try {
        const done = (await DB.getSetting('priceBandsMigrated')) === 1;
        let raw = await DB.getSetting('priceBands');
        if (!raw || !Array.isArray(raw.bands)) raw = await this.savePriceBands(this.DEFAULT_PRICE_BANDS);
        const table = this.normalizePriceBands(raw);
        const services = await DB.getAll('services');
        let migrated = 0;
        const adopted = [];
        const addonOff = []; // 이번에 '초과 kg 요금 없음'으로 정해진 추가 옵션·단독 케어 (구간 가격 서비스만 알림)
        for (const svc of services) {
          // v184: 서비스별 초과 kg 규칙을 아직 안 적은 서비스 → 기본값을 적는다 (한 번만 — 값이 있으면 건드리지 않는다).
          // 계산은 값이 없어도 같은 기본값을 쓰므로 미용 코스 가격은 그대로다. 구버전 호환 가격은 아래에서 함께 다시 적는다.
          if (svc.pricing && (svc.pricing.mode === 'flat' || svc.pricing.mode === 'weight') && svc.pricing.overKgMode == null) {
            const mode = this.defaultOverKgMode(svc);
            svc.pricing.overKgMode = mode;
            if (mode === 'off' && svc.pricing.mode === 'weight' && table.overKg) addonOff.push(svc.name);
            const sigBefore = svc.pricing.legacySig;
            const changedOld = sigBefore && sigBefore !== this._legacySig(svc); // 구버전 기기 수정분은 아래 분기에서 먼저 받아들인다
            if (!changedOld) {
              this.applyLegacyPrices(svc, table);
              await DB.update('services', svc);
              continue;
            }
          }
          const p = svc.pricing;
          if (!p || (p.mode !== 'flat' && p.mode !== 'weight')) {
            const hadPrice = (Number(svc.priceSmall) || 0) + (Number(svc.priceMedium) || 0) + (Number(svc.priceLarge) || 0) > 0;
            svc.pricing = this.legacyToPricing(svc, table);
            if (svc.pricing.overKgMode === 'off' && svc.pricing.mode === 'weight' && table.overKg) addonOff.push(svc.name);
            svc.pricing.migratedFrom = { small: Number(svc.priceSmall) || 0, medium: Number(svc.priceMedium) || 0, large: Number(svc.priceLarge) || 0 };
            this.applyLegacyPrices(svc, table);
            // 가격이 있던 서비스가 0원이 되면 안 된다 (안전 확인)
            if (hadPrice && !(Number(svc.priceSmall) || Number(svc.priceMedium) || Number(svc.priceLarge))) {
              console.warn('[migrate] 0원 변환 감지 — 건너뜀', svc.name);
              delete svc.pricing;
              continue;
            }
            await DB.update('services', svc);
            migrated++;
          } else if (p.legacySig && p.legacySig !== this._legacySig(svc)) {
            this.adoptLegacyEdit(svc, table);
            svc.priceChangedAt = new Date().toISOString();
            await DB.update('services', svc);
            adopted.push(svc.name);
          } else if (p.mode === 'weight' && this._pricingTable(p, table) !== table) {
            // 구간표가 바뀐 뒤 아직 옛 구간 id 로 남은 서비스 → 지금 구간표로 옮긴다 (각 구간 대표 몸무게의 가격)
            const before = JSON.stringify(p.prices);
            const rows = this.getServiceBandRows(svc, table);
            const prices = {};
            rows.forEach(r => { if (r.price > 0) prices[r.id] = r.price; });
            if (Object.keys(prices).length > 0 && JSON.stringify(prices) !== before) {
              svc.pricing = { ...p, prices };
              this.applyLegacyPrices(svc, table);
              await DB.update('services', svc);
            }
          } else if (!p.legacySig) {
            this.applyLegacyPrices(svc, table);
            await DB.update('services', svc);
          }
        }
        if (addonOff.length > 0) {
          const names = addonOff.slice(0, 3).join(', ') + (addonOff.length > 3 ? ' 외 ' + (addonOff.length - 3) + '개' : '');
          this.showToast(`${names}(추가 옵션·케어)에는 큰 아이 kg당 추가 요금이 붙지 않고 구간 가격(무거운 구간은 대형가)을 받아요. 서비스 메뉴 › 더 보기에서 바꿀 수 있어요.`, 'info', { duration: 10000 });
        }
        if (adopted.length > 0) {
          this.showToast(`다른 기기(이전 버전)에서 바뀐 가격을 반영했어요: ${adopted.slice(0, 3).join(', ')}${adopted.length > 3 ? ' 외 ' + (adopted.length - 3) + '개' : ''}. 구간 가격을 확인하세요.`, 'info', { duration: 8000 });
        }
        if (!done || force) {
          await DB.setSetting('priceBandsMigrated', 1);
          if (migrated > 0) {
            console.info(`[migrate] 서비스 ${migrated}개 몸무게 구간 가격으로 변환`);
            this.showToast('가격 구간이 5단계로 바뀌었어요. 10kg 넘는 아이는 이제 1kg당 추가 요금으로 계산돼 예전 대형가와 달라질 수 있어요. 설정에서 구간과 가격을 확인하세요. <a href="#settings" onclick="try{sessionStorage.setItem(\'settings-open-tab\',\'operation\')}catch(e){}" style="font-weight:700;text-decoration:underline">설정 열기</a>', 'info', { html: true, duration: 15000 });
          }
        }
        if (migrated > 0 || adopted.length > 0 || addonOff.length > 0) this._priceBandsCache = null;
        return { migrated, adopted: adopted.length };
      } catch (e) {
        console.warn('price band migration failed', e);
        return null;
      } finally {
        this._priceMigrating = null;
      }
    })();
    return this._priceMigrating;
  },

  // 구간표를 바꾼 뒤: 모든 서비스의 구버전 호환 가격을 새 구간표 기준으로 다시 적는다
  async refreshLegacyPrices(table) {
    const services = await DB.getAll('services');
    for (const svc of services) {
      if (!svc.pricing) svc.pricing = this.legacyToPricing(svc, table);
      const prevSig = svc.pricing.legacySig;
      this.applyLegacyPrices(svc, table);
      if (prevSig !== svc.pricing.legacySig) await DB.update('services', svc);
    }
  },

  // 메뉴(services)에서 이름으로 서비스 + 가격을 찾는다.
  // sizeOrWeight: 몸무게(숫자 kg) → 구간 계산, 'small'/'medium'/'large' → 사이즈 대표 구간, 없으면 needsWeight(구간 가격 서비스).
  // 반환: { service, price, hasSizePrices, bandId, bandLabel, needsWeight, bySize, base, over, fromPrice } 또는 null (메뉴에 없음)
  // price: 가격을 안 적은 메뉴(또는 몸무게를 몰라 정해지지 않은 구간 가격)는 null — 0원과 구분. 무료 메뉴만 0
  async getMenuPrice(serviceName, sizeOrWeight, servicesCache) {
    const name = this.normalizeServiceName(serviceName);
    if (!name) return null;
    const services = servicesCache || await DB.getAll('services');
    const svc = services.find(s => s.isActive !== false && this.normalizeServiceName(s.name) === name)
      || services.find(s => this.normalizeServiceName(s.name) === name);
    if (!svc) return null;
    const table = await this.getPriceBands();
    const r = this.calcServicePrice(svc, sizeOrWeight, table);
    return {
      service: svc, price: r.free ? 0 : (r.price > 0 ? r.price : null), hasSizePrices: r.mode === 'weight',
      bandId: r.bandId, bandLabel: r.bandLabel, needsWeight: r.needsWeight, bySize: r.bySize,
      base: r.base, over: r.over, fromPrice: r.fromPrice, mode: r.mode, free: !!r.free, fallback: r.fallback || null
    };
  },

  // 기록 폼 가격 자동 채움.
  // 원칙: 메뉴에 있는 서비스는 **메뉴의 현재 가격**이 기준이다. 예전엔 같은 반려견의 과거 기록 가격을
  // 먼저 써서, 가격을 올려도 단골은 계속 옛 가격이 들어갔고 일괄 인상이 기록엔 반영되지 않았다.
  // 예외: 그 반려견에게 메뉴 가격 변경(priceChangedAt) 이후에 다른 가격을 받은 기록이 있고,
  //       그 기록이 **같은 몸무게 구간**이면 (개별 협의가) 그 가격을 따른다. 구간이 바뀌었으면 메뉴 가격.
  // 메뉴에 없는 서비스(자유 입력)만 과거 기록에서 추정한다.
  async getRecentServicePrice(petId, serviceName, sizeOrWeight) {
    const name = this.normalizeServiceName(serviceName);
    if (!name) return null;
    const menu = await this.getMenuPrice(name, sizeOrWeight);
    const petRecords = petId ? (await DB.getByIndex('records', 'petId', Number(petId)))
      .filter(r => this.normalizeServiceName(r.service) === name && Number(r.servicePrice) > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [];
    if (menu) {
      if (menu.needsWeight) return null; // 몸무게를 알아야 가격이 정해진다
      const changedAt = menu.service.priceChangedAt ? String(menu.service.priceChangedAt).slice(0, 10) : null;
      const latest = petRecords.find(r => !r.addons || r.addons.length === 0) || petRecords[0];
      const sameBand = !menu.bandId || (latest && latest.priceBandId === menu.bandId);
      // 그날 메뉴 가격 그대로 받은 기록은 협의가가 아니다 (같은 구간이라도 초과 kg 요금만 달랐던 경우 등)
      const negotiated = latest && (latest.menuPriceAtVisit == null || Number(latest.servicePrice) !== Number(latest.menuPriceAtVisit));
      if (latest && changedAt && latest.date && latest.date >= changedAt && sameBand && negotiated && Number(latest.servicePrice) !== menu.price) {
        return Number(latest.servicePrice);
      }
      return menu.price || null;
    }
    // 메뉴에 없는 자유 입력 서비스 — 과거 기록에서 추정
    if (petRecords[0]) return Number(petRecords[0].servicePrice);
    const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'photo3', 'photo4', 'memo', 'condition', 'skinStatus', 'earStatus', 'mattingLevel']);
    const same = records.filter(r => this.normalizeServiceName(r.service) === name && Number(r.servicePrice) > 0);
    if (same.length === 0) return null;
    const { weight, size } = this._parseWeightOrSize(sizeOrWeight);
    if (weight || size) {
      const pets = await DB.getAllLight('pets', ['photo', 'photoThumb', 'memo', 'healthNotes', 'temperament']);
      let match;
      if (weight) {
        // 같은 몸무게 구간이었던 기록 (기록 당시 몸무게 → 없으면 반려견 현재 몸무게)
        const table = await this.getPriceBands();
        const target = this.resolveBand(table, weight).band.id;
        const petW = {}; pets.forEach(p => { petW[p.id] = Number(p.weight) || 0; });
        match = (r) => { const w = Number(r.weightAtVisit) || petW[r.petId]; return w > 0 && this.resolveBand(table, w).band.id === target; };
      } else {
        const sameSize = new Set(pets.filter(p => this.getPetSizeType(p) === size).map(p => p.id));
        match = (r) => sameSize.has(r.petId);
      }
      const sized = same.filter(match).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      if (sized[0]) return Number(sized[0].servicePrice);
    }
    return Number(same.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0].servicePrice);
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
    if (h < 6) return '새벽에도 수고하세요';
    if (h < 9) return `${todayName} 아침, 오늘도 화이팅!`;
    if (h < 12) return '좋은 오전이에요';
    if (h < 14) return '맛있는 점심 드세요';
    if (h < 18) return '오후도 힘내세요';
    if (h < 21) return '오늘 하루 수고했어요';
    return '편안한 밤 보내세요';
  },

  // 주의: 속성(attribute) 컨텍스트에서도 안전해야 하므로 따옴표까지 이스케이프한다.
  // textContent→innerHTML 방식은 &, <, > 만 변환하고 " ' 를 그대로 통과시켜
  // title="${escapeHtml(memo)}" 같은 지점이 정상 입력('푸들 "티컵"')에도 깨졌다.
  // 알러지·건강 메모가 실제 내용인지 ('없음', '-' 같은 빈 표시는 제외)
  hasPetNote(v) {
    const t = (v == null ? '' : String(v)).trim();
    return !!t && !['없음', '-'].includes(t);
  },

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
      .map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${this.escapeHtml(App.getCustomerLabel(c))} (${this.formatPhoneHtml(c.phone)})</option>`)
      .join('');
  },

  // ========== 공통 고객 등록 폼 ==========
  // 고객 페이지 모달 / 예약·기록 인라인 드롭다운이 같은 필드·같은 규칙을 쓰도록 한 곳에서 만든다.
  // 필수는 연락처뿐이고, 반려견 이름을 비우면 저장 직전에 한 번 확인한다.
  // ========== 견종 입력 ==========
  // 자유 입력이라 '말티즈/말티/멀티즈'가 따로 쌓여 견종별 분석이 쪼개졌다.
  // 자주 쓰는 견종 + 이 매장에서 이미 쓴 견종을 자동완성으로 제안하고, 흔한 줄임말·띄어쓰기만 저장 때 맞춘다.
  BREEDS: ['말티즈', '푸들', '토이푸들', '포메라니안', '비숑프리제', '시츄', '말티푸', '치와와', '요크셔테리어',
    '슈나우저', '닥스훈트', '웰시코기', '스피츠', '폼피츠', '진돗개', '시바견', '프렌치불독', '퍼그', '페키니즈',
    '미니핀', '이탈리안그레이하운드', '베들링턴테리어', '코카스패니얼', '비글', '보더콜리', '사모예드',
    '골든리트리버', '래브라도리트리버', '골든두들', '믹스견'],
  _BREED_ALIAS: {
    '말티': '말티즈', '멀티즈': '말티즈', '말디즈': '말티즈', '포메': '포메라니안',
    '비숑': '비숑프리제', '비숑프리즈': '비숑프리제', '시추': '시츄', '요키': '요크셔테리어', '요크셔': '요크셔테리어',
    '슈나우져': '슈나우저', '미니어처슈나우저': '슈나우저', '닥스': '닥스훈트', '코기': '웰시코기', '웰시코키': '웰시코기',
    '시바': '시바견', '시바이누': '시바견', '진도': '진돗개', '진도견': '진돗개', '프렌치불도그': '프렌치불독', '프불': '프렌치불독',
    '미니핀셔': '미니핀', '이탈그레': '이탈리안그레이하운드', '베들링턴': '베들링턴테리어',
    '골든': '골든리트리버', '래브라도': '래브라도리트리버', '믹스': '믹스견', '잡종': '믹스견'
  },

  normalizeBreed(v) {
    const t = String(v || '').trim().replace(/\s+/g, ' ');
    if (!t) return '';
    const key = t.replace(/\s/g, '');
    if (this._BREED_ALIAS[key]) return this._BREED_ALIAS[key];
    return this.BREEDS.includes(key) ? key : t;
  },

  breedInputHtml(id, value) {
    return `<input type="text" id="${id}" value="${this.escapeHtml(value || '')}" list="breed-suggestions" autocomplete="off" placeholder="예: 말티즈" maxlength="30">`;
  },

  // 폼을 열 때 호출 — 자동완성 목록을 (이 매장에서 많이 쓴 견종 → 기본 목록) 순으로 채운다
  async ensureBreedList() {
    let dl = document.getElementById('breed-suggestions');
    if (!dl) { dl = document.createElement('datalist'); dl.id = 'breed-suggestions'; document.body.appendChild(dl); }
    const fill = (names) => { dl.innerHTML = names.map(n => `<option value="${this.escapeHtml(n)}"></option>`).join(''); };
    if (!dl.children.length) fill(this.BREEDS);
    try {
      const pets = await DB.getAllLight('pets', ['photo', 'photoThumb', 'temperament', 'healthNotes', 'preferredStyle']);
      const count = {};
      pets.forEach(p => { const b = this.normalizeBreed(p.breed); if (b) count[b] = (count[b] || 0) + 1; });
      const used = Object.keys(count).sort((a, b) => count[b] - count[a]);
      fill([...new Set([...used, ...this.BREEDS])]);
    } catch (_) {}
  },

  customerFormHtml(prefill) {
    const p = prefill || {};
    return `
      <div class="form-group">
        <label class="form-label">${App.icon('paw')} 반려견 이름</label>
        <input type="text" id="cf-petName" value="${this.escapeHtml(p.petName || '')}" placeholder="반려견 이름" maxlength="30">
      </div>
      <div class="form-row breed-row">
        <div class="form-group">
          <label class="form-label">견종</label>
          ${this.breedInputHtml('cf-breed', p.breed)}
        </div>
        <div class="form-group">
          <label class="form-label">몸무게(kg)</label>
          <input type="number" id="cf-weight" inputmode="decimal" placeholder="3.5" step="0.1" min="0" max="120">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${App.icon('phone')} 연락처 <span class="required">*</span></label>
        <input type="tel" id="cf-phone" value="${this.escapeHtml(p.phone || '')}" placeholder="010-0000-0000">
        <div id="cf-dup-area"></div>
      </div>
      <div class="form-group">
        <label class="form-label">보호자 이름 <span class="form-optional">(선택)</span></label>
        <input type="text" id="cf-name" value="${this.escapeHtml(p.name || '')}" placeholder="보호자 이름" maxlength="50">
      </div>
      <button type="button" class="cf-more-toggle" id="cf-more-toggle">+ 특이사항 &middot; 메모</button>
      <div id="cf-more" style="display:none">
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

  // opts: { onPick(customer, petId) } — 중복 후보를 눌렀을 때 그 고객을 쓰는 동작 (폼에 적은 반려견은 그 고객에게 추가된 뒤 petId 로 온다)
  bindCustomerForm(opts) {
    const o = opts || {};
    setTimeout(() => this.setupPhoneInputs(), 50);
    this.ensureBreedList();

    document.getElementById('cf-more-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const more = document.getElementById('cf-more');
      if (!more) return;
      const show = more.style.display === 'none';
      more.style.display = show ? 'block' : 'none';
      e.currentTarget.textContent = show ? '− 추가 항목 접기' : '+ 특이사항 · 메모';
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
      // 뒷자리 일치로만 검사한다. 앞에서부터 새 번호를 치는 동안 '0101…' 이 모든 고객과 부분일치해
      // 경고가 매번 떠서 사장님이 경고를 무시하게 되고 진짜 중복을 놓쳤다.
      const matches = all.filter(c => {
        const d = (c.phone || '').replace(/\D/g, '');
        return d && (digits.length >= 10 ? d === digits : d.endsWith(digits));
      }).slice(0, 3);
      if (matches.length === 0) return;
      dupArea.innerHTML = `
        <div class="cf-dup">
          <div class="cf-dup-title">${this.icon('alert')} 번호가 겹치는 고객이 있습니다</div>
          ${matches.map(c => {
            const cp = byCustomer[c.id] || [];
            const petPart = cp.length === 0 ? '' : cp.map(p => p.name).filter(Boolean).join(', ');
            // 입력한 반려견이 이 보호자에게 아직 없으면 '추가' — 기존 손님의 두 번째 강아지도 새 고객 폼 하나로 끝낸다
            const typedPet = (document.getElementById('cf-petName')?.value || '').trim();
            const isNewPet = typedPet && !cp.some(p => (p.name || '').trim() === typedPet);
            return `<div class="cf-dup-row">
              <div class="cf-dup-info">
                <strong>${this.escapeHtml(this.getCustomerLabel(c, cp))}</strong>
                <span>${this.formatPhoneHtml(c.phone)}${petPart ? ' &middot; ' + this.escapeHtml(petPart) : ''}</span>
              </div>
              <button type="button" class="btn btn-sm btn-primary cf-dup-pick" data-id="${c.id}">${isNewPet ? `'${this.escapeHtml(typedPet)}' 추가` : '이 고객 사용'}</button>
            </div>`;
          }).join('')}
        </div>`;
      dupArea.querySelectorAll('.cf-dup-pick').forEach(btn => {
        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const picked = all.find(c => c.id === Number(btn.dataset.id));
          if (!picked || !o.onPick) return;
          btn.disabled = true;
          const petId = await this._petFromFormFor(picked.id);
          o.onPick(picked, petId);
        });
      });
    }, 300);

    phoneInput.addEventListener('input', check);
    // 번호를 먼저 치고 반려견 이름을 나중에 적어도 '추가' 버튼 문구가 맞게 바뀌도록
    document.getElementById('cf-petName')?.addEventListener('input', check);
    if (phoneInput.value) check(); // 검색어에서 넘어온 번호도 바로 검사
  },

  // 새 고객 폼에 적은 반려견을 기존 보호자에게 붙인다. 같은 이름이 이미 있으면 그 반려견 id, 이름이 비었으면 null.
  async _petFromFormFor(customerId) {
    const g = (id) => document.getElementById(id);
    const name = (g('cf-petName')?.value || '').trim();
    if (!name) return null;
    try {
      const existing = (await DB.getByIndex('pets', 'customerId', customerId)).find(p => (p.name || '').trim() === name);
      if (existing) return existing.id;
      const petData = { customerId, name, breed: this.normalizeBreed(g('cf-breed')?.value), healthNotes: g('cf-notes')?.value.trim() || '' };
      const weight = parseFloat(g('cf-weight')?.value);
      if (weight > 0) {
        petData.weight = weight;
        petData.size = weight < 7 ? 'small' : weight < 15 ? 'medium' : 'large';
      }
      const id = await DB.add('pets', petData);
      this.showToast(`${name} 등록 완료`);
      return id;
    } catch (e) {
      console.warn('기존 보호자에 반려견 추가 실패:', e);
      this.showToast('반려견 등록에 실패했습니다.', 'error');
      return null;
    }
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
      const dupPets = await DB.getByIndex('pets', 'customerId', dup.id);
      const isNewPet = petName && !dupPets.some(p => (p.name || '').trim() === petName);
      const use = await this.confirm(
        `이미 등록된 연락처입니다.<br><strong>${this.escapeHtml(this.getCustomerLabel(dup, dupPets))}</strong><br>` +
        (isNewPet ? `이 보호자에게 <strong>${this.escapeHtml(petName)}</strong>을(를) 추가할까요?` : '이 고객을 사용하시겠습니까?'),
        { okLabel: isNewPet ? '반려견 추가' : '이 고객 사용', danger: false }
      );
      if (use && o.onPick) { o.onPick(dup, await this._petFromFormFor(dup.id)); return null; }
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
          breed: this.normalizeBreed(g('cf-breed')?.value),
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
          <button type="button" class="cust-chip-clear" id="${containerId}-chip-clear" aria-label="고객 선택 해제">${this.icon('close')}</button>
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
        // 전화번호는 숫자만 비교한다 — '0101111'처럼 하이픈 자리를 건너뛰는 입력도 고객 화면 검색과 똑같이 찾는다
        const i = String(c.phone || '').replace(/\D/g, '').indexOf(qDigits);
        if (i !== -1 && (best === -1 || i < best)) best = i;
      }
      return best;
    };
    // 전화번호처럼 생긴 입력(숫자·하이픈·공백·+)일 때만 번호로 찾는다.
    // '콩이2'의 '2'로 번호에 2가 들어간 고객이 전부 걸리던 문제
    const phoneLike = (q) => /^[\d\s\-+().]+$/.test(q);
    // 검색어와 이름이 맞는 반려견 (정확히 같은 이름 우선) — 고객을 고르면 그 아이를 바로 선택한다
    const matchedPetOf = (cid, q) => {
      if (!q || phoneLike(q)) return null;
      const cp = petsByCustomer[cid] || [];
      const norm = (p) => (p.name || '').normalize('NFC').toLowerCase();
      return cp.find(p => norm(p) === q) || cp.find(p => norm(p).includes(q)) || null;
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
      const qDigits = phoneLike(q) ? q.replace(/\D/g, '') : '';

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
            ? `${this.escapeHtml(petPart)} · ${this.escapeHtml(whoOf(c))} <span class="sub">${this.formatPhoneHtml(c.phone)}</span>`
            : `${this.escapeHtml(App.getCustomerLabel(c, cp))} <span class="sub">${this.formatPhoneHtml(c.phone)}</span>`;
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
        // 반려견 이름으로 찾았으면 그 아이를 바로 선택 (lockSelection 이 검색어를 지우기 전에 읽는다).
        // 반려견 폼(pet-customer-select)은 두 번째 인자를 '방금 새로 만든 반려견'으로 쓰므로 넘기지 않는다.
        const hitPet = containerId !== 'pet-customer-select'
          ? matchedPetOf(Number(opt.dataset.id), (input.value || '').trim().normalize('NFC').toLowerCase()) : null;
        lockSelection(opt.dataset.id, picked ? labelOf(picked) : '');
        if (onChange) onChange(Number(opt.dataset.id), hitPet ? hitPet.id : undefined);
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

    const pickExisting = async (c, petId) => {
      if (petId) { const pet = await DB.get('pets', petId); if (pet) addLocal(c, pet); }
      lockSelection(c.id, labelOf(c));
      if (onChange) onChange(c.id, petId || undefined);
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

    const allPets = await DB.getByIndex('pets', 'customerId', Number(customerId));
    // 사망/양도 반려견은 선택 대상에서 제외 (getPetOptions 와 같은 기준). 단, 수정 중인 기록이 가리키면 유지
    const pets = allPets.filter(p => (p.petStatus || 'active') === 'active' || p.id === Number(preferPetId));
    if (pets.length === 0) {
      select.innerHTML = `<option value="">${allPets.length > 0 ? '활동 중인 반려견이 없습니다' : '등록된 반려견이 없습니다'}</option>`;
      area.innerHTML = `
        <button type="button" class="btn btn-sm btn-primary" id="btn-inline-add-pet" style="margin-top:6px;width:100%;min-height:44px">+ 이 고객의 반려견 등록</button>
        <div id="inline-pet-form"></div>`;
      document.getElementById('btn-inline-add-pet')?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._showInlinePetForm(Number(customerId));
      });
    } else {
      select.innerHTML = '<option value="">반려견 선택</option>' + await this.getPetOptions(customerId, preferPetId ? Number(preferPetId) : null);
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
        <div class="form-row breed-row">
          <div class="form-group">
            <label class="form-label">견종</label>
            ${this.breedInputHtml('ip-breed')}
          </div>
          <div class="form-group">
            <label class="form-label">몸무게(kg)</label>
            <input type="number" id="ip-weight" inputmode="decimal" placeholder="3.5" step="0.1" min="0" max="120">
          </div>
        </div>
        <div class="cf-inline-actions">
          <button type="button" class="btn btn-primary" id="ip-save">반려견 등록</button>
          <button type="button" class="btn btn-secondary" id="ip-cancel">취소</button>
        </div>
      </div>`;
    this.ensureBreedList();
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
          breed: this.normalizeBreed(document.getElementById('ip-breed')?.value)
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
    const allPets = await DB.getByIndex('pets', 'customerId', Number(customerId));
    // 사망/양도 반려견은 목록에서 제외 — 활성 1마리 + 비활성 1마리일 때 자동 선택이 매번 막히던 문제.
    // 단, 수정 중인 기록이 가리키는 반려견은 유지한다.
    const pets = allPets.filter(p => (p.petStatus || 'active') === 'active' || p.id === selectedId);
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
    const birth = this.parseLocalDate(String(birthDate).slice(0, 10)) || new Date(birthDate);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    // 올해 생일(월·일)이 아직 안 지났으면 한 살 덜
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years--;
    return years > 0 ? years + '살' : '1살 미만';
  },

  // 가격을 축약 표시 (예: 50000 -> "5만", 15000 -> "1.5만")
  // 서비스 칩 가격 — 다른 화면과 같은 '30,000원' 형식 (예전엔 '3만'과 '5,000원'이 섞여 보였다)
  formatPriceShort(price) {
    const p = Number(price) || 0;
    if (p === 0) return '';
    return p.toLocaleString('ko-KR') + '원';
  },

  // sizeOrWeight: 반려견 몸무게(kg) 또는 사이즈. 모르면 구간 가격 서비스는 '최저가~'로 보인다.
  async getServiceCheckboxes(selectedIds = [], sizeOrWeight) {
    const services = await DB.getAll('services');
    const active = services.filter(s => s.isActive !== false);
    if (active.length === 0) return '<p style="color:var(--text-muted)">등록된 서비스가 없습니다. 서비스 메뉴에서 먼저 등록해주세요.</p>';
    const table = await this.getPriceBands();
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
        <span style="font-weight:700;font-size:0.93rem;color:var(--text-secondary)">서비스 선택</span>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-toggle-services">전체 선택</button>
      </div>
    `;
    for (const cat of catOrder) {
      if (!grouped[cat] || grouped[cat].length === 0) continue;
      html += `<div style="font-size:0.93rem;font-weight:700;color:var(--primary);margin:8px 0 4px;padding-bottom:2px;border-bottom:1px solid var(--primary-lighter)">${catLabels[cat] || cat}</div>`;
      html += '<div class="service-select-grid">';
      html += grouped[cat].map(s => {
        const checked = selectedIds.includes(s.id);
        return this.serviceChipHtml(s, sizeOrWeight, table, checked);
      }).join('');
      html += '</div>';
    }
    return html;
  },

  // 예약 서비스 칩 1개. 몸무게를 알면 구간(·초과 요금)을 작은 글씨로 보이게 적는다
  serviceChipHtml(s, sizeOrWeight, table, checked, nameSuffix = '') {
    const r = this.calcServicePrice(s, sizeOrWeight, table);
    const priceTxt = r.free ? '무료' : (r.price > 0 || r.needsWeight ? this.formatServicePrice(s, table, sizeOrWeight) : '');
    const fb = r.fallback === 'prev' ? ' (앞 구간 가격)' : r.fallback === 'next' ? ' (뒤 구간 가격)' : r.fallback === 'min' ? ' (가장 낮은 구간 가격)' : '';
    const sub = [r.bandLabel ? r.bandLabel + fb : '', r.over ? '초과 ' + r.over.kg + 'kg 포함' : ''].filter(Boolean).join(' · ');
    return `
          <label class="service-chip${checked ? ' checked' : ''}">
            <input type="checkbox" name="serviceIds" value="${s.id}"
              ${checked ? 'checked' : ''}
              data-price="${r.price || 0}" data-needs-weight="${r.needsWeight ? 1 : 0}" data-category="${this.escapeHtml(s.category || 'grooming')}">
            <span class="service-chip-name">${this.escapeHtml(s.name)}${nameSuffix}</span>
            <span class="service-chip-price">${priceTxt}${sub ? `<small class="service-chip-band">${this.escapeHtml(sub)}</small>` : ''}</span>
          </label>`;
  },

  async getServiceNames(serviceIds) {
    if (!serviceIds || serviceIds.length === 0) return '-';
    const services = await DB.getAll('services');
    const map = {};
    services.forEach(s => map[s.id] = s.name);
    return serviceIds.map(id => map[id] || '알 수 없음').join(', ');
  },

  // 예약의 서비스 이름 (id→이름 맵 기준). 지워진 서비스는 예약에 저장해 둔 이름, 그것도 없으면 '삭제된 서비스'
  apptServiceNames(appt, serviceMap) {
    const ids = (appt && appt.serviceIds) || [];
    const saved = (appt && Array.isArray(appt.serviceNames)) ? appt.serviceNames : [];
    return ids.map((id, i) => serviceMap[id] || serviceMap[Number(id)] || saved[i] || '삭제된 서비스').join(', ');
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
      // 최근 1년 기록만 본다 (몇 년 치 기록 전체를 폼을 열 때마다 읽으면 1~3초씩 멈춘다)
      const from = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return this.formatLocalDate(d); })();
      const recs = await DB.getByDateRange('records', 'date', from, '9999-12-31');
      pastGroomers = [...new Set(recs.map(r => r.groomer).filter(g => g && !registered.includes(g)))];
    } catch (e) { /* ignore */ }
    const suggestions = [...registered, ...pastGroomers];
    const placeholder = registered.length === 0 ? '미용사 이름 (선택 입력)' : '미용사 이름';
    return `<input type="text" id="f-groomer" list="groomer-suggestions" value="${this.escapeHtml(selected || '')}" placeholder="${placeholder}" autocomplete="off" style="min-height:44px;font-size:max(16px,0.95rem)">
      <datalist id="groomer-suggestions">
        ${suggestions.map(g => `<option value="${this.escapeHtml(g)}">`).join('')}
      </datalist>`;
  },

  // 미용사가 2명 이상 등록됐을 때만 담당 미용사 입력·미용사별 타임테이블/매출/성과를 보여준다
  // (1인 살롱에선 화면만 복잡해진다. 1명 등록 시 담당자는 getGroomerFieldHTML이 자동 채움)
  async isMultiGroomer() {
    const registered = (await DB.getSetting('groomers')) || [];
    return registered.length >= 2;
  },

  // Apply shop name throughout the app
  async applyShopName() {
    const name = await DB.getSetting('shopName');
    const display = name || '펫살롱';
    document.title = `${display} - 애견 미용 고객 관리`;
    const logo = document.querySelector('.logo');
    if (logo) logo.innerHTML = `${this.icon('scissors')} ${this.escapeHtml(display)}`;
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
    // Derive light: 라이트 모드는 흰색 쪽으로 90%, 다크 모드는 다크 배경 쪽으로 섞는다.
    // (예전엔 다크 모드에서도 흰색 90% 를 인라인으로 덮어써 칩·선택 상태가 거의 흰색이 됐다)
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const base = isDark ? [0x1A, 0x1D, 0x23] : [255, 255, 255];
    const ratio = isDark ? 0.78 : 0.9;
    const mix = (c, b) => Math.round(c * (1 - ratio) + b * ratio);
    const lr = mix((num >> 16) & 0xFF, base[0]);
    const lg = mix((num >> 8) & 0xFF, base[1]);
    const lb = mix(num & 0xFF, base[2]);
    const toHex = (a, b, c) => `#${((1 << 24) + (a << 16) + (b << 8) + c).toString(16).slice(1)}`;
    r.style.setProperty('--primary-light', toHex(lr, lg, lb));
    const k = isDark ? 1.06 : 0.97;
    r.style.setProperty('--primary-lighter', toHex(Math.min(255, Math.round(lr * k)), Math.min(255, Math.round(lg * k)), Math.min(255, Math.round(lb * k))));
    r.style.setProperty('--primary-rgb', `${(num >> 16) & 0xFF},${(num >> 8) & 0xFF},${num & 0xFF}`);
    // 시스템 테마가 바뀌면 다시 계산
    this._themeColor = color;
    if (!this._themeMediaBound && window.matchMedia) {
      this._themeMediaBound = true;
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme(this._themeColor).catch(() => {}));
    }
    // Sidebar active
    r.style.setProperty('--sidebar-active', color);
    // Meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', color);
  },

  // ========== 예약 알림 (Web Push — 앱을 닫아도 온다) ==========
  // 서버(Cloudflare Worker)가 알림 목록(jobs)을 들고 있다가 시간이 되면 등록된 기기 모두에 보낸다.
  // 이 기기는 (1) 알림 목록을 올리고(scheduleUpload) (2) 이 기기를 받는 곳으로 등록(enableThisDevice)한다.
  // 설정 키: pushKey(동기화 — 매장 공용 열쇠) / pushDevice·pushLastHash·pushVapid (이 기기만, 백업·동기화 제외)
  // 알림 글에는 반려견 이름·시간·서비스만 — 보호자 이름·전화는 절대 넣지 않는다 (잠금 화면에 보인다)
  PUSH_URL: 'https://petsalon-push.a01090037052.workers.dev',
  Push: {
    _timer: null,
    _onlineWait: false,
    supported() {
      return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
        typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
    },
    titleFor(minutes) {
      const m = Number(minutes) || 30;
      if (m < 60) return `${m}분 뒤 예약`;
      return m % 60 === 0 ? `${m / 60}시간 뒤 예약` : `${Math.floor(m / 60)}시간 ${m % 60}분 뒤 예약`;
    },
    // 순수 함수 (테스트) — 오늘~14일 뒤 예약 → 서버에 올릴 알림 목록
    //  serviceMap: { id: 이름 } (없으면 예약에 저장된 serviceNames)
    buildJobs(appointments, petsById, serviceMap, minutes, nowMs) {
      const min = Number(minutes) || 30;
      const now = Number(nowMs) || Date.now();
      const today = App.formatLocalDate(new Date(now));
      const endD = new Date(now); endD.setDate(endD.getDate() + 14);
      const end = App.formatLocalDate(endD);
      const jobs = [];
      for (const a of (appointments || [])) {
        if (!a || !a.date || !a.time) continue;
        if (['cancelled', 'completed', 'noshow', 'no_show'].includes(a.status)) continue;
        if (a.date < today || a.date > end) continue;
        const [y, mo, d] = String(a.date).split('-').map(Number);
        const [hh, mm] = String(a.time).split(':').map(Number);
        if (!y || !mo || !d || isNaN(hh)) continue;
        const at = new Date(y, mo - 1, d, hh, mm || 0, 0, 0).getTime() - min * 60000;
        if (at < now - 15 * 60000) continue;
        const pet = petsById && (petsById[a.petId] || petsById[Number(a.petId)]);
        const ids = Array.isArray(a.serviceIds) ? a.serviceIds : [];
        const saved = Array.isArray(a.serviceNames) ? a.serviceNames : [];
        const svc = (ids.length ? ids.map((id, i) => (serviceMap && (serviceMap[id] || serviceMap[Number(id)])) || saved[i]) : saved)
          .filter(Boolean).join(', ');
        jobs.push({
          at,
          tag: `appt-${a.id}-${a.date}-${a.time}-${min}`,
          title: this.titleFor(min),
          body: `${a.time} ${(pet && pet.name) || '반려견'}` + (svc ? ' · ' + svc : ''),
          url: './#appointments'
        });
      }
      jobs.sort((x, y) => x.at - y.at);
      return jobs.slice(0, 300);
    },
    _hash(str) { // 짧은 지문 (같은 목록이면 다시 안 올린다)
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
      return h.toString(36) + ':' + str.length;
    },
    async _fetch(path, body, key) {
      const headers = { 'Content-Type': 'application/json' };
      if (key) headers['X-Push-Key'] = key;
      const res = await fetch(App.PUSH_URL + path, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) });
      let json = null;
      try { json = await res.json(); } catch (_) {}
      return { ok: res.ok, status: res.status, json };
    },
    // 예약·반려견·알림 시간이 바뀌면 부른다 (여러 번 불러도 3초 모아서 한 번)
    scheduleUpload(force = false) {
      try {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => { this._upload(force).catch(() => {}); }, force ? 0 : 3000);
      } catch (_) {}
    },
    async _upload(force) {
      try {
        const key = await DB.getSetting('pushKey');
        if (!key) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          if (!this._onlineWait) {
            this._onlineWait = true;
            window.addEventListener('online', () => { this._onlineWait = false; this.scheduleUpload(); }, { once: true });
          }
          return;
        }
        const now = Date.now();
        const today = App.formatLocalDate(new Date(now));
        const endD = new Date(now); endD.setDate(endD.getDate() + 14);
        const [appts, pets, services, minutes] = await Promise.all([
          DB.getByDateRange('appointments', 'date', today, App.formatLocalDate(endD)),
          DB.getAllLight('pets', ['photo', 'photoThumb', 'preferredStyle']),
          DB.getAll('services'),
          DB.getSetting('notifMinutes')
        ]);
        const petsById = {}; (pets || []).forEach(p => { petsById[p.id] = p; });
        const serviceMap = {}; (services || []).forEach(sv => { serviceMap[sv.id] = sv.name; });
        const jobs = this.buildJobs(appts, petsById, serviceMap, Number(minutes) || 30, now);
        const hash = this._hash(JSON.stringify(jobs.map(j => [j.at, j.tag, j.body])));
        const last = await DB.getSetting('pushLastHash');
        // 같은 목록이면 건너뛴다 — 단 12시간마다는 다시 올린다 (서버가 지난 알림을 지우므로)
        if (!force && last && last.hash === hash && now - (last.at || 0) < 12 * 3600000) return;
        const r = await this._fetch('/schedule', { jobs }, key);
        if (r.ok) await DB.setSetting('pushLastHash', { hash, at: now, count: jobs.length });
      } catch (e) { console.warn('예약 알림 목록 올리기 실패 (다음에 다시):', e); }
    },
    _b64urlToBytes(b64) {
      const s = String(b64).replace(/-/g, '+').replace(/_/g, '/');
      return Uint8Array.from(atob(s + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
    },
    _newKey() {
      const b = new Uint8Array(32);
      crypto.getRandomValues(b);
      return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    _label() {
      const ua = navigator.userAgent || '';
      if (/iPhone/.test(ua)) return '아이폰';
      if (/iPad/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) return '아이패드';
      if (/Android/.test(ua)) return /Mobile/.test(ua) ? '안드로이드 폰' : '안드로이드 태블릿';
      return '컴퓨터';
    },
    async _subscribe(vapid, renew) {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub && renew) { try { await sub.unsubscribe(); } catch (_) {} sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this._b64urlToBytes(vapid) });
      return sub;
    },
    // 앱 시작·다시 보일 때: 이 기기가 받는 중이면 구독이 살아 있는지 확인하고, 없으면 조용히 다시 등록
    async ensureDevice() {
      try {
        if (!this.supported()) return;
        const marker = await DB.getSetting('pushDevice');
        if (!marker) return;
        if (Notification.permission !== 'granted') { await DB.setSetting('pushDevice', null); return; } // 권한을 껐다
        const key = await DB.getSetting('pushKey');
        if (!key || navigator.onLine === false) return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const st = await this._fetch('/status');
        const vapid = st.json && st.json.vapid;
        if (!vapid) return;
        const storedVapid = await DB.getSetting('pushVapid');
        if (sub && storedVapid === vapid) return;
        const fresh = await this._subscribe(vapid, !!sub);
        const r = await this._fetch('/register', { subscription: fresh.toJSON(), label: this._label() }, key);
        if (r.ok) {
          await DB.setSetting('pushVapid', vapid);
          await DB.setSetting('pushDevice', { endpoint: fresh.endpoint, label: this._label(), at: Date.now() });
        }
      } catch (e) { console.warn('알림 기기 확인 실패 (무시):', e); }
    },
    // 반드시 버튼 누름에서 바로 부른다 — 아이폰은 사용자가 누른 직후에만 알림 권한을 물을 수 있다
    // 반환: { ok, message }
    async enableThisDevice() {
      if (!this.supported()) return { ok: false, message: '이 기기에서는 쓸 수 없어요. 아이폰은 홈 화면에 추가한 앱에서만 됩니다(iOS 16.4 이상).' };
      let perm;
      try { perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); } catch (_) { perm = 'denied'; }
      if (perm !== 'granted') return { ok: false, message: '알림 권한이 꺼져 있어요. 아이폰 설정 › 알림 › 펫살롱에서 허용해 주세요.' };
      try {
        let key = await DB.getSetting('pushKey');
        if (!key) { key = this._newKey(); await DB.setSetting('pushKey', key); }
        const st = await this._fetch('/status');
        const vapid = st.json && st.json.vapid;
        if (!vapid) return { ok: false, message: '알림 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.' };
        const storedVapid = await DB.getSetting('pushVapid');
        const sub = await this._subscribe(vapid, !!storedVapid && storedVapid !== vapid);
        const r = await this._fetch('/register', { subscription: sub.toJSON(), label: this._label() }, key);
        if (r.status === 401) return { ok: false, message: '다른 기기에서 만든 알림 열쇠와 맞지 않아요. 동기화가 끝난 뒤 다시 눌러 주세요.' };
        if (!r.ok) return { ok: false, message: '기기 등록에 실패했어요 (' + r.status + '). 잠시 뒤 다시 눌러 주세요.' };
        await DB.setSetting('pushVapid', vapid);
        await DB.setSetting('pushDevice', { endpoint: sub.endpoint, label: this._label(), at: Date.now() });
        this.scheduleUpload(true);
        return { ok: true, message: '이 기기에서 예약 알림을 받아요.' };
      } catch (e) {
        return { ok: false, message: '켜는 중 오류: ' + (e && e.message ? e.message : e) };
      }
    },
    async disableThisDevice() {
      try {
        const key = await DB.getSetting('pushKey');
        let endpoint = null;
        if (this.supported()) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) { endpoint = sub.endpoint; try { await sub.unsubscribe(); } catch (_) {} }
        }
        if (!endpoint) endpoint = ((await DB.getSetting('pushDevice')) || {}).endpoint || null;
        if (key && endpoint) { try { await this._fetch('/unregister', { endpoint }, key); } catch (_) {} }
      } catch (e) { console.warn('알림 끄기 오류 (무시):', e); }
      await DB.setSetting('pushDevice', null);
      await DB.setSetting('pushVapid', null);
      return { ok: true, message: '이 기기 알림을 껐어요.' };
    },
    async sendTest() {
      try {
        const key = await DB.getSetting('pushKey');
        const reg = this.supported() ? await navigator.serviceWorker.ready : null;
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!key || !sub) return { ok: false, message: '이 기기 알림이 꺼져 있어요. 먼저 [이 기기에서 알림 받기]를 눌러 주세요.' };
        const r = await this._fetch('/test', { endpoint: sub.endpoint }, key);
        return r.ok ? { ok: true, message: '시험 알림을 보냈어요. 몇 초 안에 와야 해요 (앱을 닫아 두어도 와요).' }
          : { ok: false, message: '시험 알림 보내기 실패 (' + r.status + ')' };
      } catch (e) { return { ok: false, message: '시험 중 오류: ' + (e && e.message ? e.message : e) }; }
    },
    // 설정 화면 한 줄용: { supported, on, devices, lastSent }
    async status() {
      const out = { supported: this.supported(), on: false, devices: null, lastSent: null };
      try {
        const marker = await DB.getSetting('pushDevice');
        out.on = !!marker && out.supported && Notification.permission === 'granted';
        const key = await DB.getSetting('pushKey');
        if (key && navigator.onLine !== false) {
          const r = await this._fetch('/status', undefined, key);
          if (r.ok && r.json) { out.devices = r.json.devices ?? null; out.lastSent = r.json.lastSent || null; }
        }
      } catch (_) {}
      return out;
    },
    // DB 훅: 이 기기에서 쓴 것 중 알림에 영향 주는 것만
    onLocalWrite(storeName, id, data) {
      if (storeName === 'appointments' || storeName === 'pets') this.scheduleUpload();
      else if (storeName === 'settings' && ((data && data.key) || id) === 'notifMinutes') this.scheduleUpload();
    }
  },

  // ========== 찾기 공통: 검색어 맞추기 ==========
  // searchMatch(대상, 검색어) — 화면 없이 쓰는 순수 함수 (전체 찾기·고객/반려견/기록/예약 목록 검색 공용)
  //  · 대소문자 무시, 띄어 쓴 낱말은 모두 맞아야 한다 (AND)
  //  · 초성만 친 낱말(ㅊㅋ)은 글자의 첫소리로 맞춘다 — 'ㅊㅋ' → 초코, 'ㅂㄷㅈ' → 박도준
  //  · 숫자 낱말은 하이픈·점을 빼고 맞춘다 — '4444', '010-1234' → 010-1234-4444 (띄어 친 '010 1234'는 낱말 두 개로 AND)
  //  대상은 문자열 또는 문자열 배열 (null 은 건너뜀)
  _CHOSUNG: ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'],
  toChosung(str) {
    let out = '';
    for (const ch of String(str || '')) {
      const c = ch.charCodeAt(0);
      out += (c >= 0xAC00 && c <= 0xD7A3) ? this._CHOSUNG[Math.floor((c - 0xAC00) / 588)] : ch;
    }
    return out;
  },
  searchMatch(haystack, query) {
    const tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const text = (Array.isArray(haystack) ? haystack.filter(v => v != null && v !== '').join('\n') : String(haystack == null ? '' : haystack)).toLowerCase();
    let cho = null, digitsText = null;
    return tokens.every(t => {
      if (text.includes(t)) return true;
      if (/^[ㄱ-ㅎ]+$/.test(t)) {
        if (cho === null) cho = this.toChosung(text);
        return cho.includes(t);
      }
      if (/\d/.test(t) && /^[\d\s\-.()+]+$/.test(t)) {
        const d = t.replace(/\D/g, '');
        if (!d) return false;
        // 숫자 사이의 하이픈·점만 지운다 (배열 항목은 줄바꿈으로 이어 서로 붙지 않게)
        // 띄어쓰기는 잇지 않는다 — 목록 검색은 칸들을 띄어쓰기로 이어 붙여서 '전화 뒷자리 + 메모 숫자'가 붙어 맞았다
        if (digitsText === null) digitsText = text.replace(/(\d)[\-.]+(?=\d)/g, '$1');
        return digitsText.includes(d);
      }
      return false;
    });
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
    // 폰: 화면 맨 위 오른쪽 돋보기 (데스크톱 떠 있는 버튼은 폰에서 숨김)
    document.getElementById('mobile-search-btn')?.addEventListener('click', () => this.openSearch());
    // 컴퓨터·태블릿: 왼쪽 메뉴 맨 위 '찾기' (href="#" 이라 주소가 바뀌지 않게 막는다)
    document.getElementById('sidebar-search-btn')?.addEventListener('click', (e) => { e.preventDefault(); this.openSearch(); });
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
      // 기록은 미리 읽지 않는다 — 고객 카드를 열 때 그 고객 기록만 읽는다 (기록 전체를 읽으면 몇 년 뒤 검색이 느려진다)
      // 오늘부터 앞으로의 예약만 (지난 예약은 읽지 않는다 — 가볍게)
      const [customers, pets, services, upcoming] = await Promise.all([
        DB.getAll('customers'),
        DB.getAllLight('pets', ['photo', 'preferredStyle']),
        DB.getAll('services'),
        DB.getByDateRange('appointments', 'date', this.getToday(), null).catch(() => [])
      ]);
      const records = [];

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

      const apptsByCustomer = {};
      (upcoming || []).filter(a => !['cancelled', 'noshow', 'completed'].includes(a.status))
        .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')))
        .forEach(a => { (apptsByCustomer[a.customerId] = apptsByCustomer[a.customerId] || []).push(a); });

      this._searchData = { customers, petsByCustomer, recordsByCustomer, serviceMap, petMap, apptsByCustomer };
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

    const { customers, petsByCustomer, apptsByCustomer } = this._searchData;
    // 이름·전화·반려견 이름·품종을 한데 묶어 맞춘다 (초성·전화 뒷자리·띄어 쓴 여러 낱말 — searchMatch)
    const matched = customers.filter(c => this.searchMatch(
      [c.name, c.phone, ...(petsByCustomer[c.id] || []).flatMap(p => [p.name, p.breed])], query));

    if (matched.length === 0) {
      resultsContainer.innerHTML = `
        <div class="gs-no-results">
          <div class="gs-no-results-icon">${this.icon('search', 'ico-xl')}</div>
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

    // Multiple results - show list (맞은 손님의 다가오는 예약을 맨 위에 — 누르면 그 예약이 열린다)
    const apptRows = matched.flatMap(c => (apptsByCustomer?.[c.id] || []).map(a => ({ a, c })))
      .sort((x, y) => ((x.a.date || '') + (x.a.time || '')).localeCompare((y.a.date || '') + (y.a.time || '')))
      .slice(0, 5);
    resultsContainer.innerHTML = (apptRows.length ? `<div class="gs-section-label">${this.icon('calendar')} 다가오는 예약</div>` +
      apptRows.map(({ a, c }) => this._searchApptRow(a, c)).join('') +
      `<div class="gs-section-label">${this.icon('users')} 고객</div>` : '') + matched.slice(0, 20).map(c => {
      const cPets = petsByCustomer[c.id] || [];
      const petNames = cPets.map(p => p.name).join(', ');
      const label = App.getCustomerLabel(c, cPets);
      const initial = label.charAt(0);
      return `
        <div class="gs-result-item" tabindex="0" data-customer-id="${c.id}">
          <div class="gs-result-avatar">${this.escapeHtml(initial)}</div>
          <div class="gs-result-info" style="flex:1">
            <div class="gs-result-name">${this.escapeHtml(label)}</div>
            <div class="gs-result-phone">${this.formatPhoneHtml(c.phone)}</div>
            ${petNames ? `<div class="gs-result-pets">${this.escapeHtml(petNames)}</div>` : ''}
          </div>
          <button class="btn-icon" onclick="event.stopPropagation();App.closeSearch();setTimeout(()=>App.pages.appointments.showForm(null,${c.id}),150)" title="예약" style="color:var(--primary);font-size:1.1rem;flex-shrink:0">${this.icon('calendar')}</button>
          <div class="gs-result-arrow">${this.icon('chevron-right')}</div>
        </div>`;
    }).join('');

    this._bindSearchApptRows(resultsContainer);
    // Click handler for result items
    resultsContainer.querySelectorAll('.gs-result-item[data-customer-id]').forEach(item => {
      item.addEventListener('click', () => {
        const cid = Number(item.dataset.customerId);
        const customer = matched.find(c => c.id === cid);
        if (customer) {
          this._renderSearchCard(resultsContainer, customer);
        }
      });
    });
  },

  // 찾기 결과의 예약 한 줄 — '11/7(금) 14:00 · 초코 · 전체미용'
  _searchApptRow(a, c) {
    const pet = this._searchData?.petMap?.[a.petId];
    const svc = this.apptServiceNames ? this.apptServiceNames(a, this._searchData?.serviceMap || {}) : '';
    const when = (a.date === this.getToday() ? '오늘' : this.formatDate(a.date)) + (a.time ? ' ' + a.time : '');
    const who = pet ? pet.name : this.getCustomerLabel(c, this._searchData?.petsByCustomer?.[c.id] || []);
    return `
      <div class="gs-result-item gs-appt-row" tabindex="0" role="button" data-appt-id="${a.id}">
        <div class="gs-result-avatar">${this.icon('calendar')}</div>
        <div class="gs-result-info" style="flex:1">
          <div class="gs-result-name">${this.escapeHtml(when)} · ${this.escapeHtml(who)}</div>
          ${svc && svc !== '-' ? `<div class="gs-result-pets">${this.escapeHtml(svc)}</div>` : ''}
        </div>
        <div class="gs-result-arrow">${this.icon('chevron-right')}</div>
      </div>`;
  },
  _bindSearchApptRows(container) {
    container.querySelectorAll('.gs-appt-row').forEach(row => {
      const open = () => {
        const id = Number(row.dataset.apptId);
        this.closeSearch();
        // closeSearch 의 history.back() 이 끝난 뒤 연다
        setTimeout(() => this.pages.appointments?.showForm(id), 150);
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  },

  _renderSearchCard(container, customer) {
    const sd = this._searchData;
    if (sd) sd._cardFor = customer.id;
    if (sd && !(sd._loadedRecords || (sd._loadedRecords = new Set())).has(customer.id)) {
      sd._loadedRecords.add(customer.id);
      DB.getByIndex('records', 'customerId', customer.id).then(rs => {
        if (this._searchData !== sd) return;
        sd.recordsByCustomer[customer.id] = rs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (container.isConnected && sd._cardFor === customer.id) this._renderSearchCard(container, customer);
      }).catch(() => { sd._loadedRecords.delete(customer.id); });
    }
    const { petsByCustomer, recordsByCustomer, serviceMap, petMap } = this._searchData;
    const cPets = petsByCustomer[customer.id] || [];
    const cRecords = recordsByCustomer[customer.id] || [];
    const recentRecords = cRecords.slice(0, 3);

    // Calculate unpaid balance
    const unpaidRecords = cRecords.filter(r => r.paymentMethod === 'unpaid');
    const unpaidBalance = unpaidRecords.reduce((sum, r) => sum + App.getUnpaidAmount(r), 0);

    const phoneClean = this.phoneDigits(customer.phone);

    // Build pets HTML
    let petsHtml = '';
    if (cPets.length > 0) {
      petsHtml = `
        <div class="gs-card-section">
          <div class="gs-card-section-title">${this.icon('paw')} 반려견</div>
          ${cPets.map(p => {
            const hasPhoto = p.photoThumb || p.photo;
            const photoHtml = hasPhoto
              ? `<img src="${this.escapeHtml(p.photoThumb || p.photo)}" alt="${this.escapeHtml(p.name)}">`
              : this.icon('paw', 'ico-lg');
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
          <div class="gs-card-section-title">${this.icon('scissors')} 최근 미용 기록</div>
          ${recentRecords.map(r => {
            // 요즘 기록은 메뉴 이름이 r.service·addons 에 있다 (serviceIds 만 보면 '콩이 | -' 로 나왔다)
            const shown = this.getRecordServiceDisplay(r, serviceMap);
            const sNames = shown && shown !== '-' ? shown : '';
            const pet = petMap[r.petId];
            const petLabel = pet ? pet.name + (sNames ? ' | ' : '') : '';
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
            <span class="gs-unpaid-label">${this.icon('coins')} 미결제</span>
            <span class="gs-unpaid-amount">${this.formatCurrency(unpaidBalance)}</span>
          </div>
        </div>`;
    } else {
      unpaidHtml = `
        <div class="gs-card-section">
          <div style="display:flex;align-items:center;gap:6px;font-size:0.93rem;color:var(--success);font-weight:600">
            ${this.icon('coins')} 미결제: 0원
          </div>
        </div>`;
    }

    // 다가오는 예약 (있을 때만)
    const cAppts = (this._searchData.apptsByCustomer?.[customer.id] || []).slice(0, 3);
    const apptsHtml = cAppts.length ? `
        <div class="gs-card-section">
          <div class="gs-card-section-title">${this.icon('calendar')} 다가오는 예약</div>
          ${cAppts.map(a => this._searchApptRow(a, customer)).join('')}
        </div>` : '';

    // Memo section
    let memoHtml = '';
    if (customer.memo) {
      memoHtml = `
        <div class="gs-card-section">
          <div class="gs-card-section-title">${this.icon('note')} 메모</div>
          <div class="gs-memo">${this.escapeHtml(customer.memo)}</div>
        </div>`;
    }

    // Show back link if there might be multiple results
    const showBack = document.getElementById('global-search-input')?.value.trim();

    container.innerHTML = `
      <div class="gs-customer-card">
        ${showBack ? `<button class="gs-back-link" id="gs-back-btn">${this.icon('arrow-left')} 검색 결과로 돌아가기</button>` : ''}
        <div class="gs-card-header">
          <span class="gs-card-name">${this.escapeHtml(App.getCustomerLabel(customer, cPets))}${this.pages.customers.getTagBadges(customer.tags)}</span>
          <a href="tel:${this.escapeHtml(phoneClean)}" class="gs-card-phone">${this.formatPhoneHtml(customer.phone)}</a>
        </div>
        <div class="gs-card-body">
          ${apptsHtml}
          ${petsHtml}
          ${recordsHtml}
          ${unpaidHtml}
          ${memoHtml}
          <div class="gs-card-actions">
            <a href="tel:${this.escapeHtml(phoneClean)}" class="gs-action-btn">
              <span class="gs-action-btn-icon">${this.icon('phone')}</span>
              <span>전화</span>
            </a>
            <a href="sms:${this.escapeHtml(phoneClean)}" class="gs-action-btn">
              <span class="gs-action-btn-icon">${this.icon('message')}</span>
              <span>문자</span>
            </a>
            ${cPets.length > 1 ? cPets.map(p =>
              `<button class="gs-action-btn gs-appt-pet" data-customer-id="${customer.id}" data-pet-id="${p.id}">
                <span class="gs-action-btn-icon">${this.icon('calendar')}</span>
                <span>${App.escapeHtml(p.name)}</span>
              </button>`
            ).join('') : `<button class="gs-action-btn" id="gs-action-appt" data-customer-id="${customer.id}">
              <span class="gs-action-btn-icon">${this.icon('calendar')}</span>
              <span>예약</span>
            </button>`}
            <button class="gs-action-btn" id="gs-action-record" data-customer-id="${customer.id}">
              <span class="gs-action-btn-icon">${this.icon('scissors')}</span>
              <span>미용기록</span>
            </button>
            <button class="gs-action-btn" id="gs-action-detail" data-customer-id="${customer.id}">
              <span class="gs-action-btn-icon">${this.icon('receipt')}</span>
              <span>상세</span>
            </button>
          </div>
        </div>
      </div>`;

    this._bindSearchApptRows(container);
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
      // closeSearch 의 history.back() 이 끝난 뒤 이동 — 바로 바꾸면 뒤로가기가 이동을 되돌렸다
      setTimeout(() => this.navigate('customers/' + customer.id), 150);
    });
  },

  // 홈 화면 상단 '데이터 보호' 알림 — 동기화가 켜져 있으면 고객·예약·기록은 클라우드에 있으므로
  // 백업 경고 대신 (1) 동기화가 며칠째 안 될 때만 경고, (2) 이 기기에만 있는 미용 사진은 한 달에 한 번 가볍게 권한다.
  // 반환: null | { kind: 'sync', days } | { kind: 'photo', days } | { kind: 'backup', days, urgent }
  async getDataSafetyNotice() {
    const lastBackup = await DB.getSetting('lastBackupDate');
    const backupDays = lastBackup ? this.getDaysAgo(lastBackup) : null;
    // 앱 시작 직후엔 Sync.init 이 아직 설정을 읽기 전일 수 있어 저장된 설정을 직접 본다
    const syncSetting = await DB.getSetting('sync');
    if (syncSetting && syncSetting.enabled) {
      const lastSyncAt = (typeof Sync !== 'undefined' && Sync._lastSyncAt) || syncSetting.lastSyncAt || null;
      const syncDays = lastSyncAt ? Math.floor((Date.now() - lastSyncAt) / 864e5) : null;
      if (syncDays === null || syncDays >= 3) return { kind: 'sync', days: syncDays };
      let snoozed = false;
      try { snoozed = Number(localStorage.getItem('photoBackupSnoozeUntil') || 0) > Date.now(); } catch (_) {}
      if (!snoozed && (backupDays === null || backupDays >= 30) && await DB.count('photos').catch(() => 0) > 0) {
        return { kind: 'photo', days: backupDays };
      }
      return null;
    }
    if (!(await this.checkBackup())) return null;
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return { kind: 'backup', days: backupDays, urgent: backupDays !== null && backupDays >= (isIOS ? 7 : 14) };
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
      appointment: '[{매장명}] {고객명}님, {날짜} {시간}에 {반려견명} 예약이 확인되었습니다. {담당}문의: {전화번호}',
      reminder: '[{매장명}] {고객명}님, {시점} {날짜} {시간}에 {반려견명} 미용 예약이 있습니다. 변경/취소는 {전화번호}로 연락 부탁드립니다.',
      birthday: '[{매장명}] {고객명}님! {반려견명}의 생일을 축하합니다! 🎂 생일 기념 특별 할인을 준비했어요. 문의: {전화번호}',
      complete: '[{매장명}] {고객명}님, {반려견명}의 미용이 완료되었습니다! 서비스: {서비스}, 금액: {금액}원. 감사합니다! 💕',
      cardSend: '[{매장명}] {고객명}님, 오늘 {반려견명} 미용 사진이에요! 예쁘게 다녀갔어요. 감사합니다 ♥',
      unpaid: '[{매장명}] {고객명}님 안녕하세요. {날짜} {반려견명} 미용 금액 {금액}원이 아직 결제되지 않아 안내드려요. 편하실 때 결제 부탁드립니다. 감사합니다. 문의: {전화번호}'
    };
    // 기본 문구는 설정 화면의 DEFAULT_SMS_TEMPLATES 를 먼저 쓴다 (여기만 빠져 리포트 문구가 비어 나가던 문제)
    const shared = typeof DEFAULT_SMS_TEMPLATES !== 'undefined' ? DEFAULT_SMS_TEMPLATES : {};
    return (templates && templates[type]) || shared[type] || defaults[type] || '';
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

  // ========== 기록 사진 보관 (반려견별 최근 N회) ==========
  // 기록 사진은 "지난번에 어떻게 깎았나" 확인용이라 반려견마다 최근 몇 회만 남긴다.
  // 횟수는 설정 recordPhotoKeep (기본 3, 0 = 전부 보관) — 동기화되는 설정이라 폰·데스크탑이 같은 기준으로 정리한다.
  RECORD_PHOTO_FIELDS: ['photoBefore', 'photoAfter'],
  RECORD_PHOTO_KEEP_DEFAULT: 3,
  async getRecordPhotoKeep() {
    const v = await DB.getSetting('recordPhotoKeep');
    return (v === null || v === undefined || v === '') ? this.RECORD_PHOTO_KEEP_DEFAULT : (Number(v) || 0);
  },
  _recordHasPhoto(r) {
    return !!(r.photoBeforeId || r.photoAfterId || r.photo3Id || r.photo4Id);
  },
  // 한 반려견의 사진 있는 기록을 날짜순으로 보고 N회를 넘는 기록의 사진만 지운다 (글 기록은 그대로). 지운 사진 수를 돌려준다.
  async migrateInlinePhotos() {
    if (DB.mode === 'server' || !DB.optimizeStorage) return;
    if (await DB.getSetting('inlinePhotosMigratedAt')) return;
    const { migratedCount } = await DB.optimizeStorage();
    await DB.setSetting('inlinePhotosMigratedAt', Date.now());
    if (migratedCount > 0) this.showToast(`예전 방식으로 저장된 사진 ${migratedCount}장을 정리했어요. 이제 반려견 상세에서 보입니다.`, 'info', { duration: 6000 });
  },

  async pruneRecordPhotos(petId, exceptId) {
    if (!petId) return 0;
    const keep = await this.getRecordPhotoKeep();
    if (!keep) return 0;
    const recs = (await DB.getByIndex('records', 'petId', Number(petId)))
      .filter(r => this._recordHasPhoto(r))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));
    let n = 0;
    for (const r of recs.slice(keep)) {
      if (exceptId != null && Number(r.id) === Number(exceptId)) continue; // 방금 저장한 기록(지난 날짜라도)의 사진은 지우지 않는다
      for (const f of ['photoBeforeId', 'photoAfterId', 'photo3Id', 'photo4Id']) {
        if (!r[f]) continue;
        await DB.deletePhoto(r[f]).catch(() => {});
        r[f] = null;
        n++;
      }
      delete r._photoFromSync;
      r._photoSetAt = { photoBefore: Date.now(), photoAfter: Date.now() }; // 지운 시각 — 늦게 오는 옛 사진이 되살아나지 않게
      // 본문은 안 바뀌었으니 수정 시각을 올리지 않는다 (올리면 기록 전체가 다시 전송돼 다른 기기의 편집을 덮을 수 있다)
      if (typeof Sync !== 'undefined' && Sync._putRaw) { await Sync._putRaw('records', r); Sync.queueRecordPhotoChanges(r); }
      else await DB.update('records', r);
    }
    return n;
  },
  async pruneAllRecordPhotos() {
    const recs = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'photo3', 'photo4', 'memo']);
    const pets = new Set(recs.filter(r => this._recordHasPhoto(r)).map(r => r.petId).filter(Boolean));
    let n = 0;
    for (const petId of pets) n += await this.pruneRecordPhotos(petId);
    return n;
  },
  // 기록의 사진을 dataURL 로 (photos 스토어 또는 옛 인라인 값)
  async getRecordPhoto(record, field) {
    if (!record) return null;
    if (record[field] && typeof record[field] === 'string' && record[field].startsWith('data:')) return record[field];
    return record[field + 'Id'] ? await DB.getPhoto(record[field + 'Id']).catch(() => null) : null;
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
    const reviewLink = await DB.getSetting('shopReviewLink') || '';
    const allVars = {
      '매장명': shopName,
      '전화번호': shopPhone,
      '리뷰링크': reviewLink,
      ...vars
    };
    return this.fillSmsTemplate(tpl, allVars);
  },

  // 템플릿 채우기 (설정 화면 미리보기와 실제 발송이 같은 규칙을 쓴다)
  fillSmsTemplate(tpl, vars) {
    let out = String(tpl || '');
    const v = { ...vars };
    // 고객명 빈 값 폴백
    if (!v['고객명']) v['고객명'] = '보호자';
    for (const [key, val] of Object.entries(v)) {
      out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), () => String(val || '')); // 함수로 넣어 값 속 '$' 가 특수문자로 해석되지 않게
    }
    // 호출처가 넘기지 않은 변수({시점}, {담당} 등)는 손님에게 그대로 보이면 안 된다 → 제거 후 공백 정리
    return out.replace(/\{[^{}]{1,12}\}/g, '').replace(/[ \t]{2,}/g, ' ').replace(/ ([.,!?])/g, '$1')
      // 매장 전화번호를 안 넣었으면 '문의:' 만 덩그러니 남는다 → 줄째 지운다
      .replace(/[ \t]*\(?문의\s*[:：]\s*\)?[ \t]*(?=\n|$)/g, '').trim();
  },

  // SMS URI 생성 유틸리티
  getSmsSep() {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.maxTouchPoints > 0 && /Macintosh/.test(ua));
    return isIOS ? '&' : '?';
  },

  getSmsUrl(phone, body) {
    const cleanPhone = this.phoneDigits(phone);
    if (!cleanPhone) return '';
    if (!body) return `sms:${cleanPhone}`;
    return `sms:${cleanPhone}${this.getSmsSep()}body=${encodeURIComponent(body)}`;
  },

  openSms(phone, body) {
    const url = this.getSmsUrl(phone, body);
    if (url) window.open(url, '_self');
  }
};
