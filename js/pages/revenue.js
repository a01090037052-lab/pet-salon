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
    // 어제 매출 (비교용)
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return App.formatLocalDate(d); })();
    const yesterdayRevenue = records.filter(r => r.date === yesterday).reduce((sum, r) => sum + App.getRecordAmount(r), 0);

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

    // 미수금 집계 (경량 데이터에서 집계)
    const unpaidRecs = allRecordsMin.filter(r => r.paymentMethod === 'unpaid');
    const unpaidTotal = unpaidRecs.reduce((sum, r) => sum + App.getRecordAmount(r), 0);

    // 결제 수단별 통계 (이번 달)
    const paymentStats = { cash: 0, card: 0, transfer: 0, unpaid: 0, none: 0 };
    monthRecords.forEach(r => {
      const method = r.paymentMethod || 'none';
      paymentStats[method] = (paymentStats[method] || 0) + App.getRecordAmount(r);
    });

    // 오늘 결제 수단 요약 (건수 + 금액)
    const todayPayment = { cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, transfer: { count: 0, amount: 0 }, unpaid: { count: 0, amount: 0 } };
    todayRecords.forEach(r => {
      const m = r.paymentMethod || 'none';
      if (todayPayment[m]) {
        todayPayment[m].count++;
        todayPayment[m].amount += App.getRecordAmount(r);
      }
    });

    // Same-day pacing: 지난달 같은 일차까지의 매출
    const _pNow = new Date();
    const todayDay = _pNow.getDate();
    const _pLastM = new Date(_pNow.getFullYear(), _pNow.getMonth() - 1, 1);
    const _pLmStr = `${_pLastM.getFullYear()}-${String(_pLastM.getMonth() + 1).padStart(2, '0')}`;
    const _pLastMonthDays = new Date(_pNow.getFullYear(), _pNow.getMonth(), 0).getDate();
    const _pCompareDay = Math.min(todayDay, _pLastMonthDays);
    const lastMonthPacing = records.filter(r => {
      return r.date && r.date.startsWith(_pLmStr) && parseInt(r.date.slice(8, 10)) <= _pCompareDay;
    }).reduce((sum, r) => sum + App.getRecordAmount(r), 0);
    const pacingChange = lastMonthPacing > 0 ? Math.round(((monthRevenue - lastMonthPacing) / lastMonthPacing) * 100) : 0;

    // 요일별 패턴 (최근 8주 평균)
    const eightWeeksAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 56); return App.formatLocalDate(d); })();
    const dayOfWeekStats = [0, 0, 0, 0, 0, 0, 0];
    const dowDateSet = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
    records.forEach(r => {
      if (!r.date || r.date < eightWeeksAgo) return;
      const dow = new Date(r.date + 'T00:00:00').getDay();
      dayOfWeekStats[dow] += App.getRecordAmount(r);
      dowDateSet[dow].add(r.date);
    });
    const dowLabels = ['일', '월', '화', '수', '목', '금', '토'];
    const dowData = dowLabels.map((label, i) => ({
      label,
      avg: dowDateSet[i].size > 0 ? Math.round(dayOfWeekStats[i] / dowDateSet[i].size) : 0,
      days: dowDateSet[i].size
    })).sort((a, b) => b.avg - a.avg);
    const dowMax = dowData.length > 0 ? dowData[0].avg || 1 : 1;
    const hasEnoughDowData = dowData.some(d => d.days >= 4);

    // 월 매출 목표
    const monthlyGoal = Number(await DB.getSetting('monthlyGoal')) || 0;

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

      <!-- 매출 탭 분리 (기본: 이번 달) -->
      <div class="revenue-tabs" style="display:flex;gap:4px;margin-bottom:16px;background:var(--bg-white);border-radius:var(--radius);padding:4px;box-shadow:var(--shadow-xs)">
        <button class="revenue-tab" data-tab="today" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;background:transparent;color:var(--text-secondary)">오늘</button>
        <button class="revenue-tab active" data-tab="month" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;background:var(--primary);color:#fff">이번 달</button>
        <button class="revenue-tab" data-tab="analysis" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.85rem;cursor:pointer;background:transparent;color:var(--text-secondary)">인사이트</button>
      </div>

      <!-- 오늘 탭 -->
      <div class="revenue-tab-content" id="rev-tab-today" style="display:none">
        ${monthlyGoal > 0 ? (() => {
          const pct = Math.min(Math.round((monthRevenue / monthlyGoal) * 100), 100);
          const barColor = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--primary)' : 'var(--warning)';
          return '<div class="card" style="margin-bottom:16px"><div class="card-body" style="padding:16px 20px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-weight:700">이번 달 매출 목표</span><span style="font-weight:800;color:' + barColor + '">' + pct + '%</span></div><div style="height:10px;background:var(--border-light);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:5px;transition:width 0.3s"></div></div><div style="display:flex;justify-content:space-between;margin-top:6px;font-size:0.82rem;color:var(--text-secondary)"><span>' + App.formatCurrency(monthRevenue) + '</span><span>목표: ' + App.formatCurrency(monthlyGoal) + '</span></div></div></div>';
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

        <!-- 오늘 매출 내역 -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <span class="card-title">&#x1F4CB; 오늘 매출 내역 (${todayRecords.length}건)</span>
          </div>
          <div class="card-body" style="padding:0">
            ${todayRecords.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:20px">아직 오늘 기록이 없습니다</p>' :
              `<div style="overflow-x:auto"><table class="data-table" style="font-size:0.85rem">
                <thead><tr><th>시간</th><th>고객/반려견</th><th>금액</th><th>결제</th></tr></thead>
                <tbody>${todayRecords.sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || ''))).slice(0, 10).map(r => {
                  const c = customerMap[r.customerId];
                  const p = petMap[r.petId];
                  const payLabel = { cash: '현금', card: '카드', transfer: '이체', unpaid: '미결제' };
                  const time = r.createdAt ? new Date(r.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                  return `<tr${r.paymentMethod === 'unpaid' ? ' style="background:var(--warning-light)"' : ''}>
                    <td>${time}</td>
                    <td>${App.escapeHtml((c?.name || '-') + '/' + (p?.name || '-'))}</td>
                    <td><strong>${App.formatCurrency(App.getRecordAmount(r))}</strong></td>
                    <td>${payLabel[r.paymentMethod] || '-'}</td>
                  </tr>`;
                }).join('')}</tbody>
              </table></div>
              ${todayRecords.length > 10 ? '<div style="text-align:center;padding:8px;font-size:0.82rem;color:var(--text-muted)">최근 10건 표시 중</div>' : ''}`}
          </div>
        </div>

        <!-- 오늘 결제 수단 요약 (건수 + 금액) -->
        ${todayRecords.length > 0 ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-body" style="padding:12px 20px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
            ${todayPayment.card.count > 0 ? `<span style="font-size:0.88rem"><strong style="color:var(--primary)">카드</strong> ${todayPayment.card.count}건 · ${App.formatCurrency(todayPayment.card.amount)}</span>` : ''}
            ${todayPayment.cash.count > 0 ? `<span style="font-size:0.88rem"><strong style="color:var(--success)">현금</strong> ${todayPayment.cash.count}건 · ${App.formatCurrency(todayPayment.cash.amount)}</span>` : ''}
            ${todayPayment.transfer.count > 0 ? `<span style="font-size:0.88rem"><strong style="color:var(--info)">이체</strong> ${todayPayment.transfer.count}건 · ${App.formatCurrency(todayPayment.transfer.amount)}</span>` : ''}
            ${todayPayment.unpaid.count > 0 ? `<span style="font-size:0.88rem"><strong style="color:var(--danger)">미결제</strong> ${todayPayment.unpaid.count}건 · ${App.formatCurrency(todayPayment.unpaid.amount)}</span>` : ''}
          </div>
        </div>
        ` : ''}

        <!-- 이번 주 일별 차트 -->
        <div class="card chart-card">
          <div class="card-header">
            <span class="card-title">&#x1F4CA; 이번 주 매출 &middot; ${App.formatCurrency(weekRevenue)}</span>
          </div>
          <div class="card-body chart-wrapper">
            ${(() => {
              const niceMax = (v) => { if (v <= 0) return 100000; const mag = Math.pow(10, Math.floor(Math.log10(v))); const norm = v / mag; return Math.ceil(norm * 4) / 4 * mag; };
              const gMax = niceMax(weekMax);
              const weekAvg = weekData.filter(d => d.rev > 0).length > 0 ? Math.round(weekData.reduce((s, d) => s + d.rev, 0) / weekData.filter(d => d.rev > 0).length) : 0;
              const avgPct = weekAvg > 0 ? Math.round((weekAvg / gMax) * 90) : 0;
              return `<div style="position:relative;height:200px;padding:0 4px;margin-left:32px">
                <div style="position:absolute;left:0;right:0;bottom:45%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-34px;top:-8px;font-size:0.72rem;color:var(--text-muted)">${Math.round(gMax * 0.5 / 10000)}만</span></div>
                <div style="position:absolute;left:0;right:0;bottom:90%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-34px;top:-8px;font-size:0.72rem;color:var(--text-muted)">${Math.round(gMax / 10000)}만</span></div>
                ${weekAvg > 0 ? `<div style="position:absolute;left:0;right:0;bottom:${avgPct}%;border-bottom:3px dotted rgba(245,158,11,0.5);z-index:3"><span style="position:absolute;left:0;top:-20px;font-size:0.72rem;color:var(--warning);font-weight:700;background:var(--bg-white);padding:1px 6px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">평균 ${Math.round(weekAvg / 10000)}만</span></div>` : ''}
                <div style="display:flex;gap:8px;height:160px;position:relative;z-index:1">
                  ${weekData.map(d => {
                    const barH = d.rev > 0 ? Math.max(8, Math.round((d.rev / gMax) * 130)) : 4;
                    const isToday = d.date === today;
                    const barBg = d.rev === 0 ? 'var(--border-light)' : isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)';
                    const label = d.rev >= 10000 ? Math.round(d.rev / 10000) + '만' : d.rev > 0 ? App.formatCurrency(d.rev) : '';
                    return `<div style="flex:1;position:relative;text-align:center">
                      <span style="font-size:0.75rem;color:${isToday ? 'var(--success)' : 'var(--text-secondary)'};font-weight:800;position:absolute;top:0;left:0;right:0">${label}</span>
                      <div style="position:absolute;bottom:20px;left:10%;right:10%;height:${barH}px;background:${barBg};border-radius:6px 6px 0 0"></div>
                      <span style="font-size:0.82rem;font-weight:${isToday ? '800' : '600'};color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};position:absolute;bottom:0;left:0;right:0">${d.label}</span>
                    </div>`;
                  }).join('')}
                </div>
              </div>`;
            })()}
          </div>
        </div>
      </div>

      <!-- 이번 달 탭 (기본) -->
      <div class="revenue-tab-content" id="rev-tab-month" style="display:block">
        <!-- 이번 달 페이스 -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F3C3; 이번 달 페이스 (${todayDay}일차)</span>
          </div>
          <div class="card-body">
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
              <span>이번 달 (${todayDay}일차)</span>
              <strong style="font-size:1.1rem">${App.formatCurrency(monthRevenue)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
              <span>지난달 (${todayDay}일차)</span>
              <strong>${App.formatCurrency(lastMonthPacing)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:14px 0;align-items:center">
              <span style="font-weight:700">전월 동일 시점 대비</span>
              ${lastMonthPacing > 0 ? `<strong style="font-size:1.1rem;color:${pacingChange >= 0 ? 'var(--success)' : 'var(--danger)'}">${pacingChange >= 0 ? '▲' : '▼'} ${Math.abs(pacingChange)}% ${pacingChange >= 0 ? '앞서가는 중' : '뒤처지는 중'}</strong>` : '<span style="color:var(--text-muted)">비교 데이터 없음</span>'}
            </div>
          </div>
        </div>

        <!-- 이번 달 결제 수단별 -->
        <div class="card" style="margin-bottom:20px">
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

        <!-- 이번 달 일별 차트 -->
        <div class="card chart-card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4C5; 이번 달 일별 매출 (${year}년 ${month + 1}월)</span>
          </div>
          <div class="card-body chart-wrapper">
            ${(() => {
              const niceMax = (v) => { if (v <= 0) return 100000; const mag = Math.pow(10, Math.floor(Math.log10(v))); const norm = v / mag; return Math.ceil(norm * 4) / 4 * mag; };
              const mMax = niceMax(monthMax);
              const mAvg = monthData.filter(d => d.rev > 0).length > 0 ? Math.round(monthData.reduce((s, d) => s + d.rev, 0) / monthData.filter(d => d.rev > 0).length) : 0;
              const mAvgPct = mAvg > 0 ? Math.round((mAvg / mMax) * 90) : 0;
              return `<div style="position:relative;height:200px;padding:0;overflow-x:auto;margin-left:32px">
                <div style="position:absolute;left:0;right:0;bottom:45%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-34px;top:-8px;font-size:0.72rem;color:var(--text-muted)">${Math.round(mMax * 0.5 / 10000)}만</span></div>
                <div style="position:absolute;left:0;right:0;bottom:90%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-34px;top:-8px;font-size:0.72rem;color:var(--text-muted)">${Math.round(mMax / 10000)}만</span></div>
                ${mAvg > 0 ? `<div style="position:absolute;left:0;right:0;bottom:${mAvgPct}%;border-bottom:3px dotted rgba(245,158,11,0.5);z-index:3"><span style="position:absolute;left:0;top:-20px;font-size:0.72rem;color:var(--warning);font-weight:700;background:var(--bg-white);padding:1px 6px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">일평균 ${Math.round(mAvg / 10000)}만</span></div>` : ''}
                <div style="display:flex;gap:2px;height:160px;position:relative;z-index:1">
                  ${monthData.map(d => {
                    const barH = d.rev > 0 ? Math.max(4, Math.round((d.rev / mMax) * 140)) : 2;
                    const isToday = d.date === today;
                    const barBg = d.rev === 0 ? 'var(--border-light)' : isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)';
                    return `<div style="flex:1;min-width:8px;position:relative" title="${d.date}: ${App.formatCurrency(d.rev)}">
                      <div style="position:absolute;bottom:16px;left:0;right:0;height:${barH}px;background:${barBg};border-radius:3px 3px 0 0"></div>
                      <span style="font-size:0.68rem;color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};font-weight:${isToday ? '800' : '500'};position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);white-space:nowrap">${isToday ? d.day : (d.day % 5 === 1 && Math.abs(d.day - new Date().getDate()) > 1 ? d.day : '')}</span>
                    </div>`;
                  }).join('')}
                </div>
              </div>`;
            })()}
          </div>
        </div>

        <!-- 미용사별 매출 -->
        ${groomerStatList.length > 0 ? `
        <div class="card" style="margin-top:20px">
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
      </div>

      <!-- 인사이트 탭 -->
      <div class="revenue-tab-content" id="rev-tab-analysis" style="display:none">
        <!-- 요일별 패턴 -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4C6; 요일별 평균 매출 (최근 8주)</span>
          </div>
          <div class="card-body">
            ${!hasEnoughDowData ? '<p style="color:var(--text-muted);text-align:center;padding:12px">데이터가 쌓이면 요일별 패턴이 표시됩니다 (최소 4주)</p>' :
              `<div style="display:flex;flex-direction:column;gap:10px">
                ${dowData.map((d, i) => {
                  const pct = Math.max(5, Math.round((d.avg / dowMax) * 100));
                  const isTop = i === 0;
                  const isBottom = i === dowData.length - 1;
                  return `<div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:4px;align-items:center">
                      <span style="font-weight:${isTop ? '800' : '600'};font-size:0.9rem">${d.label}요일${isTop ? ' <span style="font-size:0.7rem;color:var(--success)">(최다)</span>' : ''}${isBottom ? ' <span style="font-size:0.7rem;color:var(--text-muted)">(최소)</span>' : ''}</span>
                      <span style="font-weight:700;font-size:0.9rem;color:${isTop ? 'var(--success)' : 'var(--text-secondary)'}">${d.avg >= 10000 ? Math.round(d.avg / 10000) + '만원' : App.formatCurrency(d.avg)}</span>
                    </div>
                    <div style="height:8px;background:var(--border-light);border-radius:4px;overflow:hidden">
                      <div style="height:100%;width:${pct}%;background:${isTop ? 'var(--success)' : 'var(--primary)'};border-radius:4px"></div>
                    </div>
                  </div>`;
                }).join('')}
              </div>
              <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:0.82rem;color:var(--text-muted);text-align:center">
                ${dowData[0].label}요일이 평균 매출 1위, ${dowData[dowData.length - 1].label}요일이 최저
              </div>`}
          </div>
        </div>

        <!-- 월별 매출 추이 -->
        <div class="card chart-card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4C8; 최근 6개월 매출 추이</span>
          </div>
          <div class="card-body chart-wrapper">
            ${(() => {
              const niceMax = (v) => { if (v <= 0) return 1000000; const mag = Math.pow(10, Math.floor(Math.log10(v))); const norm = v / mag; return Math.ceil(norm * 4) / 4 * mag; };
              const tMax = niceMax(trendMax);
              const tAvg = monthlyTrend.filter(m => m.rev > 0).length > 0 ? Math.round(monthlyTrend.reduce((s, m) => s + m.rev, 0) / monthlyTrend.filter(m => m.rev > 0).length) : 0;
              const tAvgPct = tAvg > 0 ? Math.round((tAvg / tMax) * 90) : 0;
              return `<div style="position:relative;height:220px;padding:0 8px;margin-left:36px">
                <div style="position:absolute;left:0;right:0;bottom:45%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-38px;top:-8px;font-size:0.72rem;color:var(--text-muted)">${Math.round(tMax * 0.5 / 10000)}만</span></div>
                <div style="position:absolute;left:0;right:0;bottom:90%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-38px;top:-8px;font-size:0.72rem;color:var(--text-muted)">${Math.round(tMax / 10000)}만</span></div>
                <div style="display:flex;gap:12px;height:180px;position:relative;z-index:1">
                  ${monthlyTrend.map(m => {
                    const barH = m.rev > 0 ? Math.max(8, Math.round((m.rev / tMax) * 130)) : 4;
                    const isCurrent = m.month === thisMonth;
                    const barBg = m.rev === 0 ? 'var(--border-light)' : isCurrent ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)';
                    const label = m.rev >= 10000 ? Math.round(m.rev / 10000) + '만' : (m.rev > 0 ? App.formatCurrency(m.rev) : '');
                    return `<div style="flex:1;position:relative;text-align:center" title="${m.month}: ${App.formatCurrency(m.rev)} (${m.count}건)">
                      <span style="font-size:0.78rem;color:${isCurrent ? 'var(--success)' : 'var(--text-secondary)'};font-weight:800;position:absolute;top:0;left:0;right:0">${label}</span>
                      <div style="position:absolute;bottom:36px;left:10%;right:10%;height:${barH}px;background:${barBg};border-radius:8px 8px 0 0"></div>
                      <div style="position:absolute;bottom:0;left:0;right:0;text-align:center">
                        <div style="font-size:0.82rem;font-weight:${isCurrent ? '800' : '600'};color:${isCurrent ? 'var(--primary)' : 'var(--text-muted)'}">${m.label}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted)">${m.count}건</div>
                      </div>
                    </div>`;
                  }).join('')}
                </div>
              </div>`;
            })()}
            ${tAvg > 0 ? `<div style="text-align:center;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-light);font-size:0.85rem;color:var(--text-secondary)">월평균 <strong style="color:var(--warning)">${App.formatCurrency(tAvg)}</strong></div>` : ''}
            </div>
          </div>

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
                  style="width:90px;text-align:right;padding:4px 8px;font-size:0.85rem"
                  onchange="App.pages.revenue.saveVariableCost(this.value)">
                <span style="font-size:0.8rem;color:var(--text-muted)">원</span>
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

        <!-- 상세 분석 링크 -->
        <a href="#analytics" style="display:block;text-align:center;padding:16px;background:var(--bg-white);border-radius:var(--radius);box-shadow:var(--shadow-xs);color:var(--primary);font-weight:700;font-size:0.9rem;text-decoration:none;margin-bottom:20px">
          &#x1F4CA; 상세 분석 보기 (고객, 서비스, 미용사 등) &rarr;
        </a>

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
    App.handleRoute();
  }
};
