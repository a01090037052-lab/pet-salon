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
      // 2) 카테고리 순서 (카테고리 헤더가 한 번씩만 나오도록 즐겨찾기보다 먼저)
      const catA = catOrder.indexOf(a.category || 'grooming');
      const catB = catOrder.indexOf(b.category || 'grooming');
      if (catA !== catB) return catA - catB;
      // 3) 즐겨찾기 → 같은 카테고리 안에서 위로
      const favA = !!a.favorite, favB = !!b.favorite;
      if (favA !== favB) return favA ? -1 : 1;
      // 4) sortOrder → 이름순
      const sA = a.sortOrder || 999;
      const sB = b.sortOrder || 999;
      if (sA !== sB) return sA - sB;
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });
  },

  // 기록이 이 서비스를 사용했는지 (기록당 1회만 센다).
  // 주 서비스 우선순위: serviceId → 구형 serviceIds 배열 → 이름(정규화). 이름이 바뀌어도 id 로 이어진다.
  // 추가 항목도 사용으로 센다: addonServiceIds 가 있으면 id, 없는 예전 기록은 태그 이름으로.
  _recordUsesService(r, s) {
    const sid = Number(s.id);
    const nm = App.normalizeServiceName(s.name);
    const legacyIds = Array.isArray(r.serviceIds) ? r.serviceIds.filter(Boolean) : [];
    let main;
    if (r.serviceId != null) main = Number(r.serviceId) === sid;
    else if (legacyIds.length > 0) main = legacyIds.some(x => Number(x) === sid);
    else main = !!r.service && App.normalizeServiceName(r.service) === nm;
    if (main) return true;
    if (Array.isArray(r.addonServiceIds)) return r.addonServiceIds.some(x => Number(x) === sid);
    return Array.isArray(r.addons) && r.addons.some(a => App.normalizeServiceName(a) === nm);
  },

  async render(container) {
    // 최근 12개월 records만 로드 — 3년+ 누적 시 메모리 부담 회피 (서비스 통계는 1년 기준 충분)
    const oneYearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return App.formatLocalDate(d); })();
    const [services, records] = await Promise.all([
      DB.getAll('services'),
      DB.getByDateRange('records', 'date', oneYearAgo, '9999-12-31')
    ]);
    const active = services.filter(s => s.isActive !== false);
    const inactive = services.filter(s => s.isActive === false);
    const priceTable = await App.getPriceBands();

    // 서비스 사용 횟수 집계 — 기록 1건은 서비스당 한 번만 센다 (_recordUsesService 우선순위)
    const usageById = {};
    services.forEach(s => { usageById[s.id] = records.filter(r => this._recordUsesService(r, s)).length; });
    const getUsage = (s) => usageById[s.id] || 0;

    const sorted = this._sortServices([...services]);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">서비스 메뉴</h1>
          <p class="page-subtitle">총 ${active.length}개${inactive.length > 0 ? ' (비활성 ' + inactive.length + '개)' : ''}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-init-services" title="기본 템플릿">+ 템플릿</button>
          ${active.length > 0 ? '<button class="btn btn-warning" id="btn-bulk-price" title="일괄 가격 조정">' + App.icon('coins') + ' 일괄 조정</button>' : ''}
          <button class="btn btn-primary" id="btn-add-service">+ 새 서비스</button>
        </div>
      </div>
      <!-- 가격 구간 한 줄 (헤더 버튼이 두 줄로 넘치지 않게 따로) -->
      <button type="button" id="btn-price-bands" style="display:flex;align-items:center;gap:8px;width:100%;min-height:44px;margin-bottom:12px;padding:8px 12px;background:var(--bg-white);border:1px solid var(--border-light);border-radius:var(--radius);cursor:pointer;text-align:left;font-size:0.85rem;color:var(--text-secondary)">
        <span style="font-weight:700;color:var(--text-primary,inherit);flex-shrink:0">몸무게 구간</span>
        <span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${priceTable.bandsOff ? '사용 안 함 (모든 서비스 단일가)' : priceTable.bands.map((b, i) => App.escapeHtml(App.getBandLabel(priceTable, i))).join(' · ')}</span>
        <span style="color:var(--primary);font-weight:700;flex-shrink:0">편집</span>
      </button>
      ${services.length > 0 ? `
      <div class="search-box" style="margin-bottom:12px;max-width:none;position:relative">
        <span class="search-icon">${App.icon('search')}</span>
        <input type="text" id="service-search" placeholder="서비스 이름 검색..." style="width:100%;min-height:44px;padding-right:60px">
        <span id="service-search-count" style="display:none;position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:0.78rem;color:var(--text-muted);font-weight:700;pointer-events:none"></span>
      </div>
      ` : ''}

      ${services.length === 0 ? `
        <div class="empty-state" style="padding:60px 20px">
          <div class="empty-state-icon">${App.icon('list', 'ico-xl')}</div>
          <div class="empty-state-text">등록된 서비스가 없습니다</div>
          <p style="color:var(--text-muted);font-size:0.85rem;margin-bottom:16px">기본 서비스를 등록하거나 직접 추가하세요</p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-primary" id="btn-init-services-empty">기본 서비스 등록</button>
            <button class="btn btn-secondary" onclick="document.getElementById('btn-add-service').click()">직접 등록</button>
          </div>
        </div>
      ` : ((list) => {
        // 카테고리별 카운트 사전 계산
        const catCounts = {};
        list.forEach(s => {
          if (s.isActive === false) return;
          const c = s.category || 'grooming';
          catCounts[c] = (catCounts[c] || 0) + 1;
        });

        // 가격 변경 이력 (30일 이상 전 변경 시만)
        const priceAgeTxtOf = (s) => {
          if (!s.priceChangedAt) return '';
          const days = Math.floor((Date.now() - new Date(s.priceChangedAt).getTime()) / (1000 * 60 * 60 * 24));
          if (days < 30) return '';
          return days >= 365 ? Math.floor(days / 365) + '년 전 변경' : Math.floor(days / 30) + '개월 전 변경';
        };
        let lastCat = '';
        let inInactive = false;
        let html = '';
        list.forEach(s => {
          const isOff = s.isActive === false;
          // 활성 → 비활성 구간 진입 시 섹션 구분 헤더 (fold 가능)
          if (isOff && !inInactive) {
            inInactive = true;
            lastCat = '__inactive__';
            html += '<div class="service-category-header" data-category="__inactive__" style="cursor:pointer;font-weight:700;font-size:0.85rem;color:var(--text-muted);padding:18px 8px 8px;border-bottom:2px solid var(--border-light);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">'
                  + '<span>' + App.icon('circle') + ' 비활성 <span style="font-size:0.78rem;font-weight:500;margin-left:4px">' + inactive.length + '개</span></span>'
                  + '<span class="cat-fold-icon" style="transition:transform 0.2s;font-size:0.7rem">' + App.icon('chevron-down') + '</span>'
                  + '</div>';
          }
          // 활성 서비스만 카테고리 헤더 노출 (fold 가능)
          let cat = '__inactive__';
          if (!isOff) {
            cat = s.category || 'grooming';
            if (cat !== lastCat) {
              lastCat = cat;
              html += '<div class="service-category-header" data-category="' + cat + '" style="cursor:pointer;font-weight:700;font-size:0.85rem;color:var(--primary);padding:14px 8px 8px;border-bottom:2px solid var(--primary-lighter);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">'
                    + '<span>' + (this._categoryLabels[cat] || cat) + ' <span style="color:var(--text-muted);font-size:0.78rem;font-weight:500;margin-left:4px">' + catCounts[cat] + '개</span></span>'
                    + '<span class="cat-fold-icon" style="transition:transform 0.2s;font-size:0.7rem;color:var(--text-muted)">' + App.icon('chevron-down') + '</span>'
                    + '</div>';
            }
          }
          const usage = getUsage(s);
          // '신규'는 최근 7일 안에 만든 서비스에만 (예전엔 안 쓴 서비스마다 붙어 모든 카드가 신규로 보였다)
          const isNew = s.createdAt && (Date.now() - new Date(s.createdAt).getTime()) < 7 * 86400000;
          const usageTxt = usage > 0 ? '1년간 ' + usage + '회' : (isNew ? '신규' : '');
          // 가격 표시: 단일가는 '30,000원'('~부터'면 '30,000원~'), 구간 가격은 '3.5만~5.5만' + 아래 줄에 구간별 가격
          const pricing = App.getServicePricing(s, priceTable);
          const priceDisplay = App.formatServicePrice(s, priceTable);
          const byBand = pricing.mode === 'weight' && !priceTable.bandsOff && !pricing.free;
          const bandLine = byBand
            ? App.getServiceBandRows(s, priceTable).map(r => r.label + ' ' + (r.price ? App.formatManwon(r.price) : '(앞 구간)')).join(' · ')
            : '';
          // 큰 아이 추가 요금 규칙 한 줄 (구간 가격이거나, 이 서비스만 따로 정한 경우)
          const rule = App.getOverKgRule(s, priceTable, pricing);
          const ruleLine = rule
            ? App.describeOverKgRule(rule)
            : (byBand && priceTable.overKg ? '큰 아이 추가 요금 없음' : '');
          const metaTxt = [usageTxt, priceAgeTxtOf(s)].filter(Boolean).join(' · ');
          const isFav = !!s.favorite;
          const barStyle = isOff ? 'border-left:4px solid var(--border);'
                                 : isFav ? 'border-left:4px solid #F59E0B;'
                                 : '';
          html += '<div class="service-row" data-id="' + s.id + '" data-category="' + cat + '" data-search="' + App.escapeHtml((s.name || '').toLowerCase()) + '" style="display:flex;align-items:center;gap:8px;padding:14px 12px;background:var(--bg-white);border:1px solid var(--border-light);' + barStyle + 'border-radius:var(--radius);box-shadow:var(--shadow-xs);margin-bottom:6px;cursor:pointer;' + (isOff ? 'opacity:0.55;' : '') + '">'
                + '<button class="btn-favorite-service" data-id="' + s.id + '" title="' + (isFav ? '즐겨찾기 해제' : '즐겨찾기') + '" aria-label="' + (isFav ? '즐겨찾기 해제' : '즐겨찾기') + '" onclick="event.stopPropagation()" style="background:none;border:none;cursor:pointer;font-size:1.3rem;color:' + (isFav ? '#F59E0B' : 'var(--border)') + ';flex-shrink:0;min-width:44px;min-height:44px;padding:0;display:flex;align-items:center;justify-content:center">' + App.icon(isFav ? 'star-filled' : 'star') + '</button>'
                + '<div style="flex:1;min-width:0">'
                +   '<div style="font-size:1.05rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + App.escapeHtml(s.name) + '</div>'
                +   '<div class="service-price-display" data-id="' + s.id + '" style="font-size:0.95rem;font-weight:800;color:var(--primary);margin-top:3px;overflow-wrap:anywhere">' + priceDisplay + '</div>'
                +   (bandLine ? '<div class="service-band-line" style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;overflow-wrap:anywhere">' + App.escapeHtml(bandLine) + '</div>' : '')
                +   (ruleLine ? '<div class="service-rule-line" style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px">' + App.escapeHtml(ruleLine) + '</div>' : '')
                +   (metaTxt ? '<div style="font-size:0.78rem;color:var(--text-muted);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + metaTxt + '</div>' : '')
                + '</div>'
                + '<button class="btn-service-menu" data-id="' + s.id + '" title="더보기" aria-label="더보기" onclick="event.stopPropagation()" style="background:none;border:none;cursor:pointer;font-size:1.4rem;color:var(--text-muted);padding:0;flex-shrink:0;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;line-height:1">' + App.icon('more') + '</button>'
                + '</div>';
        });
        return html;
      })(sorted)}
    `;
  },

  async init() {
    document.getElementById('btn-add-service')?.addEventListener('click', () => this.showForm());

    // 카드 전체 클릭 → 수정 모달 (자식 버튼은 stopPropagation 처리됨)
    document.querySelectorAll('.service-row').forEach(row => {
      row.addEventListener('click', () => this.showForm(Number(row.dataset.id)));
    });

    // ⋯ 더보기 메뉴 (수정/복제/활성토글/삭제)
    document.querySelectorAll('.btn-service-menu').forEach(btn => {
      btn.addEventListener('click', () => this.showServiceMenu(Number(btn.dataset.id)));
    });

    // 즐겨찾기 토글
    document.querySelectorAll('.btn-favorite-service').forEach(btn => {
      btn.addEventListener('click', () => this.toggleFavoriteService(Number(btn.dataset.id), btn));
    });

    // 가격 영역은 카드 일관성을 위해 클릭 시 수정 모달 (인라인 편집 제거 — 카드 폭 변형 방지)

    // 카테고리 fold/expand
    document.querySelectorAll('.service-category-header').forEach(h => {
      h.addEventListener('click', () => {
        const cat = h.dataset.category;
        const collapsed = h.classList.toggle('collapsed');
        const icon = h.querySelector('.cat-fold-icon');
        if (icon) icon.style.transform = collapsed ? 'rotate(-90deg)' : '';
        document.querySelectorAll('.service-row[data-category="' + cat + '"]').forEach(c => {
          c.style.display = collapsed ? 'none' : '';
        });
      });
    });

    // 서비스 이름 검색 (debounced)
    const _debouncedSearch = App.debounce((val) => {
      const q = (val || '').trim().toLowerCase();
      let visible = 0;
      document.querySelectorAll('.service-row').forEach(row => {
        const match = !q || (row.dataset.search || '').includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      // 검색 중에는 카테고리 헤더 숨김 (결과 한 곳에 모이게)
      document.querySelectorAll('.service-category-header').forEach(h => {
        h.style.display = q ? 'none' : '';
      });
      const countEl = document.getElementById('service-search-count');
      if (countEl) {
        countEl.style.display = q ? '' : 'none';
        countEl.textContent = q ? visible + '개' : '';
      }
    }, 200);
    document.getElementById('service-search')?.addEventListener('input', (e) => _debouncedSearch(e.target.value));

    document.getElementById('btn-init-services')?.addEventListener('click', () => this.initDefaultServices());
    document.getElementById('btn-init-services-empty')?.addEventListener('click', () => this.initDefaultServices());
    document.getElementById('btn-bulk-price')?.addEventListener('click', () => this.showBulkPriceModal());
    document.getElementById('btn-price-bands')?.addEventListener('click', () => App.pages.settings.showPriceBandEditor());
  },

  // ⋯ 메뉴 모달 (수정 / 복제 / 활성토글 / 삭제)
  async showServiceMenu(serviceId) {
    const service = await DB.get('services', serviceId);
    if (!service) return;
    const isOff = service.isActive === false;
    App.showModal({
      // showModal이 title을 textContent로 넣으므로 여기서 이스케이프하면 이중 처리된다.
      title: service.name,
      hideFooter: true,
      content: `
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-secondary svc-menu-btn" data-action="edit" style="width:100%;text-align:left;min-height:48px;justify-content:flex-start">${App.icon('edit')} 수정</button>
          <button class="btn btn-secondary svc-menu-btn" data-action="duplicate" style="width:100%;text-align:left;min-height:48px;justify-content:flex-start">${App.icon('copy')} 복제</button>
          <button class="btn btn-secondary svc-menu-btn" data-action="toggle" style="width:100%;text-align:left;min-height:48px;justify-content:flex-start">${isOff ? App.icon('circle-filled') + ' 활성화' : App.icon('circle') + ' 비활성화'}</button>
          <button class="btn btn-danger svc-menu-btn" data-action="delete" style="width:100%;text-align:left;min-height:48px;margin-top:6px;justify-content:flex-start">${App.icon('trash')} 삭제</button>
        </div>
      `
    });
    document.querySelectorAll('.svc-menu-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        App.closeModal();
        if (action === 'edit') this.showForm(serviceId);
        else if (action === 'duplicate') this.duplicateService(serviceId);
        else if (action === 'toggle') this.toggleService(serviceId);
        else if (action === 'delete') this.deleteService(serviceId);
      });
    });
  },

  // 가격 일괄 조정 — 분기/시즌 가격 인상 시 한 번에 처리
  // 대상: 분류(전체/미용/추가/케어) × 구간(모든 구간/특정 구간). 0원 칸은 그대로. 단일가 서비스는 '모든 구간'일 때만 바뀐다.
  // 아래 버튼 하나로: [미리보기] → 미리보기가 보이면 [N개 적용]. 입력을 바꾸면 다시 [미리보기].
  async showBulkPriceModal() {
    const services = await DB.getAll('services');
    const active = services.filter(s => s.isActive !== false && !(s.pricing && s.pricing.free));
    if (active.length === 0) { App.showToast('활성 서비스가 없습니다.', 'info'); return; }
    const table = await App.getPriceBands();
    const showBands = !table.bandsOff && table.bands.length > 1;

    const catLabels = this._categoryLabels;
    const catCounts = {};
    active.forEach(s => { const c = s.category || 'grooming'; catCounts[c] = (catCounts[c] || 0) + 1; });
    const ROUNDS = [100, 500, 1000, 5000, 10000];
    const defRound = ROUNDS.includes(table.rounding) ? table.rounding : 1000;
    const defTarget = catCounts.grooming ? 'grooming' : 'all';
    this._bulkReady = null;

    App.showModal({
      title: '가격 일괄 조정',
      saveText: '미리보기',
      noAutoFocus: true,
      content: `
        <div style="font-size:0.88rem;color:var(--text-secondary);margin-bottom:14px">
          여러 서비스의 가격을 한 번에 바꿔요. 미리보기로 확인한 뒤 적용돼요.
        </div>

        <div class="form-group">
          <label class="form-label">대상</label>
          <div id="bulk-target-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="payment-chip${defTarget === 'all' ? ' active' : ''}" data-value="all">전체 (${active.length}개)</button>
            ${this._categoryOrder.filter(c => catCounts[c]).map(c => `<button type="button" class="payment-chip${defTarget === c ? ' active' : ''}" data-value="${c}">${catLabels[c]} (${catCounts[c]}개)</button>`).join('')}
          </div>
          <input type="hidden" id="bulk-target" value="${defTarget}">
          <div class="form-hint" style="margin-top:4px">처음엔 미용 코스만 골라져 있어요 (작은 추가 옵션 가격까지 같은 금액이 오르지 않게).</div>
        </div>

        <div class="form-group" style="${showBands ? '' : 'display:none'}">
          <label class="form-label">몸무게 구간</label>
          <div id="bulk-band-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="payment-chip active" data-value="all">모든 구간</button>
            ${table.bands.map((b, i) => `<button type="button" class="payment-chip" data-value="${b.id}">${App.escapeHtml(App.getBandLabel(table, i))}</button>`).join('')}
          </div>
          <input type="hidden" id="bulk-band" value="all">
          <div class="form-hint" style="margin-top:4px">특정 구간을 고르면 그 칸만 바뀌어요 (단일가 서비스는 그대로).</div>
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
          <label class="form-label">조정값 <span style="color:var(--text-muted);font-size:0.78rem">(내릴 때는 앞에 - 예: -5000)</span></label>
          <input type="number" id="bulk-value" placeholder="예: 5000" step="100" data-no-enter-save>
          <div class="form-hint" style="margin-top:4px">예) 5000 = 5,000원 인상 / 비율 -5 = 5% 인하 · 비어 있는 칸은 그대로</div>
        </div>

        <div class="form-group">
          <label class="form-label">반올림 단위 <span style="color:var(--text-muted);font-size:0.78rem;font-weight:400">(기본: 가격 구간 설정 값)</span></label>
          <div id="bulk-round-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            ${ROUNDS.map(v => `<button type="button" class="payment-chip${v === defRound ? ' active' : ''}" data-value="${v}">${v.toLocaleString('ko-KR')}원</button>`).join('')}
          </div>
          <input type="hidden" id="bulk-round" value="${defRound}">
        </div>

        <div id="bulk-preview" style="display:none;background:var(--bg);border-radius:var(--radius);padding:12px;margin-top:8px;font-size:0.82rem;scroll-margin-bottom:90px"></div>
      `,
      onSave: async () => {
        if (this._bulkReady) await this._applyBulkPrice(active);
        else await this._previewBulkPrice(active);
      }
    });

    // 입력이 바뀌면 이전 미리보기는 무효 — 숨기고 버튼을 다시 '미리보기'로
    const hidePreview = () => {
      this._bulkReady = null;
      const preview = document.getElementById('bulk-preview');
      if (preview) { preview.style.display = 'none'; preview.innerHTML = ''; }
      const saveBtn = document.getElementById('modal-save');
      if (saveBtn) { saveBtn.dataset.label = '미리보기'; if (!saveBtn.disabled) saveBtn.textContent = '미리보기'; }
    };
    [['bulk-target-chips', 'bulk-target'], ['bulk-band-chips', 'bulk-band'], ['bulk-mode-chips', 'bulk-mode'], ['bulk-round-chips', 'bulk-round']].forEach(([chipsId, hiddenId]) => {
      document.querySelectorAll('#' + chipsId + ' .payment-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('#' + chipsId + ' .payment-chip').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById(hiddenId).value = btn.dataset.value;
          hidePreview();
        });
      });
    });
    const valEl = document.getElementById('bulk-value');
    valEl?.addEventListener('input', hidePreview);
    // 조정값 칸에서 Enter = 미리보기 (적용은 버튼을 눌러야)
    valEl?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      if (!this._bulkReady) document.getElementById('modal-save')?.click();
    });
  },

  // 현재 모달 입력값으로 가격 계산기 생성 (미리보기·적용 모두 같은 입력을 다시 읽는다)
  _readBulkInputs() {
    const target = document.getElementById('bulk-target')?.value || 'all';
    const band = document.getElementById('bulk-band')?.value || 'all';
    const mode = document.getElementById('bulk-mode')?.value || 'amount';
    const r = Number(document.getElementById('bulk-round')?.value);
    const unit = [100, 500, 1000, 5000, 10000].includes(r) ? r : 1000;
    const valueInput = Number(document.getElementById('bulk-value')?.value);
    if (!valueInput || isNaN(valueInput)) return null;
    const calcPrice = (orig) => {
      // 0원 = 그 구간은 받지 않는(비워 둔) 칸 — 올리지 않고 0 그대로 둔다
      if (!(Number(orig) > 0)) return 0;
      const next = mode === 'percent' ? orig * (1 + valueInput / 100) : orig + valueInput;
      return Math.max(0, Math.round(next / unit) * unit); // 선택한 단위로 반올림
    };
    return { target, band, mode, unit, valueInput, calcPrice, key: [target, band, mode, unit, valueInput].join('|') };
  },

  // 서비스 1개에 조정을 적용한 새 pricing (바뀐 게 없으면 null)
  _bulkApply(svc, table, inputs) {
    const p = JSON.parse(JSON.stringify(App.getServicePricing(svc, table)));
    if (p.free) return null;
    // 옛 구간 id 로 남은 서비스는 지금 구간표 칸으로 옮긴 뒤 조정한다
    if (p.mode === 'weight' && App._pricingTable(p, table) !== table) {
      const moved = {};
      App.getServiceBandRows(svc, table).forEach(r => { if (r.price > 0) moved[r.id] = r.price; });
      p.prices = moved;
    }
    const before = JSON.stringify(p);
    if (p.mode === 'flat' || table.bandsOff) {
      if (inputs.band !== 'all') return null;
      if (p.mode === 'flat') p.flat = inputs.calcPrice(Number(p.flat) || 0);
      else if (Number(p.flat) > 0) p.flat = inputs.calcPrice(Number(p.flat)); // 구간 사용 안 함: 단일가 칸이 있으면 그것
      else table.bands.forEach(b => { if (Number(p.prices[b.id]) > 0) p.prices[b.id] = inputs.calcPrice(Number(p.prices[b.id])); });
    } else {
      table.bands.forEach(b => {
        if (inputs.band !== 'all' && b.id !== inputs.band) return;
        if (Number(p.prices[b.id]) > 0) p.prices[b.id] = inputs.calcPrice(Number(p.prices[b.id]));
      });
    }
    return JSON.stringify(p) === before ? null : p;
  },

  // 구간 가격이 앞(가벼운) 구간보다 싸진 곳: ['5~7kg 30,000원 < 3~5kg 35,000원', …]
  _bandInversions(p, table) {
    if (!p || p.mode !== 'weight' || table.bandsOff) return [];
    const out = [];
    let prev = null;
    table.bands.forEach((b, i) => {
      const v = Number((p.prices || {})[b.id]) || 0;
      if (!v) return;
      if (prev && v < prev.v) out.push(`${App.getBandLabel(table, i)} ${App.formatManwon(v)} < ${prev.label} ${App.formatManwon(prev.v)}`);
      prev = { v, label: App.getBandLabel(table, i) };
    });
    return out;
  },

  _pricingText(p, table) {
    if (p.mode === 'flat' || table.bandsOff) return App.formatCurrency(App.calcServicePrice({ pricing: p, category: 'addon' }, null, table).price || Number(p.flat) || 0);
    return App.getServiceBandRows({ pricing: p, category: 'addon' }, table).map(r => r.price ? App.formatManwon(r.price) : '-').join(' / ');
  },

  // 미리보기 — 아래 버튼을 'N개 적용'으로 바꾼다
  async _previewBulkPrice(services) {
    const inputs = this._readBulkInputs();
    if (!inputs) { App.showToast('조정값을 입력하세요.', 'error'); App.highlightField('bulk-value'); return; }
    const table = await App.getPriceBands();
    const { target } = inputs;

    const filtered = target === 'all' ? services : services.filter(s => (s.category || 'grooming') === target);
    const previewItems = filtered.map(s => {
      const old = App.getServicePricing(s, table);
      const next = this._bulkApply(s, table, inputs);
      if (!next) return null;
      const oldInv = this._bandInversions(old, table).length;
      const inv = this._bandInversions(next, table);
      return { id: s.id, name: s.name, oldTxt: this._pricingText(old, table), newTxt: this._pricingText(next, table), inv: inv.length > oldInv ? inv : [] };
    }).filter(Boolean);
    if (previewItems.length === 0) { App.showToast('바뀌는 가격이 없습니다. (비어 있는 칸·단일가 서비스는 그대로예요)', 'info'); return; }
    const inverted = previewItems.filter(p => p.inv.length > 0);

    const previewHtml = previewItems.map(p => `<div style="padding:6px 0;border-bottom:1px solid var(--border-light)">
        <div style="font-weight:600">${App.escapeHtml(p.name)}${p.inv.length ? ` <span style="color:var(--danger);font-size:0.75rem">${App.icon('alert')} 역전</span>` : ''}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">
          ${p.oldTxt} &rarr; <span style="color:var(--success);font-weight:700">${p.newTxt}</span>
        </div>
      </div>`).join('');

    const preview = document.getElementById('bulk-preview');
    preview.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">변경 미리보기 (${previewItems.length}개)${inputs.band !== 'all' ? ' · ' + App.escapeHtml(App.getBandLabel(table, table.bands.findIndex(b => b.id === inputs.band))) + ' 구간만' : ''}</div>
      ${inverted.length ? `<div style="background:var(--danger-bg-soft, #fdecec);color:var(--danger);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:0.8rem;line-height:1.45">
        <strong>${App.icon('alert')} 무거운 구간이 더 싸지는 서비스 ${inverted.length}개</strong>
        ${inverted.map(p => `<div>· ${App.escapeHtml(p.name)}: ${App.escapeHtml(p.inv.join(', '))}</div>`).join('')}
        <div style="margin-top:4px;color:var(--text-secondary)">그래도 적용하려면 아래 버튼을 누르세요. 아니면 조정값이나 구간을 바꾸세요.</div>
      </div>` : ''}
      ${!table.bandsOff && table.bands.length > 1 ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px">구간 순서: ${table.bands.map((b, i) => App.escapeHtml(App.getBandLabel(table, i))).join(' / ')}</div>` : ''}
      ${previewHtml}
    `;
    preview.style.display = 'block';
    this._bulkReady = { key: inputs.key, count: previewItems.length };
    const saveBtn = document.getElementById('modal-save');
    if (saveBtn) saveBtn.dataset.label = `${previewItems.length}개 적용`;
    setTimeout(() => { try { preview.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_) {} }, 50);
  },

  // 적용 — 적용 시점의 입력값·DB 가격으로 다시 계산 (미리보기 이후 값이 바뀌었으면 다시 미리보기)
  async _applyBulkPrice(services) {
    const cur = this._readBulkInputs();
    if (!cur) { App.showToast('조정값을 입력하세요.', 'error'); return; }
    if (!this._bulkReady || this._bulkReady.key !== cur.key) { await this._previewBulkPrice(services); return; }
    this._bulkReady = null; // 두 번 눌러도 한 번만 적용 (+10% 가 두 번 들어가 +21% 가 되던 문제)
    const ids = (cur.target === 'all' ? services : services.filter(s => (s.category || 'grooming') === cur.target)).map(s => s.id);
    try {
      const tbl = await App.getPriceBands();
      const now = new Date().toISOString();
      let count = 0;
      for (const sid of ids) {
        const svc = await DB.get('services', sid);
        if (!svc) continue;
        const next = this._bulkApply(svc, tbl, cur);
        if (!next) continue;
        svc.pricing = next;
        App.applyLegacyPrices(svc, tbl);
        svc.priceChangedAt = now;
        await DB.update('services', svc);
        count++;
      }
      App.showToast(`${count}개 서비스 가격을 바꿨어요.`);
      App.closeModal();
      App.handleRoute();
    } catch (e) {
      console.error('일괄 가격 조정 실패:', e);
      // 일부만 바뀌었을 수 있으니 같은 미리보기로 다시 적용하지 않게 닫고 새로 고친다
      App.showToast('적용 중 오류가 발생했습니다. 가격을 확인한 뒤 다시 조정해주세요.', 'error');
      App.closeModal();
      App.handleRoute();
    }
  },

  // 즐겨찾기 토글 — 재렌더 없이 해당 줄만 갱신 (검색어·스크롤 유지, 위치는 다음 렌더 때 정렬)
  async toggleFavoriteService(id, btn) {
    const service = await DB.get('services', id);
    if (!service) return;
    service.favorite = !service.favorite;
    try {
      await DB.update('services', service);
    } catch (e) {
      console.error('즐겨찾기 저장 실패:', e);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
      return;
    }
    const isFav = service.favorite;
    if (btn) {
      btn.innerHTML = App.icon(isFav ? 'star-filled' : 'star');
      btn.setAttribute('aria-label', isFav ? '즐겨찾기 해제' : '즐겨찾기');
      btn.style.color = isFav ? '#F59E0B' : 'var(--border)';
      btn.title = isFav ? '즐겨찾기 해제' : '즐겨찾기';
      const row = btn.closest('.service-row');
      if (row && service.isActive !== false) row.style.borderLeft = isFav ? '4px solid #F59E0B' : '';
    }
    App.showToast(isFav ? `"${service.name}" 즐겨찾기 추가` : `"${service.name}" 즐겨찾기 해제`);
  },

  // 서비스 복제 — 같은 데이터로 새 서비스 즉시 등록 후 수정 폼 열기
  async duplicateService(id) {
    const original = await DB.get('services', id);
    if (!original) { App.showToast('원본 서비스를 찾을 수 없습니다.', 'error'); return; }
    // 이름이 겹치지 않게 '(복사본)', '(복사본 2)' … 로 붙인다 (같은 이름이 둘이면 가격 자동 채움이 헷갈린다)
    const usedNames = new Set((await DB.getAll('services')).map(s => App.normalizeServiceName(s.name)));
    let copyName = original.name + ' (복사본)';
    for (let n = 2; usedNames.has(App.normalizeServiceName(copyName)); n++) copyName = `${original.name} (복사본 ${n})`;
    const newSvc = {
      ...original,
      name: copyName,
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
      // 즉시 '복사본 수정'으로 연다 (저장 없이 닫으면 남길지 묻는다)
      setTimeout(() => this.showForm(newId, { title: '복사본 수정', isCopy: true }), 200);
    } catch (e) {
      console.error('복제 실패:', e);
      App.showToast('복제 중 오류가 발생했습니다.', 'error');
    }
  },

  // 새 서비스의 가격 방식 기본값: 이 기기에서 마지막으로 고른 방식 → (없으면) 지금 메뉴에 더 많은 방식 → 구간 가격.
  // 가게가 '구간 사용 안 함'이면 언제나 단일가.
  _defaultPricingMode(services, table) {
    if (table.bandsOff) return 'flat';
    try {
      const v = localStorage.getItem('svcLastPricingMode');
      if (v === 'flat' || v === 'weight') return v;
    } catch (_) {}
    let flat = 0, weight = 0;
    (services || []).filter(s => s.isActive !== false && s.pricing && !s.pricing.free).forEach(s => { if (s.pricing.mode === 'weight') weight++; else flat++; });
    if (flat + weight === 0) return 'weight';
    return flat > weight ? 'flat' : 'weight';
  },

  _rememberPricingMode(mode) {
    try { localStorage.setItem('svcLastPricingMode', mode); } catch (_) {}
  },

  // opts: { title, isCopy } — 복제한 서비스는 '복사본 수정'으로 열고, 저장 없이 닫으면 남길지 묻는다
  async showForm(id, opts = {}) {
    let service = id ? await DB.get('services', id) : { isActive: true };
    if (id && !service) { App.showToast('서비스를 찾을 수 없습니다.', 'error'); return; }
    const table = await App.getPriceBands();
    const bandsOff = !!table.bandsOff;
    const allServices = id ? null : await DB.getAll('services');
    // 단일가(flat) / 몸무게 구간 가격(weight)
    const pricing = id ? App.getServicePricing(service, table) : { mode: this._defaultPricingMode(allServices, table), flat: 0, prices: {} };
    const isFree = !!pricing.free;
    const byBand = pricing.mode === 'weight' && !bandsOff;
    // 구간 칸 값 — 서비스 가격이 옛 구간 id 로 남아 있어도 지금 구간표 기준으로 보여 준다
    const bandRows = pricing.mode === 'weight' ? App.getServiceBandRows({ ...service, pricing }, table) : [];
    const bandVal = (bid) => (bandRows.find(r => r.id === bid) || {}).price || '';
    // 구간 사용 안 함인데 구간 가격 서비스 → 단일가 칸에 지금 쓰이는 값(단일가 또는 첫 구간 가격)
    const flatVal = pricing.mode === 'weight' ? (bandsOff ? (App.calcServicePrice({ ...service, pricing }, null, table).base || '') : '') : (Number(pricing.flat) || '');
    // 큰 아이 추가 요금 규칙
    const overMode = id ? App.getOverKgMode(service, pricing) : App.defaultOverKgMode({ category: service.category || 'grooming' });
    const shopFrom = table.overKg ? App.overKgFrom(table) : null;
    const lastLower = table.bands.length > 1 ? Number(table.bands[table.bands.length - 2].upTo) || 0 : 0;
    const custom = pricing.overKgCustom || { from: shopFrom || lastLower || 10, perKg: table.overKg ? table.overKg.perKg : 5000 };
    const headKg = App.formatKg(shopFrom || Number(custom.from) || 10);
    const STANDARD_INCLUDED = ['발톱 정리', '귀청소', '항문샘', '발바닥', '위생 미용', '향수'];
    const included = service.includedItems || [];

    App.showModal({
      title: opts.title || (id ? '서비스 수정' : '새 서비스 등록'),
      content: `
        <div class="form-group">
          <label class="form-label">서비스명 <span class="required">*</span></label>
          <input type="text" id="f-name" value="${App.escapeHtml(service.name || '')}" placeholder="예: 전체 미용, 부분 목욕">
          <div id="f-name-count" class="form-hint" style="margin-top:4px;display:none"></div>
        </div>
        <div class="form-group">
          <label class="form-label">분류</label>
          <div id="f-category-chips" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="payment-chip${(service.category || 'grooming') === 'grooming' ? ' active' : ''}" data-value="grooming">${App.icon('scissors')} 미용 코스</button>
            <button type="button" class="payment-chip${service.category === 'addon' ? ' active' : ''}" data-value="addon">${App.icon('sparkle')} 추가 옵션</button>
            <button type="button" class="payment-chip${service.category === 'care' ? ' active' : ''}" data-value="care">${App.icon('drop')} 단독 케어</button>
          </div>
          <input type="hidden" id="f-category" value="${service.category || 'grooming'}">
        </div>

        <!-- 가격 — 몸무게 구간별 / 모든 구간 같은 가격(단일가) / 무료 -->
        <div class="form-group">
          <label class="form-label">가격 (원) <span class="required">*</span></label>
          <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:0.88rem;cursor:pointer">
            <input type="checkbox" id="f-price-free" ${isFree ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
            <span>무료 서비스 (0원)</span>
          </label>
          <div id="f-price-area" style="display:${isFree ? 'none' : 'block'}">
            <label style="display:${bandsOff ? 'none' : 'flex'};align-items:center;gap:6px;margin-bottom:8px;font-size:0.88rem;cursor:pointer">
              <input type="checkbox" id="f-price-flat" ${byBand ? '' : 'checked'} style="width:18px;height:18px;cursor:pointer">
              <span>모든 몸무게 같은 가격 (단일가)</span>
            </label>
            <div id="f-price-flat-field" style="display:${byBand ? 'none' : 'block'}">
              <input type="number" id="f-priceFlat" value="${flatVal}" placeholder="가격 입력" min="0" step="1000" inputmode="numeric">
              ${bandsOff ? '<div class="form-hint" style="margin-top:4px">가게 설정이 &lsquo;몸무게 구간 사용 안 함&rsquo;이라 단일가만 써요.</div>' : ''}
            </div>
            <div id="f-price-band-fields" style="display:${byBand ? 'block' : 'none'}">
              ${table.bands.map((b, i) => `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span style="width:84px;flex-shrink:0;font-weight:700;font-size:0.88rem">${App.escapeHtml(App.getBandLabel(table, i))}</span>
                <input type="number" class="f-band-price" id="f-band-${b.id}" data-band="${b.id}" value="${pricing.mode === 'weight' ? bandVal(b.id) : ''}" placeholder="비어 있음" min="0" step="1000" inputmode="numeric" style="flex:1">
              </div>`).join('')}
              <div style="background:var(--bg);border-radius:var(--radius);padding:8px 10px;margin-top:6px;font-size:0.85rem">
                <div style="font-weight:700;margin-bottom:6px">한 번에 채우기</div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  첫 구간 <input type="number" id="f-fill-base" placeholder="가격" min="0" step="1000" inputmode="numeric" style="width:92px">
                  구간마다 + <input type="number" id="f-fill-step" value="5000" min="0" step="1000" inputmode="numeric" style="width:84px"> 원
                  <button type="button" class="btn btn-sm btn-secondary" id="f-fill-apply" style="min-height:40px">채우기</button>
                </div>
              </div>
              <div class="form-hint" style="margin-top:4px">구간은 설정 › 운영 설정 › 가격 구간에서 바꿔요.</div>
            </div>
          </div>
        </div>

        <!-- 자주 안 쓰는 설정은 접어 둔다 -->
        <details id="f-more" class="svc-more" style="margin-bottom:12px;border:1px solid var(--border-light);border-radius:var(--radius);padding:0 12px">
          <summary style="min-height:44px;display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:700;font-size:0.9rem;list-style:none">
            ${App.icon('chevron-down')} 더 보기 <span id="f-more-summary" style="font-weight:500;font-size:0.78rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0"></span>
          </summary>
          <div style="padding:4px 0 8px">
            <div class="form-group" id="f-overkg-group">
              <label class="form-label">${headKg}kg 넘는 아이 추가 요금</label>
              <label class="svc-radio"><input type="radio" name="f-overkg" value="inherit" ${overMode === 'inherit' ? 'checked' : ''}> 가게 기본 <span style="color:var(--text-muted);font-size:0.8rem">(${table.overKg && !bandsOff ? App.escapeHtml(App.describeOverKgRule({ from: shopFrom, perKg: table.overKg.perKg })) : '지금은 없음'})</span></label>
              <label class="svc-radio"><input type="radio" name="f-overkg" value="off" ${overMode === 'off' ? 'checked' : ''}> 추가 요금 없음</label>
              <label class="svc-radio"><input type="radio" name="f-overkg" value="custom" ${overMode === 'custom' ? 'checked' : ''}> 이 서비스만 따로</label>
              <div id="f-overkg-custom" style="display:${overMode === 'custom' ? 'flex' : 'none'};align-items:center;gap:6px;flex-wrap:wrap;margin:4px 0 0 26px;font-size:0.88rem">
                <input type="number" id="f-overkg-from" value="${App.formatKg(custom.from)}" min="1" step="0.5" inputmode="decimal" style="width:72px"> kg 넘으면 1kg당 +
                <input type="number" id="f-overkg-per" value="${Number(custom.perKg) || ''}" min="0" step="1000" inputmode="numeric" style="width:96px"> 원
              </div>
              <div class="form-hint" id="f-overkg-hint" style="margin-top:4px"></div>
            </div>
            <label style="display:flex;align-items:center;gap:6px;margin-bottom:14px;font-size:0.88rem;cursor:pointer">
              <input type="checkbox" id="f-fromPrice" ${pricing.fromPrice ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
              <span>'~부터'로 표시 (예: 40,000원~ — 상태에 따라 더 받을 수 있음)</span>
            </label>
            <!-- 포함 항목 — 이 서비스에 기본 포함되는 작업 -->
            <div class="form-group">
              <label class="form-label">포함 항목 <span style="color:var(--text-muted);font-size:0.78rem">(영수증·사진 카드에 표시)</span></label>
              <div id="f-included-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                ${STANDARD_INCLUDED.map(item => `<button type="button" class="payment-chip${included.includes(item) ? ' active' : ''}" data-included="${item}">${item}</button>`).join('')}
              </div>
              <input type="text" id="f-included-custom" placeholder="기타 항목 입력 후 Enter (예: 마사지)" style="margin-bottom:6px;font-size:max(16px,0.88rem)" data-no-enter-save>
              <div id="f-included-custom-list" style="display:flex;gap:4px;flex-wrap:wrap">
                ${included.filter(i => !STANDARD_INCLUDED.includes(i)).map(i => `<span class="badge badge-info custom-included-tag" data-item="${App.escapeHtml(i)}" style="cursor:pointer;padding:6px 10px" title="눌러서 빼기">${App.escapeHtml(i)} ×</span>`).join('')}
              </div>
              <input type="hidden" id="f-includedItems" value="${App.escapeHtml(included.join('|'))}">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">설명 <span style="color:var(--text-muted);font-size:0.78rem">(내부 메모)</span></label>
              <textarea id="f-description" placeholder="서비스 내부 메모">${App.escapeHtml(service.description || '')}</textarea>
            </div>
          </div>
        </details>
      `,
      onSave: () => this.saveService(id, { isCopy: !!opts.isCopy })
    });

    // 새 서비스: '저장하고 이어서 등록' (분류·가격 방식은 그대로, 이름·가격만 비우고 다음 서비스)
    this._contAdded = 0;
    this._copySaved = false;
    if (!id) {
      const footer = document.getElementById('modal-footer');
      const saveBtn = document.getElementById('modal-save');
      if (footer && saveBtn) {
        const cont = document.createElement('button');
        cont.type = 'button';
        cont.id = 'modal-save-continue';
        cont.className = 'btn btn-secondary modal-extra-btn';
        cont.style.cssText = 'white-space:normal;line-height:1.2';
        cont.textContent = '저장하고 이어서 등록';
        cont.addEventListener('click', async () => {
          if (cont.disabled) return;
          cont.disabled = true;
          try { await this.saveService(null, { cont: true }); } finally { cont.disabled = false; }
        });
        footer.insertBefore(cont, saveBtn);
      }
      // 이어서 등록한 게 있으면 닫을 때 목록을 새로 그린다
      App._modalOnClose = () => { if (this._contAdded) { this._contAdded = 0; App.handleRoute(); } };
    } else if (opts.isCopy) {
      // 복사본을 저장하지 않고 닫으면 남길지 묻는다 (안 고친 복사본이 메뉴에 쌓이지 않게)
      App._modalOnClose = () => {
        if (this._copySaved) return;
        setTimeout(async () => {
          const cur = await DB.get('services', id);
          if (!cur) return;
          const del = await App.confirm(`복사본 "<strong>${App.escapeHtml(cur.name)}</strong>"을 남길까요?`, { okLabel: '복사본 삭제', cancelLabel: '남기기' });
          if (del) {
            try { await DB.delete('services', id); App.showToast('복사본을 삭제했어요.'); } catch (e) { console.error(e); }
          }
          App.handleRoute();
        }, 450);
      };
    }

    const $ = (x) => document.getElementById(x);
    // 새 서비스는 분류·이름에 맞춰 기본 규칙을 따라가다가, 직접 고르면 멈춘다 (이어서 등록 때 다시 풀린다 — 표시는 DOM 에)
    const overGroup = $('f-overkg-group');
    if (overGroup && id) overGroup.dataset.touched = '1';
    const curMode = () => ($('f-price-flat')?.checked || bandsOff) ? 'flat' : 'weight';

    // '더 보기' 요약 (접혀 있어도 무엇이 켜져 있는지 보이게)
    const updateMoreSummary = () => {
      const el = $('f-more-summary');
      if (!el) return;
      const parts = [];
      const m = document.querySelector('input[name="f-overkg"]:checked')?.value;
      if (m === 'custom') parts.push(App.describeOverKgRule({ from: parseFloat($('f-overkg-from')?.value) || 0, perKg: Number($('f-overkg-per')?.value) || 0 }));
      else if (m === 'off') parts.push('큰 아이 추가 요금 없음');
      else if (curMode() === 'weight' && table.overKg) parts.push('추가 요금 가게 기본');
      if ($('f-fromPrice')?.checked) parts.push('~부터');
      const inc = ($('f-includedItems')?.value || '').split('|').filter(Boolean).length;
      if (inc) parts.push('포함 ' + inc + '개');
      if (($('f-description')?.value || '').trim()) parts.push('메모');
      el.textContent = parts.length ? '· ' + parts.join(' · ') : '';
    };
    const updateOverHint = () => {
      const m = document.querySelector('input[name="f-overkg"]:checked')?.value;
      if ($('f-overkg-custom')) $('f-overkg-custom').style.display = m === 'custom' ? 'flex' : 'none';
      const hint = $('f-overkg-hint');
      if (hint) {
        if (curMode() === 'flat' && m === 'inherit') hint.textContent = '단일가 서비스에는 가게 기본 추가 요금이 붙지 않아요. 붙이려면 \'이 서비스만 따로\'를 고르세요.';
        else if (m === 'custom' && curMode() === 'weight' && lastLower > 0) hint.textContent = `마지막 구간(${App.formatKg(lastLower)}kg~)보다 가벼운 아이에게는 붙지 않아요.`;
        else hint.textContent = '';
      }
      updateMoreSummary();
    };
    const setOverDefault = () => {
      if (overGroup?.dataset.touched === '1') return;
      const def = App.defaultOverKgMode({ category: $('f-category')?.value || 'grooming', name: $('f-name')?.value || '' });
      const r = document.querySelector(`input[name="f-overkg"][value="${def}"]`);
      if (r) r.checked = true;
      updateOverHint();
    };
    document.querySelectorAll('input[name="f-overkg"]').forEach(r => r.addEventListener('change', () => { if (overGroup) overGroup.dataset.touched = '1'; updateOverHint(); }));
    ['f-overkg-from', 'f-overkg-per', 'f-description'].forEach(x => $(x)?.addEventListener('input', updateMoreSummary));
    $('f-fromPrice')?.addEventListener('change', updateMoreSummary);
    $('f-name')?.addEventListener('change', setOverDefault);
    // 이름 글자 수 — 40자를 넘으면 잘라 버리지 않고 알려 준다
    const nameCount = () => {
      const el = $('f-name-count'); const n = ($('f-name')?.value || '').trim().length;
      if (!el) return;
      el.style.display = n > 30 ? 'block' : 'none';
      el.textContent = n > 40 ? `${n}자 — 40자까지 쓸 수 있어요 (${n - 40}자 줄여 주세요)` : `${n}/40자`;
      el.style.color = n > 40 ? 'var(--danger)' : '';
    };
    $('f-name')?.addEventListener('input', nameCount);
    nameCount();
    updateOverHint();

    // 분류 chips 핸들러
    document.querySelectorAll('#f-category-chips .payment-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#f-category-chips .payment-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('f-category').value = btn.dataset.value;
        setOverDefault();
      });
    });

    // 포함 항목 chips 핸들러 + 자유 입력
    const updateIncludedHidden = () => {
      const checked = Array.from(document.querySelectorAll('#f-included-chips .payment-chip.active')).map(b => b.dataset.included);
      const customs = Array.from(document.querySelectorAll('#f-included-custom-list .custom-included-tag')).map(b => b.dataset.item);
      $('f-includedItems').value = [...checked, ...customs].join('|');
      updateMoreSummary();
    };
    document.querySelectorAll('#f-included-chips .payment-chip').forEach(btn => {
      btn.addEventListener('click', () => { btn.classList.toggle('active'); updateIncludedHidden(); });
    });
    $('f-included-custom')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      const val = e.target.value.trim();
      if (!val || STANDARD_INCLUDED.includes(val)) { e.target.value = ''; return; }
      const existing = Array.from(document.querySelectorAll('#f-included-custom-list .custom-included-tag')).map(b => b.dataset.item);
      if (existing.includes(val)) { e.target.value = ''; return; }
      const list = $('f-included-custom-list');
      list.insertAdjacentHTML('beforeend', `<span class="badge badge-info custom-included-tag" data-item="${App.escapeHtml(val)}" style="cursor:pointer;padding:6px 10px" title="눌러서 빼기">${App.escapeHtml(val)} ×</span>`);
      e.target.value = '';
      updateIncludedHidden();
    });
    // 자유 입력 태그 제거 (위임 — 이어서 등록으로 비운 뒤에도 동작)
    $('f-included-custom-list')?.addEventListener('click', (e) => {
      const tag = e.target.closest('.custom-included-tag');
      if (tag) { tag.remove(); updateIncludedHidden(); }
    });
    updateMoreSummary();

    // 무료 서비스 체크 → 가격 칸 숨김
    $('f-price-free')?.addEventListener('change', (e) => {
      $('f-price-area').style.display = e.target.checked ? 'none' : 'block';
    });

    // 단일가 ↔ 구간 가격 전환 — 값을 서로 옮겨 준다
    $('f-price-flat')?.addEventListener('change', (e) => {
      const flat = e.target.checked;
      $('f-price-flat-field').style.display = flat ? 'block' : 'none';
      $('f-price-band-fields').style.display = flat ? 'none' : 'block';
      const inputs = Array.from(document.querySelectorAll('.f-band-price'));
      const flatInput = $('f-priceFlat');
      if (flat) {
        const first = inputs.map(i => Number(i.value) || 0).find(v => v > 0);
        if (first && !Number(flatInput.value)) flatInput.value = first;
      } else {
        const v = Number(flatInput.value) || 0;
        if (v > 0) inputs.forEach(i => { if (!Number(i.value)) i.value = v; });
      }
      updateOverHint();
    });
    // 첫 구간 가격 + 구간마다 +N원 자동 채움 (반올림 단위 적용)
    $('f-fill-apply')?.addEventListener('click', () => {
      const base = Number($('f-fill-base')?.value) || 0;
      const step = Number($('f-fill-step')?.value) || 0;
      if (!(base > 0)) { App.showToast('첫 구간 가격을 입력하세요.', 'error'); App.highlightField('f-fill-base'); return; }
      const unit = table.rounding || 1000;
      document.querySelectorAll('.f-band-price').forEach((inp, i) => { inp.value = Math.round((base + step * i) / unit) * unit; });
    });
    // 채우기 칸에서 Enter 는 저장이 아니라 채우기
    $('f-fill-base')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); $('f-fill-apply')?.click(); } });
    $('f-fill-step')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); $('f-fill-apply')?.click(); } });
  },

  // 폼 → pricing. 문제가 있으면 { error } (안내는 여기서 띄운다). 빈 구간이 있으면 어떻게 할지 묻는다.
  async _readPricingFromForm(table, existingPricing) {
    const $ = (x) => document.getElementById(x);
    const free = !!$('f-price-free')?.checked;
    const flatMode = table.bandsOff || !!$('f-price-flat')?.checked;
    const pricing = { mode: flatMode ? 'flat' : 'weight', flat: 0, prices: {} };
    if (free) {
      pricing.free = true;
    } else if (flatMode) {
      pricing.flat = Math.max(0, Number($('f-priceFlat')?.value) || 0);
      if (!(pricing.flat > 0)) {
        App.highlightField('f-priceFlat');
        App.showToast("가격을 입력하세요 (무료면 '무료 서비스' 체크)", 'error');
        return { error: true };
      }
      // '구간 사용 안 함' 중에 구간 가격 서비스를 고쳐도 구간 가격은 지우지 않고 보관한다 (다시 켜면 돌아온다)
      if (table.bandsOff && existingPricing && existingPricing.mode === 'weight') {
        pricing.mode = 'weight';
        pricing.prices = { ...(existingPricing.prices || {}) };
        if (existingPricing.bandsAt) pricing.bandsAt = existingPricing.bandsAt;
      }
    } else {
      const inputs = Array.from(document.querySelectorAll('.f-band-price'));
      const vals = inputs.map(inp => Math.max(0, Number(inp.value) || 0));
      const filled = vals.filter(v => v > 0);
      if (filled.length === 0) {
        if (inputs[0]) App.highlightField(inputs[0].id || 'f-fill-base');
        App.showToast("가격을 입력하세요 (무료면 '무료 서비스' 체크)", 'error');
        return { error: true };
      }
      if (filled.length < vals.length) {
        // 일부 구간만 적었다 — 빈 구간을 어떻게 할지 묻는다
        const first = filled[0];
        const emptyLabels = inputs.map((inp, i) => vals[i] > 0 ? null : App.getBandLabel(table, i)).filter(Boolean);
        const pick = await App.choose(
          `빈 구간을 어떻게 할까요?<br><small style="color:var(--text-muted)">비어 있음: ${App.escapeHtml(emptyLabels.join(', '))}</small>`,
          [
            { value: 'fill', label: '앞 구간 가격으로 채우기' },
            { value: 'flat', label: `모두 같은 가격 (단일가 ${App.formatCurrency(first)})` }
          ], { cancelLabel: '취소' });
        if (!pick) return { error: true };
        if (pick === 'fill') {
          let last = 0;
          // 앞 구간 값 → 맨 앞이 비었으면 그 뒤 첫 값
          const out = vals.map(v => { if (v > 0) last = v; return v > 0 ? v : last; });
          for (let i = 0; i < out.length && !out[i]; i++) out[i] = first;
          out.forEach((v, i) => { inputs[i].value = v; });
          vals.splice(0, vals.length, ...out);
        } else if (pick === 'flat') {
          pricing.mode = 'flat';
          pricing.flat = first;
          // 화면도 단일가로 바꾸고 그 값을 단일가 칸에 (change 로 칸 전환·값 이동)
          const fl = $('f-price-flat');
          if (fl && !fl.checked) { fl.checked = true; fl.dispatchEvent(new Event('change')); }
          if ($('f-priceFlat')) $('f-priceFlat').value = first;
        }
      }
      if (pricing.mode === 'weight') {
        // 모든 구간이 같아도 사장님이 고른 구간 가격 방식을 그대로 둔다 (말없이 단일가로 바꾸지 않는다)
        inputs.forEach((inp, i) => { if (vals[i] > 0) pricing.prices[inp.dataset.band] = vals[i]; });
      }
    }
    if (!free && $('f-fromPrice')?.checked) pricing.fromPrice = true;
    // 큰 아이 추가 요금 규칙
    const overMode = document.querySelector('input[name="f-overkg"]:checked')?.value || 'inherit';
    pricing.overKgMode = overMode;
    if (overMode === 'custom') {
      let from = parseFloat($('f-overkg-from')?.value);
      const perKg = Number($('f-overkg-per')?.value);
      if (!(from > 0) || !(perKg > 0)) {
        $('f-more').open = true;
        App.highlightField(!(from > 0) ? 'f-overkg-from' : 'f-overkg-per');
        App.showToast('추가 요금 기준 kg 과 1kg당 금액을 입력하세요.', 'error');
        return { error: true };
      }
      const lastLower = table.bands.length > 1 ? Number(table.bands[table.bands.length - 2].upTo) || 0 : 0;
      if (pricing.mode === 'weight' && !table.bandsOff && from < lastLower) {
        from = lastLower; // 마지막 구간보다 가벼운 구간 안에서는 붙지 않는다
        if ($('f-overkg-from')) $('f-overkg-from').value = App.formatKg(from);
        App.showToast(`추가 요금 기준을 마지막 구간 시작(${App.formatKg(from)}kg)으로 맞췄어요.`, 'info');
      }
      pricing.overKgCustom = { from, perKg };
    }
    return { pricing };
  },

  // opts.cont: 저장하고 이어서 등록 / opts.isCopy: 복사본 수정
  async saveService(id, opts = {}) {
    const $ = (x) => document.getElementById(x);
    const name = $('f-name').value.trim();
    const description = $('f-description').value.trim();
    if (!name) { App.highlightField('f-name'); App.showToast('서비스명을 입력해주세요.', 'error'); return; }
    if (name.length > 40) { App.highlightField('f-name'); App.showToast(`서비스명은 40자까지예요 (지금 ${name.length}자).`, 'error'); return; }

    let table = await App.getPriceBands();
    const category = $('f-category')?.value || 'grooming';
    const includedItemsStr = $('f-includedItems')?.value || '';
    const includedItems = includedItemsStr.split('|').map(s => s.trim()).filter(Boolean);

    // 같은 이름(공백 정규화·대소문자 무시) 서비스 중복 방지 — 수정 중인 자신은 제외
    const normName = App.normalizeServiceName(name).toLowerCase();
    const allServices = await DB.getAll('services');
    const dup = allServices.find(s => s.id !== id && App.normalizeServiceName(s.name || '').toLowerCase() === normName);
    if (dup) {
      if (dup.isActive === false && !id) {
        const ok = await App.confirm('같은 이름의 비활성 서비스가 있습니다. 활성화할까요?', { okLabel: '활성화', danger: false });
        if (!ok) return;
        dup.isActive = true;
        await DB.update('services', dup);
        App.showToast(`"${dup.name}" 서비스가 활성화되었습니다.`);
        App.closeModal();
        App.handleRoute();
        return;
      }
      App.highlightField('f-name');
      App.showToast(dup.isActive === false ? '같은 이름의 비활성 서비스가 있습니다.' : '같은 이름의 서비스가 이미 있습니다.', 'error');
      return;
    }

    const existing0 = id ? await DB.get('services', id) : null;
    const read = await this._readPricingFromForm(table, existing0 ? App.getServicePricing(existing0, table) : null);
    if (read.error) return;
    const pricing = read.pricing;

    // 처음 한 번: 가게 기본 큰 아이 추가 요금을 그대로 쓸지 묻는다 (구간 가격 + 가게 기본 규칙인 서비스를 처음 저장할 때)
    let openBandEditor = false;
    if (!id && pricing.mode === 'weight' && !pricing.free && pricing.overKgMode === 'inherit' && table.overKg && !table.bandsOff
        && !(await DB.getSetting('overKgDefaultAsked'))) {
      const rule = App.describeOverKgRule({ from: App.overKgFrom(table), perKg: table.overKg.perKg });
      const pick = await App.choose(`큰 아이 추가 요금: <strong>${App.escapeHtml(rule)}</strong> 추가<br>그대로 쓸까요?<br><small style="color:var(--text-muted)">미용 코스에 붙어요. 서비스마다 '더 보기'에서 바꿀 수 있어요.</small>`, [
        { value: 'keep', label: '그대로' },
        { value: 'edit', label: '금액 바꾸기' },
        { value: 'off', label: '쓰지 않기' }
      ], { cancelLabel: '나중에' });
      if (pick) await DB.setSetting('overKgDefaultAsked', 1);
      if (pick === 'edit') openBandEditor = true;
      if (pick === 'off') {
        table = await App.savePriceBands({ ...table, overKg: null });
        await App.refreshLegacyPrices(table);
        App.showToast('큰 아이 추가 요금을 껐어요. 설정 › 가격 구간에서 다시 켤 수 있어요.', 'info');
      }
    }

    const data = { name, description, pricing, category, isActive: true, includedItems };
    App.applyLegacyPrices(data, table); // 구버전 기기용 priceSmall/Medium/Large + 서명
    const priceSig = (p) => JSON.stringify({
      m: p.mode, f: Number(p.flat) || 0, z: !!p.free,
      p: p.mode === 'weight' ? table.bands.map(b => Number((p.prices || {})[b.id]) || 0) : [],
      o: App.getOverKgMode(data, p), c: p.overKgCustom ? [Number(p.overKgCustom.from), Number(p.overKgCustom.perKg)] : null
    });

    let renamedFrom = null;
    if (id) {
      const existing = await DB.get('services', id);
      if (!existing) { App.showToast('서비스를 찾을 수 없습니다.', 'error'); return; }
      if (App.normalizeServiceName(existing.name) !== App.normalizeServiceName(name) && !opts.isCopy) renamedFrom = existing.name;
      data.isActive = existing.isActive;
      data.favorite = existing.favorite;
      // 가격 변경 감지 → priceChangedAt 갱신
      const priceChanged = priceSig(App.getServicePricing(existing, table)) !== priceSig(pricing);
      data.priceChangedAt = priceChanged ? new Date().toISOString() : existing.priceChangedAt;
      Object.assign(existing, data);
      await DB.update('services', existing);
      this._copySaved = true;
      App.showToast(opts.isCopy ? '복사본을 저장했어요.' : '서비스가 수정되었습니다.');
    } else {
      data.priceChangedAt = new Date().toISOString();
      await DB.add('services', data);
      if (!pricing.free) this._rememberPricingMode(pricing.mode);
      if (opts.cont) {
        // 이어서 등록: 분류·가격 방식은 그대로, 이름·가격·세부 설정만 비운다
        this._contAdded = (this._contAdded || 0) + 1;
        App.showToast(openBandEditor ? `"${name}" 등록 — 추가 요금 금액은 다 등록한 뒤 설정 › 가격 구간에서 바꾸세요` : `"${name}" 등록 — 다음 서비스를 입력하세요`, openBandEditor ? 'info' : 'success');
        App._modalDirty = false; // 비운 새 칸은 '작성 중'이 아니다
        $('f-name').value = '';
        $('f-name').dispatchEvent(new Event('input')); // 글자 수 표시 갱신
        $('f-priceFlat') && ($('f-priceFlat').value = '');
        document.querySelectorAll('.f-band-price').forEach(i => { i.value = ''; });
        if ($('f-fill-base')) $('f-fill-base').value = '';
        if ($('f-price-free')?.checked) { $('f-price-free').checked = false; $('f-price-area').style.display = 'block'; }
        if ($('f-fromPrice')) $('f-fromPrice').checked = false;
        document.querySelectorAll('#f-included-chips .payment-chip.active').forEach(b => b.classList.remove('active'));
        if ($('f-included-custom-list')) $('f-included-custom-list').innerHTML = '';
        if ($('f-includedItems')) $('f-includedItems').value = '';
        if ($('f-description')) $('f-description').value = '';
        // 추가 요금 규칙은 다시 분류 기본값을 따르게 (같은 분류 칩을 한 번 더 눌러 기본값·요약을 다시 맞춘다)
        if ($('f-overkg-group')) delete $('f-overkg-group').dataset.touched;
        document.querySelector('#f-category-chips .payment-chip.active')?.click();
        const sub = document.querySelector('#modal-title');
        if (sub) sub.textContent = `새 서비스 등록 (${this._contAdded}개 등록됨)`;
        setTimeout(() => $('f-name')?.focus(), 50);
        return;
      }
      App.showToast('새 서비스가 등록되었습니다.');
    }

    this._contAdded = 0; // 아래 handleRoute 한 번만
    App.closeModal();
    if (openBandEditor) { setTimeout(() => App.pages.settings.showPriceBandEditor(), 350); App.handleRoute(); return; }
    if (renamedFrom) {
      // closeModal()의 history.back() 이 확인창을 바로 닫아 버리지 않게 잠깐 기다린다
      await new Promise(r => setTimeout(r, 180));
      await this._propagateRename(id, renamedFrom, name);
    }
    App.handleRoute();
  },

  // 서비스 이름 변경 후: 기존 기록의 서비스명(스냅샷)과 자동완성 이력을 새 이름으로 맞출지 묻는다.
  // 매출·가격 필드는 건드리지 않는다.
  async _propagateRename(id, oldName, newName) {
    const oldNorm = App.normalizeServiceName(oldName);
    const newNorm = App.normalizeServiceName(newName);
    try {
      // 자동완성 이력: 옛 이름을 새 이름으로 교체 (중복 제거, 순서 유지)
      const history = await App.getAutoHistory('serviceHistory');
      if (Array.isArray(history) && history.some(v => App.normalizeServiceName(v) === oldNorm)) {
        const next = [];
        history.forEach(v => {
          const val = App.normalizeServiceName(v) === oldNorm ? newNorm : v;
          if (!next.includes(val)) next.push(val);
        });
        await DB.setSetting('serviceHistory', next);
      }

      const light = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'photo3', 'photo4', 'memo']);
      const isMain = (r) =>
        (r.serviceId != null && Number(r.serviceId) === Number(id)) ||
        (r.serviceId == null && !!r.service && App.normalizeServiceName(r.service) === oldNorm);
      // 추가 항목(addons)은 이름 글자로만 저장돼 있어 같은 이름 태그도 함께 바꾼다
      const hasAddon = (r) => Array.isArray(r.addons) && r.addons.some(a => App.normalizeServiceName(a) === oldNorm);
      const targetIds = light.filter(r => isMain(r) || hasAddon(r)).map(r => r.id);
      if (targetIds.length === 0) return;

      const ok = await App.confirm(`이름을 바꿨습니다. 기존 미용 기록 ${targetIds.length}건의 서비스명도 새 이름으로 바꿀까요? (매출·가격은 그대로)`, { okLabel: '기록 이름도 변경', cancelLabel: '이 서비스만 변경', danger: false });
      if (!ok) return;

      // 사진 포함 전체 기록을 다시 읽어 갱신 (경량 사본으로 update 하면 사진 필드가 지워진다)
      let updated = 0;
      const CHUNK = 50;
      for (let i = 0; i < targetIds.length; i += CHUNK) {
        for (const rid of targetIds.slice(i, i + CHUNK)) {
          const rec = await DB.get('records', rid);
          if (!rec) continue;
          if (isMain(rec)) {
            rec.service = newNorm;
            if (Array.isArray(rec.serviceNames) && rec.serviceNames.length === 1) rec.serviceNames = [newNorm];
            if (rec.serviceId == null) rec.serviceId = id;
          }
          if (hasAddon(rec)) {
            const next = [];
            rec.addons.forEach(a => { const v = App.normalizeServiceName(a) === oldNorm ? newNorm : a; if (!next.includes(v)) next.push(v); });
            rec.addons = next;
          }
          await DB.update('records', rec);
          updated++;
        }
        await new Promise(r => setTimeout(r, 0)); // 대량 갱신 중 UI 멈춤 방지
      }
      App.showToast(`미용 기록 ${updated}건의 서비스명을 변경했습니다.`);
    } catch (e) {
      console.error('서비스명 기록 반영 실패:', e);
      App.showToast('기록 서비스명 변경 중 오류가 발생했습니다.', 'error');
    }
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
    // 아직 끝나지 않은 예약(취소·완료·노쇼 제외)이 이 서비스를 쓰면 완전 삭제를 막는다.
    // 예약은 서비스 id 만 들고 있어, 지우면 예약에서 서비스가 사라지고 완료 때 서비스·가격이 비게 된다.
    const appts = await DB.getAll('appointments');
    const openCount = appts.filter(a =>
      !['cancelled', 'completed', 'noshow'].includes(a.status) &&
      (a.serviceIds || []).some(sid => Number(sid) === Number(id))
    ).length;
    if (openCount > 0) {
      const name = App.escapeHtml(service.name);
      if (service.isActive === false) {
        await App.confirm(`"${name}" 서비스는 아직 끝나지 않은 예약 <strong>${openCount}건</strong>에 들어 있어 삭제할 수 없어요.<br><br>그 예약들을 완료하거나 서비스를 바꾼 뒤에 삭제하세요. (지금은 비활성 상태라 메뉴에는 보이지 않아요)`, { okLabel: '확인', danger: false });
        return;
      }
      const hide = await App.confirm(`"${name}" 서비스는 아직 끝나지 않은 예약 <strong>${openCount}건</strong>에 들어 있어 삭제할 수 없어요.<br><br>대신 <strong>비활성화</strong>하면 메뉴에서만 숨겨지고 예약·기록은 그대로 남아요. 비활성화할까요?`, { okLabel: '비활성화', danger: false });
      if (!hide) return;
      service.isActive = false;
      await DB.update('services', service);
      App.showToast('서비스가 비활성화되었습니다.');
      App.handleRoute();
      return;
    }
    // 사진 필드를 뺀 경량 로드 (전체 기간 집계가 필요하지만 사진까지 메모리에 올릴 이유는 없다)
    const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'photo3', 'photo4', 'memo']);
    // serviceId → 구형 serviceIds → 이름 순으로 매칭, 추가 항목 포함 (기록당 1회)
    const refCount = records.filter(r => this._recordUsesService(r, service)).length;

    let msg;
    if (refCount > 0) {
      msg = `"${App.escapeHtml(service.name)}" 서비스를 <strong>완전 삭제</strong>하시겠습니까?<br><br>
        <span style="color:var(--danger)">${App.icon('alert')} 미용 기록 <strong>${refCount}건</strong>에서 사용 중입니다.</span><br>
        삭제 시: 기록의 서비스명은 텍스트로 유지되지만 서비스 목록에서 사라집니다.<br><br>
        <small style="color:var(--text-muted)">잠시 숨기려면 삭제 대신 ⋯ 메뉴의 [비활성화]를 누르세요.</small>`;
    } else {
      msg = `"${App.escapeHtml(service.name)}" 서비스를 삭제하시겠습니까?`;
    }

    const confirmed = await App.confirm(msg, { okLabel: '삭제' });
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

  // 템플릿 1개 → 저장할 서비스 (미리보기·저장 공통)
  _templatePricing(d, table, asFlat) {
    const svc = { ...d, isActive: true };
    if (asFlat) svc.pricing = { mode: 'flat', flat: Number(svc.priceSmall) || 0, prices: {}, overKgMode: App.defaultOverKgMode(svc) };
    else svc.pricing = App.legacyToPricing(svc, table);
    return svc;
  },

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

    const table0 = await App.getPriceBands();
    // 카테고리별 그룹 HTML
    let html = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">'
      + '<span style="font-size:0.85rem;color:var(--text-secondary)">등록할 서비스를 고르세요</span>'
      + '<button type="button" class="btn btn-sm btn-ghost" id="tpl-toggle-all" style="min-height:40px">전체 해제</button></div>'
      + '<label style="display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:8px;background:var(--bg);border-radius:var(--radius);cursor:pointer;font-size:0.88rem">'
      + '<input type="checkbox" id="tpl-flat" ' + (table0.bandsOff ? 'checked disabled' : '') + ' style="width:18px;height:18px">'
      + '<span><strong>단일가로 등록</strong> <span style="color:var(--text-muted);font-size:0.8rem">— 몸무게 상관없이 아래 가격 하나로</span></span></label>';
    for (const cat of catOrder) {
      const items = available.filter(d => d.category === cat);
      if (items.length === 0) continue;
      html += '<div style="font-weight:700;font-size:0.82rem;color:var(--primary);margin:10px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--primary-lighter)">' + catLabels[cat] + '</div>';
      items.forEach((d, i) => {
        const globalIdx = available.indexOf(d);
        html += '<label style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-light);cursor:pointer">' +
          '<input type="checkbox" name="defaultSvc" value="' + globalIdx + '" checked style="width:18px;height:18px">' +
          '<div style="flex:1"><strong style="font-size:0.9rem">' + App.escapeHtml(d.name) + '</strong>' +
          '<div style="font-size:0.75rem;color:var(--text-muted)">' + App.escapeHtml(d.description) + ' | <span class="tpl-price" data-idx="' + globalIdx + '"></span></div></div></label>';
      });
    }

    App.showModal({
      title: '기본 서비스 선택 등록',
      content: html,
      saveText: '선택한 서비스 등록',
      onSave: async () => {
        const checked = document.querySelectorAll('input[name="defaultSvc"]:checked');
        if (checked.length === 0) { App.showToast('서비스를 선택해주세요.', 'error'); return; }
        const table = await App.getPriceBands();
        const asFlat = table.bandsOff || !!document.getElementById('tpl-flat')?.checked;
        for (const cb of checked) {
          // 미리보기와 같은 변환으로 저장 (구버전 기기용 값도 함께)
          await DB.add('services', App.withPricing(this._templatePricing(available[Number(cb.value)], table, asFlat), table));
        }
        this._rememberPricingMode(asFlat ? 'flat' : 'weight');
        App.showToast(`${checked.length}개 서비스가 등록되었습니다.`);
        App.closeModal();
        App.handleRoute();
      }
    });
    // 가격 글자 — 저장될 가격과 똑같이 (같은 변환 함수로 계산): 단일가 '35,000원' / 구간 '3.5만~5.5만' + 큰 아이 추가 요금
    const paintPrices = () => {
      const flat = table0.bandsOff || !!document.getElementById('tpl-flat')?.checked;
      document.querySelectorAll('.tpl-price').forEach(el => {
        const svc = this._templatePricing(available[Number(el.dataset.idx)], table0, flat);
        const rule = App.getOverKgRule(svc, table0, svc.pricing);
        el.textContent = App.formatServicePrice(svc, table0) + (rule ? ' · ' + App.describeOverKgRule(rule) : '');
      });
    };
    paintPrices();
    document.getElementById('tpl-flat')?.addEventListener('change', paintPrices);
    // 전체 선택 / 전체 해제
    const syncToggle = () => {
      const boxes = Array.from(document.querySelectorAll('input[name="defaultSvc"]'));
      const btn = document.getElementById('tpl-toggle-all');
      if (btn) btn.textContent = boxes.every(b => b.checked) ? '전체 해제' : '전체 선택';
    };
    document.getElementById('tpl-toggle-all')?.addEventListener('click', () => {
      const boxes = Array.from(document.querySelectorAll('input[name="defaultSvc"]'));
      const all = boxes.every(b => b.checked);
      boxes.forEach(b => { b.checked = !all; });
      syncToggle();
    });
    document.querySelectorAll('input[name="defaultSvc"]').forEach(b => b.addEventListener('change', syncToggle));
  }
};
