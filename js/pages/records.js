// ========== Grooming Records Page ==========
App.pages.records = {
  async render(container) {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const today = App.getToday();

    // ========== 활동 로그 + 더 보기 패턴 ==========
    // 기본: 최근 90일 인덱스 쿼리. "더 보기"로 이전 90일씩 확장.
    // 펫살롱 사용 패턴(60% 최근, 25% 엔티티 페이지에서, 10% 필터, 5% CSV)에 최적화.
    const totalCount = await DB.count('records');

    let savedFilter = {};
    try { savedFilter = JSON.parse(sessionStorage.getItem('record-filter') || '{}'); } catch (_) {}

    const loadMode = savedFilter._loadMode || 'recent'; // 'recent' | 'month-jump' | 'unpaid'
    const daysBack = Math.max(90, savedFilter._daysBack || 90);
    const jumpMonth = savedFilter._jumpMonth || '';

    let records, modeLabel;
    if (loadMode === 'month-jump' && jumpMonth) {
      // 특정 월로 점프 (해당 월만 로드, applyFilters 와 일관성)
      const loadFrom = `${jumpMonth}-01`;
      const loadTo = `${jumpMonth}-31`;
      records = await DB.getByDateRange('records', 'date', loadFrom, loadTo);
      modeLabel = `${jumpMonth}`;
    } else if (loadMode === 'unpaid') {
      // 미결제 전체 기간 (paymentMethod 인덱스 활용)
      records = await DB.getByIndex('records', 'paymentMethod', 'unpaid');
      modeLabel = '미결제 전체';
    } else {
      // 기본 모드: 최근 daysBack일 (인덱스 쿼리)
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - daysBack);
      const loadFrom = App.formatLocalDate(fromDate);
      records = await DB.getByDateRange('records', 'date', loadFrom, today);
      modeLabel = daysBack >= 365 ? `최근 ${Math.round(daysBack / 365)}년` : `최근 ${daysBack}일`;
    }

    // 사진 인라인 필드 제거 (구버전 데이터 호환, 메모리 절약)
    records.forEach(r => { delete r.photoBefore; delete r.photoAfter; });

    // 페이지 상태 저장 (init 핸들러에서 참조)
    this._loadMode = loadMode;
    this._daysBack = daysBack;
    this._jumpMonth = jumpMonth;
    this._totalCount = totalCount;
    this._canLoadMore = (loadMode === 'recent') && (records.length < totalCount);

    const sorted = records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    // 날짜별 그룹 라벨 및 집계 (오늘/어제/이번 주/월별)
    const todayStr = App.getToday();
    const _y = new Date(); _y.setDate(_y.getDate() - 1);
    const yesterdayStr = App.formatLocalDate(_y);
    const _w = new Date(); _w.setDate(_w.getDate() - 7);
    const weekAgoStr = App.formatLocalDate(_w);
    // 미결제였다가 나중에 받은 기록: 결제수단 옆에 수금일을 작게 표시
    const paidNote = (r) => {
      if (!r.paidAt || r.paidAt === r.date || r.paymentMethod === 'unpaid') return '';
      const [, pm, pd] = String(r.paidAt).slice(0, 10).split('-');
      if (!pm || !pd) return '';
      return ` <span style="font-size:0.72rem;color:var(--text-muted)">수금 ${Number(pm)}/${Number(pd)}</span>`;
    };
    const getGroupLabel = (date) => {
      if (!date) return '날짜 없음';
      if (date === todayStr) return '오늘';
      if (date === yesterdayStr) return '어제';
      if (date >= weekAgoStr) return '이번 주';
      const [yy, mm] = date.split('-');
      return `${yy}년 ${Number(mm)}월`;
    };
    const groupCounts = {};
    sorted.forEach(r => {
      const lbl = getGroupLabel(r.date);
      groupCounts[lbl] = (groupCounts[lbl] || 0) + 1;
    });

    const [customers, pets, services] = await Promise.all([
      DB.getAllLight('customers', ['memo', 'address']),
      DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle']),
      DB.getAll('services')
    ]);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s.name);

    // 미수금 경고 카드용 집계 (렌더에서 실제 사용하는 값만)
    const unpaidRecs = records.filter(r => r.paymentMethod === 'unpaid');
    const unpaidTotal = unpaidRecs.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 빈 상태 메시지 (모드별)
    const emptyMessage = loadMode === 'unpaid'
      ? App.icon('party') + ' 미결제 기록이 없습니다'
      : (loadMode === 'month-jump'
        ? `${jumpMonth} 에 미용 기록이 없습니다`
        : `최근 ${daysBack}일간 미용 기록이 없습니다${totalCount > 0 ? ' (더 보기 또는 월 점프)' : ''}`);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">미용 기록</h1>
          <p class="page-subtitle">총 ${totalCount.toLocaleString('ko-KR')}건 <span style="color:var(--text-muted);font-weight:400">· ${modeLabel} ${records.length.toLocaleString('ko-KR')}건</span></p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-record">+ 새 기록</button>
        </div>
      </div>

      ${unpaidRecs.length > 0 ? `
      <div id="unpaid-warning-card" class="card" style="margin-bottom:16px;border:1.5px solid var(--danger);cursor:pointer">
        <div class="card-body" style="padding:16px 20px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,var(--danger-light),var(--danger-bg-soft))">
          <span style="font-size:1.5rem">${App.icon('cash')}</span>
          <div class="flex-1">
            <div style="font-weight:800;color:var(--danger);font-size:1rem">미수금 경고</div>
            <div style="font-size:0.88rem;color:var(--danger-text-strong);margin-top:2px">총 ${unpaidRecs.length}건 &middot; ${App.formatCurrency(unpaidTotal)}</div>
          </div>
          <span style="color:var(--danger);font-weight:600;font-size:0.85rem">클릭하여 필터 &rarr;</span>
        </div>
      </div>
      ` : ''}

      <div class="filter-bar">
        <div class="search-box" style="max-width:none">
          <span class="search-icon">${App.icon('search')}</span>
          <input type="text" id="record-search" placeholder="고객, 반려견, 서비스, 메모 검색..." style="min-height:40px">
        </div>
        <div class="filter-bar-row">
          <input type="month" id="filter-month" value="${jumpMonth}" placeholder="월 점프" style="flex:1;min-height:44px">
          <select id="filter-payment" style="flex:1;min-height:44px">
            <option value="">전체 결제</option>
            <option value="cash">현금</option>
            <option value="card">카드</option>
            <option value="transfer">이체</option>
            <option value="unpaid">미결제</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="btn-clear-filter" style="flex:0 0 auto;min-height:44px;white-space:nowrap">초기화</button>
        </div>
      </div>

      <div id="record-filter-total" style="display:none;padding:12px 16px;margin-bottom:12px;background:var(--bg);border-radius:var(--radius);font-size:0.9rem;font-weight:600;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center"></div>

      <div class="card">
        <div class="card-body no-padding">
          ${isMobile ? '' : `<div class="table-container">
            <table class="data-table" id="record-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>반려견 / 보호자</th>
                  <th class="hide-mobile">서비스</th>
                  <th>금액</th>
                  <th class="hide-mobile">담당</th>
                  <th class="hide-mobile">결제</th>
                  <th class="hide-mobile">메모</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody id="record-tbody">
                ${sorted.length === 0 ? `
                  <tr><td colspan="8">
                    <div class="empty-state">
                      <div class="empty-state-icon">${App.icon('scissors', 'ico-xl')}</div>
                      <div class="empty-state-text">${emptyMessage}</div>
                    </div>
                  </td></tr>
                ` : (() => { let _lastG = null; return sorted.map(r => {
                  const customer = customerMap[r.customerId];
                  const pet = petMap[r.petId];
                  const serviceNames = App.getRecordServiceDisplay(r, serviceMap);
                  const gLabel = getGroupLabel(r.date);
                  let hdr = '';
                  if (gLabel !== _lastG) {
                    hdr = `<tr class="record-group-header-row" data-group="${gLabel}"><td colspan="8" class="record-group-header-cell">${gLabel} <span style="color:var(--text-muted);font-weight:400;margin-left:6px">(${groupCounts[gLabel]}건)</span></td></tr>`;
                    _lastG = gLabel;
                  }
                  return hdr + `
                    <tr data-id="${r.id}" data-month="${(r.date || '').slice(0, 7)}" data-group="${gLabel}"
                        data-search="${App.escapeHtml(((customer?.name || '') + ' ' + (pet?.name || '') + ' ' + (customer?.phone || '') + ' ' + (r.service || '') + ' ' + (r.style || '') + ' ' + (r.memo || '') + ' ' + (r.groomer || '')).toLowerCase())}"
                        data-payment="${r.paymentMethod || ''}"
                        data-amount="${App.getRecordAmount(r)}"
                        style="${r.paymentMethod === 'unpaid' ? 'background:var(--warning-light);border-left:3px solid var(--danger)' : ''}">
                      <td>${App.formatDate(r.date)}</td>
                      <td><a href="#pets/${r.petId}" style="color:var(--primary);font-weight:700" onclick="event.stopPropagation()">${App.escapeHtml(pet?.name || '-')}</a> <span style="color:var(--text-muted);font-size:0.75rem">${App.escapeHtml(App.getCustomerLabel(customer))}</span></td>
                      <td class="hide-mobile"><span style="font-size:0.85rem">${App.escapeHtml(serviceNames)}</span></td>
                      <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong>${r.discount || r.extraCharge ? `<div style="font-size:0.7rem;color:var(--text-muted)">${r.discount ? '-' + App.formatCurrency(r.discount) : ''}${r.extraCharge ? '+' + App.formatCurrency(r.extraCharge) : ''}</div>` : ''}</td>
                      <td class="hide-mobile">${App.escapeHtml(r.groomer || '-')}</td>
                      <td class="hide-mobile">${this.getPaymentLabel(r.paymentMethod)}${paidNote(r)}</td>
                      <td class="hide-mobile" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(r.memo || '')}">
                        ${App.escapeHtml(r.memo || '-')}
                      </td>
                      <td class="table-actions">
                        <button class="btn-icon btn-report-record" data-id="${r.id}" title="미용 리포트" aria-label="미용 리포트" style="color:var(--info)">${App.icon('image')}</button>
                        <button class="btn-icon btn-receipt-record" data-id="${r.id}" title="영수증" aria-label="영수증" style="color:var(--success)">${App.icon('receipt')}</button>
                        <button class="btn-icon btn-edit-record" data-id="${r.id}" title="수정" aria-label="수정">${App.icon('edit')}</button>
                      </td>
                    </tr>`;
                }).join(''); })()}
              </tbody>
            </table>
          </div>`}

          <!-- Mobile Card List (모바일 뷰포트에서만 렌더) -->
          ${!isMobile ? '' : `<div class="mobile-card-list" id="record-card-list" style="display:block">
            ${sorted.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">${App.icon('scissors', 'ico-xl')}</div>
                <div class="empty-state-text">${emptyMessage}</div>
              </div>
            ` : (() => { let _lastG = null; return sorted.map(r => {
              const customer = customerMap[r.customerId];
              const pet = petMap[r.petId];
              const isUnpaid = r.paymentMethod === 'unpaid';
              const svcText = App.getRecordServiceDisplay(r, serviceMap);
              const gLabel = getGroupLabel(r.date);
              let hdr = '';
              if (gLabel !== _lastG) {
                hdr = `<div class="record-group-header" data-group="${gLabel}">${gLabel}<span class="group-count">${groupCounts[gLabel]}건</span></div>`;
                _lastG = gLabel;
              }
              return hdr + `
              <div class="mobile-card${isUnpaid ? ' mobile-card-unpaid' : ''}" data-id="${r.id}" data-month="${(r.date || '').slice(0, 7)}" data-group="${gLabel}"
                   data-search="${App.escapeHtml(((customer?.name || '') + ' ' + (pet?.name || '') + ' ' + (customer?.phone || '') + ' ' + (r.service || '') + ' ' + (r.style || '') + ' ' + (r.memo || '') + ' ' + (r.groomer || '')).toLowerCase())}"
                   data-payment="${r.paymentMethod || ''}"
                   data-amount="${App.getRecordAmount(r)}">
                <div class="mobile-card-header">
                  <span class="mobile-card-date"><strong>${App.formatDate(r.date)}</strong>${r.status === 'in_progress' ? ' <span class="badge badge-warning" style="font-size:0.72rem;padding:3px 8px">진행중</span>' : ''}</span>
                  <span class="mobile-card-amount"><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></span>
                </div>
                <div class="mobile-card-body">
                  <span class="mobile-card-info">${App.icon('paw')} <strong>${App.escapeHtml(pet?.name || '-')}</strong> &middot; ${App.escapeHtml(App.getCustomerLabel(customer))}</span>
                  ${svcText && svcText !== '-' ? `<div class="mobile-card-service">${App.escapeHtml(svcText)}</div>` : ''}
                  <div class="mobile-card-meta">
                    <span>${App.icon('scissors')} ${App.escapeHtml(r.groomer || '-')}</span>
                    <span>${this.getPaymentLabel(r.paymentMethod)}${paidNote(r)}</span>
                    ${App._recordHasPhoto(r) ? `<span>${App.icon('camera')} 사진</span>` : ''}
                    ${isUnpaid ? '<span class="badge badge-danger">미결제</span>' : ''}
                  </div>
                  ${r.memo ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:6px;padding-top:6px;border-top:1px dashed var(--border-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${App.escapeHtml(r.memo)}">${App.icon('note')} ${App.escapeHtml(r.memo.length > 60 ? r.memo.slice(0, 60) + '...' : r.memo)}</div>` : ''}
                </div>
                <!-- 카드를 누르면 수정. 삭제는 수정 화면 안에서만 (목록에서 잘못 눌러 지우는 일 방지) -->
                <div class="mobile-card-actions record-card-actions">
                  <button class="btn btn-sm btn-ghost btn-report-record" data-id="${r.id}">${App.icon('image')} 리포트</button>
                  <button class="btn btn-sm btn-ghost btn-receipt-record" data-id="${r.id}">${App.icon('receipt')} 영수증</button>
                </div>
              </div>`;
            }).join(''); })()}
          </div>`}
        </div>
      </div>

      ${this._canLoadMore ? `
        <div style="margin-top:16px;padding:12px;text-align:center">
          <button class="btn btn-secondary" id="btn-load-more" style="min-height:44px;min-width:200px">
            더 오래된 기록 보기 (이전 90일)
          </button>
          <div style="margin-top:8px;font-size:0.78rem;color:var(--text-muted)">표시 ${records.length.toLocaleString('ko-KR')}건 / 총 ${totalCount.toLocaleString('ko-KR')}건</div>
        </div>
      ` : ''}
      ${(!this._canLoadMore && loadMode === 'recent' && totalCount > 0 && records.length === totalCount) ? `
        <div style="margin-top:16px;padding:12px;text-align:center;color:var(--text-muted);font-size:0.85rem">
          ${App.icon('check')} 모든 기록을 불러왔습니다 (${totalCount.toLocaleString('ko-KR')}건)
        </div>
      ` : ''}
      ${loadMode !== 'recent' ? `
        <div style="margin-top:16px;padding:12px;text-align:center">
          <button class="btn btn-secondary btn-sm" id="btn-back-to-recent" style="min-height:40px">
            &larr; 최근 기록으로 돌아가기
          </button>
        </div>
      ` : ''}

    `;
  },

  async init() {
    document.getElementById('btn-add-record')?.addEventListener('click', () => this.showForm());

    // 모드 전환 헬퍼 (sessionStorage에 저장 후 재렌더)
    const switchMode = (mode, opts = {}) => {
      const cur = (() => { try { return JSON.parse(sessionStorage.getItem('record-filter') || '{}'); } catch (_) { return {}; } })();
      const next = {
        ...cur,
        _loadMode: mode,
        _daysBack: opts.daysBack !== undefined ? opts.daysBack : (mode === 'recent' ? 90 : cur._daysBack),
        _jumpMonth: mode === 'month-jump' ? (opts.month || '') : '',
        // search/payment는 보존 (DOM 필터)
        search: document.getElementById('record-search')?.value || '',
        payment: document.getElementById('filter-payment')?.value || ''
      };
      sessionStorage.setItem('record-filter', JSON.stringify(next));
      // 스크롤 위치 보존 (load-more 시 자연스러운 UX)
      if (mode === 'recent' && opts.daysBack > 90) {
        sessionStorage.setItem('records-scroll', String(window.scrollY));
      } else {
        sessionStorage.removeItem('records-scroll');
      }
      App.handleRoute();
    };

    // 미수금 경고 카드 -> 미결제 모드 (전체 기간 paymentMethod 인덱스 쿼리)
    document.getElementById('unpaid-warning-card')?.addEventListener('click', () => {
      // 드롭다운 UI 도 unpaid 로 (사용자 인지 명확)
      const pay = document.getElementById('filter-payment');
      if (pay) pay.value = 'unpaid';
      switchMode('unpaid');
    });

    // 검색 / 결제 필터: DOM 필터 (현재 로드된 데이터에만 적용)
    const _debouncedRecFilter = App.debounce(() => this.applyFilters(), 300);
    document.getElementById('record-search')?.addEventListener('input', _debouncedRecFilter);
    document.getElementById('filter-payment')?.addEventListener('change', () => this.applyFilters());

    // 월 input: 특정 월로 점프 (해당 월 + 이전 1개월)
    document.getElementById('filter-month')?.addEventListener('change', (e) => {
      const newMonth = e.target.value || '';
      if (newMonth) {
        switchMode('month-jump', { month: newMonth });
      } else {
        switchMode('recent');
      }
    });

    // 초기화: recent 90일 모드로 복귀
    document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
      const inputs = ['record-search', 'filter-month', 'filter-payment'];
      inputs.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      sessionStorage.removeItem('record-filter');
      sessionStorage.removeItem('records-scroll');
      App.handleRoute();
    });

    // 더 보기: 90일씩 추가 로드
    document.getElementById('btn-load-more')?.addEventListener('click', () => {
      const next = (this._daysBack || 90) + 90;
      switchMode('recent', { daysBack: next });
    });

    // 최근으로 복귀 (month-jump / unpaid 모드 종료)
    document.getElementById('btn-back-to-recent')?.addEventListener('click', () => {
      switchMode('recent');
    });

    // 스크롤 위치 복원 (load-more 직후)
    const savedScroll = sessionStorage.getItem('records-scroll');
    if (savedScroll) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: Number(savedScroll), behavior: 'instant' });
        sessionStorage.removeItem('records-scroll');
      });
    }

    // Restore saved DOM filter state (search/payment) — month은 render에서 jumpMonth로 이미 세팅됨
    const savedFilter = sessionStorage.getItem('record-filter');
    if (savedFilter) {
      try {
        const f = JSON.parse(savedFilter);
        if (f.search) document.getElementById('record-search').value = f.search;
        if (f.payment) document.getElementById('filter-payment').value = f.payment;
        this.applyFilters();
      } catch (e) { /* ignore parse errors */ }
    } else {
      // 필터 없어도 전체 합계는 초기 표시
      this.applyFilters();
    }

    // 뷰포트 경계 변화 시 재렌더 (모바일↔데스크톱 전환, 한 번만 바인딩)
    if (!this._resizeBound) {
      this._resizeBound = true;
      let lastIsMobile = window.matchMedia('(max-width: 768px)').matches;
      const onResize = App.debounce(() => {
        const nowIsMobile = window.matchMedia('(max-width: 768px)').matches;
        if (nowIsMobile !== lastIsMobile) {
          lastIsMobile = nowIsMobile;
          if (location.hash.startsWith('#records')) App.handleRoute();
        }
      }, 250);
      window.addEventListener('resize', onResize);
    }

    document.querySelectorAll('.btn-report-record').forEach(btn => {
      btn.addEventListener('click', () => this.showReport(Number(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-receipt-record').forEach(btn => {
      btn.addEventListener('click', () => this.showReceipt(Number(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-edit-record').forEach(btn => {
      btn.addEventListener('click', () => this.showForm(Number(btn.dataset.id)));
    });

    document.querySelectorAll('#record-card-list .mobile-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button, a')) return;
        this.showForm(Number(card.dataset.id));
      });
    });

  },

  applyFilters() {
    const search = (document.getElementById('record-search')?.value || '').toLowerCase();
    const month = document.getElementById('filter-month')?.value || '';
    const payment = document.getElementById('filter-payment')?.value || '';

    // Save filter state to sessionStorage
    // 기존 객체에 병합: _loadMode/_daysBack/_jumpMonth를 지우면 재렌더 시 기본 90일 뷰로 되돌아간다
    let prevFilter = {};
    try { prevFilter = JSON.parse(sessionStorage.getItem('record-filter') || '{}') || {}; } catch (_) {}
    sessionStorage.setItem('record-filter', JSON.stringify({
      ...prevFilter,
      search: document.getElementById('record-search')?.value || '',
      month,
      payment
    }));

    // 뷰포트 기준 한쪽만 렌더되므로 둘 중 존재하는 쪽만 순회
    const matchFn = (el) => {
      const ms = !search || (el.dataset.search || '').toLowerCase().includes(search);
      const mm = !month || (el.dataset.month || '') === month;
      const mp = !payment || (el.dataset.payment || '') === payment;
      return ms && mm && mp;
    };

    let visibleCount = 0;
    let visibleSum = 0;
    let unpaidCount = 0;
    let unpaidSum = 0;
    const process = (els) => {
      els.forEach(el => {
        if (!el.dataset.id) return;
        const visible = matchFn(el);
        el.style.display = visible ? '' : 'none';
        if (visible) {
          const amt = Number(el.dataset.amount) || 0;
          visibleCount++;
          visibleSum += amt;
          if ((el.dataset.payment || '') === 'unpaid') {
            unpaidCount++;
            unpaidSum += amt;
          }
        }
      });
    };
    process(document.querySelectorAll('#record-tbody tr:not(.record-group-header-row)'));
    process(document.querySelectorAll('#record-card-list .mobile-card'));

    // 그룹 헤더: 해당 그룹에 보이는 항목이 없으면 숨김
    document.querySelectorAll('.record-group-header-row, .record-group-header').forEach(hdr => {
      const label = hdr.dataset.group;
      if (!label) return;
      const items = document.querySelectorAll(`[data-group="${label}"]:not(.record-group-header-row):not(.record-group-header)`);
      const anyVisible = Array.from(items).some(el => el.style.display !== 'none');
      hdr.style.display = anyVisible ? '' : 'none';
    });

    // 필터 결과 합계 바 업데이트
    const totalEl = document.getElementById('record-filter-total');
    if (totalEl) {
      if (visibleCount === 0) {
        totalEl.style.display = 'none';
      } else {
        totalEl.style.display = 'flex';
        totalEl.innerHTML = `
          <span>${visibleCount}건 · <strong>${App.formatCurrency(visibleSum)}</strong></span>
          ${unpaidCount > 0 ? `<span style="color:var(--danger);font-size:0.82rem">미결제 ${unpaidCount}건 · ${App.formatCurrency(unpaidSum)}</span>` : ''}
        `;
      }
    }
  },

  async showForm(id, fromAppointment) {
    let record = id ? await DB.get('records', id) : {};
    if (id && !record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); App.closeModal(); return; }

    this._pendingPriceFill = null;
    // 예약에서 넘어온 추가 항목의 메뉴 가격 (태그 data-price — 제거 시 정확히 빼기 위함)
    const prefillAddonPrices = {};

    // Pre-fill from appointment if provided
    if (fromAppointment && !id) {
      let serviceName = '';
      let servicePrice = 0;
      const addons = [];
      let addonPrice = 0;
      if (fromAppointment.serviceIds?.length) {
        const allSvcs = await DB.getAll('services');
        const sMap = {}; allSvcs.forEach(s => { sMap[s.id] = s; });
        const picked = fromAppointment.serviceIds.map(sid => sMap[sid] || sMap[Number(sid)]).filter(Boolean);
        // 주 서비스 = 미용 분류 중 첫 번째 (없으면 첫 번째). 나머지는 추가 항목으로.
        const main = picked.find(s => s.category === 'grooming') || picked[0];
        const apPet = fromAppointment.petId ? await DB.get('pets', Number(fromAppointment.petId)) : null;
        const apSize = App.getPetSizeType(apPet);
        if (main) {
          serviceName = App.normalizeServiceName(main.name);
          const m = await App.getMenuPrice(serviceName, apSize, allSvcs);
          servicePrice = m ? m.price : 0;
        }
        for (const s of picked) {
          if (s === main) continue;
          const nm = App.normalizeServiceName(s.name);
          if (!nm || addons.includes(nm)) continue;
          const m = await App.getMenuPrice(nm, apSize, allSvcs);
          const p = m ? m.price : 0;
          addons.push(nm);
          prefillAddonPrices[nm] = p;
          addonPrice += p;
        }
      }
      record = {
        // getPetOptions는 p.id === selectedId(엄격 비교)라 문자열 id가 오면 선택이 풀린다
        customerId: fromAppointment.customerId ? Number(fromAppointment.customerId) : undefined,
        petId: fromAppointment.petId ? Number(fromAppointment.petId) : undefined,
        date: fromAppointment.date || App.getToday(),
        groomer: fromAppointment.groomer || '',
        service: serviceName,
        servicePrice: servicePrice || undefined,
        addons,
        addonPrice: addonPrice || undefined,
        serviceIds: fromAppointment.serviceIds || [],
        memo: fromAppointment.memo || '',
        appointmentId: fromAppointment.id || null
      };
    }

    const petOptions = await App.getPetOptions(record.customerId, record.petId);

    App.showModal({
      title: id ? '미용 기록 수정' : '새 미용 기록',
      size: 'lg',
      content: `
        <!-- 필수 입력 영역 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">고객 <span class="required">*</span></label>
            <div id="record-customer-select"></div>
          </div>
          <div class="form-group">
            <label class="form-label">반려견 <span class="required">*</span></label>
            <select id="f-petId">
              <option value="">반려견 선택</option>
              ${petOptions}
            </select>
          </div>
        </div>
        <!-- 이전 미용과 같음 (단골 손님 자동 채움) -->
        <div id="f-copy-last-area" style="display:none;margin-bottom:12px">
          <button type="button" id="btn-copy-last-record" style="width:100%;padding:10px 14px;background:var(--primary-light);color:var(--primary);border:1.5px dashed var(--primary);border-radius:var(--radius);font-weight:700;cursor:pointer;font-size:0.88rem;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px">
            ${App.icon('copy')} 이전 미용과 같음 <span id="copy-last-hint" style="font-weight:500;font-size:0.78rem;opacity:0.8"></span>
          </button>
        </div>
        <div class="form-group">
          <label class="form-label">날짜 <span class="required">*</span></label>
          <input type="date" id="f-date" value="${record.date || App.getToday()}">
        </div>
        <!-- 서비스/스타일/가격 -->
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">서비스 <span class="required">*</span></label>
            <input type="text" id="f-service" value="${App.escapeHtml(record.service || (record.serviceNames ? record.serviceNames[0] || '' : ''))}" placeholder="예: 전체미용, 목욕" autocomplete="off">
            <div class="search-select-dropdown" id="service-dropdown" style="position:absolute;z-index:10;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);max-height:150px;overflow-y:auto;display:none;width:100%"></div>
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label">기본가 <span id="f-size-badge" class="badge badge-info" style="display:none;font-size:0.72rem;padding:2px 6px;vertical-align:middle"></span></label>
            <input type="number" id="f-servicePrice" value="${record.servicePrice || record.totalPrice || ''}" placeholder="0" min="0" step="1000">
            <div id="f-size-warn" style="display:none;margin-top:4px;font-size:0.75rem;color:var(--text-muted);line-height:1.4">사이즈 미지정 — 소형가 적용됨. 상세 옵션에서 사이즈를 선택하세요</div>
          </div>
        </div>
        <!-- 즉석 새 서비스 등록 (드롭다운에서 "+새 서비스 등록" 선택 시 표시) -->
        <div id="quickadd-service-form" style="display:none;background:var(--primary-light);border:1.5px solid var(--primary);border-radius:var(--radius);padding:12px;margin-bottom:12px">
          <div style="font-weight:700;font-size:0.88rem;color:var(--primary);margin-bottom:8px">${App.icon('sparkle')} 새 서비스 즉석 등록</div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label" style="font-size:0.78rem">이름</label>
            <input type="text" id="quickadd-name" placeholder="서비스 이름" maxlength="40" style="min-height:40px">
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label" style="font-size:0.78rem">분류</label>
            <div id="quickadd-category-chips" style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="payment-chip active" data-value="grooming">${App.icon('scissors')} 미용</button>
              <button type="button" class="payment-chip" data-value="addon">${App.icon('sparkle')} 추가</button>
              <button type="button" class="payment-chip" data-value="care">${App.icon('drop')} 케어</button>
            </div>
            <input type="hidden" id="quickadd-category" value="grooming">
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label class="form-label" style="font-size:0.78rem">가격 (원) <span style="color:var(--text-muted);font-weight:400">— 모든 사이즈 동일 (수정 페이지에서 사이즈별 변경 가능)</span></label>
            <input type="number" id="quickadd-price" placeholder="0" min="0" step="1000" style="min-height:40px">
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" class="btn btn-primary" id="quickadd-save" style="flex:1;min-height:40px">${App.icon('check')} 등록 + 사용</button>
            <button type="button" class="btn btn-secondary" id="quickadd-cancel" style="flex:1;min-height:40px">취소</button>
          </div>
        </div>
        <!-- 합계 + 결제 수단 (필수 매출 정보) -->
        <div class="form-group" id="final-price-display" style="background:var(--bg);border-radius:var(--radius);padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">합계</span>
          <span id="final-price-value" style="font-size:1.2rem;font-weight:800;color:var(--primary)">${App.formatCurrency((record.servicePrice || record.totalPrice || 0) + (record.addonPrice || 0) - (record.discount || 0) + (record.extraCharge || 0))}</span>
        </div>
        <div class="form-group">
          <label class="form-label">결제 수단</label>
          <div id="f-paymentMethod-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="payment-chip${(!record.paymentMethod && !id) || record.paymentMethod === 'card' ? ' active' : ''}" data-value="card">카드</button>
            <button type="button" class="payment-chip${record.paymentMethod === 'cash' ? ' active' : ''}" data-value="cash">현금</button>
            <button type="button" class="payment-chip${record.paymentMethod === 'transfer' ? ' active' : ''}" data-value="transfer">이체</button>
            <button type="button" class="payment-chip${record.paymentMethod === 'unpaid' ? ' active' : ''}" data-value="unpaid">미결제</button>
          </div>
          <input type="hidden" id="f-paymentMethod" value="${(!record.paymentMethod && !id) ? 'card' : (record.paymentMethod || 'card')}">
        </div>

        <!-- 현금영수증 (현금 결제 시에만 표시) -->
        <div class="form-group" id="cashreceipt-group" style="display:${record.paymentMethod === 'cash' ? 'block' : 'none'};margin-top:-4px;background:var(--bg);border-radius:var(--radius);padding:10px 12px">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.88rem;font-weight:600">
            <input type="checkbox" id="f-cashReceipt" ${record.cashReceiptYn ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
            <span>현금영수증 발행</span>
          </label>
          <input type="text" id="f-cashReceiptNo" placeholder="승인번호 (선택)" value="${App.escapeHtml(record.cashReceiptNo || '')}"
            inputmode="numeric" maxlength="20"
            style="margin-top:8px;display:${record.cashReceiptYn ? 'block' : 'none'};min-height:38px;width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:max(16px,0.9rem)">
        </div>

        <!-- 컨디션 (기본 표시 — 리포트 가치) -->
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label" style="font-size:0.85rem">컨디션 <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem">(선택 — 리포트에 반영)</span></label>
          <div id="f-condition-chips" style="display:flex;gap:6px">
            <button type="button" class="condition-chip${record.condition === 'good' ? ' active' : ''}" data-field="condition" data-value="good" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'good' ? 'var(--success-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">좋음</button>
            <button type="button" class="condition-chip${record.condition === 'normal' ? ' active' : ''}" data-field="condition" data-value="normal" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'normal' ? 'var(--warning-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">보통</button>
            <button type="button" class="condition-chip${record.condition === 'caution' ? ' active' : ''}" data-field="condition" data-value="caution" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'caution' ? 'var(--danger-bg-soft)' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">주의</button>
          </div>
          <input type="hidden" id="f-condition" value="${record.condition || ''}">
        </div>

        <!-- 미용 협조도 (다음 미용 시간 견적 참고) -->
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label" style="font-size:0.85rem">미용 협조도 <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem">(선택 — 다음 미용 시간 참고)</span></label>
          <div id="f-cooperativeness-chips" style="display:flex;gap:6px">
            <button type="button" class="condition-chip${record.cooperativeness === 'easy' ? ' active' : ''}" data-field="cooperativeness" data-value="easy" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.cooperativeness === 'easy' ? 'var(--success-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">잘함</button>
            <button type="button" class="condition-chip${record.cooperativeness === 'normal' ? ' active' : ''}" data-field="cooperativeness" data-value="normal" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.cooperativeness === 'normal' ? 'var(--warning-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">보통</button>
            <button type="button" class="condition-chip${record.cooperativeness === 'difficult' ? ' active' : ''}" data-field="cooperativeness" data-value="difficult" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.cooperativeness === 'difficult' ? 'var(--danger-bg-soft)' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">까다로움</button>
          </div>
          <input type="hidden" id="f-cooperativeness" value="${record.cooperativeness || ''}">
        </div>

        <div class="form-group">
          <label class="form-label">사진 <span style="color:var(--text-muted);font-size:0.78rem;font-weight:400">(선택 — 다음 미용 때 참고용)</span></label>
          <div class="rec-photo-row">
            ${App.RECORD_PHOTO_FIELDS.map(f => `
            <label class="rec-photo-tile" data-field="${f}" aria-label="${f === 'photoBefore' ? '미용 전' : '미용 후'} 사진 선택">
              <input type="file" class="rec-photo-input" data-field="${f}" accept="image/*">
              <img alt="" hidden>
              <span class="rec-photo-empty">${App.icon('camera')}<span>${f === 'photoBefore' ? '미용 전' : '미용 후'}</span></span>
              <span class="rec-photo-tag">${f === 'photoBefore' ? '전' : '후'}</span>
              <button type="button" class="rec-photo-del" aria-label="사진 지우기" hidden>&times;</button>
            </label>`).join('')}
            <div class="rec-photo-note" id="f-rec-photo-note"></div>
          </div>
        </div>
        <!-- 상세 옵션 토글 (스타일·추가 항목·미용사·할인·메모 등) -->
        <div class="form-detail-divider" onclick="this.closest('.modal-body').querySelector('.form-detail-section').classList.toggle('open');this.classList.toggle('open')">
          <span class="form-detail-divider-line"></span>
          <span class="form-detail-divider-label">상세 옵션</span>
          <span class="form-detail-divider-chevron">${App.icon('chevron-down')}</span>
          <span class="form-detail-divider-line"></span>
        </div>

        <!-- 상세 옵션 영역 -->
        <div class="form-detail-section">
          <div class="form-group">
            <label class="form-label">스타일 <span style="color:var(--text-muted);font-size:0.78rem">(선택)</span></label>
            <input type="text" id="f-style" value="${App.escapeHtml(record.style || '')}" placeholder="예: 테디베어컷, 하이바+스포팅" autocomplete="off">
            <div class="search-select-dropdown" id="style-dropdown" style="position:absolute;z-index:10;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);max-height:150px;overflow-y:auto;display:none;width:100%"></div>
          </div>
          <div class="form-group">
            <label class="form-label">추가 항목 <span style="color:var(--text-muted);font-size:0.78rem">(엉킴·약욕·스파 등)</span></label>
            <div id="f-addon-tags" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">${(record.addons || []).map(a => '<span class="badge badge-info addon-tag" data-price="' + (Number(prefillAddonPrices[a]) || 0) + '" style="cursor:pointer;padding:6px 10px" title="클릭하여 제거">' + App.escapeHtml(a) + ' ×</span>').join('')}</div>
            <input type="text" id="f-addon-input" placeholder="추가 항목 입력 후 Enter" autocomplete="off">
            <div class="search-select-dropdown" id="addon-dropdown" style="position:absolute;z-index:10;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);max-height:150px;overflow-y:auto;display:none;width:100%"></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">추가 비용</label>
              <input type="number" id="f-addonPrice" value="${record.addonPrice || ''}" placeholder="0" min="0" step="1000">
            </div>
            <div class="form-group">
              <label class="form-label">반려견 사이즈</label>
              <select id="f-sizeType">
                <option value="">사이즈 선택</option>
                <option value="small">소형</option>
                <option value="medium">중형</option>
                <option value="large">대형</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">담당 미용사</label>
            ${await App.getGroomerFieldHTML(record.groomer)}
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">할인 금액</label>
              <input type="number" id="f-discount" value="${record.discount || ''}" placeholder="0" min="0" step="1000">
            </div>
            <div class="form-group">
              <label class="form-label">추가 요금</label>
              <input type="number" id="f-extraCharge" value="${record.extraCharge || ''}" placeholder="0" min="0" step="1000">
            </div>
          </div>
          <!-- 상세 컨디션 (피부/귀/엉킴) -->
          <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:16px">
            <div style="font-weight:700;font-size:0.9rem;margin-bottom:12px">상세 컨디션 <span style="font-weight:400;color:var(--text-muted);font-size:0.8rem">(선택)</span></div>
            <div class="form-group" style="margin-bottom:10px">
              <label class="form-label" style="font-size:0.82rem">피부 상태</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${['정상','건조','발적','각질','습진'].map(s => `<label class="checkbox-label" style="font-size:0.82rem"><input type="checkbox" name="skinStatus" value="${s}" ${(record.skinStatus || []).includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}
              </div>
            </div>
            <div class="form-row" style="margin-bottom:0">
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:0.82rem">귀 상태</label>
                <select id="f-earStatus" style="font-size:max(16px,0.85rem);padding:6px 10px">
                  <option value="">선택 안 함</option>
                  <option value="clean" ${record.earStatus === 'clean' ? 'selected' : ''}>깨끗</option>
                  <option value="dirty" ${record.earStatus === 'dirty' ? 'selected' : ''}>경미한 오염</option>
                  <option value="infected" ${record.earStatus === 'infected' ? 'selected' : ''}>염증 의심</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:0.82rem">엉킴 정도</label>
                <select id="f-mattingLevel" style="font-size:max(16px,0.85rem);padding:6px 10px">
                  <option value="">선택 안 함</option>
                  <option value="none" ${record.mattingLevel === 'none' ? 'selected' : ''}>없음</option>
                  <option value="mild" ${record.mattingLevel === 'mild' ? 'selected' : ''}>경미</option>
                  <option value="severe" ${record.mattingLevel === 'severe' ? 'selected' : ''}>심함</option>
                </select>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">메모</label>
            <textarea id="f-memo" placeholder="미용 중 특이사항, 다음 방문 시 참고할 내용 등" maxlength="2000">${App.escapeHtml(record.memo || '')}</textarea>
          </div>
        </div>
        <input type="hidden" id="f-appointmentId" value="${record.appointmentId || ''}">
        ${id ? `<div style="margin-top:16px;padding-top:12px;border-top:1px dashed var(--border);text-align:center">
          <button type="button" class="btn btn-ghost text-danger" id="btn-delete-record-form" style="min-height:44px">이 기록 삭제</button>
        </div>` : ''}
      `,
      onSave: () => this.saveRecord(id)
    });
    document.getElementById('btn-delete-record-form')?.addEventListener('click', () => this.deleteRecord(id, { fromForm: true }));
    this._bindRecordPhotos(record);

    // Pet change -> auto-set size and show pet notes + 마지막 기록 가져오기 버튼 표시
    document.getElementById('f-petId')?.addEventListener('change', async (e) => {
      const pid = Number(e.target.value);
      const copyArea = document.getElementById('f-copy-last-area');
      if (!pid) {
        if (copyArea) copyArea.style.display = 'none';
        // 이전 반려견의 특이사항 경고가 남아 다른 아이의 것으로 오해되지 않도록 지운다
        document.getElementById('pet-info-display')?.remove();
        return;
      }
      const pet = await DB.get('pets', pid);
      if (pet) {
        // Auto-set size
        const sizeSelect = document.getElementById('f-sizeType');
        if (sizeSelect) {
          // 사이즈 모름이면 빈 값('사이즈 선택') — 이전 반려견의 사이즈가 남지 않게 한다
          sizeSelect.value = App.getPetSizeType(pet) || '';
          // Trigger price recalculation
          sizeSelect.dispatchEvent(new Event('change'));
        }
        // Show pet info box
        this.showPetInfoBox(pet);
        // 마지막 미용 기록 조회 → 버튼 표시
        await this._refreshLastRecordButton(pid, id);
      }
    });

    // 이전 미용과 같음 버튼 클릭
    document.getElementById('btn-copy-last-record')?.addEventListener('click', () => {
      this._applyLastRecord();
    });

    // Show pet info if already selected
    if (record.petId) {
      const pet = await DB.get('pets', record.petId);
      if (pet) {
        const sizeEl = document.getElementById('f-sizeType');
        if (sizeEl) sizeEl.value = App.getPetSizeType(pet) || '';
        this.showPetInfoBox(pet);
        // 펫 미리 선택된 경우에도 마지막 기록 버튼 표시
        await this._refreshLastRecordButton(record.petId, id);
      }
    }

    // ===== 자동완성 드롭다운 헬퍼 =====
    // opts.onNoMatch: 입력값과 정확히 일치하는 항목 없을 때 드롭다운 하단에 추가할 액션 (예: "+ 새 서비스 등록")
    // opts.hintFor(v): 항목 옆에 붙일 보조 문구 (예: 가격). 선택 시 입력값에는 들어가지 않는다.
    // opts.onSelect(v): 선택 시 기본 동작(입력값 채움 + change) 대신 실행
    const setupAutocomplete = (inputId, dropdownId, historyKey, defaultSuggestions, opts = {}) => {
      const input = document.getElementById(inputId);
      const dropdown = document.getElementById(dropdownId);
      if (!input || !dropdown) return;
      const showDropdown = async (q) => {
        const history = await App.getAutoHistory(historyKey);
        const dbItems = opts.dbItems ? await opts.dbItems() : [];
        const all = [...new Set([...dbItems, ...history, ...(defaultSuggestions || [])])];
        const query = (q || '').trim();
        const queryLower = query.toLowerCase();
        const filtered = queryLower ? all.filter(v => v.toLowerCase().includes(queryLower)) : all;
        const exactMatch = queryLower && all.some(v => v.toLowerCase() === queryLower);

        let html = filtered.slice(0, 10).map(v => {
          const hint = opts.hintFor ? opts.hintFor(v) : '';
          return `<div class="search-select-option" data-action="select" data-value="${App.escapeHtml(v)}" style="padding:8px 12px;cursor:pointer;font-size:0.9rem;min-height:44px;display:flex;align-items:center;gap:6px">${App.escapeHtml(v)}${hint ? `<span style="color:var(--text-muted);font-size:0.8rem">· ${App.escapeHtml(hint)}</span>` : ''}</div>`;
        }).join('');

        // 즉석 등록 옵션 (정확히 일치 안 할 때만)
        if (opts.onNoMatch && query && !exactMatch) {
          html += `<div class="search-select-option" data-action="add-new" data-query="${App.escapeHtml(query)}" style="padding:10px 12px;cursor:pointer;font-size:0.85rem;font-weight:700;color:var(--primary);background:var(--primary-light);border-top:1px dashed var(--border)">+ "${App.escapeHtml(query)}" 새 서비스 등록</div>`;
        }

        if (!html) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('.search-select-option').forEach(opt => {
          opt.addEventListener('click', (e) => {
            e.stopPropagation();
            if (opt.dataset.action === 'add-new') {
              dropdown.style.display = 'none';
              opts.onNoMatch(opt.dataset.query || query);
            } else if (opts.onSelect) {
              dropdown.style.display = 'none';
              opts.onSelect(opt.dataset.value || '');
            } else {
              input.value = opt.dataset.value || '';
              dropdown.style.display = 'none';
              input.dispatchEvent(new Event('change'));
            }
          });
        });
      };
      input.addEventListener('focus', () => showDropdown(input.value));
      input.addEventListener('input', App.debounce(() => showDropdown(input.value), 200));
      document.addEventListener('click', (e) => { if (!e.target.closest('#' + inputId) && !e.target.closest('#' + dropdownId)) dropdown.style.display = 'none'; });
    };
    // 메뉴에 서비스가 있으면 메뉴 이름을 기본 제안으로 (미용 분류 먼저). 메뉴가 비었을 때만 고정 목록.
    const activeMenu = (await DB.getAll('services')).filter(s => s.isActive !== false && App.normalizeServiceName(s.name));
    const defaultServices = activeMenu.length > 0
      ? [...activeMenu.filter(s => s.category === 'grooming'), ...activeMenu.filter(s => s.category !== 'grooming')].map(s => App.normalizeServiceName(s.name))
      : ['전체미용', '목욕', '위생미용', '부분미용', '클리퍼컷', '스포팅'];
    const defaultAddons = ['엉킴 제거', '약욕', '보습팩', '염색'];
    const defaultStyles = ['테디베어컷', '배냇컷', '라이언컷', '하이바컷', '머쉬룸컷', '스포팅컷', '자연컷', '클린페이스'];
    const sizeSelect = document.getElementById('f-sizeType');
    const currentSize = () => sizeSelect?.value || null;
    // 가격 힌트 "1만", "1.5만", 만 단위가 아니면 통화 표기
    const shortPrice = (p) => (p >= 10000 && p % 1000 === 0) ? `${p / 10000}만` : App.formatCurrency(p);

    // 서비스 input 은 DB services 까지 통합 + "새 서비스 등록" 옵션
    // 즐겨찾기 → 활성 순으로 정렬 (자주 쓰는 서비스 상위 노출)
    setupAutocomplete('f-service', 'service-dropdown', 'serviceHistory', defaultServices, {
      dbItems: async () => {
        const list = await DB.getAll('services');
        return list
          .filter(s => s.isActive !== false)
          .sort((a, b) => {
            const fa = !!a.favorite, fb = !!b.favorite;
            if (fa !== fb) return fa ? -1 : 1;
            return (a.name || '').localeCompare(b.name || '', 'ko');
          })
          .map(s => s.name);
      },
      onNoMatch: (query) => this._showQuickAddService(query)
    });
    setupAutocomplete('f-style', 'style-dropdown', 'styleHistory', defaultStyles);

    // 추가 항목 태그 시스템
    // 메뉴의 '추가'/'케어' 서비스와 이름이 같으면 사이즈 가격을 태그(data-price)에 담고 추가 비용에 더한다.
    // 사장님이 추가 비용을 직접 고치면 이 폼에서는 더 이상 자동 조정하지 않는다.
    const addonTagsEl = document.getElementById('f-addon-tags');
    const addonInput = document.getElementById('f-addon-input');
    const addonPriceInput = document.getElementById('f-addonPrice');
    let addonPriceManual = false;
    addonPriceInput?.addEventListener('input', () => { addonPriceManual = true; });
    const adjustAddonPrice = (delta) => {
      if (addonPriceManual || !addonPriceInput || !delta) return;
      addonPriceInput.value = Math.max(0, (Number(addonPriceInput.value) || 0) + delta) || '';
      calcTotal();
    };
    const addonMenuHints = {};
    setupAutocomplete('f-addon-input', 'addon-dropdown', 'addonHistory', defaultAddons, {
      dbItems: async () => {
        const list = (await DB.getAll('services')).filter(s => s.isActive !== false && (s.category === 'addon' || s.category === 'care'));
        const names = [];
        for (const s of list) {
          const nm = App.normalizeServiceName(s.name);
          if (!nm) continue;
          const m = await App.getMenuPrice(nm, currentSize(), list);
          addonMenuHints[nm] = m && m.price ? shortPrice(m.price) : '';
          names.push(nm);
        }
        return names;
      },
      hintFor: (v) => addonMenuHints[v] || '',
      onSelect: (v) => { addAddonTag(v); if (addonInput) addonInput.value = ''; }
    });
    const addAddonTag = async (name) => {
      const nm = App.normalizeServiceName(name);
      if (!nm || !addonTagsEl) return;
      const tag = document.createElement('span');
      tag.className = 'badge badge-info addon-tag';
      tag.style.cssText = 'cursor:pointer;padding:6px 10px';
      tag.title = '클릭하여 제거';
      tag.textContent = nm + ' ×';
      tag.dataset.price = '0';
      addonTagsEl.appendChild(tag);
      const m = await App.getMenuPrice(nm, currentSize());
      // 메뉴의 '추가'/'케어' 항목만 가격 자동 반영 (주 서비스 이름을 태그로 적은 경우는 제외)
      if (m && m.price > 0 && (m.service.category === 'addon' || m.service.category === 'care') && tag.isConnected) {
        tag.dataset.price = String(m.price);
        adjustAddonPrice(m.price);
      }
    };
    addonInput?.addEventListener('keydown', (e) => {
      // stopPropagation: modal-body의 Enter=저장 핸들러로 올라가 반쯤 입력된 기록이 저장되는 것을 막는다
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addAddonTag(addonInput.value); addonInput.value = ''; document.getElementById('addon-dropdown').style.display = 'none'; }
    });
    // 태그 클릭 제거 — 위임 방식이라 '이전 미용과 같음'으로 다시 그린 태그도 제거된다
    addonTagsEl?.addEventListener('click', (e) => {
      const tag = e.target.closest('.addon-tag');
      if (!tag) return;
      const p = Number(tag.dataset.price) || 0;
      tag.remove();
      adjustAddonPrice(-p);
    });

    // 서비스 선택 시 가격 자동 채움 (사이즈 변경 시에도 다시 계산)
    const serviceInput = document.getElementById('f-service');
    const servicePriceInput = document.getElementById('f-servicePrice');
    const sizeBadge = document.getElementById('f-size-badge');
    const sizeWarn = document.getElementById('f-size-warn');
    const SIZE_PRICE_LABEL = { small: '소형가', medium: '중형가', large: '대형가' };
    let servicePriceManual = !!id; // 수정 모드면 자동채움 비활성
    const hideSizeHint = () => {
      if (sizeBadge) sizeBadge.style.display = 'none';
      if (sizeWarn) sizeWarn.style.display = 'none';
    };
    servicePriceInput?.addEventListener('input', () => { servicePriceManual = true; hideSizeHint(); });
    let priceFillSeq = 0;
    const fillServicePrice = async () => {
      if (servicePriceManual || !serviceInput || !servicePriceInput) return;
      const seq = ++priceFillSeq;
      const name = App.normalizeServiceName(serviceInput.value);
      const petId = Number(document.getElementById('f-petId')?.value);
      const sizeType = currentSize();
      const [menu, price] = name
        ? await Promise.all([App.getMenuPrice(name, sizeType), App.getRecentServicePrice(petId, name, sizeType)])
        : [null, null];
      // 더 최신 조회가 시작됐거나, 기다리는 사이 직접 입력했거나, 폼이 닫혔으면 무시
      if (seq !== priceFillSeq || servicePriceManual || !servicePriceInput.isConnected) return;
      // 못 찾으면 이전 서비스 가격을 남기지 않는다
      servicePriceInput.value = price ? price : '';
      if (menu && menu.hasSizePrices && price) {
        if (sizeBadge) { sizeBadge.textContent = SIZE_PRICE_LABEL[sizeType || 'small']; sizeBadge.style.display = 'inline-block'; }
        if (sizeWarn) sizeWarn.style.display = sizeType ? 'none' : 'block';
      } else {
        hideSizeHint();
      }
      calcTotal();
    };
    const runPriceFill = () => {
      const p = fillServicePrice().catch(err => console.warn('가격 자동 채움 실패:', err));
      this._pendingPriceFill = p;
      return p;
    };
    serviceInput?.addEventListener('change', runPriceFill);
    serviceInput?.addEventListener('input', App.debounce(runPriceFill, 400));

    // 사이즈 변경 → 기본가 다시 채움 + 메뉴 추가 항목 가격도 그 사이즈로 맞춤
    sizeSelect?.addEventListener('change', async () => {
      runPriceFill();
      if (!addonTagsEl) return;
      for (const tag of addonTagsEl.querySelectorAll('.addon-tag')) {
        const old = Number(tag.dataset.price) || 0;
        if (!old) continue; // 직접 입력 태그는 가격 정보 없음
        const m = await App.getMenuPrice(tag.textContent.replace(' ×', ''), currentSize());
        if (!m || !tag.isConnected) continue;
        tag.dataset.price = String(m.price);
        adjustAddonPrice(m.price - old);
      }
    });

    // 합계 자동 계산
    // 저장되는 finalPrice 와 같은 식이어야 한다 (예전엔 화면 합계에 추가요금이 빠져 손님께 말한 금액과 매출이 달랐다)
    const calcTotal = () => {
      const base = Number(document.getElementById('f-servicePrice')?.value) || 0;
      const addon = Number(document.getElementById('f-addonPrice')?.value) || 0;
      const discount = Number(document.getElementById('f-discount')?.value) || 0;
      const extra = Number(document.getElementById('f-extraCharge')?.value) || 0;
      const el = document.getElementById('final-price-value');
      if (el) el.textContent = App.formatCurrency(base + addon - discount + extra);
    };
    document.getElementById('f-servicePrice')?.addEventListener('input', calcTotal);
    document.getElementById('f-addonPrice')?.addEventListener('input', calcTotal);
    document.getElementById('f-discount')?.addEventListener('input', calcTotal);
    document.getElementById('f-extraCharge')?.addEventListener('input', calcTotal);

    // Payment chip buttons — 결제 수단 칩만 (즉석 등록의 분류 칩까지 잡으면 결제수단이 'grooming' 이 됐다)
    const paymentChips = document.querySelectorAll('#f-paymentMethod-chips .payment-chip');
    paymentChips.forEach(chip => {
      chip.addEventListener('click', () => {
        paymentChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('f-paymentMethod').value = chip.dataset.value;
        // 현금 선택 시에만 현금영수증 그룹 표시
        const cashGroup = document.getElementById('cashreceipt-group');
        if (cashGroup) cashGroup.style.display = chip.dataset.value === 'cash' ? 'block' : 'none';
      });
    });

    // 현금영수증 checkbox → 승인번호 입력란 토글
    document.getElementById('f-cashReceipt')?.addEventListener('change', (e) => {
      const noInput = document.getElementById('f-cashReceiptNo');
      if (noInput) noInput.style.display = e.target.checked ? 'block' : 'none';
    });

    // Condition chip buttons
    document.querySelectorAll('.condition-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const field = chip.dataset.field;
        const hiddenInput = document.getElementById('f-' + field);
        const siblings = chip.parentElement.querySelectorAll('.condition-chip');
        const wasActive = chip.classList.contains('active');
        siblings.forEach(c => { c.classList.remove('active'); c.style.background = 'var(--bg-white)'; });
        if (!wasActive) {
          chip.classList.add('active');
          const colors = { good: 'var(--success-light)', normal: 'var(--warning-light)', caution: 'var(--danger-bg-soft)', easy: 'var(--success-light)', difficult: 'var(--danger-bg-soft)' };
          chip.style.background = colors[chip.dataset.value] || 'var(--bg-white)';
          hiddenInput.value = chip.dataset.value;
        } else {
          hiddenInput.value = '';
        }
      });
    });

    // 반려견 목록 갱신 + 없으면 그 자리에서 등록 버튼 제공 (change 이벤트도 여기서 발생시킨다)
    const origCustomerOnChange = async (cid, preferPetId) => {
      await App.refreshPetSelect(cid, preferPetId);
    };

    // Re-render customer select with enhanced onChange
    await App.renderCustomerSelect('record-customer-select', record.customerId, origCustomerOnChange);

    // 이미 고객이 정해진 채로 열렸는데 반려견이 하나도 없으면, 여기서 바로 등록할 수 있게 한다
    if (record.customerId) {
      const cPets = await DB.getByIndex('pets', 'customerId', Number(record.customerId));
      if (cPets.length === 0) await App.refreshPetSelect(record.customerId);
    }

    // 예약에서 넘어온 새 기록: 메뉴가로 미리 채웠지만, 반려견별 협의가·사이즈 배지까지 반영하도록 한 번 더 조회
    if (!id && record.service && !servicePriceManual && serviceInput) {
      serviceInput.dispatchEvent(new Event('change'));
    }

    // 초기 합계 계산
    calcTotal();

  },

  // 반려견 lastVisitDate 를 그 반려견의 모든 기록 기준으로 다시 계산 (수정·삭제·반려견 변경 공통)
  async _recalcPetLastVisit(petId) {
    if (!petId) return;
    try {
      const [petRecords, pet] = await Promise.all([DB.getByIndex('records', 'petId', petId), DB.get('pets', petId)]);
      if (!pet) return;
      let first = null, latest = null, count = 0;
      petRecords.forEach(r => { if (!r.date) return; count++; if (!first || r.date < first) first = r.date; if (!latest || r.date > latest) latest = r.date; });
      if ((pet.lastVisitDate || null) !== latest || (pet.firstVisitDate || null) !== first || (pet.visitCount || 0) !== count) {
        pet.lastVisitDate = latest;
        pet.firstVisitDate = first;
        pet.visitCount = count;
        await DB.update('pets', pet);
      }
    } catch (e) { console.warn('lastVisitDate 재계산 실패:', e); }
  },

  // ===== 기록 사진 (미용 전·후 2장) =====
  // 폼에서 고른 사진은 this._formPhotos[field] = { data, changed } 에 두고 저장할 때 photos 스토어로 옮긴다.
  async _bindRecordPhotos(record) {
    this._formPhotos = {};
    const note = document.getElementById('f-rec-photo-note');
    if (!document.querySelector('.rec-photo-tile')) return;
    const paint = (field) => {
      const tile = document.querySelector(`.rec-photo-tile[data-field="${field}"]`);
      if (!tile) return;
      const st = this._formPhotos[field];
      const img = tile.querySelector('img');
      const has = !!(st && st.data);
      img.hidden = !has;
      if (has) img.src = st.data;
      tile.querySelector('.rec-photo-empty').hidden = has;
      tile.querySelector('.rec-photo-del').hidden = !has;
      tile.classList.toggle('has-photo', has);
    };
    App.getRecordPhotoKeep().then(keep => {
      if (note) note.textContent = keep ? `반려견별 최근 ${keep}회 기록의 사진만 보관됩니다 (설정에서 변경).` : '';
    });
    // 기존 사진 미리보기 — 이전 폼의 느린 로드가 다음 폼의 빈 칸에 들어가지 않게 폼마다 표를 둔다
    const formToken = (this._formPhotoToken = (this._formPhotoToken || 0) + 1);
    for (const f of App.RECORD_PHOTO_FIELDS) {
      if (record && (record[f + 'Id'] || record[f])) {
        App.getRecordPhoto(record, f).then(src => {
          if (formToken !== this._formPhotoToken) return;
          if (src && this._formPhotos && !this._formPhotos[f]) { this._formPhotos[f] = { data: src, changed: false }; paint(f); }
        });
      }
    }
    // 타일이 <label> 이라 파일 창은 브라우저가 직접 연다 (JS 의 input.click() 은 일부 브라우저에서 막힌다)
    document.querySelectorAll('.rec-photo-tile').forEach(tile => {
      const field = tile.dataset.field;
      const input = tile.querySelector('.rec-photo-input');
      tile.querySelector('.rec-photo-del').addEventListener('click', (e) => {
        e.preventDefault(); // label 활성화(파일 창) 막기
        e.stopPropagation();
        this._formPhotos[field] = { data: null, changed: true };
        if (input) input.value = '';
        paint(field);
      });
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          App.resizeImage(reader.result, (data) => {
            if (!data) { App.showToast('사진을 읽지 못했습니다.', 'error'); return; }
            this._formPhotos[field] = { data, changed: true };
            paint(field);
          }, 800, 0.7);
        };
        reader.readAsDataURL(file);
      });
    });
  },

  // 저장된 기록에 폼 사진을 붙인다 (바뀐 칸만). 이 기기에서 넣은 사진은 동기화 원본이 된다.
  async _persistRecordPhotos(recordId) {
    const photos = this._formPhotos || {};
    const fields = App.RECORD_PHOTO_FIELDS.filter(f => photos[f] && photos[f].changed);
    if (!fields.length) return;
    const rec = await DB.get('records', recordId);
    if (!rec) return;
    for (const f of fields) {
      if (rec[f + 'Id']) { await DB.deletePhoto(rec[f + 'Id']).catch(() => {}); rec[f + 'Id'] = null; }
      if (rec[f]) delete rec[f]; // 옛 인라인 사진
      if (photos[f].data) rec[f + 'Id'] = await DB.savePhoto(photos[f].data, { type: 'record-' + f, ownerId: recordId, date: rec.date });
      if (rec._photoFromSync) delete rec._photoFromSync[f];
      rec._photoSetAt = { ...(rec._photoSetAt || {}), [f]: Date.now() };
    }
    await DB.update('records', rec);
    this._formPhotos = {};
  },

  async saveRecord(id) {
    try {
      // 서비스 입력 직후 바로 저장을 누르면 가격 조회가 끝나기 전이라 0원으로 저장되던 문제 — 조회를 기다린다
      if (this._pendingPriceFill) {
        try { await this._pendingPriceFill; } catch (e) { /* 조회 실패 시 입력된 값으로 진행 */ }
        this._pendingPriceFill = null;
      }
      const customerId = Number(document.getElementById('record-customer-select-value')?.value || document.getElementById('f-customerId')?.value);
      const petId = Number(document.getElementById('f-petId').value);
      const date = document.getElementById('f-date').value;
      const groomer = document.getElementById('f-groomer').value.trim();
      const memo = document.getElementById('f-memo').value.trim();
      const paymentMethod = document.getElementById('f-paymentMethod').value;

      // 새 서비스/스타일/가격 필드
      const service = App.normalizeServiceName(document.getElementById('f-service')?.value);
      const servicePrice = Number(document.getElementById('f-servicePrice')?.value) || 0;
      const style = document.getElementById('f-style')?.value?.trim() || '';
      const addons = []; document.querySelectorAll('#f-addon-tags .addon-tag').forEach(tag => { const t = tag.textContent.replace(' ×', '').trim(); if (t) addons.push(t); });
      const addonPrice = Number(document.getElementById('f-addonPrice')?.value) || 0;
      const totalPrice = servicePrice + addonPrice;
      // 호환용: serviceNames 배열도 저장
      const serviceNames = service ? [service] : [];

      // 컨디션 체크 필드
      const condition = document.getElementById('f-condition')?.value || '';
      const cooperativeness = document.getElementById('f-cooperativeness')?.value || '';
      const skinStatus = []; document.querySelectorAll('input[name="skinStatus"]:checked').forEach(cb => skinStatus.push(cb.value));
      const earStatus = document.getElementById('f-earStatus')?.value || '';
      const mattingLevel = document.getElementById('f-mattingLevel')?.value || '';

      // Auto-calculate nextVisitDate from pet's groomingCycle
      let nextVisitDate = '';
      if (petId) {
        try {
          const pet = await DB.get('pets', petId);
          if (pet && pet.groomingCycle) {
            const baseDate = new Date(date || App.getToday());
            baseDate.setDate(baseDate.getDate() + pet.groomingCycle);
            nextVisitDate = App.formatLocalDate(baseDate);
          }
        } catch (e) { /* ignore */ }
      }

      if (!customerId) { App.showToast('고객을 선택해주세요.', 'error'); App.highlightField('record-customer-select-input'); return; }
      if (!petId) { App.showToast('반려견을 선택해주세요.', 'error'); App.highlightField('f-petId'); return; }
      if (!date) { App.showToast('날짜를 입력해주세요.', 'error'); App.highlightField('f-date'); return; }
      if (!service) { App.showToast('서비스를 입력해주세요.', 'error'); App.highlightField('f-service'); return; }

      const discount = Number(document.getElementById('f-discount')?.value) || 0;
      const extraCharge = Number(document.getElementById('f-extraCharge')?.value) || 0;
      const finalPrice = totalPrice - discount + extraCharge;
      if (finalPrice < 0) { App.showToast('할인이 금액보다 큽니다. 할인 금액을 확인해주세요.', 'error'); App.highlightField('f-discount'); return; }
      if (finalPrice === 0 && paymentMethod !== 'unpaid') {
        // 예약→기록 흐름에서 가격이 비어 0원 매출이 조용히 쌓이던 문제. 무료 서비스는 확인 후 저장.
        const okZero = await App.confirm('합계가 <strong>0원</strong>입니다. 무료 서비스로 저장할까요?', { okLabel: '0원으로 저장', danger: false });
        if (!okZero) { App.highlightField('f-servicePrice'); return; }
      }
      const appointmentId = document.getElementById('f-appointmentId')?.value || null;
      const status = 'completed';

      // 서비스 카테고리 스냅샷 — services 마스터 변경(이름/카테고리/삭제) 영향 차단
      // serviceId: 메뉴 서비스 연결 (이름이 바뀌어도 사용 횟수·분석이 이어지도록). service(이름)는 스냅샷으로 유지
      let serviceCategory = '';
      let serviceId = null;
      const addonServiceIds = [];
      if (service) {
        try {
          const allServices = await DB.getAll('services');
          const findSvc = (nm) => allServices.find(s => s.isActive !== false && App.normalizeServiceName(s.name) === nm)
            || allServices.find(s => App.normalizeServiceName(s.name) === nm);
          const svc = findSvc(service);
          if (svc) {
            serviceId = svc.id;
            if (svc.category) serviceCategory = svc.category;
          }
          // 추가 항목 중 메뉴에 있는 것만 id 연결 (태그 순서 유지, 메뉴에 없는 자유 입력은 건너뜀)
          addons.forEach(a => {
            const as = findSvc(App.normalizeServiceName(a));
            if (as && !addonServiceIds.includes(as.id)) addonServiceIds.push(as.id);
          });
        } catch (e) { /* services 조회 실패 시 빈 값 — export에서 폴백 */ }
      }

      // 현금영수증 (현금 결제일 때만 의미)
      const cashReceiptYn = document.getElementById('f-cashReceipt')?.checked || false;
      const cashReceiptNo = document.getElementById('f-cashReceiptNo')?.value?.trim() || '';

      const data = { customerId, petId, date, groomer, nextVisitDate, service, serviceId, servicePrice, serviceCategory, addons, addonServiceIds, addonPrice, style, serviceNames, totalPrice, discount, extraCharge, finalPrice, memo, paymentMethod, cashReceiptYn, cashReceiptNo, appointmentId, status, condition, cooperativeness, skinStatus, earStatus, mattingLevel };
      let newId = null; // 새 기록이면 저장 뒤 리포트 보내기에 쓴다

      // 자동완성 이력 업데이트
      if (service) App.addAutoHistory('serviceHistory', service);
      if (style) App.addAutoHistory('styleHistory', style);
      addons.forEach(a => App.addAutoHistory('addonHistory', a));

      let prevCustomerId = null;
      let prevPetId = null;
      if (id) {
        const existing = await DB.get('records', id);
        if (!existing) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
        prevCustomerId = existing.customerId;
        prevPetId = existing.petId;
        // 미결제 → 결제로 바뀌면 수금일 기록
        if (existing.paymentMethod === 'unpaid' && paymentMethod !== 'unpaid') {
          data.paidAt = App.getToday();
          data.paidMethod = paymentMethod;
        } else if (paymentMethod === 'unpaid') {
          data.paidAt = null;
          data.paidMethod = null;
        }
        Object.assign(existing, data);
        await DB.update('records', existing);
        await this._persistRecordPhotos(id);
        await App.pruneRecordPhotos(petId, id).catch(() => {});
        App.showToast('미용 기록이 수정되었습니다.');
      } else {
        newId = await DB.add('records', data);
        await this._persistRecordPhotos(newId);
        await App.pruneRecordPhotos(petId, newId).catch(() => {});
        // If linked to an appointment, mark it as completed now
        if (appointmentId) {
          try {
            const appt = await DB.get('appointments', Number(appointmentId));
            if (appt) {
              appt.status = 'completed';
              await DB.update('appointments', appt);
              App.showToast('연결된 예약이 완료 처리되었습니다.', 'info');
            }
          } catch (e) {
            console.warn('Failed to update appointment status:', e);
          }
        }
      }

      // 고객 자동 태그 재계산 (신규/수정 공통). 고객 변경 시 양쪽 재계산
      try {
        await this._recalcCustomerTag(customerId);
        if (prevCustomerId && prevCustomerId !== customerId) {
          await this._recalcCustomerTag(prevCustomerId);
        }
      } catch (e) {
        console.warn('Auto-tag error:', e);
      }

      // 반려견 lastVisitDate 갱신
      // 수정 시에는 전체 기록 기준으로 재계산한다 — 예전엔 앞으로만 당겨서, 날짜 오타를 과거로 고치거나
      // 반려견을 바꾸면 옛 날짜가 남아 상태 뱃지·재방문 알림이 틀렸다.
      // 신규·수정 모두 전체 기록 기준 재계산 (lastVisitDate·firstVisitDate·visitCount — 목록/분석이 이 값만 읽는다)
      await this._recalcPetLastVisit(petId);
      if (id && prevPetId && prevPetId !== petId) await this._recalcPetLastVisit(prevPetId);

      App.closeModal();

      // 신규 기록: 완료 모달 (다음 예약 + 문자 발송 버튼 통합)
      if (!id) {
        const customer = await DB.get('customers', customerId);
        const pet = await DB.get('pets', petId);
        const customerPhone = (customer?.phone || '').replace(/\D/g, '');

        App.handleRoute();

        const hasCondition = condition || skinStatus.length || earStatus || mattingLevel;
        const savedRec = await DB.get('records', newId);
        // 사진이나 상태 중 하나라도 있으면 리포트(이미지)가 맨 위 — 저장 직후 보내는 게 가장 자연스럽다 (Gingr 체크아웃 링크 방식)
        const canReport = !!(hasCondition || (savedRec && App._recordHasPhoto(savedRec)));

        App.showModal({
          title: '미용 기록 저장 완료',
          hideFooter: true,
          content: `
            <div style="text-align:center;padding:20px 0">
              <div style="font-size:2.5rem;margin-bottom:12px;color:var(--success)">${App.icon('check-circle')}</div>
              <div style="font-size:1.1rem;font-weight:700;margin-bottom:20px">미용 기록이 저장되었습니다</div>
              <div style="display:flex;flex-direction:column;gap:10px;max-width:280px;margin:0 auto">
                ${canReport ? `<button class="btn btn-primary" id="post-save-report">${App.icon('image')} 리포트 보내기 <small style="font-weight:400">사진 · 상태 · 관리법</small></button>` : ''}
                ${customerPhone ? `<button class="btn ${canReport ? 'btn-secondary' : 'btn-success'}" id="post-save-sms">${App.icon('message')} 미용 완료 문자 보내기</button>` : ''}
                <button class="btn ${canReport ? 'btn-secondary' : 'btn-primary'}" id="post-save-appt">${App.icon('calendar')} 다음 예약 등록${nextVisitDate ? ' (' + App.formatDate(nextVisitDate) + ')' : ''}</button>
                <button class="btn btn-secondary" id="post-save-close">완료</button>
              </div>
            </div>
          `
        });

        document.getElementById('post-save-appt')?.addEventListener('click', () => {
          App.closeModal();
          App.pages.appointments.showForm(null, customerId, { petId, date: nextVisitDate, groomer });
        });
        document.getElementById('post-save-sms')?.addEventListener('click', async () => {
          const svcDisplay = [data.service, data.style].filter(Boolean).join(' / ');
          const msg = await App.buildSms('complete', {
            // 이름 없는 손님은 '보호자(1234)님'이 아니라 buildSms 의 '보호자님'으로
            '고객명': customer?.name || '',
            '반려견명': pet?.name || '',
            '서비스': svcDisplay,
            '금액': Number(finalPrice || 0).toLocaleString('ko-KR')
          });
          App.openSms(customerPhone, msg);
          // Don't close modal - just update button to show sent
          const btn = document.getElementById('post-save-sms');
          if (btn) { btn.innerHTML = App.icon('check') + ' 발송됨'; btn.disabled = true; btn.style.opacity = '0.6'; }
        });
        document.getElementById('post-save-report')?.addEventListener('click', () => {
          App.closeModal();
          setTimeout(() => this.showReport(newId), 200);
        });
        document.getElementById('post-save-close')?.addEventListener('click', () => {
          App.closeModal();
        });
        return;
      }

      App.handleRoute();
    } catch (err) {
      console.error('saveRecord error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  async deleteRecord(id, opts = {}) {
    const record = await DB.get('records', id);
    if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
    const pet = record.petId ? await DB.get('pets', record.petId) : null;
    const detail = `<small style="color:var(--text-muted)">${App.formatDate(record.date)}${pet ? ' · ' + App.escapeHtml(pet.name) : ''} · ${App.formatCurrency(App.getRecordAmount(record))}</small>`;
    const confirmed = await App.confirm(`이 미용 기록을 삭제하시겠습니까?<br>${detail}<br><strong>이 작업은 되돌릴 수 없습니다.</strong>`, { okLabel: '삭제' });
    if (!confirmed) return;
    try {
      // 연관 예약 상태 원복
      if (record && record.appointmentId) {
        const appt = await DB.get('appointments', Number(record.appointmentId));
        if (appt && appt.status === 'completed') {
          appt.status = 'confirmed';
          await DB.update('appointments', appt);
        }
      }
      // photos 스토어 정리
      if (record) {
        for (const f of ['photoBeforeId', 'photoAfterId', 'photo3Id', 'photo4Id']) {
          if (record[f]) await DB.deletePhoto(record[f]).catch(() => {});
        }
      }
      await DB.delete('records', id);
      // pet lastVisitDate 재계산
      if (record && record.petId) await this._recalcPetLastVisit(record.petId);
      // 고객 태그 재계산 (방문 횟수 기반, 수동 변경 보존)
      if (record && record.customerId) {
        try { await this._recalcCustomerTag(record.customerId); }
        catch (e) { console.warn('Auto-tag error:', e); }
      }
      App.showToast('미용 기록이 삭제되었습니다.');
      if (opts.fromForm) {
        // 모달 위 confirm 의 history.back() 이 처리된 뒤 모달을 닫는다
        await new Promise(r => setTimeout(r, 180));
        App.closeModal();
      }
      App.handleRoute();
    } catch (err) {
      console.error('deleteRecord error:', err);
      App.showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  },

  // 고객 자동 태그 재계산 — 수동으로 바꾼 태그는 보존
  async _recalcCustomerTag(customerId) {
    const custRecords = await DB.getByIndex('records', 'customerId', customerId);
    const cust = await DB.get('customers', customerId);
    if (!cust) return;
    const vc = custRecords.length;
    const newAutoTag = vc === 0 ? null : vc <= 3 ? 'new' : vc <= 10 ? 'normal' : 'regular';
    const prevAutoTag = cust.autoTag;
    const existingTags = cust.tags || [];
    const levelTags = existingTags.filter(t => ['new', 'normal', 'regular'].includes(t));
    const isUntouched = levelTags.length === 0 || (levelTags.length === 1 && levelTags[0] === prevAutoTag);
    if (!isUntouched) return;
    const filtered = existingTags.filter(t => t !== prevAutoTag);
    if (newAutoTag && !filtered.includes(newAutoTag)) filtered.push(newAutoTag);
    cust.tags = filtered;
    cust.autoTag = newAutoTag;
    await DB.update('customers', cust);
  },

  async showPetInfoBox(pet) {
    const existing = document.getElementById('pet-info-display');
    if (existing) existing.remove();

    const hasNotes = pet.temperament || pet.healthNotes || pet.allergies || pet.preferredStyle;
    if (!hasNotes) return;

    const box = document.createElement('div');
    box.id = 'pet-info-display';
    box.className = 'pet-info-box';
    box.innerHTML = `
      <div class="pet-info-title">${App.icon('alert')} ${App.escapeHtml(pet.name)} 특이사항</div>
      ${pet.temperament ? `<div class="pet-info-row"><span class="pet-info-label">성격</span> ${App.escapeHtml(pet.temperament)}</div>` : ''}
      ${pet.healthNotes ? `<div class="pet-info-row"><span class="pet-info-label">건강</span> ${App.escapeHtml(pet.healthNotes)}</div>` : ''}
      ${pet.allergies ? `<div class="pet-info-row"><span class="pet-info-label">알러지</span> ${App.escapeHtml(pet.allergies)}</div>` : ''}
      ${pet.preferredStyle ? `<div class="pet-info-row"><span class="pet-info-label">선호 스타일</span> ${App.escapeHtml(pet.preferredStyle)}</div>` : ''}
    `;

    const memo = document.getElementById('f-memo');
    if (memo) memo.parentElement.insertBefore(box, memo.parentElement.firstChild);
  },

  // 일일 정산표
  async showDailyReport(targetDate) {
    const reportDate = targetDate || App.getToday();
    // date 인덱스로 해당 날짜만 직접 조회 (전체 스캔 회피)
    const todayRecs = await DB.getByDateRange('records', 'date', reportDate, reportDate);
    const totalRevenue = todayRecs.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 결제 수단별 집계
    const paymentBreakdown = {};
    const paymentMethods = ['cash', 'card', 'transfer', 'unpaid'];
    paymentMethods.forEach(m => { paymentBreakdown[m] = { count: 0, amount: 0 }; });
    todayRecs.forEach(r => {
      const method = r.paymentMethod || 'none';
      if (!paymentBreakdown[method]) paymentBreakdown[method] = { count: 0, amount: 0 };
      paymentBreakdown[method].count++;
      paymentBreakdown[method].amount += App.getRecordAmount(r);
    });

    // 미용사별 집계
    const groomerBreakdown = {};
    todayRecs.forEach(r => {
      const name = r.groomer || '미지정';
      if (!groomerBreakdown[name]) groomerBreakdown[name] = { count: 0, amount: 0 };
      groomerBreakdown[name].count++;
      groomerBreakdown[name].amount += App.getRecordAmount(r);
    });

    // 고객/반려견 정보 조회
    const [customers, pets] = await Promise.all([DB.getAll('customers'), DB.getAll('pets')]);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const reportDow = dayNames[new Date(reportDate + 'T00:00:00').getDay()];
    const groomerMax = Object.values(groomerBreakdown).reduce((m, d) => Math.max(m, d.amount), 1);
    const paymentColors = { cash: 'var(--success)', card: 'var(--primary)', transfer: 'var(--info)', unpaid: 'var(--danger)' };

    const content = `
      <div id="daily-report-content">
        <!-- 헤더 -->
        <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--border)">
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px">
            <input type="date" id="report-date-picker" value="${reportDate}" style="width:auto;padding:8px 14px;font-size:1rem;font-weight:700;color:var(--text-primary);text-align:center;border-radius:8px;min-height:44px">
          </div>
          <div style="font-size:0.88rem;color:var(--text-muted);margin-bottom:4px">${reportDow}요일</div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--primary)">${App.formatCurrency(totalRevenue)}</div>
          <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:0.88rem">
            <span style="color:var(--text-secondary)">총 <strong>${todayRecs.length}</strong>건</span>
            ${todayRecs.length > 0 ? `<span style="color:var(--text-secondary)">객단가 <strong>${App.formatCurrency(Math.round(totalRevenue / todayRecs.length))}</strong></span>` : ''}
          </div>
        </div>

        <!-- 결제 수단별 -->
        <div style="margin-bottom:20px">
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">${App.icon('card')} 결제 수단별</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${paymentMethods.map(m => {
              const data = paymentBreakdown[m];
              if (!data || data.count === 0) return '';
              const pct = totalRevenue > 0 ? Math.round((data.amount / totalRevenue) * 100) : 0;
              return `<div style="flex:1;min-width:70px;background:var(--bg);border-radius:10px;padding:12px;text-align:center${m === 'unpaid' ? ';border:1.5px solid var(--danger)' : ''}">
                <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px">${this.getPaymentLabel(m)}</div>
                <div style="font-weight:800;font-size:1rem;color:${paymentColors[m] || 'var(--text-primary)'}">${App.formatCurrency(data.amount)}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${data.count}건 · ${pct}%</div>
              </div>`;
            }).filter(Boolean).join('')}
          </div>
        </div>

        <!-- 미용사별 -->
        ${Object.keys(groomerBreakdown).length > 0 ? `
        <div style="margin-bottom:20px">
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">${App.icon('scissors')} 미용사별</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${Object.entries(groomerBreakdown).sort((a, b) => b[1].amount - a[1].amount).map(([name, data]) => {
              const pct = Math.max(5, Math.round((data.amount / groomerMax) * 100));
              return `<div style="background:var(--bg);border-radius:10px;padding:10px 14px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                  <span style="font-weight:700">${App.escapeHtml(name)} <span style="font-weight:400;color:var(--text-muted);font-size:0.82rem">${data.count}건</span></span>
                  <strong style="color:var(--primary)">${App.formatCurrency(data.amount)}</strong>
                </div>
                <div style="height:6px;background:var(--border-light);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:var(--primary);border-radius:3px"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}

        <!-- 상세 내역 (시간순) -->
        <div>
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">${App.icon('list')} 상세 내역</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${todayRecs.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:16px">기록이 없습니다</p>' :
              todayRecs.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).map(r => {
                const customer = customerMap[r.customerId];
                const pet = petMap[r.petId];
                const time = r.createdAt ? new Date(r.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
                const svcDisplay = r.service || r.style || '';
                const isUnpaid = r.paymentMethod === 'unpaid';
                return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:8px${isUnpaid ? ';border-left:3px solid var(--danger)' : ''}">
                  <span style="font-weight:700;color:var(--primary);min-width:40px;font-size:0.85rem">${time}</span>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:0.9rem">${App.escapeHtml(pet?.name || '-')} <span style="font-weight:400;color:var(--text-muted);font-size:0.82rem">${App.escapeHtml(App.getCustomerLabel(customer))}</span></div>
                    ${svcDisplay ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:1px">${App.escapeHtml(svcDisplay)}${r.groomer ? ' · ' + App.escapeHtml(r.groomer) : ''}</div>` : (r.groomer ? `<div style="font-size:0.78rem;color:var(--text-secondary);margin-top:1px">${App.escapeHtml(r.groomer)}</div>` : '')}
                  </div>
                  <div style="text-align:right;flex-shrink:0">
                    <div style="font-weight:700;font-size:0.9rem">${App.formatCurrency(App.getRecordAmount(r))}</div>
                    <div style="font-size:0.72rem;color:${isUnpaid ? 'var(--danger)' : 'var(--text-muted)'}">${this.getPaymentLabel(r.paymentMethod)}</div>
                  </div>
                </div>`;
              }).join('')}
          </div>
        </div>
      </div>
      <div style="text-align:center;margin-top:20px">
        <button class="btn btn-primary" onclick="window.print()">${App.icon('print')} 인쇄</button>
      </div>
    `;

    App.showModal({
      title: '일일 정산표',
      content,
      hideFooter: true
    });

    // Date picker change handler
    document.getElementById('report-date-picker')?.addEventListener('change', (e) => {
      this.showDailyReport(e.target.value);
    });
  },

  async showReceipt(recordId) {
    const record = await DB.get('records', recordId);
    if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }

    const [customer, pet, services] = await Promise.all([
      DB.get('customers', record.customerId),
      DB.get('pets', record.petId),
      DB.getAll('services')
    ]);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s);
    const shopName = await DB.getSetting('shopName') || '펫살롱';
    const shopPhone = await DB.getSetting('shopPhone') || '';
    const shopAddress = await DB.getSetting('shopAddress') || '';

    // 금액은 기록에 저장된 값만 쓴다 (현재 메뉴 가격으로 찍으면 가격 변경 후 영수증 줄 합이 소계와 어긋난다)
    // 메뉴는 포함 항목(includedItems) 표시용으로만 조회
    const includedRowFor = (name) => {
      const nm = App.normalizeServiceName(name);
      const svc = services.find(s => s.isActive !== false && App.normalizeServiceName(s.name) === nm)
        || services.find(s => App.normalizeServiceName(s.name) === nm);
      const included = Array.isArray(svc?.includedItems) ? svc.includedItems : [];
      return included.length > 0 ? `<div style="padding-left:8px;font-size:11px;color:var(--text-secondary)">└ ${included.map(i => App.escapeHtml(i)).join(' · ')}</div>` : '';
    };
    const addonPrice = Number(record.addonPrice) || 0;
    let totalPrice = Number(record.totalPrice) || 0;
    let serviceLinesHtml = '';
    if (record.service) {
      const mainPrice = record.servicePrice != null ? (Number(record.servicePrice) || 0) : Math.max(0, totalPrice - addonPrice);
      totalPrice = mainPrice + addonPrice; // 줄 합 = 소계
      serviceLinesHtml = `<div class="receipt-row"><span>${App.escapeHtml(record.service)}</span><span>${App.formatCurrency(mainPrice)}</span></div>${includedRowFor(record.service)}`;
      const addons = Array.isArray(record.addons) ? record.addons : [];
      // 항목별 가격은 저장되지 않으므로 이름만 나열하고, 추가 비용 합계는 한 줄로 표시
      serviceLinesHtml += addons.map(a => `<div class="receipt-row" style="padding-left:8px"><span>+ ${App.escapeHtml(a)}</span><span></span></div>`).join('');
      if (addonPrice > 0) serviceLinesHtml += `<div class="receipt-row"><span>추가 항목</span><span>${App.formatCurrency(addonPrice)}</span></div>`;
    } else {
      // 구 형식 (serviceIds) — 서비스별 금액이 저장되지 않아 이름만. 하나뿐이면 소계를 그 줄에 표시
      const legacy = (record.serviceIds || []).map(sid => serviceMap[sid]).filter(Boolean);
      serviceLinesHtml = legacy.map(s => `<div class="receipt-row"><span>${App.escapeHtml(s.name)}</span><span>${legacy.length === 1 ? App.formatCurrency(totalPrice) : ''}</span></div>${includedRowFor(s.name)}`).join('');
    }
    const discount = Number(record.discount) || 0;
    const extraCharge = Number(record.extraCharge) || 0;
    const finalPrice = record.finalPrice != null ? record.finalPrice : (totalPrice - discount + extraCharge);

    const receiptContent = `
      <div id="receipt-print-area">
        <style>
          @media print {
            body * { visibility: hidden !important; }
            #receipt-print-area, #receipt-print-area * { visibility: visible !important; }
            #receipt-print-area { position: absolute; left: 0; top: 0; width: 100%; }
            .modal-overlay, .modal-header, .modal-footer, #modal-close { display: none !important; }
          }
          .receipt { max-width: 320px; margin: 0 auto; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.6; }
          .receipt-header { text-align: center; margin-bottom: 12px; }
          .receipt-title { font-size: 16px; font-weight: 800; }
          .receipt-subtitle { font-size: 12px; color: var(--text-secondary); }
          .receipt-divider { border: none; border-top: 1px dashed var(--border); margin: 8px 0; }
          .receipt-row { display: flex; justify-content: space-between; padding: 2px 0; }
          .receipt-row.total { font-weight: 800; font-size: 15px; border-top: 2px solid var(--text); padding-top: 6px; margin-top: 4px; }
          .receipt-footer { text-align: center; margin-top: 16px; font-size: 12px; color: var(--text-secondary); }
        </style>
        <div class="receipt">
          <div class="receipt-header">
            <div class="receipt-title">${App.escapeHtml(shopName)}</div>
            <div class="receipt-subtitle">애견 미용 영수증</div>
            ${shopAddress ? `<div class="receipt-subtitle">${App.escapeHtml(shopAddress)}</div>` : ''}
            ${shopPhone ? `<div class="receipt-subtitle">Tel: ${App.escapeHtml(shopPhone)}</div>` : ''}
          </div>
          <hr class="receipt-divider">
          <div class="receipt-row"><span>날짜</span><span>${App.formatDate(record.date)}</span></div>
          <div class="receipt-row"><span>고객</span><span>${App.escapeHtml(App.getCustomerLabel(customer))}</span></div>
          <div class="receipt-row"><span>반려견</span><span>${App.escapeHtml(pet?.name || '-')}${pet?.breed ? ' (' + App.escapeHtml(pet.breed) + ')' : ''}</span></div>
          ${record.groomer ? `<div class="receipt-row"><span>담당</span><span>${App.escapeHtml(record.groomer)}</span></div>` : ''}
          <hr class="receipt-divider">
          <div style="font-weight:700;margin-bottom:4px">서비스 내역</div>
          ${serviceLinesHtml || '<div style="color:var(--text-muted)">서비스 미지정</div>'}
          <hr class="receipt-divider">
          <div class="receipt-row"><span>소계</span><span>${App.formatCurrency(totalPrice)}</span></div>
          ${discount > 0 ? `<div class="receipt-row text-danger"><span>할인</span><span>-${App.formatCurrency(discount)}</span></div>` : ''}
          ${extraCharge > 0 ? `<div class="receipt-row"><span>추가요금</span><span>+${App.formatCurrency(extraCharge)}</span></div>` : ''}
          <div class="receipt-row total"><span>합계</span><span>${App.formatCurrency(finalPrice)}</span></div>
          ${record.paidAt && record.paidAt !== record.date ? `<div class="receipt-row"><span>수금일</span><span>${App.formatDate(record.paidAt)}</span></div>` : ''}
          ${record.paymentMethod ? `<div class="receipt-row"><span>결제</span><span>${this.getPaymentLabel(record.paymentMethod)}</span></div>` : ''}
          <div class="receipt-footer">
            <p>감사합니다 ♥</p>
          </div>
        </div>
      </div>
      <div style="text-align:center;margin-top:16px">
        <button class="btn btn-primary" onclick="window.print()">${App.icon('print')} 인쇄</button>
      </div>
    `;

    App.showModal({
      title: '영수증',
      content: receiptContent,
      hideFooter: true
    });
  },

  // 같은 펫의 가장 최근 미용 기록 조회 (excludeId는 수정 모드에서 자기 자신 제외)
  async _findLastRecordForPet(petId, excludeId) {
    if (!petId) return null;
    const records = await DB.getByIndex('records', 'petId', petId);
    return records
      .filter(r => r.id !== excludeId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null;
  },

  // 펫 결정 후 "이전 미용과 같음" 버튼 표시/숨김 + 캐시
  async _refreshLastRecordButton(petId, excludeId) {
    const copyArea = document.getElementById('f-copy-last-area');
    if (!copyArea) return;
    const last = await this._findLastRecordForPet(petId, excludeId);
    this._lastRecordForPet = last;
    if (last) {
      copyArea.style.display = 'block';
      const hint = document.getElementById('copy-last-hint');
      if (hint) hint.textContent = `(${App.formatDate(last.date)})`;
    } else {
      copyArea.style.display = 'none';
    }
  },

  // 마지막 기록 데이터로 폼 필드 자동 채움 (단골 손님 빠른 입력)
  // 컨디션/협조도/결제수단/메모는 매번 다르므로 채우지 않음
  _applyLastRecord() {
    const last = this._lastRecordForPet;
    if (!last) return;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    setVal('f-service', last.service || '');
    setVal('f-servicePrice', last.servicePrice || last.totalPrice || 0);
    setVal('f-style', last.style || '');
    setVal('f-groomer', last.groomer || '');
    setVal('f-addonPrice', last.addonPrice || 0);
    // 추가 항목 태그 복원
    if (Array.isArray(last.addons) && last.addons.length > 0) {
      const tagsDiv = document.getElementById('f-addon-tags');
      if (tagsDiv) {
        tagsDiv.innerHTML = last.addons.map(a => '<span class="badge badge-info addon-tag" style="cursor:pointer;padding:6px 10px" title="클릭하여 제거">' + App.escapeHtml(a) + ' ×</span>').join('');
      }
    }
    // 합계 자동 재계산
    document.getElementById('f-servicePrice')?.dispatchEvent(new Event('input'));
    App.showToast('이전 미용 기록을 가져왔습니다.');
  },

  getPaymentLabel(method) {
    const labels = { cash: '현금', card: '카드', transfer: '이체', unpaid: '미결제' };
    return labels[method] || '-';
  },

  // ========== 사진 카드 생성 & 공유 ==========
  CARD_TEMPLATES: {
    classic: { name: '클래식', color: '#1A1A1A', bgColor: '#FFFFFF', emoji: '\u2702', footerBg: '#1A1A1A' },
    film: { name: '필름', color: '#8B7355', bgColor: '#F5F0E8', emoji: '\uD83C\uDFDE', footerBg: '#5C4A32' },
    pastel: { name: '파스텔', color: '#DB2777', bgColor: '#FFF0F5', emoji: '\uD83C\uDF37', footerBg: '#F9A8D4' },
    dark: { name: '다크', color: '#C9A96E', bgColor: '#0F172A', emoji: '\u2728', footerBg: '#1E293B' }
  },

  // --- Helper: load image from src (base64 or url) ---
  _loadImg(src) {
    return new Promise(resolve => {
      if (!src) { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  },

  // --- Helper: draw rounded rect ---
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  },

  // --- Helper: draw image covering area (object-fit:cover) ---
  // img._meta = { offsetX: -50~+50, offsetY: -50~+50, zoom: 1.0~2.0 } 가 있으면 적용
  _drawImageCover(ctx, img, x, y, w, h) {
    if (!img) {
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#94A3B8';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No Photo', x + w / 2, y + h / 2 + 5);
      return;
    }
    const iw = img.width, ih = img.height;
    const scale = Math.max(w / iw, h / ih);
    let sw = w / scale, sh = h / scale;
    // 사용자 슬라이더 메타 (offsetX/Y -50~+50, zoom 1~2)
    const meta = img._meta || { offsetX: 0, offsetY: 0, zoom: 1.0 };
    const zoom = Math.max(1.0, Math.min(3.0, meta.zoom || 1.0));
    sw /= zoom; sh /= zoom;
    // offsetX/Y -50~+50 → 0~1 비율
    const fracX = 0.5 + (meta.offsetX || 0) / 100;
    const fracY = 0.5 + (meta.offsetY || 0) / 100;
    let sx = (iw - sw) * fracX;
    let sy = (ih - sh) * fracY;
    // 경계 안전 클램프
    sx = Math.max(0, Math.min(iw - sw, sx));
    sy = Math.max(0, Math.min(ih - sh, sy));
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  },

  // --- Helper: truncate text to fit width ---
  _truncText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 0 && ctx.measureText(t + '...').width > maxWidth) t = t.slice(0, -1);
    return t + '...';
  },

  // --- Helper: draw header (logo or text) ---
  async _drawHeader(ctx, x, y, w, h, shopName, emoji, mainColor, logo, fontFamily) {
    ctx.fillStyle = mainColor;
    ctx.fillRect(x, y, w, h);
    if (logo) {
      const logoImg = await this._loadImg(logo);
      if (logoImg) {
        const logoH = h - 20;
        const logoW = logoImg.width * (logoH / logoImg.height);
        ctx.drawImage(logoImg, x + (w - logoW) / 2, y + 10, logoW, logoH);
        return;
      }
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px ' + fontFamily;
    ctx.textAlign = 'center';
    ctx.fillText(emoji + ' ' + shopName, x + w / 2, y + h / 2 + 8);
  },

  // --- Helper: draw footer bar ---
  _drawFooter(ctx, x, y, w, h, footerParts, mainColor, fontFamily) {
    ctx.fillStyle = mainColor;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '14px ' + fontFamily;
    ctx.textAlign = 'center';
    const text = footerParts.filter(Boolean).join(' | ');
    ctx.fillText(this._truncText(ctx, text, w - 40), x + w / 2, y + h / 2 + 5);
  },

  // --- Helper: build info lines based on toggles ---
  _buildInfoLines(record, pet, serviceNames, settings) {
    const lines = [];
    if (settings.showPetInfo && pet) {
      const parts = [pet.name];
      if (pet.breed) parts.push(pet.breed);
      lines.push(parts.join(' | '));
    }
    if (settings.showDate) lines.push(App.formatDate(record.date));
    if (settings.showService && serviceNames) lines.push('\uC11C\uBE44\uC2A4: ' + serviceNames);
    if (settings.showPrice && record.finalPrice != null) lines.push('\uAE08\uC561: ' + App.formatCurrency(App.getRecordAmount(record)));
    if (settings.showGroomer && record.groomer) lines.push('\uB2F4\uB2F9: ' + record.groomer);
    if (settings.showNextVisit && record.nextVisitDate) lines.push('\uB2E4\uC74C \uBC29\uBB38: ' + App.formatDate(record.nextVisitDate));
    return lines;
  },

  // ===== Main canvas generation (used by both real cards and preview) =====
  async _generateCardCanvas(record, customer, pet, shopName, shopPhone, serviceNames, designSettings) {
    const tplPreset = this.CARD_TEMPLATES[designSettings.template] || this.CARD_TEMPLATES.classic;
    let mainColor = designSettings.mainColor || tplPreset.color;
    let bgColor = tplPreset.bgColor;
    const emoji = tplPreset.emoji;
    const fontFamily = this._cardFontStack(designSettings.fontKey);
    if (designSettings.fontKey && designSettings.fontKey !== 'system') {
      const sample = [shopName, shopPhone, pet?.name, designSettings.headline, designSettings.subline, designSettings.footerMessage,
        serviceNames, App.formatDate(record.date), '0123456789·♥!?'].filter(Boolean).join('');
      await this._ensureCardFont(designSettings.fontKey, sample);
    }
    const footerMessage = designSettings.footerMessage || '감사합니다 \u2665';
    const layout = designSettings.layout || 'strip2';
    const s = designSettings; // shorthand

    // 정보 줄을 쓰는 레이아웃(2컷 등)은 바로 위에 반려견 이름과 날짜를 이미 크게 그린다 — 줄에서는 빼고 견종만 남긴다
    // (예전엔 '콩이 / 2026-09-23' 아래에 '콩이 | 말티즈 / 2026-09-23'이 또 나왔다)
    const _dupDate = App.formatDate(record.date);
    const infoLines = this._buildInfoLines(record, pet, serviceNames, s)
      .filter(l => l !== _dupDate)
      .map(l => (pet?.name && l.startsWith(pet.name + ' | ')) ? l.slice(pet.name.length + 3) : l)
      .filter(l => l && l !== pet?.name);
    // 마이그레이션된 사진은 photos 스토어에서 로드, 아니면 인라인
    const photoBefore = record.photoBefore || (record.photoBeforeId ? await DB.getPhoto(record.photoBeforeId) : null);
    const photoAfter = record.photoAfter || (record.photoAfterId ? await DB.getPhoto(record.photoAfterId) : null);
    const imgBefore = await this._loadImg(photoBefore);
    const imgAfter = await this._loadImg(photoAfter);

    // 9-Point + Zoom 메타 attach (record._photoMetas 사용)
    const _photoMetas = record._photoMetas || {};
    if (imgBefore) imgBefore._meta = _photoMetas.photoBefore || { offsetX: 0, offsetY: 0, zoom: 1.0 };
    if (imgAfter) imgAfter._meta = _photoMetas.photoAfter || { offsetX: 0, offsetY: 0, zoom: 1.0 };

    // 로고 이미지 로드
    const _logoImg = s.logo ? await this._loadImg(s.logo) : null;
    // 로고 위치 / 크기 설정 (사용자 선택, feed/story 레이아웃에 적용)
    const _logoSizeMul = ({ small: 0.7, medium: 1.0, large: 1.4, xl: 1.8 })[s.logoSize] || 1.0;
    const _logoPos = s.logoPosition || 'top';
    // 로고 그리기 헬퍼: 레이아웃별 기본 높이·기본 y 받아서 위치/크기 옵션 적용
    const _drawLogoAt = (ctx, layoutCfg) => {
      if (!_logoImg || _logoPos === 'none') return false;
      const baseH = layoutCfg.baseH;
      const lh = baseH * _logoSizeMul;
      const lw = _logoImg.width * (lh / _logoImg.height);
      const W = layoutCfg.W, H = layoutCfg.H;
      let y;
      switch (_logoPos) {
        case 'top-safe': y = Math.round(H * 0.12); break;
        case 'center':   y = (H - lh) / 2; break;
        case 'bottom':   y = H - lh - layoutCfg.bottomPad; break;
        case 'top':
        default:         y = layoutCfg.topY; break;
      }
      ctx.save();
      if (_logoPos === 'center') ctx.globalAlpha = 0.45;
      ctx.drawImage(_logoImg, (W - lw) / 2, y, lw, lh);
      ctx.restore();
      return true;
    };

    // 커스텀 테마 오버라이드
    if (s.customBgColor) bgColor = s.customBgColor;
    if (s.customAccentColor) mainColor = s.customAccentColor;
    const _customBgImg = s.customBgImage ? await this._loadImg(s.customBgImage) : null;

    // Determine if dark background for text color decisions
    const _isDark = (hex) => {
      if (!hex) return false;
      const c = hex.replace('#', '');
      const r = parseInt(c.substr(0, 2), 16);
      const g = parseInt(c.substr(2, 2), 16);
      const b = parseInt(c.substr(4, 2), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 140;
    };
    const darkBg = s.customTextColor ? _isDark(s.customTextColor) : _isDark(bgColor);
    const textColor = s.customTextColor || (darkBg ? '#FFFFFF' : '#1a1a1a');
    // rgba 변환 (구형 Android 8자리 hex 미지원 대응)
    const _hexToRgba = (hex, alpha) => {
      const c = hex.replace('#', '');
      const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    };
    const textSub = s.customTextColor ? _hexToRgba(textColor, 0.6) : (darkBg ? 'rgba(255,255,255,0.6)' : '#64748B');
    const borderColor = darkBg ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
    // 배경 이미지 사용 시 텍스트 배경 박스 활성화
    const _useTextBox = !!_customBgImg;

    const petName = pet?.name || '';
    const dateStr = App.formatDate(record.date);

    // 3·4번째 사진도 로드 (photos 스토어 fallback 포함)
    const photo3Raw = record.photo3 || (record.photo3Id ? await DB.getPhoto(record.photo3Id) : null);
    const photo4Raw = record.photo4 || (record.photo4Id ? await DB.getPhoto(record.photo4Id) : null);
    const img3 = await this._loadImg(photo3Raw);
    const img4 = await this._loadImg(photo4Raw);
    if (img3) img3._meta = _photoMetas.photo3 || { offsetX: 0, offsetY: 0, zoom: 1.0 };
    if (img4) img4._meta = _photoMetas.photo4 || { offsetX: 0, offsetY: 0, zoom: 1.0 };

    // Build photo slots based on available images
    const photos3 = [imgBefore || imgAfter, imgAfter || imgBefore, img3 || imgBefore || imgAfter];
    const photos4 = [
      imgBefore || imgAfter,
      imgAfter || imgBefore,
      img3 || imgBefore || imgAfter,
      img4 || imgAfter || imgBefore
    ];

    // Helper: draw placeholder
    const _placeholder = (ctx, x, y, w, h) => {
      ctx.fillStyle = darkBg ? '#333333' : '#E2E8F0';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = darkBg ? '#666666' : '#94A3B8';
      ctx.font = '28px ' + fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📷', x + w / 2, y + h / 2);
      ctx.textBaseline = 'alphabetic';
    };

    // Helper: draw image or placeholder into rect
    const _drawPhoto = (ctx, img, x, y, w, h, radius) => {
      ctx.save();
      if (radius) { this._roundRect(ctx, x, y, w, h, radius); ctx.clip(); }
      if (img) {
        this._drawImageCover(ctx, img, x, y, w, h);
      } else {
        _placeholder(ctx, x, y, w, h);
      }
      ctx.restore();
    };

    // 사진 수에 따라 한 영역을 나눠 그린다 — 1장: 그대로, 2장: 나란히(전·후), 3장: 위 1 + 아래 2, 4장: 2×2
    // (인스타 피드·스토리에서 4분할 요청. 빈 칸을 만들지 않고 고른 장수만큼만 나눈다)
    // 4컷 격자 — 칸마다 둥근 모서리로 띄워 그린다. 4장보다 적으면 _drawSplit 처럼 장수만큼 나눈다
    const _drawGrid4 = (ctx, imgs, x, y, w, h, gap, radius) => {
      const list = imgs.filter(Boolean);
      if (list.length < 4) { _drawSplit(ctx, imgs, x, y, w, h, gap, radius); return; }
      const cw = (w - gap) / 2, ch = (h - gap) / 2;
      _drawPhoto(ctx, list[0], x, y, cw, ch, radius);
      _drawPhoto(ctx, list[1], x + cw + gap, y, cw, ch, radius);
      _drawPhoto(ctx, list[2], x, y + ch + gap, cw, ch, radius);
      _drawPhoto(ctx, list[3], x + cw + gap, y + ch + gap, cw, ch, radius);
    };
    const _drawSplit = (ctx, imgs, x, y, w, h, gap, radius) => {
      const list = imgs.filter(Boolean);
      const n = Math.min(list.length, 4);
      if (n <= 1) { _drawPhoto(ctx, list[0] || null, x, y, w, h, radius); return; }
      const cw = (w - gap) / 2, ch = (h - gap) / 2;
      if (n === 2) {
        _drawPhoto(ctx, list[0], x, y, cw, h, radius);
        _drawPhoto(ctx, list[1], x + cw + gap, y, cw, h, radius);
      } else if (n === 3) {
        _drawPhoto(ctx, list[0], x, y, w, ch, radius);
        _drawPhoto(ctx, list[1], x, y + ch + gap, cw, ch, radius);
        _drawPhoto(ctx, list[2], x + cw + gap, y + ch + gap, cw, ch, radius);
      } else {
        _drawPhoto(ctx, list[0], x, y, cw, ch, radius);
        _drawPhoto(ctx, list[1], x + cw + gap, y, cw, ch, radius);
        _drawPhoto(ctx, list[2], x, y + ch + gap, cw, ch, radius);
        _drawPhoto(ctx, list[3], x + cw + gap, y + ch + gap, cw, ch, radius);
      }
    };

    const canvas = document.createElement('canvas');
    let ctx;

    // ===== Layout A: strip4 (4컷 가로 4:3 strip) =====
    if (layout === 'strip4') {
      const W = 400, H = 1200;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);

      const pad = 30;
      const photoW = W - pad * 2; // 340
      const photoH = Math.round(photoW * 3 / 4); // 255 (4:3 landscape)
      const gap = 12;

      // Shop name at top
      ctx.fillStyle = textSub; ctx.font = '14px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(shopName, W / 2, 30);

      let topY = 50;
      for (let i = 0; i < 4; i++) {
        _drawPhoto(ctx, photos4[i], pad, topY, photoW, photoH, 6);
        topY += photoH + gap;
      }

      // Pet name + date at bottom
      const bottomY = topY + 10;
      ctx.fillStyle = textColor; ctx.font = 'bold 18px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(petName, W / 2, bottomY);
      ctx.fillStyle = textSub; ctx.font = '13px ' + fontFamily;
      ctx.fillText(dateStr, W / 2, bottomY + 22);

      // Info lines
      let iy = bottomY + 44;
      ctx.font = '12px ' + fontFamily; ctx.fillStyle = textSub;
      infoLines.slice(0, 3).forEach(line => {
        ctx.fillText(this._truncText(ctx, line, photoW), W / 2, iy); iy += 18;
      });
    }

    // ===== Layout B: strip3 (3컷 정방형 strip) =====
    else if (layout === 'strip3') {
      const W = 400, H = 1200;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);

      const pad = 30;
      const photoS = W - pad * 2; // 340 square
      const gap = 12;

      // Shop name
      ctx.fillStyle = textSub; ctx.font = '14px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(shopName, W / 2, 30);

      let topY = 50;
      for (let i = 0; i < 3; i++) {
        _drawPhoto(ctx, photos3[i], pad, topY, photoS, photoS, 6);
        topY += photoS + gap;
      }

      // Pet name + date
      const bottomY = topY + 10;
      ctx.fillStyle = textColor; ctx.font = 'bold 18px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(petName, W / 2, bottomY);
      ctx.fillStyle = textSub; ctx.font = '13px ' + fontFamily;
      ctx.fillText(dateStr, W / 2, bottomY + 22);
    }

    // ===== Layout C: circle (원형) =====
    else if (layout === 'circle') {
      const W = 500, H = 600;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);

      // Shop name
      ctx.fillStyle = textSub; ctx.font = '14px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(shopName, W / 2, 36);

      // Circular photo
      const radius = 150;
      const cx = W / 2, cy = 230;
      const mainImg = imgAfter || imgBefore;

      // Circle border
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = mainColor;
      ctx.fill();

      // Clip and draw
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      if (mainImg) {
        this._drawImageCover(ctx, mainImg, cx - radius, cy - radius, radius * 2, radius * 2);
      } else {
        _placeholder(ctx, cx - radius, cy - radius, radius * 2, radius * 2);
      }
      ctx.restore();

      // Pet name + date
      const infoY = cy + radius + 40;
      ctx.fillStyle = textColor; ctx.font = 'bold 20px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(petName, W / 2, infoY);
      ctx.fillStyle = textSub; ctx.font = '14px ' + fontFamily;
      ctx.fillText(dateStr, W / 2, infoY + 26);

      // Service + groomer
      let iy = infoY + 50;
      ctx.font = '13px ' + fontFamily; ctx.fillStyle = textSub;
      const shortInfo = [];
      if (s.showService && serviceNames) shortInfo.push(serviceNames);
      if (s.showGroomer && record.groomer) shortInfo.push(record.groomer);
      if (shortInfo.length) {
        ctx.fillText(shortInfo.join(' | '), W / 2, iy);
      }

      // Footer message
      ctx.fillStyle = mainColor; ctx.font = '13px ' + fontFamily;
      ctx.fillText(footerMessage, W / 2, H - 30);
    }

    // ===== Layout D: single (1컷 증명사진) =====
    else if (layout === 'single') {
      // ===== 폴라로이드 모던 미니멀 (1080×1080, 정사각, 옅은 크림 default + 사진 큼) =====
      const W = 1080, H = 1080;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');

      // 배경 — 사용자 커스텀 색이 있으면 그 색, 아니면 옅은 크림 (모던 폴라로이드 기본)
      const polarBg = (s.template === 'custom' && s.customBgColor) ? s.customBgColor : '#FAFAF7';
      ctx.fillStyle = polarBg; ctx.fillRect(0, 0, W, H);
      if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);

      // 사진 크기: 모던(default 920×920, pad 80) / 미니멀(940×940, pad 70)
      const isPolaroidMinimal = s.polaroidSize === 'minimal';
      const pad = isPolaroidMinimal ? 70 : 80;
      const photoS = W - pad * 2;
      const mainImg = imgAfter || imgBefore;

      // 사진 아래 살짝 그림자
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#000';
      ctx.fillRect(pad, pad, photoS, photoS);
      ctx.restore();

      // 사진
      _drawPhoto(ctx, mainImg, pad, pad, photoS, photoS, 0);

      // 하단 텍스트 (한 줄, 자유 텍스트 우선 — 헤드라인 비어있으면 반려견 이름)
      const remainingY = pad + photoS;
      const textCenterY = remainingY + (H - remainingY) / 2 + 10;
      // 예전엔 다른 레이아웃의 지역 변수(_hasHeadline)를 참조해 폴라로이드가 항상 오류로 멈췄다
      const polarText = s.headline ? s.headline : (s.customShowPet ? petName : '');
      const polarTextColor = (s.template === 'custom' && s.customTextColor) ? s.customTextColor : '#1A1A1A';
      ctx.fillStyle = polarTextColor;
      ctx.font = 'bold 36px ' + fontFamily;
      ctx.textAlign = 'center';
      if (polarText) ctx.fillText(polarText, W / 2, textCenterY);
      if (s.customShowDate) { ctx.fillStyle = s.customTextColor ? textSub : '#64748B'; ctx.font = '20px ' + fontFamily; ctx.fillText(dateStr, W / 2, textCenterY + (polarText ? 34 : 0)); }
    }

    // ===== Layout E: polaroid (폴라로이드) =====
    else if (layout === 'polaroid') {
      const W = 480, H = 620;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');

      // Outer background (slight gray for shadow effect)
      ctx.fillStyle = darkBg ? bgColor : '#F0F0F0';
      ctx.fillRect(0, 0, W, H);

      // Polaroid card with drop shadow
      const cardX = 20, cardY = 15, cardW = W - 40, cardH = H - 30;

      // Shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;
      this._roundRect(ctx, cardX, cardY, cardW, cardH, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();

      // Photo area (square, inside the card)
      const photoPad = 24;
      const photoX = cardX + photoPad;
      const photoY = cardY + photoPad;
      const photoS = cardW - photoPad * 2; // ~392
      const mainImg = imgAfter || imgBefore;

      _drawPhoto(ctx, mainImg, photoX, photoY, photoS, photoS, 0);

      // Bottom text area (polaroid style - thick bottom margin)
      const textAreaY = photoY + photoS + 16;
      ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 18px ' + fontFamily; ctx.textAlign = 'left';
      ctx.fillText(petName + ' \u2665', cardX + photoPad + 4, textAreaY + 6);

      ctx.fillStyle = '#64748B'; ctx.font = '13px ' + fontFamily;
      ctx.fillText(dateStr, cardX + photoPad + 4, textAreaY + 28);

      ctx.fillStyle = '#94A3B8'; ctx.font = '12px ' + fontFamily;
      ctx.fillText(shopName, cardX + photoPad + 4, textAreaY + 48);

      // Footer message on the right
      ctx.fillStyle = mainColor; ctx.font = '12px ' + fontFamily; ctx.textAlign = 'right';
      ctx.fillText(footerMessage, cardX + cardW - photoPad - 4, textAreaY + 48);
      ctx.textAlign = 'center';
    }

    // ===== Layout F: strip2 (2컷 스트립) =====
    else if (layout === 'strip2') {
      const W = 400, H = 900;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
      // 2컷만 프레임(배경 이미지)을 그리지 않아 내 프레임을 골라도 흰 배경으로 나왔다
      if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);

      const pad = 30;
      const photoS = W - pad * 2; // 340
      const gap = 12;

      // Shop name (토글)
      ctx.textAlign = 'center';
      if (s.customShowShop) { ctx.fillStyle = textSub; ctx.font = '14px ' + fontFamily; ctx.fillText(shopName, W / 2, 30); }

      const topY = 50;
      // 사진 위 BEFORE/AFTER 글씨는 넣지 않는다 (사장님 요청 — 사진을 가리고 꼭 전·후 사진만 쓰는 것도 아님)
      // 사진이 1장이면 같은 사진을 두 번 넣지 않고 한 칸으로 크게
      const afterY = topY + photoS + gap;
      if (imgBefore && imgAfter) {
        _drawPhoto(ctx, imgBefore, pad, topY, photoS, photoS, 6);
        _drawPhoto(ctx, imgAfter, pad, afterY, photoS, photoS, 6);
      } else {
        _drawPhoto(ctx, imgBefore || imgAfter, pad, topY, photoS, photoS * 2 + gap, 6);
      }

      // Pet name + date (토글 — 끈 줄은 자리도 비운다)
      const bottomY = afterY + photoS + 28;
      let iy = bottomY;
      ctx.textAlign = 'center';
      if (s.customShowPet) { ctx.fillStyle = textColor; ctx.font = 'bold 18px ' + fontFamily; ctx.fillText(petName, W / 2, iy); iy += 22; }
      if (s.customShowDate) { ctx.fillStyle = textSub; ctx.font = '13px ' + fontFamily; ctx.fillText(dateStr, W / 2, iy); iy += 22; }

      // Info lines
      iy += 2;
      ctx.font = '12px ' + fontFamily; ctx.fillStyle = textSub;
      infoLines.slice(0, 3).forEach(line => {
        ctx.fillText(this._truncText(ctx, line, photoS), W / 2, iy); iy += 18;
      });

      // Footer message
      ctx.fillStyle = mainColor; ctx.font = '12px ' + fontFamily;
      ctx.fillText(footerMessage, W / 2, H - 20);
    }

    // ===== Layout G: grid4 (4컷 2x2 그리드) =====
    else if (layout === 'grid4') {
      const W = 600, H = 750;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);

      const pad = 30;
      const gap = 10;
      const cellW = (W - pad * 2 - gap) / 2; // ~265
      const cellH = cellW; // square cells

      // Shop name
      ctx.fillStyle = textSub; ctx.font = '14px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(shopName, W / 2, 30);

      const topY = 50;
      // Top-left
      _drawPhoto(ctx, photos4[0], pad, topY, cellW, cellH, 6);
      // Top-right
      _drawPhoto(ctx, photos4[1], pad + cellW + gap, topY, cellW, cellH, 6);
      // Bottom-left
      _drawPhoto(ctx, photos4[2], pad, topY + cellH + gap, cellW, cellH, 6);
      // Bottom-right
      _drawPhoto(ctx, photos4[3], pad + cellW + gap, topY + cellH + gap, cellW, cellH, 6);


      // Pet name + date
      const bottomY = topY + cellH * 2 + gap + 32;
      ctx.fillStyle = textColor; ctx.font = 'bold 18px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(petName + ' \u2665', W / 2, bottomY);
      ctx.fillStyle = textSub; ctx.font = '13px ' + fontFamily;
      ctx.fillText(dateStr, W / 2, bottomY + 22);

      // Info lines
      let iy = bottomY + 46;
      ctx.font = '12px ' + fontFamily; ctx.fillStyle = textSub;
      infoLines.slice(0, 2).forEach(line => {
        ctx.fillText(this._truncText(ctx, line, W - pad * 2), W / 2, iy); iy += 18;
      });

      // Footer message
      ctx.fillStyle = mainColor; ctx.font = '12px ' + fontFamily;
      ctx.fillText(footerMessage, W / 2, H - 20);
    }

    // ===== 네컷 세로 (인생네컷 스타일) =====
    else if (layout === 'photobooth') {
      const W = 400, pad = 24, gap = 10;
      const photoW = W - pad * 2;
      const photoH = Math.round(photoW * 3 / 4);
      const H = pad + (photoH + gap) * 4 - gap + 100;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
      if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);

      // 필름 테마: 상하 스프로킷 홀
      if (s.template === 'film') {
        for (let x = 20; x < W; x += 30) {
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          this._roundRect(ctx, x, 6, 14, 10, 3); ctx.fill();
          this._roundRect(ctx, x, H - 16, 14, 10, 3); ctx.fill();
        }
      }

      // 고른 사진만큼 칸을 나눈다 — 2장이면 큰 칸 2개 (예전엔 전·후·전·후로 같은 사진을 반복해 채웠다)
      const realPhotos = [imgBefore, imgAfter, img3, img4].filter(Boolean);
      const allPhotos = realPhotos.length ? realPhotos : [null];
      const nCells = allPhotos.length;
      const areaH = photoH * 4 + gap * 3;
      const cellH = Math.round((areaH - gap * (nCells - 1)) / nCells);
      for (let i = 0; i < nCells; i++) {
        const py = pad + i * (cellH + gap);
        // 프레임
        if (s.template === 'classic' || s.template === 'film') {
          ctx.strokeStyle = borderColor; ctx.lineWidth = 1;
          ctx.strokeRect(pad - 1, py - 1, photoW + 2, cellH + 2);
        }
        ctx.save();
        this._roundRect(ctx, pad, py, photoW, cellH, s.template === 'pastel' ? 12 : 4);
        ctx.clip();
        _drawPhoto(ctx, allPhotos[i], pad, py, photoW, cellH);
        ctx.restore();
      }

      // 하단 정보 (토글 + 배경 이미지 시 반투명 박스)
      const infoY = pad + 4 * (photoH + gap);
      const hasAnyText = s.customShowPet || s.customShowDate || s.customShowShop;
      if (hasAnyText && _useTextBox) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this._roundRect(ctx, pad, infoY, photoW, 80, 10); ctx.fill();
      }
      ctx.textAlign = 'center';
      let _ty = infoY + 22;
      if (s.customShowPet) { ctx.fillStyle = textColor; ctx.font = 'bold 20px ' + fontFamily; ctx.fillText(petName, W / 2, _ty); _ty += 20; }
      if (s.customShowDate) { ctx.fillStyle = textSub; ctx.font = '13px ' + fontFamily; ctx.fillText(dateStr, W / 2, _ty); _ty += 18; }
      if (s.customShowShop) {
        if (_logoImg && _logoPos !== 'none') { const lh = 28 * _logoSizeMul, lw = _logoImg.width * (lh / _logoImg.height); ctx.drawImage(_logoImg, (W - lw) / 2, _ty - 12, lw, lh); }
        else if (!_logoImg) { ctx.fillStyle = mainColor; ctx.font = 'bold 13px ' + fontFamily; const shopLine = (s.showShopPhone && shopPhone) ? shopName + ' · ' + shopPhone : shopName; ctx.fillText(shopLine, W / 2, _ty); }
      }
    }

    // ===== 인스타 피드 (4:5, 1080×1350) =====
    else if (layout === 'feed' || layout === 'feed4') {
      const W = 1080, H = 1350;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
      if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);

      // 상단 매장명/로고
      ctx.textAlign = 'center';
      const topPad = s.customShowShop ? 70 : 40;
      if (s.customShowShop) {
        if (_useTextBox && _logoPos !== 'none' && _logoPos !== 'bottom') { ctx.fillStyle = 'rgba(255,255,255,0.8)'; this._roundRect(ctx, W/2 - 220, 15, 440, 50, 10); ctx.fill(); }
        if (_logoImg && _logoPos !== 'none') {
          _drawLogoAt(ctx, { W: W, H: H, baseH: 40, topY: 20, bottomPad: 80 });
        } else if (!_logoImg) {
          ctx.fillStyle = mainColor; ctx.font = 'bold 32px ' + fontFamily; ctx.fillText(emoji + ' ' + shopName, W / 2, 50);
        }
      }

      // 메인 사진 (크게)
      const photoPad = 40;
      const photoW = W - photoPad * 2;
      const photoY = topPad + 10;
      // 아래 글자 자리를 먼저 잡고 남은 높이만 사진에 준다 — 예전엔 사진(1333px)이 카드(1350px) 밖으로 나가
      // 반려견 이름·날짜·헤드라인이 카드 밖에 그려져 보이지 않았다
      const _textH = 50 + (s.headline ? 44 : 0) + (s.subline ? 32 : 0) + (s.customShowPet ? 40 : 0)
        + (serviceNames && s.customShowPet ? 35 : 0) + (s.customShowDate ? 30 : 0);
      const photoH = Math.min(Math.round(photoW * 4 / 3), H - photoY - _textH - 30);
      if (layout === 'feed4') {
        _drawGrid4(ctx, [imgBefore, imgAfter, img3, img4], photoPad, photoY, photoW, photoH, 16, 18);
      } else {
        ctx.save();
        this._roundRect(ctx, photoPad, photoY, photoW, photoH, 16);
        ctx.clip();
        _drawSplit(ctx, [imgBefore, imgAfter, img3, img4], photoPad, photoY, photoW, photoH, 12, 0);
        ctx.restore();
      }

      // 하단 정보 (헤드라인·서브 + 기존 정보)
      const ftY = photoY + photoH + 30;
      const _hasHeadline = !!s.headline, _hasSubline = !!s.subline;
      const _extraH = (_hasHeadline ? 50 : 0) + (_hasSubline ? 36 : 0);
      const hasFeedText = s.customShowPet || s.customShowDate || _hasHeadline || _hasSubline;
      if (hasFeedText && _useTextBox) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this._roundRect(ctx, 40, ftY - 10, W - 80, 120 + _extraH, 14); ctx.fill();
      }
      let _fty = ftY + 30;
      if (_hasHeadline) { ctx.fillStyle = textColor; ctx.font = 'bold 38px ' + fontFamily; ctx.fillText(s.headline, W / 2, _fty); _fty += 44; }
      if (_hasSubline) { ctx.fillStyle = textSub; ctx.font = '26px ' + fontFamily; ctx.fillText(s.subline, W / 2, _fty); _fty += 32; }
      if (s.customShowPet) { ctx.fillStyle = textColor; ctx.font = 'bold 42px ' + fontFamily; ctx.fillText(petName, W / 2, _fty); _fty += 40; }
      if (serviceNames && s.customShowPet) { ctx.fillStyle = textSub; ctx.font = '28px ' + fontFamily; ctx.fillText(serviceNames, W / 2, _fty); _fty += 35; }
      if (s.customShowDate) { ctx.fillStyle = textSub; ctx.font = '24px ' + fontFamily; ctx.fillText(dateStr, W / 2, _fty); }
    }

    // ===== 인스타 스토리 (9:16) =====
    else if (layout === 'story' || layout === 'story4') {
      const W = 1080, H = 1920;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
      if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);

      // 상단 매장명/로고
      ctx.textAlign = 'center';
      if (s.customShowShop) {
        if (_logoImg && _logoPos !== 'none') {
          _drawLogoAt(ctx, { W: W, H: H, baseH: 50, topY: 60, bottomPad: 100 });
        } else if (!_logoImg) {
          ctx.fillStyle = mainColor; ctx.font = 'bold 40px ' + fontFamily; ctx.fillText(emoji + ' ' + shopName, W / 2, 100);
        }
      }

      // 메인 사진 (크게)
      const photoPad = 60;
      const photoW = W - photoPad * 2;
      const photoY = 160;
      let photoH = Math.round(photoW * 4 / 3);
      if (layout === 'story4') {
        // 아래 글자·매장명 자리를 빼고 남은 높이를 모두 사진에 (칸 하나가 세로로 긴 2:3 정도)
        const _sTextH = 60 + (s.headline ? 56 : 0) + (s.subline ? 40 : 0) + (s.customShowPet ? 45 : 0)
          + (serviceNames && s.customShowPet ? 40 : 0) + (s.customShowDate ? 36 : 0);
        photoH = H - photoY - _sTextH - (s.customShowShop ? 200 : 80);
        _drawGrid4(ctx, [imgBefore, imgAfter, img3, img4], photoPad, photoY, photoW, photoH, 18, 22);
      } else {
        ctx.save();
        this._roundRect(ctx, photoPad, photoY, photoW, photoH, 24);
        ctx.clip();
        _drawSplit(ctx, [imgBefore, imgAfter, img3, img4], photoPad, photoY, photoW, photoH, 14, 0);
        ctx.restore();
      }

      // 반려견 정보 (헤드라인·서브 + 기존)
      const infoY = photoY + photoH + 50;
      const _sHasHl = !!s.headline, _sHasSub = !!s.subline;
      const _sExtraH = (_sHasHl ? 56 : 0) + (_sHasSub ? 40 : 0);
      const hasStoryText = s.customShowPet || s.customShowDate || _sHasHl || _sHasSub;
      if (hasStoryText && _useTextBox) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this._roundRect(ctx, 60, infoY - 10, W - 120, 160 + _sExtraH, 16); ctx.fill();
      }
      let _sty = infoY + 40;
      if (_sHasHl) { ctx.fillStyle = textColor; ctx.font = 'bold 44px ' + fontFamily; ctx.fillText(s.headline, W / 2, _sty); _sty += 50; }
      if (_sHasSub) { ctx.fillStyle = textSub; ctx.font = '30px ' + fontFamily; ctx.fillText(s.subline, W / 2, _sty); _sty += 36; }
      if (s.customShowPet) { ctx.fillStyle = textColor; ctx.font = 'bold 48px ' + fontFamily; ctx.fillText(petName, W / 2, _sty); _sty += 45; }
      if (serviceNames && s.customShowPet) { ctx.fillStyle = textSub; ctx.font = '32px ' + fontFamily; ctx.fillText(serviceNames, W / 2, _sty); _sty += 40; }
      if (s.customShowDate) { ctx.fillStyle = textSub; ctx.font = '28px ' + fontFamily; ctx.fillText(dateStr, W / 2, _sty); }

      // 하단 브랜딩
      if (s.customShowShop) {
        const footerY = H - 100;
        if (_useTextBox) {
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          this._roundRect(ctx, W / 2 - 200, footerY - 30, 400, 80, 12); ctx.fill();
        }
        ctx.fillStyle = mainColor; ctx.font = 'bold 30px ' + fontFamily;
        ctx.fillText(shopName, W / 2, footerY);
        if (s.showShopPhone && shopPhone) {
          ctx.fillStyle = textSub; ctx.font = '24px ' + fontFamily;
          ctx.fillText(shopPhone, W / 2, footerY + 40);
        }
      }
    }

    // Fallback
    else {
      canvas.width = 400; canvas.height = 900;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 400, 900);
      ctx.fillStyle = textColor; ctx.font = 'bold 20px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText('Photo Card', 200, 450);
    }

    // 인스타그램 최적화: 1080px 미만이면 자동 업스케일 (흐림 방지)
    let out = canvas;
    if (canvas.width < 1080) {
      const scale = 1080 / canvas.width;
      const upCanvas = document.createElement('canvas');
      upCanvas.width = 1080;
      upCanvas.height = Math.round(canvas.height * scale);
      const upCtx = upCanvas.getContext('2d');
      upCtx.imageSmoothingQuality = 'high';
      upCtx.drawImage(canvas, 0, 0, upCanvas.width, upCanvas.height);
      canvas.width = canvas.height = 0; // 중간 캔버스 즉시 해제
      out = upCanvas;
    }

    // 덮는 프레임(사진 칸을 투명하게 뚫은 PNG) — 다 그린 뒤 맨 위에 최종 카드 크기로 덮는다 (업스케일 뒤라 프레임이 흐려지지 않는다)
    if (s.customOverlayImage) {
      const _ov = await this._loadImg(s.customOverlayImage);
      if (_ov) this._drawImageCover(out.getContext('2d'), _ov, 0, 0, out.width, out.height);
    }

    // 스티커 — 프레임보다도 위에
    if (Array.isArray(s.stickers) && s.stickers.length) {
      const octx = out.getContext('2d');
      for (const st of s.stickers) {
        const sImg = await this._loadImg(this._stickerSrc(st.id));
        if (!sImg) continue;
        const w = st.size * out.width, h = w * (sImg.height / sImg.width);
        octx.save();
        octx.translate(st.x * out.width, st.y * out.height);
        octx.rotate((st.rot || 0) * Math.PI / 180);
        octx.drawImage(sImg, -w / 2, -h / 2, w, h);
        octx.restore();
      }
    }

    return out;
  },

  // ========== Photo Card System (사진 카드) ==========
  _cardPhotos: [],
  _CARD_LAYOUTS: {
    photobooth: { name: '네컷 세로', icon: 'list', photos: 4 },
    feed: { name: '피드 4:5', icon: 'image', photos: 4 },
    story: { name: '스토리', icon: 'camera', photos: 4 },
    feed4: { name: '피드 4컷', icon: 'image', photos: 4 },
    story4: { name: '스토리 4컷', icon: 'camera', photos: 4 },
    strip2: { name: '2컷', icon: 'copy', photos: 2 },
    single: { name: '폴라로이드', icon: 'circle', photos: 1 }
  },
  // 사진 카드 글꼴 — 무료(OFL) 한글 글꼴. 처음 쓸 때 Google Fonts 에서 받고, 서비스워커가 보관해 다음부터는 오프라인에서도 쓴다.
  // 받지 못하면(오프라인 첫 사용 등) 기본 글꼴로 그린다.
  _CARD_FONTS: {
    system: { name: '기본', family: null },
    gowun: { name: '고운돋움', family: 'Gowun Dodum', css: 'Gowun+Dodum' },
    jua: { name: '주아', family: 'Jua', css: 'Jua' },
    dohyeon: { name: '도현', family: 'Do Hyeon', css: 'Do+Hyeon' },
    gaegu: { name: '개구 손글씨', family: 'Gaegu', css: 'Gaegu:wght@400;700' },
    nanumpen: { name: '나눔펜', family: 'Nanum Pen Script', css: 'Nanum+Pen+Script' },
    batang: { name: '고운바탕', family: 'Gowun Batang', css: 'Gowun+Batang:wght@400;700' },
    // 페이퍼로지 — Google Fonts 에 없어 눈누(jsDelivr) 글꼴 파일을 직접 붙인다
    paperlogy: { name: '페이퍼로지', family: 'Paperlogy', faces: [
      { weight: '400', url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-4Regular.woff2' },
      { weight: '700', url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2' }
    ] }
  },
  // 사진 카드 스티커 — Google Noto Emoji(Apache 2.0) 를 256px WebP 로 앱에 넣어 둔다 (기기마다 모양이 같고 오프라인에서도 된다)
  _STICKERS: ['1f43e', '2764', '1f495', '1f496', '1f49d', '1f380', '1f9b4', '2728', '1f451', '1f338', '1f337', '1f33c', '1f490', '2b50', '1f31f', '2702', '1fae7', '1f6c1', '1f436', '1f415', '1f429', '1f431', '1f9f8', '1f389', '1f382', '1f388', '1f308', '2600', '2744', '1f384', '1f340', '1f4af', '1f44d', '1f60d', '1f970'],
  _stickerSrc(id) { return `assets/stickers/emoji_u${id}.webp`; },

  _cardFontStack(key) {
    const f = this._CARD_FONTS[key];
    const base = '-apple-system, BlinkMacSystemFont, sans-serif';
    return f && f.family ? `"${f.family}", ${base}` : base;
  },
  // 글꼴 CSS 를 한 번만 붙인다 (글자 범위별로 나뉘어 있어 쓰는 글자 조각만 받는다)
  _attachCardFontCss(key) {
    const f = this._CARD_FONTS[key];
    if (f && f.faces && typeof FontFace !== 'undefined' && document.fonts) {
      this._fontFacesAdded = this._fontFacesAdded || {};
      if (this._fontFacesAdded[key]) return;
      this._fontFacesAdded[key] = true;
      f.faces.forEach(fc => {
        try { document.fonts.add(new FontFace(f.family, `url(${fc.url}) format('woff2')`, { weight: fc.weight, display: 'swap' })); } catch (_) {}
      });
      return;
    }
    if (!f || !f.css) return;
    const id = 'card-font-' + key;
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${f.css}&display=swap`;
    document.head.appendChild(link);
  },
  // 캔버스는 글꼴이 다 받아진 뒤에 그려야 적용된다 — 최대 4초 기다리고, 안 되면 기본 글꼴
  async _ensureCardFont(key, sample) {
    const f = this._CARD_FONTS[key];
    if (!f || !f.family || !document.fonts) return;
    this._attachCardFontCss(key);
    const text = sample || '가나다';
    const wait = Promise.all(['400', 'bold'].map(w => document.fonts.load(`${w} 40px "${f.family}"`, text).catch(() => null)));
    await Promise.race([wait, new Promise(r => setTimeout(r, 4000))]);
  },

  _CARD_THEMES: {
    classic: { name: '클래식', color: '#1A1A1A' },
    film: { name: '필름', color: '#8B7355' },
    pastel: { name: '파스텔', color: '#F9A8D4' },
    dark: { name: '다크', color: '#0F172A' }
  },

  // 미용 기록 폼에서 즉석 새 서비스 등록 (모달 충돌 회피 — inline form)
  _showQuickAddService(suggestedName) {
    const form = document.getElementById('quickadd-service-form');
    if (!form) return;
    form.style.display = 'block';
    const nameInput = document.getElementById('quickadd-name');
    const priceInput = document.getElementById('quickadd-price');
    if (nameInput) {
      nameInput.value = suggestedName || '';
      setTimeout(() => nameInput.focus(), 50);
    }
    if (priceInput) priceInput.value = '';
    // 분류 chips 초기화 (grooming 활성)
    document.querySelectorAll('#quickadd-category-chips .payment-chip').forEach(b => b.classList.remove('active'));
    const groomingBtn = document.querySelector('#quickadd-category-chips .payment-chip[data-value="grooming"]');
    if (groomingBtn) groomingBtn.classList.add('active');
    const catHidden = document.getElementById('quickadd-category');
    if (catHidden) catHidden.value = 'grooming';

    // chips 핸들러 (1회만 바인딩 위해 cloneNode 트릭 사용 안 하고 매번 등록 — 단순)
    document.querySelectorAll('#quickadd-category-chips .payment-chip').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#quickadd-category-chips .payment-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('quickadd-category').value = btn.dataset.value;
      };
    });

    // 등록 버튼
    const saveBtn = document.getElementById('quickadd-save');
    const cancelBtn = document.getElementById('quickadd-cancel');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const name = (nameInput?.value || '').trim();
        const price = Math.max(0, Number(priceInput?.value) || 0);
        const category = document.getElementById('quickadd-category')?.value || 'grooming';
        if (!name) { App.showToast('서비스 이름을 입력하세요', 'error'); nameInput?.focus(); return; }
        try {
          await DB.add('services', {
            name, category,
            description: '',
            priceSmall: price, priceMedium: price, priceLarge: price,
            isActive: true,
            priceChangedAt: new Date().toISOString()
          });
          App.showToast(`"${name}" 서비스 등록 완료`);
          // 미용 기록 폼에 자동 채움
          const fService = document.getElementById('f-service');
          const fPrice = document.getElementById('f-servicePrice');
          if (fService) fService.value = name;
          if (fPrice && price > 0) {
            fPrice.value = price;
            fPrice.dispatchEvent(new Event('input')); // 합계 자동 계산
          }
          form.style.display = 'none';
        } catch (e) {
          console.error('즉석 서비스 등록 실패:', e);
          App.showToast('서비스 등록 중 오류', 'error');
        }
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = () => { form.style.display = 'none'; };
    }
    // Enter: 기록 저장이 아니라 서비스 등록 버튼으로 (onkeydown이라 재호출 시 누적되지 않음)
    [nameInput, priceInput].forEach(inp => {
      if (!inp) return;
      inp.onkeydown = (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        saveBtn?.click();
      };
    });
  },

  _renderPhotoSlots(count) {
    const container = document.getElementById('card-photo-slots');
    if (!container) return;
    // 사진 칸: 직접 고른 사진은 레이아웃을 바꿔도 그대로, 나머지 칸은 이 기록의 사진으로 채운다
    // (예전엔 레이아웃을 바꿀 때마다 전부 지워졌고, 기록에 넣어 둔 사진도 다시 골라야 했다)
    const prevPhotos = this._cardPhotos || [];
    const prevMeta = this._cardPhotoMeta || [];
    const picked = this._cardUserPicked || [];
    const defaults = this._slotDefaults(count);
    const blank = () => ({ offsetX: 0, offsetY: 0, zoom: 1.0 });
    this._cardPhotos = Array.from({ length: 4 }, (_, i) => picked[i] ? prevPhotos[i] : (i < count ? (defaults[i] || null) : null));
    // 메타: offsetX/offsetY = -50~+50 (사진 중심 기준 비율 이동), zoom = 1.0~2.0
    this._cardPhotoMeta = Array.from({ length: 4 }, (_, i) => (picked[i] && prevMeta[i]) || blank());
    container.innerHTML = Array.from({ length: count }, (_, i) => `
      <div style="flex:1 1 calc(50% - 4px);min-width:140px;max-width:200px">
        <input type="file" id="card-photo-${i}" accept="image/*" style="display:none">
        <div id="card-preview-${i}" style="width:100%;height:76px;border:2px dashed var(--border);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;font-size:1.4rem;color:var(--text-muted);background:var(--bg)" onclick="document.getElementById('card-photo-${i}').click()">${App.icon('camera')}</div>
        <!-- 위치·확대 조정은 필요할 때만 펼친다 (사진마다 슬라이더 3개가 늘 펼쳐져 창이 길었다) -->
        <button type="button" class="card-adjust-btn" id="card-adjust-${i}" data-slot="${i}" hidden>${App.icon('settings')} 위치 조정</button>
        <div id="card-photo-controls-${i}" style="display:none;margin-top:6px;font-size:0.7rem">
          <div class="photo-slider-row" style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="color:var(--text-muted);flex-shrink:0;min-width:30px">좌↔우</span>
            <input type="range" min="-50" max="50" step="2" value="0" class="card-x-slider" data-slot="${i}" style="flex:1;height:36px;min-height:0;cursor:pointer">
            <span id="card-x-label-${i}" style="color:var(--text-muted);flex-shrink:0;min-width:36px;text-align:right">0%</span>
          </div>
          <div class="photo-slider-row" style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="color:var(--text-muted);flex-shrink:0;min-width:30px">위↕아</span>
            <input type="range" min="-50" max="50" step="2" value="0" class="card-y-slider" data-slot="${i}" style="flex:1;height:36px;min-height:0;cursor:pointer">
            <span id="card-y-label-${i}" style="color:var(--text-muted);flex-shrink:0;min-width:36px;text-align:right">0%</span>
          </div>
          <div class="photo-slider-row" style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="color:var(--text-muted);flex-shrink:0;min-width:30px">줌</span>
            <input type="range" min="100" max="200" step="5" value="100" class="card-zoom-slider" data-slot="${i}" style="flex:1;height:36px;min-height:0;cursor:pointer">
            <span id="card-zoom-label-${i}" style="color:var(--text-muted);flex-shrink:0;min-width:36px;text-align:right">100%</span>
          </div>
          <button type="button" class="card-reset-btn" data-slot="${i}" style="width:100%;margin-top:4px;padding:4px;font-size:0.7rem;border:1px solid var(--border);border-radius:4px;background:var(--bg-white);color:var(--text-muted);cursor:pointer">초기화</button>
        </div>
      </div>
    `).join('');

    // 파일 선택 핸들러
    for (let i = 0; i < count; i++) {
      document.getElementById(`card-photo-${i}`)?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          App.resizeImage(ev.target.result, (compressed) => {
            this._cardPhotos[i] = compressed;
            this._cardPhotoMeta[i] = { offsetX: 0, offsetY: 0, zoom: 1.0 };
            if (this._cardUserPicked) this._cardUserPicked[i] = true;
            this._refreshPhotoPreview(i);
            this._resetPhotoSliders(i);
            const adj = document.getElementById(`card-adjust-${i}`);
            if (adj) adj.hidden = false;
            this._scheduleCardPreview();
          });
        };
        reader.readAsDataURL(file);
      });
    }

    // X 슬라이더 핸들러
    container.querySelectorAll('.card-x-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        const slot = Number(slider.dataset.slot);
        const v = Number(slider.value);
        if (!this._cardPhotoMeta[slot]) this._cardPhotoMeta[slot] = { offsetX: 0, offsetY: 0, zoom: 1.0 };
        this._cardPhotoMeta[slot].offsetX = v;
        const label = document.getElementById(`card-x-label-${slot}`);
        if (label) label.textContent = `${v}%`;
        this._refreshPhotoPreview(slot);
      });
    });

    // Y 슬라이더 핸들러
    container.querySelectorAll('.card-y-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        const slot = Number(slider.dataset.slot);
        const v = Number(slider.value);
        if (!this._cardPhotoMeta[slot]) this._cardPhotoMeta[slot] = { offsetX: 0, offsetY: 0, zoom: 1.0 };
        this._cardPhotoMeta[slot].offsetY = v;
        const label = document.getElementById(`card-y-label-${slot}`);
        if (label) label.textContent = `${v}%`;
        this._refreshPhotoPreview(slot);
      });
    });

    // 줌 슬라이더 핸들러
    container.querySelectorAll('.card-zoom-slider').forEach(slider => {
      slider.addEventListener('input', () => {
        const slot = Number(slider.dataset.slot);
        const zoom = Number(slider.value) / 100;
        if (!this._cardPhotoMeta[slot]) this._cardPhotoMeta[slot] = { offsetX: 0, offsetY: 0, zoom: 1.0 };
        this._cardPhotoMeta[slot].zoom = zoom;
        const label = document.getElementById(`card-zoom-label-${slot}`);
        if (label) label.textContent = `${Math.round(zoom * 100)}%`;
        this._refreshPhotoPreview(slot);
      });
    });

    // 초기화 버튼 핸들러
    container.querySelectorAll('.card-reset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = Number(btn.dataset.slot);
        this._cardPhotoMeta[slot] = { offsetX: 0, offsetY: 0, zoom: 1.0 };
        this._resetPhotoSliders(slot);
        this._refreshPhotoPreview(slot);
      });
    });

    // 레이아웃을 바꾸기 전에 골라 둔 사진 다시 표시 (위치·확대 값 포함)
    for (let i = 0; i < count; i++) {
      if (!this._cardPhotos[i]) continue;
      const m = this._cardPhotoMeta[i];
      const set = (sel, v, labelId, txt) => { const el = container.querySelector(sel); if (el) el.value = v; const l = document.getElementById(labelId); if (l) l.textContent = txt; };
      set(`.card-x-slider[data-slot="${i}"]`, m.offsetX || 0, `card-x-label-${i}`, (m.offsetX || 0) + '%');
      set(`.card-y-slider[data-slot="${i}"]`, m.offsetY || 0, `card-y-label-${i}`, (m.offsetY || 0) + '%');
      set(`.card-zoom-slider[data-slot="${i}"]`, Math.round((m.zoom || 1) * 100), `card-zoom-label-${i}`, Math.round((m.zoom || 1) * 100) + '%');
      this._refreshPhotoPreview(i);
      const adj = document.getElementById(`card-adjust-${i}`);
      if (adj) adj.hidden = false;
    }
    container.querySelectorAll('.card-adjust-btn').forEach(btn => btn.addEventListener('click', () => {
      const ctrls = document.getElementById(`card-photo-controls-${btn.dataset.slot}`);
      if (!ctrls) return;
      const open = ctrls.style.display === 'none';
      ctrls.style.display = open ? 'block' : 'none';
      btn.classList.toggle('open', open);
    }));
  },

  // 레이아웃별 기본 사진: 한 장짜리는 미용 후 사진, 여러 장은 전 → 후 → 3 → 4 순서
  _slotDefaults(count) {
    if (!this._cardUsePool) return [];
    const p = this._cardPool || {};
    if (count === 1) return [p.after || p.before || p.p3 || p.p4 || null];
    return [p.before, p.after, p.p3, p.p4].filter(Boolean);
  },

  // 인쇄용 4×6인치(1200×1800, 300dpi) — 네컷은 두 줄을 나란히(가운데 자르는 선), 그 외는 여백을 두고 가운데
  _makePrintSheet(card, layout) {
    const W = 1200, H = 1800;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
    if (layout === 'photobooth') {
      const h = H, w = Math.round(card.width * (h / card.height));
      const gap = Math.max(0, Math.floor((W - w * 2) / 3));
      x.drawImage(card, gap, 0, w, h);
      x.drawImage(card, gap * 2 + w, 0, w, h);
      x.strokeStyle = '#BBBBBB'; x.setLineDash([14, 12]); x.lineWidth = 2;
      x.beginPath(); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
    } else {
      const m = 60;
      const r = Math.min((W - m * 2) / card.width, (H - m * 2) / card.height);
      const w = Math.round(card.width * r), h = Math.round(card.height * r);
      x.drawImage(card, Math.round((W - w) / 2), Math.round((H - h) / 2), w, h);
    }
    return c;
  },

  // 인스타용(피드 4:5 / 스토리 9:16) — 배경은 내 프레임 이미지(있으면) 또는 테마 배경색, 카드는 그림자와 함께 가운데
  async _makeInstaSheet(card, size, ds) {
    const { w: W, h: H } = size;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    const preset = this.CARD_TEMPLATES[ds.template] || this.CARD_TEMPLATES.classic;
    x.fillStyle = ds.customBgColor || preset.bgColor || '#FFFFFF';
    x.fillRect(0, 0, W, H);
    const frameImg = ds.customBgImage ? await this._loadImg(ds.customBgImage) : null;
    if (frameImg) this._drawImageCover(x, frameImg, 0, 0, W, H);
    else {
      // 단색 배경은 살짝 어둡게 번지는 그라데이션으로 밋밋함을 줄인다
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    // 프레임이 있으면 위아래 여백을 더 둬서 프레임의 제목·문구가 보이게 한다
    const m = Math.round(H * (frameImg ? 0.13 : 0.05));
    const r = Math.min((W - m * 2) / card.width, (H - m * 2) / card.height);
    const cw = Math.round(card.width * r), ch = Math.round(card.height * r);
    const cx = Math.round((W - cw) / 2), cy = Math.round((H - ch) / 2);
    x.save();
    x.shadowColor = 'rgba(0,0,0,0.3)'; x.shadowBlur = 44; x.shadowOffsetY = 16;
    x.fillStyle = '#fff'; x.fillRect(cx, cy, cw, ch);
    x.restore();
    x.drawImage(card, cx, cy, cw, ch);
    // 어두운 배경(다크 테마)에서는 카드가 배경에 묻혀 경계가 안 보여 얇은 테두리를 넣는다
    const hex = (ds.customBgColor || preset.bgColor || '#FFFFFF').replace('#', '');
    const lum = hex.length >= 6 ? (0.299 * parseInt(hex.slice(0, 2), 16) + 0.587 * parseInt(hex.slice(2, 4), 16) + 0.114 * parseInt(hex.slice(4, 6), 16)) / 255 : 1;
    x.strokeStyle = lum < 0.5 && !frameImg ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.08)';
    x.lineWidth = 2; x.strokeRect(cx + 1, cy + 1, cw - 2, ch - 2);
    return c;
  },

  // 덮는 프레임을 만들 때 쓰는 '칸 위치 가이드' — 지금 사진 카드 설정(글자 표시 등) 그대로 그리고 사진 칸에 번호를 넣는다.
  // 이 이미지를 캔바 등에 깔고 디자인한 뒤 번호 칸을 투명하게 지워 PNG 로 저장하면 된다.
  async makeFrameGuide(layout) {
    const saved = (await DB.getSetting('cardDesignSettings')) || {};
    const colors = ['#F87171', '#60A5FA', '#34D399', '#FBBF24'];
    const block = (i) => {
      const c = document.createElement('canvas'); c.width = 600; c.height = 600;
      const x = c.getContext('2d');
      x.fillStyle = colors[i]; x.fillRect(0, 0, 600, 600);
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = 'bold 260px -apple-system, sans-serif';
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(i + 1), 300, 310);
      const u = c.toDataURL('image/png'); c.width = c.height = 0; return u;
    };
    const rec = { id: null, date: App.getToday(), petId: null, customerId: null, serviceIds: [],
      photoBefore: block(0), photoAfter: block(1), photo3: block(2), photo4: block(3) };
    const shopName = await DB.getSetting('shopName') || '펫살롱';
    const shopPhone = await DB.getSetting('shopPhone') || '';
    const ds = await this._designFrom({ ...saved, customBgImage: null, customOverlayImage: null }, layout, saved.template === 'custom' ? 'classic' : (saved.template || 'classic'), '콩이');
    return this._generateCardCanvas(rec, null, { name: '콩이' }, shopName, shopPhone, '', ds);
  },

  // 레이아웃 버튼의 작은 모양 그림 (아이콘만으로는 결과 모양을 알 수 없었다)
  _layoutThumb(key) {
    const cells = { photobooth: 4, strip2: 2, feed4: 4, story4: 4 }[key] || 1;
    return `<span class="lay-thumb lay-${key}" aria-hidden="true">${'<i></i>'.repeat(cells)}</span>`;
  },

  // ===== 스티커 =====
  // 위치(x, y)는 카드 가로·세로에 대한 비율(가운데 기준), 크기는 카드 가로에 대한 비율 — 미리보기와 실제 카드에서 같은 자리에 나온다
  _renderStickerLayer() {
    const layer = document.getElementById('card-sticker-layer');
    const img = document.getElementById('card-live-img');
    if (!layer) return;
    layer.hidden = !img || img.hidden;
    const list = this._cardStickers || [];
    layer.innerHTML = list.map((st, i) => `<img class="card-sticker${i === this._stickerSel ? ' sel' : ''}" data-i="${i}" src="${this._stickerSrc(st.id)}" alt="" draggable="false"
      style="left:${st.x * 100}%;top:${st.y * 100}%;width:${st.size * 100}%;transform:translate(-50%,-50%) rotate(${st.rot}deg)">`).join('');
    const edit = document.getElementById('card-sticker-edit');
    const sel = list[this._stickerSel];
    if (edit) edit.hidden = !sel;
    // 스티커를 고른 동안은 미리보기를 크게 (작은 화면에서 손가락으로 옮기기 쉽게)
    layer.closest('.card-live')?.classList.toggle('sticker-editing', !!sel);
    if (sel) {
      const sz = document.getElementById('card-sticker-size'); if (sz) sz.value = Math.round(sel.size * 100);
      const rt = document.getElementById('card-sticker-rot'); if (rt) rt.value = sel.rot;
    }
  },

  _bindStickers() {
    const pick = document.getElementById('card-sticker-pick');
    const layer = document.getElementById('card-sticker-layer');
    if (!pick || !layer) return;
    pick.onclick = (e) => {
      const btn = e.target.closest('.card-sticker-btn');
      if (!btn) return;
      if (document.getElementById('card-live-img')?.hidden) { App.showToast('사진을 먼저 골라주세요.', 'info'); return; }
      this._cardStickers.push({ id: btn.dataset.sticker, x: 0.5, y: 0.45, size: 0.22, rot: 0 });
      this._stickerSel = this._cardStickers.length - 1;
      this._renderStickerLayer();
    };
    // 끌어서 옮기기 — 손가락을 댄 지점과 스티커 가운데의 차이를 유지한다
    let drag = null;
    layer.onpointerdown = (e) => {
      const el = e.target.closest('.card-sticker');
      if (!el) { if (this._stickerSel !== -1) { this._stickerSel = -1; this._renderStickerLayer(); } return; }
      e.preventDefault();
      const i = Number(el.dataset.i);
      const st = this._cardStickers[i];
      if (!st) return;
      if (this._stickerSel !== i) { this._stickerSel = i; this._renderStickerLayer(); }
      const r = layer.getBoundingClientRect();
      drag = { i, id: e.pointerId, dx: (e.clientX - r.left) / r.width - st.x, dy: (e.clientY - r.top) / r.height - st.y };
      try { layer.setPointerCapture(e.pointerId); } catch (_) {}
    };
    layer.onpointermove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const r = layer.getBoundingClientRect();
      const st = this._cardStickers[drag.i];
      if (!st || !r.width) return;
      st.x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width - drag.dx));
      st.y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height - drag.dy));
      const el = layer.querySelector(`.card-sticker[data-i="${drag.i}"]`);
      if (el) { el.style.left = st.x * 100 + '%'; el.style.top = st.y * 100 + '%'; }
    };
    layer.onpointerup = layer.onpointercancel = () => { drag = null; };
    const upd = (fn) => { const st = this._cardStickers[this._stickerSel]; if (st) { fn(st); this._renderStickerLayer(); } };
    const sz = document.getElementById('card-sticker-size');
    if (sz) sz.oninput = () => upd(st => { st.size = Number(sz.value) / 100; });
    const rt = document.getElementById('card-sticker-rot');
    if (rt) rt.oninput = () => upd(st => { st.rot = Number(rt.value); });
    const del = document.getElementById('card-sticker-del');
    if (del) del.onclick = () => { if (this._stickerSel < 0) return; this._cardStickers.splice(this._stickerSel, 1); this._stickerSel = -1; this._renderStickerLayer(); };
    const clr = document.getElementById('card-sticker-clear');
    if (clr) clr.onclick = () => { this._cardStickers = []; this._stickerSel = -1; this._renderStickerLayer(); };
    this._renderStickerLayer();
  },

  _scheduleCardPreview() {
    clearTimeout(this._cardPreviewTimer);
    this._cardPreviewTimer = setTimeout(() => this._renderCardPreview().catch(e => console.warn('카드 미리보기 실패:', e)), 250);
  },

  async _renderCardPreview() {
    const img = document.getElementById('card-live-img');
    const empty = document.getElementById('card-live-empty');
    if (!img || !this._cardCtx) return;
    const token = (this._cardPreviewToken || 0) + 1;
    this._cardPreviewToken = token;
    const f = await this._readCardForm(this._cardPetName || '');
    const count = (this._CARD_LAYOUTS[f.layout] && this._CARD_LAYOUTS[f.layout].photos) || 1;
    const nAll = (this._cardPhotos || []).filter(Boolean).length;
    this._markLayoutRecs(nAll);
    const photos = (this._cardPhotos || []).slice(0, count);
    if (!photos.some(Boolean)) { img.hidden = true; if (empty) empty.hidden = false; this._renderStickerLayer(); return; }
    const { record, customer, pet, serviceNames } = this._cardCtx;
    const rec = { ...record, photoBefore: photos[0] || null, photoAfter: photos[1] || null, photo3: photos[2] || null, photo4: photos[3] || null,
      photoBeforeId: null, photoAfterId: null, photo3Id: null, photo4Id: null };
    const metas = this._cardPhotoMeta || [];
    const blank = { offsetX: 0, offsetY: 0, zoom: 1.0 };
    rec._photoMetas = { photoBefore: metas[0] || blank, photoAfter: metas[1] || blank, photo3: metas[2] || blank, photo4: metas[3] || blank };
    const shopName = await DB.getSetting('shopName') || '펫살롱';
    const shopPhone = await DB.getSetting('shopPhone') || '';
    const ds = await this._designFrom(f.settings, f.layout, f.theme, pet?.name || '');
    const cv = await this._generateCardCanvas(rec, customer, pet, shopName, shopPhone, serviceNames, ds);
    if (token !== this._cardPreviewToken) return; // 더 최근 미리보기가 진행 중
    img.src = cv.toDataURL('image/jpeg', 0.72);
    cv.width = cv.height = 0; // iOS 는 캔버스 메모리를 늦게 돌려줘 슬라이더를 오래 끌면 한도를 넘는다
    img.hidden = false;
    if (empty) empty.hidden = true;
    img.closest('.card-live')?.setAttribute('data-shape', f.layout);
    this._renderStickerLayer();
    // 칸보다 사진이 적으면 어떻게 나오는지 알려준다 (반복 채우지 않고 칸 수를 줄인다)
    const note = document.getElementById('card-live-note');
    if (note) {
      const n = photos.filter(Boolean).length;
      // 피드·스토리는 1장이 기본이라 1장일 때는 안내가 필요 없다
      const isSplit = ['feed', 'story', 'feed4', 'story4'].includes(f.layout);
      note.hidden = !(count > 1 && n < count) || ((f.layout === 'feed' || f.layout === 'story') && n <= 1);
      const splitWord = { 2: '나란히 2칸', 3: '위 1칸 + 아래 2칸', 4: '2×2' }[n] || '';
      if (nAll > count) { note.hidden = false; note.textContent = `이 레이아웃은 앞 ${count}장만 써요 (고른 사진 ${nAll}장)`; }
      else if (!note.hidden) note.textContent = isSplit
        ? `사진 ${n}장 분할로 만들어요` + (splitWord ? ` · ${splitWord}` : '') + ' (4장까지)'
        : `사진 ${n}장으로 만들어요 · 칸이 ${n}개로 커져요` + (f.layout === 'photobooth' && n === 2 ? ' (2컷 레이아웃도 잘 어울려요)' : '');
    }
  },

  // 고른 장수에 맞는 레이아웃에 '추천' 표시 (사진을 먼저 고르면 틀을 제안하는 Instagram Layout 방식)
  _markLayoutRecs(n) {
    const rec = n <= 1 ? ['single', 'feed'] : (n === 2 ? ['strip2', 'feed'] : (n >= 4 ? ['photobooth', 'feed4', 'story4'] : ['photobooth', 'feed']));
    document.querySelectorAll('#card-pick-layout .card-pick-btn').forEach(b => b.classList.toggle('rec', n > 0 && rec.includes(b.dataset.key)));
  },

  _resetPhotoSliders(slot) {
    const xs = document.querySelector(`.card-x-slider[data-slot="${slot}"]`);
    const ys = document.querySelector(`.card-y-slider[data-slot="${slot}"]`);
    const zs = document.querySelector(`.card-zoom-slider[data-slot="${slot}"]`);
    if (xs) xs.value = 0;
    if (ys) ys.value = 0;
    if (zs) zs.value = 100;
    const xl = document.getElementById(`card-x-label-${slot}`);
    const yl = document.getElementById(`card-y-label-${slot}`);
    const zl = document.getElementById(`card-zoom-label-${slot}`);
    if (xl) xl.textContent = '0%';
    if (yl) yl.textContent = '0%';
    if (zl) zl.textContent = '100%';
  },

  _refreshPhotoPreview(slot) {
    const preview = document.getElementById(`card-preview-${slot}`);
    if (!preview) return;
    const photo = this._cardPhotos[slot];
    // 빈 칸은 낮게, 사진이 들어오면 제 높이로 (1장만 쓸 때 빈 칸 3개가 덜 거슬리게)
    preview.style.height = photo ? '120px' : '76px';
    if (!photo) { preview.innerHTML = App.icon('camera'); return; }
    const meta = this._cardPhotoMeta[slot] || { offsetX: 0, offsetY: 0, zoom: 1.0 };
    // offsetX/Y = -50~+50 → object-position % = 0~100
    const colPct = (50 + (meta.offsetX || 0)) + '%';
    const rowPct = (50 + (meta.offsetY || 0)) + '%';
    preview.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;object-position:${colPct} ${rowPct};transform:scale(${meta.zoom});transform-origin:${colPct} ${rowPct};transition:transform 0.12s,object-position 0.12s">`;
  },

  // 저장된 카드 설정 → 그리기용 설정 (만들기·미리보기 공용)
  async _designFrom(ds, layout, theme, petName) {
    const os = await DB.getSetting('cardTemplateSettings') || {};
    const designSettings = {
      layout: layout,
      template: theme,
      mainColor: ds.mainColor || os.mainColor || '#6366F1',
      showService: ds.showService !== false,
      // 금액·담당은 설정 화면에 켜는 곳이 없어 늘 찍히던 값 — SNS·손님에게 나가는 이미지라 직접 켰을 때만
      showPrice: ds.showPrice === true,
      showGroomer: ds.showGroomer === true,
      showNextVisit: ds.showNextVisit !== false,
      showDate: ds.showDate !== false,
      showPetInfo: ds.showPetInfo !== false && ds.showPet !== false,
      showShopPhone: ds.showShopPhone !== false,
      footerMessage: String(ds.footerMessage || os.footerMessage || '감사합니다 ♥').replace(/\{반려견명\}/g, petName),
      logo: ds.logo || await DB.getSetting('shopLogo') || null,
      logoPosition: ds.logoPosition || 'top',
      logoSize: ds.logoSize || 'medium',
      headline: String(ds.headline || '').replace(/\{반려견명\}/g, petName),
      subline: String(ds.subline || '').replace(/\{반려견명\}/g, petName),
      // 커스텀 테마
      customBgColor: theme === 'custom' ? (ds.customBgColor || '#FFFFFF') : null,
      customTextColor: theme === 'custom' ? (ds.customTextColor || '#1A1A1A') : null,
      customAccentColor: theme === 'custom' ? (ds.customAccentColor || '#6366F1') : null,
      customBgImage: theme === 'custom' ? (ds.customBgImage || null) : null,
      customOverlayImage: theme === 'custom' ? (ds.customOverlayImage || null) : null,
      fontKey: this._CARD_FONTS[ds.fontKey] ? ds.fontKey : 'system',
      // 그리기 코드는 customShow* 이름을 쓰지만 이제 모든 테마에 적용된다 (예전 커스텀 전용 값은 이어받는다)
      customShowPet: (ds.showPet ?? ds.customShowPet) !== false,
      customShowDate: (ds.showDate ?? ds.customShowDate) !== false,
      customShowShop: (ds.showShop ?? ds.customShowShop) !== false
    };
    return designSettings;
  },

  // 카드 만들기 창의 현재 선택을 읽어 저장용 설정으로 만든다 (만들기·미리보기 공용)
  async _readCardForm(cardPetName) {
    const layout = document.querySelector('#card-pick-layout .card-pick-btn.active')?.dataset.key || 'strip2';
    let theme = document.querySelector('#card-pick-theme .card-pick-btn.active')?.dataset.key || 'classic';
    // 사용자 프레임 선택 시 (frame:ID) → custom 테마로 자동 적용
    let appliedFrameId = null;
    if (theme.startsWith('frame:')) {
      appliedFrameId = theme.split(':')[1];
      const frames = (await DB.getSetting('customFrames')) || [];
      const fr = frames.find(x => x.id === appliedFrameId);
      this._appliedFrame = fr || null;
      if (fr) {
        theme = 'custom';
        // 프레임 데이터를 settings에 즉시 반영 (렌더링은 기존 custom 코드 그대로 사용)
      }
    }

    const settings = await DB.getSetting('cardDesignSettings') || {};
    settings.layout = layout;
    settings.template = theme;
    // 로고 위치 / 크기 (모든 테마 공통)
    settings.logoPosition = document.getElementById('card-logo-position')?.value || 'top';
    settings.logoSize = document.getElementById('card-logo-size')?.value || 'medium';
    // 자유 텍스트 (헤드라인 / 서브 / 하단)
    // 문구에 들어간 이번 반려견 이름은 {반려견명} 으로 저장 — 다음 손님 카드에 '콩이의 첫 미용'이 남던 문제
    // 한 글자 이름(예: '콩')은 다른 낱말까지 바꿀 수 있어 두 글자 이상일 때만
    const toVar = (t) => cardPetName.length >= 2 ? t.split(cardPetName).join('{반려견명}') : t;
    settings.headline = toVar((document.getElementById('card-headline')?.value || '').trim());
    settings.subline = toVar((document.getElementById('card-subline')?.value || '').trim());
    const footerInput = toVar((document.getElementById('card-footer')?.value || '').trim());
    if (footerInput) settings.footerMessage = footerInput;
    else settings.footerMessage = settings.footerMessage || '감사합니다 ♥';
    // 표시 항목 (서비스명·다음 방문일)
    settings.showService = document.getElementById('card-show-service')?.checked || false;
    settings.showNextVisit = document.getElementById('card-show-nextvisit')?.checked || false;
    // 폴라로이드 사진 크기 (모던/미니멀)
    settings.polaroidSize = document.querySelector('input[name="polaroidSize"]:checked')?.value || 'modern';
    // 사용자 프레임 선택 시 settings에 프레임 데이터 반영
    if (appliedFrameId && this._appliedFrame) {
      // 프레임 방식: 'overlay' 는 사진 위에 덮고, 그 밖(예전 프레임 포함)은 사진 뒤 배경
      const isOverlay = this._appliedFrame.mode === 'overlay';
      settings.customBgImage = isOverlay ? null : this._appliedFrame.image;
      settings.customOverlayImage = isOverlay ? this._appliedFrame.image : null;
      settings.customAccentColor = this._appliedFrame.accentColor || '#6366F1';
      settings.customTextColor = this._appliedFrame.textColor || '#1A1A1A';
      settings.customBgColor = '#FFFFFF';
      settings.lastUsedFrameId = appliedFrameId;
    } else {
      settings.lastUsedFrameId = null;
      settings.customOverlayImage = null;
    }
    settings.fontKey = document.querySelector('#card-pick-font .card-font-btn.active')?.dataset.key || settings.fontKey || 'system';
    // 커스텀 테마 설정 저장 — 프레임을 고른 경우는 제외 (예전엔 커스텀 색·배경이 프레임을 덮어썼다)
    if (theme === 'custom' && !(appliedFrameId && this._appliedFrame)) {
      settings.customBgColor = document.getElementById('card-custom-bg')?.value || '#FFFFFF';
      settings.customTextColor = document.getElementById('card-custom-text')?.value || '#1A1A1A';
      settings.customAccentColor = document.getElementById('card-custom-accent')?.value || '#6366F1';
      settings.customBgImage = this._customBgImage || settings.customBgImage || null;
    }
    // 이름·날짜·매장명 — 모든 테마 공통
    settings.showPet = document.getElementById('card-show-pet')?.checked !== false;
    settings.showDate = document.getElementById('card-show-date')?.checked !== false;
    settings.showShop = document.getElementById('card-show-shop')?.checked !== false;
    return { layout, theme, settings };
  },

  // 더보기 → 사진 카드. 미용 기록과 상관없이 사진첩 사진으로 만든다 (카드는 앱에 저장하지 않는다).
  // 반려견을 고르면 이름·보호자 번호가 붙고, 그 반려견의 가장 최근 기록 사진을 가져올 수 있다.
  async startPhotoCard({ petId, date } = {}) {
    const pet = petId ? await DB.get('pets', Number(petId)) : null;
    const customer = pet?.customerId ? await DB.get('customers', pet.customerId) : null;
    const d = date || App.getToday();
    let pool = {}, poolLabel = '';
    if (pet) {
      const recs = (await DB.getByIndex('records', 'petId', pet.id)).filter(r => App._recordHasPhoto(r))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));
      const r = recs[0];
      if (r) {
        const _ph = async (inline, id) => inline || (id ? await DB.getPhoto(id).catch(() => null) : null);
        pool = { before: await _ph(r.photoBefore, r.photoBeforeId), after: await _ph(r.photoAfter, r.photoAfterId),
          p3: await _ph(r.photo3, r.photo3Id), p4: await _ph(r.photo4, r.photo4Id) };
        poolLabel = App.formatDate(r.date) + ' 기록 사진';
      }
    }
    const record = { id: null, date: d, petId: pet?.id || null, customerId: customer?.id || null, serviceIds: [], nextVisitDate: null };
    return this.openPhotoCard({ key: `free:${pet?.id || 0}:${d}`, record, customer, pet, serviceNames: '', pool, poolLabel });
  },

  // ctx: { key, record, customer, pet, serviceNames, pool, poolLabel } — 만들기·미리보기·완성 화면이 같은 문맥을 쓴다
  async openPhotoCard(ctx, opts = {}) {
    // 다른 카드에서 고른 사진이 남지 않게 새 카드마다 비운다 ('다시 꾸미기'는 같은 사진으로 돌아온다)
    const keep = opts.keepPhotos && this._cardCtx && this._cardCtx.key === ctx.key;
    const keptPhotos = keep ? (this._cardPhotos || []) : [];
    const keptMeta = keep ? (this._cardPhotoMeta || []) : [];
    this._cardPhotos = [];
    this._cardPhotoMeta = [];
    // 스티커: 새 카드는 비우고, '다시 꾸미기'는 붙인 그대로
    this._cardStickers = keep ? (this._cardStickers || []) : [];
    this._stickerSel = -1;
    const cardPetName = (ctx.pet && ctx.pet.name) || '';
    // 저장해 둔 문구의 {반려견명} 은 이번 반려견 이름으로 보여준다
    const withPet = (t) => String(t || '').replace(/\{반려견명\}/g, cardPetName);
    // 기록 사진은 기본은 빈 칸, '기록 사진 넣기'를 누를 때만 채운다 (카드에는 사진첩의 다른 사진을 쓰는 경우가 많다)
    this._cardPool = ctx.pool || {};
    this._cardUserPicked = [false, false, false, false];
    this._cardUsePool = false;
    if (keep) {
      this._cardPhotos = keptPhotos;
      this._cardPhotoMeta = keptMeta;
      this._cardUserPicked = keptPhotos.map(Boolean);
    }
    this._cardCtx = ctx;
    this._cardPetName = cardPetName;
    const poolCount = Object.values(this._cardPool).filter(Boolean).length;

    const saved = await DB.getSetting('cardDesignSettings') || {};
    // 삭제된 레이아웃/테마 자동 마이그레이션
    const validLayouts = Object.keys(this._CARD_LAYOUTS);
    let selectedLayout = saved.layout || 'photobooth';
    if (!validLayouts.includes(selectedLayout)) { selectedLayout = 'photobooth'; saved.layout = 'photobooth'; }
    const validThemes = [...Object.keys(this._CARD_THEMES), 'custom'];
    let selectedTheme = saved.template || 'classic';
    if (!validThemes.includes(selectedTheme)) { selectedTheme = 'classic'; saved.template = 'classic'; }
    if (saved.layout !== selectedLayout || saved.template !== selectedTheme) await DB.setSetting('cardDesignSettings', saved);
    const LAYOUTS = this._CARD_LAYOUTS;
    const THEMES = this._CARD_THEMES;
    // 사용자 프레임 라이브러리 (활성 + 이미지 있는 것만)
    const userFrames = ((await DB.getSetting('customFrames')) || []).filter(f => f.enabled !== false && f.image);
    const selectedFrameId = saved.lastUsedFrameId || null;

    App.showModal({
      title: '사진 카드 만들기',
      saveText: '카드 생성',
      content: `
        <!-- 실시간 미리보기 — 고를 때마다 바로 바뀐다 (예전엔 '카드 생성'을 눌러야 처음 보였다) -->
        <div class="card-live">
          <div class="card-live-stage">
            <img id="card-live-img" alt="사진 카드 미리보기" hidden>
            <div id="card-sticker-layer" class="card-sticker-layer" hidden></div>
          </div>
          <div id="card-live-empty" class="card-live-empty">${App.icon('image')} 사진을 고르면 여기에 미리 보여요</div>
          <div id="card-live-note" class="card-live-note" hidden></div>
        </div>
        <div class="form-group">
          <div class="card-photo-head">
            <label class="form-label" style="margin:0">사진 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400">· 1~4장, 칸을 눌러 사진첩에서 고르세요</span></label>
            ${poolCount ? `<button type="button" class="btn btn-sm btn-secondary" id="card-use-record-photos">${App.icon('image')} ${App.escapeHtml(ctx.poolLabel || '기록 사진')} 넣기 (${poolCount}장)</button>` : ''}
          </div>
          <div id="card-photo-slots" style="display:flex;gap:8px;flex-wrap:wrap"></div>
        </div>
        <div class="form-group">
          <label class="form-label">스티커 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400">· 누르면 붙어요, 미리보기에서 끌어 옮기세요</span></label>
          <div id="card-sticker-pick" class="card-sticker-row">
            ${this._STICKERS.map(id => `<button type="button" class="card-sticker-btn" data-sticker="${id}" aria-label="스티커 붙이기"><img src="${this._stickerSrc(id)}" alt="" loading="lazy"></button>`).join('')}
          </div>
          <div id="card-sticker-edit" class="card-sticker-edit" hidden>
            <label class="card-sticker-slider">크기 <input type="range" id="card-sticker-size" min="6" max="70" step="1"></label>
            <label class="card-sticker-slider">회전 <input type="range" id="card-sticker-rot" min="-180" max="180" step="5"></label>
            <div class="card-sticker-actions">
              <button type="button" class="btn btn-sm btn-secondary" id="card-sticker-del">${App.icon('trash')} 이 스티커 삭제</button>
              <button type="button" class="btn btn-sm btn-ghost" id="card-sticker-clear">모두 지우기</button>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">레이아웃 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400">· 고른 장수에 맞는 것에 추천 표시</span></label>
          <div id="card-pick-layout" style="display:flex;gap:8px;flex-wrap:wrap">
            ${Object.entries(LAYOUTS).map(([key, l]) => `
              <button type="button" class="card-pick-btn${key === selectedLayout ? ' active' : ''}" data-key="${key}" data-photos="${l.photos}">
                ${this._layoutThumb(key)}
                <span style="font-size:0.75rem">${l.name}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">테마 ${userFrames.length > 0 ? `<span style="font-size:0.78rem;color:var(--text-muted);font-weight:400">· 내 프레임 ${userFrames.length}개</span>` : ''}</label>
          <div id="card-pick-theme" style="display:flex;gap:8px;flex-wrap:wrap">
            ${Object.entries(THEMES).map(([key, t]) => `
              <button type="button" class="card-pick-btn${key === selectedTheme && !selectedFrameId ? ' active' : ''}" data-key="${key}" style="border-color:${t.color}">
                <span style="font-size:1.1rem;color:${t.color}">${App.icon('circle-filled')}</span>
                <span style="font-size:0.7rem;color:${t.color}">${t.name}</span>
              </button>
            `).join('')}
            ${userFrames.map(f => `
              <button type="button" class="card-pick-btn${selectedFrameId === f.id ? ' active' : ''}" data-key="frame:${f.id}" data-frame-id="${App.escapeHtml(f.id)}" style="border-color:${f.accentColor};position:relative;overflow:hidden">
                ${f.image ? `<span style="position:absolute;inset:0;background-image:url('${f.image}');background-size:cover;background-position:center;opacity:0.25"></span>` : ''}
                <span style="font-size:1.1rem;position:relative">${App.icon('image')}</span>
                <span style="font-size:0.7rem;color:${f.accentColor};position:relative;font-weight:700">${App.escapeHtml(f.name)}</span>
              </button>
            `).join('')}
            <button type="button" class="card-pick-btn${selectedTheme === 'custom' ? ' active' : ''}" data-key="custom" style="border-color:#888">
              <span style="font-size:1.1rem">${App.icon('palette')}</span>
              <span style="font-size:0.7rem;color:#888">커스텀</span>
            </button>
          </div>
        </div>
        <!-- 카드에 넣을 글자 — 이름·날짜·매장명은 테마와 상관없이 켜고 끈다 (늘 들어가면 촌스러울 수 있다 — 사장님 의견) -->
        <div class="form-group">
          <label class="form-label">카드에 넣을 글자 <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400">· 끄면 사진만 남아요</span></label>
          <div class="card-text-toggles">
            <label class="card-toggle"><input type="checkbox" id="card-show-pet" ${saved.showPet !== false ? 'checked' : ''}> 반려견 이름</label>
            <label class="card-toggle"><input type="checkbox" id="card-show-date" ${saved.showDate !== false ? 'checked' : ''}> 날짜</label>
            <label class="card-toggle"><input type="checkbox" id="card-show-shop" ${saved.showShop !== false ? 'checked' : ''}> 매장명·로고</label>
          </div>
          <label class="form-label" style="margin-top:12px">글꼴</label>
          <div id="card-pick-font" class="card-font-row">
            ${Object.entries(this._CARD_FONTS).map(([k, f]) => `<button type="button" class="card-font-btn${(saved.fontKey || 'system') === k ? ' active' : ''}" data-key="${k}" style="font-family:${App.escapeHtml(this._cardFontStack(k))}">${f.name}</button>`).join('')}
          </div>
        </div>
        <!-- 폴라로이드 사진 크기 (폴라로이드 레이아웃 선택 시만 표시) -->
        <div id="polaroid-options" class="form-group" style="display:${selectedLayout === 'single' ? 'block' : 'none'};padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:12px">
          <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">사진 크기 <span style="color:var(--text-muted);font-weight:400">(폴라로이드)</span></label>
          <div style="display:flex;flex-direction:column;gap:6px;width:100%">
            <label class="checkbox-label" style="font-size:0.88rem;min-height:auto;padding:12px;cursor:pointer;border:1.5px solid ${(saved.polaroidSize || 'modern') === 'modern' ? 'var(--primary)' : 'var(--border)'};border-radius:8px;display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;background:${(saved.polaroidSize || 'modern') === 'modern' ? 'var(--primary-light)' : 'var(--bg-white)'}">
              <input type="radio" name="polaroidSize" value="modern" ${(saved.polaroidSize || 'modern') === 'modern' ? 'checked' : ''} style="flex-shrink:0">
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;color:var(--text-primary)">모던</div>
                <div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px">사진 920×920 · 균등 여백</div>
              </div>
            </label>
            <label class="checkbox-label" style="font-size:0.88rem;min-height:auto;padding:12px;cursor:pointer;border:1.5px solid ${saved.polaroidSize === 'minimal' ? 'var(--primary)' : 'var(--border)'};border-radius:8px;display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;background:${saved.polaroidSize === 'minimal' ? 'var(--primary-light)' : 'var(--bg-white)'}">
              <input type="radio" name="polaroidSize" value="minimal" ${saved.polaroidSize === 'minimal' ? 'checked' : ''} style="flex-shrink:0">
              <div style="flex:1;min-width:0">
                <div style="font-weight:700;color:var(--text-primary)">미니멀</div>
                <div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px">사진 940×940 · 사진 최대 강조</div>
              </div>
            </label>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">${App.icon('bulb')} 미니멀은 사진을 더 크게 — 사진 강조</div>
        </div>

        <!-- 커스텀 테마 옵션 (커스텀 선택 시만 표시) -->
        <div id="card-custom-panel" style="display:${selectedTheme === 'custom' ? 'block' : 'none'};padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:12px">
          <div style="margin-bottom:10px">
            <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">빠른 색상 조합</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#FFFFFF" data-text="#1A1A1A" data-accent="#1A1A1A" style="border:1.5px solid var(--border);min-height:36px"><span style="color:#1A1A1A">${App.icon('circle')}</span> 화이트</button>
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#F5F0E8" data-text="#5C4A32" data-accent="#8B7355" style="border:1.5px solid #8B7355;min-height:36px"><span style="color:#8B7355">${App.icon('circle-filled')}</span> 베이지</button>
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#FFF0F5" data-text="#9D174D" data-accent="#DB2777" style="border:1.5px solid #DB2777;min-height:36px"><span style="color:#DB2777">${App.icon('circle-filled')}</span> 로즈</button>
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#0F172A" data-text="#E2E8F0" data-accent="#C9A96E" style="border:1.5px solid #C9A96E;min-height:36px"><span style="color:#0F172A">${App.icon('circle-filled')}</span> 네이비</button>
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#F0FDF4" data-text="#14532D" data-accent="#16A34A" style="border:1.5px solid #16A34A;min-height:36px"><span style="color:#16A34A">${App.icon('circle-filled')}</span> 민트</button>
            </div>
          </div>
          <div id="card-custom-colors" style="margin-bottom:10px${saved.customBgImage ? ';display:none' : ''}">
            <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">직접 선택</label>
            <div class="form-row" style="gap:8px">
              <div class="form-group" style="flex:1">
                <label style="font-size:0.72rem;color:var(--text-muted)">배경</label>
                <input type="color" id="card-custom-bg" value="${saved.customBgColor || '#FFFFFF'}" style="width:100%;height:36px;border:none;border-radius:6px;cursor:pointer">
              </div>
              <div class="form-group" style="flex:1">
                <label style="font-size:0.72rem;color:var(--text-muted)">글자</label>
                <input type="color" id="card-custom-text" value="${saved.customTextColor || '#1A1A1A'}" style="width:100%;height:36px;border:none;border-radius:6px;cursor:pointer">
              </div>
              <div class="form-group" style="flex:1">
                <label style="font-size:0.72rem;color:var(--text-muted)">포인트</label>
                <input type="color" id="card-custom-accent" value="${saved.customAccentColor || '#6366F1'}" style="width:100%;height:36px;border:none;border-radius:6px;cursor:pointer">
              </div>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:0.82rem">배경 이미지 <span style="color:var(--text-muted);font-weight:400">(선택)</span></label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="file" id="card-custom-bgimg" accept="image/*" style="display:none">
              <button type="button" class="btn btn-sm btn-secondary" id="card-custom-bgimg-btn">${saved.customBgImage ? '이미지 변경' : '이미지 선택'}</button>
              <span id="card-custom-bgimg-name" style="font-size:0.78rem;color:var(--text-muted)">${saved.customBgImage ? App.icon('check') + ' 설정됨' : ''}</span>
              ${saved.customBgImage ? '<button type="button" class="btn btn-sm btn-danger" id="card-custom-bgimg-remove">제거</button>' : ''}
            </div>
          </div>
        </div>
        <!-- 자주 안 쓰는 옵션은 접어 둔다 — 레이아웃·사진·테마만으로 바로 만들 수 있게 -->
        <details class="card-more">
          <summary>더 꾸미기 <span>문구 · 표시 항목 · 로고</span></summary>
        <!-- 자유 텍스트 (헤드라인·서브·하단 메시지) -->
        <div class="form-group" style="padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:12px">
          <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">자유 텍스트 <span style="color:var(--text-muted);font-weight:400">(빈 칸은 표시 안 됨)</span></label>
          <input type="text" id="card-headline" placeholder="헤드라인 (예: {반려견명}의 첫 미용 ✨)" value="${App.escapeHtml(withPet(saved.headline))}" maxlength="40" style="width:100%;margin-bottom:6px;min-height:40px;font-size:max(16px,0.9rem)">
          <input type="text" id="card-subline" placeholder="서브타이틀 (예: 행복한 하루)" value="${App.escapeHtml(withPet(saved.subline))}" maxlength="50" style="width:100%;margin-bottom:6px;min-height:40px;font-size:max(16px,0.9rem)">
          <input type="text" id="card-footer" placeholder="하단 메시지 (기본: 감사합니다 ♥)" value="${App.escapeHtml(withPet(saved.footerMessage))}" maxlength="60" style="width:100%;min-height:40px;font-size:max(16px,0.9rem)">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">${App.icon('bulb')} 인스타 피드·스토리 레이아웃에 적용. 이모지 사용 가능</div>
        </div>

        <!-- 표시 항목 (클래식·필름·파스텔·다크 공통) -->
        <div class="form-group" style="padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:12px">
          <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">표시 항목 <span style="color:var(--text-muted);font-weight:400">(카드에 자동 표시할 정보)</span></label>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <label class="checkbox-label" style="font-size:0.82rem;min-height:auto;padding:4px 0"><input type="checkbox" id="card-show-service" ${saved.showService ? 'checked' : ''}> 서비스명</label>
            <label class="checkbox-label" style="font-size:0.82rem;min-height:auto;padding:4px 0"><input type="checkbox" id="card-show-nextvisit" ${saved.showNextVisit ? 'checked' : ''}> 다음 방문일</label>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">${App.icon('bulb')} 다음 방문일은 손님의 재예약을 자연스럽게 유도</div>
        </div>

        <!-- 매장 로고 위치/크기 (모든 테마 공통) -->
        <div class="form-group" style="padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:12px">
          <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">매장 로고 — 위치 / 크기 <span style="color:var(--text-muted);font-weight:400">(설정에서 로고 업로드 시 적용)</span></label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <select id="card-logo-position" style="flex:1;min-width:140px;min-height:40px;font-size:max(16px,0.85rem)">
              <option value="top" ${(saved.logoPosition || 'top') === 'top' ? 'selected' : ''}>상단</option>
              <option value="top-safe" ${saved.logoPosition === 'top-safe' ? 'selected' : ''}>상단 (스토리 안전 영역)</option>
              <option value="center" ${saved.logoPosition === 'center' ? 'selected' : ''}>중앙 (워터마크)</option>
              <option value="bottom" ${saved.logoPosition === 'bottom' ? 'selected' : ''}>하단</option>
              <option value="none" ${saved.logoPosition === 'none' ? 'selected' : ''}>표시 안 함</option>
            </select>
            <select id="card-logo-size" style="flex:1;min-width:120px;min-height:40px;font-size:max(16px,0.85rem)">
              <option value="small" ${saved.logoSize === 'small' ? 'selected' : ''}>작게 (70%)</option>
              <option value="medium" ${(saved.logoSize || 'medium') === 'medium' ? 'selected' : ''}>보통 (100%)</option>
              <option value="large" ${saved.logoSize === 'large' ? 'selected' : ''}>크게 (140%)</option>
              <option value="xl" ${saved.logoSize === 'xl' ? 'selected' : ''}>매우 크게 (180%)</option>
            </select>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">${App.icon('bulb')} 스토리(9:16)는 상단·하단 일부가 인스타 UI(시간/좋아요)에 가려져요. "안전 영역" 권장</div>
        </div>

        </details>
      `,
      onSave: async () => {
        const f = await this._readCardForm(cardPetName);
        const count = (LAYOUTS[f.layout] && LAYOUTS[f.layout].photos) || 1;
        const photos = this._cardPhotos.slice(0, count);
        if (!photos.some(Boolean)) { App.showToast('사진을 최소 1장 선택해주세요.', 'error'); return; }
        await DB.setSetting('cardDesignSettings', f.settings);
        App.closeModal();
        setTimeout(() => {
          this._doGenerateCard(ctx, f.layout, f.theme, photos[0] || null, photos[1] || null, photos[2] || null, photos[3] || null, this._cardPhotoMeta.slice(0, count));
        }, 200);
      }
    });

    // Wire up
    setTimeout(() => {
      // 레이아웃 선택 → 사진 슬롯 동적 변경 + 폴라로이드 옵션 토글
      document.querySelectorAll('#card-pick-layout .card-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#card-pick-layout .card-pick-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          // 폴라로이드(single)일 때만 사진 크기 옵션 표시
          const polarOpts = document.getElementById('polaroid-options');
          if (polarOpts) polarOpts.style.display = btn.dataset.key === 'single' ? 'block' : 'none';
        });
      });
      // 폴라로이드 라디오 선택 시 시각 피드백
      document.querySelectorAll('input[name="polaroidSize"]').forEach(radio => {
        radio.addEventListener('change', () => {
          document.querySelectorAll('input[name="polaroidSize"]').forEach(r => {
            r.closest('label').style.borderColor = r.checked ? 'var(--primary)' : 'var(--border)';
          });
        });
      });
      // 글꼴: 버튼 글자도 그 글꼴로 보이게 CSS 를 붙여 두고, 고르면 미리보기가 다시 그려진다
      Object.keys(this._CARD_FONTS).forEach(k => this._attachCardFontCss(k));
      document.querySelectorAll('#card-pick-font .card-font-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#card-pick-font .card-font-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
      this._bindStickers();
      // 사진 칸은 늘 4개 — 사진을 먼저 고르고 레이아웃을 고른다 (Instagram Layout 방식)
      this._renderPhotoSlots(4);

      // 무엇을 바꾸든 미리보기를 다시 그린다 (입력·선택·버튼)
      const mb = document.getElementById('modal-body');
      if (mb) {
        // addEventListener 는 창을 열 때마다 쌓여 사진·프레임을 메모리에 붙잡았다 — on* 속성은 덮어써서 하나만 남는다
        mb.oninput = () => this._scheduleCardPreview();
        mb.onchange = () => this._scheduleCardPreview();
        mb.onclick = (e) => {
          if (e.target.closest('.card-pick-btn, .card-preset-btn, .card-reset-btn, #card-custom-bgimg-remove')) this._scheduleCardPreview();
        };
      }
      this._scheduleCardPreview();
      document.getElementById('card-use-record-photos')?.addEventListener('click', (e) => {
        const btn = e.currentTarget;
        this._cardUsePool = true;
        this._renderPhotoSlots(4);
        this._scheduleCardPreview();
        btn.disabled = true;
        btn.innerHTML = App.icon('check') + ' 기록 사진 넣음';
      });

      // 테마 토글 + 커스텀 패널 표시
      this._customBgImage = saved.customBgImage || null;
      document.querySelectorAll('#card-pick-theme .card-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#card-pick-theme .card-pick-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const panel = document.getElementById('card-custom-panel');
          if (panel) panel.style.display = btn.dataset.key === 'custom' ? 'block' : 'none';
        });
      });

      // 프리셋 색상 조합
      document.querySelectorAll('.card-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const bg = document.getElementById('card-custom-bg');
          const text = document.getElementById('card-custom-text');
          const accent = document.getElementById('card-custom-accent');
          if (bg) bg.value = btn.dataset.bg;
          if (text) text.value = btn.dataset.text;
          if (accent) accent.value = btn.dataset.accent;
        });
      });

      // 커스텀 배경 이미지 업로드
      document.getElementById('card-custom-bgimg-btn')?.addEventListener('click', () => {
        document.getElementById('card-custom-bgimg')?.click();
      });
      document.getElementById('card-custom-bgimg')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          App.resizeImage(ev.target.result, (compressed) => {
            this._customBgImage = compressed;
            this._scheduleCardPreview();
            const nameEl = document.getElementById('card-custom-bgimg-name');
            if (nameEl) nameEl.innerHTML = App.icon('check') + ' 설정됨';
            // 배경색 피커 숨김 (이미지가 대신함)
            const colorsPanel = document.getElementById('card-custom-colors');
            if (colorsPanel) colorsPanel.style.display = 'none';
          }, 1200, 0.85); // 인스타 1080px 대응 + 여유
        };
        reader.readAsDataURL(file);
      });
      document.getElementById('card-custom-bgimg-remove')?.addEventListener('click', () => {
        this._customBgImage = null;
        const nameEl = document.getElementById('card-custom-bgimg-name');
        if (nameEl) nameEl.textContent = '';
        document.getElementById('card-custom-bgimg-remove')?.remove();
        // 배경색 피커 복원
        const colorsPanel = document.getElementById('card-custom-colors');
        if (colorsPanel) colorsPanel.style.display = '';
      });
    }, 100);
  },

  async _doGenerateCard(ctx, layout, theme, photo1, photo2, photo3, photo4, photoMetas) {
    try {
      const record = { ...ctx.record };
      // 즉석 사진 (DB에 저장 안 함)
      record.photoBefore = photo1 || null;
      record.photoAfter = photo2 || null;
      record.photo3 = photo3 || null;
      record.photo4 = photo4 || null;
      // 비워 둔 칸에 기록의 저장 사진이 몰래 들어가지 않게 (사진 칸에 보이는 그대로 만든다)
      record.photoBeforeId = record.photoAfterId = record.photo3Id = record.photo4Id = null;
      // 사진 메타 (9-Point + Zoom) — _generateCardCanvas 에서 img._meta 로 attach
      record._photoMetas = {
        photoBefore: (photoMetas && photoMetas[0]) || { offsetX: 0, offsetY: 0, zoom: 1.0 },
        photoAfter: (photoMetas && photoMetas[1]) || { offsetX: 0, offsetY: 0, zoom: 1.0 },
        photo3: (photoMetas && photoMetas[2]) || { offsetX: 0, offsetY: 0, zoom: 1.0 },
        photo4: (photoMetas && photoMetas[3]) || { offsetX: 0, offsetY: 0, zoom: 1.0 }
      };
      const { customer, pet, serviceNames } = ctx;
      const shopName = await DB.getSetting('shopName') || '펫살롱';
      const shopPhone = await DB.getSetting('shopPhone') || '';

      // Merge picker selections with saved detail settings
      const ds = await DB.getSetting('cardDesignSettings') || {};
      const designSettings = await this._designFrom(ds, layout, theme, pet?.name || '');
      designSettings.stickers = (this._cardStickers || []).map(st => ({ ...st }));

      const canvas = await this._generateCardCanvas(record, customer, pet, shopName, shopPhone, serviceNames, designSettings);

      // 대형 캔버스(스토리 등)는 JPEG로 출력 (빠르고 가벼움)
      const isLarge = canvas.width > 800 || canvas.height > 1500;
      const mimeType = isLarge ? 'image/jpeg' : 'image/png';
      const ext = isLarge ? 'jpg' : 'png';
      canvas.toBlob(blob => {
        if (!blob) { App.showToast('카드 생성에 실패했습니다.', 'error'); return; }
        const url = URL.createObjectURL(blob);
        const fileName = (pet?.name || 'pet') + '_미용카드_' + record.date + '.' + ext;
        const customerPhone = (customer?.phone || '').replace(/\D/g, '');

        // 모달 닫힐 때 Object URL 해제
        const _origClose = App._modalOnClose;
        App._modalOnClose = () => { if (_origClose) _origClose(); URL.revokeObjectURL(url); App._modalOnClose = null; };

        // 완성 화면 — 공유가 주 동작, 저장·인쇄용은 나란히, 손님 문자는 보조, 다시 꾸미기로 편집 복귀
        const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
        // 네컷·2컷은 1:3 띠라 인스타 피드(최대 4:5)·스토리(9:16)에 그대로 올리면 잘린다 → 배경 위에 가운데 놓은 버전을 따로 만든다
        const isTall = canvas.height / canvas.width > 1.9;
        const file = new File([blob], fileName, { type: mimeType });
        const canShareFile = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
        const cardMsg = () => App.buildSms('cardSend', { '고객명': customer?.name || '', '반려견명': pet?.name || '' });
        const download = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
        App.showModal({
          title: '사진 카드 완성',
          hideFooter: true,
          content: `
            <div class="card-done">
              <div class="card-done-img"><img src="${url}" alt="미용 카드"></div>
              <div class="card-done-actions">
                <button class="btn btn-primary card-done-main" id="card-share">${App.icon('send')} 공유하기 <small>카톡 · 문자 · 인스타</small></button>
                <div class="card-done-row">
                  <button class="btn btn-secondary" id="card-download">${App.icon('download')} 저장</button>
                  <button class="btn btn-secondary" id="card-print">${App.icon('print')} 인쇄용 4×6</button>
                </div>
                ${isTall ? `<div class="card-done-row">
                  <button class="btn btn-secondary" id="card-insta-feed">${App.icon('image')} 인스타 피드 4:5</button>
                  <button class="btn btn-secondary" id="card-insta-story">${App.icon('camera')} 인스타 스토리</button>
                </div>
                <p class="card-done-hint" style="margin-top:-2px">세로로 긴 카드는 인스타에서 잘려요. 피드·스토리용은 배경 위에 카드를 가운데 놓은 버전이에요.</p>` : ''}
                ${customerPhone ? `<button class="btn btn-ghost" id="card-send-customer">${App.icon('message')} ${App.escapeHtml(App.getCustomerLabel(customer))} 번호로 문자 열기</button>` : ''}
                <button class="btn btn-ghost" id="card-edit">${App.icon('edit')} 다시 꾸미기</button>
                <p class="card-done-hint">${isIOS ? '아이폰은 <b>공유하기 → 이미지 저장</b>을 누르면 사진첩에 저장돼요. 저장 버튼은 파일 앱에 저장됩니다.' : '공유하기에서 카카오톡을 고르면 사진이 바로 첨부돼요.'}</p>
              </div>
            </div>
          `
        });

        // 공유 — 이미지 + '사진 카드' 문구 (앱에 따라 문구는 빠질 수 있다)
        document.getElementById('card-share')?.addEventListener('click', async () => {
          const text = await cardMsg();
          if (canShareFile) {
            navigator.share({ files: [file], text, title: (pet?.name || '') + ' 미용 카드' }).catch(() => {});
            return;
          }
          // 파일 공유가 안 되는 브라우저(대부분의 PC) — 저장하고 문구는 복사해 둔다
          download(url, fileName);
          try { await navigator.clipboard.writeText(text); App.showToast('카드를 저장하고 보낼 문구를 복사했어요. 카톡·문자에 붙여넣기 하세요.'); }
          catch (_) { App.showToast('카드를 저장했어요. 카톡·문자에 첨부해 보내세요.'); }
        });

        // 손님 번호로 문자 — 문자 앱은 사진을 자동 첨부할 수 없어, 저장 후 문자 창에서 첨부하도록 안내
        document.getElementById('card-send-customer')?.addEventListener('click', async () => {
          if (!isIOS) download(url, fileName);
          const msg = await cardMsg();
          App.openSms(customerPhone, msg);
          App.showToast(isIOS ? '문자 창에서 사진첩의 카드를 첨부해 보내세요. (먼저 공유하기 → 이미지 저장)' : '카드를 저장했어요. 문자 창에서 사진을 첨부해 보내세요.', 'info', { duration: 6000 });
        });

        // 저장
        document.getElementById('card-download')?.addEventListener('click', () => {
          download(url, fileName);
          App.showToast('카드가 저장되었습니다.');
        });

        // 인쇄용 4×6 (일반 사진 용지 1200×1800, 300dpi)
        document.getElementById('card-print')?.addEventListener('click', () => {
          const sheet = this._makePrintSheet(canvas, layout);
          sheet.toBlob(b => {
            if (!b) { App.showToast('인쇄용 이미지를 만들지 못했습니다.', 'error'); return; }
            const pu = URL.createObjectURL(b);
            download(pu, (pet?.name || 'pet') + '_인쇄용4x6_' + record.date + '.jpg');
            setTimeout(() => URL.revokeObjectURL(pu), 4000);
            App.showToast(layout === 'photobooth' ? '인쇄용 이미지를 저장했어요. 4×6 용지에 인쇄해 가운데 점선을 자르면 두 장이 나와요.' : '인쇄용 이미지를 저장했어요. 4×6(10×15cm) 사진 용지로 인쇄하세요.', 'info', { duration: 6000 });
          }, 'image/jpeg', 0.95);
        });

        // 인스타 피드 4:5 / 스토리 9:16 — 테마 배경색 또는 내 프레임 이미지를 배경으로 깔고 카드를 가운데에
        const saveInsta = async (kind) => {
          const size = kind === 'story' ? { w: 1080, h: 1920 } : { w: 1080, h: 1350 };
          // 내 프레임을 썼으면 프레임은 배경에만 깔고, 카드 자체는 흰 배경으로 다시 그린다 (프레임 글자가 두 번 겹치지 않게)
          const inner = designSettings.customBgImage
            ? await this._generateCardCanvas(record, customer, pet, shopName, shopPhone, serviceNames, { ...designSettings, customBgImage: null, customBgColor: '#FFFFFF' })
            : canvas;
          this._makeInstaSheet(inner, size, designSettings).then(sheet => sheet.toBlob(b => {
            if (!b) { App.showToast('이미지를 만들지 못했습니다.', 'error'); return; }
            const pu = URL.createObjectURL(b);
            download(pu, (pet?.name || 'pet') + (kind === 'story' ? '_인스타스토리_' : '_인스타피드_') + record.date + '.jpg');
            setTimeout(() => URL.revokeObjectURL(pu), 4000);
            App.showToast(kind === 'story' ? '스토리용(9:16)을 저장했어요.' : '피드용(4:5)을 저장했어요.');
          }, 'image/jpeg', 0.92));
        };
        document.getElementById('card-insta-feed')?.addEventListener('click', () => saveInsta('feed'));
        document.getElementById('card-insta-story')?.addEventListener('click', () => saveInsta('story'));

        // 다시 꾸미기 — 고른 사진·설정을 그대로 들고 편집 창으로
        document.getElementById('card-edit')?.addEventListener('click', () => {
          App.closeModal();
          setTimeout(() => this.openPhotoCard(ctx, { keepPhotos: true }), 200);
        });
      }, mimeType, isLarge ? 0.92 : undefined);
    } catch (err) {
      console.error('Photo card generation error:', err);
      App.showToast('카드 생성 중 오류가 발생했습니다.', 'error');
    }
  },

  // ========== 미용 리포트 이미지 (보호자 전송용) ==========
  // MoeGo 그루밍 리포트·헬로티피 알림장 방식: 전·후 사진 + 오늘 한 것 + 상태 + 미용사 한마디 + 집에서 관리법 + 다음 미용 추천.
  // 기록에 있는 것만 쓰고(빈 줄은 뺀다), 이미지는 저장하지 않고 즉석에서 만든다.
  _REPORT_LABELS: {
    condition: { good: '좋음', normal: '보통', caution: '주의' },
    cooperativeness: { easy: '잘함', normal: '보통', difficult: '까다로움' },
    earStatus: { clean: '깨끗', dirty: '경미한 오염', infected: '염증 의심' },
    mattingLevel: { none: '없음', mild: '경미', severe: '심함' }
  },
  _reportTone(field, value) {
    const good = { condition: ['good'], cooperativeness: ['easy'], earStatus: ['clean'], mattingLevel: ['none'], skin: ['정상'] };
    const bad = { condition: ['caution'], cooperativeness: ['difficult'], earStatus: ['infected'], mattingLevel: ['severe'], skin: ['습진', '발적'] };
    if ((good[field] || []).includes(value)) return '#16A34A';
    if ((bad[field] || []).includes(value)) return '#DC2626';
    return '#D97706';
  },

  async buildReportCanvas(record, info) {
    const { pet, shopName, shopPhone, logo, reviewLink } = info;
    const W = 1080, pad = 64, accent = info.accent || '#6366F1';
    const font = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    const C = { text: '#1A1A1A', sub: '#64748B', line: '#E5E7EB', box: '#F8FAFC' };
    const L = this._REPORT_LABELS;
    const imgs = [];
    for (const [f, tag] of [['photoBefore', '전'], ['photoAfter', '후']]) {
      const src = await App.getRecordPhoto(record, f);
      const im = src ? await this._loadImg(src) : null;
      if (im) imgs.push({ im, tag });
    }
    const logoImg = logo ? await this._loadImg(logo) : null;
    const svc = record.service ? App.getRecordServiceDisplay(record) : (record.serviceNames || []).join(', ');
    // 신형 기록은 서비스 표시에 추가 항목이 이미 들어 있다 — 구형(serviceNames)만 따로 붙인다
    const addons = (!record.service && Array.isArray(record.addons)) ? record.addons.filter(Boolean) : [];
    const tips = (App.getHomeCareAdvice ? App.getHomeCareAdvice(record) : []).slice(0, 3);
    const status = [];
    if (record.condition) status.push(['컨디션', L.condition[record.condition] || record.condition, this._reportTone('condition', record.condition)]);
    if (record.cooperativeness) status.push(['미용 협조', L.cooperativeness[record.cooperativeness] || record.cooperativeness, this._reportTone('cooperativeness', record.cooperativeness)]);
    if (Array.isArray(record.skinStatus) && record.skinStatus.length) status.push(['피부', record.skinStatus.join(' · '), this._reportTone('skin', record.skinStatus.find(x => x !== '정상') || '정상')]);
    if (record.earStatus) status.push(['귀', L.earStatus[record.earStatus] || record.earStatus, this._reportTone('earStatus', record.earStatus)]);
    if (record.mattingLevel) status.push(['엉킴', L.mattingLevel[record.mattingLevel] || record.mattingLevel, this._reportTone('mattingLevel', record.mattingLevel)]);
    const memo = String(record.memo || '').trim().replace(/\s+/g, ' ').slice(0, 90);

    // 두 번 그린다: 1차는 높이만 재고, 2차는 그 높이의 캔버스에 실제로 그린다
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = 10;
    let ctx = canvas.getContext('2d');
    const wrap = (text, maxW) => {
      const out = []; let line = '';
      for (const ch of String(text || '')) {
        const t = line + ch;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = ch; } else line = t;
      }
      if (line) out.push(line);
      return out;
    };
    const run = (draw, extra = 0) => {
      let y = 0;
      const text = (str, x, yy, f, color, align) => { if (!draw) return; ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.fillText(str, x, yy); };
      const section = (title) => { y += 44; text(title, pad, y, 'bold 30px ' + font, accent); y += 18; if (draw) { ctx.fillStyle = C.line; ctx.fillRect(pad, y, W - pad * 2, 2); } y += 40; };
      // 머리: 로고 또는 매장명
      y = 72;
      if (logoImg) {
        const h = 72, w = Math.min(420, logoImg.width * h / logoImg.height);
        if (draw) ctx.drawImage(logoImg, (W - w) / 2, y - 36, w, h);
        y += 72;
      } else { text(shopName, W / 2, y + 12, 'bold 36px ' + font, accent, 'center'); y += 56; }
      // 제목
      y += 40;
      text(`${pet?.name || ''}의 미용 리포트`, W / 2, y + 20, 'bold 56px ' + font, C.text, 'center'); y += 70;
      text(App.formatDate(record.date) + (record.groomer ? ' · 담당 ' + record.groomer : ''), W / 2, y + 10, '30px ' + font, C.sub, 'center'); y += 40;
      // 사진
      if (imgs.length) {
        y += 36;
        const gap = 20, n = imgs.length;
        const w = n === 2 ? (W - pad * 2 - gap) / 2 : W - pad * 2;
        const h = n === 2 ? Math.round(w * 1.15) : Math.round(w * 0.78);
        imgs.forEach((p, i) => {
          const x = pad + i * (w + gap);
          if (!draw) return;
          ctx.save(); this._roundRect(ctx, x, y, w, h, 24); ctx.clip();
          this._drawImageCover(ctx, p.im, x, y, w, h); ctx.restore();
          ctx.fillStyle = 'rgba(0,0,0,0.55)'; this._roundRect(ctx, x + 16, y + 16, 72, 48, 12); ctx.fill();
          text(p.tag, x + 52, y + 50, 'bold 28px ' + font, '#fff', 'center');
        });
        y += h;
      }
      // 오늘 한 것
      if (svc || addons.length) {
        section('오늘 한 것');
        ctx.font = '34px ' + font;
        wrap(svc, W - pad * 2).forEach(l => { text(l, pad, y, '34px ' + font, C.text); y += 46; });
        if (addons.length) { ctx.font = '30px ' + font; wrap('+ ' + addons.join(', '), W - pad * 2).forEach(l => { text(l, pad, y, '30px ' + font, C.sub); y += 40; }); }
      }
      // 상태
      if (status.length) {
        section('오늘 상태');
        status.forEach(([k, v, tone]) => {
          if (draw) { ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(pad + 14, y - 11, 11, 0, Math.PI * 2); ctx.fill(); }
          text(k, pad + 44, y, '30px ' + font, C.sub);
          text(v, pad + 230, y, 'bold 32px ' + font, C.text);
          y += 50;
        });
      }
      // 미용사 한마디
      if (memo) {
        section('미용사 한마디');
        ctx.font = '32px ' + font;
        const lines = wrap(memo, W - pad * 2 - 56);
        const bh = lines.length * 44 + 36;
        if (draw) { ctx.fillStyle = C.box; this._roundRect(ctx, pad, y - 34, W - pad * 2, bh, 18); ctx.fill(); }
        y += 10;
        lines.forEach(l => { text(l, pad + 28, y, '32px ' + font, C.text); y += 44; });
        y += bh - lines.length * 44 - 10;
      }
      // 집에서 관리법
      if (tips.length) {
        section('집에서 관리법');
        ctx.font = '30px ' + font;
        tips.forEach(t => {
          const lines = wrap(t, W - pad * 2 - 40);
          lines.forEach((l, i) => { text((i === 0 ? '·  ' : '   ') + l, pad, y, '30px ' + font, C.text); y += 42; });
          y += 6;
        });
      }
      // 다음 미용 추천
      if (record.nextVisitDate) {
        y += 40;
        if (draw) { ctx.fillStyle = accent; this._roundRect(ctx, pad, y - 10, W - pad * 2, 96, 20); ctx.fill(); }
        text('다음 미용 추천  ' + App.formatDate(record.nextVisitDate), W / 2, y + 50, 'bold 34px ' + font, '#fff', 'center');
        y += 96;
      }
      // 꼬리 — 내용이 짧으면 남는 높이를 여기서 채워 꼬리가 바닥에 붙게 한다
      y += 56 + extra;
      if (draw) { ctx.fillStyle = C.line; ctx.fillRect(pad, y, W - pad * 2, 2); }
      y += 52;
      if (reviewLink) { text('리뷰 남겨주시면 큰 힘이 돼요', W / 2, y, '28px ' + font, C.sub, 'center'); y += 42; }
      text([shopName, shopPhone].filter(Boolean).join(' · '), W / 2, y, 'bold 30px ' + font, accent, 'center');
      y += 72;
      return y;
    };
    const contentH = run(false);
    const H = Math.max(1350, contentH);
    canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
    run(true, H - contentH);
    return canvas;
  },

  async showReport(recordId) {
    const record = await DB.get('records', recordId);
    if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
    const [pet, customer, shopName, shopPhone, logo, reviewLink, ds] = await Promise.all([
      record.petId ? DB.get('pets', record.petId) : null,
      record.customerId ? DB.get('customers', record.customerId) : null,
      DB.getSetting('shopName'), DB.getSetting('shopPhone'), DB.getSetting('shopLogo'), DB.getSetting('shopReviewLink'), DB.getSetting('cardTemplateSettings')
    ]);
    App.showToast('리포트를 만드는 중...', 'info', { duration: 1500 });
    let canvas;
    try {
      canvas = await this.buildReportCanvas(record, { pet, shopName: shopName || '펫살롱', shopPhone: shopPhone || '', logo, reviewLink: reviewLink || '', accent: ds?.mainColor || '#6366F1' });
    } catch (err) { console.error('리포트 생성 실패:', err); App.showToast('리포트를 만들지 못했습니다.', 'error'); return; }
    canvas.toBlob(async (blob) => {
      if (!blob) { App.showToast('리포트를 만들지 못했습니다.', 'error'); return; }
      const url = URL.createObjectURL(blob);
      const fileName = (pet?.name || 'pet') + '_미용리포트_' + record.date + '.jpg';
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      const customerPhone = (customer?.phone || '').replace(/\D/g, '');
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
      const canShareFile = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
      const msg = () => App.buildSms('reportSend', { '고객명': customer?.name || '', '반려견명': pet?.name || '', '다음방문일': record.nextVisitDate ? App.formatDate(record.nextVisitDate) : '' });
      const download = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
      const _origClose = App._modalOnClose;
      App._modalOnClose = () => { if (_origClose) _origClose(); URL.revokeObjectURL(url); App._modalOnClose = null; };
      App.showModal({
        title: '미용 리포트',
        hideFooter: true,
        content: `
          <div class="card-done">
            <div class="card-done-img"><img src="${url}" alt="미용 리포트"></div>
            <div class="card-done-actions">
              <button class="btn btn-primary card-done-main" id="report-share">${App.icon('send')} 보호자에게 보내기 <small>카톡 · 문자</small></button>
              <div class="card-done-row">
                <button class="btn btn-secondary" id="report-download">${App.icon('download')} 저장</button>
                <button class="btn btn-secondary" id="report-copy">${App.icon('copy')} 글자로 복사</button>
              </div>
              ${customerPhone ? `<button class="btn btn-ghost" id="report-sms">${App.icon('message')} ${App.escapeHtml(App.getCustomerLabel(customer))} 번호로 문자 열기</button>` : ''}
              <p class="card-done-hint">${isIOS ? '카톡으로 보내려면 <b>보호자에게 보내기 → 카카오톡</b>을 고르세요. 리포트는 앱에 저장되지 않아요.' : '보내기에서 카카오톡을 고르면 리포트 이미지가 바로 첨부돼요. 리포트는 앱에 저장되지 않아요.'}</p>
            </div>
          </div>
        `
      });
      document.getElementById('report-share')?.addEventListener('click', async () => {
        const text = await msg();
        if (canShareFile) { navigator.share({ files: [file], text, title: (pet?.name || '') + ' 미용 리포트' }).catch(() => {}); return; }
        download(url, fileName);
        try { await navigator.clipboard.writeText(text); App.showToast('리포트를 저장하고 보낼 문구를 복사했어요. 카톡·문자에 붙여넣기 하세요.'); }
        catch (_) { App.showToast('리포트를 저장했어요. 카톡·문자에 첨부해 보내세요.'); }
      });
      document.getElementById('report-download')?.addEventListener('click', () => { download(url, fileName); App.showToast('리포트를 저장했어요.'); });
      document.getElementById('report-copy')?.addEventListener('click', async () => {
        const t = await App.buildGroomingReport(record);
        try { await navigator.clipboard.writeText(t); App.showToast('글자 리포트를 복사했어요. 카톡에 붙여넣기 하세요.'); }
        catch (_) { App.showToast('복사에 실패했습니다.', 'error'); }
      });
      document.getElementById('report-sms')?.addEventListener('click', async () => {
        if (!isIOS) download(url, fileName);
        App.openSms(customerPhone, await msg());
        App.showToast(isIOS ? '문자 창에서 사진첩의 리포트를 첨부해 보내세요. (먼저 보내기 → 이미지 저장)' : '리포트를 저장했어요. 문자 창에서 사진을 첨부해 보내세요.', 'info', { duration: 6000 });
      });
    }, 'image/jpeg', 0.9);
  },

  // ========== 세무 자료 내보내기 ==========
  async showExportModal() {
    const now = new Date();

    // 이번 달 기본값
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = App.getToday();

    const modalContent = `
      <div style="display:flex;flex-direction:column;gap:20px">
        <div>
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">기간 선택</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
            <button class="export-period-btn active" data-period="thisMonth">이번 달</button>
            <button class="export-period-btn" data-period="lastMonth">지난 달</button>
            <button class="export-period-btn" data-period="3months">최근 3개월</button>
            <button class="export-period-btn" data-period="custom">직접 입력</button>
          </div>
          <div id="export-custom-range" style="display:none;align-items:center;gap:8px;flex-wrap:wrap">
            <input type="date" id="export-start" style="width:auto;flex:1;min-width:140px">
            <span style="color:var(--text-muted)">~</span>
            <input type="date" id="export-end" style="width:auto;flex:1;min-width:140px">
          </div>
        </div>

        <div id="export-preview" style="background:var(--bg);border-radius:var(--radius);padding:16px">
          <div style="color:var(--text-muted);text-align:center;font-size:0.9rem">기간을 선택하면 미리보기가 표시됩니다</div>
        </div>

        <div style="text-align:center">
          <div id="export-filename" style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;line-height:1.5"></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-success" id="btn-do-csv-download" style="width:100%;padding:14px;font-size:1rem;font-weight:700" disabled>
              ${App.icon('download')} CSV 다운로드 <span style="font-size:0.78rem;font-weight:500;opacity:0.85">(엑셀·세무용)</span>
            </button>
            <button class="btn btn-primary" id="btn-do-json-download" style="width:100%;padding:14px;font-size:1rem;font-weight:700" disabled>
              ${App.icon('download')} JSON 다운로드 <span style="font-size:0.78rem;font-weight:500;opacity:0.85">(Python 스크립트용)</span>
            </button>
          </div>
        </div>
      </div>
    `;

    App.showModal({
      title: '세무 자료 내보내기',
      content: modalContent,
      hideFooter: true
    });

    // 상태
    let currentStart = thisMonthStart;
    let currentEnd = today;
    let currentPeriod = 'thisMonth';

    const customRange = document.getElementById('export-custom-range');
    const startInput = document.getElementById('export-start');
    const endInput = document.getElementById('export-end');
    startInput.value = thisMonthStart;
    endInput.value = today;

    const updatePreview = async (start, end) => {
      currentStart = start;
      currentEnd = end;
      const preview = document.getElementById('export-preview');
      const filenameEl = document.getElementById('export-filename');
      const dlBtnCsv = document.getElementById('btn-do-csv-download');
      const dlBtnJson = document.getElementById('btn-do-json-download');
      const setBtnsDisabled = (disabled) => {
        if (dlBtnCsv) dlBtnCsv.disabled = disabled;
        if (dlBtnJson) dlBtnJson.disabled = disabled;
      };
      if (!preview) return;

      if (!start || !end || start > end) {
        preview.innerHTML = '<div style="color:var(--danger);text-align:center;font-size:0.9rem">올바른 기간을 선택해주세요</div>';
        setBtnsDisabled(true);
        return;
      }

      preview.innerHTML = '<div style="color:var(--text-muted);text-align:center;font-size:0.9rem">집계 중...</div>';

      // 인덱스 쿼리로 기간 내 records만 로드 (장기 누적 시 필수)
      const filtered = await DB.getByDateRange('records', 'date', start, end);
      // 데이터 없으면 명확한 안내
      if (filtered.length === 0) {
        preview.innerHTML = `
          <div style="padding:20px;text-align:center;background:var(--bg);border-radius:var(--radius);border:1px dashed var(--border)">
            <div style="font-size:1.6rem;margin-bottom:6px">${App.icon('file')}</div>
            <div style="font-weight:700;font-size:0.95rem;margin-bottom:4px">해당 기간 기록이 없습니다</div>
            <div style="font-size:0.82rem;color:var(--text-muted);line-height:1.5">기간을 변경하거나, 미용 기록이 쌓이면<br>다운로드 가능합니다</div>
          </div>
        `;
        if (filenameEl) filenameEl.textContent = '';
        setBtnsDisabled(true);
        return;
      }
      const total = filtered.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      const breakdown = { cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, transfer: { count: 0, amount: 0 }, unpaid: { count: 0, amount: 0 } };
      filtered.forEach(r => {
        const m = r.paymentMethod || '';
        if (breakdown[m]) {
          breakdown[m].count++;
          breakdown[m].amount += App.getRecordAmount(r);
        }
      });

      const row = (label, amount, count) =>
        `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-secondary)">${label}</span>
          <span style="font-weight:600">${App.formatCurrency(amount)} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem">(${count}건)</span></span>
        </div>`;

      preview.innerHTML = `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text-secondary)">기간</span>
            <span style="font-weight:600">${start} ~ ${end}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:2px solid var(--primary)">
            <span style="color:var(--text-secondary)">총 건수</span>
            <span style="font-weight:700;color:var(--primary)">${filtered.length}건</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:2px solid var(--primary)">
            <span style="color:var(--text-secondary)">총 매출</span>
            <span style="font-weight:800;color:var(--primary);font-size:1.1rem">${App.formatCurrency(total)}</span>
          </div>
          ${row('현금', breakdown.cash.amount, breakdown.cash.count)}
          ${row('카드', breakdown.card.amount, breakdown.card.count)}
          ${row('이체', breakdown.transfer.amount, breakdown.transfer.count)}
          <div style="display:flex;justify-content:space-between;padding:6px 0">
            <span style="color:${breakdown.unpaid.count > 0 ? 'var(--danger)' : 'var(--text-secondary)'}">미결제</span>
            <span style="font-weight:600;color:${breakdown.unpaid.count > 0 ? 'var(--danger)' : 'inherit'}">${App.formatCurrency(breakdown.unpaid.amount)} <span style="color:var(--text-muted);font-weight:400;font-size:0.85rem">(${breakdown.unpaid.count}건)</span></span>
          </div>
        </div>
      `;

      const shopName = await DB.getSetting('shopName') || '펫살롱';
      const fnameBase = `${shopName}_매출내역_${start}_${end}`;
      if (filenameEl) filenameEl.innerHTML = `<div>CSV: ${fnameBase}.csv</div><div>JSON: ${fnameBase}.json</div>`;
      setBtnsDisabled(filtered.length === 0);
    };

    // 기간 버튼 클릭
    document.querySelectorAll('.export-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.export-period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentPeriod = btn.dataset.period;

        const n = new Date();
        if (currentPeriod === 'thisMonth') {
          const s = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
          const e = App.getToday();
          customRange.style.display = 'none';
          updatePreview(s, e);
        } else if (currentPeriod === 'lastMonth') {
          const prev = new Date(n.getFullYear(), n.getMonth() - 1, 1);
          const prevEnd = new Date(n.getFullYear(), n.getMonth(), 0);
          const s = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`;
          const e = `${prevEnd.getFullYear()}-${String(prevEnd.getMonth() + 1).padStart(2, '0')}-${String(prevEnd.getDate()).padStart(2, '0')}`;
          customRange.style.display = 'none';
          updatePreview(s, e);
        } else if (currentPeriod === '3months') {
          const three = new Date(n.getFullYear(), n.getMonth() - 2, 1);
          const s = `${three.getFullYear()}-${String(three.getMonth() + 1).padStart(2, '0')}-01`;
          const e = App.getToday();
          customRange.style.display = 'none';
          updatePreview(s, e);
        } else if (currentPeriod === 'custom') {
          customRange.style.display = 'flex';
          updatePreview(startInput.value, endInput.value);
        }
      });
    });

    startInput.addEventListener('change', () => updatePreview(startInput.value, endInput.value));
    endInput.addEventListener('change', () => updatePreview(startInput.value, endInput.value));

    // 다운로드 버튼
    document.getElementById('btn-do-json-download')?.addEventListener('click', async () => {
      await this.downloadJSON(currentStart, currentEnd);
    });

    document.getElementById('btn-do-csv-download')?.addEventListener('click', async () => {
      await this.downloadCSV(currentStart, currentEnd);
    });

    // 초기 미리보기
    await updatePreview(thisMonthStart, today);
  },

  // ========== Export 공통 데이터 빌더 ==========
  async _buildExportData(start, end) {
    const [records, customers, pets, services] = await Promise.all([
      DB.getByDateRange('records', 'date', start, end),
      DB.getAll('customers'),
      DB.getAll('pets'),
      DB.getAll('services')
    ]);

    const customerMap = {}; customers.forEach(c => { customerMap[c.id] = c; });
    const petMap = {}; pets.forEach(p => { petMap[p.id] = p; });

    const mapCategoryToTax = (cat) => {
      const map = { grooming: '미용(그루밍)', addon: '미용(그루밍)', care: '케어' };
      return map[cat] || '미용(그루밍)';
    };

    const resolveCategory = (r) => {
      if (r.serviceCategory) return r.serviceCategory;
      if (r.service) {
        const svc = services.find(s => s.name === r.service);
        if (svc && svc.category) return svc.category;
      }
      return 'grooming';
    };

    const sorted = [...records].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const shopName = await DB.getSetting('shopName') || '펫살롱';

    const enriched = sorted.map(r => {
      const customer = customerMap[r.customerId];
      const pet = petMap[r.petId];
      const category = resolveCategory(r);
      const dateNoDash = (r.date || '').replace(/-/g, '');
      const txId = dateNoDash ? `${dateNoDash}-${r.id}` : String(r.id);
      const paymentLabel = { cash: '현금', card: '카드', transfer: '계좌이체', unpaid: '미수금' }[r.paymentMethod] || '';
      const memoParts = [
        r.style ? '스타일: ' + r.style : '',
        (r.addons || []).length > 0 ? '추가: ' + r.addons.join(', ') : '',
        r.memo || ''
      ].filter(Boolean);

      return {
        txId,
        id: r.id,
        date: r.date || '',
        category,
        categoryLabel: mapCategoryToTax(category),
        customerName: App.getCustomerLabel(customer) || '',
        petName: pet?.name || '',
        serviceName: r.service || '',
        addons: r.addons || [],
        style: r.style || '',
        groomer: r.groomer || '',
        paymentMethod: r.paymentMethod || '',
        paymentLabel,
        amount: App.getRecordAmount(r),
        cashReceiptYn: r.cashReceiptYn ? 'Y' : 'N',
        cashReceiptNo: r.cashReceiptNo || '',
        memo: memoParts.join(' / '),
        memoRaw: r.memo || '',
        createdAt: r.createdAt || '',
        updatedAt: r.updatedAt || ''
      };
    });

    const totalAmount = enriched.reduce((sum, r) => sum + r.amount, 0);

    return {
      meta: { shopName, period: { start, end }, exportedAt: new Date().toISOString(), totalRecords: enriched.length, totalAmount },
      records: enriched
    };
  },

  // ========== CSV 내보내기 (Python 친화 — 헤더 1줄 + 데이터 행만) ==========
  async downloadCSV(start, end) {
    try {
      const data = await this._buildExportData(start, end);
      if (!data.records.length) {
        App.showToast('해당 기간 기록이 없습니다.', 'warning');
        return;
      }
      const shopName = data.meta.shopName;

      const csvEsc = (val) => {
        const s = String(val == null ? '' : val);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const lines = [];
      // 헤더 1줄 — pandas.read_csv 바로 호환
      lines.push([
        '거래번호', '날짜', '구분', '고객명', '펫이름', '결제수단', '공급가액',
        '현금영수증', '현금영수증번호', '서비스명', '미용사', '메모'
      ].join(','));

      data.records.forEach(r => {
        lines.push([
          r.txId, r.date, r.categoryLabel, r.customerName, r.petName,
          r.paymentLabel, r.amount,
          r.cashReceiptYn, r.cashReceiptNo,
          r.serviceName, r.groomer, r.memo
        ].map(csvEsc).join(','));
      });

      // UTF-8 BOM + 다운로드
      const csvContent = '\uFEFF' + lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${shopName}_매출내역_${start}_${end}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // iOS Safari 등은 click() 이후 다운로드가 비동기로 시작된다.
      // 즉시 revoke 하면 URL 이 먼저 무효화되어 파일이 조용히 안 받아지는데,
      // 완료 토스트는 그대로 떠서 받아진 줄 알게 된다. (세무 자료 경로라 치명적)
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      App.showToast(`CSV 다운로드 완료 (${data.records.length}건)`, 'info');
    } catch (err) {
      console.error('CSV export error:', err);
      App.showToast('CSV 내보내기 중 오류가 발생했습니다.', 'error');
    }
  },

  // ========== JSON 내보내기 (Python 스크립트용 — 풍부한 필드) ==========
  async downloadJSON(start, end) {
    try {
      const data = await this._buildExportData(start, end);
      if (!data.records.length) {
        App.showToast('해당 기간 기록이 없습니다.', 'warning');
        return;
      }

      const out = {
        meta: data.meta,
        records: data.records.map(r => ({
          txId: r.txId,
          recordId: r.id,
          date: r.date,
          category: r.category,
          categoryLabel: r.categoryLabel,
          customerName: r.customerName,
          petName: r.petName,
          serviceName: r.serviceName,
          addons: r.addons,
          style: r.style,
          groomer: r.groomer,
          paymentMethod: r.paymentMethod,
          paymentLabel: r.paymentLabel,
          amount: r.amount,
          cashReceiptYn: r.cashReceiptYn === 'Y',
          cashReceiptNo: r.cashReceiptNo,
          memo: r.memoRaw,
          memoCombined: r.memo,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }))
      };

      const jsonContent = JSON.stringify(out, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.meta.shopName}_매출내역_${start}_${end}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // CSV 내보내기와 동일 — iOS 비동기 다운로드 대응 (즉시 revoke 시 조용히 실패)
      setTimeout(() => URL.revokeObjectURL(url), 60000);

      App.showToast(`JSON 다운로드 완료 (${data.records.length}건)`, 'info');
    } catch (err) {
      console.error('JSON export error:', err);
      App.showToast('JSON 내보내기 중 오류가 발생했습니다.', 'error');
    }
  },
};
