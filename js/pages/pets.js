// ========== Pets Page ==========
App.pages.pets = {
  async render(container, params) {
    if (params && params[0]) {
      await this.renderDetail(container, Number(params[0]));
      return;
    }
    await this.renderList(container);
  },

  async renderList(container) {
    const allPets = await DB.getAll('pets');
    const customers = await DB.getAllLight('customers', ['memo', 'address']);
    // 효율적 쿼리: 목록에서는 사진/메모 등 큰 필드 제외
    const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo']);
    const customerMap = {};
    customers.forEach(c => customerMap[c.id] = c);

    // Last visit per pet
    const petLastVisit = {};
    records.forEach(r => {
      if (!petLastVisit[r.petId] || (r.date || '') > (petLastVisit[r.petId] || '')) {
        petLastVisit[r.petId] = r.date;
      }
    });

    // 사망/양도 반려견은 기본 목록에서 제외 (재방문 알림·통계 오염 방지)
    const showInactive = !!this._showInactive;
    const pets = showInactive ? allPets : allPets.filter(p => (p.petStatus || 'active') === 'active');
    const inactiveCount = allPets.length - allPets.filter(p => (p.petStatus || 'active') === 'active').length;

    // 방문 상태 사전 계산 (정렬 비교 중 반복 호출 방지)
    const visitStatusMap = {};
    pets.forEach(p => {
      visitStatusMap[p.id] = App.classifyVisitStatus(p.lastVisitDate || petLastVisit[p.id], p.groomingCycle);
    });

    const sortKey = this._sortKey || 'name';
    const statusPriority = { churned: 0, 'at-risk': 1, remind: 2, normal: 3 };
    const sorted = pets.sort((a, b) => {
      if (sortKey === 'lastVisit') return (petLastVisit[b.id] || '').localeCompare(petLastVisit[a.id] || '');
      if (sortKey === 'breed') return (a.breed || '').localeCompare(b.breed || '', 'ko');
      if (sortKey === 'status') {
        return (statusPriority[visitStatusMap[a.id]] ?? 3) - (statusPriority[visitStatusMap[b.id]] ?? 3);
      }
      return (a.name || '').localeCompare(b.name || '', 'ko');
    });

    const sortOptions = [
      { v: 'name', l: '이름순' },
      { v: 'lastVisit', l: '최근방문순' },
      { v: 'breed', l: '견종별' },
      { v: 'status', l: '상태별' }
    ];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">반려견 관리</h1>
          <p class="page-subtitle">
            총 ${pets.length}마리${inactiveCount > 0 ? ` <a href="#" id="pet-toggle-inactive" style="color:var(--primary);text-decoration:underline;font-size:0.85rem;margin-left:4px">${showInactive ? '비활성 숨기기' : `비활성 ${inactiveCount}마리 보기`}</a>` : ''}
          </p>
        </div>
        <div class="page-actions">
          <select id="pet-sort" style="width:auto;min-width:100px;font-size:0.88rem;padding:10px 12px;min-height:40px">
            ${sortOptions.map(o => `<option value="${o.v}"${sortKey === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="btn-add-pet">+ 등록</button>
        </div>
      </div>
      <div class="search-box" style="margin-bottom:12px;max-width:none">
        <span class="search-icon">&#x1F50D;</span>
        <input type="text" id="pet-search" placeholder="이름, 견종, 보호자 검색..." style="width:100%">
      </div>

      ${sorted.length === 0 ? `
        <div class="empty-state" style="padding:60px 20px">
          <div class="empty-state-icon">&#x1F436;</div>
          <div class="empty-state-text">등록된 반려견이 없습니다</div>
        </div>
      ` : sorted.map(p => {
        const owner = customerMap[p.customerId];
        const lastVisit = petLastVisit[p.id];
        const vs = visitStatusMap[p.id];
        const isInactive = (p.petStatus || 'active') !== 'active';
        const inactiveLabel = p.petStatus === 'deceased' ? '사망' : p.petStatus === 'transferred' ? '양도' : '';
        const visitBadge = isInactive
          ? '<span class="badge badge-secondary" style="font-size:0.7rem;margin-left:4px;padding:3px 8px">' + inactiveLabel + '</span>'
          : (vs !== 'normal' ? '<span class="badge ' + App.getVisitStatusBadge(vs) + '" style="font-size:0.7rem;margin-left:4px;padding:3px 8px">' + App.getVisitStatusLabel(vs) + '</span>' : '');
        let nextHtml = '';
        // 사망/양도 반려견은 "다음 미용일" 계산 생략 (오해 방지)
        if (!isInactive && p.groomingCycle && (p.lastVisitDate || lastVisit)) {
          const last = new Date((p.lastVisitDate || lastVisit) + 'T00:00:00');
          const next = new Date(last); next.setDate(next.getDate() + p.groomingCycle);
          const days = Math.floor((next - new Date()) / (1000*60*60*24));
          nextHtml = days < 0
            ? '<span style="color:var(--danger);font-weight:700;font-size:0.75rem">' + Math.abs(days) + '일 초과</span>'
            : '<span style="color:var(--primary);font-size:0.75rem">' + days + '일 후</span>';
        }
        const rowOpacity = isInactive ? 'opacity:0.55;' : '';
        return '<div class="pet-list-item" data-id="' + p.id + '" data-search="' + App.escapeHtml((p.name || '') + ' ' + (p.breed || '') + ' ' + (owner?.name || '') + ' ' + (owner?.phone || '') + ' ' + (p.memo || '') + ' ' + (p.healthNotes || '') + ' ' + (p.allergies || '')) + '" style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--border-light);cursor:pointer;' + rowOpacity + '">' +
          '<div style="flex-shrink:0">' +
            (p.photo
              ? '<img src="' + p.photo + '" style="width:36px;height:36px;border-radius:10px;object-fit:cover" alt="">'
              : '<div style="width:36px;height:36px;border-radius:10px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:1.1rem">&#x1F436;</div>') +
          '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">' +
              '<strong style="font-size:0.92rem">' + App.escapeHtml(p.name) + '</strong>' +
              '<span style="color:var(--text-muted);font-size:0.78rem">' + App.escapeHtml(p.breed || '') + (p.weight ? ' ' + p.weight + 'kg' : '') + '</span>' +
              visitBadge +
            '</div>' +
            '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px">' +
              App.escapeHtml(App.getCustomerLabel(owner)) + ' &middot; ' +
              (lastVisit ? App.getRelativeTime(lastVisit) : '방문 없음') +
              (nextHtml ? ' &middot; 다음 ' + nextHtml : '') +
            '</div>' +
          '</div>' +
          '<span style="color:var(--text-muted);font-size:0.8rem;flex-shrink:0">&rsaquo;</span>' +
        '</div>';
      }).join('')}
    `;
  },

  async renderDetail(container, petId) {
    const pet = await DB.get('pets', petId);
    if (!pet) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-text">반려견을 찾을 수 없습니다.</div></div>';
      return;
    }
    const customer = await DB.get('customers', pet.customerId);
    const records = (await DB.getByIndex('records', 'petId', petId)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const age = pet.birthYear ? (new Date().getFullYear() - pet.birthYear) + '살' : (pet.birthDate ? this.calculateAge(pet.birthDate) : '-');

    container.innerHTML = `
      <div class="back-link" onclick="history.length>1?history.back():App.navigate('pets')">&#x2190; 뒤로가기</div>
      <div class="detail-header">
        <div class="pet-detail-photo">
          ${pet.photo
            ? `<img src="${pet.photo}" class="photo-viewable" data-caption="${App.escapeHtml(pet.name)}"
                style="width:200px;height:200px;object-fit:cover;border-radius:var(--radius-lg);cursor:pointer" alt="${App.escapeHtml(pet.name)}">`
            : `<div style="width:200px;height:200px;border-radius:var(--radius-lg);background:linear-gradient(135deg,#FEF3C7,#FDE68A);display:flex;align-items:center;justify-content:center;font-size:4rem">&#x1F436;</div>`
          }
        </div>
        <div class="detail-info">
          <h2>${App.escapeHtml(pet.name)}</h2>
          <div class="detail-meta">
            <span>${App.escapeHtml(pet.breed || '견종 미입력')}</span>
            <span>${pet.weight ? pet.weight + 'kg' : ''}</span>
            <span>보호자: <a href="#customers/${pet.customerId}" style="color:var(--primary)">${App.escapeHtml(App.getCustomerLabel(customer))}</a></span>
            ${customer?.phone ? `<a href="tel:${App.escapeHtml((customer.phone || '').replace(/\\D/g, ''))}" style="color:var(--primary)">&#x1F4DE;</a> <a href="sms:${App.escapeHtml((customer.phone || '').replace(/\\D/g, ''))}" style="color:var(--primary)">&#x1F4AC;</a>` : ''}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="btn-pet-appt" data-pet-id="${pet.id}" data-customer-id="${pet.customerId}">예약</button>
          <button class="btn btn-secondary btn-edit-pet" data-id="${pet.id}">수정</button>
          <button class="btn btn-danger btn-delete-pet" data-id="${pet.id}">삭제</button>
        </div>
      </div>

      ${records.length > 0 ? (() => {
        const totalSpend = records.reduce((sum, r) => sum + App.getRecordAmount(r), 0);
        const avgSpend = Math.round(totalSpend / records.length);
        const lastVisitDate = records[0].date;
        let avgCycle = '-';
        if (records.length >= 2) {
          const dates = records.map(r => new Date(r.date)).sort((a, b) => a - b);
          let totalDays = 0;
          for (let i = 1; i < dates.length; i++) totalDays += Math.round((dates[i] - dates[i - 1]) / (1000*60*60*24));
          avgCycle = Math.round(totalDays / (dates.length - 1)) + '일';
        }
        const lastCondition = records.find(r => r.condition);
        const condLabels = { good: '좋음', normal: '보통', caution: '주의' };
        return `
      <div class="detail-section">
        <h3 class="detail-section-title">방문 통계</h3>
        <div class="info-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
          <div class="info-item"><label>총 방문</label><span style="font-weight:700;font-size:1.1rem">${records.length}회</span></div>
          <div class="info-item"><label>총 지출</label><span style="font-weight:700;font-size:1.1rem">${App.formatCurrency(totalSpend)}</span></div>
          <div class="info-item"><label>평균 단가</label><span style="font-weight:700;font-size:1.1rem">${App.formatCurrency(avgSpend)}</span></div>
          <div class="info-item"><label>평균 방문 주기</label><span style="font-weight:700;font-size:1.1rem">${avgCycle}</span></div>
          <div class="info-item"><label>최근 방문</label><span>${App.formatDate(lastVisitDate)}</span></div>
          ${lastCondition ? `<div class="info-item"><label>최근 컨디션</label><span style="font-weight:700;color:${lastCondition.condition === 'good' ? 'var(--success)' : lastCondition.condition === 'caution' ? 'var(--danger)' : 'var(--warning)'}">${condLabels[lastCondition.condition] || '-'}</span></div>` : ''}
        </div>
      </div>`;
      })() : ''}

      <div class="detail-section">
        <h3 class="detail-section-title">기본 정보</h3>
        <div class="info-grid">
          <div class="info-item"><label>견종</label><span>${App.escapeHtml(pet.breed || '-')}</span></div>
          <div class="info-item"><label>몸무게</label><span>${pet.weight ? pet.weight + 'kg' : '-'}</span></div>
          <div class="info-item"><label>나이</label><span>${age}</span></div>
          <div class="info-item"><label>성별</label><span>${this.getGenderLabel(pet.gender)} ${pet.neutered ? '(중성화 완료)' : ''}</span></div>
          <div class="info-item"><label>사이즈</label><span>${this.getSizeLabel(pet.size, pet.weight)}</span></div>
        </div>
      </div>


      <div class="detail-section">
        <h3 class="detail-section-title">특이사항</h3>
        <div class="info-grid">
          <div class="info-item"><label>성격/행동</label><span>${App.escapeHtml(pet.temperament || '기록 없음')}</span></div>
          <div class="info-item"><label>건강 특이사항</label><span>${App.escapeHtml(pet.healthNotes || '기록 없음')}</span></div>
          <div class="info-item"><label>알러지</label><span>${App.escapeHtml(pet.allergies || '기록 없음')}</span></div>
          <div class="info-item"><label>선호 미용 스타일</label><span>${App.escapeHtml(pet.preferredStyle || '기록 없음')}</span></div>
          <div class="info-item"><label>권장 미용 주기</label><span>${pet.groomingCycle ? pet.groomingCycle + '일' : '미설정'}</span></div>
          ${(() => {
            if (pet.groomingCycle && records.length > 0) {
              const lastDate = new Date(records[0].date);
              const nextDate = new Date(lastDate);
              nextDate.setDate(nextDate.getDate() + pet.groomingCycle);
              const nextStr = App.formatLocalDate(nextDate);
              const daysUntil = Math.floor((nextDate - new Date()) / (1000*60*60*24));
              const overdue = daysUntil < 0;
              return '<div class="info-item"><label>다음 권장 미용일</label><span style="font-weight:700;color:' + (overdue ? 'var(--danger)' : 'var(--primary)') + '">' + App.formatDate(nextStr) + (overdue ? ' (' + Math.abs(daysUntil) + '일 초과)' : ' (' + daysUntil + '일 후)') + '</span></div>';
            }
            return '';
          })()}
          <div class="info-item"><label>메모</label><span>${App.escapeHtml(pet.memo || '기록 없음')}</span></div>
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">미용 기록 (${records.length}건)</h3>
        ${await (async () => {
          if (records.length === 0) return '<p style="color:var(--text-muted)">미용 기록이 없습니다.</p>';
          const allServices = await DB.getAll('services');
          const serviceMap = {}; allServices.forEach(s => serviceMap[s.id] = s.name);
          const _isMobile = window.matchMedia('(max-width: 768px)').matches;
          if (_isMobile) {
            return records.map(r => {
              const serviceNames = App.getRecordServiceDisplay(r, serviceMap);
              return `<div style="padding:12px 0;border-bottom:1px solid var(--border-light)${r.paymentMethod === 'unpaid' ? ';border-left:4px solid var(--danger);padding-left:12px' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <strong style="font-size:0.9rem">${App.formatDate(r.date)}</strong>
                  <strong style="color:var(--primary)">${App.formatCurrency(App.getRecordAmount(r))}</strong>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary)">${App.escapeHtml(serviceNames)} · ${App.escapeHtml(r.groomer || '-')} · ${App.pages.records.getPaymentLabel(r.paymentMethod)}</div>
                ${r.memo ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-top:4px">${App.escapeHtml(r.memo.length > 60 ? r.memo.slice(0, 60) + '...' : r.memo)}</div>` : ''}
              </div>`;
            }).join('');
          }
          return `
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>날짜</th><th>서비스</th><th>금액</th><th>담당</th><th>결제</th><th>메모</th></tr></thead>
              <tbody>
                ${records.map(r => {
                  const serviceNames = App.getRecordServiceDisplay(r, serviceMap);
                  return `<tr${r.paymentMethod === 'unpaid' ? ' style="background:var(--warning-light)"' : ''}>
                    <td>${App.formatDate(r.date)}</td>
                    <td>${App.escapeHtml(serviceNames)}</td>
                    <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></td>
                    <td>${App.escapeHtml(r.groomer || '-')}</td>
                    <td>${App.pages.records.getPaymentLabel(r.paymentMethod)}</td>
                    <td>${App.escapeHtml(r.memo || '-')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`;
        })()}
      </div>
    `;
  },

  async init(params) {
    document.getElementById('btn-add-pet')?.addEventListener('click', () => this.showForm());
    // 반려견 상세 → 빠른 예약
    document.getElementById('btn-pet-appt')?.addEventListener('click', (e) => {
      const customerId = Number(e.target.dataset.customerId);
      const petId = Number(e.target.dataset.petId);
      App.pages.appointments.showForm(null, customerId, { petId });
    });
    // 검색
    const _debouncedPetFilter = App.debounce((val) => {
      const q = (val || '').toLowerCase();
      document.querySelectorAll('.pet-list-item').forEach(item => {
        item.style.display = !q || (item.dataset.search || '').toLowerCase().includes(q) ? '' : 'none';
      });
    }, 300);
    document.getElementById('pet-search')?.addEventListener('input', (e) => _debouncedPetFilter(e.target.value));

    // 정렬
    document.getElementById('pet-sort')?.addEventListener('change', (e) => {
      this._sortKey = e.target.value;
      App.handleRoute();
    });

    // 비활성(사망/양도) 토글
    document.getElementById('pet-toggle-inactive')?.addEventListener('click', (e) => {
      e.preventDefault();
      this._showInactive = !this._showInactive;
      App.handleRoute();
    });

    // 리스트 아이템 클릭 → 상세
    document.querySelectorAll('.pet-list-item').forEach(item => {
      item.addEventListener('click', () => App.navigate('pets/' + item.dataset.id));
    });

    document.querySelectorAll('.btn-edit-pet').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showForm(Number(btn.dataset.id));
      });
    });

    document.querySelectorAll('.btn-delete-pet').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePet(Number(btn.dataset.id));
      });
    });
  },

  async showForm(id, presetCustomerId) {
    let pet = id ? await DB.get('pets', id) : {};
    const customerOptions = await App.getCustomerOptions(pet.customerId || presetCustomerId);

    App.showModal({
      title: id ? '반려견 정보 수정' : '새 반려견 등록',
      size: 'lg',
      content: `
        <div class="form-group">
          <label class="form-label">보호자 <span class="required">*</span></label>
          <select id="f-customerId" ${presetCustomerId ? 'disabled' : ''}>
            <option value="">보호자 선택</option>
            ${customerOptions}
          </select>
          ${presetCustomerId ? `<input type="hidden" id="f-customerId-hidden" value="${presetCustomerId}">` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">사진</label>
          <div class="pet-photo-upload">
            <div class="pet-photo-preview" id="f-photo-preview">
              ${pet.photo ? `<img src="${pet.photo}" alt="반려견 사진">` : '<span class="pet-photo-placeholder">&#x1F436;</span>'}
            </div>
            <div class="flex-1">
              <input type="file" id="f-photo" accept="image/*" style="display:none">
              <button type="button" class="btn btn-sm btn-secondary" id="f-photo-btn">&#x1F4F7; 사진 선택</button>
              ${pet.photo ? '<button type="button" class="btn btn-sm btn-danger" id="f-photo-remove" style="margin-left:8px">삭제</button>' : ''}
              <div class="form-hint">JPG, PNG 등 이미지 파일 (최대 1MB 권장)</div>
            </div>
          </div>
          <input type="hidden" id="f-photo-data" value="">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">이름 <span class="required">*</span></label>
            <input type="text" id="f-name" value="${App.escapeHtml(pet.name || '')}" placeholder="반려견 이름">
          </div>
          <div class="form-group">
            <label class="form-label">견종</label>
            <input type="text" id="f-breed" value="${App.escapeHtml(pet.breed || '')}" placeholder="예: 말티즈, 푸들">
          </div>
        </div>
        <div class="form-row three">
          <div class="form-group">
            <label class="form-label">몸무게 (kg)</label>
            <input type="number" id="f-weight" value="${pet.weight || ''}" placeholder="예: 3.5" step="0.1" min="0">
          </div>
          <div class="form-group">
            <label class="form-label">성별</label>
            <select id="f-gender">
              <option value="">선택</option>
              <option value="male" ${pet.gender === 'male' ? 'selected' : ''}>수컷</option>
              <option value="female" ${pet.gender === 'female' ? 'selected' : ''}>암컷</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">나이 (살)</label>
            <input type="number" id="f-age" value="${pet.birthYear ? (new Date().getFullYear() - pet.birthYear) : (pet.birthDate ? (new Date().getFullYear() - new Date(pet.birthDate).getFullYear()) : '')}" placeholder="예: 3" min="0" max="30" step="1">
            <div class="form-hint">입력한 나이는 매년 자동으로 업데이트됩니다</div>
          </div>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="f-neutered" ${pet.neutered ? 'checked' : ''}>
            중성화 완료
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">사이즈</label>
          <select id="f-size">
            <option value="" ${!pet.size ? 'selected' : ''}>자동 (몸무게 기준)</option>
            <option value="small" ${pet.size === 'small' ? 'selected' : ''}>소형 (7kg 미만)</option>
            <option value="medium" ${pet.size === 'medium' ? 'selected' : ''}>중형 (7~15kg)</option>
            <option value="large" ${pet.size === 'large' ? 'selected' : ''}>대형 (15kg 이상)</option>
          </select>
          <div class="form-hint">미용 가격 자동 계산에 사용됩니다</div>
        </div>
        <div class="form-group">
          <label class="form-label">성격/행동 특이사항</label>
          <textarea id="f-temperament" placeholder="예: 입질 있음, 예민함, 다리 만지면 싫어함">${App.escapeHtml(pet.temperament || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">건강 특이사항</label>
          <textarea id="f-healthNotes" placeholder="예: 피부병 이력, 슬개골 탈구">${App.escapeHtml(pet.healthNotes || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">알러지</label>
            <input type="text" id="f-allergies" value="${App.escapeHtml(pet.allergies || '')}" placeholder="알러지 정보">
          </div>
          <div class="form-group">
            <label class="form-label">메모</label>
            <input type="text" id="f-memo" value="${App.escapeHtml(pet.memo || '')}" placeholder="기타 메모">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">선호 미용 스타일</label>
          <textarea id="f-preferredStyle" placeholder="예: 곰돌이 컷, 몸통 5mm, 다리 가위컷, 얼굴 둥글게">${App.escapeHtml(pet.preferredStyle || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">권장 미용 주기 (일)</label>
          <select id="f-groomingCycle">
            <option value="">미설정</option>
            <option value="14" ${pet.groomingCycle == 14 ? 'selected' : ''}>2주 (14일)</option>
            <option value="21" ${pet.groomingCycle == 21 ? 'selected' : ''}>3주 (21일)</option>
            <option value="28" ${pet.groomingCycle == 28 ? 'selected' : ''}>4주 (28일)</option>
            <option value="35" ${pet.groomingCycle == 35 ? 'selected' : ''}>5주 (35일)</option>
            <option value="42" ${pet.groomingCycle == 42 ? 'selected' : ''}>6주 (42일)</option>
            <option value="56" ${pet.groomingCycle == 56 ? 'selected' : ''}>8주 (56일)</option>
          </select>
          <div class="form-hint">개별 미용 주기를 설정하면 대시보드 재방문 알림에 반영됩니다</div>
        </div>
        ${id ? `<div class="form-group">
          <label class="form-label">상태</label>
          <select id="f-petStatus">
            <option value="active" ${(pet.petStatus || 'active') === 'active' ? 'selected' : ''}>활동 중</option>
            <option value="deceased" ${pet.petStatus === 'deceased' ? 'selected' : ''}>사망</option>
            <option value="transferred" ${pet.petStatus === 'transferred' ? 'selected' : ''}>양도/이전</option>
          </select>
          <div class="form-hint">사망/양도 상태의 반려견은 재방문 알림에서 제외됩니다</div>
        </div>` : ''}
      `,
      onSave: () => this.savePet(id, presetCustomerId)
    });

    // 기존 사진 데이터 설정 (base64 문자열은 HTML attribute에 넣지 않음)
    if (pet.photo) {
      const photoData = document.getElementById('f-photo-data');
      if (photoData) photoData.value = pet.photo;
    }

    // 사진 업로드 이벤트
    document.getElementById('f-photo-btn')?.addEventListener('click', () => {
      document.getElementById('f-photo')?.click();
    });
    document.getElementById('f-photo')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        App.showToast('파일이 너무 큽니다 (10MB 이하만 업로드 가능)', 'error');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        this.resizeImage(ev.target.result, (compressedDataUrl) => {
          document.getElementById('f-photo-data').value = compressedDataUrl;
          const preview = document.getElementById('f-photo-preview');
          if (preview) preview.innerHTML = `<img src="${compressedDataUrl}" alt="반려견 사진">`;
          // 삭제 버튼 추가
          if (!document.getElementById('f-photo-remove')) {
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.id = 'f-photo-remove';
            removeBtn.className = 'btn btn-sm btn-danger';
            removeBtn.style.marginLeft = '8px';
            removeBtn.textContent = '삭제';
            removeBtn.addEventListener('click', () => {
              document.getElementById('f-photo-data').value = '';
              preview.innerHTML = '<span class="pet-photo-placeholder">&#x1F436;</span>';
              removeBtn.remove();
            });
            document.getElementById('f-photo-btn')?.after(removeBtn);
          }
        });
      };
      reader.readAsDataURL(file);
    });
    document.getElementById('f-photo-remove')?.addEventListener('click', () => {
      document.getElementById('f-photo-data').value = '';
      const preview = document.getElementById('f-photo-preview');
      if (preview) preview.innerHTML = '<span class="pet-photo-placeholder">&#x1F436;</span>';
      document.getElementById('f-photo-remove')?.remove();
    });
  },

  async savePet(id, presetCustomerId) {
    try {
      const customerId = presetCustomerId || Number(document.getElementById('f-customerId').value);
      const name = document.getElementById('f-name').value.trim();
      const breed = document.getElementById('f-breed').value.trim();
      const weight = parseFloat(document.getElementById('f-weight').value) || null;
      const gender = document.getElementById('f-gender').value;
      const ageInput = Number(document.getElementById('f-age')?.value);
      if (ageInput > 30) { App.showToast('나이를 확인해주세요 (최대 30살).', 'error'); return; }
      const birthYear = ageInput > 0 ? (new Date().getFullYear() - ageInput) : null;
      const birthDate = birthYear ? `${birthYear}-01-01` : '';
      const neutered = document.getElementById('f-neutered').checked;
      const size = document.getElementById('f-size').value;
      const temperament = document.getElementById('f-temperament').value.trim();
      const healthNotes = document.getElementById('f-healthNotes').value.trim();
      const allergies = document.getElementById('f-allergies').value.trim();
      const memo = document.getElementById('f-memo').value.trim();
      const preferredStyle = document.getElementById('f-preferredStyle')?.value.trim() || '';
      const groomingCycle = Number(document.getElementById('f-groomingCycle')?.value) || null;
      const petStatus = document.getElementById('f-petStatus')?.value || 'active';
      const photo = document.getElementById('f-photo-data')?.value || '';

      if (!customerId) { App.showToast('보호자를 선택해주세요.', 'error'); App.highlightField('f-customerId'); return; }
      if (!name) { App.showToast('이름을 입력해주세요.', 'error'); App.highlightField('f-name'); return; }

      const data = { customerId, name, breed, weight, gender, birthDate, birthYear, neutered, size, temperament, healthNotes, allergies, memo, preferredStyle, groomingCycle, petStatus, photo };

      if (id) {
        const existing = await DB.get('pets', id);
        Object.assign(existing, data);
        await DB.update('pets', existing);
        App.showToast('반려견 정보가 수정되었습니다.');
        App.closeModal();
        App.handleRoute();
      } else {
        const newPetId = await DB.add('pets', data);
        App.showToast('새 반려견이 등록되었습니다.');
        App.closeModal();
        const doAppt = await App.confirm('바로 예약을 등록하시겠습니까?');
        if (doAppt) {
          App.pages.appointments.showForm(null, customerId, { petId: newPetId });
          return;
        }
        App.handleRoute();
      }
    } catch (err) {
      console.error('savePet error:', err);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  async deletePet(id) {
    try {
      const pet = await DB.get('pets', id);
      if (!pet) return;

      const confirmed = await App.confirm(`"${App.escapeHtml(pet.name)}"을(를) 삭제하시겠습니까?<br>관련 예약과 미용 기록도 함께 삭제됩니다.<br><strong>이 작업은 되돌릴 수 없습니다.</strong>`);
      if (!confirmed) return;

      const [appointments, records] = await Promise.all([
        DB.getByIndex('appointments', 'petId', id),
        DB.getByIndex('records', 'petId', id)
      ]);
      const ops = [
        ...appointments.map(a => ({ store: 'appointments', id: a.id })),
        ...records.map(r => ({ store: 'records', id: r.id })),
        { store: 'pets', id }
      ];
      await DB.deleteCascade(ops);
      App.showToast('삭제되었습니다.');
      App.navigate('pets');
    } catch (err) {
      console.error('deletePet error:', err);
      App.showToast('삭제 중 오류가 발생했습니다.', 'error');
    }
  },

  getGenderLabel(gender) {
    if (gender === 'male') return '수컷';
    if (gender === 'female') return '암컷';
    return '-';
  },

  getSizeLabel(size, weight) {
    if (size === 'small') return '소형';
    if (size === 'medium') return '중형';
    if (size === 'large') return '대형';
    if (weight) {
      if (weight < 7) return '소형 (자동)';
      if (weight < 15) return '중형 (자동)';
      return '대형 (자동)';
    }
    return '-';
  },

  calculateAge(birthDate) {
    const birth = new Date(birthDate);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (months < 0) { years--; months += 12; }
    if (years > 0) return `${years}살 ${months}개월`;
    return `${months}개월`;
  },

  resizeImage(dataUrl, callback) {
    App.resizeImage(dataUrl, callback);
  }
};
