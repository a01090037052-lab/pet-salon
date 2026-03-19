// ========== Dashboard Page ==========
App.pages.dashboard = {
  async render(container) {
    try {
      const today = App.getToday();
      const [customers, pets, appointments, records, services] = await Promise.all([
        DB.getAll('customers'),
        DB.getAll('pets'),
        DB.getAll('appointments'),
        DB.getAll('records'),
        DB.getAll('services')
      ]);

      // Build lookup maps once — no DB.get() inside loops
      const customerMap = {};
      customers.forEach(c => { customerMap[c.id] = c; });
      const petMap = {};
      pets.forEach(p => { petMap[p.id] = p; });
      const serviceMap = {};
      services.forEach(s => { serviceMap[s.id] = s.name; });

      const todayAppointments = appointments
        .filter(a => a.date === today && a.status !== 'cancelled')
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const thisMonth = today.slice(0, 7);
      const monthRecords = records.filter(r => r.date && r.date.startsWith(thisMonth));
      const monthRevenue = monthRecords.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);

      // Last month revenue for comparison
      const lastMonthDate = new Date();
      lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
      const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
      const lastMonthRevenue = records
        .filter(r => r.date && r.date.startsWith(lastMonth))
        .reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
      const revenueChange = lastMonthRevenue > 0 ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : null;

      // Today's revenue
      const todayRecords = records.filter(r => r.date === today);
      const todayRevenue = todayRecords.reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);

      // Groomer revenue this month
      const groomerRevenue = {};
      monthRecords.forEach(r => {
        const name = r.groomer || '미지정';
        groomerRevenue[name] = (groomerRevenue[name] || 0) + (Number(r.totalPrice) || 0);
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
        const dayRev = records
          .filter(r => r.date === dateStr)
          .reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
        weeklyData.push({ label: dayLabels[i], date: dateStr, rev: dayRev });
        weekTotal += dayRev;
      }
      const maxWeekRev = Math.max(...weeklyData.map(d => d.rev), 1);

      // Last 6 months revenue for chart
      const monthlyRevenue = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = `${d.getMonth() + 1}월`;
        const rev = records
          .filter(r => r.date && r.date.startsWith(key))
          .reduce((sum, r) => sum + (Number(r.totalPrice) || 0), 0);
        monthlyRevenue.push({ key, label, rev });
      }
      const maxRev = Math.max(...monthlyRevenue.map(m => m.rev), 1);

      // Revisit alerts — use petMap and customerMap, no individual DB.get()
      const revisitDays = await DB.getSetting('revisitDays') || 30;
      const petLastVisit = {};
      records.forEach(r => {
        if (!petLastVisit[r.petId] || (r.date || '') > (petLastVisit[r.petId].date || '')) {
          petLastVisit[r.petId] = r;
        }
      });
      const revisitAlerts = [];
      for (const [petId, record] of Object.entries(petLastVisit)) {
        const days = App.getDaysAgo(record.date);
        if (days >= revisitDays) {
          const pet = petMap[Number(petId)];
          const customer = pet ? customerMap[pet.customerId] : null;
          if (pet && customer) {
            revisitAlerts.push({ pet, customer, days, lastDate: record.date });
          }
        }
      }
      revisitAlerts.sort((a, b) => b.days - a.days);

      // Upcoming appointments (next 7 days)
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekStr = App.formatDate(nextWeek.toISOString());
      const upcomingAppointments = appointments
        .filter(a => a.date > today && a.date <= nextWeekStr && a.status !== 'cancelled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));

      // Greeting
      const greeting = App.getGreeting();
      const shopName = await DB.getSetting('shopName');

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
          <a href="#settings" class="btn btn-sm btn-warning">백업하기</a>
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

      container.innerHTML = `
        ${backupWarning}

        <div class="welcome-section">
          <div class="welcome-title">${greeting}! ${shopName ? App.escapeHtml(shopName) : '&#x2702; 펫살롱'}</div>
          <div class="welcome-subtitle">${today} &middot; 오늘 예약 ${todayAppointments.length}건${monthRecords.length > 0 ? ' &middot; 이번 달 미용 ' + monthRecords.length + '건' : ''}</div>
        </div>

        <div class="stats-grid">
          <a href="#appointments" class="stat-card gradient-blue" style="text-decoration:none;color:inherit">
            <div class="stat-icon blue">&#x1F4C5;</div>
            <div>
              <div class="stat-value">${todayAppointments.length}<span style="font-size:0.9rem;font-weight:500;color:var(--text-secondary)">건</span></div>
              <div class="stat-label">오늘 예약 &rarr;</div>
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
              <div class="stat-value">${customers.length}<span style="font-size:0.9rem;font-weight:500;color:var(--text-secondary)">명</span></div>
              <div class="stat-label">총 고객 &rarr;</div>
            </div>
          </a>
          <a href="#records" class="stat-card gradient-purple" style="text-decoration:none;color:inherit">
            <div class="stat-icon purple">&#x1F4B5;</div>
            <div>
              <div class="stat-value" style="font-size:1.3rem">${App.formatCurrency(todayRevenue)}</div>
              <div class="stat-label">오늘 매출 (${todayRecords.length}건) &rarr;</div>
            </div>
          </a>
        </div>

        ${weeklyRevenueChart}

        ${revenueChart}

        ${groomerList.length > 0 ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4CB; 이번 달 미용사별 매출</span>
          </div>
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
        ` : ''}

        <!-- Quick Actions -->
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
                    </div>
                  </div>
                  <button class="btn btn-sm btn-primary" onclick="App.pages.appointments.showForm(null, ${a.customer.id}, ${a.pet.id})" style="flex-shrink:0">예약</button>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4C6; 이번 주 예약 (${upcomingAppointments.length}건)</span>
            <a href="#appointments" class="btn btn-sm btn-ghost">전체보기 &rarr;</a>
          </div>
          <div class="card-body ${upcomingAppointments.length ? 'no-padding' : ''}">
            ${upcomingAppointments.length === 0 ? `
              <div class="empty-state" style="padding:32px">
                <div class="empty-state-icon">&#x1F4AD;</div>
                <div class="empty-state-text">이번 주 예정된 예약이 없어요</div>
              </div>
            ` : `<div style="padding:16px">${this.renderAppointmentList(upcomingAppointments, customerMap, petMap, serviceMap)}</div>`}
          </div>
        </div>
      `;
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
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <span class="badge badge-${this.getStatusBadge(appt.status)}">${this.getStatusLabel(appt.status)}</span>
            ${appt.status !== 'completed' ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();App.pages.appointments.completeToRecord(${appt.id})" title="미용 기록 작성" style="padding:4px 8px;font-size:0.75rem">기록</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  getStatusLabel(status) {
    const labels = { pending: '대기', confirmed: '확정', completed: '완료', cancelled: '취소', noshow: '노쇼' };
    return labels[status] || status || '대기';
  },

  getStatusBadge(status) {
    const badges = { pending: 'warning', confirmed: 'primary', completed: 'success', cancelled: 'secondary', noshow: 'danger' };
    return badges[status] || 'warning';
  },

  async init() {}
};
