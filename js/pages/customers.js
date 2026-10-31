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
          <p class="page-subtitle">총 ${customers.length}명의 고객</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-customer">+ 새 고객</button>
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
            <option value="remind" ${curVisit === 'remind' ? 'selected' : ''}>리마인드</option>
            <option value="at-risk" ${curVisit === 'at-risk' ? 'selected' : ''}>이탈위험</option>
            <option value="churned" ${curVisit === 'churned' ? 'selected' : ''}>이탈</option>
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
                'at-risk': { label: '이탈위험', color: 'var(--danger)' },
                'remind': { label: '리마인드 필요', color: 'var(--warning)' },
                'normal': { label: '정상', color: 'var(--success)' },
                'new': { label: '방문 전', color: 'var(--info)' },
                'churned': { label: '이탈', color: 'var(--text-muted)' }
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
    const visitCount = records.length;
    const unpaidRecords = records.filter(r => r.paymentMethod === 'unpaid');
    const unpaidBalance = unpaidRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);
    const noshowCount = appointments.filter(a => a.status === 'noshow').length;

    container.innerHTML = `
      <div class="detail-topbar">
        <div class="back-link" onclick="history.length>1?history.back():App.navigate('customers')">${App.icon('arrow-left')} 뒤로가기</div>
        <button class="btn btn-sm btn-secondary btn-edit-customer" data-id="${customer.id}">${App.icon('edit')} 정보 수정</button>
      </div>
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
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          ${(customer.phone || '').replace(/\D/g, '') ? `<a class="btn btn-secondary" href="tel:${App.escapeHtml(customer.phone.replace(/\D/g, ''))}" style="min-height:44px;flex:1 1 auto;text-decoration:none">${App.icon('phone')} 전화</a>` : ''}
          <button class="btn btn-success" id="btn-send-message" data-customer-id="${customer.id}" style="min-height:44px;flex:1 1 auto">메시지</button>
          <button class="btn btn-primary" id="btn-new-appt-for-customer" data-customer-id="${customer.id}" style="min-height:44px;flex:1 1 auto">+ 예약</button>
          <button class="btn btn-primary" id="btn-new-record-for-customer" data-customer-id="${customer.id}" style="min-height:44px;flex:1 1 auto">+ 미용 기록</button>
        </div>
      </div>

      ${(customer.address || customer.memo) ? `<div class="detail-section cust-detail-notes">
        ${customer.memo ? `<div><label>메모</label><span>${App.escapeHtml(customer.memo)}</span></div>` : ''}
        ${customer.address ? `<div><label>주소</label><span>${App.escapeHtml(customer.address)}</span></div>` : ''}
      </div>` : ''}

      <div class="detail-section">
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

      <div class="detail-section">
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

      <div class="detail-section">
        <h3 class="detail-section-title">최근 미용 기록</h3>
        ${await (async () => {
          if (records.length === 0) return '<p style="color:var(--text-muted)">미용 기록이 없습니다.</p>';
          // 이 고객의 반려견은 이미 로드되어 있다 — 전체 pets 스토어(사진 포함)를 다시 읽지 않는다
          const petMap = {}; pets.forEach(p => petMap[p.id] = p);
          const allServices = await DB.getAll('services');
          const serviceMap = {}; allServices.forEach(s => serviceMap[s.id] = s.name);
          const _isMobile = window.matchMedia('(max-width: 768px)').matches;
          if (_isMobile) {
            return records.slice(0, 10).map(r => {
              const pet = petMap[r.petId];
              const serviceNames = (r.serviceNames && r.serviceNames.length > 0) ? r.serviceNames.join(', ') : (r.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ') || '-';
              return `<div class="cust-rec-row" data-id="${r.id}" role="button" tabindex="0" style="padding:12px 0;border-bottom:1px solid var(--border-light);cursor:pointer${r.paymentMethod === 'unpaid' ? ';border-left:4px solid var(--danger);padding-left:12px' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <strong style="font-size:0.9rem">${App.formatDate(r.date)}</strong>
                  <strong style="color:var(--primary)">${App.formatCurrency(App.getRecordAmount(r))}</strong>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary);display:flex;align-items:center;gap:8px"><span class="flex-1">${App.escapeHtml(pet?.name || '-')} · ${App.escapeHtml(serviceNames)} · ${App.escapeHtml(r.groomer || '-')} · ${App.pages.records.getPaymentLabel(r.paymentMethod)}</span><button type="button" class="btn btn-sm btn-ghost cust-rec-report" data-id="${r.id}" style="flex-shrink:0">${App.icon('image')} 리포트</button></div>
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
                  return `<tr class="cust-rec-row" data-id="${r.id}" style="cursor:pointer${r.paymentMethod === 'unpaid' ? ';background:var(--warning-light)' : ''}">
                    <td>${App.formatDate(r.date)}</td>
                    <td>${App.escapeHtml(pet?.name || '-')}</td>
                    <td>${App.escapeHtml(serviceNames)}</td>
                    <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></td>
                    <td>${App.escapeHtml(r.groomer || '-')}</td>
                    <td>${App.pages.records.getPaymentLabel(r.paymentMethod)}</td>
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
      <div class="detail-section">
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

      <div style="display:flex;gap:8px;justify-content:flex-end;margin:24px 0 8px">
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
      { key: 'atRisk', label: '이탈위험 안내' },
      { key: 'churned', label: '이탈 고객 안내' },
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
      title: id ? '고객 정보 수정' : '새 반려견 · 보호자 등록',
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
        const unpaidSum = records.filter(r => r.paymentMethod === 'unpaid').reduce((s, r) => s + App.getRecordAmount(r), 0);
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
    const searchText = ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.phone || '').replace(/\D/g, '') + ' ' + (c.memo || '') + ' ' + tagText + ' ' + cPets.map(p => (p.name || '') + ' ' + (p.breed || '')).join(' ')).toLowerCase();
    return `<tr data-id="${c.id}" data-tags="${(c.tags || []).join(',')}" data-visit-status="${vs}" data-search="${App.escapeHtml(searchText)}" class="clickable-row" style="cursor:pointer">
      <td><div style="display:flex;align-items:center;gap:10px"><div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary-light),var(--primary-lighter));display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--primary);font-size:0.85rem;flex-shrink:0">${initial}</div><strong>${App.escapeHtml(displayName)}</strong>${this.getTagBadges(c.tags)}${visitBadge}</div></td>
      <td><a href="tel:${App.escapeHtml((c.phone || '').replace(/\D/g, ''))}" style="color:var(--primary)" onclick="event.stopPropagation()">${App.formatPhoneHtml(c.phone)}</a></td>
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
    const searchText = ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.phone || '').replace(/\D/g, '') + ' ' + (c.memo || '') + ' ' + tagText + ' ' + cPets.map(p => (p.name || '') + ' ' + (p.breed || '')).join(' ')).toLowerCase();

    // 좌측 컬러바 색
    const barColor = vs === 'at-risk' ? 'var(--danger)' : vs === 'remind' ? 'var(--warning)' : vs === 'churned' ? 'var(--text-muted)' : vs === 'new' ? 'var(--info)' : 'var(--success)';

    // 우측 상태 칩 (정상은 숨김)
    let rightChip = '';
    if (vs === 'new') {
      rightChip = `<span style="font-size:0.7rem;padding:3px 9px;background:var(--bg);color:var(--text-muted);border:1px solid var(--border);border-radius:11px;font-weight:600;flex-shrink:0;white-space:nowrap">방문 전</span>`;
    } else if (vs === 'at-risk') {
      rightChip = `<span style="font-size:0.7rem;padding:3px 9px;background:var(--danger);color:#fff;border-radius:11px;font-weight:700;flex-shrink:0;white-space:nowrap">이탈위험</span>`;
    } else if (vs === 'remind') {
      rightChip = `<span style="font-size:0.7rem;padding:3px 9px;background:var(--warning);color:#fff;border-radius:11px;font-weight:700;flex-shrink:0;white-space:nowrap">리마인드</span>`;
    } else if (vs === 'churned') {
      rightChip = `<span style="font-size:0.7rem;padding:3px 9px;background:var(--text-muted);color:#fff;border-radius:11px;font-weight:600;flex-shrink:0;white-space:nowrap">이탈</span>`;
    }

    // 태그 뱃지 (작게)
    const tagBadges = (c.tags || []).map(t => {
      const tagColors = { vip: 'var(--warning)', 'new': 'var(--info)', normal: 'var(--text-muted)', regular: 'var(--success)', caution: 'var(--danger)' };
      return `<span style="font-size:0.72rem;padding:2px 7px;background:${tagColors[t] || 'var(--text-muted)'};color:#fff;border-radius:6px;font-weight:700">${tagLabelMap[t] || t}</span>`;
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
        ${rightChip}
      </div>
      <div style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${c.phone ? `<a href="tel:${App.escapeHtml(c.phone.replace(/\D/g, ''))}" style="color:var(--primary);font-weight:600" onclick="event.stopPropagation()">${phoneText}</a>` : '<span style="color:var(--text-muted)">전화 없음</span>'}
        <span style="color:var(--border)">·</span>
        <span style="color:var(--text-muted)">${lastVisitText}</span>
      </div>
      ${petLine ? `<div class="cust-card-pets">${App.icon('paw')} ${petLine}</div>` : ''}
    </div>`;
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
    const q = (this._searchQuery || '').toLowerCase();
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
      const textMatch = !q || (el.dataset.search || '').includes(q);
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
    }
  },

};
