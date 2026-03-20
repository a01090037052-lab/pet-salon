// ========== Grooming Records Page ==========
App.pages.records = {
  async render(container) {
    // 효율적 쿼리: 목록에서는 사진 필드 제외 (큰 base64 데이터)
    const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter']);
    const sorted = records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const [customers, pets, services] = await Promise.all([
      DB.getAllLight('customers', ['memo', 'address']),
      DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle']),
      DB.getAll('services')
    ]);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s.name);

    // 매출 계산
    const today = App.getToday();
    const thisMonth = today.slice(0, 7);
    const monthRecords = records.filter(r => r.date && r.date.startsWith(thisMonth));
    const getRevenue = (r) => Number(r.finalPrice != null ? r.finalPrice : r.totalPrice) || 0;
    const monthRevenue = monthRecords.reduce((sum, r) => sum + getRevenue(r), 0);
    const totalRevenue = records.reduce((sum, r) => sum + getRevenue(r), 0);

    // 오늘 매출
    const todayRecords = records.filter(r => r.date === today);
    const todayRevenue = todayRecords.reduce((sum, r) => sum + getRevenue(r), 0);

    // 이번 주 매출
    const nowDate = new Date();
    const dayOfWeek = nowDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(nowDate);
    monday.setDate(nowDate.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const sundayStr = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
    const weekRecords = records.filter(r => r.date >= mondayStr && r.date <= sundayStr);
    const weekRevenue = weekRecords.reduce((sum, r) => sum + getRevenue(r), 0);

    // 미수금 집계
    const unpaidRecs = records.filter(r => r.paymentMethod === 'unpaid');
    const unpaidTotal = unpaidRecs.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 매출 데이터 캐시
    this._records = records;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">미용 기록</h1>
          <p class="page-subtitle">총 ${records.length}건</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-export-csv">&#x1F4C4; 세무 자료 내보내기</button>
          <button class="btn btn-secondary" id="btn-daily-report">&#x1F4CB; 일일 정산표</button>
          <button class="btn btn-primary" id="btn-add-record">+ 새 기록</button>
        </div>
      </div>

      <!-- 매출 통계는 매출 페이지로 이동 -->
      <div style="margin-bottom:16px">
        <a href="#revenue" class="btn btn-secondary btn-sm" style="display:inline-flex;align-items:center;gap:6px">&#x1F4B0; 매출 현황 보기 &rarr;</a>
      </div>

      ${unpaidRecs.length > 0 ? `
      <div id="unpaid-warning-card" class="card" style="margin-bottom:16px;border:1.5px solid var(--danger);cursor:pointer">
        <div class="card-body" style="padding:16px 20px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,var(--danger-light),#FEE2E2)">
          <span style="font-size:1.5rem">&#x1F4B8;</span>
          <div style="flex:1">
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
          <input type="text" id="record-search" placeholder="고객, 반려견 검색...">
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

      <div class="card">
        <div class="card-body no-padding">
          <div class="table-container">
            <table class="data-table" id="record-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>고객</th>
                  <th>반려견</th>
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
                  <tr><td colspan="9">
                    <div class="empty-state">
                      <div class="empty-state-icon">&#x2702;</div>
                      <div class="empty-state-text">미용 기록이 없습니다</div>
                    </div>
                  </td></tr>
                ` : sorted.map(r => {
                  const customer = customerMap[r.customerId];
                  const pet = petMap[r.petId];
                  const serviceNames = (r.serviceIds || []).map(id => serviceMap[id]).filter(Boolean).join(', ') || '-';
                  return `
                    <tr data-id="${r.id}" data-month="${(r.date || '').slice(0, 7)}"
                        data-search="${(customer?.name || '') + ' ' + (pet?.name || '')}"
                        data-payment="${r.paymentMethod || ''}"
                        style="${r.paymentMethod === 'unpaid' ? 'background:var(--warning-light);border-left:3px solid var(--danger)' : ''}">
                      <td>${App.formatDate(r.date)}${r.status === 'in_progress' ? ' <span class="badge badge-warning" style="font-size:0.65rem">진행중</span>' : ''}</td>
                      <td><a href="#customers/${r.customerId}" style="color:var(--primary)">${App.escapeHtml(customer?.name || '-')}</a></td>
                      <td><a href="#pets/${r.petId}" style="color:var(--primary)"><strong>&#x1F436; ${App.escapeHtml(pet?.name || '-')}</strong></a></td>
                      <td class="hide-mobile"><span style="font-size:0.85rem">${App.escapeHtml(serviceNames)}</span></td>
                      <td><strong>${App.formatCurrency(r.finalPrice != null ? r.finalPrice : r.totalPrice)}</strong>${r.discount || r.extraCharge ? `<div style="font-size:0.7rem;color:var(--text-muted)">${r.discount ? '-' + App.formatCurrency(r.discount) : ''}${r.extraCharge ? '+' + App.formatCurrency(r.extraCharge) : ''}</div>` : ''}</td>
                      <td class="hide-mobile">${App.escapeHtml(r.groomer || '-')}</td>
                      <td class="hide-mobile">${this.getPaymentLabel(r.paymentMethod)}</td>
                      <td class="hide-mobile" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(r.memo || '')}">
                        ${App.escapeHtml(r.memo || '-')}
                      </td>
                      <td class="table-actions">
                        ${r.status === 'in_progress' ? `<button class="btn-icon btn-complete-record" data-id="${r.id}" title="완료 처리" style="color:var(--warning);font-weight:800">&#x2705;</button>` : ''}
                        ${r.satisfaction ? `<span title="만족도" style="font-size:1rem">${r.satisfaction === 'good' ? '&#x1F60A;' : r.satisfaction === 'neutral' ? '&#x1F610;' : '&#x1F61F;'}</span>` : ''}
                        <button class="btn-icon btn-photo-card" data-id="${r.id}" title="사진 카드 생성" style="color:var(--info)">&#x1F4F8;</button>
                        <button class="btn-icon btn-receipt-record" data-id="${r.id}" title="영수증" style="color:var(--success)">&#x1F9FE;</button>
                        <button class="btn-icon btn-edit-record" data-id="${r.id}" title="수정">&#x270F;</button>
                        <button class="btn-icon btn-delete-record" data-id="${r.id}" title="삭제" style="color:var(--danger)">&#x1F5D1;</button>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Mobile Card List -->
          <div class="mobile-card-list" id="record-card-list">
            ${sorted.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">&#x2702;</div>
                <div class="empty-state-text">미용 기록이 없습니다</div>
              </div>
            ` : sorted.map(r => {
              const customer = customerMap[r.customerId];
              const pet = petMap[r.petId];
              const isUnpaid = r.paymentMethod === 'unpaid';
              return `
              <div class="mobile-card${isUnpaid ? ' mobile-card-unpaid' : ''}" data-id="${r.id}" data-month="${(r.date || '').slice(0, 7)}"
                   data-search="${(customer?.name || '') + ' ' + (pet?.name || '')}"
                   data-payment="${r.paymentMethod || ''}">
                <div class="mobile-card-header">
                  <span class="mobile-card-date"><strong>${App.formatDate(r.date)}</strong>${r.status === 'in_progress' ? ' <span class="badge badge-warning" style="font-size:0.65rem">진행중</span>' : ''}</span>
                  <span class="mobile-card-amount"><strong>${App.formatCurrency(r.finalPrice != null ? r.finalPrice : r.totalPrice)}</strong></span>
                </div>
                <div class="mobile-card-body">
                  <span class="mobile-card-info">&#x1F464; ${App.escapeHtml(customer?.name || '-')} &middot; &#x1F436; ${App.escapeHtml(pet?.name || '-')}</span>
                  <div class="mobile-card-meta">
                    <span>&#x2702; ${App.escapeHtml(r.groomer || '-')}</span>
                    <span>${this.getPaymentLabel(r.paymentMethod)}</span>
                    ${isUnpaid ? '<span class="badge badge-danger">미결제</span>' : ''}
                  </div>
                </div>
                <div class="mobile-card-actions">
                  ${r.status === 'in_progress' ? `<button class="btn btn-sm btn-warning btn-complete-record" data-id="${r.id}">&#x2705; 완료 처리</button>` : ''}
                  ${r.satisfaction ? `<span style="font-size:1.1rem">${r.satisfaction === 'good' ? '&#x1F60A;' : r.satisfaction === 'neutral' ? '&#x1F610;' : '&#x1F61F;'}</span>` : ''}
                  <button class="btn btn-sm btn-info btn-photo-card" data-id="${r.id}">&#x1F4F8; 카드</button>
                  <button class="btn btn-sm btn-success btn-receipt-record" data-id="${r.id}">&#x1F9FE; 영수증</button>
                  <button class="btn btn-sm btn-secondary btn-edit-record" data-id="${r.id}">&#x270F; 수정</button>
                  <button class="btn btn-sm btn-danger btn-delete-record" data-id="${r.id}">&#x1F5D1; 삭제</button>
                </div>
              </div>`;
            }).join('')}
          </div>

        </div>
      </div>

      <!-- 전체 기록 - 월별 아카이브 -->
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <span class="card-title">&#x1F4C6; 전체 기록 - 월별 아카이브</span>
        </div>
        <div class="card-body" id="monthly-archive">
          ${this.renderMonthlyArchive(records)}
        </div>
      </div>
    `;
  },

  // 매출 시각화 모달
  showRevenueChart(type) {
    const records = this._records || [];
    const today = App.getToday();
    let title = '';
    let chartHtml = '';

    if (type === 'today') {
      title = '오늘 매출 상세';
      const todayRecs = records.filter(r => r.date === today);
      const total = todayRecs.reduce((sum, r) => sum + App.getRecordAmount(r), 0);
      chartHtml = `
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:2rem;font-weight:800;color:var(--primary)">${App.formatCurrency(total)}</div>
          <div style="color:var(--text-secondary);margin-top:4px">${today} (${todayRecs.length}건)</div>
        </div>
        ${todayRecs.length > 0 ? `<div style="display:flex;flex-direction:column;gap:8px">
          ${todayRecs.map(r => `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg);border-radius:8px">
            <span style="font-weight:600">${App.formatCurrency(App.getRecordAmount(r))}</span>
            <span style="color:var(--text-muted)">${r.groomer || '-'}</span>
          </div>`).join('')}
        </div>` : '<p style="color:var(--text-muted);text-align:center">오늘 기록이 없습니다</p>'}
      `;
    } else if (type === 'week') {
      title = '이번 주 매출 차트';
      const nowDate = new Date();
      const dayOfWeek = nowDate.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(nowDate);
      monday.setDate(nowDate.getDate() + mondayOffset);
      const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
      const weekData = [];
      let weekMax = 1;
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const rev = records.filter(r => r.date === ds).reduce((sum, r) => sum + App.getRecordAmount(r), 0);
        weekData.push({ label: dayLabels[i], date: ds, rev });
        if (rev > weekMax) weekMax = rev;
      }
      const weekTotal = weekData.reduce((s, d) => s + d.rev, 0);
      chartHtml = `
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:1.8rem;font-weight:800;color:var(--primary)">${App.formatCurrency(weekTotal)}</div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:8px;height:150px;padding:0 4px">
          ${weekData.map(d => {
            const pct = Math.round((d.rev / weekMax) * 100);
            const isToday = d.date === today;
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${d.date}: ${App.formatCurrency(d.rev)}">
              <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:600">${d.rev > 0 ? (d.rev >= 10000 ? Math.round(d.rev / 10000) + '만' : App.formatCurrency(d.rev)) : ''}</span>
              <div style="width:100%;background:${isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:6px 6px 0 0;min-height:4px;height:${d.rev > 0 ? pct : 0}%"></div>
              <span style="font-size:0.75rem;font-weight:${isToday ? '800' : '500'};color:${isToday ? 'var(--primary)' : 'var(--text-muted)'}">${d.label}</span>
            </div>`;
          }).join('')}
        </div>
      `;
    } else if (type === 'month') {
      title = '이번 달 매출 차트';
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const monthData = [];
      let monthMax = 1;
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const rev = records.filter(r => r.date === ds).reduce((sum, r) => sum + App.getRecordAmount(r), 0);
        monthData.push({ day: d, date: ds, rev });
        if (rev > monthMax) monthMax = rev;
      }
      const monthTotal = monthData.reduce((s, d) => s + d.rev, 0);
      chartHtml = `
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:1.8rem;font-weight:800;color:var(--primary)">${App.formatCurrency(monthTotal)}</div>
          <div style="color:var(--text-secondary);margin-top:4px">${year}년 ${month + 1}월</div>
        </div>
        <div style="display:flex;align-items:flex-end;gap:2px;height:150px;padding:0;overflow-x:auto">
          ${monthData.map(d => {
            const pct = Math.round((d.rev / monthMax) * 100);
            const isToday = d.date === today;
            return `<div style="flex:1;min-width:14px;display:flex;flex-direction:column;align-items:center;gap:2px" title="${d.date}: ${App.formatCurrency(d.rev)}">
              <div style="width:100%;background:${isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:4px 4px 0 0;min-height:2px;height:${d.rev > 0 ? pct : 0}%"></div>
              <span style="font-size:0.55rem;color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};font-weight:${isToday ? '800' : '400'}">${d.day % 5 === 1 || isToday ? d.day : ''}</span>
            </div>`;
          }).join('')}
        </div>
      `;
    }

    App.showModal({
      title,
      content: chartHtml,
      hideFooter: true
    });
  },

  async init() {
    document.getElementById('btn-add-record')?.addEventListener('click', () => this.showForm());
    document.getElementById('btn-daily-report')?.addEventListener('click', () => this.showDailyReport());
    document.getElementById('btn-export-csv')?.addEventListener('click', () => this.showExportModal());

    // 미수금 경고 카드 클릭 -> 미결제 필터
    document.getElementById('unpaid-warning-card')?.addEventListener('click', () => {
      document.getElementById('filter-month').value = '';
      document.getElementById('filter-payment').value = 'unpaid';
      document.getElementById('record-search').value = '';
      this.applyFilters();
    });

    document.getElementById('record-search')?.addEventListener('input', () => this.applyFilters());
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

    // 완료 처리 버튼
    document.querySelectorAll('.btn-complete-record').forEach(btn => {
      btn.addEventListener('click', () => this.completeRecord(Number(btn.dataset.id)));
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

    document.querySelectorAll('#record-tbody tr').forEach(row => {
      if (!row.dataset.id) return;
      const matchSearch = !search || (row.dataset.search || '').toLowerCase().includes(search);
      const matchMonth = !month || (row.dataset.month || '') === month;
      const matchPayment = !payment || (row.dataset.payment || '') === payment;
      row.style.display = (matchSearch && matchMonth && matchPayment) ? '' : 'none';
    });

    // Also filter mobile cards
    document.querySelectorAll('#record-card-list .mobile-card').forEach(card => {
      if (!card.dataset.id) return;
      const matchSearch = !search || (card.dataset.search || '').toLowerCase().includes(search);
      const matchMonth = !month || (card.dataset.month || '') === month;
      const matchPayment = !payment || (card.dataset.payment || '') === payment;
      card.style.display = (matchSearch && matchMonth && matchPayment) ? '' : 'none';
    });
  },

  async showForm(id, fromAppointment) {
    let record = id ? await DB.get('records', id) : {};

    // Pre-fill from appointment if provided
    if (fromAppointment && !id) {
      record = {
        customerId: fromAppointment.customerId,
        petId: fromAppointment.petId,
        date: fromAppointment.date,
        groomer: fromAppointment.groomer,
        serviceIds: fromAppointment.serviceIds || [],
        appointmentId: fromAppointment.id
      };
    }

    const petOptions = await App.getPetOptions(record.customerId, record.petId);
    const serviceCheckboxes = await App.getServiceCheckboxes(record.serviceIds || []);

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
        <div class="form-group">
          <div id="f-services">
            ${serviceCheckboxes}
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">총 금액 <span class="required">*</span></label>
            <input type="number" id="f-totalPrice" value="${record.totalPrice || ''}" placeholder="금액 입력" min="0" step="1000">
            <div class="form-hint" id="price-hint">서비스를 선택하면 자동 계산됩니다</div>
          </div>
          <div class="form-group">
            <label class="form-label">반려견 사이즈</label>
            <select id="f-sizeType">
              <option value="small">소형</option>
              <option value="medium">중형</option>
              <option value="large">대형</option>
            </select>
            <div class="form-hint">가격 자동 계산에 사용됩니다</div>
          </div>
        </div>
        <div class="form-group" id="final-price-display" style="background:var(--bg);border-radius:var(--radius);padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">최종 금액</span>
          <span id="final-price-value" style="font-size:1.2rem;font-weight:800;color:var(--primary)">${App.formatCurrency((record.totalPrice || 0) - (record.discount || 0) + (record.extraCharge || 0))}</span>
        </div>
        <div class="form-group">
          <label class="form-label">결제 수단</label>
          <select id="f-paymentMethod">
            <option value="" ${record.paymentMethod === '' ? 'selected' : ''}>선택 안 함</option>
            <option value="cash" ${record.paymentMethod === 'cash' ? 'selected' : ''}>현금</option>
            <option value="card" ${(!record.paymentMethod && !id) || record.paymentMethod === 'card' ? 'selected' : ''}>카드</option>
            <option value="transfer" ${record.paymentMethod === 'transfer' ? 'selected' : ''}>계좌이체</option>
            <option value="unpaid" ${record.paymentMethod === 'unpaid' ? 'selected' : ''}>미결제(외상)</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">&#x1F4F7; 미용 전 사진</label>
            <div style="display:flex;align-items:center;gap:12px">
              <div id="f-photoBefore-preview" style="width:80px;height:80px;border-radius:var(--radius);background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px dashed var(--border)">
                ${record.photoBefore ? `<img src="${record.photoBefore}" style="width:100%;height:100%;object-fit:cover">` : '<span style="color:var(--text-muted);font-size:0.8rem">사진 없음</span>'}
              </div>
              <div>
                <input type="file" id="f-photoBefore" accept="image/*" style="display:none">
                <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('f-photoBefore').click()">선택</button>
                ${record.photoBefore ? '<button type="button" class="btn btn-sm btn-danger" id="f-photoBefore-remove" style="margin-left:4px">삭제</button>' : ''}
              </div>
            </div>
            <input type="hidden" id="f-photoBefore-data" value="">
          </div>
          <div class="form-group">
            <label class="form-label">&#x1F4F7; 미용 후 사진</label>
            <div style="display:flex;align-items:center;gap:12px">
              <div id="f-photoAfter-preview" style="width:80px;height:80px;border-radius:var(--radius);background:var(--bg);display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px dashed var(--border)">
                ${record.photoAfter ? `<img src="${record.photoAfter}" style="width:100%;height:100%;object-fit:cover">` : '<span style="color:var(--text-muted);font-size:0.8rem">사진 없음</span>'}
              </div>
              <div>
                <input type="file" id="f-photoAfter" accept="image/*" style="display:none">
                <button type="button" class="btn btn-sm btn-secondary" onclick="document.getElementById('f-photoAfter').click()">선택</button>
                ${record.photoAfter ? '<button type="button" class="btn btn-sm btn-danger" id="f-photoAfter-remove" style="margin-left:4px">삭제</button>' : ''}
              </div>
            </div>
            <input type="hidden" id="f-photoAfter-data" value="">
          </div>
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
              <label class="form-label">담당 미용사</label>
              <select id="f-groomer">${await App.getGroomerOptions(record.groomer)}</select>
            </div>
            <div class="form-group">
              <label class="form-label">다음 방문 권장일</label>
              <input type="date" id="f-nextVisitDate" value="${record.nextVisitDate || ''}">
            </div>
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
          <div class="form-group">
            <label class="form-label">진행 상태</label>
            <select id="f-status">
              <option value="completed" ${(record.status || 'completed') === 'completed' ? 'selected' : ''}>완료</option>
              <option value="in_progress" ${record.status === 'in_progress' ? 'selected' : ''}>진행중 (빠른 등록)</option>
            </select>
            <div class="form-hint">"진행중"으로 저장하면 나중에 금액/사진 등을 추가할 수 있습니다</div>
          </div>
          <div id="reward-section-area"></div>
          <div class="form-group">
            <label class="form-label">고객 만족도</label>
            <div style="display:flex;gap:12px" id="satisfaction-group">
              <label class="satisfaction-option" style="flex:1;text-align:center;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.15s${record.satisfaction === 'good' ? ';border-color:var(--success);background:var(--success-light)' : ''}">
                <input type="radio" name="satisfaction" value="good" style="display:none" ${record.satisfaction === 'good' ? 'checked' : ''}> &#x1F60A; 만족
              </label>
              <label class="satisfaction-option" style="flex:1;text-align:center;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.15s${record.satisfaction === 'neutral' ? ';border-color:var(--warning);background:var(--warning-light)' : ''}">
                <input type="radio" name="satisfaction" value="neutral" style="display:none" ${record.satisfaction === 'neutral' ? 'checked' : ''}> &#x1F610; 보통
              </label>
              <label class="satisfaction-option" style="flex:1;text-align:center;padding:10px;border:2px solid var(--border);border-radius:10px;cursor:pointer;transition:all 0.15s${record.satisfaction === 'bad' ? ';border-color:var(--danger);background:var(--danger-light)' : ''}">
                <input type="radio" name="satisfaction" value="bad" style="display:none" ${record.satisfaction === 'bad' ? 'checked' : ''}> &#x1F61F; 불만
              </label>
            </div>
          </div>
          <div class="form-group" id="dissatisfaction-reason-group" style="display:${record.satisfaction === 'bad' ? 'block' : 'none'}">
            <label class="form-label">불만 사유</label>
            <textarea id="f-dissatisfactionReason" placeholder="불만족 사유를 입력해주세요">${App.escapeHtml(record.dissatisfactionReason || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">컨디션 메모</label>
            <textarea id="f-conditionMemo" placeholder="반려견 상태 기록 (예: 피부 양호, 왼쪽 귀 빨간점 발견, 털 엉킴 약간)">${App.escapeHtml(record.conditionMemo || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">메모</label>
            <textarea id="f-memo" placeholder="미용 중 특이사항, 다음 방문 시 참고할 내용 등">${App.escapeHtml(record.memo || '')}</textarea>
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
        // Auto-calculate next visit date from grooming cycle
        if (pet.groomingCycle) {
          const nextVisitInput = document.getElementById('f-nextVisitDate');
          if (nextVisitInput && !nextVisitInput.value) {
            const today = new Date();
            today.setDate(today.getDate() + pet.groomingCycle);
            nextVisitInput.value = App.formatLocalDate(today);
          }
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

    // Auto-calculate price when services checked
    const calcPrice = () => {
      const sizeType = document.getElementById('f-sizeType').value;
      let total = 0;
      document.querySelectorAll('input[name="serviceIds"]:checked').forEach(cb => {
        const key = 'data-price-' + sizeType;
        total += Number(cb.getAttribute(key)) || 0;
      });
      if (total > 0) {
        document.getElementById('f-totalPrice').value = total;
        // 최종 금액 재계산 트리거
        const event = new Event('input', { bubbles: true });
        document.getElementById('f-totalPrice').dispatchEvent(event);
      }
    };

    // 서비스 칩 토글 (checked 클래스 + calcPrice)
    document.querySelectorAll('.service-chip input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const chip = cb.closest('.service-chip');
        if (chip) chip.classList.toggle('checked', cb.checked);
        calcPrice();
      });
    });

    // sizeType 변경 시 칩 가격 업데이트
    document.getElementById('f-sizeType')?.addEventListener('change', () => {
      const size = document.getElementById('f-sizeType').value;
      document.querySelectorAll('.service-chip').forEach(chip => {
        const input = chip.querySelector('input');
        const priceSpan = chip.querySelector('.service-chip-price');
        if (input && priceSpan) {
          const price = Number(input.getAttribute('data-price-' + size)) || 0;
          priceSpan.textContent = App.formatPriceShort(price);
        }
      });
      calcPrice();
    });

    // 전체 선택/해제 토글
    document.getElementById('btn-toggle-services')?.addEventListener('click', (e) => {
      e.preventDefault();
      const checkboxes = document.querySelectorAll('input[name="serviceIds"]');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => {
        cb.checked = !allChecked;
        const chip = cb.closest('.service-chip');
        if (chip) chip.classList.toggle('checked', cb.checked);
      });
      const btn = document.getElementById('btn-toggle-services');
      if (btn) btn.textContent = allChecked ? '전체 선택' : '전체 해제';
      calcPrice();
    });

    // 최종 금액 자동 계산
    const calcFinalPrice = () => {
      const total = Number(document.getElementById('f-totalPrice').value) || 0;
      const discount = Number(document.getElementById('f-discount').value) || 0;
      const extra = Number(document.getElementById('f-extraCharge').value) || 0;
      const finalPrice = total - discount + extra;
      const el = document.getElementById('final-price-value');
      if (el) el.textContent = App.formatCurrency(finalPrice);
    };
    document.getElementById('f-totalPrice')?.addEventListener('input', calcFinalPrice);
    document.getElementById('f-discount')?.addEventListener('input', calcFinalPrice);
    document.getElementById('f-extraCharge')?.addEventListener('input', calcFinalPrice);

    // 미용 전후 사진 업로드 이벤트
    if (record.photoBefore) {
      document.getElementById('f-photoBefore-data').value = record.photoBefore;
    }
    if (record.photoAfter) {
      document.getElementById('f-photoAfter-data').value = record.photoAfter;
    }

    this._setupPhotoUpload('photoBefore');
    this._setupPhotoUpload('photoAfter');

    // Satisfaction toggle
    document.querySelectorAll('#satisfaction-group label').forEach(label => {
      label.addEventListener('click', () => {
        document.querySelectorAll('#satisfaction-group label').forEach(l => {
          l.style.borderColor = 'var(--border)';
          l.style.background = 'transparent';
        });
        const radio = label.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          const colors = { good: { border: 'var(--success)', bg: 'var(--success-light)' }, neutral: { border: 'var(--warning)', bg: 'var(--warning-light)' }, bad: { border: 'var(--danger)', bg: 'var(--danger-light)' } };
          const c = colors[radio.value] || {};
          label.style.borderColor = c.border || 'var(--border)';
          label.style.background = c.bg || 'transparent';
        }
        // Show/hide dissatisfaction reason
        const val = document.querySelector('input[name="satisfaction"]:checked')?.value;
        const reasonGroup = document.getElementById('dissatisfaction-reason-group');
        if (reasonGroup) reasonGroup.style.display = val === 'bad' ? 'block' : 'none';
      });
    });

    // Load reward section when customer is selected
    const loadRewardSection = async (customerId) => {
      const area = document.getElementById('reward-section-area');
      if (!area || !customerId) { if (area) area.innerHTML = ''; return; }
      const rewardSettings = await DB.getSetting('rewardSettings') || { type: 'none' };
      if (rewardSettings.type === 'none') { area.innerHTML = ''; return; }
      const customer = await DB.get('customers', Number(customerId));
      if (!customer) { area.innerHTML = ''; return; }

      if (rewardSettings.type === 'stamp') {
        const stamps = customer.stamps || 0;
        const goal = rewardSettings.stampGoal || 10;
        const canRedeem = stamps >= goal;
        area.innerHTML = `
          <div style="background:var(--primary-light);border:1.5px solid var(--primary-lighter);border-radius:var(--radius);padding:12px 16px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-weight:700">&#x2B50; 스탬프 적립</span>
              <span style="font-weight:800;color:var(--primary)">${stamps} / ${goal}</span>
            </div>
            <div style="background:var(--border);border-radius:6px;height:8px;overflow:hidden">
              <div style="background:var(--primary);height:100%;width:${Math.min(100, (stamps/goal)*100)}%;border-radius:6px;transition:width 0.3s"></div>
            </div>
            ${canRedeem ? `
              <div style="margin-top:8px">
                <label class="checkbox-label" style="background:var(--success-light);border:1.5px solid var(--success);border-radius:var(--radius);padding:8px 12px">
                  <input type="checkbox" id="f-useStampReward"> &#x1F389; 무료 서비스 적용 (스탬프 ${goal}개 사용)
                </label>
              </div>
            ` : ''}
          </div>`;
        // Stamp reward: zero price
        document.getElementById('f-useStampReward')?.addEventListener('change', (e) => {
          if (e.target.checked) {
            document.getElementById('f-discount').value = Number(document.getElementById('f-totalPrice').value) || 0;
            const evt = new Event('input', { bubbles: true });
            document.getElementById('f-discount').dispatchEvent(evt);
          } else {
            document.getElementById('f-discount').value = 0;
            const evt = new Event('input', { bubbles: true });
            document.getElementById('f-discount').dispatchEvent(evt);
          }
        });
      }
    };

    // Trigger reward load on customer change
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
      await loadRewardSection(cid);
    };

    // Re-render customer select with enhanced onChange
    await App.renderCustomerSelect('record-customer-select', record.customerId, origCustomerOnChange);

    // Load reward for pre-selected customer
    if (record.customerId) await loadRewardSection(record.customerId);

    // Fix 5: Pre-check services when coming from appointment
    if (record.serviceIds && record.serviceIds.length > 0) {
      setTimeout(() => {
        record.serviceIds.forEach(sid => {
          const checkbox = document.querySelector(`input[name="serviceIds"][value="${sid}"]`);
          if (checkbox) {
            checkbox.checked = true;
            const chip = checkbox.closest('.service-chip');
            if (chip) chip.classList.add('checked');
          }
        });
        // Trigger price calculation
        calcPrice();
      }, 200);
    }

  },

  _setupPhotoUpload(field) {
    const fileInput = document.getElementById('f-' + field);
    const dataInput = document.getElementById('f-' + field + '-data');
    const preview = document.getElementById('f-' + field + '-preview');
    const removeBtn = document.getElementById('f-' + field + '-remove');

    if (!fileInput || !dataInput || !preview) return;

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        App.showToast('파일이 너무 큽니다 (10MB 이하)', 'error');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        this._resizeImage(ev.target.result, (compressed) => {
          dataInput.value = compressed;
          preview.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:cover">`;
          // 삭제 버튼 추가
          if (!document.getElementById('f-' + field + '-remove')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'f-' + field + '-remove';
            btn.className = 'btn btn-sm btn-danger';
            btn.style.marginLeft = '4px';
            btn.textContent = '삭제';
            btn.addEventListener('click', () => {
              dataInput.value = '';
              preview.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">사진 없음</span>';
              btn.remove();
            });
            fileInput.parentElement.querySelector('.btn-secondary')?.after(btn);
          }
        });
      };
      reader.readAsDataURL(file);
    });

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        dataInput.value = '';
        preview.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">사진 없음</span>';
        removeBtn.remove();
      });
    }
  },

  // 이미지 리사이즈 (Canvas API, max 800px, JPEG 0.7)
  _resizeImage(dataUrl, callback) {
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  },

  async saveRecord(id) {
    try {
      const customerId = Number(document.getElementById('record-customer-select-value')?.value || document.getElementById('f-customerId')?.value);
      const petId = Number(document.getElementById('f-petId').value);
      const date = document.getElementById('f-date').value;
      const groomer = document.getElementById('f-groomer').value.trim();
      const nextVisitDate = document.getElementById('f-nextVisitDate').value;
      const totalPrice = Number(document.getElementById('f-totalPrice').value) || 0;
      const memo = document.getElementById('f-memo').value.trim();
      const paymentMethod = document.getElementById('f-paymentMethod').value;

      const serviceIds = [];
      document.querySelectorAll('input[name="serviceIds"]:checked').forEach(cb => {
        serviceIds.push(Number(cb.value));
      });

      if (!customerId) { App.showToast('고객을 선택해주세요.', 'error'); App.highlightField('record-customer-select-input'); return; }
      if (!petId) { App.showToast('반려견을 선택해주세요.', 'error'); App.highlightField('f-petId'); return; }
      if (!date) { App.showToast('날짜를 입력해주세요.', 'error'); App.highlightField('f-date'); return; }

      const discount = Number(document.getElementById('f-discount').value) || 0;
      const extraCharge = Number(document.getElementById('f-extraCharge').value) || 0;
      const finalPrice = totalPrice - discount + extraCharge;
      const photoBefore = document.getElementById('f-photoBefore-data')?.value || '';
      const photoAfter = document.getElementById('f-photoAfter-data')?.value || '';
      const appointmentId = document.getElementById('f-appointmentId')?.value || null;
      const satisfaction = document.querySelector('input[name="satisfaction"]:checked')?.value || '';
      const dissatisfactionReason = satisfaction === 'bad' ? (document.getElementById('f-dissatisfactionReason')?.value.trim() || '') : '';
      const useStampReward = document.getElementById('f-useStampReward')?.checked || false;
      const status = document.getElementById('f-status')?.value || 'completed';

      const conditionMemo = document.getElementById('f-conditionMemo')?.value.trim() || '';

      const data = { customerId, petId, date, groomer, nextVisitDate, serviceIds, totalPrice, discount, extraCharge, finalPrice, memo, paymentMethod, photoBefore, photoAfter, appointmentId, satisfaction, dissatisfactionReason, status, conditionMemo };

      if (id) {
        const existing = await DB.get('records', id);
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

        // 스탬프 적립 처리
        try {
          const rewardSettings = await DB.getSetting('rewardSettings') || { type: 'none' };
          if (rewardSettings.type === 'stamp') {
            const customer = await DB.get('customers', customerId);
            if (customer) {
              customer.stamps = (customer.stamps || 0) + 1;
              if (useStampReward) {
                customer.stamps = customer.stamps - (rewardSettings.stampGoal || 10);
                if (customer.stamps < 0) customer.stamps = 0;
                App.showToast('&#x1F389; 스탬프 적립 완료! 무료 서비스가 제공되었습니다.', 'success');
              } else if (customer.stamps >= (rewardSettings.stampGoal || 10)) {
                App.showToast('&#x1F389; 스탬프 적립 완료! 다음 방문 시 무료 서비스를 받을 수 있습니다.', 'success');
              } else {
                App.showToast('스탬프 1개 적립! (현재 ' + customer.stamps + '/' + (rewardSettings.stampGoal || 10) + ')', 'success');
              }
              await DB.update('customers', customer);
            }
          }
        } catch (e) {
          console.warn('Reward processing error:', e);
        }

        // 고객 자동 분류 (방문 횟수 기반)
        try {
          const autoTagEnabled = await DB.getSetting('autoTagEnabled');
          if (autoTagEnabled) {
            const custRecords = await DB.getByIndex('records', 'customerId', customerId);
            const visitCount = custRecords.length + 1; // 현재 저장 포함
            const autoTagNewMax = (await DB.getSetting('autoTagNewMax')) || 2;
            const autoTagNormalMax = (await DB.getSetting('autoTagNormalMax')) || 9;
            const autoTagRegularMin = (await DB.getSetting('autoTagRegularMin')) || 10;

            const cust = await DB.get('customers', customerId);
            if (cust) {
              const tags = (cust.tags || []).filter(t => t === 'vip' || t === 'caution');
              if (visitCount <= autoTagNewMax) {
                tags.push('new');
              } else if (visitCount <= autoTagNormalMax) {
                tags.push('normal');
              } else if (visitCount >= autoTagRegularMin) {
                tags.push('regular');
              }
              cust.tags = tags;
              await DB.update('customers', cust);
            }
          }
        } catch (e) {
          console.warn('Auto-tag error:', e);
        }

      }

      App.closeModal();

      // 신규 기록: 완료 모달 (다음 예약 + 문자 발송 버튼 통합)
      if (!id) {
        const customer = await DB.get('customers', customerId);
        const pet = await DB.get('pets', petId);
        const customerPhone = (customer?.phone || '').replace(/\D/g, '');

        App.handleRoute();

        App.showModal({
          title: '미용 기록 저장 완료',
          hideFooter: true,
          content: `
            <div style="text-align:center;padding:20px 0">
              <div style="font-size:2.5rem;margin-bottom:12px">&#x2705;</div>
              <div style="font-size:1.1rem;font-weight:700;margin-bottom:20px">미용 기록이 저장되었습니다</div>
              <div style="display:flex;flex-direction:column;gap:10px;max-width:280px;margin:0 auto">
                ${nextVisitDate ? `<button class="btn btn-primary" id="post-save-appt">&#x1F4C5; 다음 예약 등록 (${App.formatDate(nextVisitDate)})</button>` : ''}
                ${customerPhone ? `<button class="btn btn-success" id="post-save-sms">&#x1F4AC; 미용 완료 문자 보내기</button>` : ''}
                <button class="btn btn-secondary" id="post-save-close">완료</button>
              </div>
            </div>
          `
        });

        document.getElementById('post-save-appt')?.addEventListener('click', () => {
          App.closeModal();
          App.pages.appointments.showForm(null, customerId, { petId, date: nextVisitDate, groomer, serviceIds });
        });
        document.getElementById('post-save-sms')?.addEventListener('click', async () => {
          const serviceNames = await App.getServiceNames(serviceIds);
          const msg = await App.buildSms('complete', {
            '고객명': customer?.name || '',
            '반려견명': pet?.name || '',
            '서비스': serviceNames !== '-' ? serviceNames : '',
            '금액': String(finalPrice)
          });
          window.open(`sms:${customerPhone}?body=${encodeURIComponent(msg)}`);
          App.closeModal();
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

  async completeRecord(id) {
    try {
      const doComplete = await App.confirm('이 미용 기록을 완료 처리하시겠습니까?');
      if (!doComplete) return;
      // 수정 폼을 열어서 나머지 정보를 채울 수 있도록 함
      const record = await DB.get('records', id);
      if (record) {
        record.status = 'completed';
        await DB.update('records', record);
        App.showToast('미용 기록이 완료 처리되었습니다.');
        // 바로 수정 폼 열기 (추가 정보 입력 기회 제공)
        const editMore = await App.confirm('추가 정보를 입력하시겠습니까?\n(금액, 사진, 만족도 등)');
        if (editMore) {
          this.showForm(id);
          return;
        }
        App.handleRoute();
      }
    } catch (err) {
      console.error('completeRecord error:', err);
      App.showToast('완료 처리 중 오류가 발생했습니다.', 'error');
    }
  },

  async deleteRecord(id) {
    try {
      const confirmed = await App.confirm('이 미용 기록을 삭제하시겠습니까?');
      if (!confirmed) return;
      await DB.delete('records', id);
      App.showToast('미용 기록이 삭제되었습니다.');
      App.handleRoute();
    } catch (err) {
      console.error('deleteRecord error:', err);
      App.showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  },

  renderMonthlyArchive(records) {
    // 월별 그룹화
    const monthlyMap = {};
    records.forEach(r => {
      if (!r.date) return;
      const month = r.date.slice(0, 7);
      if (!monthlyMap[month]) monthlyMap[month] = { records: [], revenue: 0, count: 0 };
      monthlyMap[month].records.push(r);
      monthlyMap[month].revenue += App.getRecordAmount(r);
      monthlyMap[month].count++;
    });

    const months = Object.keys(monthlyMap).sort((a, b) => b.localeCompare(a));
    if (months.length === 0) return '<p style="color:var(--text-muted)">기록이 없습니다.</p>';

    return months.map(month => {
      const data = monthlyMap[month];
      const [y, m] = month.split('-');
      const label = `${y}년 ${parseInt(m)}월`;
      return `
        <div class="archive-month">
          <div class="archive-month-header" onclick="this.parentElement.classList.toggle('open')">
            <div style="display:flex;align-items:center;gap:12px;flex:1">
              <span class="archive-toggle">&#x25B6;</span>
              <span style="font-weight:700">${label}</span>
              <span class="badge badge-info">${data.count}건</span>
            </div>
            <span style="font-weight:800;color:var(--primary)">${App.formatCurrency(data.revenue)}</span>
          </div>
          <div class="archive-month-body">
            <div style="display:flex;flex-direction:column;gap:6px;padding:12px 0">
              ${data.records.sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(r => `
                <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--bg);border-radius:8px;font-size:0.88rem">
                  <span style="color:var(--text-muted);min-width:80px">${App.formatDate(r.date)}</span>
                  <span style="flex:1;font-weight:600">${App.formatCurrency(App.getRecordAmount(r))}</span>
                  <span style="color:var(--text-secondary)">${App.escapeHtml(r.groomer || '-')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  async showPetInfoBox(pet) {
    const existing = document.getElementById('pet-info-display');
    if (existing) existing.remove();

    let warningHtml = '';
    let conditionHtml = '';
    // Check last record satisfaction and conditions
    try {
      const petRecords = await DB.getByIndex('records', 'petId', pet.id);
      if (petRecords.length > 0) {
        const sorted = petRecords.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const lastRecord = sorted[0];
        if (lastRecord.satisfaction === 'bad') {
          warningHtml = `
            <div style="background:var(--danger-light);border:1.5px solid var(--danger);border-radius:var(--radius);padding:10px 14px;margin-bottom:8px">
              <div style="font-weight:700;color:var(--danger)">&#x26A0; 지난 방문 시 불만족</div>
              ${lastRecord.dissatisfactionReason ? `<div style="font-size:0.88rem;color:#991B1B;margin-top:4px">사유: ${App.escapeHtml(lastRecord.dissatisfactionReason)}</div>` : ''}
            </div>`;
        }
        // Show conditionMemo from last visit
        if (lastRecord.conditionMemo) {
          conditionHtml = `
            <div style="background:#FEF9C3;border:1.5px solid #EAB308;border-radius:var(--radius);padding:10px 14px;margin-bottom:8px">
              <div style="font-weight:700;color:#854D0E">&#x1F4CB; 지난 컨디션 메모</div>
              <div style="font-size:0.88rem;color:#854D0E;margin-top:4px">${App.escapeHtml(lastRecord.conditionMemo)}</div>
            </div>`;
        }
      }
    } catch (e) { /* ignore */ }

    // Handover note (인수인계 메모)
    let handoverHtml = '';
    if (pet.handoverNote) {
      handoverHtml = `
        <div style="background:#DBEAFE;border:1.5px solid #3B82F6;border-radius:var(--radius);padding:10px 14px;margin-bottom:8px">
          <div style="font-weight:700;color:#1D4ED8">&#x1F4CB; 인수인계 메모</div>
          <div style="font-size:0.88rem;color:#1E40AF;margin-top:4px">${App.escapeHtml(pet.handoverNote)}</div>
        </div>`;
    }

    const hasNotes = pet.temperament || pet.healthNotes || pet.allergies || pet.preferredStyle || warningHtml || conditionHtml || handoverHtml;
    if (!hasNotes) return;

    const box = document.createElement('div');
    box.id = 'pet-info-display';
    box.className = 'pet-info-box';
    box.innerHTML = `
      ${handoverHtml}
      ${warningHtml}
      ${conditionHtml}
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
    const records = this._records || await DB.getAll('records');
    const reportDate = targetDate || App.getToday();
    const todayRecs = records.filter(r => r.date === reportDate);
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
                <strong${m === 'unpaid' ? ' style="color:var(--danger)"' : ''}>${App.formatCurrency(data.amount)}</strong>
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
                  <span style="flex:1"><strong>${App.escapeHtml(customer?.name || '-')}</strong> / ${App.escapeHtml(pet?.name || '-')}</span>
                  <span style="font-weight:600">${App.escapeHtml(r.groomer || '-')}</span>
                  <strong${r.paymentMethod === 'unpaid' ? ' style="color:var(--danger)"' : ''}>${App.formatCurrency(App.getRecordAmount(r))}</strong>
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

  // 미용 전후 사진 보기 (recordId 기반으로 DB에서 조회)
  async showPhotosById(recordId) {
    const record = await DB.get('records', recordId);
    if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
    const before = record.photoBefore || '';
    const after = record.photoAfter || '';
    const dateLabel = App.formatDate(record.date);
    const content = `
      <div style="text-align:center;margin-bottom:12px;color:var(--text-secondary)">${dateLabel}</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center">
        ${before ? `
          <div style="flex:1;min-width:200px;text-align:center">
            <div style="font-weight:700;margin-bottom:8px;color:var(--text-secondary)">미용 전</div>
            <img src="${before}" class="photo-viewable" data-group="record-${record.id}" data-caption="미용 전" alt="미용 전" style="max-width:100%;max-height:400px;border-radius:var(--radius);object-fit:contain">
          </div>
        ` : ''}
        ${after ? `
          <div style="flex:1;min-width:200px;text-align:center">
            <div style="font-weight:700;margin-bottom:8px;color:var(--text-secondary)">미용 후</div>
            <img src="${after}" class="photo-viewable" data-group="record-${record.id}" data-caption="미용 후" alt="미용 후" style="max-width:100%;max-height:400px;border-radius:var(--radius);object-fit:contain">
          </div>
        ` : ''}
      </div>
    `;
    App.showModal({ title: '미용 전후 사진', content, hideFooter: true });
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
          <div class="receipt-row"><span>고객</span><span>${App.escapeHtml(customer?.name || '-')}</span></div>
          <div class="receipt-row"><span>반려견</span><span>${App.escapeHtml(pet?.name || '-')}${pet?.breed ? ' (' + App.escapeHtml(pet.breed) + ')' : ''}</span></div>
          ${record.groomer ? `<div class="receipt-row"><span>담당</span><span>${App.escapeHtml(record.groomer)}</span></div>` : ''}
          <hr class="receipt-divider">
          <div style="font-weight:700;margin-bottom:4px">서비스 내역</div>
          ${serviceItems.length > 0 ? serviceItems.map(s => {
            const sizeType = pet?.size || (pet?.weight ? (pet.weight < 7 ? 'small' : pet.weight < 15 ? 'medium' : 'large') : 'small');
            const priceKey = 'price' + sizeType.charAt(0).toUpperCase() + sizeType.slice(1);
            const price = Number(s[priceKey]) || 0;
            return `<div class="receipt-row"><span>${App.escapeHtml(s.name)}</span><span>${App.formatCurrency(price)}</span></div>`;
          }).join('') : '<div style="color:var(--text-muted)">서비스 미지정</div>'}
          <hr class="receipt-divider">
          <div class="receipt-row"><span>소계</span><span>${App.formatCurrency(totalPrice)}</span></div>
          ${discount > 0 ? `<div class="receipt-row" style="color:var(--danger)"><span>할인</span><span>-${App.formatCurrency(discount)}</span></div>` : ''}
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
    const footerMessage = designSettings.footerMessage || '\uAC10\uC0AC\uD569\uB2C8\uB2E4 \u2665';
    const layout = designSettings.layout || 'vertical';
    const s = designSettings; // shorthand

    const footerParts = [shopName];
    if (s.showShopPhone && shopPhone) footerParts.push(shopPhone);
    footerParts.push(footerMessage);

    const infoLines = this._buildInfoLines(record, pet, serviceNames, s);
    const imgBefore = await this._loadImg(record.photoBefore);
    const imgAfter = await this._loadImg(record.photoAfter);

    const canvas = document.createElement('canvas');
    let ctx;

    // ===== Layout: vertical =====
    if (layout === 'vertical') {
      canvas.width = 600; canvas.height = 900;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 600, 900);

      await this._drawHeader(ctx, 0, 0, 600, 70, shopName, emoji, mainColor, s.logo, fontFamily);

      // Pet name & date
      ctx.fillStyle = '#0F172A'; ctx.font = 'bold 22px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText((pet?.name || '') + '\uC758 \uBBF8\uC6A9 \uAE30\uB85D', 300, 108);
      if (s.showDate) {
        ctx.fillStyle = '#64748B'; ctx.font = '15px ' + fontFamily;
        ctx.fillText(App.formatDate(record.date), 300, 132);
      }

      // Before photo
      const photoY = 155;
      ctx.save();
      this._roundRect(ctx, 100, photoY, 400, 250, 12); ctx.clip();
      this._drawImageCover(ctx, imgBefore, 100, photoY, 400, 250);
      ctx.restore();
      ctx.fillStyle = mainColor; ctx.font = 'bold 13px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText('BEFORE', 300, photoY + 268);

      // Arrow
      ctx.fillStyle = mainColor; ctx.font = 'bold 28px ' + fontFamily;
      ctx.fillText('\u25BC', 300, photoY + 295);

      // After photo
      const afterY = photoY + 310;
      ctx.save();
      this._roundRect(ctx, 100, afterY, 400, 250, 12); ctx.clip();
      this._drawImageCover(ctx, imgAfter, 100, afterY, 400, 250);
      ctx.restore();
      ctx.fillStyle = mainColor; ctx.font = 'bold 13px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText('AFTER', 300, afterY + 268);

      // Info
      let iy = afterY + 290;
      ctx.fillStyle = '#0F172A'; ctx.font = '15px ' + fontFamily; ctx.textAlign = 'center';
      infoLines.forEach(line => {
        if (iy < 860) { ctx.fillText(this._truncText(ctx, line, 520), 300, iy); iy += 22; }
      });

      this._drawFooter(ctx, 0, 850, 600, 50, footerParts, mainColor, fontFamily);
    }

    // ===== Layout: photobooth4 (인생네컷 4컷) =====
    else if (layout === 'photobooth4') {
      canvas.width = 600; canvas.height = 1000;
      ctx = canvas.getContext('2d');
      // White base
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 600, 1000);

      // Film strip borders
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 30, 1000);
      ctx.fillRect(570, 0, 30, 1000);
      // Film holes
      for (let fy = 30; fy < 1000; fy += 60) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(15, fy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(585, fy, 6, 0, Math.PI * 2); ctx.fill();
      }

      // Header
      ctx.fillStyle = mainColor; ctx.font = 'bold 22px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText(emoji + ' ' + shopName, 300, 40);

      // 4 photo grid (2x2)
      const gx = 50, gy = 60, gw = 240, gh = 240, gap = 20;
      // Top-left: before
      ctx.save(); this._roundRect(ctx, gx, gy, gw, gh, 8); ctx.clip();
      this._drawImageCover(ctx, imgBefore, gx, gy, gw, gh); ctx.restore();
      // Top-right: before (or after if only 1 before)
      ctx.save(); this._roundRect(ctx, gx + gw + gap, gy, gw, gh, 8); ctx.clip();
      this._drawImageCover(ctx, imgBefore || imgAfter, gx + gw + gap, gy, gw, gh); ctx.restore();
      // Bottom-left: after
      ctx.save(); this._roundRect(ctx, gx, gy + gh + gap, gw, gh, 8); ctx.clip();
      this._drawImageCover(ctx, imgAfter, gx, gy + gh + gap, gw, gh); ctx.restore();
      // Bottom-right: after (or before)
      ctx.save(); this._roundRect(ctx, gx + gw + gap, gy + gh + gap, gw, gh, 8); ctx.clip();
      this._drawImageCover(ctx, imgAfter || imgBefore, gx + gw + gap, gy + gh + gap, gw, gh); ctx.restore();

      // Labels
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 12px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(gx, gy + gh - 24, gw, 24);
      ctx.fillRect(gx + gw + gap, gy + gh - 24, gw, 24);
      ctx.fillRect(gx, gy + 2 * gh + gap - 24, gw, 24);
      ctx.fillRect(gx + gw + gap, gy + 2 * gh + gap - 24, gw, 24);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('BEFORE', gx + gw / 2, gy + gh - 7);
      ctx.fillText('BEFORE', gx + gw + gap + gw / 2, gy + gh - 7);
      ctx.fillText('AFTER', gx + gw / 2, gy + 2 * gh + gap - 7);
      ctx.fillText('AFTER', gx + gw + gap + gw / 2, gy + 2 * gh + gap - 7);

      // Info area
      let iy = gy + 2 * gh + gap + 35;
      ctx.fillStyle = '#0F172A'; ctx.font = 'bold 20px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText((pet?.name || '') + ' \u2665', 300, iy); iy += 28;
      ctx.font = '14px ' + fontFamily; ctx.fillStyle = '#64748B';
      infoLines.forEach(line => {
        if (iy < 960) { ctx.fillText(this._truncText(ctx, line, 460), 300, iy); iy += 20; }
      });

      this._drawFooter(ctx, 30, 955, 540, 40, footerParts, mainColor, fontFamily);
    }

    // ===== Layout: minimal =====
    else if (layout === 'minimal') {
      canvas.width = 600; canvas.height = 700;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 600, 700);

      // Before
      ctx.save(); this._roundRect(ctx, 30, 30, 540, 270, 12); ctx.clip();
      this._drawImageCover(ctx, imgBefore, 30, 30, 540, 270); ctx.restore();

      // After
      ctx.save(); this._roundRect(ctx, 30, 320, 540, 270, 12); ctx.clip();
      this._drawImageCover(ctx, imgAfter, 30, 320, 540, 270); ctx.restore();

      // Labels
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      this._roundRect(ctx, 40, 260, 70, 28, 6); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 12px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText('BEFORE', 75, 279);

      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      this._roundRect(ctx, 40, 550, 60, 28, 6); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 12px ' + fontFamily;
      ctx.fillText('AFTER', 70, 569);

      // Minimal info
      ctx.fillStyle = '#0F172A'; ctx.font = 'bold 18px ' + fontFamily; ctx.textAlign = 'center';
      ctx.fillText((pet?.name || '') + '  |  ' + App.formatDate(record.date), 300, 630);

      ctx.fillStyle = mainColor; ctx.font = '13px ' + fontFamily;
      ctx.fillText(footerMessage, 300, 660);
    }

    // Fallback
    else {
      // Default to vertical
      canvas.width = 600; canvas.height = 800;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 600, 800);
      ctx.fillStyle = '#0F172A'; ctx.font = 'bold 20px -apple-system, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Photo Card', 300, 400);
    }

    return canvas;
  },

  async generatePhotoCard(recordId) {
    try {
      const record = await DB.get('records', recordId);
      if (!record) { App.showToast('\uAE30\uB85D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.', 'error'); return; }
      const customer = await DB.get('customers', record.customerId);
      const pet = await DB.get('pets', record.petId);
      const shopName = await DB.getSetting('shopName') || '\uD3AB\uC0B4\uB871';
      const shopPhone = await DB.getSetting('shopPhone') || '';
      const serviceNames = await App.getServiceNames(record.serviceIds);

      // Load design settings (new format first, fallback to old)
      const designRaw = await DB.getSetting('cardDesignSettings');
      const oldRaw = await DB.getSetting('cardTemplateSettings');
      const ds = designRaw || {};
      const os = oldRaw || {};
      const designSettings = {
        layout: ds.layout || 'vertical',
        template: ds.template || os.template || 'default',
        mainColor: ds.mainColor || os.mainColor || '#6366F1',
        showService: ds.showService !== false,
        showPrice: ds.showPrice !== false,
        showGroomer: ds.showGroomer !== false,
        showNextVisit: ds.showNextVisit !== false,
        showDate: ds.showDate !== false,
        showPetInfo: ds.showPetInfo !== false,
        showShopPhone: ds.showShopPhone !== false,
        footerMessage: ds.footerMessage || os.footerMessage || '\uAC10\uC0AC\uD569\uB2C8\uB2E4 \u2665',
        logo: ds.logo || null
      };

      const canvas = await this._generateCardCanvas(record, customer, pet, shopName, shopPhone, serviceNames, designSettings);

      canvas.toBlob(blob => {
        if (!blob) { App.showToast('\uCE74\uB4DC \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.', 'error'); return; }
        const url = URL.createObjectURL(blob);
        const fileName = (pet?.name || 'pet') + '_\uBBF8\uC6A9\uCE74\uB4DC_' + record.date + '.png';
        if (navigator.share && navigator.canShare) {
          const file = new File([blob], fileName, { type: 'image/png' });
          navigator.share({ files: [file], title: (pet?.name || '') + ' \uBBF8\uC6A9 \uCE74\uB4DC' }).catch(() => {
            const a = document.createElement('a');
            a.href = url; a.download = fileName; a.click();
            URL.revokeObjectURL(url);
          });
        } else {
          const a = document.createElement('a');
          a.href = url; a.download = fileName; a.click();
          URL.revokeObjectURL(url);
        }
        App.showToast('\uC0AC\uC9C4 \uCE74\uB4DC\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
      }, 'image/png');
    } catch (err) {
      console.error('Photo card generation error:', err);
      App.showToast('\uCE74\uB4DC \uC0DD\uC131 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.', 'error');
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
      lines.push(['날짜', '고객명', '반려견', '서비스', '기본금액', '할인', '추가요금', '최종금액', '결제수단', '담당 미용사', '메모'].map(csvEsc).join(','));

      filtered.forEach(r => {
        const customer = customerMap[r.customerId];
        const pet = petMap[r.petId];
        const serviceNames = (r.serviceIds || []).map(id => serviceMap[id]).filter(Boolean).join(', ');
        const payLabel = { cash: '현금', card: '카드', transfer: '이체', unpaid: '미결제' }[r.paymentMethod] || '';
        lines.push([
          r.date || '',
          customer?.name || '',
          pet?.name || '',
          serviceNames,
          Number(r.totalPrice) || 0,
          Number(r.discount) || 0,
          Number(r.extraCharge) || 0,
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
