// ========== 사진 카드 (더보기) ==========
// 특별한 날 사진첩 사진으로 카드를 만든다. 미용 기록과는 별개이며 카드는 앱에 저장하지 않는다.
// 반려견은 선택 사항: 고르면 이름이 카드에 들어가고, 최근 미용 기록 사진을 가져올 수 있다.
App.pages.photocard = {
  _petId: null,

  async render(container) {
    this._petId = null;
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${App.icon('camera')} 사진 카드</h1>
          <p class="page-subtitle">사진첩 사진으로 공유용 카드를 만들어요</p>
        </div>
      </div>
      <div class="card">
        <div class="card-body pc-body">
          <div class="form-group">
            <label class="form-label" for="pc-pet-input">반려견 <span class="pc-opt">(선택 — 이름이 카드에 들어가요)</span></label>
            <div class="search-select">
              <div class="cust-chip" id="pc-pet-chip" style="display:none">
                <span class="cust-chip-text" id="pc-pet-chip-text"></span>
                <button type="button" class="cust-chip-clear" id="pc-pet-clear" aria-label="반려견 선택 해제">${App.icon('close')}</button>
              </div>
              <input type="text" id="pc-pet-input" placeholder="반려견 이름, 보호자 이름, 전화번호 검색..." autocomplete="off">
              <div class="search-select-dropdown" id="pc-pet-dropdown"></div>
            </div>
            <div class="form-hint" id="pc-pet-hint">고르지 않으면 이름 없이 날짜·매장명만 들어가요.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="pc-date">날짜</label>
            <input type="date" id="pc-date" value="${App.getToday()}">
          </div>
          <button type="button" class="btn btn-primary pc-start" id="pc-start">${App.icon('image')} 사진 골라서 카드 만들기</button>
          <p class="pc-note">카드는 앱에 남지 않아요. 만든 뒤 폰에 저장하거나 카톡·인스타로 공유하세요.<br>프레임은 더보기 → 설정 → 내 프레임에서 만들 수 있어요.</p>
        </div>
      </div>
    `;
    await this._bindPetSearch();
    document.getElementById('pc-start')?.addEventListener('click', () => {
      const date = document.getElementById('pc-date')?.value || App.getToday();
      App.pages.records.startPhotoCard({ petId: this._petId, date });
    });
  },

  // 가벼운 반려견 검색 (고객 등록 기능이 있는 App.renderCustomerSelect 는 여기엔 과하다)
  async _bindPetSearch() {
    const input = document.getElementById('pc-pet-input');
    const dropdown = document.getElementById('pc-pet-dropdown');
    const chip = document.getElementById('pc-pet-chip');
    const chipText = document.getElementById('pc-pet-chip-text');
    const hint = document.getElementById('pc-pet-hint');
    if (!input || !dropdown) return;
    const [pets, customers] = await Promise.all([
      DB.getAllLight('pets', ['photo', 'photoThumb', 'memo', 'healthNotes', 'temperament', 'preferredStyle']),
      DB.getAllLight('customers', ['memo'])
    ]);
    const custById = {};
    customers.forEach(c => { custById[c.id] = c; });
    const rows = pets.map(p => {
      const c = custById[p.customerId] || {};
      const digits = (c.phone || '').replace(/\D/g, '');
      return { p, c, digits, key: ((p.name || '') + ' ' + (c.name || '')).normalize('NFC').toLowerCase() };
    }).sort((a, b) => (a.p.name || '').localeCompare(b.p.name || '', 'ko'));

    const owner = (c) => c.name || (c.phone ? '보호자(' + c.phone.replace(/\D/g, '').slice(-4) + ')' : '');
    const close = () => dropdown.classList.remove('open');
    const pick = (row) => {
      this._petId = row.p.id;
      chipText.textContent = row.p.name + (row.c.id ? ' · ' + owner(row.c) : '');
      chip.style.display = 'flex';
      input.style.display = 'none';
      input.value = '';
      if (hint) hint.textContent = '이 반려견의 최근 미용 기록 사진도 카드에 넣을 수 있어요.';
      close();
    };
    const renderOptions = (query) => {
      const q = (query || '').trim().normalize('NFC').toLowerCase();
      const qd = q.replace(/\D/g, '');
      const list = (q
        ? rows.filter(r => r.key.includes(q) || (qd && r.digits.includes(qd)))
        : rows).slice(0, 20);
      dropdown.innerHTML = list.length
        ? list.map(r => `<div class="search-select-option" data-id="${r.p.id}">${App.escapeHtml(r.p.name || '')} <span class="sub">${App.escapeHtml([r.p.breed, owner(r.c)].filter(Boolean).join(' · '))}</span></div>`).join('')
        : `<div class="search-select-option"><span style="color:var(--text-muted)">${rows.length ? '검색 결과 없음' : '등록된 반려견이 없어요'}</span></div>`;
      dropdown.classList.add('open');
      dropdown.querySelectorAll('.search-select-option[data-id]').forEach(el => {
        el.addEventListener('mousedown', (e) => { e.preventDefault(); pick(rows.find(r => r.p.id === Number(el.dataset.id))); });
      });
    };
    input.addEventListener('focus', () => renderOptions(input.value));
    input.addEventListener('input', () => renderOptions(input.value));
    input.addEventListener('blur', () => setTimeout(close, 150));
    document.getElementById('pc-pet-clear')?.addEventListener('click', () => {
      this._petId = null;
      chip.style.display = 'none';
      input.style.display = '';
      if (hint) hint.textContent = '고르지 않으면 이름 없이 날짜·매장명만 들어가요.';
      input.focus();
    });
  }
};
