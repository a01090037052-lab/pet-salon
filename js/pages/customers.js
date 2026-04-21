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
    const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo']);

    // Pet count per customer
    const petCount = {};
    pets.forEach(p => { petCount[p.customerId] = (petCount[p.customerId] || 0) + 1; });

    // Last visit per customer
    const lastVisit = {};
    records.forEach(r => {
      if (!lastVisit[r.customerId] || r.date > lastVisit[r.customerId]) {
        lastVisit[r.customerId] = r.date;
      }
    });

    // 고객별 방문 상태 계산 (반려견 중 가장 좋은 상태 기준)
    const customerVisitStatus = {};
    const statusPriority = { normal: 0, remind: 1, 'at-risk': 2, churned: 3 };
    pets.forEach(p => {
      if (p.petStatus && p.petStatus !== 'active') return;
      const status = App.classifyVisitStatus(p.lastVisitDate, p.groomingCycle);
      const prev = customerVisitStatus[p.customerId];
      if (!prev || statusPriority[status] < statusPriority[prev]) {
        customerVisitStatus[p.customerId] = status;
      }
    });
    // 반려견 없는 고객은 기록 기반으로 판정
    customers.forEach(c => {
      if (!customerVisitStatus[c.id]) {
        customerVisitStatus[c.id] = App.classifyVisitStatus(lastVisit[c.id], null);
      }
    });

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
      const visitCount = {};
      records.forEach(r => { visitCount[r.customerId] = (visitCount[r.customerId] || 0) + 1; });
      sorted = customers.sort((a, b) => (visitCount[b.id] || 0) - (visitCount[a.id] || 0));
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
        <div class="search-box" style="max-width:none">
          <span class="search-icon">&#x1F50D;</span>
          <input type="text" id="customer-search" placeholder="고객 이름, 전화번호, 메모 검색..." style="width:100%;min-height:40px">
        </div>
        <div class="filter-bar-row">
          <select id="customer-visit-filter" style="flex:1;min-height:44px;font-size:max(16px,0.88rem)">
            <option value="" ${curVisit === '' ? 'selected' : ''}>방문 상태</option>
            <option value="normal" ${curVisit === 'normal' ? 'selected' : ''}>정상</option>
            <option value="remind" ${curVisit === 'remind' ? 'selected' : ''}>리마인드</option>
            <option value="at-risk" ${curVisit === 'at-risk' ? 'selected' : ''}>이탈위험</option>
            <option value="churned" ${curVisit === 'churned' ? 'selected' : ''}>이탈</option>
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
                      <div class="empty-state-icon">&#x1F464;</div>
                      <div class="empty-state-text">등록된 고객이 없습니다</div>
                      <button class="btn btn-primary" onclick="document.getElementById('btn-add-customer').click()">첫 고객 등록하기</button>
                    </div>
                  </td></tr>
                ` : sorted.map(c => this._renderCustomerRow(c, petCount, lastVisit)).join('')}
              </tbody>
            </table>
          </div>`}

          ${!isMobile ? '' : `<div class="mobile-card-list" id="customer-card-list" style="display:block">
            ${sorted.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">&#x1F464;</div>
                <div class="empty-state-text">등록된 고객이 없습니다</div>
                <button class="btn btn-primary" onclick="document.getElementById('btn-add-customer').click()">첫 고객 등록하기</button>
              </div>
            ` : sorted.map(c => this._renderCustomerCard(c, petCount, lastVisit)).join('')}
          </div>`}
        </div>
      </div>
    `;

    this._customerVisitStatus = customerVisitStatus;
  },

  async renderDetail(container, customerId) {
    const customer = await DB.get('customers', customerId);
    if (!customer) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">고객을 찾을 수 없습니다.</div></div>';
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
      <div class="back-link" onclick="history.length>1?history.back():App.navigate('customers')">&#x2190; 뒤로가기</div>
      <div class="detail-header">
        <div class="detail-avatar">&#x1F464;</div>
        <div class="detail-info">
          <h2>${App.escapeHtml(App.getCustomerLabel(customer))}${this.getTagBadges(customer.tags)}</h2>
          <div class="detail-meta">
            <a href="tel:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" style="color:var(--primary)">&#x1F4DE; ${App.formatPhone(customer.phone)}</a>
            <a href="sms:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" style="color:var(--primary);font-size:0.85rem" title="문자 보내기">&#x1F4AC; 문자</a>
            <span>방문 ${visitCount}회</span>
            <span>총 ${App.formatCurrency(totalSpend)}</span>
            ${unpaidBalance > 0 ? `<span style="color:var(--danger);font-weight:700">미수금 ${App.formatCurrency(unpaidBalance)}</span>` : ''}
            ${noshowCount > 0 ? `<span style="color:var(--danger);font-weight:700">노쇼 ${noshowCount}회</span>` : ''}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-success" id="btn-send-message" data-customer-id="${customer.id}">메시지</button>
          <button class="btn btn-primary" id="btn-new-appt-for-customer" data-customer-id="${customer.id}">+ 예약</button>
          <button class="btn btn-secondary btn-edit-customer" data-id="${customer.id}">수정</button>
          <button class="btn btn-danger btn-delete-customer" data-id="${customer.id}">삭제</button>
        </div>
      </div>

      <div class="detail-section">
        <div class="info-grid">
          <div class="info-item"><label>주소</label><span>${App.escapeHtml(customer.address || '-')}</span></div>
          <div class="info-item"><label>메모</label><span>${App.escapeHtml(customer.memo || '-')}</span></div>
        </div>
      </div>

      ${visitCount > 0 ? (() => {
        const avgSpend = Math.round(totalSpend / visitCount);
        const firstVisit = records.length > 0 ? records[records.length - 1].date : null;
        const lastVisitDate = records.length > 0 ? records[0].date : null;
        let avgCycle = '-';
        if (records.length >= 2) {
          const dates = records.map(r => new Date(r.date)).sort((a, b) => a - b);
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
                  : `<div class="pet-avatar">&#x1F436;</div>`
                }
                <div>
                  <div class="pet-name">${App.escapeHtml(p.name)}</div>
                  <div class="pet-breed">${App.escapeHtml(p.breed || '견종 미입력')} | ${p.weight ? p.weight + 'kg' : '체중 미입력'}</div>
                  ${petNotes.length > 0 ? `<div style="font-size:0.78rem;color:var(--danger);margin-top:4px;line-height:1.3">&#x26A0; ${petNotes.map(n => App.escapeHtml(n)).join(', ')}</div>` : ''}
                </div>
              </div>
            `}).join('')}
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">최근 미용 기록</h3>
        ${await (async () => {
          if (records.length === 0) return '<p style="color:var(--text-muted)">미용 기록이 없습니다.</p>';
          const allPets = await DB.getAll('pets');
          const petMap = {}; allPets.forEach(p => petMap[p.id] = p);
          const allServices = await DB.getAll('services');
          const serviceMap = {}; allServices.forEach(s => serviceMap[s.id] = s.name);
          const _isMobile = window.matchMedia('(max-width: 768px)').matches;
          if (_isMobile) {
            return records.slice(0, 10).map(r => {
              const pet = petMap[r.petId];
              const serviceNames = (r.serviceNames && r.serviceNames.length > 0) ? r.serviceNames.join(', ') : (r.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ') || '-';
              return `<div style="padding:12px 0;border-bottom:1px solid var(--border-light)${r.paymentMethod === 'unpaid' ? ';border-left:4px solid var(--danger);padding-left:12px' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <strong style="font-size:0.9rem">${App.formatDate(r.date)}</strong>
                  <strong style="color:var(--primary)">${App.formatCurrency(App.getRecordAmount(r))}</strong>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary)">${App.escapeHtml(pet?.name || '-')} · ${App.escapeHtml(serviceNames)} · ${App.escapeHtml(r.groomer || '-')} · ${App.pages.records.getPaymentLabel(r.paymentMethod)}</div>
              </div>`;
            }).join('') + (records.length > 10 ? '<div style="text-align:center;padding:12px;font-size:0.82rem;color:var(--text-muted)">최근 10건 표시</div>' : '');
          }
          return `
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>날짜</th><th>반려견</th><th>서비스</th><th>금액</th><th>담당</th><th>결제</th></tr></thead>
              <tbody>
                ${records.slice(0, 10).map(r => {
                  const pet = petMap[r.petId];
                  const serviceNames = (r.serviceNames && r.serviceNames.length > 0) ? r.serviceNames.join(', ') : (r.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ') || '-';
                  return `<tr${r.paymentMethod === 'unpaid' ? ' style="background:var(--warning-light)"' : ''}>
                    <td>${App.formatDate(r.date)}</td>
                    <td>${App.escapeHtml(pet?.name || '-')}</td>
                    <td>${App.escapeHtml(serviceNames)}</td>
                    <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></td>
                    <td>${App.escapeHtml(r.groomer || '-')}</td>
                    <td>${App.pages.records.getPaymentLabel(r.paymentMethod)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;
        })()}
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
          <textarea id="msg-preview" rows="4" style="background:var(--bg);font-size:0.9rem"></textarea>
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
        '고객명': App.getCustomerLabel(customer),
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

  async showForm(id, afterSaveCallback) {
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
      ` : `
        <!-- 필수 항목 먼저 -->
        <div class="form-group">
          <label class="form-label">&#x1F436; 반려견 이름 <span class="required">*</span></label>
          <input type="text" id="f-petName" placeholder="반려견 이름">
        </div>
        <div class="form-group">
          <label class="form-label">&#x1F4DE; 연락처 <span class="required">*</span></label>
          <input type="tel" id="f-phone" value="" placeholder="010-0000-0000">
          <div id="phone-match-hint"></div>
        </div>
        <!-- 선택 항목 -->
        <div style="border-top:1px dashed var(--border);margin-top:14px;padding-top:14px">
          <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px">선택 항목 (나중에 수정 가능)</div>
          <div class="form-group">
            <label class="form-label">보호자 이름</label>
            <input type="text" id="f-name" value="" placeholder="보호자 이름" maxlength="50">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">견종</label>
              <input type="text" id="f-petBreed" placeholder="예: 말티즈, 푸들">
            </div>
            <div class="form-group">
              <label class="form-label">몸무게 (kg)</label>
              <input type="number" id="f-petWeight" placeholder="예: 3.5" step="0.1" min="0">
            </div>
          </div>
        </div>
      `,
      onSave: () => this.saveCustomer(id)
    });

    // 신규: 반려견 이름에 포커스 (iOS 모달 autofocus 미지원 대응)
    if (!id) {
      setTimeout(() => document.getElementById('f-petName')?.focus(), 300);
    }

    // 신규 등록: 연락처 실시간 중복 매칭 힌트
    if (!id) {
      const phoneInput = document.getElementById('f-phone');
      const hintEl = document.getElementById('phone-match-hint');
      if (phoneInput && hintEl) {
        const allCustomers = await DB.getAll('customers');
        const checkPhone = App.debounce(() => {
          const digits = (phoneInput.value || '').replace(/\D/g, '');
          hintEl.innerHTML = '';
          if (digits.length < 4) return;
          const match = allCustomers.find(c => (c.phone || '').replace(/\D/g, '') === digits);
          if (match) {
            const pets = this._petNames?.[match.id] || '';
            hintEl.innerHTML = `<div style="color:var(--warning);font-size:0.85rem;margin-top:6px;font-weight:600">&#x26A0; 이미 등록된 번호: ${App.escapeHtml(App.getCustomerLabel(match))}${pets ? ' (' + App.escapeHtml(pets) + ')' : ''} <a href="#customers/${match.id}" style="color:var(--primary);margin-left:6px" onclick="App.closeModal()">상세 보기</a></div>`;
          }
        }, 300);
        phoneInput.addEventListener('input', checkPhone);
        // 반려견 이름 캐시 (힌트용)
        const allPets = await DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle']);
        this._petNames = {};
        allPets.forEach(p => {
          if (!this._petNames[p.customerId]) this._petNames[p.customerId] = p.name;
          else this._petNames[p.customerId] += ', ' + p.name;
        });
      }
    }
  },

  async saveCustomer(id) {
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const address = document.getElementById('f-address')?.value?.trim() || '';
    const birthday = document.getElementById('f-birthday')?.value || '';
    const memo = document.getElementById('f-memo')?.value?.trim() || '';

    const tags = [];
    document.querySelectorAll('input[name="customerTag"]:checked').forEach(cb => tags.push(cb.value));

    if (!phone) { App.showToast('연락처를 입력해주세요.', 'error'); App.highlightField('f-phone'); return; }
    // 신규 등록 시 반려견 이름 필수
    const petNameVal = document.getElementById('f-petName')?.value?.trim();
    if (!id && !petNameVal) { App.showToast('반려견 이름을 입력해주세요.', 'error'); App.highlightField('f-petName'); return; }

    // Check phone duplicate
    const allCustomers = await DB.getAll('customers');
    const duplicate = allCustomers.find(c => (c.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, '') && c.id !== id);
    if (duplicate) {
      App.showToast(`이미 등록된 연락처입니다 (${App.getCustomerLabel(duplicate)})`, 'error');
      return;
    }

    try {
      const data = { name, phone, address, birthday, memo, tags };

      let newId = id;
      if (id) {
        const existing = await DB.get('customers', id);
        Object.assign(existing, data);
        await DB.update('customers', existing);
        App.showToast('고객 정보가 수정되었습니다.');
      } else {
        newId = await DB.add('customers', data);

        // 인라인 반려견 등록 (이름이 입력된 경우)
        const petName = (document.getElementById('f-petName')?.value || '').trim();
        const petBreed = (document.getElementById('f-petBreed')?.value || '').trim();
        const petWeight = parseFloat(document.getElementById('f-petWeight')?.value) || null;
        if (petName) {
          try {
            const petData = { name: petName, breed: petBreed, customerId: newId };
            if (petWeight) { petData.weight = petWeight; petData.size = petWeight < 7 ? 'small' : petWeight < 15 ? 'medium' : 'large'; }
            await DB.add('pets', petData);
          } catch (e) {
            console.warn('Inline pet registration error:', e);
          }
        }
      }

      App.closeModal();

      // afterSaveCallback이 있으면 호출 (예약/기록에서 고객 선택 시)
      const callback = this._afterSaveCallback;
      this._afterSaveCallback = null;
      if (callback) {
        callback(newId, name);
        return;
      }

      // 새 고객 등록 완료 모달
      if (!id) {
        const petNameForDisplay = (document.getElementById('f-petName')?.value || '').trim();
        const displayLabel = petNameForDisplay ? petNameForDisplay + (name ? ' (' + name + ')' : '') : (name || '신규 고객');
        App.handleRoute();
        App.showModal({
          title: '등록 완료',
          hideFooter: true,
          content: `
            <div style="text-align:center;padding:16px 0">
              <div style="font-size:2.2rem;margin-bottom:10px">&#x2705;</div>
              <div style="font-size:1rem;font-weight:700;margin-bottom:16px">${App.escapeHtml(displayLabel)} 등록되었습니다</div>
              <div style="display:flex;flex-direction:column;gap:8px;max-width:260px;margin:0 auto">
                <button class="btn btn-primary" id="post-cust-appt">&#x1F4C5; 예약 등록</button>
                <button class="btn btn-secondary" id="post-cust-detail">&#x1F4DD; 상세 보기</button>
                <button class="btn btn-secondary" id="post-cust-close" style="opacity:0.7">완료</button>
              </div>
            </div>
          `
        });
        document.getElementById('post-cust-appt')?.addEventListener('click', () => {
          App.closeModal();
          App.pages.appointments.showForm(null, newId);
        });
        document.getElementById('post-cust-detail')?.addEventListener('click', () => {
          App.closeModal();
          App.navigate('customers/' + newId);
        });
        document.getElementById('post-cust-close')?.addEventListener('click', () => {
          App.closeModal();
        });
        return;
      }

      App.handleRoute();
    } catch (err) {
      console.error('Save customer error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  async deleteCustomer(id) {
    const customer = await DB.get('customers', id);
    if (!customer) return;

    const confirmed = await App.confirm(`"${App.escapeHtml(App.getCustomerLabel(customer))}" 고객을 삭제하시겠습니까?<br>관련 반려견, 예약, 미용 기록도 함께 삭제됩니다.<br><strong>이 작업은 되돌릴 수 없습니다.</strong>`);
    if (!confirmed) return;

    try {
      const [pets, appointments, records] = await Promise.all([
        DB.getByIndex('pets', 'customerId', id),
        DB.getByIndex('appointments', 'customerId', id),
        DB.getByIndex('records', 'customerId', id)
      ]);
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

  _renderCustomerRow(c, petCount, lastVisit) {
    const displayName = App.getCustomerLabel(c);
    const initial = c.name ? App.escapeHtml(c.name.charAt(0)) : '&#x1F464;';
    const vs = this._customerVisitStatus?.[c.id] || 'normal';
    const visitBadge = vs !== 'normal' ? `<span class="badge ${App.getVisitStatusBadge(vs)}" style="margin-left:6px;font-size:0.72rem;padding:3px 8px">${App.getVisitStatusLabel(vs)}</span>` : '';
    const tagLabelMap = { vip: 'VIP', 'new': '신규', normal: '일반', regular: '단골', caution: '주의' };
    const tagText = (c.tags || []).map(t => tagLabelMap[t] || t).join(' ');
    const searchText = ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.phone || '').replace(/\D/g, '') + ' ' + (c.memo || '') + ' ' + tagText).toLowerCase();
    return `<tr data-id="${c.id}" data-tags="${(c.tags || []).join(',')}" data-visit-status="${vs}" data-search="${App.escapeHtml(searchText)}" class="clickable-row" style="cursor:pointer">
      <td><div style="display:flex;align-items:center;gap:10px"><div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary-light),#E0E7FF);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--primary);font-size:0.85rem;flex-shrink:0">${initial}</div><strong>${App.escapeHtml(displayName)}</strong>${this.getTagBadges(c.tags)}${visitBadge}</div></td>
      <td><a href="tel:${App.escapeHtml((c.phone || '').replace(/\D/g, ''))}" style="color:var(--primary)" onclick="event.stopPropagation()">${App.formatPhone(c.phone)}</a></td>
      <td><span class="badge badge-info">${petCount[c.id] || 0}마리</span></td>
      <td>${lastVisit[c.id] ? App.getRelativeTime(lastVisit[c.id]) : '-'}</td>
      <td>${App.formatDate(c.createdAt)}</td>
      <td class="table-actions"><button class="btn-icon btn-edit-customer" data-id="${c.id}" title="수정">&#x270F;</button><button class="btn-icon btn-delete-customer text-danger" data-id="${c.id}" title="삭제">&#x1F5D1;</button></td>
    </tr>`;
  },

  _renderCustomerCard(c, petCount, lastVisit) {
    const displayName = App.getCustomerLabel(c);
    const initial = c.name ? App.escapeHtml(c.name.charAt(0)) : '&#x1F464;';
    const vs = this._customerVisitStatus?.[c.id] || 'normal';
    const visitBadge = vs !== 'normal' ? `<span class="badge ${App.getVisitStatusBadge(vs)}" style="margin-left:6px;font-size:0.72rem;padding:3px 8px">${App.getVisitStatusLabel(vs)}</span>` : '';
    const tagLabelMap = { vip: 'VIP', 'new': '신규', normal: '일반', regular: '단골', caution: '주의' };
    const tagText = (c.tags || []).map(t => tagLabelMap[t] || t).join(' ');
    const searchText = ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.phone || '').replace(/\D/g, '') + ' ' + (c.memo || '') + ' ' + tagText).toLowerCase();
    return `<div class="mobile-card clickable-row" data-id="${c.id}" data-tags="${(c.tags || []).join(',')}" data-visit-status="${vs}" data-search="${App.escapeHtml(searchText)}" style="cursor:pointer">
      <div class="mobile-card-header"><div style="display:flex;align-items:center;gap:10px"><div class="mobile-card-avatar">${initial}</div><strong>${App.escapeHtml(displayName)}</strong>${this.getTagBadges(c.tags)}${visitBadge}</div><span class="badge badge-info">${petCount[c.id] || 0}마리</span></div>
      <div class="mobile-card-body"><a href="tel:${App.escapeHtml((c.phone || '').replace(/\D/g, ''))}" class="mobile-card-phone" onclick="event.stopPropagation()">&#x1F4DE; ${App.formatPhone(c.phone)}</a><span class="mobile-card-meta-text">${lastVisit[c.id] ? '최근 방문: ' + App.getRelativeTime(lastVisit[c.id]) : '방문 기록 없음'}</span>
      <div style="display:flex;gap:4px;margin-top:8px;border-top:1px solid var(--border-light);padding-top:8px"><button class="btn btn-sm btn-secondary btn-edit-customer flex-1" data-id="${c.id}" onclick="event.stopPropagation()">수정</button><button class="btn btn-sm btn-danger btn-delete-customer flex-1" data-id="${c.id}" onclick="event.stopPropagation()">삭제</button></div></div>
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

    document.querySelectorAll('#customer-table tbody tr').forEach(row => {
      row.style.display = matchesFilter(row) ? '' : 'none';
    });

    document.querySelectorAll('#customer-card-list .mobile-card').forEach(card => {
      card.style.display = matchesFilter(card) ? '' : 'none';
    });
  },

};
