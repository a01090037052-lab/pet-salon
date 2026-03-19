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
    const customers = await DB.getAll('customers');
    const pets = await DB.getAll('pets');
    const records = await DB.getAll('records');

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

    const sorted = customers.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

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
                  return `
                  <tr data-id="${c.id}" class="clickable-row" style="cursor:pointer">
                    <td>
                      <div style="display:flex;align-items:center;gap:10px">
                        <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary-light),#E0E7FF);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--primary);font-size:0.85rem;flex-shrink:0">${App.escapeHtml(initial)}</div>
                        <strong>${App.escapeHtml(c.name)}</strong>
                      </div>
                    </td>
                    <td><a href="tel:${App.escapeHtml(c.phone.replace(/\D/g, ''))}" style="color:var(--primary)" onclick="event.stopPropagation()">${App.formatPhone(c.phone)}</a></td>
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

    const totalSpend = records.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
    const visitCount = records.length;

    container.innerHTML = `
      <div class="back-link" onclick="App.navigate('customers')">&#x2190; 고객 목록</div>
      <div class="detail-header">
        <div class="detail-avatar">&#x1F464;</div>
        <div class="detail-info">
          <h2>${App.escapeHtml(customer.name)}</h2>
          <div class="detail-meta">
            <a href="tel:${App.escapeHtml(customer.phone.replace(/\D/g, ''))}" style="color:var(--primary)">&#x1F4DE; ${App.formatPhone(customer.phone)}</a>
            <span>방문 ${visitCount}회</span>
            <span>총 ${App.formatCurrency(totalSpend)}</span>
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

      <div class="detail-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="detail-section-title" style="margin-bottom:0;border:none;padding:0">반려견 (${pets.length}마리)</h3>
          <button class="btn btn-sm btn-primary" id="btn-add-pet-for-customer" data-customer-id="${customer.id}">+ 반려견 등록</button>
        </div>
        <div class="grid-3">
          ${pets.length === 0 ? '<p style="color:var(--text-muted)">등록된 반려견이 없습니다.</p>' :
            pets.map(p => `
              <div class="pet-card" onclick="App.navigate('pets/${p.id}')">
                <div class="pet-avatar">&#x1F436;</div>
                <div>
                  <div class="pet-name">${App.escapeHtml(p.name)}</div>
                  <div class="pet-breed">${App.escapeHtml(p.breed || '견종 미입력')} | ${p.weight ? p.weight + 'kg' : '체중 미입력'}</div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">최근 미용 기록</h3>
        ${records.length === 0 ? '<p style="color:var(--text-muted)">미용 기록이 없습니다.</p>' : `
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>날짜</th><th>반려견</th><th>서비스</th><th>금액</th><th>담당</th></tr></thead>
              <tbody>
                ${(await Promise.all(records.slice(0, 10).map(async r => {
                  const pet = await DB.get('pets', r.petId);
                  const serviceNames = await App.getServiceNames(r.serviceIds);
                  return `<tr>
                    <td>${App.formatDate(r.date)}</td>
                    <td>${App.escapeHtml(pet?.name || '-')}</td>
                    <td>${App.escapeHtml(serviceNames)}</td>
                    <td><strong>${App.formatCurrency(r.totalPrice)}</strong></td>
                    <td>${App.escapeHtml(r.groomer || '-')}</td>
                  </tr>`;
                }))).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  async init(params) {
    // Add customer button
    document.getElementById('btn-add-customer')?.addEventListener('click', () => this.showForm());

    // Search
    document.getElementById('customer-search')?.addEventListener('input', (e) => this.filterTable(e.target.value));

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

  async showForm(id) {
    let customer = id ? await DB.get('customers', id) : {};

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
        <div class="form-group">
          <label class="form-label">주소</label>
          <input type="text" id="f-address" value="${App.escapeHtml(customer.address || '')}" placeholder="주소">
        </div>
        <div class="form-group">
          <label class="form-label">메모</label>
          <textarea id="f-memo" placeholder="특이사항, 메모 등">${App.escapeHtml(customer.memo || '')}</textarea>
        </div>
      `,
      onSave: () => this.saveCustomer(id)
    });
  },

  async saveCustomer(id) {
    const name = document.getElementById('f-name').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const address = document.getElementById('f-address').value.trim();
    const memo = document.getElementById('f-memo').value.trim();

    if (!name) { App.showToast('이름을 입력해주세요.', 'error'); return; }
    if (!phone) { App.showToast('연락처를 입력해주세요.', 'error'); return; }

    // Check phone duplicate
    const allCustomers = await DB.getAll('customers');
    const duplicate = allCustomers.find(c => c.phone.replace(/\D/g, '') === phone.replace(/\D/g, '') && c.id !== id);
    if (duplicate) {
      App.showToast(`이미 등록된 연락처입니다 (${duplicate.name})`, 'error');
      return;
    }

    try {
      const data = { name, phone, address, memo };

      if (id) {
        const existing = await DB.get('customers', id);
        Object.assign(existing, data);
        await DB.update('customers', existing);
        App.showToast('고객 정보가 수정되었습니다.');
      } else {
        await DB.add('customers', data);
        App.showToast('새 고객이 등록되었습니다.');
      }

      App.closeModal();
      App.handleRoute();
    } catch (err) {
      console.error('Save customer error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  async deleteCustomer(id) {
    const customer = await DB.get('customers', id);
    if (!customer) return;

    const confirmed = await App.confirm(`"${customer.name}" 고객을 삭제하시겠습니까?<br>관련 반려견, 예약, 미용 기록도 모두 삭제됩니다.`);
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

  filterTable(query) {
    const rows = document.querySelectorAll('#customer-table tbody tr');
    const q = query.toLowerCase();
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? '' : 'none';
    });
  }
};
