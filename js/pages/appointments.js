// ========== Appointments Page ==========
App.pages.appointments = {
  async render(container) {
    const appointments = await DB.getAll('appointments');
    const today = App.getToday();

    const sorted = appointments.sort((a, b) => {
      const dateComp = (b.date || '').localeCompare(a.date || '');
      if (dateComp !== 0) return dateComp;
      return (a.time || '').localeCompare(b.time || '');
    });

    const statusCounts = { all: appointments.length, pending: 0, confirmed: 0, completed: 0, cancelled: 0, noshow: 0 };
    appointments.forEach(a => { if (statusCounts[a.status] !== undefined) statusCounts[a.status]++; });

    const [customers, pets, services] = await Promise.all([
      DB.getAll('customers'), DB.getAll('pets'), DB.getAll('services')
    ]);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s.name);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">예약 관리</h1>
          <p class="page-subtitle">총 ${appointments.length}건</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-toggle-calendar">&#x1F4C5; 캘린더 뷰</button>
          <button class="btn btn-primary" id="btn-add-appointment">+ 새 예약</button>
        </div>
      </div>

      <!-- 월별 캘린더 뷰 -->
      <div id="calendar-container" class="calendar-container" style="display:none">
        <div class="calendar-header">
          <button class="btn btn-sm btn-secondary" id="cal-prev">&larr; 이전</button>
          <span class="calendar-title" id="cal-title"></span>
          <button class="btn btn-sm btn-secondary" id="cal-next">다음 &rarr;</button>
        </div>
        <div class="calendar-grid" id="cal-grid">
          <div class="calendar-day-label">월</div>
          <div class="calendar-day-label">화</div>
          <div class="calendar-day-label">수</div>
          <div class="calendar-day-label">목</div>
          <div class="calendar-day-label">금</div>
          <div class="calendar-day-label">토</div>
          <div class="calendar-day-label">일</div>
        </div>
      </div>

      <div class="filter-bar">
        <div class="quick-filters">
          <button class="quick-filter-btn active" data-filter="all">전체</button>
          <button class="quick-filter-btn" data-filter="today">오늘</button>
          <button class="quick-filter-btn" data-filter="tomorrow">내일</button>
          <button class="quick-filter-btn" data-filter="week">이번주</button>
        </div>
        <div class="search-box">
          <span class="search-icon">&#x1F50D;</span>
          <input type="text" id="appt-search" placeholder="고객, 반려견 검색...">
        </div>
        <select id="filter-status">
          <option value="">전체 상태 (${statusCounts.all})</option>
          <option value="pending">대기 (${statusCounts.pending})</option>
          <option value="confirmed">확정 (${statusCounts.confirmed})</option>
          <option value="completed">완료 (${statusCounts.completed})</option>
          <option value="cancelled">취소 (${statusCounts.cancelled})</option>
          <option value="noshow">노쇼 (${statusCounts.noshow})</option>
        </select>
        <input type="date" id="filter-date" value="">
        <button class="btn btn-secondary btn-sm" id="btn-clear-filter">필터 초기화</button>
      </div>

      <div class="card">
        <div class="card-body no-padding">
          <div class="table-container">
            <table class="data-table" id="appt-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>시간</th>
                  <th>고객</th>
                  <th>반려견</th>
                  <th class="hide-mobile">서비스</th>
                  <th class="hide-mobile">담당</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody id="appt-tbody">
                ${sorted.length === 0 ? `
                  <tr><td colspan="8">
                    <div class="empty-state">
                      <div class="empty-state-icon">&#x1F4C5;</div>
                      <div class="empty-state-text">등록된 예약이 없습니다</div>
                      <button class="btn btn-primary" onclick="App.pages.appointments.showForm()">+ 첫 예약 등록하기</button>
                    </div>
                  </td></tr>
                ` : sorted.map(a => {
                  const customer = customerMap[a.customerId];
                  const pet = petMap[a.petId];
                  const serviceNames = (a.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ');
                  const isToday = a.date === today;
                  const isPast = a.date < today;
                  return `
                    <tr data-id="${a.id}" data-status="${a.status || 'pending'}" data-date="${a.date}"
                        data-search="${(customer?.name || '') + ' ' + (customer?.phone || '') + ' ' + (pet?.name || '')}"
                        style="${isToday ? 'background:#F0F9FF' : ''}">
                      <td>
                        <strong>${App.formatDate(a.date)}</strong>
                        ${isToday ? '<span class="badge badge-info" style="margin-left:4px">오늘</span>' : ''}
                        ${isPast && a.status !== 'completed' && a.status !== 'cancelled' ? '<span class="badge badge-danger" style="margin-left:4px">지남</span>' : ''}
                      </td>
                      <td>${a.time || '-'}</td>
                      <td><a href="#customers/${a.customerId}" style="color:var(--primary)" onclick="event.stopPropagation()">${App.escapeHtml(customer?.name || '-')}</a></td>
                      <td><a href="#pets/${a.petId}" style="color:var(--primary)" onclick="event.stopPropagation()">${App.escapeHtml(pet?.name || '-')}</a></td>
                      <td class="hide-mobile"><span style="font-size:0.85rem">${App.escapeHtml(serviceNames)}</span></td>
                      <td class="hide-mobile">${App.escapeHtml(a.groomer || '-')}</td>
                      <td>
                        <select class="status-select" data-id="${a.id}" style="padding:4px 8px;font-size:0.8rem;width:auto;min-width:70px">
                          <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>대기</option>
                          <option value="confirmed" ${a.status === 'confirmed' ? 'selected' : ''}>확정</option>
                          <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>완료</option>
                          <option value="cancelled" ${a.status === 'cancelled' ? 'selected' : ''}>취소</option>
                          <option value="noshow" ${a.status === 'noshow' ? 'selected' : ''}>노쇼</option>
                        </select>
                      </td>
                      <td class="table-actions">
                        <button class="btn-icon btn-edit-appt" data-id="${a.id}" title="수정">&#x270F;</button>
                        <button class="btn-icon btn-complete-appt" data-id="${a.id}" title="미용 기록 작성" style="color:var(--success)">&#x2714;</button>
                        <button class="btn-icon btn-delete-appt" data-id="${a.id}" title="삭제" style="color:var(--danger)">&#x1F5D1;</button>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // 캘린더 관련 상태
  _calYear: new Date().getFullYear(),
  _calMonth: new Date().getMonth(),

  renderCalendar() {
    const container = document.getElementById('calendar-container');
    if (!container || container.style.display === 'none') return;

    const year = this._calYear;
    const month = this._calMonth;
    const title = document.getElementById('cal-title');
    if (title) title.textContent = `${year}년 ${month + 1}월`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const daysInMonth = lastDay.getDate();
    // 월요일 시작으로 변환: 0(Sun)->6, 1(Mon)->0, ...
    const offset = startDow === 0 ? 6 : startDow - 1;

    const today = App.getToday();

    // 이 달의 예약 수 카운트
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const rows = document.querySelectorAll('#appt-tbody tr[data-date]');
    const dateCounts = {};
    rows.forEach(row => {
      const d = row.dataset.date;
      if (d && d.startsWith(monthPrefix)) {
        const status = row.dataset.status;
        if (status !== 'cancelled') {
          dateCounts[d] = (dateCounts[d] || 0) + 1;
        }
      }
    });

    // 테이블에서 못 찾으면 DB에서 가져온 데이터 사용
    if (Object.keys(dateCounts).length === 0 && this._appointments) {
      this._appointments.forEach(a => {
        if (a.date && a.date.startsWith(monthPrefix) && a.status !== 'cancelled') {
          dateCounts[a.date] = (dateCounts[a.date] || 0) + 1;
        }
      });
    }

    let cellsHtml = '';
    // 빈 칸 (이전 달)
    for (let i = 0; i < offset; i++) {
      cellsHtml += '<div class="calendar-cell empty"></div>';
    }
    // 날짜 셀
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = dateCounts[dateStr] || 0;
      const isToday = dateStr === today;
      let colorClass = 'cal-gray';
      if (count >= 3) colorClass = 'cal-red';
      else if (count >= 1) colorClass = 'cal-blue';

      cellsHtml += `
        <div class="calendar-cell ${isToday ? 'today' : ''}" data-date="${dateStr}">
          <span class="cal-day-num">${d}</span>
          <button class="cal-count-btn ${colorClass}" title="${dateStr}: ${count}건">${count}</button>
        </div>`;
    }

    const grid = document.getElementById('cal-grid');
    if (grid) {
      // 기존 셀 제거 (day labels 7개는 유지)
      const existingCells = grid.querySelectorAll('.calendar-cell');
      existingCells.forEach(c => c.remove());
      // 새 셀 추가
      grid.insertAdjacentHTML('beforeend', cellsHtml);
      // 셀 클릭 이벤트
      grid.querySelectorAll('.calendar-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', () => {
          const date = cell.dataset.date;
          const dateInput = document.getElementById('filter-date');
          if (dateInput) {
            dateInput.value = date;
            this.applyFilters();
          }
          // 선택 표시
          grid.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
        });
      });
    }
  },

  async init() {
    document.getElementById('btn-add-appointment')?.addEventListener('click', () => this.showForm());

    // 캘린더 토글
    document.getElementById('btn-toggle-calendar')?.addEventListener('click', () => {
      const cal = document.getElementById('calendar-container');
      if (cal) {
        const isHidden = cal.style.display === 'none';
        cal.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          this._calYear = new Date().getFullYear();
          this._calMonth = new Date().getMonth();
          this.renderCalendar();
        }
      }
    });

    // 캘린더 이전/다음 버튼
    document.getElementById('cal-prev')?.addEventListener('click', () => {
      this._calMonth--;
      if (this._calMonth < 0) { this._calMonth = 11; this._calYear--; }
      this.renderCalendar();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      this._calMonth++;
      if (this._calMonth > 11) { this._calMonth = 0; this._calYear++; }
      this.renderCalendar();
    });

    // 예약 데이터 캐시 (캘린더용)
    this._appointments = await DB.getAll('appointments');

    // Quick date filters
    document.querySelectorAll('.quick-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        const dateInput = document.getElementById('filter-date');
        const today = App.getToday();
        if (filter === 'all') {
          dateInput.value = '';
        } else if (filter === 'today') {
          dateInput.value = today;
        } else if (filter === 'tomorrow') {
          const d = new Date(); d.setDate(d.getDate() + 1);
          dateInput.value = App.formatDate(d.toISOString());
        } else if (filter === 'week') {
          dateInput.value = '';
          // Week filter handled in applyFilters
        }
        document.getElementById('filter-status').value = '';
        this.applyFilters(filter === 'week' ? 'week' : null);
      });
    });

    // Filters
    document.getElementById('appt-search')?.addEventListener('input', () => this.applyFilters());
    document.getElementById('filter-status')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-date')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
      document.getElementById('appt-search').value = '';
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-date').value = '';
      this.applyFilters();
    });

    // Status change
    document.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const id = Number(e.target.dataset.id);
        const appt = await DB.get('appointments', id);
        appt.status = e.target.value;
        await DB.update('appointments', appt);
        App.showToast('예약 상태가 변경되었습니다.');
      });
    });

    // Edit
    document.querySelectorAll('.btn-edit-appt').forEach(btn => {
      btn.addEventListener('click', () => this.showForm(Number(btn.dataset.id)));
    });

    // Complete -> create record
    document.querySelectorAll('.btn-complete-appt').forEach(btn => {
      btn.addEventListener('click', () => this.completeToRecord(Number(btn.dataset.id)));
    });

    // Delete
    document.querySelectorAll('.btn-delete-appt').forEach(btn => {
      btn.addEventListener('click', () => this.deleteAppointment(Number(btn.dataset.id)));
    });
  },

  applyFilters(special) {
    const search = (document.getElementById('appt-search')?.value || '').toLowerCase();
    const status = document.getElementById('filter-status')?.value || '';
    const date = document.getElementById('filter-date')?.value || '';
    const today = App.getToday();
    const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return App.formatDate(d.toISOString()); })();

    document.querySelectorAll('#appt-tbody tr').forEach(row => {
      if (!row.dataset.id) return;
      const matchSearch = !search || (row.dataset.search || '').toLowerCase().includes(search);
      const matchStatus = !status || row.dataset.status === status;
      let matchDate = true;
      if (special === 'week') {
        matchDate = row.dataset.date >= today && row.dataset.date <= weekEnd;
      } else if (date) {
        matchDate = row.dataset.date === date;
      }
      row.style.display = (matchSearch && matchStatus && matchDate) ? '' : 'none';
    });
  },

  async showForm(id, preCustomerId, prePetId) {
    let appt = id ? await DB.get('appointments', id) : { date: App.getToday(), status: 'pending', customerId: preCustomerId || null, petId: prePetId || null };
    const petOptions = await App.getPetOptions(appt.customerId, appt.petId);
    const serviceCheckboxes = await App.getServiceCheckboxes(appt.serviceIds || []);

    App.showModal({
      title: id ? '예약 수정' : '새 예약',
      size: 'lg',
      content: `
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">고객 <span class="required">*</span></label>
            <div id="appt-customer-select"></div>
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
            <input type="date" id="f-date" value="${appt.date || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">시간</label>
            <input type="time" id="f-time" value="${appt.time || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">담당 미용사</label>
            <select id="f-groomer">${await App.getGroomerOptions(appt.groomer)}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">서비스</label>
          <div id="f-services" style="display:flex;flex-direction:column;gap:6px">
            ${serviceCheckboxes}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">상태</label>
          <select id="f-status">
            <option value="pending" ${appt.status === 'pending' ? 'selected' : ''}>대기</option>
            <option value="confirmed" ${appt.status === 'confirmed' ? 'selected' : ''}>확정</option>
            <option value="completed" ${appt.status === 'completed' ? 'selected' : ''}>완료</option>
            <option value="cancelled" ${appt.status === 'cancelled' ? 'selected' : ''}>취소</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">메모</label>
          <textarea id="f-memo" placeholder="예약 관련 메모">${App.escapeHtml(appt.memo || '')}</textarea>
        </div>
        ${!id ? `
        <div class="form-group" style="margin-top:12px">
          <label class="checkbox-label" style="background:var(--primary-light);border:1.5px solid var(--primary-lighter);border-radius:var(--radius);padding:10px 14px">
            <input type="checkbox" id="f-autoRecord">
            미용 기록도 함께 등록
            <span style="color:var(--text-muted);font-size:0.78rem;margin-left:auto">저장 후 미용 기록 폼이 열립니다</span>
          </label>
        </div>
        ` : ''}
      `,
      onSave: () => this.saveAppointment(id)
    });

    // 검색 가능한 고객 선택 렌더링
    await App.renderCustomerSelect('appt-customer-select', appt.customerId, async (cid) => {
      document.getElementById('f-petId').innerHTML = '<option value="">반려견 선택</option>' + await App.getPetOptions(cid);
    });
  },

  async saveAppointment(id) {
    const customerId = Number(document.getElementById('appt-customer-select-value')?.value || document.getElementById('f-customerId')?.value);
    const petId = Number(document.getElementById('f-petId').value);
    const date = document.getElementById('f-date').value;
    const time = document.getElementById('f-time').value;
    const groomer = document.getElementById('f-groomer').value.trim();
    const status = document.getElementById('f-status').value;
    const memo = document.getElementById('f-memo').value.trim();

    const serviceIds = [];
    document.querySelectorAll('input[name="serviceIds"]:checked').forEach(cb => {
      serviceIds.push(Number(cb.value));
    });

    if (!customerId) { App.showToast('고객을 선택해주세요.', 'error'); return; }
    if (!petId) { App.showToast('반려견을 선택해주세요.', 'error'); return; }
    if (!date) { App.showToast('날짜를 입력해주세요.', 'error'); return; }

    // Check time conflict
    if (time) {
      const allAppts = await DB.getAll('appointments');
      const conflict = allAppts.find(a =>
        a.id !== id && a.date === date && a.time === time && a.status !== 'cancelled' &&
        (a.groomer === groomer || a.petId === petId)
      );
      if (conflict) {
        const conflictPet = await DB.get('pets', conflict.petId);
        App.showToast(`같은 시간에 이미 예약이 있습니다 (${conflictPet?.name || '알 수 없음'})`, 'error');
        return;
      }
    }

    // 미용 기록 자동 등록 체크 여부
    const autoRecord = !id && document.getElementById('f-autoRecord')?.checked;

    try {
      const data = { customerId, petId, date, time, groomer, status, serviceIds, memo };

      if (id) {
        const existing = await DB.get('appointments', id);
        Object.assign(existing, data);
        await DB.update('appointments', existing);
        App.showToast('예약이 수정되었습니다.');
      } else {
        const newId = await DB.add('appointments', data);
        App.showToast('새 예약이 등록되었습니다.');

        // 미용 기록 자동 등록
        if (autoRecord) {
          App.closeModal();
          setTimeout(() => {
            App.pages.records.showForm(null, {
              id: newId,
              customerId, petId, date, groomer, serviceIds
            });
          }, 300);
          return;
        }
      }

      App.closeModal();
      App.handleRoute();
    } catch (err) {
      console.error('Save appointment error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  async completeToRecord(id) {
    try {
      const appt = await DB.get('appointments', id);
      if (!appt) return;
      appt.status = 'completed';
      await DB.update('appointments', appt);
      // Show record form directly without page navigation
      App.pages.records.showForm(null, appt);
    } catch (err) {
      console.error('Complete to record error:', err);
      App.showToast('처리 중 오류가 발생했습니다.', 'error');
    }
  },

  async deleteAppointment(id) {
    const confirmed = await App.confirm('이 예약을 삭제하시겠습니까?');
    if (!confirmed) return;

    try {
      await DB.delete('appointments', id);
      App.showToast('예약이 삭제되었습니다.');
      App.handleRoute();
    } catch (err) {
      console.error('Delete appointment error:', err);
      App.showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  }
};
