// ========== Revenue (매출) Page ==========
App.pages.revenue = {
  async render(container) {
    const today = App.getToday();
    // 최근 1년 records만 로드 (성능 최적화), 미수금/전체 매출은 경량 집계
    const oneYearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return App.formatLocalDate(d); })();
    const [records, allRecordsMin, customers, pets] = await Promise.all([
      DB.getByDateRange('records', 'date', oneYearAgo, '9999-12-31'),
      DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo', 'serviceIds', 'serviceNames', 'groomer', 'nextVisitDate', 'appointmentId']),
      DB.getAllLight('customers', ['memo', 'address']),
      DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle'])
    ]);
    const sorted = records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const customerMap = {}; customers.forEach(c => customerMap[c.id] = c);
    const petMap = {}; pets.forEach(p => petMap[p.id] = p);
    const todayRecords = records.filter(r => r.date === today);
    const todayRevenue = todayRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

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
    const weekRevenue = weekRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 이번 달 매출
    const thisMonth = today.slice(0, 7);
    const monthRecords = records.filter(r => r.date && r.date.startsWith(thisMonth));
    const monthRevenue = monthRecords.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 전체 매출 (경량 데이터에서 집계)
    const totalRevenue = allRecordsMin.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 미수금 집계 (경량 데이터에서 집계)
    const unpaidRecs = allRecordsMin.filter(r => r.paymentMethod === 'unpaid');
    const unpaidTotal = unpaidRecs.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 결제 수단별 통계 (이번 달)
    const paymentStats = { cash: 0, card: 0, transfer: 0, unpaid: 0, none: 0 };
    monthRecords.forEach(r => {
      const method = r.paymentMethod || 'none';
      paymentStats[method] = (paymentStats[method] || 0) + App.getRecordAmount(r);
    });

    // 일일 매출 목표
    const dailyGoal = Number(await DB.getSetting('dailyGoal')) || 0;

    // 미용사별 매출
    const groomerStats = {};
    monthRecords.forEach(r => {
      const name = r.groomer || '미지정';
      if (!groomerStats[name]) groomerStats[name] = { count: 0, revenue: 0 };
      groomerStats[name].count++;
      groomerStats[name].revenue += App.getRecordAmount(r);
    });
    const groomerStatList = Object.entries(groomerStats).sort((a, b) => b[1].revenue - a[1].revenue);
    const groomerMaxRev = groomerStatList.length > 0 ? groomerStatList[0][1].revenue || 1 : 1;

    // 매출 데이터 캐시
    this._records = records;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // O(N) 집계: 전체 레코드를 한 번만 순회하여 날짜별/월별 집계
    const dailyRevMap = {};
    const monthlyRevMap = {};
    const monthlyCntMap = {};
    records.forEach(r => {
      if (!r.date) return;
      const amt = App.getRecordAmount(r);
      const day = r.date;
      const mon = r.date.slice(0, 7);
      dailyRevMap[day] = (dailyRevMap[day] || 0) + amt;
      monthlyRevMap[mon] = (monthlyRevMap[mon] || 0) + amt;
      monthlyCntMap[mon] = (monthlyCntMap[mon] || 0) + 1;
    });

    // 이번 주 일별 차트 데이터
    const dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
    const weekData = [];
    let weekMax = 1;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const rev = dailyRevMap[ds] || 0;
      weekData.push({ label: dayLabels[i], date: ds, rev });
      if (rev > weekMax) weekMax = rev;
    }

    // 손익 데이터
    const fixedCost = Number(await DB.getSetting('monthlyFixedCost')) || 0;
    const variableCosts = await DB.getSetting('variableCosts') || {};
    const variableCost = variableCosts[thisMonth] || 0;
    const totalCost = fixedCost + variableCost;
    const profit = monthRevenue - totalCost;
    const profitMargin = monthRevenue > 0 ? Math.round((profit / monthRevenue) * 100) : 0;

    // 지난달 비교
    const lastMonthDate = new Date(year, month - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthRevenue = monthlyRevMap[lastMonth] || 0;
    const lastMonthVariableCost = variableCosts[lastMonth] || 0;
    const lastMonthProfit = lastMonthRevenue - fixedCost - lastMonthVariableCost;
    const monthChange = lastMonthRevenue > 0 ? Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthData = [];
    let monthMax = 1;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rev = dailyRevMap[ds] || 0;
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
      const rev = monthlyRevMap[tMonth] || 0;
      const cnt = monthlyCntMap[tMonth] || 0;
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
            ${unpaidRecs.some(r => r.date === today) ? '<div style="font-size:0.7rem;color:var(--text-muted)">(미수금 포함)</div>' : ''}
          </div>
        </div>
        <div class="stat-card gradient-blue">
          <div class="stat-icon blue">&#x1F4CA;</div>
          <div>
            <div class="stat-value" style="font-size:1.4rem">${App.formatCurrency(weekRevenue)}</div>
            <div class="stat-label">이번 주 매출 (${weekRecords.length}건)</div>
            ${unpaidRecs.some(r => r.date >= mondayStr && r.date <= sundayStr) ? '<div style="font-size:0.7rem;color:var(--text-muted)">(미수금 포함)</div>' : ''}
          </div>
        </div>
        <div class="stat-card gradient-green">
          <div class="stat-icon green">&#x1F4B0;</div>
          <div>
            <div class="stat-value" style="font-size:1.4rem">${App.formatCurrency(monthRevenue)}</div>
            <div class="stat-label">이번 달 매출 (${monthRecords.length}건)</div>
            ${unpaidRecs.some(r => r.date && r.date.startsWith(thisMonth)) ? '<div style="font-size:0.7rem;color:var(--text-muted)">(미수금 포함)</div>' : ''}
          </div>
        </div>
      </div>

      <!-- 매출 탭 분리 -->
      <div class="revenue-tabs" style="display:flex;gap:4px;margin-bottom:16px;background:var(--bg-white);border-radius:var(--radius);padding:4px;box-shadow:var(--shadow-xs)">
        <button class="revenue-tab active" data-tab="today" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;background:var(--primary);color:#fff">오늘</button>
        <button class="revenue-tab" data-tab="month" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;background:transparent;color:var(--text-secondary)">이번 달</button>
        <button class="revenue-tab" data-tab="analysis" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;background:transparent;color:var(--text-secondary)">분석</button>
      </div>

      <!-- 오늘 탭 -->
      <div class="revenue-tab-content" id="rev-tab-today" style="display:block">
        ${dailyGoal > 0 ? (() => {
          const pct = Math.min(Math.round((todayRevenue / dailyGoal) * 100), 100);
          const barColor = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--primary)' : 'var(--warning)';
          return '<div class="card" style="margin-bottom:16px"><div class="card-body" style="padding:16px 20px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-weight:700">오늘 매출 목표</span><span style="font-weight:800;color:' + barColor + '">' + pct + '%</span></div><div style="height:10px;background:var(--border-light);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:5px;transition:width 0.3s"></div></div><div style="display:flex;justify-content:space-between;margin-top:6px;font-size:0.82rem;color:var(--text-secondary)"><span>' + App.formatCurrency(todayRevenue) + '</span><span>목표: ' + App.formatCurrency(dailyGoal) + '</span></div></div></div>';
        })() : ''}

        ${unpaidRecs.length > 0 ? `
        <div class="card" style="margin-bottom:16px;border:1.5px solid var(--danger)">
          <div class="card-body" style="padding:16px 20px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,var(--danger-light),#FEE2E2)">
            <span style="font-size:1.5rem">&#x1F4B8;</span>
            <div class="flex-1">
              <div style="font-weight:800;color:var(--danger);font-size:1rem">미수금 경고</div>
              <div style="font-size:0.88rem;color:#991B1B;margin-top:2px">총 ${unpaidRecs.length}건 &middot; ${App.formatCurrency(unpaidTotal)}</div>
            </div>
            <a href="#records" style="color:var(--danger);font-weight:600;font-size:0.85rem">기록에서 확인 &rarr;</a>
          </div>
        </div>
        ` : ''}
      </div>

      <!-- 이번 달 탭 -->
      <div class="revenue-tab-content" id="rev-tab-month" style="display:none">
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
              <div style="display:flex;align-items:flex-end;gap:8px;height:200px;padding:0 4px">
                ${weekData.map(d => {
                  const pct = d.rev > 0 ? Math.max(5, Math.round((d.rev / weekMax) * 100)) : 0;
                  const isToday = d.date === today;
                  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${d.date}: ${App.formatCurrency(d.rev)}">
                    <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:700">${d.rev > 0 ? (d.rev >= 10000 ? Math.round(d.rev / 10000) + '만' : App.formatCurrency(d.rev)) : ''}</span>
                    <div style="width:100%;background:${isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:6px 6px 0 0;min-height:4px;height:${pct}%"></div>
                    <span style="font-size:0.78rem;font-weight:${isToday ? '800' : '500'};color:${isToday ? 'var(--primary)' : 'var(--text-muted)'}">${d.label}</span>
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
            <div style="display:flex;align-items:flex-end;gap:2px;height:200px;padding:0;overflow-x:auto">
              ${monthData.map(d => {
                  const pct = d.rev > 0 ? Math.max(5, Math.round((d.rev / monthMax) * 100)) : 0;
                  const isToday = d.date === today;
                  return `<div style="flex:1;min-width:14px;display:flex;flex-direction:column;align-items:center;gap:2px" title="${d.date}: ${App.formatCurrency(d.rev)}">
                    <div style="width:100%;background:${isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:4px 4px 0 0;min-height:2px;height:${pct}%"></div>
                    <span style="font-size:0.55rem;color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};font-weight:${isToday ? '800' : '400'}">${d.day % 5 === 1 || isToday ? d.day : ''}</span>
                  </div>`;
                }).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- 분석 탭 -->
      <div class="revenue-tab-content" id="rev-tab-analysis" style="display:none">
        <!-- 월별 매출 추이 -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4C8; 최근 6개월 매출 추이</span>
          </div>
          <div class="card-body">
            <div style="display:flex;align-items:flex-end;gap:12px;height:220px;padding:0 8px">
              ${monthlyTrend.map(m => {
                  const pct = m.rev > 0 ? Math.max(5, Math.round((m.rev / trendMax) * 100)) : 0;
                  const isCurrent = m.month === thisMonth;
                  return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px" title="${m.month}: ${App.formatCurrency(m.rev)} (${m.count}건)">
                    <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:700">${m.rev >= 10000 ? Math.round(m.rev / 10000) + '만' : (m.rev > 0 ? App.formatCurrency(m.rev) : '')}</span>
                    <div style="width:100%;background:${isCurrent ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)'};border-radius:8px 8px 0 0;min-height:4px;height:${pct}%"></div>
                    <div style="text-align:center">
                      <div style="font-size:0.78rem;font-weight:${isCurrent ? '800' : '500'};color:${isCurrent ? 'var(--primary)' : 'var(--text-muted)'}">${m.label}</div>
                      <div style="font-size:0.65rem;color:var(--text-muted)">${m.count}건</div>
                    </div>
                  </div>`;
                }).join('')}
            </div>
          </div>
        </div>

        <!-- 미용사별 매출 -->
        ${groomerStatList.length > 0 ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4CB; 이번 달 미용사별 매출</span>
          </div>
          <div class="card-body" style="padding:16px">
            ${groomerStatList.map(([name, stats]) => {
              const pct = Math.round((stats.revenue / groomerMaxRev) * 100);
              const totalMonthRev = groomerStatList.reduce((s, [, st]) => s + st.revenue, 0);
              const sharePct = totalMonthRev > 0 ? Math.round((stats.revenue / totalMonthRev) * 100) : 0;
              return `
                <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                    <span style="font-weight:800;font-size:1rem">${App.escapeHtml(name)}</span>
                    <span style="font-weight:700;color:var(--primary)">${App.formatCurrency(stats.revenue)}</span>
                  </div>
                  <div style="height:8px;background:var(--border-light);border-radius:4px;overflow:hidden;margin-bottom:8px">
                    <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),#818CF8);border-radius:4px"></div>
                  </div>
                  <div style="display:flex;gap:16px;font-size:0.82rem;color:var(--text-secondary)">
                    <span>&#x2702; ${stats.count}건</span>
                    <span>비율 ${sharePct}%</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}

        <!-- 이번 달 손익 -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4CA; 이번 달 손익</span>
          </div>
          <div class="card-body">
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
              <span>매출</span>
              <strong style="color:var(--success)">${App.formatCurrency(monthRevenue)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
              <span>고정비</span>
              <strong class="text-danger">-${App.formatCurrency(fixedCost)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
              <span>변동비 (이번 달)</span>
              <div style="display:flex;align-items:center;gap:6px">
                <input type="number" id="r-variableCost" value="${variableCost}"
                  placeholder="0" min="0" step="10000"
                  style="width:100px;text-align:right;padding:6px 10px;font-size:0.9rem"
                  onchange="App.pages.revenue.saveVariableCost(this.value)">
                <span style="font-size:0.85rem;color:var(--text-muted)">원</span>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;padding:14px 0;font-size:1.1rem">
              <span style="font-weight:700">순이익</span>
              <strong style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">
                ${profit >= 0 ? '+' : ''}${App.formatCurrency(profit)}
              </strong>
            </div>
            <div style="background:var(--bg);border-radius:20px;height:28px;overflow:hidden;margin-top:8px;position:relative">
              <div style="height:100%;width:${Math.min(100, Math.max(0, profitMargin))}%;background:${profit >= 0 ? 'var(--success)' : 'var(--danger)'};border-radius:20px;transition:width 0.3s"></div>
              <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:0.8rem;font-weight:700">
                이익률 ${profitMargin}%
              </span>
            </div>
            <!-- 지난달 비교 -->
            <div style="display:flex;gap:12px;margin-top:12px">
              <div style="flex:1;background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center">
                <div style="font-size:0.8rem;color:var(--text-muted)">지난달 매출</div>
                <div style="font-weight:700">${App.formatCurrency(lastMonthRevenue)}</div>
              </div>
              <div style="flex:1;background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center">
                <div style="font-size:0.8rem;color:var(--text-muted)">지난달 순이익</div>
                <div style="font-weight:700">${App.formatCurrency(lastMonthProfit)}</div>
              </div>
              <div style="flex:1;background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center">
                <div style="font-size:0.8rem;color:var(--text-muted)">전월 대비</div>
                <div style="font-weight:700;color:${monthChange >= 0 ? 'var(--success)' : 'var(--danger)'}">${monthChange >= 0 ? '▲' : '▼'} ${Math.abs(monthChange)}%</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 전체 매출 요약 -->
        <div class="card">
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
      </div>
    `;
  },

  async init() {
    // 탭 전환
    document.querySelectorAll('.revenue-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.revenue-tab').forEach(t => { t.style.background = 'transparent'; t.style.color = 'var(--text-secondary)'; t.classList.remove('active'); });
        tab.style.background = 'var(--primary)'; tab.style.color = '#fff'; tab.classList.add('active');
        document.querySelectorAll('.revenue-tab-content').forEach(c => c.style.display = 'none');
        document.getElementById('rev-tab-' + tab.dataset.tab).style.display = 'block';
      });
    });

    // 세무 자료 내보내기
    document.getElementById('btn-revenue-export')?.addEventListener('click', () => {
      App.pages.records?.showExportModal();
    });

    // 일일 정산표
    document.getElementById('btn-revenue-daily-report')?.addEventListener('click', () => {
      App.pages.records?.showDailyReport();
    });
  },

  async saveVariableCost(value) {
    const thisMonth = App.getToday().slice(0, 7);
    const costs = await DB.getSetting('variableCosts') || {};
    costs[thisMonth] = Number(value) || 0;
    await DB.setSetting('variableCosts', costs);
    App.showToast('변동비가 저장되었습니다.');
  }
};
