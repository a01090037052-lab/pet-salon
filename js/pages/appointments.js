// ========== Appointments Page ==========
App.pages.appointments = {
  async render(container) {
    // 휴무일 설정은 매 진입 시 재로드 (stale 방지)
    this._closedDays = null;
    const today = App.getToday();
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    // 최근 3개월 + 미래 예약만 로드 (성능 최적화)
    const threeMonthsAgo = (() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return App.formatLocalDate(d); })();
    const appointments = await DB.getByDateRange('appointments', 'date', threeMonthsAgo, '9999-12-31');

    // 다가오는 예약(오늘 포함) 날짜 오름차순 먼저, 지난 예약은 최근순으로 뒤에
    const sorted = appointments.sort((a, b) => {
      const aUp = (a.date || '') >= today;
      const bUp = (b.date || '') >= today;
      if (aUp !== bUp) return aUp ? -1 : 1;
      const dateComp = aUp ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || '');
      if (dateComp !== 0) return dateComp;
      return (a.time || '').localeCompare(b.time || '');
    });

    const statusCounts = { all: appointments.length, pending: 0, confirmed: 0, in_progress: 0, completed: 0, cancelled: 0, noshow: 0 };
    appointments.forEach(a => { if (statusCounts[a.status] !== undefined) statusCounts[a.status]++; });

    const [customers, pets, services, recentRecords] = await Promise.all([
      DB.getAll('customers'), DB.getAll('pets'), DB.getAll('services'),
      DB.getByDateRange('records', 'date', threeMonthsAgo, '9999-12-31')
    ]);
    // 미용 기록이 연결된 예약 id (완료됐지만 기록 없는 예약에 "기록 작성" 버튼 노출용)
    const recordedApptIds = new Set(recentRecords.filter(r => r.appointmentId).map(r => String(r.appointmentId)));
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s.name);
    this._customerMap = customerMap;
    this._petMap = petMap;
    this._serviceMap = serviceMap;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">예약 관리</h1>
          <p class="page-subtitle">총 ${appointments.length}건</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-toggle-timetable">${App.icon('clock')} 타임테이블</button>
          <button class="btn btn-primary" id="btn-add-appointment">+ 새 예약</button>
        </div>
      </div>

      <!-- 월별 캘린더 뷰 -->
      <div id="calendar-container" class="calendar-container">
        <div class="calendar-header">
          <button class="btn btn-sm btn-secondary" id="cal-prev" aria-label="이전 달">${App.icon('chevron-left')}</button>
          <span class="calendar-title" id="cal-title"></span>
          <button class="btn btn-sm btn-secondary" id="cal-next" aria-label="다음 달">${App.icon('chevron-right')}</button>
          <button class="cal-today-btn" id="cal-today-btn">오늘</button>
        </div>
        <div class="calendar-grid" id="cal-grid">
          <div class="calendar-day-label">월</div>
          <div class="calendar-day-label">화</div>
          <div class="calendar-day-label">수</div>
          <div class="calendar-day-label">목</div>
          <div class="calendar-day-label">금</div>
          <div class="calendar-day-label cal-sat">토</div>
          <div class="calendar-day-label cal-sun">일</div>
        </div>
      </div>

      <!-- 날짜 선택 요약 패널 (셀 클릭 시 표시) -->
      <div id="cal-date-summary" style="display:none;margin-bottom:16px;padding:14px 16px;background:var(--bg-white);border-radius:var(--radius);box-shadow:var(--shadow-xs);border:1px solid var(--border-light)">
        <div id="cal-date-summary-header" style="font-weight:700;font-size:0.95rem;margin-bottom:10px"></div>
        <div id="cal-date-summary-list" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>
        <button class="btn btn-primary" id="cal-date-add-appt" style="width:100%;min-height:44px">+ 이 날짜에 예약 추가</button>
      </div>

      <!-- 타임테이블 뷰 -->
      <div id="timetable-container" style="display:none;margin-bottom:20px">
        <div class="card">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:10px">
              <button class="btn btn-sm btn-secondary" id="tt-prev" aria-label="이전 날">${App.icon('chevron-left')}</button>
              <strong id="tt-date">${today}</strong>
              <button class="btn btn-sm btn-secondary" id="tt-next" aria-label="다음 날">${App.icon('chevron-right')}</button>
            </div>
            <span class="card-title" style="margin-left:auto">${App.icon('clock')} 미용사별 타임테이블</span>
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
          <span class="search-icon">${App.icon('search')}</span>
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
          ${isMobile ? '' : `<div class="table-container">
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
                      <div class="empty-state-icon">${App.icon('calendar', 'ico-xl')}</div>
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
                        data-search="${App.escapeHtml(((customer?.name || '') + ' ' + (customer?.phone || '') + ' ' + (pet?.name || '') + ' ' + (a.memo || '') + ' ' + (a.groomer || '')).toLowerCase())}"
                        style="${isToday ? 'background:var(--info-bg-soft)' : ''}">
                      <td>
                        <strong>${App.formatDate(a.date)}</strong>
                        ${isToday ? '<span class="badge badge-info" style="margin-left:4px">오늘</span>' : ''}
                        ${isPast && a.status !== 'completed' && a.status !== 'cancelled' ? '<span class="badge badge-danger" style="margin-left:4px">지남</span>' : ''}
                      </td>
                      <td>${a.time || '-'}${a.duration && a.duration !== 60 ? `<div style="font-size:0.7rem;color:var(--text-muted)">${a.duration}분</div>` : ''}</td>
                      <td><a href="#pets/${a.petId}" style="color:var(--primary);font-weight:700" onclick="event.stopPropagation()">${App.escapeHtml(pet?.name || '-')}</a> <span style="color:var(--text-muted);font-size:0.75rem">${App.escapeHtml(App.getCustomerLabel(customer))}</span>${customer?.phone ? ` <a href="sms:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" onclick="event.stopPropagation()" title="문자 보내기" aria-label="문자 보내기" style="color:var(--text-muted);font-size:0.8rem">${App.icon('message')}</a>` : ''}</td>
                      <td class="hide-mobile"><span style="font-size:0.85rem">${App.escapeHtml(serviceNames)}</span></td>
                      <td class="hide-mobile">${App.escapeHtml(a.groomer || '-')}</td>
                      <td class="hide-mobile" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(a.memo || '')}">${App.escapeHtml(a.memo || '-')}</td>
                      <td>
                        <select class="status-select" data-id="${a.id}" style="padding:4px 8px;font-size:max(16px,0.8rem);width:auto;min-width:70px">
                          <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>대기</option>
                          <option value="confirmed" ${a.status === 'confirmed' ? 'selected' : ''}>확정</option>
                          <option value="in_progress" ${a.status === 'in_progress' ? 'selected' : ''}>미용중</option>
                          <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>완료</option>
                          <option value="cancelled" ${a.status === 'cancelled' ? 'selected' : ''}>취소</option>
                          <option value="noshow" ${a.status === 'noshow' ? 'selected' : ''}>노쇼</option>
                        </select>
                      </td>
                      <td class="table-actions">
                        <button class="btn-icon btn-reminder-appt" data-id="${a.id}" title="재확인 문자" aria-label="재확인 문자" style="color:var(--info)">${App.icon('send')}</button>
                        <button class="btn-icon btn-edit-appt" data-id="${a.id}" title="수정" aria-label="수정">${App.icon('edit')}</button>
                        <button class="btn-icon btn-complete-appt" data-id="${a.id}" title="미용 기록 작성" aria-label="미용 기록 작성" style="color:var(--success)">${App.icon('check')}</button>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`}

          <!-- Mobile Card List (모바일 뷰포트에서만 렌더, DOM 절약) -->
          ${!isMobile ? '' : `<div class="mobile-card-list" id="appt-card-list" style="display:block">
            ${sorted.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">${App.icon('calendar', 'ico-xl')}</div>
                <div class="empty-state-text">등록된 예약이 없습니다</div>
                <button class="btn btn-primary" onclick="App.pages.appointments.showForm()">+ 첫 예약 등록하기</button>
              </div>
            ` : sorted.map(a => {
              const customer = customerMap[a.customerId];
              const pet = petMap[a.petId];
              const isToday = a.date === today;
              const isPast = a.date < today;
              const serviceNames = (a.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ');
              const phoneDigits = (customer?.phone || '').replace(/\D/g, '');
              return `
              <div class="mobile-card" data-id="${a.id}" data-status="${a.status || 'pending'}" data-date="${a.date}"
                   data-search="${App.escapeHtml(((customer?.name || '') + ' ' + (customer?.phone || '') + ' ' + (pet?.name || '') + ' ' + (a.memo || '') + ' ' + (a.groomer || '')).toLowerCase())}"
                   style="${isToday ? 'border-left:4px solid var(--primary);' : ''}${isPast && a.status !== 'completed' && a.status !== 'cancelled' ? 'border-left:4px solid var(--danger);' : ''}${a.status === 'noshow' ? 'border-left:4px solid var(--danger);' : ''}">
                <div class="mobile-card-header">
                  <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;min-width:0;flex:1">
                    <strong style="font-size:1.1rem">${App.escapeHtml(a.time || '--:--')}</strong>
                    <strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${App.escapeHtml(pet?.name || '-')}</strong>
                    <span class="appt-card-date" style="font-size:0.8rem;color:var(--text-muted)">${App.formatDate(a.date)}${isToday ? ' <span class="badge badge-info">오늘</span>' : ''}</span>
                    ${a.duration && a.duration !== 60 ? `<span style="font-size:0.75rem;color:var(--text-muted)">${a.duration}분</span>` : ''}
                    ${isPast && a.status !== 'completed' && a.status !== 'cancelled' ? '<span class="badge badge-danger">지남</span>' : ''}
                  </div>
                </div>
                <div class="mobile-card-body">
                  <div style="font-size:0.85rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${[App.getCustomerLabel(customer), serviceNames, a.groomer || ''].filter(Boolean).map(t => App.escapeHtml(t)).join(' &middot; ')}</div>
                  ${a.status === 'cancelled' && a.cancelReason ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">취소 사유: ${App.escapeHtml(a.cancelReason)}</div>` : ''}
                  ${a.memo ? `<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px">${App.icon('note')} ${App.escapeHtml(a.memo.length > 40 ? a.memo.slice(0, 40) + '...' : a.memo)}</div>` : ''}
                </div>
                <div class="mobile-card-actions" style="flex-direction:column;gap:8px">
                  <div style="display:flex;gap:6px;align-items:center">
                    <!-- 상태는 이 선택 상자 하나로 보여주고 바꾼다 (예전엔 위 배지와 두 번 표시) -->
                    <select class="status-select appt-status-sel" data-id="${a.id}" data-st="${a.status || 'pending'}" aria-label="예약 상태" style="flex:1;padding:8px 10px;font-size:max(16px,0.85rem);min-height:44px">
                      <option value="pending" ${a.status === 'pending' ? 'selected' : ''}>대기</option>
                      <option value="confirmed" ${a.status === 'confirmed' ? 'selected' : ''}>확정</option>
                      <option value="in_progress" ${a.status === 'in_progress' ? 'selected' : ''}>미용중</option>
                      <option value="completed" ${a.status === 'completed' ? 'selected' : ''}>완료</option>
                      <option value="cancelled" ${a.status === 'cancelled' ? 'selected' : ''}>취소</option>
                      <option value="noshow" ${a.status === 'noshow' ? 'selected' : ''}>노쇼</option>
                    </select>
                    ${a.status !== 'completed'
                      ? `<button class="btn btn-sm btn-success btn-complete-appt" data-id="${a.id}" style="white-space:nowrap;min-height:44px">${App.icon('scissors')} 미용 완료</button>`
                      : !recordedApptIds.has(String(a.id))
                        ? `<button class="btn btn-sm btn-success btn-complete-appt" data-id="${a.id}" style="white-space:nowrap;min-height:44px">${App.icon('note')} 기록 작성</button>`
                        : ''}
                  </div>
                  <div style="display:flex;gap:6px">
                    ${phoneDigits ? `<a class="btn btn-sm btn-secondary" href="tel:${phoneDigits}" style="flex:0 0 auto;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center" title="전화 걸기" aria-label="전화 걸기">${App.icon('phone')}</a>` : ''}
                    <button class="btn btn-sm btn-info btn-reminder-appt flex-1" data-id="${a.id}" style="min-height:44px">${App.icon('send')} 재확인 문자</button>
                    <button class="btn btn-sm btn-secondary btn-edit-appt flex-1" data-id="${a.id}" style="min-height:44px">${App.icon('edit')} 수정</button>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>`}

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

    // 오늘 버튼: 현재 달이면 숨김
    const todayBtn = document.getElementById('cal-today-btn');
    const todayDate = new Date();
    if (todayBtn) {
      todayBtn.style.display = (year === todayDate.getFullYear() && month === todayDate.getMonth()) ? 'none' : '';
    }

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
    const petMap = this._petMap || {};

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const statusMap = { pending: 'pending', confirmed: 'confirmed', in_progress: 'in_progress', completed: 'completed' };
    const maxBars = 3;

    let cellsHtml = '';
    // 빈 칸 (이전 달)
    for (let i = 0; i < offset; i++) {
      cellsHtml += '<div class="calendar-cell empty"></div>';
    }
    // 날짜 셀
    const closedDays = (this._closedDays || []).map(Number);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const count = dateCounts[dateStr] || 0;
      const isToday = dateStr === today;
      const cellDate = new Date(year, month, d);
      const dow = cellDate.getDay();
      const isClosed = closedDays.includes(dow);
      const heatClass = count === 0 ? '' : count <= 1 ? 'cal-heat-1' : count <= 2 ? 'cal-heat-2' : 'cal-heat-3';
      const weekendClass = dow === 6 ? 'cal-sat' : dow === 0 ? 'cal-sun' : '';

      // 예약 바 생성 (전체 너비 사용 — 이름 잘림 방지)
      let barsHtml = '';
      // 휴무일이라도 잡힌 예약은 보여준다 (휴무 표시·배경은 그대로)
      if (count > 0) {
        const appts = dateAppts[dateStr] || [];
        const show = appts.slice(0, maxBars);
        barsHtml = show.map(a => {
          const pet = petMap[a.petId];
          const pName = pet?.name || '?';
          const barClass = 'cal-bar-' + (statusMap[a.status] || 'default');
          const timeStr = !isMobile && a.time ? a.time.slice(0,5) + ' ' : '';
          return `<div class="cal-bar ${barClass}">${timeStr}${App.escapeHtml(pName)}</div>`;
        }).join('');
        if (count > maxBars) barsHtml += `<div class="cal-overflow">+${count - maxBars}</div>`;
      }

      cellsHtml += `
        <div class="calendar-cell ${isToday ? 'today' : ''} ${isClosed ? 'closed' : ''} ${heatClass}" data-date="${dateStr}">
          <div class="cal-cell-header">
            <span class="cal-day-num ${weekendClass}">${d}</span>
            ${isClosed ? '<span style="font-size:0.65rem;color:var(--danger);font-weight:700">휴무</span>' : ''}
          </div>
          ${barsHtml}
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
          // 요약 패널 업데이트
          this._updateDateSummary(date);
        });
      });
    }
  },

  async _updateDateSummary(date) {
    const panel = document.getElementById('cal-date-summary');
    if (!panel) return;
    const header = document.getElementById('cal-date-summary-header');
    const list = document.getElementById('cal-date-summary-list');
    if (!date) { panel.style.display = 'none'; return; }

    const d = new Date(date + 'T00:00:00');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dayLabel = `${d.getMonth() + 1}월 ${d.getDate()}일 (${dayNames[d.getDay()]})`;
    const isClosed = (this._closedDays || []).map(Number).includes(d.getDay());

    // 현재 캘린더 월과 다른 달이면 DB에서 직접 조회 (월말→내일 등)
    const calMonth = `${this._calYear}-${String(this._calMonth + 1).padStart(2, '0')}`;
    let dayAppts;
    if (date.startsWith(calMonth)) {
      dayAppts = (this._appointments || []).filter(a => a.date === date && a.status !== 'cancelled');
    } else {
      dayAppts = (await DB.getByIndex('appointments', 'date', date)).filter(a => a.status !== 'cancelled');
    }
    dayAppts.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    header.innerHTML = `${App.icon('calendar')} ${dayLabel} · ${dayAppts.length}건${isClosed ? ' <span style="color:var(--danger);font-size:0.82rem">휴무</span>' : ''}`;

    if (dayAppts.length === 0) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:0.88rem;padding:8px 0">예약 없음</div>';
    } else {
      const petMap = this._petMap || {};
      const serviceMap = this._serviceMap || {};
      const show = dayAppts.slice(0, 5);
      list.innerHTML = show.map(a => {
        const pet = petMap[a.petId];
        const svcName = (a.serviceIds || []).map(id => serviceMap[id]).filter(Boolean).join(', ') || '';
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light);font-size:0.88rem">
          <strong style="color:var(--primary);min-width:42px">${a.time || '--:--'}</strong>
          <span style="font-weight:600">${App.escapeHtml(pet?.name || '?')}</span>
          ${svcName ? `<span style="color:var(--text-muted);font-size:0.82rem">${App.escapeHtml(svcName)}</span>` : ''}
        </div>`;
      }).join('') + (dayAppts.length > 5 ? `<div style="font-size:0.82rem;color:var(--text-muted);padding:4px 0">+${dayAppts.length - 5}건 더</div>` : '');
    }

    this._selectedCalDate = date;
    panel.style.display = 'block';
  },

  _hideDateSummary() {
    const panel = document.getElementById('cal-date-summary');
    if (panel) panel.style.display = 'none';
    this._selectedCalDate = null;
  },

  async init() {
    document.getElementById('btn-add-appointment')?.addEventListener('click', () => this.showForm());

    // 저장된 검색어·상태 필터 복원 — 첫 applyFilters가 sessionStorage를 덮어쓰기 전에 읽어야 함
    try {
      const f = JSON.parse(sessionStorage.getItem('appt-filter') || 'null');
      if (f) {
        const searchEl = document.getElementById('appt-search');
        const statusEl = document.getElementById('filter-status');
        if (searchEl && f.search) searchEl.value = f.search;
        if (statusEl && f.status) statusEl.value = f.status;
      }
    } catch (e) { /* ignore parse errors */ }

    // 캘린더 항상 표시 - 초기 렌더링 + 오늘 선택
    {
        this._calYear = new Date().getFullYear();
        this._calMonth = new Date().getMonth();
        this._closedDays = null;
        await this.renderCalendar();
        // 이전 선택 날짜 복원 또는 오늘 자동 선택
        const restoreDate = this._selectedCalDate || App.getToday();
        const dateInput = document.getElementById('filter-date');
        if (dateInput) { dateInput.value = restoreDate; this.applyFilters(); }
        document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
        if (!this._selectedCalDate || restoreDate === App.getToday()) {
          document.querySelector('.quick-filter-btn[data-filter="today"]')?.classList.add('active');
        }
        // 캘린더에서 셀 선택 표시 + 요약 패널
        const restoreCell = document.querySelector(`.calendar-cell[data-date="${restoreDate}"]`);
        if (restoreCell) restoreCell.classList.add('selected');
        await this._updateDateSummary(restoreDate);
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

    // 캘린더 이전/다음 버튼 (월 전환 시 요약 패널 숨김)
    document.getElementById('cal-prev')?.addEventListener('click', () => {
      this._calMonth--;
      if (this._calMonth < 0) { this._calMonth = 11; this._calYear--; }
      this._hideDateSummary();
      this.renderCalendar();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
      this._calMonth++;
      if (this._calMonth > 11) { this._calMonth = 0; this._calYear++; }
      this._hideDateSummary();
      this.renderCalendar();
    });

    // 오늘 돌아가기 버튼
    document.getElementById('cal-today-btn')?.addEventListener('click', () => {
      const now = new Date();
      this._calYear = now.getFullYear();
      this._calMonth = now.getMonth();
      this._hideDateSummary();
      this.renderCalendar();
      // 오늘 셀 선택 + 요약 패널
      setTimeout(() => {
        const todayStr = App.getToday();
        const todayCell = document.querySelector(`.calendar-cell[data-date="${todayStr}"]`);
        if (todayCell) {
          document.querySelectorAll('.calendar-cell').forEach(c => c.classList.remove('selected'));
          todayCell.classList.add('selected');
        }
        this._updateDateSummary(todayStr);
      }, 50);
    });

    // 스와이프 월 전환
    const calGrid = document.getElementById('cal-grid');
    if (calGrid) {
      let startX = 0, startY = 0;
      calGrid.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }, { passive: true });
      calGrid.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        // 가로 이동이 세로보다 크고 50px 이상일 때만
        if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 80) {
          if (dx < 0) { this._calMonth++; if (this._calMonth > 11) { this._calMonth = 0; this._calYear++; } }
          else { this._calMonth--; if (this._calMonth < 0) { this._calMonth = 11; this._calYear--; } }
          this._hideDateSummary();
          this.renderCalendar();
        }
      }, { passive: true });
    }

    // 요약 패널 "예약 추가" 버튼
    document.getElementById('cal-date-add-appt')?.addEventListener('click', () => {
      if (this._selectedCalDate) {
        this.showForm(null, null, { date: this._selectedCalDate });
      }
    });

    // 캘린더 데이터는 renderCalendar 내부에서 이미 로드함 (중복 쿼리 제거)

    // 모바일↔데스크톱 뷰포트 경계 변화 시 재렌더 (한 번만 바인딩)
    if (!this._resizeBound) {
      this._resizeBound = true;
      let lastIsMobile = window.matchMedia('(max-width: 768px)').matches;
      const onResize = App.debounce(() => {
        const nowIsMobile = window.matchMedia('(max-width: 768px)').matches;
        if (nowIsMobile !== lastIsMobile) {
          lastIsMobile = nowIsMobile;
          if (location.hash.startsWith('#appointments')) App.handleRoute();
        }
      }, 250);
      window.addEventListener('resize', onResize);
    }

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
        // 전체/이번주는 특정 날짜 아님 → 요약 패널 숨김. 오늘/내일은 해당 날짜 패널 표시.
        if (filter === 'all' || filter === 'week') {
          this._hideDateSummary();
        } else if (filter === 'today') {
          this._updateDateSummary(today);
        } else if (filter === 'tomorrow') {
          this._updateDateSummary(dateInput.value);
        }
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
        let cancelReason = '';
        if (newStatus === 'cancelled' && appt.status !== 'cancelled') {
          const reasons = ['고객 요청', '반려견 컨디션', '연락 두절', '기타'];
          const chipsHtml = reasons.map(r => `<button type="button" class="btn btn-sm btn-secondary cancel-reason-chip" data-reason="${r}" style="min-height:44px">${r}</button>`).join('');
          const okPromise = App.confirm(`이 예약을 취소할까요?<br><small style="color:var(--text-muted)">취소 사유 (선택)</small><span style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${chipsHtml}</span>`, { okLabel: '예약 취소', cancelLabel: '닫기' });
          // confirm 본문은 동기적으로 그려지므로 바로 칩에 핸들러를 붙인다 (한 개만 선택, 다시 누르면 해제)
          document.querySelectorAll('#confirm-body .cancel-reason-chip').forEach(chip => {
            chip.addEventListener('click', () => {
              const isOn = chip.classList.contains('btn-primary');
              document.querySelectorAll('#confirm-body .cancel-reason-chip').forEach(c => { c.classList.remove('btn-primary'); c.classList.add('btn-secondary'); });
              if (!isOn) { chip.classList.remove('btn-secondary'); chip.classList.add('btn-primary'); }
              cancelReason = isOn ? '' : chip.dataset.reason;
            });
          });
          const ok = await okPromise;
          if (!ok) { e.target.value = appt.status; return; }
        }
        let completedWithoutRecord = false;
        if (newStatus === 'completed' && appt.status !== 'completed') {
          const petRecords = appt.petId ? await DB.getByIndex('records', 'petId', appt.petId) : [];
          const hasRecord = petRecords.some(r => String(r.appointmentId) === String(id));
          if (!hasRecord) {
            const prevStatus = appt.status;
            const skipRecord = await App.confirm('미용 기록 없이 완료 처리할까요? 매출에 잡히지 않습니다.', { okLabel: '기록 없이 완료', cancelLabel: '기록 작성', danger: false });
            if (!skipRecord) {
              // 기록 작성 흐름으로 — 저장 시 records.saveRecord가 completed 처리, 취소 시 선택 원복
              e.target.value = prevStatus;
              // confirm 이 닫히며 내는 history.back() popstate 가 새 모달을 닫지 않도록 한 틱 늦춘다
              setTimeout(() => this.completeToRecord(id, () => { e.target.value = prevStatus; }), 180);
              return;
            }
            completedWithoutRecord = true;
          }
        }
        appt.status = newStatus;
        if (newStatus === 'cancelled') { if (cancelReason) appt.cancelReason = cancelReason; }
        else delete appt.cancelReason;
        await DB.update('appointments', appt);
        // Update row data-status for filtering
        const row = e.target.closest('tr');
        if (row) row.dataset.status = newStatus;
        // Update corresponding mobile card data-status and badge
        const card = document.querySelector(`#appt-card-list .mobile-card[data-id="${id}"]`);
        e.target.dataset.st = newStatus;
        if (card) {
          card.dataset.status = newStatus;
          const statusLabels = { pending: '대기', confirmed: '확정', in_progress: '미용중', completed: '완료', cancelled: '취소', noshow: '노쇼' };
          const statusClasses = { pending: 'badge-warning', confirmed: 'badge-info', in_progress: 'badge-info', completed: 'badge-success', cancelled: 'badge-secondary', noshow: 'badge-danger' };
          const badge = card.querySelector('.appt-status-badge');
          if (badge) {
            badge.textContent = statusLabels[newStatus] || newStatus;
            badge.className = 'badge appt-status-badge ' + (statusClasses[newStatus] || 'badge-secondary');
          }
          // 기록 없이 완료한 경우 버튼을 "기록 작성"으로 유지 (나중에라도 매출 기록 가능)
          const completeBtn = card.querySelector('.btn-complete-appt');
          if (completeBtn && completedWithoutRecord) completeBtn.innerHTML = App.icon('note') + ' 기록 작성';
        }
        App.showToast('예약 상태가 변경되었습니다.');
        // 취소 건은 캘린더·요약에서 빠지므로 상태 변경 후 항상 다시 그린다
        await this.renderCalendar();
        const selDate = this._selectedCalDate;
        if (selDate) {
          document.querySelector(`.calendar-cell[data-date="${selDate}"]`)?.classList.add('selected');
          await this._updateDateSummary(selDate);
        }
        if (document.getElementById('timetable-container')?.style.display === 'block') this.renderTimetable();
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

    // 삭제는 수정 폼 안의 '이 예약 삭제'로만 (표·카드에서 실수로 누르는 것을 막는다)

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
      '고객명': customer?.name || '',
      '반려견명': pet?.name || '',
      '시간': appt.time || '',
      ...this._smsDateVars(appt.date, appt.groomer)
    });
    App.openSms(phone, msg);
  },

  // 문자 템플릿 공통 변수 (예약 확인·재확인 모두 사용): {날짜}=10월 23일(목), {시점}=오늘/내일/모레/N일 후,
  // {담당}=담당: 이름. (없으면 빈 값). {미용사}는 예전에 저장한 사용자 템플릿 호환용으로 계속 넘긴다
  _smsDateVars(date, groomer) {
    return {
      '날짜': App.formatDateKo(date),
      '시점': App.relativeDayLabel(date),
      '담당': groomer ? `담당: ${groomer}. ` : '',
      '미용사': groomer || ''
    };
  },

  async renderTimetable() {
    const grid = document.getElementById('timetable-grid');
    const dateLabel = document.getElementById('tt-date');
    if (!grid) return;
    if (dateLabel) dateLabel.textContent = this._ttDate;

    // 효율적 쿼리: 해당 날짜의 예약만 인덱스로 로드
    const dayApptsRaw = await DB.getByIndex('appointments', 'date', this._ttDate);

    const dayAppts = dayApptsRaw.filter(a => a.status !== 'cancelled');
    // render()에서 캐시한 맵 재사용, 없으면 로드
    let customerMap = this._customerMap;
    let petMap = this._petMap;
    if (!customerMap || !petMap) {
      const [customers, pets] = await Promise.all([DB.getAll('customers'), DB.getAll('pets')]);
      customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
      petMap = {}; pets.forEach(p => petMap[p.id] = p);
      this._customerMap = customerMap;
      this._petMap = petMap;
    }

    // 미용사 목록 수집
    // 등록 미용사 + 그날 예약에만 있는 이름 + (담당 없는 예약이 있으면) '미지정' 열
    const groomers = await DB.getSetting('groomers') || [];
    const activeGroomers = [...groomers];
    dayAppts.forEach(a => { const g = a.groomer || '미지정'; if (g !== '미지정' && !activeGroomers.includes(g)) activeGroomers.push(g); });
    if (dayAppts.some(a => !a.groomer) || activeGroomers.length === 0) activeGroomers.push('미지정');

    // 시간 슬롯: 8~22시 고정 (영업시간 변동 대응 — 새벽/야간 특별 예약 포함 수용)
    const slots = [];
    for (let h = 8; h <= 22; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (h < 22) slots.push(`${String(h).padStart(2, '0')}:30`);
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
      const realStart = toMin(time);
      // 10:15 같은 시각도 놓이도록 30분 칸으로 내림 (셀에는 실제 시각 표시)
      const startMin = Math.floor(realStart / 30) * 30;
      const slotCount = Math.max(1, Math.ceil((dur + realStart - startMin) / 30));
      for (let i = 0; i < slotCount; i++) {
        const slotMin = startMin + i * 30;
        const slotH = String(Math.floor(slotMin / 60)).padStart(2, '0');
        const slotM = String(slotMin % 60).padStart(2, '0');
        const slotKey = `${slotH}:${slotM}_${groomer}`;
        const existing = cellMap[slotKey];
        if (existing && existing.isStart) {
          // 같은 칸에 시작하는 겹침 예약은 지우지 않고 함께 표시
          if (i === 0) existing.others.push(a);
          continue;
        }
        cellMap[slotKey] = { appt: a, isStart: i === 0, slotCount, others: [] };
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
            <div style="font-size:0.78rem;font-weight:700">${App.escapeHtml(a.time || '')} ${App.escapeHtml(pet?.name || '-')}</div>
            <div style="font-size:0.7rem;color:var(--text-secondary)">${App.escapeHtml(App.getCustomerLabel(customer))}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${durLabel}</div>
            ${cell.others.map(o => `<div style="font-size:0.72rem;font-weight:700;color:var(--warning-text-strong);margin-top:2px">+ ${App.escapeHtml(o.time || '')} ${App.escapeHtml(petMap[o.petId]?.name || '-')}</div>`).join('')}
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
    // 캘린더는 항상 표시되므로 타임테이블 토글 상태로만 판단
    const ttEl = document.getElementById('timetable-container');
    const hide = ttEl ? ttEl.style.display !== 'none' : false;
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
    const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + 6); return App.formatLocalDate(d); })();

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

    // Also filter mobile cards — "오늘"만 보는 중이면 카드의 날짜 표기는 중복이므로 숨김
    const hideCardDate = special !== 'week' && date === today;
    document.querySelectorAll('#appt-card-list .mobile-card').forEach(card => {
      if (!card.dataset.id) return;
      const dateEl = card.querySelector('.appt-card-date');
      if (dateEl) dateEl.style.display = hideCardDate ? 'none' : '';
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


  // 선택된 서비스가 칩 목록에 없으면(비활성 서비스 등) 체크된 칩으로 덧붙인다.
  // getServiceCheckboxes 는 활성 서비스만 그려서, 수정 후 저장하면 비활성 서비스가 예약에서 조용히 빠지던 문제.
  async _appendMissingServiceChips(host, selectedIds, sizeType) {
    if (!host || !selectedIds || selectedIds.length === 0) return;
    const rendered = new Set(Array.from(host.querySelectorAll('input[name="serviceIds"]')).map(cb => Number(cb.value)));
    const missing = [...new Set(selectedIds.map(Number))].filter(sid => sid && !rendered.has(sid));
    if (missing.length === 0) return;
    const services = await DB.getAll('services');
    const size = sizeType || 'small';
    const chips = missing.map(sid => {
      const svc = services.find(x => x.id === sid);
      // 삭제된 서비스는 이름을 알 수 없어 다시 붙이지 않는다 (예전에도 이름 표시가 안 되던 값)
      if (!svc) return '';
      const price = Number(svc['price' + size.charAt(0).toUpperCase() + size.slice(1)]) || 0;
      return `
          <label class="service-chip checked">
            <input type="checkbox" name="serviceIds" value="${svc.id}" checked
              data-price-small="${svc.priceSmall || 0}"
              data-price-medium="${svc.priceMedium || 0}"
              data-price-large="${svc.priceLarge || 0}">
            <span class="service-chip-name">${App.escapeHtml(svc.name)}${svc.isActive === false ? ' (비활성)' : ''}</span>
            <span class="service-chip-price">${App.formatPriceShort(price)}</span>
          </label>`;
    }).join('');
    if (!chips.trim()) return;
    host.insertAdjacentHTML('beforeend', `<div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);margin:8px 0 4px;padding-bottom:2px;border-bottom:1px solid var(--border)">기존 선택 (메뉴에서 숨김)</div><div class="service-select-grid">${chips}</div>`);
  },
  async showForm(id, preCustomerId, prefill) {
    // 새 예약 시 다음 정시를 기본 시간으로
    // 영업시간 설정이 없어 첫 타임 10:00, 마지막 타임 18:00 기준. 마감 이후면 내일 첫 타임으로.
    const FIRST_SLOT_H = 10, LAST_SLOT_H = 18;
    let defaultTime = '';
    let defaultDate = App.getToday();
    if (!id) {
      const nextH = new Date().getHours() + 1;
      if (nextH > LAST_SLOT_H) {
        const t = new Date(); t.setDate(t.getDate() + 1);
        defaultDate = App.formatLocalDate(t);
        defaultTime = String(FIRST_SLOT_H).padStart(2, '0') + ':00';
      } else {
        defaultTime = String(Math.max(nextH, FIRST_SLOT_H)).padStart(2, '0') + ':00';
      }
      // 다른 날짜를 지정해 열었으면 지금 시각과 무관하게 첫 타임
      if (prefill && prefill.date && prefill.date !== App.getToday()) defaultTime = String(FIRST_SLOT_H).padStart(2, '0') + ':00';
    }
    let appt = id ? await DB.get('appointments', id) : { date: defaultDate, time: defaultTime, status: 'pending', customerId: preCustomerId || null, petId: (prefill && prefill.petId) || null };
    if (id && !appt) { App.showToast('예약을 찾을 수 없습니다.', 'error'); App.closeModal(); return; }
    // Apply prefill data from records page (F8)
    if (prefill && !id) {
      if (prefill.date) appt.date = prefill.date;
      if (prefill.groomer) appt.groomer = prefill.groomer;
      if (prefill.serviceIds) appt.serviceIds = prefill.serviceIds;
      if (prefill.petId) appt.petId = prefill.petId;
    }
    const petOptions = await App.getPetOptions(appt.customerId, appt.petId);
    const initialPet = appt.petId ? await DB.get('pets', Number(appt.petId)) : null;
    const serviceCheckboxes = await App.getServiceCheckboxes(appt.serviceIds || [], App.getPetSizeType(initialPet));

    // ========== Form HTML ==========
    // 반복 예약 묶음: 이 날짜 이후(이 건 포함) 아직 진행되지 않은 같은 묶음의 예약
    let seriesLeft = [];
    if (id && appt.seriesId) {
      const all = await DB.getAll('appointments');
      seriesLeft = all.filter(a => a.seriesId === appt.seriesId && a.date >= appt.date && !['completed', 'cancelled', 'noshow'].includes(a.status));
    }

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
            <input type="time" id="f-time" step="1800" value="${appt.time || ''}">
            <div id="f-time-chips" style="display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:6px;padding-bottom:2px">
              ${Array.from({ length: LAST_SLOT_H - FIRST_SLOT_H + 1 }, (_, i) => String(FIRST_SLOT_H + i).padStart(2, '0') + ':00').map(t => `<button type="button" class="btn btn-sm ${appt.time === t ? 'btn-primary' : 'btn-secondary'} appt-time-chip" data-time="${t}" style="flex:0 0 auto;min-height:44px">${t}</button>`).join('')}
            </div>
          </div>
        </div>
        <div id="time-conflict-warning" style="display:none;background:var(--warning-light);border:1px solid var(--warning);border-radius:var(--radius);padding:8px 12px;font-size:0.82rem;color:var(--warning-text-strong);font-weight:600;margin-bottom:8px"></div>
        <!-- 선택사항 -->
        <div style="margin:12px 0 8px;padding-top:10px;border-top:1px dashed var(--border);font-size:0.82rem;color:var(--text-muted)">선택사항</div>
        <div class="form-group">
          <div id="f-services">
            ${serviceCheckboxes}
          </div>
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

        <!-- 상세 옵션 토글 -->
        <div class="form-detail-divider" onclick="this.closest('.modal-body').querySelector('.form-detail-section').classList.toggle('open');this.classList.toggle('open')">
          <span class="form-detail-divider-line"></span>
          <span class="form-detail-divider-label">상세 옵션</span>
          <span class="form-detail-divider-chevron">${App.icon('chevron-down')}</span>
          <span class="form-detail-divider-line"></span>
        </div>

        <!-- 상세 옵션 영역 -->
        <div class="form-detail-section">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">담당 미용사</label>
              ${await App.getGroomerFieldHTML(appt.groomer)}
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
        </div>
        ${id ? `<div style="margin-top:16px;padding-top:12px;border-top:1px dashed var(--border);display:flex;flex-direction:column;gap:6px;align-items:center">
          ${seriesLeft.length > 0 ? `<button type="button" class="btn btn-ghost" id="btn-cancel-series" style="min-height:44px;color:var(--warning)">이후 반복 예약 ${seriesLeft.length}건 모두 취소</button>` : ''}
          <button type="button" class="btn btn-ghost text-danger" id="btn-delete-appt-form" style="min-height:44px">이 예약 삭제</button>
        </div>` : ''}
      `,
      onSave: () => this.saveAppointment(id)
    });

    // ========== Event Handlers ==========
    // 서비스 칩 바인딩 (반려견 변경 시 사이즈별 가격으로 다시 그린 뒤에도 재사용)
    const bindServiceChips = () => {
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
    };
    await this._appendMissingServiceChips(document.getElementById('f-services'), (appt.serviceIds || []).map(Number), App.getPetSizeType(initialPet));
    bindServiceChips();

    // 반려견이 바뀌면 그 아이 사이즈 가격으로 칩을 다시 그린다 (선택한 서비스는 유지)
    let chipRenderSeq = 0;
    let lastSizeType = App.getPetSizeType(initialPet);
    document.getElementById('f-petId')?.addEventListener('change', async (e) => {
      const seq = ++chipRenderSeq;
      const petId = Number(e.target.value);
      const pet = petId ? await DB.get('pets', petId) : null;
      const sizeType = App.getPetSizeType(pet);
      if (seq !== chipRenderSeq || sizeType === lastSizeType) return;
      const checkedIds = Array.from(document.querySelectorAll('input[name="serviceIds"]:checked')).map(cb => Number(cb.value));
      const html = await App.getServiceCheckboxes(checkedIds, sizeType);
      const host = document.getElementById('f-services');
      if (seq !== chipRenderSeq || !host) return;
      host.innerHTML = html;
      lastSizeType = sizeType;
      await this._appendMissingServiceChips(host, checkedIds, sizeType);
      if (seq !== chipRenderSeq) return;
      bindServiceChips();
    });

    // 빠른 시간 칩
    const timeInput = document.getElementById('f-time');
    const syncTimeChips = () => {
      document.querySelectorAll('#f-time-chips .appt-time-chip').forEach(c => {
        const on = c.dataset.time === timeInput?.value;
        c.classList.toggle('btn-primary', on);
        c.classList.toggle('btn-secondary', !on);
      });
    };
    document.querySelectorAll('#f-time-chips .appt-time-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!timeInput) return;
        timeInput.value = chip.dataset.time;
        timeInput.dispatchEvent(new Event('change'));
      });
    });
    timeInput?.addEventListener('change', syncTimeChips);
    timeInput?.addEventListener('input', syncTimeChips);

    // 수정 폼 하단 삭제
    document.getElementById('btn-delete-appt-form')?.addEventListener('click', () => this.deleteAppointment(id, { fromForm: true }));
    document.getElementById('btn-cancel-series')?.addEventListener('click', () => this.cancelSeries(id));

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
        const names = conflicts.map(a => (a.time || '') + ' ' + (this._petMap?.[a.petId]?.name || '예약')).join(', ');
        warningEl.innerHTML = App.icon('alert') + ' 같은 시간대 예약: ' + App.escapeHtml(names);
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
    await App.renderCustomerSelect('appt-customer-select', appt.customerId, async (cid, preferPetId) => {
      // 반려견 목록 갱신 + 없으면 그 자리에서 등록 버튼 제공
      await App.refreshPetSelect(cid, preferPetId);
      // 노쇼 이력 경고
      const warn = document.getElementById('noshow-warning');
      if (warn) {
        warn.innerHTML = '';
        if (cid) {
          const custAppts = await DB.getByIndex('appointments', 'customerId', Number(cid));
          const noshowCount = custAppts.filter(a => a.status === 'noshow').length;
          if (noshowCount > 0) {
            warn.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;margin-top:4px;font-weight:600">${App.icon('alert')} 이 고객은 노쇼 ${noshowCount}회 이력이 있습니다</div>`;
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
        existingWarn.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;margin-top:4px;font-weight:600">${App.icon('alert')} ${dayNames[dow]}요일은 휴무일입니다</div>`;
      } else {
        existingWarn.innerHTML = '';
      }
    };
    document.getElementById('f-date')?.addEventListener('change', checkClosedDay);
    checkClosedDay();

    // 고객만 정해진 채로 열렸으면 반려견 목록을 다시 그린다 — 활동 중인 아이가 하나면 자동 선택,
    // 하나도 없으면 그 자리에서 등록 버튼 제공
    if (appt.customerId && !appt.petId) await App.refreshPetSelect(appt.customerId);

    // 기존 고객 선택 시 노쇼 이력 즉시 표시
    if (appt.customerId) {
      const custAppts2 = await DB.getByIndex('appointments', 'customerId', Number(appt.customerId));
      const noshowCount = custAppts2.filter(a => a.status === 'noshow').length;
      if (noshowCount > 0) {
        const warn = document.getElementById('noshow-warning');
        if (warn) warn.innerHTML = `<div style="color:var(--danger);font-size:0.85rem;margin-top:4px;font-weight:600">${App.icon('alert')} 이 고객은 노쇼 ${noshowCount}회 이력이 있습니다</div>`;
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
      const others = dayAppts.filter(a => a.id !== id && a.time && a.status !== 'cancelled');
      // 같은 반려견·같은 날짜·같은 시각 = 진짜 중복 → 저장 불가
      const duplicate = others.find(a => a.petId === petId && a.time === time);
      if (duplicate) {
        App.showToast(`같은 반려견의 같은 시간 예약이 이미 있습니다 (${time})`, 'error');
        return;
      }
      const conflict = others.find(a => {
        const isSameResource = (groomer && a.groomer && a.groomer === groomer) || a.petId === petId;
        if (!isSameResource) return false;
        const aStart = toMin(a.time);
        const aEnd = aStart + (a.duration || 60);
        return newStart < aEnd && newEnd > aStart;
      });
      if (conflict) {
        const conflictPet = await DB.get('pets', conflict.petId);
        const ok = await App.confirm(`같은 시간에 겹치는 예약이 있습니다 (${App.escapeHtml(conflictPet?.name || '알 수 없음')} · ${App.escapeHtml(conflict.time)}).<br>그래도 저장할까요?`, { okLabel: '그래도 저장', danger: false });
        if (!ok) return;
        // confirm 이 닫히며 내는 history.back() 이 처리된 뒤에 모달을 닫아야 히스토리가 꼬이지 않는다
        await new Promise(r => setTimeout(r, 180));
      }
    }

    let postSaveSms = null;
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
        // 반복 예약 생성
        const repeatCycleEl = document.getElementById('f-repeat-cycle');
        const repeatCountEl = document.getElementById('f-repeat-count');
        const cycle = Number(repeatCycleEl?.value) || 0;
        const count = Number(repeatCountEl?.value) || 0;
        const isRepeat = cycle > 0 && count > 1;
        // 한 번에 만든 반복 예약 묶음 식별자 (향후 "시리즈 취소"용)
        if (isRepeat) data.seriesId = String(Date.now());
        await DB.add('appointments', data);

        if (isRepeat) {
          let created = 1;
          let skipped = 0;
          let skippedClosed = 0;
          const closedDays = (await DB.getSetting('closedDays') || []).map(Number);
          const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
          for (let i = 1; i < count; i++) {
            const baseDate = new Date(date + 'T00:00:00');
            baseDate.setDate(baseDate.getDate() + cycle * i);
            const nextDate = App.formatLocalDate(baseDate);
            // 휴무일은 건너뜀
            if (closedDays.includes(baseDate.getDay())) { skippedClosed++; continue; }
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
          const skipNotes = [skipped > 0 ? `시간 충돌 ${skipped}건` : '', skippedClosed > 0 ? `휴무일 ${skippedClosed}건` : ''].filter(Boolean).join(', ');
          App.showToast(`반복 예약 ${created}건 등록${skipNotes ? ` (${skipNotes} 제외)` : ''}`);
        } else {
          // 전화번호 있으면 저장 후 문자 보내기 시트, 없으면 일반 토스트
          const customer = await DB.get('customers', customerId);
          const phone = (customer?.phone || '').replace(/\D/g, '');
          if (phone) {
            const pet = await DB.get('pets', petId);
            const dateVars = this._smsDateVars(date, groomer);
            const msg = await App.buildSms('appointment', {
              '고객명': customer?.name || '',
              '반려견명': pet?.name || '',
              '시간': time || '',
              ...dateVars
            });
            postSaveSms = { phone, msg, petName: pet?.name || '', when: `${dateVars['날짜']}${time ? ' ' + time : ''}` };
          } else {
            App.showToast('새 예약이 등록되었습니다.');
          }
        }
      }

      App.closeModal();
      App.handleRoute();
      if (postSaveSms) {
        // closeModal 의 history.back() 이 끝난 뒤 열어야 새 시트가 popstate 로 바로 닫히지 않는다
        const { phone, msg, petName, when } = postSaveSms;
        setTimeout(() => {
          App.showModal({
            title: '예약 완료',
            hideFooter: true,
            content: `
              <div style="text-align:center;padding:4px 0">
                <div style="font-weight:700;font-size:1rem;margin-bottom:4px">예약이 등록되었습니다</div>
                <div style="color:var(--text-muted);font-size:0.88rem;margin-bottom:16px">${App.escapeHtml(petName)}${petName ? ' · ' : ''}${App.escapeHtml(when)}</div>
                <button type="button" class="btn btn-primary" id="btn-post-save-sms" style="width:100%;min-height:48px">문자 보내기</button>
                <button type="button" class="btn btn-secondary" id="btn-post-save-close" style="width:100%;min-height:44px;margin-top:8px">닫기</button>
              </div>`
          });
          document.getElementById('btn-post-save-sms')?.addEventListener('click', () => {
            App.openSms(phone, msg);
            setTimeout(() => App.closeModal(), 300);
          });
          document.getElementById('btn-post-save-close')?.addEventListener('click', () => App.closeModal());
        }, 180);
      }
    } catch (err) {
      console.error('Save appointment error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  async completeToRecord(id, onCancel) {
    try {
      const appt = await DB.get('appointments', id);
      if (!appt) return;
      // 즉시 "미용중" 상태로 변경
      const prevStatus = appt.status;
      appt.status = 'in_progress';
      await DB.update('appointments', appt);
      // 기록 폼 열기 — 저장 시 records.saveRecord에서 completed로 변경
      App.pages.records.showForm(null, appt);
      // 모달 취소 시 원래 상태로 복원
      const _origClose = App._modalOnClose;
      App._modalOnClose = async () => {
        if (_origClose) _origClose();
        // 기록이 저장되지 않았으면 (예약이 아직 in_progress) 원래 상태로
        const current = await DB.get('appointments', id);
        if (current && current.status === 'in_progress') {
          current.status = prevStatus;
          await DB.update('appointments', current);
          if (onCancel) onCancel();
        }
        App._modalOnClose = null;
      };
    } catch (err) {
      console.error('Complete to record error:', err);
      App.showToast('처리 중 오류가 발생했습니다.', 'error');
    }
  },

  // 반복 예약 묶음 중 이 예약 날짜 이후의 미진행 건을 모두 '취소' 상태로 (삭제가 아니라 상태 변경 — 이력 보존, 되돌리기 가능)
  async cancelSeries(id) {
    const appt = await DB.get('appointments', id);
    if (!appt || !appt.seriesId) { App.showToast('반복 예약 정보를 찾을 수 없습니다.', 'error'); return; }
    const all = await DB.getAll('appointments');
    const targets = all.filter(a => a.seriesId === appt.seriesId && a.date >= appt.date && !['completed', 'cancelled', 'noshow'].includes(a.status))
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    if (targets.length === 0) { App.showToast('취소할 반복 예약이 없습니다.', 'info'); return; }
    const first = targets[0], last = targets[targets.length - 1];
    const ok = await App.confirm(
      `${App.formatDateKo(first.date)}부터 ${App.formatDateKo(last.date)}까지 반복 예약 <strong>${targets.length}건</strong>을 모두 취소할까요?<br>` +
      `<small style="color:var(--text-muted)">삭제가 아니라 '취소' 상태로 바뀌며 이력은 남습니다. 이미 완료된 예약은 그대로 둡니다.</small>`,
      { okLabel: `${targets.length}건 취소` });
    if (!ok) return;
    try {
      for (const a of targets) {
        a.status = 'cancelled';
        a.cancelReason = '반복 중단';
        await DB.update('appointments', a);
      }
      App.showToast(`반복 예약 ${targets.length}건을 취소했습니다.`);
      await new Promise(r => setTimeout(r, 180)); // confirm 의 history.back() 처리 후 모달 닫기
      App.closeModal();
      App.handleRoute();
    } catch (err) {
      console.error('cancelSeries error:', err);
      App.showToast('반복 예약 취소 중 오류가 발생했습니다.', 'error');
    }
  },

  async deleteAppointment(id, opts = {}) {
    const appt = await DB.get('appointments', id);
    if (!appt) { App.showToast('예약을 찾을 수 없습니다.', 'error'); return; }
    const pet = appt.petId ? await DB.get('pets', appt.petId) : null;
    const detail = `<small style="color:var(--text-muted)">${App.formatDate(appt.date)}${appt.time ? ' ' + appt.time : ''}${pet ? ' · ' + App.escapeHtml(pet.name) : ''}</small>`;
    const confirmed = await App.confirm(`이 예약을 삭제하시겠습니까?<br>${detail}`, { okLabel: '삭제' });
    if (!confirmed) return;

    try {
      await DB.delete('appointments', id);
      App.showToast('예약이 삭제되었습니다.');
      if (opts.fromForm) {
        // 모달 위 confirm 의 history.back() 이 처리된 뒤 모달을 닫는다
        await new Promise(r => setTimeout(r, 180));
        App.closeModal();
      }
      App.handleRoute();
    } catch (err) {
      console.error('Delete appointment error:', err);
      App.showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  }
};
