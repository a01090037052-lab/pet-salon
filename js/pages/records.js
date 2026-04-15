// ========== Grooming Records Page ==========
App.pages.records = {
  async render(container) {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    // 효율적 쿼리: 목록에서는 사진 필드 제외 (큰 base64 데이터)
    const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter']);
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

    const today = App.getToday();
    const thisMonth = today.slice(0, 7);

    // 미수금 경고 카드용 집계 (렌더에서 실제 사용하는 값만)
    const unpaidRecs = records.filter(r => r.paymentMethod === 'unpaid');
    const unpaidTotal = unpaidRecs.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">미용 기록</h1>
          <p class="page-subtitle">총 ${records.length}건</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-record">+ 새 기록</button>
        </div>
      </div>

      ${unpaidRecs.length > 0 ? `
      <div id="unpaid-warning-card" class="card" style="margin-bottom:16px;border:1.5px solid var(--danger);cursor:pointer">
        <div class="card-body" style="padding:16px 20px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,var(--danger-light),#FEE2E2)">
          <span style="font-size:1.5rem">&#x1F4B8;</span>
          <div class="flex-1">
            <div style="font-weight:800;color:var(--danger);font-size:1rem">미수금 경고</div>
            <div style="font-size:0.88rem;color:#991B1B;margin-top:2px">총 ${unpaidRecs.length}건 &middot; ${App.formatCurrency(unpaidTotal)}</div>
          </div>
          <span style="color:var(--danger);font-weight:600;font-size:0.85rem">클릭하여 필터 &rarr;</span>
        </div>
      </div>
      ` : ''}

      <div class="filter-bar">
        <div class="search-box">
          <span class="search-icon">&#x1F50D;</span>
          <input type="text" id="record-search" placeholder="고객, 반려견, 서비스, 메모 검색...">
        </div>
        <input type="month" id="filter-month" value="${thisMonth}">
        <select id="filter-payment" style="min-width:100px">
          <option value="">전체 결제</option>
          <option value="cash">현금</option>
          <option value="card">카드</option>
          <option value="transfer">이체</option>
          <option value="unpaid">미결제</option>
        </select>
        <button class="btn btn-secondary btn-sm" id="btn-clear-filter">필터 초기화</button>
      </div>

      <div id="record-filter-total" hidden style="padding:10px 14px;margin-bottom:12px;background:var(--bg);border-radius:var(--radius);font-size:0.9rem;font-weight:600;justify-content:space-between;align-items:center;display:flex;gap:8px;flex-wrap:wrap"></div>

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
                      <div class="empty-state-text">미용 기록이 없습니다</div>
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
                <div class="empty-state-text">미용 기록이 없습니다</div>
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

    `;
  },

  async init() {
    document.getElementById('btn-add-record')?.addEventListener('click', () => this.showForm());

    // 미수금 경고 카드 클릭 -> 미결제 필터
    document.getElementById('unpaid-warning-card')?.addEventListener('click', () => {
      document.getElementById('filter-month').value = '';
      document.getElementById('filter-payment').value = 'unpaid';
      document.getElementById('record-search').value = '';
      this.applyFilters();
    });

    const _debouncedRecFilter = App.debounce(() => this.applyFilters(), 300);
    document.getElementById('record-search')?.addEventListener('input', _debouncedRecFilter);
    document.getElementById('filter-month')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-payment')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
      document.getElementById('record-search').value = '';
      document.getElementById('filter-month').value = '';
      document.getElementById('filter-payment').value = '';
      sessionStorage.removeItem('record-filter');
      this.applyFilters();
    });

    // Restore saved filter state
    const savedFilter = sessionStorage.getItem('record-filter');
    if (savedFilter) {
      try {
        const f = JSON.parse(savedFilter);
        if (f.search) document.getElementById('record-search').value = f.search;
        if (f.month) document.getElementById('filter-month').value = f.month;
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
        totalEl.hidden = true;
      } else {
        totalEl.hidden = false;
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
        <div class="form-group">
          <label class="form-label">스타일 <span style="color:var(--text-muted);font-size:0.78rem">(선택)</span></label>
          <input type="text" id="f-style" value="${App.escapeHtml(record.style || '')}" placeholder="예: 테디베어컷, 하이바+스포팅" autocomplete="off">
          <div class="search-select-dropdown" id="style-dropdown" style="position:absolute;z-index:10;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);max-height:150px;overflow-y:auto;display:none;width:100%"></div>
        </div>
        <div class="form-group">
          <label class="form-label">추가 항목 <span style="color:var(--text-muted);font-size:0.78rem">(선택 — 엉킴, 약욕, 스파 등)</span></label>
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
        <div class="form-group">
          <label class="form-label">담당 미용사</label>
          <select id="f-groomer">${await App.getGroomerOptions(record.groomer)}</select>
        </div>

        <!-- 컨디션 (기본 표시) -->
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label" style="font-size:0.85rem">컨디션 <span style="font-weight:400;color:var(--text-muted);font-size:0.78rem">(선택 — 리포트에 반영)</span></label>
          <div id="f-condition-chips" style="display:flex;gap:6px">
            <button type="button" class="condition-chip${record.condition === 'good' ? ' active' : ''}" data-field="condition" data-value="good" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'good' ? 'var(--success-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">좋음</button>
            <button type="button" class="condition-chip${record.condition === 'normal' ? ' active' : ''}" data-field="condition" data-value="normal" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'normal' ? 'var(--warning-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">보통</button>
            <button type="button" class="condition-chip${record.condition === 'caution' ? ' active' : ''}" data-field="condition" data-value="caution" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'caution' ? '#FEE2E2' : 'var(--bg-white)'};cursor:pointer;font-size:0.82rem;font-weight:600">주의</button>
          </div>
          <input type="hidden" id="f-condition" value="${record.condition || ''}">
        </div>

        <!-- 상세 옵션 토글 -->
        <div class="form-detail-divider" onclick="this.closest('.modal-body').querySelector('.form-detail-section').classList.toggle('open');this.classList.toggle('open')">
          <span class="form-detail-divider-line"></span>
          <span class="form-detail-divider-label">상세 옵션</span>
          <span class="form-detail-divider-chevron">&#x25BC;</span>
          <span class="form-detail-divider-line"></span>
        </div>

        <!-- 상세 옵션 영역 -->
        <div class="form-detail-section">
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
    const setupAutocomplete = (inputId, dropdownId, historyKey, defaultSuggestions) => {
      const input = document.getElementById(inputId);
      const dropdown = document.getElementById(dropdownId);
      if (!input || !dropdown) return;
      const showDropdown = async (q) => {
        const history = await App.getAutoHistory(historyKey);
        const all = [...new Set([...history, ...(defaultSuggestions || [])])];
        const query = (q || '').trim().toLowerCase();
        const filtered = query ? all.filter(v => v.toLowerCase().includes(query)) : all;
        if (filtered.length === 0) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = filtered.slice(0, 10).map(v => `<div class="search-select-option" style="padding:8px 12px;cursor:pointer;font-size:0.9rem">${App.escapeHtml(v)}</div>`).join('');
        dropdown.style.display = 'block';
        dropdown.querySelectorAll('.search-select-option').forEach(opt => {
          opt.addEventListener('click', (e) => { e.stopPropagation(); input.value = opt.textContent; dropdown.style.display = 'none'; input.dispatchEvent(new Event('change')); });
        });
      };
      input.addEventListener('focus', () => showDropdown(input.value));
      input.addEventListener('input', App.debounce(() => showDropdown(input.value), 200));
      document.addEventListener('click', (e) => { if (!e.target.closest('#' + inputId) && !e.target.closest('#' + dropdownId)) dropdown.style.display = 'none'; });
    };
    const defaultServices = ['전체미용', '목욕', '위생미용', '부분미용', '클리퍼컷', '스포팅'];
    const defaultAddons = ['엉킴 제거', '약욕', '보습팩', '염색'];
    const defaultStyles = ['테디베어컷', '배냇컷', '라이언컷', '하이바컷', '머쉬룸컷', '스포팅컷', '자연컷', '클린페이스'];
    setupAutocomplete('f-service', 'service-dropdown', 'serviceHistory', defaultServices);
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
          const colors = { good: 'var(--success-light)', normal: 'var(--warning-light)', caution: '#FEE2E2' };
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

    const content = `
      <div id="daily-report-content">
        <div style="text-align:center;margin-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px">
            <input type="date" id="report-date-picker" value="${reportDate}" style="width:auto;padding:6px 12px;font-size:0.95rem;font-weight:700;color:var(--text-secondary);text-align:center">
          </div>
          <div style="font-size:2rem;font-weight:800;color:var(--primary);margin-top:4px">${App.formatCurrency(totalRevenue)}</div>
          <div style="color:var(--text-muted);margin-top:4px">총 ${todayRecs.length}건</div>
        </div>

        <div style="margin-bottom:16px">
          <div style="font-weight:700;margin-bottom:8px;font-size:0.95rem">&#x1F4B3; 결제 수단별</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${paymentMethods.map(m => {
              const data = paymentBreakdown[m];
              if (!data || data.count === 0) return '';
              return `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg);border-radius:8px${m === 'unpaid' ? ';border-left:3px solid var(--danger)' : ''}">
                <span>${this.getPaymentLabel(m)} (${data.count}건)</span>
                <strong${m === 'unpaid' ? ' class="text-danger"' : ''}>${App.formatCurrency(data.amount)}</strong>
              </div>`;
            }).filter(Boolean).join('')}
            ${Object.keys(paymentBreakdown).filter(m => !paymentMethods.includes(m) && paymentBreakdown[m].count > 0).map(m => {
              const data = paymentBreakdown[m];
              return `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg);border-radius:8px">
                <span>기타 (${data.count}건)</span>
                <strong>${App.formatCurrency(data.amount)}</strong>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom:16px">
          <div style="font-weight:700;margin-bottom:8px;font-size:0.95rem">&#x2702; 미용사별</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${Object.entries(groomerBreakdown).sort((a, b) => b[1].amount - a[1].amount).map(([name, data]) => `
              <div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg);border-radius:8px">
                <span>${App.escapeHtml(name)} (${data.count}건)</span>
                <strong>${App.formatCurrency(data.amount)}</strong>
              </div>
            `).join('')}
          </div>
        </div>

        <div>
          <div style="font-weight:700;margin-bottom:8px;font-size:0.95rem">&#x1F4CB; 상세 내역</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${todayRecs.length === 0 ? '<p style="color:var(--text-muted);text-align:center">오늘 기록이 없습니다</p>' :
              todayRecs.map(r => {
                const customer = customerMap[r.customerId];
                const pet = petMap[r.petId];
                return `<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--bg);border-radius:8px;font-size:0.88rem${r.paymentMethod === 'unpaid' ? ';border-left:3px solid var(--danger)' : ''}">
                  <span style="color:var(--text-muted);min-width:50px">${this.getPaymentLabel(r.paymentMethod)}</span>
                  <span class="flex-1"><strong>${App.escapeHtml(App.getCustomerLabel(customer))}</strong> / ${App.escapeHtml(pet?.name || '-')}</span>
                  <span style="font-weight:600">${App.escapeHtml(r.groomer || '-')}</span>
                  <strong${r.paymentMethod === 'unpaid' ? ' class="text-danger"' : ''}>${App.formatCurrency(App.getRecordAmount(r))}</strong>
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
    default: { name: '기본', color: '#6366F1', bgColor: '#F8FAFC', emoji: '\u2702', footerBg: '#6366F1' },
    spring: { name: '봄', color: '#EC4899', bgColor: '#FDF2F8', emoji: '\uD83C\uDF38', footerBg: '#EC4899' },
    summer: { name: '여름', color: '#06B6D4', bgColor: '#ECFEFF', emoji: '\uD83C\uDF0A', footerBg: '#06B6D4' },
    autumn: { name: '가을', color: '#D97706', bgColor: '#FFFBEB', emoji: '\uD83C\uDF42', footerBg: '#D97706' },
    winter: { name: '겨울', color: '#3B82F6', bgColor: '#EFF6FF', emoji: '\u2744', footerBg: '#3B82F6' },
    minimal: { name: '미니멀', color: '#374151', bgColor: '#FFFFFF', emoji: '\u2702', footerBg: '#374151' },
    cute: { name: '귀여운', color: '#F472B6', bgColor: '#FFF1F2', emoji: '\uD83D\uDC3E', footerBg: '#F472B6' }
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
    const sw = w / scale, sh = h / scale;
    const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
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
    const tplPreset = this.CARD_TEMPLATES[designSettings.template] || this.CARD_TEMPLATES.default;
    const mainColor = designSettings.mainColor || tplPreset.color;
    const bgColor = tplPreset.bgColor;
    const emoji = tplPreset.emoji;
    const fontFamily = '-apple-system, BlinkMacSystemFont, sans-serif';
    const footerMessage = designSettings.footerMessage || '감사합니다 \u2665';
    const layout = designSettings.layout || 'strip2';
    const s = designSettings; // shorthand

    const infoLines = this._buildInfoLines(record, pet, serviceNames, s);
    const imgBefore = await this._loadImg(record.photoBefore);
    const imgAfter = await this._loadImg(record.photoAfter);

    // Determine if dark background for text color decisions
    const _isDark = (hex) => {
      if (!hex) return false;
      const c = hex.replace('#', '');
      const r = parseInt(c.substr(0, 2), 16);
      const g = parseInt(c.substr(2, 2), 16);
      const b = parseInt(c.substr(4, 2), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 140;
    };
    const darkBg = _isDark(bgColor);
    const textColor = darkBg ? '#FFFFFF' : '#1a1a1a';
    const textSub = darkBg ? 'rgba(255,255,255,0.6)' : '#64748B';
    const borderColor = darkBg ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';

    const petName = pet?.name || '';
    const dateStr = App.formatDate(record.date);

    // Build photo slots based on available images
    const photos2 = [imgBefore || imgAfter, imgAfter || imgBefore];
    const photos3 = [imgBefore || imgAfter, imgAfter || imgBefore, imgAfter || imgBefore];
    const photos4 = [
      imgBefore || imgAfter,
      imgAfter || imgBefore,
      imgBefore || imgAfter,
      imgAfter || imgBefore
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

    // Fallback
    else {
      canvas.width = 400; canvas.height = 900;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 400, 900);
      ctx.fillStyle = textColor; ctx.font = 'bold 20px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText('Photo Card', 200, 450);
    }

    return canvas;
  },

  // ========== Photo Card System (사진 카드) ==========
  _cardPhotos: [],
  _CARD_LAYOUTS: {
    single: { name: '1컷', icon: '📷', photos: 1 },
    polaroid: { name: '폴라로이드', icon: '📸', photos: 1 },
    circle: { name: '원형', icon: '⭕', photos: 1 },
    strip2: { name: '2컷', icon: '🎬', photos: 2 },
    strip3: { name: '3컷', icon: '🖼', photos: 3 },
    strip4: { name: '4컷 가로', icon: '🎞', photos: 4 },
    grid4: { name: '4컷 그리드', icon: '⊞', photos: 4 }
  },
  _CARD_THEMES: {
    default: { name: '기본', color: '#6366F1', emoji: '✂' },
    spring: { name: '봄', color: '#EC4899', emoji: '🌸' },
    summer: { name: '여름', color: '#06B6D4', emoji: '🌊' },
    autumn: { name: '가을', color: '#D97706', emoji: '🍂' },
    winter: { name: '겨울', color: '#3B82F6', emoji: '❄' },
    minimal: { name: '미니멀', color: '#374151', emoji: '✂' },
    cute: { name: '귀여운', color: '#F472B6', emoji: '🐾' }
  },

  _renderPhotoSlots(count) {
    const container = document.getElementById('card-photo-slots');
    if (!container) return;
    this._cardPhotos = new Array(count).fill(null);
    container.innerHTML = Array.from({ length: count }, (_, i) => `
      <div class="flex-1" style="min-width:70px">
        <input type="file" id="card-photo-${i}" accept="image/*" style="display:none">
        <div id="card-preview-${i}" style="width:100%;height:90px;border:2px dashed var(--border);border-radius:var(--radius);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;font-size:1.2rem;color:var(--text-muted)" onclick="document.getElementById('card-photo-${i}').click()">📷</div>
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
            const preview = document.getElementById(`card-preview-${i}`);
            if (preview) preview.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover">`;
          });
        };
        reader.readAsDataURL(file);
      });
    }
  },

  async generatePhotoCard(recordId) {
    const record = await DB.get('records', recordId);
    if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }

    const saved = await DB.getSetting('cardDesignSettings') || {};
    const selectedLayout = saved.layout || 'strip2';
    const selectedTheme = saved.template || 'default';
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
          </div>
        </div>
      `,
      onSave: async () => {
        const layout = document.querySelector('#card-pick-layout .card-pick-btn.active')?.dataset.key || 'strip2';
        const theme = document.querySelector('#card-pick-theme .card-pick-btn.active')?.dataset.key || 'default';
        if (!this._cardPhotos.some(p => p)) { App.showToast('사진을 최소 1장 선택해주세요.', 'error'); return; }

        const settings = await DB.getSetting('cardDesignSettings') || {};
        settings.layout = layout;
        settings.template = theme;
        await DB.setSetting('cardDesignSettings', settings);

        App.closeModal();
        await this._doGenerateCard(recordId, layout, theme, this._cardPhotos[0] || null, this._cardPhotos[1] || null, this._cardPhotos[2] || null, this._cardPhotos[3] || null);
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

      // 테마 토글
      document.querySelectorAll('#card-pick-theme .card-pick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#card-pick-theme .card-pick-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    }, 100);
  },

  async _doGenerateCard(recordId, layout, theme, photo1, photo2, photo3, photo4) {
    try {
      const record = await DB.get('records', recordId);
      if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
      // 즉석 사진 (DB에 저장 안 함)
      record.photoBefore = photo1 || null;
      record.photoAfter = photo2 || null;
      record.photo3 = photo3 || null;
      record.photo4 = photo4 || null;
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
        logo: ds.logo || null
      };

      const canvas = await this._generateCardCanvas(record, customer, pet, shopName, shopPhone, serviceNames, designSettings);

      canvas.toBlob(blob => {
        if (!blob) { App.showToast('카드 생성에 실패했습니다.', 'error'); return; }
        const url = URL.createObjectURL(blob);
        const fileName = (pet?.name || 'pet') + '_미용카드_' + record.date + '.png';
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: (pet?.name || '') + ' 미용 카드' }).catch(() => {
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.click();
            URL.revokeObjectURL(url);
          });
        } else {
          const a = document.createElement('a');
          a.href = url; a.download = fileName; a.click();
          URL.revokeObjectURL(url);
        }
        App.showToast('사진 카드가 생성되었습니다.');
      }, 'image/png');
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

      const records = await DB.getAll('records');
      const filtered = records.filter(r => r.date && r.date >= start && r.date <= end);
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
      const [records, customers, pets, services] = await Promise.all([
        DB.getAll('records'),
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
        .filter(r => r.date && r.date >= start && r.date <= end)
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
