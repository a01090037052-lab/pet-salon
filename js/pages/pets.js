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
    const pets = await DB.getAll('pets');
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

    const sorted = pets.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">반려견 관리</h1>
          <p class="page-subtitle">총 ${pets.length}마리</p>
        </div>
        <div class="page-actions">
          <div class="search-box">
            <span class="search-icon">&#x1F50D;</span>
            <input type="text" id="pet-search" placeholder="이름, 견종, 보호자 검색...">
          </div>
          <button class="btn btn-primary" id="btn-add-pet">+ 반려견 등록</button>
        </div>
      </div>
      <div class="card">
        <div class="card-body no-padding">
          <div class="table-container">
            <table class="data-table" id="pet-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>견종</th>
                  <th class="hide-mobile">몸무게</th>
                  <th class="hide-mobile">성별</th>
                  <th>보호자</th>
                  <th>마지막 미용</th>
                  <th>관리</th>
                </tr>
              </thead>
              <tbody>
                ${sorted.length === 0 ? `
                  <tr><td colspan="7">
                    <div class="empty-state">
                      <div class="empty-state-icon">&#x1F436;</div>
                      <div class="empty-state-text">등록된 반려견이 없습니다</div>
                    </div>
                  </td></tr>
                ` : sorted.map(p => {
                  const owner = customerMap[p.customerId];
                  return `
                    <tr data-id="${p.id}" class="clickable-row" style="cursor:pointer">
                      <td><strong>${p.photo ? `<img src="${p.photo}" class="pet-list-photo photo-viewable" data-caption="${App.escapeHtml(p.name)}" style="width:40px;height:40px;object-fit:cover;border-radius:8px" alt="">` : '&#x1F436;'} ${App.escapeHtml(p.name)}</strong></td>
                      <td>${App.escapeHtml(p.breed || '-')}</td>
                      <td class="hide-mobile">${p.weight ? p.weight + 'kg' : '-'}</td>
                      <td class="hide-mobile">${this.getGenderLabel(p.gender)}${p.neutered ? ' (중성화)' : ''}</td>
                      <td>${owner ? App.escapeHtml(owner.name) : '-'}</td>
                      <td>${petLastVisit[p.id] ? `<span ${App.getDaysAgo(petLastVisit[p.id]) >= 30 ? 'class="badge badge-warning"' : 'style="color:var(--text-secondary)"'}>${App.getRelativeTime(petLastVisit[p.id])}</span>` : '<span style="color:var(--text-muted)">-</span>'}</td>
                      <td class="table-actions">
                        <button class="btn-icon btn-edit-pet" data-id="${p.id}" title="수정">&#x270F;</button>
                        <button class="btn-icon btn-delete-pet" data-id="${p.id}" title="삭제" style="color:var(--danger)">&#x1F5D1;</button>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- Mobile Card List -->
          <div class="mobile-card-list" id="pet-card-list">
            ${sorted.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">&#x1F436;</div>
                <div class="empty-state-text">등록된 반려견이 없습니다</div>
              </div>
            ` : sorted.map(p => {
              const owner = customerMap[p.customerId];
              const lastVisit = petLastVisit[p.id];
              return `
              <div class="mobile-card" data-id="${p.id}" style="cursor:pointer"
                   data-search="${(p.name || '') + ' ' + (p.breed || '') + ' ' + (owner?.name || '')}">
                <div class="mobile-card-header">
                  <span style="font-weight:700;font-size:1rem">${p.photo ? `<img src="${p.photo}" class="photo-viewable" data-caption="${App.escapeHtml(p.name)}" style="width:28px;height:28px;border-radius:8px;object-fit:cover;vertical-align:middle;margin-right:4px">` : '&#x1F436;'} ${App.escapeHtml(p.name)}</span>
                  <span style="color:var(--text-secondary);font-size:0.85rem">${App.escapeHtml(p.breed || '-')}</span>
                </div>
                <div class="mobile-card-body">
                  <div class="mobile-card-meta">
                    <span>${p.weight ? p.weight + 'kg' : '-'}</span>
                    <span>&#x1F464; ${App.escapeHtml(owner?.name || '-')}</span>
                    <span>${lastVisit ? App.getRelativeTime(lastVisit) : '방문 없음'}</span>
                  </div>
                </div>
                <div class="mobile-card-actions">
                  <button class="btn btn-sm btn-secondary btn-edit-pet" data-id="${p.id}">&#x270F; 수정</button>
                  <button class="btn btn-sm btn-danger btn-delete-pet" data-id="${p.id}">&#x1F5D1; 삭제</button>
                </div>
              </div>`;
            }).join('')}
          </div>

        </div>
      </div>
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
      <div class="back-link" onclick="App.navigate('pets')">&#x2190; 반려견 목록</div>
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
            <span>보호자: <a href="#customers/${pet.customerId}" style="color:var(--primary)">${App.escapeHtml(customer?.name || '-')}</a></span>
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-secondary btn-edit-pet" data-id="${pet.id}">수정</button>
          <button class="btn btn-danger btn-delete-pet" data-id="${pet.id}">삭제</button>
        </div>
      </div>

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
          return `
          <div class="table-container">
            <table class="data-table">
              <thead><tr><th>날짜</th><th>서비스</th><th>금액</th><th>담당</th><th>결제</th><th>메모</th></tr></thead>
              <tbody>
                ${records.map(r => {
                  const serviceNames = (r.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ') || '-';
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
    const _debouncedPetFilter = App.debounce((val) => this.filterTable(val), 300);
    document.getElementById('pet-search')?.addEventListener('input', (e) => _debouncedPetFilter(e.target.value));

    document.querySelectorAll('.clickable-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.table-actions')) return;
        App.navigate('pets/' + row.dataset.id);
      });
    });

    // Mobile card click to navigate
    document.querySelectorAll('#pet-card-list .mobile-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.mobile-card-actions')) return;
        App.navigate('pets/' + card.dataset.id);
      });
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
            <div style="flex:1">
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
      const photo = document.getElementById('f-photo-data')?.value || '';

      if (!customerId) { App.showToast('보호자를 선택해주세요.', 'error'); App.highlightField('f-customerId'); return; }
      if (!name) { App.showToast('이름을 입력해주세요.', 'error'); App.highlightField('f-name'); return; }

      const data = { customerId, name, breed, weight, gender, birthDate, birthYear, neutered, size, temperament, healthNotes, allergies, memo, preferredStyle, groomingCycle, photo };

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

      const confirmed = await App.confirm(`"${App.escapeHtml(pet.name)}"을(를) 삭제하시겠습니까?<br>관련 예약과 미용 기록도 함께 휴지통으로 이동됩니다.`);
      if (!confirmed) return;

      const appointments = await DB.getByIndex('appointments', 'petId', id);
      const records = await DB.getByIndex('records', 'petId', id);

      const pairs = [
        ...appointments.map(a => ['appointments', a.id]),
        ...records.map(r => ['records', r.id]),
        ['pets', id]
      ];
      await DB.softDeleteCascade(pairs);
      App.showToast('반려견이 휴지통으로 이동되었습니다.');
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

  filterTable(query) {
    const q = query.toLowerCase();
    // Filter table rows
    const rows = document.querySelectorAll('#pet-table tbody tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? '' : 'none';
    });
    // Filter mobile cards
    document.querySelectorAll('#pet-card-list .mobile-card').forEach(card => {
      const search = (card.dataset.search || '').toLowerCase();
      card.style.display = search.includes(q) ? '' : 'none';
    });
  },

  resizeImage(dataUrl, callback) {
    App.resizeImage(dataUrl, callback);
  }
};
