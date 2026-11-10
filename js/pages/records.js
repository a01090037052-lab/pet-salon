// ========== Grooming Records Page ==========
App.pages.records = {
  async render(container) {
    const isMobile = window.matchMedia('(max-width: 1023px)').matches;
    // 넓은 화면(1280px~): 왼쪽 목록 + 오른쪽 상세(영수증) 칸. 그보다 좁으면 예전 그대로
    const isWide = window.matchMedia('(min-width: 1280px)').matches;
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
      return ` <span style="font-size:0.93rem;color:var(--text-muted)">수금 ${Number(pm)}/${Number(pd)}</span>`;
    };
    const getGroupLabel = (date) => {
      if (!date) return '날짜 없음';
      if (date === todayStr) return '오늘';
      if (date === yesterdayStr) return '어제';
      if (date >= weekAgoStr) return '최근 7일'; // 지난 7일 (월요일 시작 '이번 주'가 아니다 — 월요일에 지난주 기록이 '이번 주'로 보였다)
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
    // 담당 미용사는 미용사가 2명 이상 등록됐을 때만 목록에 보인다 (1인 매장은 늘 같은 이름이라 자리만 차지)
    const showGroomer = ((await DB.getSetting('groomers')) || []).length >= 2;

    // 미결제 경고 카드용 집계 — 불러온 기간이 아니라 전체 기간 (paymentMethod 인덱스, 미결제 건만 읽음)
    const unpaidRecs = loadMode === 'unpaid'
      ? records
      : (await DB.getByIndex('records', 'paymentMethod', 'unpaid'));
    const unpaidTotal = unpaidRecs.reduce((sum, r) => sum + App.getUnpaidAmount(r), 0);

    // ========== 목록 행/카드 빌더 (점진 렌더용) ==========
    // 데이터는 메모리에 다 두고 DOM에는 150개씩만 붙인다 (3년치 수천 건을 한 번에 그리면 iPhone 메모리 부족)
    const colspan = showGroomer ? 8 : 7;
    const searchKeys = new WeakMap();
    const searchKey = (r) => {
      let k = searchKeys.get(r);
      if (k === undefined) {
        const customer = customerMap[r.customerId];
        const pet = petMap[r.petId];
        k = ((customer?.name || '') + ' ' + (pet?.name || '') + ' ' + (customer?.phone || '') + ' ' + (r.service || '') + ' ' + (r.style || '') + ' ' + (r.memo || '') + ' ' + (r.groomer || '')).toLowerCase();
        searchKeys.set(r, k);
      }
      return k;
    };
    const headerHtml = (gLabel) => isMobile
      ? `<div class="record-group-header" data-group="${gLabel}">${gLabel}<span class="group-count">${groupCounts[gLabel]}건</span></div>`
      : `<tr class="record-group-header-row" data-group="${gLabel}"><td colspan="${colspan}" class="record-group-header-cell">${gLabel} <span style="color:var(--text-muted);font-weight:400;margin-left:6px">(${groupCounts[gLabel]}건)</span></td></tr>`;
    // 합계 0원(서비스 제공 등)이고 미결제가 아니면 결제 수단 글자를 붙이지 않는다 — 받은 돈이 없는데 '카드'로 보였다
    const zeroPaid = (r) => r.paymentMethod !== 'unpaid' && App.getRecordAmount(r) === 0;
    const rowHtml = (r) => {
      const customer = customerMap[r.customerId];
      const pet = petMap[r.petId];
      const serviceNames = App.getRecordServiceDisplay(r, serviceMap);
      const gLabel = getGroupLabel(r.date);
      return `
                    <tr data-id="${r.id}"${isWide && r.id === this._paneRecordId ? ' class="is-selected"' : ''} data-month="${(r.date || '').slice(0, 7)}" data-group="${gLabel}"
                        data-payment="${r.paymentMethod || ''}"
                        data-amount="${App.getRecordAmount(r)}"
                        style="${r.paymentMethod === 'unpaid' ? 'background:var(--warning-light);border-left:3px solid var(--danger)' : ''}">
                      <td>${App.formatDate(r.date)}</td>
                      <td><a href="#pets/${r.petId}" style="color:var(--primary);font-weight:700" onclick="event.stopPropagation()">${App.escapeHtml(pet?.name || '-')}</a> <span style="color:var(--text-muted);font-size:0.93rem">${App.escapeHtml(App.getCustomerLabel(customer))}</span></td>
                      <td class="hide-mobile"><span style="font-size:0.93rem">${App.escapeHtml(serviceNames)}</span>${Array.isArray(r.complimentary) && r.complimentary.length ? ' <span class="badge badge-success" style="font-size:0.93rem;padding:1px 6px">서비스 제공</span>' : ''}</td>
                      <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong>${r.discount || r.extraCharge ? `<div style="font-size:0.93rem;color:var(--text-muted)">${r.discount ? '-' + App.formatCurrency(r.discount) : ''}${r.extraCharge ? '+' + App.formatCurrency(r.extraCharge) : ''}</div>` : ''}</td>
                      ${showGroomer ? `<td class="hide-mobile">${App.escapeHtml(r.groomer || '-')}</td>` : ''}
                      <td class="hide-mobile">${zeroPaid(r) ? '' : this.getPaymentLabel(r.paymentMethod, r) + paidNote(r)}</td>
                      <td class="hide-mobile" style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${App.escapeHtml(r.memo || '')}">
                        ${App.escapeHtml(r.memo || '')}
                      </td>
                      <td class="table-actions">
                        <button class="btn-icon btn-report-record" data-id="${r.id}" title="보호자에게 보내기 (리포트 · 영수증)" aria-label="보호자에게 보내기" style="color:var(--info)">${App.icon('send')}</button>
                        <button class="btn-icon btn-photocard-record" data-id="${r.id}" title="사진 카드 만들기" aria-label="사진 카드 만들기">${App.icon('image')}</button>
                        <button class="btn-icon btn-edit-record" data-id="${r.id}" title="수정" aria-label="수정">${App.icon('edit')}</button>
                      </td>
                    </tr>`;
    };
    const cardHtml = (r) => {
      const customer = customerMap[r.customerId];
      const pet = petMap[r.petId];
      const isUnpaid = r.paymentMethod === 'unpaid';
      const svcText = App.getRecordServiceDisplay(r, serviceMap);
      const gLabel = getGroupLabel(r.date);
      return `
              <div class="mobile-card${isUnpaid ? ' mobile-card-unpaid' : ''}" data-id="${r.id}" data-month="${(r.date || '').slice(0, 7)}" data-group="${gLabel}"
                   data-payment="${r.paymentMethod || ''}"
                   data-amount="${App.getRecordAmount(r)}">
                <div class="mobile-card-header">
                  <span class="mobile-card-date"><strong>${App.formatDate(r.date)}</strong>${r.status === 'in_progress' ? ' <span class="badge badge-warning" style="font-size:0.93rem;padding:3px 8px">진행중</span>' : ''}</span>
                  <span class="mobile-card-amount"><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></span>
                </div>
                <div class="mobile-card-body">
                  <span class="mobile-card-info">${App.icon('paw')} <strong>${App.escapeHtml(pet?.name || '-')}</strong> &middot; ${App.escapeHtml(App.getCustomerLabel(customer))}</span>
                  ${svcText && svcText !== '-' ? `<div class="mobile-card-service">${App.escapeHtml(svcText)}</div>` : ''}
                  <div class="mobile-card-meta">
                    ${showGroomer ? `<span>${App.icon('scissors')} ${App.escapeHtml(r.groomer || '-')}</span>` : ''}
                    <!-- 미결제는 빨간 배지 하나만 (결제수단 글자 '미결제' + 배지가 겹쳐 '미결제 미결제'로 보였다) -->
                    ${isUnpaid || zeroPaid(r) ? '' : `<span>${this.getPaymentLabel(r.paymentMethod, r)}${paidNote(r)}</span>`}
                    ${App._recordHasPhoto(r) ? `<span>${App.icon('camera')} 사진</span>` : ''}
                    ${Number(r.complimentaryTotal) > 0 || (Array.isArray(r.complimentary) && r.complimentary.length) ? `<span class="badge badge-success" style="font-size:0.93rem;padding:2px 8px" title="서비스 제공: ${App.escapeHtml((r.complimentary || []).map(c => c.name).join(', '))}">서비스 제공</span>` : ''}
                    ${isUnpaid ? '<span class="badge badge-danger">미결제</span>' : ''}
                  </div>
                  ${r.memo ? `<div style="font-size:0.93rem;color:var(--text-secondary);margin-top:6px;padding-top:6px;border-top:1px dashed var(--border-light);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${App.escapeHtml(r.memo)}">${App.icon('note')} ${App.escapeHtml(r.memo.length > 60 ? r.memo.slice(0, 60) + '...' : r.memo)}</div>` : ''}
                </div>
                <!-- 카드를 누르면 수정. 삭제는 수정 화면 안에서만 (목록에서 잘못 눌러 지우는 일 방지)
                     보내기 하나만 둔다 — 영수증은 보내기(리포트) 화면의 '영수증' 버튼에서 연다 -->
                <div class="mobile-card-actions record-card-actions">
                  <button class="btn btn-sm btn-ghost btn-photocard-record" data-id="${r.id}">${App.icon('image')} 사진 카드</button>
                  <button class="btn btn-sm btn-ghost btn-report-record" data-id="${r.id}">${App.icon('send')} 보호자에게 보내기</button>
                </div>
              </div>`;
    };
    this._list = {
      isMobile, sorted, filtered: sorted, shown: 0, lastGroup: null,
      groupCounts, getGroupLabel, searchKey, headerHtml,
      itemHtml: isMobile ? cardHtml : rowHtml
    };

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
            <div style="font-weight:800;color:var(--danger);font-size:1rem">미결제 경고</div>
            <div style="font-size:0.93rem;color:var(--danger-text-strong);margin-top:2px">전체 기간 ${unpaidRecs.length}건 &middot; ${App.formatCurrency(unpaidTotal)}</div>
          </div>
          <span style="color:var(--danger);font-weight:600;font-size:0.93rem">눌러서 보기 &rarr;</span>
        </div>
      </div>
      ` : ''}

      <div class="filter-bar">
        <div class="search-box" style="max-width:none">
          <span class="search-icon">${App.icon('search')}</span>
          <input type="text" id="record-search" placeholder="이름·반려견·서비스·초성(ㅊㅋ)" style="min-height:40px">
        </div>
        <div class="filter-bar-row">
          <input type="month" id="filter-month" value="${jumpMonth}" placeholder="월 점프" style="flex:1;min-height:44px">
          <select id="filter-payment" style="flex:1;min-height:44px">
            <option value="">전체 결제</option>
            <option value="cash">현금</option>
            <option value="card">카드</option>
            <option value="transfer">계좌이체</option>
            <option value="unpaid">미결제</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="btn-clear-filter" style="flex:0 0 auto;min-height:44px;white-space:nowrap">초기화</button>
        </div>
      </div>

      <div id="record-filter-total" style="display:none;padding:12px 16px;margin-bottom:12px;background:var(--bg);border-radius:var(--radius);font-size:0.93rem;font-weight:600;gap:8px;flex-wrap:wrap;justify-content:space-between;align-items:center"></div>

      ${isWide ? '<div class="records-md"><div class="records-md-list">' : ''}
      <div class="card">
        <div class="card-body no-padding" id="record-list-wrap">
          ${isMobile ? '' : `<div class="table-container">
            <table class="data-table" id="record-table">
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>반려견 / 보호자</th>
                  <th class="hide-mobile">서비스</th>
                  <th>금액</th>
                  ${showGroomer ? '<th class="hide-mobile">담당</th>' : ''}
                  <th class="hide-mobile">결제</th>
                  <th class="hide-mobile">메모</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody id="record-tbody">
                ${sorted.length === 0 ? `
                  <tr><td colspan="${colspan}">
                    <div class="empty-state">
                      <div class="empty-state-icon">${App.icon('scissors', 'ico-xl')}</div>
                      <div class="empty-state-text">${emptyMessage}</div>
                    </div>
                  </td></tr>
                ` : ''}
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
            ` : ''}
          </div>`}
          <!-- 항목은 init → applyFilters → _appendRecordChunk 가 150개씩 붙인다 (수천 건을 한 번에 DOM에 넣지 않음) -->
          <div id="record-no-match" style="display:none;padding:28px 16px;text-align:center;color:var(--text-muted);font-size:0.93rem">조건에 맞는 기록이 없습니다</div>
          <div id="record-sentinel" style="display:none;padding:12px;text-align:center">
            <button class="btn btn-ghost btn-sm" id="btn-record-more-dom" style="min-height:40px"></button>
          </div>
        </div>
      </div>
      <div id="record-load-more-wrap">${this._loadMoreHtml()}</div>
      ${loadMode !== 'recent' ? `
        <div style="margin-top:16px;padding:12px;text-align:center">
          <button class="btn btn-secondary btn-sm" id="btn-back-to-recent" style="min-height:40px">
            &larr; 최근 기록으로 돌아가기
          </button>
        </div>
      ` : ''}
      ${isWide ? `</div><aside class="records-md-pane" id="record-detail-pane" aria-live="polite">${this._paneEmptyHtml()}</aside></div>` : ''}

    `;
  },

  _paneEmptyHtml() {
    return `<div class="records-md-empty">${App.icon('receipt')}<div>왼쪽에서 기록을 누르면<br>여기에 자세히 보여요</div></div>`;
  },

  // 넓은 화면 오른쪽 칸에 기록 상세(영수증 + 수정·보내기·문자·인쇄). 목록은 다시 그리지 않아 스크롤 위치가 그대로다
  async _showRecordPane(id) {
    const pane = document.getElementById('record-detail-pane');
    if (!pane) return;
    const seq = (this._paneSeq || 0) + 1;
    this._paneSeq = seq;
    const built = await this._buildReceipt(id);
    if (seq !== this._paneSeq || !pane.isConnected) return;
    document.querySelectorAll('#record-tbody tr.is-selected').forEach(tr => tr.classList.remove('is-selected'));
    if (!built) { this._paneRecordId = null; pane.innerHTML = this._paneEmptyHtml(); return; }
    this._paneRecordId = id;
    document.querySelector(`#record-tbody tr[data-id="${id}"]`)?.classList.add('is-selected');
    const { record, customer, pet, customerPhone } = built;
    pane.innerHTML = `
      <div class="records-md-head">
        <div><strong>${App.escapeHtml(pet?.name || '-')}</strong> <span class="records-md-sub">${App.escapeHtml(App.getCustomerLabel(customer))} · ${App.formatDate(record.date)}</span></div>
        <button type="button" class="btn-icon" data-pane="close" aria-label="상세 닫기" title="닫기">${App.icon('close')}</button>
      </div>
      <div class="records-md-actions">
        <button type="button" class="btn btn-primary" data-pane="report">${App.icon('send')} 보호자에게 보내기</button>
        <button type="button" class="btn btn-secondary" data-pane="edit">${App.icon('edit')} 수정</button>
        ${customerPhone ? `<button type="button" class="btn btn-secondary" data-pane="sms">${App.icon('message')} 완료 문자</button>` : ''}
        <button type="button" class="btn btn-secondary" data-pane="photocard">${App.icon('image')} 사진 카드</button>
        <button type="button" class="btn btn-secondary" data-pane="print">${App.icon('print')} 인쇄</button>
      </div>
      <div class="records-md-receipt">${built.html.replace('id="receipt-print-area"', 'class="receipt-pane-area"')}</div>`;
    pane.onclick = (e) => {
      const act = e.target.closest('[data-pane]')?.dataset.pane;
      if (!act) return;
      if (act === 'close') {
        this._paneRecordId = null;
        pane.innerHTML = this._paneEmptyHtml();
        document.querySelectorAll('#record-tbody tr.is-selected').forEach(tr => tr.classList.remove('is-selected'));
      } else if (act === 'edit') this.showForm(record.id);
      else if (act === 'report') this.showReport(record.id);
      else if (act === 'sms') this._sendCompleteSms(record, customer, pet);
      else if (act === 'photocard') {
        if (this._photoCardStarting) return; // 두 번 눌러 창이 두 번 열리지 않게
        this._photoCardStarting = true;
        this.startPhotoCard({ recordId: record.id })
          .catch(err => { console.error('사진 카드 열기 실패:', err); App.showToast('사진 카드를 열지 못했습니다.', 'error'); })
          .finally(() => { this._photoCardStarting = false; });
      }
      // 인쇄는 영수증 창(인쇄용 스타일이 있는 곳)을 열어 거기서 인쇄
      else if (act === 'print') this.showReceipt(record.id).then(() => setTimeout(() => window.print(), 300));
    };
  },

  // '더 오래된 기록 보기' 영역 (render 와 _loadOlderRecords 가 같이 씀)
  _loadMoreHtml() {
    const loaded = this._list ? this._list.sorted.length : 0;
    const total = this._totalCount || 0;
    if (this._canLoadMore) return `
        <div style="margin-top:16px;padding:12px;text-align:center">
          <button class="btn btn-secondary" id="btn-load-more" style="min-height:44px;min-width:200px">
            더 오래된 기록 보기 (이전 90일)
          </button>
          <div style="margin-top:8px;font-size:0.93rem;color:var(--text-muted)">불러온 ${loaded.toLocaleString('ko-KR')}건 / 총 ${total.toLocaleString('ko-KR')}건</div>
        </div>`;
    if (this._loadMode === 'recent' && total > 0 && loaded === total) return `
        <div style="margin-top:16px;padding:12px;text-align:center;color:var(--text-muted);font-size:0.93rem">
          ${App.icon('check')} 모든 기록을 불러왔습니다 (${total.toLocaleString('ko-KR')}건)
        </div>`;
    return '';
  },

  // 화면에 아직 안 붙인 (필터 통과한) 기록을 count(기본 150)개 더 붙인다 — 기존 항목은 다시 그리지 않음
  _appendRecordChunk(count = 150) {
    const L = this._list;
    const listEl = document.getElementById(L?.isMobile ? 'record-card-list' : 'record-tbody');
    if (!L || !listEl || L.sorted.length === 0) return;
    const end = Math.min(L.shown + count, L.filtered.length);
    let html = '';
    for (let i = L.shown; i < end; i++) {
      const r = L.filtered[i];
      const g = L.getGroupLabel(r.date);
      if (g !== L.lastGroup) { html += L.headerHtml(g); L.lastGroup = g; }
      html += L.itemHtml(r);
    }
    if (html) listEl.insertAdjacentHTML('beforeend', html);
    L.shown = end;
    const remaining = L.filtered.length - L.shown;
    const sentinel = document.getElementById('record-sentinel');
    if (sentinel) sentinel.style.display = remaining > 0 ? '' : 'none';
    const moreBtn = document.getElementById('btn-record-more-dom');
    if (moreBtn && remaining > 0) moreBtn.textContent = `더 보기 (${remaining.toLocaleString('ko-KR')}건 남음)`;
    // 붙인 뒤에도 sentinel 이 여전히 화면 근처면 IntersectionObserver 가 다시 알리지 않으므로 재등록
    if (this._recObserver && sentinel && remaining > 0) {
      this._recObserver.unobserve(sentinel);
      this._recObserver.observe(sentinel);
    }
  },

  // 이전 90일을 더 불러와 목록 끝에 이어 붙인다 (전체 재렌더 없음 → 스크롤 위치·이미 그린 항목 유지)
  async _loadOlderRecords() {
    const L = this._list;
    if (!L || this._loadingOlder) return;
    this._loadingOlder = true;
    const btn = document.getElementById('btn-load-more');
    if (btn) { btn.disabled = true; btn.textContent = '불러오는 중...'; }
    try {
      const wasAtEnd = L.shown >= L.filtered.length;
      const oldDays = this._daysBack || 90;
      const newDays = oldDays + 90;
      const from = new Date(); from.setDate(from.getDate() - newDays);
      const to = new Date(); to.setDate(to.getDate() - oldDays - 1); // 기존 범위 시작일 전날까지 (겹침 없음)
      const more = await DB.getByDateRange('records', 'date', App.formatLocalDate(from), App.formatLocalDate(to));
      more.forEach(r => { delete r.photoBefore; delete r.photoAfter; });
      more.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      // 그룹 건수 갱신 (경계 달은 이미 그려진 헤더의 숫자도 바뀜)
      const touched = new Set();
      more.forEach(r => {
        const g = L.getGroupLabel(r.date);
        L.groupCounts[g] = (L.groupCounts[g] || 0) + 1;
        touched.add(g);
      });
      L.sorted.push(...more); // 모두 기존 것보다 오래된 날짜라 정렬 유지
      this._daysBack = newDays;
      this._canLoadMore = L.sorted.length < (this._totalCount || 0);
      let saved = {};
      try { saved = JSON.parse(sessionStorage.getItem('record-filter') || '{}') || {}; } catch (_) {}
      sessionStorage.setItem('record-filter', JSON.stringify({ ...saved, _loadMode: 'recent', _daysBack: newDays }));
      document.querySelectorAll('.record-group-header-row, .record-group-header').forEach(hdr => {
        if (touched.has(hdr.dataset.group)) hdr.outerHTML = L.headerHtml(hdr.dataset.group);
      });
      const sub = document.querySelector('.page-subtitle');
      if (sub) {
        const label = newDays >= 365 ? `최근 ${Math.round(newDays / 365)}년` : `최근 ${newDays}일`;
        sub.innerHTML = `총 ${(this._totalCount || 0).toLocaleString('ko-KR')}건 <span style="color:var(--text-muted);font-weight:400">· ${label} ${L.sorted.length.toLocaleString('ko-KR')}건</span>`;
      }
      // 필터·합계는 늘어난 데이터 기준으로 다시 계산하되, 이미 그린 항목은 그대로 두고 뒤에만 붙인다
      // (아직 안 그린 항목이 남아 있었다면 새로 붙이지 않고 스크롤 시 sentinel 이 이어 붙임)
      this.applyFilters({ keepRendered: true, appendNow: wasAtEnd });
      const wrap = document.getElementById('record-load-more-wrap');
      if (wrap) wrap.innerHTML = this._loadMoreHtml();
      document.getElementById('btn-load-more')?.addEventListener('click', () => this._loadOlderRecords());
    } catch (err) {
      console.error('이전 기록 불러오기 실패:', err);
      App.showToast('이전 기록을 불러오지 못했습니다.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = '더 오래된 기록 보기 (이전 90일)'; }
    } finally {
      this._loadingOlder = false;
    }
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

    // 미결제 경고 카드 -> 미결제 모드 (전체 기간 paymentMethod 인덱스 쿼리)
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

    // 더 보기: 이전 90일을 추가 로드해 목록 끝에 이어 붙임 (전체 재렌더 X)
    document.getElementById('btn-load-more')?.addEventListener('click', () => this._loadOlderRecords());

    // 화면 아래에 가까워지면 다음 묶음을 붙인다 (IntersectionObserver 미지원이면 '더 보기' 버튼으로)
    this._recObserver?.disconnect();
    this._recObserver = null;
    document.getElementById('btn-record-more-dom')?.addEventListener('click', () => this._appendRecordChunk());
    const sentinel = document.getElementById('record-sentinel');
    if (sentinel && 'IntersectionObserver' in window) {
      this._recObserver = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting) && sentinel.isConnected) this._appendRecordChunk();
      }, { rootMargin: '800px 0px' });
      this._recObserver.observe(sentinel);
    }

    // 최근으로 복귀 (month-jump / unpaid 모드 종료)
    document.getElementById('btn-back-to-recent')?.addEventListener('click', () => {
      // 미결제 모드에서 넘어온 결제 필터('미결제')는 풀어 준다 — 최근 기록 전체가 보이도록
      const pay = document.getElementById('filter-payment'); if (pay) pay.value = '';
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

    // 수정·저장 뒤 목록이 다시 그려져도 보던 기록 상세를 다시 띄운다 (넓은 화면)
    if (this._paneRecordId && document.getElementById('record-detail-pane')) this._showRecordPane(this._paneRecordId);

    // 뷰포트 경계 변화 시 재렌더 (모바일↔데스크톱 전환, 한 번만 바인딩)
    if (!this._resizeBound) {
      this._resizeBound = true;
      let lastIsMobile = window.matchMedia('(max-width: 1023px)').matches;
      let lastIsWide = window.matchMedia('(min-width: 1280px)').matches;
      const onResize = App.debounce(() => {
        const nowIsMobile = window.matchMedia('(max-width: 1023px)').matches;
        const nowIsWide = window.matchMedia('(min-width: 1280px)').matches;
        if (nowIsMobile !== lastIsMobile || nowIsWide !== lastIsWide) {
          lastIsMobile = nowIsMobile;
          lastIsWide = nowIsWide;
          if (location.hash.startsWith('#records')) App.handleRoute();
        }
      }, 250);
      window.addEventListener('resize', onResize);
    }

    // 목록 항목은 스크롤하며 나중에 붙으므로 클릭은 목록 래퍼 하나에서 위임 처리
    document.getElementById('record-list-wrap')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-id]');
      if (btn) {
        const id = Number(btn.dataset.id);
        if (btn.classList.contains('btn-report-record')) {
          this.showReport(id);
        } else if (btn.classList.contains('btn-photocard-record')) {
          // 미용 기록 → 사진 카드 (예전엔 더보기 → 사진 카드로만 갈 수 있었다)
          if (this._photoCardStarting) return; // 두 번 눌러 창이 두 번 열리지 않게
          this._photoCardStarting = true;
          try { await this.startPhotoCard({ recordId: id }); }
          catch (err) { console.error('사진 카드 열기 실패:', err); App.showToast('사진 카드를 열지 못했습니다.', 'error'); }
          finally { this._photoCardStarting = false; }
        } else if (btn.classList.contains('btn-edit-record')) {
          this.showForm(id);
        }
        return;
      }
      if (e.target.closest('button, a')) return;
      // 넓은 화면: 줄을 누르면 오른쪽 칸에 상세
      const row = e.target.closest('#record-tbody tr[data-id]');
      if (row && document.getElementById('record-detail-pane')) { this._showRecordPane(Number(row.dataset.id)); return; }
      const card = e.target.closest('#record-card-list .mobile-card');
      if (card) this.showForm(Number(card.dataset.id));
    });

  },

  // 검색·결제·월 필터는 메모리의 데이터 배열에 적용하고, 결과의 첫 묶음만 DOM에 다시 그린다
  // keepRendered: 이전 기록을 추가로 불러온 경우 — 이미 그린 앞부분은 그대로 두고 이어 붙임
  applyFilters(opts = {}) {
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

    const L = this._list;
    if (!L) return;
    const matchFn = (r) => {
      const ms = App.searchMatch(L.searchKey(r), search); // 초성·전화 숫자·여러 낱말
      const mm = !month || (r.date || '').slice(0, 7) === month;
      const mp = !payment || (r.paymentMethod || '') === payment;
      return ms && mm && mp;
    };
    L.filtered = (search || month || payment) ? L.sorted.filter(matchFn) : L.sorted;

    let visibleCount = 0;
    let visibleSum = 0;
    let unpaidCount = 0;
    let unpaidSum = 0;
    L.filtered.forEach(r => {
      const amt = App.getRecordAmount(r) || 0;
      visibleCount++;
      visibleSum += amt;
      if (r.paymentMethod === 'unpaid') {
        unpaidCount++;
        unpaidSum += App.getUnpaidAmount(r);
      }
    });

    // 목록 다시 그리기 (데이터가 아예 없으면 render 의 빈 상태 안내를 그대로 둔다)
    const listEl = document.getElementById(L.isMobile ? 'record-card-list' : 'record-tbody');
    if (listEl && L.sorted.length > 0) {
      if (!opts.keepRendered || L.shown === 0) {
        listEl.innerHTML = '';
        L.shown = 0;
        L.lastGroup = null;
      }
      this._appendRecordChunk(opts.keepRendered && opts.appendNow === false && L.shown > 0 ? 0 : 150);
    }
    const noMatch = document.getElementById('record-no-match');
    if (noMatch) noMatch.style.display = (L.sorted.length > 0 && L.filtered.length === 0) ? '' : 'none';

    // 필터 결과 합계 바 업데이트
    const totalEl = document.getElementById('record-filter-total');
    if (totalEl) {
      if (visibleCount === 0) {
        totalEl.style.display = 'none';
      } else {
        totalEl.style.display = 'flex';
        totalEl.innerHTML = `
          <span>${visibleCount}건 · <strong>${App.formatCurrency(visibleSum)}</strong></span>
          ${unpaidCount > 0 ? `<span style="color:var(--danger);font-size:0.93rem">미결제 ${unpaidCount}건 · ${App.formatCurrency(unpaidSum)}</span>` : ''}
        `;
      }
    }
  },

  // 추가 항목 태그: 이름 · [서비스 제공] · ×. data-price = 그 항목 메뉴 가격(모르면 0), data-free = 서비스로 제공
  // [서비스 제공] 토글은 '서비스로 제공' 링크를 눌러야 보인다 (#f-addon-tags.comp-open — css)
  // 여러 미용 코스를 한 기록의 주 서비스로 합칠 때 쓰는 구분자 ('전체미용 + 위생미용')
  _COURSE_SEP: ' + ',
  // 예약 서비스 → { courses: 주 서비스로 합칠 미용 코스들, extras: 추가 항목으로 갈 나머지 }
  // 미용 코스(grooming)가 없으면 첫 번째를 주 서비스로 (예: 목욕만 단독 케어로 예약)
  _splitAppointmentServices(picked) {
    const list = (picked || []).filter(Boolean);
    let courses = list.filter(s => (s.category || 'grooming') === 'grooming');
    // 코스가 없으면 단독 케어(발톱만 등)를 주 서비스로. 스타일·추가 옵션만 고른 예약은 첫 항목
    if (!courses.length && list.length) courses = [list.find(s => s.category === 'care') || list.find(s => s.category !== 'style') || list[0]];
    return { courses, extras: list.filter(s => !courses.includes(s)) };
  },
  // 합친 주 서비스 이름 → 코스 이름들 (메뉴에 그 이름 그대로 있는 경우는 호출하는 쪽에서 먼저 확인)
  _splitCourseName(name) {
    return App.normalizeServiceName(name).split(this._COURSE_SEP).map(x => App.normalizeServiceName(x)).filter(Boolean);
  },

  // 손님의 활동 중 반려견 중 가장 최근에 온 아이 (방문 기록이 없으면 첫 번째). 없으면 null
  async _pickDefaultPetId(customerId) {
    const pets = (await DB.getByIndex('pets', 'customerId', Number(customerId))).filter(p => (p.petStatus || 'active') === 'active');
    const recent = pets.filter(p => p.lastVisitDate).sort((a, b) => b.lastVisitDate.localeCompare(a.lastVisitDate))[0];
    return (recent || pets[0] || {}).id || null;
  },

  // 미래 날짜 예약을 오늘 끝냈으면(기록 날짜 = 오늘) 예약을 오늘로 옮긴다. 시작 시각이 지금보다 늦으면 지금(10분 단위 내림)으로.
  // 지난 예약·오늘 예약은 그대로. 옮겼으면 true (appt 를 직접 고친다)
  _moveEarlyAppointment(appt, recordDate, now) {
    const pad = (n) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (!appt || !appt.date || appt.date <= today || recordDate !== today) return false;
    appt.movedFromDate = appt.date;
    appt.date = today;
    const nowHm = `${pad(now.getHours())}:${pad(Math.floor(now.getMinutes() / 10) * 10)}`;
    if (appt.time && appt.time > nowHm) appt.time = nowHm;
    return true;
  },

  // 합친 코스의 메뉴 조회 결과들 → { price: 코스 모두 가격이 정해지면 합(무료 코스 0원), 하나라도 모르면 null, free: 모두 무료 메뉴 }
  _comboPrice(menus) {
    const list = menus || [];
    const known = (m) => !!(m && !m.needsWeight && (m.free || Number(m.price) > 0));
    return {
      price: list.length && list.every(known) ? list.reduce((a, m) => a + (m.free ? 0 : Number(m.price)), 0) : null,
      free: list.length > 0 && list.every(m => m && m.free)
    };
  },

  // total 을 weights 비율로 나눈 원 단위 금액들 (합이 total — 나머지는 마지막). weights 중 0 이 있으면 똑같이 나눈다
  _splitByWeights(total, weights) {
    const n = weights.length;
    if (!n) return [];
    const w = weights.every(x => Number(x) > 0) ? weights.map(Number) : weights.map(() => 1);
    const sum = w.reduce((a, b) => a + b, 0);
    const t = Number(total) || 0;
    let left = t;
    return w.map((x, i) => { const v = i === n - 1 ? left : Math.round(t * x / sum); left -= v; return v; });
  },

  _addonTagHtml(name, price, opts = {}) {
    const free = !!opts.free;
    return `<span class="badge badge-info addon-tag${free ? ' is-free' : ''}" data-name="${App.escapeHtml(name)}" data-price="${Number(price) || 0}"${opts.menu ? ' data-menu="1"' : ''}${free ? ' data-free="1"' : ''} style="cursor:pointer;padding:3px 4px 3px 10px;display:inline-flex;align-items:center;gap:2px" title="눌러서 빼기">`
      + `<span class="addon-tag-name">${App.escapeHtml(name)}</span>`
      + `<span class="addon-tag-price" style="font-weight:400;opacity:0.85">${this._addonTagPriceText(price, free)}</span>`
      + `<button type="button" class="free-toggle${free ? ' on' : ''}" aria-pressed="${free ? 'true' : 'false'}" title="금액에서 빼고 서비스로 제공"${free || Number(price) > 0 || opts.menu ? '' : ' hidden'}>서비스 제공</button>`
      + `<span aria-hidden="true" style="padding:0 6px;font-size:1rem">×</span></span>`;
  },

  // 태그 금액 글자: ' · 3,000원' / 서비스 제공이면 ' · 서비스 제공' / 금액 모르면 없음
  _addonTagPriceText(price, free) {
    if (free) return ' · 서비스 제공';
    return Number(price) > 0 ? ' · ' + App.formatCurrency(Number(price)) : '';
  },

  _syncAddonTagPrice(tag) {
    const el = tag && tag.querySelector('.addon-tag-price');
    if (el) el.textContent = this._addonTagPriceText(tag.dataset.price, tag.dataset.free === '1');
  },

  _addonTagName(tag) {
    return App.normalizeServiceName(tag.dataset.name || tag.textContent.replace(' ×', '').replace(/(무료|서비스 제공)×?$/, ''));
  },

  async showForm(id, fromAppointment) {
    let record = id ? await DB.get('records', id) : {};
    if (id && !record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); App.closeModal(); return; }

    this._pendingPriceFill = null;
    this._pendingAddonReprice = null;
    // 예약에서 넘어온 추가 항목의 메뉴 가격 (태그 data-price — 제거 시 정확히 빼기 위함)
    const prefillAddonPrices = {};
    // 옛 기록 수정: service 가 없고 serviceIds/serviceNames 만 있으면 — 첫 이름을 서비스로, 나머지는 추가 항목으로 (예전엔 서비스가 비어 저장이 막히거나 나머지 이름이 지워졌다)
    if (id && !record.service) {
      let names = Array.isArray(record.serviceNames) ? record.serviceNames.filter(Boolean) : [];
      if (!names.length && Array.isArray(record.serviceIds) && record.serviceIds.length) {
        const svcAll = await DB.getAll('services');
        names = record.serviceIds.map(sid => svcAll.find(sv => sv.id === sid)?.name).filter(Boolean);
      }
      if (names.length) {
        record = { ...record, service: names[0], addons: (record.addons && record.addons.length) ? record.addons : names.slice(1) };
      }
    }

    // 수정 모드: 기존 추가 항목 태그에 값을 매긴다 — 지우거나 스타일 칩을 끄면 그만큼 추가 금액이 줄게 (예전엔 0원 태그라 금액이 안 줄었다)
    if (id && Array.isArray(record.addons) && record.addons.length) {
      try {
        const compNames = new Set(Array.isArray(record.complimentary) ? record.complimentary.filter(c => c && !c.main).map(c => App.normalizeServiceName(c.name)) : []);
        const paidNames = record.addons.map(a => App.normalizeServiceName(a)).filter(nm => nm && !compNames.has(nm));
        const addonTotal = Number(record.addonPrice) || 0;
        if (paidNames.length === 1) prefillAddonPrices[record.addons.find(a => App.normalizeServiceName(a) === paidNames[0])] = addonTotal;
        else if (paidNames.length > 1) {
          const svcAll = await DB.getAll('services');
          const basis = Number(record.weightAtVisit) > 0 ? Number(record.weightAtVisit) : null;
          let left = addonTotal;
          for (const a of record.addons) {
            const nm = App.normalizeServiceName(a);
            if (!paidNames.includes(nm)) continue;
            const m = await App.getMenuPrice(nm, basis, svcAll).catch(() => null);
            const v = Math.min(Number(m && m.price) || 0, Math.max(0, left));
            prefillAddonPrices[a] = v; left -= v;
          }
        }
      } catch (e) { console.warn('추가 항목 값 매기기 실패:', e); }
    }

    // 미래 날짜 예약을 오늘 완료하려 하면 한 번 묻는다 — 다른 날 예약 카드를 잘못 누른 경우를 막는다 (사장님 결정 2026-11-06)
    const earlyAsked = fromAppointment && App._earlyMoveConfirmedId != null && String(App._earlyMoveConfirmedId) === String(fromAppointment.id);
    App._earlyMoveConfirmedId = null;
    if (fromAppointment && !id && !earlyAsked && fromAppointment.date && fromAppointment.date > App.getToday()) {
      const ok = await App.confirm(`${App.futureDayLabel(fromAppointment.date)} 예약이에요.<br>오늘로 옮겨서 완료할까요?`, { okLabel: '오늘로 옮겨 완료', cancelLabel: '돌아가기', danger: false });
      if (!ok) return;
    }

    // Pre-fill from appointment if provided
    if (fromAppointment && !id) {
      let serviceName = '';
      let servicePrice = 0;
      const addons = [];
      let addonPrice = 0;
      if (fromAppointment.serviceIds?.length) {
        const allSvcs = await DB.getAll('services');
        const sMap = {}; allSvcs.forEach(s => { sMap[s.id] = s; });
        // 지워진 서비스는 예약에 저장된 이름으로라도 넘긴다 (메뉴 가격이 없으면 0원 — 직접 입력)
        const savedNames = Array.isArray(fromAppointment.serviceNames) ? fromAppointment.serviceNames : [];
        const picked = fromAppointment.serviceIds.map((sid, i) => sMap[sid] || sMap[Number(sid)] || (savedNames[i] ? { name: savedNames[i] } : null)).filter(Boolean);
        // 주 서비스 = 미용 코스 전부 (2개면 '전체미용 + 위생미용'으로 합치고 가격도 더한다 — 추가 옵션으로 세지 않게).
        // 미용 코스가 없으면 첫 번째. 나머지(추가 옵션·단독 케어)는 추가 항목으로.
        const { courses, extras } = this._splitAppointmentServices(picked);
        const apPet = fromAppointment.petId ? await DB.get('pets', Number(fromAppointment.petId)) : null;
        // 예약 때 적은 몸무게 → 반려견 몸무게 → 사이즈 순 (구간 가격)
        const apSize = Number(fromAppointment.weightAtBooking) > 0 ? Number(fromAppointment.weightAtBooking) : App.getPetPriceBasis(apPet);
        const courseNames = [];
        for (const c of courses) {
          const nm = App.normalizeServiceName(c.name);
          if (!nm || courseNames.includes(nm)) continue;
          courseNames.push(nm);
          const m = await App.getMenuPrice(nm, apSize, allSvcs);
          servicePrice += m ? (Number(m.price) || 0) : 0;
        }
        serviceName = courseNames.join(this._COURSE_SEP);
        // 코스 가격도 이 아이 가격이 있으면 그걸로 (getRecentServicePrice 와 같은 순서)
        if (apPet && courseNames.length === 1) { const pp = App.getPetPrice(apPet, courseNames[0]); if (pp !== null) servicePrice = pp; }
        const courseSvcs = courses.map(c => allSvcs.find(sv => sv.id === c.id) || c);
        for (const s of extras) {
          const nm = App.normalizeServiceName(s.name);
          if (!nm || addons.includes(nm)) continue;
          const m = await App.getMenuPrice(nm, apSize, allSvcs);
          // 예약에서 넘어온 추가 항목도 기록 폼과 같은 순서로 (포함 0원 → 이 아이 가격 → 코스별 값 → 메뉴 값)
          const p = m ? App.resolveExtraPrice(m.service, Number(m.price) || 0, { courses: courseSvcs, pet: apPet }).price : 0;
          addons.push(nm);
          prefillAddonPrices[nm] = p;
          addonPrice += p;
        }
      }
      record = {
        // getPetOptions는 p.id === selectedId(엄격 비교)라 문자열 id가 오면 선택이 풀린다
        customerId: fromAppointment.customerId ? Number(fromAppointment.customerId) : undefined,
        petId: fromAppointment.petId ? Number(fromAppointment.petId) : undefined,
        // 내일 이후 예약을 오늘 미리 끝낸 경우 — 예약을 오늘로 옮긴 것으로 본다 (기록은 오늘, 저장할 때 예약도 오늘로)
        date: fromAppointment.date && fromAppointment.date <= App.getToday() ? fromAppointment.date : App.getToday(),
        groomer: fromAppointment.groomer || '',
        service: serviceName,
        servicePrice: servicePrice || undefined,
        addons,
        addonPrice: addonPrice || undefined,
        serviceIds: fromAppointment.serviceIds || [],
        memo: fromAppointment.memo || '',
        appointmentId: fromAppointment.id || null,
        weightAtVisit: Number(fromAppointment.weightAtBooking) > 0 ? Number(fromAppointment.weightAtBooking) : undefined
      };
    }
    // 고객만 정해진 새 기록(고객 상세 › + 미용 기록, 반려견 2마리 이상): 가장 최근에 온 아이를 미리 고른다 (없으면 첫 번째). 선택칸에서 바꿀 수 있다
    if (!id && record.customerId && !record.petId) {
      const pick = await this._pickDefaultPetId(record.customerId);
      if (pick) record.petId = pick;
    }
    // 오늘 몸무게 칸 기본값: 기록에 적힌 값 → (새 기록이면) 반려견 마지막 몸무게
    let prefillWeight = Number(record.weightAtVisit) > 0 ? Number(record.weightAtVisit) : null;
    if (!prefillWeight && !id && record.petId) {
      const p0 = await DB.get('pets', Number(record.petId));
      if (p0 && Number(p0.weight) > 0) prefillWeight = Number(p0.weight);
    }

    // 서비스(무료)로 제공한 항목 — 주 서비스(main)·추가 항목. 수정 때 그대로 다시 켠다
    const compList = Array.isArray(record.complimentary) ? record.complimentary : [];
    const mainComp = compList.find(c => c && c.main) || null;
    const compAddon = {};
    compList.filter(c => c && !c.main).forEach(c => { compAddon[App.normalizeServiceName(c.name)] = Number(c.price) || 0; });

    const petOptions = await App.getPetOptions(record.customerId, record.petId);
    // 정액권으로 (일부) 낸 기록이면 정액권 칩이 켜진 채로 연다. 나머지 결제 수단은 paymentMethod 에 있다
    const pfMode = Number(record.prepaidUsed) > 0 || record.paymentMethod === 'prepaid';
    const pfRest0 = pfMode && record.paymentMethod && record.paymentMethod !== 'prepaid' ? record.paymentMethod : 'card';
    // 기본가: servicePrice 가 있으면 그 값(0원도 값). 없는 옛 기록만 총액에서 추가 금액을 뺀 값 — 예전엔 0원이면 총액을 넣어 추가 금액이 두 번 들어갔다
    const mainPriceOf = (r) => r.servicePrice != null && r.servicePrice !== '' ? (Number(r.servicePrice) || 0) : Math.max(0, (Number(r.totalPrice) || 0) - (Number(r.addonPrice) || 0));
    this._mainPriceOf = mainPriceOf;
    this._formTotal = record.finalPrice != null ? Number(record.finalPrice) || 0
      : mainPriceOf(record) + (Number(record.addonPrice) || 0) - (Number(record.discount) || 0) + (Number(record.extraCharge) || 0);
    // 담당 미용사 칸: 미용사 2명 이상 등록 시에만 보인다. 등록 명단에 없는 이름이 이미 적힌 기록이면 그 값을 볼 수 있게 보인다
    const registeredGroomers = (await DB.getSetting('groomers')) || [];
    const showGroomerField = registeredGroomers.length >= 2 || !!(record.groomer && !registeredGroomers.includes(record.groomer));
    const groomerFieldHTML = await App.getGroomerFieldHTML(record.groomer);
    // 몸무게 구간 사용 안 함(가게 전체 단일가) — 오늘 몸무게 칸·구간 안내·몸무게 오타 확인을 쓰지 않는다
    const formPriceTable = await App.getPriceBands();
    const bandsOff = !!formPriceTable.bandsOff;
    this._formBandsOff = bandsOff;
    this._formPriceTable = formPriceTable; // 몸무게 오타 확인 기준(App.needsWeightConfirm)

    App.showModal({
      title: id ? '미용 기록 수정' : '새 미용 기록',
      size: 'lg',
      content: `
        <!-- 넓은 화면(1280px~)에서만 두 칸: 왼쪽 고객·서비스·금액·결제 / 오른쪽 컨디션·사진·상세 옵션. 좁은 화면은 그냥 위에서 아래로 (순서 같음) -->
        <div class="rec-form-grid"><div class="rec-form-main">
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
        <div id="f-copy-last-area" style="display:none;margin-bottom:12px"${id ? ' data-edit="1"' : ''}>
          <button type="button" id="btn-copy-last-record" style="width:100%;padding:10px 14px;background:var(--primary-light);color:var(--primary);border:1.5px dashed var(--primary);border-radius:var(--radius);font-weight:700;cursor:pointer;font-size:0.93rem;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px">
            ${App.icon('copy')} 이전 미용과 같음 <span id="copy-last-hint" style="font-weight:500;font-size:0.93rem;opacity:0.8"></span>
          </button>
        </div>
        <div class="form-group">
          <label class="form-label">날짜 <span class="required">*</span></label>
          <input type="date" id="f-date" value="${record.date || App.getToday()}" max="${App.getToday()}">
        </div>
        <!-- 오늘 몸무게 → 몸무게 구간 가격 (가격보다 먼저 — 몸무게로 기본가가 정해진다)
             구간 사용 안 함이면 숨긴다. 고른 서비스가 몸무게 가격이 아니고 반려견 몸무게가 있으면 '상세 옵션'으로 옮긴다 -->
        <div id="f-weight-slot"></div>
        <div class="form-group" id="f-weight-group"${bandsOff ? ' style="display:none"' : ''}>
          <label class="form-label" for="f-weightAtVisit">오늘 몸무게 (kg)</label>
          <input type="number" id="f-weightAtVisit" value="${prefillWeight || ''}" placeholder="예: 5.2" min="0" max="120" step="0.1" inputmode="decimal">
          <label id="f-update-pet-weight-wrap" style="display:none;align-items:center;gap:6px;margin-top:6px;min-height:44px;font-size:0.93rem;cursor:pointer">
            <input type="checkbox" id="f-update-pet-weight" ${id ? '' : 'checked'} style="width:18px;height:18px">
            <span id="f-update-pet-weight-label">반려견 몸무게도 업데이트</span>
          </label>
        </div>
        <!-- 서비스/스타일/가격 -->
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">서비스 <span class="required">*</span></label>
            <input type="text" id="f-service" class="has-clear" value="${App.escapeHtml(record.service || (record.serviceNames ? record.serviceNames[0] || '' : ''))}" placeholder="예: 전체미용, 목욕" autocomplete="off">
            <button type="button" class="input-clear" id="f-service-clear" aria-label="서비스 지우기" hidden>&times;</button>
            <div class="search-select-dropdown" id="service-dropdown" style="position:absolute;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);max-height:min(45vh,360px);overflow-y:auto;display:none;width:100%"></div>
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label" for="f-servicePrice">기본가</label>
            <input type="number" id="f-servicePrice" class="${mainComp ? 'is-free' : ''}" value="${mainComp ? (Number(mainComp.price) || '') : (id || record.servicePrice != null ? (mainPriceOf(record) || '') : '')}" placeholder="0" min="0" step="1000">
          </div>
        </div>
        <div id="f-band-info" style="margin:-6px 0 12px;font-size:0.93rem;color:var(--text-secondary);line-height:1.4"></div>
        <!-- 이 아이 가격 (1.08): 기본가를 직접 고쳤고 반려견이 있으면 '이 아이 가격으로 기억' — 다음부터 이 값이 먼저 들어간다 -->
        <label id="f-pet-price-wrap" style="display:none;align-items:center;gap:6px;margin:-6px 0 12px;min-height:44px;font-size:0.93rem;cursor:pointer">
          <input type="checkbox" id="f-pet-price-save" style="width:18px;height:18px">
          <span id="f-pet-price-label">이 아이 가격으로 기억</span>
        </label>
        <!-- 스타일 (1.08): 메뉴의 '스타일 추가'를 칩으로. 누르면 추가 항목에 그 값이 붙는다. 스타일 메뉴가 없으면 안 보인다 -->
        <div class="form-group" id="f-style-pick" style="display:none">
          <label class="form-label">스타일 <span style="color:var(--text-muted);font-size:0.93rem;font-weight:400">(여러 개 가능)</span></label>
          <div id="f-style-chips" style="display:flex;gap:6px;flex-wrap:wrap"></div>
        </div>
        <!-- 서비스로 제공 (금액에서 빼기): 평소엔 작은 링크 하나. 누르면 기본가·추가 항목 토글이 보인다 -->
        <div id="f-comp-area" style="margin:-8px 0 12px">
          <button type="button" id="f-comp-reveal" style="background:none;border:none;padding:4px 0;color:var(--text-secondary);text-decoration:underline;cursor:pointer;font-size:0.93rem;min-height:44px${compList.length ? ';display:none' : ''}">서비스로 제공</button>
          <div id="f-comp-row" style="${compList.length ? '' : 'display:none;'}font-size:0.93rem;color:var(--text-secondary)">
            기본가 <button type="button" id="f-main-free" class="free-toggle${mainComp ? ' on' : ''}" aria-pressed="${mainComp ? 'true' : 'false'}" title="기본가를 금액에서 빼고 서비스로 제공">서비스 제공</button>
            <span style="margin-left:6px">· 추가 항목은 아래에서 항목마다</span>
          </div>
        </div>
        <!-- 즉석 새 서비스 등록 (드롭다운에서 "+새 서비스 등록" 선택 시 표시) -->
        <div id="quickadd-service-form" style="display:none;background:var(--primary-light);border:1.5px solid var(--primary);border-radius:var(--radius);padding:12px;margin-bottom:12px">
          <div style="font-weight:700;font-size:0.93rem;color:var(--primary);margin-bottom:8px">${App.icon('sparkle')} 새 서비스 즉석 등록</div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label" style="font-size:0.93rem">이름</label>
            <input type="text" id="quickadd-name" placeholder="서비스 이름" maxlength="40" style="min-height:44px">
          </div>
          <div class="form-group" style="margin-bottom:8px">
            <label class="form-label" style="font-size:0.93rem">분류</label>
            <div id="quickadd-category-chips" style="display:flex;gap:6px;flex-wrap:wrap">
              <button type="button" class="payment-chip active" data-value="grooming">${App.icon('scissors')} 미용 코스</button>
              <button type="button" class="payment-chip" data-value="addon">${App.icon('sparkle')} 추가 옵션</button>
              <button type="button" class="payment-chip" data-value="care">${App.icon('drop')} 단독 케어</button>
            </div>
            <input type="hidden" id="quickadd-category" value="grooming">
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label class="form-label" style="font-size:0.93rem">가격 (원) <span style="color:var(--text-muted);font-weight:400">— 모든 몸무게 같은 가격 (서비스 메뉴에서 구간별로 바꿀 수 있어요)</span></label>
            <input type="number" id="quickadd-price" placeholder="0" min="0" step="1000" style="min-height:44px">
          </div>
          <div style="display:flex;gap:6px">
            <button type="button" class="btn btn-primary" id="quickadd-save" style="flex:1;min-height:44px">${App.icon('check')} 등록 + 사용</button>
            <button type="button" class="btn btn-secondary" id="quickadd-cancel" style="flex:1;min-height:44px">취소</button>
          </div>
        </div>
        <!-- 추가 항목: 매번 쓰므로 기본가 바로 아래 (예전엔 '상세 옵션' 안이라 펼치고 내려야 했다). 금액 칸은 상세 옵션에 그대로 -->
        <div class="form-group" id="f-addon-group">
          <label class="form-label" for="f-addon-input">추가 항목 <span style="color:var(--text-muted);font-size:0.93rem;font-weight:400">(엉킴·약욕·스파 등)</span></label>
          <div id="f-addon-tags" class="${compList.length ? 'comp-open' : ''}" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">${(record.addons || []).map(a => {
            const nm = App.normalizeServiceName(a);
            const isFree = Object.prototype.hasOwnProperty.call(compAddon, nm);
            return this._addonTagHtml(a, isFree ? compAddon[nm] : (Number(prefillAddonPrices[a]) || 0), { menu: Object.prototype.hasOwnProperty.call(prefillAddonPrices, a), free: isFree });
          }).join('')}</div>
          <div class="form-hint" id="f-addon-comp-hint" style="margin-top:-2px;margin-bottom:6px${compList.length ? '' : ';display:none'}">항목 옆 <strong>서비스 제공</strong>을 누르면 금액에서 빠져요</div>
          <input type="text" id="f-addon-input" placeholder="눌러서 고르거나 직접 입력" autocomplete="off">
          <div class="search-select-dropdown" id="addon-dropdown" style="position:absolute;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);max-height:min(45vh,360px);overflow-y:auto;display:none;width:100%"></div>
        </div>
        <!-- 합계 + 결제 수단 (필수 매출 정보) -->
        <div class="form-group" id="final-price-display" style="background:var(--bg);border-radius:var(--radius);padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">합계</span>
          <span id="final-price-value" style="font-size:1.2rem;font-weight:800;color:var(--primary)">${App.formatCurrency(record.finalPrice != null ? record.finalPrice : mainPriceOf(record) + (record.addonPrice || 0) - (record.discount || 0) + (record.extraCharge || 0))}</span>
        </div>
        <div id="f-comp-summary" style="display:none;margin:-8px 0 12px;font-size:0.93rem;color:var(--success, #16a34a)"></div>
        <div class="form-group">
          <label class="form-label">결제 수단</label>
          <div id="f-paymentMethod-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            <!-- 정액권: 잔액이 있는 손님(또는 이미 정액권으로 낸 기록)일 때만 보인다. 새 기록이면 잔액 있는 손님은 정액권이 기본 -->
            <button type="button" class="payment-chip${pfMode ? ' active' : ''}" data-value="prepaid"${pfMode ? '' : ' hidden'}>정액권</button>
            <button type="button" class="payment-chip${!pfMode && ((!record.paymentMethod && !id) || record.paymentMethod === 'card') ? ' active' : ''}" data-value="card">카드</button>
            <button type="button" class="payment-chip${!pfMode && record.paymentMethod === 'cash' ? ' active' : ''}" data-value="cash">현금</button>
            <button type="button" class="payment-chip${!pfMode && record.paymentMethod === 'transfer' ? ' active' : ''}" data-value="transfer">계좌이체</button>
            <button type="button" class="payment-chip${!pfMode && record.paymentMethod === 'unpaid' ? ' active' : ''}" data-value="unpaid">미결제</button>
          </div>
          <input type="hidden" id="f-paymentMethod" value="${pfMode ? 'prepaid' : (!record.paymentMethod && !id) ? 'card' : (record.paymentMethod || 'card')}">
          <div id="f-prepaid-info" class="prepaid-form-info" style="display:none"></div>
          <div id="f-prepaid-rest" class="prepaid-rest" style="display:none">
            <div class="prepaid-rest-q"></div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${[['card', '카드'], ['cash', '현금'], ['transfer', '계좌이체'], ['unpaid', '미결제']].map(([v, l]) => `<button type="button" class="payment-chip prepaid-rest-chip${pfRest0 === v ? ' active' : ''}" data-value="${v}">${l}</button>`).join('')}
            </div>
          </div>
          <input type="hidden" id="f-prepaidRest" value="${pfRest0}">
        </div>

        <!-- 현금영수증 (현금 결제 시에만 표시) -->
        <div class="form-group" id="cashreceipt-group" style="display:${record.paymentMethod === 'cash' ? 'block' : 'none'};margin-top:-4px;background:var(--bg);border-radius:var(--radius);padding:10px 12px">
          <label style="display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;font-size:0.93rem;font-weight:600">
            <input type="checkbox" id="f-cashReceipt" ${record.cashReceiptYn ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
            <span>현금영수증 발행</span>
          </label>
          <input type="text" id="f-cashReceiptNo" placeholder="승인번호 (선택)" value="${App.escapeHtml(record.cashReceiptNo || '')}"
            inputmode="numeric" maxlength="20"
            style="margin-top:8px;display:${record.cashReceiptYn ? 'block' : 'none'};min-height:44px;width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:max(16px,0.9rem)">
        </div>

        </div><div class="rec-form-side">
        <!-- 컨디션 (기본 표시 — 리포트 가치) -->
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label" style="font-size:0.93rem">컨디션 <span style="font-weight:400;color:var(--text-muted);font-size:0.93rem">(선택 — 리포트에 반영)</span></label>
          <div id="f-condition-chips" style="display:flex;gap:6px">
            <button type="button" class="condition-chip${record.condition === 'good' ? ' active' : ''}" data-field="condition" data-value="good" style="flex:1;min-height:44px;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'good' ? 'var(--success-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.93rem;font-weight:600">좋음</button>
            <button type="button" class="condition-chip${record.condition === 'normal' ? ' active' : ''}" data-field="condition" data-value="normal" style="flex:1;min-height:44px;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'normal' ? 'var(--warning-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.93rem;font-weight:600">보통</button>
            <button type="button" class="condition-chip${record.condition === 'caution' ? ' active' : ''}" data-field="condition" data-value="caution" style="flex:1;min-height:44px;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.condition === 'caution' ? 'var(--danger-bg-soft)' : 'var(--bg-white)'};cursor:pointer;font-size:0.93rem;font-weight:600">주의</button>
          </div>
          <input type="hidden" id="f-condition" value="${record.condition || ''}">
        </div>

        <!-- 미용 협조도 (다음 미용 시간 견적 참고) -->
        <div class="form-group" style="margin-bottom:12px">
          <label class="form-label" style="font-size:0.93rem">미용 협조도 <span style="font-weight:400;color:var(--text-muted);font-size:0.93rem">(선택 — 다음 미용 시간 참고)</span></label>
          <div id="f-cooperativeness-chips" style="display:flex;gap:6px">
            <button type="button" class="condition-chip${record.cooperativeness === 'easy' ? ' active' : ''}" data-field="cooperativeness" data-value="easy" style="flex:1;min-height:44px;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.cooperativeness === 'easy' ? 'var(--success-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.93rem;font-weight:600">잘함</button>
            <button type="button" class="condition-chip${record.cooperativeness === 'normal' ? ' active' : ''}" data-field="cooperativeness" data-value="normal" style="flex:1;min-height:44px;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.cooperativeness === 'normal' ? 'var(--warning-light)' : 'var(--bg-white)'};cursor:pointer;font-size:0.93rem;font-weight:600">보통</button>
            <button type="button" class="condition-chip${record.cooperativeness === 'difficult' ? ' active' : ''}" data-field="cooperativeness" data-value="difficult" style="flex:1;min-height:44px;padding:8px;border:1.5px solid var(--border);border-radius:8px;background:${record.cooperativeness === 'difficult' ? 'var(--danger-bg-soft)' : 'var(--bg-white)'};cursor:pointer;font-size:0.93rem;font-weight:600">까다로움</button>
          </div>
          <input type="hidden" id="f-cooperativeness" value="${record.cooperativeness || ''}">
        </div>

        <div class="form-group">
          <label class="form-label">사진 <span style="color:var(--text-muted);font-size:0.93rem;font-weight:400">(선택 — 다음 미용 때 참고용)</span></label>
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
          <div id="f-weight-detail-slot"></div>
          <div class="form-group">
            <label class="form-label">스타일 메모 <span style="color:var(--text-muted);font-size:0.93rem">(선택 — 위 스타일 칩을 고르면 자동으로 채워져요)</span></label>
            <input type="text" id="f-style" value="${App.escapeHtml(record.style || '')}" placeholder="예: 테디베어컷, 하이바+스포팅" autocomplete="off">
            <div class="search-select-dropdown" id="style-dropdown" style="position:absolute;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);max-height:150px;overflow-y:auto;display:none;width:100%"></div>
          </div>
          <!-- 금액: '추가 금액' 하나만 받는다. 예전 '추가 요금'(extraCharge)은 값이 있는 옛 기록에서만 보이고, 합계·저장 식은 그대로 -->
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">추가 금액 <span style="color:var(--text-muted);font-size:0.93rem;font-weight:400">(자동 · 고쳐도 됨)</span></label>
              <input type="number" id="f-addonPrice" value="${record.addonPrice || ''}" placeholder="0" min="0" step="1000">
            </div>
            <div class="form-group">
              <label class="form-label">할인 금액</label>
              <input type="number" id="f-discount" value="${record.discount || ''}" placeholder="0" min="0" step="1000">
            </div>
          </div>
          <div class="form-group" style="${Number(record.extraCharge) > 0 ? '' : 'display:none'}">
            <label class="form-label">기타 추가 금액 <span style="color:var(--text-muted);font-size:0.93rem;font-weight:400">(예전에 따로 적은 금액)</span></label>
            <input type="number" id="f-extraCharge" value="${record.extraCharge || ''}" placeholder="0" min="0" step="1000">
          </div>
          <div class="form-row">
            <!-- 담당 미용사: 2명 이상 등록됐을 때만 보인다. 숨겨도 입력칸은 남아 1명일 때 자동 채움·기존 값이 그대로 저장된다 -->
            <div class="form-group" style="${showGroomerField ? '' : 'display:none'}">
              <label class="form-label">담당 미용사</label>
              ${groomerFieldHTML}
            </div>
          </div>
          <!-- 상세 컨디션 (피부/귀/엉킴) -->
          <div style="border:1px solid var(--border);border-radius:var(--radius);padding:14px;margin-bottom:16px">
            <div style="font-weight:700;font-size:0.93rem;margin-bottom:12px">상세 컨디션 <span style="font-weight:400;color:var(--text-muted);font-size:0.93rem">(선택)</span></div>
            <div class="form-group" style="margin-bottom:10px">
              <label class="form-label" style="font-size:0.93rem">피부 상태</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${['정상','건조','발적','각질','습진'].map(s => `<label class="checkbox-label" style="font-size:0.93rem"><input type="checkbox" name="skinStatus" value="${s}" ${(record.skinStatus || []).includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}
              </div>
            </div>
            <div class="form-row" style="margin-bottom:0">
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:0.93rem">귀 상태</label>
                <select id="f-earStatus" style="font-size:max(16px,0.85rem);padding:6px 10px">
                  <option value="">선택 안 함</option>
                  <option value="clean" ${record.earStatus === 'clean' ? 'selected' : ''}>깨끗</option>
                  <option value="dirty" ${record.earStatus === 'dirty' ? 'selected' : ''}>경미한 오염</option>
                  <option value="infected" ${record.earStatus === 'infected' ? 'selected' : ''}>염증 의심</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:0.93rem">엉킴 정도</label>
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
        </div></div>
        <input type="hidden" id="f-appointmentId" value="${record.appointmentId || ''}">
        ${id ? `<div style="margin-top:16px;padding-top:12px;border-top:1px dashed var(--border);text-align:center">
          <button type="button" class="btn btn-ghost text-danger" id="btn-delete-record-form" style="min-height:44px">이 기록 삭제</button>
        </div>` : ''}
      `,
      onSave: () => this.saveRecord(id)
    });
    document.getElementById('btn-delete-record-form')?.addEventListener('click', () => this.deleteRecord(id, { fromForm: true }));
    // 미리 채운 몸무게(기록·예약·반려견 프로필 값)는 이미 확인된 값으로 본다 — 큰 아이를 매번 다시 묻지 않게
    this._weightConfirmPending = null;
    { const wEl0 = document.getElementById('f-weightAtVisit'); if (wEl0 && prefillWeight) wEl0.dataset.confirmedWeight = App.formatKg(prefillWeight); }
    this._bindRecordPhotos(record);

    // 지금 고른 반려견 (몸무게 없을 때 사이즈 대표 구간, 프로필 몸무게 비교에 쓴다)
    let formPet = null;
    // '반려견 몸무게도 업데이트' 기본값: 새 기록이고 날짜가 그 아이의 가장 최근 기록(없으면 오늘)보다 이전이 아닐 때만 체크.
    // 지난 날짜 기록의 몸무게로 지금 프로필 몸무게를 덮어쓰지 않게. 수정은 기본 해제 그대로
    const syncPetWeightDefault = () => {
      const cb = document.getElementById('f-update-pet-weight');
      if (!cb || id) return;
      const d = document.getElementById('f-date')?.value || App.getToday();
      const ref = (formPet && formPet.lastVisitDate) || App.getToday();
      cb.checked = !(d < ref);
    };
    // Pet change -> 오늘 몸무게 채움 + show pet notes + 마지막 기록 가져오기 버튼 표시
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
        // 오늘 몸무게 칸을 이 아이의 마지막 몸무게로 (없으면 비움 — 이전 반려견 값이 남지 않게) → 가격 다시 계산
        formPet = pet;
        syncPetWeightDefault();
        const wEl = document.getElementById('f-weightAtVisit');
        if (wEl) {
          wEl.value = Number(pet.weight) > 0 ? App.formatKg(pet.weight) : '';
          if (Number(pet.weight) > 0) wEl.dataset.confirmedWeight = App.formatKg(pet.weight);
          wEl.dispatchEvent(new Event('change'));
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
        formPet = pet;
        this.showPetInfoBox(pet);
        // 펫 미리 선택된 경우에도 마지막 기록 버튼 표시
        await this._refreshLastRecordButton(record.petId, id);
      }
    }
    syncPetWeightDefault();
    document.getElementById('f-date')?.addEventListener('change', syncPetWeightDefault);

    // ===== 자동완성 드롭다운 헬퍼 =====
    // opts.onNoMatch: 입력값과 정확히 일치하는 항목 없을 때 드롭다운 하단에 추가할 액션 (예: "+ 새 서비스 등록")
    // opts.hintFor(v): 항목 옆에 붙일 보조 문구 (예: 가격). 선택 시 입력값에는 들어가지 않는다.
    // opts.onSelect(v): 선택 시 기본 동작(입력값 채움 + change) 대신 실행
    // opts.allDbItems: 메뉴 항목(dbItems)은 모두 보이고, 10개 제한은 기록·기본 제안에만
    // 작성 중 표시: 목록에서 고른 것(고객·서비스·추가 항목 드롭다운)은 stopPropagation 이라 App 의 click 감시에 안 잡힌다 → 캡처 단계에서 잡는다.
    // modal-body 는 모든 모달이 같이 쓰므로 한 번만 붙이고, 미용 기록 폼일 때만 표시한다
    if (!this._recordDirtyCaptureBound) {
      this._recordDirtyCaptureBound = true;
      document.getElementById('modal-body')?.addEventListener('click', (e) => {
        if (!e.isTrusted || !document.getElementById('f-service') || !document.getElementById('record-customer-select')) return;
        if (e.target.closest('.search-select-dropdown, .cust-chip-clear')) App._modalDirty = true;
      }, true);
    }
    // 바깥을 누르면 목록 닫기 — document 리스너는 한 번만 붙이고, 지금 열린 폼의 입력칸·목록 짝만 본다
    // (예전엔 폼을 열 때마다 리스너가 3개씩 쌓였다)
    this._acPairs = [];
    if (!this._acDocBound) {
      this._acDocBound = true;
      document.addEventListener('click', (e) => {
        for (const [inputId, dropdownId] of this._acPairs || []) {
          if (e.target.closest('#' + inputId) || e.target.closest('#' + dropdownId)) continue;
          const dd = document.getElementById(dropdownId);
          if (dd) dd.style.display = 'none';
        }
      });
    }
    const setupAutocomplete = (inputId, dropdownId, historyKey, defaultSuggestions, opts = {}) => {
      const input = document.getElementById(inputId);
      const dropdown = document.getElementById(dropdownId);
      if (!input || !dropdown) return;
      const showDropdown = async (q) => {
        const history = await App.getAutoHistory(historyKey);
        const dbItems = opts.dbItems ? await opts.dbItems() : [];
        let all = [...new Set([...dbItems, ...history, ...(defaultSuggestions || [])])];
        if (opts.exclude) all = all.filter(v => !opts.exclude(v)); // 예: 이미 넣은 추가 항목, 주 서비스 목록의 추가 옵션
        const query = (q || '').trim();
        const queryLower = query.toLowerCase();
        const filtered = queryLower ? all.filter(v => v.toLowerCase().includes(queryLower)) : all;
        const exactMatch = queryLower && all.some(v => v.toLowerCase() === queryLower);

        const dbSet = new Set(dbItems);
        const shown = opts.allDbItems
          ? [...filtered.filter(v => dbSet.has(v)), ...filtered.filter(v => !dbSet.has(v)).slice(0, 10)]
          : filtered.slice(0, 10);
        let html = shown.map(v => {
          const hint = opts.hintFor ? opts.hintFor(v) : '';
          return `<div class="search-select-option" data-action="select" data-value="${App.escapeHtml(v)}" style="padding:8px 12px;cursor:pointer;font-size:0.93rem;min-height:44px;display:flex;align-items:center;gap:6px">${App.escapeHtml(v)}${hint ? `<span style="color:var(--text-muted);font-size:0.93rem">· ${App.escapeHtml(hint)}</span>` : ''}</div>`;
        }).join('');

        // 즉석 등록 옵션 (정확히 일치 안 할 때만)
        if (opts.onNoMatch && query && !exactMatch) {
          html += `<div class="search-select-option" data-action="add-new" data-query="${App.escapeHtml(query)}" style="padding:10px 12px;cursor:pointer;font-size:0.93rem;font-weight:700;color:var(--primary);background:var(--primary-light);border-top:1px dashed var(--border)">+ "${App.escapeHtml(query)}" 새 서비스 등록</div>`;
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
      this._acPairs.push([inputId, dropdownId]);
    };
    // 메뉴에 서비스가 있으면 메뉴 이름을 기본 제안으로 (미용 분류 먼저). 메뉴가 비었을 때만 고정 목록.
    const activeMenu = (await DB.getAll('services')).filter(s => s.isActive !== false && App.normalizeServiceName(s.name));
    // 주 서비스 목록에는 추가 옵션을 넣지 않는다 (추가 옵션은 아래 '추가 항목'으로)
    const addonMenuNames = new Set(activeMenu.filter(s => s.category === 'addon' || s.category === 'style').map(s => App.normalizeServiceName(s.name)));
    const defaultServices = activeMenu.length > 0
      ? [...activeMenu.filter(s => (s.category || 'grooming') === 'grooming'), ...activeMenu.filter(s => s.category === 'care')].map(s => App.normalizeServiceName(s.name))
      : ['전체미용', '목욕', '위생미용', '부분미용', '클리퍼컷', '스포팅'];
    // 메뉴에 추가 옵션·단독 케어가 하나라도 있으면 고정 제안은 숨긴다 (메뉴에 없는 이름이 섞여 보이지 않게)
    const defaultAddons = activeMenu.some(s => s.category === 'addon' || s.category === 'care' || s.category === 'style') ? [] : ['엉킴 제거', '약욕', '보습팩', '염색'];
    const defaultStyles = ['테디베어컷', '배냇컷', '라이언컷', '하이바컷', '머쉬룸컷', '스포팅컷', '자연컷', '클린페이스'];
    // 가격 기준: 오늘 몸무게(kg) → 없으면 반려견 사이즈(대표 구간) → 둘 다 없으면 null(구간 가격은 자동 입력 안 함)
    const weightInput = document.getElementById('f-weightAtVisit');
    const currentWeight = () => { const w = parseFloat(weightInput?.value); return w > 0 ? w : null; };
    // 사이즈 대표 구간은 몸무게가 아예 없는(사이즈만 있는) 반려견에게만 — 몸무게 칸을 비운 경우엔 안내만 한다
    const currentSize = () => currentWeight() || (formPet && !(Number(formPet.weight) > 0) ? App.getPetSizeType(formPet) : null) || null;
    // 목록 가격 글자 — 이 폼 안에서는 모두 'N,NNN원' 한 가지로 (몸무게를 모르면 '30,000~45,000원')
    const priceHintOf = (svc, table) => {
      const r = App.calcServicePrice(svc, currentSize(), table);
      if (r.free) return '무료';
      if (!r.needsWeight) return r.price ? App.formatCurrency(r.price) : '';
      const vals = App.getServiceBandRows(svc, table).map(x => x.price).filter(v => v > 0);
      if (!vals.length) return '';
      const lo = Math.min(...vals), hi = Math.max(...vals);
      return lo === hi ? App.formatCurrency(lo) : lo.toLocaleString('ko-KR') + '~' + App.formatCurrency(hi);
    };
    const mainMenuHints = {};

    // 서비스 input 은 DB services 까지 통합 + "새 서비스 등록" 옵션
    // 즐겨찾기 → 활성 순으로 정렬 (자주 쓰는 서비스 상위 노출)
    setupAutocomplete('f-service', 'service-dropdown', 'serviceHistory', defaultServices, {
      dbItems: async () => {
        const list = await DB.getAll('services');
        const table = await App.getPriceBands();
        const catRank = (c) => ({ grooming: 0, care: 1 })[c || 'grooming'] ?? 2;
        return list
          .filter(s => s.isActive !== false && s.category !== 'addon' && s.category !== 'style')
          .sort((a, b) => {
            // 고른 반려견 견종에 맞는 서비스(예: '스포팅 (말티즈·푸들)')를 맨 위로
            const breed = formPet && formPet.breed;
            const ba = App.serviceMatchesBreed(a.name, breed), bb = App.serviceMatchesBreed(b.name, breed);
            if (ba !== bb) return ba ? -1 : 1;
            const fa = !!a.favorite, fb = !!b.favorite;
            if (fa !== fb) return fa ? -1 : 1;
            if (catRank(a.category) !== catRank(b.category)) return catRank(a.category) - catRank(b.category);
            return (a.name || '').localeCompare(b.name || '', 'ko');
          })
          .map(s => { const nm = App.normalizeServiceName(s.name); mainMenuHints[nm] = priceHintOf(s, table); return nm; });
      },
      hintFor: (v) => mainMenuHints[v] || '',
      exclude: (v) => addonMenuNames.has(App.normalizeServiceName(v)),
      onNoMatch: (query) => this._showQuickAddService(query)
    });
    setupAutocomplete('f-style', 'style-dropdown', 'styleHistory', defaultStyles);

    // 추가 항목 태그 시스템
    // 메뉴의 '추가'/'케어' 서비스와 이름이 같으면 사이즈 가격을 태그(data-price)에 담고 추가 금액(f-addonPrice)에 더한다.
    // 사장님이 추가 금액을 직접 고치면 이 폼에서는 더 이상 자동 조정하지 않는다.
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
    // 고른 코스의 메뉴들 (합친 코스 '전체미용 + 위생미용'이면 여러 개). 스타일 포함 여부·코스별 다른 값을 볼 때 쓴다
    const courseSvcsOf = async (value) => {
      const course = App.normalizeServiceName(value);
      if (!course) return [];
      const one = await App.getMenuPrice(course, currentSize()).catch(() => null);
      const ms = one ? [one] : await Promise.all(this._splitCourseName(course).map(c => App.getMenuPrice(c, currentSize()).catch(() => null)));
      return ms.filter(x => x && x.service).map(x => x.service);
    };
    const courseIncludesStyle = async (value) => (await courseSvcsOf(value)).some(sv => sv.styleIncluded);
    // 지금 고른 반려견 (이 아이 가격을 볼 때)
    const currentPet = async () => { const pid = Number(document.getElementById('f-petId')?.value); return pid ? DB.get('pets', pid).catch(() => null) : null; };
    // 추가 항목 값 — 코스에 포함이면 0 → 이 아이 가격 → 스타일의 코스별 다른 값 → 메뉴 값 (App.resolveExtraPrice, 테스트 있음)
    const resolveExtra = async (m) => {
      if (!m) return { price: 0, why: 'menu' };
      const [courses, pet] = await Promise.all([courseSvcsOf(serviceInput?.value), currentPet()]);
      return App.resolveExtraPrice(m.service, m.price, { courses, pet });
    };
    const extraPriceOf = async (m) => (await resolveExtra(m)).price;
    setupAutocomplete('f-addon-input', 'addon-dropdown', 'addonHistory', defaultAddons, {
      dbItems: async () => {
        const list = (await DB.getAll('services')).filter(s => s.isActive !== false && (s.category === 'addon' || s.category === 'care' || s.category === 'style'));
        const table = await App.getPriceBands();
        const names = [];
        for (const s of list) {
          const nm = App.normalizeServiceName(s.name);
          if (!nm) continue;
          addonMenuHints[nm] = priceHintOf(s, table);
          names.push(nm);
        }
        return names;
      },
      hintFor: (v) => addonMenuHints[v] || '',
      allDbItems: true,
      // 이미 넣은 항목은 목록에서 뺀다
      exclude: (v) => Array.from(addonTagsEl?.querySelectorAll('.addon-tag') || []).some(t => this._addonTagName(t) === App.normalizeServiceName(v)),
      onSelect: (v) => { addAddonTag(v); if (addonInput) addonInput.value = ''; }
    });
    this._pendingAddonAdds = new Set();
    const addAddonTag = (name) => {
      const p = addAddonTagNow(name).catch(err => console.warn('추가 항목 넣기 실패:', err));
      this._pendingAddonAdds.add(p);
      p.finally(() => this._pendingAddonAdds.delete(p));
      return p;
    };
    const addAddonTagNow = async (name) => {
      const nm = App.normalizeServiceName(name);
      if (!nm || !addonTagsEl) return;
      addonTagsEl.insertAdjacentHTML('beforeend', this._addonTagHtml(nm, 0, {}));
      const tag = addonTagsEl.lastElementChild;
      const m = await App.getMenuPrice(nm, currentSize());
      // 메뉴의 '추가'/'케어' 항목만 가격 자동 반영 (주 서비스 이름을 태그로 적은 경우는 제외)
      if (m && App.isExtraCategory(m.service.category) && tag.isConnected) {
        const p = await extraPriceOf(m);
        if (!tag.isConnected) return;
        m.price = p;
        // 메뉴 표시·가격은 기다림이 끝난 뒤 한 번에 — 그 사이 다시 맞추기(repriceAddonTags)가 이 태그를 건드리지 않게
        // (먼저 menu 를 달면 그 틈에 다시 맞추기가 값을 더하고, 여기서 또 더해 두 번 들어갔다)
        const before = Number(tag.dataset.price) || 0;
        tag.dataset.menu = '1'; // 메뉴 항목 — 몸무게가 바뀌면 그 구간 가격으로 다시 맞춘다
        tag.dataset.price = String(p || 0);
        this._syncAddonTagPrice(tag);
        if ((p || 0) !== before) adjustAddonPrice((p || 0) - before);
        if (m.price > 0) { const ft = tag.querySelector('.free-toggle'); if (ft) ft.hidden = false; }
        if (isWeighted(m)) placeWeightField();
      }
    };
    addonInput?.addEventListener('keydown', (e) => {
      // stopPropagation: modal-body의 Enter=저장 핸들러로 올라가 반쯤 입력된 기록이 저장되는 것을 막는다
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addAddonTag(addonInput.value); addonInput.value = ''; document.getElementById('addon-dropdown').style.display = 'none'; }
    });
    // 태그 클릭 제거 / '무료' 토글 — 위임 방식이라 '이전 미용과 같음'으로 다시 그린 태그도 동작한다
    // 무료(서비스로 제공): 그 항목 값만큼 추가 금액에서 뺀다 (직접 고친 추가 금액이어도 — 사장님이 직접 누른 동작이라)
    addonTagsEl?.addEventListener('click', async (e) => {
      const tag = e.target.closest('.addon-tag');
      if (!tag) return;
      const setAddon = (delta) => {
        if (!addonPriceInput || !delta) return;
        addonPriceInput.value = Math.max(0, (Number(addonPriceInput.value) || 0) + delta) || '';
        calcTotal();
      };
      if (e.target.closest('.free-toggle')) {
        e.preventDefault();
        const btn = e.target.closest('.free-toggle');
        const on = tag.dataset.free !== '1';
        let p = Number(tag.dataset.price) || Number(tag.dataset.refPrice) || 0;
        if (on && !p) {
          // 가격을 모르는 태그(수정 중인 옛 기록 등) — 메뉴 가격으로 찾아 본다
          const m = await App.getMenuPrice(this._addonTagName(tag), currentSize()).catch(() => null);
          if (m && m.price > 0 && tag.isConnected) { p = m.price; tag.dataset.price = String(p); }
        }
        if (on && p) tag.dataset.price = String(p);
        tag.dataset.free = on ? '1' : '';
        tag.classList.toggle('is-free', on);
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        this._syncAddonTagPrice(tag);
        setAddon(on ? -p : p);
        return;
      }
      const p = Number(tag.dataset.price) || 0;
      const wasFree = tag.dataset.free === '1';
      tag.remove();
      if (!wasFree) adjustAddonPrice(-p); // 무료 항목은 이미 금액에서 빠져 있다
    });

    // 스타일 칩: 스타일 메뉴를 누르면 추가 항목 태그로 붙고(값 자동), 다시 누르면 뺀다.
    // 칩 상태는 태그를 따라간다 — 태그를 직접 지우거나 '이전 미용과 같음'으로 다시 그려도 맞는다.
    // 스타일 메모 칸(상세 옵션)이 비었거나 칩이 채운 글이면 고른 스타일 이름으로 채운다.
    const stylePick = document.getElementById('f-style-pick');
    const styleChips = document.getElementById('f-style-chips');
    const styleMemo = document.getElementById('f-style');
    // 칩이 마지막으로 써 넣은 글. 메모 칸이 그 글 그대로일 때만 칩이 고쳐 쓴다 —
    // 직접 적거나 자동완성·'이전 미용과 같음'으로 들어온 글은 건드리지 않는다. 기록 수정은 칩을 누르기 전엔 손대지 않는다
    let styleMemoAuto = id ? null : '';
    let hasStyleChips = false;
    let styleSvcs = [];
    const courseInput = document.getElementById('f-service'); // serviceInput 은 아래에서 선언된다
    const styleTagOf = (nm) => Array.from(addonTagsEl?.querySelectorAll('.addon-tag') || []).find(t => this._addonTagName(t) === nm);
    const syncStyleChips = async () => {
      if (!styleChips || !styleChips.isConnected) return;
      if (!hasStyleChips) return;
      const [courses, pet] = await Promise.all([courseSvcsOf(courseInput?.value), currentPet()]);
      const picked = [];
      styleChips.querySelectorAll('.style-pick-chip').forEach(b => {
        const on = !!styleTagOf(b.dataset.name);
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        const hint = b.querySelector('.style-pick-price');
        const sv = styleSvcs.find(x => App.normalizeServiceName(x.name) === b.dataset.name);
        if (hint && sv) {
          // 칩에 보이는 값 = 지금 코스·이 아이 기준으로 실제 붙을 값. 이유가 메뉴 값이 아니면 짧게 적는다
          const r = App.resolveExtraPrice(sv, null, { courses, pet });
          hint.textContent = r.why === 'included' ? '포함' : r.why === 'pet' ? `${App.formatCurrency(r.price)} (이 아이)` : r.why === 'course' ? `${App.formatCurrency(r.price)} (이 코스)` : (b.dataset.hint || '');
        }
        if (on) picked.push(b.dataset.name);
      });
      if (styleMemo && styleMemoAuto !== null && styleMemo.value === styleMemoAuto) { styleMemo.value = picked.join(' + '); styleMemoAuto = styleMemo.value; }
    };
    (async () => {
      const styles = (await DB.getAll('services')).filter(s => s.isActive !== false && s.category === 'style' && App.normalizeServiceName(s.name))
        .sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999) || (a.name || '').localeCompare(b.name || '', 'ko'));
      if (!styles.length || !styleChips || !styleChips.isConnected) return;
      styleSvcs = styles;
      const table = await App.getPriceBands();
      styleChips.innerHTML = styles.map(s => {
        const nm = App.normalizeServiceName(s.name);
        const hint = priceHintOf(s, table);
        return `<button type="button" class="payment-chip style-pick-chip" data-name="${App.escapeHtml(nm)}" data-hint="${App.escapeHtml(hint)}" aria-pressed="false">${App.escapeHtml(nm)} <span class="style-pick-price" style="font-weight:400;opacity:0.8">${App.escapeHtml(hint)}</span></button>`;
      }).join('');
      stylePick.style.display = '';
      hasStyleChips = true;
      syncStyleChips();
    })().catch(err => console.warn('스타일 칩 실패:', err));
    styleChips?.addEventListener('click', async (e) => {
      const b = e.target.closest('.style-pick-chip');
      if (!b) return;
      this._modalDirty = true;
      if (styleMemoAuto === null && styleMemo && !styleMemo.value.trim()) styleMemoAuto = styleMemo.value; // 수정 중 빈 메모 — 칩을 직접 누르면 채운다
      const tag = styleTagOf(b.dataset.name);
      if (tag) tag.click(); // 태그를 누른 것과 같다 — 값도 빠진다
      else await addAddonTag(b.dataset.name);
      syncStyleChips();
    });
    if (addonTagsEl) new MutationObserver(() => syncStyleChips()).observe(addonTagsEl, { childList: true });
    courseInput?.addEventListener('change', () => setTimeout(syncStyleChips, 300));
    document.getElementById('f-petId')?.addEventListener('change', () => setTimeout(syncStyleChips, 500)); // 이 아이 가격 표시도 반려견 따라

    // 서비스 선택 시 가격 자동 채움 (사이즈 변경 시에도 다시 계산)
    const serviceInput = document.getElementById('f-service');
    const servicePriceInput = document.getElementById('f-servicePrice');
    const bandInfo = document.getElementById('f-band-info');
    let servicePriceManual = !!id; // 수정 모드면 자동채움 비활성
    // 구간 안내 줄: '5.2kg → 5~7kg 구간 50,000원' / 몸무게 없으면 안내
    const showBandInfo = (menu) => {
      if (!bandInfo) return;
      if (bandsOff || !menu || (menu.mode !== 'weight' && !menu.over)) { bandInfo.textContent = ''; return; }
      if (menu.needsWeight) { bandInfo.textContent = '몸무게를 입력하면 가격이 자동으로 들어가요'; bandInfo.style.color = 'var(--warning-text-strong, var(--text-secondary))'; return; }
      bandInfo.style.color = '';
      bandInfo.textContent = App.describeBandPrice(menu, currentWeight()) + (menu.bySize ? ' — 몸무게를 입력하면 정확해요' : '');
    };
    servicePriceInput?.addEventListener('input', () => { servicePriceManual = true; updatePetPriceWrap(); });
    // '이 아이 가격으로 기억' 줄 — 반려견이 있고, 사장님이 기본가를 직접 고쳐서 메뉴·저장된 이 아이 가격과 다를 때만 보인다
    const updatePetPriceWrap = async () => {
      const wrap = document.getElementById('f-pet-price-wrap');
      if (!wrap || !wrap.isConnected) return;
      const pid = Number(document.getElementById('f-petId')?.value);
      const name = App.normalizeServiceName(serviceInput?.value);
      const val = Number(servicePriceInput?.value);
      if (!pid || !name || !servicePriceManual || !(val >= 0) || servicePriceInput.value === '' || isMainFree()) { wrap.style.display = 'none'; return; }
      const [pet, menu] = await Promise.all([DB.get('pets', pid).catch(() => null), App.getMenuPrice(name, currentSize()).catch(() => null)]);
      // 기다리는 사이 값·서비스·반려견이 바뀌었으면 이 결과는 버린다 (서비스를 바꾼 뒤 옛 서비스 이름으로 저장되지 않게)
      if (!wrap.isConnected || Number(servicePriceInput.value) !== val || App.normalizeServiceName(serviceInput?.value) !== name || Number(document.getElementById('f-petId')?.value) !== pid) return;
      const saved = App.getPetPrice(pet, name);
      const menuPrice = menu && menu.price != null ? menu.price : null;
      const differs = saved !== null ? saved !== val : (menuPrice === null || menuPrice !== val);
      wrap.style.display = differs ? 'flex' : 'none';
      const lbl = document.getElementById('f-pet-price-label');
      if (lbl && differs) lbl.textContent = saved !== null
        ? `${pet?.name || '이 아이'} 가격 바꾸기 (${App.formatCurrency(saved)} → ${App.formatCurrency(val)})`
        : `${pet?.name || '이 아이'}의 ${name} 가격으로 기억 (${App.formatCurrency(val)}) — 다음부터 자동`;
    };
    document.getElementById('f-petId')?.addEventListener('change', () => setTimeout(updatePetPriceWrap, 400));
    // 서비스를 바꾸면 줄을 다시 맞춘다 — 직접 고친 가격이라 자동 채움이 안 돌 때도 (옛 서비스 이름이 남지 않게)
    serviceInput?.addEventListener('change', () => {
      const w = document.getElementById('f-pet-price-wrap');
      if (w) { w.style.display = 'none'; const cb = document.getElementById('f-pet-price-save'); if (cb) cb.checked = false; }
      // 직접 고친 가격이라 자동 채움이 안 돌면 옛 서비스의 '이 아이 가격 …' 안내가 남는다 — 지운다
      if (servicePriceManual && bandInfo && bandInfo.textContent.startsWith('이 아이 가격')) bandInfo.textContent = '';
      setTimeout(updatePetPriceWrap, 50);
    });
    // 자동으로 채운 기본가를 누르면 전체 선택 — 이어 쳐서 '30000' 뒤에 붙는 일 없이 새로 친 값으로 바뀐다
    servicePriceInput?.addEventListener('focus', () => {
      if (servicePriceManual || !servicePriceInput.value) return;
      setTimeout(() => { try { servicePriceInput.select(); } catch (_) {} }, 0);
    });
    let priceFillSeq = 0;
    const fillServicePrice = async () => {
      if (servicePriceManual || !serviceInput || !servicePriceInput) return;
      const seq = ++priceFillSeq;
      const name = App.normalizeServiceName(serviceInput.value);
      const petId = Number(document.getElementById('f-petId')?.value);
      const sizeType = currentSize();
      let [menu, price, petForPrice] = name
        ? await Promise.all([App.getMenuPrice(name, sizeType), App.getRecentServicePrice(petId, name, sizeType), currentPet()])
        : [null, null, null];
      // 이 아이 가격이 있으면 그게 답이다 — 합친 코스의 합계로 덮어쓰지 않는다 (0원도 값: 서비스 제공으로 켠다)
      const pp = App.getPetPrice(petForPrice, name);
      // 예약에서 온 '전체미용 + 위생미용' — 메뉴에 그 이름이 없으면 코스마다 메뉴 가격을 더한다 (무료 코스는 0원)
      let placeMenu = menu, bandMenu = menu, comboFree = false, keepPrice = false;
      const courseParts = !menu ? this._splitCourseName(name) : [];
      if (courseParts.length > 1 && pp !== null) {
        const ms = await Promise.all(courseParts.map(c => App.getMenuPrice(c, sizeType)));
        placeMenu = ms.find(isWeighted) || null;
        bandMenu = null;
      } else if (courseParts.length > 1) {
        const ms = await Promise.all(courseParts.map(c => App.getMenuPrice(c, sizeType)));
        const combo = this._comboPrice(ms);
        if (combo.price != null) price = combo.price; // 코스 모두 이 몸무게 가격이 있으면 그 합
        else keepPrice = true; // 가격을 모르는 코스가 있으면 지금 적힌 값을 그대로 둔다 (비우지 않는다)
        comboFree = combo.free; // 코스가 모두 무료 메뉴면 서비스 제공으로
        placeMenu = ms.find(isWeighted) || null;
        bandMenu = ms.find(m => m && m.needsWeight) || null; // 몸무게를 알아야 하는 코스가 있으면 그 안내만
      }
      // 더 최신 조회가 시작됐거나, 기다리는 사이 직접 입력했거나, 폼이 닫혔으면 무시
      if (seq !== priceFillSeq || servicePriceManual || !servicePriceInput.isConnected) return;
      // 못 찾으면 이전 서비스 가격을 남기지 않는다 (몸무게가 필요한 구간 가격도 비워 둔다) — 합친 코스는 위 keepPrice
      if (pp !== null) servicePriceInput.value = pp; // 0원이어도 적는다
      else if (!keepPrice) servicePriceInput.value = price ? price : '';
      showBandInfo(bandMenu);
      // 이 아이 가격이 들어갔으면 그렇다고 적는다 (메뉴 값과 다를 때)
      if (pp !== null && bandInfo) {
        const menuPrice = menu && menu.price != null ? menu.price : null;
        bandInfo.style.color = '';
        bandInfo.textContent = `이 아이 가격 ${App.formatCurrency(pp)}` + (menuPrice != null && menuPrice !== pp ? ` (메뉴 ${App.formatCurrency(menuPrice)})` : '') + ' — 반려견 상세에서 바꿔요';
      }
      updatePetPriceWrap();
      // 메뉴에서 '무료'로 정한 서비스 — 기본가를 서비스 제공으로 자동으로 켠다 (0원 확인창 없이, 서비스 제공 금액으로 남게).
      // 자동으로 켠 것만 다른 서비스로 바꾸면 끈다 (사장님이 직접 켠 것은 그대로)
      if ((menu && menu.free) || comboFree || pp === 0) { if (!isMainFree()) { setMainFree(true); mainFreeAuto = true; } }
      else if (mainFreeAuto) { setMainFree(false); mainFreeAuto = false; }
      placeWeightField(placeMenu);
      calcTotal();
    };
    const runPriceFill = () => {
      const p = fillServicePrice().catch(err => console.warn('가격 자동 채움 실패:', err));
      this._pendingPriceFill = p;
      return p;
    };
    serviceInput?.addEventListener('change', runPriceFill);
    serviceInput?.addEventListener('input', App.debounce(runPriceFill, 400));
    // 서비스 지우기(×): 다른 서비스를 고르려고 글자를 하나씩 지우던 불편 (1.08). 누르면 비우고 목록을 바로 연다
    const serviceClear = document.getElementById('f-service-clear');
    const syncServiceClear = () => { if (serviceClear) serviceClear.hidden = !(serviceInput && serviceInput.value); };
    serviceInput?.addEventListener('input', syncServiceClear);
    serviceInput?.addEventListener('change', syncServiceClear);
    syncServiceClear();
    serviceClear?.addEventListener('click', () => {
      if (!serviceInput) return;
      serviceInput.value = '';
      servicePriceManual = false; // 새 서비스를 고르면 가격을 다시 자동으로
      this._modalDirty = true;
      serviceInput.dispatchEvent(new Event('change'));
      serviceInput.focus(); // focus 로 목록이 열린다
    });

    // 메뉴 추가 항목 가격을 지금 몸무게·코스 기준으로 다시 맞춘다 (몸무게를 바꾸거나 코스를 바꿨을 때)
    // 한 번에 하나씩 차례로 돈다 (몸무게·코스 변경이 겹쳐도 같은 태그 값을 두 번 빼거나 더하지 않게).
    // 저장할 때 이 차례가 끝나기를 기다린다 (_pendingAddonReprice)
    let repriceChain = Promise.resolve();
    const repriceAddonTags = (onlyStyle) => {
      repriceChain = repriceChain.catch(() => {}).then(() => repriceAddonTagsNow(onlyStyle));
      this._pendingAddonReprice = repriceChain;
      return repriceChain;
    };
    const repriceAddonTagsNow = async (onlyStyle) => {
      if (!addonTagsEl) return;
      for (const tag of addonTagsEl.querySelectorAll('.addon-tag')) {
        if (!Number(tag.dataset.price) && tag.dataset.menu !== '1') continue; // 직접 입력 태그는 가격 정보 없음
        const m = await App.getMenuPrice(this._addonTagName(tag), currentSize());
        if (!m || !tag.isConnected) continue;
        if (onlyStyle && m.service.category !== 'style') continue;
        const np = Number(await extraPriceOf(m)) || 0; // 가격 미입력 메뉴는 null
        if (!tag.isConnected) continue;
        const old = Number(tag.dataset.price) || 0; // 기다린 뒤에 읽는다 — 그 사이 바뀐 값 기준으로 차이만 반영
        tag.dataset.price = String(np);
        this._syncAddonTagPrice(tag);
        if (tag.dataset.free !== '1') adjustAddonPrice(np - old); // 무료 항목은 금액에 안 들어간다
      }
    };
    // 코스를 바꾸면 스타일 값(코스에 포함인지)이 달라진다
    serviceInput?.addEventListener('change', () => repriceAddonTags(true).catch(() => {}));

    // 몸무게 변경 → 기본가 다시 채움 + 메뉴 추가 항목 가격도 그 구간으로 맞춤
    const onWeightChange = async (ev) => {
      const w = currentWeight();
      // 구간표 기준보다 무겁거나 프로필 몸무게와 50% 넘게 다르면 오타(52 → 5.2)일 수 있어 한 번 묻는다 (직접 바꿨을 때만, 같은 값은 다시 묻지 않음)
      if (!bandsOff && ev && ev.isTrusted && App.needsWeightConfirm(w, formPet && formPet.weight, formPriceTable) && weightInput.dataset.confirmedWeight !== App.formatKg(w)) {
        const asking = this._confirmBigWeight(weightInput, w);
        this._weightConfirmPending = asking;
        try { await asking; } finally { if (this._weightConfirmPending === asking) this._weightConfirmPending = null; }
      }
      // 반려견 프로필과 다르면 '반려견 몸무게도 업데이트' 표시
      const wrap = document.getElementById('f-update-pet-weight-wrap');
      if (wrap) {
        const cur = currentWeight();
        const petW = formPet ? Number(formPet.weight) || 0 : 0;
        const differs = !bandsOff && !!(formPet && cur && App.formatKg(cur) !== App.formatKg(petW)); // 표시 단위로 같으면(9.01 vs 9) 묻지 않는다
        wrap.style.display = differs ? 'flex' : 'none';
        const lbl = document.getElementById('f-update-pet-weight-label');
        if (lbl && differs) lbl.textContent = `반려견 몸무게도 업데이트 (${petW ? App.formatKg(petW) + 'kg' : '미입력'} → ${App.formatKg(cur)}kg)`;
      }
      if (servicePriceManual) {
        // 직접 고친 가격은 두고 구간 안내만 갱신 — 구간 가격과 다르면 '구간 가격(…) 적용' 링크
        const nm = App.normalizeServiceName(serviceInput?.value);
        if (nm) {
          let menu = await App.getMenuPrice(nm, currentSize());
          // 합친 코스('전체미용 + 위생미용'): 코스 모두 가격이 있으면 그 합을 구간 가격으로 보고 같은 '적용' 링크를 단다
          const parts = !menu ? this._splitCourseName(nm) : [];
          if (parts.length > 1) {
            const ms = await Promise.all(parts.map(c => App.getMenuPrice(c, currentSize()).catch(() => null)));
            const combo = this._comboPrice(ms);
            placeWeightField(ms.find(isWeighted) || null);
            showBandInfo(ms.find(m => m && m.needsWeight) || null);
            menu = combo.price != null && !combo.free ? { price: combo.price, needsWeight: false } : null;
          } else {
            showBandInfo(menu);
            placeWeightField(menu);
          }
          if (menu && !menu.needsWeight && menu.price > 0 && bandInfo && servicePriceInput
              && Number(servicePriceInput.value) !== menu.price && !document.getElementById('f-main-free')?.classList.contains('on')) {
            const a = document.createElement('button');
            a.type = 'button';
            a.style.cssText = 'background:none;border:none;padding:4px 0 4px 6px;color:var(--primary);font-weight:700;text-decoration:underline;cursor:pointer;font-size:0.93rem;min-height:44px';
            a.textContent = `구간 가격(${App.formatCurrency(menu.price)}) 적용`;
            a.addEventListener('click', () => { servicePriceInput.value = menu.price; calcTotal(); a.remove(); });
            bandInfo.appendChild(a);
          }
        }
      } else {
        runPriceFill();
      }
      await repriceAddonTags();
    };
    weightInput?.addEventListener('change', onWeightChange);
    // 입력 중 자동 계산 — 확인이 필요한 값은 확인(change)을 거친 뒤에만 반영
    weightInput?.addEventListener('input', App.debounce(() => {
      if (!weightInput.isConnected) return;
      const w = currentWeight();
      if (App.needsWeightConfirm(w, formPet && formPet.weight, formPriceTable) && weightInput.dataset.confirmedWeight !== App.formatKg(w)) return;
      onWeightChange();
    }, 500));

    // 합계 자동 계산
    // 저장되는 finalPrice 와 같은 식이어야 한다 (예전엔 화면 합계에 추가요금이 빠져 손님께 말한 금액과 매출이 달랐다)
    const mainFreeBtn = document.getElementById('f-main-free');
    const isMainFree = () => !!mainFreeBtn?.classList.contains('on');
    // '서비스로 제공' 링크 → 기본가 토글 줄 + 추가 항목별 토글을 보인다
    const openComp = () => {
      const row = document.getElementById('f-comp-row');
      if (row) row.style.display = '';
      const link = document.getElementById('f-comp-reveal');
      if (link) link.style.display = 'none';
      addonTagsEl?.classList.add('comp-open');
      const hint = document.getElementById('f-addon-comp-hint');
      if (hint) hint.style.display = '';
    };
    document.getElementById('f-comp-reveal')?.addEventListener('click', (e) => { e.preventDefault(); openComp(); });
    const setMainFree = (on) => {
      if (!mainFreeBtn) return;
      mainFreeBtn.classList.toggle('on', on);
      mainFreeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      servicePriceInput?.classList.toggle('is-free', on);
      if (on) openComp();
    };
    let mainFreeAuto = false; // 무료 메뉴라서 자동으로 켠 경우
    // 예약에서 온 새 기록: 주 서비스(합친 코스면 코스 모두)가 무료 메뉴면 처음부터 서비스 제공으로 — 서비스를 다시 고를 때와 같게
    if (!id && fromAppointment && record.service && !mainComp) {
      Promise.all(this._splitCourseName(record.service).map(c => App.getMenuPrice(c, currentSize()).catch(() => null))).then(ms => {
        if (!ms.length || !ms.every(m => m && m.free) || !mainFreeBtn?.isConnected || isMainFree()) return;
        setMainFree(true); mainFreeAuto = true; calcTotal();
      });
    }
    // 오늘 몸무게 칸 자리: 고른 서비스(주 서비스·메뉴 추가 항목) 중 몸무게로 값이 정해지는 게 없고 반려견 몸무게가 이미 있으면
    // '상세 옵션' 안으로 옮긴다 (거기서 고칠 수 있다). 몸무게 가격 서비스이거나 반려견 몸무게가 없으면 원래 자리.
    const weightGroup = document.getElementById('f-weight-group');
    const isWeighted = (m) => !!(m && (m.mode === 'weight' || m.over || m.needsWeight));
    let placeSeq = 0;
    const placeWeightField = async (menu) => {
      if (!weightGroup || bandsOff) return;
      const name = App.normalizeServiceName(serviceInput?.value);
      if (!name) return; // 서비스를 고르기 전에는 그대로 둔다
      const my = ++placeSeq;
      let weighted = isWeighted(menu === undefined ? await App.getMenuPrice(name, currentSize()).catch(() => null) : menu);
      if (!weighted && addonTagsEl) {
        for (const tag of addonTagsEl.querySelectorAll('.addon-tag[data-menu="1"]')) {
          if (isWeighted(await App.getMenuPrice(this._addonTagName(tag), currentSize()).catch(() => null))) { weighted = true; break; }
        }
      }
      if (my !== placeSeq || !weightGroup.isConnected) return;
      const toDetail = !weighted && !!(formPet && Number(formPet.weight) > 0);
      const slot = document.getElementById(toDetail ? 'f-weight-detail-slot' : 'f-weight-slot');
      if (slot && slot.nextElementSibling !== weightGroup) slot.after(weightGroup);
    };
    mainFreeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      setMainFree(!isMainFree());
      mainFreeAuto = false;
      calcTotal();
    });
    const calcTotal = () => {
      const { finalPrice } = App.calcRecordTotals({
        servicePrice: document.getElementById('f-servicePrice')?.value,
        addonPrice: document.getElementById('f-addonPrice')?.value,
        discount: document.getElementById('f-discount')?.value,
        extraCharge: document.getElementById('f-extraCharge')?.value,
        mainFree: isMainFree()
      });
      const el = document.getElementById('final-price-value');
      if (el) el.textContent = App.formatCurrency(finalPrice);
      this._formTotal = finalPrice;
      if (this._prepaidRender) this._prepaidRender();
      // 서비스(무료)로 제공한 항목 — '상세 옵션'을 접어 둬도 보이게 합계 아래 한 줄
      const cs = document.getElementById('f-comp-summary');
      if (cs) {
        const items = [];
        if (isMainFree()) items.push((App.normalizeServiceName(serviceInput?.value) || '기본가') + ' ' + App.formatCurrency(Number(servicePriceInput?.value) || 0));
        document.querySelectorAll('#f-addon-tags .addon-tag[data-free="1"]').forEach(t => items.push(this._addonTagName(t) + (Number(t.dataset.price) ? ' ' + App.formatCurrency(Number(t.dataset.price)) : '')));
        cs.style.display = items.length ? 'block' : 'none';
        cs.textContent = items.length ? '서비스 제공: ' + items.join(', ') : '';
      }
    };
    document.getElementById('f-servicePrice')?.addEventListener('input', calcTotal);
    document.getElementById('f-addonPrice')?.addEventListener('input', calcTotal);
    document.getElementById('f-discount')?.addEventListener('input', calcTotal);
    document.getElementById('f-extraCharge')?.addEventListener('input', calcTotal);
    // 새 기록을 열 때(예약 완료·반려견 미리 선택) 오늘 몸무게 기준 가격·구간 안내를 한 번 맞춘다
    if (!id && (serviceInput?.value || currentWeight())) onWeightChange();
    // 가격을 모르는 추가 항목 태그(예전 기록)도 메뉴에 있으면 '무료' 토글을 보이게 (메뉴 가격은 무료로 켤 때만 쓴다)
    addonTagsEl?.querySelectorAll('.addon-tag').forEach(tag => {
      const ft = tag.querySelector('.free-toggle');
      if (!ft || !ft.hidden) return;
      App.getMenuPrice(this._addonTagName(tag), currentSize()).then(m => {
        if (m && m.price > 0 && App.isExtraCategory(m.service.category) && tag.isConnected) { tag.dataset.refPrice = String(m.price); ft.hidden = false; }
      }).catch(() => {});
    });
    // 기록 수정: 가격은 그대로 두고 구간 설명만 보여 준다 (지금 메뉴와 다르면 그렇다고 적는다)
    if (id && serviceInput?.value) {
      App.getMenuPrice(serviceInput.value, currentSize()).then(menu => {
        if (!bandInfo || !bandInfo.isConnected) return;
        placeWeightField(menu);
        if (!menu) return;
        showBandInfo(menu);
        const charged = isMainFree() ? Number(servicePriceInput?.value) || 0 : Number(record.servicePrice) || 0;
        if (bandInfo.textContent && !menu.needsWeight && charged && charged !== menu.price) bandInfo.textContent += ` (지금 메뉴 기준 — 이 기록은 ${App.formatCurrency(charged)})`;
      }).catch(() => {});
    }

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

    // ===== 정액권 (잔액 있는 손님만 칩이 보인다) =====
    // 쓸 수 있는 금액 = 고른 고객의 잔액 (+ 이 기록이 이미 쓴 금액). 고객·합계가 바뀌면 다시 그린다
    const pf = { avail: 0, cid: null, keepChip: pfMode, seq: 0, userPicked: false };
    const prepaidChip = document.querySelector('#f-paymentMethod-chips .payment-chip[data-value="prepaid"]');
    const pfInfo = document.getElementById('f-prepaid-info');
    const pfRestRow = document.getElementById('f-prepaid-rest');
    const pfSelected = () => document.getElementById('f-paymentMethod')?.value === 'prepaid';
    this._prepaidRender = () => {
      if (!prepaidChip || !prepaidChip.isConnected) { this._prepaidRender = null; return; }
      const split = App.calcPrepaidUse(pf.avail, this._formTotal);
      const show = pf.avail > 0 || (pf.keepChip && pfSelected());
      prepaidChip.hidden = !show;
      if (!show && pfSelected()) {
        // 잔액 없는 손님으로 바꿨다 — 나머지로 고른 결제 수단(기본 카드)으로 돌린다
        const fallback = document.getElementById('f-prepaidRest')?.value || 'card';
        document.querySelector(`#f-paymentMethod-chips .payment-chip[data-value="${fallback}"]`)?.click();
        return;
      }
      if (pfInfo) {
        pfInfo.style.display = show && pf.avail !== 0 ? 'block' : 'none';
        if (pfSelected()) {
          pfInfo.innerHTML = `정액권 잔액 <strong>${App.formatCurrency(pf.avail)}</strong> · 사용 ${App.formatCurrency(split.used)} → 남는 잔액 ${App.formatCurrency(split.balanceLeft)}`;
        } else {
          pfInfo.innerHTML = `정액권 잔액 <strong>${App.formatCurrency(pf.avail)}</strong>`;
        }
      }
      const rest = pfSelected() ? split.rest : 0;
      if (pfRestRow) {
        pfRestRow.style.display = rest > 0 ? 'block' : 'none';
        const q = pfRestRow.querySelector('.prepaid-rest-q');
        if (q) q.textContent = `잔액 ${App.formatCurrency(Math.max(0, pf.avail))} — 나머지 ${App.formatCurrency(rest)}은?`;
      }
      const cashGroup = document.getElementById('cashreceipt-group');
      if (cashGroup && pfSelected()) cashGroup.style.display = rest > 0 && document.getElementById('f-prepaidRest')?.value === 'cash' ? 'block' : 'none';
    };
    this._prepaidCustomer = async (cid) => {
      const my = ++pf.seq;
      cid = Number(cid) || null;
      let avail = 0;
      if (cid) {
        try { avail = await Prepaid.availableFor(await Prepaid.payerFor(id || null, record.customerId, cid), id || null); } catch (_) { avail = 0; }
      }
      if (my !== pf.seq) return; // 고객을 빠르게 바꾼 경우 마지막 것만
      // 이미 정액권으로 낸 기록이라도 다른 고객으로 바꾸면 그 고객 잔액 기준
      if (cid !== Number(record.customerId)) pf.keepChip = false;
      pf.cid = cid; pf.avail = avail;
      if (this._prepaidRender) this._prepaidRender();
      // 새 기록 + 잔액 있는 손님 → 정액권을 기본으로 (수정은 저장된 결제 수단 그대로, 직접 고른 뒤에는 건드리지 않는다).
      // 잔액이 합계보다 적으면 아래 '나머지는?' 줄이 뜬다
      if (!id && avail > 0 && !pf.userPicked && !pfSelected() && prepaidChip && !prepaidChip.hidden) prepaidChip.click();
    };
    prepaidChip && paymentChips.forEach(chip => chip.addEventListener('click', (e) => { if (e.isTrusted) pf.userPicked = true; if (this._prepaidRender) this._prepaidRender(); }));
    document.querySelectorAll('#f-prepaid-rest .prepaid-rest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#f-prepaid-rest .prepaid-rest-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        document.getElementById('f-prepaidRest').value = chip.dataset.value;
        if (this._prepaidRender) this._prepaidRender();
      });
    });
    if (record.customerId) this._prepaidCustomer(record.customerId);

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
    // 반려견이 2마리 이상인 손님: 반려견 칸을 눈에 띄게 + 안내 한 줄 (가장 최근에 온 아이를 미리 고른다 — 다르면 바꾸게)
    const markPetChoice = async (cid) => {
      const sel = document.getElementById('f-petId');
      if (!sel) return;
      const n = cid ? (await DB.getByIndex('pets', 'customerId', Number(cid))).filter(p => (p.petStatus || 'active') === 'active').length : 0;
      if (!sel.isConnected) return;
      sel.classList.toggle('pet-choose-many', n >= 2);
      sel.style.borderColor = n >= 2 ? 'var(--primary)' : '';
      sel.style.borderWidth = n >= 2 ? '2px' : '';
      let hint = document.getElementById('f-pet-many-hint');
      if (n >= 2) {
        if (!hint) { hint = document.createElement('div'); hint.id = 'f-pet-many-hint'; hint.className = 'form-hint'; hint.style.cssText = 'color:var(--primary);font-weight:700'; sel.after(hint); }
        hint.textContent = `반려견이 ${n}마리예요 — 최근에 온 아이를 골라 뒀어요. 다른 아이면 바꿔 주세요`;
      } else if (hint) hint.remove();
    };
    const origCustomerOnChange = async (cid, preferPetId) => {
      if (this._prepaidCustomer) this._prepaidCustomer(cid);
      // 반려견을 정하지 않고 고객을 고르면 가장 최근에 온 아이(없으면 첫 번째)를 미리 고른다
      if (cid && !preferPetId) preferPetId = await this._pickDefaultPetId(cid);
      await App.refreshPetSelect(cid, preferPetId);
      await markPetChoice(cid);
    };

    // Re-render customer select with enhanced onChange
    await App.renderCustomerSelect('record-customer-select', record.customerId, origCustomerOnChange);

    if (!id && record.customerId) await markPetChoice(record.customerId);
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
      // '기록 없이 완료'한 예약도 방문이다 — 기록만 보고 다시 셈하면 그 방문이 사라져 재방문 알림이 한 달 일찍 떴다
      try {
        const appts = await DB.getByIndex('appointments', 'petId', petId);
        const today = App.getToday();
        const recApptIds = new Set(petRecords.map(r => r.appointmentId).filter(Boolean).map(Number));
        appts.forEach(a => { if (a.status === 'completed' && a.date && a.date <= today && !recApptIds.has(Number(a.id)) && (!latest || a.date > latest)) latest = a.date; });
      } catch (_) {}
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
    this._pendingPhotoJobs = new Set(); // 사진 읽기·압축 진행 중 — 저장 시 기다린다
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
        App._modalDirty = true; // stopPropagation 이라 App 의 작성 중 감시에 안 잡힌다
        if (input) input.value = '';
        paint(field);
      });
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) return;
        App._modalDirty = true; // 사진을 넣었으면 닫을 때 한 번 묻는다
        // 사진 처리가 끝나기 전에 저장을 누르면 사진이 빠지던 문제 — 진행 중 작업을 기록해 saveRecord 가 기다린다
        const jobs = this._pendingPhotoJobs || (this._pendingPhotoJobs = new Set());
        const job = new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            App.resizeImage(reader.result, (data) => {
              if (!data) { App.showToast('사진을 읽지 못했습니다.', 'error'); resolve(); return; }
              this._formPhotos[field] = { data, changed: true };
              paint(field);
              resolve();
            }, 800, 0.7);
          };
          reader.onerror = () => { App.showToast('사진을 읽지 못했습니다.', 'error'); resolve(); };
          reader.readAsDataURL(file);
        });
        jobs.add(job);
        job.finally(() => jobs.delete(job));
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
    // 새 사진을 먼저 저장하고 기록을 고친 뒤에 옛 사진을 지운다 (중간 실패 시 사진이 사라지지 않게)
    const oldIds = [];
    for (const f of fields) {
      const oldId = rec[f + 'Id'];
      if (rec[f]) delete rec[f]; // 옛 인라인 사진
      rec[f + 'Id'] = photos[f].data ? await DB.savePhoto(photos[f].data, { type: 'record-' + f, ownerId: recordId, date: rec.date }) : null;
      if (oldId && oldId !== rec[f + 'Id']) oldIds.push(oldId);
      if (rec._photoFromSync) delete rec._photoFromSync[f];
      rec._photoSetAt = { ...(rec._photoSetAt || {}), [f]: Date.now() };
    }
    await DB.update('records', rec);
    for (const oldId of oldIds) await DB.deletePhoto(oldId).catch(() => {});
    this._formPhotos = {};
  },

  // 큰(또는 프로필과 많이 다른) 몸무게 확인. 맞다고 하면 그 값을 확인된 값으로 표시, 아니면 칸을 비운다. 반환: 맞음 여부
  async _confirmBigWeight(input, w) {
    const ok = await App.confirm(`몸무게가 <strong>${App.formatKg(w)}kg</strong>예요. 맞나요?`, { okLabel: '맞아요', cancelLabel: '다시 입력', danger: false });
    if (ok) input.dataset.confirmedWeight = App.formatKg(w);
    else if (input.isConnected) { input.value = ''; input.focus(); }
    return ok;
  },

  async saveRecord(id) {
    try {
      // 몸무게 칸에 커서가 있는 채로 저장(Enter 등)하면 칸의 change(몸무게 확인)가 저장 확인과 겹친다 → 먼저 칸을 벗어나 그쪽 확인을 띄운다
      if (document.activeElement && document.activeElement.id === 'f-weightAtVisit') {
        document.activeElement.blur();
        await new Promise(r => setTimeout(r, 50));
      }
      // 몸무게 칸의 몸무게 확인이 떠 있는 중에 저장을 누른 경우 — 답을 먼저 기다린다
      if (this._weightConfirmPending) {
        let okField = true;
        try { okField = await this._weightConfirmPending; } catch (e) { /* ignore */ }
        // '다시 입력'을 골랐으면 저장하지 않고 몸무게 칸으로
        if (okField === false) { App.highlightField('f-weightAtVisit'); return; }
        await new Promise(r => setTimeout(r, 200)); // 확인창이 닫히며 다시 시작한 가격 조회가 _pendingPriceFill 에 걸리도록
      }
      // 서비스 입력 직후 바로 저장을 누르면 가격 조회가 끝나기 전이라 0원으로 저장되던 문제 — 조회를 기다린다
      if (this._pendingPriceFill) {
        try { await this._pendingPriceFill; } catch (e) { /* 조회 실패 시 입력된 값으로 진행 */ }
        this._pendingPriceFill = null;
      }
      // 추가 항목을 고르자마자 저장 — 값이 붙기 전에 읽어 0원으로 저장되지 않게 기다린다
      if (this._pendingAddonAdds && this._pendingAddonAdds.size) {
        try { await Promise.all([...this._pendingAddonAdds]); } catch (e) { /* ignore */ }
      }
      // 코스·몸무게를 바꾼 직후 바로 저장 — 추가 항목(스타일 포함 0원 등) 값 다시 맞추기가 끝난 뒤 금액을 읽는다
      if (this._pendingAddonReprice) {
        try { await this._pendingAddonReprice; } catch (e) { /* ignore */ }
        this._pendingAddonReprice = null;
      }
      // 고른 사진의 압축이 끝나기 전에 저장하면 사진이 빠지던 문제 — 사진 처리를 기다린다
      if (this._pendingPhotoJobs && this._pendingPhotoJobs.size) {
        await Promise.all([...this._pendingPhotoJobs]);
      }
      const customerId = Number(document.getElementById('record-customer-select-value')?.value || document.getElementById('f-customerId')?.value);
      const petId = Number(document.getElementById('f-petId').value);
      const date = document.getElementById('f-date').value;
      const groomer = document.getElementById('f-groomer').value.trim();
      const memo = document.getElementById('f-memo').value.trim();
      let paymentMethod = document.getElementById('f-paymentMethod').value;

      // 새 서비스/스타일/가격 필드
      const service = App.normalizeServiceName(document.getElementById('f-service')?.value);
      // 기본가를 '무료'로 켰으면 받는 금액은 0원, 원래 가격은 complimentary 에 남긴다
      const mainFree = !!document.getElementById('f-main-free')?.classList.contains('on');
      const servicePriceInputVal = Number(document.getElementById('f-servicePrice')?.value) || 0;
      const servicePrice = mainFree ? 0 : servicePriceInputVal;
      const style = document.getElementById('f-style')?.value?.trim() || '';
      const addons = [];
      const freeAddons = []; // [{ name, price }]
      document.querySelectorAll('#f-addon-tags .addon-tag').forEach(tag => {
        const t = this._addonTagName(tag);
        if (!t || addons.includes(t)) return;
        addons.push(t);
        if (tag.dataset.free === '1') freeAddons.push({ name: t, price: Number(tag.dataset.price) || 0 });
      });
      const addonPrice = Number(document.getElementById('f-addonPrice')?.value) || 0;
      const discount = Number(document.getElementById('f-discount')?.value) || 0;
      const extraCharge = Number(document.getElementById('f-extraCharge')?.value) || 0;
      // 금액 식은 화면 합계와 같은 함수 (App.calcRecordTotals — tests/money.test.js)
      const money = App.calcRecordTotals({ servicePrice: servicePriceInputVal, addonPrice, discount, extraCharge, mainFree, freeAddons });
      const totalPrice = money.totalPrice;
      // 호환용: serviceNames 배열도 저장
      const serviceNames = service ? [service] : [];
      // 오늘 몸무게 (구간 가격 스냅샷 · 반려견 프로필 갱신)
      const weightRaw = parseFloat(document.getElementById('f-weightAtVisit')?.value);
      const weightAtVisit = weightRaw > 0 ? Math.round(weightRaw * 10) / 10 : null;
      // 확인이 필요한 몸무게가 아직 확인 안 됐으면(칸을 벗어나지 않고 바로 저장 등) 여기서 같은 확인을 한 번 묻는다
      const profileW = petId ? Number((await DB.get('pets', petId).catch(() => null))?.weight) || 0 : 0;
      if (!this._formBandsOff && App.needsWeightConfirm(weightAtVisit, profileW, this._formPriceTable)) {
        const wEl = document.getElementById('f-weightAtVisit');
        if (wEl && wEl.dataset.confirmedWeight !== App.formatKg(weightAtVisit)) {
          const okW = await this._confirmBigWeight(wEl, weightAtVisit);
          await new Promise(r => setTimeout(r, 180)); // 확인창이 닫히며 내는 history.back() 처리 뒤에 이어서 (다음 확인창·모달 닫기가 꼬이지 않게)
          // 확인 전엔 확인이 필요한 값으로 가격을 계산하지 않았다 → 지금 값으로 다시 계산
          wEl.dispatchEvent(new Event('change'));
          if (!okW) { App.highlightField('f-weightAtVisit'); return; }
          await new Promise(r => setTimeout(r, 50));
          if (this._pendingPriceFill) { try { await this._pendingPriceFill; } catch (e) { /* ignore */ } }
          await new Promise(r => setTimeout(r, 300)); // 추가 항목 가격 재계산
          const sp2 = Number(document.getElementById('f-servicePrice')?.value) || 0;
          const ap2 = Number(document.getElementById('f-addonPrice')?.value) || 0;
          if (sp2 !== servicePriceInputVal || ap2 !== addonPrice) {
            App.showToast(`${App.formatKg(weightAtVisit)}kg 기준으로 가격을 다시 계산했어요. 합계를 확인한 뒤 저장하세요.`, 'info');
            return;
          }
        }
      }
      const updatePetWeightWrap = document.getElementById('f-update-pet-weight-wrap');
      const updatePetWeight = !!(weightAtVisit && updatePetWeightWrap && updatePetWeightWrap.style.display !== 'none' && document.getElementById('f-update-pet-weight')?.checked);
      const petPriceWrap = document.getElementById('f-pet-price-wrap');
      const savePetPrice = !!(service && !mainFree && petPriceWrap && petPriceWrap.style.display !== 'none' && document.getElementById('f-pet-price-save')?.checked);

      // 컨디션 체크 필드
      const condition = document.getElementById('f-condition')?.value || '';
      const cooperativeness = document.getElementById('f-cooperativeness')?.value || '';
      const skinStatus = []; document.querySelectorAll('input[name="skinStatus"]:checked').forEach(cb => skinStatus.push(cb.value));
      const earStatus = document.getElementById('f-earStatus')?.value || '';
      const mattingLevel = document.getElementById('f-mattingLevel')?.value || '';

      // 다음 미용 추천일: 반려견 권장 주기 → 없으면 설정의 재방문 기준(기본 30일). 리포트·다음 예약 등록이 이 날짜를 쓴다
      let nextVisitDate = '';
      if (petId) {
        try {
          const pet = await DB.get('pets', petId);
          nextVisitDate = App.calcNextVisitDate(date || App.getToday(), pet && pet.groomingCycle, await App.getRevisitDays());
        } catch (e) { /* ignore */ }
      }

      if (!customerId) { App.showToast('고객을 선택해주세요.', 'error'); App.highlightField('record-customer-select-input'); return; }
      if (!petId) { App.showToast('반려견을 선택해주세요.', 'error'); App.highlightField('f-petId'); return; }
      if (!date) { App.showToast('날짜를 입력해주세요.', 'error'); App.highlightField('f-date'); return; }
      if (!service) { App.showToast('서비스를 입력해주세요.', 'error'); App.highlightField('f-service'); return; }

      const finalPrice = money.finalPrice;
      if (money.negative) { App.showToast('할인이 금액보다 큽니다. 할인 금액을 확인해주세요.', 'error'); App.highlightField('f-discount'); return; }
      const compTotal0 = money.complimentaryTotal;
      if (finalPrice === 0 && paymentMethod !== 'unpaid' && !(mainFree || freeAddons.length)) {
        // 예약→기록 흐름에서 가격이 비어 0원 매출이 조용히 쌓이던 문제. (메뉴의 무료 서비스는 '서비스 제공'이 자동으로 켜져 여기 오지 않는다)
        const okZero = await App.confirm('합계가 <strong>0원</strong>입니다. 0원으로 저장할까요?', { okLabel: '0원으로 저장', danger: false });
        if (!okZero) { App.highlightField('f-servicePrice'); return; }
      }
      // 자동 채운 값 뒤에 이어 쳐서 3000030000원처럼 저장되던 문제 — 500만원이 넘으면 한 번 묻는다
      if (Math.max(totalPrice, finalPrice) > 5000000) {
        const okBig = await App.confirm(`합계가 <strong>${App.formatCurrency(Math.max(totalPrice, finalPrice))}</strong>입니다. 금액이 맞나요?`, { okLabel: '이 금액으로 저장', danger: false });
        if (!okBig) { App.highlightField('f-servicePrice'); return; }
      }
      // 정액권: 저장 직전 잔액으로 다시 계산 — 쓸 금액 = min(잔액, 합계), 나머지는 고른 결제 수단(paymentMethod)
      let prepaidUsed = 0;
      let prepaidPayer = customerId;
      if (paymentMethod === 'prepaid') {
        const restMethod = document.getElementById('f-prepaidRest')?.value || 'card';
        const restLabel = this.getPaymentLabel(restMethod);
        let avail = 0;
        try {
          const origRec = id ? await DB.get('records', id) : null;
          prepaidPayer = await Prepaid.payerFor(id || null, origRec ? origRec.customerId : null, customerId);
          avail = await Prepaid.availableFor(prepaidPayer, id || null);
        } catch (_) { avail = 0; }
        const split = App.calcPrepaidUse(avail, finalPrice, restMethod);
        prepaidUsed = split.used;
        const rest = split.rest;
        if (prepaidUsed <= 0 && finalPrice > 0) {
          const ok = await App.confirm(`이 손님은 정액권 잔액이 없습니다.<br><strong>${App.formatCurrency(finalPrice)}</strong>을 ${restLabel}(으)로 저장할까요?`, { okLabel: `${restLabel}(으)로 저장`, danger: false });
          if (!ok) return;
          await new Promise(r => setTimeout(r, 180));
        } else if (rest > 0 && document.getElementById('f-prepaid-rest')?.style.display === 'none') {
          // 화면에서 '나머지는?'을 묻지 못한 경우(그사이 잔액이 바뀜) — 저장 전에 한 번 묻는다
          const ok = await App.confirm(`정액권 잔액 ${App.formatCurrency(avail)} — 나머지 <strong>${App.formatCurrency(rest)}</strong>은 ${restLabel}(으)로 받을까요?`, { okLabel: '이대로 저장', danger: false });
          if (!ok) return;
          await new Promise(r => setTimeout(r, 180));
        }
        paymentMethod = split.paymentMethod;
      }
      const appointmentId = document.getElementById('f-appointmentId')?.value || null;
      const status = 'completed';

      // 서비스 카테고리 스냅샷 — services 마스터 변경(이름/카테고리/삭제) 영향 차단
      // serviceId: 메뉴 서비스 연결 (이름이 바뀌어도 사용 횟수·분석이 이어지도록). service(이름)는 스냅샷으로 유지
      let serviceCategory = '';
      let serviceId = null;
      let courses = null; // 미용 코스 2개 이상을 합친 주 서비스 → [{ serviceId, name, price }] (분석이 코스별로 센다)
      const addonServiceIds = [];
      if (service) {
        try {
          const allServices = await DB.getAll('services');
          const findSvc = (nm) => allServices.find(s => s.isActive !== false && App.normalizeServiceName(s.name) === nm)
            || allServices.find(s => App.normalizeServiceName(s.name) === nm);
          // 예약의 여러 미용 코스를 합친 이름('전체미용 + 위생미용')은 첫 코스에 연결 — 분류가 미용 코스로 남는다
          const svc = findSvc(service) || findSvc(this._splitCourseName(service)[0]);
          if (svc) {
            serviceId = svc.id;
            if (svc.category) serviceCategory = svc.category;
          }
          // 합친 코스: 기본가(서비스 제공이면 원래 가격)를 그날 메뉴 가격 비율로 코스마다 나눈다 (가격을 모르면 똑같이)
          const courseParts = this._splitCourseName(service);
          if (courseParts.length >= 2 && !findSvc(service)) {
            let basis = weightAtVisit;
            if (!basis) { const pp = await DB.get('pets', petId).catch(() => null); basis = (pp && pp.size) || null; }
            const menus = await Promise.all(courseParts.map(c => App.getMenuPrice(c, basis).catch(() => null)));
            const prices = this._splitByWeights(servicePriceInputVal, menus.map(m => (m && !m.needsWeight) ? Number(m.price) || 0 : 0));
            courses = courseParts.map((nm, i) => { const cs = findSvc(nm); return { serviceId: cs ? cs.id : null, name: nm, price: prices[i] }; });
          }
          // 추가 항목 중 메뉴에 있는 것만 id 연결 (태그 순서 유지, 메뉴에 없는 자유 입력은 건너뜀)
          addons.forEach(a => {
            const as = findSvc(App.normalizeServiceName(a));
            if (as && !addonServiceIds.includes(as.id)) addonServiceIds.push(as.id);
          });
        } catch (e) { /* services 조회 실패 시 빈 값 — export에서 폴백 */ }
      }

      // 현금영수증 (현금 결제일 때만 의미)
      // 카드·이체로 바꾸면 현금영수증 표시는 숨겨질 뿐 체크가 남아 세무 자료에 'Y'로 나갔다 — 현금이 실제로 오갈 때만
      const cashReceiptYn = paymentMethod === 'cash' && (document.getElementById('f-cashReceipt')?.checked || false);
      const cashReceiptNo = document.getElementById('f-cashReceiptNo')?.value?.trim() || '';

      const data = { customerId, petId, date, groomer, nextVisitDate, service, serviceId, servicePrice, serviceCategory, addons, addonServiceIds, addonPrice, style, serviceNames, totalPrice, discount, extraCharge, finalPrice, memo, paymentMethod, cashReceiptYn, cashReceiptNo, appointmentId, status, condition, cooperativeness, skinStatus, earStatus, mattingLevel };
      if (prepaidUsed > 0) data.prepaidUsed = prepaidUsed;
      if (courses) data.courses = courses;
      // 서비스(무료)로 제공한 항목 — 금액(finalPrice)에는 안 들어가고, 원래 가격만 남긴다 (영수증 '서비스' 줄 · 매출 화면 '서비스로 제공한 금액')
      if (mainFree || freeAddons.length) {
        const svcList = await DB.getAll('services').catch(() => []);
        const idOf = (nm) => { const f = svcList.find(x => App.normalizeServiceName(x.name) === nm); return f ? f.id : null; };
        data.complimentary = [
          ...(mainFree ? [{ name: service, serviceId: serviceId != null ? serviceId : null, price: servicePriceInputVal, main: true }] : []),
          ...freeAddons.map(a => ({ name: a.name, serviceId: idOf(a.name), price: a.price }))
        ];
        data.complimentaryTotal = compTotal0;
      }
      // 몸무게 구간 스냅샷 — 나중에 구간표·메뉴 가격이 바뀌어도 그날 기준을 남긴다 (몸무게 없이 고친 옛 기록은 그대로 둔다)
      if (weightAtVisit) data.weightAtVisit = weightAtVisit;
      if (service && serviceId != null) {
        try {
          // 몸무게가 없으면 반려견에 직접 정한 사이즈(pet.size)만 쓴다 — 프로필 몸무게로 사이즈를 추정해 구간을 남기지 않는다
          let basis = weightAtVisit;
          if (!basis) { const pp = await DB.get('pets', petId); basis = (pp && pp.size) || null; }
          const snap = await App.getMenuPrice(service, basis);
          if (snap && !snap.needsWeight) {
            data.menuPriceAtVisit = snap.price;
            data.priceBandId = snap.bandId || null;
            data.priceBandLabel = snap.bandLabel || null;
            // 초과 kg 요금 — 영수증에 '+ 초과 3kg × 5,000원' 줄을 따로 찍는다
            data.priceOver = snap.over ? { kg: snap.over.kg, perKg: snap.over.perKg, extra: snap.over.extra, from: snap.over.from } : null;
          }
        } catch (e) { /* 스냅샷 실패는 저장을 막지 않는다 */ }
      }
      let newId = null;
      let apptDone = false; // 연결된 예약을 완료 처리했는지

      // 자동완성 이력 업데이트
      if (service) App.addAutoHistory('serviceHistory', service);
      if (style) App.addAutoHistory('styleHistory', style);
      addons.forEach(a => App.addAutoHistory('addonHistory', a));

      let prevCustomerId = null;
      let prevService = null;
      let prevPetId = null;
      if (id) {
        const existing = await DB.get('records', id);
        if (!existing) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
        prevCustomerId = existing.customerId;
        prevService = existing.service;
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
        if (!prepaidUsed) delete existing.prepaidUsed;
        // 몸무게 칸을 비우고 고쳤으면 예전 몸무게·구간 스냅샷을 지운다 (남기면 영수증에 옛 몸무게가 찍힌다)
        if (!weightAtVisit) {
          delete existing.weightAtVisit;
          if (data.priceBandId == null) { delete existing.priceBandId; delete existing.priceBandLabel; }
          if (data.menuPriceAtVisit == null) { delete existing.menuPriceAtVisit; delete existing.priceOver; }
        }
        // 무료 항목을 모두 끈 경우
        if (!data.complimentary) { delete existing.complimentary; delete existing.complimentaryTotal; }
        if (!courses) delete existing.courses; // 코스 하나로 바꾼 경우
        // 메뉴에 없는 이름으로 바꿨거나 다른 서비스로 바꿨는데 새 스냅샷이 없으면 — 옛 서비스의 메뉴 가격·구간·초과 요금을 남기지 않는다
        if (data.menuPriceAtVisit == null && (serviceId == null || App.normalizeServiceName(prevService) !== service)) {
          delete existing.menuPriceAtVisit; delete existing.priceOver; delete existing.priceBandId; delete existing.priceBandLabel;
        }
        await DB.update('records', existing);
        await this._syncPrepaidUse(existing, prepaidPayer);
        await this._persistRecordPhotos(id);
        await App.pruneRecordPhotos(petId, id).catch(() => {});
        App.showToast('미용 기록이 수정되었습니다.');
      } else {
        newId = await DB.add('records', data);
        if (prepaidUsed > 0) await this._syncPrepaidUse({ ...data, id: newId }, prepaidPayer);
        await this._persistRecordPhotos(newId);
        await App.pruneRecordPhotos(petId, newId).catch(() => {});
        // If linked to an appointment, mark it as completed now
        if (appointmentId) {
          try {
            const appt = await DB.get('appointments', Number(appointmentId));
            if (appt) {
              const moved = this._moveEarlyAppointment(appt, date, new Date());
              appt.status = 'completed';
              appt.completedAt = new Date().toISOString();
              await DB.update('appointments', appt);
              apptDone = moved ? 'moved' : true; // 저장 완료 토스트에 함께 적는다
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
      // '반려견 몸무게도 업데이트' — 사이즈가 몸무게로 자동 정해진 값이면 함께 맞춘다 (구버전 기기는 사이즈 가격을 쓴다)
      // '이 아이 가격으로 기억' — 반려견에 서비스별 값 저장 (다음 기록부터 이 값이 먼저 들어간다)
      if (savePetPrice && petId) {
        try {
          const pet = await DB.get('pets', petId);
          if (pet) {
            pet.customPrices = Object.assign({}, pet.customPrices || {}, { [service]: servicePriceInputVal });
            await DB.update('pets', pet);
          }
        } catch (e) { console.warn('이 아이 가격 저장 실패:', e); }
      }
      if (updatePetWeight) {
        try {
          const pet = await DB.get('pets', petId);
          if (pet && Math.abs((Number(pet.weight) || 0) - weightAtVisit) > 0.001) {
            const sizeOf = (w) => w < 7 ? 'small' : w < 15 ? 'medium' : 'large';
            if (pet.size && Number(pet.weight) > 0 && pet.size === sizeOf(Number(pet.weight))) pet.size = sizeOf(weightAtVisit);
            pet.weight = weightAtVisit;
            await DB.update('pets', pet);
          }
        } catch (e) { console.warn('반려견 몸무게 갱신 실패:', e); }
      }
      // 신규·수정 모두 전체 기록 기준 재계산 (lastVisitDate·firstVisitDate·visitCount — 목록/분석이 이 값만 읽는다)
      await this._recalcPetLastVisit(petId);
      if (id && prevPetId && prevPetId !== petId) await this._recalcPetLastVisit(prevPetId);

      App.closeModal();

      // 신규 기록: 어느 길(빠른 추가·홈 '미용 완료'·고객 상세)로 와도 토스트 한 줄 + '문자 보내기' 링크 하나.
      // 리포트·영수증은 기록 목록의 '보호자에게 보내기', 다음 예약은 기록 상세에서 연다
      if (!id) {
        App.handleRoute();
        const customer = await DB.get('customers', customerId);
        const pet = await DB.get('pets', petId);
        const customerPhone = (customer?.phone || '').replace(/\D/g, '');
        const sendSms = () => this._sendCompleteSms({ ...data, finalPrice }, customer, pet);
        App.showToast(apptDone === 'moved' ? '예약을 오늘로 옮겨 기록했어요' : '미용 기록 저장 완료' + (apptDone ? ' · 예약도 완료 처리했어요' : ''), 'success',
          customerPhone ? { action: { label: '문자 보내기', onClick: sendSms } } : {});
        return;
      }

      App.handleRoute();
    } catch (err) {
      console.error('saveRecord error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  // 기록의 정액권 사용 줄(장부)을 기록에 맞춘다 — 실패해도 기록 저장은 지킨다
  async _syncPrepaidUse(record, payerId) {
    try { await Prepaid.syncRecordUse(record, payerId); }
    catch (e) {
      console.error('정액권 장부 갱신 실패:', e);
      App.showToast('정액권 잔액 반영 중 오류가 났습니다. 고객 화면에서 정액권 내역을 확인해주세요.', 'error');
    }
  },

  async deleteRecord(id, opts = {}) {
    const record = await DB.get('records', id);
    if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
    const pet = record.petId ? await DB.get('pets', record.petId) : null;
    const detail = `<small style="color:var(--text-muted)">${App.formatDate(record.date)}${pet ? ' · ' + App.escapeHtml(pet.name) : ''} · ${App.formatCurrency(App.getRecordAmount(record))}</small>`
      + (Number(record.prepaidUsed) > 0 ? `<br><small>정액권으로 낸 ${App.formatCurrency(record.prepaidUsed)}은 잔액으로 돌아갑니다.</small>` : '');
    const confirmed = await App.confirm(`이 미용 기록을 삭제하시겠습니까?<br>${detail}<br><strong>이 작업은 되돌릴 수 없습니다.</strong>`, { okLabel: '삭제' });
    if (!confirmed) return;
    try {
      // 연관 예약 상태 원복
      if (record && record.appointmentId) {
        const appt = await DB.get('appointments', Number(record.appointmentId));
        if (appt && appt.status === 'completed') {
          appt.status = 'confirmed';
          // 다른 날 예약을 오늘로 옮겨 완료했던 것이면 원래 날짜로 되돌린다 (예전엔 오늘 날짜에 '확정'으로 남아 지난 예약이 됐다)
          if (appt.movedFromDate) { appt.date = appt.movedFromDate; delete appt.movedFromDate; }
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
      // 정액권 사용 줄도 지운다 (잔액 복구 — 다른 기기에는 삭제 표시로 전달)
      try { await Prepaid.removeRecordUse(id); } catch (e) { console.warn('정액권 사용 줄 삭제 실패:', e); }
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
    const paymentMethods = ['cash', 'card', 'transfer', 'unpaid', 'none']; // none = 수단 미선택(옛 기록) — 빠지면 칸 합이 총액과 안 맞는다
    paymentMethods.forEach(m => { paymentBreakdown[m] = { count: 0, amount: 0 }; });
    todayRecs.forEach(r => {
      // 정액권으로 일부 낸 기록은 정액권 몫과 나머지 결제 수단 몫으로 나눠 센다
      const sp = Prepaid.splitOf(r);
      if (sp.used > 0) {
        if (!paymentBreakdown.prepaid) { paymentBreakdown.prepaid = { count: 0, amount: 0 }; if (!paymentMethods.includes('prepaid')) paymentMethods.push('prepaid'); }
        paymentBreakdown.prepaid.count++;
        paymentBreakdown.prepaid.amount += sp.used;
        if (!sp.rest || !sp.restMethod) return;
      }
      const method = r.paymentMethod || 'none';
      if (!paymentBreakdown[method]) paymentBreakdown[method] = { count: 0, amount: 0 };
      paymentBreakdown[method].count++;
      paymentBreakdown[method].amount += sp.used > 0 ? sp.rest : App.getRecordAmount(r);
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
    const paymentColors = { cash: 'var(--success)', card: 'var(--primary)', transfer: 'var(--info)', unpaid: 'var(--danger)', prepaid: 'var(--warning)' };

    const content = `
      <div id="daily-report-content">
        <!-- 헤더 -->
        <div style="text-align:center;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid var(--border)">
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px">
            <input type="date" id="report-date-picker" value="${reportDate}" style="width:auto;padding:8px 14px;font-size:1rem;font-weight:700;color:var(--text-primary);text-align:center;border-radius:8px;min-height:44px">
          </div>
          <div style="font-size:0.93rem;color:var(--text-muted);margin-bottom:4px">${reportDow}요일</div>
          <div style="font-size:2.2rem;font-weight:800;color:var(--primary)">${App.formatCurrency(totalRevenue)}</div>
          <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:0.93rem">
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
                <div style="font-size:0.93rem;color:var(--text-muted);margin-bottom:4px">${this.getPaymentLabel(m)}</div>
                <div style="font-weight:800;font-size:1rem;color:${paymentColors[m] || 'var(--text-primary)'}">${App.formatCurrency(data.amount)}</div>
                <div style="font-size:0.93rem;color:var(--text-muted);margin-top:2px">${data.count}건 · ${pct}%</div>
              </div>`;
            }).filter(Boolean).join('')}
          </div>
        </div>

        <!-- 미용사별 (그날 미용사가 2명 이상일 때만 — 1인 매장은 한 줄뿐이라 뺀다) -->
        ${Object.keys(groomerBreakdown).length > 1 ? `
        <div style="margin-bottom:20px">
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">${App.icon('scissors')} 미용사별</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${Object.entries(groomerBreakdown).sort((a, b) => b[1].amount - a[1].amount).map(([name, data]) => {
              const pct = Math.max(5, Math.round((data.amount / groomerMax) * 100));
              return `<div style="background:var(--bg);border-radius:10px;padding:10px 14px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                  <span style="font-weight:700">${App.escapeHtml(name)} <span style="font-weight:400;color:var(--text-muted);font-size:0.93rem">${data.count}건</span></span>
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
                  <span style="font-weight:700;color:var(--primary);min-width:40px;font-size:0.93rem">${time}</span>
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:0.93rem">${App.escapeHtml(pet?.name || '-')} <span style="font-weight:400;color:var(--text-muted);font-size:0.93rem">${App.escapeHtml(App.getCustomerLabel(customer))}</span></div>
                    ${svcDisplay ? `<div style="font-size:0.93rem;color:var(--text-secondary);margin-top:1px">${App.escapeHtml(svcDisplay)}${r.groomer ? ' · ' + App.escapeHtml(r.groomer) : ''}</div>` : (r.groomer ? `<div style="font-size:0.93rem;color:var(--text-secondary);margin-top:1px">${App.escapeHtml(r.groomer)}</div>` : '')}
                  </div>
                  <div style="text-align:right;flex-shrink:0">
                    <div style="font-weight:700;font-size:0.93rem">${App.formatCurrency(App.getRecordAmount(r))}</div>
                    <div style="font-size:0.93rem;color:${isUnpaid ? 'var(--danger)' : 'var(--text-muted)'}">${this.getPaymentLabel(r.paymentMethod, r)}</div>
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
      noAutoFocus: true, // 날짜 칸에 바로 포커스가 가면 아이폰에서 날짜 휠이 열자마자 올라왔다
      content,
      hideFooter: true
    });

    // Date picker change handler
    document.getElementById('report-date-picker')?.addEventListener('change', (e) => {
      // 창 위에 창을 또 열면 뒤로가기 기록이 쌓여 먹통이 됐다 — 닫고 다시 연다
      const d = e.target.value;
      App.closeModal();
      setTimeout(() => this.showDailyReport(d), 220);
    });
  },

  // 미용 완료 문자 (저장 토스트의 '문자 보내기'와 영수증 화면이 같이 쓴다)
  async _sendCompleteSms(record, customer, pet) {
    const phone = (customer?.phone || '').replace(/\D/g, '');
    if (!phone) return;
    const svcDisplay = [record.service, record.style].filter(Boolean).join(' / ');
    const msg = await App.buildSms('complete', {
      // 이름 없는 손님은 '보호자(1234)님'이 아니라 buildSms 의 '보호자님'으로
      '고객명': customer?.name || '',
      '반려견명': pet?.name || '',
      '서비스': svcDisplay,
      '금액': Number(App.getRecordAmount(record) || 0).toLocaleString('ko-KR')
    });
    App.openSms(phone, msg);
  },

  async showReceipt(recordId) {
    const built = await this._buildReceipt(recordId);
    if (!built) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
    const { record, customer, pet, customerPhone } = built;
    const receiptContent = built.html + `
      <!-- '기록 보기'로 여는 화면이라 보호자에게 보내는 길도 여기 둔다 (저장 직후 토스트를 놓쳐도) -->
      <div class="receipt-actions" style="display:flex;flex-direction:column;gap:8px;margin-top:16px">
        <button type="button" class="btn btn-primary" id="receipt-report" style="min-height:44px">${App.icon('send')} 보호자에게 보내기 (리포트)</button>
        <div style="display:flex;gap:8px">
          ${customerPhone ? `<button type="button" class="btn btn-secondary" id="receipt-sms" style="flex:1;min-height:44px">${App.icon('message')} 완료 문자</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="window.print()" style="flex:1;min-height:44px">${App.icon('print')} 인쇄</button>
        </div>
      </div>
    `;

    App.showModal({
      title: '영수증',
      content: receiptContent,
      hideFooter: true
    });
    document.getElementById('receipt-report')?.addEventListener('click', () => {
      App.closeModal();
      setTimeout(() => this.showReport(record.id), 200); // 닫힘(뒤로가기 정리)이 끝난 뒤 연다
    });
    document.getElementById('receipt-sms')?.addEventListener('click', () => this._sendCompleteSms(record, customer, pet));
  },

  // 영수증 본문 HTML (모달 영수증과 넓은 화면의 오른쪽 상세 칸이 같이 쓴다). 기록이 없으면 null
  async _buildReceipt(recordId) {
    const record = await DB.get('records', recordId);
    if (!record) return null;

    const [customer, pet, services] = await Promise.all([
      DB.get('customers', record.customerId),
      DB.get('pets', record.petId),
      DB.getAll('services')
    ]);
    const serviceMap = {}; services.forEach(s => serviceMap[s.id] = s);
    const shopName = await DB.getSetting('shopName') || '펫살롱';
    const shopPhone = await DB.getSetting('shopPhone') || '';
    const shopAddress = await DB.getSetting('shopAddress') || '';
    const customerPhone = (customer?.phone || '').replace(/\D/g, '');
    // 정액권으로 낸 몫 — '정액권 사용 -N원 (잔액 M원)' (잔액은 이 사용 직후 기준)
    let prepaidRows = '';
    if (Number(record.prepaidUsed) > 0) {
      const useEntry = await Prepaid.getUseEntry(record.id).catch(() => null);
      const after = useEntry ? await Prepaid.balanceAfter(useEntry).catch(() => null) : null;
      prepaidRows = `<div class="receipt-row"><span>정액권 사용</span><span>-${App.formatCurrency(Prepaid.splitOf(record).used)}${after != null ? ` (잔액 ${App.formatCurrency(after)})` : ''}</span></div>`;
    }

    // 금액은 기록에 저장된 값만 쓴다 (현재 메뉴 가격으로 찍으면 가격 변경 후 영수증 줄 합이 소계와 어긋난다)
    // 메뉴는 포함 항목(includedItems) 표시용으로만 조회
    const includedRowFor = (name) => {
      const nm = App.normalizeServiceName(name);
      const svc = services.find(s => s.isActive !== false && App.normalizeServiceName(s.name) === nm)
        || services.find(s => App.normalizeServiceName(s.name) === nm);
      const included = Array.isArray(svc?.includedItems) ? svc.includedItems : [];
      return included.length > 0 ? `<div style="padding-left:8px;font-size:13px;color:var(--text-secondary)">└ ${included.map(i => App.escapeHtml(i)).join(' · ')}</div>` : '';
    };
    const addonPrice = Number(record.addonPrice) || 0;
    let totalPrice = Number(record.totalPrice) || 0;
    let serviceLinesHtml = '';
    if (record.service) {
      const mainPrice = record.servicePrice != null ? (Number(record.servicePrice) || 0) : Math.max(0, totalPrice - addonPrice);
      totalPrice = mainPrice + addonPrice; // 줄 합 = 소계
      // 몸무게 구간 기록: '전체미용 · 5.2kg (5~7kg)' (스냅샷이 없는 옛 기록은 이름만)
      const wTxt = Number(record.weightAtVisit) > 0
        ? ' · ' + App.formatKg(record.weightAtVisit) + 'kg' + (record.priceBandLabel ? ' (' + record.priceBandLabel + ')' : '')
        : '';
      // 서비스(무료)로 제공한 항목: 원래 가격에 줄을 긋고 '서비스'
      const comp = Array.isArray(record.complimentary) ? record.complimentary.filter(Boolean) : [];
      const mainComp = comp.find(c => c.main);
      const freeRow = (name, price, indent) => `<div class="receipt-row"${indent ? ' style="padding-left:8px"' : ''}><span>${App.escapeHtml(name)}</span><span>${Number(price) > 0 ? `<s style="color:var(--text-muted)">${App.formatCurrency(price)}</s> ` : ''}서비스</span></div>`;
      const over = record.priceOver;
      if (mainComp) {
        serviceLinesHtml = freeRow(record.service + wTxt, mainComp.price, false);
      } else if (over && Number(over.extra) > 0 && Number(record.menuPriceAtVisit) === mainPrice && mainPrice > Number(over.extra)) {
        // 메뉴 가격 그대로 받은 경우만 초과 kg 요금을 따로 (직접 고친 금액이면 나눌 근거가 없다)
        serviceLinesHtml = `<div class="receipt-row"><span>${App.escapeHtml(record.service + wTxt)}</span><span>${App.formatCurrency(mainPrice - Number(over.extra))}</span></div>`
          + `<div class="receipt-row" style="padding-left:8px"><span>+ 초과 ${App.escapeHtml(String(over.kg))}kg × ${App.formatCurrency(over.perKg)}</span><span>${App.formatCurrency(over.extra)}</span></div>`;
      } else {
        serviceLinesHtml = `<div class="receipt-row"><span>${App.escapeHtml(record.service + wTxt)}</span><span>${App.formatCurrency(mainPrice)}</span></div>`;
      }
      serviceLinesHtml += includedRowFor(record.service);
      const freeAddonSet = new Set(comp.filter(c => !c.main).map(c => App.normalizeServiceName(c.name)));
      const addons = (Array.isArray(record.addons) ? record.addons : []).filter(a => a && !freeAddonSet.has(App.normalizeServiceName(a)));
      // 예전엔 '+ 엉킴 제거'(금액 없음) 아래 '추가 항목 10,000원'을 따로 찍어 같은 돈이 두 줄처럼 보였다.
      // 항목별 가격은 저장되지 않으므로: 1개면 그 줄에 추가 금액을, 여러 개면 메뉴 가격(반려견 사이즈)으로 줄마다 적고
      // 합이 추가 금액보다 적으면 차액만 '기타 추가'로. 메뉴 가격을 다 못 찾거나 합이 넘치면 이름만 적고 합계 한 줄.
      const addonRow = (name, price) => `<div class="receipt-row" style="padding-left:8px"><span>+ ${App.escapeHtml(name)}</span><span>${price != null ? App.formatCurrency(price) : ''}</span></div>`;
      if (addons.length === 1 && addonPrice > 0) {
        serviceLinesHtml += addonRow(addons[0], addonPrice);
      } else if (addons.length > 1 && addonPrice > 0) {
        const size = Number(record.weightAtVisit) > 0 ? Number(record.weightAtVisit) : App.getPetPriceBasis(pet);
        const menuPrices = await Promise.all(addons.map(a => App.getMenuPrice(a, size, services).then(m => (m && m.price > 0) ? m.price : null).catch(() => null)));
        const sum = menuPrices.reduce((t, p) => t + (p || 0), 0);
        if (menuPrices.every(p => p != null) && sum <= addonPrice) {
          serviceLinesHtml += addons.map((a, i) => addonRow(a, menuPrices[i])).join('');
          if (addonPrice > sum) serviceLinesHtml += addonRow('기타 추가', addonPrice - sum);
        } else {
          serviceLinesHtml += addons.map(a => addonRow(a, null)).join('');
          serviceLinesHtml += `<div class="receipt-row"><span>추가 항목 합계</span><span>${App.formatCurrency(addonPrice)}</span></div>`;
        }
      } else {
        serviceLinesHtml += addons.map(a => addonRow(a, null)).join('');
        if (addonPrice > 0) serviceLinesHtml += `<div class="receipt-row"><span>추가 금액</span><span>${App.formatCurrency(addonPrice)}</span></div>`;
      }
      serviceLinesHtml += comp.filter(c => !c.main).map(c => freeRow('+ ' + c.name, c.price, true)).join('');
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
          .receipt-subtitle { font-size: 13px; color: var(--text-secondary); }
          .receipt-divider { border: none; border-top: 1px dashed var(--border); margin: 8px 0; }
          .receipt-row { display: flex; justify-content: space-between; padding: 2px 0; }
          .receipt-row.total { font-weight: 800; font-size: 15px; border-top: 2px solid var(--text); padding-top: 6px; margin-top: 4px; }
          .receipt-footer { text-align: center; margin-top: 16px; font-size: 13px; color: var(--text-secondary); }
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
          ${extraCharge > 0 ? `<div class="receipt-row"><span>기타 추가</span><span>+${App.formatCurrency(extraCharge)}</span></div>` : ''}
          <div class="receipt-row total"><span>합계</span><span>${App.formatCurrency(finalPrice)}</span></div>
          ${record.paidAt && record.paidAt !== record.date ? `<div class="receipt-row"><span>수금일</span><span>${App.formatDate(record.paidAt)}</span></div>` : ''}
          ${prepaidRows}
          ${record.paymentMethod && record.paymentMethod !== 'prepaid' ? `<div class="receipt-row"><span>결제</span><span>${this.getPaymentLabel(record.paymentMethod)}${prepaidRows ? ' ' + App.formatCurrency(Prepaid.splitOf(record).rest) : ''}</span></div>` : ''}
          <div class="receipt-footer">
            <p>감사합니다 ♥</p>
          </div>
        </div>
      </div>
    `;
    return { record, customer, pet, customerPhone, html: receiptContent };
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
    // 기록 수정 중에는 '이전 미용과 같음'을 보이지 않는다 (지금 기록을 덮어쓰게 된다)
    if (last && copyArea.dataset.edit !== '1') {
      copyArea.style.display = 'block';
      const hint = document.getElementById('copy-last-hint');
      if (hint) hint.textContent = `(${App.formatDate(last.date)})`;
    } else {
      copyArea.style.display = 'none';
    }
  },

  // 마지막 기록 데이터로 폼 필드 자동 채움 (단골 손님 빠른 입력)
  // 컨디션/협조도/결제수단/메모는 매번 다르므로 채우지 않음
  async _applyLastRecord() {
    const last = this._lastRecordForPet;
    if (!last) return;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val != null) el.value = val; };
    setVal('f-service', last.service || '');
    const lastMainComp = Array.isArray(last.complimentary) ? last.complimentary.find(c => c && c.main) : null;
    setVal('f-servicePrice', lastMainComp ? (Number(lastMainComp.price) || 0) : (this._mainPriceOf ? this._mainPriceOf(last) : (Number(last.servicePrice) || 0)));
    // 무료(서비스) 상태도 그대로 가져온다 — 기본가·추가 금액이 '무료 항목을 뺀 값'으로 저장돼 있어서, 무료 표시 없이 가져오면 금액이 맞지 않는다
    const mainFreeBtn = document.getElementById('f-main-free');
    if (mainFreeBtn) {
      mainFreeBtn.classList.toggle('on', !!lastMainComp);
      mainFreeBtn.setAttribute('aria-pressed', lastMainComp ? 'true' : 'false');
      document.getElementById('f-servicePrice')?.classList.toggle('is-free', !!lastMainComp);
    }
    // 서비스 제공 항목이 있으면 토글을 보이게 (켜진 상태를 확인·끌 수 있게)
    if (Array.isArray(last.complimentary) && last.complimentary.length) document.getElementById('f-comp-reveal')?.click();
    const freeAddon = {};
    (Array.isArray(last.complimentary) ? last.complimentary : []).filter(c => c && !c.main).forEach(c => { freeAddon[App.normalizeServiceName(c.name)] = Number(c.price) || 0; });
    setVal('f-style', last.style || '');
    setVal('f-groomer', last.groomer || '');
    setVal('f-addonPrice', last.addonPrice || 0);
    // 추가 항목 태그 복원
    if (Array.isArray(last.addons) && last.addons.length > 0) {
      const tagsDiv = document.getElementById('f-addon-tags');
      if (tagsDiv) {
        // 무료 항목은 원래 가격과 함께 무료로 (추가 금액에는 이미 빠져 있다). 고치려면 [무료]를 다시 누르면 된다.
        // 돈을 받은 항목은 태그마다 자기 가격을 가진다 — 빼면 정확히 그만큼 빠지고, 몸무게가 바뀌면 그 구간 가격으로 다시 맞춘다.
        //  · 받은 항목이 1개면 그 기록의 추가 금액 전부가 그 항목 값
        //  · 여러 개면 지금 몸무게 기준 메뉴 가격. 합이 추가 금액보다 작으면 차이는 추가 금액 칸에만 남는다(어느 태그에도 안 붙음),
        //    크면 앞에서부터 추가 금액이 바닥날 때까지만 나눠 준다 → 합계는 언제나 그 기록의 금액 그대로
        const addonTotal = Number(last.addonPrice) || 0;
        const wv = parseFloat(document.getElementById('f-weightAtVisit')?.value);
        let basis = wv > 0 ? wv : null;
        if (!basis) { const pid = Number(document.getElementById('f-petId')?.value); const pp = pid ? await DB.get('pets', pid) : null; basis = App.getPetPriceBasis(pp); }
        const services = await DB.getAll('services');
        const items = [];
        for (const a of last.addons) {
          const nm = App.normalizeServiceName(a);
          if (!nm || items.some(x => x.nm === nm)) continue;
          const isFree = Object.prototype.hasOwnProperty.call(freeAddon, nm);
          let menu = false, price = 0;
          if (isFree) price = freeAddon[nm];
          else {
            const m = await App.getMenuPrice(nm, basis, services).catch(() => null);
            if (m && App.isExtraCategory(m.service.category)) { menu = true; price = Number(m.price) || 0; }
          }
          items.push({ a, nm, isFree, menu, price });
        }
        const paid = items.filter(x => !x.isFree);
        if (paid.length === 1) paid[0].price = addonTotal;
        else {
          let left = addonTotal;
          paid.forEach(x => { x.price = Math.min(x.price, Math.max(0, left)); left -= x.price; });
        }
        if (!document.getElementById('f-addon-tags')?.isConnected) return;
        tagsDiv.innerHTML = items.map(x => this._addonTagHtml(x.a, x.price, { free: x.isFree, menu: x.menu })).join('');
      }
    }
    // 합계 자동 재계산
    document.getElementById('f-servicePrice')?.dispatchEvent(new Event('input'));
    App.showToast('이전 미용 기록을 가져왔습니다.');
  },

  // r(기록)을 함께 주면 정액권으로 일부 낸 기록을 '정액권+카드'처럼 보여 준다
  getPaymentLabel(method, r) {
    const labels = { cash: '현금', card: '카드', transfer: '계좌이체', unpaid: '미결제', prepaid: '정액권', none: '수단 미선택' };
    const base = labels[method] || '-';
    if (r && method !== 'prepaid' && Number(r.prepaidUsed) > 0) return '정액권+' + (method === 'unpaid' ? '미결제' : base);
    return base;
  },

  // ========== 사진 카드 생성 & 공유 ==========
  CARD_TEMPLATES: {
    classic: { name: '클래식', color: '#1A1A1A', bgColor: '#FFFFFF', emoji: '\u2702', footerBg: '#1A1A1A' },
    film: { name: '필름', color: '#8B7355', bgColor: '#F5F0E8', emoji: '\uD83C\uDFDE', footerBg: '#5C4A32' },
    pastel: { name: '파스텔', color: '#DB2777', bgColor: '#FFF0F5', emoji: '\uD83C\uDF37', footerBg: '#F9A8D4' },
    dark: { name: '다크', color: '#C9A96E', bgColor: '#0F172A', emoji: '\u2728', footerBg: '#1E293B' }
  },

  // --- Helper: load image from src (base64 or url) ---
  // 미리보기를 다시 그릴 때마다 같은 사진을 또 디코딩하지 않게 최근 그림을 몇 장 기억한다
  _imgCache: new Map(),
  // noCache: 같은 사진을 두 칸에 쓸 때 칸마다 _meta(위치·확대)가 따로 붙도록 새 그림을 만든다
  _loadImg(src, noCache) {
    if (!src) return Promise.resolve(null);
    const cache = this._imgCache;
    if (noCache) return new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
    if (cache.has(src)) { const p = cache.get(src); cache.delete(src); cache.set(src, p); return p; }
    const p = new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { cache.delete(src); resolve(null); };
      img.src = src;
    });
    cache.set(src, p);
    while (cache.size > 8) cache.delete(cache.keys().next().value);
    return p;
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
    let layout = designSettings.layout || 'strip2'; // 피드·스토리 4장은 아래에서 4컷으로 바뀐다
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
    let imgBefore = await this._loadImg(photoBefore);
    let imgAfter = await this._loadImg(photoAfter, photoAfter === photoBefore);

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
      ctx.drawImage(_logoOn(), (W - lw) / 2, y, lw, lh);
      ctx.restore();
      return true;
    };

    // 커스텀 테마 오버라이드
    if (s.customBgColor) bgColor = s.customBgColor;
    if (s.customAccentColor) mainColor = s.customAccentColor;
    const _customBgImg = s.customBgImage ? await this._loadImg(s.customBgImage) : null;
    // 배경색 한 줄(자동·연보라·분홍…)에서 고른 색 — 모든 틀에 같이 (포인트 색은 배경색을 진하게)
    if (s.bgPick && (s.bgPick === 'auto' || this._STUDIO_COLORS[s.bgPick])) {
      bgColor = this._studioColor({ studioColor: s.bgPick }, imgBefore || imgAfter);
      mainColor = this._mixHex(bgColor, '#000000', 0.5);
    }
    // 로고 — 한 가지 색 로고가 배경에 묻히면 흰색·짙은 색으로 (배경 사진 위에서는 그대로)
    const _logoOn = () => _customBgImg ? _logoImg : this._logoForBg(_logoImg, bgColor);

    // Determine if dark background for text color decisions
    const _isDark = (hex) => {
      if (!hex) return false;
      const c = hex.replace('#', '');
      const r = parseInt(c.substr(0, 2), 16);
      const g = parseInt(c.substr(2, 2), 16);
      const b = parseInt(c.substr(4, 2), 16);
      return (r * 0.299 + g * 0.587 + b * 0.114) < 140;
    };
    // 배경색 줄에서 고른 색은 사진관·잡지 표지와 같은 기준으로 (연보라·하늘은 흰 글자)
    const darkBg = s.customTextColor ? _isDark(s.customTextColor) : (s.bgPick ? this._studioInk(bgColor) === '#FFFFFF' : _isDark(bgColor));
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
    // 피드·스토리 아래 줄 — 서비스명·다음 방문일은 '글자' 탭에서 켰을 때만 (예전엔 이름을 켜면 서비스명이 늘 같이 나왔다)
    const _svcLine = (s.showService && serviceNames) ? String(serviceNames) : '';
    const _nvLine = (s.showNextVisit && record.nextVisitDate) ? '다음 방문 ' + App.formatDate(record.nextVisitDate) : '';

    // 3·4번째 사진도 로드 (photos 스토어 fallback 포함)
    const photo3Raw = record.photo3 || (record.photo3Id ? await DB.getPhoto(record.photo3Id) : null);
    const photo4Raw = record.photo4 || (record.photo4Id ? await DB.getPhoto(record.photo4Id) : null);
    let img3 = await this._loadImg(photo3Raw, photo3Raw === photoBefore || photo3Raw === photoAfter);
    let img4 = await this._loadImg(photo4Raw, photo4Raw === photoBefore || photo4Raw === photoAfter || photo4Raw === photo3Raw);
    if (img3) img3._meta = _photoMetas.photo3 || { offsetX: 0, offsetY: 0, zoom: 1.0 };
    if (img4) img4._meta = _photoMetas.photo4 || { offsetX: 0, offsetY: 0, zoom: 1.0 };
    // 사진 느낌(필터) — 모든 칸에 같이
    if (s.photoFilter && s.photoFilter !== 'none') {
      imgBefore = this._filteredImg(imgBefore, s.photoFilter);
      imgAfter = this._filteredImg(imgAfter, s.photoFilter);
      img3 = this._filteredImg(img3, s.photoFilter);
      img4 = this._filteredImg(img4, s.photoFilter);
    }

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
      if (img && this._imgHasAlpha(img)) {
        // 배경 지운 사진 — 칸을 배경색보다 살짝 진한(어두운 배경이면 밝은) 색으로 채우고 강아지를 잘리지 않게 세운다
        ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.fillStyle = this._mixHex(bgColor, darkBg ? '#FFFFFF' : '#000000', 0.07); ctx.fillRect(x, y, w, h);
        this._drawCutout(ctx, img, x + w * 0.06, y + h * 0.06, w * 0.88, h * 0.9);
      } else if (img) {
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

    // ===== 내 프레임 (사진 칸을 찾은 덮는 PNG) — 카드 크기·칸 자리는 프레임 그림을 그대로 따른다 =====
    // 글자(이름·날짜)는 프레임 디자인에 맡기고 그리지 않는다. 사진이 칸보다 적으면 돌려 가며 채운다
    const _frameHoles = (Array.isArray(s.frameHoles) && s.frameHoles.length && s.customOverlayImage) ? s.frameHoles : null;
    if (_frameHoles) {
      const fw = (s.frameSize && s.frameSize.w) || 1080, fh = (s.frameSize && s.frameSize.h) || 1350;
      const W = 1080, H = Math.max(1, Math.round(W * fh / fw));
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
      const list = [imgBefore, imgAfter, img3, img4].filter(Boolean);
      _frameHoles.forEach((hl, i) => {
        const x = Math.round(hl.x * W), y = Math.round(hl.y * H);
        const w = Math.round(hl.w * W), h = Math.round(hl.h * H);
        _drawPhoto(ctx, list.length ? list[i % list.length] : null, x, y, w, h);
      });
    }

    // ===== Layout A: strip4 (4컷 가로 4:3 strip) =====
    else if (layout === 'strip4') {
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
      // ===== 폴라로이드 =====
      // classic(기본): 진짜 폴라로이드처럼 아래 여백을 넓게 — 1080×1350(인스타 피드 4:5와 같은 비율), 아래에 이름·문구를 크게
      // square: 정사각 1080×1080, 얇은 여백 (예전 '모던')
      // 예전 '모던 920 / 미니멀 940' 은 사진이 20px 차이라 고르는 의미가 없었다
      const isSquare = s.polaroidShape === 'square';
      const W = 1080, H = isSquare ? 1080 : 1350;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');

      // 배경 — 사용자 커스텀 색이 있으면 그 색, 아니면 옅은 크림
      const polarBg = ((s.template === 'custom' && s.customBgColor) || s.bgPick) ? bgColor : '#FAFAF7';
      ctx.fillStyle = polarBg; ctx.fillRect(0, 0, W, H);
      if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);

      const pad = isSquare ? 80 : 64;
      const photoS = W - pad * 2;
      const mainImg = imgAfter || imgBefore;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.12)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#000'; ctx.fillRect(pad, pad, photoS, photoS);
      ctx.restore();
      _drawPhoto(ctx, mainImg, pad, pad, photoS, photoS, 0);

      const polarText = s.headline ? s.headline : (s.customShowPet ? petName : '');
      const polarTextColor = (s.template === 'custom' && s.customTextColor) ? s.customTextColor : '#1A1A1A';
      const subColor = s.customTextColor ? textSub : '#64748B';
      ctx.textAlign = 'center';
      const areaTop = pad + photoS, areaH = H - areaTop;
      if (isSquare) {
        const textCenterY = areaTop + areaH / 2 + 10;
        ctx.fillStyle = polarTextColor; ctx.font = 'bold 36px ' + fontFamily;
        if (polarText) ctx.fillText(this._truncText(ctx, polarText, W - pad * 2), W / 2, textCenterY);
        if (s.customShowDate) { ctx.fillStyle = subColor; ctx.font = '20px ' + fontFamily; ctx.fillText(dateStr, W / 2, textCenterY + (polarText ? 34 : 0)); }
      } else {
        // 넓은 아래 여백: 큰 글자(이름·문구) → 날짜 → 매장명(작게, 맨 아래)
        const lines = [];
        if (polarText) lines.push({ t: polarText, font: 'bold 64px ' + fontFamily, color: polarTextColor, h: 76 });
        if (s.customShowDate) lines.push({ t: dateStr, font: '28px ' + fontFamily, color: subColor, h: 44 });
        const shopH = s.customShowShop ? 50 : 0;
        const blockH = lines.reduce((sum, l) => sum + l.h, 0);
        let y = areaTop + Math.max(40, (areaH - shopH - blockH) / 2) + 52;
        lines.forEach(l => {
          ctx.fillStyle = l.color; ctx.font = l.font;
          let txt = l.t;
          while (ctx.measureText(txt).width > W - pad * 2 && txt.length > 1) txt = txt.slice(0, -1);
          ctx.fillText(txt === l.t ? txt : txt + '…', W / 2, y);
          y += l.h;
        });
        if (s.customShowShop) {
          if (_logoImg && _logoPos !== 'none') { const lh = 40 * _logoSizeMul, lw = _logoImg.width * (lh / _logoImg.height); ctx.drawImage(_logoOn(), (W - lw) / 2, H - 40 - lh, lw, lh); }
          else if (!_logoImg) { ctx.fillStyle = mainColor; ctx.font = 'bold 26px ' + fontFamily; ctx.fillText(shopName, W / 2, H - 46); }
        }
      }
    }

    // ===== 틀 없이 — 사진 한 장을 그대로 (글자·스티커는 위에 직접) =====
    else if (layout === 'plain') {
      const mainImg = imgAfter || imgBefore;
      const fixed = { '45': 4 / 5, '11': 1, '916': 9 / 16 }[s.plainRatio];
      const r = Math.min(2, Math.max(0.45, fixed || (mainImg ? mainImg.width / mainImg.height : 4 / 5)));
      const W = 1080, H = Math.round(W / r);
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      if (mainImg && this._imgHasAlpha(mainImg)) {
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
        if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);
        this._drawCutout(ctx, mainImg, 70, 70, W - 140, H - 110);
      } else {
        _drawPhoto(ctx, mainImg, 0, 0, W, H);
      }
    }

    // ===== 사진관 — 한 가지 색 배경 · 위에 '매장명 / and / 반려견명' · 가운데 강아지 =====
    // 배경 지운 사진이면 색 배경 위에 강아지만 (발밑 그림자), 아니면 흰 테두리 사진을 가운데에
    else if (layout === 'studio') {
      const W = 1080, H = 1350;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      const mainImg = imgAfter || imgBefore;
      const bg = bgColor;
      const ink = s.customTextColor || this._studioInk(bg);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = ink;
      let y = 96;
      const showShop = s.customShowShop;
      const showPet = s.customShowPet && petName;
      if (showShop) {
        const lg = (_logoImg && _logoPos !== 'none') ? this._logoForBg(_logoImg, bg) : null;
        if (lg) {
          let lh = 96 * _logoSizeMul, lw = lg.width * (lh / lg.height);
          if (lw > 640) { lh *= 640 / lw; lw = 640; }
          ctx.drawImage(lg, (W - lw) / 2, y - 30, lw, lh);
          y += lh - 10;
        } else if (shopName) {
          ctx.font = 'bold 66px ' + fontFamily;
          ctx.fillText(this._truncText(ctx, shopName, W - 200), W / 2, y + 40);
          y += 64;
        }
      }
      if (s.customShowDate) {
        ctx.save(); ctx.globalAlpha = 0.8; ctx.font = '24px ' + fontFamily;
        ctx.fillText(dateStr, W / 2, y + 22); ctx.restore();
        y += 38;
      }
      if (showShop && showPet) { ctx.font = 'bold 28px ' + fontFamily; ctx.fillText('and', W / 2, y + 40); y += 44; }
      if (showPet) { ctx.font = 'bold 52px ' + fontFamily; ctx.fillText(this._truncText(ctx, petName, W - 200), W / 2, y + 56); }
      const top = 400, bottom = H - 70;
      if (mainImg && this._imgHasAlpha(mainImg)) {
        // 확대해도 위 글자를 덮지 않게 글자 아래만
        ctx.save(); ctx.beginPath(); ctx.rect(0, top - 40, W, H - top + 40); ctx.clip();
        this._drawCutout(ctx, mainImg, 110, top, W - 220, bottom - top);
        ctx.restore();
      } else if (mainImg) {
        // 흰 테두리 사진 (참고 사진의 '손에 든 사진' 느낌) — 사진 비율을 살리되 너무 길쭉하지 않게
        const ar = Math.min(1.33, Math.max(0.75, mainImg.width / mainImg.height));
        let iw = 760, ih = iw / ar;
        if (ih > bottom - top - 60) { ih = bottom - top - 60; iw = ih * ar; }
        const b = 18, ox = (W - iw) / 2, oy = top + (bottom - top - ih) / 2;
        ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(ox - b, oy - b, iw + b * 2, ih + b * 2); ctx.restore();
        _drawPhoto(ctx, mainImg, ox, oy, iw, ih, 0);
      } else {
        _placeholder(ctx, 160, top, W - 320, bottom - top);
      }
    }

    // ===== 잡지 표지 — 위에 매장명 크게 · 한 줄 소개 · 가는 줄 · 제목(스타일 이름) =====
    // 일반 사진은 카드 가득, 배경 지운 사진은 색 배경 위 아래쪽에 크게
    else if (layout === 'magazine') {
      const W = 1080, H = 1350;
      canvas.width = W; canvas.height = H;
      ctx = canvas.getContext('2d');
      const mainImg = imgAfter || imgBefore;
      const cut = mainImg && this._imgHasAlpha(mainImg);
      let ink;
      if (!mainImg || cut) {
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, H);
        if (_customBgImg) this._drawImageCover(ctx, _customBgImg, 0, 0, W, H);
        ink = s.customTextColor || this._studioInk(bgColor);
        if (mainImg) { ctx.save(); ctx.beginPath(); ctx.rect(0, 360, W, H - 360); ctx.clip(); this._drawCutout(ctx, mainImg, 40, 460, W - 80, H - 470); ctx.restore(); }
      } else {
        _drawPhoto(ctx, mainImg, 0, 0, W, H);
        ink = this._regionLuma(ctx, 0, 0, W, 420) < 150 ? '#FFFFFF' : '#2B2B2B';
        // 글자가 잘 보이게 위쪽만 살짝 어둡게(또는 밝게)
        const g = ctx.createLinearGradient(0, 0, 0, 560);
        g.addColorStop(0, ink === '#FFFFFF' ? 'rgba(0,0,0,0.38)' : 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, 560);
      }
      ctx.textBaseline = 'alphabetic'; ctx.fillStyle = ink; ctx.strokeStyle = ink;
      if (ink === '#FFFFFF' && !cut) { ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 10; }
      if (s.customShowShop) {
        const lg = (_logoImg && _logoPos !== 'none') ? this._logoForBg(_logoImg, cut || !mainImg ? bgColor : (ink === '#FFFFFF' ? '#333333' : '#EEEEEE')) : null;
        if (lg) {
          let lh = 110 * _logoSizeMul, lw = lg.width * (lh / lg.height);
          if (lw > 760) { lh *= 760 / lw; lw = 760; }
          ctx.drawImage(lg, (W - lw) / 2, 150 - lh * 0.75, lw, lh);
        } else if (shopName) {
          this._spacedText(ctx, shopName, W / 2, 150, 8, 'bold {s}px ' + fontFamily, 84, W - 160);
        }
      }
      const sub = s.subline || (s.customShowDate ? dateStr : '');
      if (sub) this._spacedText(ctx, sub, W / 2, 205, 7, '{s}px ' + fontFamily, 24, W - 200);
      ctx.save(); ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2 - 320, 244); ctx.lineTo(W / 2 + 320, 244); ctx.stroke(); ctx.restore();
      const title = s.headline || (s.showService && serviceNames ? String(serviceNames) : '') || (s.customShowPet ? petName : '');
      if (title) this._spacedText(ctx, title, W / 2, 322, 12, '{s}px ' + fontFamily, 58, W - 180);
      if (s.customShowPet && petName && title !== petName) {
        ctx.font = 'bold 34px ' + fontFamily; ctx.textAlign = 'center';
        ctx.fillText(this._truncText(ctx, petName, W - 200), W / 2, H - 56);
      }
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
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
        if (_logoImg && _logoPos !== 'none') { const lh = 28 * _logoSizeMul, lw = _logoImg.width * (lh / _logoImg.height); ctx.drawImage(_logoOn(), (W - lw) / 2, _ty - 12, lw, lh); }
        else if (!_logoImg) { ctx.fillStyle = mainColor; ctx.font = 'bold 13px ' + fontFamily; const shopLine = (s.showShopPhone && shopPhone) ? shopName + ' · ' + shopPhone : shopName; ctx.fillText(shopLine, W / 2, _ty); }
      }
    }

    // ===== 인스타 피드 (4:5, 1080×1350) =====
    else if (layout === 'feed' || layout === 'feed4') {
      // 피드에 사진 4장 = 피드 4컷 (칸마다 띄운 2×2). 3장 이하는 예전 피드 그대로
      if ([imgBefore, imgAfter, img3, img4].filter(Boolean).length >= 4) layout = 'feed4';
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
        + (_svcLine ? 35 : 0) + (s.customShowDate ? 30 : 0) + (_nvLine ? 30 : 0);
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
      const _extraH = (_hasHeadline ? 50 : 0) + (_hasSubline ? 36 : 0) + (_svcLine ? 35 : 0) + (_nvLine ? 30 : 0);
      const hasFeedText = s.customShowPet || s.customShowDate || _hasHeadline || _hasSubline || _svcLine || _nvLine;
      if (hasFeedText && _useTextBox) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this._roundRect(ctx, 40, ftY - 10, W - 80, 120 + _extraH, 14); ctx.fill();
      }
      let _fty = ftY + 30;
      if (_hasHeadline) { ctx.fillStyle = textColor; ctx.font = 'bold 38px ' + fontFamily; ctx.fillText(s.headline, W / 2, _fty); _fty += 44; }
      if (_hasSubline) { ctx.fillStyle = textSub; ctx.font = '26px ' + fontFamily; ctx.fillText(s.subline, W / 2, _fty); _fty += 32; }
      if (s.customShowPet) { ctx.fillStyle = textColor; ctx.font = 'bold 42px ' + fontFamily; ctx.fillText(petName, W / 2, _fty); _fty += 40; }
      if (_svcLine) { ctx.fillStyle = textSub; ctx.font = '28px ' + fontFamily; ctx.fillText(_svcLine, W / 2, _fty); _fty += 35; }
      if (s.customShowDate) { ctx.fillStyle = textSub; ctx.font = '24px ' + fontFamily; ctx.fillText(dateStr, W / 2, _fty); _fty += 30; }
      if (_nvLine) { ctx.fillStyle = mainColor; ctx.font = 'bold 24px ' + fontFamily; ctx.fillText(_nvLine, W / 2, _fty); }
    }

    // ===== 인스타 스토리 (9:16) =====
    else if (layout === 'story' || layout === 'story4') {
      // 스토리에 사진 4장 = 스토리 4컷 (세로로 긴 2×2). 3장 이하는 예전 스토리 그대로
      if ([imgBefore, imgAfter, img3, img4].filter(Boolean).length >= 4) layout = 'story4';
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
          + (_svcLine ? 40 : 0) + (s.customShowDate ? 36 : 0) + (_nvLine ? 36 : 0);
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
      const _sExtraH = (_sHasHl ? 56 : 0) + (_sHasSub ? 40 : 0) + (_svcLine ? 40 : 0) + (_nvLine ? 36 : 0);
      const hasStoryText = s.customShowPet || s.customShowDate || _sHasHl || _sHasSub || _svcLine || _nvLine;
      if (hasStoryText && _useTextBox) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this._roundRect(ctx, 60, infoY - 10, W - 120, 160 + _sExtraH, 16); ctx.fill();
      }
      let _sty = infoY + 40;
      if (_sHasHl) { ctx.fillStyle = textColor; ctx.font = 'bold 44px ' + fontFamily; ctx.fillText(s.headline, W / 2, _sty); _sty += 50; }
      if (_sHasSub) { ctx.fillStyle = textSub; ctx.font = '30px ' + fontFamily; ctx.fillText(s.subline, W / 2, _sty); _sty += 36; }
      if (s.customShowPet) { ctx.fillStyle = textColor; ctx.font = 'bold 48px ' + fontFamily; ctx.fillText(petName, W / 2, _sty); _sty += 45; }
      if (_svcLine) { ctx.fillStyle = textSub; ctx.font = '32px ' + fontFamily; ctx.fillText(_svcLine, W / 2, _sty); _sty += 40; }
      if (s.customShowDate) { ctx.fillStyle = textSub; ctx.font = '28px ' + fontFamily; ctx.fillText(dateStr, W / 2, _sty); _sty += 36; }
      if (_nvLine) { ctx.fillStyle = mainColor; ctx.font = 'bold 28px ' + fontFamily; ctx.fillText(_nvLine, W / 2, _sty); }

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
        const sImg = await this._loadImg(st.src || this._stickerSrc(st.id));
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
    // 틀 없이 — 사진 한 장 그대로, 스티커·글자만 위에 (2026-11-10 사장님 요청 '틀 없이도 꾸미게')
    plain: { name: '틀 없이', icon: 'image', photos: 1 },
    photobooth: { name: '네컷 세로', icon: 'list', photos: 4 },
    feed: { name: '피드 4:5', icon: 'image', photos: 4 },
    story: { name: '스토리', icon: 'camera', photos: 4 },
    // 피드 4컷·스토리 4컷은 '피드·스토리에 사진 4장'과 같아 고르는 칸에서 뺐다 — 이제 피드·스토리에 4장을 넣으면 자동으로 4컷 모양.
    // 키는 남겨 둔다: 설정의 프레임 가이드(기본 feed4)와 예전 저장값이 그대로 그려지게 (legacy 는 사진 카드 창에 안 보임)
    feed4: { name: '피드 4컷', icon: 'image', photos: 4, legacy: true },
    story4: { name: '스토리 4컷', icon: 'camera', photos: 4, legacy: true },
    strip2: { name: '2컷', icon: 'copy', photos: 2 },
    single: { name: '폴라로이드', icon: 'circle', photos: 1 },
    // 사진관 참고 사진(한 가지 색 배경 · 위에 작은 글자) — 2026-11-10
    studio: { name: '사진관', icon: 'camera', photos: 1 },
    magazine: { name: '잡지 표지', icon: 'image', photos: 1 }
  },
  // 사진관·잡지 표지·틀 없이(배경 지운 사진) 배경색 — 사진관 배경지처럼 연한 한 가지 색. hue: 자동 고르기용 색상각
  _STUDIO_COLORS: {
    lavender: { name: '연보라', hex: '#A58BD6', hue: 262 },
    pink: { name: '분홍', hex: '#F4B2C6', hue: 342 },
    sky: { name: '하늘', hex: '#74C6D8', hue: 191 },
    lemon: { name: '레몬', hex: '#F5D565', hue: 47 },
    mint: { name: '민트', hex: '#A3D9C0', hue: 152 },
    beige: { name: '베이지', hex: '#D9CCC0', hue: 28 },
    gray: { name: '연회색', hex: '#ECEAE6', hue: null }
  },
  _PLAIN_RATIOS: { orig: '사진 그대로', '45': '4:5 피드', '11': '1:1 정사각', '916': '9:16 스토리' },
  // 고르는 칸에서 뺀 레이아웃 → 가장 가까운 레이아웃 (저장된 카드 설정 이어받기)
  _CARD_LAYOUT_MIGRATE: { feed4: 'feed', story4: 'story', strip4: 'photobooth' },
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
    // 2026-11-10 추가 — 모두 Google Fonts(OFL, 홍보물·상업 이용 가능)
    gamja: { name: '감자꽃', family: 'Gamja Flower', css: 'Gamja+Flower' },
    himelody: { name: '하이멜로디', family: 'Hi Melody', css: 'Hi+Melody' },
    singleday: { name: '싱글데이', family: 'Single Day', css: 'Single+Day' },
    dongle: { name: '동글', family: 'Dongle', css: 'Dongle:wght@400;700' },
    bagel: { name: '베이글', family: 'Bagel Fat One', css: 'Bagel+Fat+One' },
    blackhan: { name: '검은고딕', family: 'Black Han Sans', css: 'Black+Han+Sans' },
    gasoek: { name: '가석', family: 'Gasoek One', css: 'Gasoek+One' },
    orbit: { name: '오르빛', family: 'Orbit', css: 'Orbit' },
    yeonsung: { name: '연성', family: 'Yeon Sung', css: 'Yeon+Sung' },
    brush: { name: '나눔붓', family: 'Nanum Brush Script', css: 'Nanum+Brush+Script' },
    dokdo: { name: '독도', family: 'Dokdo', css: 'Dokdo' },
    // 페이퍼로지 — Google Fonts 에 없어 눈누(jsDelivr) 글꼴 파일을 직접 붙인다
    paperlogy: { name: '페이퍼로지', family: 'Paperlogy', faces: [
      { weight: '400', url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-4Regular.woff2' },
      { weight: '700', url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2408-3@1.0/Paperlogy-7Bold.woff2' }
    ] }
  },
  // 사진 카드 스티커 — Google Noto Emoji(Apache 2.0) 를 256px WebP 로 앱에 넣어 둔다 (기기마다 모양이 같고 오프라인에서도 된다)
  _STICKERS: ['1f43e', '2764', '1f495', '1f496', '1f49d', '1f380', '1f9b4', '2728', '1f451', '1f338', '1f337', '1f33c', '1f490', '2b50', '1f31f', '2702', '1fae7', '1f6c1', '1f436', '1f415', '1f429', '1f431', '1f9f8', '1f389', '1f382', '1f388', '1f308', '2600', '2744', '1f384', '1f340', '1f4af', '1f44d', '1f60d', '1f970'],
  // AI 일러스트 스티커 (사장님 레퍼런스: 레트로 라벨 · 브랜드 버건디 · 모던 미니멀) — 먼저 보여 준다
  _AI_STICKER_SETS: {'retro': ['ai_rt_01_seriously_fluffy', 'ai_rt_02_lucky_puppy', 'ai_rt_03_fresh_bone', 'ai_rt_04_just_groomed', 'ai_rt_05_totally_fluffy', 'ai_rt_06_blep', 'ai_rt_07_top_dog', 'ai_rt_08_bath_time'], 'brand': ['ai_br_01_keep_it_fluffy', 'ai_br_02_groom_smile', 'ai_br_03_groomed_love', 'ai_br_04_promise', 'ai_br_05_trust_care', 'ai_br_06_feel_difference', 'ai_br_07_best_look', 'ai_br_08_honest_prices'], 'modern': ['ai_md_01_grooming_mode', 'ai_md_02_think_fresh', 'ai_md_03_blue_paw', 'ai_md_04_pixel_puppy', 'ai_md_05_cute_mode', 'ai_md_06_orbit_star', 'ai_md_07_fur_care', 'ai_md_08_groomed_shield']},
  // 세련된 스타일 (차분한 색·글자 중심 배지·라벨·오라 그라데이션) — 기본으로 먼저 보여 준다
  _CHIC_STICKERS: ['pt_chic_goodvibes', 'pt_chic_nobad', 'pt_chic_beyou', 'pt_chic_sofluffy', 'pt_chic_freshcut', 'pt_chic_club', 'pt_chic_gooddog', 'pt_chic_ticket', 'pt_chic_fresh_star', 'pt_chic_tag', 'pt_chic_stamp', 'pt_chic_pretty', 'pt_chic_today_dog', 'pt_chic_bubble_done', 'pt_chic_bubble_bosong', 'pt_chic_groomed', 'pt_chic_withlove', 'pt_chic_green_paw', 'pt_chic_dogline', 'pt_chic_aura_lovely', 'pt_chic_aura_fluffy', 'pt_chic_aura_heart'],
  _stickerSrc(id) { return /^(pt|ai)_/.test(String(id)) ? `assets/stickers/${id}.webp` : `assets/stickers/emoji_u${id}.webp`; },
  _stickerSrcOf(st) {
    if (st.src) return st.src; // 글자 스티커 (만들어 둔 그림)
    if (st.cid) { const c = (this._customStickers || []).find(x => x.id === st.cid); return c ? c.image : ''; }
    return this._stickerSrc(st.id);
  },
  MAX_CUSTOM_STICKERS: 24,
  // 글자 스티커 모양
  // 글자 모양 (인스타 글자처럼) — 색은 아래 팔레트에서 따로 고른다. 예전 pink·dark 는 라벨+그 색으로 그린다
  _TEXT_STICKER_STYLES: {
    plain: { name: '글자만' },
    outline: { name: '테두리' },
    box: { name: '배경 상자' },
    glass: { name: '반투명' },
    bubble: { name: '말풍선' },
    label: { name: '라벨' },
    neon: { name: '네온' }
  },
  _TEXT_COLORS: ['#FFFFFF', '#1F2937', '#FF6B9A', '#F43F5E', '#FB923C', '#FACC15', '#34D399', '#38BDF8', '#6366F1', '#A78BFA', '#8B5E3C', '#F5E6D3'],
  // 글자 모양 → 기본 색 (색을 안 고른 예전 글자 스티커)
  _textStickerDefaults(style, color) {
    if (style === 'pink') return { style: 'label', color: color || '#FF6B9A' };
    if (style === 'dark') return { style: 'label', color: color || '#1F2937' };
    const st = this._TEXT_STICKER_STYLES[style] ? style : 'bubble';
    return { style: st, color: color || ((st === 'outline' || st === 'plain') ? '#1F2937' : '#FFFFFF') };
  },
  // 배경색이 밝으면 진한 글자, 어두우면 흰 글자
  _isLightColor(hex) {
    const c = String(hex || '').replace('#', '');
    if (c.length < 6) return true;
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
  },

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

  // ===== 사진 느낌(필터) — 포토부스처럼 한 번 고르면 모든 칸에 같이 들어간다 =====
  // 기기마다 같게 나오도록 캔버스 filter 대신 화소를 직접 바꾼다 (아이폰 옛 버전은 ctx.filter 가 없다)
  // sat 채도 · con 대비 · bri 밝기 · mul/add 색(빨강·초록·파랑) · grain 필름 입자 · glow 뽀샤시 번짐
  _CARD_FILTERS: {
    none: { name: '원본' },
    bw: { name: '흑백', sat: 0, con: 1.12 },
    soft: { name: '뽀샤시', sat: 0.92, con: 0.9, bri: 1.05, add: [12, 10, 10], glow: 0.3 },
    film: { name: '필름', sat: 0.78, con: 0.92, mul: [1.02, 1, 0.94], add: [14, 12, 10], grain: 7 },
    warm: { name: '따뜻하게', sat: 1.06, mul: [1.07, 1.01, 0.9], add: [4, 0, -2] },
    cool: { name: '시원하게', sat: 0.95, mul: [0.93, 1, 1.07], add: [0, 2, 8] }
  },
  // ===== 떼어 낸 사진 가장자리 다듬기 (2026-11-10) =====
  // 아이폰으로 떼어 낸 사진은 털 둘레에 배경색 띠(초록·분홍·회색)가 남고 선이 딱딱하다.
  // ① 가장자리를 조금 깎고 ② 깎은 곳 둘레 색을 바로 안쪽 털 색으로 바꾸고 ③ 살짝 흐려 털처럼 부드럽게 한다.
  _CUTOUT_LEVELS: { 0: '끄기', 1: '약하게', 2: '보통', 3: '강하게' },
  // 한 줄(가로 또는 세로)씩 최솟값 — 알파를 r 칸 깎는다 (세로도 줄 단위로 읽어 빠르게)
  _alphaMin(src, w, h, r) {
    if (r <= 0) return src.slice();
    // 그림 끝 밖은 끝 칸과 같다고 본다 (사진 끝에서 잘린 몸통이 끝선을 따라 깎이지 않게)
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) {
        let m = src[o + x];
        const a = x - r < 0 ? 0 : x - r, b = x + r > w - 1 ? w - 1 : x + r;
        for (let k = a; k <= b && m; k++) if (src[o + k] < m) m = src[o + k];
        tmp[o + x] = m;
      }
    }
    for (let y = 0; y < h; y++) {
      const o = y * w;
      out.set(tmp.subarray(o, o + w), o);
      const a = y - r < 0 ? 0 : y - r, b = y + r > h - 1 ? h - 1 : y + r;
      for (let yy = a; yy <= b; yy++) {
        if (yy === y) continue;
        const u = yy * w;
        for (let x = 0; x < w; x++) { const v = tmp[u + x]; if (v < out[o + x]) out[o + x] = v; }
      }
    }
    return out;
  },
  // 상자 흐림 (가로·세로 한 번씩, 세로는 줄 단위 누적)
  _alphaBlur(src, w, h, r) {
    if (r <= 0) return src.slice();
    const tmp = new Uint16Array(w * h), out = new Uint8Array(w * h), d = r * 2 + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let k = -r; k <= r; k++) s += src[o + Math.min(w - 1, Math.max(0, k))];
      const last = o + w - 1;
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s;
        const ai = o + x + r + 1, si = o + x - r;
        s += src[ai > last ? last : ai] - src[si < o ? o : si];
      }
    }
    const acc = new Float64Array(w), dd = d * d;
    for (let k = -r; k <= r; k++) { const o = Math.min(h - 1, Math.max(0, k)) * w; for (let x = 0; x < w; x++) acc[x] += tmp[o + x]; }
    for (let y = 0; y < h; y++) {
      const o = y * w, add = Math.min(h - 1, y + r + 1) * w, sub = Math.max(0, y - r) * w;
      for (let x = 0; x < w; x++) {
        out[o + x] = (acc[x] / dd + 0.5) | 0;
        acc[x] += tmp[add + x] - tmp[sub + x];
      }
    }
    return out;
  },
  // 붓질(지우기·되살리기) 목록 → 칸마다 -1(지움) / 1(되살림) / 0
  // 붓질: { m: -1|1, r: 반지름(그림 화소), p: [x0,y0,x1,y1,…] }
  _strokeMask(strokes, w, h) {
    if (!strokes || !strokes.length) return null;
    const mask = new Int8Array(w * h);
    const dot = (cx, cy, r, m) => {
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
      const rr = r * r;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= rr) mask[y * w + x] = m;
      }
    };
    for (const st of strokes) {
      const p = st.p || [], r = Math.max(1, st.r || 10);
      for (let i = 0; i < p.length; i += 2) {
        if (i >= 2) { // 앞 점과 사이를 메운다 (손가락을 빨리 움직여도 끊기지 않게)
          const px = p[i - 2], py = p[i - 1], dx = p[i] - px, dy = p[i + 1] - py;
          const n = Math.ceil(Math.hypot(dx, dy) / Math.max(1, r / 2));
          for (let k = 1; k < n; k++) dot(px + dx * k / n, py + dy * k / n, r, st.m);
        }
        dot(p[i], p[i + 1], r, st.m);
      }
    }
    return mask;
  },
  // 순수 함수: 떼어 낸 사진(RGBA, w×h)을 다듬는다. data 를 바꿔서 돌려준다.
  // level 0~3 (끄기·약하게·보통·강하게), strokes: 붓질 목록, orig: 원래 RGBA (되살리기용, 없으면 data 그대로를 원본으로 본다)
  _refineCutout(data, w, h, level, strokes, orig) {
    const N = w * h;
    const src = orig || data.slice();
    const mask = this._strokeMask(strokes, w, h);
    const A = new Uint8Array(N);
    for (let i = 0; i < N; i++) A[i] = (mask && mask[i] < 0) ? 0 : src[i * 4 + 3];
    const out = new Uint8Array(N);
    if (level > 0 && Math.min(w, h) >= 40) {
      const s = Math.max(1, Math.max(w, h) / 1200); // 큰 사진이면 그만큼 더
      const e = Math.round([0, 1, 2, 3][level] * s), f = Math.round([0, 1, 2, 3][level] * s);
      const M = this._alphaMin(A, w, h, e + Math.ceil(f / 2));
      const B = this._alphaBlur(this._alphaBlur(M, w, h, f), w, h, f);
      for (let i = 0; i < N; i++) out[i] = Math.min(B[i], A[i]);
      // 둘레 색 바로잡기: 안쪽 털(완전히 불투명한 곳) 색을 바깥으로 번지게 해 둘레 칸 색을 바꾼다
      const solid = this._alphaMin(A, w, h, e + f + 2);
      const known = new Uint8Array(N);
      const R = new Float32Array(N), G = new Float32Array(N), Bc = new Float32Array(N);
      let band = [];
      for (let i = 0; i < N; i++) {
        if (solid[i] >= 250) { known[i] = 1; R[i] = src[i * 4]; G[i] = src[i * 4 + 1]; Bc[i] = src[i * 4 + 2]; }
        else if (out[i] > 0) band.push(i);
      }
      for (let it = 0; it < e + f + 6 && band.length; it++) {
        const next = [], fill = [];
        for (const i of band) {
          const x = i % w, y = (i - x) / w;
          let n = 0, r = 0, g = 0, b = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = yy * w + xx;
            if (known[j]) { n++; r += R[j]; g += G[j]; b += Bc[j]; }
          }
          if (n) fill.push(i, r / n, g / n, b / n); else next.push(i);
        }
        for (let k = 0; k < fill.length; k += 4) { const i = fill[k]; R[i] = fill[k + 1]; G[i] = fill[k + 2]; Bc[i] = fill[k + 3]; known[i] = 1; }
        band = next;
      }
      for (let i = 0; i < N; i++) {
        const q = i * 4;
        if (out[i] > 0 && solid[i] < 250 && known[i]) {
          // 원래 색과 털 색을 섞는다 (가장자리일수록 털 색)
          const t = 1 - out[i] / 255 * 0.35;
          data[q] = Math.round(src[q] * (1 - t) + R[i] * t);
          data[q + 1] = Math.round(src[q + 1] * (1 - t) + G[i] * t);
          data[q + 2] = Math.round(src[q + 2] * (1 - t) + Bc[i] * t);
        } else { data[q] = src[q]; data[q + 1] = src[q + 1]; data[q + 2] = src[q + 2]; }
        data[q + 3] = out[i];
      }
    } else {
      for (let i = 0; i < N; i++) { const q = i * 4; data[q] = src[q]; data[q + 1] = src[q + 1]; data[q + 2] = src[q + 2]; data[q + 3] = A[i]; }
    }
    // 되살리기 붓: 원래 그대로
    if (mask) for (let i = 0; i < N; i++) if (mask[i] > 0) { const q = i * 4; data[q] = src[q]; data[q + 1] = src[q + 1]; data[q + 2] = src[q + 2]; data[q + 3] = src[q + 3]; }
    return data;
  },
  // 떼어 낸 사진 원본·다듬기 값 기억 (다듬은 사진 주소 → { orig, level, strokes }) — 카드 창을 새로 열면 비운다
  _cutoutSrc: new Map(),
  // 칸에 없는 사진의 기억은 버린다 (큰 글자열이라 쌓이면 아이폰 메모리를 먹는다)
  _pruneCutoutSrc() {
    const live = new Set((this._cardPhotos || []).filter(Boolean));
    for (const k of [...this._cutoutSrc.keys()]) if (!live.has(k)) this._cutoutSrc.delete(k);
  },
  // 원본(투명 사진 주소)을 다듬어 새 주소로 — 기억해 두고 돌려준다
  async _refineToUrl(orig, level, strokes) {
    const img = await this._loadImg(orig, true);
    if (!img) return orig;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    this._refineCutout(d.data, c.width, c.height, level, strokes, d.data.slice());
    x.putImageData(d, 0, 0);
    const url = c.toDataURL('image/png');
    c.width = c.height = 0;
    this._cutoutSrc.set(url, { orig, level, strokes: strokes || [] });
    return url;
  },

  // ===== 가장자리 손질 화면 (자동 다듬기 단계 + 지우기·되살리기 붓, 두 손가락 확대) =====
  async _openCutoutEditor(slot) {
    const cur = this._cardPhotos[slot];
    if (!cur || this._cutoutOpening || document.querySelector('.cutout-ed')) return; // 두 번 눌러도 하나만
    this._cutoutOpening = true;
    const info = this._cutoutSrc.get(cur) || { orig: cur, level: 0, strokes: [] };
    const img = await this._loadImg(info.orig, true).catch(() => null);
    this._cutoutOpening = false;
    if (!img) { App.showToast('사진을 읽지 못했어요.', 'error'); return; }
    const W = img.width, H = img.height;
    const oc = document.createElement('canvas'); oc.width = W; oc.height = H;
    const ox = oc.getContext('2d', { willReadFrequently: true }); ox.drawImage(img, 0, 0);
    const origData = ox.getImageData(0, 0, W, H).data;
    const work = document.createElement('canvas'); work.width = W; work.height = H;
    const wx = work.getContext('2d', { willReadFrequently: true });
    const st = { level: info.level, strokes: (info.strokes || []).map(s => ({ ...s, p: s.p.slice() })), tool: 'erase', brush: 36, bg: 'check',
      scale: 1, tx: 0, ty: 0, busy: false, dirty: false, closed: false, saving: false };
    const bgOf = { check: null, black: '#111111', white: '#FFFFFF', card: null };
    const esc = App.escapeHtml;
    const ov = document.createElement('div');
    ov.className = 'cutout-ed';
    ov.innerHTML = `
      <div class="cutout-ed-top">
        <button type="button" class="btn btn-sm btn-ghost" data-act="cancel">취소</button>
        <b>가장자리 손질</b>
        <span class="cutout-ed-actions"><button type="button" class="btn btn-sm btn-secondary" data-act="undo" aria-label="한 번 되돌리기">↶ 되돌리기</button>
        <button type="button" class="btn btn-sm btn-primary" data-act="done">완료</button></span>
      </div>
      <div class="cutout-ed-stage"><canvas></canvas><div class="cutout-ed-busy" hidden>다듬는 중…</div></div>
      <div class="cutout-ed-bar">
        <div class="cutout-ed-row"><span class="cutout-ed-lb">자동 다듬기</span>
          ${Object.entries(this._CUTOUT_LEVELS).map(([k, n]) => `<button type="button" class="card-tstyle-btn" data-level="${k}">${esc(n)}</button>`).join('')}</div>
        <div class="cutout-ed-row"><span class="cutout-ed-lb">손으로</span>
          <button type="button" class="card-tstyle-btn" data-tool="erase">지우기</button>
          <button type="button" class="card-tstyle-btn" data-tool="restore">되살리기</button>
          <button type="button" class="card-tstyle-btn" data-tool="move">옮기기</button></div>
        <div class="cutout-ed-row"><span class="cutout-ed-lb">붓 크기</span><input type="range" min="10" max="90" step="2" value="${st.brush}" data-brush></div>
        <div class="cutout-ed-row"><span class="cutout-ed-lb">바탕 보기</span>
          <button type="button" class="card-tstyle-btn" data-bg="check">격자</button>
          <button type="button" class="card-tstyle-btn" data-bg="black">검정</button>
          <button type="button" class="card-tstyle-btn" data-bg="white">흰색</button></div>
        <div class="cutout-ed-hint">남은 배경 덩어리는 '지우기'로 문지르고, 너무 지운 곳은 '되살리기'. 두 손가락으로 크게 볼 수 있어요.</div>
      </div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('canvas'), stage = ov.querySelector('.cutout-ed-stage'), busyEl = ov.querySelector('.cutout-ed-busy');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let fit = 1;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
      cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
      fit = Math.min(cv.width / W, cv.height / H) * 0.94;
      draw();
    };
    // 화면 ↔ 그림 좌표
    const view = () => { const s = fit * st.scale; return { s, ox: (cv.width - W * s) / 2 + st.tx * dpr, oy: (cv.height - H * s) / 2 + st.ty * dpr }; };
    // 그림이 화면 밖으로 다 나가지 않게
    const clampPan = () => {
      const r = stage.getBoundingClientRect(), s = fit * st.scale / dpr;
      const mx = Math.max(0, (W * s - r.width) / 2 + r.width * 0.3), my = Math.max(0, (H * s - r.height) / 2 + r.height * 0.3);
      st.tx = Math.max(-mx, Math.min(mx, st.tx)); st.ty = Math.max(-my, Math.min(my, st.ty));
    };
    const toImg = (cx, cy) => { const r = cv.getBoundingClientRect(), v = view(); return [((cx - r.left) * dpr - v.ox) / v.s, ((cy - r.top) * dpr - v.oy) / v.s]; };
    const draw = () => {
      const g = cv.getContext('2d'), v = view();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      if (st.bg === 'check') {
        const t = 14 * dpr;
        for (let y = 0; y < cv.height; y += t) for (let x = 0; x < cv.width; x += t) { g.fillStyle = ((x / t + y / t) & 1) ? '#D1D5DB' : '#F3F4F6'; g.fillRect(x, y, t, t); }
      } else { g.fillStyle = bgOf[st.bg]; g.fillRect(0, 0, cv.width, cv.height); }
      g.imageSmoothingQuality = 'high';
      g.drawImage(work, v.ox, v.oy, W * v.s, H * v.s);
    };
    const recompute = () => {
      if (st.busy) { st.dirty = true; return; }
      st.busy = true; busyEl.hidden = false;
      setTimeout(() => {
        if (st.closed) return;
        try {
          const d = wx.createImageData(W, H);
          d.data.set(origData);
          this._refineCutout(d.data, W, H, st.level, st.strokes, origData);
          wx.putImageData(d, 0, 0);
        } catch (e) { console.warn('가장자리 다듬기 실패:', e); }
        st.busy = false; busyEl.hidden = true; draw();
        if (st.dirty) { st.dirty = false; recompute(); }
      }, 30);
    };
    const sync = () => {
      ov.querySelectorAll('[data-level]').forEach(b => b.classList.toggle('active', Number(b.dataset.level) === st.level));
      ov.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === st.tool));
      ov.querySelectorAll('[data-bg]').forEach(b => b.classList.toggle('active', b.dataset.bg === st.bg));
      const u = ov.querySelector('[data-act="undo"]'); if (u) u.disabled = !st.strokes.length;
      cv.style.cursor = st.tool === 'move' ? 'grab' : 'crosshair';
    };
    const close = () => {
      if (st.closed) return;
      st.closed = true;
      window.removeEventListener('resize', resize);
      ov.remove(); work.width = work.height = oc.width = oc.height = 0;
    };
    ov._close = close; // 카드 창이 닫힐 때(뒤로 가기 등)도 정리되게
    ov.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.level != null) { st.level = Number(b.dataset.level); recompute(); }
      else if (b.dataset.tool) st.tool = b.dataset.tool;
      else if (b.dataset.bg) { st.bg = b.dataset.bg; draw(); }
      else if (b.dataset.act === 'undo') { st.strokes.pop(); recompute(); }
      else if (b.dataset.act === 'cancel') { if (!st.saving) close(); return; }
      else if (b.dataset.act === 'done') {
        if (st.saving) return;
        st.saving = true;
        ov.querySelectorAll('button').forEach(x => { x.disabled = true; });
        // 마지막 계산이 끝난 뒤 저장
        while (st.busy || st.dirty) { if (st.closed) return; await new Promise(r => setTimeout(r, 50)); }
        if (st.closed || !ov.isConnected) return;
        const url = work.toDataURL('image/png');
        if (this._cardPhotos[slot] === cur) {
          this._cardPhotos[slot] = url;
          this._cutoutSrc.set(url, { orig: info.orig, level: st.level, strokes: st.strokes });
          this._pruneCutoutSrc();
          this._refreshPhotoPreview(slot);
          this._scheduleCardPreview();
        } else App.showToast('그사이 사진이 바뀌어서 손질한 것은 넣지 않았어요.', 'error');
        close();
        return;
      }
      sync();
    });
    ov.querySelector('[data-brush]').addEventListener('input', (e) => { st.brush = Number(e.target.value); });
    // 손가락: 하나 = 붓(또는 옮기기), 둘 = 확대·이동
    const pts = new Map();
    let stroke = null, pinch = null, pan = null, snap = null;
    const dab = (ix, iy, r) => {
      // 그리는 동안은 바로 보이게 작업 그림에 직접 (손을 떼면 전체를 다시 다듬는다)
      wx.save(); wx.beginPath(); wx.arc(ix, iy, r, 0, Math.PI * 2); wx.clip();
      if (stroke.m < 0) wx.clearRect(ix - r, iy - r, r * 2, r * 2);
      else {
        const x0 = Math.max(0, Math.floor(ix - r)), y0 = Math.max(0, Math.floor(iy - r));
        const ww = Math.min(W, Math.ceil(ix + r)) - x0, hh = Math.min(H, Math.ceil(iy + r)) - y0;
        if (ww > 0 && hh > 0) { wx.clearRect(x0, y0, ww, hh); wx.drawImage(oc, x0, y0, ww, hh, x0, y0, ww, hh); }
      }
      wx.restore();
    };
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size >= 2) {
        // 두 손가락 — 그리던 선은 버리고(그리기 전 모습으로) 확대로. 세 번째 손가락은 무시
        if (stroke) { st.strokes.pop(); stroke = null; if (snap) { wx.putImageData(snap, 0, 0); snap = null; } sync(); }
        pan = null;
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), scale: st.scale, tx: st.tx, ty: st.ty, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
        }
        draw();
        return;
      }
      if (pinch) return;
      if (st.tool === 'move') { pan = { x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty }; return; }
      if (st.busy) return; // 다듬는 중에는 붓을 받지 않는다 (계산이 붓 자국을 덮어쓴다)
      try { snap = wx.getImageData(0, 0, W, H); } catch (_) { snap = null; }
      const [ix, iy] = toImg(e.clientX, e.clientY);
      const r = st.brush / 2 * dpr / view().s;
      stroke = { m: st.tool === 'erase' ? -1 : 1, r: Math.round(r * 10) / 10, p: [Math.round(ix), Math.round(iy)] };
      st.strokes.push(stroke);
      dab(ix, iy, r); draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const ns = Math.max(1, Math.min(8, pinch.scale * d / Math.max(1, pinch.d)));
        // 손가락 가운데 아래 지점이 그대로 있게 (가운데 기준 좌표)
        const rc = cv.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
        const k = ns / pinch.scale, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        st.scale = ns;
        st.tx = mx - cx - (pinch.mx - cx - pinch.tx) * k;
        st.ty = my - cy - (pinch.my - cy - pinch.ty) * k;
        clampPan(); draw(); return;
      }
      if (pan) { st.tx = pan.tx + e.clientX - pan.x; st.ty = pan.ty + e.clientY - pan.y; clampPan(); draw(); return; }
      if (stroke) {
        const [ix, iy] = toImg(e.clientX, e.clientY);
        const p = stroke.p, lx = p[p.length - 2], ly = p[p.length - 1];
        const n = Math.ceil(Math.hypot(ix - lx, iy - ly) / Math.max(1, stroke.r / 2));
        for (let k = 1; k <= n; k++) dab(lx + (ix - lx) * k / n, ly + (iy - ly) * k / n, stroke.r);
        p.push(Math.round(ix), Math.round(iy));
        draw();
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2 && pinch) {
        pinch = null;
        // 한 손가락이 남으면 그 자리에서 이어서 옮기기 (붓은 새로 대야 그린다)
        if (pts.size === 1 && st.tool === 'move') { const [p] = [...pts.values()]; pan = { x: p[0], y: p[1], tx: st.tx, ty: st.ty }; }
      }
      if (!pts.size) { pan = null; snap = null; if (stroke) { stroke = null; recompute(); sync(); } }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    // 컴퓨터: 마우스 휠로 확대
    cv.addEventListener('wheel', (e) => { e.preventDefault(); if (!e.deltaY) return; st.scale = Math.max(1, Math.min(8, st.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); clampPan(); draw(); }, { passive: false });
    window.addEventListener('resize', resize);
    sync();
    requestAnimationFrame(() => { resize(); recompute(); });
  },
  // ===== 사진관·잡지 표지·틀 없이 도우미 (2026-11-10) =====
  // 사진에 투명한 곳이 있나 (아이폰에서 강아지만 떼어 낸 사진) — 작게 줄여 3% 넘게 투명하면 '배경 지운 사진'
  _alphaCache: (typeof WeakMap !== 'undefined') ? new WeakMap() : null,
  _imgHasAlpha(img) {
    if (!img || !img.width) return false;
    const hit = this._alphaCache && this._alphaCache.get(img);
    if (hit !== undefined) return hit;
    let res = false;
    try {
      const c = document.createElement('canvas'); c.width = 48; c.height = 48;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 48, 48);
      res = this._alphaShare(x.getImageData(0, 0, 48, 48).data) > 0.03;
      c.width = c.height = 0;
    } catch (_) { res = false; }
    if (this._alphaCache) this._alphaCache.set(img, res);
    return res;
  },
  // 화소 배열에서 투명한(알파 200 미만) 화소의 비율 — 순수 함수
  _alphaShare(data) {
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 200) n++;
    return data.length ? n / (data.length / 4) : 0;
  },
  // 사진 색에 어울리는 배경색 고르기 — 순수 함수. cutout(배경 지운 사진)이면 강아지 털색의 반대쪽 색, 아니면 사진 속 가장 많은 색과 가까운 색
  _pickStudioColor(data, cutout) {
    let sx = 0, sy = 0, n = 0, opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 200) continue;
      opaque++;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      if (max < 60 || min > 225) continue;
      if ((max - min) / max < 0.18) continue;
      let h;
      const d = max - min;
      if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
      sx += Math.cos(h * Math.PI / 180); sy += Math.sin(h * Math.PI / 180); n++;
    }
    if (!opaque || n < opaque * 0.08) return 'lavender'; // 흰 강아지·흑백 사진 → 연보라
    let hue = Math.atan2(sy, sx) * 180 / Math.PI;
    if (cutout) hue += 180;
    hue = ((hue % 360) + 360) % 360;
    let best = 'lavender', bestD = 999;
    Object.entries(this._STUDIO_COLORS).forEach(([k, c]) => {
      if (c.hue == null) return;
      const dd = Math.min(Math.abs(c.hue - hue), 360 - Math.abs(c.hue - hue));
      if (dd < bestD) { bestD = dd; best = k; }
    });
    return best;
  },
  _studioColor(s, img) {
    const pick = s && s.studioColor;
    if (pick && this._STUDIO_COLORS[pick]) return this._STUDIO_COLORS[pick].hex;
    if (pick && /^#[0-9a-f]{6}$/i.test(pick)) return pick;
    let key = 'lavender';
    if (img) {
      try {
        const c = document.createElement('canvas'); c.width = 40; c.height = 40;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 40, 40);
        key = this._pickStudioColor(x.getImageData(0, 0, 40, 40).data, this._imgHasAlpha(img));
        c.width = c.height = 0;
      } catch (_) {}
    }
    return this._STUDIO_COLORS[key].hex;
  },
  // 배경색 위 글자색 — 진하면 흰색, 연하면 짙은 회색
  _studioInk(hex) {
    const c = String(hex || '#FFFFFF').replace('#', '');
    const l = parseInt(c.substr(0, 2), 16) * 0.299 + parseInt(c.substr(2, 2), 16) * 0.587 + parseInt(c.substr(4, 2), 16) * 0.114;
    return l < 180 ? '#FFFFFF' : '#2B2B2B';
  },
  // 색 섞기 (t=0 → a, 1 → b), '#rrggbb' 로 돌려준다
  _mixHex(a, b, t) {
    const h = (c) => { c = String(c || '#FFFFFF').replace('#', ''); return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) || 0); };
    const A = h(a), B = h(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  },
  // 로고가 한 가지 색(투명 배경)이면 그 색 [r,g,b], 아니면 null — 순수 함수 (여러 색 로고·사각 로고는 손대지 않는다)
  _monoLogoColor(data) {
    let op = 0, tr = 0, sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) { tr++; continue; }
      op++; sr += data[i]; sg += data[i + 1]; sb += data[i + 2];
    }
    if (!op || tr < (op + tr) * 0.05) return null;
    const mr = sr / op, mg = sg / op, mb = sb / op;
    let close = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const d = Math.abs(data[i] - mr) + Math.abs(data[i + 1] - mg) + Math.abs(data[i + 2] - mb);
      if (d < 90) close++;
    }
    return close / op >= 0.85 ? [mr, mg, mb] : null;
  },
  // 순수 함수: 한 가지 색 로고(rgb)가 배경(hex)과 밝기 차이가 작으면 true
  _logoNeedsTint(rgb, bgHex) {
    if (!rgb) return false;
    const c = String(bgHex || '#FFFFFF').replace('#', '');
    const bl = parseInt(c.substr(0, 2), 16) * 0.299 + parseInt(c.substr(2, 2), 16) * 0.587 + parseInt(c.substr(4, 2), 16) * 0.114;
    const ll = rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114;
    return Math.abs(bl - ll) < 90;
  },
  _logoTintCache: (typeof WeakMap !== 'undefined') ? new WeakMap() : null,
  // 한 가지 색 로고가 배경과 밝기가 비슷해 묻히면 배경에 맞는 글자색(흰색·짙은 색)으로 바꿔 그린다. 잘 보이면 원래 색 그대로
  _logoForBg(img, bgHex) {
    if (!img) return null;
    const hit = this._logoTintCache && this._logoTintCache.get(img);
    if (hit && hit.bg === bgHex) return hit.out;
    let out = img;
    try {
      const r = Math.min(1, 600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, c.width, c.height);
      if (this._logoNeedsTint(this._monoLogoColor(x.getImageData(0, 0, c.width, c.height).data), bgHex)) {
        x.globalCompositeOperation = 'source-in'; x.fillStyle = this._studioInk(bgHex); x.fillRect(0, 0, c.width, c.height);
        out = c;
      } else c.width = c.height = 0;
    } catch (_) { out = img; }
    if (this._logoTintCache) this._logoTintCache.set(img, { bg: bgHex, out });
    return out;
  },
  // 배경 지운 사진을 상자 안에 바닥 맞춰 놓고, 발밑 그림자를 그린다 (확대·위치 슬라이더 반영)
  _drawCutout(ctx, img, bx, by, bw, bh, noFloor) {
    const m = img._meta || {};
    const z = Math.max(1, Math.min(3, m.zoom || 1));
    const sc = Math.min(bw / img.width, bh / img.height) * z;
    const w = img.width * sc, h = img.height * sc;
    const x = bx + (bw - w) / 2 - (m.offsetX || 0) / 100 * bw;
    const y = by + bh - h - (m.offsetY || 0) / 100 * bh;
    if (!noFloor) {
      ctx.save();
      ctx.translate(x + w / 2, y + h - 4); ctx.scale(1, 0.13);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.42);
      g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = Math.max(8, w * 0.045); ctx.shadowOffsetY = Math.max(3, w * 0.016);
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  },
  // 글자 사이를 띄워 가운데 맞춰 그린다 (잡지 표지 제목). 폭을 넘으면 글자를 줄인다
  _spacedText(ctx, text, cx, y, spacing, font, size, maxW) {
    const chars = Array.from(String(text || ''));
    if (!chars.length) return size;
    let fs = size, total = 0, ws = [];
    const measure = () => { ctx.font = font.replace('{s}', fs); ws = chars.map(ch => ctx.measureText(ch).width); total = ws.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1) * fs / size; };
    measure();
    while (total > maxW && fs > 18) { fs -= 2; measure(); }
    const sp = spacing * fs / size;
    let x = cx - total / 2;
    const al = ctx.textAlign; ctx.textAlign = 'left';
    chars.forEach((ch, i) => { ctx.fillText(ch, x, y); x += ws[i] + sp; });
    ctx.textAlign = al;
    return fs;
  },
  // 캔버스 한 부분의 평균 밝기 (0~255) — 사진 위 글자색 고르기
  _regionLuma(ctx, x, y, w, h) {
    try {
      const d = ctx.getImageData(x, y, w, h).data;
      let s = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 16) { s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++; }
      return n ? s / n : 255;
    } catch (_) { return 255; }
  },
  // 화소 배열(RGBA)에 필터 값을 그대로 적용한다 — 테스트에서 바로 부를 수 있게 순수 함수
  _applyFilterPixels(data, p) {
    if (!p) return data;
    const sat = p.sat ?? 1, con = p.con ?? 1, bri = p.bri ?? 1;
    const mul = p.mul || [1, 1, 1], add = p.add || [0, 0, 0], grain = p.grain || 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const n = grain ? (Math.random() - 0.5) * 2 * grain : 0;
      const ch = [r, g, b];
      for (let k = 0; k < 3; k++) {
        let v = l + (ch[k] - l) * sat;
        v = (v - 128) * con + 128;
        v = v * bri * mul[k] + add[k] + n;
        data[i + k] = v < 0 ? 0 : (v > 255 ? 255 : Math.round(v));
      }
    }
    return data;
  },
  // 사진(이미지)에 필터를 입힌 캔버스를 돌려준다. 같은 사진·같은 필터는 다시 계산하지 않는다
  // (사진마다 마지막 필터 하나만 들고 있다 — 아이폰 캔버스 메모리 한도)
  _filterCache: (typeof WeakMap !== 'undefined') ? new WeakMap() : null,
  _filteredImg(img, key) {
    const p = this._CARD_FILTERS[key];
    if (!img || !p || key === 'none') return img;
    const cached = this._filterCache && this._filterCache.get(img);
    if (cached && cached.key === key) { cached.canvas._meta = img._meta; return cached.canvas; }
    try {
      const r = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
      this._paintFiltered(c, img, p);
      if (cached) cached.canvas.width = cached.canvas.height = 0;
      if (this._filterCache) this._filterCache.set(img, { key, canvas: c });
      c._meta = img._meta;
      return c;
    } catch (e) {
      console.warn('사진 필터 실패:', e);
      return img;
    }
  },
  // 캔버스 c 를 img 로 채우고 필터 p 를 입힌다 (카드용·작은 견본 공용)
  _paintFiltered(c, img, p, cover) {
    const x = c.getContext('2d', { willReadFrequently: true });
    if (cover) this._drawImageCover(x, img, 0, 0, c.width, c.height);
    else x.drawImage(img, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height);
    this._applyFilterPixels(d.data, p);
    x.putImageData(d, 0, 0);
    const keepAlpha = !cover && this._alphaShare(d.data) > 0; // 배경 지운 사진 — 뽀샤시가 투명한 곳으로 번지지 않게
    if (p.glow) {
      // 작게 줄였다 늘리면 흐린 사본이 된다 — 밝게 겹쳐 뽀샤시하게
      const s = document.createElement('canvas');
      s.width = Math.max(1, Math.round(c.width / 12)); s.height = Math.max(1, Math.round(c.height / 12));
      s.getContext('2d').drawImage(c, 0, 0, s.width, s.height);
      x.save();
      x.globalAlpha = p.glow; x.globalCompositeOperation = 'screen'; x.imageSmoothingQuality = 'high';
      x.drawImage(s, 0, 0, c.width, c.height);
      x.restore();
      s.width = s.height = 0;
      if (keepAlpha) {
        const d2 = x.getImageData(0, 0, c.width, c.height);
        for (let i = 3; i < d2.data.length; i += 4) d2.data[i] = d.data[i];
        x.putImageData(d2, 0, 0);
      }
    }
  },

  // ===== 내 프레임 '사진 칸' 자동 찾기 =====
  // 덮는 프레임(PNG)에서 투명하게 뚫린 자리를 찾아 그 자리에 사진을 넣는다 — 어떤 크기·칸 수의 프레임이든 맞는다.
  // alpha: 투명도 배열(0~255), w·h: 그 크기. 돌려주는 칸은 프레임 가로·세로에 대한 비율 {x, y, w, h}, 위→아래·왼→오른 순서
  _findHolesInAlpha(alpha, w, h) {
    const THR = 100, MAX = 8;
    const seen = new Uint8Array(w * h);
    const found = [];
    const stack = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || alpha[start] >= THR) continue;
      let minX = w, maxX = -1, minY = h, maxY = -1, count = 0;
      seen[start] = 1; stack.push(start);
      while (stack.length) {
        const i = stack.pop();
        const px = i % w, py = (i - px) / w;
        count++;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        const nb = [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, py > 0 ? i - w : -1, py < h - 1 ? i + w : -1];
        for (const j of nb) if (j >= 0 && !seen[j] && alpha[j] < THR) { seen[j] = 1; stack.push(j); }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      // 너무 작은 자리(글자 틈·점 무늬)나 가는 선 모양은 사진 칸이 아니다
      if (count < w * h * 0.01 || bw < w * 0.08 || bh < h * 0.03 || count < bw * bh * 0.4) continue;
      found.push({ minX, minY, bw, bh, count });
    }
    found.sort((a, b) => b.count - a.count);
    const holes = found.slice(0, MAX).map(f => {
      // 가장자리 한 칸씩 넓혀 사진이 프레임 밑으로 살짝 들어가게 (경계에 흰 틈이 안 생긴다)
      const x0 = Math.max(0, f.minX - 1), y0 = Math.max(0, f.minY - 1);
      const x1 = Math.min(w, f.minX + f.bw + 1), y1 = Math.min(h, f.minY + f.bh + 1);
      const r4 = (v) => Math.round(v * 10000) / 10000;
      return { x: r4(x0 / w), y: r4(y0 / h), w: r4((x1 - x0) / w), h: r4((y1 - y0) / h) };
    });
    // 같은 줄(세로 가운데가 칸 높이 절반 안)이면 왼쪽부터, 아니면 위부터
    holes.sort((a, b) => {
      const ay = a.y + a.h / 2, by = b.y + b.h / 2;
      if (Math.abs(ay - by) < Math.min(a.h, b.h) / 2) return a.x - b.x;
      return ay - by;
    });
    return holes;
  },
  // 흰 네모 칸 찾기 (챗GPT 프레임처럼 사진 자리가 흰 네모로 비어 있는 그림) — data: RGBA 화소, w·h: 크기
  // 그림 가장자리에 닿은 흰 곳(흰 바탕)은 칸이 아니다. 네모에 가깝고(채움 85% 이상) 충분히 큰 곳만.
  // 돌려주는 값: [{ minX, minY, maxX, maxY, seed }] (seed: 그 칸 안의 흰 점 하나, 화소 번호)
  _findWhiteBoxes(data, w, h) {
    const white = (i) => data[i * 4 + 3] > 200 && data[i * 4] >= 238 && data[i * 4 + 1] >= 238 && data[i * 4 + 2] >= 238;
    const seen = new Uint8Array(w * h);
    const out = [];
    const stack = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || !white(start)) continue;
      let minX = w, maxX = -1, minY = h, maxY = -1, count = 0, edge = false;
      seen[start] = 1; stack.push(start);
      while (stack.length) {
        const i = stack.pop();
        const px = i % w, py = (i - px) / w;
        count++;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (px === 0 || py === 0 || px === w - 1 || py === h - 1) edge = true;
        const nb = [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, py > 0 ? i - w : -1, py < h - 1 ? i + w : -1];
        for (const j of nb) if (j >= 0 && !seen[j] && white(j)) { seen[j] = 1; stack.push(j); }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      if (edge || count < w * h * 0.01 || bw < w * 0.08 || bh < h * 0.03 || count < bw * bh * 0.85) continue;
      out.push({ minX, minY, maxX, maxY, seed: start });
    }
    return out.slice(0, 8);
  },
  // 흰 네모 칸을 투명하게 뚫은 새 그림을 만든다 → { image, count } (칸이 없으면 count 0)
  async _whiteBoxesToHoles(src) {
    const img = await this._loadImg(src, true);
    if (!img || !img.width) return { image: src, count: 0 };
    const w = img.width, h = img.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    let count = 0;
    try {
      const d = x.getImageData(0, 0, w, h);
      const px = d.data;
      const boxes = this._findWhiteBoxes(px, w, h);
      const isWhite = (i) => px[i * 4 + 3] > 200 && px[i * 4] >= 238 && px[i * 4 + 1] >= 238 && px[i * 4 + 2] >= 238;
      const light = (i) => px[i * 4] >= 205 && px[i * 4 + 1] >= 205 && px[i * 4 + 2] >= 205;
      const clear = new Uint8Array(w * h);
      for (const b of boxes) {
        // 그 칸의 흰 부분만 지운다 (칸에 걸친 캐릭터·글자는 남는다)
        const stack = [b.seed]; clear[b.seed] = 1;
        while (stack.length) {
          const i = stack.pop();
          const qx = i % w, qy = (i - qx) / w;
          const nb = [qx > 0 ? i - 1 : -1, qx < w - 1 ? i + 1 : -1, qy > 0 ? i - w : -1, qy < h - 1 ? i + w : -1];
          for (const j of nb) if (j >= 0 && !clear[j] && isWhite(j)) { clear[j] = 1; stack.push(j); }
        }
        count++;
      }
      if (count) {
        // 테두리에 남는 옅은 회색 한 줄(번짐)도 함께 지운다
        const extra = [];
        for (let i = 0; i < w * h; i++) {
          if (clear[i]) continue;
          const qx = i % w;
          if (((qx > 0 && clear[i - 1]) || (qx < w - 1 && clear[i + 1]) || (i >= w && clear[i - w]) || (i + w < w * h && clear[i + w])) && light(i)) extra.push(i);
        }
        extra.forEach(i => { clear[i] = 1; });
        for (let i = 0; i < w * h; i++) if (clear[i]) px[i * 4 + 3] = 0;
        x.putImageData(d, 0, 0);
      }
    } catch (e) { console.warn('흰 칸 바꾸기 실패:', e); count = 0; }
    const image = count ? c.toDataURL('image/png') : src;
    c.width = c.height = 0;
    return { image, count };
  },
  // 프레임 그림에서 사진 칸을 찾는다 → { holes, fw, fh } (JPG 처럼 투명한 곳이 없으면 holes 는 빈 배열)
  async _detectFrameHoles(src) {
    const img = await this._loadImg(src, true);
    if (!img || !img.width || !img.height) return { holes: [], fw: 0, fh: 0 };
    const r = Math.min(1, 300 / img.width, 1000 / img.height);
    const w = Math.max(1, Math.round(img.width * r)), h = Math.max(1, Math.round(img.height * r));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    let holes = [];
    try {
      const d = x.getImageData(0, 0, w, h).data;
      const alpha = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3];
      holes = this._findHolesInAlpha(alpha, w, h);
    } catch (e) { console.warn('프레임 칸 찾기 실패:', e); }
    c.width = c.height = 0;
    return { holes, fw: img.width, fh: img.height };
  },
  // 이 카드 설정에서 쓰는 사진 장수 — 칸을 찾은 내 프레임이면 프레임 칸 수(최대 4장), 아니면 레이아웃 장수
  // 사진 느낌 견본 — 첫 사진으로 작게 그린다 (첫 사진이 바뀔 때만 다시)
  async _refreshFilterThumbs() {
    const row = document.getElementById('card-pick-filter');
    if (!row) return;
    const src = (this._cardPhotos || []).find(Boolean) || null;
    if (src === this._filterThumbSrc) return;
    this._filterThumbSrc = src;
    const img = src ? await this._loadImg(src) : null;
    if (src !== this._filterThumbSrc) return; // 그새 사진이 또 바뀌었다
    row.querySelectorAll('.card-filter-thumb').forEach(el => {
      const p = this._CARD_FILTERS[el.dataset.key];
      if (!img || !p) { el.style.backgroundImage = ''; return; }
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 112;
        const keep = img._meta; img._meta = null;
        if (el.dataset.key === 'none') this._drawImageCover(c.getContext('2d'), img, 0, 0, 112, 112);
        else this._paintFiltered(c, img, p, true);
        img._meta = keep;
        el.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.8)})`;
        c.width = c.height = 0;
      } catch (_) { el.style.backgroundImage = ''; }
    });
  },
  // 틀마다 '자동으로 넣는 정보'가 들어가는 자리 — 없는 것은 흐리게 하고 알려 준다 (예전엔 켜도 안 나와 헷갈렸다)
  _TEXT_SUPPORT: {
    photobooth: ['pet', 'date', 'shop'],
    strip2: ['pet', 'date', 'shop', 'service', 'nextvisit'],
    single: ['pet', 'date', 'shop'],
    feed: ['pet', 'date', 'shop', 'service', 'nextvisit'],
    story: ['pet', 'date', 'shop', 'service', 'nextvisit'],
    plain: [],
    studio: ['pet', 'date', 'shop'],
    magazine: ['pet', 'date', 'shop', 'service']
  },
  _updateTextSupport(f) {
    const frameMode = !!(f.settings && Array.isArray(f.settings.frameHoles) && f.settings.frameHoles.length);
    let ok = frameMode ? [] : (this._TEXT_SUPPORT[f.layout] || ['pet', 'date', 'shop']);
    if (!frameMode && f.layout === 'single' && f.settings && f.settings.polaroidShape === 'square') ok = ['pet', 'date'];
    const names = { pet: '반려견 이름', date: '날짜', shop: '매장명', service: '서비스명', nextvisit: '다음 방문일' };
    const off = [];
    Object.keys(names).forEach(k => {
      const el = document.getElementById('card-show-' + k);
      if (!el) return;
      const on = ok.includes(k);
      el.disabled = !on;
      el.closest('label')?.classList.toggle('unsupported', !on);
      if (!on) off.push(names[k]);
    });
    const hint = document.getElementById('card-text-support');
    if (hint) hint.textContent = frameMode
      ? '내 프레임은 정보를 넣지 않아요 — 위 \'글자 넣기\'로 원하는 자리에 넣으세요.'
      : f.layout === 'plain' ? '틀 없이는 사진만 나와요 — 위 \'글자 넣기\'와 스티커로 꾸미세요.'
      : (off.length ? `이 틀에는 ${off.join('·')} 자리가 없어요 — 필요하면 위 '글자 넣기'로 넣으세요.` : '다음 방문일을 넣으면 손님이 다시 예약하기 쉬워요.');
  },
  // 틀 탭의 '배경색 ○○ 바꾸기' 줄에 지금 색을 보여 준다
  _syncBgLink(f) {
    const dot = document.getElementById('card-bg-link-dot'), nm = document.getElementById('card-bg-link-name');
    if (!dot || !nm) return;
    const st = f.settings || {};
    const link = document.getElementById('card-bg-link');
    if (link) link.hidden = !!(Array.isArray(st.frameHoles) && st.frameHoles.length);
    let name, hex;
    if (st.bgPick === 'auto') { name = '자동'; hex = null; }
    else if (this._STUDIO_COLORS[st.bgPick]) { name = this._STUDIO_COLORS[st.bgPick].name; hex = this._STUDIO_COLORS[st.bgPick].hex; }
    else if (f.theme === 'custom') { name = st.customBgImage ? '배경 사진' : '직접 고른 색'; hex = st.customBgImage ? null : (st.customBgColor || '#FFFFFF'); }
    else { name = ({ classic: '흰색', film: '크림', pastel: '연분홍', dark: '남색' })[f.theme] || '흰색'; hex = this.CARD_TEMPLATES[f.theme]?.bgColor || '#FFFFFF'; }
    nm.textContent = name;
    dot.style.background = hex || '';
    dot.classList.toggle('auto', !hex);
  },
  _cardPhotoCount(f) {
    const holes = f && f.settings && f.settings.frameHoles;
    if (Array.isArray(holes) && holes.length) return Math.min(4, holes.length);
    return (this._CARD_LAYOUTS[f && f.layout] && this._CARD_LAYOUTS[f.layout].photos) || 1;
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
          // 즉석 등록은 단일가 (구간 가격은 서비스 메뉴에서 수정)
          await DB.add('services', App.withPricing({
            name, category,
            description: '',
            pricing: { mode: 'flat', flat: price, prices: {} },
            isActive: true,
            priceChangedAt: new Date().toISOString()
          }, await App.getPriceBands()));
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

  // 줄이기 — 투명한 곳이 있으면 PNG(투명 유지), 없으면 JPEG
  _resizeCardPhoto(dataUrl, maxSize, quality, refine) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const r = Math.min(1, maxSize / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const cut = this._imgHasAlpha(c);
          const out = cut ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', quality);
          c.width = c.height = 0;
          // 떼어 낸 사진은 가장자리를 '보통'으로 자동 다듬는다 (원본은 기억해 두고 '가장자리'에서 다시 고친다)
          if (cut && refine) this._refineToUrl(out, 2, []).then(resolve, () => resolve(out));
          else resolve(out);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  },
  // 사진 파일 하나 → 줄인 dataURL (못 읽으면 null)
  // refine: 카드 사진 칸 — 떼어 낸 사진이면 가장자리를 자동으로 다듬는다 (프레임 배경 그림 등은 그대로)
  _readCardPhotoFile(file, refine) {
    return new Promise(resolve => {
      const reader = new FileReader();
      // 카드 출력(1080px) 대응. 배경을 지운(투명) 사진은 투명한 채로 둔다 — 사진관·잡지 표지에서 색 배경 위에 올린다
      reader.onload = (ev) => this._resizeCardPhoto(ev.target.result, 1200, 0.85, refine).then(d => resolve(d || null));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  },
  // 여러 장 넣기: startSlot 칸 → 그 뒤 빈 칸 → 앞쪽 빈 칸 순서 (최대 4장). startSlot 이 없으면 빈 칸부터
  // replaceFirst: 앞 칸 n개를 새 사진으로 바꾼다 (사진을 다 읽은 뒤에 비워서, 못 읽으면 원래 사진이 남는다)
  async _addCardPhotos(files, startSlot, replaceFirst = 0) {
    if (replaceFirst) {
      const datas = [];
      for (const fl of files.slice(0, 4)) { const d = await this._readCardPhotoFile(fl, true); if (d) datas.push(d); }
      if (!datas.length) { App.showToast('사진을 읽지 못했어요. 다른 사진(JPG·PNG)을 골라 주세요.', 'error'); return; }
      for (let k = 0; k < 4; k++) {
        if (k >= replaceFirst && k >= datas.length) continue; // 나머지 칸은 그대로
        const d = datas[k] || null;
        this._cardPhotos[k] = d;
        this._cardPhotoMeta[k] = { offsetX: 0, offsetY: 0, zoom: 1.0 };
        if (this._cardUserPicked) this._cardUserPicked[k] = !!d;
        this._refreshPhotoPreview(k); this._resetPhotoSliders(k);
        const ctl = document.getElementById(`card-photo-controls-${k}`); if (ctl) ctl.style.display = 'none';
        const adj = document.getElementById(`card-adjust-${k}`); if (adj) adj.hidden = !d;
      }
      if (files.length > 4) App.showToast('사진은 4장까지라 앞 4장만 넣었어요.', 'info');
      this._scheduleCardPreview();
      return;
    }
    const photos = this._cardPhotos || (this._cardPhotos = [null, null, null, null]);
    const order = [];
    if (startSlot != null) order.push(startSlot);
    for (let k = 0; k < 4; k++) if (!order.includes(k) && !photos[k] && k > (startSlot ?? -1)) order.push(k);
    for (let k = 0; k < 4; k++) if (!order.includes(k) && !photos[k]) order.push(k);
    const list = files.slice(0, order.length);
    if (files.length > order.length) App.showToast(`넣을 수 있는 칸이 ${order.length}개라 앞 ${order.length}장만 넣었어요.`, 'info');
    let bad = 0;
    for (let n = 0; n < list.length; n++) {
      const data = await this._readCardPhotoFile(list[n], true);
      if (!data) { bad++; continue; }
      const slot = order[n];
      this._cardPhotos[slot] = data;
      this._cardPhotoMeta[slot] = { offsetX: 0, offsetY: 0, zoom: 1.0 };
      if (this._cardUserPicked) this._cardUserPicked[slot] = true;
      this._refreshPhotoPreview(slot);
      this._resetPhotoSliders(slot);
      const adj = document.getElementById(`card-adjust-${slot}`);
      if (adj) adj.hidden = false;
    }
    // HEIC 등 읽을 수 없는 사진은 빈 칸으로 조용히 남지 않게 알린다
    if (bad) App.showToast(`${bad}장은 읽지 못했어요. 다른 사진(JPG·PNG)을 골라 주세요.`, 'error');
    this._scheduleCardPreview();
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
    // 조정 패널은 칸 아래 공용 자리로 옮겨 쓰므로, 다시 그릴 때 함께 비운다
    const adjHost = document.getElementById('card-photo-adjust');
    if (adjHost) adjHost.innerHTML = '';
    // 작은 칸 4개를 한 줄로 (예전 2×2 큰 칸은 사진만으로 화면 하나를 썼다)
    container.innerHTML = Array.from({ length: count }, (_, i) => `
      <div class="card-slot">
        <input type="file" id="card-photo-${i}" accept="image/*" multiple style="display:none">
        <div id="card-preview-${i}" class="card-slot-tile" role="button" aria-label="${i + 1}번 사진 고르기" onclick="document.getElementById('card-photo-${i}').click()">${App.icon('camera')}</div>
        <button type="button" class="card-slot-remove" data-slot="${i}" aria-label="${i + 1}번 사진 빼기" hidden>×</button>
        <!-- 위치·확대 조정은 필요할 때만 펼친다 (사진마다 슬라이더 3개가 늘 펼쳐져 창이 길었다) -->
        <button type="button" class="card-adjust-btn" id="card-adjust-${i}" data-slot="${i}" hidden>위치</button>
        <button type="button" class="card-adjust-btn card-cutout-btn" id="card-cutout-${i}" data-slot="${i}" hidden>✂ 가장자리</button>
        <div id="card-photo-controls-${i}" class="card-photo-controls" data-slot="${i}" style="display:none">
          <div class="card-photo-controls-title">${i + 1}번 사진 위치·확대</div>
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
          <button type="button" class="card-reset-btn" data-slot="${i}" style="width:100%;margin-top:4px;padding:4px;font-size:0.93rem;border:1px solid var(--border);border-radius:4px;background:var(--bg-white);color:var(--text-muted);cursor:pointer">초기화</button>
        </div>
      </div>
    `).join('');

    // 파일 선택 핸들러 — 한 칸에서 여러 장을 고르면 그 칸부터 빈 칸 순서로 채운다
    for (let i = 0; i < count; i++) {
      document.getElementById(`card-photo-${i}`)?.addEventListener('change', async (e) => {
        const files = [...(e.target.files || [])];
        e.target.value = '';
        if (files.length) await this._addCardPhotos(files, i);
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
      // 칸이 좁아 조정 패널은 칸 아래 넓은 자리에 하나만 연다
      const host = document.getElementById('card-photo-adjust');
      if (host && ctrls.parentElement !== host) host.appendChild(ctrls);
      if (host) host.querySelectorAll('.card-photo-controls').forEach(c => { if (c !== ctrls) c.style.display = 'none'; });
      container.querySelectorAll('.card-adjust-btn').forEach(b => b.classList.remove('open'));
      ctrls.style.display = open ? 'block' : 'none';
      btn.classList.toggle('open', open);
    }));
    // 사진 빼기
    container.querySelectorAll('.card-cutout-btn').forEach(btn => btn.addEventListener('click', () => this._openCutoutEditor(Number(btn.dataset.slot))));
    container.querySelectorAll('.card-slot-remove').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = Number(btn.dataset.slot);
      this._cardPhotos[i] = null;
      this._pruneCutoutSrc();
      this._cardPhotoMeta[i] = { offsetX: 0, offsetY: 0, zoom: 1.0 };
      if (this._cardUserPicked) this._cardUserPicked[i] = false;
      const ctrls = document.getElementById(`card-photo-controls-${i}`);
      if (ctrls) ctrls.style.display = 'none';
      this._refreshPhotoPreview(i);
      this._scheduleCardPreview();
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
    // 네컷처럼 세로로 긴 카드(내 프레임 포함)는 두 줄을 나란히
    if (layout === 'photobooth' || card.height / card.width >= 2.4) {
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
    if (key === 'magazine') return '<span class="lay-thumb lay-magazine" aria-hidden="true"><b></b><i></i></span>';
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
    layer.innerHTML = list.map((st, i) => `<img class="card-sticker${i === this._stickerSel ? ' sel' : ''}" data-i="${i}" src="${this._stickerSrcOf(st)}" alt="" draggable="false"
      style="left:${st.x * 100}%;top:${st.y * 100}%;width:${st.size * 100}%;transform:translate(-50%,-50%) rotate(${st.rot}deg)">`).join('');
    const edit = document.getElementById('card-sticker-edit');
    const sel = list[this._stickerSel];
    // 편집 막대는 미리보기 바로 아래 — 스티커 탭에서 고른 동안만 (다른 탭에선 미리보기만 보이게)
    const onStickerTab = this._cardTab === 'sticker' || this._cardTab === 'text';
    if (edit) edit.hidden = !sel || !onStickerTab;
    const hint = document.getElementById('card-sticker-hint');
    if (hint) hint.hidden = !!sel || !onStickerTab || !list.length || layer.hidden;
    // 스티커를 고른 동안은 미리보기를 크게 (작은 화면에서 손가락으로 옮기기 쉽게)
    // 글자 탭에서는 아래 고르는 칸(모양·색·글꼴)이 보여야 해 키우지 않는다
    layer.closest('.card-live')?.classList.toggle('sticker-editing', !!sel && this._cardTab === 'sticker');
    if (sel) {
      const sz = document.getElementById('card-sticker-size'); if (sz) sz.value = Math.round(sel.size * 100);
      const rt = document.getElementById('card-sticker-rot'); if (rt) rt.value = sel.rot;
    }
    this._syncTextMaker();
  },

  // ===== 글자 넣기 (글자 탭) =====
  // 글자 스티커를 고르면 그 글자를 고치고, 안 고르면 새로 붙일 글자를 준비한다. 마지막 모양·색·글꼴은 기억한다
  _textLast() {
    let v = {};
    try { v = JSON.parse(localStorage.getItem('cardTextLast') || '{}') || {}; } catch (_) {}
    return { style: this._TEXT_STICKER_STYLES[v.style] ? v.style : 'box', color: v.color || '#FFFFFF', fontKey: this._CARD_FONTS[v.fontKey] ? v.fontKey : null };
  },
  // 기본 문구 (반려견 이름이 있으면 이름을 넣어서)
  _textDefaults(pet) {
    return [pet ? pet + '의 첫 미용' : '', pet ? pet + ' 미용 완료 ✨' : '미용 완료 ✨', '오늘도 예뻐요', '보송보송', 'Fresh Cut ✂️', '감사합니다 ♥', '다음에 또 만나요'].filter(Boolean);
  },
  // 직접 쓴 문구를 기억한다 (최근 8개, 반려견 이름은 {반려견명} 으로 바꿔 다음 손님 이름으로 나오게) — 동기화되는 설정
  async _rememberText(text) {
    const pet = this._cardPetName || '';
    const raw = pet.length >= 2 ? text.split(pet).join('{반려견명}') : text;
    const fill = (t) => t.replace(/\{반려견명\}/g, pet || '우리 아이');
    if (this._textDefaults(pet).includes(fill(raw))) return; // 기본 문구는 따로 기억하지 않는다
    try {
      const list = ((await DB.getSetting('cardTextRecent')) || []).filter(t => t !== raw);
      list.unshift(raw);
      await DB.setSetting('cardTextRecent', list.slice(0, 8));
      this._renderTextQuick();
    } catch (e) { console.warn('문구 기억 실패:', e); }
  },
  // 문구 버튼: 내가 쓴 문구(× 로 지우기) → 기본 문구
  async _renderTextQuick() {
    const box = document.getElementById('card-text-quick');
    if (!box) return;
    const pet = this._cardPetName || '';
    const fill = (t) => t.replace(/\{반려견명\}/g, pet || '우리 아이');
    let mine = [];
    try { mine = (await DB.getSetting('cardTextRecent')) || []; } catch (_) {}
    const esc = App.escapeHtml;
    box.innerHTML = mine.map(raw => `<button type="button" class="card-text-chip mine" data-text="${esc(fill(raw))}">${esc(fill(raw).replace(/\n/g, ' '))}<span class="card-text-chip-x" data-raw="${esc(raw)}" role="button" aria-label="이 문구 지우기">×</span></button>`).join('')
      + this._textDefaults(pet).map(t => `<button type="button" class="card-text-chip" data-text="${esc(t)}">${esc(t)}</button>`).join('');
  },
  _saveTextLast(v) { try { localStorage.setItem('cardTextLast', JSON.stringify(v)); } catch (_) {} },
  _textSelected() {
    const st = (this._cardStickers || [])[this._stickerSel];
    return st && st.text != null ? st : null;
  },
  // 고른 글자(또는 준비 중인 값)를 글자 탭 칸에 보여 준다
  _syncTextMaker() {
    const box = document.getElementById('card-text-maker');
    if (!box) return;
    const st = this._textSelected();
    const draft = this._textDraft || (this._textDraft = { text: '', ...this._textLast() });
    const cur = st ? { text: st.text, ...this._textStickerDefaults(st.style, st.color), fontKey: st.fontKey || 'system' } : draft;
    const fk = cur.fontKey || document.querySelector('#card-pick-font .card-font-btn.active')?.dataset.key || 'system';
    const ti = document.getElementById('card-text-input');
    if (ti && document.activeElement !== ti) ti.value = cur.text || '';
    box.querySelectorAll('#card-text-styles [data-tstyle]').forEach(b => b.classList.toggle('active', b.dataset.tstyle === cur.style));
    box.querySelectorAll('#card-text-colors [data-color]').forEach(b => b.classList.toggle('active', b.dataset.color.toLowerCase() === String(cur.color || '').toLowerCase()));
    box.querySelectorAll('#card-text-fonts [data-key]').forEach(b => b.classList.toggle('active', b.dataset.key === fk));
    const add = document.getElementById('card-text-add');
    const ed = document.getElementById('card-text-editing');
    if (add) add.hidden = !!st;
    if (ed) ed.hidden = !st;
  },
  _bindTextMaker(needPhoto) {
    const box = document.getElementById('card-text-maker');
    if (!box) return;
    this._textDraft = { text: '', ...this._textLast() };
    const curFont = () => document.querySelector('#card-pick-font .card-font-btn.active')?.dataset.key || 'system';
    let timer = null;
    // 고른 글자에 바꾼 값을 입힌다 — 글자 길이가 바뀌어도 글자 크기는 그대로 (그림 가로에 맞춰 size 를 고친다)
    const apply = async (patch, now) => {
      const st = this._textSelected();
      if (!st) { Object.assign(this._textDraft, patch); this._syncTextMaker(); return; }
      Object.assign(st, patch);
      const { style, color } = this._textStickerDefaults(st.style, st.color);
      st.style = style; st.color = color;
      this._saveTextLast({ style, color, fontKey: st.fontKey });
      this._syncTextMaker();
      clearTimeout(timer);
      const run = async () => {
        // 글꼴 받는 동안 다른 값을 또 고르면 늦게 끝난 옛 그림이 덮어쓰지 않게 — 마지막 요청만 반영
        const my = st._rev = (st._rev || 0) + 1;
        const r = await this._makeTextSticker(st.text, st.style, st.fontKey || curFont(), st.color);
        if (my !== st._rev) return;
        if (st.w) st.size = Math.max(0.06, Math.min(1.2, st.size * r.w / st.w));
        st.src = r.src; st.w = r.w;
        this._renderStickerLayer();
      };
      if (now) await run(); else timer = setTimeout(run, 250);
    };
    const ti = document.getElementById('card-text-input');
    if (ti) ti.oninput = () => {
      // 세 줄까지만
      const v = ti.value.split('\n').slice(0, 3).join('\n');
      if (v !== ti.value) ti.value = v;
      if (this._textSelected()) { if (v.trim()) apply({ text: v }); }
      else this._textDraft.text = v;
    };
    this._renderTextQuick();
    box.querySelector('#card-text-quick')?.addEventListener('click', async (e) => {
      const del = e.target.closest('.card-text-chip-x');
      if (del) {
        e.stopPropagation();
        const list = ((await DB.getSetting('cardTextRecent')) || []).filter(t => t !== del.dataset.raw);
        await DB.setSetting('cardTextRecent', list);
        this._renderTextQuick();
        return;
      }
      const b = e.target.closest('.card-text-chip');
      if (!b) return;
      if (ti) ti.value = b.dataset.text;
      if (this._textSelected()) apply({ text: b.dataset.text }, true);
      else this._textDraft.text = b.dataset.text;
    });
    box.querySelector('#card-text-styles')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tstyle]'); if (!b) return;
      apply({ style: b.dataset.tstyle }, true);
      if (!this._textSelected()) this._saveTextLast({ ...this._textLast(), style: b.dataset.tstyle });
    });
    box.querySelector('#card-text-colors')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]'); if (!b) return;
      apply({ color: b.dataset.color }, true);
      if (!this._textSelected()) this._saveTextLast({ ...this._textLast(), color: b.dataset.color });
    });
    Object.keys(this._CARD_FONTS).forEach(k => this._attachCardFontCss(k));
    box.querySelector('#card-text-fonts')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-key]'); if (!b) return;
      apply({ fontKey: b.dataset.key }, true);
      if (!this._textSelected()) this._saveTextLast({ ...this._textLast(), fontKey: b.dataset.key });
    });
    const add = document.getElementById('card-text-add');
    if (add) add.onclick = async () => {
      if (needPhoto && needPhoto()) return;
      const d = this._textDraft;
      const text = String((ti && ti.value) || d.text || '').trim();
      if (!text) { App.showToast('글자를 먼저 써 주세요.', 'info'); ti?.focus(); return; }
      const fontKey = d.fontKey || curFont();
      add.disabled = true;
      try {
        const r = await this._makeTextSticker(text, d.style, fontKey, d.color);
        // 글자 수에 맞춰 처음 크기를 정한다 (짧은 글자가 카드 반을 덮지 않게)
        const size = Math.max(0.22, Math.min(0.82, 0.1 + r.chars * 0.05));
        const n = (this._cardStickers || []).filter(x => x.text != null).length;
        this._cardStickers.push({ text, style: d.style, color: d.color, fontKey, src: r.src, w: r.w, x: 0.5, y: Math.min(0.85, 0.3 + n * 0.12), size, rot: 0 });
        this._stickerSel = this._cardStickers.length - 1;
        this._saveTextLast({ style: d.style, color: d.color, fontKey });
        this._rememberText(text);
        this._textDraft.text = '';
        this._renderStickerLayer();
      } finally { add.disabled = false; }
    };
    const done = document.getElementById('card-text-done');
    if (done) done.onclick = () => {
      this._stickerSel = -1;
      if (ti) ti.value = '';
      this._textDraft.text = '';
      this._renderStickerLayer();
    };
    this._syncTextMaker();
  },

  _renderCustomStickerButtons() {
    const box = document.getElementById('card-sticker-custom');
    if (!box) return;
    box.innerHTML = (this._customStickers || []).map(c => `<button type="button" class="card-sticker-btn custom" data-cid="${App.escapeHtml(c.id)}" aria-label="내 스티커 붙이기"><img src="${c.image}" alt=""><span class="card-sticker-x" aria-hidden="true">×</span></button>`).join('');
    const mg = document.getElementById('card-sticker-manage');
    if (mg) mg.hidden = !(this._customStickers || []).length;
  },

  // 테두리 만들기: 그림을 r 만큼 사방으로 번지게 해 한 색으로 칠한다 (다이컷 흰 테두리)
  _dilateCanvas(src, r, color) {
    const d = document.createElement('canvas'); d.width = src.width; d.height = src.height;
    const x = d.getContext('2d');
    for (let a = 0; a < 360; a += 12) x.drawImage(src, Math.cos(a * Math.PI / 180) * r, Math.sin(a * Math.PI / 180) * r);
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, d.width, d.height);
    return d;
  },
  _dieCut(src, r = 16) {
    const out = document.createElement('canvas'); out.width = src.width; out.height = src.height;
    const o = out.getContext('2d');
    o.save(); o.shadowColor = 'rgba(40,30,20,0.22)'; o.shadowBlur = 12; o.shadowOffsetY = 5;
    o.drawImage(this._dilateCanvas(src, r, '#FFFFFF'), 0, 0); o.restore();
    o.drawImage(src, 0, 0);
    const url = out.toDataURL('image/png'); out.width = out.height = 0;
    return url;
  },

  // 매장 로고로 스티커 만들기 — plain: 로고 모양 그대로 흰 테두리 / badge: 원형 배지 + 둘레에 매장명 / label: 로고 + 매장명 라벨
  async _makeLogoSticker(style) {
    const logo = await DB.getSetting('shopLogo');
    if (!logo) return null;
    const img = await this._loadImg(logo);
    if (!img) return null;
    const shop = (await DB.getSetting('shopName')) || '';
    const accent = (getComputedStyle(document.documentElement).getPropertyValue('--primary') || '').trim() || '#22304E';
    await this._ensureCardFont('paperlogy', shop + 'GROOMING·');
    const font = (w, px) => `${w} ${px}px ${this._cardFontStack('paperlogy')}`;
    const fit = (x, cx, cy, box) => { const k = Math.min(box / img.width, box / img.height); const w = img.width * k, h = img.height * k; x.drawImage(img, cx - w / 2, cy - h / 2, w, h); };
    let c;
    if (style === 'label') {
      c = document.createElement('canvas'); c.width = 800; c.height = 320;
      const x = c.getContext('2d');
      x.fillStyle = '#FBF4E6'; this._roundRect(x, 40, 40, 720, 240, 120); x.fill();
      x.strokeStyle = accent; x.lineWidth = 4; this._roundRect(x, 56, 56, 688, 208, 104); x.stroke();
      fit(x, 170, 160, 170);
      x.fillStyle = accent; x.textAlign = 'left'; x.textBaseline = 'middle';
      let fs = 72; x.font = font(800, fs); const name = shop || 'PET SALON';
      while (x.measureText(name).width > 440 && fs > 28) { fs -= 4; x.font = font(800, fs); }
      x.fillText(name, 280, 166);
    } else if (style === 'badge') {
      c = document.createElement('canvas'); c.width = 640; c.height = 640;
      const x = c.getContext('2d');
      x.fillStyle = accent; x.beginPath(); x.arc(320, 320, 280, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#FFFFFF'; x.beginPath(); x.arc(320, 320, 190, 0, Math.PI * 2); x.fill();
      fit(x, 320, 320, 250);
      // 둘레 글자: 매장명 · GROOMING · 를 한 바퀴에 고르게
      const ring = `${(shop || 'PET SALON').toUpperCase()} · GROOMING · `;
      x.font = font(700, 34); x.fillStyle = '#FFFFFF'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const chars = [...ring]; const raw = chars.map(ch => x.measureText(ch).width); const sum = raw.reduce((a, b) => a + b, 0);
      const R = 236, scale = (2 * Math.PI * R) / sum; let ang = -Math.PI / 2;
      chars.forEach((ch, i) => { const w = raw[i] * scale; const a = ang + w / R / 2; x.save(); x.translate(320 + Math.cos(a) * R, 320 + Math.sin(a) * R); x.rotate(a + Math.PI / 2); x.fillText(ch, 0, 0); x.restore(); ang += w / R; });
    } else {
      c = document.createElement('canvas'); c.width = 640; c.height = 640;
      fit(c.getContext('2d'), 320, 320, 520);
    }
    const url = this._dieCut(c, style === 'plain' ? 18 : 14);
    c.width = c.height = 0;
    return url;
  },

  // 글자 스티커 그림 만들기 — 글꼴·모양·색으로 그린다 (세 줄까지). { src, w } 를 돌려준다 (w: 그림 가로, 고칠 때 글자 크기 유지용)
  async _makeTextSticker(text, style0, fontKey, color0) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3);
    if (!lines.length) lines.push('안녕');
    const { style, color } = this._textStickerDefaults(style0, color0);
    if (fontKey && fontKey !== 'system') await this._ensureCardFont(fontKey, lines.join(''));
    const fs = 88, lh = Math.round(fs * 1.22);
    const font = `bold ${fs}px ${this._cardFontStack(fontKey)}`;
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    const ws = lines.map(l => Math.ceil(m.measureText(l).width));
    const maxW = Math.max(...ws);
    const padX = { plain: 24, outline: 32, neon: 50, box: 40, glass: 56, bubble: 56, label: 64 }[style] || 40;
    const padY = { plain: 16, outline: 24, neon: 44, box: 14, glass: 34, bubble: 34, label: 28 }[style] || 24;
    const tail = style === 'bubble' ? 40 : 0, edge = 18;
    const W = maxW + padX * 2 + edge * 2, H = lines.length * lh + padY * 2 + tail + edge * 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const light = this._isLightColor(color);
    const onColor = light ? '#1F2937' : '#FFFFFF';
    const cx = W / 2;
    const ly = (i) => edge + padY + lh * i + lh / 2 + 4;
    const rgba = (hex, a) => { const h = hex.replace('#', ''); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
    const blockX = edge, blockY = edge, blockW = W - edge * 2, blockH = H - edge * 2 - tail;
    const texts = (fill) => { x.fillStyle = fill; lines.forEach((l, i) => x.fillText(l, cx, ly(i))); };
    // 색을 섞는다 (t=0 그 색, t=1 mix 색) — 네온 테두리·속 밝은 줄에 쓴다
    const mixHex = (hex, mix, t) => { const a = hex.replace('#', ''), b = mix.replace('#', ''); const ch = (k) => Math.round(parseInt(a.slice(k, k + 2), 16) * (1 - t) + parseInt(b.slice(k, k + 2), 16) * t); return `rgb(${ch(0)},${ch(2)},${ch(4)})`; };
    if (style === 'plain') {
      // 어두운 글자는 밝은 그림자, 밝은 글자는 어두운 그림자 — 어떤 사진 위에서도 글자가 묻히지 않게
      x.save(); x.shadowColor = light ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.55)'; x.shadowBlur = 10; x.shadowOffsetY = light ? 3 : 0; texts(color); x.restore();
    } else if (style === 'outline') {
      x.lineWidth = 20; x.strokeStyle = light ? '#1F2937' : '#FFFFFF';
      lines.forEach((l, i) => x.strokeText(l, cx, ly(i)));
      texts(color);
    } else if (style === 'neon') {
      // 네온: 은은한 빛 한 번 + 진한 테두리 + 그 색 글자 + 밝은 속 (예전엔 흰 글자에 빛을 세 번 겹쳐 밝은 바탕에서 글자가 안 보였다)
      const veryLight = this._isLightColor(color) && (() => { const h = color.replace('#', ''); return (parseInt(h.slice(0, 2), 16) + parseInt(h.slice(2, 4), 16) + parseInt(h.slice(4, 6), 16)) / 3 > 235; })();
      x.save();
      x.shadowColor = veryLight ? 'rgba(0,0,0,0.45)' : color; x.shadowBlur = 16;
      x.lineWidth = 6; x.strokeStyle = veryLight ? 'rgba(0,0,0,0.4)' : mixHex(color, '#000000', 0.35);
      lines.forEach((l, i) => x.strokeText(l, cx, ly(i)));
      x.restore();
      texts(color);
      x.save(); x.globalAlpha = 0.45; texts(mixHex(color, '#FFFFFF', 0.7)); x.restore();
    } else if (style === 'box') {
      // 줄마다 글자 길이에 맞춘 상자 (인스타 글자 배경)
      x.fillStyle = color;
      lines.forEach((l, i) => { const bw = ws[i] + padX * 2; this._roundRect(x, cx - bw / 2, ly(i) - lh / 2 - padY / 2 - 2, bw, lh + padY + 4, 22); x.fill(); });
      texts(onColor);
    } else if (style === 'glass') {
      x.fillStyle = rgba(color, 0.62);
      this._roundRect(x, blockX, blockY, blockW, blockH, 34); x.fill();
      texts(onColor);
    } else {
      // bubble · label
      x.save(); x.shadowColor = 'rgba(0,0,0,0.18)'; x.shadowBlur = 12; x.shadowOffsetY = 4; x.fillStyle = color;
      this._roundRect(x, blockX, blockY, blockW, blockH, style === 'label' ? Math.min(blockH / 2, blockW / 2) : Math.min(blockH / 2, 60)); x.fill();
      if (style === 'bubble') { // 꼬리
        x.beginPath(); x.moveTo(blockX + blockW * 0.22, blockY + blockH - 2); x.lineTo(blockX + blockW * 0.16, blockY + blockH + tail); x.lineTo(blockX + blockW * 0.36, blockY + blockH - 2); x.closePath(); x.fill();
      }
      x.restore();
      texts(onColor);
    }
    const src = c.toDataURL('image/png');
    c.width = c.height = 0;
    return { src, w: W, chars: Math.max(...lines.map(l => [...l].length)) };
  },

  // 올린 그림을 스티커로 다듬는다: 테두리가 한 가지 색이면 그 배경을 지우고(ChatGPT 의 흰 배경 등), 빈 여백을 잘라 400px 이하로
  async _prepareStickerImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, 640 / Math.max(img.width, img.height));
      const W = Math.max(1, Math.round(img.width * scale)), H = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, W, H);
      const data = x.getImageData(0, 0, W, H); const px = data.data;
      const at = (i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
      const corners = [0, W - 1, (H - 1) * W, H * W - 1].map(at);
      const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      let removedBg = false;
      const opaque = corners.every(cc => cc[3] > 245);
      if (opaque && corners.every(cc => dist(cc, corners[0]) < 45)) {
        // 테두리에서부터 배경색과 비슷한 칸만 지운다 (그림 안쪽의 같은 색은 남는다)
        const bg = corners[0], tol = 60;
        const seen = new Uint8Array(W * H); const stack = [];
        for (let i = 0; i < W; i++) { stack.push(i, (H - 1) * W + i); }
        for (let j = 0; j < H; j++) { stack.push(j * W, j * W + W - 1); }
        while (stack.length) {
          const k = stack.pop();
          if (seen[k]) continue; seen[k] = 1;
          if (dist(at(k), bg) > tol) continue;
          px[k * 4 + 3] = 0;
          const cxp = k % W, cyp = (k / W) | 0;
          if (cxp > 0) stack.push(k - 1); if (cxp < W - 1) stack.push(k + 1);
          if (cyp > 0) stack.push(k - W); if (cyp < H - 1) stack.push(k + W);
        }
        x.putImageData(data, 0, 0);
        removedBg = true;
      }
      // 빈 여백 잘라내기
      const d2 = x.getImageData(0, 0, W, H).data;
      let minX = W, minY = H, maxX = -1, maxY = -1;
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
        if (d2[(yy * W + xx) * 4 + 3] > 12) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; }
      }
      if (maxX < 0) return null; // 다 지워짐
      const m = 4; minX = Math.max(0, minX - m); minY = Math.max(0, minY - m); maxX = Math.min(W - 1, maxX + m); maxY = Math.min(H - 1, maxY + m);
      const cw = maxX - minX + 1, ch = maxY - minY + 1;
      const s2 = Math.min(1, 400 / Math.max(cw, ch));
      const o = document.createElement('canvas'); o.width = Math.round(cw * s2); o.height = Math.round(ch * s2);
      o.getContext('2d').drawImage(c, minX, minY, cw, ch, 0, 0, o.width, o.height);
      const out = o.toDataURL('image/png');
      c.width = c.height = 0; o.width = o.height = 0;
      return { image: out, removedBg };
    } finally { URL.revokeObjectURL(url); }
  },

  _bindStickers() {
    const pick = document.getElementById('card-sticker-pick');
    const layer = document.getElementById('card-sticker-layer');
    if (!pick || !layer) return;
    const needPhoto = () => { if (document.getElementById('card-live-img')?.hidden) { App.showToast('사진을 먼저 골라주세요.', 'info'); return true; } return false; };
    const curFont = () => document.querySelector('#card-pick-font .card-font-btn.active')?.dataset.key || 'system';
    this._renderCustomStickerButtons();
    pick.onclick = async (e) => {
      if (e.target.closest('#card-sticker-add')) { document.getElementById('card-sticker-file')?.click(); return; }

      if (e.target.closest('#card-sticker-logo')) {
        const logo = await DB.getSetting('shopLogo');
        if (!logo) { App.showToast('설정 > 매장 정보에서 매장 로고를 먼저 올려주세요.', 'info', { duration: 5000 }); return; }
        const lf = document.getElementById('card-sticker-logoform');
        if (lf) lf.hidden = !lf.hidden;
        return;
      }
      if (e.target.closest('#card-sticker-text')) {
        // 글자는 '글자' 탭에서 (모양·색·글꼴을 한곳에서)
        document.querySelector('.card-tab[data-tab="text"]')?.click();
        setTimeout(() => document.getElementById('card-text-input')?.focus(), 50);
        return;
      }
      const btn = e.target.closest('.card-sticker-btn');
      if (!btn) return;
      // 정리 모드: 내 스티커를 누르면 목록에서 지운다
      if (btn.dataset.cid && pick.classList.contains('managing')) {
        this._customStickers = (this._customStickers || []).filter(c => c.id !== btn.dataset.cid);
        await DB.setSetting('customStickers', this._customStickers);
        this._renderCustomStickerButtons();
        // 카드에 붙여 둔 같은 스티커도 떼어 낸다 (깨진 그림으로 남거나 저장 때 말없이 빠지지 않게)
        if ((this._cardStickers || []).some(s => s.cid === btn.dataset.cid)) {
          this._cardStickers = this._cardStickers.filter(s => s.cid !== btn.dataset.cid);
          this._stickerSel = -1;
          this._renderStickerLayer();
        }
        if (!this._customStickers.length) pick.classList.remove('managing');
        App.showToast('내 스티커에서 지웠어요.');
        return;
      }
      if (needPhoto()) return;
      const st = btn.dataset.cid ? { cid: btn.dataset.cid } : { id: btn.dataset.sticker };
      const sid = String(btn.dataset.sticker || '');
      const isText = sid.startsWith('pt_t_') || /^pt_chic_(gooddog|ticket|groomed|today_dog|bubble_done|bubble_bosong|stamp|pretty)$/.test(sid) || /^pt_hip_(omiwan|lucky|simkung|mungmung|slay|luv|newhair|main|glowup|caution)$/.test(sid);
      this._cardStickers.push({ ...st, x: 0.5, y: 0.45, size: btn.dataset.cid ? 0.3 : (sid.startsWith('ai_') ? 0.32 : (isText ? 0.4 : 0.24)), rot: 0 });
      this._stickerSel = this._cardStickers.length - 1;
      this._renderStickerLayer();
    };
    // 스티커 묶음 (귀여운·힙한·이모지) — 내 스티커는 늘 앞에
    document.querySelectorAll('.card-sticker-set').forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll('.card-sticker-set').forEach(c => c.classList.toggle('active', c === chip));
        pick.querySelectorAll('.card-sticker-btn[data-set]').forEach(b => { b.hidden = b.dataset.set !== chip.dataset.set; });
        pick.scrollLeft = 0;
      };
    });
    const mg = document.getElementById('card-sticker-manage');
    if (mg) mg.onclick = () => { pick.classList.toggle('managing'); mg.textContent = pick.classList.contains('managing') ? '정리 끝' : '내 스티커 정리'; };
    // 내 스티커 올리기 (여러 장 가능)
    const file = document.getElementById('card-sticker-file');
    if (file) file.onchange = async () => {
      const files = [...(file.files || [])];
      file.value = '';
      if (!files.length) return;
      const list = this._customStickers || [];
      let added = 0, removed = 0;
      for (const f of files) {
        if (list.length >= this.MAX_CUSTOM_STICKERS) { App.showToast(`내 스티커는 ${this.MAX_CUSTOM_STICKERS}개까지예요. 정리 후 추가해주세요.`, 'error'); break; }
        try {
          const r = await this._prepareStickerImage(f);
          if (!r) continue;
          list.unshift({ id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), image: r.image, createdAt: new Date().toISOString() });
          added++; if (r.removedBg) removed++;
        } catch (err) { console.warn('스티커 처리 실패:', err); }
      }
      this._customStickers = list;
      await DB.setSetting('customStickers', list);
      this._renderCustomStickerButtons();
      if (added) App.showToast(`내 스티커 ${added}개를 추가했어요` + (removed ? ` · ${removed}개는 배경을 지웠어요` : ''));
      else App.showToast('스티커로 쓸 수 있는 그림이 없었어요.', 'error');
    };
    // 내 로고 스티커 (설정의 매장 로고 → 그대로·원형 배지·라벨)
    document.querySelectorAll('#card-sticker-logoform [data-logo]').forEach(b => {
      b.onclick = async () => {
        if (needPhoto()) return;
        try {
          const src = await this._makeLogoSticker(b.dataset.logo);
          if (!src) { App.showToast('로고를 불러오지 못했어요.', 'error'); return; }
          this._cardStickers.push({ logo: b.dataset.logo, src, x: 0.5, y: 0.5, size: b.dataset.logo === 'label' ? 0.42 : 0.28, rot: 0 });
          this._stickerSel = this._cardStickers.length - 1;
          document.getElementById('card-sticker-logoform').hidden = true;
          this._renderStickerLayer();
        } catch (err) { console.warn('로고 스티커 실패:', err); App.showToast('로고 스티커를 만들지 못했어요.', 'error'); }
      };
    });
    this._bindTextMaker(needPhoto);
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
    // 크기·회전 슬라이더는 고른 스티커의 모양만 바꾼다 (끌기처럼 — 레이어 전체를 다시 그리지 않게)
    const upd = (fn) => {
      const st = this._cardStickers[this._stickerSel];
      if (!st) return;
      fn(st);
      const el = layer.querySelector(`.card-sticker[data-i="${this._stickerSel}"]`);
      if (!el) { this._renderStickerLayer(); return; }
      el.style.width = st.size * 100 + '%';
      el.style.transform = `translate(-50%,-50%) rotate(${st.rot}deg)`;
    };
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
    this._autoCardLayout((this._cardPhotos || []).filter(Boolean).length);
    const f = await this._readCardForm(this._cardPetName || '');
    const count = this._cardPhotoCount(f);
    this._updateTextSupport(f);
    this._syncBgLink(f);
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
    if (token !== this._cardPreviewToken) { cv.width = cv.height = 0; return; } // 더 최근 미리보기가 진행 중 (버리는 캔버스 메모리도 돌려준다)
    img.src = cv.toDataURL('image/jpeg', 0.72);
    cv.width = cv.height = 0; // iOS 는 캔버스 메모리를 늦게 돌려줘 슬라이더를 오래 끌면 한도를 넘는다
    img.hidden = false;
    if (empty) empty.hidden = true;
    img.closest('.card-live')?.setAttribute('data-shape', f.layout);
    this._renderStickerLayer();
    // 칸보다 사진이 적으면 어떻게 나오는지 알려준다 (반복 채우지 않고 칸 수를 줄인다)
    const note = document.getElementById('card-live-note');
    this._refreshFilterThumbs();
    const fHoles = f.settings && f.settings.frameHoles;
    if (note && fHoles && fHoles.length) {
      const n = photos.filter(Boolean).length;
      note.hidden = false;
      note.textContent = `프레임 모양대로 만들어요 · 사진 칸 ${fHoles.length}개` +
        (n < fHoles.length ? ` (사진 ${n}장을 돌려 가며 넣어요)` : '') +
        (nAll > count ? ` · 앞 ${count}장만 써요` : '');
    } else if (note) {
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

  // 사진 장수에 맞는 기본 틀 — 1장 폴라로이드, 2장 2컷, 3장 이상 네컷 (1장을 네컷에 넣으면 많이 잘렸다)
  _defaultCardLayout(n) {
    return n <= 1 ? 'single' : (n === 2 ? 'strip2' : 'photobooth');
  },
  // 틀을 직접 고르기 전이면 장수에 맞는 틀로 바꾼다. 피드·스토리는 1~4장 모두 맞춰 그려서 그대로 둔다
  _autoCardLayout(n) {
    if (this._cardLayoutPicked || !n) return;
    const cur = document.querySelector('#card-pick-layout .card-pick-btn.active');
    if (cur && !['single', 'strip2', 'photobooth'].includes(cur.dataset.key)) return;
    const want = this._defaultCardLayout(n);
    if (cur && cur.dataset.key === want) return;
    const btn = document.querySelector(`#card-pick-layout .card-pick-btn[data-key="${want}"]`);
    if (btn) btn.click(); // 코드 클릭(isTrusted=false) — '직접 고름'으로 치지 않는다
  },

  // 고른 장수에 맞는 레이아웃에 '추천' 표시 (사진을 먼저 고르면 틀을 제안하는 Instagram Layout 방식)
  _markLayoutRecs(n) {
    const rec = n <= 1 ? ['single', 'studio'] : (n === 2 ? ['strip2', 'feed'] : (n >= 4 ? ['photobooth', 'feed', 'story'] : ['photobooth', 'feed']));
    document.querySelectorAll('#card-pick-layout .card-pick-btn').forEach(b => b.classList.toggle('rec', n > 0 && rec.includes(b.dataset.key)));
    // 고른 장수에 맞는 줄을 위로 (사진 2장 이상이면 '여러 장' 줄이 먼저)
    const box = document.getElementById('card-pick-layout');
    const many = box && box.querySelector('[data-group="many"]');
    if (many) { const want = n >= 2; if (want !== (box.firstElementChild === many)) want ? box.prepend(many) : box.append(many); }
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
    preview.classList.toggle('filled', !!photo);
    const rm = document.querySelector(`.card-slot-remove[data-slot="${slot}"]`);
    if (rm) rm.hidden = !photo;
    const adj = document.getElementById(`card-adjust-${slot}`);
    if (adj && !photo) adj.hidden = true;
    preview.classList.remove('cutout');
    const cutBtn = document.getElementById(`card-cutout-${slot}`);
    if (cutBtn) cutBtn.hidden = true;
    if (!photo) { preview.innerHTML = App.icon('camera'); return; }
    const meta = this._cardPhotoMeta[slot] || { offsetX: 0, offsetY: 0, zoom: 1.0 };
    // offsetX/Y = -50~+50 → object-position % = 0~100
    const colPct = (50 + (meta.offsetX || 0)) + '%';
    const rowPct = (50 + (meta.offsetY || 0)) + '%';
    preview.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;object-position:${colPct} ${rowPct};transform:scale(${meta.zoom});transform-origin:${colPct} ${rowPct};transition:transform 0.12s,object-position 0.12s">`;
    preview.classList.remove('cutout');
    // 배경 지운(투명) 사진이면 칸에 표시 — 앱이 알아봤는지 바로 알 수 있게
    if (/^data:image\/(png|webp)/.test(photo)) {
      this._loadImg(photo).then(im => {
        if (this._cardPhotos[slot] !== photo || !im || !this._imgHasAlpha(im)) return;
        preview.classList.add('cutout');
        if (cutBtn) cutBtn.hidden = false;
        if (!preview.querySelector('.card-slot-badge')) preview.insertAdjacentHTML('beforeend', '<span class="card-slot-badge">배경 지움</span>');
      }).catch(() => {});
    }
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
      frameHoles: theme === 'custom' && ds.customOverlayImage && Array.isArray(ds.frameHoles) ? ds.frameHoles : null,
      frameSize: theme === 'custom' && ds.customOverlayImage ? (ds.frameSize || null) : null,
      photoFilter: this._CARD_FILTERS[ds.photoFilter] ? ds.photoFilter : 'none',
      fontKey: this._CARD_FONTS[ds.fontKey] ? ds.fontKey : 'system',
      polaroidShape: ds.polaroidShape === 'square' ? 'square' : 'classic',
      bgPick: (ds.bgPick === 'auto' || this._STUDIO_COLORS[ds.bgPick]) && theme !== 'custom' ? ds.bgPick : null,
      plainRatio: this._PLAIN_RATIOS[ds.plainRatio] ? ds.plainRatio : 'orig',
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
    // 배경색 한 줄의 파스텔·자동 (bg:키) → 기본 테마 위에 배경색만 바꾼다
    let bgPick = null;
    if (theme.startsWith('bg:')) { bgPick = theme.slice(3); theme = 'classic'; }
    // 사용자 프레임 선택 시 (frame:ID) → custom 테마로 자동 적용
    let appliedFrameId = null;
    if (theme.startsWith('frame:')) {
      appliedFrameId = theme.split(':')[1];
      // 미리보기마다 IndexedDB 를 다시 읽지 않게 카드 창을 열 때 읽어 둔 목록을 쓴다
      const frames = this._cardFramesCache || (await DB.getSetting('customFrames')) || [];
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
    settings.bgPick = bgPick;
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
    settings.polaroidShape = document.querySelector('#polaroid-options .card-tstyle-btn.active')?.dataset.shape || settings.polaroidShape || 'classic';
    settings.plainRatio = document.querySelector('#plain-options [data-ratio].active')?.dataset.ratio || settings.plainRatio || 'orig';
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
      const fr = this._appliedFrame;
      settings.frameHoles = isOverlay && Array.isArray(fr.holes) && fr.holes.length ? fr.holes : null;
      settings.frameSize = settings.frameHoles ? { w: fr.fw, h: fr.fh } : null;
    } else {
      settings.lastUsedFrameId = null;
      settings.customOverlayImage = null;
      settings.frameHoles = null;
      settings.frameSize = null;
    }
    settings.photoFilter = document.querySelector('#card-pick-filter .card-filter-btn.active')?.dataset.key || settings.photoFilter || 'none';
    settings.fontKey = document.querySelector('#card-pick-font .card-font-btn.active')?.dataset.key || settings.fontKey || 'system';
    // 커스텀 테마 설정 저장 — 프레임을 고른 경우는 제외 (예전엔 커스텀 색·배경이 프레임을 덮어썼다)
    if (theme === 'custom' && !(appliedFrameId && this._appliedFrame)) {
      settings.customBgColor = document.getElementById('card-custom-bg')?.value || '#FFFFFF';
      settings.customTextColor = document.getElementById('card-custom-text')?.value || '#1A1A1A';
      settings.customAccentColor = document.getElementById('card-custom-accent')?.value || '#6366F1';
      // 창을 열 때 저장값으로 _customBgImage 를 채우므로, 여기서 저장값으로 되돌리면 '제거'가 먹지 않는다
      settings.customBgImage = this._customBgImage || null;
    }
    // 이름·날짜·매장명 — 모든 테마 공통
    settings.showPet = document.getElementById('card-show-pet')?.checked !== false;
    settings.showDate = document.getElementById('card-show-date')?.checked !== false;
    settings.showShop = document.getElementById('card-show-shop')?.checked !== false;
    return { layout, theme, settings };
  },

  // 더보기 → 사진 카드. 미용 기록과 상관없이 사진첩 사진으로 만든다 (카드는 앱에 저장하지 않는다).
  // 반려견을 고르면 이름·보호자 번호가 붙고, 그 반려견의 가장 최근 기록 사진을 가져올 수 있다.
  // recordId 를 주면 그 미용 기록의 반려견·날짜·사진으로 바로 채워 연다 (기록 목록의 '사진 카드' 버튼)
  async startPhotoCard({ petId, date, recordId } = {}) {
    const srcRec = recordId ? await DB.get('records', Number(recordId)) : null;
    if (srcRec) { petId = srcRec.petId; date = srcRec.date; }
    const pet = petId ? await DB.get('pets', Number(petId)) : null;
    const customer = pet?.customerId ? await DB.get('customers', pet.customerId) : null;
    const d = date || App.getToday();
    let pool = {}, poolLabel = '';
    if (pet || srcRec) {
      const recs = srcRec ? [srcRec] : (await DB.getByIndex('records', 'petId', pet.id)).filter(r => App._recordHasPhoto(r))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id - a.id));
      const r = recs[0];
      if (r) {
        const _ph = async (inline, id) => inline || (id ? await DB.getPhoto(id).catch(() => null) : null);
        pool = { before: await _ph(r.photoBefore, r.photoBeforeId), after: await _ph(r.photoAfter, r.photoAfterId),
          p3: await _ph(r.photo3, r.photo3Id), p4: await _ph(r.photo4, r.photo4Id) };
        poolLabel = App.formatDate(r.date) + ' 기록 사진';
      }
    }
    if (srcRec) {
      // 기록에서 열면 서비스명·다음 방문일 글자도 그 기록 것으로, 사진은 처음부터 넣어 둔다
      const record = { id: srcRec.id, date: d, petId: pet?.id || null, customerId: customer?.id || null, serviceIds: srcRec.serviceIds || [], nextVisitDate: srcRec.nextVisitDate || null };
      const serviceNames = srcRec.service ? App.getRecordServiceDisplay(srcRec) : (srcRec.serviceNames || []).join(', ');
      return this.openPhotoCard({ key: `rec:${srcRec.id}`, record, customer, pet, serviceNames, pool, poolLabel, usePool: true });
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
    if (!keep) this._cutoutSrc = new Map();
    this._cardPhotoMeta = [];
    // 스티커: 새 카드는 비우고, '다시 꾸미기'는 붙인 그대로
    this._cardStickers = keep ? (this._cardStickers || []) : [];
    this._stickerSel = -1;
    this._customStickers = (await DB.getSetting('customStickers')) || [];
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
    // 틀을 직접 고르기 전에는 사진 장수에 맞춰 틀을 바꾼다 ('다시 꾸미기'는 쓰던 틀 그대로)
    this._cardLayoutPicked = !!keep;
    const poolCount = Object.values(this._cardPool).filter(Boolean).length;

    const saved = await DB.getSetting('cardDesignSettings') || {};
    // 삭제된 레이아웃/테마 자동 마이그레이션
    const validLayouts = Object.keys(this._CARD_LAYOUTS).filter(k => !this._CARD_LAYOUTS[k].legacy);
    let selectedLayout = saved.layout || 'photobooth';
    if (!validLayouts.includes(selectedLayout)) { selectedLayout = this._CARD_LAYOUT_MIGRATE[selectedLayout] || 'photobooth'; saved.layout = selectedLayout; }
    const validThemes = [...Object.keys(this._CARD_THEMES), 'custom'];
    let selectedTheme = saved.template || 'classic';
    if (!validThemes.includes(selectedTheme)) { selectedTheme = 'classic'; saved.template = 'classic'; }
    if (saved.layout !== selectedLayout || saved.template !== selectedTheme) await DB.setSetting('cardDesignSettings', saved);
    const LAYOUTS = this._CARD_LAYOUTS;
    const THEMES = this._CARD_THEMES;
    // 사용자 프레임 라이브러리 (활성 + 이미지 있는 것만)
    this._cardFramesCache = (await DB.getSetting('customFrames')) || [];
    // 예전에 올린 덮는 프레임은 사진 칸을 아직 안 찾았다 — 처음 한 번 찾아 저장한다
    const _noHoles = this._cardFramesCache.filter(f => f.mode === 'overlay' && f.image && !Array.isArray(f.holes));
    if (_noHoles.length) {
      for (const f of _noHoles) {
        try { const r = await this._detectFrameHoles(f.image); f.holes = r.holes; f.fw = r.fw; f.fh = r.fh; }
        catch (e) { console.warn('프레임 칸 찾기 실패:', e); }
      }
      try {
        const all = (await DB.getSetting('customFrames')) || [];
        all.forEach(f => { const d = _noHoles.find(x => x.id === f.id); if (d && Array.isArray(d.holes)) { f.holes = d.holes; f.fw = d.fw; f.fh = d.fh; } });
        await DB.setSetting('customFrames', all);
      } catch (e) { console.warn('프레임 칸 저장 실패:', e); }
    }
    const userFrames = this._cardFramesCache.filter(f => f.enabled !== false && f.image);
    const selectedFrameId = saved.lastUsedFrameId || null;
    // 배경색 줄에서 켜 둘 칸: 프레임이면 없음, 더 꾸미기면 custom, 파스텔·자동이면 bg:키, 아니면 테마
    const selectedBgKey = selectedFrameId ? null : (selectedTheme === 'custom' ? 'custom'
      : ((saved.bgPick === 'auto' || this._STUDIO_COLORS[saved.bgPick]) ? 'bg:' + saved.bgPick : selectedTheme));

    App.showModal({
      title: '사진 카드 만들기',
      saveText: '완성하기',
      size: 'lg',
      content: `
        <div class="card-maker">
        <div class="card-head">
        <!-- 실시간 미리보기 — 고를 때마다 바로 바뀐다 (예전엔 '카드 생성'을 눌러야 처음 보였다) -->
        <div class="card-live">
          <div class="card-live-stage">
            <img id="card-live-img" alt="사진 카드 미리보기" hidden>
            <div id="card-sticker-layer" class="card-sticker-layer" hidden></div>
            <button type="button" class="card-live-zoom" id="card-live-zoom" aria-label="크게 보기" title="크게 보기">⤢</button>
          </div>
          <div id="card-live-empty" class="card-live-empty">${App.icon('image')} 사진을 고르면 여기에 미리 보여요</div>
          <div id="card-live-note" class="card-live-note" hidden></div>
          <!-- 스티커를 고르면 크기·회전·삭제를 미리보기 바로 아래에 (예전엔 패널 맨 아래라 아래 고정 버튼에 가려 안 보였다) -->
          <div id="card-sticker-hint" class="card-sticker-hint" hidden>스티커를 눌러 크기·회전 조절</div>
          <div id="card-sticker-edit" class="card-sticker-edit" hidden>
            <label class="card-sticker-slider">크기 <input type="range" id="card-sticker-size" min="6" max="100" step="1"></label>
            <label class="card-sticker-slider">회전 <input type="range" id="card-sticker-rot" min="-180" max="180" step="5"></label>
            <div class="card-sticker-actions">
              <button type="button" class="btn btn-sm btn-secondary" id="card-sticker-del">${App.icon('trash')} 이 스티커 삭제</button>
              <button type="button" class="btn btn-sm btn-ghost" id="card-sticker-clear">모두 지우기</button>
            </div>
          </div>
        </div>
          <div class="card-tabs" role="tablist">
            <button type="button" class="card-tab active" data-tab="photo" role="tab">사진</button>
            <button type="button" class="card-tab" data-tab="layout" role="tab">틀</button>
            <button type="button" class="card-tab" data-tab="deco" role="tab">꾸미기</button>
            <button type="button" class="card-tab" data-tab="sticker" role="tab">스티커</button>
            <button type="button" class="card-tab" data-tab="text" role="tab">글자</button>
          </div>
        </div>
        <div class="card-panels">
        <div class="card-tabpanel" data-panel="photo">
        <div class="form-group">
          <div class="card-photo-head">
            <label class="form-label" style="margin:0">사진 <span style="font-size:0.93rem;color:var(--text-muted);font-weight:400">· 1~4장</span></label>
            <button type="button" class="btn btn-sm btn-primary" id="card-photo-multi-btn">${App.icon('image')} 여러 장 고르기</button>
            <input type="file" id="card-photo-multi" accept="image/*" multiple hidden>
            ${poolCount ? `<button type="button" class="btn btn-sm btn-secondary" id="card-use-record-photos">${App.icon('image')} ${App.escapeHtml(ctx.poolLabel || '기록 사진')} 넣기 (${poolCount}장)</button>` : ''}
          </div>
          <div id="card-photo-slots" class="card-slots-row"></div>
          <details class="card-help">
            <summary>강아지만 떼어 색 배경에 올리려면?</summary>
            <ol>
              <li>아이폰 사진 앱에서 강아지를 손가락으로 길게 눌러요.</li>
              <li>강아지만 떠오르면 [공유] → [이미지 저장]을 눌러요.</li>
              <li>저장된 사진을 여기 칸에 넣으면 '배경 지움' 표시가 붙고, 어느 틀에서든 강아지만 배경색 위에 올라가요 (발밑 그림자는 자동).</li>
              <li>털 둘레에 남은 배경색 띠는 앱이 자동으로 다듬어요. 덩어리째 남은 배경은 칸 아래 [✂ 가장자리]에서 손가락으로 지우세요.</li>
              <li>털 색과 확실히 다른 한 가지 색 천·벽 앞에서 찍으면 훨씬 깔끔하게 떨어져요.</li>
            </ol>
          </details>
          <div id="card-photo-adjust" class="card-photo-adjust"></div>
        </div>
        <div class="form-group">
          <label class="form-label">사진 느낌 <span style="font-size:0.93rem;color:var(--text-muted);font-weight:400">· 모든 칸에 같이 들어가요</span></label>
          <div id="card-pick-filter" class="card-filter-row">
            ${Object.entries(this._CARD_FILTERS).map(([k, fl]) => `<button type="button" class="card-filter-btn${(this._CARD_FILTERS[saved.photoFilter] ? saved.photoFilter : 'none') === k ? ' active' : ''}" data-key="${k}"><span class="card-filter-thumb" data-key="${k}"></span><span>${fl.name}</span></button>`).join('')}
          </div>
        </div>
        </div>
        <div class="card-tabpanel" data-panel="layout" hidden>
        <!-- 틀을 장수로 묶는다 — 고른 사진 장수에 맞는 줄이 위로 (틀이 8개라 한눈에 찾기 어려웠다) -->
        <div id="card-pick-layout" class="card-pick-layout">
          ${[['one', '사진 한 장'], ['many', '사진 여러 장']].map(([g, label]) => `
          <div class="card-lay-group" data-group="${g}">
            <div class="card-lay-label">${label}</div>
            <div class="card-lay-row">
              ${Object.entries(LAYOUTS).filter(([, l]) => !l.legacy && ((l.photos === 1) === (g === 'one'))).map(([key, l]) => `
                <button type="button" class="card-pick-btn${key === selectedLayout ? ' active' : ''}" data-key="${key}" data-photos="${l.photos}">
                  ${this._layoutThumb(key)}
                  <span>${l.name}</span>
                </button>`).join('')}
            </div>
          </div>`).join('')}
        </div>
        <!-- 폴라로이드 모양 (폴라로이드 틀일 때만) — 예전 '사진 크기 모던/미니멀'은 20px 차이에 실제로 적용도 안 됐다 -->
        <div id="polaroid-options" class="form-group" style="display:${selectedLayout === 'single' ? 'block' : 'none'}">
          <label class="form-label">폴라로이드 모양</label>
          <div class="card-sticker-styles">
            <button type="button" class="card-tstyle-btn${saved.polaroidShape !== 'square' ? ' active' : ''}" data-shape="classic">아래 여백 넓게 (4:5)</button>
            <button type="button" class="card-tstyle-btn${saved.polaroidShape === 'square' ? ' active' : ''}" data-shape="square">정사각 (1:1)</button>
          </div>
          <div class="form-hint">아래 여백에 이름이나 '글자' 탭의 큰 제목이 크게 들어가요. 4:5는 인스타 피드에 그대로 올라가요.</div>
        </div>
        <!-- 틀 없이 — 카드 비율 -->
        <div id="plain-options" class="form-group" style="display:${selectedLayout === 'plain' ? 'block' : 'none'}">
          <label class="form-label">카드 비율</label>
          <div class="card-sticker-styles">
            ${Object.entries(this._PLAIN_RATIOS).map(([k, n]) => `<button type="button" class="card-tstyle-btn${(this._PLAIN_RATIOS[saved.plainRatio] ? saved.plainRatio : 'orig') === k ? ' active' : ''}" data-ratio="${k}">${n}</button>`).join('')}
          </div>
          <div class="form-hint">사진 위에 아무 틀도 없어요. '글자'·'스티커' 탭에서 꾸미세요.</div>
        </div>
        <!-- 배경색은 꾸미기 탭 한 곳에서 — 여기서는 지금 색을 보여 주고 바로 건너가게 -->
        <button type="button" class="card-bg-link" id="card-bg-link"><i id="card-bg-link-dot"></i><span>배경색 <b id="card-bg-link-name"></b></span><em>바꾸기 ›</em></button>
        </div>
        <div class="card-tabpanel" data-panel="deco" hidden>
        <!-- 배경색 한 줄 (예전 테마 4개 · 빠른 색 조합 5개 · 사진관 색 7개를 합쳤다) → 내 프레임 → 글꼴 → 더 꾸미기 -->
        <div class="form-group">
          <div id="card-pick-theme" class="card-pick-theme">
            <label class="form-label">배경색 <span class="card-sub">· 어느 틀이든 같이 바뀌어요</span></label>
            <div class="card-bg-row">
              ${[['bg:auto', '자동', 'auto'], ...Object.entries(THEMES).map(([k]) => [k, ({ classic: '흰색', film: '크림', pastel: '연분홍', dark: '남색' })[k] || THEMES[k].name, this.CARD_TEMPLATES[k]?.bgColor || '#FFFFFF']),
                ...Object.entries(this._STUDIO_COLORS).map(([k, c]) => ['bg:' + k, c.name, c.hex])].map(([key, name, hex]) => `
                <button type="button" class="card-pick-btn card-bg-chip${key === selectedBgKey ? ' active' : ''}" data-key="${key}"${hex === 'auto' ? ' data-auto="1"' : ` style="--c:${hex}"`}><i></i><span>${name}</span></button>`).join('')}
            </div>
            ${userFrames.length ? `<label class="form-label" style="margin-top:14px">내 프레임 <span class="card-sub">· 고르면 프레임 모양 그대로 나와요</span></label>
            <div class="card-frame-row" aria-label="내 프레임">${userFrames.map(f => `
              <button type="button" class="card-pick-btn card-frame-btn${selectedFrameId === f.id ? ' active' : ''}" data-key="frame:${App.escapeHtml(f.id)}" data-frame-id="${App.escapeHtml(f.id)}" title="${App.escapeHtml(f.name)}">
                <span class="card-frame-thumb"><img src="${f.image}" alt="" loading="lazy"></span>
                <span class="card-frame-name">${App.escapeHtml(f.name)}</span>
                ${f.mode === 'overlay' && Array.isArray(f.holes) && f.holes.length ? `<small class="card-frame-holes">사진 ${f.holes.length}칸</small>` : ''}
              </button>
            `).join('')}</div>` : ''}
            <!-- '커스텀' 테마 값은 아래 '더 꾸미기'를 펼치면 켜진다 (칸은 숨겨 두고 선택 상태만 담는다) -->
            <button type="button" class="card-pick-btn${selectedBgKey === 'custom' ? ' active' : ''}" data-key="custom" style="display:none" aria-hidden="true" tabindex="-1"></button>
          </div>
          <div class="form-hint" style="margin-top:6px">${userFrames.length ? '' : '내 프레임이 아직 없어요. '}설정 → 매장 관리 → 내 프레임 라이브러리에서 \'직접 만들기\'로 만들 수 있어요.</div>
        </div>
        <div class="form-group">
          <label class="form-label">글꼴</label>
          <div id="card-pick-font" class="card-font-row">
            ${Object.entries(this._CARD_FONTS).map(([k, f]) => `<button type="button" class="card-font-btn${(saved.fontKey || 'system') === k ? ' active' : ''}" data-key="${k}" style="font-family:${App.escapeHtml(this._cardFontStack(k))}">${f.name}</button>`).join('')}
          </div>
        </div>
        <details id="card-custom-panel" class="card-more"${selectedTheme === 'custom' && !selectedFrameId ? ' open' : ''}>
          <summary>${App.icon('palette')} 더 꾸미기 <span>색 직접 고르기 · 배경 사진</span></summary>
          <div id="card-custom-colors" style="margin-bottom:10px${saved.customBgImage ? ';display:none' : ''}">
            <label class="form-label" style="font-size:0.93rem;margin-bottom:6px">직접 선택</label>
            <div class="form-row" style="gap:8px">
              <div class="form-group" style="flex:1">
                <label style="font-size:0.93rem;color:var(--text-muted)">배경</label>
                <input type="color" id="card-custom-bg" value="${saved.customBgColor || '#FFFFFF'}" style="width:100%;height:36px;border:none;border-radius:6px;cursor:pointer">
              </div>
              <div class="form-group" style="flex:1">
                <label style="font-size:0.93rem;color:var(--text-muted)">글자</label>
                <input type="color" id="card-custom-text" value="${saved.customTextColor || '#1A1A1A'}" style="width:100%;height:36px;border:none;border-radius:6px;cursor:pointer">
              </div>
              <div class="form-group" style="flex:1">
                <label style="font-size:0.93rem;color:var(--text-muted)">포인트</label>
                <input type="color" id="card-custom-accent" value="${saved.customAccentColor || '#6366F1'}" style="width:100%;height:36px;border:none;border-radius:6px;cursor:pointer">
              </div>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label" style="font-size:0.93rem">배경 이미지 <span style="color:var(--text-muted);font-weight:400">(선택)</span></label>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="file" id="card-custom-bgimg" accept="image/*" style="display:none">
              <button type="button" class="btn btn-sm btn-secondary" id="card-custom-bgimg-btn">${saved.customBgImage ? '이미지 변경' : '이미지 선택'}</button>
              <span id="card-custom-bgimg-name" style="font-size:0.93rem;color:var(--text-muted)">${saved.customBgImage ? App.icon('check') + ' 설정됨' : ''}</span>
              <button type="button" class="btn btn-sm btn-danger" id="card-custom-bgimg-remove"${saved.customBgImage ? '' : ' hidden'}>삭제</button>
            </div>
          </div>
        </details>
        </div>
        <div class="card-tabpanel" data-panel="sticker" hidden>
        <div class="form-group">
          <label class="form-label">스티커 <span style="font-size:0.93rem;color:var(--text-muted);font-weight:400">· 누르면 붙어요, 미리보기에서 끌어 옮기세요</span></label>
          <div class="card-sticker-sets" role="tablist" aria-label="스티커 묶음">
            <button type="button" class="card-sticker-set active" data-set="retro">레트로</button>
            <button type="button" class="card-sticker-set" data-set="brand">브랜드</button>
            <button type="button" class="card-sticker-set" data-set="modern">모던</button>
            <button type="button" class="card-sticker-set" data-set="chic">세련된</button>
            <button type="button" class="card-sticker-set" data-set="emoji">이모지</button>
          </div>
          <div id="card-sticker-pick" class="card-sticker-row">
            <button type="button" class="card-sticker-tool" id="card-sticker-add">${App.icon('plus')}<small>내 스티커</small></button>
            <button type="button" class="card-sticker-tool" id="card-sticker-text"><b>가</b><small>글자</small></button>
            <button type="button" class="card-sticker-tool" id="card-sticker-logo"><b>◎</b><small>내 로고</small></button>
            <span id="card-sticker-custom" class="card-sticker-custom"></span>
            ${Object.entries(this._AI_STICKER_SETS).map(([set, ids]) => ids.map(id => `<button type="button" class="card-sticker-btn" data-set="${set}" data-sticker="${id}" aria-label="스티커 붙이기"${set === 'retro' ? '' : ' hidden'}><img src="${this._stickerSrc(id)}" alt="" loading="lazy"></button>`).join('')).join('')}
            ${this._CHIC_STICKERS.map(id => `<button type="button" class="card-sticker-btn" data-set="chic" data-sticker="${id}" aria-label="스티커 붙이기" hidden><img src="${this._stickerSrc(id)}" alt="" loading="lazy"></button>`).join('')}
            ${this._STICKERS.map(id => `<button type="button" class="card-sticker-btn" data-set="emoji" data-sticker="${id}" aria-label="스티커 붙이기" hidden><img src="${this._stickerSrc(id)}" alt="" loading="lazy"></button>`).join('')}
          </div>
          <div class="card-sticker-sub">
            <input type="file" id="card-sticker-file" accept="image/*" multiple hidden>
            <button type="button" class="btn btn-sm btn-ghost" id="card-sticker-manage" hidden>내 스티커 정리</button>
          </div>
          <div id="card-sticker-logoform" class="card-sticker-textform" hidden>
            <div class="form-hint" style="margin:0">설정에 올린 매장 로고로 스티커를 만들어요. 모양을 고르세요.</div>
            <div class="card-sticker-styles">
              <button type="button" class="card-tstyle-btn" data-logo="plain">그대로</button>
              <button type="button" class="card-tstyle-btn" data-logo="badge">원형 배지</button>
              <button type="button" class="card-tstyle-btn" data-logo="label">라벨</button>
            </div>
          </div>
        </div>
        </div>
        <div class="card-tabpanel" data-panel="text" hidden>
        <!-- 카드에 넣을 글자 — 켜고 끄는 정보 + 직접 쓰는 문구를 한곳에 (예전엔 '카드에 넣을 글자'·'자유 텍스트'·'표시 항목' 세 곳으로 나뉘어 헷갈렸다)
             이름·날짜·매장명은 테마와 상관없이 켜고 끈다 (늘 들어가면 촌스러울 수 있다 — 사장님 의견) -->
        <!-- 글자 넣기 — 스티커처럼 어느 틀·프레임에든 원하는 자리에 (인스타 글자처럼 모양·색·글꼴) -->
        <div class="form-group card-text-maker" id="card-text-maker">
          <label class="form-label">글자 넣기 <span style="font-size:0.93rem;color:var(--text-muted);font-weight:400">· 어느 틀이든, 미리보기에서 끌어 옮겨요</span></label>
          <textarea id="card-text-input" rows="2" maxlength="40" placeholder="글자를 쓰세요 (줄바꿈으로 세 줄까지)"></textarea>
          <div class="card-text-quick" id="card-text-quick"></div>
          <div class="card-text-row"><span class="card-text-row-label">모양</span>
            <div class="card-sticker-styles" id="card-text-styles">${Object.entries(this._TEXT_STICKER_STYLES).map(([k, v]) => `<button type="button" class="card-tstyle-btn" data-tstyle="${k}">${v.name}</button>`).join('')}</div>
          </div>
          <div class="card-text-row"><span class="card-text-row-label">색</span>
            <div class="card-text-colors" id="card-text-colors">${this._TEXT_COLORS.map(c => `<button type="button" class="card-text-color" data-color="${c}" style="background:${c}" aria-label="색 ${c}"></button>`).join('')}</div>
          </div>
          <div class="card-text-row"><span class="card-text-row-label">글꼴</span>
            <div class="card-font-row" id="card-text-fonts">${Object.entries(this._CARD_FONTS).map(([k, f]) => `<button type="button" class="card-font-btn" data-key="${k}" style="font-family:${App.escapeHtml(this._cardFontStack(k))}">${f.name}</button>`).join('')}</div>
          </div>
          <div class="card-text-actions">
            <button type="button" class="btn btn-primary" id="card-text-add">${App.icon('plus')} 글자 붙이기</button>
            <div id="card-text-editing" class="card-text-editing" hidden>고른 글자를 고치는 중이에요 <button type="button" class="btn btn-sm btn-secondary" id="card-text-done">다 됐어요</button></div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">자동으로 넣는 정보 <span style="font-size:0.93rem;color:var(--text-muted);font-weight:400">· 틀마다 정해진 자리에</span></label>
          <div class="card-text-toggles">
            <label class="card-toggle"><input type="checkbox" id="card-show-pet" ${saved.showPet !== false ? 'checked' : ''}> 반려견 이름</label>
            <label class="card-toggle"><input type="checkbox" id="card-show-date" ${saved.showDate !== false ? 'checked' : ''}> 날짜</label>
            <label class="card-toggle"><input type="checkbox" id="card-show-shop" ${saved.showShop !== false ? 'checked' : ''}> 매장명·로고</label>
            <label class="card-toggle"><input type="checkbox" id="card-show-service" ${saved.showService ? 'checked' : ''}> 서비스명</label>
            <label class="card-toggle"><input type="checkbox" id="card-show-nextvisit" ${saved.showNextVisit ? 'checked' : ''}> 다음 방문일</label>
          </div>
          <div class="form-hint" id="card-text-support" style="margin-top:6px">다음 방문일을 넣으면 손님이 다시 예약하기 쉬워요.</div>
        </div>
        <details class="card-more">
          <summary>틀에 고정된 문구 <span>제목 · 인사</span></summary>
          <div class="form-hint" style="margin:0 0 8px">일부 틀에만 정해진 자리에 나와요. 원하는 자리에 넣으려면 위 '글자 넣기'를 쓰세요.</div>
          <input type="text" id="card-headline" placeholder="큰 제목 (예: {반려견명}의 첫 미용 ✨)" value="${App.escapeHtml(withPet(saved.headline))}" maxlength="40" style="width:100%;margin-bottom:6px;min-height:40px;font-size:max(16px,0.9rem)">
          <input type="text" id="card-subline" placeholder="작은 제목 (예: 행복한 하루)" value="${App.escapeHtml(withPet(saved.subline))}" maxlength="50" style="width:100%;margin-bottom:6px;min-height:40px;font-size:max(16px,0.9rem)">
          <input type="text" id="card-footer" placeholder="맨 아래 인사 (기본: 감사합니다 ♥)" value="${App.escapeHtml(withPet(saved.footerMessage))}" maxlength="60" style="width:100%;min-height:40px;font-size:max(16px,0.9rem)">
          <div class="form-hint" style="margin-top:6px">큰 제목: 피드·스토리·폴라로이드 · 작은 제목: 피드·스토리 · 인사: 2컷.</div>
        </details>

        <!-- 매장 로고 위치/크기 (모든 테마 공통) — 자주 안 바꿔 접어 둔다 -->
        <details class="card-more">
          <summary>매장 로고 위치·크기 <span>설정에 올린 로고</span></summary>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
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
          <div class="form-hint" style="margin-bottom:8px">스토리(9:16)는 위·아래 일부가 인스타 화면(시간·좋아요)에 가려져요. '상단 (스토리 안전 영역)'을 권해요.</div>
        </details>

        </div>
        </div>
        </div>
      `,
      onSave: async () => {
        const f = await this._readCardForm(cardPetName);
        const count = this._cardPhotoCount(f);
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
        btn.addEventListener('click', (e) => {
          if (e.isTrusted) this._cardLayoutPicked = true; // 직접 고른 틀은 사진 장수가 바뀌어도 그대로
          document.querySelectorAll('#card-pick-layout .card-pick-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          // 폴라로이드(single)일 때만 사진 크기 옵션 표시
          const polarOpts = document.getElementById('polaroid-options');
          if (polarOpts) polarOpts.style.display = btn.dataset.key === 'single' ? 'block' : 'none';
          const k = btn.dataset.key;
          const plainOpts = document.getElementById('plain-options');
          if (plainOpts) plainOpts.style.display = k === 'plain' ? 'block' : 'none';

        });
      });
      // 틀 탭 → 꾸미기 탭 배경색으로 바로
      document.getElementById('card-bg-link')?.addEventListener('click', () => {
        document.querySelector('.card-tab[data-tab="deco"]')?.click();
        setTimeout(() => document.getElementById('card-pick-theme')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
      });
      // 틀 없이 비율
      [['#plain-options', 'ratio']].forEach(([box, attr]) => {
        document.querySelectorAll(`${box} [data-${attr}]`).forEach(b => {
          b.addEventListener('click', () => {
            document.querySelectorAll(`${box} [data-${attr}]`).forEach(x => x.classList.toggle('active', x === b));
            this._scheduleCardPreview();
          });
        });
      });
      // 폴라로이드 모양
      document.querySelectorAll('#polaroid-options [data-shape]').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('#polaroid-options [data-shape]').forEach(x => x.classList.toggle('active', x === b));
          this._scheduleCardPreview();
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
      // 미리보기 크게 보기 (휴대폰에서 작게 보이는 카드를 화면 가득 — 스티커·글자까지)
      const zoomBtn = document.getElementById('card-live-zoom');
      if (zoomBtn) zoomBtn.onclick = (e) => {
        e.stopPropagation();
        const stage = document.querySelector('.card-live-stage');
        const im = document.getElementById('card-live-img');
        if (!stage || !im || im.hidden) return;
        const ov = document.createElement('div');
        ov.className = 'card-zoom-overlay';
        const clone = stage.cloneNode(true);
        clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        clone.querySelector('.card-live-zoom')?.remove();
        clone.querySelectorAll('.card-sticker.sel').forEach(el => el.classList.remove('sel'));
        ov.appendChild(clone);
        ov.insertAdjacentHTML('beforeend', '<div class="card-zoom-close">눌러서 닫기</div>');
        ov.onclick = () => ov.remove();
        document.body.appendChild(ov);
      };
      // 사진첩에서 여러 장 한 번에 (빈 칸부터 채움)
      const multiBtn = document.getElementById('card-photo-multi-btn');
      const multiIn = document.getElementById('card-photo-multi');
      if (multiBtn && multiIn) {
        multiBtn.onclick = () => multiIn.click();
        multiIn.onchange = async () => {
          const files = [...(multiIn.files || [])];
          multiIn.value = '';
          if (!files.length) return;
          // 지금 틀이 쓰는 칸이 다 차 있으면 새로 고른 사진으로 처음부터 바꾼다 (폴라로이드 1칸이면 그 사진을 바꿈)
          const f = await this._readCardForm(this._cardPetName || '');
          const count = this._cardPhotoCount(f);
          const full = (this._cardPhotos || []).slice(0, count).every(Boolean);
          await this._addCardPhotos(files, null, full ? count : 0);
        };
      }
      // 사진 느낌(필터)
      const filterRow = document.getElementById('card-pick-filter');
      if (filterRow) filterRow.onclick = (e) => {
        const b = e.target.closest('.card-filter-btn');
        if (!b) return;
        filterRow.querySelectorAll('.card-filter-btn').forEach(x => x.classList.toggle('active', x === b));
        this._scheduleCardPreview();
      };
      this._filterThumbSrc = null;
      // 탭: 한 번에 한 묶음만 보여 창이 길어지지 않게
      const tabsEl = document.querySelector('.card-tabs');
      if (tabsEl) tabsEl.onclick = (e) => {
        const t = e.target.closest('.card-tab');
        if (!t) return;
        this._cardTab = t.dataset.tab;
        tabsEl.querySelectorAll('.card-tab').forEach(b => b.classList.toggle('active', b === t));
        document.querySelectorAll('.card-tabpanel').forEach(p => { p.hidden = p.dataset.panel !== t.dataset.tab; });
        document.querySelector('.card-maker')?.setAttribute('data-tab', t.dataset.tab);
        this._renderStickerLayer();
        const panels = document.querySelector('.card-panels');
        if (panels && window.matchMedia('(max-width: 768px)').matches) document.getElementById('modal-body')?.scrollTo({ top: 0 });
      };
      this._cardTab = 'photo';
      document.querySelector('.card-maker')?.setAttribute('data-tab', 'photo');
      this._bindStickers();
      // 사진 칸은 늘 4개 — 사진을 먼저 고르고 레이아웃을 고른다 (Instagram Layout 방식)
      this._renderPhotoSlots(4);

      // 무엇을 바꾸든 미리보기를 다시 그린다 (입력·선택·버튼)
      const mb = document.getElementById('modal-body');
      if (mb) {
        // addEventListener 는 창을 열 때마다 쌓여 사진·프레임을 메모리에 붙잡았다 — on* 속성은 덮어써서 하나만 남는다
        // 스티커 크기·회전·글자 입력은 카드 그림과 무관 (스티커는 위 레이어에 따로 그린다) — 무거운 미리보기를 다시 만들지 않는다
        const skip = (e) => !!e.target.closest?.('#card-sticker-edit, #card-text-maker, #card-sticker-logoform, #card-sticker-file');
        mb.oninput = (e) => { if (!skip(e)) this._scheduleCardPreview(); };
        mb.onchange = (e) => { if (!skip(e)) this._scheduleCardPreview(); };
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
      // 기록에서 연 카드는 그 기록 사진을 바로 넣는다 ('다시 꾸미기'는 고른 사진 그대로)
      if (ctx.usePool && !keep) document.getElementById('card-use-record-photos')?.click();

      // 테마 토글 + '직접 꾸미기' 펼침 = 커스텀 테마
      this._customBgImage = saved.customBgImage || null;
      const themeBtns = () => document.querySelectorAll('#card-pick-theme .card-pick-btn');
      const customBtn = document.querySelector('#card-pick-theme .card-pick-btn[data-key="custom"]');
      const customPanel = document.getElementById('card-custom-panel');
      // 접을 때 돌아갈 테마 (커스텀으로 열린 창이면 기본 테마)
      let prevThemeBtn = document.querySelector('#card-pick-theme .card-pick-btn.active:not([data-key="custom"])')
        || document.querySelector('#card-pick-theme .card-pick-btn[data-key="classic"]');
      const activateTheme = (btn) => {
        if (!btn) return;
        themeBtns().forEach(b => b.classList.toggle('active', b === btn));
        if (btn !== customBtn) prevThemeBtn = btn;
      };
      themeBtns().forEach(btn => {
        if (btn === customBtn) return;
        btn.addEventListener('click', () => {
          activateTheme(btn);
          if (customPanel) customPanel.open = false;
        });
      });
      customPanel?.addEventListener('toggle', () => {
        if (customPanel.open) activateTheme(customBtn);
        else if (customBtn?.classList.contains('active')) activateTheme(prevThemeBtn);
        this._scheduleCardPreview();
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
            // 고른 바로 뒤에도 지울 수 있게 (예전엔 창을 다시 열어야 '제거'가 보였다)
            const rmBtn = document.getElementById('card-custom-bgimg-remove');
            if (rmBtn) rmBtn.hidden = false;
            const chBtn = document.getElementById('card-custom-bgimg-btn');
            if (chBtn) chBtn.textContent = '이미지 변경';
            e.target.value = ''; // 같은 사진을 다시 골라도 바뀌게
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
        const rmBtn = document.getElementById('card-custom-bgimg-remove');
        if (rmBtn) rmBtn.hidden = true;
        const chBtn = document.getElementById('card-custom-bgimg-btn');
        if (chBtn) chBtn.textContent = '이미지 선택';
        // 배경색 피커 복원
        const colorsPanel = document.getElementById('card-custom-colors');
        if (colorsPanel) colorsPanel.style.display = '';
        this._scheduleCardPreview();
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
      designSettings.stickers = (this._cardStickers || []).map(st => ({ ...st, src: this._stickerSrcOf(st) })).filter(st => st.src);

      const canvas = await this._generateCardCanvas(record, customer, pet, shopName, shopPhone, serviceNames, designSettings);

      // 대형 캔버스(스토리 등)는 JPEG로 출력 (빠르고 가벼움)
      const isLarge = canvas.width > 800 || canvas.height > 1500;
      const mimeType = isLarge ? 'image/jpeg' : 'image/png';
      const ext = isLarge ? 'jpg' : 'png';
      canvas.toBlob(blob => {
        if (!blob) { canvas.width = canvas.height = 0; App.showToast('카드 생성에 실패했습니다.', 'error'); return; }
        const url = URL.createObjectURL(blob);
        const fileName = (pet?.name ? pet.name + '_' : '') + '미용카드_' + record.date + '.' + ext; // 반려견 없으면 'pet_' 대신 '미용카드_날짜'
        const customerPhone = (customer?.phone || '').replace(/\D/g, '');

        // 모달 닫힐 때 Object URL 해제 + 카드 캔버스 메모리 반환 (인쇄용·인스타용이 창이 열린 동안 쓴다 — iOS 캔버스 한도)
        const _origClose = App._modalOnClose;
        App._modalOnClose = () => { if (_origClose) _origClose(); URL.revokeObjectURL(url); canvas.width = canvas.height = 0; App._modalOnClose = null; };

        // 완성 화면 — 공유가 주 동작, 저장·다시 꾸미기는 나란히, 문자·인스타용·인쇄는 '더보기' 안에
        const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
        // 네컷·2컷은 1:3 띠라 인스타 피드(최대 4:5)·스토리(9:16)에 그대로 올리면 잘린다 → 배경 위에 가운데 놓은 버전을 따로 만든다
        const isTall = canvas.height / canvas.width > 1.9;
        const file = new File([blob], fileName, { type: mimeType });
        const canShareFile = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
        const cardMsg = () => App.buildSms('cardSend', { '고객명': customer?.name || '', '반려견명': pet?.name || '' });
        // Safari 는 누른 뒤 await(IndexedDB 읽기)가 끼면 공유·복사를 막는다(NotAllowedError) — 문구를 미리 만들어 둔다
        let cardText = null;
        cardMsg().then(t => { cardText = t; }).catch(() => { cardText = ''; });
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
                  <button class="btn btn-secondary" id="card-edit">${App.icon('edit')} 다시 꾸미기</button>
                </div>
                <!-- 자주 안 쓰는 것(문자·인스타용·인쇄)은 접어 둔다 — 버튼이 7개라 무엇을 눌러야 할지 헷갈렸다 -->
                <details class="card-more card-done-more">
                  <summary>더보기 <span>${[customerPhone ? '문자' : '', isTall ? '인스타용' : '', '인쇄'].filter(Boolean).join(' · ')}</span></summary>
                  <div class="card-done-more-body">
                    ${customerPhone ? `<button class="btn btn-secondary" id="card-send-customer">${App.icon('message')} ${App.escapeHtml(App.getCustomerLabel(customer))} 번호로 문자 열기</button>` : ''}
                    ${isTall ? `<div class="card-done-row">
                      <button class="btn btn-secondary" id="card-insta-feed">${App.icon('image')} 인스타 피드 4:5</button>
                      <button class="btn btn-secondary" id="card-insta-story">${App.icon('camera')} 인스타 스토리</button>
                    </div>
                    <p class="card-done-hint" style="margin-top:-2px">세로로 긴 카드는 인스타에서 잘려요. 피드·스토리용은 배경 위에 카드를 가운데 놓은 버전이에요.</p>` : ''}
                    <button class="btn btn-secondary" id="card-print">${App.icon('print')} 인쇄용 4×6 저장</button>
                  </div>
                </details>
                <p class="card-done-hint">${isIOS ? '아이폰은 <b>공유하기 → 이미지 저장</b>을 누르면 사진첩에 저장돼요. 저장 버튼은 파일 앱에 저장됩니다.' : '공유하기에서 카카오톡을 고르면 사진이 바로 첨부돼요.'}</p>
              </div>
            </div>
          `
        });

        // 공유 — 이미지 + '사진 카드' 문구 (앱에 따라 문구는 빠질 수 있다)
        document.getElementById('card-share')?.addEventListener('click', async () => {
          const text = cardText ?? await cardMsg();
          if (canShareFile) {
            navigator.share({ files: [file], text, title: (pet?.name || '') + ' 미용 카드' }).catch(err => {
              if (err && err.name === 'AbortError') return; // 사용자가 닫음
              // 공유가 막히면 저장으로 대신한다 (조용히 아무 일 없던 문제)
              download(url, fileName);
              App.showToast('공유를 열지 못해 카드를 저장했어요. 카톡·문자에 첨부해 보내세요.', 'info', { duration: 5000 });
            });
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
          const msg = cardText ?? await cardMsg();
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
            sheet.width = sheet.height = 0; // 다 쓴 인쇄용 캔버스 메모리 반환
            if (!b) { App.showToast('인쇄용 이미지를 만들지 못했습니다.', 'error'); return; }
            const pu = URL.createObjectURL(b);
            download(pu, (pet?.name ? pet.name + '_' : '') + '미용카드_인쇄용4x6_' + record.date + '.jpg');
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
            // 다 쓴 캔버스 메모리 반환 (카드 원본 canvas 는 창이 닫힐 때)
            sheet.width = sheet.height = 0;
            if (inner !== canvas) inner.width = inner.height = 0;
            if (!b) { App.showToast('이미지를 만들지 못했습니다.', 'error'); return; }
            const pu = URL.createObjectURL(b);
            download(pu, (pet?.name ? pet.name + '_' : '') + (kind === 'story' ? '미용카드_인스타스토리_' : '미용카드_인스타피드_') + record.date + '.jpg');
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

  // 리포트 디자인 (1.08 시안) — 같은 내용을 네 가지 느낌으로. 설정값 reportTheme (고르는 화면은 사장님이 시안을 고른 뒤 정함 — 지금은 늘 warm)
  REPORT_THEMES: {
    warm: { label: '따뜻한', bg: '#F6F1EA', card: true, band: 'glow', align: 'center', r: 1, tile: '#FAF8F5', tileLine: null, heading: 'bar', ticket: 'fill', chip: 'soft', kicker: '오늘의 미용 알림장', title: 800 },
    clean: { label: '깔끔한', bg: '#FFFFFF', card: false, band: 'none', align: 'left', r: 0.35, tile: null, tileLine: '#E5E7EB', heading: 'rule', ticket: 'line', chip: 'line', kicker: '', title: 700, status: 'list' },
    accent: { label: '포인트', bg: '#FFFFFF', card: false, band: 'topbar', align: 'left', r: 0.4, tile: 'tint', tileLine: null, heading: 'rule-accent', ticket: 'soft', chip: 'accent', kicker: '미용 리포트', title: 800 },
    modern: { label: '모던', bg: '#EEF0F3', card: true, band: 'dark', align: 'left', r: 0.55, tile: '#F4F5F7', tileLine: null, heading: 'num', ticket: 'dark', chip: 'dark', kicker: '미용 리포트', title: 800 },
    pastel: { label: '파스텔', bg: 'tint', card: true, band: 'dots', align: 'center', r: 1.5, tile: 'tint', tileLine: null, heading: 'pill', ticket: 'fill', chip: 'soft', kicker: '오늘도 예뻐졌어요', title: 800 }
  },

  async buildReportCanvas(record, info) {
    const { pet, shopName, shopPhone, logo, reviewLink } = info;
    // 기록에 있는 것만 쓰고(빈 칸은 통째로 뺀다), 이미지는 저장하지 않고 즉석에서 만든다.
    const T = this.REPORT_THEMES[info.theme] || this.REPORT_THEMES.clean;
    const W = 1080, M = T.card ? 44 : 0, P = T.card ? 60 : 80;
    const CX = M + P, CW = W - (M + P) * 2;
    const R = (n) => Math.round(n * T.r);
    const accent = /^#[0-9a-f]{6}$/i.test(info.accent || '') ? info.accent : '#6366F1';
    const tint = (a) => { const n = parseInt(accent.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
    const font = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
    const C = { text: '#1F2328', sub: '#6B7280', line: '#ECE7E0', dark: '#14161A' };
    const bgColor = T.bg === 'tint' ? null : T.bg;
    const tileFill = T.tile === 'tint' ? tint(0.07) : T.tile;
    const L = this._REPORT_LABELS;
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    const kDate = (s, withYear) => {
      const d = App.parseLocalDate ? App.parseLocalDate(s) : new Date(s + 'T00:00:00');
      if (!d || isNaN(d)) return s || '';
      return (withYear ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DOW[d.getDay()] + ')';
    };

    const imgs = [];
    for (const [f, tag] of [['photoBefore', '미용 전'], ['photoAfter', '미용 후']]) {
      const src = await App.getRecordPhoto(record, f);
      const im = src ? await this._loadImg(src) : null;
      if (im) imgs.push({ im, tag });
    }
    if (imgs.length === 1 && imgs[0].tag === '미용 후') imgs[0].tag = '오늘의 모습';
    const logoImg = logo ? await this._loadImg(logo) : null;

    let mainSvc = '', subSvc = [];
    if (record.service) {
      mainSvc = String(record.service) + (record.style ? ' · ' + record.style : '');
      const styleParts = new Set(String(record.style || '').split(/\s*[+,·]\s*/).map(x => App.normalizeServiceName(x)).filter(Boolean));
      subSvc = (record.addons || []).filter(Boolean).map(String).filter(a => !styleParts.has(App.normalizeServiceName(a)));
    } else {
      const names = (record.serviceNames || []).filter(Boolean).map(String);
      mainSvc = names[0] || '';
      subSvc = names.slice(1).concat(Array.isArray(record.addons) ? record.addons.filter(Boolean).map(String) : []);
    }
    const tips = (App.getHomeCareAdvice ? App.getHomeCareAdvice(record) : []).slice(0, 3);
    const status = [];
    if (record.condition) status.push(['컨디션', L.condition[record.condition] || record.condition, this._reportTone('condition', record.condition)]);
    if (record.cooperativeness) status.push(['미용 협조', L.cooperativeness[record.cooperativeness] || record.cooperativeness, this._reportTone('cooperativeness', record.cooperativeness)]);
    if (Array.isArray(record.skinStatus) && record.skinStatus.length) status.push(['피부', record.skinStatus.join(' · '), this._reportTone('skin', record.skinStatus.find(x => x !== '정상') || '정상')]);
    if (record.earStatus) status.push(['귀', L.earStatus[record.earStatus] || record.earStatus, this._reportTone('earStatus', record.earStatus)]);
    if (record.mattingLevel) status.push(['털 엉킴', L.mattingLevel[record.mattingLevel] || record.mattingLevel, this._reportTone('mattingLevel', record.mattingLevel)]);
    const memo = String(record.memo || '').trim().replace(/\s+/g, ' ').slice(0, 140);
    // 오늘 잰 몸무게 — 보호자가 궁금해하는 숫자 (기록에 있을 때만)
    const weightTxt = Number(record.weightAtVisit) > 0 ? App.formatKg(record.weightAtVisit) + 'kg' : '';
    let daysToNext = null;
    if (record.nextVisitDate && record.date) {
      const a = new Date(record.date + 'T00:00:00'), b = new Date(record.nextVisitDate + 'T00:00:00');
      if (!isNaN(a) && !isNaN(b)) daysToNext = Math.round((b - a) / 86400000);
    }

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = 10;
    let ctx = canvas.getContext('2d');
    const setFont = (f) => { ctx.font = f; };
    const F = (w, s) => `${w} ${s}px ${font}`;
    const wrap = (str, maxW, f) => {
      setFont(f);
      const out = []; let line = '';
      for (const ch of String(str || '')) {
        const t = line + ch;
        if (ctx.measureText(t).width > maxW && line) { out.push(line.trimEnd()); line = ch === ' ' ? '' : ch; } else line = t;
      }
      if (line) out.push(line);
      return out;
    };
    const fit = (str, maxW, f) => { setFont(f); let v = String(str); while (ctx.measureText(v).width > maxW && v.length > 2) v = v.slice(0, -2) + '…'; return v; };

    const run = (draw, cardH) => {
      const text = (str, x, yy, f, color, align) => { if (!draw) return; ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.fillText(str, x, yy); };
      const box = (x, yy, w, h, r, fill) => { if (!draw) return; ctx.fillStyle = fill; this._roundRect(ctx, x, yy, w, h, Math.max(0, Math.min(r, h / 2, w / 2))); ctx.fill(); };
      const stroke = (x, yy, w, h, r, color, lw) => { if (!draw) return; ctx.strokeStyle = color; ctx.lineWidth = lw || 2; this._roundRect(ctx, x, yy, w, h, Math.max(0, Math.min(r, h / 2, w / 2))); ctx.stroke(); };
      let secNo = 0;
      // 섹션 제목 — 테마마다 모양이 다르다. 돌려주는 값 = 내용이 시작할 y
      const heading = (title, yy) => {
        secNo++;
        if (T.heading === 'bar') { box(CX, yy - 26, 8, 30, 4, accent); text(title, CX + 24, yy, F('bold', 32), C.text); return yy + 54; }
        if (T.heading === 'rule') {
          text(title, CX, yy, F('600', 26), C.sub);
          setFont(F('600', 26)); const tw = ctx.measureText(title).width;
          if (draw) { ctx.fillStyle = '#E5E7EB'; ctx.fillRect(CX + tw + 20, yy - 9, CW - tw - 20, 2); }
          return yy + 44;
        }
        if (T.heading === 'rule-accent') {
          text(title, CX, yy, F('bold', 28), accent);
          setFont(F('bold', 28)); const tw = ctx.measureText(title).width;
          if (draw) { ctx.fillStyle = accent; ctx.fillRect(CX, yy + 12, 56, 4); ctx.fillStyle = '#E5E7EB'; ctx.fillRect(CX + tw + 20, yy - 9, CW - tw - 20, 2); }
          return yy + 56;
        }
        if (T.heading === 'num') {
          text(String(secNo).padStart(2, '0'), CX, yy, F('800', 30), accent);
          text(title, CX + 56, yy, F('bold', 32), C.dark);
          return yy + 54;
        }
        // pill
        setFont(F('bold', 28)); const w = ctx.measureText(title).width + 48;
        box(T.align === 'center' ? (W - w) / 2 : CX, yy - 38, w, 54, 27, tint(0.14));
        text(title, T.align === 'center' ? W / 2 : CX + 24, yy - 2, F('bold', 28), accent, T.align === 'center' ? 'center' : 'left');
        return yy + 50;
      };
      const ax = T.align === 'center' ? W / 2 : CX;
      const aa = T.align === 'center' ? 'center' : 'left';
      let y = 0;
      // ── 바탕
      if (draw) {
        ctx.fillStyle = bgColor || '#FFFFFF'; ctx.fillRect(0, 0, W, canvas.height);
        if (!bgColor) { ctx.fillStyle = tint(0.10); ctx.fillRect(0, 0, W, canvas.height); }
        if (T.band === 'glow') {
          const g = ctx.createLinearGradient(0, 0, 0, 420); g.addColorStop(0, tint(0.22)); g.addColorStop(1, tint(0));
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, 420);
        } else if (T.band === 'dark') {
          ctx.fillStyle = C.dark; ctx.fillRect(0, 0, W, 520);
        } else if (T.band === 'topbar') {
          // 맨 위 가게 색 띠 + 아래로 옅게 번지는 색
          ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 14);
          const g = ctx.createLinearGradient(0, 14, 0, 300); g.addColorStop(0, tint(0.10)); g.addColorStop(1, tint(0));
          ctx.fillStyle = g; ctx.fillRect(0, 14, W, 286);
        } else if (T.band === 'dots') {
          // 물방울 장식
          [[90, 90, 60, 0.18], [980, 150, 90, 0.14], [1010, 40, 30, 0.2], [60, 260, 26, 0.16], [880, 300, 22, 0.2]].forEach(([x, yy, r, a]) => { ctx.fillStyle = tint(a); ctx.beginPath(); ctx.arc(x, yy, r, 0, Math.PI * 2); ctx.fill(); });
        }
      }
      const onDark = T.band === 'dark';
      // ── 머리: 로고 또는 가게 이름
      y = 72;
      if (logoImg) {
        const h = 76, w = Math.min(420, logoImg.width * h / logoImg.height);
        if (draw) ctx.drawImage(logoImg, T.align === 'center' ? (W - w) / 2 : CX, y - 30, w, h);
        y += 76;
      } else { text(shopName, T.align === 'center' ? W / 2 : CX, y + 22, F('bold', 34), onDark ? '#fff' : accent, aa); y += 50; }
      // 모던: 제목을 어두운 띠 위에 크게
      if (onDark) {
        y += 70;
        text(T.kicker, CX, y, F('600', 28), accent, 'left'); y += 84;
        text(`${pet?.name || '우리 아이'}`, CX, y, F('800', 84), '#fff', 'left'); y += 60;
        text(kDate(record.date, true) + (weightTxt ? '  ·  ' + weightTxt : '') + (record.groomer ? '  ·  담당 ' + record.groomer : ''), CX, y, F('500', 30), 'rgba(255,255,255,0.7)', 'left');
        y += 60;
      } else { y += 16; }
      // ── 카드 시작
      const cardTop = y;
      if (draw && T.card) {
        ctx.save();
        ctx.shadowColor = 'rgba(40,30,20,0.10)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
        box(M, cardTop, W - M * 2, cardH, R(44), '#FFFFFF');
        ctx.restore();
      }
      if (onDark) {
        y = cardTop + P;
      } else {
        y = cardTop + (T.card ? 74 : 40);
        if (T.kicker) { text(T.kicker, ax, y, F('600', 28), accent, aa); y += 76; } else y += 40;
        text(`${pet?.name || '우리 아이'}의 미용 리포트`, ax, y, F(String(T.title), 62), C.text, aa);
        if (T.heading === 'rule-accent' && draw) { ctx.fillStyle = accent; ctx.fillRect(CX, y + 22, 72, 6); } // 제목 아래 짧은 포인트 선
        y += 58;
        const s = kDate(record.date, true) + (weightTxt ? '  ·  ' + weightTxt : '') + (record.groomer ? '  ·  담당 ' + record.groomer : '');
        if (T.align === 'center') {
          setFont(F('500', 28)); const w = ctx.measureText(s).width + 56;
          box((W - w) / 2, y - 8, w, 54, 27, tileFill || '#F5F5F4');
          text(s, W / 2, y + 28, F('500', 28), C.sub, 'center');
          y += 46;
        } else { text(s, CX, y + 20, F('500', 28), C.sub, 'left'); y += 36; }
        y += 44;
      }
      // ── 사진
      if (imgs.length) {
        const gap = 22, n = imgs.length;
        const w = n === 2 ? (CW - gap) / 2 : CW;
        const h = n === 2 ? Math.round(w * 1.22) : Math.round(w * 0.8);
        imgs.forEach((p, i) => {
          const x = CX + i * (w + gap);
          if (!draw) return;
          ctx.save(); this._roundRect(ctx, x, y, w, h, R(30)); ctx.clip();
          this._drawImageCover(ctx, p.im, x, y, w, h);
          const g = ctx.createLinearGradient(0, y + h - 160, 0, y + h);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
          ctx.fillStyle = g; ctx.fillRect(x, y + h - 160, w, 160);
          ctx.restore();
          const isAfter = p.tag !== '미용 전';
          if (T.chip === 'line') {
            text(p.tag, x + 24, y + h - 30, F('bold', 28), '#fff');
          } else {
            setFont(F('bold', 26));
            const tw = ctx.measureText(p.tag).width + 40;
            const fill = isAfter ? (T.chip === 'dark' ? C.dark : accent) : 'rgba(255,255,255,0.92)';
            box(x + 20, y + h - 70, tw, 50, R(25), fill);
            text(p.tag, x + 20 + tw / 2, y + h - 35, F('bold', 26), isAfter ? '#fff' : C.text, 'center');
          }
        });
        y += h;
      }
      // ── 오늘 받은 미용
      if (mainSvc || subSvc.length) {
        y += 80; y = heading('오늘 받은 미용', y);
        let x = CX, rowH = 0;
        const chip = (label, big) => {
          const f = big ? F('bold', 32) : F('500', 28);
          const h = big ? 70 : 60, padX = big ? 30 : 24;
          const lbl = fit(label, CW - padX * 2, f);
          setFont(f);
          const w = ctx.measureText(lbl).width + padX * 2;
          if (x > CX && x + w > CX + CW) { x = CX; y += rowH + 14; rowH = 0; }
          let fill = C.text, bgc = tileFill || '#F5F5F4';
          if (T.chip === 'soft') { bgc = big ? tint(0.12) : (tileFill || '#F5F5F4'); fill = big ? accent : C.text; }
          if (T.chip === 'dark') { bgc = big ? C.dark : '#F4F5F7'; fill = big ? '#fff' : C.text; }
          if (T.chip === 'line') { bgc = null; fill = big ? C.text : C.sub; }
          if (T.chip === 'accent') { bgc = big ? accent : tint(0.08); fill = big ? '#fff' : accent; }
          if (bgc) box(x, y, w, h, R(h / 2), bgc);
          if (T.chip === 'line' || (T.chip === 'soft' && !big)) stroke(x, y, w, h, R(h / 2), big ? C.text : (T.chip === 'line' ? '#D1D5DB' : C.line), 2);
          text(lbl, x + padX, y + h / 2 + (big ? 11 : 10), f, fill);
          x += w + 12; rowH = Math.max(rowH, h);
        };
        if (mainSvc) chip(mainSvc, true);
        subSvc.forEach(s => chip('+ ' + s, false));
        y += rowH;
      }
      // ── 오늘 상태 (2칸 타일)
      if (status.length) {
        y += 80; y = heading('오늘 상태', y);
        if (T.status === 'list') {
          // 한 줄에 하나 — 칸이 홀수일 때 비는 자리 없이 단정하게
          const rh = 68;
          status.forEach(([k, v, tone], i) => {
            const yy = y + i * rh;
            text(k, CX, yy + 44, F('500', 28), C.sub);
            const val = fit(v, CW - 300, F('bold', 30));
            setFont(F('bold', 30)); const vw = ctx.measureText(val).width;
            text(val, CX + CW, yy + 44, F('bold', 30), C.text, 'right');
            if (draw) { ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(CX + CW - vw - 22, yy + 34, 9, 0, Math.PI * 2); ctx.fill(); }
            if (draw && i < status.length - 1) { ctx.fillStyle = '#F0F0F0'; ctx.fillRect(CX, yy + rh - 1, CW, 2); }
          });
          y += status.length * rh - 10;
        } else {
        const gap = 16, tw = (CW - gap) / 2, th = 112;
        status.forEach(([k, v, tone], i) => {
          const col = i % 2, row = Math.floor(i / 2);
          const x = CX + col * (tw + gap), yy = y + row * (th + gap);
          if (tileFill) box(x, yy, tw, th, R(22), tileFill);
          if (T.tileLine) stroke(x, yy, tw, th, R(22), T.tileLine, 2);
          text(k, x + 28, yy + 42, F('500', 26), C.sub);
          if (draw) { ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(x + 38, yy + 80, 10, 0, Math.PI * 2); ctx.fill(); }
          text(fit(v, tw - 90, F('bold', 32)), x + 60, yy + 92, F('bold', 32), C.text);
        });
        y += Math.ceil(status.length / 2) * (th + gap) - gap;
        }
      }
      // ── 미용사 한마디
      if (memo) {
        y += 80; y = heading('미용사 한마디', y);
        const lines = wrap(memo, CW - 100, F('500', 32));
        const sig = record.groomer ? '— 담당 ' + record.groomer : '— ' + shopName;
        const bh = 54 + lines.length * 50 + 60;
        const ruleish = T.heading === 'rule' || T.heading === 'rule-accent';
        if (ruleish) { if (draw) { ctx.fillStyle = accent; ctx.fillRect(CX, y, 6, bh); } }
        else box(CX, y, CW, bh, R(28), T.chip === 'dark' ? '#F4F5F7' : tint(0.08));
        if (!ruleish) text('“', CX + 26, y + 72, F('bold', 80), T.chip === 'dark' ? accent : tint(0.35));
        let ly = y + 70;
        lines.forEach(l => { text(l, CX + 70, ly, F('500', 32), C.text); ly += 50; });
        text(sig, CX + CW - 36, ly + 14, F('500', 26), C.sub, 'right');
        y += bh;
      }
      // ── 집에서 관리법
      if (tips.length) {
        y += 80; y = heading('집에서 이렇게 돌봐 주세요', y); y += 6;
        tips.forEach((t, i) => {
          const lines = wrap(t, CW - 80, F('400', 30));
          if (draw) { ctx.fillStyle = T.chip === 'dark' ? C.dark : tint(0.14); ctx.beginPath(); ctx.arc(CX + 22, y + 20, 22, 0, Math.PI * 2); ctx.fill(); }
          text(String(i + 1), CX + 22, y + 30, F('bold', 26), T.chip === 'dark' ? '#fff' : accent, 'center');
          lines.forEach((l, j) => text(l, CX + 72, y + 31 + j * 44, F('400', 30), C.text));
          y += Math.max(1, lines.length) * 44 + 20;
        });
        y -= 20;
      }
      // ── 다음 미용 추천
      if (record.nextVisitDate) {
        y += 76;
        const th = 168;
        const soft = T.ticket === 'soft';
        const filled = T.ticket !== 'line' && !soft;
        const fill = T.ticket === 'dark' ? C.dark : accent;
        if (soft) { box(CX, y, CW, th, R(30), tint(0.10)); if (draw) { ctx.fillStyle = accent; ctx.fillRect(CX, y + 30, 8, th - 60); } }
        else if (filled) box(CX, y, CW, th, R(30), fill); else stroke(CX, y, CW, th, R(30), accent, 3);
        if (draw && T.ticket === 'fill') {
          ctx.fillStyle = T.card ? '#FFFFFF' : (bgColor || '#fff');
          ctx.beginPath(); ctx.arc(CX, y + th / 2, 18, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(CX + CW, y + th / 2, 18, 0, Math.PI * 2); ctx.fill();
        }
        const fg = filled ? '#fff' : C.text;
        text('다음 미용 추천일', CX + 48, y + 62, F('500', 28), filled ? 'rgba(255,255,255,0.8)' : C.sub);
        text(kDate(record.nextVisitDate, false), CX + 48, y + 124, F('800', 48), T.ticket === 'dark' ? '#fff' : (filled ? fg : accent));
        if (daysToNext && daysToNext > 0) {
          const s = daysToNext % 7 === 0 ? `${daysToNext / 7}주 뒤` : `${daysToNext}일 뒤`;
          setFont(F('bold', 28));
          const w = ctx.measureText(s).width + 44;
          box(CX + CW - 44 - w, y + th / 2 - 28, w, 56, 28, filled ? (T.ticket === 'dark' ? accent : 'rgba(255,255,255,0.2)') : (soft ? accent : tint(0.12)));
          text(s, CX + CW - 44 - w / 2, y + th / 2 + 10, F('bold', 28), filled || soft ? '#fff' : accent, 'center');
        }
        y += th;
      }
      // ── 가게 정보
      y += 70;
      if (draw) { ctx.fillStyle = T.tileLine || C.line; ctx.fillRect(CX, y, CW, 2); }
      y += 64;
      text(shopName, ax, y, F('bold', 32), T.heading === 'rule-accent' ? accent : C.text, aa); y += 44;
      if (shopPhone) { text(shopPhone, ax, y, F('500', 28), C.sub, aa); y += 40; }
      if (reviewLink) { y += 6; text('리뷰 남겨주시면 큰 힘이 돼요 ♡', ax, y, F('500', 26), accent, aa); y += 36; }
      y += 34;
      return { cardH: y - cardTop, H: y + M + (T.card ? 10 : 20) };
    };
    const m = run(false, 0);
    canvas.height = m.H;
    ctx = canvas.getContext('2d');
    run(true, m.cardH);
    return canvas;
  },

  async showReport(recordId) {
    const record = await DB.get('records', recordId);
    if (!record) { App.showToast('기록을 찾을 수 없습니다.', 'error'); return; }
    const [pet, customer, shopName, shopPhone, logo, reviewLink, ds, reportTheme] = await Promise.all([
      record.petId ? DB.get('pets', record.petId) : null,
      record.customerId ? DB.get('customers', record.customerId) : null,
      DB.getSetting('shopName'), DB.getSetting('shopPhone'), DB.getSetting('shopLogo'), DB.getSetting('shopReviewLink'), DB.getSetting('cardTemplateSettings'), DB.getSetting('reportTheme')
    ]);
    App.showToast('리포트를 만드는 중...', 'info', { duration: 1500 });
    let canvas;
    try {
      canvas = await this.buildReportCanvas(record, { pet, shopName: shopName || '펫살롱', shopPhone: shopPhone || '', logo, reviewLink: reviewLink || '', accent: ds?.mainColor || '#6366F1', theme: reportTheme || 'clean' });
    } catch (err) { console.error('리포트 생성 실패:', err); App.showToast('리포트를 만들지 못했습니다.', 'error'); return; }
    canvas.toBlob(async (blob) => {
      canvas.width = canvas.height = 0; // 다 쓴 리포트 캔버스 메모리 반환 (iOS)
      if (!blob) { App.showToast('리포트를 만들지 못했습니다.', 'error'); return; }
      const url = URL.createObjectURL(blob);
      const fileName = (pet?.name ? pet.name + '_' : '') + '미용리포트_' + record.date + '.jpg';
      const file = new File([blob], fileName, { type: 'image/jpeg' });
      const customerPhone = (customer?.phone || '').replace(/\D/g, '');
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
      const canShareFile = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
      const msg = () => App.buildSms('reportSend', { '고객명': customer?.name || '', '반려견명': pet?.name || '', '다음방문일': record.nextVisitDate ? App.formatDate(record.nextVisitDate) : '' });
      const download = (href, name) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
      // Safari 는 누른 뒤 await 가 끼면 공유·복사를 막는다(NotAllowedError) — 보낼 문구·글자 리포트를 미리 만들어 둔다
      let msgText = null, reportText = null;
      msg().then(t => { msgText = t; }).catch(() => { msgText = ''; });
      App.buildGroomingReport(record).then(t => { reportText = t; }).catch(() => {});
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
              <!-- 영수증은 스크롤 아래에 숨어 있었다 — 저장·복사 옆에 같은 보조 버튼으로 -->
              <div class="card-done-row card-done-row-3">
                <button class="btn btn-secondary" id="report-download">${App.icon('download')} 저장</button>
                <button class="btn btn-secondary" id="report-copy">${App.icon('copy')} 글자로 복사</button>
                <button type="button" class="btn btn-secondary" id="report-receipt">${App.icon('receipt')} 영수증</button>
              </div>
              ${customerPhone ? `<button class="btn btn-ghost" id="report-sms">${App.icon('message')} ${App.escapeHtml(App.getCustomerLabel(customer))} 번호로 문자 열기</button>` : ''}
              <!-- 다음 예약: 저장 직후 창이 없어져서 여기서 연다 (다음 미용 추천일로) -->
              ${record.customerId ? `<button class="btn btn-ghost" id="report-next-appt">${App.icon('calendar')} 다음 예약 등록${record.nextVisitDate ? ' (' + App.formatDate(record.nextVisitDate) + ')' : ''}</button>` : ''}
              <p class="card-done-hint">${isIOS ? '카톡으로 보내려면 <b>보호자에게 보내기 → 카카오톡</b>을 고르세요. 리포트는 앱에 저장되지 않아요.' : '보내기에서 카카오톡을 고르면 리포트 이미지가 바로 첨부돼요. 리포트는 앱에 저장되지 않아요.'}</p>
            </div>
          </div>
        `
      });
      document.getElementById('report-share')?.addEventListener('click', async () => {
        const text = msgText ?? await msg();
        if (canShareFile) {
          navigator.share({ files: [file], text, title: (pet?.name || '') + ' 미용 리포트' }).catch(err => {
            if (err && err.name === 'AbortError') return; // 사용자가 닫음
            download(url, fileName);
            App.showToast('공유를 열지 못해 리포트를 저장했어요. 카톡·문자에 첨부해 보내세요.', 'info', { duration: 5000 });
          });
          return;
        }
        download(url, fileName);
        try { await navigator.clipboard.writeText(text); App.showToast('리포트를 저장하고 보낼 문구를 복사했어요. 카톡·문자에 붙여넣기 하세요.'); }
        catch (_) { App.showToast('리포트를 저장했어요. 카톡·문자에 첨부해 보내세요.'); }
      });
      document.getElementById('report-download')?.addEventListener('click', () => { download(url, fileName); App.showToast('리포트를 저장했어요.'); });
      document.getElementById('report-receipt')?.addEventListener('click', () => {
        App.closeModal();
        setTimeout(() => this.showReceipt(record.id), 200); // 닫힘(뒤로가기 정리)이 끝난 뒤 연다
      });
      document.getElementById('report-next-appt')?.addEventListener('click', () => {
        App.closeModal();
        setTimeout(() => App.pages.appointments.showForm(null, record.customerId, { petId: record.petId, date: record.nextVisitDate || undefined, groomer: record.groomer || '' }), 200);
      });
      document.getElementById('report-copy')?.addEventListener('click', async () => {
        const t = reportText ?? await App.buildGroomingReport(record);
        try { await navigator.clipboard.writeText(t); App.showToast('글자 리포트를 복사했어요. 카톡에 붙여넣기 하세요.'); }
        catch (_) { App.showToast('복사에 실패했습니다.', 'error'); }
      });
      document.getElementById('report-sms')?.addEventListener('click', async () => {
        if (!isIOS) download(url, fileName);
        App.openSms(customerPhone, msgText ?? await msg());
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
          <div style="color:var(--text-muted);text-align:center;font-size:0.93rem">기간을 선택하면 미리보기가 표시됩니다</div>
        </div>

        <div style="text-align:center">
          <div id="export-filename" style="font-size:0.93rem;color:var(--text-muted);margin-bottom:10px;line-height:1.5"></div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-success" id="btn-do-csv-download" style="width:100%;padding:14px;font-size:1rem;font-weight:700" disabled>
              ${App.icon('download')} CSV 다운로드 <span style="font-size:0.93rem;font-weight:500;opacity:0.85">(엑셀·세무용)</span>
            </button>
            <button class="btn btn-primary" id="btn-do-json-download" style="width:100%;padding:14px;font-size:1rem;font-weight:700" disabled>
              ${App.icon('download')} JSON 다운로드 <span style="font-size:0.93rem;font-weight:500;opacity:0.85">(Python 스크립트용)</span>
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
        preview.innerHTML = '<div style="color:var(--danger);text-align:center;font-size:0.93rem">올바른 기간을 선택해주세요</div>';
        setBtnsDisabled(true);
        return;
      }

      preview.innerHTML = '<div style="color:var(--text-muted);text-align:center;font-size:0.93rem">집계 중...</div>';

      // 인덱스 쿼리로 기간 내 records만 로드 (장기 누적 시 필수)
      const filtered = await DB.getByDateRange('records', 'date', start, end);
      // 정액권 충전·환불·노쇼 예약금 (매출과 따로 내보낸다)
      const ppRows = this._prepaidExportRows(await Prepaid.getAllEntries(), {}, start, end);
      const ppCount = (k) => ppRows.filter(p => p.kind === k).length;
      const ppLine = ppRows.length ? `<div style="margin-top:8px;font-size:0.93rem;color:var(--text-muted)">정액권 충전 ${ppCount('정액권 충전')}건 · 환불 ${ppCount('정액권 환불')}건 · 노쇼 예약금 ${ppCount('노쇼 예약금')}건 (매출과 따로 표시)</div>` : '';
      // 데이터 없으면 명확한 안내
      if (filtered.length === 0 && ppRows.length === 0) {
        preview.innerHTML = `
          <div style="padding:20px;text-align:center;background:var(--bg);border-radius:var(--radius);border:1px dashed var(--border)">
            <div style="font-size:1.6rem;margin-bottom:6px">${App.icon('file')}</div>
            <div style="font-weight:700;font-size:0.95rem;margin-bottom:4px">해당 기간 기록이 없습니다</div>
            <div style="font-size:0.93rem;color:var(--text-muted);line-height:1.5">기간을 변경하거나, 미용 기록이 쌓이면<br>다운로드 가능합니다</div>
          </div>
        `;
        if (filenameEl) filenameEl.textContent = '';
        setBtnsDisabled(true);
        return;
      }
      const total = filtered.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      const breakdown = { cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, transfer: { count: 0, amount: 0 }, unpaid: { count: 0, amount: 0 }, prepaid: { count: 0, amount: 0 } };
      filtered.forEach(r => {
        const sp = Prepaid.splitOf(r);
        if (sp.used > 0) { breakdown.prepaid.count++; breakdown.prepaid.amount += sp.used; }
        const m = r.paymentMethod || '';
        if (breakdown[m] && m !== 'prepaid' && (sp.used === 0 || sp.rest > 0)) {
          breakdown[m].count++;
          breakdown[m].amount += sp.used > 0 ? sp.rest : App.getRecordAmount(r);
        }
      });

      const row = (label, amount, count) =>
        `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-secondary)">${label}</span>
          <span style="font-weight:600">${App.formatCurrency(amount)} <span style="color:var(--text-muted);font-weight:400;font-size:0.93rem">(${count}건)</span></span>
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
          ${row('계좌이체', breakdown.transfer.amount, breakdown.transfer.count)}
          ${breakdown.prepaid.count > 0 ? row('정액권 사용', breakdown.prepaid.amount, breakdown.prepaid.count) : ''}
          <div style="display:flex;justify-content:space-between;padding:6px 0">
            <span style="color:${breakdown.unpaid.count > 0 ? 'var(--danger)' : 'var(--text-secondary)'}">미결제</span>
            <span style="font-weight:600;color:${breakdown.unpaid.count > 0 ? 'var(--danger)' : 'inherit'}">${App.formatCurrency(breakdown.unpaid.amount)} <span style="color:var(--text-muted);font-weight:400;font-size:0.93rem">(${breakdown.unpaid.count}건)</span></span>
          </div>
          ${ppLine}
        </div>
      `;

      const shopName = await DB.getSetting('shopName') || '펫살롱';
      const fnameBase = `${shopName}_매출내역_${start}_${end}`;
      if (filenameEl) filenameEl.innerHTML = `<div>CSV: ${fnameBase}.csv</div><div>JSON: ${fnameBase}.json</div>`;
      setBtnsDisabled(filtered.length === 0 && ppRows.length === 0);
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

  // 세무 장부 구분 (장부 구분: 사료/용품 판매 · 미용(그루밍) · 호텔/위탁 · 분양 · 목욕 · 기타매출).
  // courses = [{ name, category }] — 주 서비스(합친 코스면 코스마다). 이름에 '목욕'이 있고 미용 코스(목욕이 아닌 grooming)가 없으면 '목욕',
  // 그 밖(미용 코스·추가 옵션·단독 케어)은 모두 '미용(그루밍)'
  _taxCategoryLabel(courses) {
    const list = (courses || []).filter(c => c && c.name);
    const hasBath = list.some(c => String(c.name).includes('목욕'));
    const hasGrooming = list.some(c => (c.category || 'grooming') === 'grooming' && !String(c.name).includes('목욕'));
    return hasBath && !hasGrooming ? '목욕' : '미용(그루밍)';
  },

  // 정액권 장부 중 돈이 오간 줄 → 내보내기 행 (매출과 따로). 사용(use)은 미용 기록 매출 안에 이미 있어 넣지 않는다.
  //  - 충전(charge): 받은 돈(amount, 보너스 제외) · 결제 방법 method
  //  - 환불(refund): 돌려준 돈(amount, 양수) · 돌려준 방법 method
  //  - 노쇼 예약금: 조정(adjust) 중 잔액을 줄이고(credit<0) 메모에 '노쇼'가 있는 줄 — 금액은 줄인 잔액,
  //    결제 방법은 그 손님이 그날까지 마지막으로 충전한 방법 ('예약금' 메모 충전 우선)
  //  start~end(포함) 날짜 순. 현금영수증 정보는 장부에 없어서 null
  _prepaidExportRows(entries, customerMap, start, end) {
    const label = (m) => ({ cash: '현금', card: '카드', transfer: '계좌이체' })[m] || '';
    const all = entries || [];
    const depositMethod = (e) => {
      const charges = all.filter(c => c.type === 'charge' && Number(c.customerId) === Number(e.customerId) && (c.date || '') <= (e.date || ''))
        .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (Number(b.id) || 0) - (Number(a.id) || 0));
      const c = charges.find(x => String(x.memo || '').includes('예약금')) || charges[0];
      return c ? c.method : '';
    };
    const rows = [];
    all.filter(e => e && e.date && e.date >= start && e.date <= end).forEach(e => {
      let kind = null, amount = 0, method = '';
      if (e.type === 'charge') { kind = '정액권 충전'; amount = Number(e.amount) || 0; method = e.method; }
      else if (e.type === 'refund') { kind = '정액권 환불'; amount = Math.abs(Number(e.amount) || 0); method = e.method; }
      else if (e.type === 'adjust' && (Number(e.credit) || 0) < 0 && String(e.memo || '').includes('노쇼')) {
        kind = '노쇼 예약금'; amount = -(Number(e.credit) || 0); method = depositMethod(e);
      }
      if (!kind || !amount) return;
      rows.push({
        txId: 'P-' + e.id, date: e.date, kind,
        customerName: App.getCustomerLabel((customerMap || {})[e.customerId]) || '',
        paymentLabel: label(method), amount, cashReceiptYn: null, memo: e.memo || ''
      });
    });
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.txId.localeCompare(b.txId, undefined, { numeric: true }));
  },

  // ========== Export 공통 데이터 빌더 ==========
  async _buildExportData(start, end) {
    const [records, customers, pets, services, prepaidAll] = await Promise.all([
      DB.getByDateRange('records', 'date', start, end),
      DB.getAll('customers'),
      DB.getAll('pets'),
      DB.getAll('services'),
      Prepaid.getAllEntries()
    ]);

    const customerMap = {}; customers.forEach(c => { customerMap[c.id] = c; });
    const petMap = {}; pets.forEach(p => { petMap[p.id] = p; });

    // 장부 구분 — 주 서비스(합친 코스면 코스마다)의 이름·분류로
    const svcById = {}; services.forEach(s => { svcById[s.id] = s; });
    const svcByName = (nm) => services.find(s => App.normalizeServiceName(s.name) === App.normalizeServiceName(nm));
    const taxLabelOf = (r, category) => {
      const courses = Array.isArray(r.courses) && r.courses.length
        ? r.courses.map(c => ({ name: c.name, category: (svcById[c.serviceId] || svcByName(c.name) || {}).category || 'grooming' }))
        : [{ name: r.service || (r.serviceNames || [])[0] || '', category }];
      return this._taxCategoryLabel(courses);
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
      const paymentLabel0 = { cash: '현금', card: '카드', transfer: '계좌이체', unpaid: '미결제', prepaid: '정액권' }[r.paymentMethod] || '';
      // 정액권(선불)은 충전 때가 아니라 미용한 날 매출로 잡는다 — 결제수단 칸에 정액권 몫을 적는다
      const pUsed = Number(r.prepaidUsed) || 0;
      const paymentLabel = pUsed > 0 && r.paymentMethod !== 'prepaid' ? `정액권 ${pUsed}+${paymentLabel0}` : paymentLabel0;
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
        categoryLabel: taxLabelOf(r, category),
        customerName: App.getCustomerLabel(customer) || '',
        petName: pet?.name || '',
        serviceName: r.service || '',
        addons: r.addons || [],
        style: r.style || '',
        groomer: r.groomer || '',
        paymentMethod: r.paymentMethod || '',
        paymentLabel,
        prepaidUsed: pUsed,
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

    const prepaidEntries = this._prepaidExportRows(prepaidAll, customerMap, start, end);

    return {
      meta: { shopName, period: { start, end }, exportedAt: new Date().toISOString(), totalRecords: enriched.length, totalAmount },
      records: enriched,
      prepaidEntries
    };
  },

  // ========== CSV 내보내기 (Python 친화 — 헤더 1줄 + 데이터 행만) ==========
  async downloadCSV(start, end) {
    try {
      const data = await this._buildExportData(start, end);
      if (!data.records.length && !data.prepaidEntries.length) {
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
      // 0 으로 시작하는 번호(휴대폰·현금영수증)는 엑셀이 숫자로 바꿔 앞 0 을 지운다 — ="010..." 꼴로 글자로 남긴다 (csvEsc 가 따옴표 처리)
      const keepText = (val) => {
        const s = String(val == null ? '' : val).trim();
        return /^0[\d-]+$/.test(s) ? '="' + s + '"' : val;
      };

      const lines = [];
      // 헤더 1줄 — 엑셀 기준 (현금영수증 번호는 ="010…" 로 감싸 앞자리 0 유지 — 다른 프로그램에선 그대로 문자열로 보임)
      lines.push([
        '거래번호', '날짜', '구분', '고객명', '펫이름', '결제수단', '공급가액',
        '현금영수증', '현금영수증번호', '서비스명', '미용사', '메모', '기록번호'
      ].join(','));

      data.records.forEach(r => {
        lines.push([
          r.txId, r.date, r.categoryLabel, r.customerName, r.petName,
          r.paymentLabel, r.amount,
          r.cashReceiptYn, keepText(r.cashReceiptNo),
          r.serviceName, r.groomer, r.memo, r.id
        ].map(csvEsc).join(','));
      });
      // 정액권 충전·환불·노쇼 예약금 — 매출 행 뒤에 따로 (거래번호 P-…, 기록번호 빈칸)
      data.prepaidEntries.forEach(p => {
        lines.push([
          p.txId, p.date, p.kind, p.customerName, '',
          p.paymentLabel, p.amount,
          p.cashReceiptYn == null ? '' : (p.cashReceiptYn ? 'Y' : 'N'), '',
          '', '', p.memo, ''
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

      App.showToast(`CSV 다운로드 완료 (${data.records.length}건${data.prepaidEntries.length ? ` + 정액권 ${data.prepaidEntries.length}건` : ''})`, 'info');
    } catch (err) {
      console.error('CSV export error:', err);
      App.showToast('CSV 내보내기 중 오류가 발생했습니다.', 'error');
    }
  },

  // ========== JSON 내보내기 (Python 스크립트용 — 풍부한 필드) ==========
  async downloadJSON(start, end) {
    try {
      const data = await this._buildExportData(start, end);
      if (!data.records.length && !data.prepaidEntries.length) {
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
          prepaidUsed: r.prepaidUsed,
          amount: r.amount,
          cashReceiptYn: r.cashReceiptYn === 'Y',
          cashReceiptNo: r.cashReceiptNo,
          memo: r.memoRaw,
          memoCombined: r.memo,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        })),
        // 정액권 충전·환불·노쇼 예약금 (매출과 따로) — { txId, date, kind, customerName, paymentLabel, amount, cashReceiptYn, memo }
        prepaidEntries: data.prepaidEntries
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

      App.showToast(`JSON 다운로드 완료 (${data.records.length}건${data.prepaidEntries.length ? ` + 정액권 ${data.prepaidEntries.length}건` : ''})`, 'info');
    } catch (err) {
      console.error('JSON export error:', err);
      App.showToast('JSON 내보내기 중 오류가 발생했습니다.', 'error');
    }
  },
};
