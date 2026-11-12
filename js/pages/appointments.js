// ========== Appointments Page ==========
App.pages.appointments = {
  // 마감 안 한 지난 예약: 최근 14일(오늘 제외) 중 아직 대기·확정·미용중인 예약.
  // 홈의 '마감 안 한 지난 예약 N건' 줄과 이 화면의 #appointments/open 목록이 같은 기준을 쓴다.
  OPEN_PAST_DAYS: 14,
  isOpenPast(a, today) {
    if (!a || !a.date || a.date >= today) return false;
    const from = App.parseLocalDate(today); from.setDate(from.getDate() - this.OPEN_PAST_DAYS);
    if (a.date < App.formatLocalDate(from)) return false;
    return !a.status || ['pending', 'confirmed', 'in_progress'].includes(a.status);
  },

  // 상태 이름·배지 색 (목록 카드·상태 변경·'⋯' 메뉴가 같이 쓴다)
  STATUS_LABELS: { pending: '대기', confirmed: '확정', in_progress: '미용중', completed: '완료', cancelled: '취소', noshow: '노쇼' },
  STATUS_BADGES: { pending: 'badge-warning', confirmed: 'badge-info', in_progress: 'badge-info', completed: 'badge-success', cancelled: 'badge-secondary', noshow: 'badge-danger' },

  // 고른 날짜가 든 주의 월~일 7일 (YYYY-MM-DD) — 휴대폰 주간 띠
  weekDays(date) {
    const d = App.parseLocalDate(date);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7); // 그 주 월요일로
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      return App.formatLocalDate(x);
    });
  },

  // 'YYYY-MM-DD' → '11월 13일 (금)'
  dayLabel(date) {
    const d = App.parseLocalDate(date);
    if (!d) return '';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`;
  },

  // 정렬된 예약을 이어진 같은 날짜끼리 묶는다 (순서는 그대로) — 여러 날 목록의 날짜 머리줄
  groupByDate(list) {
    const out = [];
    (list || []).forEach(a => {
      const date = a.date || '';
      const last = out[out.length - 1];
      if (last && last.date === date) last.items.push(a);
      else out.push({ date, items: [a] });
    });
    return out;
  },

  async render(container, params) {
    // 휴무일 설정은 매 진입 시 재로드 (stale 방지)
    this._closedDays = null;
    const today = App.getToday();
    // 예약 목록은 1023px 까지 카드(아이패드 세로·작은 노트북도 누르기 쉬운 카드), 표는 1024px 부터 — 800px 에서 표가 칸보다 넓어 버튼이 잘렸다
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    // 목록은 기본 오늘 ~ +30일만 로드 (수년치 데이터에서 1,000줄씩 그리던 문제).
    // 목록 아래 '이전 30일 보기' / '이후 30일 더 보기'로 넓힌다 — 넓힌 범위는 이 탭(session) 동안 유지. 달력은 따로 월 단위 조회.
    const shiftDate = (base, n) => { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + n); return App.formatLocalDate(d); };
    const defaultTo = shiftDate(today, 30);
    let listRange = null;
    try { listRange = JSON.parse(sessionStorage.getItem('appt-range') || 'null'); } catch (_) {}
    // #appointments/open — 홈에서 '마감 안 한 지난 예약'을 눌러 들어온 경우: 최근 14일을 읽어 그 건들만 보여준다
    const openMode = !!(params && params[0] === 'open');
    this._openMode = openMode;
    // #appointments/go/<예약 id>/<날짜> — 홈 카드에서 들어온 경우
    const go = params && params[0] === 'go' && /^\d{4}-\d{2}-\d{2}$/.test(params[2] || '') ? { id: Number(params[1]), date: params[2] } : null;
    this._goAppt = go;
    if (go) {
      this._selectedCalDate = go.date;
      const gd = new Date(go.date + 'T00:00:00');
      this._calYear = gd.getFullYear(); this._calMonth = gd.getMonth(); this._keepCalMonth = true;
    }
    let listFrom = openMode ? shiftDate(today, -this.OPEN_PAST_DAYS)
      : (listRange && listRange.from && listRange.from <= today) ? listRange.from : today;
    let listTo = openMode ? defaultTo
      : (listRange && listRange.to && listRange.to >= defaultTo) ? listRange.to : defaultTo;
    // 홈에서 누른 예약이 목록 범위 밖(예: 45일 뒤)이면 그 날짜까지 넓혀 읽는다 — 날짜를 고를 때(_setListRange)와 같은 규칙
    if (go && (go.date < listFrom || go.date > listTo)) {
      if (go.date < listFrom) listFrom = go.date; else listTo = go.date;
      sessionStorage.setItem('appt-range', JSON.stringify({ from: listFrom, to: listTo }));
    }
    this._loadedFrom = listFrom;
    this._loadedTo = listTo;
    const [appointments, laterAppts, apptTotal] = await Promise.all([
      DB.getByDateRange('appointments', 'date', listFrom, listTo),
      DB.getByDateRange('appointments', 'date', shiftDate(listTo, 1), '9999-12-31'), // 범위 이후 예약 (보통 소수)
      DB.count('appointments')
    ]);
    const laterCount = laterAppts.length;
    const hasOlder = apptTotal > appointments.length + laterCount; // 범위 이전(또는 날짜 없는) 예약이 있음

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

    // 목록·달력엔 이름·연락처만 쓰므로 사진·메모 같은 큰 필드는 빼고 읽는다 (records 목록과 같은 제외 목록)
    const [customers, pets, services, recentRecords, prepaidEntries, noShowStats] = await Promise.all([
      DB.getAllLight('customers', ['memo', 'address']),
      DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle']),
      DB.getAll('services'),
      DB.getByDateRange('records', 'date', listFrom, '9999-12-31'),
      Prepaid.getAllEntries(),
      App.loadNoShowStats() // 최근 6개월 노쇼·당일 취소 (한 번 읽기)
    ]);
    // 고객 이름 옆 작은 빨간 표시 — 이력이 없으면 아무것도 안 붙는다
    const riskTags = (a) => {
      const r = noShowStats[a.customerId];
      if (!r) return '';
      return (r.noShow > 0 ? ` <span class="appt-risk-tag">노쇼 ${r.noShow}회</span>` : '')
        + (r.lateCancel > 0 ? ` <span class="appt-risk-tag">당일취소 ${r.lateCancel}회</span>` : '');
    };
    // 예약금은 정액권 충전(메모: 예약금)으로 받는다 — 예약과 묶이지 않으니 잔액만 한 줄로 알려 준다 (장부 한 번 읽어 고객별 합산)
    const prepaidBal = Prepaid.balanceMap(prepaidEntries);
    const balLine = (a, style) => {
      const bal = prepaidBal[a.customerId] || 0;
      if (bal <= 0 || ['completed', 'cancelled', 'noshow'].includes(a.status)) return '';
      return `<div class="appt-prepaid-bal" style="font-size:0.93rem;color:var(--text-muted);${style || ''}">정액권·예약금 잔액 ${App.formatCurrency(bal)}</div>`;
    };
    // 완료된 예약 카드에 붙일 미용 결과(금액·결제). 기록은 목록 범위만 읽으므로 그 이전 예약은 '기록 없음'이라 단정하지 않는다
    const recByAppt = App.apptRecordMap(recentRecords);
    const resultOf = (a) => App.apptResultHtml(a, recByAppt[String(a.id)], (a.date || '') >= listFrom);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const firstVisit = await App.firstVisitSet(sorted);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s.name);
    this._customerMap = customerMap;
    this._petMap = petMap;
    this._serviceMap = serviceMap;
    // 미용사 1명 이하면 미용사별 타임테이블·담당 열을 숨긴다
    const multiGroomer = await App.isMultiGroomer();

    // 목록 줄 공통 값 (표·카드가 같이 쓴다)
    const rowInfo = (a) => {
      const customer = customerMap[a.customerId];
      const pet = petMap[a.petId];
      return {
        customer, pet,
        serviceNames: App.apptServiceNames(a, serviceMap),
        isToday: a.date === today,
        // 지난 날짜인데 아직 끝내지 않은 예약 → '지남'
        overdue: (a.date || '') < today && a.status !== 'completed' && a.status !== 'cancelled',
        search: App.escapeHtml(((customer?.name || '') + ' ' + (customer?.phone || '') + ' ' + (pet?.name || '') + ' ' + (a.memo || '') + ' ' + (a.groomer || '')).toLowerCase())
      };
    };
    const st = (a) => a.status || 'pending';
    const statusOptions = (a) => Object.keys(this.STATUS_LABELS).map(k => `<option value="${k}" ${st(a) === k ? 'selected' : ''}>${this.STATUS_LABELS[k]}</option>`).join('');
    // 날짜가 바뀌는 곳마다 머리줄 — 여러 날을 볼 때만 보인다 (applyFilters 가 켜고 끈다)
    const groups = this.groupByDate(sorted);
    const groupTitle = (date) => `${this.dayLabel(date)}${date === today ? ' · 오늘' : ''}`;
    const tableCols = multiGroomer ? 6 : 5;
    const emptyHtml = `
      <div class="empty-state">
        <div class="empty-state-icon">${App.icon('calendar', 'ico-xl')}</div>
        <div class="empty-state-text">${apptTotal === 0 ? '등록된 예약이 없습니다' : '이 기간에 예약이 없습니다'}</div>
        ${apptTotal === 0 ? '<button class="btn btn-primary" onclick="App.pages.appointments.showForm()">+ 첫 예약 등록하기</button>' : ''}
      </div>`;
    // 주간 띠 ↔ 달력 펼침 (휴대폰). 고른 보기는 이 탭 동안 기억한다
    // 주간/달력 고른 보기는 앱을 다시 열어도 기억한다 (이 기기에만)
    let calMonthOpen = false;
    try { calMonthOpen = localStorage.getItem('appt-cal-view') === 'month'; } catch (_) {}

    container.innerHTML = `
      <div class="appt-v2${calMonthOpen ? ' appt-cal-month' : ''}" id="appt-v2">
      <div class="page-header">
        <div>
          <h1 class="page-title">예약 관리</h1>
          <p class="page-subtitle">목록 ${App.formatDate(listFrom)} ~ ${App.formatDate(listTo)} · ${appointments.length}건</p>
        </div>
        <div class="page-actions">
          ${multiGroomer ? `<button class="btn btn-secondary" id="btn-toggle-timetable">${App.icon('clock')} 타임테이블</button>` : ''}
          <button class="btn btn-primary" id="btn-add-appointment">+ 새 예약</button>
        </div>
      </div>

      <!-- 넓은 화면: 왼쪽 달력 · 오른쪽 목록 하나. 좁은 화면: 주간 띠(달력은 펼칠 때만) 아래 목록 -->
      <div class="appt-layout">
      <div class="appt-col-cal">
        <div class="appt-week" id="appt-week">
          <div class="appt-week-bar">
            <button type="button" class="appt-week-nav" id="appt-week-prev" aria-label="이전 주">${App.icon('chevron-left')}</button>
            <span class="appt-week-title" id="appt-week-title"></span>
            <button type="button" class="appt-week-nav" id="appt-week-next" aria-label="다음 주">${App.icon('chevron-right')}</button>
            <button type="button" class="btn btn-sm btn-secondary appt-cal-toggle" id="appt-cal-toggle" aria-expanded="${calMonthOpen}">${App.icon('calendar')} <span id="appt-cal-toggle-text">${calMonthOpen ? '주간으로 접기' : '달력'}</span></button>
          </div>
          <div class="appt-week-days" id="appt-week-days"></div>
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
      </div>
      <div class="appt-col-list">

      <!-- 타임테이블 뷰 (미용사 2명 이상일 때만) -->
      ${multiGroomer ? `<div id="timetable-container" style="display:none;margin-bottom:16px">
        <div class="card">
          <div class="card-header">
            <div style="display:flex;align-items:center;gap:10px">
              <button class="btn btn-sm btn-secondary" id="tt-prev" aria-label="이전 날">${App.icon('chevron-left')}</button>
              <strong id="tt-date">${App.formatDateKo(today)} · 오늘</strong>
              <button class="btn btn-sm btn-secondary" id="tt-next" aria-label="다음 날">${App.icon('chevron-right')}</button>
            </div>
            <span class="card-title" style="margin-left:auto">${App.icon('clock')} 미용사별 타임테이블</span>
          </div>
          <div class="card-body" style="overflow-x:auto;padding:0">
            <div id="timetable-grid"></div>
          </div>
        </div>
      </div>` : ''}

      ${openMode ? `<div class="safety-note warn" id="appt-open-note">
        ${App.icon('alert')}
        <div class="flex-1"><strong id="appt-open-count">마감 안 한 지난 예약 ${sorted.filter(a => this.isOpenPast(a, today)).length}건</strong><br><small>최근 ${this.OPEN_PAST_DAYS}일 · 미용했으면 '미용 완료', 안 왔으면 노쇼·취소로 바꿔 주세요</small></div>
        <button class="btn btn-sm btn-secondary" id="btn-appt-open-reset">기본 보기로</button>
      </div>` : ''}

      <div class="filter-bar" id="appt-filter-bar">
        <div class="quick-filters">
          <button class="quick-filter-btn active" data-filter="all">전체</button>
          <button class="quick-filter-btn" data-filter="today">오늘</button>
          <button class="quick-filter-btn" data-filter="tomorrow">내일</button>
          <button class="quick-filter-btn" data-filter="week">이번주</button>
        </div>
        <div class="search-box">
          <span class="search-icon">${App.icon('search')}</span>
          <input type="text" id="appt-search" placeholder="이름·반려견·전화 뒷자리·초성">
        </div>
        <select id="filter-status" aria-label="상태로 거르기">
          <option value="">전체 상태 (${statusCounts.all})</option>
          ${Object.keys(this.STATUS_LABELS).map(k => `<option value="${k}">${this.STATUS_LABELS[k]} (${statusCounts[k]})</option>`).join('')}
        </select>
        <input type="date" id="filter-date" value="" style="display:none">
        <!-- 검색·상태를 걸었을 때만 보인다 (applyFilters) -->
        <button class="btn btn-secondary btn-sm" id="btn-clear-filter" style="display:none">필터 초기화</button>
      </div>

      <!-- 지금 목록이 어느 날짜를 보여주는지 (달력·빠른 필터와 맞춰 applyFilters 가 채운다) + 그 날짜에 예약 추가 -->
      <div class="appt-list-head">
        <div id="appt-list-label" class="appt-list-label" aria-live="polite"></div>
        <button type="button" class="btn btn-sm btn-secondary" id="cal-date-add-appt" style="display:none" aria-label="이 날짜에 예약 추가">+ 예약 추가</button>
      </div>
      <div class="card">
        <div class="card-body no-padding">
          ${isMobile ? '' : `<div class="table-container">
            <table class="data-table" id="appt-table">
              <thead>
                <tr>
                  <th>시간</th>
                  <th>반려견 / 보호자</th>
                  <th class="appt-col-svc">서비스</th>
                  ${multiGroomer ? '<th>담당</th>' : ''}
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody id="appt-tbody">
                ${sorted.length === 0 ? `<tr><td colspan="${tableCols}">${emptyHtml}</td></tr>` : groups.map(g => `
                  <tr class="appt-group-row" data-group="${App.escapeHtml(g.date)}"><td colspan="${tableCols}">${groupTitle(g.date)}</td></tr>
                  ${g.items.map(a => {
                  const { customer, pet, serviceNames, isToday, overdue, search } = rowInfo(a);
                  return `
                    <tr data-id="${a.id}" data-status="${st(a)}" data-date="${App.escapeHtml(a.date || '')}" data-search="${search}"
                        style="${isToday ? 'background:var(--info-bg-soft)' : ''}">
                      <td class="appt-td-time"><strong>${App.escapeHtml(a.time || '-')}</strong>${a.duration && a.duration !== 60 ? `<div class="appt-sub">${a.duration}분</div>` : ''}</td>
                      <td><a href="#pets/${a.petId}" style="color:var(--primary);font-weight:700" onclick="event.stopPropagation()">${App.escapeHtml(pet?.name || '-')}</a> <span class="appt-sub">${App.escapeHtml(App.getCustomerLabel(customer))}</span>${riskTags(a)}${overdue ? ' <span class="badge badge-danger appt-overdue-badge">지남</span>' : ''}${App.firstVisitBadge(a.customerId, firstVisit, a)}${customer?.phone ? ` <a href="sms:${App.escapeHtml(App.phoneDigits(customer.phone))}" onclick="event.stopPropagation()" title="문자 보내기" aria-label="문자 보내기" style="color:var(--text-muted)">${App.icon('message')}</a>` : ''}<div class="appt-sub appt-cell-clip appt-svc-inline">${App.escapeHtml(serviceNames)}</div>${balLine(a, 'margin-top:2px')}</td>
                      <td class="appt-col-svc" title="${App.escapeHtml(serviceNames + (a.memo ? ' / ' + a.memo : ''))}"><div class="appt-cell-clip">${App.escapeHtml(serviceNames || '-')}</div>${a.memo ? `<div class="appt-cell-clip appt-sub">${App.icon('note')} ${App.escapeHtml(a.memo)}</div>` : ''}</td>
                      ${multiGroomer ? `<td>${App.escapeHtml(a.groomer || '-')}</td>` : ''}
                      <td>
                        ${a.status === 'completed' ? `<span class="badge badge-success">완료</span><div class="appt-result-compact">${resultOf(a)}</div>` : `
                        <select class="status-select appt-status-sel appt-status-sel-table" data-id="${a.id}" data-st="${st(a)}" aria-label="예약 상태">${statusOptions(a)}</select>`}
                      </td>
                      <td class="table-actions">
                        <button class="btn-icon btn-reminder-appt" data-id="${a.id}" title="재확인 문자" aria-label="재확인 문자" style="color:var(--info)${['noshow', 'cancelled'].includes(a.status) ? ';display:none' : ''}">${App.icon('send')}<span class="btn-icon-label">문자</span></button>
                        <button class="btn-icon btn-edit-appt" data-id="${a.id}" title="수정" aria-label="수정">${App.icon('edit')}<span class="btn-icon-label">수정</span></button>
                        ${a.status !== 'completed' ? `<button class="btn-icon btn-complete-appt" data-id="${a.id}" title="미용 완료 · 기록 작성" aria-label="미용 완료 · 기록 작성" style="color:var(--success)${['noshow', 'cancelled'].includes(a.status) ? ';display:none' : ''}">${App.icon('check')}<span class="btn-icon-label">완료</span></button>` : ''}
                      </td>
                    </tr>`;
                }).join('')}`).join('')}
              </tbody>
            </table>
          </div>`}

          <!-- 휴대폰 카드 (한 줄 요약 + 큰 버튼 하나, 나머지는 '⋯' 메뉴) — 모바일 뷰포트에서만 렌더 -->
          ${!isMobile ? '' : `<div class="mobile-card-list" id="appt-card-list" style="display:block">
            ${sorted.length === 0 ? emptyHtml : groups.map(g => `
              <div class="appt-group-head" data-group="${App.escapeHtml(g.date)}">${groupTitle(g.date)}</div>
              ${g.items.map(a => {
              const { customer, pet, serviceNames, isToday, overdue, search } = rowInfo(a);
              const done = a.status === 'completed';
              const line2 = [serviceNames, multiGroomer ? (a.groomer || '') : '',
                a.duration && a.duration !== 60 ? `${a.duration}분` : '',
                a.status === 'cancelled' && a.cancelReason ? `취소: ${a.cancelReason}` : '', a.memo || ''].filter(Boolean);
              return `
              <div class="mobile-card appt-card${overdue || a.status === 'noshow' ? ' appt-card-alert' : ''}" data-id="${a.id}" data-status="${st(a)}" data-date="${App.escapeHtml(a.date || '')}" data-search="${search}"
                   data-tel="${App.escapeHtml(App.phoneDigits(customer?.phone) || '')}" data-label="${App.escapeHtml((a.time || '') + ' ' + (pet?.name || ''))}">
                <div class="appt-card-main">
                  <div class="appt-card-l1">
                    <strong class="appt-card-time">${App.escapeHtml(a.time || '--:--')}</strong>
                    <strong class="appt-card-pet">${App.escapeHtml(pet?.name || '-')}</strong>
                    ${isToday ? '<span class="badge badge-info appt-today-badge">오늘</span>' : ''}${overdue ? '<span class="badge badge-danger appt-overdue-badge">지남</span>' : ''}${App.firstVisitBadge(a.customerId, firstVisit, a)}
                  </div>
                  <div class="appt-card-l2"><span class="appt-l2-name">${App.escapeHtml(App.getCustomerLabel(customer))}</span>${riskTags(a)}${line2.length ? `<span class="appt-l2-rest">· ${line2.map(t => App.escapeHtml(t)).join(' · ')}</span>` : ''}</div>
                  ${balLine(a)}
                </div>
                <div class="appt-card-side">
                  <span class="badge appt-status-badge ${this.STATUS_BADGES[st(a)] || 'badge-secondary'}">${this.STATUS_LABELS[st(a)] || ''}</span>
                  <!-- 노쇼·취소 건은 미용 완료 버튼을 숨긴다 (상태를 되돌리면 다시 보인다) -->
                  ${done ? '' : `<button class="btn btn-sm btn-success btn-complete-appt" data-id="${a.id}"${['noshow', 'cancelled'].includes(a.status) ? ' style="display:none"' : ''}>${App.icon('scissors')} 미용 완료</button>`}
                </div>
                <button type="button" class="appt-more-btn" data-id="${a.id}" aria-label="${App.escapeHtml((pet?.name || '') + ' 예약 메뉴: 문자·전화·수정·상태')}" aria-haspopup="dialog">${App.icon('more')}</button>
                ${done ? `<div class="appt-result-compact">${resultOf(a)}</div>` : `
                <!-- 상태 바꾸기는 '⋯' 메뉴가 이 상자 값을 바꿔 기존 상태 변경 처리(확인 창·취소 사유 등)를 그대로 탄다 -->
                <select class="status-select appt-status-sel" data-id="${a.id}" data-st="${st(a)}" aria-label="예약 상태" hidden>${statusOptions(a)}</select>`}
              </div>`;
            }).join('')}`).join('')}
          </div>`}

        </div>
      </div>

      <!-- 목록 범위 넓히기 (지난 예약은 필요할 때만) -->
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
        ${hasOlder && !openMode ? `<button class="btn btn-secondary btn-sm" id="btn-appt-older" style="min-height:44px">${App.icon('chevron-left')} 이전 30일 보기</button>` : ''}
        ${laterCount > 0 && !openMode ? `<button class="btn btn-secondary btn-sm" id="btn-appt-later" style="min-height:44px">이후 30일 더 보기 (이후 ${laterCount}건) ${App.icon('chevron-right')}</button>` : ''}
        ${!openMode && (listFrom < today || listTo > defaultTo) ? `<button class="btn btn-ghost btn-sm" id="btn-appt-range-reset" style="min-height:44px">기본 범위로 (오늘~30일)</button>` : ''}
      </div>
      </div>
      </div>

      <!-- '⋯' 메뉴 (휴대폰 카드). 열 때 그 예약에 맞게 채운다 -->
      <div class="appt-sheet" id="appt-sheet" hidden>
        <div class="appt-sheet-backdrop" data-close></div>
        <div class="appt-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="appt-sheet-title">
          <div class="appt-sheet-title" id="appt-sheet-title"></div>
          <div class="appt-sheet-body" id="appt-sheet-body"></div>
          <button type="button" class="btn btn-secondary appt-sheet-close" data-close>닫기</button>
        </div>
      </div>
      </div>
    `;
  },

  // 목록 범위를 바꿔 다시 그린다 (스크롤 위치·선택 날짜·달력 월 유지)
  _setListRange(from, to) {
    sessionStorage.setItem('appt-range', JSON.stringify({ from, to }));
    sessionStorage.setItem('appt-scroll', String(window.scrollY));
    this._keepCalMonth = true;
    App.handleRoute();
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
          // 데스크톱: 막대를 누르면 그 예약이 열린다. 모바일은 막대가 작아 칸 전체를 날짜 선택으로 두고, 아래 날짜 목록 줄(44px)로 연다
          return isMobile ? `<div class="cal-bar ${barClass}">${App.escapeHtml(pName)}</div>`
            : `<div class="cal-bar ${barClass}" role="button" tabindex="0" data-appt-id="${a.id}" style="cursor:pointer" title="예약 열기" aria-label="${App.escapeHtml((a.time || '') + ' ' + pName)} 예약 열기">${timeStr}${App.escapeHtml(pName)}</div>`;
        }).join('');
        if (count > maxBars) barsHtml += `<div class="cal-overflow">+${count - maxBars}</div>`;
      }

      cellsHtml += `
        <div class="calendar-cell ${isToday ? 'today' : ''} ${isClosed ? 'closed' : ''} ${heatClass}" data-date="${dateStr}">
          <div class="cal-cell-header">
            <span class="cal-day-num ${weekendClass}">${d}</span>
            ${isClosed ? '<span style="font-size:max(11px, 0.65rem);color:var(--danger);font-weight:700">휴무</span>' : ''}
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
      // 예약 막대 → 그 예약 열기 (목록의 '수정'과 같은 폼). 날짜 선택으로 번지지 않게 막는다
      grid.querySelectorAll('.cal-bar[data-appt-id]').forEach(bar => {
        const open = (e) => { e.stopPropagation(); this.showForm(Number(bar.dataset.apptId)); };
        bar.addEventListener('click', open);
        bar.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
      });
      // 셀 클릭 → 날짜 선택 (주간 띠와 같은 길)
      grid.querySelectorAll('.calendar-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', () => this._selectDate(cell.dataset.date));
      });
    }
  },

  // 날짜 하나 고르기 — 달력 칸·주간 띠 모두 이 길로 (목록을 그 날로 거르고, 범위 밖이면 넓혀 다시 그린다)
  async _selectDate(date) {
    const dateInput = document.getElementById('filter-date');
    if (dateInput) {
      dateInput.value = date;
      this.applyFilters();
    }
    // 주간 띠에서 다른 달 날짜를 고르면 달력도 그 달로 맞춘다 (펼쳤을 때 맞는 달이 보이게)
    const d = App.parseLocalDate(date);
    const otherMonth = d.getFullYear() !== this._calYear || d.getMonth() !== this._calMonth;
    if (otherMonth) { this._calYear = d.getFullYear(); this._calMonth = d.getMonth(); }
    // 목록 범위 밖 날짜면 그 날짜까지 목록을 넓혀 다시 그린다 (선택 날짜·달력 월은 유지됨)
    if ((this._loadedFrom && date < this._loadedFrom) || (this._loadedTo && date > this._loadedTo)) {
      this._selectedCalDate = date;
      this._setListRange(date < this._loadedFrom ? date : this._loadedFrom, date > this._loadedTo ? date : this._loadedTo);
      return;
    }
    if (otherMonth) await this.renderCalendar();
    document.querySelectorAll('#cal-grid .calendar-cell').forEach(c => c.classList.toggle('selected', c.dataset.date === date));
    await this._updateDateSummary(date);
  },

  // 고른 날짜가 바뀌었을 때 따라 맞출 것들. (예전 '날짜 요약 칸'은 아래 목록과 같은 내용이라 없앴다)
  async _updateDateSummary(date) {
    if (!date) return;
    this._selectedCalDate = date;
    this._renderWeek();
    // 타임테이블이 열려 있으면 같은 날짜로 맞춘다 (달력에서 11/9를 눌렀는데 '오늘'에 남아 있던 문제)
    if (this._ttDate !== date && document.getElementById('timetable-container')?.style.display === 'block') {
      this._ttDate = date;
      this.renderTimetable();
    }
  },

  // 휴대폰 주간 띠: 목록이 보여주는 날짜(없으면 마지막으로 본 주)의 월~일, 날마다 예약 수
  async _renderWeek() {
    const box = document.getElementById('appt-week-days');
    if (!box) return;
    const tok = (this._weekTok = (this._weekTok || 0) + 1); // 늦게 끝난 이전 그리기가 덮어쓰지 않게
    const sel = document.getElementById('filter-date')?.value || '';
    if (sel) this._weekBase = sel;
    const days = this.weekDays(this._weekBase || App.getToday());
    this._weekBase = this._weekBase || days[0];
    const appts = await DB.getByDateRange('appointments', 'date', days[0], days[6]);
    if (tok !== this._weekTok) return;
    const counts = {};
    appts.forEach(a => { if (a.status !== 'cancelled') counts[a.date] = (counts[a.date] || 0) + 1; });
    const today = App.getToday();
    const closed = (this._closedDays || []).map(Number);
    const first = App.parseLocalDate(days[0]), last = App.parseLocalDate(days[6]);
    const title = document.getElementById('appt-week-title');
    if (title) title.textContent = `${first.getMonth() + 1}월 ${first.getDate()}일 ~ ${first.getMonth() === last.getMonth() ? '' : (last.getMonth() + 1) + '월 '}${last.getDate()}일`;
    box.innerHTML = days.map(date => {
      const d = App.parseLocalDate(date);
      const n = counts[date] || 0;
      const cls = [date === sel ? 'selected' : '', date === today ? 'today' : '', closed.includes(d.getDay()) ? 'closed' : '', d.getDay() === 6 ? 'sat' : d.getDay() === 0 ? 'sun' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="appt-week-day ${cls}" data-date="${date}" aria-pressed="${date === sel}" aria-label="${this.dayLabel(date)}${date === today ? ' 오늘' : ''} 예약 ${n}건">
        <span class="appt-wd">${'일월화수목금토'[d.getDay()]}</span>
        <span class="appt-dn">${d.getDate()}</span>
        <span class="appt-cnt">${n ? n + '건' : ''}</span>
      </button>`;
    }).join('');
  },

  // '⋯' 메뉴: 그 카드의 예약에 맞게 채워 연다. 버튼은 기존 처리(문자·수정·상태 변경)를 그대로 부른다
  _openSheet(card) {
    const sheet = document.getElementById('appt-sheet');
    const body = document.getElementById('appt-sheet-body');
    if (!sheet || !body || !card) return;
    const id = card.dataset.id;
    const status = card.dataset.status || 'pending';
    const tel = card.dataset.tel || '';
    const done = status === 'completed';
    document.getElementById('appt-sheet-title').textContent = card.dataset.label || '예약';
    body.innerHTML = `
      ${!done && !['noshow', 'cancelled'].includes(status) ? `<button type="button" class="appt-sheet-item" data-act="remind">${App.icon('send')} 재확인 문자</button>` : ''}
      ${tel ? `<a class="appt-sheet-item" href="tel:${App.escapeHtml(tel)}" data-act="tel">${App.icon('phone')} 전화 걸기</a>` : ''}
      <button type="button" class="appt-sheet-item" data-act="edit">${App.icon('edit')} 수정</button>
      ${done ? '' : `<div class="appt-sheet-sub">상태 바꾸기</div>
      <div class="appt-sheet-status">${['pending', 'confirmed', 'in_progress', 'cancelled', 'noshow'].map(k =>
        `<button type="button" class="appt-sheet-st${k === status ? ' on' : ''}" data-st="${k}" aria-pressed="${k === status}">${this.STATUS_LABELS[k]}</button>`).join('')}</div>`}`;
    // 뒤로가기(안드로이드)는 이 메뉴만 닫는다. viaHistory: 뒤로가기로 이미 닫히는 중이라 기록을 또 걷지 않는다
    const hide = (viaHistory) => {
      if (sheet.hidden) return;
      sheet.hidden = true;
      App._unlockBody?.();
      if (!viaHistory) App.popOverlayHistory();
      card.querySelector('.appt-more-btn')?.focus();
    };
    body.onclick = (e) => {
      const item = e.target.closest('[data-act], [data-st]');
      if (!item) return;
      hide();
      if (item.dataset.act === 'tel') return; // 전화는 링크 그대로
      // 메뉴를 닫으며 낸 history.back() 이 끝난 뒤에 창을 연다 — 늦게 온 popstate 가 새 창(수정·확인)을 닫지 않게
      setTimeout(() => {
        if (item.dataset.act === 'remind') this.sendReminder(Number(id));
        else if (item.dataset.act === 'edit') this.showForm(Number(id));
        else if (item.dataset.st && item.dataset.st !== status) {
          // 카드 안 숨은 상태 상자 값을 바꿔 원래 change 처리(노쇼 확인·취소 사유)를 그대로 탄다
          const sel = card.querySelector('.appt-status-sel');
          if (sel) { sel.value = item.dataset.st; sel.dispatchEvent(new Event('change')); }
        }
      }, 180);
    };
    sheet.onclick = (e) => { if (e.target.closest('[data-close]')) hide(); };
    sheet.onkeydown = (e) => { if (e.key === 'Escape') hide(); };
    sheet.hidden = false;
    App._lockBody?.();
    App.pushOverlayHistory(() => hide(true));
    body.querySelector('button, a')?.focus();
  },

  // 홈에서 누른 예약까지 내려가 잠깐 반짝인다. 주소는 #appointments 로 돌려 둬서 다시 그릴 때 또 끌려가지 않게 한다
  _focusAppt(id) {
    this._goAppt = null;
    sessionStorage.removeItem('appt-scroll');
    try { history.replaceState(history.state, '', '#appointments'); App._routeHash = 'appointments'; } catch (_) {}
    requestAnimationFrame(() => {
      const el = document.querySelector(`#appt-tbody tr[data-id="${id}"], #appt-card-list .mobile-card[data-id="${id}"]`);
      if (!el || !el.offsetParent) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('appt-flash');
      setTimeout(() => el.classList.remove('appt-flash'), 2600);
    });
  },

  _hideDateSummary() {
    this._selectedCalDate = null;
    this._renderWeek(); // 목록 날짜가 풀렸으면 주간 띠 선택 표시도 뺀다
  },

  async init() {
    document.getElementById('btn-add-appointment')?.addEventListener('click', () => this.showForm());
    this._weekBase = null; // 주간 띠는 들어올 때마다 목록 날짜(없으면 이번 주)부터

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
        // 목록 범위만 넓혀 다시 그린 경우엔 보던 달을 유지
        if (!this._keepCalMonth) {
          this._calYear = new Date().getFullYear();
          this._calMonth = new Date().getMonth();
        }
        this._keepCalMonth = false;
        this._closedDays = null;
        await this.renderCalendar();
        if (this._openMode) {
          // 마감 안 한 지난 예약만 — 날짜·상태·검색 필터는 비워 두고 open 기준으로만 거른다
          const dateInput = document.getElementById('filter-date');
          if (dateInput) dateInput.value = '';
          const statusEl = document.getElementById('filter-status');
          if (statusEl) statusEl.value = '';
          const searchEl = document.getElementById('appt-search');
          if (searchEl) searchEl.value = '';
          document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
          this._selectedCalDate = null;
          this.applyFilters();
          this._renderWeek();
        } else {
        if (this._goAppt) { // 찾는 예약이 검색어·상태 필터에 가려지지 않게
          const searchEl = document.getElementById('appt-search'); if (searchEl) searchEl.value = '';
          const statusEl = document.getElementById('filter-status'); if (statusEl) statusEl.value = '';
        }
        // 이전 선택 날짜 복원 또는 오늘 자동 선택
        const restoreDate = this._selectedCalDate || App.getToday();
        const dateInput = document.getElementById('filter-date');
        if (dateInput) { dateInput.value = restoreDate; this.applyFilters(); } // 칩은 applyFilters 가 날짜에 맞춰 켠다
        // 캘린더에서 셀 선택 표시 + 요약 패널
        const restoreCell = document.querySelector(`.calendar-cell[data-date="${restoreDate}"]`);
        if (restoreCell) restoreCell.classList.add('selected');
        await this._updateDateSummary(restoreDate);
        if (this._goAppt) this._focusAppt(this._goAppt.id);
        }
    }

    // 마감 안 한 지난 예약 보기 → 기본 범위(오늘~30일)로
    document.getElementById('btn-appt-open-reset')?.addEventListener('click', () => {
      sessionStorage.removeItem('appt-range');
      this._selectedCalDate = null;
      location.hash = '#appointments';
    });

    // 목록 범위 넓히기
    document.getElementById('btn-appt-older')?.addEventListener('click', () => {
      const d = new Date(this._loadedFrom + 'T00:00:00'); d.setDate(d.getDate() - 30);
      this._setListRange(App.formatLocalDate(d), this._loadedTo);
    });
    document.getElementById('btn-appt-later')?.addEventListener('click', () => {
      const d = new Date(this._loadedTo + 'T00:00:00'); d.setDate(d.getDate() + 30);
      this._setListRange(this._loadedFrom, App.formatLocalDate(d));
    });
    document.getElementById('btn-appt-range-reset')?.addEventListener('click', () => {
      sessionStorage.removeItem('appt-range');
      this._selectedCalDate = null; // 범위 밖 날짜가 남아 있으면 목록이 0건으로 보인다 → 오늘로
      this._keepCalMonth = false;
      App.handleRoute();
    });
    const apptScroll = sessionStorage.getItem('appt-scroll');
    if (apptScroll) {
      sessionStorage.removeItem('appt-scroll');
      requestAnimationFrame(() => window.scrollTo({ top: Number(apptScroll), behavior: 'instant' }));
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
          this._ttDate = this._selectedCalDate || App.getToday(); // 달력에서 고른 날짜로 연다
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
        // 목록도 오늘로 맞춘다 (예전엔 패널만 오늘이고 목록은 보던 날짜에 남았다)
        const dateInput = document.getElementById('filter-date');
        if (dateInput && !this._openMode) { dateInput.value = todayStr; this.applyFilters(); }
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

    // 목록 머리 '+ 이 날짜에 예약 추가' — 목록이 보여주는 날짜로 연다
    document.getElementById('cal-date-add-appt')?.addEventListener('click', () => {
      const date = document.getElementById('filter-date')?.value || this._selectedCalDate;
      if (date) this.showForm(null, null, { date });
    });

    // 주간 띠: 날짜 누르기 = 달력 칸 누르기와 같은 길. ◀ ▶ 는 한 주씩 (고른 날이 있으면 같은 요일로 옮겨 고른다)
    document.getElementById('appt-week-days')?.addEventListener('click', (e) => {
      const day = e.target.closest('.appt-week-day');
      if (day) this._selectDate(day.dataset.date);
    });
    const moveWeek = (n) => {
      const cur = document.getElementById('filter-date')?.value;
      const d = App.parseLocalDate(cur || this._weekBase || App.getToday());
      d.setDate(d.getDate() + n * 7);
      const next = App.formatLocalDate(d);
      if (cur) this._selectDate(next);
      else { this._weekBase = next; this._renderWeek(); }
    };
    document.getElementById('appt-week-prev')?.addEventListener('click', () => moveWeek(-1));
    document.getElementById('appt-week-next')?.addEventListener('click', () => moveWeek(1));
    // '달력' 펼치기/접기 — 휴대폰에서 달력이 화면 반을 차지해서 기본은 주간 띠
    document.getElementById('appt-cal-toggle')?.addEventListener('click', (e) => {
      const root = document.getElementById('appt-v2');
      const open = !root.classList.contains('appt-cal-month');
      root.classList.toggle('appt-cal-month', open);
      try { localStorage.setItem('appt-cal-view', open ? 'month' : 'week'); } catch (_) {}
      e.currentTarget.setAttribute('aria-expanded', String(open));
      document.getElementById('appt-cal-toggle-text').textContent = open ? '주간으로 접기' : '달력';
    });

    // 카드 '⋯' → 메뉴
    document.getElementById('appt-card-list')?.addEventListener('click', (e) => {
      const more = e.target.closest('.appt-more-btn');
      if (more) this._openSheet(more.closest('.mobile-card'));
    });

    // 캘린더 데이터는 renderCalendar 내부에서 이미 로드함 (중복 쿼리 제거)

    // 모바일↔데스크톱 뷰포트 경계 변화 시 재렌더 (한 번만 바인딩)
    if (!this._resizeBound) {
      this._resizeBound = true;
      // 목록 카드↔표 경계(1023px)와 달력 막대 경계(768px) 어느 쪽을 넘어도 다시 그린다
      const bp = () => window.matchMedia('(max-width: 768px)').matches + ':' + window.matchMedia('(max-width: 1023px)').matches;
      let lastIsMobile = bp();
      const onResize = App.debounce(() => {
        const nowIsMobile = bp();
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
        // 마감 안 한 지난 예약 보기 중이면 기본 보기로 나간다 (빠른 필터는 기본 범위 기준)
        if (this._openMode) { sessionStorage.removeItem('appt-range'); location.hash = '#appointments'; return; }
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
      if (this._openMode) { sessionStorage.removeItem('appt-range'); location.hash = '#appointments'; return; }
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
          const ok = await App.confirm('노쇼로 바꿀까요?<br>고객 이력에 기록됩니다.', { okLabel: '노쇼로 변경', cancelLabel: '돌아가기' });
          if (!ok) { e.target.value = appt.status; return; }
        }
        let cancelReason = '';
        if (newStatus === 'cancelled' && appt.status !== 'cancelled') {
          const reasons = ['고객 요청', '반려견 컨디션', '연락 두절', '기타'];
          const chipsHtml = reasons.map(r => `<button type="button" class="btn btn-sm btn-secondary cancel-reason-chip" data-reason="${r}" style="min-height:44px">${r}</button>`).join('');
          const okPromise = App.confirm(`이 예약을 취소할까요?<br><small style="color:var(--text-muted)">취소 사유 (선택)</small><span style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">${chipsHtml}</span>`, { okLabel: '예약 취소', cancelLabel: '돌아가기' });
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
          // 미래 날짜 예약이면 먼저 한 번 묻는다 (잘못 고른 예약 방지) — 기록 작성 쪽은 records.showForm 이 같은 질문을 한다
          if (appt.date && appt.date > App.getToday()) {
            const moveOk = await App.confirm(`${App.futureDayLabel(appt.date)} 예약이에요.<br>오늘로 옮겨서 완료할까요?`, { okLabel: '오늘로 옮겨 완료', cancelLabel: '돌아가기', danger: false });
            if (!moveOk) { e.target.value = appt.status; return; }
            App._earlyMoveConfirmedId = appt.id; // 이어서 '기록 작성'으로 가면 기록 폼이 같은 질문을 또 하지 않게
          }
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
            App._earlyMoveConfirmedId = null;
          }
        }
        appt.status = newStatus;
        // 미래 예약을 기록 없이 완료하면 실제로 한 날 = 오늘로 옮긴다 (기록 저장 경로와 같은 규칙):
        // 날짜 = 오늘, 시간 = 원래 시간과 '지금(10분 단위 내림)' 중 이른 쪽
        let movedToToday = false;
        if (completedWithoutRecord && appt.date && appt.date > App.getToday()) {
          const now = new Date();
          const m = Math.floor((now.getHours() * 60 + now.getMinutes()) / 10) * 10;
          const nowHHMM = String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
          appt.date = App.getToday();
          appt.time = appt.time && appt.time < nowHHMM ? appt.time : nowHHMM;
          movedToToday = true;
        }
        if (newStatus === 'cancelled') { if (cancelReason) appt.cancelReason = cancelReason; }
        else delete appt.cancelReason;
        App.markCancelledAt(appt, newStatus); // 당일 취소 세기용 — 취소한 때
        await DB.update('appointments', appt);
        // 기록 없이 완료해도 방문은 한 것 — 반려견 마지막 방문일(lastVisitDate)을 앞으로 당겨 재방문 알림이 맞게 한다.
        // (기록 저장 경로는 records._recalcPetLastVisit 이 기록 기준으로 계산한다. 기록이 없으니 여기서는 예약 날짜로)
        if (completedWithoutRecord && appt.petId && appt.date && appt.date <= App.getToday()) {
          try {
            const pet = await DB.get('pets', Number(appt.petId));
            if (pet && (!pet.lastVisitDate || pet.lastVisitDate < appt.date)) {
              pet.lastVisitDate = appt.date;
              if (!pet.firstVisitDate) pet.firstVisitDate = appt.date;
              await DB.update('pets', pet);
            }
          } catch (err) { console.warn('lastVisitDate 갱신 실패:', err); }
        }
        // Update row data-status for filtering
        const row = e.target.closest('tr');
        if (row) row.dataset.status = newStatus;
        // 끝냈거나 취소하면 '지남'이 아니다 → 배지·빨간 줄을 상태에 맞춘다 (표·카드)
        const overdueNow = (appt.date || '') < App.getToday() && !['completed', 'cancelled'].includes(newStatus);
        document.querySelectorAll(`#appt-tbody tr[data-id="${id}"] .appt-overdue-badge, #appt-card-list .mobile-card[data-id="${id}"] .appt-overdue-badge`).forEach(b => { b.style.display = overdueNow ? '' : 'none'; });
        document.querySelector(`#appt-card-list .mobile-card[data-id="${id}"]`)?.classList.toggle('appt-card-alert', overdueNow || newStatus === 'noshow');
        // 노쇼·취소로 바꾸면 미용 완료 버튼을 숨기고, 다른 상태로 되돌리면 다시 보인다 (표·카드 모두)
        const hideComplete = newStatus === 'noshow' || newStatus === 'cancelled';
        document.querySelectorAll(`.btn-complete-appt[data-id="${id}"], .btn-reminder-appt[data-id="${id}"]`).forEach(b => { b.style.display = hideComplete ? 'none' : ''; });
        // Update corresponding mobile card data-status and badge
        const card = document.querySelector(`#appt-card-list .mobile-card[data-id="${id}"]`);
        e.target.dataset.st = newStatus;
        if (card) {
          card.dataset.status = newStatus;
          const statusLabels = this.STATUS_LABELS;
          const statusClasses = this.STATUS_BADGES;
          const badge = card.querySelector('.appt-status-badge');
          if (badge) {
            badge.textContent = statusLabels[newStatus] || newStatus;
            badge.className = 'badge appt-status-badge ' + (statusClasses[newStatus] || 'badge-secondary');
          }
          // 기록 없이 완료한 경우 버튼을 "기록 작성"으로 유지 (나중에라도 매출 기록 가능)
          const completeBtn = card.querySelector('.btn-complete-appt');
          if (completeBtn && completedWithoutRecord) completeBtn.innerHTML = App.icon('note') + ' 기록 작성';
          else if (completeBtn && newStatus !== 'completed') completeBtn.innerHTML = App.icon('scissors') + ' 미용 완료';
        }
        App.showToast(movedToToday ? '완료 처리하고 오늘 날짜로 옮겼습니다.' : '예약 상태가 변경되었습니다.');
        // 날짜가 바뀌었으면 목록 줄의 날짜·정렬이 달라지므로 화면을 다시 그린다
        if (movedToToday) { App.handleRoute(); return; }
        // 바뀐 상태로 지금 보기(지난 예약 보기면 그 기준)를 다시 적용한다
        this.applyFilters();
        // 취소 건은 캘린더·요약에서 빠지므로 상태 변경 후 항상 다시 그린다
        await this.renderCalendar();
        const selDate = this._selectedCalDate;
        if (selDate) {
          document.querySelector(`.calendar-cell[data-date="${selDate}"]`)?.classList.add('selected');
          await this._updateDateSummary(selDate);
        } else this._renderWeek(); // 주간 띠 예약 수도 맞춘다 (취소하면 빠진다)
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
    if (dateLabel) dateLabel.textContent = App.formatDateKo(this._ttDate) + (this._ttDate === App.getToday() ? ' · 오늘' : '');

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

    // 기본 8~22시, 그 밖의 예약이 있으면 그 시간까지 늘린다 (예전엔 조용히 안 보였음)
    let startH = 8, endH = 22;
    dayAppts.forEach(a => {
      if (!a.time) return;
      const [h, m] = a.time.split(':').map(Number);
      if (!Number.isFinite(h)) return;
      startH = Math.min(startH, h);
      const endMin = h * 60 + (m || 0) + (a.duration || 60);
      endH = Math.max(endH, Math.min(24, Math.ceil(endMin / 60)));
    });
    // 마지막 칸은 23:30 까지 (23:30 예약도 보이게)
    const slots = [];
    for (let h = startH; h <= endH && h < 24; h++) {
      slots.push(`${String(h).padStart(2, '0')}:00`);
      if (h < endH) slots.push(`${String(h).padStart(2, '0')}:30`);
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
    html += `<div style="padding:8px;font-weight:700;background:var(--bg);border-bottom:2px solid var(--border);text-align:center;font-size:0.93rem">시간</div>`;
    activeGroomers.forEach(g => {
      html += `<div style="padding:8px;font-weight:700;background:var(--bg);border-bottom:2px solid var(--border);text-align:center;font-size:0.93rem">${App.escapeHtml(g)}</div>`;
    });

    // 시간 슬롯
    slots.forEach(slot => {
      html += `<div style="padding:6px 4px;font-size:0.93rem;color:var(--text-muted);border-bottom:1px solid var(--border);text-align:center;background:var(--bg)">${slot}</div>`;
      activeGroomers.forEach(g => {
        const key = `${slot}_${g}`;
        const cell = cellMap[key];
        if (cell && cell.isStart) {
          const a = cell.appt;
          const customer = customerMap[a.customerId];
          const pet = petMap[a.petId];
          const statusColors = { pending: 'var(--warning)', confirmed: 'var(--primary)', in_progress: 'var(--info)', completed: 'var(--success)', noshow: 'var(--danger)' };
          const durLabel = (a.duration || 60) >= 60 ? Math.floor((a.duration || 60) / 60) + '시간' + ((a.duration || 60) % 60 ? ' ' + (a.duration || 60) % 60 + '분' : '') : (a.duration || 60) + '분';
          html += `<div class="tt-appt" role="button" tabindex="0" data-appt-id="${a.id}" aria-label="${App.escapeHtml((a.time || '') + ' ' + (pet?.name || ''))} 예약 열기" style="padding:4px 6px;min-height:44px;cursor:pointer;border-bottom:1px solid var(--border);background:color-mix(in srgb, ${statusColors[a.status] || 'var(--primary)'} 12%, transparent);border-left:3px solid ${statusColors[a.status] || 'var(--primary)'}">
            <div style="font-size:0.93rem;font-weight:700">${App.escapeHtml(a.time || '')} ${App.escapeHtml(pet?.name || '-')}</div>
            <div style="font-size:0.93rem;color:var(--text-secondary)">${App.escapeHtml(App.getCustomerLabel(customer))}</div>
            <div style="font-size:0.93rem;color:var(--text-muted)">${durLabel}</div>
            ${cell.others.map(o => `<div class="tt-appt" role="button" tabindex="0" data-appt-id="${o.id}" style="min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:0.93rem;font-weight:700;color:var(--warning-text-strong);margin-top:2px">+ ${App.escapeHtml(o.time || '')} ${App.escapeHtml(petMap[o.petId]?.name || '-')}</div>`).join('')}
          </div>`;
        } else if (cell && !cell.isStart) {
          const a = cell.appt;
          const statusColors = { pending: 'var(--warning)', confirmed: 'var(--primary)', in_progress: 'var(--info)', completed: 'var(--success)', noshow: 'var(--danger)' };
          html += `<div class="tt-appt" data-appt-id="${a.id}" style="padding:0;cursor:pointer;border-bottom:1px solid var(--border);background:color-mix(in srgb, ${statusColors[a.status] || 'var(--primary)'} 12%, transparent);border-left:3px solid ${statusColors[a.status] || 'var(--primary)'}"></div>`;
        } else {
          html += `<div style="padding:4px;border-bottom:1px solid var(--border)"></div>`;
        }
      });
    });

    html += '</div>';
    grid.innerHTML = html;
    // 예약 칸(이어지는 칸 포함)을 누르면 그 예약이 열린다. 겹친 예약 줄은 그 예약으로 (안쪽 요소가 먼저 잡힘)
    const openTt = (e) => {
      const el = e.target.closest('.tt-appt[data-appt-id]');
      if (el) { e.stopPropagation(); this.showForm(Number(el.dataset.apptId)); }
    };
    grid.onclick = openTt;
    grid.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.tt-appt')) { e.preventDefault(); openTt(e); } };
  },

  _updateListVisibility() {
    // 캘린더는 항상 표시되므로 타임테이블 토글 상태로만 판단
    const ttEl = document.getElementById('timetable-container');
    const hide = ttEl ? ttEl.style.display !== 'none' : false;
    const filterBar = document.getElementById('appt-filter-bar');
    if (filterBar) filterBar.style.display = hide ? 'none' : '';
  },

  applyFilters(special) {
    // 검색·상태를 바꿔도 '이번주' 빠른 필터는 유지 (특정 날짜를 고르면 그 날짜가 우선)
    if (!special && !document.getElementById('filter-date')?.value && document.querySelector('.quick-filter-btn.active')?.dataset.filter === 'week') special = 'week';
    // 마감 안 한 지난 예약 보기: 날짜를 따로 고르지 않았으면 그 건들만
    if (!special && this._openMode && !document.getElementById('filter-date')?.value) special = 'open';
    const openFrom = (() => { const d = App.parseLocalDate(App.getToday()); d.setDate(d.getDate() - this.OPEN_PAST_DAYS); return App.formatLocalDate(d); })();
    const isOpenEl = (el) => el.dataset.date < App.getToday() && el.dataset.date >= openFrom && ['pending', 'confirmed', 'in_progress'].includes(el.dataset.status);
    const search = (document.getElementById('appt-search')?.value || '').toLowerCase();
    const status = document.getElementById('filter-status')?.value || '';
    const date = document.getElementById('filter-date')?.value || '';
    const today = App.getToday();

    // Save filter state to sessionStorage (open 보기는 저장하지 않는다 — 다음에 예약 화면을 열 때 남지 않게)
    if (!this._openMode) sessionStorage.setItem('appt-filter', JSON.stringify({
      search: document.getElementById('appt-search')?.value || '',
      status,
      date,
      quickFilter: document.querySelector('.quick-filter-btn.active')?.dataset.filter || 'all'
    }));
    const weekEnd = (() => { const d = new Date(); d.setDate(d.getDate() + 6); return App.formatLocalDate(d); })();
    const shownDates = new Set(); // 보이는 줄이 있는 날짜 → 그 날짜 머리줄만 보인다

    document.querySelectorAll('#appt-tbody tr').forEach(row => {
      if (!row.dataset.id) return;
      const matchSearch = App.searchMatch(row.dataset.search || '', search); // 초성·전화 숫자·여러 낱말
      const matchStatus = !status || row.dataset.status === status;
      let matchDate = true;
      if (special === 'open') {
        matchDate = isOpenEl(row);
      } else if (special === 'week') {
        matchDate = row.dataset.date >= today && row.dataset.date <= weekEnd;
      } else if (date) {
        matchDate = row.dataset.date === date;
      }
      const show = matchSearch && matchStatus && matchDate;
      row.style.display = show ? '' : 'none';
      if (show) shownDates.add(row.dataset.date);
    });

    // 휴대폰 카드도 같은 기준
    document.querySelectorAll('#appt-card-list .mobile-card').forEach(card => {
      if (!card.dataset.id) return;
      const matchSearch = App.searchMatch(card.dataset.search || '', search);
      const matchStatus = !status || card.dataset.status === status;
      let matchDate = true;
      if (special === 'open') {
        matchDate = isOpenEl(card);
      } else if (special === 'week') {
        matchDate = card.dataset.date >= today && card.dataset.date <= weekEnd;
      } else if (date) {
        matchDate = card.dataset.date === date;
      }
      const show = matchSearch && matchStatus && matchDate;
      card.style.display = show ? '' : 'none';
      if (show) shownDates.add(card.dataset.date);
    });

    // 하루만 볼 땐 날짜 머리줄·'오늘' 배지를 뺀다 (목록 위 안내에 날짜가 있다). 여러 날이면 날짜마다 머리줄
    const oneDay = !special && !!date;
    document.querySelectorAll('#appt-tbody .appt-group-row, #appt-card-list .appt-group-head').forEach(h => {
      h.style.display = !oneDay && shownDates.has(h.dataset.group) ? '' : 'none';
    });
    document.getElementById('appt-v2')?.classList.toggle('appt-one-day', oneDay);
    // '필터 초기화'는 검색·상태를 걸었을 때만, '+ 이 날짜에 예약 추가'는 하루를 볼 때만
    const clearBtn = document.getElementById('btn-clear-filter');
    if (clearBtn) clearBtn.style.display = search || status || this._openMode ? '' : 'none';
    const addBtn = document.getElementById('cal-date-add-appt');
    if (addBtn) addBtn.style.display = oneDay ? '' : 'none';

    // 지난 예약 보기: 상태를 바꿔 마감한 건은 빠지므로 위 'N건'도 다시 센다
    const openCountEl = document.getElementById('appt-open-count');
    if (this._openMode && openCountEl) {
      const n = [...document.querySelectorAll('#appt-tbody tr[data-id], #appt-card-list .mobile-card[data-id]')].filter(isOpenEl).length;
      openCountEl.textContent = `마감 안 한 지난 예약 ${n}건`;
    }

    // 빠른 필터 칩을 실제 보이는 범위에 맞춘다 — 달력에서 11/10을 눌러도 '오늘'이 켜져 있던 문제
    const tomorrow = (() => { const d = App.parseLocalDate(today); d.setDate(d.getDate() + 1); return App.formatLocalDate(d); })();
    const chip = special === 'open' ? '' : special === 'week' ? 'week' : !date ? 'all' : date === today ? 'today' : date === tomorrow ? 'tomorrow' : '';
    document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.toggle('active', !!chip && b.dataset.filter === chip));
    const labelEl = document.getElementById('appt-list-label');
    if (labelEl) {
      const shown = document.querySelectorAll('#appt-tbody tr[data-id]:not([style*="display: none"]), #appt-card-list .mobile-card[data-id]:not([style*="display: none"])').length;
      const what = special === 'open' ? '마감 안 한 지난 예약'
        : special === 'week' ? `이번주 예약 (${App.formatDateKo(today)} ~ ${App.formatDateKo(weekEnd)})`
        : date ? `${App.formatDateKo(date)}${date === today ? ' · 오늘' : date === tomorrow ? ' · 내일' : ''} 예약`
        : `전체 예약 (${App.formatDate(this._loadedFrom)} ~ ${App.formatDate(this._loadedTo)})`;
      labelEl.innerHTML = `${App.icon('list')} 목록: <strong>${App.escapeHtml(what)}</strong> · ${shown}건`;
    }
  },


  // 선택된 서비스가 칩 목록에 없으면(비활성 서비스 등) 체크된 칩으로 덧붙인다.
  // getServiceCheckboxes 는 활성 서비스만 그려서, 수정 후 저장하면 비활성 서비스가 예약에서 조용히 빠지던 문제.
  async _appendMissingServiceChips(host, selectedIds, sizeType) {
    if (!host || !selectedIds || selectedIds.length === 0) return;
    const rendered = new Set(Array.from(host.querySelectorAll('input[name="serviceIds"]')).map(cb => Number(cb.value)));
    const missing = [...new Set(selectedIds.map(Number))].filter(sid => sid && !rendered.has(sid));
    if (missing.length === 0) return;
    const services = await DB.getAll('services');
    const table = await App.getPriceBands();
    const chips = missing.map(sid => {
      const svc = services.find(x => x.id === sid);
      // 지워진 서비스도 id 를 버리지 않는다 — 예약에 저장된 이름(없으면 '삭제된 서비스')으로 체크된 칩을 붙여 수정 저장 때 유지
      if (!svc) {
        const savedName = (this._formSvcNames && this._formSvcNames[sid]) || '삭제된 서비스';
        return `
          <label class="service-chip checked">
            <input type="checkbox" name="serviceIds" value="${sid}" checked data-price="0">
            <span class="service-chip-name">${App.escapeHtml(savedName)} (삭제됨)</span>
            <span class="service-chip-price">-</span>
          </label>`;
      }
      return App.serviceChipHtml(svc, sizeType, table, true, svc.isActive === false ? ' (비활성)' : '');
    }).join('');
    if (!chips.trim()) return;
    host.insertAdjacentHTML('beforeend', `<div style="font-size:0.93rem;font-weight:700;color:var(--text-muted);margin:8px 0 4px;padding-bottom:2px;border-bottom:1px solid var(--border)">기존 선택 (메뉴에서 숨김)</div><div class="service-select-grid">${chips}</div>`);
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
    // 칩 가격 기준: 예전 예약에 남은 몸무게(weightAtBooking) → 반려견 몸무게 → 사이즈. 예약 폼에 몸무게 칸은 없다 (기록 폼에서 잰다)
    const initialWeight = Number(appt.weightAtBooking) > 0 ? Number(appt.weightAtBooking) : (initialPet && Number(initialPet.weight) > 0 ? Number(initialPet.weight) : null);
    const initialBasis = initialWeight || App.getPetPriceBasis(initialPet);
    await App.getServiceUseCounts(true); // 많이 쓴 순서 — 폼을 열 때 한 번 새로 센다 (반려견 바꿔 다시 그릴 땐 같은 값)
    const serviceCheckboxes = await App.getServiceCheckboxes(appt.serviceIds || [], initialBasis);

    // ========== Form HTML ==========
    // 반복 예약 묶음: 이 날짜 이후(이 건 포함) 아직 진행되지 않은 같은 묶음의 예약
    let seriesLeft = [];
    if (id && appt.seriesId) {
      const all = await DB.getAll('appointments');
      seriesLeft = all.filter(a => a.seriesId === appt.seriesId && a.date >= appt.date && !['completed', 'cancelled', 'noshow'].includes(a.status));
    }
    // '기록 없이 완료'한 예약만 완료를 되돌릴 수 있다 (기록이 있는 완료 건은 기록을 지우면 예약이 되돌아간다)
    let canUndoComplete = false;
    if (id && appt.status === 'completed') {
      const petRecs = appt.petId ? await DB.getByIndex('records', 'petId', Number(appt.petId)) : [];
      canUndoComplete = !petRecs.some(r => String(r.appointmentId) === String(id));
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
            <!-- 시간 버튼은 여러 줄로 감싼다 (예전엔 한 줄로 옆으로 밀어야 해서 폰에서 창이 옆으로 움직이는 것처럼 느껴졌다) -->
            <div id="f-time-chips" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;margin-top:6px">
              ${Array.from({ length: LAST_SLOT_H - FIRST_SLOT_H + 1 }, (_, i) => String(FIRST_SLOT_H + i).padStart(2, '0') + ':00').map(t => `<button type="button" class="btn btn-sm ${appt.time === t ? 'btn-primary' : 'btn-secondary'} appt-time-chip" data-time="${t}" style="min-height:44px;padding-left:0;padding-right:0">${t}</button>`).join('')}
            </div>
          </div>
        </div>
        <div id="time-conflict-warning" style="display:none;background:var(--warning-light);border:1px solid var(--warning);border-radius:var(--radius);padding:8px 12px;font-size:0.93rem;color:var(--warning-text-strong);font-weight:600;margin-bottom:8px"></div>
        <!-- 선택사항 -->
        <div style="margin:12px 0 8px;padding-top:10px;border-top:1px dashed var(--border);font-size:0.93rem;color:var(--text-muted)">선택사항</div>
        <div class="form-group">
          <!-- 지난번처럼: 이 아이의 마지막 예약·기록과 같은 서비스를 한 번에 고른다. 기록이 없으면 안 보인다 -->
          <button type="button" id="btn-appt-last" class="btn btn-sm btn-ghost" style="display:none;width:100%;min-height:40px;justify-content:flex-start;margin-bottom:6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--primary);font-weight:600"></button>
          <div id="f-services">
            ${serviceCheckboxes}
          </div>
          <div id="f-appt-estimate" style="display:none;margin-top:8px;padding:8px 12px;background:var(--bg);border-radius:var(--radius);font-size:0.93rem"></div>
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
            <!-- 미용사 1명 이하면 숨김 (값은 그대로 저장 — 1명 등록 시 자동 채움, 기존 담당 유지) -->
            <div class="form-group"${await App.isMultiGroomer() ? '' : ' style="display:none"'}>
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
          ${canUndoComplete ? `<button type="button" class="btn btn-ghost" id="btn-undo-complete" style="min-height:44px;color:var(--warning)">완료 취소 (확정으로 되돌리기)</button>` : ''}
          <button type="button" class="btn btn-ghost text-danger" id="btn-delete-appt-form" style="min-height:44px">이 예약 삭제</button>
        </div>` : ''}
      `,
      onSave: () => this.saveAppointment(id)
    });

    // ========== Event Handlers ==========
    // 서비스 칩 바인딩 (반려견 변경 시 사이즈별 가격으로 다시 그린 뒤에도 재사용)
    // 예상 금액 — 고른 서비스의 메뉴 가격 합 (몸무게 구간·초과 요금 반영). 실제 금액은 미용 기록에서 정해진다
    // 1.08: 기록 폼과 같은 순서로 값을 정한다 — 코스는 이 아이 가격 → 메뉴 값, 스타일·옵션은 App.resolveExtraPrice(코스 포함 0원 → 이 아이 가격 → 코스별 다른 값 → 메뉴 값).
    // 칩의 가격 글자도 그 값으로 바꿔 보여 준다 (예전엔 메뉴 기본값만 더해 기록 폼에서 금액이 달라졌다)
    let apptPet = initialPet; // 아래 반려견 변경에서 바뀐다 (updateEstimate 가 먼저 쓰므로 여기서 선언)
    let svcCache = null;
    let estimateSeq = 0;
    // 길이 (예: 7F) — 고른 코스에 길이 옵션이 있으면 코스 칩 바로 아래에 길이 칩 한 줄. 하나만 고르고, 다시 누르면 뺀다.
    // 값은 { serviceId, name, price } — 그 코스를 빼면 길이도 빠진다 (저장은 saveAppointment 가 this._formLength 로)
    let apptLength = App.apptLengthOf(appt);
    this._formLength = apptLength;
    const renderLength = (courses, pickedIds) => {
      if (apptLength && !pickedIds.includes(apptLength.serviceId)) apptLength = null;
      this._formLength = apptLength;
      const slot = document.querySelector('#f-services .svc-length-slot');
      if (!slot) return;
      const course = courses.find(sv => App.lengthOptionsOf(sv).length);
      if (!course) { slot.innerHTML = ''; return; }
      const opts = App.lengthOptionsOf(course);
      // 저장된 길이가 메뉴에서 지워졌어도 이 예약에선 보이게 (값은 예약 때 그대로)
      if (apptLength && apptLength.serviceId === course.id && !opts.some(o => o.name === apptLength.name)) opts.push({ name: apptLength.name, price: apptLength.price });
      slot.innerHTML = `<div style="font-size:0.93rem;font-weight:700;color:var(--text-secondary);margin:8px 0 4px">길이 <span style="font-weight:400;color:var(--text-muted)">(${App.escapeHtml(course.name)})</span></div>`
        + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + opts.map(o => {
          const on = !!(apptLength && apptLength.serviceId === course.id && apptLength.name === o.name);
          return `<button type="button" class="payment-chip svc-length-chip${on ? ' active' : ''}" data-sid="${Number(course.id)}" data-name="${App.escapeHtml(o.name)}" data-price="${Number(o.price) || 0}" aria-pressed="${on}">${App.escapeHtml(o.name)}${o.price > 0 ? ` <span style="font-weight:400;opacity:0.8">+${App.formatCurrency(o.price)}</span>` : ''}</button>`;
        }).join('') + '</div>';
    };
    const updateEstimate = async () => {
      const el = document.getElementById('f-appt-estimate');
      if (!el) return;
      const seq = ++estimateSeq;
      const picked = Array.from(document.querySelectorAll('input[name="serviceIds"]:checked'));
      if (picked.length === 0) { el.style.display = 'none'; renderLength([], []); return; }
      if (!svcCache) svcCache = await DB.getAll('services');
      if (seq !== estimateSeq || !el.isConnected) return;
      const byId = {}; svcCache.forEach(sv => { byId[sv.id] = sv; });
      const pickedSvcs = picked.map(cb => byId[Number(cb.value)]).filter(Boolean);
      const courses = pickedSvcs.filter(sv => (sv.category || 'grooming') === 'grooming');
      renderLength(courses, picked.map(cb => Number(cb.value)));
      let sum = 0, unknown = false;
      for (const cb of picked) {
        const sv = byId[Number(cb.value)];
        const base = Number(cb.dataset.price) || 0;
        let price = base, why = 'menu';
        if (sv && App.isExtraCategory(sv.category)) ({ price, why } = App.resolveExtraPrice(sv, base, { courses, pet: apptPet }));
        else if (sv) { const pp = App.getPetPrice(apptPet, sv.name); if (pp !== null) { price = pp; why = 'pet'; } }
        if (cb.dataset.needsWeight === '1' && why === 'menu') unknown = true;
        sum += price;
        // 칩 글자: 메뉴 값과 다르면 실제 들어갈 값 + 이유
        const pe = cb.closest('.service-chip')?.querySelector('.service-chip-price');
        if (pe) {
          if (!pe.dataset.menuHtml) pe.dataset.menuHtml = pe.innerHTML;
          pe.innerHTML = why === 'menu' ? pe.dataset.menuHtml : `${why === 'included' ? '포함' : App.formatCurrency(price)}<small class="service-chip-band">${why === 'included' ? '코스에 들어 있음' : why === 'pet' ? '이 아이 가격' : '이 코스 값'}</small>`;
        }
      }
      if (apptLength) sum += Number(apptLength.price) || 0; // 길이 추가금은 몸무게 구간 가격에 더한다
      // 고르지 않은 칩은 메뉴 글자로 되돌린다
      document.querySelectorAll('input[name="serviceIds"]:not(:checked)').forEach(cb => { const pe = cb.closest('.service-chip')?.querySelector('.service-chip-price'); if (pe && pe.dataset.menuHtml) pe.innerHTML = pe.dataset.menuHtml; });
      el.style.display = 'block';
      el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="color:var(--text-secondary)">예상 금액</span><strong>${unknown && sum === 0 ? '-' : App.formatCurrency(sum)}</strong></div>`
        + (unknown ? '<div style="font-size:0.93rem;color:var(--text-muted);margin-top:2px">몸무게를 넣으면 구간 가격으로 계산돼요</div>' : '');
    };
    const bindServiceChips = () => {
      // 서비스 칩 토글 (checked 클래스)
      document.querySelectorAll('.service-chip input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const chip = cb.closest('.service-chip');
          if (chip) chip.classList.toggle('checked', cb.checked);
          updateEstimate();
        });
      });
      updateEstimate();

      // 전체 선택/해제 토글
      document.getElementById('btn-toggle-services')?.addEventListener('click', (e) => {
        e.preventDefault();
        const checkboxes = document.querySelectorAll('input[name="serviceIds"]');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        // 숨겨 둔(더보기) 칩도 같이 켜지므로 보이게 펼친다 — 안 보이는 칩 값이 금액에 몰래 들어가지 않게
        if (!allChecked) document.querySelectorAll('#f-services .svc-more-btn').forEach(b => b.click());
        checkboxes.forEach(cb => {
          cb.checked = !allChecked;
          const chip = cb.closest('.service-chip');
          if (chip) chip.classList.toggle('checked', cb.checked);
        });
        const btn = document.getElementById('btn-toggle-services');
        if (btn) btn.textContent = allChecked ? '전체 선택' : '전체 해제';
        updateEstimate();
      });
    };
    // 지워진 서비스 칩에 보여줄 저장 이름 (id → 이름)
    this._formSvcNames = {};
    (appt.serviceIds || []).forEach((sid, i) => { const nm = (appt.serviceNames || [])[i]; if (nm) this._formSvcNames[Number(sid)] = nm; });
    await this._appendMissingServiceChips(document.getElementById('f-services'), (appt.serviceIds || []).map(Number), initialBasis);
    bindServiceChips();
    // '+ 더보기' 와 길이 칩 — 칩 목록을 다시 그려도 그대로 동작하게 바깥 상자에 한 번만 건다
    document.getElementById('f-services')?.addEventListener('click', (e) => {
      const more = e.target.closest('.svc-more-btn');
      if (more) {
        e.preventDefault();
        more.closest('.service-select-grid')?.querySelectorAll('[data-more-hidden]').forEach(c => { c.style.display = ''; c.removeAttribute('data-more-hidden'); });
        more.remove();
        return;
      }
      const lc = e.target.closest('.svc-length-chip');
      if (!lc) return;
      e.preventDefault();
      const same = apptLength && apptLength.serviceId === Number(lc.dataset.sid) && apptLength.name === lc.dataset.name;
      apptLength = same ? null : { serviceId: Number(lc.dataset.sid), name: lc.dataset.name, price: Number(lc.dataset.price) || 0 };
      this._formLength = apptLength;
      App._modalDirty = true;
      updateEstimate();
    });

    // 반려견이 바뀌면 그 아이의 구간 가격으로 칩을 다시 그린다 (선택한 서비스는 유지)
    let chipRenderSeq = 0;
    let lastSizeType = initialBasis;
    const rerenderChips = async () => {
      const seq = ++chipRenderSeq;
      const sizeType = App.getPetPriceBasis(apptPet);
      if (sizeType === lastSizeType) return;
      const checkedIds = Array.from(document.querySelectorAll('input[name="serviceIds"]:checked')).map(cb => Number(cb.value));
      const html = await App.getServiceCheckboxes(checkedIds, sizeType);
      const host = document.getElementById('f-services');
      if (seq !== chipRenderSeq || !host) return;
      host.innerHTML = html;
      lastSizeType = sizeType;
      await this._appendMissingServiceChips(host, checkedIds, sizeType);
      if (seq !== chipRenderSeq) return;
      bindServiceChips();
    };
    // '지난번처럼' 한 줄 — 반려견이 정해지면 그 아이의 마지막 예약·기록에서 고를 서비스를 만든다 (App.lastServicePick, 테스트 있음)
    let lastPick = null;
    let lastSeq = 0;
    const lastBtn = document.getElementById('btn-appt-last');
    const refreshLastPick = async () => {
      const my = ++lastSeq;
      const pid = Number(document.getElementById('f-petId')?.value);
      lastPick = null;
      if (pid) {
        const [pa, pr, svcs] = await Promise.all([DB.getByIndex('appointments', 'petId', pid), DB.getByIndex('records', 'petId', pid), DB.getAll('services')]);
        if (my !== lastSeq) return;
        lastPick = App.lastServicePick(pa, pr, svcs, { excludeId: id || null, today: App.getToday() });
      }
      if (!lastBtn || !lastBtn.isConnected) return;
      lastBtn.style.display = lastPick ? 'flex' : 'none';
      lastBtn.textContent = lastPick ? '↺ 지난번처럼: ' + lastPick.label : '';
    };
    lastBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!lastPick) return;
      const want = new Set(lastPick.serviceIds.map(Number));
      document.querySelectorAll('#f-services input[name="serviceIds"]').forEach(cb => {
        cb.checked = want.has(Number(cb.value));
        const chip = cb.closest('.service-chip');
        if (chip) {
          chip.classList.toggle('checked', cb.checked);
          // 더보기 뒤에 숨은 칩을 골랐으면 보이게
          if (cb.checked && chip.hasAttribute('data-more-hidden')) { chip.style.display = ''; chip.removeAttribute('data-more-hidden'); }
        }
      });
      document.querySelectorAll('#f-services .svc-more-btn').forEach(b => {
        const n = b.closest('.service-select-grid')?.querySelectorAll('[data-more-hidden]').length || 0;
        if (n) b.textContent = '+ 더보기 ' + n; else b.remove();
      });
      apptLength = lastPick.length ? { ...lastPick.length } : null;
      this._formLength = apptLength;
      App._modalDirty = true;
      updateEstimate();
    });
    refreshLastPick().catch(err => console.warn('지난번처럼 실패:', err));
    document.getElementById('f-petId')?.addEventListener('change', async (e) => {
      const petId = Number(e.target.value);
      refreshLastPick().catch(() => {});
      apptPet = petId ? await DB.get('pets', petId) : null;
      await rerenderChips();
      updateEstimate(); // 몸무게 구간이 같아도 이 아이 가격은 다를 수 있다
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
    document.getElementById('btn-undo-complete')?.addEventListener('click', () => this.undoComplete(id));
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

    // 반려견 칸: 여러 마리면 최근에 온 아이를 골라 두고 안내 한 줄 (고객을 고를 때 + 고객이 정해진 채 열 때 공통)
    const applyPetChoice = async (cid) => {
      // 여러 마리면 빈칸으로 두지 않고 가장 최근에 온 반려견(없으면 첫 번째)을 골라 둔다 — 선택 상자는 그대로라 바로 바꿀 수 있다
      const petSel = document.getElementById('f-petId');
      if (cid && petSel && !petSel.value) {
        const ids = [...petSel.options].map(o => Number(o.value)).filter(Boolean);
        if (ids.length > 1) {
          const cPets = (await DB.getByIndex('pets', 'customerId', Number(cid))).filter(p => ids.includes(p.id));
          cPets.sort((a, b) => (b.lastVisitDate || '').localeCompare(a.lastVisitDate || '') || ids.indexOf(a.id) - ids.indexOf(b.id));
          if (cPets[0] && !petSel.value) { petSel.value = String(cPets[0].id); petSel.dispatchEvent(new Event('change')); }
        }
      }
      // 2마리 이상이면 반려견 칸을 눈에 띄게 + 안내 한 줄 (기록 폼 markPetChoice 와 같은 모양·문구)
      if (petSel && petSel.isConnected) {
        const n = cid ? [...petSel.options].filter(o => Number(o.value)).length : 0;
        petSel.classList.toggle('pet-choose-many', n >= 2);
        petSel.style.borderColor = n >= 2 ? 'var(--primary)' : '';
        petSel.style.borderWidth = n >= 2 ? '2px' : '';
        let hint = document.getElementById('f-pet-many-hint');
        if (n >= 2) {
          if (!hint) { hint = document.createElement('div'); hint.id = 'f-pet-many-hint'; hint.className = 'form-hint'; hint.style.cssText = 'color:var(--primary);font-weight:700'; petSel.after(hint); }
          hint.textContent = `반려견이 ${n}마리예요 — 최근에 온 아이를 골라 뒀어요. 다른 아이면 바꿔 주세요`;
        } else if (hint) hint.remove();
      }
    };
    // 노쇼·당일 취소 이력 경고 (최근 6개월) — 고객을 고르면 고객 칸 아래 한 줄. 없으면 비운다
    const showNoShowWarning = async (cid) => {
      const warn = document.getElementById('noshow-warning');
      if (!warn) return;
      let line = '';
      const ticket = (showNoShowWarning._t = (showNoShowWarning._t || 0) + 1); // 고객을 빨리 바꾸면 앞 고객 경고가 늦게 덮지 않게
      if (cid) {
        try {
          const custAppts = await DB.getByIndex('appointments', 'customerId', Number(cid));
          line = App.noShowLine(App.noShowStats(custAppts, App.getToday())[Number(cid)]);
        } catch (e) { console.warn('노쇼 이력 읽기 실패', e); }
      }
      if (ticket !== showNoShowWarning._t) return;
      warn.innerHTML = line ? `<div style="color:var(--danger);font-size:0.93rem;margin-top:4px;font-weight:600">${App.icon('alert')} ${line}</div>` : '';
    };
    // 검색 가능한 고객 선택 렌더링
    await App.renderCustomerSelect('appt-customer-select', appt.customerId, async (cid, preferPetId) => {
      // 반려견 목록 갱신 + 없으면 그 자리에서 등록 버튼 제공
      await App.refreshPetSelect(cid, preferPetId);
      await applyPetChoice(cid);
      await showNoShowWarning(cid);
    });
    // 고객이 정해진 채로 연 새 예약(고객 상세 '+ 예약' 등): 반려견 미리 고르기 + 안내. 수정은 저장된 반려견을 그대로 둔다
    // (아래 '고객만 정해진 채로 열렸으면 반려견 목록을 다시 그린다' 뒤에서 고른다 — 그 다시 그리기가 골라 둔 값을 지웠다)

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
        existingWarn.innerHTML = `<div style="color:var(--danger);font-size:0.93rem;margin-top:4px;font-weight:600">${App.icon('alert')} ${dayNames[dow]}요일은 휴무일입니다</div>`;
      } else {
        existingWarn.innerHTML = '';
      }
    };
    document.getElementById('f-date')?.addEventListener('change', checkClosedDay);
    checkClosedDay();

    // 고객만 정해진 채로 열렸으면 반려견 목록을 다시 그린다 — 활동 중인 아이가 하나면 자동 선택,
    // 하나도 없으면 그 자리에서 등록 버튼 제공
    if (appt.customerId && !appt.petId) await App.refreshPetSelect(appt.customerId);
    // 고객이 정해진 채로 연 새 예약(고객 상세 '+ 예약' 등): 목록이 확정된 뒤 반려견 미리 고르기 + 안내. 수정은 저장된 반려견 그대로
    if (!id && appt.customerId) await applyPetChoice(appt.customerId);

    // 기존 고객 선택 시 노쇼 이력 즉시 표시
    if (appt.customerId) await showNoShowWarning(appt.customerId);
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

    // 휴무일 예약 — 시간 겹침과 같은 방식으로 한 번 묻는다 (예전엔 빨간 안내만 뜨고 그냥 저장됐다).
    // 수정 중 날짜를 바꾸지 않았으면 이미 확인한 예약이므로 다시 묻지 않는다.
    {
      const closedDays = ((await DB.getSetting('closedDays')) || []).map(Number);
      const dow = App.parseLocalDate(date).getDay();
      const prevDate = id ? (await DB.get('appointments', id))?.date : null;
      if (closedDays.includes(dow) && prevDate !== date) {
        const ok = await App.confirm(`${App.formatDateKo(date)}은 휴무일입니다.<br>그래도 예약할까요?`, { okLabel: '그래도 저장', danger: false });
        if (!ok) return;
        // confirm 이 닫히며 내는 history.back() 이 처리된 뒤에 다음 단계로
        await new Promise(r => setTimeout(r, 180));
      }
    }

    // Check time conflict (duration-aware)
    if (time) {
      const dayAppts = await DB.getByIndex('appointments', 'date', date);
      const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const newStart = toMin(time);
      const newEnd = newStart + duration;
      const others = dayAppts.filter(a => a.id !== id && a.time && a.status !== 'cancelled' && a.status !== 'noshow');
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
      // 서비스 이름도 함께 저장 — 나중에 서비스가 지워져도 예약에 이름이 남도록 (serviceIds 와 같은 순서)
      const svcNameMap = {}; (await DB.getAll('services')).forEach(s => { svcNameMap[s.id] = s.name; });
      const serviceNames = serviceIds.map(sid => svcNameMap[sid] || (this._formSvcNames && this._formSvcNames[sid]) || '');
      // 길이(예: 7F)는 그 코스가 체크돼 있을 때만 남긴다. 없으면 null — 수정 때 예전 길이가 남지 않게
      const fl = this._formLength;
      const length = fl && serviceIds.includes(Number(fl.serviceId)) ? { serviceId: Number(fl.serviceId), name: fl.name, price: Number(fl.price) || 0 } : null;
      const data = { customerId, petId, date, time, duration, groomer, status, serviceIds, serviceNames, length, memo };
      // 몸무게 칸은 없앴다. 예전 예약의 weightAtBooking 은 그대로 둔다 (Object.assign 이 덮지 않음) — 반려견을 바꿨을 때만 지운다

      if (id) {
        const existing = await DB.get('appointments', id);
        if (!existing) { App.showToast('예약을 찾을 수 없습니다.', 'error'); return; }
        // 날짜·시간이 바뀌면 이전 일정에 대한 리마인더 발송 기록은 무효
        if (existing.date !== data.date || existing.time !== data.time) delete existing.reminderSentAt;
        if (Number(existing.petId) !== petId) delete existing.weightAtBooking;
        // 취소·노쇼 예약의 날짜·시간을 바꾸면 = 다시 잡은 예약. 원래 건(취소·노쇼 이력)은 그대로 두고 새 '대기' 예약으로 저장한다
        if (['cancelled', 'noshow'].includes(existing.status) && (existing.date !== data.date || existing.time !== data.time)) {
          const fresh = { ...data, status: 'pending' };
          await DB.add('appointments', fresh);
          App.showToast('새 예약으로 등록했어요');
        } else {
          Object.assign(existing, data);
          await DB.update('appointments', existing);
          App.showToast('예약이 수정되었습니다.');
        }
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
                if (!a.time || a.status === 'cancelled' || a.status === 'noshow') return false;
                const isSameResource = (groomer && a.groomer && a.groomer === groomer) || a.petId === petId;
                if (!isSameResource) return false;
                const aStart = toMin(a.time);
                const aEnd = aStart + (a.duration || 60);
                return newStart < aEnd && newEnd > aStart;
              });
              if (conflict) { skipped++; continue; }
            }
            // 첫 예약 저장 때 붙은 id 는 빼고 새로 받는다 (동기화 켜짐 상태에서 2번째부터 저장 오류가 나던 문제)
            const repeatData = { ...data, date: nextDate };
            delete repeatData.id;
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
        // 예전엔 '예약이 등록되었습니다 / 문자 보내기 / 닫기' 창이 한 번 더 떴다 → 토스트 한 줄 + '문자 보내기' 하나
        const { phone, msg, petName, when } = postSaveSms;
        App.showToast(`예약 등록 · ${petName ? petName + ' ' : ''}${when}`, 'success', {
          duration: 8000,
          action: { label: '문자 보내기', onClick: () => App.openSms(phone, msg) }
        });
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
      // 예약 상태는 여기서 바꾸지 않는다. 기록을 저장해야 records.saveRecord 가 completed 로 바꾼다.
      // (예전엔 폼을 열 때 '미용중'으로 바꾸고 닫을 때 되돌렸는데, 폼이 열린 채 앱이 꺼지면 '미용중'이 계속 남았다)
      App.pages.records.showForm(null, appt);
      const _origClose = App._modalOnClose;
      App._modalOnClose = async () => {
        if (_origClose) _origClose();
        // 저장이든 취소든 홈 카드(예약 상태·미결제·오늘 매출)를 다시 그리게 한다.
        // 기록 저장 직후 records.saveRecord 가 handleRoute 를 부르는데, 대시보드의 5초 캐시 때문에
        // 다시 그리지 않아 이전 상태·매출이 새로고침 전까지 남던 문제.
        App._dashboardDirty = true;
        // 기록을 저장하지 않고 닫았으면 상태 선택 상자를 원래 값으로 (예약 자체는 바뀐 게 없다)
        const current = await DB.get('appointments', id);
        if (current && current.status !== 'completed' && onCancel) onCancel();
        App._modalOnClose = null;
      };
    } catch (err) {
      console.error('Complete to record error:', err);
      App.showToast('처리 중 오류가 발생했습니다.', 'error');
    }
  },

  // 반복 예약 묶음 중 이 예약 날짜 이후의 미진행 건을 모두 '취소' 상태로 (삭제가 아니라 상태 변경 — 이력 보존, 되돌리기 가능)
  // '기록 없이 완료'를 되돌린다 → 확정. 그때 당겨 둔 반려견 마지막 방문일이 이 예약 날짜면 기록 기준으로 다시 계산한다
  async undoComplete(id) {
    const appt = await DB.get('appointments', id);
    if (!appt || appt.status !== 'completed') return;
    const petRecs = appt.petId ? await DB.getByIndex('records', 'petId', Number(appt.petId)) : [];
    if (petRecs.some(r => String(r.appointmentId) === String(id))) {
      App.showToast('미용 기록이 있는 예약입니다. 기록을 삭제하면 예약이 되돌아갑니다.', 'warning');
      return;
    }
    const ok = await App.confirm('완료를 취소하고 \'확정\'으로 되돌릴까요?', { okLabel: '완료 취소', cancelLabel: '돌아가기', danger: false });
    if (!ok) return;
    try {
      appt.status = 'confirmed';
      await DB.update('appointments', appt);
      if (appt.petId) {
        const pet = await DB.get('pets', Number(appt.petId));
        if (pet && pet.lastVisitDate === appt.date) await App.pages.records._recalcPetLastVisit(Number(appt.petId));
      }
      App._dashboardDirty = true;
      App.showToast('완료를 취소했습니다.');
      await new Promise(r => setTimeout(r, 180)); // confirm 의 history.back() 처리 후 모달 닫기
      App.closeModal();
      App.handleRoute();
    } catch (err) {
      console.error('undoComplete error:', err);
      App.showToast('처리 중 오류가 발생했습니다.', 'error');
    }
  },

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
      { okLabel: `${targets.length}건 취소`, cancelLabel: '돌아가기' });
    if (!ok) return;
    try {
      for (const a of targets) {
        a.status = 'cancelled';
        a.cancelReason = '반복 중단';
        App.markCancelledAt(a, 'cancelled');
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
    const confirmed = await App.confirm(`이 예약을 삭제할까요?<br>${detail}`, { okLabel: '삭제', cancelLabel: '돌아가기' });
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
