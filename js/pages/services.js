// ========== Services Page ==========
App.pages.services = {
  async render(container) {
    const services = await DB.getAll('services');
    const active = services.filter(s => s.isActive !== false);
    const inactive = services.filter(s => s.isActive === false);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">서비스 메뉴</h1>
          <p class="page-subtitle">총 ${services.length}개 (활성 ${active.length}개)</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-service">+ 새 서비스</button>
        </div>
      </div>

      <div class="card">
        <div class="card-body no-padding">
          <div class="table-container">
            <table class="data-table" id="service-table">
              <thead>
                <tr>
                  <th>서비스명</th>
                  <th>소형견</th>
                  <th>중형견</th>
                  <th>대형견</th>
                  <th>상태</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                ${services.length === 0 ? `
                  <tr><td colspan="6">
                    <div class="empty-state">
                      <div class="empty-state-icon">&#x1F4CB;</div>
                      <div class="empty-state-text">등록된 서비스가 없습니다</div>
                      <button class="btn btn-primary" onclick="document.getElementById('btn-add-service').click()">첫 서비스 등록하기</button>
                    </div>
                  </td></tr>
                ` : services
                  .sort((a, b) => {
                    if (a.isActive === false && b.isActive !== false) return 1;
                    if (a.isActive !== false && b.isActive === false) return -1;
                    return a.name.localeCompare(b.name, 'ko');
                  })
                  .map(s => `
                  <tr data-id="${s.id}" style="${s.isActive === false ? 'opacity:0.5' : ''}">
                    <td><strong>${App.escapeHtml(s.name)}</strong>${s.description ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${App.escapeHtml(s.description)}</div>` : ''}</td>
                    <td>${App.formatCurrency(s.priceSmall)}</td>
                    <td>${App.formatCurrency(s.priceMedium)}</td>
                    <td>${App.formatCurrency(s.priceLarge)}</td>
                    <td>
                      <span class="badge ${s.isActive !== false ? 'badge-success' : 'badge-secondary'}">
                        ${s.isActive !== false ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td class="table-actions">
                      <button class="btn-icon btn-toggle-service" data-id="${s.id}" title="${s.isActive !== false ? '비활성화' : '활성화'}">
                        ${s.isActive !== false ? '&#x1F7E2;' : '&#x26AA;'}
                      </button>
                      <button class="btn-icon btn-edit-service" data-id="${s.id}" title="수정">&#x270F;</button>
                      <button class="btn-icon btn-delete-service text-danger" data-id="${s.id}" title="삭제">&#x1F5D1;</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <!-- Mobile card list for services -->
          <div class="mobile-card-list">
            ${services.length === 0 ? `
              <div class="empty-state" style="padding:40px 20px">
                <div class="empty-state-icon">&#x1F4CB;</div>
                <div class="empty-state-text">등록된 서비스가 없습니다</div>
                <button class="btn btn-primary" onclick="document.getElementById('btn-add-service').click()">첫 서비스 등록하기</button>
              </div>
            ` : services
              .sort((a, b) => {
                if (a.isActive === false && b.isActive !== false) return 1;
                if (a.isActive !== false && b.isActive === false) return -1;
                return a.name.localeCompare(b.name, 'ko');
              })
              .map(s => `
              <div class="mobile-card" data-id="${s.id}" style="${s.isActive === false ? 'opacity:0.5' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                  <div>
                    <strong style="font-size:0.95rem">${App.escapeHtml(s.name)}</strong>
                    ${s.description ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${App.escapeHtml(s.description)}</div>` : ''}
                  </div>
                  <span class="badge ${s.isActive !== false ? 'badge-success' : 'badge-secondary'}" style="flex-shrink:0;margin-left:8px">
                    ${s.isActive !== false ? '활성' : '비활성'}
                  </span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;font-size:0.82rem">
                  <div style="text-align:center;background:var(--bg);border-radius:var(--radius);padding:8px 4px">
                    <div style="color:var(--text-muted);font-size:0.72rem;margin-bottom:2px">소형견</div>
                    <div style="font-weight:700">${App.formatCurrency(s.priceSmall)}</div>
                  </div>
                  <div style="text-align:center;background:var(--bg);border-radius:var(--radius);padding:8px 4px">
                    <div style="color:var(--text-muted);font-size:0.72rem;margin-bottom:2px">중형견</div>
                    <div style="font-weight:700">${App.formatCurrency(s.priceMedium)}</div>
                  </div>
                  <div style="text-align:center;background:var(--bg);border-radius:var(--radius);padding:8px 4px">
                    <div style="color:var(--text-muted);font-size:0.72rem;margin-bottom:2px">대형견</div>
                    <div style="font-weight:700">${App.formatCurrency(s.priceLarge)}</div>
                  </div>
                </div>
                <div style="display:flex;gap:6px;justify-content:flex-end">
                  <button class="btn-icon btn-toggle-service" data-id="${s.id}" title="${s.isActive !== false ? '비활성화' : '활성화'}">
                    ${s.isActive !== false ? '&#x1F7E2;' : '&#x26AA;'}
                  </button>
                  <button class="btn-icon btn-edit-service" data-id="${s.id}" title="수정">&#x270F;</button>
                  <button class="btn-icon btn-delete-service text-danger" data-id="${s.id}" title="삭제">&#x1F5D1;</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      ${services.length === 0 ? `
        <div style="margin-top:20px;background:linear-gradient(135deg,#6366F1,#8B5CF6);border-radius:var(--radius-xl);padding:28px 32px;color:#fff;position:relative;overflow:hidden">
          <div style="position:absolute;top:-30%;right:-5%;width:200px;height:200px;background:rgba(255,255,255,0.08);border-radius:50%"></div>
          <h3 style="font-weight:800;margin-bottom:6px;font-size:1.15rem;position:relative;z-index:1">&#x1F4A1; 기본 서비스로 빠르게 시작하세요</h3>
          <p style="opacity:0.85;margin-bottom:16px;font-size:0.9rem;position:relative;z-index:1">전체 미용, 목욕, 위생 미용 등 10개의 기본 서비스를 자동으로 등록합니다.</p>
          <button class="btn" id="btn-init-services" style="background:#fff;color:var(--primary);font-weight:700;position:relative;z-index:1">기본 서비스 자동 등록</button>
        </div>
      ` : ''}
    `;
  },

  async init() {
    document.getElementById('btn-add-service')?.addEventListener('click', () => this.showForm());

    document.querySelectorAll('.btn-edit-service').forEach(btn => {
      btn.addEventListener('click', () => this.showForm(Number(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-delete-service').forEach(btn => {
      btn.addEventListener('click', () => this.deleteService(Number(btn.dataset.id)));
    });

    document.querySelectorAll('.btn-toggle-service').forEach(btn => {
      btn.addEventListener('click', () => this.toggleService(Number(btn.dataset.id)));
    });

    document.getElementById('btn-init-services')?.addEventListener('click', () => this.initDefaultServices());
  },

  async showForm(id) {
    let service = id ? await DB.get('services', id) : { isActive: true };

    App.showModal({
      title: id ? '서비스 수정' : '새 서비스 등록',
      content: `
        <div class="form-group">
          <label class="form-label">서비스명 <span class="required">*</span></label>
          <input type="text" id="f-name" value="${App.escapeHtml(service.name || '')}" placeholder="예: 전체 미용, 부분 목욕">
        </div>
        <div class="form-group">
          <label class="form-label">설명</label>
          <textarea id="f-description" placeholder="서비스 상세 설명">${App.escapeHtml(service.description || '')}</textarea>
        </div>
        <div class="form-row three">
          <div class="form-group">
            <label class="form-label">소형견 가격 (원)</label>
            <input type="number" id="f-priceSmall" value="${service.priceSmall || ''}" placeholder="0" min="0" step="1000">
          </div>
          <div class="form-group">
            <label class="form-label">중형견 가격 (원)</label>
            <input type="number" id="f-priceMedium" value="${service.priceMedium || ''}" placeholder="0" min="0" step="1000">
          </div>
          <div class="form-group">
            <label class="form-label">대형견 가격 (원)</label>
            <input type="number" id="f-priceLarge" value="${service.priceLarge || ''}" placeholder="0" min="0" step="1000">
          </div>
        </div>
        <div class="form-hint" style="margin-top:-8px;margin-bottom:16px">사이즈별로 다른 가격을 설정할 수 있습니다</div>
      `,
      onSave: () => this.saveService(id)
    });
  },

  async saveService(id) {
    const name = document.getElementById('f-name').value.trim();
    const description = document.getElementById('f-description').value.trim();
    const priceSmall = Number(document.getElementById('f-priceSmall').value) || 0;
    const priceMedium = Number(document.getElementById('f-priceMedium').value) || 0;
    const priceLarge = Number(document.getElementById('f-priceLarge').value) || 0;

    if (!name) { App.highlightField('f-name'); App.showToast('서비스명을 입력해주세요.', 'error'); return; }

    const data = { name, description, priceSmall, priceMedium, priceLarge, isActive: true };

    if (id) {
      const existing = await DB.get('services', id);
      data.isActive = existing.isActive;
      Object.assign(existing, data);
      await DB.update('services', existing);
      App.showToast('서비스가 수정되었습니다.');
    } else {
      await DB.add('services', data);
      App.showToast('새 서비스가 등록되었습니다.');
    }

    App.closeModal();
    App.handleRoute();
  },

  async toggleService(id) {
    const service = await DB.get('services', id);
    if (!service) return;
    service.isActive = service.isActive === false ? true : false;
    await DB.update('services', service);
    App.showToast(service.isActive ? '서비스가 활성화되었습니다.' : '서비스가 비활성화되었습니다.');
    App.handleRoute();
  },

  async deleteService(id) {
    const service = await DB.get('services', id);
    if (!service) return;
    const confirmed = await App.confirm(`"${App.escapeHtml(service.name)}" 서비스를 삭제하시겠습니까?`);
    if (!confirmed) return;
    await DB.delete('services', id);
    App.showToast('서비스가 삭제되었습니다.');
    App.handleRoute();
  },

  async initDefaultServices() {
    const defaults = [
      { name: '전체 미용', description: '목욕 + 전체 커트 + 귀청소 + 발톱 정리', priceSmall: 50000, priceMedium: 60000, priceLarge: 80000, isActive: true },
      { name: '위생 미용', description: '발바닥, 배, 항문 주변 부분 미용', priceSmall: 15000, priceMedium: 20000, priceLarge: 25000, isActive: true },
      { name: '목욕', description: '샴푸 + 드라이 + 귀청소 + 발톱 정리', priceSmall: 30000, priceMedium: 40000, priceLarge: 50000, isActive: true },
      { name: '스포팅', description: '전체 짧은 커트 (클리퍼 사용)', priceSmall: 40000, priceMedium: 50000, priceLarge: 65000, isActive: true },
      { name: '가위 커트', description: '가위로 전체 스타일링', priceSmall: 55000, priceMedium: 65000, priceLarge: 85000, isActive: true },
      { name: '얼굴 커트', description: '얼굴 부분 스타일링', priceSmall: 10000, priceMedium: 10000, priceLarge: 15000, isActive: true },
      { name: '발톱 정리', description: '발톱 커트 및 갈기', priceSmall: 5000, priceMedium: 5000, priceLarge: 8000, isActive: true },
      { name: '귀 청소', description: '귀 세정 및 귀털 정리', priceSmall: 5000, priceMedium: 5000, priceLarge: 8000, isActive: true },
      { name: '양치', description: '구강 관리 및 양치', priceSmall: 5000, priceMedium: 5000, priceLarge: 5000, isActive: true },
      { name: '엉킴 제거', description: '털 엉킴 제거 (정도에 따라 추가 요금)', priceSmall: 10000, priceMedium: 15000, priceLarge: 20000, isActive: true },
    ];

    for (const service of defaults) {
      await DB.add('services', service);
    }

    App.showToast(`기본 서비스 ${defaults.length}개가 등록되었습니다.`);
    App.handleRoute();
  }
};
