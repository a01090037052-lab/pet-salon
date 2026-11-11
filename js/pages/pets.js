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
          <h1 class="page-title">고객 관리</h1>
          <p class="page-subtitle">
            총 ${pets.length}마리${inactiveCount > 0 ? ` <a href="#" id="pet-toggle-inactive" style="color:var(--primary);text-decoration:underline;font-size:0.93rem;margin-left:4px">${showInactive ? '비활성 숨기기' : `비활성 ${inactiveCount}마리 보기`}</a>` : ''}
          </p>
        </div>
        <div class="page-actions">
          <select id="pet-sort" style="width:auto;min-width:100px;font-size:max(16px,0.88rem);padding:10px 12px;min-height:44px">
            ${sortOptions.map(o => `<option value="${o.v}"${sortKey === o.v ? ' selected' : ''}>${o.l}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="btn-add-pet">+ 등록</button>
        </div>
      </div>
      ${App.peopleTabsHtml('pets')}
      <div class="search-box" style="margin-bottom:12px;max-width:none">
        <span class="search-icon">${App.icon('search')}</span>
        <input type="text" id="pet-search" placeholder="이름·견종·보호자·초성(ㅊㅋ)" style="width:100%">
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
            rightChip = `<span style="font-size:0.93rem;padding:4px 10px;background:var(--border-light);color:var(--text-muted);border-radius:12px;font-weight:600;flex-shrink:0;white-space:nowrap">${inactiveLabel}</span>`;
          } else if (vs === 'at-risk') {
            rightChip = `<span style="font-size:0.93rem;padding:4px 10px;background:var(--danger-light);color:var(--danger-text-strong);border-radius:12px;font-weight:700;flex-shrink:0;white-space:nowrap">많이 늦음</span>`;
          } else if (vs === 'remind') {
            rightChip = `<span style="font-size:0.93rem;padding:4px 10px;background:var(--warning-light);color:var(--warning-text-strong);border-radius:12px;font-weight:700;flex-shrink:0;white-space:nowrap">올 때 됨</span>`;
          } else if (vs === 'churned') {
            rightChip = `<span style="font-size:0.93rem;padding:4px 10px;background:var(--bg);color:var(--text-secondary);border:1px solid var(--border-light);border-radius:12px;font-weight:600;flex-shrink:0;white-space:nowrap">오래 안 옴</span>`;
          } else if (vs === 'new') {
            rightChip = `<span style="font-size:0.93rem;padding:4px 10px;background:var(--bg);color:var(--text-muted);border:1px solid var(--border);border-radius:12px;font-weight:600;flex-shrink:0;white-space:nowrap">방문 전</span>`;
          } else if (p.groomingCycle && (p.lastVisitDate || lastVisit)) {
            // 자정 기준 정수 일수 (예전엔 '지금'과 자정의 차를 내림해 하루 전에 '오늘', 당일에 '1일 초과'로 표시됐다)
            const next = App.parseLocalDate(p.lastVisitDate || lastVisit); next.setDate(next.getDate() + p.groomingCycle);
            const days = App.daysUntil(App.formatLocalDate(next));
            const label = days < 0 ? Math.abs(days) + '일 초과' : days === 0 ? '오늘' : 'D-' + days;
            const cColor = days < 0 ? 'var(--danger)' : 'var(--success)';
            rightChip = `<span style="font-size:0.93rem;padding:4px 10px;background:var(--bg);color:${cColor};border-radius:12px;font-weight:700;flex-shrink:0;white-space:nowrap;border:1px solid ${cColor}33">${label}</span>`;
          }

          // 알러지/건강 주의 아이콘
          const hasWarn = App.hasPetNote(p.allergies) || App.hasPetNote(p.healthNotes);
          const warnIcon = hasWarn ? `<span style="color:var(--danger);font-size:0.93rem;font-weight:700;line-height:1" title="알러지/건강 주의">${App.icon('alert', 'ico-sm')}</span>` : '';

          // 사진
          const photo = (p.photoThumb || p.photo)
            ? `<img src="${p.photoThumb || p.photo}" style="width:60px;height:60px;border-radius:14px;object-fit:cover" alt="">`
            : `<div style="width:60px;height:60px;border-radius:14px;background:linear-gradient(135deg,var(--primary-light),var(--info-light));display:flex;align-items:center;justify-content:center;font-size:1.6rem;color:var(--primary)">${App.icon('paw', 'ico-lg')}</div>`;

          const opacityStyle = isInactive ? 'opacity:0.55;' : '';
          const breedWeight = (p.breed || '견종 미입력') + (p.weight ? ' · ' + App.formatKg(p.weight) + 'kg' : '');

          return `<div class="pet-list-item" data-id="${p.id}" data-search="${App.escapeHtml((p.name||'')+' '+(p.breed||'')+' '+(owner?.name||'')+' '+(owner?.phone||'')+' '+(p.memo||'')+' '+(p.healthNotes||'')+' '+(p.allergies||''))}" style="display:flex;align-items:center;gap:12px;padding:14px 14px 14px 12px;background:var(--bg-white);border:1px solid var(--border-light);border-left:4px solid ${barColor};border-radius:var(--radius);cursor:pointer;margin-bottom:8px;box-shadow:var(--shadow-xs);${opacityStyle}">
            <div style="flex-shrink:0">${photo}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;min-width:0">
                <strong style="font-size:1.05rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${App.escapeHtml(p.name)}</strong>
                ${warnIcon}
              </div>
              <div style="font-size:0.93rem;color:var(--text-secondary);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${App.escapeHtml(breedWeight)} · ${App.escapeHtml(App.getCustomerLabel(owner))}</div>
              <div style="font-size:0.93rem;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lastVisit ? App.getRelativeTime(lastVisit) + ' 방문' : '방문 없음'}</div>
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
            'at-risk': { label: '많이 늦음', color: 'var(--danger)' },
            'remind': { label: '올 때 됨', color: 'var(--warning)' },
            'normal': { label: '정상', color: 'var(--success)' },
            'new': { label: '방문 전', color: 'var(--info)' },
            'churned': { label: '오래 안 옴', color: 'var(--text-muted)' },
            'inactive': { label: '비활성 (사망/양도)', color: 'var(--border)' }
          };
          return '<div class="pet-list">' + Object.entries(groups).filter(([, gp]) => gp.length > 0).map(([gs, gp]) => {
            const meta = groupMeta[gs];
            return `<div class="pet-group-head" style="margin:14px 0 8px;display:flex;align-items:center;gap:8px;padding:0 2px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${meta.color};flex-shrink:0"></span>
              <span style="font-size:0.93rem;font-weight:800;color:var(--text-primary)">${meta.label}</span>
              <span style="font-size:0.93rem;color:var(--text-muted)">${gp.length}마리</span>
            </div>` + gp.map(renderCard).join('');
          }).join('') + '</div>';
        }
        return '<div class="pet-list">' + sorted.map(renderCard).join('') + '</div>';
      })()}
    `;
  },

  // 다가오는 예약 1건 — 오늘 이후, 취소·노쇼·완료가 아닌 것 중 가장 빠른 것 (없으면 null)
  pickNextAppt(appts, today) {
    return (appts || [])
      .filter(a => a && (a.date || '') >= today && !['cancelled', 'noshow', 'no_show', 'completed'].includes(a.status))
      .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')))[0] || null;
  },

  // 방문 요약 — 8칸 상자 대신 한 줄로 보여줄 숫자들 (records 는 최신순)
  visitSummary(records) {
    const recs = records || [];
    const count = recs.length;
    const total = recs.reduce((s, r) => s + App.getRecordAmount(r), 0);
    // 날짜 없는 기록은 주기·최근 방문 계산에서 뺀다 (횟수·금액에는 넣는다)
    const dates = recs.filter(r => r.date).map(r => App.parseLocalDate(r.date)).filter(d => d && !isNaN(d)).sort((a, b) => a - b);
    const n = dates.length;
    const avgCycle = n >= 2 ? Math.round((dates[n - 1] - dates[0]) / 86400000 / (n - 1)) : null;
    const lastDate = n ? App.formatLocalDate(dates[n - 1]) : null;
    return { count, total, avgSpend: count ? Math.round(total / count) : 0, avgCycle, lastDate, lastDays: lastDate ? (-App.daysUntil(lastDate) || 0) : null };
  },

  // '방문 6회 · 평균 32일마다 · 평균 55,000원 · 총 330,000원'
  summaryLine(s) {
    if (!s || !s.count) return '';
    return [`방문 ${s.count}회`, s.avgCycle ? `평균 ${s.avgCycle}일마다` : '', `평균 ${App.formatCurrency(s.avgSpend)}`, `총 ${App.formatCurrency(s.total)}`]
      .filter(Boolean).join(' · ');
  },

  async renderDetail(container, petId) {
    const pet = await DB.get('pets', petId);
    if (!pet) {
      container.innerHTML = `<div class="back-link" onclick="history.length>1?history.back():App.navigate('pets')">${App.icon('arrow-left')} 뒤로가기</div>
        <div class="empty-state"><div class="empty-state-text">반려견을 찾을 수 없습니다.<br><small style="color:var(--text-muted)">삭제되었거나 아직 다른 기기에서 받아오지 않았을 수 있습니다.</small></div></div>`;
      return;
    }
    const esc = (v) => App.escapeHtml(v == null ? '' : String(v));
    const customer = await DB.get('customers', pet.customerId);
    const records = (await DB.getByIndex('records', 'petId', petId)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const appts = await DB.getByIndex('appointments', 'petId', petId).catch(() => []);
    const allServices = await DB.getAll('services');
    const serviceMap = {}; allServices.forEach(s => serviceMap[s.id] = s.name);
    // 미용 때 잰 몸무게 최근 3번 (오래된 → 최근)
    const weighIns = records.filter(r => Number(r.weightAtVisit) > 0).slice(0, 3).reverse();
    const age = pet.birthYear ? (new Date().getFullYear() - pet.birthYear) + '살' : (pet.birthDate ? this.calculateAge(pet.birthDate) : '');
    const gender = this.getGenderLabel(pet.gender);
    const genderText = gender === '-' ? (pet.neutered ? '중성화' : '') : gender + (pet.neutered ? '(중성화)' : '');
    // 짧은 날짜 '10/15', 요일 붙이면 '11/20(목)'
    const md = (ds, dow) => {
      const d = App.parseLocalDate(ds);
      if (!d || isNaN(d)) return '';
      return `${d.getMonth() + 1}/${d.getDate()}` + (dow ? `(${'일월화수목금토'[d.getDay()]})` : '');
    };
    const condLabels = { good: '좋음', normal: '보통', caution: '주의' };
    const coopLabels = { easy: '잘함', normal: '보통', difficult: '까다로움' };
    const sum = this.visitSummary(records);

    // 최근 미용 사진 — 다음 미용 때 "지난번엔 이렇게" 확인용
    const keep = await App.getRecordPhotoKeep();
    const photoTiles = [];
    for (const r of records.filter(x => App._recordHasPhoto(x)).slice(0, keep || 6)) {
      const before = await App.getRecordPhoto(r, 'photoBefore');
      const after = await App.getRecordPhoto(r, 'photoAfter');
      if (!before && !after) continue;
      const svc = r.service ? App.getRecordServiceDisplay(r) : '';
      const cap = (tag) => `${App.formatDate(r.date)} 미용 ${tag}${svc ? ' · ' + svc : ''}`;
      photoTiles.push({ before, after, date: r.date, recordId: r.id, capBefore: cap('전'), capAfter: cap('후') });
    }
    this._photoTiles = photoTiles;
    const photoStrip = photoTiles.length ? `
      <div class="rec-photo-strip pd-photos">
        <div class="rec-photo-strip-title">최근 미용 사진 <small>${keep ? `최근 ${keep}회 보관` : ''}</small></div>
        <div class="rec-photo-strip-row">
          ${photoTiles.map(t => {
            const showAfter = !!t.after;
            return `
          <figure class="rec-photo-item" data-rid="${t.recordId}">
            <img src="${showAfter ? t.after : t.before}" class="photo-viewable" data-group="pet-recent" data-caption="${esc(showAfter ? t.capAfter : t.capBefore)}" alt="${esc(showAfter ? t.capAfter : t.capBefore)}">
            <figcaption>${esc((t.date || '').slice(5).replace('-', '.'))}
              ${t.before && t.after
                ? `<span class="rec-ba" role="group" aria-label="전후 보기"><button type="button" data-f="before">전</button><button type="button" class="on" data-f="after">후</button></span>`
                : `<b>${showAfter ? '후' : '전'}</b>`}
            </figcaption>
          </figure>`; }).join('')}
        </div>
      </div>` : '';

    // 1. 머리 — 작은 사진(눌러서 크게 보기, 사진 없으면 눌러서 수정 창) + 이름·한 줄 정보 + 보호자
    const photo = pet.photoThumb || pet.photo;
    const phone = customer?.phone ? esc(App.phoneDigits(customer.phone)) : '';
    const head = `
      <div class="pd-head">
        <div class="pd-head-top">
          ${photo
            ? `<img src="${photo}" class="pd-photo photo-viewable" data-caption="${esc(pet.name)}" alt="${esc(pet.name)}">`
            : `<button type="button" class="pd-photo pd-photo-empty btn-edit-pet" data-id="${pet.id}" aria-label="사진 넣기 (정보 수정)">${App.icon('paw')}</button>`}
          <div class="pd-head-info">
            <h2 class="pd-name">${esc(pet.name)}</h2>
            <div class="pd-meta">${[pet.breed || '견종 미입력', pet.weight ? App.formatKg(pet.weight) + 'kg' : '', age, genderText].filter(Boolean).map(esc).join(' · ')}</div>
            <div class="pd-owner">
              <a href="#customers/${pet.customerId}" class="pd-owner-link">보호자 ${esc(App.getCustomerLabel(customer))}</a>
              ${phone ? `<a href="tel:${phone}" class="pd-icon-btn" aria-label="전화" title="전화">${App.icon('phone')}</a><a href="sms:${phone}" class="pd-icon-btn" aria-label="문자" title="문자">${App.icon('message')}</a>` : ''}
            </div>
          </div>
        </div>
        <div class="pd-actions">
          <button class="btn btn-primary" id="btn-pet-record" data-pet-id="${pet.id}" data-customer-id="${pet.customerId}">+ 미용 기록</button>
          <button class="btn btn-primary" id="btn-pet-appt" data-pet-id="${pet.id}" data-customer-id="${pet.customerId}">예약</button>
          <button class="btn btn-secondary btn-edit-pet" data-id="${pet.id}">수정</button>
        </div>
      </div>`;

    // 2. 미용 전 확인 — 알러지·건강·성격을 한 상자에 (하나도 없으면 상자 자체를 숨김)
    const warns = [['알러지', pet.allergies], ['건강', pet.healthNotes], ['성격', pet.temperament]].filter(([, v]) => App.hasPetNote(v));
    const warn = warns.length ? `
      <div class="pd-warn">
        <span class="pd-warn-ico">${App.icon('alert')}</span>
        <div>
          <div class="pd-warn-title">미용 전 확인</div>
          ${warns.map(([k, v]) => `<div class="pd-warn-line"><strong>${k}:</strong> ${esc(v)}</div>`).join('')}
        </div>
      </div>` : '';

    // 3. 다음 예약 — 잡힌 예약이 있으면 그것, 없으면 권장일 (권장 주기 우선, 없으면 평균 주기)
    const nextAppt = this.pickNextAppt(appts, App.getToday());
    let next = '';
    if (nextAppt) {
      const svc = App.apptServiceNames(nextAppt, serviceMap);
      next = `<a class="pd-card pd-next" href="#appointments/go/${nextAppt.id}/${esc(nextAppt.date)}">
        ${App.icon('calendar')}<span><b>다음 예약</b> ${md(nextAppt.date, true)} ${esc(nextAppt.time || '')}${svc ? ' · ' + esc(svc) : ''}</span>
        <span class="pd-chev">${App.icon('chevron-right')}</span></a>`;
    } else {
      const cycle = pet.groomingCycle || sum.avgCycle;
      if (cycle && sum.lastDate) {
        const d = App.parseLocalDate(sum.lastDate);
        d.setDate(d.getDate() + Number(cycle));
        const days = App.daysUntil(App.formatLocalDate(d));
        const label = days < 0 ? `${-days}일 지남` : days === 0 ? '오늘' : 'D-' + days;
        next = `<div class="pd-card pd-next pd-next-hint${days < 0 ? ' is-over' : ''}">
          ${App.icon('clock')}<span><b>다음 미용 권장</b> ${label} · ${md(App.formatLocalDate(d))} <small>(${pet.groomingCycle ? '권장' : '평균'} ${cycle}일)</small></span></div>`;
      }
    }

    // 4. 미용 메모 — 미용 시작 전에 보는 것들을 위로 (선호 스타일, 지난번 스타일·메모, 최근 컨디션·협조)
    const last = records[0];
    const lastNote = last ? [last.style, last.memo].map(v => (v || '').trim()).filter(Boolean) : [];
    const lastCond = records.find(r => r.condition);
    const lastCoop = records.find(r => r.cooperativeness);
    // 협조도 추이 (최근 5회, 기록된 것만) — 작은 색 점
    const dotColor = (v) => v === 'easy' ? 'var(--success)' : v === 'difficult' ? 'var(--danger)' : 'var(--warning)';
    const coopDots = records.slice(0, 5).map(r => r.cooperativeness).filter(c => coopLabels[c])
      .map(c => `<span class="pd-dot" style="background:${dotColor(c)}" title="협조 ${coopLabels[c]}"></span>`).join('');
    const memoLines = [
      pet.preferredStyle && String(pet.preferredStyle).trim() ? `<div><b>선호 스타일</b> ${esc(pet.preferredStyle)}</div>` : '',
      lastNote.length ? `<div><b>지난번(${md(last.date)})</b> ${lastNote.map(esc).join(' · ')}</div>` : '',
      (lastCond || lastCoop) ? `<div class="pd-muted">${[lastCond ? '컨디션 ' + condLabels[lastCond.condition] : '', lastCoop ? '협조 ' + coopLabels[lastCoop.cooperativeness] : ''].filter(Boolean).join(' · ')}${coopDots ? `<span class="pd-dots" aria-label="최근 협조도">${coopDots}</span>` : ''}</div>` : ''
    ].filter(Boolean);
    const memo = memoLines.length ? `<div class="pd-card pd-memo"><div class="pd-card-title">미용 메모</div>${memoLines.join('')}</div>` : '';

    // 5. 요약 한 줄
    const summary = sum.count ? `
      <div class="pd-summary">${esc(this.summaryLine(sum))}${sum.lastDays != null ? `<span class="pd-muted"> · 최근 방문 ${sum.lastDays === 0 ? '오늘' : sum.lastDays + '일 전'}</span>` : ''}</div>` : '';

    // 6. 미용 기록 — 한 줄 요약 + (있을 때만) 메모 줄. 줄을 누르면 기록 수정, 옆 리포트 버튼은 리포트
    // 처음 5건, 그다음은 20건씩 (기록이 수백 건인 아이도 화면이 한꺼번에 길어지지 않게)
    const REC_FIRST = 5, REC_STEP = 20;
    const rowHtml = (r) => {
      const svc = App.getRecordServiceDisplay(r, serviceMap);
      const pay = r.paymentMethod === 'none' ? '' : App.pages.records.getPaymentLabel(r.paymentMethod, r);
      const top = [md(r.date), svc === '-' ? '' : esc(svc), r.groomer ? esc(r.groomer) : '', pay === '-' ? '' : pay].filter(Boolean).join(' · ');
      const sub = [r.memo ? esc(r.memo) : '', r.condition ? '컨디션 ' + condLabels[r.condition] : '', r.cooperativeness ? '협조 ' + coopLabels[r.cooperativeness] : ''].filter(Boolean).join(' · ');
      // 누르는 부분(.pd-rec-open)과 리포트 버튼은 나란히 — 버튼 안에 버튼을 넣지 않는다
      return `<div class="pd-rec-row${r.paymentMethod === 'unpaid' ? ' is-unpaid' : ''}">
        <div class="pd-rec-open" data-id="${r.id}" role="button" tabindex="0">
          <div class="pd-rec-main"><div class="pd-rec-top">${top}</div>${sub ? `<div class="pd-rec-sub">${sub}</div>` : ''}</div>
          <strong class="pd-rec-price">${App.formatCurrency(App.getRecordAmount(r))}</strong>
        </div>
        <button type="button" class="pd-rec-report" data-id="${r.id}" aria-label="미용 리포트" title="미용 리포트">${App.icon('image')}</button>
      </div>`;
    };
    this._petRecs = { records, shown: Math.min(REC_FIRST, records.length), step: REC_STEP, itemHtml: rowHtml, listId: 'pet-rec-list' };
    const recs = `
      <div class="detail-section pd-records">
        <h3 class="detail-section-title">미용 기록 (${records.length}건)</h3>
        ${records.length ? `<div id="pet-rec-list">${records.slice(0, REC_FIRST).map(rowHtml).join('')}</div>
        ${records.length > REC_FIRST ? `<button type="button" class="btn btn-secondary pd-more" id="btn-pet-rec-more">이전 기록 더 보기 (${records.length - REC_FIRST}건 남음)</button>` : ''}`
        : '<p class="pd-muted">미용 기록이 없습니다.</p>'}
      </div>`;

    // 7. 반려견 정보 — 위 상자들에 이미 나온 알러지·건강·성격·선호 스타일은 빼고, 빈 칸은 숨긴다
    const infoShort = [
      ['견종', pet.breed], ['몸무게', pet.weight ? App.formatKg(pet.weight) + 'kg' : ''],
      ['최근 몸무게', weighIns.length >= 2 ? weighIns.map(r => Number(r.weightAtVisit)).join(' → ') + 'kg (' + weighIns.map(r => md(r.date)).join('·') + ')' : ''],
      ['나이', age], ['성별', genderText],
      ['사이즈', this.getSizeLabel(pet.size, pet.weight)], ['권장 주기', pet.groomingCycle ? pet.groomingCycle + '일' : '']
    ].filter(([, v]) => v && v !== '-');
    const noNotes = ![pet.preferredStyle, pet.temperament, pet.healthNotes, pet.allergies, pet.memo].some(v => v && String(v).trim());
    const info = `
      <div class="detail-section pd-info">
        <h3 class="detail-section-title">반려견 정보</h3>
        <div class="pd-kv">
          ${infoShort.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}
          ${pet.memo && String(pet.memo).trim() ? `<div class="wide"><span>메모</span><b>${esc(pet.memo)}</b></div>` : ''}
        </div>
        ${noNotes ? `<button type="button" class="btn btn-sm btn-ghost btn-edit-pet" data-id="${pet.id}" style="margin-top:6px;min-height:44px">${App.icon('edit')} 성격·선호 스타일·특이사항 입력</button>` : ''}
      </div>`;

    // 이 아이 가격 (1.08): 서비스마다 이 아이에게 받는 값. 기록할 때 메뉴 값보다 먼저 들어간다
    const cp = pet.customPrices && typeof pet.customPrices === 'object' ? Object.entries(pet.customPrices).filter(([k, v]) => k && v !== '' && v !== null && v !== undefined) : [];
    const prices = `
      <div class="detail-section pd-prices" id="pet-prices">
        <h3 class="detail-section-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">이 아이 가격
          <button type="button" class="btn btn-sm btn-secondary" id="btn-pet-price-add" data-id="${pet.id}" style="min-height:44px">+ 추가</button></h3>
        ${!cp.length
          ? '<p class="pd-muted" style="margin:4px 0 0">아직 없어요. 미용 기록에서 기본가를 고치고 <strong>이 아이 가격으로 기억</strong>을 켜거나, 여기서 추가하세요. 견종·털 상태 때문에 늘 다르게 받는 값을 적어 두면 다음부터 자동으로 들어가요.</p>'
          : '<div class="pet-info-grid">' + cp.sort((a, b) => a[0].localeCompare(b[0], 'ko')).map(([k, v]) => `<button type="button" class="info-item pet-price-row" data-id="${pet.id}" data-service="${esc(k)}" style="text-align:left;cursor:pointer;min-height:44px"><label>${esc(k)}</label><span>${App.formatCurrency(Number(v))}</span></button>`).join('') + '</div><div class="form-hint" style="margin-top:4px">누르면 고치거나 지울 수 있어요.</div>'}
      </div>
      <div class="pd-delete"><button class="btn btn-ghost btn-delete-pet" data-id="${pet.id}">반려견 삭제</button></div>`;

    // 폰은 한 줄(위→아래), 컴퓨터(1024px+)는 왼쪽 = 이 아이 정보, 오른쪽 = 요약·사진·기록 (pet-detail.css)
    container.innerHTML = `
      <div class="back-link" onclick="history.length>1?history.back():App.navigate('pets')">${App.icon('arrow-left')} 뒤로가기</div>
      <div class="pet-detail-v2">
        <div class="pd-col pd-left">${head}${warn}${next}${memo}${info}${prices}</div>
        <div class="pd-col pd-right">${summary}${photoStrip}${recs}</div>
      </div>
    `;
  },

  // 이 아이 가격 추가·수정 — 서비스 고르기 + 값. 지우기는 값 칸을 비우고 저장
  async showPetPriceForm(petId, serviceName) {
    const pet = await DB.get('pets', petId);
    if (!pet) return;
    const services = (await DB.getAll('services')).filter(s => s.isActive !== false && App.normalizeServiceName(s.name));
    const catLabel = { grooming: '미용 코스', style: '스타일 추가', addon: '추가 옵션', care: '단독 케어' };
    const order = ['grooming', 'style', 'addon', 'care'];
    const cp = pet.customPrices || {};
    const cur = serviceName ? Number(cp[serviceName]) : '';
    const names = new Set(services.map(s => App.normalizeServiceName(s.name)));
    const opts = order.map(c => {
      const list = services.filter(s => (s.category || 'grooming') === c).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      return list.length ? `<optgroup label="${catLabel[c]}">${list.map(s => { const n = App.normalizeServiceName(s.name); return `<option value="${App.escapeHtml(n)}"${n === serviceName ? ' selected' : ''}>${App.escapeHtml(n)}</option>`; }).join('')}</optgroup>` : '';
    }).join('') + (serviceName && !names.has(serviceName) ? `<option value="${App.escapeHtml(serviceName)}" selected>${App.escapeHtml(serviceName)} (메뉴에 없음)</option>` : '');
    App.showModal({
      title: serviceName ? `${pet.name} · ${serviceName} 가격` : `${pet.name} 이 아이 가격 추가`,
      content: `
        <div class="form-group">
          <label class="form-label">서비스</label>
          <select id="pp-service" ${serviceName ? 'disabled' : ''}>${serviceName ? '' : '<option value="">고르세요</option>'}${opts}</select>
        </div>
        <div class="form-group">
          <label class="form-label">이 아이에게 받는 값 (원)</label>
          <input type="number" id="pp-price" value="${cur === '' || !Number.isFinite(cur) ? '' : cur}" placeholder="예: 45000" min="0" step="1000" inputmode="numeric">
          <div class="form-hint" style="margin-top:4px">기록할 때 메뉴·몸무게 가격 대신 이 값이 먼저 들어가요.${serviceName ? ' 비우고 저장하면 지워져요.' : ''}</div>
        </div>`,
      onSave: async () => {
        const svc = serviceName || App.normalizeServiceName(document.getElementById('pp-service')?.value);
        const raw = (document.getElementById('pp-price')?.value || '').trim();
        if (!svc) { App.showToast('서비스를 고르세요.', 'error'); return; }
        const fresh = await DB.get('pets', petId);
        if (!fresh) return;
        const next = Object.assign({}, fresh.customPrices || {});
        if (raw === '') { if (!serviceName) { App.showToast('값을 넣으세요.', 'error'); return; } delete next[svc]; }
        else { const n = Number(raw); if (!(n >= 0)) { App.showToast('값을 확인하세요.', 'error'); return; } next[svc] = n; }
        fresh.customPrices = next;
        await DB.update('pets', fresh);
        App.showToast(raw === '' ? '이 아이 가격을 지웠어요.' : '이 아이 가격을 저장했어요.');
        App.closeModal();
        App.handleRoute();
      }
    });
  },

  async init(params) {
    document.getElementById('btn-add-pet')?.addEventListener('click', () => this.showForm());
    document.getElementById('btn-pet-price-add')?.addEventListener('click', (e) => this.showPetPriceForm(Number(e.currentTarget.dataset.id)));
    document.querySelectorAll('.pet-price-row').forEach(b => b.addEventListener('click', (e) => this.showPetPriceForm(Number(e.currentTarget.dataset.id), e.currentTarget.dataset.service)));
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
    // 반려견 상세 → 미용 기록 더 보기 (이미 그린 줄은 두고 다음 20건만 그 자리에 이어 붙임)
    document.getElementById('btn-pet-rec-more')?.addEventListener('click', (e) => {
      const st = this._petRecs;
      const listEl = st && document.getElementById(st.listId);
      if (!listEl) return;
      const next = st.records.slice(st.shown, st.shown + st.step);
      listEl.insertAdjacentHTML('beforeend', next.map(st.itemHtml).join(''));
      st.shown += next.length;
      const left = st.records.length - st.shown;
      if (left > 0) e.currentTarget.textContent = `이전 기록 더 보기 (${left}건 남음)`;
      else e.currentTarget.remove();
    });
    // 미용 기록 줄 → 기록 수정, 리포트 버튼 → 리포트 (줄은 나중에 붙기도 해서 목록 하나에서 위임)
    const recList = document.getElementById('pet-rec-list');
    recList?.addEventListener('click', (e) => {
      const rep = e.target.closest('.pd-rec-report');
      if (rep) { App.pages.records.showReport(Number(rep.dataset.id)); return; }
      const row = e.target.closest('.pd-rec-open');
      if (row) App.pages.records.showForm(Number(row.dataset.id));
    });
    recList?.addEventListener('keydown', (e) => {
      const row = e.target.closest('.pd-rec-open');
      if (row && e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); }
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
        item.style.display = App.searchMatch(item.dataset.search || '', q) ? '' : 'none'; // 초성·전화 숫자·여러 낱말
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
    // 정확한 생일 (나이만 입력해 생긴 'YYYY-01-01' 은 진짜 생일이 아니라 비워 둔다)
    const origBirth = (pet.birthDate && !(pet.birthYear && pet.birthDate === `${pet.birthYear}-01-01`)) ? pet.birthDate : '';
    this._inlinePetId = null;
    // 가격 구간표(몸무게 kg 구간)를 쓰면 '사이즈' 칸은 필요 없다 — 값(pet.size)은 옛 데이터용으로 그대로 둔다
    let bandsOn = true;
    try { bandsOn = !(await App.getPriceBands()).bandsOff; } catch (_) {}
    // 자주 안 쓰는 칸은 '더 보기' 안에 — 수정할 때 그 안에 값이 있으면 펼쳐서 연다
    const moreHasValue = !!id && !!(pet.neutered || pet.photoThumb || pet.photo || pet.photoId || pet.temperament || pet.healthNotes || pet.allergies || pet.memo || pet.preferredStyle || pet.groomingCycle || (pet.petStatus && pet.petStatus !== 'active') || (!bandsOn && pet.size));

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
            <input type="number" id="f-weight" value="${pet.weight ? App.formatKg(pet.weight) : ''}" placeholder="예: 3.5" step="0.1" min="0">
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
          <label class="form-label">생일 (선택)</label>
          <input type="date" id="f-birthdate" value="${App.escapeHtml(origBirth)}" data-orig="${App.escapeHtml(origBirth)}" max="${App.getToday()}">
          <div class="form-hint">생일을 넣으면 나이는 생일 기준으로 계산되고, 생일이 다가오면 홈 화면에 알려 드려요. 모르면 나이만 넣으세요.</div>
        </div>
        <button type="button" class="cf-more-toggle" id="pet-more-toggle">${moreHasValue ? '− 추가 항목 접기' : '+ 더 보기 (중성화 · 사진 · 성격 · 건강 · 스타일 · 주기)'}</button>
        <div id="pet-more"${moreHasValue ? '' : ' style="display:none"'}>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="f-neutered" ${pet.neutered ? 'checked' : ''}>
            중성화 완료
          </label>
        </div>
        ${bandsOn ? `<input type="hidden" id="f-size" value="${App.escapeHtml(pet.size || '')}">` : `<div class="form-group">
          <label class="form-label">사이즈</label>
          <select id="f-size">
            <option value="" ${!pet.size ? 'selected' : ''}>자동 (몸무게 기준)</option>
            <option value="small" ${pet.size === 'small' ? 'selected' : ''}>소형 (7kg 미만)</option>
            <option value="medium" ${pet.size === 'medium' ? 'selected' : ''}>중형 (7~15kg)</option>
            <option value="large" ${pet.size === 'large' ? 'selected' : ''}>대형 (15kg 이상)</option>
          </select>
          <div class="form-hint">미용 가격 자동 계산에 사용됩니다</div>
        </div>`}
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
          <div class="form-hint">개별 미용 주기를 설정하면 홈 재방문 알림에 반영됩니다</div>
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
        </div>
      `,
      onSave: () => this.savePet(id, presetCustomerId)
    });
    App.ensureBreedList();
    document.getElementById('pet-more-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const more = document.getElementById('pet-more');
      if (!more) return;
      const show = more.style.display === 'none';
      more.style.display = show ? 'block' : 'none';
      e.currentTarget.textContent = show ? '− 추가 항목 접기' : '+ 더 보기 (중성화 · 사진 · 성격 · 건강 · 스타일 · 주기)';
    });

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
      const weightRaw = parseFloat(document.getElementById('f-weight').value);
      const weight = weightRaw > 0 ? Math.round(weightRaw * 10) / 10 : null; // 0.1kg 단위로 (기록 폼과 같게)
      const gender = document.getElementById('f-gender').value;
      // 나이: 사용자가 바꾸지 않았으면 기존 birthDate/birthYear 를 그대로 둔다
      // (예전엔 수정할 때마다 정확한 생일이 YYYY-01-01 로 덮어써졌고, 0살 강아지는 비어 버렸다)
      const ageEl = document.getElementById('f-age');
      const ageRaw = (ageEl?.value || '').trim();
      const birthEl = document.getElementById('f-birthdate');
      const birthRaw = (birthEl?.value || '').trim();
      const birthOrig = birthEl?.dataset.orig || '';
      // 생일을 지웠으면 나이 칸 기준으로 다시 저장해야 하므로 '안 바뀜'으로 보지 않는다
      const ageUnchanged = !!id && ageRaw === (ageEl?.dataset.orig || '') && birthRaw === birthOrig;
      const ageInput = Number(ageRaw);
      if (!birthRaw && ageRaw && (!Number.isFinite(ageInput) || ageInput < 0 || ageInput > 30)) { App.showToast('나이를 확인해주세요 (0~30살).', 'error'); App.highlightField('f-age'); return; }
      if (birthRaw && (!/^\d{4}-\d{2}-\d{2}$/.test(birthRaw) || birthRaw > App.getToday())) { App.showToast('생일을 확인해주세요.', 'error'); App.highlightField('f-birthdate'); return; }
      // 생일을 넣었으면 그 날짜가 기준 (birthYear 는 비워 생일·나이 계산이 정확한 날짜를 쓰게 한다)
      const birthYear = birthRaw ? null : (ageRaw ? (new Date().getFullYear() - Math.floor(ageInput)) : null);
      const birthDate = birthRaw || (birthYear != null ? `${birthYear}-01-01` : '');
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
          data._photoFromSync = false; data._syncPhotoSig = null;
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
          // 이 기기에서 새로 넣은 사진 = 원본 (받은 사본 표시를 지워야 다른 기기로 올라간다)
          data._photoFromSync = false; data._syncPhotoSig = null;
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
          let prepaidMoved = 0;
          for (const store of ['records', 'appointments']) {
            const rows = await DB.getByIndex(store, 'petId', id);
            for (const r of rows) {
              if (r.customerId === customerId) continue;
              if (store === 'records' && Number(r.prepaidUsed) > 0) prepaidMoved++;
              r.customerId = customerId;
              await DB.update(store, r);
            }
          }
          // 정액권 장부는 돈을 낸 보호자 것이라 옮기지 않는다 (잔액은 원래 보호자에게 남는다)
          if (prepaidMoved) setTimeout(() => App.showToast(`정액권으로 낸 기록 ${prepaidMoved}건은 옮겼지만, 정액권 잔액·내역은 원래 보호자에게 남습니다.`, 'info', { duration: 7000 }), 400);
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
        // 예약은 묻지 않는다 — 토스트 한 줄 뒤 원래 화면(목록·상세)을 다시 그린다. 예약은 홈·예약 화면에서 평소처럼
        App.showToast('반려견 등록 완료');
        App.closeModal();
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
      const unpaidSum = records.filter(r => r.paymentMethod === 'unpaid').reduce((s, r) => s + App.getUnpaidAmount(r), 0);
      const revenueSum = records.reduce((s, r) => s + App.getRecordAmount(r), 0);
      // 정액권으로 낸 기록이 지워지면 그 사용분은 보호자 잔액으로 돌아간다
      const prepaidUses = [];
      for (const r of records) { if (Number(r.prepaidUsed) > 0) { const u = await Prepaid.getUseEntry(r.id); if (u) prepaidUses.push(u); } }
      const prepaidBack = prepaidUses.reduce((s, u) => s + (Number(u.amount) || 0), 0);
      const confirmed = await App.confirm(
        `"${App.escapeHtml(pet.name)}"을(를) 삭제하시겠습니까?<br>` +
        `예약 <strong>${appointments.length}</strong>건 · 지난 미용 기록 <strong>${records.length}</strong>건과 사진이 함께 삭제됩니다.` +
        (revenueSum > 0 ? `<br><span style="color:var(--danger)">이 아이의 매출 ${App.formatCurrency(revenueSum)}도 매출 통계에서 빠집니다.</span>` : '') +
        (unpaidSum > 0 ? `<br><span style="color:var(--danger)">미결제 ${App.formatCurrency(unpaidSum)}도 사라집니다.</span>` : '') +
        (prepaidBack > 0 ? `<br>정액권으로 낸 ${App.formatCurrency(prepaidBack)}은 보호자 잔액으로 돌아갑니다.` : '') +
        `<br><small style="color:var(--text-muted)">되돌릴 수 없어요. 지우기 전에 설정 &gt; 데이터에서 백업을 먼저 받아 두세요.<br>사망·양도라면 삭제 대신 수정에서 상태를 바꾸세요 — 기록은 남고 알림에서만 빠집니다.</small>`,
        { okLabel: '삭제' });
      if (!confirmed) return;
      const ops = [
        ...appointments.map(a => ({ store: 'appointments', id: a.id })),
        ...records.map(r => ({ store: 'records', id: r.id })),
        ...prepaidUses.map(u => ({ store: 'prepaid', id: u.id })),
        { store: 'pets', id }
      ];
      await DB.deleteCascade(ops);
      // photos 스토어 정리 (반려견 프로필 + 기록 사진) — 데이터 삭제가 성공한 뒤에만 지운다
      // (먼저 지우면 삭제가 실패했을 때 기록은 남고 사진만 사라졌다)
      if (pet.photoId) await DB.deletePhoto(pet.photoId).catch(() => {});
      for (const r of records) {
        for (const f of ['photoBeforeId', 'photoAfterId', 'photo3Id', 'photo4Id']) {
          if (r[f]) await DB.deletePhoto(r[f]).catch(() => {});
        }
      }
      // 방문 횟수 기반 보호자 태그(신규·일반·단골) 다시 셈 — 기록이 함께 지워졌으니
      try { await App.pages.records._recalcCustomerTag(pet.customerId); } catch (e) { console.warn('태그 재계산 실패:', e); }
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
    const birth = App.parseLocalDate(String(birthDate).slice(0, 10)) || new Date(birthDate);
    const now = new Date();
    let years = now.getFullYear() - birth.getFullYear();
    let months = now.getMonth() - birth.getMonth();
    if (now.getDate() < birth.getDate()) months--; // 이번 달 생일 날짜가 아직 안 지났으면 한 달 덜 됨
    if (months < 0) { years--; months += 12; }
    if (years > 0) return `${years}살 ${months}개월`;
    return `${months}개월`;
  },

  resizeImage(dataUrl, callback) {
    App.resizeImage(dataUrl, callback);
  }
};
