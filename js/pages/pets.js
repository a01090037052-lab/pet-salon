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
    const customerMap = {};
    customers.forEach(c => customerMap[c.id] = c);

    // Last visit per pet — 기록 전체를 읽지 않고 반려견에 비정규화된 값을 쓴다 (기록 저장·삭제 시 유지, 시작 시 1회 마이그레이션)
    const petLastVisit = {};
    allPets.forEach(p => { if (p.lastVisitDate) petLastVisit[p.id] = p.lastVisitDate; });

    // 사망/양도 반려견은 기본 목록에서 제외 (재방문 알림·통계 오염 방지)
    const showInactive = !!this._showInactive;
    const pets = showInactive ? allPets : allPets.filter(p => (p.petStatus || 'active') === 'active');
    const inactiveCount = allPets.length - allPets.filter(p => (p.petStatus || 'active') === 'active').length;

    // 방문 상태 사전 계산 (정렬 비교 중 반복 호출 방지) — 대시보드/고객 페이지와 같은 헬퍼
    const revisitDays = await App.getRevisitDays();
    const visitStatusMap = {};
    pets.forEach(p => {
      visitStatusMap[p.id] = App.getPetVisitStatus(p, revisitDays, petLastVisit[p.id]);
    });

    const sortKey = this._sortKey || 'name';
    const statusPriority = { churned: 0, 'at-risk': 1, remind: 2, normal: 3, new: 4 };
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
          <select id="pet-sort" style="width:auto;min-width:100px;font-size:max(16px,0.88rem);padding:10px 12px;min-height:40px">
            ${sortOptions.map(o => `<option value="${o.v}"${sortKey === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="btn-add-pet">+ 등록</button>
        </div>
      </div>
      <div class="search-box" style="margin-bottom:12px;max-width:none">
        <span class="search-icon">${App.icon('search')}</span>
        <input type="text" id="pet-search" placeholder="이름, 견종, 보호자 검색..." style="width:100%">
      </div>

      ${sorted.length === 0 ? `
        <div class="empty-state" style="padding:60px 20px">
          <div class="empty-state-icon">${App.icon('paw', 'ico-xl')}</div>
          <div class="empty-state-text">등록된 반려견이 없습니다</div>
          <button class="btn btn-primary" onclick="App.pages.pets.showForm()" style="margin-top:12px">+ 반려견 등록</button>
        </div>
      ` : (() => {
        const statusColor = (vs, inactive) => {
          if (inactive) return 'var(--border)';
          if (vs === 'at-risk') return 'var(--danger)';
          if (vs === 'remind') return 'var(--warning)';
          if (vs === 'churned') return 'var(--text-muted)';
          if (vs === 'new') return 'var(--info)';
          return 'var(--success)';
        };
        const renderCard = (p) => {
          const owner = customerMap[p.customerId];
          const lastVisit = petLastVisit[p.id];
          const vs = visitStatusMap[p.id];
          const isInactive = (p.petStatus || 'active') !== 'active';
          const inactiveLabel = p.petStatus === 'deceased' ? '사망' : p.petStatus === 'transferred' ? '양도' : '';
          const barColor = statusColor(vs, isInactive);

          // 우측 칩
          let rightChip = '';
          if (isInactive) {
            rightChip = `<span style="font-size:0.72rem;padding:4px 10px;background:var(--border-light);color:var(--text-muted);border-radius:12px;font-weight:600;flex-shrink:0;white-space:nowrap">${inactiveLabel}</span>`;
          } else if (vs === 'at-risk') {
            rightChip = `<span style="font-size:0.72rem;padding:4px 10px;background:var(--danger);color:#fff;border-radius:12px;font-weight:700;flex-shrink:0;white-space:nowrap">이탈 임박</span>`;
          } else if (vs === 'remind') {
            rightChip = `<span style="font-size:0.72rem;padding:4px 10px;background:var(--warning);color:#fff;border-radius:12px;font-weight:700;flex-shrink:0;white-space:nowrap">리마인드</span>`;
          } else if (vs === 'churned') {
            rightChip = `<span style="font-size:0.72rem;padding:4px 10px;background:var(--text-muted);color:#fff;border-radius:12px;font-weight:600;flex-shrink:0;white-space:nowrap">이탈</span>`;
          } else if (vs === 'new') {
            rightChip = `<span style="font-size:0.72rem;padding:4px 10px;background:var(--bg);color:var(--text-muted);border:1px solid var(--border);border-radius:12px;font-weight:600;flex-shrink:0;white-space:nowrap">방문 전</span>`;
          } else if (p.groomingCycle && (p.lastVisitDate || lastVisit)) {
            // 자정 기준 정수 일수 (예전엔 '지금'과 자정의 차를 내림해 하루 전에 '오늘', 당일에 '1일 초과'로 표시됐다)
            const next = App.parseLocalDate(p.lastVisitDate || lastVisit); next.setDate(next.getDate() + p.groomingCycle);
            const days = App.daysUntil(App.formatLocalDate(next));
            const label = days < 0 ? Math.abs(days) + '일 초과' : days === 0 ? '오늘' : 'D-' + days;
            const cColor = days < 0 ? 'var(--danger)' : 'var(--success)';
            rightChip = `<span style="font-size:0.72rem;padding:4px 10px;background:var(--bg);color:${cColor};border-radius:12px;font-weight:700;flex-shrink:0;white-space:nowrap;border:1px solid ${cColor}33">${label}</span>`;
          }

          // 알러지/건강 주의 아이콘
          const hasWarn = App.hasPetNote(p.allergies) || App.hasPetNote(p.healthNotes);
          const warnIcon = hasWarn ? `<span style="color:var(--danger);font-size:0.85rem;font-weight:700;line-height:1" title="알러지/건강 주의">${App.icon('alert', 'ico-sm')}</span>` : '';

          // 사진
          const photo = (p.photoThumb || p.photo)
            ? `<img src="${p.photoThumb || p.photo}" style="width:60px;height:60px;border-radius:14px;object-fit:cover" alt="">`
            : `<div style="width:60px;height:60px;border-radius:14px;background:linear-gradient(135deg,var(--primary-light),var(--info-light));display:flex;align-items:center;justify-content:center;font-size:1.6rem;color:var(--primary)">${App.icon('paw', 'ico-lg')}</div>`;

          const opacityStyle = isInactive ? 'opacity:0.55;' : '';
          const breedWeight = (p.breed || '견종 미입력') + (p.weight ? ' · ' + p.weight + 'kg' : '');

          return `<div class="pet-list-item" data-id="${p.id}" data-search="${App.escapeHtml((p.name||'')+' '+(p.breed||'')+' '+(owner?.name||'')+' '+(owner?.phone||'')+' '+(p.memo||'')+' '+(p.healthNotes||'')+' '+(p.allergies||''))}" style="display:flex;align-items:center;gap:12px;padding:14px 14px 14px 12px;background:var(--bg-white);border:1px solid var(--border-light);border-left:4px solid ${barColor};border-radius:var(--radius);cursor:pointer;margin-bottom:8px;box-shadow:var(--shadow-xs);${opacityStyle}">
            <div style="flex-shrink:0">${photo}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;min-width:0">
                <strong style="font-size:1.05rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${App.escapeHtml(p.name)}</strong>
                ${warnIcon}
              </div>
              <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${App.escapeHtml(breedWeight)} · ${App.escapeHtml(App.getCustomerLabel(owner))}</div>
              <div style="font-size:0.78rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lastVisit ? App.getRelativeTime(lastVisit) + ' 방문' : '방문 없음'}</div>
            </div>
            ${rightChip}
          </div>`;
        };

        // 그룹 헤더 (정렬 = 상태별일 때만)
        if (sortKey === 'status') {
          const groups = { 'at-risk': [], 'remind': [], 'normal': [], 'new': [], 'churned': [], 'inactive': [] };
          sorted.forEach(p => {
            const isInactive = (p.petStatus || 'active') !== 'active';
            if (isInactive) groups['inactive'].push(p);
            else (groups[visitStatusMap[p.id]] || groups['normal']).push(p);
          });
          const groupMeta = {
            'at-risk': { label: '이탈 임박', color: 'var(--danger)' },
            'remind': { label: '리마인드 필요', color: 'var(--warning)' },
            'normal': { label: '정상', color: 'var(--success)' },
            'new': { label: '방문 전', color: 'var(--info)' },
            'churned': { label: '이탈', color: 'var(--text-muted)' },
            'inactive': { label: '비활성 (사망/양도)', color: 'var(--border)' }
          };
          return Object.entries(groups).filter(([, gp]) => gp.length > 0).map(([gs, gp]) => {
            const meta = groupMeta[gs];
            return `<div style="margin:14px 0 8px;display:flex;align-items:center;gap:8px;padding:0 2px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${meta.color};flex-shrink:0"></span>
              <span style="font-size:0.88rem;font-weight:800;color:var(--text-primary)">${meta.label}</span>
              <span style="font-size:0.78rem;color:var(--text-muted)">${gp.length}마리</span>
            </div>` + gp.map(renderCard).join('');
          }).join('');
        }
        return sorted.map(renderCard).join('');
      })()}
    `;
  },

  async renderDetail(container, petId) {
    const pet = await DB.get('pets', petId);
    if (!pet) {
      container.innerHTML = `<div class="back-link" onclick="history.length>1?history.back():App.navigate('pets')">${App.icon('arrow-left')} 뒤로가기</div>
        <div class="empty-state"><div class="empty-state-text">반려견을 찾을 수 없습니다.<br><small style="color:var(--text-muted)">삭제되었거나 아직 다른 기기에서 받아오지 않았을 수 있습니다.</small></div></div>`;
      return;
    }
    const customer = await DB.get('customers', pet.customerId);
    const records = (await DB.getByIndex('records', 'petId', petId)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const age = pet.birthYear ? (new Date().getFullYear() - pet.birthYear) + '살' : (pet.birthDate ? this.calculateAge(pet.birthDate) : '-');

    // 최근 미용 사진 — 다음 미용 때 "지난번엔 이렇게" 확인용. 날짜·전후 라벨은 사진 위에 얹어 보여준다 (사진에 굽지 않는다)
    const keep = await App.getRecordPhotoKeep();
    // 기록 1건 = 타일 1개. 전·후가 둘 다 있으면 타일 아래 '전 | 후'로 번갈아 본다 (MoeGo 비교 보기 방식, 넘기기 제스처와 안 겹치게 버튼)
    const photoTiles = [];
    for (const r of records.filter(x => App._recordHasPhoto(x)).slice(0, keep || 6)) {
      const before = await App.getRecordPhoto(r, 'photoBefore');
      const after = await App.getRecordPhoto(r, 'photoAfter');
      if (!before && !after) continue;
      const svc = r.service ? App.getRecordServiceDisplay(r) : '';
      const cap = (tag) => `${App.formatDate(r.date)} 미용 ${tag}${svc ? ' · ' + svc : ''}`;
      photoTiles.push({ before, after, date: r.date, recordId: r.id, capBefore: cap('전'), capAfter: cap('후') });
    }
    const photoStrip = photoTiles.length ? `
      <div class="rec-photo-strip">
        <div class="rec-photo-strip-title">최근 미용 사진 <small>${keep ? `최근 ${keep}회 보관` : ''}</small></div>
        <div class="rec-photo-strip-row">
          ${photoTiles.map(t => {
            const showAfter = !!t.after;
            return `
          <figure class="rec-photo-item" data-rid="${t.recordId}">
            <img src="${showAfter ? t.after : t.before}" class="photo-viewable" data-group="pet-recent" data-caption="${App.escapeHtml(showAfter ? t.capAfter : t.capBefore)}" alt="${App.escapeHtml(showAfter ? t.capAfter : t.capBefore)}">
            <figcaption>${App.escapeHtml((t.date || '').slice(5).replace('-', '.'))}
              ${t.before && t.after
                ? `<span class="rec-ba" role="group" aria-label="전후 보기"><button type="button" data-f="before">전</button><button type="button" class="on" data-f="after">후</button></span>`
                : `<b>${showAfter ? '후' : '전'}</b>`}
            </figcaption>
          </figure>`; }).join('')}
        </div>
      </div>` : '';
    this._photoTiles = photoTiles;

    container.innerHTML = `
      <div class="back-link" onclick="history.length>1?history.back():App.navigate('pets')">${App.icon('arrow-left')} 뒤로가기</div>
      <div class="detail-header">
        <div class="pet-detail-photo">
          ${(pet.photoThumb || pet.photo)
            ? `<img src="${pet.photoThumb || pet.photo}" class="photo-viewable" data-caption="${App.escapeHtml(pet.name)}"
                style="width:200px;height:200px;object-fit:cover;border-radius:var(--radius-lg);cursor:pointer" alt="${App.escapeHtml(pet.name)}">`
            : `<div style="width:200px;height:200px;border-radius:var(--radius-lg);background:var(--warning-light);display:flex;align-items:center;justify-content:center;font-size:4rem;color:var(--primary)">${App.icon('paw', 'ico-xl')}</div>`
          }
        </div>
        <div class="detail-info">
          <h2>${App.escapeHtml(pet.name)}</h2>
          <div class="detail-meta">
            <span>${App.escapeHtml(pet.breed || '견종 미입력')}</span>
            <span>${pet.weight ? pet.weight + 'kg' : ''}</span>
            <span>보호자: <a href="#customers/${pet.customerId}" style="color:var(--primary)">${App.escapeHtml(App.getCustomerLabel(customer))}</a></span>
            ${customer?.phone ? `<a href="tel:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" style="color:var(--primary)" aria-label="전화" title="전화">${App.icon('phone')}</a> <a href="sms:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" style="color:var(--primary)" aria-label="문자" title="문자">${App.icon('message')}</a>` : ''}
          </div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="btn-pet-record" data-pet-id="${pet.id}" data-customer-id="${pet.customerId}">+ 미용 기록</button>
          <button class="btn btn-primary" id="btn-pet-appt" data-pet-id="${pet.id}" data-customer-id="${pet.customerId}">예약</button>
          <button class="btn btn-secondary btn-edit-pet" data-id="${pet.id}">수정</button>
        </div>
      </div>

      ${(() => {
        const hasAllergy = App.hasPetNote(pet.allergies);
        const hasHealth = App.hasPetNote(pet.healthNotes);
        if (!hasAllergy && !hasHealth) return '';
        return `
      <div style="background:var(--danger-bg-soft);border:1.5px solid var(--danger);border-radius:var(--radius);padding:12px 14px;margin-bottom:16px;display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:1.1rem;color:var(--danger);font-weight:800;flex-shrink:0;line-height:1.3">${App.icon('alert')}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;color:var(--danger);font-size:0.9rem;margin-bottom:4px">미용 전 확인</div>
          ${hasAllergy ? `<div style="font-size:0.85rem;color:var(--danger-text-strong)"><strong>알러지:</strong> ${App.escapeHtml(pet.allergies)}</div>` : ''}
          ${hasHealth ? `<div style="font-size:0.85rem;color:var(--danger-text-strong);margin-top:2px"><strong>건강:</strong> ${App.escapeHtml(pet.healthNotes)}</div>` : ''}
        </div>
      </div>`;
      })()}

      ${photoStrip}

      ${records.length > 0 ? (() => {
        const totalSpend = records.reduce((sum, r) => sum + App.getRecordAmount(r), 0);
        const avgSpend = Math.round(totalSpend / records.length);
        const lastVisitDate = records[0].date;
        let avgCycleNum = null, avgCycle = '-';
        if (records.length >= 2) {
          const dates = records.map(r => new Date(r.date)).sort((a, b) => a - b);
          let totalDays = 0;
          for (let i = 1; i < dates.length; i++) totalDays += Math.round((dates[i] - dates[i - 1]) / (1000*60*60*24));
          avgCycleNum = Math.round(totalDays / (dates.length - 1));
          avgCycle = avgCycleNum + '일';
        }
        const lastCondition = records.find(r => r.condition);
        const lastCoop = records.find(r => r.cooperativeness);
        const condLabels = { good: '좋음', normal: '보통', caution: '주의' };
        const coopLabels = { easy: '잘함', normal: '보통', difficult: '까다로움' };
        const dotColor = (v) => v === 'good' || v === 'easy' ? 'var(--success)' : v === 'caution' || v === 'difficult' ? 'var(--danger)' : v === 'normal' ? 'var(--warning)' : 'var(--border)';

        // 다음 미용일 (groomingCycle 우선, 없으면 평균 주기)
        const cycleSource = pet.groomingCycle || avgCycleNum;
        const cycleSourceLabel = pet.groomingCycle ? '권장' : (avgCycleNum ? '평균' : null);
        let nextDays = null, nextStr = null, isOverdue = false;
        if (cycleSource && lastVisitDate) {
          // 'YYYY-MM-DD' 를 new Date() 로 파싱하면 UTC 자정이 되어 한국에선 하루가 밀린다 → 로컬 파싱
          const next = App.parseLocalDate(lastVisitDate);
          next.setDate(next.getDate() + cycleSource);
          nextStr = App.formatLocalDate(next);
          nextDays = App.daysUntil(nextStr);
          isOverdue = nextDays < 0;
        }
        const lastDays = lastVisitDate ? Math.floor((new Date() - new Date(lastVisitDate + 'T00:00:00')) / 86400000) : null;

        // 협조도 추이 (최근 5회)
        const last5Coop = records.slice(0, 5).map(r => r.cooperativeness).filter(Boolean);
        const coopTrendDots = last5Coop.length > 0 ? last5Coop.map(c =>
          `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dotColor(c)};margin-right:2px" title="${coopLabels[c]}"></span>`
        ).join('') : '';

        return `
      <!-- 응대 카드 (단골 응대 핵심 정보) -->
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px">
        <div style="padding:14px 12px;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);min-width:0">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px">다음 미용 권장</div>
          <div style="font-size:1rem;font-weight:800;color:${isOverdue ? 'var(--danger)' : 'var(--primary)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nextDays != null ? (isOverdue ? Math.abs(nextDays) + '일 초과' : nextDays === 0 ? '오늘' : 'D-' + nextDays) : '데이터 부족'}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nextStr ? App.formatDate(nextStr) + (cycleSourceLabel === '평균' ? ' · 평균 ' + avgCycleNum + '일' : '') : (records.length < 2 ? '기록 부족' : '주기 미설정')}</div>
        </div>
        <div style="padding:14px 12px;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);min-width:0">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px">최근 방문</div>
          <div style="font-size:1rem;font-weight:800;color:var(--info);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lastDays != null ? (lastDays === 0 ? '오늘' : lastDays + '일 전') : '없음'}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lastVisitDate ? App.formatDate(lastVisitDate) : '-'}</div>
        </div>
        <div style="padding:14px 12px;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);min-width:0">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px">최근 컨디션</div>
          <div style="font-size:1rem;font-weight:800;color:${lastCondition ? dotColor(lastCondition.condition) : 'var(--text-muted)'};white-space:nowrap">${lastCondition ? condLabels[lastCondition.condition] : '기록 없음'}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lastCondition ? App.formatDate(lastCondition.date) : '-'}</div>
        </div>
        <div style="padding:14px 12px;background:var(--bg-white);border:1px solid var(--border);border-radius:var(--radius);min-width:0">
          <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:4px">미용 협조도</div>
          <div style="font-size:1rem;font-weight:800;color:${lastCoop ? dotColor(lastCoop.cooperativeness) : 'var(--text-muted)'};white-space:nowrap">${lastCoop ? coopLabels[lastCoop.cooperativeness] : '기록 없음'}</div>
          <div style="margin-top:3px;line-height:1">${coopTrendDots || `<span style="font-size:0.7rem;color:var(--text-secondary)">-</span>`}</div>
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section-title">방문 통계</h3>
        <div class="info-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
          <div class="info-item"><label>총 방문</label><span style="font-weight:700;font-size:1.1rem">${records.length}회</span></div>
          <div class="info-item"><label>총 지출</label><span style="font-weight:700;font-size:1.1rem">${App.formatCurrency(totalSpend)}</span></div>
          <div class="info-item"><label>평균 단가</label><span style="font-weight:700;font-size:1.1rem">${App.formatCurrency(avgSpend)}</span></div>
          <div class="info-item"><label>평균 방문 주기</label><span style="font-weight:700;font-size:1.1rem">${avgCycle}</span></div>
        </div>
      </div>`;
      })() : ''}

      <div class="detail-section">
        <h3 class="detail-section-title">미용 기록 (${records.length}건)</h3>
        ${await (async () => {
          if (records.length === 0) return '<p style="color:var(--text-muted)">미용 기록이 없습니다.</p>';
          const allServices = await DB.getAll('services');
          const serviceMap = {}; allServices.forEach(s => serviceMap[s.id] = s.name);
          const condLabels = { good: '좋음', normal: '보통', caution: '주의' };
          const coopLabels = { easy: '잘함', normal: '보통', difficult: '까다로움' };
          const dotColor = (v) => v === 'good' || v === 'easy' ? 'var(--success)' : v === 'caution' || v === 'difficult' ? 'var(--danger)' : v === 'normal' ? 'var(--warning)' : 'var(--border)';
          const _isMobile = window.matchMedia('(max-width: 768px)').matches;
          if (_isMobile) {
            return records.map(r => {
              const serviceNames = App.getRecordServiceDisplay(r, serviceMap);
              const condDot = r.condition ? `<span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dotColor(r.condition)}"></span>컨디션 ${condLabels[r.condition]}</span>` : '';
              const coopDot = r.cooperativeness ? `<span style="display:inline-flex;align-items:center;gap:4px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dotColor(r.cooperativeness)}"></span>협조 ${coopLabels[r.cooperativeness]}</span>` : '';
              return `<div style="padding:12px 0;border-bottom:1px solid var(--border-light)${r.paymentMethod === 'unpaid' ? ';border-left:4px solid var(--danger);padding-left:12px' : ''}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <strong style="font-size:0.9rem">${App.formatDate(r.date)}</strong>
                  <strong style="color:var(--primary)">${App.formatCurrency(App.getRecordAmount(r))}</strong>
                </div>
                <div style="font-size:0.85rem;color:var(--text-secondary)">${App.escapeHtml(serviceNames)} · ${App.escapeHtml(r.groomer || '-')} · ${App.pages.records.getPaymentLabel(r.paymentMethod)}</div>
                ${(condDot || coopDot) ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:5px;font-size:0.74rem;color:var(--text-muted)">${condDot}${coopDot}</div>` : ''}
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
      ${(() => {
        // 반려견 정보 — 비어 있는 항목은 숨기고, 짧은 값은 두 칸씩 (예전엔 '기록 없음'·'-' 줄이 열 개 가까이 이어졌다)
        const short = [
          ['견종', pet.breed], ['몸무게', pet.weight ? pet.weight + 'kg' : ''], ['나이', age !== '-' ? age : ''],
          ['성별', [this.getGenderLabel(pet.gender) === '-' ? '' : this.getGenderLabel(pet.gender), pet.neutered ? '중성화' : ''].filter(Boolean).join(' · ')],
          ['사이즈', this.getSizeLabel(pet.size, pet.weight)], ['권장 주기', pet.groomingCycle ? pet.groomingCycle + '일' : '']
        ].filter(([, v]) => v && v !== '-');
        const long = [
          ['선호 스타일', pet.preferredStyle], ['성격/행동', pet.temperament], ['건강 특이사항', pet.healthNotes],
          ['알러지', pet.allergies], ['메모', pet.memo]
        ].filter(([, v]) => v && String(v).trim());
        return `
      <div class="detail-section">
        <h3 class="detail-section-title">반려견 정보</h3>
        <div class="pet-info-grid">
          ${short.map(([k, v]) => `<div class="info-item"><label>${k}</label><span>${App.escapeHtml(String(v))}</span></div>`).join('')}
          ${long.map(([k, v]) => `<div class="info-item wide"><label>${k}</label><span>${App.escapeHtml(String(v))}</span></div>`).join('')}
        </div>
        ${long.length === 0 ? `<button type="button" class="btn btn-sm btn-ghost btn-edit-pet" data-id="${pet.id}" style="margin-top:6px">${App.icon('edit')} 성격·선호 스타일·특이사항 입력</button>` : ''}
      </div>`;
      })()}

      <div style="display:flex;justify-content:flex-end;margin:24px 0 8px">
        <button class="btn btn-ghost btn-delete-pet" data-id="${pet.id}" style="min-height:44px;color:var(--danger)">반려견 삭제</button>
      </div>
    `;
  },

  async init(params) {
    document.getElementById('btn-add-pet')?.addEventListener('click', () => this.showForm());
    // 최근 미용 사진 전·후 토글
    document.querySelectorAll('.rec-photo-item .rec-ba button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fig = btn.closest('.rec-photo-item');
        const t = (this._photoTiles || []).find(x => String(x.recordId) === fig?.dataset.rid);
        const img = fig?.querySelector('img');
        if (!t || !img) return;
        const after = btn.dataset.f === 'after';
        img.src = after ? t.after : t.before;
        img.dataset.caption = after ? t.capAfter : t.capBefore;
        img.alt = img.dataset.caption;
        fig.querySelectorAll('.rec-ba button').forEach(b => b.classList.toggle('on', b === btn));
      });
    });
    // 반려견 상세 → 빠른 예약
    document.getElementById('btn-pet-appt')?.addEventListener('click', (e) => {
      const customerId = Number(e.target.dataset.customerId);
      const petId = Number(e.target.dataset.petId);
      App.pages.appointments.showForm(null, customerId, { petId });
    });
    // 반려견 상세 → 바로 미용 기록 (고객·반려견 선택 생략)
    document.getElementById('btn-pet-record')?.addEventListener('click', (e) => {
      const customerId = Number(e.target.dataset.customerId);
      const petId = Number(e.target.dataset.petId);
      App.pages.records.showForm(null, { customerId, petId, date: App.getToday() });
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
    // 보호자가 정해져 들어온 경우(고객 상세)만 잠긴 셀렉트, 그 외엔 검색형 고객 선택 + 인라인 신규 등록
    const customerOptions = presetCustomerId ? await App.getCustomerOptions(presetCustomerId) : '';
    const curYear = new Date().getFullYear();
    const origAge = pet.birthYear ? String(curYear - pet.birthYear) : (pet.birthDate ? String(curYear - new Date(pet.birthDate).getFullYear()) : '');
    this._inlinePetId = null;

    App.showModal({
      title: id ? '반려견 정보 수정' : '새 반려견 등록',
      size: 'lg',
      content: `
        <div class="form-group">
          <label class="form-label">반려견 이름 <span class="required">*</span></label>
          <input type="text" id="f-name" value="${App.escapeHtml(pet.name || '')}" placeholder="반려견 이름">
        </div>
        <div class="form-group">
          <label class="form-label">보호자 <span class="required">*</span></label>
          ${presetCustomerId ? `<select id="f-customerId" disabled>
            <option value="">보호자 선택</option>
            ${customerOptions}
          </select>
          <input type="hidden" id="f-customerId-hidden" value="${presetCustomerId}">` : '<div id="pet-customer-select"></div>'}
        </div>
        <div class="form-group">
          <label class="form-label">견종</label>
          ${App.breedInputHtml('f-breed', pet.breed)}
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
            <input type="number" id="f-age" value="${origAge}" data-orig="${origAge}" placeholder="예: 3" min="0" max="30" step="1">
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
          <label class="form-label">사진</label>
          <div class="pet-photo-upload">
            <div class="pet-photo-preview" id="f-photo-preview">
              ${(pet.photoThumb || pet.photo) ? `<img src="${pet.photoThumb || pet.photo}" alt="반려견 사진">` : '<span class="pet-photo-placeholder">' + App.icon('paw', 'ico-xl') + '</span>'}
            </div>
            <div class="flex-1">
              <input type="file" id="f-photo" accept="image/*" style="display:none">
              <button type="button" class="btn btn-sm btn-secondary" id="f-photo-btn">${App.icon('camera')} 사진 선택</button>
              ${(pet.photoThumb || pet.photo || pet.photoId) ? '<button type="button" class="btn btn-sm btn-danger" id="f-photo-remove" style="margin-left:8px">삭제</button>' : ''}
              <div class="form-hint">JPG, PNG 등 이미지 파일 (최대 1MB 권장)</div>
            </div>
          </div>
          <input type="hidden" id="f-photo-data" value="">
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
    App.ensureBreedList();

    if (!presetCustomerId) {
      await App.renderCustomerSelect('pet-customer-select', pet.customerId || null, async (cid, newPetId) => {
        // 인라인 "새 고객 등록"에서 반려견까지 만들어졌으면, 이 폼이 그 반려견을 이어서 채운다 (같은 아이 중복 등록 방지)
        this._inlinePetId = null;
        if (id || !newPetId) return;
        const created = await DB.get('pets', newPetId);
        if (!created) return;
        this._inlinePetId = newPetId;
        const fill = (elId, v) => { const el = document.getElementById(elId); if (el && !el.value.trim() && v) el.value = v; };
        fill('f-name', created.name || '');
        fill('f-breed', created.breed || '');
        fill('f-weight', created.weight ? String(created.weight) : '');
      });
    }

    // 사진 삭제는 '삭제' 버튼을 눌렀을 때만 (원본을 못 불러온 경우·불러오기 전 저장에 사진이 지워지지 않게)
    this._photoRemoved = false;
    // 기존 사진 데이터 설정 (photos 스토어 마이그레이션 대응)
    if (pet.photo || pet.photoId) {
      const photoData = document.getElementById('f-photo-data');
      if (photoData) {
        if (pet.photo) {
          photoData.value = pet.photo;
        } else if (pet.photoId) {
          const fullPhoto = await DB.getPhoto(pet.photoId);
          if (fullPhoto) photoData.value = fullPhoto;
        }
      }
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
          this._photoRemoved = false;
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
              this._photoRemoved = true;
              preview.innerHTML = '<span class="pet-photo-placeholder">' + App.icon('paw', 'ico-xl') + '</span>';
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
      this._photoRemoved = true;
      const preview = document.getElementById('f-photo-preview');
      if (preview) preview.innerHTML = '<span class="pet-photo-placeholder">' + App.icon('paw', 'ico-xl') + '</span>';
      document.getElementById('f-photo-remove')?.remove();
    });
  },

  async savePet(id, presetCustomerId) {
    try {
      const customerId = presetCustomerId || Number(document.getElementById('pet-customer-select-value')?.value || document.getElementById('f-customerId')?.value);
      const name = document.getElementById('f-name').value.trim();
      const breed = App.normalizeBreed(document.getElementById('f-breed').value);
      const weight = parseFloat(document.getElementById('f-weight').value) || null;
      const gender = document.getElementById('f-gender').value;
      // 나이: 사용자가 바꾸지 않았으면 기존 birthDate/birthYear 를 그대로 둔다
      // (예전엔 수정할 때마다 정확한 생일이 YYYY-01-01 로 덮어써졌고, 0살 강아지는 비어 버렸다)
      const ageEl = document.getElementById('f-age');
      const ageRaw = (ageEl?.value || '').trim();
      const ageUnchanged = !!id && ageRaw === (ageEl?.dataset.orig || '');
      const ageInput = Number(ageRaw);
      if (ageRaw && (!Number.isFinite(ageInput) || ageInput < 0 || ageInput > 30)) { App.showToast('나이를 확인해주세요 (0~30살).', 'error'); App.highlightField('f-age'); return; }
      const birthYear = ageRaw ? (new Date().getFullYear() - Math.floor(ageInput)) : null;
      const birthDate = birthYear != null ? `${birthYear}-01-01` : '';
      const neutered = document.getElementById('f-neutered').checked;
      const size = document.getElementById('f-size').value;
      const temperament = document.getElementById('f-temperament').value.trim();
      const healthNotes = document.getElementById('f-healthNotes').value.trim();
      const allergies = document.getElementById('f-allergies').value.trim();
      const memo = document.getElementById('f-memo').value.trim();
      const preferredStyle = document.getElementById('f-preferredStyle')?.value.trim() || '';
      const groomingCycle = Number(document.getElementById('f-groomingCycle')?.value) || null;
      const petStatus = document.getElementById('f-petStatus')?.value || 'active';
      const photoRaw = document.getElementById('f-photo-data')?.value || '';

      if (!customerId) { App.showToast('보호자를 선택해주세요.', 'error'); App.highlightField(presetCustomerId ? 'f-customerId' : 'pet-customer-select-input'); return; }
      if (!name) { App.showToast('이름을 입력해주세요.', 'error'); App.highlightField('f-name'); return; }

      const data = { customerId, name, breed, weight, gender, birthDate, birthYear, neutered, size, temperament, healthNotes, allergies, memo, preferredStyle, groomingCycle, petStatus };
      if (ageUnchanged) { delete data.birthDate; delete data.birthYear; }

      // 인라인 고객 등록에서 같은 이름의 반려견이 이미 만들어졌다면 새로 추가하지 않고 그 반려견을 채운다
      let inlineTarget = null;
      if (!id && this._inlinePetId) {
        const p = await DB.get('pets', this._inlinePetId);
        if (p && p.customerId === customerId && (p.name || '').trim() === name) inlineTarget = p;
      }

      if (id) {
        const existing = await DB.get('pets', id);
        // 사진 처리: 마이그레이션된 사진 보존 + 새 사진은 photos 스토어 사용
        // 원본 비교 기준: 인라인 photo 또는 photos 스토어 데이터
        const originalPhoto = existing.photo || (existing.photoId ? await DB.getPhoto(existing.photoId) : null);
        const photoChanged = !!photoRaw && photoRaw !== originalPhoto;

        if (!photoRaw && this._photoRemoved) {
          // 사진 삭제됨 → 기존 photos 스토어 엔트리도 제거
          if (existing.photoId) { await DB.deletePhoto(existing.photoId); }
          data.photo = '';
          data.photoId = null;
          data.photoThumb = null;
        } else if (photoChanged) {
          // 새 사진 업로드됨 → photos 스토어에 저장
          if (existing.photoId) { await DB.deletePhoto(existing.photoId); }
          try {
            const photoId = await DB.savePhoto(photoRaw, { type: 'pet-profile', ownerId: id });
            data.photoId = photoId;
            data.photoThumb = await DB._createThumb(photoRaw, 150, 0.5);
            data.photo = null;
          } catch (e) {
            data.photo = photoRaw; // fallback: 인라인 저장
          }
        } else {
          // 사진 변경 없음 → 기존 photoId/photoThumb/photo 유지
          data.photoId = existing.photoId;
          data.photoThumb = existing.photoThumb;
          data.photo = existing.photo;
        }
        const prevCustomerId = existing.customerId;
        Object.assign(existing, data);
        await DB.update('pets', existing);
        // 보호자를 바꾸면 이 반려견의 미용 기록·예약도 새 보호자로 옮긴다
        // (안 옮기면 예약 문자가 옛 보호자에게 가고, 옛 보호자를 지울 때 기록이 함께 지워진다)
        if (prevCustomerId && prevCustomerId !== customerId) {
          for (const store of ['records', 'appointments']) {
            const rows = await DB.getByIndex(store, 'petId', id);
            for (const r of rows) {
              if (r.customerId === customerId) continue;
              r.customerId = customerId;
              await DB.update(store, r);
            }
          }
          const rp = App.pages.records;
          if (rp && rp._recalcCustomerTag) {
            try { await rp._recalcCustomerTag(prevCustomerId); await rp._recalcCustomerTag(customerId); } catch (_) {}
          }
        }
        App.showToast('반려견 정보가 수정되었습니다.');
        App.closeModal();
        App.handleRoute();
      } else {
        // 새 반려견: 사진은 photos 스토어에 저장
        if (inlineTarget) {
          // 폼에서 비워둔 칸은 인라인 등록 때 입력한 값을 유지
          Object.keys(data).forEach(k => {
            if ((data[k] === '' || data[k] == null) && inlineTarget[k] != null && inlineTarget[k] !== '') data[k] = inlineTarget[k];
          });
          Object.assign(inlineTarget, data);
          if (photoRaw) {
            try {
              inlineTarget.photoId = await DB.savePhoto(photoRaw, { type: 'pet-profile', ownerId: inlineTarget.id });
              inlineTarget.photoThumb = await DB._createThumb(photoRaw, 150, 0.5);
              inlineTarget.photo = null;
            } catch (e) {
              inlineTarget.photo = photoRaw; // fallback: 인라인 저장
            }
          }
          await DB.update('pets', inlineTarget);
          this._inlinePetId = null;
          data._newPetId = inlineTarget.id;
        } else if (photoRaw) {
          let newPetId = null;
          try {
            data.photo = null;
            newPetId = await DB.add('pets', data);
            const photoId = await DB.savePhoto(photoRaw, { type: 'pet-profile', ownerId: newPetId });
            const thumb = await DB._createThumb(photoRaw, 150, 0.5);
            const pet = await DB.get('pets', newPetId);
            pet.photoId = photoId;
            pet.photoThumb = thumb;
            await DB.update('pets', pet);
            data._newPetId = newPetId;
          } catch (e) {
            // fallback: 인라인 저장 (이미 만들어진 반려견이 있으면 다시 추가하지 않고 그 반려견에 넣는다)
            if (newPetId != null) {
              const pet = await DB.get('pets', newPetId);
              if (pet) { pet.photo = photoRaw; await DB.update('pets', pet); }
              data._newPetId = newPetId;
            } else {
              delete data.id;
              data.photo = photoRaw;
              data._newPetId = await DB.add('pets', data);
            }
          }
        } else {
          data._newPetId = await DB.add('pets', data);
        }
        const newPetId = data._newPetId;
        App.showToast('새 반려견이 등록되었습니다.');
        App.closeModal();
        // closeModal()의 history.back()이 비동기라 바로 confirm 을 띄우면 그 popstate 가 confirm 을 닫아버린다
        await new Promise(r => setTimeout(r, 180));
        const doAppt = await App.confirm('바로 예약을 등록하시겠습니까?', { danger: false, okLabel: '예약 등록' });
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

      const [appointments, records] = await Promise.all([
        DB.getByIndex('appointments', 'petId', id),
        DB.getByIndex('records', 'petId', id)
      ]);
      const unpaidSum = records.filter(r => r.paymentMethod === 'unpaid').reduce((s, r) => s + App.getRecordAmount(r), 0);
      const revenueSum = records.reduce((s, r) => s + App.getRecordAmount(r), 0);
      const confirmed = await App.confirm(
        `"${App.escapeHtml(pet.name)}"을(를) 삭제하시겠습니까?<br>` +
        `예약 <strong>${appointments.length}</strong>건 · 미용 기록 <strong>${records.length}</strong>건 (매출 ${App.formatCurrency(revenueSum)})이 함께 삭제됩니다.` +
        (unpaidSum > 0 ? `<br><span style="color:var(--danger)">미수금 ${App.formatCurrency(unpaidSum)}도 사라집니다.</span>` : '') +
        `<br><small style="color:var(--text-muted)">사망·양도라면 삭제 대신 수정에서 상태를 바꾸세요 — 기록은 남고 알림에서만 빠집니다.</small>`,
        { okLabel: '삭제' });
      if (!confirmed) return;
      // photos 스토어 정리 (반려견 프로필 + 기록 사진)
      if (pet.photoId) await DB.deletePhoto(pet.photoId).catch(() => {});
      for (const r of records) {
        for (const f of ['photoBeforeId', 'photoAfterId', 'photo3Id', 'photo4Id']) {
          if (r[f]) await DB.deletePhoto(r[f]).catch(() => {});
        }
      }
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
