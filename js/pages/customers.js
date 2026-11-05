// ========== Customers Page ==========
App.pages.customers = {
  async render(container, params) {
    if (params && params[0]) {
      await this.renderDetail(container, Number(params[0]));
      return;
    }
    await this.renderList(container);
  },

  async renderList(container) {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    // 효율적 쿼리: 목록에서는 사진 등 큰 필드 제외
    const customers = await DB.getAll('customers');
    const pets = await DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle']);
    // 기록 전체를 읽지 않는다 — 반려견에 비정규화된 lastVisitDate / visitCount 를 합산한다
    // (10년치 기록이 쌓여도 목록은 고객·반려견 수에만 비례)

    // Pet count per customer
    const petCount = {};
    pets.forEach(p => { petCount[p.customerId] = (petCount[p.customerId] || 0) + 1; });

    // Last visit / visit count per customer (from pets)
    const lastVisit = {};
    const visitCount = {};
    pets.forEach(p => {
      if (p.lastVisitDate && (!lastVisit[p.customerId] || p.lastVisitDate > lastVisit[p.customerId])) lastVisit[p.customerId] = p.lastVisitDate;
      visitCount[p.customerId] = (visitCount[p.customerId] || 0) + (Number(p.visitCount) || 0);
    });

    // 고객별 방문 상태 계산 (반려견 중 가장 좋은 상태 기준) — 대시보드/분석과 같은 헬퍼 사용
    const revisitDays = await App.getRevisitDays();
    const petsByCustomer = {};
    pets.forEach(p => { (petsByCustomer[p.customerId] = petsByCustomer[p.customerId] || []).push(p); });
    const customerVisitStatus = {};
    customers.forEach(c => {
      customerVisitStatus[c.id] = App.getCustomerVisitStatus(petsByCustomer[c.id], revisitDays, lastVisit[c.id]);
    });
    // _renderCustomerRow/_renderCustomerCard가 이 값을 읽으므로
    // container.innerHTML 대입(=템플릿 평가)보다 반드시 먼저 대입해야 한다.
    this._customerVisitStatus = customerVisitStatus;
    // 정액권 잔액 (장부가 비어 있으면 빈 객체 — 배지 없음)
    this._prepaidBal = Prepaid.balanceMap(await Prepaid.getAllEntries());

    // Restore sort/filter from sessionStorage (render 시점에 selected 적용용)
    if (!this._sortKey || this._tagFilter === undefined || this._visitFilter === undefined) {
      try {
        const sf = sessionStorage.getItem('customer-filter');
        if (sf) {
          const f = JSON.parse(sf);
          if (f.sort && !this._sortKey) this._sortKey = f.sort;
          if (f.tag && !this._tagFilter) this._tagFilter = f.tag;
          if (f.visitStatus && !this._visitFilter) this._visitFilter = f.visitStatus;
        }
      } catch (e) { /* ignore */ }
    }
    const curVisit = this._visitFilter || '';
    const curTag = this._tagFilter || '';

    // 정렬 기준 적용
    const sortKey = this._sortKey || 'name';
    let sorted;
    if (sortKey === 'lastVisit') {
      sorted = customers.sort((a, b) => (lastVisit[b.id] || '').localeCompare(lastVisit[a.id] || ''));
    } else if (sortKey === 'createdAt') {
      sorted = customers.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    } else if (sortKey === 'visitCount') {
      sorted = customers.sort((a, b) => (visitCount[b.id] || 0) - (visitCount[a.id] || 0));
    } else if (sortKey === 'status') {
      const sp = { 'at-risk': 0, 'remind': 1, 'normal': 2, 'new': 3, 'churned': 4 };
      sorted = customers.sort((a, b) => (sp[customerVisitStatus[a.id]] ?? 2) - (sp[customerVisitStatus[b.id]] ?? 2));
    } else {
      sorted = customers.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">고객 관리</h1>
          <p class="page-subtitle" id="customer-total-label" data-total="${customers.length}">총 ${customers.length}명의 고객</p>
        </div>
        <div class="page-actions">
          <a href="#pets" class="btn btn-secondary">${App.icon('paw')} 반려견 목록</a>
          <button class="btn btn-primary" id="btn-add-customer">+ 새 고객(반려견)</button>
        </div>
      </div>
      <div class="filter-bar">
        <div class="search-box" style="max-width:none;position:relative">
          <span class="search-icon">${App.icon('search')}</span>
          <input type="text" id="customer-search" placeholder="고객·반려견 이름, 전화번호, 메모" style="width:100%;min-height:44px;padding-right:60px">
          <span id="customer-search-count" style="display:none;position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:0.78rem;color:var(--text-muted);font-weight:700;pointer-events:none"></span>
        </div>
        <div class="filter-bar-row">
          <select id="customer-visit-filter" style="flex:1;min-height:44px;font-size:max(16px,0.88rem)">
            <option value="" ${curVisit === '' ? 'selected' : ''}>방문 상태</option>
            <option value="normal" ${curVisit === 'normal' ? 'selected' : ''}>정상</option>
            <option value="remind" ${curVisit === 'remind' ? 'selected' : ''}>올 때 됨</option>
            <option value="at-risk" ${curVisit === 'at-risk' ? 'selected' : ''}>많이 늦음</option>
            <option value="churned" ${curVisit === 'churned' ? 'selected' : ''}>오래 안 옴</option>
            <option value="new" ${curVisit === 'new' ? 'selected' : ''}>방문 전</option>
          </select>
          <select id="customer-tag-filter" style="flex:1;min-height:44px;font-size:max(16px,0.88rem)">
            <option value="" ${curTag === '' ? 'selected' : ''}>전체 분류</option>
            <option value="vip" ${curTag === 'vip' ? 'selected' : ''}>VIP</option>
            <option value="new" ${curTag === 'new' ? 'selected' : ''}>신규</option>
            <option value="normal" ${curTag === 'normal' ? 'selected' : ''}>일반</option>
            <option value="regular" ${curTag === 'regular' ? 'selected' : ''}>단골</option>
            <option value="caution" ${curTag === 'caution' ? 'selected' : ''}>주의</option>
          </select>
          <select id="customer-sort" style="flex:1;min-height:44px;font-size:max(16px,0.88rem)">
            <option value="name" ${sortKey === 'name' ? 'selected' : ''}>이름순</option>
            <option value="status" ${sortKey === 'status' ? 'selected' : ''}>상태별</option>
            <option value="lastVisit" ${sortKey === 'lastVisit' ? 'selected' : ''}>최근방문순</option>
            <option value="createdAt" ${sortKey === 'createdAt' ? 'selected' : ''}>등록일순</option>
            <option value="visitCount" ${sortKey === 'visitCount' ? 'selected' : ''}>방문횟수순</option>
          </select>
        </div>
      </div>
      <div class="card">
        <div class="card-body no-padding">
          ${isMobile ? '' : `<div class="table-container">
            <table class="data-table" id="customer-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>연락처</th>
                  <th>반려견</th>
                  <th>최근 방문</th>
                  <th>등록일</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                ${sorted.length === 0 ? `
                  <tr><td colspan="6">
                    <div class="empty-state">
                      <div class="empty-state-icon">${App.icon('user', 'ico-xl')}</div>
                      <div class="empty-state-text">등록된 고객이 없습니다</div>
                      <button class="btn btn-primary" onclick="document.getElementById('btn-add-customer').click()">첫 고객 등록하기</button>
                    </div>
                  </td></tr>
                ` : sorted.map(c => this._renderCustomerRow(c, petCount, lastVisit, petsByCustomer)).join('')}
              </tbody>
            </table>
          </div>`}

          ${!isMobile ? '' : `<div class="mobile-card-list" id="customer-card-list" style="display:block;padding:8px">
            ${sorted.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">${App.icon('user', 'ico-xl')}</div>
                <div class="empty-state-text">등록된 고객이 없습니다</div>
                <button class="btn btn-primary" onclick="document.getElementById('btn-add-customer').click()">첫 고객 등록하기</button>
              </div>
            ` : (sortKey === 'status' ? (() => {
              const groups = { 'at-risk': [], 'remind': [], 'normal': [], 'new': [], 'churned': [] };
              sorted.forEach(c => {
                const s = customerVisitStatus[c.id] || 'normal';
                (groups[s] || groups['normal']).push(c);
              });
              const groupMeta = {
                'at-risk': { label: '많이 늦음', color: 'var(--danger)' },
                'remind': { label: '올 때 됨', color: 'var(--warning)' },
                'normal': { label: '정상', color: 'var(--success)' },
                'new': { label: '방문 전', color: 'var(--info)' },
                'churned': { label: '오래 안 옴', color: 'var(--text-muted)' }
              };
              return Object.entries(groups).filter(([, gp]) => gp.length > 0).map(([gs, gp]) => {
                const meta = groupMeta[gs];
                return `<div style="margin:14px 2px 8px;display:flex;align-items:center;gap:8px">
                  <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${meta.color};flex-shrink:0"></span>
                  <span style="font-size:0.88rem;font-weight:800;color:var(--text-primary)">${meta.label}</span>
                  <span style="font-size:0.78rem;color:var(--text-muted)">${gp.length}명</span>
                </div>` + gp.map(c => this._renderCustomerCard(c, petCount, lastVisit, petsByCustomer)).join('');
              }).join('');
            })() : sorted.map(c => this._renderCustomerCard(c, petCount, lastVisit, petsByCustomer)).join(''))}
          </div>`}
          <!-- 검색·필터 결과 0건 안내 (applyFilters 가 켜고 끈다) -->
          <div class="empty-state" id="customer-filter-empty" style="display:none">
            <div class="empty-state-icon">${App.icon('search', 'ico-xl')}</div>
            <div class="empty-state-text">검색 결과가 없어요</div>
            <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;line-height:1.5">이름 일부나 전화번호 뒷자리로 다시 찾아보세요.<br>방문 상태·분류 필터가 켜져 있으면 풀어 보세요.</div>
          </div>
        </div>
      </div>
    `;
  },

  async renderDetail(container, customerId) {
    const customer = await DB.get('customers', customerId);
    if (!customer) {
      // 다른 기기에서 지웠거나 아직 동기화되지 않은 고객 — 막다른 화면이 되지 않게 돌아갈 길을 준다
      container.innerHTML = `<div class="back-link" onclick="history.length>1?history.back():App.navigate('customers')">${App.icon('arrow-left')} 뒤로가기</div>
        <div class="empty-state"><div class="empty-state-text">고객을 찾을 수 없습니다.<br><small style="color:var(--text-muted)">삭제되었거나 아직 다른 기기에서 받아오지 않았을 수 있습니다.</small></div>
        <button class="btn btn-primary" onclick="App.navigate('customers')">고객 목록으로</button></div>`;
      return;
    }

    const pets = await DB.getByIndex('pets', 'customerId', customerId);
    const records = (await DB.getByIndex('records', 'customerId', customerId)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const appointments = (await DB.getByIndex('appointments', 'customerId', customerId))
      .filter(a => a.status !== 'cancelled')
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const totalSpend = records.reduce((sum, r) => sum + App.getRecordAmount(r), 0);
    // 같은 날 여러 마리 미용은 방문 1번으로 센다
    const visitCount = new Set(records.map(r => r.date).filter(Boolean)).size;
    const unpaidRecords = records.filter(r => r.paymentMethod === 'unpaid');
    const unpaidBalance = unpaidRecords.reduce((sum, r) => sum + App.getUnpaidAmount(r), 0);
    const noshowCount = appointments.filter(a => a.status === 'noshow').length;
    // 정액권 — 내역이 있는 손님만 칸이 보인다 (없으면 맨 아래 작은 '정액권 충전' 링크만)
    const prepaidEntries = await Prepaid.listByCustomer(customerId);
    const prepaidBal = Prepaid.balanceOf(prepaidEntries);

    container.innerHTML = `
      <div class="detail-topbar">
        <div class="back-link" onclick="history.length>1?history.back():App.navigate('customers')">${App.icon('arrow-left')} 뒤로가기</div>
        <button class="btn btn-sm btn-secondary btn-edit-customer" data-id="${customer.id}">${App.icon('edit')} 정보 수정</button>
      </div>
      <!-- 컴퓨터(1100px+): 왼쪽 = 손님·반려견·정액권·메모, 오른쪽 = 예정 예약·미용 기록·통계. 폰·태블릿은 CSS order 로 예전 순서 그대로 -->
      <div class="cust-detail-layout">
      <div class="cust-detail-col cust-detail-col-main">
      <div class="detail-header">
        <div class="detail-avatar">${App.icon('user', 'ico-xl')}</div>
        <div class="detail-info">
          <h2>${App.escapeHtml(App.getCustomerLabel(customer, pets))}${this.getTagBadges(customer.tags)}</h2>
          <div class="detail-meta">
            <span>${App.formatPhoneHtml(customer.phone)}</span>
            <span>방문 ${visitCount}회</span>
            <span>총 ${App.formatCurrency(totalSpend)}</span>
            ${unpaidBalance > 0 ? `<span style="color:var(--danger);font-weight:700">미수금 ${App.formatCurrency(unpaidBalance)}</span>` : ''}
            ${noshowCount > 0 ? `<span style="color:var(--danger);font-weight:700">노쇼 ${noshowCount}회</span>` : ''}
            ${prepaidBal !== 0 ? `<span class="prepaid-meta">정액권 ${App.formatCurrency(prepaidBal)}</span>` : ''}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          ${App.phoneDigits(customer.phone) ? `<a class="btn btn-secondary" href="tel:${App.escapeHtml(App.phoneDigits(customer.phone))}" style="min-height:44px;flex:1 1 auto;text-decoration:none">${App.icon('phone')} 전화</a>` : ''}
          <button class="btn btn-success" id="btn-send-message" data-customer-id="${customer.id}" style="min-height:44px;flex:1 1 auto">메시지</button>
          <button class="btn btn-primary" id="btn-new-appt-for-customer" data-customer-id="${customer.id}" style="min-height:44px;flex:1 1 auto">+ 예약</button>
          <button class="btn btn-primary" id="btn-new-record-for-customer" data-customer-id="${customer.id}" style="min-height:44px;flex:1 1 auto">+ 미용 기록</button>
        </div>
      </div>

      ${(customer.address || customer.memo) ? `<div class="detail-section cust-detail-notes">
        ${customer.memo ? `<div><label>메모</label><span>${App.escapeHtml(customer.memo)}</span></div>` : ''}
        ${customer.address ? `<div><label>주소</label><span>${App.escapeHtml(customer.address)}</span></div>` : ''}
      </div>` : ''}

      <div class="detail-section cd-pets">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="detail-section-title" style="margin-bottom:0;border:none;padding:0">반려견 (${pets.length}마리)</h3>
          <button class="btn btn-sm btn-primary" id="btn-add-pet-for-customer" data-customer-id="${customer.id}">+ 반려견 등록</button>
        </div>
        <div class="grid-3">
          ${pets.length === 0 ? '<p style="color:var(--text-muted)">등록된 반려견이 없습니다.</p>' :
            pets.map(p => {
              const petNotes = [p.temperament, p.healthNotes, p.allergies].filter(Boolean);
              return `
              <div class="pet-card" onclick="App.navigate('pets/${p.id}')">
                ${(p.photoThumb || p.photo)
                  ? `<img src="${p.photoThumb || p.photo}" class="photo-viewable" data-caption="${App.escapeHtml(p.name)}" style="width:48px;height:48px;object-fit:cover;border-radius:var(--radius);flex-shrink:0" alt="${App.escapeHtml(p.name)}" onclick="event.stopPropagation()">`
                  : `<div class="pet-avatar">${App.icon('paw')}</div>`
                }
                <div>
                  <div class="pet-name">${App.escapeHtml(p.name)}</div>
                  <div class="pet-breed">${App.escapeHtml(p.breed || '견종 미입력')} | ${p.weight ? p.weight + 'kg' : '체중 미입력'}</div>
                  ${petNotes.length > 0 ? `<div style="font-size:0.78rem;color:var(--danger);margin-top:4px;line-height:1.3">${App.icon('alert', 'ico-sm')} ${petNotes.map(n => App.escapeHtml(n)).join(', ')}</div>` : ''}
                </div>
              </div>
            `}).join('')}
        </div>
      </div>

      ${prepaidEntries.length > 0 ? await this._prepaidSectionHtml(customer, prepaidEntries, prepaidBal, records) : ''}

      </div>
      <div class="cust-detail-col cust-detail-col-side">
      <div class="detail-section cd-upcoming">
        <h3 class="detail-section-title">예정된 예약</h3>
        ${(() => {
          const today = App.getToday();
          const petNameMap = {}; pets.forEach(p => { petNameMap[p.id] = p.name; });
          const upcoming = appointments
            .filter(a => (a.date || '') >= today && !['cancelled', 'completed', 'noshow'].includes(a.status))
            .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
          if (upcoming.length === 0) return '<p style="color:var(--text-muted)">예정된 예약 없음</p>';
          return upcoming.map(a => `
            <div class="cust-upcoming-appt" data-appt-id="${a.id}" style="display:flex;align-items:center;gap:10px;min-height:44px;padding:0 4px;border-bottom:1px solid var(--border-light);cursor:pointer">
              <strong style="font-size:0.9rem;white-space:nowrap">${App.formatDate(a.date)}${a.date === today ? ' (오늘)' : ''}</strong>
              <span style="font-size:0.9rem;color:var(--primary);font-weight:700;white-space:nowrap">${App.escapeHtml(a.time || '')}</span>
              <span style="font-size:0.85rem;color:var(--text-secondary);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${App.escapeHtml(petNameMap[a.petId] || '')}</span>
              <span style="color:var(--text-muted)">&#x203A;</span>
            </div>`).join('');
        })()}
      </div>

      <div class="detail-section cd-records">
        <h3 class="detail-section-title">최근 미용 기록</h3>
        ${await (async () => {
          if (records.length === 0) return '<p style="color:var(--text-muted)">미용 기록이 없습니다.</p>';
          // 이 고객의 반려견은 이미 로드되어 있다 — 전체 pets 스토어(사진 포함)를 다시 읽지 않는다
          const petMap = {}; pets.forEach(p => petMap[p.id] = p);
          const allServices = await DB.getAll('services');
          const serviceMap = {}; allServices.forEach(s => serviceMap[s.id] = s.name);
          // 폰, 그리고 컴퓨터 두 단(1100px+)의 오른쪽 단은 두 줄 목록 — 7칸 표는 좁은 단에서 가로로 잘린다. 표는 태블릿·작은 창(769~1099px)만
          const _isMobile = window.matchMedia('(max-width: 768px), (min-width: 1100px)').matches;
          if (_isMobile) {
            return records.slice(0, 10).map(r => {
              const pet = petMap[r.petId];
              const serviceNames = (r.serviceNames && r.serviceNames.length > 0) ? r.serviceNames.join(', ') : (r.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ') || '-';
              return `<div class="cust-rec-row${r.paymentMethod === 'unpaid' ? ' is-unpaid-card' : ''}" data-id="${r.id}" role="button" tabindex="0" style="padding:12px 0;border-bottom:1px solid var(--border-light);cursor:pointer${r.paymentMethod === 'unpaid' ? ';border-left:4px solid var(--danger);padding-left:12px' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <strong style="font-size:0.9rem">${App.formatDate(r.date)}</strong>
                  <strong style="color:var(--primary)">${App.formatCurrency(App.getRecordAmount(r))}</strong>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary);display:flex;align-items:center;gap:8px"><span class="flex-1">${App.escapeHtml(pet?.name || '-')} · ${App.escapeHtml(serviceNames)} · ${App.escapeHtml(r.groomer || '-')} · ${App.pages.records.getPaymentLabel(r.paymentMethod, r)}</span><button type="button" class="btn btn-sm btn-ghost cust-rec-report" data-id="${r.id}" style="flex-shrink:0">${App.icon('image')} 리포트</button></div>
              </div>`;
            }).join('') + (records.length > 10 ? '<div style="text-align:center;padding:12px;font-size:0.82rem;color:var(--text-muted)">최근 10건 표시</div>' : '');
          }
          return `
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>날짜</th><th>반려견</th><th>서비스</th><th>금액</th><th>담당</th><th>결제</th><th></th></tr></thead>
              <tbody>
                ${records.slice(0, 10).map(r => {
                  const pet = petMap[r.petId];
                  const serviceNames = (r.serviceNames && r.serviceNames.length > 0) ? r.serviceNames.join(', ') : (r.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ') || '-';
                  return `<tr class="cust-rec-row${r.paymentMethod === 'unpaid' ? ' is-unpaid' : ''}" data-id="${r.id}" style="cursor:pointer">
                    <td>${App.formatDate(r.date)}</td>
                    <td>${App.escapeHtml(pet?.name || '-')}</td>
                    <td>${App.escapeHtml(serviceNames)}</td>
                    <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></td>
                    <td>${App.escapeHtml(r.groomer || '-')}</td>
                    <td>${App.pages.records.getPaymentLabel(r.paymentMethod, r)}</td>
                    <td class="table-actions"><button type="button" class="btn-icon cust-rec-report" data-id="${r.id}" title="미용 리포트" aria-label="미용 리포트" style="color:var(--info)">${App.icon('image')}</button><button type="button" class="btn-icon cust-rec-edit" data-id="${r.id}" title="수정" aria-label="수정">${App.icon('edit')}</button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;
        })()}
      </div>

      ${visitCount > 0 ? (() => {
        const avgSpend = Math.round(totalSpend / visitCount);
        const firstVisit = records.length > 0 ? records[records.length - 1].date : null;
        const lastVisitDate = records.length > 0 ? records[0].date : null;
        let avgCycle = '-';
        if (new Set(records.map(r => r.date).filter(Boolean)).size >= 2) {
          // 같은 날 여러 마리 미용은 방문 1번으로 센다 (두 마리가 30일마다 오면 0·30·0일로 섞여 10일로 보이던 문제)
          const dates = [...new Set(records.map(r => r.date).filter(Boolean))].sort().map(d => App.parseLocalDate(d));
          let totalDays = 0;
          for (let i = 1; i < dates.length; i++) {
            totalDays += Math.round((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
          }
          avgCycle = Math.round(totalDays / (dates.length - 1)) + '일';
        }
        return `
      <div class="detail-section cd-stats">
        <h3 class="detail-section-title">방문 통계</h3>
        <div class="info-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
          <div class="info-item"><label>총 방문</label><span style="font-weight:700;font-size:1.1rem">${visitCount}회</span></div>
          <div class="info-item"><label>총 지출</label><span style="font-weight:700;font-size:1.1rem">${App.formatCurrency(totalSpend)}</span></div>
          <div class="info-item"><label>평균 지출</label><span style="font-weight:700;font-size:1.1rem">${App.formatCurrency(avgSpend)}</span></div>
          <div class="info-item"><label>평균 방문 주기</label><span style="font-weight:700;font-size:1.1rem">${avgCycle}</span></div>
          <div class="info-item"><label>첫 방문</label><span>${App.formatDate(firstVisit)}</span></div>
          <div class="info-item"><label>최근 방문</label><span>${App.formatDate(lastVisitDate)}</span></div>
        </div>
      </div>`;
      })() : ''}
      </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin:24px 0 8px">
        ${prepaidEntries.length === 0 ? `<button class="btn btn-ghost btn-prepaid-act" data-act="charge" data-customer-id="${customer.id}" style="min-height:44px;color:var(--text-muted);margin-right:auto">정액권 충전</button>` : ''}
        <button class="btn btn-ghost btn-delete-customer" data-id="${customer.id}" style="min-height:44px;color:var(--danger)">고객 삭제</button>
      </div>
    `;
  },

  _sortKey: 'name',

  async init(params) {
    // Add customer button
    document.getElementById('btn-add-customer')?.addEventListener('click', () => this.showForm());

    // 뷰포트 경계 변화 시 재렌더 (모바일↔데스크톱 전환, 한 번만 바인딩)
    if (!this._resizeBound) {
      this._resizeBound = true;
      let lastIsMobile = window.matchMedia('(max-width: 768px)').matches;
      const onResize = App.debounce(() => {
        const nowIsMobile = window.matchMedia('(max-width: 768px)').matches;
        if (nowIsMobile !== lastIsMobile) {
          lastIsMobile = nowIsMobile;
          if (location.hash.startsWith('#customers') && !location.hash.includes('/')) App.handleRoute();
        }
      }, 250);
      window.addEventListener('resize', onResize);
    }

    // Sort
    document.getElementById('customer-sort')?.addEventListener('change', (e) => {
      this._sortKey = e.target.value;
      sessionStorage.setItem('customer-filter', JSON.stringify({
        search: this._searchQuery || '',
        tag: this._tagFilter || '',
        visitStatus: this._visitFilter || '',
        sort: this._sortKey
      }));
      App.handleRoute();
    });

    // Tag filter
    document.getElementById('customer-tag-filter')?.addEventListener('change', (e) => {
      this._tagFilter = e.target.value;
      this.applyFilters();
    });

    // Visit status filter
    document.getElementById('customer-visit-filter')?.addEventListener('change', (e) => {
      this._visitFilter = e.target.value;
      this.applyFilters();
    });

    // Search
    const _debouncedFilter = App.debounce(() => this.applyFilters(), 300);
    document.getElementById('customer-search')?.addEventListener('input', (e) => {
      this._searchQuery = e.target.value;
      _debouncedFilter();
    });

    // Restore saved filter state
    const savedFilter = sessionStorage.getItem('customer-filter');
    if (savedFilter) {
      try {
        const f = JSON.parse(savedFilter);
        if (f.search) {
          document.getElementById('customer-search').value = f.search;
          this._searchQuery = f.search;
        }
        if (f.tag) {
          document.getElementById('customer-tag-filter').value = f.tag;
          this._tagFilter = f.tag;
        }
        if (f.visitStatus) {
          document.getElementById('customer-visit-filter').value = f.visitStatus;
          this._visitFilter = f.visitStatus;
        }
        if (f.search || f.tag || f.visitStatus) this.applyFilters();
      } catch (e) { /* ignore parse errors */ }
    }

    // Row click -> detail
    document.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.table-actions')) return;
        App.navigate('customers/' + row.dataset.id);
      });
    });

    // Edit buttons
    document.querySelectorAll('.btn-edit-customer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showForm(Number(btn.dataset.id));
      });
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete-customer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteCustomer(Number(btn.dataset.id));
      });
    });

    // Add pet for customer (detail view)
    document.getElementById('btn-add-pet-for-customer')?.addEventListener('click', (e) => {
      const customerId = Number(e.target.dataset.customerId);
      App.pages.pets.showForm(null, customerId);
    });

    // New appointment for customer (detail view)
    document.getElementById('btn-new-appt-for-customer')?.addEventListener('click', (e) => {
      const customerId = Number(e.target.dataset.customerId);
      App.pages.appointments.showForm(null, customerId);
    });

    // 워크인 미용 기록 (상세에서 바로) — 기록 탭 → 새 기록 → 검색 → 선택의 5탭을 1탭으로
    document.getElementById('btn-new-record-for-customer')?.addEventListener('click', async (e) => {
      const customerId = Number(e.target.dataset.customerId);
      const cPets = (await DB.getByIndex('pets', 'customerId', customerId)).filter(p => (p.petStatus || 'active') === 'active');
      App.pages.records.showForm(null, { customerId, petId: cPets.length === 1 ? cPets[0].id : null, date: App.getToday() });
    });

    // 예정된 예약 (detail view) → 예약 수정
    document.querySelectorAll('.cust-upcoming-appt').forEach(row => {
      row.addEventListener('click', () => App.pages.appointments.showForm(Number(row.dataset.apptId)));
    });
    // 최근 미용 기록 (detail view) → 줄을 누르면 수정, 리포트 버튼은 리포트 (예전엔 눌리지 않아 기록 화면으로 가야 했다)
    document.querySelectorAll('.cust-rec-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.cust-rec-report')) return;
        App.pages.records.showForm(Number(row.dataset.id));
      });
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); } });
    });
    document.querySelectorAll('.cust-rec-report').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); App.pages.records.showReport(Number(btn.dataset.id)); });
    });

    // 정액권 (detail view) — 충전·환불·조정 버튼, 내역 줄 누르면 수정(사용 줄은 그 미용 기록)
    document.querySelectorAll('.btn-prepaid-act').forEach(btn => {
      btn.addEventListener('click', () => this.showPrepaidForm(Number(btn.dataset.customerId), btn.dataset.act));
    });
    document.querySelectorAll('.prepaid-row').forEach(row => {
      const open = () => {
        if (row.dataset.recordId) App.pages.records.showForm(Number(row.dataset.recordId));
        else this.showPrepaidForm(Number(row.dataset.customerId), row.dataset.type, Number(row.dataset.id));
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    document.getElementById('btn-prepaid-more')?.addEventListener('click', (e) => {
      document.querySelectorAll('.prepaid-row.is-more').forEach(r => r.classList.remove('is-more'));
      e.currentTarget.remove();
    });

    // Send message (detail view)
    document.getElementById('btn-send-message')?.addEventListener('click', (e) => {
      const customerId = Number(e.target.dataset.customerId);
      this.showMessageModal(customerId);
    });
  },

  async showMessageModal(customerId) {
    const customer = await DB.get('customers', customerId);
    if (!customer) return;
    const pets = await DB.getByIndex('pets', 'customerId', customerId);
    const activePets = pets.filter(p => !p.petStatus || p.petStatus === 'active');
    const firstPet = activePets[0] || pets[0];

    const types = [
      { key: 'revisit', label: '재방문 안내' },
      { key: 'atRisk', label: '많이 늦은 손님 안내' },
      { key: 'churned', label: '오래 안 온 손님 안내' },
      { key: 'birthday', label: '생일 축하' },
      { key: 'complete', label: '미용 완료' },
      { key: 'appointment', label: '예약 확인' },
      { key: 'reminder', label: '예약 리마인더' }
    ];

    App.showModal({
      title: '메시지 보내기',
      content: `
        <div class="form-group">
          <label class="form-label">메시지 유형</label>
          <select id="msg-type">
            ${types.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}
          </select>
        </div>
        ${activePets.length > 1 ? `
        <div class="form-group">
          <label class="form-label">반려견 선택</label>
          <select id="msg-pet">
            ${activePets.map(p => `<option value="${p.id}">${App.escapeHtml(p.name)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="form-group">
          <label class="form-label">미리보기</label>
          <textarea id="msg-preview" rows="4" style="background:var(--bg);font-size:max(16px,0.9rem)"></textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-success flex-1" id="msg-sms">문자 보내기</button>
          <button class="btn btn-secondary flex-1" id="msg-copy">복사하기</button>
        </div>
      `,
      saveText: null
    });

    const previewEl = document.getElementById('msg-preview');
    const typeEl = document.getElementById('msg-type');
    const petEl = document.getElementById('msg-pet');

    const updatePreview = async () => {
      const selPetId = petEl ? Number(petEl.value) : firstPet?.id;
      const selPet = pets.find(p => p.id === selPetId) || firstPet;
      const days = selPet?.lastVisitDate ? App.getDaysAgo(selPet.lastVisitDate) : '';
      const msg = await App.buildSms(typeEl.value, {
        '고객명': customer.name || '',
        '반려견명': selPet?.name || '',
        '경과일수': String(days || ''),
        '마지막방문일': selPet?.lastVisitDate ? App.formatDate(selPet.lastVisitDate) : ''
      });
      previewEl.value = msg;
    };

    typeEl.addEventListener('change', updatePreview);
    petEl?.addEventListener('change', updatePreview);
    await updatePreview();

    document.getElementById('msg-sms')?.addEventListener('click', () => {
      const phone = (customer.phone || '').replace(/\D/g, '');
      if (!phone) { App.showToast('연락처가 없습니다.', 'error'); return; }
      App.openSms(phone, previewEl.value);
    });

    document.getElementById('msg-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(previewEl.value).then(() => {
        App.showToast('메시지가 복사되었습니다. 카톡에 붙여넣기 하세요.');
      }).catch(() => {
        App.showToast('복사에 실패했습니다.', 'error');
      });
    });
  },

  async showForm(id, afterSaveCallback, prefill) {
    let customer = id ? await DB.get('customers', id) : {};

    // afterSaveCallback 저장 (saveCustomer에서 사용)
    this._afterSaveCallback = afterSaveCallback || null;

    App.showModal({
      title: id ? '고객 정보 수정' : '새 고객(반려견) 등록',
      content: id ? `
        <div class="form-group">
          <label class="form-label">보호자 이름 <span style="font-size:0.85em;color:var(--text-muted);font-weight:normal">(선택)</span></label>
          <input type="text" id="f-name" value="${App.escapeHtml(customer.name || '')}" placeholder="고객 이름" maxlength="50">
        </div>
        <div class="form-group">
          <label class="form-label">연락처 <span class="required">*</span></label>
          <input type="tel" id="f-phone" value="${App.escapeHtml(customer.phone || '')}" placeholder="010-0000-0000">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">주소</label>
            <input type="text" id="f-address" value="${App.escapeHtml(customer.address || '')}" placeholder="주소">
          </div>
          <div class="form-group">
            <label class="form-label">생일</label>
            <input type="date" id="f-birthday" value="${customer.birthday || ''}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">고객 분류</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <label class="checkbox-label"><input type="checkbox" name="customerTag" value="vip" ${(customer.tags || []).includes('vip') ? 'checked' : ''}> VIP</label>
            <label class="checkbox-label"><input type="checkbox" name="customerTag" value="new" ${(customer.tags || []).includes('new') ? 'checked' : ''}> 신규</label>
            <label class="checkbox-label"><input type="checkbox" name="customerTag" value="normal" ${(customer.tags || []).includes('normal') ? 'checked' : ''}> 일반</label>
            <label class="checkbox-label"><input type="checkbox" name="customerTag" value="regular" ${(customer.tags || []).includes('regular') ? 'checked' : ''}> 단골</label>
            <label class="checkbox-label"><input type="checkbox" name="customerTag" value="caution" ${(customer.tags || []).includes('caution') ? 'checked' : ''}> 주의</label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">메모</label>
          <textarea id="f-memo" placeholder="특이사항, 메모 등">${App.escapeHtml(customer.memo || '')}</textarea>
        </div>
      ` : App.customerFormHtml(prefill),
      onSave: () => this.saveCustomer(id)
    });

    // 신규 등록은 예약·기록 화면의 인라인 등록과 완전히 같은 폼·같은 규칙을 쓴다
    if (!id) {
      App.bindCustomerForm({
        onPick: (c, petId) => {
          const callback = this._afterSaveCallback;
          this._afterSaveCallback = null;
          App.closeModal();
          if (callback) { callback(c.id, c.name || '', { customerId: c.id, petId: petId || null, label: App.getCustomerLabel(c) }); return; }
          // closeModal()의 history.back()이 끝난 뒤 이동 — 바로 이동하면 뒤로가기가 이동을 되돌렸다
          setTimeout(() => App.navigate('customers/' + c.id), 180);
        }
      });
      // iOS 모달 autofocus 미지원 대응
      setTimeout(() => {
        const focusId = (prefill && prefill.petName) ? 'cf-phone' : 'cf-petName';
        document.getElementById(focusId)?.focus();
      }, 300);
    }
  },

  async saveCustomer(id) {
    if (!id) return this._saveNewCustomer();

    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const address = document.getElementById('f-address')?.value?.trim() || '';
    const birthday = document.getElementById('f-birthday')?.value || '';
    const memo = document.getElementById('f-memo')?.value?.trim() || '';

    const tags = [];
    document.querySelectorAll('input[name="customerTag"]:checked').forEach(cb => tags.push(cb.value));

    if (!phone) { App.showToast('연락처를 입력해주세요.', 'error'); App.highlightField('f-phone'); return; }

    // Check phone duplicate
    const allCustomers = await DB.getAll('customers');
    const duplicate = allCustomers.find(c => (c.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, '') && c.id !== id);
    if (duplicate) {
      const go = await App.confirm(
        `이미 등록된 연락처입니다.<br><strong>${App.escapeHtml(App.getCustomerLabel(duplicate))}</strong><br>해당 고객 정보를 여시겠습니까?`,
        { okLabel: '고객 열기', danger: false }
      );
      if (go) { App.closeModal(); App.navigate('customers/' + duplicate.id); return; }
      App.highlightField('f-phone');
      return;
    }

    try {
      const existing = await DB.get('customers', id);
      Object.assign(existing, { name, phone, address, birthday, memo, tags });
      await DB.update('customers', existing);
      App.showToast('고객 정보가 수정되었습니다.');
      App.closeModal();

      const callback = this._afterSaveCallback;
      this._afterSaveCallback = null;
      if (callback) { callback(id, name); return; }

      App.handleRoute();
    } catch (err) {
      console.error('Save customer error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  // 신규 등록은 공통 폼(App.customerFormHtml)을 쓴다.
  // 표시용 라벨은 App.saveCustomerForm이 폼을 읽는 시점에 만들어 두므로,
  // 모달을 닫은 뒤에 입력값을 다시 읽는 실수를 하지 않는다.
  async _saveNewCustomer() {
    const callback = this._afterSaveCallback;
    const finish = (customerId, label, petId) => {
      this._afterSaveCallback = null;
      App.closeModal();
      if (callback) { callback(customerId, label, { customerId, petId, label }); return true; }
      return false;
    };

    let result;
    try {
      result = await App.saveCustomerForm({
        onPick: (c, petId) => {
          if (finish(c.id, App.getCustomerLabel(c), petId || null)) return;
          setTimeout(() => App.navigate('customers/' + c.id), 180);
        }
      });
    } catch (err) {
      console.error('Save customer error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
      return;
    }
    if (!result) return; // 검증 실패 또는 기존 고객 선택 — 이미 처리됨

    if (finish(result.customerId, result.label, result.petId)) return;

    App.handleRoute();

    // 완료 모달은 한 틱 늦춘다.
    // closeModal()의 history.back()이 비동기라, 곧바로 showModal()이 pushState하면
    // 안드로이드 뒤로가기가 한 번 씹힌다.
    setTimeout(() => {
      App.showModal({
        title: '등록 완료',
        hideFooter: true,
        content: `
          <div style="text-align:center;padding:16px 0">
            <div style="font-size:2.2rem;margin-bottom:10px;color:var(--success)">${App.icon('check-circle', 'ico-xl')}</div>
            <div style="font-size:1rem;font-weight:700;margin-bottom:16px">${App.escapeHtml(result.label)} 등록되었습니다</div>
            <div style="display:flex;flex-direction:column;gap:8px;max-width:260px;margin:0 auto">
              <button class="btn btn-primary" id="post-cust-record">지금 미용 기록</button>
              <button class="btn btn-secondary" id="post-cust-appt">${App.icon('calendar')} 예약 등록</button>
              <button class="btn btn-secondary" id="post-cust-detail">${App.icon('note')} 상세 보기</button>
              <button class="btn btn-secondary" id="post-cust-close" style="opacity:0.7">완료</button>
            </div>
          </div>
        `
      });
      document.getElementById('post-cust-record')?.addEventListener('click', () => {
        App.closeModal();
        // closeModal()의 history.back()이 끝난 뒤에 새 모달을 연다 (뒤로가기 씹힘 방지)
        setTimeout(() => {
          App.pages.records.showForm(null, { customerId: result.customerId, petId: result.petId || null, date: App.getToday() });
        }, 180);
      });
      document.getElementById('post-cust-appt')?.addEventListener('click', () => {
        App.closeModal();
        App.pages.appointments.showForm(null, result.customerId, result.petId ? { petId: result.petId } : undefined);
      });
      document.getElementById('post-cust-detail')?.addEventListener('click', () => {
        App.closeModal();
        App.navigate('customers/' + result.customerId);
      });
      document.getElementById('post-cust-close')?.addEventListener('click', () => {
        App.closeModal();
      });
    }, 180);
  },

  async deleteCustomer(id) {
    const customer = await DB.get('customers', id);
    if (!customer) return;
    // 정액권 잔액이 남은 손님은 지우지 않는다 — 손님 돈이 장부에서 사라진다. 환불(또는 조정)로 0원을 만든 뒤 삭제
    const prepaidEntries = await Prepaid.listByCustomer(id);
    const prepaidBal = Prepaid.balanceOf(prepaidEntries);
    if (prepaidBal !== 0) {
      App.showToast(`정액권 잔액 ${App.formatCurrency(prepaidBal)}이 남아 있어 삭제할 수 없습니다. 고객 화면의 정액권에서 환불(또는 조정)로 0원을 만든 뒤 삭제해주세요.`, 'error', { duration: 8000 });
      return;
    }

    const confirmed = await App.confirm(`"${App.escapeHtml(App.getCustomerLabel(customer))}" 고객을 삭제하시겠습니까?<br>관련 반려견, 예약, 미용 기록도 함께 삭제됩니다.<br><strong>이 작업은 되돌릴 수 없습니다.</strong>`, { okLabel: '삭제' });
    if (!confirmed) return;

    try {
      const [pets, appointments, records] = await Promise.all([
        DB.getByIndex('pets', 'customerId', id),
        DB.getByIndex('appointments', 'customerId', id),
        DB.getByIndex('records', 'customerId', id)
      ]);
      // 지워지는 것이 무엇인지 숫자로 보여준다 — 매출 이력·미수금까지 사라지는 걸 모르고 삭제하던 문제
      if (records.length > 0 || appointments.length > 0) {
        const unpaidSum = records.filter(r => r.paymentMethod === 'unpaid').reduce((s, r) => s + App.getUnpaidAmount(r), 0);
        const revenueSum = records.reduce((s, r) => s + App.getRecordAmount(r), 0);
        // 1차 confirm 의 history.back() 이 끝나기 전에 2차를 열면 그 popstate 가 2차를 취소시킨다
        await new Promise(r => setTimeout(r, 180));
        const second = await App.confirm(
          `삭제되는 데이터:<br>반려견 <strong>${pets.length}</strong>마리 · 예약 <strong>${appointments.length}</strong>건 · 미용 기록 <strong>${records.length}</strong>건 (매출 ${App.formatCurrency(revenueSum)})` +
          (unpaidSum > 0 ? `<br><span style="color:var(--danger)">미수금 ${App.formatCurrency(unpaidSum)}도 함께 사라집니다.</span>` : '') +
          `<br><small style="color:var(--text-muted)">매출·분석 숫자가 과거 기간까지 바뀝니다. 손님만 더 안 오는 경우라면 삭제 대신 그대로 두세요.</small>`,
          { okLabel: '모두 삭제' });
        if (!second) return;
      }
      // photos 스토어 정리 (반려견 프로필 + 기록 사진)
      for (const p of pets) {
        if (p.photoId) await DB.deletePhoto(p.photoId).catch(() => {});
      }
      for (const r of records) {
        for (const f of ['photoBeforeId', 'photoAfterId', 'photo3Id', 'photo4Id']) {
          if (r[f]) await DB.deletePhoto(r[f]).catch(() => {});
        }
      }
      const ops = [
        ...pets.map(p => ({ store: 'pets', id: p.id })),
        ...appointments.map(a => ({ store: 'appointments', id: a.id })),
        ...records.map(r => ({ store: 'records', id: r.id })),
        ...prepaidEntries.map(e => ({ store: 'prepaid', id: e.id })),
        // 이 손님 기록이 다른 보호자의 정액권으로 낸 것이면 그 사용 줄도 지운다 (그 보호자 잔액으로 돌아간다)
        ...(await Promise.all(records.filter(r => Number(r.prepaidUsed) > 0).map(r => Prepaid.getUseEntry(r.id))))
          .filter(u => u && Number(u.customerId) !== id).map(u => ({ store: 'prepaid', id: u.id })),
        { store: 'customers', id }
      ];
      await DB.deleteCascade(ops);
      App.showToast('고객이 삭제되었습니다.');
      App.navigate('customers');
    } catch (err) {
      console.error('Delete customer error:', err);
      App.showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  },

  _renderCustomerRow(c, petCount, lastVisit, petsByCustomer) {
    const cPets = (petsByCustomer && petsByCustomer[c.id]) || [];
    const displayName = App.getCustomerLabel(c, cPets);
    const initial = c.name ? App.escapeHtml(c.name.charAt(0)) : App.icon('user');
    const vs = this._customerVisitStatus?.[c.id] || 'normal';
    const visitBadge = vs !== 'normal' ? `<span class="badge ${App.getVisitStatusBadge(vs)}" style="margin-left:6px;font-size:0.72rem;padding:3px 8px">${App.getVisitStatusLabel(vs)}</span>` : '';
    const tagLabelMap = { vip: 'VIP', 'new': '신규', normal: '일반', regular: '단골', caution: '주의' };
    const tagText = (c.tags || []).map(t => tagLabelMap[t] || t).join(' ');
    const pBal = (this._prepaidBal && this._prepaidBal[c.id]) || 0;
    const prepaidBadge = pBal > 0 ? `<span class="prepaid-badge" title="정액권 잔액">정액권 ${pBal.toLocaleString('ko-KR')}</span>` : '';
    const searchText = ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.phone || '').replace(/\D/g, '') + ' ' + (c.memo || '') + ' ' + tagText + (pBal > 0 ? ' 정액권' : '') + ' ' + cPets.map(p => (p.name || '') + ' ' + (p.breed || '')).join(' ')).toLowerCase();
    return `<tr data-id="${c.id}" data-tags="${(c.tags || []).join(',')}" data-visit-status="${vs}" data-search="${App.escapeHtml(searchText)}" class="clickable-row" style="cursor:pointer">
      <td><div style="display:flex;align-items:center;gap:10px"><div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary-light),var(--primary-lighter));display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--primary);font-size:0.85rem;flex-shrink:0">${initial}</div><strong>${App.escapeHtml(displayName)}</strong>${this.getTagBadges(c.tags)}${visitBadge}${prepaidBadge}</div></td>
      <td><a href="tel:${App.escapeHtml(App.phoneDigits(c.phone))}" style="color:var(--primary)" onclick="event.stopPropagation()">${App.formatPhoneHtml(c.phone)}</a></td>
      <td><span class="badge badge-info">${petCount[c.id] || 0}마리</span></td>
      <td>${lastVisit[c.id] ? App.getRelativeTime(lastVisit[c.id]) : '-'}</td>
      <td>${App.formatDate(c.createdAt)}</td>
      <td class="table-actions"><button class="btn-icon btn-edit-customer" data-id="${c.id}" title="수정" aria-label="수정">${App.icon('edit')}</button><button class="btn-icon btn-delete-customer text-danger" data-id="${c.id}" title="삭제" aria-label="삭제">${App.icon('trash')}</button></td>
    </tr>`;
  },

  _renderCustomerCard(c, petCount, lastVisit, petsByCustomer) {
    const cPets = (petsByCustomer && petsByCustomer[c.id]) || [];
    const displayName = App.getCustomerLabel(c, cPets);
    const vs = this._customerVisitStatus?.[c.id] || 'normal';
    const tagLabelMap = { vip: 'VIP', 'new': '신규', normal: '일반', regular: '단골', caution: '주의' };
    const tagText = (c.tags || []).map(t => tagLabelMap[t] || t).join(' ');
    const pBal = (this._prepaidBal && this._prepaidBal[c.id]) || 0;
    const searchText = ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.phone || '').replace(/\D/g, '') + ' ' + (c.memo || '') + ' ' + tagText + (pBal > 0 ? ' 정액권' : '') + ' ' + cPets.map(p => (p.name || '') + ' ' + (p.breed || '')).join(' ')).toLowerCase();

    // 좌측 컬러바 색
    const barColor = vs === 'at-risk' ? 'var(--danger)' : vs === 'remind' ? 'var(--warning)' : vs === 'churned' ? 'var(--text-muted)' : vs === 'new' ? 'var(--info)' : 'var(--success)';

    // 우측 상태 칩 (정상은 숨김)
    let rightChip = '';
    if (vs === 'new') {
      rightChip = `<span style="font-size:0.7rem;padding:3px 9px;background:var(--bg);color:var(--text-muted);border:1px solid var(--border);border-radius:11px;font-weight:600;flex-shrink:0;white-space:nowrap">방문 전</span>`;
    } else if (vs === 'at-risk') {
      rightChip = `<span style="font-size:0.7rem;padding:3px 9px;background:var(--danger-bg-soft);color:var(--danger-text-strong);border:1px solid var(--danger-border-soft);border-radius:11px;font-weight:700;flex-shrink:0;white-space:nowrap">많이 늦음</span>`;
    } else if (vs === 'remind') {
      rightChip = `<span style="font-size:0.7rem;padding:3px 9px;background:var(--warning-bg-soft);color:var(--warning-text-strong);border:1px solid var(--warning-border-soft);border-radius:11px;font-weight:700;flex-shrink:0;white-space:nowrap">올 때 됨</span>`;
    } else if (vs === 'churned') {
      rightChip = `<span style="font-size:0.7rem;padding:3px 9px;background:var(--bg);color:var(--text-secondary);border:1px solid var(--border);border-radius:11px;font-weight:600;flex-shrink:0;white-space:nowrap">오래 안 옴</span>`;
    }

    // 태그 뱃지 (작게) — 상세 화면과 같은 옅은 배지 (흰 글자 + 노랑 바탕은 다크·라이트 모두 잘 안 읽혔다)
    const tagBadges = (c.tags || []).map(t => {
      const tagColors = { vip: 'badge-warning', 'new': 'badge-info', normal: 'badge-secondary', regular: 'badge-success', caution: 'badge-danger' };
      return `<span class="badge ${tagColors[t] || 'badge-secondary'}" style="font-size:0.72rem;padding:2px 7px">${tagLabelMap[t] || t}</span>`;
    }).join('');

    const lastVisitText = lastVisit[c.id] ? App.getRelativeTime(lastVisit[c.id]) + ' 방문' : '방문 없음';
    const phoneText = c.phone ? App.formatPhoneHtml(c.phone) : '-';
    // '반려견 1마리' 대신 이름·견종 — 사장님은 반려견으로 손님을 기억한다
    const petLine = cPets.slice(0, 3).map(p => `<strong>${App.escapeHtml(p.name || '-')}</strong>${p.breed ? ' ' + App.escapeHtml(p.breed) : ''}`).join(', ')
      + (cPets.length > 3 ? ` 외 ${cPets.length - 3}마리` : '');

    return `<div class="mobile-card clickable-row" data-id="${c.id}" data-tags="${(c.tags || []).join(',')}" data-visit-status="${vs}" data-search="${App.escapeHtml(searchText)}" style="display:block;padding:12px;background:var(--bg-white);border:1px solid var(--border-light);border-left:4px solid ${barColor};border-radius:var(--radius);cursor:pointer;margin-bottom:6px;box-shadow:var(--shadow-xs)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;min-width:0">
        <strong style="font-size:1rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0">${App.escapeHtml(displayName)}</strong>
        ${tagBadges ? `<span style="display:inline-flex;gap:3px;flex-shrink:0">${tagBadges}</span>` : ''}
        ${pBal > 0 ? `<span class="prepaid-badge">정액권 ${pBal.toLocaleString('ko-KR')}</span>` : ''}
        ${rightChip}
      </div>
      <div style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${c.phone ? `<a href="tel:${App.escapeHtml(App.phoneDigits(c.phone))}" style="color:var(--primary);font-weight:600" onclick="event.stopPropagation()">${phoneText}</a>` : '<span style="color:var(--text-muted)">전화 없음</span>'}
        <span style="color:var(--border)">·</span>
        <span style="color:var(--text-muted)">${lastVisitText}</span>
      </div>
      ${petLine ? `<div class="cust-card-pets">${App.icon('paw')} ${petLine}</div>` : ''}
    </div>`;
  },

  // ===== 정액권 =====
  async _prepaidSectionHtml(customer, entries, balance, records) {
    const recMap = {}; (records || []).forEach(r => { recMap[r.id] = r; });
    // 다른 보호자로 옮긴 반려견의 기록은 이 손님 기록 목록에 없다 — 따로 읽는다
    for (const e of entries) {
      if (e.type === 'use' && e.recordId != null && !recMap[e.recordId]) {
        const r = await DB.get('records', Number(e.recordId)).catch(() => null);
        recMap[e.recordId] = r || null;
      }
    }
    const petIds = [...new Set(Object.values(recMap).filter(Boolean).map(r => r.petId))];
    const petName = {};
    for (const pid of petIds) { const p = await DB.get('pets', pid).catch(() => null); if (p) petName[pid] = p.name; }
    const methodLabel = { cash: '현금', card: '카드', transfer: '계좌이체' };
    const SHOW = 10;
    const rows = entries.map((e, i) => {
      const credit = Number(e.credit) || 0;
      let sub = '';
      if (e.type === 'charge') sub = `받은 돈 ${App.formatCurrency(e.amount)}${Number(e.bonus) > 0 ? ' + 보너스 ' + App.formatCurrency(e.bonus) : ''}${methodLabel[e.method] ? ' · ' + methodLabel[e.method] : ''}`;
      else if (e.type === 'refund') sub = `돌려준 돈 ${App.formatCurrency(e.amount)}${methodLabel[e.method] ? ' · ' + methodLabel[e.method] : ''}`;
      else if (e.type === 'use') {
        const r = recMap[e.recordId];
        sub = r ? [petName[r.petId], r.service].filter(Boolean).join(' · ') || '미용' : '(삭제된 기록 — 눌러서 정리)';
      }
      const memo = e.memo ? `${sub ? ' · ' : ''}${App.escapeHtml(e.memo)}` : '';
      const linkRec = e.type === 'use' && recMap[e.recordId] ? e.recordId : '';
      return `<div class="prepaid-row${i >= SHOW ? ' is-more' : ''}" role="button" tabindex="0" data-id="${e.id}" data-type="${e.type}" data-customer-id="${customer.id}"${linkRec ? ` data-record-id="${linkRec}"` : ''}>
        <div class="prepaid-row-main">
          <span class="prepaid-type t-${e.type}">${Prepaid.TYPE_LABELS[e.type] || e.type}</span>
          <span class="prepaid-date">${App.formatDate(e.date)}</span>
          <span class="prepaid-sub">${App.escapeHtml(sub)}${memo}</span>
        </div>
        <strong class="prepaid-amt${credit < 0 ? ' neg' : ''}">${credit > 0 ? '+' : ''}${App.formatCurrency(credit)}</strong>
      </div>`;
    }).join('');
    return `
      <div class="detail-section prepaid-section">
        <div class="prepaid-head">
          <h3 class="detail-section-title" style="margin:0;border:none;padding:0">정액권</h3>
          <div class="prepaid-balance${balance < 0 ? ' neg' : ''}">잔액 <strong>${App.formatCurrency(balance)}</strong></div>
        </div>
        <div class="prepaid-actions">
          <button type="button" class="btn btn-sm btn-primary btn-prepaid-act" data-act="charge" data-customer-id="${customer.id}">충전</button>
          ${balance > 0 ? `<button type="button" class="btn btn-sm btn-secondary btn-prepaid-act" data-act="refund" data-customer-id="${customer.id}">환불</button>` : ''}
          <button type="button" class="btn btn-sm btn-ghost btn-prepaid-act" data-act="adjust" data-customer-id="${customer.id}">조정</button>
        </div>
        <div class="prepaid-history">${rows}</div>
        ${entries.length > SHOW ? `<button type="button" class="btn btn-sm btn-ghost" id="btn-prepaid-more" style="width:100%;margin-top:6px">이전 내역 더 보기 (${entries.length - SHOW}건)</button>` : ''}
      </div>`;
  },

  // 충전·환불·조정 입력 (entryId 가 있으면 수정 + 삭제). 사용(use) 줄은 미용 기록에서 고친다 — 기록이 지워져 남은 줄만 여기서 삭제
  async showPrepaidForm(customerId, type, entryId) {
    const customer = await DB.get('customers', customerId);
    if (!customer) { App.showToast('고객을 찾을 수 없습니다.', 'error'); return; }
    const entries = await Prepaid.listByCustomer(customerId);
    const entry = entryId ? entries.find(e => e.id === entryId) : null;
    if (entryId && !entry) { App.showToast('정액권 내역을 찾을 수 없습니다.', 'error'); return; }
    if (entry) type = entry.type;
    const balance = Prepaid.balanceOf(entries);
    const baseBal = balance - (entry ? Number(entry.credit) || 0 : 0); // 이 줄을 뺀 잔액
    const who = App.escapeHtml(App.getCustomerLabel(customer));
    const today = App.getToday();
    const methodChips = (sel, opts) => opts.map(([v, l]) => `<button type="button" class="payment-chip pp-method${sel === v ? ' active' : ''}" data-value="${v}">${l}</button>`).join('');
    const dateField = `<div class="form-group"><label class="form-label">날짜</label><input type="date" id="pp-date" value="${App.escapeHtml((entry && entry.date) || today)}"></div>`;
    const memoField = (required) => `<div class="form-group"><label class="form-label">메모${required ? ' <span class="required">*</span>' : ' <span style="font-weight:400;color:var(--text-muted)">(선택)</span>'}</label><input type="text" id="pp-memo" maxlength="200" value="${App.escapeHtml((entry && entry.memo) || '')}" placeholder="${required ? '조정하는 이유 (예: 이전 장부 잔액 옮김)' : ''}"></div>`;
    const delBtn = entry ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--border);text-align:center"><button type="button" class="btn btn-ghost text-danger" id="pp-delete" style="min-height:44px">이 내역 삭제</button></div>` : '';
    let content = '', title = '';
    if (type === 'use') {
      title = '정액권 사용 내역';
      content = `<p style="line-height:1.6">연결된 미용 기록이 없는 사용 내역입니다 (${App.formatDate(entry.date)} · ${App.formatCurrency(entry.amount)}).<br><small style="color:var(--text-muted)">다른 기기에서 기록을 지웠을 때 남을 수 있어요. 삭제하면 ${App.formatCurrency(entry.amount)}이 잔액으로 돌아갑니다.</small></p>${delBtn}`;
    } else if (type === 'charge') {
      title = entry ? '정액권 충전 수정' : '정액권 충전';
      content = `
        <div style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:10px">${who} · 지금 잔액 ${App.formatCurrency(balance)}</div>
        <div class="form-group"><label class="form-label">받은 금액 (원) <span class="required">*</span></label>
          <input type="number" id="pp-amount" inputmode="numeric" min="0" step="10000" value="${entry ? Number(entry.amount) || '' : ''}" placeholder="예: 300000"></div>
        <div class="form-group"><label class="form-label">보너스 (원) <span style="font-weight:400;color:var(--text-muted)">(선택 — 덤으로 더 넣어 주는 금액)</span></label>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <input type="number" id="pp-bonus" inputmode="numeric" min="0" step="1000" value="${entry && Number(entry.bonus) ? Number(entry.bonus) : ''}" placeholder="0" style="flex:1;min-width:120px">
            <button type="button" class="payment-chip pp-bonus-pct" data-pct="5">+5%</button>
            <button type="button" class="payment-chip pp-bonus-pct" data-pct="10">+10%</button>
          </div></div>
        <div class="form-group"><label class="form-label">결제 방법</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${methodChips((entry && entry.method) || 'card', [['card', '카드'], ['cash', '현금'], ['transfer', '계좌이체']])}</div></div>
        ${dateField}${memoField(false)}
        <div class="prepaid-preview" id="pp-preview"></div>${delBtn}`;
    } else if (type === 'refund') {
      title = entry ? '정액권 환불 수정' : '정액권 환불';
      const ded0 = entry ? -(Number(entry.credit) || 0) : Math.max(0, balance);
      content = `
        <div style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:10px">${who} · 지금 잔액 ${App.formatCurrency(balance)}</div>
        <div class="form-group"><label class="form-label">잔액에서 뺄 금액 (원) <span class="required">*</span></label>
          <input type="number" id="pp-deduct" inputmode="numeric" min="0" step="1000" value="${ded0 || ''}"></div>
        <div class="form-group"><label class="form-label">돌려준 돈 (원) <span style="font-weight:400;color:var(--text-muted)">— 보너스를 빼고 돌려줬다면 줄여 적으세요</span></label>
          <input type="number" id="pp-amount" inputmode="numeric" min="0" step="1000" value="${entry ? Number(entry.amount) || 0 : ded0 || ''}"></div>
        <div class="form-group"><label class="form-label">돌려준 방법</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${methodChips((entry && entry.method) || 'cash', [['cash', '현금'], ['transfer', '계좌이체'], ['card', '카드 취소']])}</div></div>
        ${dateField}${memoField(false)}
        <div class="prepaid-preview" id="pp-preview"></div>${delBtn}`;
    } else {
      type = 'adjust';
      title = entry ? '정액권 조정 수정' : '정액권 조정';
      const c0 = entry ? Number(entry.credit) || 0 : 0;
      content = `
        <div style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:10px">${who} · 지금 잔액 ${App.formatCurrency(balance)}<br><small style="color:var(--text-muted)">장부를 맞출 때만 쓰세요 (예: 종이 장부 잔액 옮기기). 돈이 오가면 충전·환불로.</small></div>
        <div class="form-group"><label class="form-label">잔액을</label>
          <div style="display:flex;gap:6px">${methodChips(c0 < 0 ? 'minus' : 'plus', [['plus', '늘리기 +'], ['minus', '줄이기 −']])}</div></div>
        <div class="form-group"><label class="form-label">금액 (원) <span class="required">*</span></label>
          <input type="number" id="pp-amount" inputmode="numeric" min="0" step="1000" value="${c0 ? Math.abs(c0) : ''}"></div>
        ${dateField}${memoField(true)}
        <div class="prepaid-preview" id="pp-preview"></div>${delBtn}`;
    }

    const num = (elId) => Math.max(0, Math.round(Number(document.getElementById(elId)?.value) || 0));
    const method = () => document.querySelector('.pp-method.active')?.dataset.value || '';
    const newCredit = () => {
      if (type === 'charge') return num('pp-amount') + num('pp-bonus');
      if (type === 'refund') return -num('pp-deduct');
      if (type === 'adjust') return method() === 'minus' ? -num('pp-amount') : num('pp-amount');
      return 0;
    };
    const afterLabel = { charge: '충전 후 잔액', refund: '환불 후 잔액', adjust: '조정 후 잔액' }[type];

    const finish = async (msg) => {
      App.showToast(msg);
      App.closeModal();
      App.handleRoute();
    };

    App.showModal({
      title,
      content,
      saveText: type === 'use' ? '닫기' : '저장',
      onSave: async () => {
        if (type === 'use') { App.closeModal(); return; }
        const credit = newCredit();
        const date = document.getElementById('pp-date')?.value || today;
        const memo = (document.getElementById('pp-memo')?.value || '').trim();
        const data = { customerId, type, date, memo };
        if (type === 'charge') {
          const amount = num('pp-amount'), bonus = num('pp-bonus');
          if (amount <= 0) { App.showToast('받은 금액을 입력해주세요.', 'error'); App.highlightField('pp-amount'); return; }
          if (Math.max(amount, bonus) > 10000000) {
            const okBig = await App.confirm(`<strong>${App.formatCurrency(amount + bonus)}</strong>을 충전합니다. 금액이 맞나요?`, { okLabel: '이 금액으로 저장', danger: false });
            if (!okBig) return;
            await new Promise(r => setTimeout(r, 180));
          }
          Object.assign(data, { amount, bonus, credit, method: method() || 'card' });
        } else if (type === 'refund') {
          const deduct = num('pp-deduct'), paid = num('pp-amount');
          if (deduct <= 0) { App.showToast('잔액에서 뺄 금액을 입력해주세요.', 'error'); App.highlightField('pp-deduct'); return; }
          if (deduct > baseBal) { App.showToast(`잔액(${App.formatCurrency(baseBal)})보다 많이 뺄 수 없습니다.`, 'error'); App.highlightField('pp-deduct'); return; }
          Object.assign(data, { amount: paid, bonus: 0, credit, method: method() || 'cash' });
        } else {
          if (!num('pp-amount')) { App.showToast('조정 금액을 입력해주세요.', 'error'); App.highlightField('pp-amount'); return; }
          if (!memo) { App.showToast('조정은 이유(메모)를 꼭 적어주세요.', 'error'); App.highlightField('pp-memo'); return; }
          Object.assign(data, { amount: credit, bonus: 0, credit });
        }
        // 마이너스 잔액은 조정에서만, 그것도 한 번 묻고 (충전을 줄여 고칠 때도 이미 쓴 금액보다 작아질 수 있다)
        if (baseBal + credit < 0) {
          if (type !== 'adjust' && type !== 'charge') { App.showToast('잔액이 마이너스가 됩니다.', 'error'); return; }
          const okNeg = await App.confirm(`저장하면 잔액이 <strong>${App.formatCurrency(baseBal + credit)}</strong>(마이너스)가 됩니다. 계속할까요?`, { okLabel: '그래도 저장', danger: true });
          if (!okNeg) return;
          await new Promise(r => setTimeout(r, 180));
        }
        if (entry) {
          await DB.update('prepaid', Object.assign(entry, data));
          await finish('정액권 내역이 수정되었습니다.');
        } else {
          await DB.add('prepaid', data);
          await finish(type === 'charge' ? `정액권 ${App.formatCurrency(credit)} 충전 · 잔액 ${App.formatCurrency(baseBal + credit)}` : type === 'refund' ? '환불이 기록되었습니다.' : '잔액을 조정했습니다.');
        }
      }
    });

    const preview = () => {
      const el = document.getElementById('pp-preview');
      if (!el) return;
      const after = baseBal + newCredit();
      el.innerHTML = `${afterLabel} <strong class="${after < 0 ? 'text-danger' : ''}">${App.formatCurrency(after)}</strong>`;
    };
    document.querySelectorAll('.pp-method').forEach(chip => chip.addEventListener('click', () => {
      document.querySelectorAll('.pp-method').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      preview();
    }));
    document.querySelectorAll('.pp-bonus-pct').forEach(chip => chip.addEventListener('click', () => {
      const amt = num('pp-amount');
      if (!amt) { App.showToast('받은 금액을 먼저 입력해주세요.', 'info'); App.highlightField('pp-amount'); return; }
      document.getElementById('pp-bonus').value = Math.round(amt * Number(chip.dataset.pct) / 100);
      preview();
    }));
    ['pp-amount', 'pp-bonus', 'pp-deduct'].forEach(elId => document.getElementById(elId)?.addEventListener('input', preview));
    // 환불: 뺄 금액을 바꾸면 돌려준 돈도 같이 (따로 고치기 전까지)
    const ded = document.getElementById('pp-deduct'), paidEl = document.getElementById('pp-amount');
    if (type === 'refund' && ded && paidEl) {
      let linked = !entry;
      paidEl.addEventListener('input', () => { linked = false; });
      ded.addEventListener('input', () => { if (linked) paidEl.value = ded.value; preview(); });
    }
    preview();

    document.getElementById('pp-delete')?.addEventListener('click', async () => {
      const after = baseBal;
      const ok = await App.confirm(`이 ${Prepaid.TYPE_LABELS[type] || ''} 내역(${App.formatDate(entry.date)} · ${App.formatCurrency(Number(entry.credit) || 0)})을 삭제할까요?<br>삭제 후 잔액: <strong>${App.formatCurrency(after)}</strong>${after < 0 ? ' <span class="text-danger">(마이너스)</span>' : ''}`, { okLabel: '삭제' });
      if (!ok) return;
      try {
        await DB.delete('prepaid', entry.id);
        await new Promise(r => setTimeout(r, 180));
        await finish('정액권 내역을 삭제했습니다.');
      } catch (err) {
        console.error('prepaid delete error:', err);
        App.showToast('삭제 중 오류가 발생했습니다.', 'error');
      }
    });
  },

  getTagBadges(tags) {
    if (!tags || tags.length === 0) return '';
    const tagLabels = { vip: 'VIP', 'new': '신규', normal: '일반', regular: '단골', caution: '주의' };
    const tagColors = { vip: 'badge-warning', 'new': 'badge-info', normal: 'badge-secondary', regular: 'badge-success', caution: 'badge-danger' };
    return tags.map(t => `<span class="badge ${tagColors[t] || 'badge-secondary'}" style="font-size:0.7rem;margin-left:4px;padding:3px 8px">${tagLabels[t] || t}</span>`).join('');
  },

  _searchQuery: '',
  _tagFilter: '',
  _visitFilter: '',

  applyFilters() {
    const q = (this._searchQuery || '').trim().toLowerCase();
    // 전화번호처럼 생긴 검색어는 숫자만 비교한다 ('010 1111'·'0101111'·'010-1111' 모두 같은 결과 — 예약 화면 고객 검색과 같은 규칙)
    const qDigits = /^[\d\s\-+().]+$/.test(q) ? q.replace(/\D/g, '') : '';
    const tag = this._tagFilter || '';
    const visit = this._visitFilter || '';

    // Save filter state to sessionStorage
    sessionStorage.setItem('customer-filter', JSON.stringify({
      search: this._searchQuery || '',
      tag,
      visitStatus: visit,
      sort: this._sortKey || 'name'
    }));

    const matchesFilter = (el) => {
      const textMatch = !q || (qDigits ? (el.dataset.search || '').replace(/[^\d ]/g, '').includes(qDigits) : (el.dataset.search || '').includes(q));
      const tagMatch = !tag || (el.dataset.tags || '').split(',').includes(tag);
      const visitMatch = !visit || (el.dataset.visitStatus || '') === visit;
      return textMatch && tagMatch && visitMatch;
    };

    let visibleCount = 0;
    document.querySelectorAll('#customer-table tbody tr').forEach(row => {
      const show = matchesFilter(row);
      row.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });

    let visibleCards = 0;
    document.querySelectorAll('#customer-card-list .mobile-card').forEach(card => {
      const show = matchesFilter(card);
      card.style.display = show ? '' : 'none';
      if (show) visibleCards++;
    });

    // 검색·필터 적용 시 결과 카운트 표시 (없을 땐 숨김)
    const countEl = document.getElementById('customer-search-count');
    if (countEl) {
      const total = visibleCount || visibleCards;
      const isFiltering = !!(q || tag || visit);
      countEl.style.display = isFiltering ? '' : 'none';
      countEl.textContent = isFiltering ? `${total}명` : '';
      // 위 제목도 걸러진 수를 보여준다 (예전엔 검색해도 '총 N명'만 보여 헷갈렸다)
      const totalEl = document.getElementById('customer-total-label');
      if (totalEl) {
        const all = Number(totalEl.dataset.total) || 0;
        totalEl.textContent = isFiltering ? `검색 결과 ${total}명 / 전체 ${all}명` : `총 ${all}명의 고객`;
      }
      const emptyEl = document.getElementById('customer-filter-empty');
      if (emptyEl) emptyEl.style.display = isFiltering && total === 0 && (Number(totalEl?.dataset.total) || 0) > 0 ? '' : 'none';
    }
  },

};
