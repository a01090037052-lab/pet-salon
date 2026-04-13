// ========== Dashboard Page ==========
App.pages.dashboard = {

  _computeRevisitAlerts(pets, customerMap, revisitDays) {
    // pets의 lastVisitDate를 직접 사용 (records 전체 로드 불필요)
    const alerts = [];
    pets.forEach(pet => {
      if (!pet.lastVisitDate) return;
      if (pet.petStatus && pet.petStatus !== 'active') return;
      const days = App.getDaysAgo(pet.lastVisitDate);
      if (days === null) return;
      const cycleDays = pet.groomingCycle || revisitDays;
      if (days >= cycleDays) {
        const customer = customerMap[pet.customerId];
        if (customer) {
          const visitStatus = App.classifyVisitStatus(pet.lastVisitDate, cycleDays);
          alerts.push({ pet, customer, days, lastDate: pet.lastVisitDate, cycleDays, visitStatus });
        }
      }
    });
    return alerts.sort((a, b) => b.days - a.days);
  },

  // 전체 고객의 방문 상태 요약 (대시보드 카드용)
  _computeVisitStatusSummary(pets, customerMap, revisitDays) {
    const summary = { normal: 0, remind: 0, 'at-risk': 0, churned: 0 };
    // 고객별로 가장 최근 방문한 반려견 기준으로 상태 판정
    const customerBestStatus = {};
    const statusPriority = { normal: 0, remind: 1, 'at-risk': 2, churned: 3 };
    pets.forEach(pet => {
      if (pet.petStatus && pet.petStatus !== 'active') return;
      const customer = customerMap[pet.customerId];
      if (!customer) return;
      const cycleDays = pet.groomingCycle || revisitDays;
      const status = App.classifyVisitStatus(pet.lastVisitDate, cycleDays);
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
    // Skip re-render if recent and no data changed
    if (this._lastRender && Date.now() - this._lastRender < 5000 && !App._dashboardDirty) {
      return;
    }
    this._lastRender = Date.now();
    App._dashboardDirty = false;

    try {
      const smsSep = App.getSmsSep();
      const today = App.getToday();
      const thisMonth = today.slice(0, 7);
      const lastMonthDate = new Date();
      lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
      const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

      // Load only what's needed for today's view
      const twoMonthsAgo = new Date();
      twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
      const twoMonthsAgoStr = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;

      const [customers, pets, todayAppointmentsRaw, recentRecords, services, customerCount] = await Promise.all([
        DB.getAllLight('customers', ['memo']),
        DB.getAllLight('pets', ['preferredStyle']),
        DB.getByIndex('appointments', 'date', today),
        DB.getByDateRange('records', 'date', twoMonthsAgoStr, today),
        DB.getAll('services'),
        DB.count('customers')
      ]);

      // 미수금 조회: 금액 계산에 필요한 최소 필드만 로드
      const allRecordsMin = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo', 'serviceIds', 'groomer', 'nextVisitDate', 'appointmentId']);
      const unpaidRecords = allRecordsMin.filter(r => r.paymentMethod === 'unpaid');
      const unpaidTotal = unpaidRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      // Build lookup maps once
      const customerMap = {};
      customers.forEach(c => { customerMap[c.id] = c; });
      const petMap = {};
      pets.forEach(p => { petMap[p.id] = p; });
      const serviceMap = {};
      services.forEach(s => { serviceMap[s.id] = s.name; });

      const todayAppointments = todayAppointmentsRaw
        .filter(a => a.status !== 'cancelled')
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const monthRecords = recentRecords.filter(r => r.date && r.date.startsWith(thisMonth));
      const monthRevenue = monthRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      // Last month revenue for comparison
      const lastMonthRevenue = recentRecords
        .filter(r => r.date && r.date.startsWith(lastMonth))
        .reduce((sum, r) => sum + App.getRecordAmount(r), 0);
      const revenueChange = lastMonthRevenue > 0 ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : null;

      // Today's revenue
      const todayRecords = recentRecords.filter(r => r.date === today);
      const todayRevenue = todayRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      // Revisit alerts (pets의 lastVisitDate 사용, records 전체 로드 불필요)
      const revisitDays = await DB.getSetting('revisitDays') || 30;
      const revisitAlerts = this._computeRevisitAlerts(pets, customerMap, revisitDays);

      // 고객 방문 상태 요약
      const visitSummary = this._computeVisitStatusSummary(pets, customerMap, revisitDays);

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
        const diffDays = getBirthdayDaysUntil(p.birthDate);
        if (diffDays >= 0 && diffDays <= 7) {
          const customer = customerMap[p.customerId];
          if (customer) upcomingBirthdays.push({ type: 'pet', name: p.name, ownerName: App.getCustomerLabel(customer), phone: customer.phone, daysUntil: diffDays, photo: p.photo });
        }
      });
      customers.forEach(c => {
        if (!c.birthday) return;
        const diffDays = getBirthdayDaysUntil(c.birthday);
        if (diffDays >= 0 && diffDays <= 7) {
          upcomingBirthdays.push({ type: 'customer', name: App.getCustomerLabel(c), ownerName: App.getCustomerLabel(c), phone: c.phone, daysUntil: diffDays });
        }
      });
      upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

      // Greeting
      const greeting = App.getGreeting();
      const shopName = await DB.getSetting('shopName');

      // Pre-build SMS bodies for revisit alerts (상태별 템플릿 사용)
      for (const a of revisitAlerts) {
        const smsType = a.visitStatus === 'churned' ? 'churned' : a.visitStatus === 'at-risk' ? 'atRisk' : 'revisit';
        const msg = await App.buildSms(smsType, {
          '고객명': App.getCustomerLabel(a.customer),
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

      // Auto-backup warning
      const needsBackup = await App.checkBackup();
      const lastBackupDate = await DB.getSetting('lastBackupDate');
      const backupDays = lastBackupDate ? App.getDaysAgo(lastBackupDate) : null;
      const backupWarning = needsBackup ? `
        <div style="background:var(--warning-light);border:1px solid var(--warning);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
          <span style="font-size:1.3rem">&#x26A0;</span>
          <div class="flex-1">
            <strong>백업 알림</strong>: ${backupDays !== null ? `마지막 백업 후 ${backupDays}일 경과.` : '아직 백업하지 않았습니다.'} 데이터 안전을 위해 백업해주세요.
          </div>
          <button class="btn btn-sm btn-warning" onclick="App.pages.settings?.directBackup()">백업하기</button>
        </div>
      ` : '';

      // Onboarding card for new users
      const shopInfo = await DB.getSetting('shopName');
      const groomersSet = await DB.getSetting('groomers') || [];
      const serviceCount = await DB.count('services');
      const onboardingHtml = customerCount === 0 ? `
        <div class="card onboarding-card" style="margin-bottom:20px;border:2px solid var(--primary-lighter);background:linear-gradient(135deg,var(--primary-light),#fff)">
          <div class="card-body" style="padding:24px">
            <div style="font-size:1.5rem;margin-bottom:4px">&#x1F44B;</div>
            <div style="font-size:1.1rem;font-weight:800;margin-bottom:4px">환영합니다! 시작해볼까요?</div>
            <p style="color:var(--text-secondary);font-size:0.88rem;margin-bottom:20px">아래 단계를 완료하면 바로 사용할 수 있어요.</p>
            <div style="display:flex;flex-direction:column;gap:10px">
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;${shopInfo ? 'background:var(--success);color:#fff' : 'background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)'}">${shopInfo ? '&#x2713;' : '1'}</span>
                <div class="flex-1"><strong>매장 정보 입력</strong><div style="font-size:0.8rem;color:var(--text-muted)">매장명, 전화번호, 주소</div></div>
                ${!shopInfo ? '<a href="#settings" class="btn btn-sm btn-primary">설정</a>' : '<span class="badge badge-success">완료</span>'}
              </div>
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;${groomersSet.length > 0 ? 'background:var(--success);color:#fff' : 'background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)'}">${groomersSet.length > 0 ? '&#x2713;' : '2'}</span>
                <div class="flex-1"><strong>미용사 등록</strong><div style="font-size:0.8rem;color:var(--text-muted)">담당 미용사 추가</div></div>
                ${groomersSet.length === 0 ? '<a href="#settings" class="btn btn-sm btn-primary">설정</a>' : '<span class="badge badge-success">완료</span>'}
              </div>
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;${serviceCount > 0 ? 'background:var(--success);color:#fff' : 'background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)'}">${serviceCount > 0 ? '&#x2713;' : '3'}</span>
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
        ${backupWarning}

        <div class="welcome-section">
          <div class="welcome-title">${greeting}! ${shopName ? App.escapeHtml(shopName) : '&#x2702; 펫살롱'}</div>
          <div class="welcome-subtitle">${today} &middot; 오늘 예약 ${todayAppointments.length}건${monthRecords.length > 0 ? ' &middot; 이번 달 미용 ' + monthRecords.length + '건' : ''} &middot; 고객 ${customerCount}명</div>
        </div>

        ${onboardingHtml}

        <div class="stats-grid">
          <a href="#appointments" class="stat-card gradient-blue" style="text-decoration:none;color:inherit">
            <div class="stat-icon blue">&#x1F4C5;</div>
            <div>
              <div class="stat-value">${todayAppointments.length}<span style="font-size:0.9rem;font-weight:500;color:var(--text-secondary)">건</span></div>
              <div class="stat-label">오늘 예약 &rarr;</div>
              ${todayAppointments.length > 0 ? `<div style="margin-top:6px;font-size:0.72rem;color:var(--text-secondary);line-height:1.4">${todayAppointments.slice(0, 3).map(a => {
                const p = petMap[a.petId];
                return (a.time || '--:--') + ' ' + App.escapeHtml(p?.name || '?');
              }).join('<br>')}${todayAppointments.length > 3 ? '<br>...' : ''}</div>` : ''}
            </div>
          </a>
          <div class="stat-card gradient-purple" style="cursor:pointer" onclick="App.pages.records?.showDailyReport()">
            <div class="stat-icon purple">&#x1F4B5;</div>
            <div>
              <div class="stat-value" style="font-size:1.3rem">${App.formatCurrency(todayRevenue)}</div>
              <div class="stat-label">오늘 매출 (${todayRecords.length}건) &rarr;</div>
              ${monthlyGoal > 0 ? (() => {
                const pct = Math.min(Math.round((monthRevenue / monthlyGoal) * 100), 100);
                return '<div style="margin-top:6px"><div style="height:6px;background:rgba(255,255,255,0.3);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#fff;border-radius:3px;transition:width 0.3s"></div></div><div style="font-size:0.7rem;margin-top:2px;opacity:0.9">월 목표 ' + pct + '% (' + App.formatCurrency(monthlyGoal) + ')</div></div>';
              })() : ''}
            </div>
          </div>
        </div>

        <!-- 오늘 예약 목록 -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4C5; 오늘 예약 (${todayAppointments.length}건)</span>
            <a href="#appointments" class="btn btn-sm btn-ghost">전체보기 &rarr;</a>
          </div>
          <div class="card-body ${todayAppointments.length ? 'no-padding' : ''}">
            ${todayAppointments.length === 0 ? `
              <div class="empty-state" style="padding:32px">
                <div class="empty-state-icon">&#x2600;</div>
                <div class="empty-state-text">오늘은 예약이 없어요</div>
                <button class="btn btn-sm btn-primary" onclick="App.pages.appointments.showForm()">+ 예약 추가</button>
              </div>
            ` : `<div style="padding:16px">${this.renderAppointmentList(todayAppointments, customerMap, petMap, serviceMap)}</div>`}
          </div>
        </div>

        <!-- 알림 섹션 (데이터가 있을 때만 렌더) -->

        ${unpaidRecords.length > 0 ? `
        <div class="card dash-accordion" style="margin-bottom:20px;border:1.5px solid var(--danger)">
          <div class="card-header dash-accordion-toggle" style="background:var(--danger-light);cursor:pointer;user-select:none" data-target="dash-unpaid">
            <span class="card-title text-danger">&#x1F4B8; 미수금 현황</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-danger">${unpaidRecords.length}건 / ${App.formatCurrency(unpaidTotal)}</span>
              <span class="dash-chevron" style="transition:transform 0.2s;font-size:0.8rem">&#x25BC;</span>
            </div>
          </div>
          <div class="card-body" id="dash-unpaid" style="display:${unpaidRecords.length > 0 ? 'block' : 'none'}">
            ${unpaidRecords.length > 10 ? `<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:8px;text-align:right"><a href="#records" style="color:var(--primary)">미수금 전체 ${unpaidRecords.length}건 보기 &rarr;</a></div>` : ''}
            ${unpaidRecords.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10).map(r => {
              const customer = customerMap[r.customerId];
              const pet = petMap[r.petId];
              return `
                <div class="alert-item">
                  <span style="font-weight:700;color:var(--danger)">${App.formatCurrency(App.getRecordAmount(r))}</span>
                  <div class="flex-1">
                    <strong>${App.escapeHtml(pet?.name || '-')}</strong>
                    <span style="color:var(--text-muted);font-size:0.8rem">${App.escapeHtml(App.getCustomerLabel(customer))}</span>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">${App.formatDate(r.date)}</div>
                  </div>
                  <div style="display:flex;gap:4px;flex-shrink:0">
                    ${customer?.phone ? `<a href="tel:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">전화</a><a href="sms:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">문자</a>` : ''}
                    <button class="btn btn-sm btn-success btn-pay-unpaid" data-id="${r.id}" onclick="event.stopPropagation()">결제</button>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}

        ${(visitSummary.remind + visitSummary['at-risk'] + visitSummary.churned) > 0 ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4CB; 고객 관리 현황</span>
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
              <div style="text-align:center;padding:12px;border-radius:var(--radius);background:${visitSummary['at-risk'] > 0 ? '#FEE2E2' : 'var(--bg)'};cursor:pointer" onclick="sessionStorage.setItem('customer-filter',JSON.stringify({visitStatus:'at-risk'}));App.navigate('customers')">
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
            <span class="card-title">&#x1F514; 재방문 알림</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-warning">${revisitAlerts.length}건</span>
              <span class="dash-chevron" style="transition:transform 0.2s;font-size:0.8rem">&#x25BC;</span>
            </div>
          </div>
          <div class="card-body" id="dash-revisit" style="display:${revisitAlerts.length > 0 ? 'block' : 'none'}">
            ${revisitAlerts.slice(0, 8).map(a => {
              const statusLabel = App.getVisitStatusLabel(a.visitStatus);
              const statusBadge = App.getVisitStatusBadge(a.visitStatus);
              const smsType = a.visitStatus === 'churned' ? 'churned' : a.visitStatus === 'at-risk' ? 'atRisk' : 'revisit';
              return `
              <div class="alert-item">
                <span class="days">${a.days}일</span>
                <div class="flex-1">
                  <strong>${App.escapeHtml(a.pet.name)}</strong>
                  <span style="color:var(--text-muted);font-size:0.8rem">${App.escapeHtml(App.getCustomerLabel(a.customer))}</span>
                  <span class="badge ${statusBadge}" style="font-size:0.65rem;margin-left:4px">${statusLabel}</span>
                  <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">
                    마지막 미용: ${App.formatDate(a.lastDate)}
                    ${a.pet.groomingCycle ? ' | 미용 주기 ' + a.cycleDays + '일 초과' : ''}
                  </div>
                </div>
                <div class="alert-item-actions" style="display:flex;gap:4px;flex-shrink:0">
                  <button class="btn btn-sm btn-ghost btn-copy-sms" data-sms="${App.escapeHtml(decodeURIComponent(a._smsBody))}" onclick="event.stopPropagation()" title="메시지 복사 (카톡용)">복사</button>
                  <a href="sms:${App.escapeHtml((a.customer.phone || '').replace(/\D/g, ''))}${smsSep}body=${a._smsBody}" class="btn btn-sm btn-success" onclick="event.stopPropagation()" title="문자 보내기">문자</a>
                  <a href="tel:${App.escapeHtml((a.customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()" title="전화 걸기">전화</a>
                  <button class="btn btn-sm btn-primary" onclick="App.pages.appointments.showForm(null, ${a.customer.id}, {petId:${a.pet.id}})" style="flex-shrink:0">예약</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}

        ${upcomingBirthdays.length > 0 ? `
        <div class="card dash-accordion" style="margin-bottom:20px">
          <div class="card-header dash-accordion-toggle" style="cursor:pointer;user-select:none" data-target="dash-birthday">
            <span class="card-title">&#x1F382; 생일 알림</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-info">${upcomingBirthdays.length}건</span>
              <span class="dash-chevron" style="transition:transform 0.2s;font-size:0.8rem">&#x25BC;</span>
            </div>
          </div>
          <div class="card-body" id="dash-birthday" style="display:${upcomingBirthdays.length > 0 ? 'block' : 'none'}">
            ${upcomingBirthdays.map(b => {
              const phoneClean = (b.phone || '').replace(/\D/g, '');
              const daysLabel = b.daysUntil === 0 ? '오늘!' : b.daysUntil + '일 후';
              const icon = b.type === 'pet' ? '&#x1F436;' : '&#x1F464;';
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

        <div id="storage-quota-banner"></div>
      `;

      // Storage quota monitoring (async, non-blocking)
      DB.checkStorageQuota().then(quota => {
        if (quota && quota.percentage > 80) {
          const banner = document.getElementById('storage-quota-banner');
          if (banner) {
            const usedMB = (quota.used / (1024 * 1024)).toFixed(1);
            const quotaMB = (quota.quota / (1024 * 1024)).toFixed(0);
            banner.innerHTML = `
              <div style="background:${quota.percentage > 95 ? 'var(--danger-light)' : 'var(--warning-light)'};border:1px solid ${quota.percentage > 95 ? 'var(--danger)' : 'var(--warning)'};border-radius:var(--radius);padding:12px 16px;margin-top:16px;display:flex;align-items:center;gap:12px">
                <span style="font-size:1.3rem">${quota.percentage > 95 ? '&#x1F6A8;' : '&#x26A0;'}</span>
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
          <div class="empty-state-icon">&#x26A0;</div>
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
            <div class="name">${dateLabel}<a href="#customers/${appt.customerId}" onclick="event.stopPropagation()" style="color:inherit;font-weight:700">${App.escapeHtml(App.getCustomerLabel(customer))}</a> <span style="color:var(--text-muted)">/</span> <a href="#pets/${appt.petId}" onclick="event.stopPropagation()" style="color:inherit">${App.escapeHtml(pet?.name || '?')}</a></div>
            <div class="detail">${App.escapeHtml(serviceNames || '서비스 미지정')}${appt.groomer ? ' &middot; ' + App.escapeHtml(appt.groomer) : ''}</div>
            ${(() => { const w = [pet?.temperament, pet?.healthNotes, pet?.allergies].filter(Boolean); if (!w.length) return ''; const s = w.join(', '); return '<div style="font-size:0.75rem;color:var(--danger);margin-top:2px">&#x26A0; ' + App.escapeHtml(s.length > 50 ? s.slice(0, 50) + '...' : s) + '</div>'; })()}
          </div>
          <div style="flex-shrink:0;display:flex;align-items:center;gap:4px">
            ${customer?.phone ? `<a href="tel:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()" style="min-width:36px">&#x1F4DE;</a>` : ''}
            <span class="badge badge-${this.getStatusBadge(appt.status)}">${this.getStatusLabel(appt.status)}</span>
          </div>
        </div>
        ${appt.status !== 'completed' ? `<div style="margin-top:8px;display:flex;gap:6px">
          <button class="btn btn-sm btn-success" onclick="event.stopPropagation();App.pages.appointments.completeToRecord(${appt.id})" style="flex:1;min-height:40px;font-size:0.88rem">&#x2702; 미용 완료</button>
        </div>` : ''}
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
    // Accordion toggles for alert sections
    document.querySelectorAll('.dash-accordion-toggle').forEach(header => {
      // Set initial chevron state for sections that start open
      const targetId = header.dataset.target;
      const body = document.getElementById(targetId);
      if (body && body.style.display !== 'none') {
        const chevron = header.querySelector('.dash-chevron');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
      }
      header.addEventListener('click', () => {
        const targetId = header.dataset.target;
        const body = document.getElementById(targetId);
        if (!body) return;
        const isOpen = body.style.display !== 'none';
        body.style.display = isOpen ? 'none' : 'block';
        const chevron = header.querySelector('.dash-chevron');
        if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
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

    // Unpaid record payment buttons
    document.querySelectorAll('.btn-pay-unpaid').forEach(btn => {
      btn.addEventListener('click', async () => {
        const recordId = Number(btn.dataset.id);
        App.showModal({
          title: '결제 완료 처리',
          content: `
            <div class="form-group">
              <label class="form-label">결제 수단을 선택하세요</label>
              <select id="f-pay-method">
                <option value="cash">현금</option>
                <option value="card">카드</option>
                <option value="transfer">계좌이체</option>
              </select>
            </div>
          `,
          saveText: '결제 완료',
          onSave: async () => {
            const method = document.getElementById('f-pay-method').value;
            try {
              const record = await DB.get('records', recordId);
              if (record) {
                record.paymentMethod = method;
                await DB.update('records', record);
                App.showToast('결제가 완료 처리되었습니다.');
                App.closeModal();
                App.handleRoute();
              }
            } catch (err) {
              console.error('Payment update error:', err);
              App.showToast('처리 중 오류가 발생했습니다.', 'error');
            }
          }
        });
      });
    });
  }
};
