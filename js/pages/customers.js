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

    // Restore sort key from sessionStorage if not already set
    if (!this._sortKey) {
      try {
        const sf = sessionStorage.getItem('customer-filter');
        if (sf) { const f = JSON.parse(sf); if (f.sort) this._sortKey = f.sort; }
      } catch (e) { /* ignore */ }
    }

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
          <div class="search-box">
            <span class="search-icon">&#x1F50D;</span>
            <input type="text" id="customer-search" placeholder="이름, 전화번호 검색...">
          </div>
          <select id="customer-tag-filter" style="width:auto;min-width:100px;font-size:0.85rem;padding:8px 12px">
            <option value="">전체 분류</option>
            <option value="vip">VIP</option>
            <option value="new">신규</option>
            <option value="normal">일반</option>
            <option value="regular">단골</option>
            <option value="caution">주의</option>
          </select>
          <select id="customer-sort" style="width:auto;min-width:120px;font-size:0.85rem;padding:8px 12px">
            <option value="name" ${sortKey === 'name' ? 'selected' : ''}>이름순</option>
            <option value="lastVisit" ${sortKey === 'lastVisit' ? 'selected' : ''}>최근방문순</option>
            <option value="createdAt" ${sortKey === 'createdAt' ? 'selected' : ''}>등록일순</option>
            <option value="visitCount" ${sortKey === 'visitCount' ? 'selected' : ''}>방문횟수순</option>
          </select>
          <button class="btn btn-primary" id="btn-add-customer">+ 새 고객</button>
        </div>
      </div>
      <div class="card">
        <div class="card-body no-padding">
          <div class="table-container">
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
                ` : sorted.map(c => {
                  const initial = c.name ? c.name.charAt(0) : '?';
                  const daysAgo = lastVisit[c.id] ? App.getDaysAgo(lastVisit[c.id]) : null;
                  const absenceBadge = daysAgo >= 60 ? '<span class="badge badge-danger" style="margin-left:6px;font-size:0.65rem">60일+</span>' : daysAgo >= 30 ? '<span class="badge badge-warning" style="margin-left:6px;font-size:0.65rem">30일+</span>' : '';
                  return `
                  <tr data-id="${c.id}" data-tags="${(c.tags || []).join(',')}" class="clickable-row" style="cursor:pointer">
                    <td>
                      <div style="display:flex;align-items:center;gap:10px">
                        <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary-light),#E0E7FF);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--primary);font-size:0.85rem;flex-shrink:0">${App.escapeHtml(initial)}</div>
                        <strong>${App.escapeHtml(c.name)}</strong>${this.getTagBadges(c.tags)}${absenceBadge}
                      </div>
                    </td>
                    <td><a href="tel:${App.escapeHtml((c.phone || '').replace(/\D/g, ''))}" style="color:var(--primary)" onclick="event.stopPropagation()">${App.formatPhone(c.phone)}</a></td>
                    <td><span class="badge badge-info">${petCount[c.id] || 0}마리</span></td>
                    <td>${lastVisit[c.id] ? App.getRelativeTime(lastVisit[c.id]) : '-'}</td>
                    <td>${App.formatDate(c.createdAt)}</td>
                    <td class="table-actions">
                      <button class="btn-icon btn-edit-customer" data-id="${c.id}" title="수정">&#x270F;</button>
                      <button class="btn-icon btn-delete-customer" data-id="${c.id}" title="삭제" style="color:var(--danger)">&#x1F5D1;</button>
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Mobile Card List -->
          <div class="mobile-card-list" id="customer-card-list">
            ${sorted.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">&#x1F464;</div>
                <div class="empty-state-text">등록된 고객이 없습니다</div>
                <button class="btn btn-primary" onclick="document.getElementById('btn-add-customer').click()">첫 고객 등록하기</button>
              </div>
            ` : sorted.map(c => {
              const initial = c.name ? c.name.charAt(0) : '?';
              const daysAgoM = lastVisit[c.id] ? App.getDaysAgo(lastVisit[c.id]) : null;
              const absenceBadgeM = daysAgoM >= 60 ? '<span class="badge badge-danger" style="margin-left:6px;font-size:0.65rem">60일+</span>' : daysAgoM >= 30 ? '<span class="badge badge-warning" style="margin-left:6px;font-size:0.65rem">30일+</span>' : '';
              return `
              <div class="mobile-card clickable-row" data-id="${c.id}" data-tags="${(c.tags || []).join(',')}" style="cursor:pointer">
                <div class="mobile-card-header">
                  <div style="display:flex;align-items:center;gap:10px">
                    <div class="mobile-card-avatar">${App.escapeHtml(initial)}</div>
                    <strong>${App.escapeHtml(c.name)}</strong>${this.getTagBadges(c.tags)}${absenceBadgeM}
                  </div>
                  <span class="badge badge-info">${petCount[c.id] || 0}마리</span>
                </div>
                <div class="mobile-card-body">
                  <a href="tel:${App.escapeHtml((c.phone || '').replace(/\D/g, ''))}" class="mobile-card-phone" onclick="event.stopPropagation()">&#x1F4DE; ${App.formatPhone(c.phone)}</a>
                  <span class="mobile-card-meta-text">${lastVisit[c.id] ? '최근 방문: ' + App.getRelativeTime(lastVisit[c.id]) : '방문 기록 없음'}</span>
                  <div style="display:flex;gap:4px;margin-top:8px;border-top:1px solid var(--border-light);padding-top:8px">
                    <button class="btn btn-sm btn-secondary btn-edit-customer" data-id="${c.id}" style="flex:1" onclick="event.stopPropagation()">수정</button>
                    <button class="btn btn-sm btn-danger btn-delete-customer" data-id="${c.id}" style="flex:1" onclick="event.stopPropagation()">삭제</button>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>

        </div>
      </div>
    `;
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
      <div class="back-link" onclick="App.navigate('customers')">&#x2190; 고객 목록</div>
      <div class="detail-header">
        <div class="detail-avatar">&#x1F464;</div>
        <div class="detail-info">
          <h2>${App.escapeHtml(customer.name)}${this.getTagBadges(customer.tags)}</h2>
          <div class="detail-meta">
            <a href="tel:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" style="color:var(--primary)">&#x1F4DE; ${App.formatPhone(customer.phone)}</a>
            <a href="sms:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" style="color:var(--primary);font-size:0.85rem" title="문자 보내기">&#x1F4AC; 문자</a>
            <span>방문 ${visitCount}회</span>
            <span>총 ${App.formatCurrency(totalSpend)}</span>
            ${unpaidBalance > 0 ? `<span style="color:var(--danger);font-weight:700">미수금 ${App.formatCurrency(unpaidBalance)}</span>` : ''}
            ${noshowCount > 0 ? `<span style="color:var(--danger);font-weight:700">노쇼 ${noshowCount}회</span>` : ''}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
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
                ${p.photo
                  ? `<img src="${p.photo}" class="photo-viewable" data-caption="${App.escapeHtml(p.name)}" style="width:48px;height:48px;object-fit:cover;border-radius:var(--radius);flex-shrink:0" alt="${App.escapeHtml(p.name)}" onclick="event.stopPropagation()">`
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
          return `
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>날짜</th><th>반려견</th><th>서비스</th><th>금액</th><th>담당</th><th>결제</th><th>사진</th></tr></thead>
              <tbody>
                ${records.slice(0, 10).map(r => {
                  const pet = petMap[r.petId];
                  const serviceNames = (r.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ') || '-';
                  const hasPhotos = r.photoBefore || r.photoAfter;
                  return `<tr${r.paymentMethod === 'unpaid' ? ' style="background:var(--warning-light)"' : ''}>
                    <td>${App.formatDate(r.date)}</td>
                    <td>${App.escapeHtml(pet?.name || '-')}</td>
                    <td>${App.escapeHtml(serviceNames)}</td>
                    <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></td>
                    <td>${App.escapeHtml(r.groomer || '-')}</td>
                    <td>${App.pages.records.getPaymentLabel(r.paymentMethod)}</td>
                    <td>${hasPhotos ? `<button class="btn-icon" onclick="App.pages.records.showPhotosById(${r.id})" title="사진 보기">&#x1F4F7;</button>` : '-'}</td>
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

    // Search
    document.getElementById('customer-search')?.addEventListener('input', (e) => {
      this._searchQuery = e.target.value;
      this.applyFilters();
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
        if (f.search || f.tag) this.applyFilters();
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
  },

  async showForm(id, afterSaveCallback) {
    let customer = id ? await DB.get('customers', id) : {};

    // afterSaveCallback 저장 (saveCustomer에서 사용)
    this._afterSaveCallback = afterSaveCallback || null;

    App.showModal({
      title: id ? '고객 정보 수정' : '새 고객 등록',
      content: `
        <div class="form-group">
          <label class="form-label">이름 <span class="required">*</span></label>
          <input type="text" id="f-name" value="${App.escapeHtml(customer.name || '')}" placeholder="고객 이름">
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
            <label class="checkbox-label"><input type="checkbox" name="customerTag" value="regular" ${(customer.tags || []).includes('regular') ? 'checked' : ''}> 단골</label>
            <label class="checkbox-label"><input type="checkbox" name="customerTag" value="caution" ${(customer.tags || []).includes('caution') ? 'checked' : ''}> 주의</label>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">메모</label>
          <textarea id="f-memo" placeholder="특이사항, 메모 등">${App.escapeHtml(customer.memo || '')}</textarea>
        </div>
        ${!id ? `
        <div style="border-top:1px dashed var(--border);margin-top:16px;padding-top:16px">
          <div style="font-weight:700;margin-bottom:10px;font-size:0.95rem">&#x1F436; 반려견 함께 등록 <span style="font-weight:400;color:var(--text-muted);font-size:0.85rem">(선택)</span></div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">반려견 이름</label>
              <input type="text" id="f-petName" placeholder="반려견 이름">
            </div>
            <div class="form-group">
              <label class="form-label">견종</label>
              <input type="text" id="f-petBreed" placeholder="예: 말티즈, 푸들">
            </div>
          </div>
        </div>
        ` : ''}
      `,
      onSave: () => this.saveCustomer(id)
    });
  },

  async saveCustomer(id) {
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const address = document.getElementById('f-address').value.trim();
    const birthday = document.getElementById('f-birthday')?.value || '';
    const memo = document.getElementById('f-memo').value.trim();

    const tags = [];
    document.querySelectorAll('input[name="customerTag"]:checked').forEach(cb => tags.push(cb.value));

    if (!name) { App.showToast('이름을 입력해주세요.', 'error'); App.highlightField('f-name'); return; }
    if (!phone) { App.showToast('연락처를 입력해주세요.', 'error'); App.highlightField('f-phone'); return; }

    // Check phone duplicate
    const allCustomers = await DB.getAll('customers');
    const duplicate = allCustomers.find(c => (c.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, '') && c.id !== id);
    if (duplicate) {
      App.showToast(`이미 등록된 연락처입니다 (${duplicate.name})`, 'error');
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
        App.showToast('새 고객이 등록되었습니다.');

        // 인라인 반려견 등록 (이름이 입력된 경우)
        const petName = (document.getElementById('f-petName')?.value || '').trim();
        const petBreed = (document.getElementById('f-petBreed')?.value || '').trim();
        if (petName) {
          try {
            await DB.add('pets', { name: petName, breed: petBreed, customerId: newId });
            App.showToast(`반려견 "${petName}"도 함께 등록되었습니다.`);
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

      App.handleRoute();
    } catch (err) {
      console.error('Save customer error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  async deleteCustomer(id) {
    const customer = await DB.get('customers', id);
    if (!customer) return;

    const confirmed = await App.confirm(`"${App.escapeHtml(customer.name)}" 고객을 삭제하시겠습니까?<br>관련 반려견, 예약, 미용 기록도 모두 삭제됩니다.`);
    if (!confirmed) return;

    try {
      // Delete related data
      const pets = await DB.getByIndex('pets', 'customerId', id);
      for (const pet of pets) await DB.delete('pets', pet.id);

      const appointments = await DB.getByIndex('appointments', 'customerId', id);
      for (const appt of appointments) await DB.delete('appointments', appt.id);

      const records = await DB.getByIndex('records', 'customerId', id);
      for (const rec of records) await DB.delete('records', rec.id);

      await DB.delete('customers', id);
      App.showToast('고객이 삭제되었습니다.');
      App.navigate('customers');
    } catch (err) {
      console.error('Delete customer error:', err);
      App.showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  },

  getTagBadges(tags) {
    if (!tags || tags.length === 0) return '';
    const tagLabels = { vip: 'VIP', 'new': '신규', normal: '일반', regular: '단골', caution: '주의' };
    const tagColors = { vip: 'badge-warning', 'new': 'badge-info', normal: 'badge-secondary', regular: 'badge-success', caution: 'badge-danger' };
    return tags.map(t => `<span class="badge ${tagColors[t] || 'badge-secondary'}" style="font-size:0.6rem;margin-left:4px">${tagLabels[t] || t}</span>`).join('');
  },

  _searchQuery: '',
  _tagFilter: '',

  applyFilters() {
    const q = (this._searchQuery || '').toLowerCase();
    const tag = this._tagFilter || '';

    // Save filter state to sessionStorage
    sessionStorage.setItem('customer-filter', JSON.stringify({
      search: this._searchQuery || '',
      tag,
      sort: this._sortKey || 'name'
    }));

    const matchesFilter = (el) => {
      const textMatch = !q || el.textContent.toLowerCase().includes(q);
      const tagMatch = !tag || (el.dataset.tags || '').split(',').includes(tag);
      return textMatch && tagMatch;
    };

    document.querySelectorAll('#customer-table tbody tr').forEach(row => {
      row.style.display = matchesFilter(row) ? '' : 'none';
    });

    document.querySelectorAll('#customer-card-list .mobile-card').forEach(card => {
      card.style.display = matchesFilter(card) ? '' : 'none';
    });
  },

};
