// ========== Appointments Page ==========
App.pages.appointments = {
  _showAll: false,

  async render(container) {
    const today = App.getToday();
    // 최근 3개월 + 미래 예약만 로드 (성능 최적화)
    const threeMonthsAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return App.formatLocalDate(d); })();
    const appointments = this._showAll
      ? await DB.getAll('appointments')
      : await DB.getByDateRange('appointments', 'date', threeMonthsAgo, '9999-12-31');

    const sorted = appointments.sort((a, b) => {
      const dateComp = (b.date || '').localeCompare(a.date || '');
      if (dateComp !== 0) return dateComp;
      return (a.time || '').localeCompare(b.time || '');
    });

    const statusCounts = { all: appointments.length, pending: 0, confirmed: 0, in_progress: 0, completed: 0, cancelled: 0, noshow: 0 };
    appointments.forEach(a => { if (statusCounts[a.status] !== undefined) statusCounts[a.status]++; });

    const [customers, pets, services] = await Promise.all([
      DB.getAll('customers'), DB.getAll('pets'), DB.getAll('services')
    ]);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s.name);
    this._customerMap = customerMap;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">예약 관리</h1>
          <p class="page-subtitle">총 ${appointments.length}건</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-toggle-timetable">&#x1F552; 타임테이블</button>
          <button class="btn btn-primary" id="btn-add-appointment">+ 새 예약</button>
        </div>
      </div>

      <!-- 월별 캘린더 뷰 (항상 표시) -->
      <div id="calendar-container" class="calendar-container">
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

      <!-- 타임테이블 뷰 -->
      <div id="timetable-container" style="display:none;margin-bottom:20px">
        <div class="card">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:10px">
              <button class="btn btn-sm btn-secondary" id="tt-prev">&#x25C0;</button>
              <strong id="tt-date">${today}</strong>
              <button class="btn btn-sm btn-secondary" id="tt-next">&#x25B6;</button>
            </div>
            <span class="card-title" style="margin-left:auto">&#x1F552; 미용사별 타임테이블</span>
          </div>
          <div class="card-body" style="overflow-x:auto;padding:0">
            <div id="timetable-grid"></div>
          </div>
        </div>
      </div>

      <div class="filter-bar" id="appt-filter-bar">
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
          <option value="in_progress">미용중 (${statusCounts.in_progress})</option>
          <option value="completed">완료 (${statusCounts.completed})</option>
          <option value="cancelled">취소 (${statusCounts.cancelled})</option>
          <option value="noshow">노쇼 (${statusCounts.noshow})</option>
        </select>
        <input type="date" id="filter-date" value="" style="display:none">
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
                  <th>반려견 / 보호자</th>
                  <th class="hide-mobile">서비스</th>
                  <th class="hide-mobile">담당</th>
                  <th class="hide-mobile">메모</th>
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
                ` : (this._showAll ? sorted : sorted.slice(0, 20)).map(a => {
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
                      <td>${a.time || '-'}${a.duration && a.duration !== 60 ? `<div style="font-size:0.7rem;color:var(--text-muted)">${a.duration}분</div>` : ''}</td>
                      <td><a href="#pets/${a.petId}" style="color:var(--primary);font-weight:700" onclick="event.stopPropagation()">${App.escapeHtml(pet?.name || '-')}</a> <span style="color:var(--text-muted);font-size:0.75rem">${App.escapeHtml(App.getCustomerLabel(customer))}</span>${customer?.phone ? ` <a href="sms:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" onclick="event.stopPropagation()" title="문자 보내기" style="color:var(--text-muted);font-size:0.8rem">&#x1F4AC;</a>` : ''}</td>
                      <td class="hide-mobile"><span style="font-size:0.85rem">${App.escapeHtml(serviceNames)}</span></td>
                      <td class="hide-mobile">${App.escapeHtml(a.groomer || '-')}</td>
                      <td class="hide-mobile" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(a.memo || '')}">${App.escapeHtml(a.memo || '-')}</td>
                      <td>
                        <select class="status-select" data-id="${a.id}" style="padding:4px 8px;font-size:0.8rem;width:auto;min-width:70px">
                          <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>대기</option>
                          <option value="confirmed" ${a.status === 'confirmed' ? 'selected' : ''}>확정</option>
                          <option value="in_progress" ${a.status === 'in_progress' ? 'selected' : ''}>미용중</option>
                          <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>완료</option>
                          <option value="cancelled" ${a.status === 'cancelled' ? 'selected' : ''}>취소</option>
                          <option value="noshow" ${a.status === 'noshow' ? 'selected' : ''}>노쇼</option>
                        </select>
                      </td>
                      <td class="table-actions">
                        <button class="btn-icon btn-reminder-appt" data-id="${a.id}" title="재확인 문자" style="color:var(--info)">&#x1F4E9;</button>
                        <button class="btn-icon btn-edit-appt" data-id="${a.id}" title="수정">&#x270F;</button>
                        <button class="btn-icon btn-complete-appt" data-id="${a.id}" title="미용 기록 작성" style="color:var(--success)">&#x2714;</button>
                        <button class="btn-icon btn-delete-appt text-danger" data-id="${a.id}" title="삭제">&#x1F5D1;</button>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Mobile Card List -->
          <div class="mobile-card-list" id="appt-card-list">
            ${sorted.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">&#x1F4C5;</div>
                <div class="empty-state-text">등록된 예약이 없습니다</div>
                <button class="btn btn-primary" onclick="App.pages.appointments.showForm()">+ 첫 예약 등록하기</button>
              </div>
            ` : (this._showAll ? sorted : sorted.slice(0, 20)).map(a => {
              const customer = customerMap[a.customerId];
              const pet = petMap[a.petId];
              const isToday = a.date === today;
              const isPast = a.date < today;
              const statusLabels = { pending: '대기', confirmed: '확정', in_progress: '미용중', completed: '완료', cancelled: '취소', noshow: '노쇼' };
              const statusClass = { pending: 'badge-warning', confirmed: 'badge-info', in_progress: 'badge-info', completed: 'badge-success', cancelled: 'badge-secondary', noshow: 'badge-danger' };
              return `
              <div class="mobile-card" data-id="${a.id}" data-status="${a.status || 'pending'}" data-date="${a.date}"
                   data-search="${(customer?.name || '') + ' ' + (customer?.phone || '') + ' ' + (pet?.name || '')}"
                   style="${isToday ? 'border-left:3px solid var(--primary)' : ''}${isPast && a.status !== 'completed' && a.status !== 'cancelled' ? 'border-left:3px solid var(--danger)' : ''}">
                <div class="mobile-card-header">
                  <div class="mobile-card-date">
                    <strong>${App.formatDate(a.date)}</strong> ${a.time || ''}${a.duration && a.duration !== 60 ? ` <span style="font-size:0.75rem;color:var(--text-muted)">(${a.duration}분)</span>` : ''}
                    ${isToday ? '<span class="badge badge-info">오늘</span>' : ''}
                    ${isPast && a.status !== 'completed' && a.status !== 'cancelled' ? '<span class="badge badge-danger">지남</span>' : ''}
                  </div>
                  <span class="badge ${statusClass[a.status] || 'badge-secondary'}">${statusLabels[a.status] || a.status}</span>
                </div>
                <div class="mobile-card-body">
                  <span class="mobile-card-info">&#x1F436; <strong>${App.escapeHtml(pet?.name || '-')}</strong> &middot; ${App.escapeHtml(App.getCustomerLabel(customer))}</span>
                  ${a.memo ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px">&#x1F4DD; ${App.escapeHtml(a.memo.length > 40 ? a.memo.slice(0, 40) + '...' : a.memo)}</div>` : ''}
                </div>
                <div class="mobile-card-actions" style="flex-direction:column;gap:6px">
                  <select class="status-select" data-id="${a.id}" style="width:100%;padding:8px 10px;font-size:0.8rem;min-width:70px;min-height:48px">
                    <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>대기</option>
                    <option value="confirmed" ${a.status === 'confirmed' ? 'selected' : ''}>확정</option>
                    <option value="in_progress" ${a.status === 'in_progress' ? 'selected' : ''}>미용중</option>
                    <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>완료</option>
                    <option value="cancelled" ${a.status === 'cancelled' ? 'selected' : ''}>취소</option>
                    <option value="noshow" ${a.status === 'noshow' ? 'selected' : ''}>노쇼</option>
                  </select>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-sm btn-info btn-reminder-appt flex-1" data-id="${a.id}">&#x1F4E9; 재확인</button>
                    <button class="btn btn-sm btn-secondary btn-edit-appt flex-1" data-id="${a.id}">&#x270F; 수정</button>
                    <button class="btn btn-sm btn-success btn-complete-appt flex-1" data-id="${a.id}">&#x2702; 미용 완료</button>
                    <button class="btn btn-sm btn-danger btn-delete-appt" data-id="${a.id}" style="flex:0 0 auto;padding:6px 12px;min-width:44px" title="삭제">&#x1F5D1;</button>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
          ${!this._showAll && sorted.length > 20 ? `<div style="text-align:center;padding:16px"><button class="btn btn-secondary" id="btn-load-more-appts" style="min-width:200px">더 보기 (${sorted.length - 20}건 남음)</button></div>` : ''}

        </div>
      </div>
    `;
  },

  // 캘린더 관련 상태
  _calYear: new Date().getFullYear(),
  _calMonth: new Date().getMonth(),

  _closedDays: null,

  async renderCalendar() {
    const container = document.getElementById('calendar-container');
    if (!container) return;

    // 효율적 쿼리: 현재 달 ± 1개월 데이터만 로드
    const year = this._calYear;
    const month = this._calMonth;
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-31`;
    this._appointments = await DB.getByDateRange('appointments', 'date', monthStart, monthEnd);

    // 휴무일 가져오기
    if (this._closedDays === null) {
      this._closedDays = await DB.getSetting('closedDays') || [];
    }

    const title = document.getElementById('cal-title');
    if (title) title.textContent = `${year}년 ${month + 1}월`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const daysInMonth = lastDay.getDate();
    // 월요일 시작으로 변환: 0(Sun)->6, 1(Mon)->0, ...
    const offset = startDow === 0 ? 6 : startDow - 1;

    const today = App.getToday();

    // 이 달의 예약 데이터 그룹핑
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const dateCounts = {};
    const dateAppts = {};
    if (this._appointments) {
      this._appointments.forEach(a => {
        if (a.date && a.date.startsWith(monthPrefix) && a.status !== 'cancelled') {
          dateCounts[a.date] = (dateCounts[a.date] || 0) + 1;
          if (!dateAppts[a.date]) dateAppts[a.date] = [];
          dateAppts[a.date].push(a);
        }
      });
      // 시간순 정렬
      Object.values(dateAppts).forEach(arr => arr.sort((a, b) => (a.time || '').localeCompare(b.time || '')));
    }
    const customerMap = this._customerMap || {};

    let cellsHtml = '';
    // 빈 칸 (이전 달)
    for (let i = 0; i < offset; i++) {
      cellsHtml += '<div class="calendar-cell empty"></div>';
    }
    // 날짜 셀
    const closedDays = this._closedDays || [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = dateCounts[dateStr] || 0;
      const isToday = dateStr === today;
      const cellDate = new Date(year, month, d);
      const isClosed = closedDays.includes(cellDate.getDay());
      let colorClass = 'cal-gray';
      if (count >= 3) colorClass = 'cal-red';
      else if (count >= 1) colorClass = 'cal-blue';

      // 예약 미리보기 (최대 3건, 모바일 최적화)
      let previewHtml = '';
      if (!isClosed && count > 0) {
        const appts = dateAppts[dateStr] || [];
        previewHtml = appts.slice(0, 3).map(a => {
          const cName = customerMap[a.customerId]?.name || '?';
          const shortName = cName.length > 2 ? cName.slice(0, 2) : cName;
          return '<div style="font-size:0.58rem;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-secondary);margin-top:1px">' +
            '<span style="color:var(--primary);font-weight:700">' + (a.time ? a.time.slice(0,5) : '') + '</span> ' + App.escapeHtml(shortName) + '</div>';
        }).join('');
        if (count > 3) previewHtml += '<div style="font-size:0.5rem;color:var(--text-muted);text-align:center">+' + (count - 3) + '</div>';
      }

      cellsHtml += `
        <div class="calendar-cell ${isToday ? 'today' : ''} ${isClosed ? 'closed' : ''}" data-date="${dateStr}" style="${isClosed ? 'background:var(--bg);opacity:0.6' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="cal-day-num">${d}</span>
            ${isClosed ? '<span style="font-size:0.6rem;color:var(--danger);font-weight:700">휴무</span>' : count > 0 ? `<span class="cal-count-btn ${colorClass}" style="font-size:0.6rem;min-width:16px;height:16px;line-height:16px;padding:0 3px">${count}</span>` : ''}
          </div>
          ${previewHtml}
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
    document.getElementById('btn-load-more-appts')?.addEventListener('click', () => {
      this._showAll = true;
      App.handleRoute();
    });

    document.getElementById('btn-add-appointment')?.addEventListener('click', () => this.showForm());

    // 캘린더 항상 표시 - 초기 렌더링 + 오늘 선택
    {
        this._calYear = new Date().getFullYear();
        this._calMonth = new Date().getMonth();
        this._closedDays = null;
        this.renderCalendar();
        // 오늘 날짜 자동 선택
        const todayStr = App.getToday();
        const dateInput = document.getElementById('filter-date');
        if (dateInput) { dateInput.value = todayStr; this.applyFilters(); }
        // 캘린더에서 오늘 셀 선택 표시
        setTimeout(() => {
          const todayCell = document.querySelector(`.calendar-cell[data-date="${todayStr}"]`);
          if (todayCell) todayCell.classList.add('selected');
        }, 100);
    }

    // Restore timetable view state
    if (sessionStorage.getItem('timetableOpen') === 'true') {
      const tt = document.getElementById('timetable-container');
      if (tt) {
        tt.style.display = 'block';
        this._ttDate = App.getToday();
        this.renderTimetable();
        this._updateListVisibility();
      }
    }

    // 타임테이블 토글
    this._ttDate = App.getToday();
    document.getElementById('btn-toggle-timetable')?.addEventListener('click', () => {
      const tt = document.getElementById('timetable-container');
      if (tt) {
        const isHidden = tt.style.display === 'none';
        tt.style.display = isHidden ? 'block' : 'none';
        sessionStorage.setItem('timetableOpen', isHidden ? 'true' : 'false');
        if (isHidden) {
          this._ttDate = App.getToday();
          this.renderTimetable();
        }
        this._updateListVisibility();
      }
    });
    document.getElementById('tt-prev')?.addEventListener('click', () => {
      const d = new Date(this._ttDate);
      d.setDate(d.getDate() - 1);
      this._ttDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      this.renderTimetable();
    });
    document.getElementById('tt-next')?.addEventListener('click', () => {
      const d = new Date(this._ttDate);
      d.setDate(d.getDate() + 1);
      this._ttDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      this.renderTimetable();
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

    // 예약 데이터 캐시 (캘린더용) - 현재 월 기준으로 로드
    const calStart = `${this._calYear}-${String(this._calMonth + 1).padStart(2, '0')}-01`;
    const calEnd = `${this._calYear}-${String(this._calMonth + 1).padStart(2, '0')}-31`;
    this._appointments = await DB.getByDateRange('appointments', 'date', calStart, calEnd);

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
          dateInput.value = App.formatLocalDate(d);
        } else if (filter === 'week') {
          dateInput.value = '';
          // Week filter handled in applyFilters
        }
        document.getElementById('filter-status').value = '';
        this.applyFilters(filter === 'week' ? 'week' : null);
      });
    });

    // Filters
    const _debouncedApptFilter = App.debounce(() => this.applyFilters(), 300);
    document.getElementById('appt-search')?.addEventListener('input', _debouncedApptFilter);
    document.getElementById('filter-status')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('filter-date')?.addEventListener('change', () => this.applyFilters());
    document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
      document.getElementById('appt-search').value = '';
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-date').value = '';
      document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.quick-filter-btn[data-filter="all"]')?.classList.add('active');
      sessionStorage.removeItem('appt-filter');
      this.applyFilters();
    });

    // Restore saved filter state
    const savedFilter = sessionStorage.getItem('appt-filter');
    if (savedFilter) {
      try {
        const f = JSON.parse(savedFilter);
        if (f.search) document.getElementById('appt-search').value = f.search;
        if (f.status) document.getElementById('filter-status').value = f.status;
        if (f.date) document.getElementById('filter-date').value = f.date;
        if (f.quickFilter && f.quickFilter !== 'all') {
          document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
          document.querySelector(`.quick-filter-btn[data-filter="${f.quickFilter}"]`)?.classList.add('active');
        }
        this.applyFilters(f.quickFilter === 'week' ? 'week' : null);
      } catch (e) { /* ignore parse errors */ }
    }

    // Status change
    document.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const id = Number(e.target.dataset.id);
        const newStatus = e.target.value;
        const appt = await DB.get('appointments', id);
        if (!appt) { App.showToast('예약을 찾을 수 없습니다.', 'error'); return; }
        if (newStatus === 'noshow') {
          const ok = await App.confirm('노쇼로 변경하시겠습니까?<br>고객 이력에 기록됩니다.');
          if (!ok) { e.target.value = appt.status; return; }
        }
        appt.status = newStatus;
        await DB.update('appointments', appt);
        // Update row data-status for filtering
        const row = e.target.closest('tr');
        if (row) row.dataset.status = newStatus;
        // Update corresponding mobile card data-status and badge
        const card = document.querySelector(`#appt-card-list .mobile-card[data-id="${id}"]`);
        if (card) {
          card.dataset.status = newStatus;
          const statusLabels = { pending: '대기', confirmed: '확정', in_progress: '미용중', completed: '완료', cancelled: '취소', noshow: '노쇼' };
          const statusClasses = { pending: 'badge-warning', confirmed: 'badge-info', in_progress: 'badge-info', completed: 'badge-success', cancelled: 'badge-secondary', noshow: 'badge-danger' };
          const badge = card.querySelector('.mobile-card-header .badge');
          if (badge) {
            badge.textContent = statusLabels[newStatus] || newStatus;
            badge.className = 'badge ' + (statusClasses[newStatus] || 'badge-secondary');
          }
        }
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

    // Reminder SMS
    document.querySelectorAll('.btn-reminder-appt').forEach(btn => {
      btn.addEventListener('click', () => this.sendReminder(Number(btn.dataset.id)));
    });
  },

  async sendReminder(id) {
    const appt = await DB.get('appointments', id);
    if (!appt) { App.showToast('예약을 찾을 수 없습니다.', 'error'); return; }
    const customer = await DB.get('customers', appt.customerId);
    const phone = (customer?.phone || '').replace(/\D/g, '');
    if (!phone) { App.showToast('고객 연락처가 없습니다.', 'error'); return; }
    const pet = await DB.get('pets', appt.petId);
    const msg = await App.buildSms('reminder', {
      '고객명': App.getCustomerLabel(customer),
      '반려견명': pet?.name || '',
      '날짜': appt.date || '',
      '시간': appt.time || '',
      '미용사': appt.groomer || ''
    });
    App.openSms(phone, msg);
  },

  async renderTimetable() {
    const grid = document.getElementById('timetable-grid');
    const dateLabel = document.getElementById('tt-date');
    if (!grid) return;
    if (dateLabel) dateLabel.textContent = this._ttDate;

    // 효율적 쿼리: 해당 날짜의 예약만 인덱스로 로드
    const dayApptsRaw = await DB.getByIndex('appointments', 'date', this._ttDate);

    const dayAppts = dayApptsRaw.filter(a => a.status !== 'cancelled');
    const [customers, pets] = await Promise.all([DB.getAll('customers'), DB.getAll('pets')]);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);

    // 미용사 목록 수집
    const groomers = await DB.getSetting('groomers') || [];
    const activeGroomers = groomers.length > 0 ? groomers : [...new Set(dayAppts.map(a => a.groomer || '미지정').filter(Boolean))];
    if (activeGroomers.length === 0) activeGroomers.push('미지정');

    // 시간 슬롯 (9:00 ~ 19:00, 30분 단위)
    const slots = [];
    for (let h = 9; h <= 19; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (h < 19) slots.push(`${String(h).padStart(2, '0')}:30`);
    }

    // 예약을 시간+미용사로 매핑 (duration-aware)
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    // Build a set of occupied cells: key = "slot_groomer" -> appointment (for spanning)
    const cellMap = {}; // key -> { appt, isStart }
    dayAppts.forEach(a => {
      const time = a.time || '';
      if (!time) return;
      const groomer = a.groomer || '미지정';
      const dur = a.duration || 60;
      const startMin = toMin(time);
      const slotCount = Math.ceil(dur / 30);
      for (let i = 0; i < slotCount; i++) {
        const slotMin = startMin + i * 30;
        const slotH = String(Math.floor(slotMin / 60)).padStart(2, '0');
        const slotM = String(slotMin % 60).padStart(2, '0');
        const slotKey = `${slotH}:${slotM}_${groomer}`;
        cellMap[slotKey] = { appt: a, isStart: i === 0, slotCount };
      }
    });

    const colCount = activeGroomers.length + 1;
    let html = `<div style="display:grid;grid-template-columns:60px repeat(${activeGroomers.length}, 1fr);min-width:${colCount * 100}px">`;
    // 헤더
    html += `<div style="padding:8px;font-weight:700;background:var(--bg);border-bottom:2px solid var(--border);text-align:center;font-size:0.8rem">시간</div>`;
    activeGroomers.forEach(g => {
      html += `<div style="padding:8px;font-weight:700;background:var(--bg);border-bottom:2px solid var(--border);text-align:center;font-size:0.85rem">${App.escapeHtml(g)}</div>`;
    });

    // 시간 슬롯
    slots.forEach(slot => {
      html += `<div style="padding:6px 4px;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--border);text-align:center;background:var(--bg)">${slot}</div>`;
      activeGroomers.forEach(g => {
        const key = `${slot}_${g}`;
        const cell = cellMap[key];
        if (cell && cell.isStart) {
          const a = cell.appt;
          const customer = customerMap[a.customerId];
          const pet = petMap[a.petId];
          const statusColors = { pending: 'var(--warning)', confirmed: 'var(--primary)', in_progress: 'var(--info)', completed: 'var(--success)', noshow: 'var(--danger)' };
          const durLabel = (a.duration || 60) >= 60 ? Math.floor((a.duration || 60) / 60) + '시간' + ((a.duration || 60) % 60 ? ' ' + (a.duration || 60) % 60 + '분' : '') : (a.duration || 60) + '분';
          html += `<div style="padding:4px 6px;border-bottom:1px solid var(--border);background:${statusColors[a.status] || 'var(--primary)'}15;border-left:3px solid ${statusColors[a.status] || 'var(--primary)'}">
            <div style="font-size:0.78rem;font-weight:700">${App.escapeHtml(pet?.name || '-')}</div>
            <div style="font-size:0.7rem;color:var(--text-secondary)">${App.escapeHtml(App.getCustomerLabel(customer))}</div>
            <div style="font-size:0.65rem;color:var(--text-muted)">${durLabel}</div>
          </div>`;
        } else if (cell && !cell.isStart) {
          const a = cell.appt;
          const statusColors = { pending: 'var(--warning)', confirmed: 'var(--primary)', in_progress: 'var(--info)', completed: 'var(--success)', noshow: 'var(--danger)' };
          html += `<div style="padding:0;border-bottom:1px solid var(--border);background:${statusColors[a.status] || 'var(--primary)'}15;border-left:3px solid ${statusColors[a.status] || 'var(--primary)'}"></div>`;
        } else {
          html += `<div style="padding:4px;border-bottom:1px solid var(--border)"></div>`;
        }
      });
    });

    html += '</div>';
    grid.innerHTML = html;
  },

  _updateListVisibility() {
    const calEl = document.getElementById('calendar-container');
    const ttEl = document.getElementById('timetable-container');
    const calOpen = calEl ? calEl.style.display !== 'none' : false;
    const ttOpen = ttEl ? ttEl.style.display !== 'none' : false;
    const hide = calOpen || ttOpen;
    const filterBar = document.getElementById('appt-filter-bar');
    if (filterBar) filterBar.style.display = hide ? 'none' : '';
  },

  applyFilters(special) {
    const search = (document.getElementById('appt-search')?.value || '').toLowerCase();
    const status = document.getElementById('filter-status')?.value || '';
    const date = document.getElementById('filter-date')?.value || '';
    const today = App.getToday();

    // Save filter state to sessionStorage
    sessionStorage.setItem('appt-filter', JSON.stringify({
      search: document.getElementById('appt-search')?.value || '',
      status,
      date,
      quickFilter: document.querySelector('.quick-filter-btn.active')?.dataset.filter || 'all'
    }));
    const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return App.formatLocalDate(d); })();

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

    // Also filter mobile cards
    document.querySelectorAll('#appt-card-list .mobile-card').forEach(card => {
      if (!card.dataset.id) return;
      const matchSearch = !search || (card.dataset.search || '').toLowerCase().includes(search);
      const matchStatus = !status || card.dataset.status === status;
      let matchDate = true;
      if (special === 'week') {
        matchDate = card.dataset.date >= today && card.dataset.date <= weekEnd;
      } else if (date) {
        matchDate = card.dataset.date === date;
      }
      card.style.display = (matchSearch && matchStatus && matchDate) ? '' : 'none';
    });
  },

  async showForm(id, preCustomerId, prefill) {
    // 새 예약 시 다음 정시를 기본 시간으로
    let defaultTime = '';
    if (!id) {
      const h = new Date().getHours();
      const nextH = h < 9 ? 10 : h >= 18 ? 10 : h + 1;
      defaultTime = String(nextH).padStart(2, '0') + ':00';
    }
    let appt = id ? await DB.get('appointments', id) : { date: App.getToday(), time: defaultTime, status: 'pending', customerId: preCustomerId || null, petId: (prefill && prefill.petId) || null };
    if (id && !appt) { App.showToast('예약을 찾을 수 없습니다.', 'error'); App.closeModal(); return; }
    // Apply prefill data from records page (F8)
    if (prefill && !id) {
      if (prefill.date) appt.date = prefill.date;
      if (prefill.groomer) appt.groomer = prefill.groomer;
      if (prefill.serviceIds) appt.serviceIds = prefill.serviceIds;
      if (prefill.petId) appt.petId = prefill.petId;
    }
    const petOptions = await App.getPetOptions(appt.customerId, appt.petId);
    const serviceCheckboxes = await App.getServiceCheckboxes(appt.serviceIds || []);

    // ========== Form HTML ==========
    App.showModal({
      title: id ? '예약 수정' : '새 예약',
      size: 'lg',
      content: `
        <!-- 필수 입력 영역 -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">고객 <span class="required">*</span></label>
            <div id="appt-customer-select"></div>
            <div id="noshow-warning"></div>
          </div>
          <div class="form-group">
            <label class="form-label">반려견 <span class="required">*</span></label>
            <select id="f-petId">
              <option value="">반려견 선택</option>
              ${petOptions}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">날짜 <span class="required">*</span></label>
            <input type="date" id="f-date" value="${appt.date || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">시간</label>
            <input type="time" id="f-time" value="${appt.time || ''}">
          </div>
        </div>
        <div id="time-conflict-warning" style="display:none;background:var(--warning-light);border:1px solid var(--warning);border-radius:var(--radius);padding:8px 12px;font-size:0.82rem;color:#92400E;font-weight:600;margin-bottom:8px"></div>
        <!-- 선택사항 -->
        <div style="margin:12px 0 8px;padding-top:10px;border-top:1px dashed var(--border);font-size:0.82rem;color:var(--text-muted)">선택사항</div>
        <div class="form-group">
          <div id="f-services">
            ${serviceCheckboxes}
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
              <select id="f-groomer">${await App.getGroomerOptions(appt.groomer)}</select>
            </div>
            <div class="form-group">
              <label class="form-label">예상 소요시간</label>
              <select id="f-duration">
                <option value="30" ${appt.duration == 30 ? 'selected' : ''}>30분</option>
                <option value="60" ${!appt.duration || appt.duration == 60 ? 'selected' : ''}>1시간</option>
                <option value="90" ${appt.duration == 90 ? 'selected' : ''}>1시간 30분</option>
                <option value="120" ${appt.duration == 120 ? 'selected' : ''}>2시간</option>
                <option value="150" ${appt.duration == 150 ? 'selected' : ''}>2시간 30분</option>
                <option value="180" ${appt.duration == 180 ? 'selected' : ''}>3시간</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">메모</label>
            <textarea id="f-memo" placeholder="예약 관련 메모">${App.escapeHtml(appt.memo || '')}</textarea>
          </div>
          ${!id ? `<div class="form-group">
            <label class="form-label">반복 예약</label>
            <div class="form-row">
              <select id="f-repeat-cycle" class="flex-1">
                <option value="0">반복 없음</option>
                <option value="7">매주</option>
                <option value="14">2주마다</option>
                <option value="28">4주마다</option>
              </select>
              <select id="f-repeat-count" style="flex:1;display:none">
                <option value="2">2회</option>
                <option value="3">3회</option>
                <option value="4" selected>4회</option>
                <option value="6">6회</option>
                <option value="8">8회</option>
                <option value="12">12회</option>
              </select>
            </div>
            <div class="form-hint" id="repeat-hint" style="display:none"></div>
          </div>` : ''}
        </div>
      `,
      onSave: () => this.saveAppointment(id)
    });

    // ========== Event Handlers ==========
    // 서비스 칩 토글 (checked 클래스)
    document.querySelectorAll('.service-chip input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const chip = cb.closest('.service-chip');
        if (chip) chip.classList.toggle('checked', cb.checked);
      });
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
    });

    // 시간 겹침 실시간 경고
    const checkTimeConflict = async () => {
      const date = document.getElementById('f-date')?.value;
      const time = document.getElementById('f-time')?.value;
      const groomer = document.getElementById('f-groomer')?.value?.trim();
      const duration = Number(document.getElementById('f-duration')?.value) || 60;
      const warningEl = document.getElementById('time-conflict-warning');
      if (!warningEl) return;
      if (!date || !time) { warningEl.style.display = 'none'; return; }
      const dayAppts = await DB.getByIndex('appointments', 'date', date);
      const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const newStart = toMin(time);
      const newEnd = newStart + duration;
      const conflicts = dayAppts.filter(a => {
        if (a.id === id || !a.time || a.status === 'cancelled') return false;
        const aStart = toMin(a.time);
        const aEnd = aStart + (a.duration || 60);
        return newStart < aEnd && newEnd > aStart;
      });
      if (conflicts.length > 0) {
        const names = conflicts.map(a => (a.time || '') + ' ' + (this._customerMap?.[a.customerId]?.name || '예약')).join(', ');
        warningEl.innerHTML = '&#x26A0; 같은 시간대 예약: ' + App.escapeHtml(names);
        warningEl.style.display = 'block';
      } else {
        warningEl.style.display = 'none';
      }
    };
    document.getElementById('f-date')?.addEventListener('change', checkTimeConflict);
    document.getElementById('f-time')?.addEventListener('change', checkTimeConflict);
    document.getElementById('f-duration')?.addEventListener('change', checkTimeConflict);
    document.getElementById('f-groomer')?.addEventListener('change', checkTimeConflict);

    // 반복 예약 UI 토글
    const repeatCycle = document.getElementById('f-repeat-cycle');
    const repeatCount = document.getElementById('f-repeat-count');
    const repeatHint = document.getElementById('repeat-hint');
    if (repeatCycle) {
      const updateRepeatHint = () => {
        const cycle = Number(repeatCycle.value);
        if (cycle === 0) {
          repeatCount.style.display = 'none';
          repeatHint.style.display = 'none';
        } else {
          repeatCount.style.display = '';
          repeatHint.style.display = '';
          const cnt = Number(repeatCount.value);
          const labels = { 7: '매주', 14: '2주마다', 28: '4주마다' };
          repeatHint.textContent = `${labels[cycle]} ${cnt}회 예약이 생성됩니다 (총 ${cnt}건)`;
        }
      };
      repeatCycle.addEventListener('change', updateRepeatHint);
      repeatCount.addEventListener('change', updateRepeatHint);
    }

    // 검색 가능한 고객 선택 렌더링
    await App.renderCustomerSelect('appt-customer-select', appt.customerId, async (cid) => {
      const petSelect = document.getElementById('f-petId');
      petSelect.innerHTML = '<option value="">반려견 선택</option>' + await App.getPetOptions(cid);
      // 반려견 1마리 자동 선택
      if (cid) {
        const cPets = await DB.getByIndex('pets', 'customerId', Number(cid));
        if (cPets.length === 1) {
          petSelect.value = cPets[0].id;
        }
      }
      // 노쇼 이력 경고
      const warn = document.getElementById('noshow-warning');
      if (warn) {
        warn.innerHTML = '';
        if (cid) {
          const custAppts = await DB.getByIndex('appointments', 'customerId', Number(cid));
          const noshowCount = custAppts.filter(a => a.status === 'noshow').length;
          if (noshowCount > 0) {
            warn.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;margin-top:4px;font-weight:600">&#x26A0; 이 고객은 노쇼 ${noshowCount}회 이력이 있습니다</div>`;
          }
        }
      }
    });

    // 휴무일 경고
    const checkClosedDay = async () => {
      const dateVal = document.getElementById('f-date').value;
      if (!dateVal) return;
      const cd = await DB.getSetting('closedDays') || [];
      const dow = new Date(dateVal + 'T00:00:00').getDay();
      const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
      let existingWarn = document.getElementById('closed-day-warning');
      if (!existingWarn) {
        existingWarn = document.createElement('div');
        existingWarn.id = 'closed-day-warning';
        document.getElementById('f-date')?.parentElement?.appendChild(existingWarn);
      }
      if (cd.includes(dow)) {
        existingWarn.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;margin-top:4px;font-weight:600">&#x26A0; ${dayNames[dow]}요일은 휴무일입니다</div>`;
      } else {
        existingWarn.innerHTML = '';
      }
    };
    document.getElementById('f-date')?.addEventListener('change', checkClosedDay);
    checkClosedDay();

    // 기존 고객 선택 시 노쇼 이력 즉시 표시
    if (appt.customerId) {
      const custAppts2 = await DB.getByIndex('appointments', 'customerId', Number(appt.customerId));
      const noshowCount = custAppts2.filter(a => a.status === 'noshow').length;
      if (noshowCount > 0) {
        const warn = document.getElementById('noshow-warning');
        if (warn) warn.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;margin-top:4px;font-weight:600">&#x26A0; 이 고객은 노쇼 ${noshowCount}회 이력이 있습니다</div>`;
      }
    }
  },

  // ========== Validation & Save ==========
  async saveAppointment(id) {
    const customerId = Number(document.getElementById('appt-customer-select-value')?.value || document.getElementById('f-customerId')?.value);
    const petId = Number(document.getElementById('f-petId').value);
    const date = document.getElementById('f-date').value;
    const time = document.getElementById('f-time').value;
    const duration = Number(document.getElementById('f-duration')?.value) || 60;
    const groomer = document.getElementById('f-groomer').value.trim();
    const memo = document.getElementById('f-memo').value.trim();

    const serviceIds = [];
    document.querySelectorAll('input[name="serviceIds"]:checked').forEach(cb => {
      serviceIds.push(Number(cb.value));
    });

    if (!customerId) { App.showToast('고객을 선택해주세요.', 'error'); App.highlightField('appt-customer-select-input'); return; }
    if (!petId) { App.showToast('반려견을 선택해주세요.', 'error'); App.highlightField('f-petId'); return; }
    if (!date) { App.showToast('날짜를 입력해주세요.', 'error'); App.highlightField('f-date'); return; }

    // Check time conflict (duration-aware)
    if (time) {
      const dayAppts = await DB.getByIndex('appointments', 'date', date);
      const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const newStart = toMin(time);
      const newEnd = newStart + duration;
      const conflict = dayAppts.find(a => {
        if (a.id === id || !a.time || a.status === 'cancelled') return false;
        const isSameResource = (groomer && a.groomer && a.groomer === groomer) || a.petId === petId;
        if (!isSameResource) return false;
        const aStart = toMin(a.time);
        const aEnd = aStart + (a.duration || 60);
        return newStart < aEnd && newEnd > aStart;
      });
      if (conflict) {
        const conflictPet = await DB.get('pets', conflict.petId);
        App.showToast(`시간이 겹치는 예약이 있습니다 (${conflictPet?.name || '알 수 없음'}, ${conflict.time})`, 'error');
        return;
      }
    }

    try {
      let status = 'pending';
      if (id) {
        const existCheck = await DB.get('appointments', id);
        if (!existCheck) { App.showToast('예약을 찾을 수 없습니다.', 'error'); return; }
        status = existCheck.status || 'pending';
      }
      const data = { customerId, petId, date, time, duration, groomer, status, serviceIds, memo };

      if (id) {
        const existing = await DB.get('appointments', id);
        if (!existing) { App.showToast('예약을 찾을 수 없습니다.', 'error'); return; }
        Object.assign(existing, data);
        await DB.update('appointments', existing);
        App.showToast('예약이 수정되었습니다.');
      } else {
        const newId = await DB.add('appointments', data);

        // 반복 예약 생성
        const repeatCycleEl = document.getElementById('f-repeat-cycle');
        const repeatCountEl = document.getElementById('f-repeat-count');
        const cycle = Number(repeatCycleEl?.value) || 0;
        const count = Number(repeatCountEl?.value) || 0;
        if (cycle > 0 && count > 1) {
          let created = 1;
          let skipped = 0;
          const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
          for (let i = 1; i < count; i++) {
            const baseDate = new Date(date + 'T00:00:00');
            baseDate.setDate(baseDate.getDate() + cycle * i);
            const nextDate = App.formatLocalDate(baseDate);
            // 시간 충돌 검사
            if (time) {
              const dayAppts = await DB.getByIndex('appointments', 'date', nextDate);
              const newStart = toMin(time);
              const newEnd = newStart + duration;
              const conflict = dayAppts.find(a => {
                if (!a.time || a.status === 'cancelled') return false;
                const isSameResource = (groomer && a.groomer && a.groomer === groomer) || a.petId === petId;
                if (!isSameResource) return false;
                const aStart = toMin(a.time);
                const aEnd = aStart + (a.duration || 60);
                return newStart < aEnd && newEnd > aStart;
              });
              if (conflict) { skipped++; continue; }
            }
            const repeatData = { ...data, date: nextDate };
            await DB.add('appointments', repeatData);
            created++;
          }
          App.showToast(`반복 예약 ${created}건 등록${skipped > 0 ? ` (시간 충돌 ${skipped}건 제외)` : ''}`);
        } else {
          // 전화번호 있으면 SMS 링크 포함 토스트, 없으면 일반 토스트
          const customer = await DB.get('customers', customerId);
          const phone = (customer?.phone || '').replace(/\D/g, '');
          if (phone) {
            const pet = await DB.get('pets', petId);
            const msg = await App.buildSms('appointment', {
              '고객명': App.getCustomerLabel(customer),
              '반려견명': pet?.name || '',
              '날짜': date,
              '시간': time || '',
              '미용사': groomer || ''
            });
            App.showToast(`예약 완료 <a href="${App.getSmsUrl(phone, msg)}" style="color:#fff;text-decoration:underline;margin-left:6px" onclick="event.stopPropagation()">문자 보내기</a>`, 'info', { html: true });
          } else {
            App.showToast('새 예약이 등록되었습니다.');
          }
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
      // Don't change status here; pass appointmentId so records.saveRecord() can update it after saving
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
