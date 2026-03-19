// ========== Grooming Records Page ==========
App.pages.records = {
  async render(container) {
    const records = await DB.getAll('records');
    const sorted = records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const [customers, pets, services] = await Promise.all([
      DB.getAll('customers'), DB.getAll('pets'), DB.getAll('services')
    ]);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s.name);

    // 매출 계산
    const today = App.getToday();
    const thisMonth = today.slice(0, 7);
    const monthRecords = records.filter(r => r.date && r.date.startsWith(thisMonth));
    const monthRevenue = monthRecords.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
    const totalRevenue = records.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);

    // 오늘 매출
    const todayRecords = records.filter(r => r.date === today);
    const todayRevenue = todayRecords.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);

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
    const weekRevenue = weekRecords.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);

    // 매출 데이터 캐시
    this._records = records;

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

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card gradient-purple clickable-stat" id="stat-today-revenue" style="cursor:pointer">
          <div class="stat-icon purple">&#x1F4B5;</div>
          <div>
            <div class="stat-value" style="font-size:1.4rem">${App.formatCurrency(todayRevenue)}</div>
            <div class="stat-label">오늘 매출 (${todayRecords.length}건) &#x1F4C8;</div>
          </div>
        </div>
        <div class="stat-card gradient-blue clickable-stat" id="stat-week-revenue" style="cursor:pointer">
          <div class="stat-icon blue">&#x1F4CA;</div>
          <div>
            <div class="stat-value" style="font-size:1.4rem">${App.formatCurrency(weekRevenue)}</div>
            <div class="stat-label">이번 주 매출 (${weekRecords.length}건) &#x1F4C8;</div>
          </div>
        </div>
        <div class="stat-card gradient-green clickable-stat" id="stat-month-revenue" style="cursor:pointer">
          <div class="stat-icon green">&#x1F4B0;</div>
          <div>
            <div class="stat-value" style="font-size:1.4rem">${App.formatCurrency(monthRevenue)}</div>
            <div class="stat-label">이번 달 매출 (${monthRecords.length}건) &#x1F4C8;</div>
          </div>
        </div>
      </div>

      <div class="filter-bar">
        <div class="search-box">
          <span class="search-icon">&#x1F50D;</span>
          <input type="text" id="record-search" placeholder="고객, 반려견 검색...">
        </div>
        <input type="month" id="filter-month" value="${thisMonth}">
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
                        data-search="${(customer?.name || '') + ' ' + (pet?.name || '')}">
                      <td>${App.formatDate(r.date)}</td>
                      <td><a href="#customers/${r.customerId}" style="color:var(--primary)">${App.escapeHtml(customer?.name || '-')}</a></td>
                      <td><a href="#pets/${r.petId}" style="color:var(--primary)"><strong>&#x1F436; ${App.escapeHtml(pet?.name || '-')}</strong></a></td>
                      <td class="hide-mobile"><span style="font-size:0.85rem">${App.escapeHtml(serviceNames)}</span></td>
                      <td><strong>${App.formatCurrency(r.totalPrice)}</strong></td>
                      <td class="hide-mobile">${App.escapeHtml(r.groomer || '-')}</td>
                      <td class="hide-mobile">${this.getPaymentLabel(r.paymentMethod)}</td>
                      <td class="hide-mobile" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(r.memo || '')}">
                        ${App.escapeHtml(r.memo || '-')}
                      </td>
                      <td class="table-actions">
                        <button class="btn-icon btn-edit-record" data-id="${r.id}" title="수정">&#x270F;</button>
                        <button class="btn-icon btn-delete-record" data-id="${r.id}" title="삭제" style="color:var(--danger)">&#x1F5D1;</button>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
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
      const total = todayRecs.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
      chartHtml = `
        <div style="text-align:center;margin-bottom:16px">
          <div style="font-size:2rem;font-weight:800;color:var(--primary)">${App.formatCurrency(total)}</div>
          <div style="color:var(--text-secondary);margin-top:4px">${today} (${todayRecs.length}건)</div>
        </div>
        ${todayRecs.length > 0 ? `<div style="display:flex;flex-direction:column;gap:8px">
          ${todayRecs.map(r => `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg);border-radius:8px">
            <span style="font-weight:600">${App.formatCurrency(r.totalPrice)}</span>
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
        const rev = records.filter(r => r.date === ds).reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
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
        const rev = records.filter(r => r.date === ds).reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
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

    // 매출 카드 클릭 이벤트
    document.getElementById('stat-today-revenue')?.addEventListener('click', () => this.showRevenueChart('today'));
    document.getElementById('stat-week-revenue')?.addEventListener('click', () => this.showRevenueChart('week'));
    document.getElementById('stat-month-revenue')?.addEventListener('click', () => this.showRevenueChart('month'));

    document.getElementById('record-search')?.addEventListener('input', () => this.applyFilters());
    document.getElementById('filter-month')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
      document.getElementById('record-search').value = '';
      document.getElementById('filter-month').value = '';
      this.applyFilters();
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

    document.querySelectorAll('#record-tbody tr').forEach(row => {
      if (!row.dataset.id) return;
      const matchSearch = !search || (row.dataset.search || '').toLowerCase().includes(search);
      const matchMonth = !month || (row.dataset.month || '') === month;
      row.style.display = (matchSearch && matchMonth) ? '' : 'none';
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
        <div class="form-row three">
          <div class="form-group">
            <label class="form-label">날짜 <span class="required">*</span></label>
            <input type="date" id="f-date" value="${record.date || App.getToday()}">
          </div>
          <div class="form-group">
            <label class="form-label">담당 미용사</label>
            <select id="f-groomer">${await App.getGroomerOptions(record.groomer)}</select>
          </div>
          <div class="form-group">
            <label class="form-label">다음 방문 권장일</label>
            <input type="date" id="f-nextVisitDate" value="${record.nextVisitDate || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">서비스</label>
          <div id="f-services" style="display:flex;flex-direction:column;gap:6px">
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
              <option value="medium" selected>중형</option>
              <option value="large">대형</option>
            </select>
            <div class="form-hint">가격 자동 계산에 사용됩니다</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">결제 수단</label>
          <select id="f-paymentMethod">
            <option value="" ${!record.paymentMethod ? 'selected' : ''}>선택 안 함</option>
            <option value="cash" ${record.paymentMethod === 'cash' ? 'selected' : ''}>현금</option>
            <option value="card" ${record.paymentMethod === 'card' ? 'selected' : ''}>카드</option>
            <option value="transfer" ${record.paymentMethod === 'transfer' ? 'selected' : ''}>계좌이체</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">메모</label>
          <textarea id="f-memo" placeholder="미용 중 특이사항, 다음 방문 시 참고할 내용 등">${App.escapeHtml(record.memo || '')}</textarea>
        </div>
      `,
      onSave: () => this.saveRecord(id)
    });

    // 검색 가능한 고객 선택 렌더링
    await App.renderCustomerSelect('record-customer-select', record.customerId, async (cid) => {
      document.getElementById('f-petId').innerHTML = '<option value="">반려견 선택</option>' + await App.getPetOptions(cid);
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
      }
    };

    document.querySelectorAll('input[name="serviceIds"]').forEach(cb => {
      cb.addEventListener('change', calcPrice);
    });
    document.getElementById('f-sizeType').addEventListener('change', calcPrice);
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

      if (!customerId) { App.showToast('고객을 선택해주세요.', 'error'); return; }
      if (!petId) { App.showToast('반려견을 선택해주세요.', 'error'); return; }
      if (!date) { App.showToast('날짜를 입력해주세요.', 'error'); return; }

      const data = { customerId, petId, date, groomer, nextVisitDate, serviceIds, totalPrice, memo, paymentMethod };

      if (id) {
        const existing = await DB.get('records', id);
        Object.assign(existing, data);
        await DB.update('records', existing);
        App.showToast('미용 기록이 수정되었습니다.');
      } else {
        await DB.add('records', data);
        App.showToast('미용 기록이 저장되었습니다.');
      }

      App.closeModal();
      App.handleRoute();
    } catch (err) {
      console.error('saveRecord error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
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
      monthlyMap[month].revenue += Number(r.totalPrice) || 0;
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
                  <span style="flex:1;font-weight:600">${App.formatCurrency(r.totalPrice)}</span>
                  <span style="color:var(--text-secondary)">${App.escapeHtml(r.groomer || '-')}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  showPetInfoBox(pet) {
    const existing = document.getElementById('pet-info-display');
    if (existing) existing.remove();

    const hasNotes = pet.temperament || pet.healthNotes || pet.allergies;
    if (!hasNotes) return;

    const box = document.createElement('div');
    box.id = 'pet-info-display';
    box.className = 'pet-info-box';
    box.innerHTML = `
      <div class="pet-info-title">&#x26A0; ${App.escapeHtml(pet.name)} 특이사항</div>
      ${pet.temperament ? `<div class="pet-info-row"><span class="pet-info-label">성격</span> ${App.escapeHtml(pet.temperament)}</div>` : ''}
      ${pet.healthNotes ? `<div class="pet-info-row"><span class="pet-info-label">건강</span> ${App.escapeHtml(pet.healthNotes)}</div>` : ''}
      ${pet.allergies ? `<div class="pet-info-row"><span class="pet-info-label">알러지</span> ${App.escapeHtml(pet.allergies)}</div>` : ''}
    `;

    const memo = document.getElementById('f-memo');
    if (memo) memo.parentElement.insertBefore(box, memo.parentElement.firstChild);
  },

  getPaymentLabel(method) {
    const labels = { cash: '현금', card: '카드', transfer: '이체' };
    return labels[method] || '-';
  },
};
