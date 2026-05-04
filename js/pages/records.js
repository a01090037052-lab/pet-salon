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
      ? '&#x1F389; 미결제 기록이 없습니다'
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
          <span style="font-size:1.5rem">&#x1F4B8;</span>
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
          <span class="search-icon">&#x1F50D;</span>
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
                      <div class="empty-state-icon">&#x2702;</div>
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
                        data-search="${((customer?.name || '') + ' ' + (pet?.name || '') + ' ' + (customer?.phone || '') + ' ' + (r.service || '') + ' ' + (r.style || '') + ' ' + (r.memo || '') + ' ' + (r.groomer || '')).toLowerCase()}"
                        data-payment="${r.paymentMethod || ''}"
                        data-amount="${App.getRecordAmount(r)}"
                        style="${r.paymentMethod === 'unpaid' ? 'background:var(--warning-light);border-left:3px solid var(--danger)' : ''}">
                      <td>${App.formatDate(r.date)}</td>
                      <td><a href="#pets/${r.petId}" style="color:var(--primary);font-weight:700" onclick="event.stopPropagation()">${App.escapeHtml(pet?.name || '-')}</a> <span style="color:var(--text-muted);font-size:0.75rem">${App.escapeHtml(App.getCustomerLabel(customer))}</span></td>
                      <td class="hide-mobile"><span style="font-size:0.85rem">${App.escapeHtml(serviceNames)}</span></td>
                      <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong>${r.discount || r.extraCharge ? `<div style="font-size:0.7rem;color:var(--text-muted)">${r.discount ? '-' + App.formatCurrency(r.discount) : ''}${r.extraCharge ? '+' + App.formatCurrency(r.extraCharge) : ''}</div>` : ''}</td>
                      <td class="hide-mobile">${App.escapeHtml(r.groomer || '-')}</td>
                      <td class="hide-mobile">${this.getPaymentLabel(r.paymentMethod)}</td>
                      <td class="hide-mobile" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(r.memo || '')}">
                        ${App.escapeHtml(r.memo || '-')}
                      </td>
                      <td class="table-actions">
                        <button class="btn-icon btn-photo-card" data-id="${r.id}" title="사진 카드 생성" style="color:var(--info)">&#x1F4F8;</button>
                        <button class="btn-icon btn-receipt-record" data-id="${r.id}" title="영수증" style="color:var(--success)">&#x1F9FE;</button>
                        <button class="btn-icon btn-edit-record" data-id="${r.id}" title="수정">&#x270F;</button>
                        <button class="btn-icon btn-delete-record text-danger" data-id="${r.id}" title="삭제">&#x1F5D1;</button>
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
                <div class="empty-state-icon">&#x2702;</div>
                <div class="empty-state-text">${emptyMessage}</div>
              </div>
            ` : (() => { let _lastG = null; return sorted.map(r => {
              const customer = customerMap[r.customerId];
              const pet = petMap[r.petId];
              const isUnpaid = r.paymentMethod === 'unpaid';
              const gLabel = getGroupLabel(r.date);
              let hdr = '';
              if (gLabel !== _lastG) {
                hdr = `<div class="record-group-header" data-group="${gLabel}">${gLabel}<span class="group-count">${groupCounts[gLabel]}건</span></div>`;
                _lastG = gLabel;
              }
              return hdr + `
              <div class="mobile-card${isUnpaid ? ' mobile-card-unpaid' : ''}" data-id="${r.id}" data-month="${(r.date || '').slice(0, 7)}" data-group="${gLabel}"
                   data-search="${((customer?.name || '') + ' ' + (pet?.name || '') + ' ' + (customer?.phone || '') + ' ' + (r.service || '') + ' ' + (r.style || '') + ' ' + (r.memo || '') + ' ' + (r.groomer || '')).toLowerCase()}"
                   data-payment="${r.paymentMethod || ''}"
                   data-amount="${App.getRecordAmount(r)}">
                <div class="mobile-card-header">
                  <span class="mobile-card-date"><strong>${App.formatDate(r.date)}</strong>${r.status === 'in_progress' ? ' <span class="badge badge-warning" style="font-size:0.72rem;padding:3px 8px">진행중</span>' : ''}</span>
                  <span class="mobile-card-amount"><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></span>
                </div>
                <div class="mobile-card-body">
                  <span class="mobile-card-info">&#x1F436; <strong>${App.escapeHtml(pet?.name || '-')}</strong> &middot; ${App.escapeHtml(App.getCustomerLabel(customer))}</span>
                  <div class="mobile-card-meta">
                    <span>&#x2702; ${App.escapeHtml(r.groomer || '-')}</span>
                    <span>${this.getPaymentLabel(r.paymentMethod)}</span>
                    ${isUnpaid ? '<span class="badge badge-danger">미결제</span>' : ''}
                  </div>
                  ${r.memo ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:6px;padding-top:6px;border-top:1px dashed var(--border-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${App.escapeHtml(r.memo)}">&#x1F4DD; ${App.escapeHtml(r.memo.length > 60 ? r.memo.slice(0, 60) + '...' : r.memo)}</div>` : ''}
                </div>
                <div class="mobile-card-actions">
                  <button class="btn btn-sm btn-info btn-photo-card" data-id="${r.id}">&#x1F4F8; 카드</button>
                  <button class="btn btn-sm btn-success btn-receipt-record" data-id="${r.id}">&#x1F9FE; 영수증</button>
                  <button class="btn btn-sm btn-secondary btn-edit-record" data-id="${r.id}">&#x270F; 수정</button>
                  <button class="btn btn-sm btn-danger btn-delete-record" data-id="${r.id}">&#x1F5D1; 삭제</button>
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
          &#x2713; 모든 기록을 불러왔습니다 (${totalCount.toLocaleString('ko-KR')}건)
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

    document.querySelectorAll('.btn-photo-card').forEach(btn => {
      btn.addEventListener('click', () => this.generatePhotoCard(Number(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-receipt-record').forEach(btn => {
      btn.addEventListener('click', () => this.showReceipt(Number(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-edit-record').forEach(btn => {
      btn.addEventListener('click', () => this.showForm(Number(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-delete-record').forEach(btn => {
      btn.addEventListener('click', () => this.deleteRecord(Number(btn.dataset.id)));
    });

  },

  applyFilters() {
    const search = (document.getElementById('record-search')?.value || '').toLowerCase();
    const month = document.getElementById('filter-month')?.value || '';
    const payment = document.getElementById('filter-payment')?.value || '';

    // Save filter state to sessionStorage
    sessionStorage.setItem('record-filter', JSON.stringify({
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

    // Pre-fill from appointment if provided
    if (fromAppointment && !id) {
      let serviceName = '';
      if (fromAppointment.serviceIds?.length) {
        const allSvcs = await DB.getAll('services');
        const sMap = {}; allSvcs.forEach(s => { sMap[s.id] = s.name; });
        serviceName = sMap[fromAppointment.serviceIds[0]] || '';
      }
      record = {
        customerId: fromAppointment.customerId,
        petId: fromAppointment.petId,
        date: fromAppointment.date,
        groomer: fromAppointment.groomer,
        service: serviceName,
        serviceIds: fromAppointment.serviceIds || [],
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
            <label class="form-label">기본가</label>
            <input type="number" id="f-servicePrice" value="${record.servicePrice || record.totalPrice || ''}" placeholder="0" min="0" step="1000">
          </div>
        </div>
        <!-- 즉석 새 서비스 등록 (드롭다운에서 "+새 서비스 등록" 선택 시 표시) -->
        <div id="quickadd-service-form" style="display:none;background:var(--primary-light);border:1.5px solid var(--primary);border-radius:var(--radius);padding:12px;margin-bottom:12px">
          <div style="font-weight:700;font-size:0.88rem;color:var(--primary);margin-bottom:8px">&#x2728; 새 서비스 즉석 등록</div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label" style="font-size:0.78rem">이름</label>
            <input type="text" id="quickadd-name" placeholder="서비스 이름" maxlength="40" style="min-height:40px">
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label" style="font-size:0.78rem">분류</label>
            <div id="quickadd-category-chips" style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="payment-chip active" data-value="grooming">&#x2702; 미용</button>
              <button type="button" class="payment-chip" data-value="addon">&#x2728; 추가</button>
              <button type="button" class="payment-chip" data-value="care">&#x1F4A7; 케어</button>
            </div>
            <input type="hidden" id="quickadd-category" value="grooming">
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label class="form-label" style="font-size:0.78rem">가격 (원) <span style="color:var(--text-muted);font-weight:400">— 모든 사이즈 동일 (수정 페이지에서 사이즈별 변경 가능)</span></label>
            <input type="number" id="quickadd-price" placeholder="0" min="0" step="1000" style="min-height:40px">
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" class="btn btn-primary" id="quickadd-save" style="flex:1;min-height:40px">&#x2714; 등록 + 사용</button>
            <button type="button" class="btn btn-secondary" id="quickadd-cancel" style="flex:1;min-height:40px">취소</button>
          </div>
        </div>
        <!-- 합계 + 결제 수단 (필수 매출 정보) -->
        <div class="form-group" id="final-price-display" style="background:var(--bg);border-radius:var(--radius);padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">합계</span>
          <span id="final-price-value" style="font-size:1.2rem;font-weight:800;color:var(--primary)">${App.formatCurrency((record.servicePrice || record.totalPrice || 0) + (record.addonPrice || 0) - (record.discount || 0))}</span>
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

        <!-- 상세 옵션 토글 (스타일·추가 항목·미용사·할인·메모 등) -->
        <div class="form-detail-divider" onclick="this.closest('.modal-body').querySelector('.form-detail-section').classList.toggle('open');this.classList.toggle('open')">
          <span class="form-detail-divider-line"></span>
          <span class="form-detail-divider-label">상세 옵션</span>
          <span class="form-detail-divider-chevron">&#x25BC;</span>
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
            <div id="f-addon-tags" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">${(record.addons || []).map(a => '<span class="badge badge-info addon-tag" style="cursor:pointer;padding:6px 10px" title="클릭하여 제거">' + App.escapeHtml(a) + ' ×</span>').join('')}</div>
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
                <select id="f-earStatus" style="font-size:0.85rem;padding:6px 10px">
                  <option value="">선택 안 함</option>
                  <option value="clean" ${record.earStatus === 'clean' ? 'selected' : ''}>깨끗</option>
                  <option value="dirty" ${record.earStatus === 'dirty' ? 'selected' : ''}>경미한 오염</option>
                  <option value="infected" ${record.earStatus === 'infected' ? 'selected' : ''}>염증 의심</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:0.82rem">엉킴 정도</label>
                <select id="f-mattingLevel" style="font-size:0.85rem;padding:6px 10px">
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
      `,
      onSave: () => this.saveRecord(id)
    });

    // Pet change -> auto-set size and show pet notes
    document.getElementById('f-petId')?.addEventListener('change', async (e) => {
      const pid = Number(e.target.value);
      if (!pid) return;
      const pet = await DB.get('pets', pid);
      if (pet) {
        // Auto-set size
        const sizeSelect = document.getElementById('f-sizeType');
        if (sizeSelect) {
          let size = pet.size;
          if (!size && pet.weight) {
            size = pet.weight < 7 ? 'small' : pet.weight < 15 ? 'medium' : 'large';
          }
          if (size) sizeSelect.value = size;
          // Trigger price recalculation
          sizeSelect.dispatchEvent(new Event('change'));
        }
        // Show pet info box
        this.showPetInfoBox(pet);
      }
    });

    // Show pet info if already selected
    if (record.petId) {
      const pet = await DB.get('pets', record.petId);
      if (pet) {
        let size = pet.size;
        if (!size && pet.weight) {
          size = pet.weight < 7 ? 'small' : pet.weight < 15 ? 'medium' : 'large';
        }
        if (size) document.getElementById('f-sizeType').value = size;
        this.showPetInfoBox(pet);
      }
    }

    // ===== 자동완성 드롭다운 헬퍼 =====
    // opts.onNoMatch: 입력값과 정확히 일치하는 항목 없을 때 드롭다운 하단에 추가할 액션 (예: "+ 새 서비스 등록")
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

        let html = filtered.slice(0, 10).map(v => `<div class="search-select-option" data-action="select" style="padding:8px 12px;cursor:pointer;font-size:0.9rem">${App.escapeHtml(v)}</div>`).join('');

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
            } else {
              input.value = opt.textContent;
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
    const defaultServices = ['전체미용', '목욕', '위생미용', '부분미용', '클리퍼컷', '스포팅'];
    const defaultAddons = ['엉킴 제거', '약욕', '보습팩', '염색'];
    const defaultStyles = ['테디베어컷', '배냇컷', '라이언컷', '하이바컷', '머쉬룸컷', '스포팅컷', '자연컷', '클린페이스'];

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
    setupAutocomplete('f-addon-input', 'addon-dropdown', 'addonHistory', defaultAddons);

    // 추가 항목 태그 시스템
    const addonTagsEl = document.getElementById('f-addon-tags');
    const addonInput = document.getElementById('f-addon-input');
    const addAddonTag = (name) => {
      if (!name.trim()) return;
      const tag = document.createElement('span');
      tag.className = 'badge badge-info addon-tag';
      tag.style.cssText = 'cursor:pointer;padding:6px 10px';
      tag.title = '클릭하여 제거';
      tag.textContent = name.trim() + ' ×';
      tag.addEventListener('click', () => tag.remove());
      addonTagsEl.appendChild(tag);
    };
    addonInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addAddonTag(addonInput.value); addonInput.value = ''; document.getElementById('addon-dropdown').style.display = 'none'; }
    });
    // 기존 태그 클릭 제거
    addonTagsEl?.querySelectorAll('.addon-tag').forEach(tag => { tag.addEventListener('click', () => tag.remove()); });

    // 서비스 선택 시 가격 자동 채움
    const serviceInput = document.getElementById('f-service');
    const servicePriceInput = document.getElementById('f-servicePrice');
    let servicePriceManual = !!id; // 수정 모드면 자동채움 비활성
    servicePriceInput?.addEventListener('input', () => { servicePriceManual = true; });
    serviceInput?.addEventListener('change', async () => {
      if (servicePriceManual) return;
      const petId = Number(document.getElementById('f-petId')?.value);
      const sizeType = document.getElementById('f-sizeType')?.value || 'small';
      const price = await App.getRecentServicePrice(petId, serviceInput.value, sizeType);
      if (price && servicePriceInput) { servicePriceInput.value = price; calcTotal(); }
    });

    // 합계 자동 계산
    const calcTotal = () => {
      const base = Number(document.getElementById('f-servicePrice')?.value) || 0;
      const addon = Number(document.getElementById('f-addonPrice')?.value) || 0;
      const discount = Number(document.getElementById('f-discount')?.value) || 0;
      const el = document.getElementById('final-price-value');
      if (el) el.textContent = App.formatCurrency(base + addon - discount);
    };
    document.getElementById('f-servicePrice')?.addEventListener('input', calcTotal);
    document.getElementById('f-addonPrice')?.addEventListener('input', calcTotal);
    document.getElementById('f-discount')?.addEventListener('input', calcTotal);

    // Payment chip buttons
    document.querySelectorAll('.payment-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.payment-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('f-paymentMethod').value = chip.dataset.value;
      });
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
          const colors = { good: 'var(--success-light)', normal: 'var(--warning-light)', caution: 'var(--danger-bg-soft)' };
          chip.style.background = colors[chip.dataset.value] || 'var(--bg-white)';
          hiddenInput.value = chip.dataset.value;
        } else {
          hiddenInput.value = '';
        }
      });
    });

    const origCustomerOnChange = async (cid) => {
      const petSelect = document.getElementById('f-petId');
      petSelect.innerHTML = '<option value="">반려견 선택</option>' + await App.getPetOptions(cid);
      // 반려견 1마리 자동 선택
      if (cid) {
        const cPets = await DB.getByIndex('pets', 'customerId', Number(cid));
        if (cPets.length === 1) {
          petSelect.value = cPets[0].id;
          petSelect.dispatchEvent(new Event('change'));
        }
      }
    };

    // Re-render customer select with enhanced onChange
    await App.renderCustomerSelect('record-customer-select', record.customerId, origCustomerOnChange);

    // 초기 합계 계산
    calcTotal();

  },

  async saveRecord(id) {
    try {
      const customerId = Number(document.getElementById('record-customer-select-value')?.value || document.getElementById('f-customerId')?.value);
      const petId = Number(document.getElementById('f-petId').value);
      const date = document.getElementById('f-date').value;
      const groomer = document.getElementById('f-groomer').value.trim();
      const memo = document.getElementById('f-memo').value.trim();
      const paymentMethod = document.getElementById('f-paymentMethod').value;

      // 새 서비스/스타일/가격 필드
      const service = document.getElementById('f-service')?.value?.trim() || '';
      const servicePrice = Number(document.getElementById('f-servicePrice')?.value) || 0;
      const style = document.getElementById('f-style')?.value?.trim() || '';
      const addons = []; document.querySelectorAll('#f-addon-tags .addon-tag').forEach(tag => { const t = tag.textContent.replace(' ×', '').trim(); if (t) addons.push(t); });
      const addonPrice = Number(document.getElementById('f-addonPrice')?.value) || 0;
      const totalPrice = servicePrice + addonPrice;
      // 호환용: serviceNames 배열도 저장
      const serviceNames = service ? [service] : [];

      // 컨디션 체크 필드
      const condition = document.getElementById('f-condition')?.value || '';
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
      const appointmentId = document.getElementById('f-appointmentId')?.value || null;
      const status = 'completed';

      const data = { customerId, petId, date, groomer, nextVisitDate, service, servicePrice, addons, addonPrice, style, serviceNames, totalPrice, discount, extraCharge, finalPrice, memo, paymentMethod, appointmentId, status, condition, skinStatus, earStatus, mattingLevel };

      // 자동완성 이력 업데이트
      if (service) App.addAutoHistory('serviceHistory', service);
      if (style) App.addAutoHistory('styleHistory', style);
      addons.forEach(a => App.addAutoHistory('addonHistory', a));

      let prevCustomerId = null;
      if (id) {
        const existing = await DB.get('records', id);
        if (!existing) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
        prevCustomerId = existing.customerId;
        Object.assign(existing, data);
        await DB.update('records', existing);
        App.showToast('미용 기록이 수정되었습니다.');
      } else {
        await DB.add('records', data);
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

      // 반려건 lastVisitDate 업데이트
      try {
        const pet = await DB.get('pets', petId);
        if (pet) {
          if (!pet.lastVisitDate || date > pet.lastVisitDate) {
            pet.lastVisitDate = date;
            await DB.update('pets', pet);
          }
        }
      } catch(e) { /* ignore */ }

      App.closeModal();

      // 신규 기록: 완료 모달 (다음 예약 + 문자 발송 버튼 통합)
      if (!id) {
        const customer = await DB.get('customers', customerId);
        const pet = await DB.get('pets', petId);
        const customerPhone = (customer?.phone || '').replace(/\D/g, '');

        App.handleRoute();

        const hasCondition = condition || skinStatus.length || earStatus || mattingLevel;

        App.showModal({
          title: '미용 기록 저장 완료',
          hideFooter: true,
          content: `
            <div style="text-align:center;padding:20px 0">
              <div style="font-size:2.5rem;margin-bottom:12px">&#x2705;</div>
              <div style="font-size:1.1rem;font-weight:700;margin-bottom:20px">미용 기록이 저장되었습니다</div>
              <div style="display:flex;flex-direction:column;gap:10px;max-width:280px;margin:0 auto">
                ${customerPhone ? `<button class="btn btn-success" id="post-save-sms">&#x1F4AC; 미용 완료 문자 보내기</button>` : ''}
                ${hasCondition ? `<button class="btn btn-success" id="post-save-report-copy" style="background:var(--info)">&#x1F4CB; 리포트 복사 (카톡용)</button>` : ''}
                <button class="btn btn-primary" id="post-save-appt">&#x1F4C5; 다음 예약 등록${nextVisitDate ? ' (' + App.formatDate(nextVisitDate) + ')' : ''}</button>
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
            '고객명': App.getCustomerLabel(customer),
            '반려견명': pet?.name || '',
            '서비스': svcDisplay,
            '금액': String(finalPrice)
          });
          App.openSms(customerPhone, msg);
          // Don't close modal - just update button to show sent
          const btn = document.getElementById('post-save-sms');
          if (btn) { btn.textContent = '\u2713 발송됨'; btn.disabled = true; btn.style.opacity = '0.6'; }
        });
        // 리포트 복사 (카톡용) -- 미리 리포트 생성 (iOS clipboard 제스처 타이밍)
        let _cachedReport = null;
        App.buildGroomingReport(data).then(r => { _cachedReport = r; });
        document.getElementById('post-save-report-copy')?.addEventListener('click', async () => {
          const report = _cachedReport || await App.buildGroomingReport(data);
          navigator.clipboard.writeText(report).then(() => {
            App.showToast('리포트가 복사되었습니다. 카톡에 붙여넣기 하세요.');
            const btn = document.getElementById('post-save-report-copy');
            if (btn) { btn.textContent = '\u2713 복사됨'; btn.disabled = true; btn.style.opacity = '0.6'; }
          }).catch(() => {
            App.showToast('복사에 실패했습니다.', 'error');
          });
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

  async deleteRecord(id) {
    const confirmed = await App.confirm('이 미용 기록을 삭제하시겠습니까?');
    if (!confirmed) return;
    try {
      const record = await DB.get('records', id);
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
      if (record && record.petId) {
        const petRecords = await DB.getByIndex('records', 'petId', record.petId);
        const pet = await DB.get('pets', record.petId);
        if (pet) {
          const latest = petRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
          pet.lastVisitDate = latest ? latest.date : null;
          await DB.update('pets', pet);
        }
      }
      // 고객 태그 재계산 (방문 횟수 기반, 수동 변경 보존)
      if (record && record.customerId) {
        try { await this._recalcCustomerTag(record.customerId); }
        catch (e) { console.warn('Auto-tag error:', e); }
      }
      App.showToast('미용 기록이 삭제되었습니다.');
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
      <div class="pet-info-title">&#x26A0; ${App.escapeHtml(pet.name)} 특이사항</div>
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
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">&#x1F4B3; 결제 수단별</div>
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
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">&#x2702; 미용사별</div>
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
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">&#x1F4CB; 상세 내역</div>
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
        <button class="btn btn-primary" onclick="window.print()">&#x1F5A8; 인쇄</button>
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

    const serviceItems = (record.serviceIds || []).map(id => serviceMap[id]).filter(Boolean);
    // 새 형식 처리
    if (record.service && serviceItems.length === 0) {
      serviceItems.push(record.service);
      if (record.addons) record.addons.forEach(a => serviceItems.push(a));
    }
    const totalPrice = Number(record.totalPrice) || 0;
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
          ${serviceItems.length > 0 ? serviceItems.map(s => {
            if (typeof s === 'string') {
              return `<div class="receipt-row"><span>${App.escapeHtml(s)}</span><span></span></div>`;
            }
            const sizeType = pet?.size || (pet?.weight ? (pet.weight < 7 ? 'small' : pet.weight < 15 ? 'medium' : 'large') : 'small');
            const priceKey = 'price' + sizeType.charAt(0).toUpperCase() + sizeType.slice(1);
            const price = Number(s[priceKey]) || 0;
            return `<div class="receipt-row"><span>${App.escapeHtml(s.name)}</span><span>${App.formatCurrency(price)}</span></div>`;
          }).join('') : '<div style="color:var(--text-muted)">서비스 미지정</div>'}
          <hr class="receipt-divider">
          <div class="receipt-row"><span>소계</span><span>${App.formatCurrency(totalPrice)}</span></div>
          ${discount > 0 ? `<div class="receipt-row text-danger"><span>할인</span><span>-${App.formatCurrency(discount)}</span></div>` : ''}
          ${extraCharge > 0 ? `<div class="receipt-row"><span>추가요금</span><span>+${App.formatCurrency(extraCharge)}</span></div>` : ''}
          <div class="receipt-row total"><span>합계</span><span>${App.formatCurrency(finalPrice)}</span></div>
          ${record.paymentMethod ? `<div class="receipt-row"><span>결제</span><span>${this.getPaymentLabel(record.paymentMethod)}</span></div>` : ''}
          <div class="receipt-footer">
            <p>감사합니다 ♥</p>
          </div>
        </div>
      </div>
      <div style="text-align:center;margin-top:16px">
        <button class="btn btn-primary" onclick="window.print()">&#x1F5A8; 인쇄</button>
      </div>
    `;

    App.showModal({
      title: '영수증',
      content: receiptContent,
      hideFooter: true
    });
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
    const fontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';
    const footerMessage = designSettings.footerMessage || '감사합니다 \u2665';
    const layout = designSettings.layout || 'strip2';
    const s = designSettings; // shorthand

    const infoLines = this._buildInfoLines(record, pet, serviceNames, s);
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
    const photos2 = [imgBefore || imgAfter, imgAfter || imgBefore];
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
      const W = 450, H = 650;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);

      const pad = 25;
      const photoW = W - pad * 2; // 400
      const photoH = 500;
      const mainImg = imgAfter || imgBefore;

      _drawPhoto(ctx, mainImg, pad, pad, photoW, photoH, 8);

      // Pet name + date at bottom
      const bottomY = pad + photoH + 28;
      ctx.fillStyle = textColor; ctx.font = 'bold 18px ' + fontFamily; ctx.textAlign = 'center';
      const labelParts = [petName];
      if (s.showDate) labelParts.push(dateStr);
      ctx.fillText(labelParts.join(' | '), W / 2, bottomY);

      ctx.fillStyle = textSub; ctx.font = '13px ' + fontFamily;
      ctx.fillText(shopName, W / 2, bottomY + 24);
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

      const pad = 30;
      const photoS = W - pad * 2; // 340
      const gap = 12;

      // Shop name
      ctx.fillStyle = textSub; ctx.font = '14px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(shopName, W / 2, 30);

      const topY = 50;
      // Photo 1 (Before)
      _drawPhoto(ctx, photos2[0], pad, topY, photoS, photoS, 6);
      // Before label
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this._roundRect(ctx, pad + 8, topY + 8, 64, 24, 6); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 11px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText('BEFORE', pad + 40, topY + 24);

      // Photo 2 (After)
      const afterY = topY + photoS + gap;
      _drawPhoto(ctx, photos2[1], pad, afterY, photoS, photoS, 6);
      // After label
      ctx.fillStyle = mainColor;
      this._roundRect(ctx, pad + 8, afterY + 8, 56, 24, 6); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 11px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText('AFTER', pad + 36, afterY + 24);

      // Pet name + date
      const bottomY = afterY + photoS + 28;
      ctx.fillStyle = textColor; ctx.font = 'bold 18px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(petName, W / 2, bottomY);
      ctx.fillStyle = textSub; ctx.font = '13px ' + fontFamily;
      ctx.fillText(dateStr, W / 2, bottomY + 22);

      // Info lines
      let iy = bottomY + 46;
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

      // Labels on photos
      const labelPositions = [
        { x: pad + 8, y: topY + 8, text: 'BEFORE' },
        { x: pad + cellW + gap + 8, y: topY + 8, text: 'AFTER' },
        { x: pad + 8, y: topY + cellH + gap + 8, text: 'BEFORE' },
        { x: pad + cellW + gap + 8, y: topY + cellH + gap + 8, text: 'AFTER' }
      ];
      labelPositions.forEach((lbl, i) => {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.5)' : mainColor;
        const lw = lbl.text === 'BEFORE' ? 64 : 56;
        this._roundRect(ctx, lbl.x, lbl.y, lw, 22, 5); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 10px ' + fontFamily; ctx.textAlign = 'center';
        ctx.fillText(lbl.text, lbl.x + lw / 2, lbl.y + 16);
      });

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

      // 4장 사진
      const allPhotos = [photos4[0], photos4[1], photos4[2], photos4[3]];
      for (let i = 0; i < 4; i++) {
        const py = pad + i * (photoH + gap);
        // 프레임
        if (s.template === 'classic' || s.template === 'film') {
          ctx.strokeStyle = borderColor; ctx.lineWidth = 1;
          ctx.strokeRect(pad - 1, py - 1, photoW + 2, photoH + 2);
        }
        ctx.save();
        this._roundRect(ctx, pad, py, photoW, photoH, s.template === 'pastel' ? 12 : 4);
        ctx.clip();
        _drawPhoto(ctx, allPhotos[i], pad, py, photoW, photoH);
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
    else if (layout === 'feed') {
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
      const photoH = Math.round(photoW * 4 / 3);
      const photoY = topPad + 10;
      ctx.save();
      this._roundRect(ctx, photoPad, photoY, photoW, photoH, 16);
      ctx.clip();
      _drawPhoto(ctx, imgBefore || imgAfter, photoPad, photoY, photoW, photoH);
      ctx.restore();

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
    else if (layout === 'story') {
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
      const photoH = Math.round(photoW * 4 / 3);
      const photoY = 160;
      ctx.save();
      this._roundRect(ctx, photoPad, photoY, photoW, photoH, 24);
      ctx.clip();
      _drawPhoto(ctx, imgBefore || imgAfter, photoPad, photoY, photoW, photoH);
      ctx.restore();

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
    if (canvas.width < 1080) {
      const scale = 1080 / canvas.width;
      const upCanvas = document.createElement('canvas');
      upCanvas.width = 1080;
      upCanvas.height = Math.round(canvas.height * scale);
      const upCtx = upCanvas.getContext('2d');
      upCtx.imageSmoothingQuality = 'high';
      upCtx.drawImage(canvas, 0, 0, upCanvas.width, upCanvas.height);
      return upCanvas;
    }

    return canvas;
  },

  // ========== Photo Card System (사진 카드) ==========
  _cardPhotos: [],
  _CARD_LAYOUTS: {
    photobooth: { name: '네컷 세로', icon: '🎞', photos: 4 },
    feed: { name: '피드 4:5', icon: '📷', photos: 1 },
    story: { name: '스토리', icon: '📱', photos: 1 },
    strip2: { name: '2컷', icon: '🎬', photos: 2 },
    single: { name: '1컷', icon: '🖼', photos: 1 }
  },
  _CARD_THEMES: {
    classic: { name: '클래식', color: '#1A1A1A', emoji: '🤍' },
    film: { name: '필름', color: '#8B7355', emoji: '🎞' },
    pastel: { name: '파스텔', color: '#F9A8D4', emoji: '🌷' },
    dark: { name: '다크', color: '#0F172A', emoji: '✨' }
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
  },

  _renderPhotoSlots(count) {
    const container = document.getElementById('card-photo-slots');
    if (!container) return;
    this._cardPhotos = new Array(count).fill(null);
    // 메타: offsetX/offsetY = -50~+50 (사진 중심 기준 비율 이동), zoom = 1.0~2.0
    this._cardPhotoMeta = new Array(count).fill(null).map(() => ({ offsetX: 0, offsetY: 0, zoom: 1.0 }));
    container.innerHTML = Array.from({ length: count }, (_, i) => `
      <div style="flex:1 1 calc(50% - 4px);min-width:140px;max-width:200px">
        <input type="file" id="card-photo-${i}" accept="image/*" style="display:none">
        <div id="card-preview-${i}" style="width:100%;height:120px;border:2px dashed var(--border);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;font-size:1.4rem;color:var(--text-muted);background:var(--bg)" onclick="document.getElementById('card-photo-${i}').click()">📷</div>
        <div id="card-photo-controls-${i}" style="display:none;margin-top:6px;font-size:0.7rem">
          <div class="photo-slider-row" style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="color:var(--text-muted);flex-shrink:0;min-width:30px">좌↔우</span>
            <input type="range" min="-50" max="50" step="2" value="0" class="card-x-slider" data-slot="${i}" style="flex:1;height:24px;min-height:0">
            <span id="card-x-label-${i}" style="color:var(--text-muted);flex-shrink:0;min-width:36px;text-align:right">0%</span>
          </div>
          <div class="photo-slider-row" style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="color:var(--text-muted);flex-shrink:0;min-width:30px">위↕아</span>
            <input type="range" min="-50" max="50" step="2" value="0" class="card-y-slider" data-slot="${i}" style="flex:1;height:24px;min-height:0">
            <span id="card-y-label-${i}" style="color:var(--text-muted);flex-shrink:0;min-width:36px;text-align:right">0%</span>
          </div>
          <div class="photo-slider-row" style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="color:var(--text-muted);flex-shrink:0;min-width:30px">줌</span>
            <input type="range" min="100" max="200" step="5" value="100" class="card-zoom-slider" data-slot="${i}" style="flex:1;height:24px;min-height:0">
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
            this._refreshPhotoPreview(i);
            this._resetPhotoSliders(i);
            const ctrls = document.getElementById(`card-photo-controls-${i}`);
            if (ctrls) ctrls.style.display = 'block';
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
    if (!photo) { preview.innerHTML = '📷'; return; }
    const meta = this._cardPhotoMeta[slot] || { offsetX: 0, offsetY: 0, zoom: 1.0 };
    // offsetX/Y = -50~+50 → object-position % = 0~100
    const colPct = (50 + (meta.offsetX || 0)) + '%';
    const rowPct = (50 + (meta.offsetY || 0)) + '%';
    preview.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;object-position:${colPct} ${rowPct};transform:scale(${meta.zoom});transform-origin:${colPct} ${rowPct};transition:transform 0.12s,object-position 0.12s">`;
  },

  async generatePhotoCard(recordId) {
    const record = await DB.get('records', recordId);
    if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }

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

    App.showModal({
      title: '사진 카드 만들기',
      saveText: '카드 생성',
      content: `
        <div class="form-group">
          <label class="form-label">레이아웃</label>
          <div id="card-pick-layout" style="display:flex;gap:8px;flex-wrap:wrap">
            ${Object.entries(LAYOUTS).map(([key, l]) => `
              <button type="button" class="card-pick-btn${key === selectedLayout ? ' active' : ''}" data-key="${key}" data-photos="${l.photos}">
                <span style="font-size:1.3rem">${l.icon}</span>
                <span style="font-size:0.75rem">${l.name}</span>
              </button>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">사진 선택</label>
          <div id="card-photo-slots" style="display:flex;gap:8px;flex-wrap:wrap"></div>
        </div>
        <div class="form-group">
          <label class="form-label">테마</label>
          <div id="card-pick-theme" style="display:flex;gap:8px;flex-wrap:wrap">
            ${Object.entries(THEMES).map(([key, t]) => `
              <button type="button" class="card-pick-btn${key === selectedTheme ? ' active' : ''}" data-key="${key}" style="border-color:${t.color}">
                <span style="font-size:1.1rem">${t.emoji}</span>
                <span style="font-size:0.7rem;color:${t.color}">${t.name}</span>
              </button>
            `).join('')}
            <button type="button" class="card-pick-btn${selectedTheme === 'custom' ? ' active' : ''}" data-key="custom" style="border-color:#888">
              <span style="font-size:1.1rem">🎨</span>
              <span style="font-size:0.7rem;color:#888">커스텀</span>
            </button>
          </div>
        </div>
        <!-- 매장 로고 위치/크기 (모든 테마 공통) -->
        <div class="form-group" style="padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:12px">
          <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">매장 로고 — 위치 / 크기 <span style="color:var(--text-muted);font-weight:400">(설정에서 로고 업로드 시 적용)</span></label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <select id="card-logo-position" style="flex:1;min-width:140px;min-height:40px;font-size:0.85rem">
              <option value="top" ${(saved.logoPosition || 'top') === 'top' ? 'selected' : ''}>상단</option>
              <option value="top-safe" ${saved.logoPosition === 'top-safe' ? 'selected' : ''}>상단 (스토리 안전 영역)</option>
              <option value="center" ${saved.logoPosition === 'center' ? 'selected' : ''}>중앙 (워터마크)</option>
              <option value="bottom" ${saved.logoPosition === 'bottom' ? 'selected' : ''}>하단</option>
              <option value="none" ${saved.logoPosition === 'none' ? 'selected' : ''}>표시 안 함</option>
            </select>
            <select id="card-logo-size" style="flex:1;min-width:120px;min-height:40px;font-size:0.85rem">
              <option value="small" ${saved.logoSize === 'small' ? 'selected' : ''}>작게 (70%)</option>
              <option value="medium" ${(saved.logoSize || 'medium') === 'medium' ? 'selected' : ''}>보통 (100%)</option>
              <option value="large" ${saved.logoSize === 'large' ? 'selected' : ''}>크게 (140%)</option>
              <option value="xl" ${saved.logoSize === 'xl' ? 'selected' : ''}>매우 크게 (180%)</option>
            </select>
          </div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">&#x1F4A1; 스토리(9:16)는 상단·하단 일부가 인스타 UI(시간/좋아요)에 가려져요. "안전 영역" 권장</div>
        </div>

        <!-- 자유 텍스트 (헤드라인·서브·하단 메시지) -->
        <div class="form-group" style="padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:12px">
          <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">자유 텍스트 <span style="color:var(--text-muted);font-weight:400">(빈 칸은 표시 안 됨)</span></label>
          <input type="text" id="card-headline" placeholder="헤드라인 (예: Bobby의 첫 미용 ✨)" value="${App.escapeHtml(saved.headline || '')}" maxlength="40" style="width:100%;margin-bottom:6px;min-height:40px;font-size:0.9rem">
          <input type="text" id="card-subline" placeholder="서브타이틀 (예: 행복한 하루)" value="${App.escapeHtml(saved.subline || '')}" maxlength="50" style="width:100%;margin-bottom:6px;min-height:40px;font-size:0.9rem">
          <input type="text" id="card-footer" placeholder="하단 메시지 (기본: 감사합니다 ♥)" value="${App.escapeHtml(saved.footerMessage || '')}" maxlength="60" style="width:100%;min-height:40px;font-size:0.9rem">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:6px">&#x1F4A1; 인스타 피드·스토리 레이아웃에 적용. 이모지 사용 가능</div>
        </div>

        <!-- 커스텀 테마 옵션 (커스텀 선택 시만 표시) -->
        <div id="card-custom-panel" style="display:${selectedTheme === 'custom' ? 'block' : 'none'};padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:12px">
          <div style="margin-bottom:10px">
            <label class="form-label" style="font-size:0.82rem;margin-bottom:6px">빠른 색상 조합</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#FFFFFF" data-text="#1A1A1A" data-accent="#1A1A1A" style="border:1.5px solid var(--border);min-height:36px">⬜ 화이트</button>
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#F5F0E8" data-text="#5C4A32" data-accent="#8B7355" style="border:1.5px solid #8B7355;min-height:36px">🟤 베이지</button>
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#FFF0F5" data-text="#9D174D" data-accent="#DB2777" style="border:1.5px solid #DB2777;min-height:36px">🩷 로즈</button>
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#0F172A" data-text="#E2E8F0" data-accent="#C9A96E" style="border:1.5px solid #C9A96E;min-height:36px">🌙 네이비</button>
              <button type="button" class="btn btn-sm card-preset-btn" data-bg="#F0FDF4" data-text="#14532D" data-accent="#16A34A" style="border:1.5px solid #16A34A;min-height:36px">🌿 민트</button>
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
          <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap">
            <label class="checkbox-label" style="font-size:0.82rem;min-height:auto;padding:4px 0"><input type="checkbox" id="card-custom-showPet" ${(saved.customShowPet !== false) ? 'checked' : ''}> 반려견 이름</label>
            <label class="checkbox-label" style="font-size:0.82rem;min-height:auto;padding:4px 0"><input type="checkbox" id="card-custom-showDate" ${(saved.customShowDate !== false) ? 'checked' : ''}> 날짜</label>
            <label class="checkbox-label" style="font-size:0.82rem;min-height:auto;padding:4px 0"><input type="checkbox" id="card-custom-showShop" ${(saved.customShowShop !== false) ? 'checked' : ''}> 매장명</label>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:0.82rem">배경 이미지 <span style="color:var(--text-muted);font-weight:400">(선택)</span></label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="file" id="card-custom-bgimg" accept="image/*" style="display:none">
              <button type="button" class="btn btn-sm btn-secondary" id="card-custom-bgimg-btn">${saved.customBgImage ? '이미지 변경' : '이미지 선택'}</button>
              <span id="card-custom-bgimg-name" style="font-size:0.78rem;color:var(--text-muted)">${saved.customBgImage ? '✓ 설정됨' : ''}</span>
              ${saved.customBgImage ? '<button type="button" class="btn btn-sm btn-danger" id="card-custom-bgimg-remove">제거</button>' : ''}
            </div>
          </div>
        </div>
      `,
      onSave: async () => {
        const layout = document.querySelector('#card-pick-layout .card-pick-btn.active')?.dataset.key || 'strip2';
        const theme = document.querySelector('#card-pick-theme .card-pick-btn.active')?.dataset.key || 'classic';
        if (!this._cardPhotos.some(p => p)) { App.showToast('사진을 최소 1장 선택해주세요.', 'error'); return; }

        const settings = await DB.getSetting('cardDesignSettings') || {};
        settings.layout = layout;
        settings.template = theme;
        // 로고 위치 / 크기 (모든 테마 공통)
        settings.logoPosition = document.getElementById('card-logo-position')?.value || 'top';
        settings.logoSize = document.getElementById('card-logo-size')?.value || 'medium';
        // 자유 텍스트 (헤드라인 / 서브 / 하단)
        settings.headline = (document.getElementById('card-headline')?.value || '').trim();
        settings.subline = (document.getElementById('card-subline')?.value || '').trim();
        const footerInput = (document.getElementById('card-footer')?.value || '').trim();
        if (footerInput) settings.footerMessage = footerInput;
        else settings.footerMessage = settings.footerMessage || '감사합니다 ♥';
        // 커스텀 테마 설정 저장
        if (theme === 'custom') {
          settings.customBgColor = document.getElementById('card-custom-bg')?.value || '#FFFFFF';
          settings.customTextColor = document.getElementById('card-custom-text')?.value || '#1A1A1A';
          settings.customAccentColor = document.getElementById('card-custom-accent')?.value || '#6366F1';
          settings.customBgImage = this._customBgImage || settings.customBgImage || null;
          settings.customShowPet = document.getElementById('card-custom-showPet')?.checked !== false;
          settings.customShowDate = document.getElementById('card-custom-showDate')?.checked !== false;
          settings.customShowShop = document.getElementById('card-custom-showShop')?.checked !== false;
        }
        await DB.setSetting('cardDesignSettings', settings);

        App.closeModal();
        setTimeout(() => {
          this._doGenerateCard(recordId, layout, theme, this._cardPhotos[0] || null, this._cardPhotos[1] || null, this._cardPhotos[2] || null, this._cardPhotos[3] || null, this._cardPhotoMeta || []);
        }, 200);
      }
    });

    // Wire up
    setTimeout(() => {
      // 레이아웃 선택 → 사진 슬롯 동적 변경
      document.querySelectorAll('#card-pick-layout .card-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#card-pick-layout .card-pick-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._renderPhotoSlots(Number(btn.dataset.photos));
        });
      });
      // 초기 사진 슬롯 렌더
      const initPhotos = LAYOUTS[selectedLayout]?.photos || 2;
      this._renderPhotoSlots(initPhotos);

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
            const nameEl = document.getElementById('card-custom-bgimg-name');
            if (nameEl) nameEl.textContent = '✓ 설정됨';
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

  async _doGenerateCard(recordId, layout, theme, photo1, photo2, photo3, photo4, photoMetas) {
    try {
      const record = await DB.get('records', recordId);
      if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
      // 즉석 사진 (DB에 저장 안 함)
      record.photoBefore = photo1 || null;
      record.photoAfter = photo2 || null;
      record.photo3 = photo3 || null;
      record.photo4 = photo4 || null;
      // 사진 메타 (9-Point + Zoom) — _generateCardCanvas 에서 img._meta 로 attach
      record._photoMetas = {
        photoBefore: (photoMetas && photoMetas[0]) || { offsetX: 0, offsetY: 0, zoom: 1.0 },
        photoAfter: (photoMetas && photoMetas[1]) || { offsetX: 0, offsetY: 0, zoom: 1.0 },
        photo3: (photoMetas && photoMetas[2]) || { offsetX: 0, offsetY: 0, zoom: 1.0 },
        photo4: (photoMetas && photoMetas[3]) || { offsetX: 0, offsetY: 0, zoom: 1.0 }
      };
      const customer = await DB.get('customers', record.customerId);
      const pet = await DB.get('pets', record.petId);
      const shopName = await DB.getSetting('shopName') || '펫살롱';
      const shopPhone = await DB.getSetting('shopPhone') || '';
      const serviceNames = record.service ? App.getRecordServiceDisplay(record) : await App.getServiceNames(record.serviceIds);

      // Merge picker selections with saved detail settings
      const ds = await DB.getSetting('cardDesignSettings') || {};
      const os = await DB.getSetting('cardTemplateSettings') || {};
      const designSettings = {
        layout: layout,
        template: theme,
        mainColor: ds.mainColor || os.mainColor || '#6366F1',
        showService: ds.showService !== false,
        showPrice: ds.showPrice !== false,
        showGroomer: ds.showGroomer !== false,
        showNextVisit: ds.showNextVisit !== false,
        showDate: ds.showDate !== false,
        showPetInfo: ds.showPetInfo !== false,
        showShopPhone: ds.showShopPhone !== false,
        footerMessage: ds.footerMessage || os.footerMessage || '감사합니다 ♥',
        logo: ds.logo || await DB.getSetting('shopLogo') || null,
        logoPosition: ds.logoPosition || 'top',
        logoSize: ds.logoSize || 'medium',
        headline: ds.headline || '',
        subline: ds.subline || '',
        // 커스텀 테마
        customBgColor: theme === 'custom' ? (ds.customBgColor || '#FFFFFF') : null,
        customTextColor: theme === 'custom' ? (ds.customTextColor || '#1A1A1A') : null,
        customAccentColor: theme === 'custom' ? (ds.customAccentColor || '#6366F1') : null,
        customBgImage: theme === 'custom' ? (ds.customBgImage || null) : null,
        customShowPet: theme === 'custom' ? (ds.customShowPet !== false) : true,
        customShowDate: theme === 'custom' ? (ds.customShowDate !== false) : true,
        customShowShop: theme === 'custom' ? (ds.customShowShop !== false) : true
      };

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

        // 결과 미리보기 모달 + 3버튼
        App.showModal({
          title: '사진 카드 완성',
          hideFooter: true,
          content: `
            <div style="text-align:center">
              <div style="max-height:50vh;overflow:auto;margin-bottom:16px;border-radius:var(--radius);border:1px solid var(--border-light)">
                <img src="${url}" style="width:100%;display:block" alt="미용 카드">
              </div>
              <div style="display:flex;flex-direction:column;gap:10px;max-width:300px;margin:0 auto">
                <button class="btn btn-primary" id="card-share" style="min-height:48px">&#x1F4E4; 공유하기</button>
                ${customerPhone ? `<button class="btn btn-success" id="card-send-customer" style="min-height:48px">&#x1F4AC; 고객에게 보내기</button>` : ''}
                <button class="btn btn-secondary" id="card-download" style="min-height:48px">&#x1F4E5; 다운로드</button>
              </div>
            </div>
          `
        });

        // 공유
        document.getElementById('card-share')?.addEventListener('click', () => {
          const file = new File([blob], fileName, { type: mimeType });
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file], title: (pet?.name || '') + ' 미용 카드' }).catch(() => {});
          } else {
            App.showToast('이 브라우저에서는 공유가 지원되지 않습니다. 다운로드를 이용해주세요.', 'warning');
          }
        });

        // 고객에게 보내기 (SMS + 카드 다운로드)
        document.getElementById('card-send-customer')?.addEventListener('click', () => {
          // 카드 먼저 다운로드
          const a = document.createElement('a');
          a.href = url; a.download = fileName; a.click();
          // SMS 발송
          setTimeout(() => {
            const msg = `${App.escapeHtml(pet?.name || '')} 미용이 완료되었습니다! 사진 카드를 확인해주세요 ♥`;
            App.openSms(customerPhone, msg);
            App.showToast('카드 저장 + 문자 발송 준비 완료');
          }, 500);
        });

        // 다운로드
        document.getElementById('card-download')?.addEventListener('click', () => {
          const a = document.createElement('a');
          a.href = url; a.download = fileName; a.click();
          App.showToast('카드가 저장되었습니다.');
        });
      }, mimeType, isLarge ? 0.92 : undefined);
    } catch (err) {
      console.error('Photo card generation error:', err);
      App.showToast('카드 생성 중 오류가 발생했습니다.', 'error');
    }
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
          <div id="export-filename" style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px"></div>
          <button class="btn btn-success" id="btn-do-csv-download" style="width:100%;padding:14px;font-size:1rem;font-weight:700" disabled>
            &#x1F4E5; CSV 다운로드
          </button>
        </div>
      </div>
    `;

    App.showModal({
      title: '&#x1F4C4; 세무 자료 내보내기',
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
      const dlBtn = document.getElementById('btn-do-csv-download');
      if (!preview) return;

      if (!start || !end || start > end) {
        preview.innerHTML = '<div style="color:var(--danger);text-align:center;font-size:0.9rem">올바른 기간을 선택해주세요</div>';
        if (dlBtn) dlBtn.disabled = true;
        return;
      }

      preview.innerHTML = '<div style="color:var(--text-muted);text-align:center;font-size:0.9rem">집계 중...</div>';

      // 인덱스 쿼리로 기간 내 records만 로드 (장기 누적 시 필수)
      const filtered = await DB.getByDateRange('records', 'date', start, end);
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
      const fname = `${shopName}_매출내역_${start}_${end}.csv`;
      if (filenameEl) filenameEl.textContent = `파일명: ${fname}`;
      if (dlBtn) dlBtn.disabled = filtered.length === 0;
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
    document.getElementById('btn-do-csv-download')?.addEventListener('click', async () => {
      await this.downloadCSV(currentStart, currentEnd);
    });

    // 초기 미리보기
    await updatePreview(thisMonthStart, today);
  },

  async downloadCSV(start, end) {
    try {
      // records: 인덱스 쿼리로 기간만 로드 (장기 누적 대비)
      const [records, customers, pets, services] = await Promise.all([
        DB.getByDateRange('records', 'date', start, end),
        DB.getAll('customers'),
        DB.getAll('pets'),
        DB.getAll('services')
      ]);

      const customerMap = {};
      customers.forEach(c => { customerMap[c.id] = c; });
      const petMap = {};
      pets.forEach(p => { petMap[p.id] = p; });
      const serviceMap = {};
      services.forEach(s => { serviceMap[s.id] = s.name; });

      const filtered = records
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      const shopName = await DB.getSetting('shopName') || '펫살롱';
      const genDate = App.getToday();

      const csvEsc = (val) => {
        const s = String(val == null ? '' : val);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      const lines = [];

      // 헤더
      lines.push(csvEsc(shopName + ' 매출 내역'));
      lines.push(`기간: ${start} ~ ${end}`);
      lines.push(`생성일: ${genDate}`);
      lines.push('');

      // 상세 내역
      lines.push(['날짜', '고객명', '반려견', '견종', '서비스', '스타일', '추가항목', '기본가', '추가비', '할인', '합계', '결제수단', '담당', '메모'].map(csvEsc).join(','));

      filtered.forEach(r => {
        const customer = customerMap[r.customerId];
        const pet = petMap[r.petId];
        const svcName = r.service || (r.serviceNames || []).join(', ') || '-';
        const payLabel = { cash: '현금', card: '카드', transfer: '이체', unpaid: '미결제' }[r.paymentMethod] || '';
        lines.push([
          r.date || '',
          App.getCustomerLabel(customer),
          pet?.name || '',
          pet?.breed || '',
          svcName,
          r.style || '',
          (r.addons || []).join(', '),
          r.servicePrice || r.totalPrice || 0,
          r.addonPrice || 0,
          Number(r.discount) || 0,
          App.getRecordAmount(r),
          payLabel,
          r.groomer || '',
          r.memo || ''
        ].map(csvEsc).join(','));
      });

      // 요약
      lines.push('');
      lines.push('[요약]');
      const total = filtered.reduce((sum, r) => sum + App.getRecordAmount(r), 0);
      lines.push(`총 건수,${filtered.length}`);
      lines.push(`총 매출,${csvEsc(total.toLocaleString('ko-KR'))}`);

      const breakdown = { cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, transfer: { count: 0, amount: 0 }, unpaid: { count: 0, amount: 0 } };
      filtered.forEach(r => {
        const m = r.paymentMethod || '';
        if (breakdown[m]) {
          breakdown[m].count++;
          breakdown[m].amount += App.getRecordAmount(r);
        }
      });
      lines.push(`현금,${csvEsc(breakdown.cash.amount.toLocaleString('ko-KR'))},${breakdown.cash.count}건`);
      lines.push(`카드,${csvEsc(breakdown.card.amount.toLocaleString('ko-KR'))},${breakdown.card.count}건`);
      lines.push(`이체,${csvEsc(breakdown.transfer.amount.toLocaleString('ko-KR'))},${breakdown.transfer.count}건`);
      lines.push(`미결제,${csvEsc(breakdown.unpaid.amount.toLocaleString('ko-KR'))},${breakdown.unpaid.count}건`);

      // 미용사별 매출
      const groomerMap = {};
      filtered.forEach(r => {
        const name = r.groomer || '미지정';
        if (!groomerMap[name]) groomerMap[name] = { count: 0, amount: 0 };
        groomerMap[name].count++;
        groomerMap[name].amount += App.getRecordAmount(r);
      });
      const groomerEntries = Object.entries(groomerMap).sort((a, b) => b[1].amount - a[1].amount);
      if (groomerEntries.length > 0) {
        lines.push('');
        lines.push('[미용사별 매출]');
        groomerEntries.forEach(([name, data]) => {
          lines.push(`${csvEsc(name)},${csvEsc(data.amount.toLocaleString('ko-KR'))},${data.count}건`);
        });
      }

      // 일별 매출
      const dailyMap = {};
      filtered.forEach(r => {
        if (!r.date) return;
        if (!dailyMap[r.date]) dailyMap[r.date] = { count: 0, amount: 0 };
        dailyMap[r.date].count++;
        dailyMap[r.date].amount += App.getRecordAmount(r);
      });
      const dailyEntries = Object.entries(dailyMap).sort((a, b) => a[0].localeCompare(b[0]));
      if (dailyEntries.length > 0) {
        lines.push('');
        lines.push('[일별 매출]');
        dailyEntries.forEach(([date, data]) => {
          lines.push(`${date},${csvEsc(data.amount.toLocaleString('ko-KR'))},${data.count}건`);
        });
      }

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
      URL.revokeObjectURL(url);

      App.showToast('CSV 파일이 다운로드되었습니다.');
      App.closeModal();
    } catch (err) {
      console.error('CSV export error:', err);
      App.showToast('내보내기 중 오류가 발생했습니다.', 'error');
    }
  },
};
