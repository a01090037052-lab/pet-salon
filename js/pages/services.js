// ========== Services Page ==========
App.pages.services = {
  _categoryLabels: { grooming: '미용 코스', addon: '추가 옵션', care: '단독 케어' },
  _categoryOrder: ['grooming', 'addon', 'care'],

  _sortServices(services) {
    const catOrder = this._categoryOrder;
    return services.sort((a, b) => {
      // 비활성 → 맨 뒤
      if (a.isActive === false && b.isActive !== false) return 1;
      if (a.isActive !== false && b.isActive === false) return -1;
      // 카테고리 순서
      const catA = catOrder.indexOf(a.category || 'grooming');
      const catB = catOrder.indexOf(b.category || 'grooming');
      if (catA !== catB) return catA - catB;
      // sortOrder → 이름순
      const sA = a.sortOrder || 999;
      const sB = b.sortOrder || 999;
      if (sA !== sB) return sA - sB;
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });
  },

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
                ` : ((srv) => {
                  const sorted = this._sortServices([...srv]);
                  let lastCat = '';
                  return sorted.map(s => {
                    const cat = s.category || 'grooming';
                    const catLabel = this._categoryLabels[cat] || cat;
                    let header = '';
                    if (cat !== lastCat && s.isActive !== false) {
                      lastCat = cat;
                      header = '<tr><td colspan="6" style="background:var(--bg);font-weight:700;font-size:0.85rem;color:var(--primary);padding:10px 16px;border-bottom:2px solid var(--primary-lighter)">' + App.escapeHtml(catLabel) + '</td></tr>';
                    }
                    return header +
                    '<tr data-id="' + s.id + '" style="' + (s.isActive === false ? 'opacity:0.5' : '') + '">' +
                      '<td><strong>' + App.escapeHtml(s.name) + '</strong>' + (s.description ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">' + App.escapeHtml(s.description) + '</div>' : '') + '</td>' +
                      '<td>' + App.formatCurrency(s.priceSmall) + '</td>' +
                      '<td>' + App.formatCurrency(s.priceMedium) + '</td>' +
                      '<td>' + App.formatCurrency(s.priceLarge) + '</td>' +
                      '<td><span class="badge ' + (s.isActive !== false ? 'badge-success' : 'badge-secondary') + '">' + (s.isActive !== false ? '활성' : '비활성') + '</span></td>' +
                      '<td class="table-actions">' +
                        '<button class="btn-icon btn-toggle-service" data-id="' + s.id + '" title="' + (s.isActive !== false ? '비활성화' : '활성화') + '">' + (s.isActive !== false ? '&#x1F7E2;' : '&#x26AA;') + '</button>' +
                        '<button class="btn-icon btn-edit-service" data-id="' + s.id + '" title="수정">&#x270F;</button>' +
                        '<button class="btn-icon btn-delete-service text-danger" data-id="' + s.id + '" title="삭제">&#x1F5D1;</button>' +
                      '</td>' +
                    '</tr>';
                  }).join('');
                })(services)}
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
            ` : ((srv) => {
              const sorted = this._sortServices([...srv]);
              let lastCat = '';
              return sorted.map(s => {
                const cat = s.category || 'grooming';
                const catLabel = this._categoryLabels[cat] || cat;
                let header = '';
                if (cat !== lastCat && s.isActive !== false) {
                  lastCat = cat;
                  header = '<div style="font-weight:700;font-size:0.85rem;color:var(--primary);padding:12px 0 6px;border-bottom:2px solid var(--primary-lighter);margin-bottom:8px">' + App.escapeHtml(catLabel) + '</div>';
                }
                return header +
                '<div class="mobile-card" data-id="' + s.id + '" style="' + (s.isActive === false ? 'opacity:0.5' : '') + '">' +
                  '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
                    '<div><strong style="font-size:0.95rem">' + App.escapeHtml(s.name) + '</strong>' +
                    (s.description ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">' + App.escapeHtml(s.description) + '</div>' : '') +
                    '</div>' +
                    '<span class="badge ' + (s.isActive !== false ? 'badge-success' : 'badge-secondary') + '" style="flex-shrink:0;margin-left:8px">' + (s.isActive !== false ? '활성' : '비활성') + '</span>' +
                  '</div>' +
                  '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;font-size:0.82rem">' +
                    '<div style="text-align:center;background:var(--bg);border-radius:var(--radius);padding:8px 4px"><div style="color:var(--text-muted);font-size:0.72rem;margin-bottom:2px">소형견</div><div style="font-weight:700">' + App.formatCurrency(s.priceSmall) + '</div></div>' +
                    '<div style="text-align:center;background:var(--bg);border-radius:var(--radius);padding:8px 4px"><div style="color:var(--text-muted);font-size:0.72rem;margin-bottom:2px">중형견</div><div style="font-weight:700">' + App.formatCurrency(s.priceMedium) + '</div></div>' +
                    '<div style="text-align:center;background:var(--bg);border-radius:var(--radius);padding:8px 4px"><div style="color:var(--text-muted);font-size:0.72rem;margin-bottom:2px">대형견</div><div style="font-weight:700">' + App.formatCurrency(s.priceLarge) + '</div></div>' +
                  '</div>' +
                  '<div style="display:flex;gap:6px;justify-content:flex-end">' +
                    '<button class="btn-icon btn-toggle-service" data-id="' + s.id + '" title="' + (s.isActive !== false ? '비활성화' : '활성화') + '">' + (s.isActive !== false ? '&#x1F7E2;' : '&#x26AA;') + '</button>' +
                    '<button class="btn-icon btn-edit-service" data-id="' + s.id + '" title="수정">&#x270F;</button>' +
                    '<button class="btn-icon btn-delete-service text-danger" data-id="' + s.id + '" title="삭제">&#x1F5D1;</button>' +
                  '</div>' +
                '</div>';
              }).join('');
            })(services)}
          </div>
        </div>
      </div>

      <div style="margin-top:20px;background:linear-gradient(135deg,#6366F1,#8B5CF6);border-radius:var(--radius-xl);padding:28px 32px;color:#fff;position:relative;overflow:hidden">
        <div style="position:absolute;top:-30%;right:-5%;width:200px;height:200px;background:rgba(255,255,255,0.08);border-radius:50%"></div>
        <h3 style="font-weight:800;margin-bottom:6px;font-size:1.15rem;position:relative;z-index:1">&#x1F4A1; ${services.length === 0 ? '기본 서비스로 빠르게 시작하세요' : '기본 서비스 추가'}</h3>
        <p style="opacity:0.85;margin-bottom:16px;font-size:0.9rem;position:relative;z-index:1">${services.length === 0 ? '미용 코스, 추가 옵션, 단독 케어 등 14개의 서비스를 자동으로 등록합니다.' : '아직 등록되지 않은 기본 서비스만 추가합니다. 기존 서비스는 유지됩니다.'}</p>
        <button class="btn" id="btn-init-services" style="background:#fff;color:var(--primary);font-weight:700;position:relative;z-index:1">${services.length === 0 ? '기본 서비스 자동 등록' : '기본 서비스 추가 등록'}</button>
      </div>
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
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label class="form-label">서비스명 <span class="required">*</span></label>
            <input type="text" id="f-name" value="${App.escapeHtml(service.name || '')}" placeholder="예: 전체 미용, 부분 목욕">
          </div>
          <div class="form-group" style="flex:1">
            <label class="form-label">분류</label>
            <select id="f-category">
              <option value="grooming" ${(service.category || 'grooming') === 'grooming' ? 'selected' : ''}>미용 코스</option>
              <option value="addon" ${service.category === 'addon' ? 'selected' : ''}>추가 옵션</option>
              <option value="care" ${service.category === 'care' ? 'selected' : ''}>단독 케어</option>
            </select>
          </div>
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

    // 소형 가격 입력 시 중형/대형 자동 채움 (수동 수정 안 한 경우만)
    const smallInput = document.getElementById('f-priceSmall');
    const mediumInput = document.getElementById('f-priceMedium');
    const largeInput = document.getElementById('f-priceLarge');
    let mediumManual = !!id, largeManual = !!id; // 수정 모드면 자동채움 비활성
    mediumInput?.addEventListener('input', () => { mediumManual = true; });
    largeInput?.addEventListener('input', () => { largeManual = true; });
    smallInput?.addEventListener('input', () => {
      const base = Number(smallInput.value) || 0;
      if (!mediumManual && base > 0) mediumInput.value = base + 10000;
      if (!largeManual && base > 0) largeInput.value = base + 20000;
    });
  },

  async saveService(id) {
    const name = document.getElementById('f-name').value.trim();
    const description = document.getElementById('f-description').value.trim();
    const priceSmall = Math.max(0, Number(document.getElementById('f-priceSmall').value) || 0);
    const priceMedium = Math.max(0, Number(document.getElementById('f-priceMedium').value) || 0);
    const priceLarge = Math.max(0, Number(document.getElementById('f-priceLarge').value) || 0);

    const category = document.getElementById('f-category')?.value || 'grooming';

    if (!name) { App.highlightField('f-name'); App.showToast('서비스명을 입력해주세요.', 'error'); return; }

    const data = { name, description, priceSmall, priceMedium, priceLarge, category, isActive: true };

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
    const records = await DB.getAll('records');
    const refCount = records.filter(r => (r.serviceIds || []).includes(id)).length;

    if (refCount > 0) {
      // 1단계: 비활성화 제안
      const hide = await App.confirm(
        `"${App.escapeHtml(service.name)}" 서비스가 미용 기록 <strong>${refCount}건</strong>에서 사용 중입니다.<br>비활성화하시겠습니까?<br><small style="color:var(--text-muted)">(취소 후 완전 삭제도 가능합니다)</small>`
      );
      if (hide) {
        service.isActive = false;
        await DB.update('services', service);
        App.showToast('서비스가 비활성화되었습니다.');
      } else {
        // 2단계: 완전 삭제 옵션
        const forceDelete = await App.confirm(
          `"${App.escapeHtml(service.name)}"을(를) 완전히 삭제하시겠습니까?<br><strong style="color:var(--danger)">기존 기록의 서비스명은 유지되지만 서비스 목록에서 사라집니다.</strong>`
        );
        if (!forceDelete) return;
        await DB.delete('services', id);
        App.showToast('서비스가 삭제되었습니다.');
      }
    } else {
      const confirmed = await App.confirm(`"${App.escapeHtml(service.name)}" 서비스를 삭제하시겠습니까?`);
      if (!confirmed) return;
      await DB.delete('services', id);
      App.showToast('서비스가 삭제되었습니다.');
    }
    App.handleRoute();
  },

  _defaults: [
    { name: '목욕', description: '샴푸 + 드라이 + 발톱/귀/항문낭 기본 케어', priceSmall: 30000, priceMedium: 40000, priceLarge: 50000, category: 'grooming', sortOrder: 1 },
    { name: '위생미용', description: '목욕 + 발바닥/배/항문/눈가 클리퍼 정리', priceSmall: 35000, priceMedium: 45000, priceLarge: 55000, category: 'grooming', sortOrder: 2 },
    { name: '전체미용 (클리퍼)', description: '위생 + 몸 전체 클리퍼컷 (썸머컷 등)', priceSmall: 40000, priceMedium: 50000, priceLarge: 65000, category: 'grooming', sortOrder: 3 },
    { name: '전체미용 (가위컷)', description: '위생 + 몸 전체 가위 스타일링', priceSmall: 55000, priceMedium: 70000, priceLarge: 90000, category: 'grooming', sortOrder: 4 },
    { name: '스포팅', description: '클리퍼 바디 + 다리/귀/꼬리 자연스럽게', priceSmall: 45000, priceMedium: 55000, priceLarge: 70000, category: 'grooming', sortOrder: 5 },
    { name: '부분미용', description: '얼굴/다리/꼬리 등 원하는 부위만', priceSmall: 15000, priceMedium: 20000, priceLarge: 25000, category: 'grooming', sortOrder: 6 },
    { name: '약욕', description: '피부 맞춤 약용 샴푸 + 온욕', priceSmall: 15000, priceMedium: 20000, priceLarge: 30000, category: 'addon', sortOrder: 1 },
    { name: '보습팩', description: '피부 보습 + 털 윤기 케어', priceSmall: 15000, priceMedium: 20000, priceLarge: 25000, category: 'addon', sortOrder: 2 },
    { name: '엉킴 제거', description: '엉킴 정도에 따라 추가', priceSmall: 10000, priceMedium: 15000, priceLarge: 20000, category: 'addon', sortOrder: 3 },
    { name: '염색', description: '귀/꼬리 등 포인트 염색', priceSmall: 15000, priceMedium: 15000, priceLarge: 20000, category: 'addon', sortOrder: 4 },
    { name: '발톱 정리', description: '발톱 커트 및 줄 다듬기', priceSmall: 5000, priceMedium: 5000, priceLarge: 8000, category: 'care', sortOrder: 1 },
    { name: '귀 청소', description: '귀 세정 + 귀털 정리', priceSmall: 5000, priceMedium: 5000, priceLarge: 8000, category: 'care', sortOrder: 2 },
    { name: '양치', description: '구강 관리 및 양치', priceSmall: 5000, priceMedium: 5000, priceLarge: 5000, category: 'care', sortOrder: 3 },
    { name: '항문낭', description: '항문낭 짜기', priceSmall: 5000, priceMedium: 5000, priceLarge: 5000, category: 'care', sortOrder: 4 },
  ],

  async initDefaultServices() {
    const existing = await DB.getAll('services');
    const existingNames = new Set(existing.map(s => s.name));
    const catLabels = this._categoryLabels;
    const catOrder = this._categoryOrder;
    const available = this._defaults.filter(d => !existingNames.has(d.name));

    if (available.length === 0) {
      App.showToast('추가할 새 서비스가 없습니다.', 'info');
      return;
    }

    // 카테고리별 그룹 HTML
    let html = '<div style="margin-bottom:12px;font-size:0.85rem;color:var(--text-secondary)">등록할 서비스를 선택하세요</div>';
    for (const cat of catOrder) {
      const items = available.filter(d => d.category === cat);
      if (items.length === 0) continue;
      html += '<div style="font-weight:700;font-size:0.82rem;color:var(--primary);margin:10px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--primary-lighter)">' + catLabels[cat] + '</div>';
      items.forEach((d, i) => {
        const globalIdx = available.indexOf(d);
        html += '<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-light);cursor:pointer">' +
          '<input type="checkbox" name="defaultSvc" value="' + globalIdx + '" checked style="width:18px;height:18px">' +
          '<div style="flex:1"><strong style="font-size:0.9rem">' + App.escapeHtml(d.name) + '</strong>' +
          '<div style="font-size:0.75rem;color:var(--text-muted)">' + App.escapeHtml(d.description) + ' | ' + App.formatCurrency(d.priceSmall) + '~</div></div></label>';
      });
    }

    App.showModal({
      title: '기본 서비스 선택 등록',
      content: html,
      saveText: '선택한 서비스 등록',
      onSave: async () => {
        const checked = document.querySelectorAll('input[name="defaultSvc"]:checked');
        if (checked.length === 0) { App.showToast('서비스를 선택해주세요.', 'error'); return; }
        for (const cb of checked) {
          const svc = available[Number(cb.value)];
          await DB.add('services', { ...svc, isActive: true });
        }
        App.showToast(`${checked.length}개 서비스가 등록되었습니다.`);
        App.closeModal();
        App.handleRoute();
      }
    });
  }
};
