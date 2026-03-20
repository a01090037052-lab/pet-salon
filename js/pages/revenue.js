// ========== Revenue (매출) Page ==========
App.pages.revenue = {
  async render(container) {
    const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter']);
    const sorted = records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const [customers, pets] = await Promise.all([
      DB.getAllLight('customers', ['memo', 'address']),
      DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle'])
    ]);
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);

    const getRevenue = (r) => Number(r.finalPrice != null ? r.finalPrice : r.totalPrice) || 0;

    // 오늘 매출
    const today = App.getToday();
    const todayRecords = records.filter(r => r.date === today);
    const todayRevenue = todayRecords.reduce((sum, r) => sum + getRevenue(r), 0);

    // 이번 주 매출
    const nowDate = new Date();
    const dayOfWeek = nowDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(nowDate);
    monday.setDate(nowDate.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const mondayStr = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const sundayStr = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`;
    const weekRecords = records.filter(r => r.date >= mondayStr && r.date <= sundayStr);
    const weekRevenue = weekRecords.reduce((sum, r) => sum + getRevenue(r), 0);

    // 이번 달 매출
    const thisMonth = today.slice(0, 7);
    const monthRecords = records.filter(r => r.date && r.date.startsWith(thisMonth));
    const monthRevenue = monthRecords.reduce((sum, r) => sum + getRevenue(r), 0);

    // 전체 매출
    const totalRevenue = records.reduce((sum, r) => sum + getRevenue(r), 0);

    // 미수금 집계
    const unpaidRecs = records.filter(r => r.paymentMethod === 'unpaid');
    const unpaidTotal = unpaidRecs.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 결제 수단별 통계 (이번 달)
    const paymentStats = { cash: 0, card: 0, transfer: 0, unpaid: 0, none: 0 };
    monthRecords.forEach(r => {
      const method = r.paymentMethod || 'none';
      paymentStats[method] = (paymentStats[method] || 0) + getRevenue(r);
    });

    // 일일 매출 목표
    const dailyGoal = Number(await DB.getSetting('dailyGoal')) || 0;

    // 미용사별 성과 (Feature 4)
    const groomerStats = {};
    const allAppointments = await DB.getAll('appointments');
    monthRecords.forEach(r => {
      const name = r.groomer || '미지정';
      if (!groomerStats[name]) groomerStats[name] = { count: 0, revenue: 0, satisfactionGood: 0, satisfactionTotal: 0, apptTotal: 0, noshowCount: 0 };
      groomerStats[name].count++;
      groomerStats[name].revenue += getRevenue(r);
      if (r.satisfaction) {
        groomerStats[name].satisfactionTotal++;
        if (r.satisfaction === 'good') groomerStats[name].satisfactionGood++;
      }
    });
    const monthAppts = allAppointments.filter(a => a.date && a.date.startsWith(thisMonth));
    monthAppts.forEach(a => {
      const name = a.groomer || '미지정';
      if (!groomerStats[name]) groomerStats[name] = { count: 0, revenue: 0, satisfactionGood: 0, satisfactionTotal: 0, apptTotal: 0, noshowCount: 0 };
      groomerStats[name].apptTotal++;
      if (a.status === 'noshow') groomerStats[name].noshowCount++;
    });
    const groomerStatList = Object.entries(groomerStats).sort((a, b) => b[1].revenue - a[1].revenue);
    const groomerMaxRev = groomerStatList.length > 0 ? groomerStatList[0][1].revenue || 1 : 1;

    // 비용 데이터 (Feature 6)
    let monthExpenses = [];
    try {
      const allExpenses = await DB.getAll('expenses');
      monthExpenses = allExpenses.filter(e => e.month === thisMonth);
    } catch(e) {}
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = monthRevenue - totalExpenses;
    const profitRate = monthRevenue > 0 ? Math.round((netProfit / monthRevenue) * 100) : 0;

    // 매출 데이터 캐시
    this._records = records;

    // 이번 주 일별 차트 데이터
    const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
    const weekData = [];
    let weekMax = 1;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const rev = records.filter(r => r.date === ds).reduce((sum, r) => sum + getRevenue(r), 0);
      weekData.push({ label: dayLabels[i], date: ds, rev });
      if (rev > weekMax) weekMax = rev;
    }

    // 이번 달 일별 차트 데이터
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthData = [];
    let monthMax = 1;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rev = records.filter(r => r.date === ds).reduce((sum, r) => sum + getRevenue(r), 0);
      monthData.push({ day: d, date: ds, rev });
      if (rev > monthMax) monthMax = rev;
    }

    // 월별 매출 추이 (최근 6개월)
    const monthlyTrend = [];
    let trendMax = 1;
    for (let i = 5; i >= 0; i--) {
      const tDate = new Date(year, month - i, 1);
      const tMonth = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
      const tLabel = `${tDate.getMonth() + 1}월`;
      const rev = records.filter(r => r.date && r.date.startsWith(tMonth)).reduce((sum, r) => sum + getRevenue(r), 0);
      const cnt = records.filter(r => r.date && r.date.startsWith(tMonth)).length;
      monthlyTrend.push({ month: tMonth, label: tLabel, rev, count: cnt });
      if (rev > trendMax) trendMax = rev;
    }

    const paymentLabels = { cash: '현금', card: '카드', transfer: '이체', unpaid: '미결제', none: '미선택' };
    const paymentColors = { cash: 'var(--success)', card: 'var(--primary)', transfer: 'var(--info)', unpaid: 'var(--danger)', none: 'var(--text-muted)' };
    const monthPaymentTotal = Object.values(paymentStats).reduce((a, b) => a + b, 0) || 1;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">&#x1F4B0; 매출</h1>
          <p class="page-subtitle">매출 현황 및 통계</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-revenue-export">&#x1F4C4; 세무 자료 내보내기</button>
          <button class="btn btn-secondary" id="btn-revenue-daily-report">&#x1F4CB; 일일 정산표</button>
        </div>
      </div>

      <!-- 매출 요약 카드 -->
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card gradient-purple">
          <div class="stat-icon purple">&#x1F4B5;</div>
          <div>
            <div class="stat-value" style="font-size:1.4rem">${App.formatCurrency(todayRevenue)}</div>
            <div class="stat-label">오늘 매출 (${todayRecords.length}건)</div>
          </div>
        </div>
        <div class="stat-card gradient-blue">
          <div class="stat-icon blue">&#x1F4CA;</div>
          <div>
            <div class="stat-value" style="font-size:1.4rem">${App.formatCurrency(weekRevenue)}</div>
            <div class="stat-label">이번 주 매출 (${weekRecords.length}건)</div>
          </div>
        </div>
        <div class="stat-card gradient-green">
          <div class="stat-icon green">&#x1F4B0;</div>
          <div>
            <div class="stat-value" style="font-size:1.4rem">${App.formatCurrency(monthRevenue)}</div>
            <div class="stat-label">이번 달 매출 (${monthRecords.length}건)</div>
          </div>
        </div>
      </div>

      ${dailyGoal > 0 ? (() => {
        const pct = Math.min(Math.round((todayRevenue / dailyGoal) * 100), 100);
        const barColor = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--primary)' : 'var(--warning)';
        return '<div class="card" style="margin-bottom:16px"><div class="card-body" style="padding:16px 20px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-weight:700">오늘 매출 목표</span><span style="font-weight:800;color:' + barColor + '">' + pct + '%</span></div><div style="height:10px;background:var(--border-light);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:5px;transition:width 0.3s"></div></div><div style="display:flex;justify-content:space-between;margin-top:6px;font-size:0.82rem;color:var(--text-secondary)"><span>' + App.formatCurrency(todayRevenue) + '</span><span>목표: ' + App.formatCurrency(dailyGoal) + '</span></div></div></div>';
      })() : ''}

      ${unpaidRecs.length > 0 ? `
      <div class="card" style="margin-bottom:16px;border:1.5px solid var(--danger)">
        <div class="card-body" style="padding:16px 20px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,var(--danger-light),#FEE2E2)">
          <span style="font-size:1.5rem">&#x1F4B8;</span>
          <div style="flex:1">
            <div style="font-weight:800;color:var(--danger);font-size:1rem">미수금 경고</div>
            <div style="font-size:0.88rem;color:#991B1B;margin-top:2px">총 ${unpaidRecs.length}건 &middot; ${App.formatCurrency(unpaidTotal)}</div>
          </div>
          <a href="#records" style="color:var(--danger);font-weight:600;font-size:0.85rem">기록에서 확인 &rarr;</a>
        </div>
      </div>
      ` : ''}

      <div class="grid-2">
        <!-- 이번 주 일별 차트 -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">&#x1F4CA; 이번 주 일별 매출</span>
          </div>
          <div class="card-body">
            <div style="text-align:center;margin-bottom:16px">
              <div style="font-size:1.6rem;font-weight:800;color:var(--primary)">${App.formatCurrency(weekRevenue)}</div>
            </div>
            <div style="display:flex;align-items:flex-end;gap:8px;height:150px;padding:0 4px">
              ${weekData.map(d => {
                const pct = Math.round((d.rev / weekMax) * 100);
                const isToday = d.date === today;
                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${d.date}: ${App.formatCurrency(d.rev)}">
                  <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:600">${d.rev > 0 ? (d.rev >= 10000 ? Math.round(d.rev / 10000) + '만' : App.formatCurrency(d.rev)) : ''}</span>
                  <div style="width:100%;background:${isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:6px 6px 0 0;min-height:4px;height:${d.rev > 0 ? pct : 0}%"></div>
                  <span style="font-size:0.75rem;font-weight:${isToday ? '800' : '500'};color:${isToday ? 'var(--primary)' : 'var(--text-muted)'}">${d.label}</span>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- 이번 달 결제 수단별 -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">&#x1F4B3; 이번 달 결제 수단별</span>
          </div>
          <div class="card-body">
            <div style="display:flex;flex-direction:column;gap:10px">
              ${Object.entries(paymentStats).filter(([k, v]) => v > 0).map(([method, amount]) => {
                const pct = Math.round((amount / monthPaymentTotal) * 100);
                return `<div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span style="font-weight:600;font-size:0.88rem">${paymentLabels[method] || method}</span>
                    <span style="font-weight:700;font-size:0.88rem">${App.formatCurrency(amount)} (${pct}%)</span>
                  </div>
                  <div style="height:8px;background:var(--border-light);border-radius:4px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${paymentColors[method] || 'var(--primary)'};border-radius:4px"></div>
                  </div>
                </div>`;
              }).join('')}
              ${Object.values(paymentStats).every(v => v === 0) ? '<p style="color:var(--text-muted);text-align:center">이번 달 기록이 없습니다</p>' : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- 이번 달 일별 차트 -->
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <span class="card-title">&#x1F4C5; 이번 달 일별 매출 (${year}년 ${month + 1}월)</span>
        </div>
        <div class="card-body">
          <div style="text-align:center;margin-bottom:16px">
            <div style="font-size:1.6rem;font-weight:800;color:var(--primary)">${App.formatCurrency(monthRevenue)}</div>
          </div>
          <div style="display:flex;align-items:flex-end;gap:2px;height:150px;padding:0;overflow-x:auto">
            ${monthData.map(d => {
              const pct = Math.round((d.rev / monthMax) * 100);
              const isToday = d.date === today;
              return `<div style="flex:1;min-width:14px;display:flex;flex-direction:column;align-items:center;gap:2px" title="${d.date}: ${App.formatCurrency(d.rev)}">
                <div style="width:100%;background:${isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:4px 4px 0 0;min-height:2px;height:${d.rev > 0 ? pct : 0}%"></div>
                <span style="font-size:0.55rem;color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};font-weight:${isToday ? '800' : '400'}">${d.day % 5 === 1 || isToday ? d.day : ''}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 월별 매출 추이 -->
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <span class="card-title">&#x1F4C8; 최근 6개월 매출 추이</span>
        </div>
        <div class="card-body">
          <div style="display:flex;align-items:flex-end;gap:12px;height:180px;padding:0 8px">
            ${monthlyTrend.map(m => {
              const pct = Math.round((m.rev / trendMax) * 100);
              const isCurrent = m.month === thisMonth;
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px" title="${m.month}: ${App.formatCurrency(m.rev)} (${m.count}건)">
                <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:600">${m.rev >= 10000 ? Math.round(m.rev / 10000) + '만' : (m.rev > 0 ? App.formatCurrency(m.rev) : '')}</span>
                <div style="width:100%;background:${isCurrent ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:8px 8px 0 0;min-height:4px;height:${m.rev > 0 ? pct : 0}%"></div>
                <div style="text-align:center">
                  <div style="font-size:0.78rem;font-weight:${isCurrent ? '800' : '500'};color:${isCurrent ? 'var(--primary)' : 'var(--text-muted)'}">${m.label}</div>
                  <div style="font-size:0.65rem;color:var(--text-muted)">${m.count}건</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- 미용사별 성과 -->
      ${groomerStatList.length > 0 ? `
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <span class="card-title">&#x1F4CB; 이번 달 미용사별 성과</span>
        </div>
        <div class="card-body" style="padding:16px">
          ${groomerStatList.map(([name, stats]) => {
            const avgPrice = stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0;
            const satRate = stats.satisfactionTotal > 0 ? Math.round((stats.satisfactionGood / stats.satisfactionTotal) * 100) : null;
            const noshowRate = stats.apptTotal > 0 ? Math.round((stats.noshowCount / stats.apptTotal) * 100) : 0;
            const pct = Math.round((stats.revenue / groomerMaxRev) * 100);
            return `
              <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <span style="font-weight:800;font-size:1rem">${App.escapeHtml(name)}</span>
                  <span style="font-weight:700;color:var(--primary)">${App.formatCurrency(stats.revenue)}</span>
                </div>
                <div style="height:8px;background:var(--border-light);border-radius:4px;overflow:hidden;margin-bottom:8px">
                  <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),#818CF8);border-radius:4px"></div>
                </div>
                <div style="display:flex;gap:16px;font-size:0.82rem;color:var(--text-secondary);flex-wrap:wrap">
                  <span>&#x2702; ${stats.count}건</span>
                  <span>&#x1F4B0; 평균 ${App.formatCurrency(avgPrice)}</span>
                  ${satRate !== null ? '<span>' + (satRate >= 80 ? '&#x1F60A;' : satRate >= 50 ? '&#x1F610;' : '&#x1F61F;') + ' 만족도 ' + satRate + '%</span>' : ''}
                  ${noshowRate > 0 ? '<span style="color:var(--danger)">&#x274C; 노쇼 ' + noshowRate + '%</span>' : ''}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- 손익 분석 -->
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <span class="card-title">&#x1F4CA; 이번 달 손익 분석</span>
          <button class="btn btn-sm btn-primary" id="btn-add-expense">+ 비용 추가</button>
        </div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-weight:600">이번 달 매출</span>
              <strong style="color:var(--success)">${App.formatCurrency(monthRevenue)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-weight:600">이번 달 비용</span>
              <strong style="color:var(--danger)">-${App.formatCurrency(totalExpenses)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:12px 0;border-top:2px solid var(--text);font-size:1.1rem">
              <span style="font-weight:800">순이익</span>
              <strong style="color:${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${App.formatCurrency(netProfit)} ${monthRevenue > 0 ? '(이익률 ' + profitRate + '%)' : ''}</strong>
            </div>
          </div>
          ${monthExpenses.length > 0 ? `
          <div style="font-weight:700;margin-bottom:8px;font-size:0.9rem">비용 내역</div>
          <div style="display:flex;flex-direction:column;gap:6px" id="expense-list">
            ${monthExpenses.map(e => {
              const catLabels = { rent:'임대료', labor:'인건비', utility:'공과금', insurance:'보험', material:'재료비', repair:'수리비', other:'기타' };
              return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border-radius:var(--radius)"><span style="flex:1;font-size:0.88rem"><strong>' + App.escapeHtml(e.name || catLabels[e.category] || e.category) + '</strong>' + (e.isRecurring ? ' <span style="font-size:0.7rem;color:var(--text-muted)">(고정)</span>' : '') + '</span><span style="font-weight:700;font-size:0.88rem">' + App.formatCurrency(e.amount) + '</span><button class="btn-icon btn-delete-expense" data-id="' + e.id + '" title="삭제" style="color:var(--danger);font-size:0.85rem">&#x1F5D1;</button></div>';
            }).join('')}
          </div>
          ` : '<p style="color:var(--text-muted);font-size:0.88rem">등록된 비용이 없습니다. 비용을 추가하면 손익 분석이 표시됩니다.</p>'}
        </div>
      </div>

      <!-- 전체 매출 요약 -->
      <div class="card" style="margin-top:20px">
        <div class="card-header">
          <span class="card-title">&#x1F4DD; 전체 매출 요약</span>
        </div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span>전체 매출</span><strong>${App.formatCurrency(totalRevenue)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span>전체 기록 수</span><strong>${records.length}건</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span>평균 객단가</span><strong>${records.length > 0 ? App.formatCurrency(Math.round(totalRevenue / records.length)) : '0원'}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0">
              <span>미수금</span><strong style="color:${unpaidTotal > 0 ? 'var(--danger)' : 'inherit'}">${App.formatCurrency(unpaidTotal)}</strong>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  async init() {
    // 세무 자료 내보내기
    document.getElementById('btn-revenue-export')?.addEventListener('click', () => {
      App.pages.records?.showExportModal();
    });

    // 일일 정산표
    document.getElementById('btn-revenue-daily-report')?.addEventListener('click', () => {
      App.pages.records?.showDailyReport();
    });

    // 비용 추가
    document.getElementById('btn-add-expense')?.addEventListener('click', () => {
      this.showExpenseForm();
    });

    // 비용 삭제
    document.querySelectorAll('.btn-delete-expense').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const confirmed = await App.confirm('이 비용을 삭제하시겠습니까?');
        if (!confirmed) return;
        try {
          await DB.delete('expenses', id);
          App.showToast('비용이 삭제되었습니다.');
          App.handleRoute();
        } catch(err) {
          App.showToast('삭제 중 오류가 발생했습니다.', 'error');
        }
      });
    });
  },

  showExpenseForm(expenseId) {
    const today = App.getToday();
    const thisMonth = today.slice(0, 7);

    App.showModal({
      title: '비용 추가',
      content: `
        <div class="form-group">
          <label class="form-label">분류 <span class="required">*</span></label>
          <select id="f-expCategory">
            <option value="rent">임대료</option>
            <option value="labor">인건비</option>
            <option value="utility">공과금</option>
            <option value="insurance">보험</option>
            <option value="material">재료비</option>
            <option value="repair">수리비</option>
            <option value="other">기타</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">항목명</label>
          <input type="text" id="f-expName" placeholder="예: 3월 임대료">
        </div>
        <div class="form-group">
          <label class="form-label">금액 <span class="required">*</span></label>
          <input type="number" id="f-expAmount" placeholder="예: 1500000" min="0" step="10000">
        </div>
        <div class="form-group">
          <label class="form-label">적용 월</label>
          <input type="month" id="f-expMonth" value="${thisMonth}">
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" id="f-expRecurring">
            매월 고정 비용
          </label>
          <div class="form-hint">고정 비용으로 표시합니다 (자동 반복은 되지 않습니다)</div>
        </div>
      `,
      onSave: async () => {
        const category = document.getElementById('f-expCategory').value;
        const name = document.getElementById('f-expName').value.trim();
        const amount = Number(document.getElementById('f-expAmount').value) || 0;
        const month = document.getElementById('f-expMonth').value;
        const isRecurring = document.getElementById('f-expRecurring').checked;

        if (!amount) { App.showToast('금액을 입력해주세요.', 'error'); return; }

        try {
          await DB.add('expenses', { category, name: name || category, amount, month, isRecurring });
          App.showToast('비용이 추가되었습니다.');
          App.closeModal();
          App.handleRoute();
        } catch(err) {
          console.error('Expense save error:', err);
          App.showToast('저장 중 오류가 발생했습니다.', 'error');
        }
      }
    });
  }
};
