// ========== Dashboard Page ==========
App.pages.dashboard = {
  async render(container) {
    try {
      const today = App.getToday();
      const thisMonth = today.slice(0, 7);
      const lastMonthDate = new Date();
      lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
      const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

      // Efficient queries: only load what's needed
      // - Last 6 months of records (for charts), not ALL records
      // - Today's appointments via index, not ALL appointments
      // - Customers/pets lightweight (no photos), services are small
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const sixMonthsAgoStr = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`;

      // Next 7 days end date for upcoming appointments
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = App.formatLocalDate(nextWeek);

      const [customers, pets, todayAppointmentsRaw, upcomingApptsRaw, recentRecords, services, customerCount, petCount] = await Promise.all([
        DB.getAllLight('customers', ['memo']),
        DB.getAllLight('pets', ['photo', 'preferredStyle']),
        DB.getByIndex('appointments', 'date', today),
        DB.getByDateRange('appointments', 'date', today, nextWeekStr),
        DB.getByDateRange('records', 'date', sixMonthsAgoStr, today),
        DB.getAll('services'),
        DB.count('customers'),
        DB.count('pets')
      ]);

      // Also load all records for revisit alerts (needs full history per pet)
      // We use recentRecords (6 months) for charts, but need all records for revisit tracking
      const allRecords = await DB.getAll('records');

      // Build lookup maps once -- no DB.get() inside loops
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

      // Groomer revenue this month
      const groomerRevenue = {};
      monthRecords.forEach(r => {
        const name = r.groomer || '미지정';
        groomerRevenue[name] = (groomerRevenue[name] || 0) + App.getRecordAmount(r);
      });
      const groomerList = Object.entries(groomerRevenue).sort((a, b) => b[1] - a[1]);

      // This week revenue (Mon-Sun)
      const nowDate = new Date();
      const dayOfWeek = nowDate.getDay(); // 0=Sun, 1=Mon...
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(nowDate);
      monday.setDate(nowDate.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);

      const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
      const weeklyData = [];
      let weekTotal = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayRev = recentRecords
          .filter(r => r.date === dateStr)
          .reduce((sum, r) => sum + App.getRecordAmount(r), 0);
        weeklyData.push({ label: dayLabels[i], date: dateStr, rev: dayRev });
        weekTotal += dayRev;
      }
      const maxWeekRev = Math.max(...weeklyData.map(d => d.rev), 1);

      // Last 6 months revenue for chart (using recentRecords which covers 6 months)
      const monthlyRevenue = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${d.getMonth() + 1}월`;
        const rev = recentRecords
          .filter(r => r.date && r.date.startsWith(key))
          .reduce((sum, r) => sum + App.getRecordAmount(r), 0);
        monthlyRevenue.push({ key, label, rev });
      }
      const maxRev = Math.max(...monthlyRevenue.map(m => m.rev), 1);

      // Revisit alerts — use petMap and customerMap, no individual DB.get()
      // Uses allRecords since revisit needs full history per pet
      const revisitDays = await DB.getSetting('revisitDays') || 30;
      const petLastVisit = {};
      allRecords.forEach(r => {
        if (!petLastVisit[r.petId] || (r.date || '') > (petLastVisit[r.petId].date || '')) {
          petLastVisit[r.petId] = r;
        }
      });
      const revisitAlerts = [];
      for (const [petId, record] of Object.entries(petLastVisit)) {
        const days = App.getDaysAgo(record.date);
        const pet = petMap[Number(petId)];
        const cycleDays = (pet && pet.groomingCycle) ? pet.groomingCycle : revisitDays;
        if (days >= cycleDays) {
          const customer = pet ? customerMap[pet.customerId] : null;
          if (pet && customer) {
            revisitAlerts.push({ pet, customer, days, lastDate: record.date, cycleDays });
          }
        }
      }
      revisitAlerts.sort((a, b) => b.days - a.days);

      // 고객 만족도 '불만' 관리 필요 고객
      const dissatisfiedCustomers = [];
      const customerLastRecord = {};
      allRecords.forEach(r => {
        if (!customerLastRecord[r.customerId] || (r.date || '') > (customerLastRecord[r.customerId].date || '')) {
          customerLastRecord[r.customerId] = r;
        }
      });
      for (const [cid, rec] of Object.entries(customerLastRecord)) {
        if (rec.satisfaction === 'bad') {
          const customer = customerMap[Number(cid)];
          if (customer) {
            dissatisfiedCustomers.push({ customer, record: rec, pet: petMap[rec.petId] });
          }
        }
      }

      // 미수금(외상) 집계
      const unpaidRecords = allRecords.filter(r => r.paymentMethod === 'unpaid');
      const unpaidTotal = unpaidRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

      // 생일 알림 (7일 이내)
      const upcomingBirthdays = [];
      const nowForBirthday = new Date();
      // 반려견 생일
      pets.forEach(p => {
        if (!p.birthDate) return;
        const birth = new Date(p.birthDate);
        const thisYearBirthday = new Date(nowForBirthday.getFullYear(), birth.getMonth(), birth.getDate());
        const diffDays = Math.floor((thisYearBirthday - new Date(nowForBirthday.getFullYear(), nowForBirthday.getMonth(), nowForBirthday.getDate())) / (1000*60*60*24));
        if (diffDays >= 0 && diffDays <= 7) {
          const customer = customerMap[p.customerId];
          if (customer) upcomingBirthdays.push({ type: 'pet', name: p.name, ownerName: customer.name, phone: customer.phone, daysUntil: diffDays, photo: p.photo });
        }
      });
      // 고객 생일
      customers.forEach(c => {
        if (!c.birthday) return;
        const birth = new Date(c.birthday);
        const thisYearBirthday = new Date(nowForBirthday.getFullYear(), birth.getMonth(), birth.getDate());
        const diffDays = Math.floor((thisYearBirthday - new Date(nowForBirthday.getFullYear(), nowForBirthday.getMonth(), nowForBirthday.getDate())) / (1000*60*60*24));
        if (diffDays >= 0 && diffDays <= 7) {
          upcomingBirthdays.push({ type: 'customer', name: c.name, ownerName: c.name, phone: c.phone, daysUntil: diffDays });
        }
      });
      upcomingBirthdays.sort((a, b) => a.daysUntil - b.daysUntil);

      // Upcoming appointments (next 7 days) - already loaded via date range query
      const upcomingAppointments = upcomingApptsRaw
        .filter(a => a.date > today && a.status !== 'cancelled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));

      // Greeting
      const greeting = App.getGreeting();
      const shopName = await DB.getSetting('shopName');
      const shopPhone = await DB.getSetting('shopPhone') || '';

      // Pre-build SMS bodies for revisit alerts using template
      for (const a of revisitAlerts) {
        const msg = await App.buildSms('revisit', {
          '고객명': a.customer.name || '',
          '반려견명': a.pet.name || '',
          '경과일수': String(a.days)
        });
        a._smsBody = encodeURIComponent(msg);
      }

      // Pre-build SMS bodies for birthday alerts using template
      for (const b of upcomingBirthdays) {
        const msg = await App.buildSms('birthday', {
          '고객명': b.ownerName || '',
          '반려견명': b.type === 'pet' ? b.name || '' : ''
        });
        b._smsBody = encodeURIComponent(msg);
      }

      // 일일 매출 목표
      const dailyGoal = Number(await DB.getSetting('dailyGoal')) || 0;

      // Auto-backup warning
      const needsBackup = await App.checkBackup();
      const lastBackupDate = await DB.getSetting('lastBackupDate');
      const backupDays = lastBackupDate ? App.getDaysAgo(lastBackupDate) : null;
      const backupWarning = needsBackup ? `
        <div style="background:var(--warning-light);border:1px solid var(--warning);border-radius:var(--radius);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
          <span style="font-size:1.3rem">&#x26A0;</span>
          <div style="flex:1">
            <strong>백업 알림</strong>: ${backupDays !== null ? `마지막 백업 후 ${backupDays}일 경과.` : '아직 백업하지 않았습니다.'} 데이터 안전을 위해 백업해주세요.
          </div>
          <button class="btn btn-sm btn-warning" onclick="App.pages.settings?.directBackup()">백업하기</button>
        </div>
      ` : '';

      // Weekly revenue chart HTML
      const weeklyRevenueChart = `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4B5; 이번 주 매출</span>
            <span style="font-weight:700;color:var(--primary)">${App.formatCurrency(weekTotal)}</span>
          </div>
          <div class="card-body">
            <div style="display:flex;align-items:flex-end;gap:8px;height:100px;padding:0 4px">
              ${weeklyData.map(d => {
                const pct = Math.round((d.rev / maxWeekRev) * 100);
                const isToday = d.date === today;
                return `
                  <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${d.date}: ${App.formatCurrency(d.rev)}">
                    <span style="font-size:0.65rem;color:var(--text-secondary);font-weight:600">${d.rev > 0 ? (d.rev >= 10000 ? Math.round(d.rev / 10000) + '만' : App.formatCurrency(d.rev)) : ''}</span>
                    <div style="width:100%;background:${isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:6px 6px 0 0;min-height:4px;height:${d.rev > 0 ? pct : 0}%"></div>
                    <span style="font-size:0.72rem;font-weight:${isToday ? '800' : '500'};color:${isToday ? 'var(--primary)' : 'var(--text-muted)'}">${d.label}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;

      // Revenue chart HTML
      const revenueChart = `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4C8; 최근 6개월 매출</span>
          </div>
          <div class="card-body">
            <div style="display:flex;align-items:flex-end;gap:8px;height:120px;padding:0 4px">
              ${monthlyRevenue.map(m => {
                const percentage = Math.round((m.rev / maxRev) * 100);
                return `
                  <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${App.formatCurrency(m.rev)}">
                    <span style="font-size:0.65rem;color:var(--text-secondary);font-weight:600">${m.rev >= 10000 ? Math.round(m.rev / 10000) + '만' : m.rev > 0 ? App.formatCurrency(m.rev) : ''}</span>
                    <div style="width:100%;background:linear-gradient(to top,var(--primary),#818CF8);border-radius:6px 6px 0 0;min-height:4px;height:${percentage}%"></div>
                    <span style="font-size:0.7rem;color:var(--text-muted)">${m.label}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;

      // Dissatisfied customers HTML
      const dissatisfiedHtml = dissatisfiedCustomers.length > 0 ? `
        <div class="card" style="margin-bottom:20px;border:1.5px solid var(--danger)">
          <div class="card-header" style="background:var(--danger-light)">
            <span class="card-title" style="color:var(--danger)">&#x1F61F; 관리 필요 고객 (최근 불만족)</span>
            <span class="badge badge-danger">${dissatisfiedCustomers.length}명</span>
          </div>
          <div class="card-body">
            ${dissatisfiedCustomers.map(d => {
              const phoneClean = (d.customer.phone || '').replace(/\D/g, '');
              return `
                <div class="alert-item">
                  <div style="flex:1">
                    <strong>${App.escapeHtml(d.customer.name)}</strong>${d.pet ? ' / ' + App.escapeHtml(d.pet.name) : ''}
                    <div style="font-size:0.78rem;color:var(--danger);margin-top:2px">
                      ${d.record.dissatisfactionReason ? '사유: ' + App.escapeHtml(d.record.dissatisfactionReason) : '사유 미기록'}
                    </div>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${App.formatDate(d.record.date)}</div>
                  </div>
                  <div style="display:flex;gap:4px;flex-shrink:0">
                    ${phoneClean ? `<a href="tel:${App.escapeHtml(phoneClean)}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">전화</a>` : ''}
                    ${phoneClean ? `<a href="sms:${App.escapeHtml(phoneClean)}" class="btn btn-sm btn-success" onclick="event.stopPropagation()">문자</a>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
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
                <div style="flex:1"><strong>매장 정보 입력</strong><div style="font-size:0.8rem;color:var(--text-muted)">매장명, 전화번호, 주소</div></div>
                ${!shopInfo ? '<a href="#settings" class="btn btn-sm btn-primary">설정</a>' : '<span class="badge badge-success">완료</span>'}
              </div>
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;${groomersSet.length > 0 ? 'background:var(--success);color:#fff' : 'background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)'}">${groomersSet.length > 0 ? '&#x2713;' : '2'}</span>
                <div style="flex:1"><strong>미용사 등록</strong><div style="font-size:0.8rem;color:var(--text-muted)">담당 미용사 추가</div></div>
                ${groomersSet.length === 0 ? '<a href="#settings" class="btn btn-sm btn-primary">설정</a>' : '<span class="badge badge-success">완료</span>'}
              </div>
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;${serviceCount > 0 ? 'background:var(--success);color:#fff' : 'background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)'}">${serviceCount > 0 ? '&#x2713;' : '3'}</span>
                <div style="flex:1"><strong>서비스 등록</strong><div style="font-size:0.8rem;color:var(--text-muted)">미용 서비스 및 가격 설정</div></div>
                ${serviceCount === 0 ? '<a href="#settings" class="btn btn-sm btn-primary">설정</a>' : '<span class="badge badge-success">완료</span>'}
              </div>
              <div class="onboarding-step" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-white);border-radius:var(--radius);border:1px solid var(--border-light)">
                <span style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;background:var(--bg);color:var(--text-muted);border:1.5px solid var(--border)">4</span>
                <div style="flex:1"><strong>첫 고객 등록</strong><div style="font-size:0.8rem;color:var(--text-muted)">고객과 반려견 정보 추가</div></div>
                <button class="btn btn-sm btn-primary" onclick="App.pages.customers.showForm()">등록</button>
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
                const c = customerMap[a.customerId];
                return (a.time || '--:--') + ' ' + App.escapeHtml(c?.name || '?');
              }).join('<br>')}${todayAppointments.length > 3 ? '<br>...' : ''}</div>` : ''}
            </div>
          </a>
          <a href="#records" class="stat-card gradient-green" style="text-decoration:none;color:inherit">
            <div class="stat-icon green">&#x1F4B0;</div>
            <div>
              <div class="stat-value" style="font-size:1.3rem">${App.formatCurrency(monthRevenue)}</div>
              <div class="stat-label">이번 달 매출 &rarr;
                ${revenueChange !== null ? `<span style="color:${revenueChange >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700;margin-left:4px">${revenueChange >= 0 ? '+' : ''}${revenueChange}%</span>` : ''}
              </div>
            </div>
          </a>
          <a href="#customers" class="stat-card gradient-yellow" style="text-decoration:none;color:inherit">
            <div class="stat-icon yellow">&#x1F464;</div>
            <div>
              <div class="stat-value">${customerCount}<span style="font-size:0.9rem;font-weight:500;color:var(--text-secondary)">명</span></div>
              <div class="stat-label">총 고객 &rarr;</div>
            </div>
          </a>
          <div class="stat-card gradient-purple" style="cursor:pointer" onclick="App.pages.records?.showDailyReport()">
            <div class="stat-icon purple">&#x1F4B5;</div>
            <div>
              <div class="stat-value" style="font-size:1.3rem">${App.formatCurrency(todayRevenue)}</div>
              <div class="stat-label">오늘 매출 (${todayRecords.length}건) &rarr;</div>
              ${dailyGoal > 0 ? (() => {
                const pct = Math.min(Math.round((todayRevenue / dailyGoal) * 100), 100);
                return '<div style="margin-top:6px"><div style="height:6px;background:rgba(255,255,255,0.3);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#fff;border-radius:3px;transition:width 0.3s"></div></div><div style="font-size:0.7rem;margin-top:2px;opacity:0.9">' + pct + '% (목표: ' + App.formatCurrency(dailyGoal) + ')</div></div>';
              })() : ''}
            </div>
          </div>
        </div>

        <div class="collapsible-section" data-section="weekly-revenue">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x1F4B5; 이번 주 매출</span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">${weeklyRevenueChart}</div>
        </div>

        <div class="collapsible-section" data-section="monthly-revenue">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x1F4C8; 최근 6개월 매출</span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">${revenueChart}</div>
        </div>

        ${groomerList.length > 0 ? `
        <div class="collapsible-section" data-section="groomer-revenue">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x1F4CB; 이번 달 미용사별 매출</span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">
            <div class="card" style="margin-bottom:20px">
              <div class="card-body" style="padding:16px">
                ${groomerList.map(([name, rev]) => {
                  const pct = Math.round((rev / monthRevenue) * 100) || 0;
                  return `
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
                      <span style="min-width:60px;font-weight:700;font-size:0.9rem">${App.escapeHtml(name)}</span>
                      <div style="flex:1;background:var(--bg);border-radius:6px;height:24px;overflow:hidden">
                        <div style="height:100%;background:linear-gradient(90deg,var(--primary),#818CF8);border-radius:6px;width:${pct}%;min-width:2px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px">
                          ${pct > 20 ? `<span style="font-size:0.7rem;color:#fff;font-weight:700">${pct}%</span>` : ''}
                        </div>
                      </div>
                      <span style="min-width:80px;text-align:right;font-weight:700;font-size:0.85rem">${App.formatCurrency(rev)}</span>
                    </div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        ${(() => {
          const serviceRevenue = {};
          monthRecords.forEach(r => {
            (r.serviceIds || []).forEach(sid => {
              const sName = serviceMap[sid];
              if (!sName) return;
              if (!serviceRevenue[sName]) serviceRevenue[sName] = { count: 0, amount: 0 };
              serviceRevenue[sName].count++;
              serviceRevenue[sName].amount += App.getRecordAmount(r);
            });
          });
          const serviceList = Object.entries(serviceRevenue).sort((a, b) => b[1].amount - a[1].amount);
          if (serviceList.length === 0) return '';
          const maxServiceRev = serviceList[0][1].amount || 1;
          return `
        <div class="collapsible-section" data-section="service-revenue">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x2702; 이번 달 서비스별 매출</span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">
            <div class="card" style="margin-bottom:20px">
              <div class="card-body" style="padding:16px">
                ${serviceList.map(([name, data]) => {
                  const pct = Math.round((data.amount / maxServiceRev) * 100) || 0;
                  return `
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
                      <span style="min-width:80px;font-weight:700;font-size:0.9rem">${App.escapeHtml(name)}</span>
                      <div style="flex:1;background:var(--bg);border-radius:6px;height:24px;overflow:hidden">
                        <div style="height:100%;background:linear-gradient(90deg,var(--success),#34D399);border-radius:6px;width:${pct}%;min-width:2px;display:flex;align-items:center;justify-content:flex-end;padding-right:8px">
                          ${pct > 25 ? `<span style="font-size:0.7rem;color:#fff;font-weight:700">${data.count}건</span>` : ''}
                        </div>
                      </div>
                      <span style="min-width:80px;text-align:right;font-weight:700;font-size:0.85rem">${App.formatCurrency(data.amount)}</span>
                    </div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
          `;
        })()}

        <div class="collapsible-section open" data-section="today-appointments">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x1F4C5; 오늘 예약 (${todayAppointments.length}건)</span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">
            <div class="grid-2">
              <div class="card">
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

              <div class="card">
                <div class="card-header">
                  <span class="card-title">&#x1F514; 재방문 알림 (${revisitDays}일 기준)</span>
                  <span class="badge ${revisitAlerts.length > 0 ? 'badge-warning' : 'badge-secondary'}">${revisitAlerts.length}건</span>
                </div>
                <div class="card-body">
                  ${revisitAlerts.length === 0 ? `
                    <div class="empty-state" style="padding:32px">
                      <div class="empty-state-icon">&#x2705;</div>
                      <div class="empty-state-text">모든 고객이 정기적으로 방문 중</div>
                    </div>
                  ` : revisitAlerts.slice(0, 8).map(a => `
                    <div class="alert-item">
                      <span class="days">${a.days}일</span>
                      <div style="flex:1">
                        <strong>${App.escapeHtml(a.customer.name)}</strong>의
                        <strong>${App.escapeHtml(a.pet.name)}</strong>
                        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">
                          마지막 미용: ${App.formatDate(a.lastDate)}
                          ${a.pet.groomingCycle ? ` | 미용 주기 ${a.cycleDays}일 초과` : ''}
                        </div>
                      </div>
                      <div style="display:flex;gap:4px;flex-shrink:0">
                        <a href="sms:${App.escapeHtml((a.customer.phone || '').replace(/\D/g, ''))}?body=${a._smsBody}" class="btn btn-sm btn-success" onclick="event.stopPropagation()" title="문자 보내기">문자</a>
                        <a href="tel:${App.escapeHtml((a.customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()" title="전화 걸기">전화</a>
                        <button class="btn btn-sm btn-primary" onclick="App.pages.appointments.showForm(null, ${a.customer.id}, {petId:${a.pet.id}})" style="flex-shrink:0">예약</button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="collapsible-section" data-section="quick-actions">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x26A1; 빠른 작업</span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">
            <div class="quick-actions" style="margin-bottom:24px">
              <button class="quick-action-btn" onclick="App.pages.customers.showForm()">
                <span class="qa-icon">&#x1F464;</span> 새 고객
              </button>
              <button class="quick-action-btn" onclick="App.pages.pets.showForm()">
                <span class="qa-icon">&#x1F436;</span> 새 반려견
              </button>
              <button class="quick-action-btn" onclick="App.pages.appointments.showForm()">
                <span class="qa-icon">&#x1F4C5;</span> 새 예약
              </button>
              <button class="quick-action-btn" onclick="App.pages.records.showForm()">
                <span class="qa-icon">&#x2702;</span> 새 미용기록
              </button>
            </div>
          </div>
        </div>

        <div class="collapsible-section open" data-section="upcoming-appointments">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x1F4C6; 이번 주 예약 (${upcomingAppointments.length}건)</span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">
            <div class="card" style="margin-top:0">
              <div class="card-body ${upcomingAppointments.length ? 'no-padding' : ''}">
                ${upcomingAppointments.length === 0 ? `
                  <div class="empty-state" style="padding:32px">
                    <div class="empty-state-icon">&#x1F4AD;</div>
                    <div class="empty-state-text">이번 주 예정된 예약이 없어요</div>
                  </div>
                ` : `<div style="padding:16px">${this.renderAppointmentList(upcomingAppointments, customerMap, petMap, serviceMap)}</div>`}
              </div>
            </div>
          </div>
        </div>

        ${unpaidRecords.length > 0 ? `
        <div class="collapsible-section${unpaidRecords.length > 0 ? ' open' : ''}" data-section="unpaid">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x1F4B8; 미수금(외상) 현황 <span class="badge badge-danger">${unpaidRecords.length}건 / ${App.formatCurrency(unpaidTotal)}</span></span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">
            <div class="card" style="margin-top:0">
              <div class="card-body">
                ${unpaidRecords.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10).map(r => {
                  const customer = customerMap[r.customerId];
                  const pet = petMap[r.petId];
                  return `
                    <div class="alert-item">
                      <span style="font-weight:700;color:var(--danger)">${App.formatCurrency(App.getRecordAmount(r))}</span>
                      <div style="flex:1">
                        <strong>${App.escapeHtml(customer?.name || '-')}</strong>
                        ${pet ? ' / ' + App.escapeHtml(pet.name) : ''}
                        <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px">${App.formatDate(r.date)}</div>
                      </div>
                      <div style="display:flex;gap:4px;flex-shrink:0">
                        ${customer?.phone ? `<a href="tel:${App.escapeHtml((customer.phone || '').replace(/\D/g, ''))}" class="btn btn-sm btn-secondary" onclick="event.stopPropagation()">전화</a>` : ''}
                        <button class="btn btn-sm btn-success btn-pay-unpaid" data-id="${r.id}" onclick="event.stopPropagation()">결제</button>
                      </div>
                    </div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        ${upcomingBirthdays.length > 0 ? `
        <div class="collapsible-section" data-section="birthdays">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x1F382; 생일 알림 <span class="badge badge-info">${upcomingBirthdays.length}건</span></span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">
            <div class="card" style="margin-top:0">
              <div class="card-body">
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
                        ${phoneClean ? `<a href="sms:${App.escapeHtml(phoneClean)}?body=${b._smsBody}" class="btn btn-sm btn-success" onclick="event.stopPropagation()">축하 문자</a>` : ''}
                      </div>
                    </div>`;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
        ` : ''}

        ${dissatisfiedCustomers.length > 0 ? `
        <div class="collapsible-section open" data-section="dissatisfied">
          <div class="collapsible-header" onclick="App.pages.dashboard.toggleSection(this)">
            <span>&#x1F61F; 관리 필요 고객 <span class="badge badge-danger">${dissatisfiedCustomers.length}명</span></span>
            <span class="collapsible-chevron">&#x25BC;</span>
          </div>
          <div class="collapsible-body">${dissatisfiedHtml}</div>
        </div>
        ` : ''}

        <div id="storage-quota-banner"></div>
      `;

      // Phase 4: Storage quota monitoring (async, non-blocking)
      DB.checkStorageQuota().then(quota => {
        if (quota && quota.percentage > 80) {
          const banner = document.getElementById('storage-quota-banner');
          if (banner) {
            const usedMB = (quota.used / (1024 * 1024)).toFixed(1);
            const quotaMB = (quota.quota / (1024 * 1024)).toFixed(0);
            banner.innerHTML = `
              <div style="background:${quota.percentage > 95 ? 'var(--danger-light)' : 'var(--warning-light)'};border:1px solid ${quota.percentage > 95 ? 'var(--danger)' : 'var(--warning)'};border-radius:var(--radius);padding:12px 16px;margin-top:16px;display:flex;align-items:center;gap:12px">
                <span style="font-size:1.3rem">${quota.percentage > 95 ? '&#x1F6A8;' : '&#x26A0;'}</span>
                <div style="flex:1">
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
            <div class="name">${dateLabel}<a href="#customers/${appt.customerId}" onclick="event.stopPropagation()" style="color:inherit;font-weight:700">${App.escapeHtml(customer?.name || '?')}</a> <span style="color:var(--text-muted)">/</span> <a href="#pets/${appt.petId}" onclick="event.stopPropagation()" style="color:inherit">${App.escapeHtml(pet?.name || '?')}</a></div>
            <div class="detail">${App.escapeHtml(serviceNames || '서비스 미지정')}${appt.groomer ? ' &middot; ' + App.escapeHtml(appt.groomer) : ''}</div>
            ${(() => { const w = [pet?.temperament, pet?.healthNotes, pet?.handoverNote, pet?.allergies].filter(Boolean); if (!w.length) return ''; const s = w.join(', '); return '<div style="font-size:0.75rem;color:var(--danger);margin-top:2px">&#x26A0; ' + App.escapeHtml(s.length > 50 ? s.slice(0, 50) + '...' : s) + '</div>'; })()}
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <span class="badge badge-${this.getStatusBadge(appt.status)}">${this.getStatusLabel(appt.status)}</span>
            ${appt.status !== 'completed' ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();App.pages.appointments.completeToRecord(${appt.id})" title="미용 기록 작성">기록</button>` : ''}
          </div>
        </div>
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

  toggleSection(header) {
    const section = header.closest('.collapsible-section');
    if (section) {
      section.classList.toggle('open');
    }
  },

  async init() {
    // Auto-open collapsible sections that have important data
    // Sections with class 'open' are already open from render (unpaid, dissatisfied)
    // Restore saved section states from sessionStorage
    document.querySelectorAll('.collapsible-section').forEach(section => {
      const key = 'dash_section_' + section.dataset.section;
      const saved = sessionStorage.getItem(key);
      if (saved === 'open') section.classList.add('open');
      else if (saved === 'closed') section.classList.remove('open');
      // Track toggle state
      const header = section.querySelector('.collapsible-header');
      if (header) {
        header.addEventListener('click', () => {
          setTimeout(() => {
            sessionStorage.setItem(key, section.classList.contains('open') ? 'open' : 'closed');
          }, 0);
        });
      }
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
