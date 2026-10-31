// ========== Dashboard Page ==========
App.pages.dashboard = {

  // 연락 후 알림을 내려두는 기간 (일)
  _SNOOZE_DAYS: 14,

  _computeRevisitAlerts(pets, customerMap, revisitDays, snoozeDays, bookedPetIds) {
    // pets의 lastVisitDate를 직접 사용 (records 전체 로드 불필요)
    const snooze = snoozeDays || this._SNOOZE_DAYS;
    const alerts = [];
    pets.forEach(pet => {
      if (!pet.lastVisitDate) return;
      // 이미 다음 예약이 잡힌 반려견은 연락할 필요가 없다
      if (bookedPetIds && bookedPetIds.has(Number(pet.id))) return;
      if (pet.petStatus && pet.petStatus !== 'active') return;
      const days = App.getDaysAgo(pet.lastVisitDate);
      if (days === null) return;
      const cycleDays = pet.groomingCycle || revisitDays;
      if (days >= cycleDays) {
        const customer = customerMap[pet.customerId];
        if (!customer) return;
        // 연락 기록은 고객 단위로 본다 — 문자는 고객 번호로 한 번 나가므로
        // 반려견이 여러 마리여도 한 번 연락하면 전부 처리된 것으로 취급한다.
        const contactedAgo = customer.lastContactedAt ? App.getDaysAgo(customer.lastContactedAt) : null;
        if (contactedAgo !== null && contactedAgo < snooze) return; // 연락 후 유예 중
        const visitStatus = App.classifyVisitStatus(pet.lastVisitDate, cycleDays);
        // 주기+3일 이내(normal)는 알림에서 제외한다.
        // classifyVisitStatus 가 이 구간을 '정상'으로 보는 것과 같은 이유 —
        // 미용 주기는 대략적이라 3일 오차는 정상 범위이고, 이 고객들은 대개
        // 알아서 재방문한다. 문자를 보내도 매출 변화는 없고 성가시기만 하다.
        if (visitStatus === 'normal') return;
        // 이탈 판정까지 남은 일수 (classifyVisitStatus 기준: 주기 2배 초과 = churned)
        const daysUntilChurn = Math.max(0, cycleDays * 2 - days);
        alerts.push({ pet, customer, days, lastDate: pet.lastVisitDate, cycleDays, visitStatus, contactedAgo, daysUntilChurn });
      }
    });
    // 오래 지난 순.
    // 이 목록은 '명단'이 아니라 유통기한이 있는 대기열이다 — 방치하면 고객이
    // 다른 살롱을 찾아 영구히 이탈한다. 하루에 처리할 수 있는 건 3~5명뿐이므로,
    // 새로 들어온 순으로 꺼내면 오래된 항목은 차례가 오기 전에 전부 썩는다.
    // 따라서 아직 살릴 수 있는 것 중 기한이 임박한 것부터 처리한다.
    return alerts.sort((a, b) => b.days - a.days);
  },

  // ----- 연락 기록 (재방문 알림 유예) -----
  async _markContacted(customerId) {
    try {
      const customer = await DB.get('customers', customerId);
      if (!customer) return;
      this._contactUndo = { customerId, prev: customer.lastContactedAt || null };
      customer.lastContactedAt = new Date().toISOString();
      await DB.update('customers', customer);
      // 행을 즉시 흐리게 처리 (전체 재렌더는 하지 않는다 — 되돌리기가 어려워지고
      // 사장님이 방금 누른 버튼이 화면에서 사라져 혼란스럽다)
      this._setAlertRowMuted(customerId, true);
      // 다음 대시보드 렌더에서 이 고객이 실제로 빠지도록 5초 캐시를 무효화한다.
      App._dashboardDirty = true;
      App.showToast(
        `${App.escapeHtml(App.getCustomerLabel(customer, (this._petsByCustomer || {})[customer.id]))}님 연락함 · ${this._SNOOZE_DAYS}일간 알림에서 제외 ` +
        `<button class="btn btn-sm btn-ghost" style="margin-left:6px" onclick="App.pages.dashboard._undoContact()">취소</button>`,
        'info', { html: true }
      );
    } catch (e) {
      console.error('_markContacted error:', e);
      App.showToast('연락 기록에 실패했습니다.', 'error');
    }
  },

  async _undoContact() {
    const u = this._contactUndo;
    if (!u) return;
    this._contactUndo = null;
    try {
      const customer = await DB.get('customers', u.customerId);
      if (!customer) return;
      if (u.prev) customer.lastContactedAt = u.prev;
      else delete customer.lastContactedAt;
      await DB.update('customers', customer);
      this._setAlertRowMuted(u.customerId, false);
      App._dashboardDirty = true;
      App.showToast('연락 기록을 취소했습니다.', 'info');
    } catch (e) {
      console.error('_undoContact error:', e);
    }
  },

  _setAlertRowMuted(customerId, muted) {
    document.querySelectorAll(`[data-alert-customer="${customerId}"]`).forEach(row => {
      row.style.opacity = muted ? '0.45' : '';
      const tag = row.querySelector('.alert-contacted-tag');
      if (tag) tag.style.display = muted ? 'inline-block' : 'none';
    });
  },

  // ----- 관리 제외 (재방문 알림 + 통계에서 제외) -----
  _excludePet(petId, petName) {
    App.showModal({
      title: `${petName} 관리 제외`,
      hideFooter: true,
      content: `
        <p style="margin-bottom:14px;color:var(--text-secondary);font-size:0.9rem;line-height:1.5">
          재방문 알림과 통계에서 제외됩니다.<br>
          기존 미용 기록과 매출은 그대로 보존됩니다.
        </p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-secondary" id="excl-transferred" style="min-height:48px">양도 · 이전 (다른 곳으로 감)</button>
          <button class="btn btn-secondary" id="excl-deceased" style="min-height:48px">사망</button>
        </div>`
    });
    const apply = async (status) => {
      try {
        const pet = await DB.get('pets', petId);
        if (!pet) { App.showToast('반려견을 찾을 수 없습니다.', 'error'); return; }
        pet.petStatus = status;
        await DB.update('pets', pet);
        App.closeModal();
        App._dashboardDirty = true;
        App.showToast(`${App.escapeHtml(petName)} 관리 제외 처리했습니다.`);
        App.handleRoute();
      } catch (e) {
        console.error('_excludePet error:', e);
        App.showToast('처리 중 오류가 발생했습니다.', 'error');
      }
    };
    setTimeout(() => {
      document.getElementById('excl-transferred')?.addEventListener('click', () => apply('transferred'));
      document.getElementById('excl-deceased')?.addEventListener('click', () => apply('deceased'));
    }, 50);
  },

  // 전체 고객의 방문 상태 요약 (대시보드 카드용)
  _computeVisitStatusSummary(pets, customerMap, revisitDays) {
    const summary = { normal: 0, new: 0, remind: 0, 'at-risk': 0, churned: 0 };
    // 고객별로 가장 최근 방문한 반려견 기준으로 상태 판정
    const customerBestStatus = {};
    const statusPriority = App.VISIT_STATUS_PRIORITY;
    pets.forEach(pet => {
      if (pet.petStatus && pet.petStatus !== 'active') return;
      const customer = customerMap[pet.customerId];
      if (!customer) return;
      const status = App.getPetVisitStatus(pet, revisitDays);
      const prev = customerBestStatus[pet.customerId];
      // 고객의 반려견 중 가장 좋은(낮은) 상태를 사용
      if (!prev || statusPriority[status] < statusPriority[prev]) {
        customerBestStatus[pet.customerId] = status;
      }
    });
    Object.values(customerBestStatus).forEach(s => summary[s]++);
    return summary;
  },

  async render(container) {
    // Skip re-render if recent and no data changed.
    // 단, 컨테이너에 대시보드 내용이 실제로 남아있을 때만 skip 한다 —
    // 다른 페이지를 거쳐 돌아온 경우 early return 하면 이전 페이지 화면이 그대로 남는다.
    if (this._lastRender && Date.now() - this._lastRender < 5000 && !App._dashboardDirty
        && container.querySelector('[data-page-root="dashboard"]')) {
      return;
    }
    this._lastRender = Date.now();
    App._dashboardDirty = false;

    try {
      const smsSep = App.getSmsSep();
      const today = App.getToday();
      const thisMonth = today.slice(0, 7);
      // 말일(3/31, 5/31 …)에 setMonth(-1) 이 오버플로되어 지난달 == 이번달이 되던 문제 → 1일 기준 계산
      const lastMonth = App.getMonthKey(-1);

      // Load only what's needed for today's view (지난달 1일 ~ 이번달 말일. 매출 페이지와 같은 범위)
      const rangeStart = lastMonth + '-01';
      const rangeEnd = thisMonth + '-31';

      const [customers, pets, todayAppointmentsRaw, recentRecords, services] = await Promise.all([
        DB.getAllLight('customers', ['memo']),
        DB.getAllLight('pets', ['preferredStyle']),
        DB.getByIndex('appointments', 'date', today),
        DB.getByDateRange('records', 'date', rangeStart, rangeEnd),
        DB.getAll('services')
      ]);
      const customerCount = customers.length;

      // 미수금 조회: paymentMethod 인덱스로 직접 조회 (전체 records 스캔 회피)
      const unpaidRecords = await DB.getByIndex('records', 'paymentMethod', 'unpaid');
      const unpaidTotal = unpaidRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      // Build lookup maps once
      const customerMap = {};
      customers.forEach(c => { customerMap[c.id] = c; });
      const petMap = {};
      pets.forEach(p => { petMap[p.id] = p; });
      // 이름 없는 보호자를 "초코 보호자"로 표기하기 위한 보호자별 반려견 묶음 (다른 페이지와 동일 규칙)
      const petsByCustomer = {};
      pets.forEach(p => { (petsByCustomer[p.customerId] = petsByCustomer[p.customerId] || []).push(p); });
      this._petsByCustomer = petsByCustomer;
      const serviceMap = {};
      services.forEach(s => { serviceMap[s.id] = s.name; });

      const todayAppointments = todayAppointmentsRaw
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const monthRecords = recentRecords.filter(r => r.date && r.date.startsWith(thisMonth));

      // 오늘 요약 한 줄 — 오늘 예약 · 주의 반려견(특이사항이 있거나 직전 기록이 '주의'/'까다로움') · 미결제 (GroomBoard 아침 브리핑 방식)
      // 오늘 예약 반려견만 직전 기록을 따로 읽는다 (recentRecords 는 두 달치라 6~8주 주기 아이의 '주의'를 놓쳤다)
      const cautionPetIds = new Set();
      for (const a of [...new Map(todayAppointments.map(x => [x.petId, x])).values()]) {
        const p = petMap[a.petId];
        if (!p) continue;
        let last = null;
        try { const rs = await DB.getByIndex('records', 'petId', Number(a.petId)); rs.forEach(r => { if (!last || (r.date || '') > (last.date || '')) last = r; }); } catch (_) {}
        if (App.hasPetNote(p.healthNotes) || App.hasPetNote(p.allergies) || (last && (last.condition === 'caution' || last.cooperativeness === 'difficult'))) cautionPetIds.add(a.petId);
      }
      const cautionNames = [...cautionPetIds].map(id => petMap[id]?.name).filter(Boolean);
      const todayBrief = `
        <div class="today-brief">
          <a href="#appointments" class="today-brief-item">${App.icon('calendar')} 오늘 예약 <b>${todayAppointments.length}건</b></a>
          <a href="#appointments" class="today-brief-item${cautionPetIds.size ? ' warn' : ''}" title="${App.escapeHtml(cautionNames.join(', '))}">${App.icon('alert')} 주의 반려견 <b>${cautionPetIds.size}마리</b></a>
          <a href="#records" class="today-brief-item${unpaidRecords.length ? ' warn' : ''}">${App.icon('coins')} 미결제 <b>${unpaidRecords.length}건</b></a>
        </div>`;
      const monthRevenue = monthRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      // 전월 동기 대비 (매출 페이지와 같은 정의: 지난달 같은 일차까지와 비교)
      const revenueChange = App.revenuePacing(recentRecords, today).pct;

      // Today's revenue
      const todayRecords = recentRecords.filter(r => r.date === today);
      this._apptRecMap = App.apptRecordMap(recentRecords);
      const todayRevenue = todayRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      // ===== 내일 예약 리마인더 =====
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = App.formatLocalDate(tomorrowDate);
      const tomorrowApptsRaw = await DB.getByIndex('appointments', 'date', tomorrowStr);
      const tomorrowAppts = tomorrowApptsRaw
        .filter(a => a.status !== 'cancelled' && a.status !== 'completed')
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      // 노쇼 카운트 (각 customer별 과거 노쇼 횟수)
      const noShowCountByCustomer = {};
      if (tomorrowAppts.length > 0) {
        // 최근 6개월 데이터로 노쇼 계산 (성능)
        const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const sixMonthsAgoStr = App.formatLocalDate(sixMonthsAgo);
        const noShowAppts = await DB.getByDateRange('appointments', 'date', sixMonthsAgoStr, today);
        noShowAppts.forEach(a => {
          if (a.status === 'noshow' && a.customerId) {
            noShowCountByCustomer[a.customerId] = (noShowCountByCustomer[a.customerId] || 0) + 1;
          }
        });
      }

      // 시간대별 그룹핑
      const timeGroupOf = (timeStr) => {
        if (!timeStr) return '미정';
        const h = Number(timeStr.split(':')[0]) || 0;
        if (h < 12) return '오전';
        if (h < 17) return '오후';
        return '저녁';
      };
      const tomorrowGrouped = { '오전': [], '오후': [], '저녁': [], '미정': [] };
      tomorrowAppts.forEach(a => { tomorrowGrouped[timeGroupOf(a.time)].push(a); });

      // SMS 본문 미리 빌드 + 발송 상태 계산
      for (const a of tomorrowAppts) {
        const customer = customerMap[a.customerId];
        const pet = petMap[a.petId];
        const msg = await App.buildSms('reminder', {
          // 이름 없는 고객은 '고객(5678)님'이 아니라 buildSms 의 '보호자' 폴백을 쓴다
          '고객명': (customer && customer.name) || '',
          '반려견명': pet?.name || '',
          '시점': App.relativeDayLabel(a.date) || '내일',
          '날짜': App.formatDateKo(a.date),
          '시간': a.time || '',
          '담당': a.groomer ? `담당: ${a.groomer}. ` : '',
          '미용사': a.groomer || ''
        });
        a._smsBody = encodeURIComponent(msg);
        a._smsRaw = msg;
        // 발송 시점 표시 (있으면)
        if (a.reminderSentAt) {
          const sentDate = new Date(a.reminderSentAt);
          const diffMs = Date.now() - sentDate.getTime();
          const diffH = Math.floor(diffMs / (1000 * 60 * 60));
          if (diffH < 1) a._sentLabel = '방금 발송됨';
          else if (diffH < 24) a._sentLabel = `${diffH}시간 전 발송됨`;
          else a._sentLabel = `${Math.floor(diffH / 24)}일 전 발송됨`;
        }
      }

      // Revisit alerts (pets의 lastVisitDate 사용, records 전체 로드 불필요)
      const revisitDays = await DB.getSetting('revisitDays') || 30;
      // 오늘부터 앞으로 잡힌 예약(취소·노쇼·완료 제외)이 있는 반려견은 재방문 알림에서 뺀다
      const bookedPetIds = new Set();
      try {
        const future = await DB.getByDateRange('appointments', 'date', today, '9999-12-31');
        future.forEach(a => { if (a.petId != null && !['cancelled', 'noshow', 'completed'].includes(a.status)) bookedPetIds.add(Number(a.petId)); });
      } catch (_) {}
      const allRevisitAlerts = this._computeRevisitAlerts(pets, customerMap, revisitDays, null, bookedPetIds);
      // 이탈(주기 2배 초과)은 매일 보는 카드에서 분리 — 지우는 게 아니라 접어둔다.
      const revisitAlerts = allRevisitAlerts.filter(a => a.visitStatus !== 'churned');
      const longGoneAlerts = allRevisitAlerts.filter(a => a.visitStatus === 'churned');

      // 고객 방문 상태 요약
      const visitSummary = this._computeVisitStatusSummary(pets, customerMap, revisitDays);

      // VIP 미방문 알림 (30일 이상)
      const customerLastVisitMap = {};
      pets.forEach(p => {
        if (!p.lastVisitDate) return;
        if (!customerLastVisitMap[p.customerId] || p.lastVisitDate > customerLastVisitMap[p.customerId]) {
          customerLastVisitMap[p.customerId] = p.lastVisitDate;
        }
      });
      recentRecords.forEach(r => {
        if (!r.customerId || !r.date) return;
        if (!customerLastVisitMap[r.customerId] || r.date > customerLastVisitMap[r.customerId]) {
          customerLastVisitMap[r.customerId] = r.date;
        }
      });
      const vipUnvisitedAlerts = App.computeVipUnvisited(customers, pets, customerLastVisitMap, revisitDays);

      // 생일 알림 (7일 이내)
      const upcomingBirthdays = [];
      const nowForBirthday = new Date();
      const todayForBirthday = new Date(nowForBirthday.getFullYear(), nowForBirthday.getMonth(), nowForBirthday.getDate());
      const getBirthdayDaysUntil = (birthDate) => {
        const birth = new Date(birthDate + 'T00:00:00');
        let bd = new Date(nowForBirthday.getFullYear(), birth.getMonth(), birth.getDate());
        let diffDays = Math.floor((bd - todayForBirthday) / (1000*60*60*24));
        // 올해 생일이 지났으면 내년 생일 체크 (연말→연초 경계)
        if (diffDays < 0) {
          bd = new Date(nowForBirthday.getFullYear() + 1, birth.getMonth(), birth.getDate());
          diffDays = Math.floor((bd - todayForBirthday) / (1000*60*60*24));
        }
        return diffDays;
      };
      pets.forEach(p => {
        if (!p.birthDate) return;
        // 나이만 입력하면 생일이 'YYYY-01-01' 로 저장된다 — 진짜 생일이 아니므로 1월 1일에 전부 알림이 뜨지 않게 뺀다
        if (p.birthYear && p.birthDate === `${p.birthYear}-01-01`) return;
        // 사망/양도 반려견은 생일 알림에서 제외
        if (p.petStatus && p.petStatus !== 'active') return;
        const diffDays = getBirthdayDaysUntil(p.birthDate);
        if (diffDays >= 0 && diffDays <= 7) {
          const customer = customerMap[p.customerId];
          if (customer) upcomingBirthdays.push({ type: 'pet', name: p.name, ownerName: App.getCustomerLabel(customer, (this._petsByCustomer || {})[customer.id]), phone: customer.phone, daysUntil: diffDays, photo: p.photoThumb || p.photo });
        }
      });
      customers.forEach(c => {
        if (!c.birthday) return;
        const diffDays = getBirthdayDaysUntil(c.birthday);
        if (diffDays >= 0 && diffDays <= 7) {
          upcomingBirthdays.push({ type: 'customer', name: App.getCustomerLabel(c, (this._petsByCustomer || {})[c.id]), ownerName: App.getCustomerLabel(c, (this._petsByCustomer || {})[c.id]), phone: c.phone, daysUntil: diffDays });
        }
      });
      upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

      // Greeting
      const greeting = App.getGreeting();
      const shopName = await DB.getSetting('shopName');

      // Pre-build SMS bodies — 화면에 그려지는 항목만 (재방문 5 + 이탈 10). 이탈 명단은 해가 갈수록 쌓이므로 전체 생성은 금물
      const smsTargets = [...revisitAlerts.slice(0, 5), ...longGoneAlerts.slice(0, 10)];
      for (const a of smsTargets) {
        const smsType = a.visitStatus === 'churned' ? 'churned' : a.visitStatus === 'at-risk' ? 'atRisk' : 'revisit';
        const msg = await App.buildSms(smsType, {
          '고객명': (a.customer && a.customer.name) || '',
          '반려견명': a.pet.name || '',
          '경과일수': String(a.days),
          '마지막방문일': a.pet.lastVisitDate ? App.formatDate(a.pet.lastVisitDate) : ''
        });
        a._smsBody = encodeURIComponent(msg);
      }

      // Pre-build SMS bodies for birthday alerts
      for (const b of upcomingBirthdays) {
        const msg = await App.buildSms('birthday', {
          '고객명': b.ownerName || '',
          '반려견명': b.type === 'pet' ? b.name || '' : ''
        });
        b._smsBody = encodeURIComponent(msg);
      }

      // 월 매출 목표
      const monthlyGoal = Number(await DB.getSetting('monthlyGoal')) || 0;

      // 데이터 보호 알림 — 동기화 중이면 백업 경고 대신 동기화 상태·사진 백업만 (App.getDataSafetyNotice)
      const safety = await App.getDataSafetyNotice();
      const _isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      let backupWarning = '';
      if (safety && safety.kind === 'backup') {
        const _urgent = safety.urgent;
        backupWarning = `
        <div style="background:${_urgent ? 'var(--danger-bg-soft)' : 'var(--warning-light)'};border:1.5px solid ${_urgent ? 'var(--danger)' : 'var(--warning)'};border-radius:var(--radius);padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-size:1.3rem">${App.icon('alert')}</span>
          <div class="flex-1" style="min-width:200px">
            <strong style="color:${_urgent ? 'var(--danger)' : 'var(--warning-text-strong)'}">${_urgent ? '백업 필요 (긴급)' : '백업 알림'}</strong>
            <div style="font-size:0.85rem;margin-top:3px;color:var(--text-secondary)">
              ${safety.days !== null ? `마지막 백업 ${safety.days}일 전.` : '아직 백업하지 않았습니다.'}
              ${_isIOS ? ' iOS는 7일 이상 미사용 시 데이터 자동 삭제 위험.' : ' 폰 분실·고장 대비 데이터 보호 권장.'}
              <a href="#settings" style="color:var(--primary);font-weight:600;white-space:nowrap">기기 간 동기화를 켜면 다른 기기에도 복사돼요 &rarr;</a>
            </div>
          </div>
          <button class="btn btn-sm ${_urgent ? 'btn-danger' : 'btn-warning'}" onclick="App.pages.settings?.directBackup()">지금 백업</button>
        </div>`;
      } else if (safety && safety.kind === 'sync') {
        backupWarning = `
        <div class="safety-note warn">
          ${App.icon('refresh')}
          <div class="flex-1">${safety.days === null ? '아직 클라우드와 동기화되지 않았습니다.' : `${safety.days}일째 클라우드와 동기화되지 않았습니다.`}<br><small>인터넷 연결과 로그인 상태를 확인해주세요.</small></div>
          <button class="btn btn-sm btn-primary" onclick="(async()=>{await Sync.syncNow();App.handleRoute();})()">지금 동기화</button>
        </div>`;
      } else if (safety && safety.kind === 'photo') {
        backupWarning = `
        <div class="safety-note" id="photo-backup-note">
          ${App.icon('image')}
          <div class="flex-1">고객·예약·기록은 클라우드에 보관 중입니다.<br><small>동기화는 복사본이라 실수로 지운 것은 함께 사라져요. 한 달에 한 번 백업(사진 제외)을 권장합니다.</small></div>
          <button class="btn btn-sm btn-secondary" onclick="App.pages.settings?.directBackup()">백업</button>
          <button class="btn btn-sm btn-ghost" aria-label="한 달 동안 숨기기" onclick="try{localStorage.setItem('photoBackupSnoozeUntil',String(Date.now()+30*864e5))}catch(_){};document.getElementById('photo-backup-note')?.remove()">${App.icon('close')}</button>
        </div>`;
      }

      // 아이폰에서 홈 화면에 추가하지 않고 사파리로만 쓰면 7일 미사용 시 iOS 가 저장 데이터를 지울 수 있다 → 한 번 안내 (닫으면 90일 뒤 다시)
      let a2hsNote = '';
      try {
        const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
        const snoozed = Number(localStorage.getItem('a2hsSnoozeUntil') || 0) > Date.now();
        if (_isIOS && !standalone && !snoozed) {
          a2hsNote = `
        <div class="safety-note" id="a2hs-note">
          ${App.icon('bulb')}
          <div class="flex-1"><strong>홈 화면에 추가해서 쓰세요</strong><br><small>사파리 탭으로만 쓰면 7일 동안 안 열었을 때 아이폰이 저장 데이터를 지울 수 있어요. 공유 버튼 → "홈 화면에 추가"</small></div>
          <button class="btn btn-sm btn-ghost" aria-label="닫기" onclick="try{localStorage.setItem('a2hsSnoozeUntil',String(Date.now()+90*864e5))}catch(_){};document.getElementById('a2hs-note')?.remove()">${App.icon('close')}</button>
        </div>`;
        }
      } catch (_) {}
      backupWarning = a2hsNote + backupWarning;

      // Onboarding card for new users (shopName 재사용, services는 기 로드된 배열 길이 사용)
      const shopInfo = shopName;
      const groomersSet = await DB.getSetting('groomers') || [];
      const serviceCount = services.length;
      const onboardingHtml = customerCount === 0 ? `
        <div class="card onboarding-card" style="margin-bottom:20px;border:2px solid var(--primary-lighter);background:linear-gradient(135deg,var(--primary-light),var(--gradient-stop-light))">
          <div class="card-body" style="padding:24px">
            <div style="font-size:1.5rem;margin-bottom:4px">${App.icon('hand')}</div>
            <div style="font-size:1.1rem;font-weight:800;margin-bottom:4px">환영합니다! 시작해볼까요?</div>
            <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:20px">아래 단계를 완료하면 바로 사용할 수 있어요.</p>
            <div style="display:flex;flex-direction:column;gap:10px">
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;${shopInfo ? 'background:var(--success);color:#fff' : 'background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)'}">${shopInfo ? App.icon('check') : '1'}</span>
                <div class="flex-1"><strong>매장 정보 입력</strong><div style="font-size:0.8rem;color:var(--text-muted)">매장명, 전화번호, 주소</div></div>
                ${!shopInfo ? '<a href="#settings" class="btn btn-sm btn-primary">설정</a>' : '<span class="badge badge-success">완료</span>'}
              </div>
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;${groomersSet.length > 0 ? 'background:var(--success);color:#fff' : 'background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)'}">${groomersSet.length > 0 ? App.icon('check') : '2'}</span>
                <div class="flex-1"><strong>미용사 등록</strong><div style="font-size:0.8rem;color:var(--text-muted)">담당 미용사 추가</div></div>
                ${groomersSet.length === 0 ? '<a href="#settings" class="btn btn-sm btn-primary">설정</a>' : '<span class="badge badge-success">완료</span>'}
              </div>
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;${serviceCount > 0 ? 'background:var(--success);color:#fff' : 'background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)'}">${serviceCount > 0 ? App.icon('check') : '3'}</span>
                <div class="flex-1"><strong>서비스 등록</strong><div style="font-size:0.8rem;color:var(--text-muted)">미용 서비스 및 가격 설정</div></div>
                ${serviceCount === 0 ? '<a href="#services" class="btn btn-sm btn-primary">설정</a>' : '<span class="badge badge-success">완료</span>'}
              </div>
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)">4</span>
                <div class="flex-1"><strong>첫 고객 등록</strong><div style="font-size:0.8rem;color:var(--text-muted)">고객과 반려견 정보 추가</div></div>
                <button class="btn btn-sm btn-primary" onclick="App.pages.customers.showForm()">등록</button>
              </div>
              <div style="border-top:1px dashed var(--border);margin-top:12px;padding-top:12px;text-align:center">
                <a href="#settings" style="color:var(--text-muted);font-size:0.85rem">기존 데이터가 있나요? <strong style="color:var(--primary)">백업 파일로 복원하기</strong></a>
              </div>
            </div>
          </div>
        </div>
      ` : '';

      container.innerHTML = `
        <div data-page-root="dashboard"></div>
        <div id="storage-quota-banner"></div>
        ${backupWarning}

        <div class="welcome-section">
          <div class="welcome-title">${greeting}! ${shopName ? App.escapeHtml(shopName) : '펫살롱'}</div>
          <div class="welcome-subtitle">${(() => { const d = new Date(today + 'T00:00:00'); const wd = ['일','월','화','수','목','금','토'][d.getDay()]; return `${d.getMonth()+1}월 ${d.getDate()}일 (${wd})`; })()} &middot; 등록 고객 ${customerCount}명</div>
          ${todayBrief}
        </div>

        ${onboardingHtml}

        <!-- 1. 오늘 예약 — 매일 아침 가장 먼저 봐야 할 정보 -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <span class="card-title">${App.icon('calendar')} 오늘 예약 (${todayAppointments.length}건)</span>
            <a href="#appointments" class="btn btn-sm btn-ghost">전체보기 &rarr;</a>
          </div>
          <div class="card-body ${todayAppointments.length ? 'no-padding' : ''}">
            ${todayAppointments.length === 0 ? `
              <div class="empty-state" style="padding:32px">
                <div class="empty-state-icon">${App.icon('sun','ico-xl')}</div>
                <div class="empty-state-text">오늘은 예약이 없어요</div>
                <button class="btn btn-sm btn-primary" onclick="App.pages.appointments.showForm()">+ 예약 추가</button>
              </div>
            ` : `<div style="padding:16px">${this.renderAppointmentList(todayAppointments, customerMap, petMap, serviceMap)}</div>`}
          </div>
        </div>

        <!-- 2. 매출 요약 (매일 자주 확인하는 정보 — 상단으로 이동) -->
        <div class="stats-grid" style="margin-bottom:20px">
          <div class="stat-card gradient-purple" style="cursor:pointer" onclick="App.pages.records?.showDailyReport()">
            <div class="stat-icon purple">${App.icon('cash')}</div>
            <div>
              <div class="stat-value" style="font-size:1.3rem">${App.formatCurrency(todayRevenue)}</div>
              <div class="stat-label">오늘 매출 (${todayRecords.length}건) &rarr;</div>
            </div>
          </div>
          <a href="#revenue" class="stat-card gradient-green" style="text-decoration:none;color:inherit">
            <div class="stat-icon green">${App.icon('trend')}</div>
            <div>
              <div class="stat-value" style="font-size:1.3rem">${App.formatCurrency(monthRevenue)}</div>
              <div class="stat-label">이번 달 매출 (${monthRecords.length}건) &rarr;</div>
              ${revenueChange !== null ? `<div style="font-size:0.78rem;margin-top:2px;opacity:0.9">전월 동기 대비 ${revenueChange >= 0 ? '+' : ''}${revenueChange}%</div>` : ''}
              ${monthlyGoal > 0 ? (() => {
                const pct = Math.min(Math.round((monthRevenue / monthlyGoal) * 100), 100);
                return '<div style="margin-top:6px"><div style="height:6px;background:rgba(255,255,255,0.3);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--gradient-stop-light);border-radius:3px;transition:width 0.3s"></div></div><div style="font-size:0.78rem;margin-top:2px;opacity:0.9">월 목표 ' + pct + '% (' + App.formatCurrency(monthlyGoal) + ')</div></div>';
              })() : ''}
            </div>
          </a>
        </div>

        <!-- 3. 미수금 (즉시 액션 필요) -->
        ${unpaidRecords.length > 0 ? `
        <div class="card dash-accordion" style="margin-bottom:20px;border:1.5px solid var(--danger)">
          <div class="card-header dash-accordion-toggle" style="background:var(--danger-light);cursor:pointer;user-select:none" data-target="dash-unpaid">
            <span class="card-title text-danger">${App.icon('cash')} 미수금 현황</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-danger">${unpaidRecords.length}건 / ${App.formatCurrency(unpaidTotal)}</span>
              <span class="dash-chevron" style="display:inline-flex;transition:transform 0.2s;font-size:0.8rem">${App.icon('chevron-down')}</span>
            </div>
          </div>
          <div class="card-body" id="dash-unpaid" style="display:${unpaidRecords.length > 0 ? 'block' : 'none'}">
            ${unpaidRecords.length > 10 ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;text-align:right"><a href="#records" style="color:var(--primary)">미수금 전체 ${unpaidRecords.length}건 보기 &rarr;</a></div>` : ''}
            ${unpaidRecords.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10).map(r => {
              const customer = customerMap[r.customerId];
              const pet = petMap[r.petId];
              return `
                <!-- 두 줄 배치: 좁은 화면에서 이름·날짜가 4줄로 쪼개지던 문제 -->
                <div class="alert-item unpaid-item">
                  <div class="unpaid-top">
                    <div class="unpaid-who"><strong>${App.escapeHtml(pet?.name || '-')}</strong> <span>${App.escapeHtml(App.getCustomerLabel(customer))}</span></div>
                    <strong class="unpaid-amount">${App.formatCurrency(App.getRecordAmount(r))}</strong>
                  </div>
                  <div class="unpaid-bottom">
                    <span class="unpaid-date">${App.formatDate(r.date)}</span>
                    <div style="display:flex;gap:4px;flex-shrink:0">
                      ${customer?.phone ? `<a href="tel:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">전화</a><a href="sms:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">문자</a>` : ''}
                      <button class="btn btn-sm btn-success btn-pay-unpaid" data-id="${r.id}" onclick="event.stopPropagation()">결제</button>
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}

        <!-- 내일 예약 리마인더 -->
        ${tomorrowAppts.length > 0 ? `
        <div class="card dash-accordion" style="margin-bottom:20px">
          <div class="card-header dash-accordion-toggle" style="cursor:pointer;user-select:none" data-target="dash-tomorrow-reminder">
            <span class="card-title">내일 예약 리마인더</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-info">${tomorrowAppts.length}건</span>
              ${(() => { const sentCount = tomorrowAppts.filter(a => a.reminderSentAt).length; return sentCount > 0 ? `<span class="badge badge-secondary" style="font-size:0.7rem">${sentCount}건 발송됨</span>` : ''; })()}
              <span class="dash-chevron" style="display:inline-flex;transition:transform 0.2s;font-size:0.8rem">${App.icon('chevron-down')}</span>
            </div>
          </div>
          <div class="card-body" id="dash-tomorrow-reminder" style="padding:0">
            ${['오전', '오후', '저녁', '미정'].map(group => {
              const items = tomorrowGrouped[group];
              if (!items || items.length === 0) return '';
              return `
                <div class="reminder-time-section">
                  <div class="reminder-time-label">${group}</div>
                  ${items.map(a => {
                    const customer = customerMap[a.customerId];
                    const pet = petMap[a.petId];
                    const phoneClean = (customer?.phone || '').replace(/\D/g, '');
                    const noShowCount = noShowCountByCustomer[a.customerId] || 0;
                    const allergies = App.hasPetNote(pet?.allergies) ? App.escapeHtml(pet.allergies) : '';
                    const healthNotes = App.hasPetNote(pet?.healthNotes) ? App.escapeHtml(pet.healthNotes) : '';
                    const temperament = pet?.temperament ? App.escapeHtml(pet.temperament) : '';
                    const photoSrc = pet?.photoThumb || pet?.photo;
                    const sent = !!a.reminderSentAt;
                    const breedSize = [pet?.breed, pet?.weight ? pet.weight + 'kg' : null].filter(Boolean).join(' · ');
                    return `
                      <div class="reminder-item" data-id="${a.id}" style="${sent ? 'opacity:0.55' : ''}">
                        <a href="#pets/${a.petId}" class="reminder-pet-photo" onclick="event.stopPropagation()">
                          ${photoSrc ? `<img src="${App.escapeHtml(photoSrc)}" alt="${App.escapeHtml(pet?.name || '')}">` : `<div class="reminder-pet-placeholder">${App.escapeHtml((pet?.name || '?').charAt(0))}</div>`}
                        </a>
                        <div class="reminder-content">
                          <div class="reminder-line-1">
                            <strong class="reminder-time-num">${a.time || '--:--'}</strong>
                            <a href="#pets/${a.petId}" class="reminder-pet-name" onclick="event.stopPropagation()">${App.escapeHtml(pet?.name || '?')}</a>
                            ${breedSize ? `<span class="reminder-pet-meta">· ${App.escapeHtml(breedSize)}</span>` : ''}
                          </div>
                          <a href="#customers/${a.customerId}" class="reminder-customer" onclick="event.stopPropagation()">${App.escapeHtml(App.getCustomerLabel(customer))}</a>
                          ${(allergies || healthNotes || temperament || noShowCount > 0) ? `
                            <div class="reminder-warnings">
                              ${allergies ? `<span class="reminder-warning"><span class="reminder-warning-icon">${App.icon('alert')}</span> 알레르기: ${allergies}</span>` : ''}
                              ${healthNotes ? `<span class="reminder-warning"><span class="reminder-warning-icon">${App.icon('alert')}</span> ${healthNotes}</span>` : ''}
                              ${temperament ? `<span class="reminder-warning reminder-warning-soft">${temperament}</span>` : ''}
                              ${noShowCount > 0 ? `<span class="reminder-warning reminder-warning-danger"><span class="reminder-warning-icon">${App.icon('alert')}</span> 노쇼 ${noShowCount}회</span>` : ''}
                            </div>
                          ` : ''}
                          <div class="reminder-actions">
                            <button class="btn btn-sm btn-ghost btn-copy-reminder" data-id="${a.id}" data-sms="${App.escapeHtml(a._smsRaw || '')}" onclick="event.stopPropagation()" title="메시지 복사">복사</button>
                            ${phoneClean ? `<a href="sms:${App.escapeHtml(phoneClean)}${App.getSmsSep()}body=${a._smsBody}" class="btn btn-sm btn-success btn-send-reminder" data-id="${a.id}" onclick="event.stopPropagation()">문자</a>` : ''}
                            ${phoneClean ? `<a href="tel:${App.escapeHtml(phoneClean)}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">전화</a>` : ''}
                          </div>
                          ${sent ? `<div class="reminder-sent-badge"><span class="reminder-sent-check">${App.icon('check')}</span> ${App.escapeHtml(a._sentLabel || '발송됨')}</div>` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            }).join('')}
          </div>
        </div>
        ` : ''}

        ${(visitSummary.remind + visitSummary['at-risk'] + visitSummary.churned) > 0 ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('list')} 고객 관리 현황</span>
            <a href="#customers" class="btn btn-sm btn-ghost">전체보기 &rarr;</a>
          </div>
          <div class="card-body" style="padding:16px">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
              <div style="text-align:center;padding:12px;border-radius:var(--radius);background:var(--success-light);cursor:pointer" onclick="sessionStorage.setItem('customer-filter',JSON.stringify({visitStatus:'normal'}));App.navigate('customers')">
                <div style="font-size:1.4rem;font-weight:800;color:var(--success)">${visitSummary.normal}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">정상</div>
              </div>
              <div style="text-align:center;padding:12px;border-radius:var(--radius);background:var(--warning-light);cursor:pointer" onclick="sessionStorage.setItem('customer-filter',JSON.stringify({visitStatus:'remind'}));App.navigate('customers')">
                <div style="font-size:1.4rem;font-weight:800;color:var(--warning)">${visitSummary.remind}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">리마인드</div>
              </div>
              <div style="text-align:center;padding:12px;border-radius:var(--radius);background:${visitSummary['at-risk'] > 0 ? 'var(--danger-bg-soft)' : 'var(--bg)'};cursor:pointer" onclick="sessionStorage.setItem('customer-filter',JSON.stringify({visitStatus:'at-risk'}));App.navigate('customers')">
                <div style="font-size:1.4rem;font-weight:800;color:var(--danger)">${visitSummary['at-risk']}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">이탈위험</div>
              </div>
              <div style="text-align:center;padding:12px;border-radius:var(--radius);background:var(--bg);cursor:pointer" onclick="sessionStorage.setItem('customer-filter',JSON.stringify({visitStatus:'churned'}));App.navigate('customers')">
                <div style="font-size:1.4rem;font-weight:800;color:var(--text-muted)">${visitSummary.churned}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">이탈</div>
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        ${revisitAlerts.length > 0 ? `
        <div class="card dash-accordion" style="margin-bottom:20px">
          <div class="card-header dash-accordion-toggle" style="cursor:pointer;user-select:none" data-target="dash-revisit">
            <span class="card-title">${App.icon('bell')} 재방문 알림</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-warning">${revisitAlerts.length}건</span>
              <span class="dash-chevron" style="display:inline-flex;transition:transform 0.2s;font-size:0.8rem">${App.icon('chevron-down')}</span>
            </div>
          </div>
          <div class="card-body" id="dash-revisit" style="display:${revisitAlerts.length > 0 ? 'block' : 'none'}">
            ${revisitAlerts.slice(0, 5).map(a => {
              const statusLabel = App.getVisitStatusLabel(a.visitStatus);
              const statusBadge = App.getVisitStatusBadge(a.visitStatus);
              // 왜 이 고객이 위에 있는지 보이게 한다 — 순서의 근거를 드러냄
              const churnHint = a.daysUntilChurn <= 14
                ? `<span style="color:var(--danger);font-weight:700">이탈까지 ${a.daysUntilChurn}일</span>`
                : '';
              const smsType = a.visitStatus === 'churned' ? 'churned' : a.visitStatus === 'at-risk' ? 'atRisk' : 'revisit';
              return `
              <div class="alert-item" data-alert-customer="${a.customer.id}">
                <span class="days">${a.days}일</span>
                <div class="flex-1">
                  <strong>${App.escapeHtml(a.pet.name)}</strong>
                  <span style="color:var(--text-muted);font-size:0.8rem">${App.escapeHtml(App.getCustomerLabel(a.customer))}</span>
                  <span class="badge ${statusBadge}" style="font-size:0.72rem;margin-left:4px;padding:3px 8px">${statusLabel}</span>
                  <span class="badge badge-secondary alert-contacted-tag" style="font-size:0.72rem;margin-left:4px;padding:3px 8px;display:none">연락함</span>
                  <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">
                    마지막 미용: ${App.formatDate(a.lastDate)}
                    ${churnHint ? ' | ' + churnHint : ''}
                    ${a.contactedAgo !== null ? ` | <span style="color:var(--text-muted)">${a.contactedAgo}일 전 연락함</span>` : ''}
                  </div>
                </div>
                <div class="alert-item-actions" style="display:flex;gap:4px;flex-shrink:0">
                  <button class="btn btn-sm btn-ghost btn-copy-sms btn-mark-contacted" data-customer-id="${a.customer.id}" data-sms="${App.escapeHtml(decodeURIComponent(a._smsBody))}" onclick="event.stopPropagation()" title="메시지 복사 (카톡용)">복사</button>
                  <a href="sms:${App.escapeHtml((a.customer.phone || '').replace(/\D/g, ''))}${smsSep}body=${a._smsBody}" class="btn btn-sm btn-success btn-mark-contacted" data-customer-id="${a.customer.id}" onclick="event.stopPropagation()" title="문자 보내기">문자</a>
                  <a href="tel:${App.escapeHtml((a.customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary btn-mark-contacted" data-customer-id="${a.customer.id}" onclick="event.stopPropagation()" title="전화 걸기">전화</a>
                  <button class="btn btn-sm btn-primary" onclick="App.pages.appointments.showForm(null, ${a.customer.id}, {petId:${a.pet.id}})" style="flex-shrink:0">예약</button>
                  <button class="btn btn-sm btn-ghost btn-exclude-pet" data-pet-id="${a.pet.id}" data-pet-name="${App.escapeHtml(a.pet.name || '')}" onclick="event.stopPropagation()" title="관리 제외 (이사·사망 등)" style="flex-shrink:0;color:var(--text-muted)">제외</button>
                </div>
              </div>`;
            }).join('')}
            ${revisitAlerts.length > 5 ? `<div style="text-align:center;padding:10px 0 2px;font-size:0.82rem;color:var(--text-muted)">외 ${revisitAlerts.length - 5}건 — 연락하면 다음 고객이 올라옵니다</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${longGoneAlerts.length > 0 ? `
        <div class="card dash-accordion" style="margin-bottom:20px">
          <div class="card-header dash-accordion-toggle" style="cursor:pointer;user-select:none" data-target="dash-longgone">
            <span class="card-title" style="color:var(--text-secondary)">${App.icon('moon')} 장기 미방문</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-secondary">${longGoneAlerts.length}건</span>
              <span class="dash-chevron" style="display:inline-flex;transition:transform 0.2s;font-size:0.8rem">${App.icon('chevron-down')}</span>
            </div>
          </div>
          <div class="card-body" id="dash-longgone" style="display:none">
            <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:10px;line-height:1.5">
              미용 주기의 2배가 지난 고객입니다. 매일 보는 목록에서 분리해 두었습니다.<br>
              다시 안 올 고객은 <strong>제외</strong>로 정리하시면 목록이 계속 쌓이지 않습니다.
            </div>
            ${longGoneAlerts.slice(0, 10).map(a => `
              <div class="alert-item" data-alert-customer="${a.customer.id}">
                <span class="days">${a.days}일</span>
                <div class="flex-1">
                  <strong>${App.escapeHtml(a.pet.name)}</strong>
                  <span style="color:var(--text-muted);font-size:0.8rem">${App.escapeHtml(App.getCustomerLabel(a.customer))}</span>
                  <span class="badge badge-secondary alert-contacted-tag" style="font-size:0.72rem;margin-left:4px;padding:3px 8px;display:none">연락함</span>
                  <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">
                    마지막 미용: ${App.formatDate(a.lastDate)}
                    ${a.contactedAgo !== null ? ` | <span style="color:var(--text-muted)">${a.contactedAgo}일 전 연락함</span>` : ''}
                  </div>
                </div>
                <div class="alert-item-actions" style="display:flex;gap:4px;flex-shrink:0">
                  <button class="btn btn-sm btn-ghost btn-copy-sms btn-mark-contacted" data-customer-id="${a.customer.id}" data-sms="${App.escapeHtml(decodeURIComponent(a._smsBody))}" onclick="event.stopPropagation()" title="메시지 복사 (카톡용)">복사</button>
                  <a href="sms:${App.escapeHtml((a.customer.phone || '').replace(/\D/g, ''))}${smsSep}body=${a._smsBody}" class="btn btn-sm btn-success btn-mark-contacted" data-customer-id="${a.customer.id}" onclick="event.stopPropagation()" title="문자 보내기">문자</a>
                  <button class="btn btn-sm btn-ghost btn-exclude-pet" data-pet-id="${a.pet.id}" data-pet-name="${App.escapeHtml(a.pet.name || '')}" onclick="event.stopPropagation()" title="관리 제외 (이사·사망 등)" style="flex-shrink:0;color:var(--text-muted)">제외</button>
                </div>
              </div>`).join('')}
            ${longGoneAlerts.length > 10 ? `<div style="text-align:center;padding:10px 0 2px;font-size:0.82rem;color:var(--text-muted)">외 ${longGoneAlerts.length - 10}건</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${vipUnvisitedAlerts.length > 0 ? `
        <div class="card dash-accordion" style="margin-bottom:20px;border:1.5px solid var(--warning)">
          <div class="card-header dash-accordion-toggle" style="background:var(--warning-light);cursor:pointer;user-select:none" data-target="dash-vip-unvisited">
            <span class="card-title">${App.icon('crown')} VIP 미방문 (30일+)</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-warning">${vipUnvisitedAlerts.length}명</span>
              <span class="dash-chevron" style="display:inline-flex;transition:transform 0.2s;font-size:0.8rem">${App.icon('chevron-down')}</span>
            </div>
          </div>
          <div class="card-body" id="dash-vip-unvisited" style="display:block">
            ${vipUnvisitedAlerts.slice(0, 5).map(x => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-light)">
                <a href="#customers/${x.customer.id}" style="flex:1;min-width:0;text-decoration:none;color:inherit">
                  <div style="font-weight:700;font-size:0.95rem">${App.escapeHtml(App.getCustomerLabel(x.customer, (this._petsByCustomer || {})[x.customer.id]))}</div>
                  <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">${x.days}일 전 방문${x.customer.phone ? ' · ' + App.formatPhoneHtml(x.customer.phone) : ''}</div>
                </a>
                ${x.customer.phone ? `<a href="tel:${App.escapeHtml((x.customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()" title="전화 걸기" style="flex-shrink:0">전화</a>` : ''}
              </div>
            `).join('')}
            ${vipUnvisitedAlerts.length > 5 ? `<div style="text-align:center;padding:10px 0 0;font-size:0.85rem;color:var(--text-muted)">총 ${vipUnvisitedAlerts.length}명 중 5명 표시</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${upcomingBirthdays.length > 0 ? `
        <div class="card dash-accordion" style="margin-bottom:20px">
          <div class="card-header dash-accordion-toggle" style="cursor:pointer;user-select:none" data-target="dash-birthday">
            <span class="card-title">${App.icon('cake')} 생일 알림</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-info">${upcomingBirthdays.length}건</span>
              <span class="dash-chevron" style="display:inline-flex;transition:transform 0.2s;font-size:0.8rem">${App.icon('chevron-down')}</span>
            </div>
          </div>
          <div class="card-body" id="dash-birthday" style="display:${upcomingBirthdays.length > 0 ? 'block' : 'none'}">
            ${upcomingBirthdays.map(b => {
              const phoneClean = (b.phone || '').replace(/\D/g, '');
              const daysLabel = b.daysUntil === 0 ? '오늘!' : b.daysUntil + '일 후';
              const icon = b.type === 'pet' ? App.icon('paw') : App.icon('user');
              return `
                <div class="alert-item">
                  <div style="display:flex;align-items:center;gap:8px">
                    ${b.photo ? `<img src="${b.photo}" style="width:36px;height:36px;border-radius:10px;object-fit:cover">` : `<span style="font-size:1.3rem">${icon}</span>`}
                    <div>
                      <strong>${App.escapeHtml(b.name)}</strong>
                      ${b.type === 'pet' ? `<span style="color:var(--text-muted);font-size:0.8rem"> (${App.escapeHtml(b.ownerName)}님)</span>` : ''}
                      <div style="font-size:0.78rem;color:var(--primary);font-weight:700">${daysLabel}</div>
                    </div>
                  </div>
                  <div style="display:flex;gap:4px;flex-shrink:0;margin-left:auto">
                    ${phoneClean ? `<a href="sms:${App.escapeHtml(phoneClean)}${smsSep}body=${b._smsBody}" class="btn btn-sm btn-success" onclick="event.stopPropagation()">축하 문자</a>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}

      `;

      // Storage quota monitoring (async, non-blocking)
      DB.checkStorageQuota().then(quota => {
        if (quota && quota.percentage > 80) {
          const banner = document.getElementById('storage-quota-banner');
          if (banner) {
            const usedMB = (quota.used / (1024 * 1024)).toFixed(1);
            const quotaMB = (quota.quota / (1024 * 1024)).toFixed(0);
            banner.innerHTML = `
              <div style="background:${quota.percentage > 95 ? 'var(--danger-light)' : 'var(--warning-light)'};border:1px solid ${quota.percentage > 95 ? 'var(--danger)' : 'var(--warning)'};border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
                <span style="font-size:1.3rem">${App.icon('alert')}</span>
                <div class="flex-1">
                  <strong>${quota.percentage > 95 ? '저장 공간 부족!' : '저장 공간 경고'}</strong>:
                  ${usedMB}MB / ${quotaMB}MB 사용 중 (${quota.percentage}%).
                  ${quota.percentage > 95 ? ' 데이터 백업 후 오래된 사진을 삭제해주세요.' : ' 정기적으로 백업하시기 바랍니다.'}
                </div>
                <a href="#settings" class="btn btn-sm ${quota.percentage > 95 ? 'btn-danger' : 'btn-warning'}">데이터 관리</a>
              </div>`;
          }
        }
      }).catch(() => {});
    } catch (err) {
      console.error('Dashboard render error:', err);
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${App.icon('alert','ico-xl')}</div>
          <div class="empty-state-text">대시보드를 불러오는 중 오류가 발생했습니다.<br><small style="color:var(--text-muted)">${App.escapeHtml(err.message || '')}</small></div>
          <button class="btn btn-primary" onclick="App.navigate('dashboard')">다시 시도</button>
        </div>`;
    }
  },

  renderAppointmentList(appointments, customerMap, petMap, serviceMap) {
    return appointments.map(appt => {
      const customer = customerMap[appt.customerId];
      const pet = petMap[appt.petId];
      const serviceNames = (appt.serviceIds || []).map(id => serviceMap[id] || '').filter(Boolean).join(', ');
      const dateLabel = appt.date === App.getToday() ? '' : `<span style="color:var(--text-muted);font-size:0.78rem">${App.formatDate(appt.date)}</span> `;
      return `
        <div class="appointment-item" style="cursor:pointer" onclick="App.navigate('appointments')">
          <div class="appointment-time">${appt.time || '--:--'}</div>
          <div class="appointment-info">
            <div class="name">${dateLabel}<a href="#pets/${appt.petId}" onclick="event.stopPropagation()" style="color:inherit;font-weight:700">${App.escapeHtml(pet?.name || '?')}</a> <a href="#customers/${appt.customerId}" onclick="event.stopPropagation()" class="appt-guardian">${App.escapeHtml(App.getCustomerLabel(customer))}</a></div>
            <div class="detail">${App.escapeHtml(serviceNames || '서비스 미지정')}${appt.groomer ? ' &middot; ' + App.escapeHtml(appt.groomer) : ''}</div>
            ${(() => { const w = [pet?.temperament, pet?.healthNotes, pet?.allergies].filter(Boolean); if (!w.length) return ''; const s = w.join(', '); return '<div style="font-size:0.75rem;color:var(--danger);margin-top:2px">' + App.icon('alert') + ' ' + App.escapeHtml(s.length > 50 ? s.slice(0, 50) + '...' : s) + '</div>'; })()}
          </div>
          <div style="flex-shrink:0;display:flex;align-items:center;gap:4px">
            ${customer?.phone ? `<a href="tel:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()" style="min-width:36px" aria-label="전화">${App.icon('phone')}</a>` : ''}
            <span class="badge badge-${this.getStatusBadge(appt.status)}">${this.getStatusLabel(appt.status)}</span>
          </div>
        </div>
        ${appt.status !== 'completed' ? `<div style="margin-top:8px;display:flex;gap:6px">
          <button class="btn btn-sm btn-success" onclick="event.stopPropagation();App.pages.appointments.completeToRecord(${appt.id})" style="flex:1;min-height:40px;font-size:0.88rem">${App.icon('scissors')} 미용 완료</button>
        </div>` : App.apptResultHtml(appt, (this._apptRecMap || {})[String(appt.id)])}
      `;
    }).join('');
  },

  getStatusLabel(status) {
    const labels = { pending: '대기', confirmed: '확정', in_progress: '미용중', completed: '완료', cancelled: '취소', noshow: '노쇼' };
    return labels[status] || status || '대기';
  },

  getStatusBadge(status) {
    const badges = { pending: 'warning', confirmed: 'primary', in_progress: 'info', completed: 'success', cancelled: 'secondary', noshow: 'danger' };
    return badges[status] || 'warning';
  },

  async init() {
    // Accordion toggles for alert sections (localStorage로 펼침 상태 유지)
    document.querySelectorAll('.dash-accordion-toggle').forEach(header => {
      const targetId = header.dataset.target;
      const body = document.getElementById(targetId);
      if (!body) return;
      // 저장된 상태 복원 (기본: 펼침)
      const savedState = localStorage.getItem('dashAccordion-' + targetId);
      if (savedState === 'closed') {
        body.style.display = 'none';
      }
      const chevron = header.querySelector('.dash-chevron');
      if (chevron && body.style.display !== 'none') {
        chevron.style.transform = 'rotate(180deg)';
      }
      header.addEventListener('click', () => {
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
        localStorage.setItem('dashAccordion-' + targetId, isOpen ? 'closed' : 'open');
      });
    });

    // SMS copy buttons
    document.querySelectorAll('.btn-copy-sms').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.sms || '';
        navigator.clipboard.writeText(msg).then(() => {
          App.showToast('메시지가 복사되었습니다.');
        }).catch(() => {
          App.showToast('복사에 실패했습니다.', 'error');
        });
      });
    });

    // 재방문 알림 — 복사/문자/전화를 누르면 '연락함'으로 기록하고 유예 기간 동안 목록에서 내린다.
    // (연락이라는 행동이 목록을 바꾸지 못해 알림이 계속 쌓이던 문제)
    document.querySelectorAll('.btn-mark-contacted').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = Number(btn.dataset.customerId);
        if (cid) App.pages.dashboard._markContacted(cid);
      });
    });

    // 재방문 알림 — 관리 제외 (이사·사망 등으로 다시 오지 않는 고객)
    document.querySelectorAll('.btn-exclude-pet').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = Number(btn.dataset.petId);
        if (pid) App.pages.dashboard._excludePet(pid, btn.dataset.petName || '');
      });
    });

    // 내일 예약 리마인더 — 메시지 복사
    document.querySelectorAll('.btn-copy-reminder').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.dataset.sms || '';
        navigator.clipboard.writeText(msg).then(() => {
          App.showToast('리마인더 메시지가 복사되었습니다');
        }).catch(() => {
          App.showToast('복사에 실패했습니다.', 'error');
        });
      });
    });

    // 내일 예약 리마인더 — 문자 발송 트래킹
    // sms: URL 클릭 시 발송 시도로 간주 (실제 발송 여부는 사장님이 SMS 앱에서 결정)
    document.querySelectorAll('.btn-send-reminder').forEach(btn => {
      btn.addEventListener('click', async () => {
        const apptId = Number(btn.dataset.id);
        try {
          const appt = await DB.get('appointments', apptId);
          if (appt) {
            appt.reminderSentAt = new Date().toISOString();
            await DB.update('appointments', appt);
            // 즉시 UI 반영 (페이지 재렌더는 사용자가 다시 진입할 때)
            App._dashboardDirty = true;
          }
        } catch (e) {
          console.warn('리마인더 발송 트래킹 실패:', e);
        }
      });
    });

    // 미수금 '결제' 버튼은 App.setupApptResultActions 가 문서 전체에서 처리한다 (예약 카드와 공용)
  }
};
