// ========== Services Page ==========
App.pages.services = {
  _categoryLabels: { grooming: '미용 코스', addon: '추가 옵션', care: '단독 케어' },
  _categoryOrder: ['grooming', 'addon', 'care'],

  _sortServices(services) {
    const catOrder = this._categoryOrder;
    return services.sort((a, b) => {
      // 1) 비활성 → 맨 뒤
      if (a.isActive === false && b.isActive !== false) return 1;
      if (a.isActive !== false && b.isActive === false) return -1;
      // 2) 즐겨찾기 (활성 내에서) → 위로
      const favA = !!a.favorite, favB = !!b.favorite;
      if (favA !== favB) return favA ? -1 : 1;
      // 3) 카테고리 순서
      const catA = catOrder.indexOf(a.category || 'grooming');
      const catB = catOrder.indexOf(b.category || 'grooming');
      if (catA !== catB) return catA - catB;
      // 4) sortOrder → 이름순
      const sA = a.sortOrder || 999;
      const sB = b.sortOrder || 999;
      if (sA !== sB) return sA - sB;
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });
  },

  async render(container) {
    const [services, records] = await Promise.all([
      DB.getAll('services'),
      DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo', 'groomer', 'nextVisitDate', 'appointmentId'])
    ]);
    const active = services.filter(s => s.isActive !== false);
    const inactive = services.filter(s => s.isActive === false);

    // 서비스 사용 횟수 집계 (신형 r.service 문자열 + 구형 r.serviceIds 배열 모두 매칭)
    const usageByName = {};
    const usageById = {};
    records.forEach(r => {
      if (r.service) usageByName[r.service] = (usageByName[r.service] || 0) + 1;
      (r.serviceIds || []).forEach(id => { usageById[id] = (usageById[id] || 0) + 1; });
    });
    const getUsage = (s) => (usageByName[s.name] || 0) + (usageById[s.id] || 0);

    const sorted = this._sortServices([...services]);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">서비스 메뉴</h1>
          <p class="page-subtitle">총 ${active.length}개${inactive.length > 0 ? ' (비활성 ' + inactive.length + '개)' : ''}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-init-services">+ 기본 템플릿</button>
          ${active.length > 0 ? '<button class="btn btn-warning" id="btn-bulk-price">&#x1F4B0; 일괄 가격 조정</button>' : ''}
          <button class="btn btn-primary" id="btn-add-service">+ 새 서비스</button>
        </div>
      </div>

      ${services.length === 0 ? `
        <div class="empty-state" style="padding:60px 20px">
          <div class="empty-state-icon">&#x1F4CB;</div>
          <div class="empty-state-text">등록된 서비스가 없습니다</div>
          <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px">기본 서비스를 등록하거나 직접 추가하세요</p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-primary" id="btn-init-services-empty">기본 서비스 등록</button>
            <button class="btn btn-secondary" onclick="document.getElementById('btn-add-service').click()">직접 등록</button>
          </div>
        </div>
      ` : ((list) => {
        let lastCat = '';
        let inInactive = false;
        let html = '';
        list.forEach(s => {
          const isOff = s.isActive === false;
          // 활성 → 비활성 구간 진입 시 섹션 구분 헤더
          if (isOff && !inInactive) {
            inInactive = true;
            lastCat = '__inactive__';
            html += '<div style="font-weight:700;font-size:0.82rem;color:var(--text-muted);padding:18px 0 6px;border-bottom:2px solid var(--border-light);margin-bottom:6px">&#x26AA; 비활성 (' + inactive.length + '개)</div>';
          }
          // 활성 서비스만 카테고리 헤더 노출
          if (!isOff) {
            const cat = s.category || 'grooming';
            if (cat !== lastCat) {
              lastCat = cat;
              html += '<div style="font-weight:700;font-size:0.82rem;color:var(--primary);padding:14px 0 6px;border-bottom:2px solid var(--primary-lighter);margin-bottom:6px">' + (this._categoryLabels[cat] || cat) + '</div>';
            }
          }
          const usage = getUsage(s);
          const usageBadge = usage > 0 ? '<span class="badge badge-secondary" style="font-size:0.7rem;padding:2px 8px;margin-left:6px;color:var(--text-secondary)">누적 ' + usage + '회</span>' : '';
          // 가격 표시: 모든 사이즈 같으면 단일, 다르면 "소/중/대"
          const samePrices = (s.priceSmall || 0) === (s.priceMedium || 0) && (s.priceMedium || 0) === (s.priceLarge || 0);
          const priceDisplay = samePrices
            ? App.formatPriceShort(s.priceSmall || 0)
            : App.formatPriceShort(s.priceSmall) + ' / ' + App.formatPriceShort(s.priceMedium) + ' / ' + App.formatPriceShort(s.priceLarge);
          // 가격 변경 이력 (30일 이상 전 변경 시만 표시)
          let priceAgeBadge = '';
          if (s.priceChangedAt) {
            const days = Math.floor((Date.now() - new Date(s.priceChangedAt).getTime()) / (1000 * 60 * 60 * 24));
            if (days >= 30) {
              const label = days >= 365 ? `${Math.floor(days/365)}년 전` : days >= 60 ? `${Math.floor(days/30)}개월 전` : `${Math.floor(days/30)}개월 전`;
              priceAgeBadge = `<span style="font-size:0.68rem;color:var(--text-muted);margin-left:6px">· ${label} 변경</span>`;
            }
          }
          const isFav = !!s.favorite;
          html += '<div class="service-row" data-id="' + s.id + '" style="display:flex;align-items:center;gap:6px;padding:10px 0;border-bottom:1px solid var(--border-light);' + (isOff ? 'opacity:0.5' : '') + '">' +
            '<button class="btn-icon btn-favorite-service" data-id="' + s.id + '" title="' + (isFav ? '즐겨찾기 해제' : '즐겨찾기') + '" style="font-size:1.05rem;color:' + (isFav ? '#F59E0B' : 'var(--border)') + ';flex-shrink:0">' + (isFav ? '&#x2605;' : '&#x2606;') + '</button>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-weight:700;font-size:0.9rem">' + App.escapeHtml(s.name) + usageBadge + '</div>' +
              '<div class="service-price-display" data-id="' + s.id + '" data-same="' + samePrices + '" style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;cursor:pointer;display:inline-block;padding:2px 6px;border-radius:4px;border:1px dashed transparent" title="클릭하여 빠르게 수정">' + priceDisplay + ' <span style="opacity:0.5;font-size:0.7rem">&#x270F;</span></div>' + priceAgeBadge +
            '</div>' +
            '<button class="btn-icon btn-duplicate-service" data-id="' + s.id + '" title="복제" style="font-size:0.95rem;color:var(--info)">&#x1F4CB;</button>' +
            '<button class="btn-icon btn-edit-service" data-id="' + s.id + '" title="수정" style="font-size:0.95rem">&#x270F;</button>' +
            '<button class="btn-icon btn-toggle-service" data-id="' + s.id + '" title="' + (!isOff ? '비활성화' : '활성화') + '" style="font-size:0.95rem">' + (!isOff ? '&#x1F7E2;' : '&#x26AA;') + '</button>' +
            '<button class="btn-icon btn-delete-service text-danger" data-id="' + s.id + '" title="삭제" style="font-size:0.95rem">&#x1F5D1;</button>' +
          '</div>';
        });
        return html;
      })(sorted)}
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

    // 복제 버튼 (비슷한 서비스 빠른 생성)
    document.querySelectorAll('.btn-duplicate-service').forEach(btn => {
      btn.addEventListener('click', () => this.duplicateService(Number(btn.dataset.id)));
    });

    // 즐겨찾기 토글
    document.querySelectorAll('.btn-favorite-service').forEach(btn => {
      btn.addEventListener('click', () => this.toggleFavoriteService(Number(btn.dataset.id)));
    });

    // 인라인 가격 빠른 편집
    document.querySelectorAll('.service-price-display').forEach(el => {
      el.addEventListener('click', () => this.openInlinePriceEdit(el));
      // hover/focus 시각 피드백
      el.addEventListener('mouseenter', () => { el.style.borderColor = 'var(--border)'; el.style.background = 'var(--bg)'; });
      el.addEventListener('mouseleave', () => { el.style.borderColor = 'transparent'; el.style.background = ''; });
    });

    document.getElementById('btn-init-services')?.addEventListener('click', () => this.initDefaultServices());
    document.getElementById('btn-init-services-empty')?.addEventListener('click', () => this.initDefaultServices());
    document.getElementById('btn-bulk-price')?.addEventListener('click', () => this.showBulkPriceModal());
  },

  // 가격 일괄 조정 — 분기/시즌 가격 인상 시 한 번에 처리
  async showBulkPriceModal() {
    const services = await DB.getAll('services');
    const active = services.filter(s => s.isActive !== false);
    if (active.length === 0) { App.showToast('활성 서비스가 없습니다.', 'info'); return; }

    const catLabels = this._categoryLabels;
    const catCounts = {};
    active.forEach(s => { const c = s.category || 'grooming'; catCounts[c] = (catCounts[c] || 0) + 1; });

    App.showModal({
      title: '가격 일괄 조정',
      saveText: '미리보기',
      content: `
        <div style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:14px">
          여러 서비스의 가격을 한 번에 변경합니다. 분기·시즌 가격 인상 시 유용합니다.
        </div>

        <div class="form-group">
          <label class="form-label">대상</label>
          <div id="bulk-target-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="payment-chip active" data-value="all">전체 (${active.length}개)</button>
            ${this._categoryOrder.filter(c => catCounts[c]).map(c => `<button type="button" class="payment-chip" data-value="${c}">${catLabels[c]} (${catCounts[c]}개)</button>`).join('')}
          </div>
          <input type="hidden" id="bulk-target" value="all">
        </div>

        <div class="form-group">
          <label class="form-label">조정 방식</label>
          <div id="bulk-mode-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="payment-chip active" data-value="amount">금액 (원)</button>
            <button type="button" class="payment-chip" data-value="percent">비율 (%)</button>
          </div>
          <input type="hidden" id="bulk-mode" value="amount">
        </div>

        <div class="form-group">
          <label class="form-label">조정값 <span style="color:var(--text-muted);font-size:0.78rem">(인하는 음수 입력 — 예: -5000)</span></label>
          <input type="number" id="bulk-value" placeholder="예: 5000" step="100" autofocus>
          <div class="form-hint" style="margin-top:4px">예) +5000 = 모든 가격 5,000원 인상 / -5 = 5% 인하</div>
        </div>

        <div id="bulk-preview" style="display:none;background:var(--bg);border-radius:var(--radius);padding:12px;margin-top:8px;max-height:240px;overflow-y:auto;font-size:0.82rem"></div>
      `,
      onSave: () => this._previewBulkPrice(active)
    });

    // chips 핸들러
    document.querySelectorAll('#bulk-target-chips .payment-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#bulk-target-chips .payment-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('bulk-target').value = btn.dataset.value;
      });
    });
    document.querySelectorAll('#bulk-mode-chips .payment-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#bulk-mode-chips .payment-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('bulk-mode').value = btn.dataset.value;
      });
    });
  },

  // 미리보기 → 실제 적용 단계
  async _previewBulkPrice(services) {
    const target = document.getElementById('bulk-target')?.value || 'all';
    const mode = document.getElementById('bulk-mode')?.value || 'amount';
    const valueInput = Number(document.getElementById('bulk-value')?.value);
    if (!valueInput || isNaN(valueInput)) { App.showToast('조정값을 입력하세요.', 'error'); return; }

    const filtered = target === 'all' ? services : services.filter(s => (s.category || 'grooming') === target);
    if (filtered.length === 0) { App.showToast('해당하는 서비스가 없습니다.', 'info'); return; }

    // 가격 계산
    const calcPrice = (orig) => {
      let next;
      if (mode === 'percent') {
        next = Math.round(orig * (1 + valueInput / 100));
      } else {
        next = orig + valueInput;
      }
      return Math.max(0, Math.round(next / 100) * 100); // 100원 단위 반올림
    };

    const previewItems = filtered.map(s => ({
      id: s.id,
      name: s.name,
      oldS: s.priceSmall || 0,
      newS: calcPrice(s.priceSmall || 0),
      oldM: s.priceMedium || 0,
      newM: calcPrice(s.priceMedium || 0),
      oldL: s.priceLarge || 0,
      newL: calcPrice(s.priceLarge || 0)
    }));

    const same = (s) => s.oldS === s.oldM && s.oldM === s.oldL;
    const previewHtml = previewItems.map(p => {
      if (same({ oldS: p.oldS, oldM: p.oldM, oldL: p.oldL })) {
        return `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light)">
          <span style="font-weight:600">${App.escapeHtml(p.name)}</span>
          <span><span style="color:var(--text-muted)">${App.formatCurrency(p.oldS)}</span> &rarr; <span style="color:var(--success);font-weight:700">${App.formatCurrency(p.newS)}</span></span>
        </div>`;
      }
      return `<div style="padding:4px 0;border-bottom:1px solid var(--border-light)">
        <div style="font-weight:600">${App.escapeHtml(p.name)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
          ${App.formatCurrency(p.oldS)} / ${App.formatCurrency(p.oldM)} / ${App.formatCurrency(p.oldL)} &rarr;
          <span style="color:var(--success);font-weight:700">${App.formatCurrency(p.newS)} / ${App.formatCurrency(p.newM)} / ${App.formatCurrency(p.newL)}</span>
        </div>
      </div>`;
    }).join('');

    const preview = document.getElementById('bulk-preview');
    preview.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">변경 미리보기 (${previewItems.length}개)</div>
      ${previewHtml}
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="btn btn-warning" id="bulk-confirm" style="flex:1">&#x2714; 적용</button>
        <button class="btn btn-secondary" id="bulk-cancel" style="flex:1">취소</button>
      </div>
    `;
    preview.style.display = 'block';

    document.getElementById('bulk-confirm')?.addEventListener('click', async () => {
      try {
        const now = new Date().toISOString();
        for (const p of previewItems) {
          const svc = await DB.get('services', p.id);
          if (!svc) continue;
          svc.priceSmall = p.newS;
          svc.priceMedium = p.newM;
          svc.priceLarge = p.newL;
          svc.priceChangedAt = now;
          await DB.update('services', svc);
        }
        App.showToast(`${previewItems.length}개 서비스 가격 일괄 변경 완료`);
        App.closeModal();
        App.handleRoute();
      } catch (e) {
        console.error('일괄 가격 조정 실패:', e);
        App.showToast('적용 중 오류가 발생했습니다.', 'error');
      }
    });
    document.getElementById('bulk-cancel')?.addEventListener('click', () => {
      preview.style.display = 'none';
    });
  },

  // 즐겨찾기 토글
  async toggleFavoriteService(id) {
    const service = await DB.get('services', id);
    if (!service) return;
    service.favorite = !service.favorite;
    await DB.update('services', service);
    App.showToast(service.favorite ? `"${service.name}" 즐겨찾기 추가` : `"${service.name}" 즐겨찾기 해제`);
    App.handleRoute();
  },

  // 서비스 복제 — 같은 데이터로 새 서비스 즉시 등록 후 수정 폼 열기
  async duplicateService(id) {
    const original = await DB.get('services', id);
    if (!original) { App.showToast('원본 서비스를 찾을 수 없습니다.', 'error'); return; }
    const newSvc = {
      ...original,
      name: original.name + ' (복사본)',
      isActive: true,
      favorite: false,
      priceChangedAt: new Date().toISOString()
    };
    delete newSvc.id;
    delete newSvc.createdAt;
    delete newSvc.updatedAt;
    delete newSvc.sortOrder;
    try {
      const newId = await DB.add('services', newSvc);
      App.showToast(`"${original.name}" 복제 완료 — 이름·가격 수정하세요`);
      // 즉시 수정 모달 열기
      setTimeout(() => this.showForm(newId), 200);
    } catch (e) {
      console.error('복제 실패:', e);
      App.showToast('복제 중 오류가 발생했습니다.', 'error');
    }
  },

  // 인라인 가격 편집 — 모달 열지 않고 즉시 수정
  async openInlinePriceEdit(el) {
    const id = Number(el.dataset.id);
    const sameStr = el.dataset.same === 'true';
    const service = await DB.get('services', id);
    if (!service) { App.showToast('서비스를 찾을 수 없습니다.', 'error'); return; }

    // 편집 input 으로 교체 (같은 가격이면 1개, 다르면 3개)
    const originalHtml = el.innerHTML;
    if (sameStr) {
      el.innerHTML = `<input type="number" class="inline-price-input" value="${service.priceSmall || 0}" step="1000" min="0" style="width:90px;padding:4px 8px;font-size:0.85rem;border:1.5px solid var(--primary);border-radius:4px"> 원 <button class="btn btn-sm btn-primary inline-price-save" style="min-height:28px;padding:2px 8px;font-size:0.78rem">저장</button> <button class="btn btn-sm btn-secondary inline-price-cancel" style="min-height:28px;padding:2px 8px;font-size:0.78rem">취소</button>`;
    } else {
      el.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap">
          <input type="number" class="inline-price-input" data-size="small" value="${service.priceSmall || 0}" step="1000" min="0" style="width:70px;padding:4px 6px;font-size:0.82rem;border:1.5px solid var(--primary);border-radius:4px" title="소형">
          /
          <input type="number" class="inline-price-input" data-size="medium" value="${service.priceMedium || 0}" step="1000" min="0" style="width:70px;padding:4px 6px;font-size:0.82rem;border:1.5px solid var(--primary);border-radius:4px" title="중형">
          /
          <input type="number" class="inline-price-input" data-size="large" value="${service.priceLarge || 0}" step="1000" min="0" style="width:70px;padding:4px 6px;font-size:0.82rem;border:1.5px solid var(--primary);border-radius:4px" title="대형">
          <button class="btn btn-sm btn-primary inline-price-save" style="min-height:28px;padding:2px 8px;font-size:0.78rem;margin-left:4px">저장</button>
          <button class="btn btn-sm btn-secondary inline-price-cancel" style="min-height:28px;padding:2px 8px;font-size:0.78rem">취소</button>
        </span>
      `;
    }
    el.style.cursor = 'default';
    el.onclick = null; // re-binding 까지 비활성

    const inputs = el.querySelectorAll('.inline-price-input');
    inputs[0]?.focus();
    inputs[0]?.select();

    const saveAndExit = async () => {
      try {
        const oldS = service.priceSmall || 0, oldM = service.priceMedium || 0, oldL = service.priceLarge || 0;
        if (sameStr) {
          const v = Math.max(0, Number(inputs[0].value) || 0);
          service.priceSmall = service.priceMedium = service.priceLarge = v;
        } else {
          service.priceSmall = Math.max(0, Number(el.querySelector('[data-size="small"]').value) || 0);
          service.priceMedium = Math.max(0, Number(el.querySelector('[data-size="medium"]').value) || 0);
          service.priceLarge = Math.max(0, Number(el.querySelector('[data-size="large"]').value) || 0);
        }
        // 가격 변경 시 priceChangedAt 갱신
        if (service.priceSmall !== oldS || service.priceMedium !== oldM || service.priceLarge !== oldL) {
          service.priceChangedAt = new Date().toISOString();
        }
        await DB.update('services', service);
        App.showToast(`"${service.name}" 가격 수정됨`);
        App.handleRoute(); // 목록 재렌더 (가격 표시·정렬 갱신)
      } catch (e) {
        console.error('가격 수정 실패:', e);
        App.showToast('수정 중 오류가 발생했습니다.', 'error');
        el.innerHTML = originalHtml;
        el.style.cursor = 'pointer';
      }
    };
    const cancelEdit = () => {
      el.innerHTML = originalHtml;
      el.style.cursor = 'pointer';
      // 다시 click 핸들러 재바인딩
      el.addEventListener('click', () => this.openInlinePriceEdit(el), { once: true });
    };

    el.querySelector('.inline-price-save')?.addEventListener('click', (e) => { e.stopPropagation(); saveAndExit(); });
    el.querySelector('.inline-price-cancel')?.addEventListener('click', (e) => { e.stopPropagation(); cancelEdit(); });
    // Enter 시 저장, Esc 시 취소
    inputs.forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); saveAndExit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
      });
    });
  },

  async showForm(id) {
    let service = id ? await DB.get('services', id) : { isActive: true };

    // 기존 서비스의 가격이 사이즈별로 다른지 판단 (수정 모드)
    const hasDifferentPrices = !!id && (
      (service.priceSmall || 0) !== (service.priceMedium || 0) ||
      (service.priceMedium || 0) !== (service.priceLarge || 0)
    );

    App.showModal({
      title: id ? '서비스 수정' : '새 서비스 등록',
      content: `
        <div class="form-group">
          <label class="form-label">서비스명 <span class="required">*</span></label>
          <input type="text" id="f-name" value="${App.escapeHtml(service.name || '')}" placeholder="예: 전체 미용, 부분 목욕" maxlength="40">
        </div>
        <div class="form-group">
          <label class="form-label">분류</label>
          <div id="f-category-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="payment-chip${(service.category || 'grooming') === 'grooming' ? ' active' : ''}" data-value="grooming">&#x2702; 미용 코스</button>
            <button type="button" class="payment-chip${service.category === 'addon' ? ' active' : ''}" data-value="addon">&#x2728; 추가 옵션</button>
            <button type="button" class="payment-chip${service.category === 'care' ? ' active' : ''}" data-value="care">&#x1F4A7; 단독 케어</button>
          </div>
          <input type="hidden" id="f-category" value="${service.category || 'grooming'}">
        </div>

        <!-- 가격 — 단일 / 사이즈별 토글 -->
        <div class="form-group">
          <label class="form-label">가격 (원) <span class="required">*</span></label>
          <div id="f-price-unified" style="display:${hasDifferentPrices ? 'none' : 'block'}">
            <input type="number" id="f-priceUnified" value="${hasDifferentPrices ? '' : (service.priceSmall || '')}" placeholder="0" min="0" step="1000">
            <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:0.85rem;color:var(--text-secondary);cursor:pointer">
              <input type="checkbox" id="f-price-by-size" ${hasDifferentPrices ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
              <span>사이즈별 다른 가격 설정</span>
            </label>
          </div>
          <div id="f-price-by-size-fields" style="display:${hasDifferentPrices ? 'block' : 'none'}">
            <div class="form-row three">
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:0.82rem">소형견</label>
                <input type="number" id="f-priceSmall" value="${service.priceSmall || ''}" placeholder="0" min="0" step="1000">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:0.82rem">중형견</label>
                <input type="number" id="f-priceMedium" value="${service.priceMedium || ''}" placeholder="0" min="0" step="1000">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label class="form-label" style="font-size:0.82rem">대형견</label>
                <input type="number" id="f-priceLarge" value="${service.priceLarge || ''}" placeholder="0" min="0" step="1000">
              </div>
            </div>
            <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:0.85rem;color:var(--text-secondary);cursor:pointer">
              <input type="checkbox" id="f-price-by-size-2" ${hasDifferentPrices ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
              <span>사이즈별 다른 가격 설정</span>
            </label>
            <div class="form-hint" style="margin-top:4px">소형 입력 시 중형 +1만, 대형 +2만 원 자동 제안</div>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">설명 <span style="color:var(--text-muted);font-size:0.78rem">(선택)</span></label>
          <textarea id="f-description" placeholder="서비스 내용 메모">${App.escapeHtml(service.description || '')}</textarea>
        </div>
      `,
      onSave: () => this.saveService(id)
    });

    // 분류 chips 핸들러
    document.querySelectorAll('#f-category-chips .payment-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#f-category-chips .payment-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('f-category').value = btn.dataset.value;
      });
    });

    // 사이즈별 가격 토글 핸들러 (두 체크박스 sync)
    const togglePriceMode = (bySize) => {
      document.getElementById('f-price-unified').style.display = bySize ? 'none' : 'block';
      document.getElementById('f-price-by-size-fields').style.display = bySize ? 'block' : 'none';
      const cb1 = document.getElementById('f-price-by-size');
      const cb2 = document.getElementById('f-price-by-size-2');
      if (cb1) cb1.checked = bySize;
      if (cb2) cb2.checked = bySize;
      // 단일 → 사이즈별 전환 시 단일 가격을 소형에 복사
      if (bySize) {
        const u = Number(document.getElementById('f-priceUnified')?.value) || 0;
        if (u > 0 && !document.getElementById('f-priceSmall').value) {
          document.getElementById('f-priceSmall').value = u;
          // 자동 채움 트리거
          document.getElementById('f-priceSmall').dispatchEvent(new Event('input'));
        }
      } else {
        // 사이즈별 → 단일 전환 시 소형 가격을 단일로
        const s = Number(document.getElementById('f-priceSmall')?.value) || 0;
        if (s > 0) document.getElementById('f-priceUnified').value = s;
      }
    };
    document.getElementById('f-price-by-size')?.addEventListener('change', (e) => togglePriceMode(e.target.checked));
    document.getElementById('f-price-by-size-2')?.addEventListener('change', (e) => togglePriceMode(e.target.checked));

    // 소형 가격 입력 시 중형/대형 자동 채움 (수동 수정 안 한 경우만)
    const smallInput = document.getElementById('f-priceSmall');
    const mediumInput = document.getElementById('f-priceMedium');
    const largeInput = document.getElementById('f-priceLarge');
    let mediumManual = !!id && hasDifferentPrices, largeManual = !!id && hasDifferentPrices;
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

    // 단일 / 사이즈별 모드 분기 — 보이는 패널 기준 (더 신뢰)
    const bySizePanel = document.getElementById('f-price-by-size-fields');
    const bySize = !!bySizePanel && bySizePanel.style.display !== 'none';
    let priceSmall, priceMedium, priceLarge;
    if (bySize) {
      priceSmall = Math.max(0, Number(document.getElementById('f-priceSmall').value) || 0);
      priceMedium = Math.max(0, Number(document.getElementById('f-priceMedium').value) || 0);
      priceLarge = Math.max(0, Number(document.getElementById('f-priceLarge').value) || 0);
    } else {
      const unified = Math.max(0, Number(document.getElementById('f-priceUnified').value) || 0);
      priceSmall = priceMedium = priceLarge = unified;
    }

    const category = document.getElementById('f-category')?.value || 'grooming';

    if (!name) { App.highlightField('f-name'); App.showToast('서비스명을 입력해주세요.', 'error'); return; }

    const data = { name, description, priceSmall, priceMedium, priceLarge, category, isActive: true };

    if (id) {
      const existing = await DB.get('services', id);
      data.isActive = existing.isActive;
      data.favorite = existing.favorite;
      // 가격 변경 감지 → priceChangedAt 갱신
      const priceChanged = (existing.priceSmall || 0) !== priceSmall || (existing.priceMedium || 0) !== priceMedium || (existing.priceLarge || 0) !== priceLarge;
      if (priceChanged) data.priceChangedAt = new Date().toISOString();
      else data.priceChangedAt = existing.priceChangedAt;
      Object.assign(existing, data);
      await DB.update('services', existing);
      App.showToast('서비스가 수정되었습니다.');
    } else {
      data.priceChangedAt = new Date().toISOString();
      await DB.add('services', data);
      App.showToast('새 서비스가 등록되었습니다.');
    }

    App.closeModal();
    App.handleRoute();
  },

  async toggleService(id) {
    const service = await DB.get('services', id);
    if (!service) return;
    const newState = service.isActive === false;
    const ok = await App.confirm(`"${App.escapeHtml(service.name)}" 서비스를 ${newState ? '활성화' : '비활성화'}하시겠습니까?`);
    if (!ok) return;
    service.isActive = newState;
    await DB.update('services', service);
    App.showToast(newState ? '서비스가 활성화되었습니다.' : '서비스가 비활성화되었습니다.');
    App.handleRoute();
  },

  async deleteService(id) {
    const service = await DB.get('services', id);
    if (!service) return;
    const records = await DB.getAll('records');
    // 신형(r.service 문자열) + 구형(r.serviceIds 배열) 모두 매칭
    const refCount = records.filter(r =>
      (r.serviceIds || []).includes(id) || r.service === service.name
    ).length;

    let msg;
    if (refCount > 0) {
      msg = `"${App.escapeHtml(service.name)}" 서비스를 <strong>완전 삭제</strong>하시겠습니까?<br><br>
        <span style="color:var(--danger)">&#x26A0; 미용 기록 <strong>${refCount}건</strong>에서 사용 중입니다.</span><br>
        삭제 시: 기록의 서비스명은 텍스트로 유지되지만 서비스 목록에서 사라집니다.<br><br>
        <small style="color:var(--text-muted)">잠시 숨기려면 [&#x1F7E2;&rarr;&#x26AA;] 버튼으로 비활성화하세요.</small>`;
    } else {
      msg = `"${App.escapeHtml(service.name)}" 서비스를 삭제하시겠습니까?`;
    }

    const confirmed = await App.confirm(msg);
    if (!confirmed) return;

    try {
      await DB.delete('services', id);
      App.showToast('서비스가 삭제되었습니다.');
      App.handleRoute();
    } catch (e) {
      console.error('서비스 삭제 실패:', e);
      App.showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
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
