// ========== Revenue (매출) Page ==========
App.pages.revenue = {
  async render(container) {
   try {
    const today = App.getToday();
    // 최근 1년 records만 로드 (성능 최적화), 미수금/전체 매출은 경량 집계
    const oneYearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return App.formatLocalDate(d); })();
    // 미수금은 paymentMethod 인덱스로 직접 조회 (예전엔 전체 기록을 다 읽어 미수금만 골라냈다 — 몇 년 쌓이면 매출 페이지가 느려진다)
    const [records, unpaidRecs, customers, pets, prepaidAll] = await Promise.all([
      DB.getByDateRange('records', 'date', oneYearAgo, '9999-12-31'),
      DB.getByIndex('records', 'paymentMethod', 'unpaid'),
      DB.getAllLight('customers', ['memo', 'address']),
      DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle']),
      Prepaid.getAllEntries()
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
    // 서비스(무료)로 제공한 금액 — 매출에는 안 들어간다 (참고용)
    const monthComp = monthRecords.reduce((sum, r) => sum + (Number(r.complimentaryTotal) || 0), 0);

    // 미수금 집계 — 전체 기간
    const unpaidTotal = unpaidRecs.reduce((sum, r) => sum + App.getUnpaidAmount(r), 0);

    // 이번 달 미수금 / 실입금
    // 매출(monthRevenue)은 청구 기준이라 미수금을 포함한다 — 서비스를 제공한 시점에
    // 발생한 매출이므로 세무상으로도 이게 맞다. 다만 통장에 들어온 돈은 아니므로
    // 현금흐름 판단이 흐려지지 않도록 실입금액을 나란히 보여준다.
    const monthUnpaid = monthRecords
      .filter(r => r.paymentMethod === 'unpaid')
      .reduce((sum, r) => sum + App.getUnpaidAmount(r), 0);
    // 수금일(paidAt)이 있으면 그 달에 들어온 돈으로 센다 — 지난달 미수금을 이번 달에 받았다면 이번 달 실입금이다
    // 정액권으로 낸 몫은 이미 충전한 날 받은 돈이라 빼고(나머지만), 대신 이번 달 충전(받은 돈)을 더하고 환불(돌려준 돈)을 뺀다
    // 계산식은 Prepaid.monthCollected 한 곳에 두고 자동 테스트로 지킨다 (tests/prepaid.test.js)
    const { collected: monthCollected, charge: monthCharge, refund: monthRefund } = Prepaid.monthCollected(records, prepaidAll, thisMonth);
    const prepaidOutstanding = prepaidAll.reduce((s, e) => s + (Number(e.credit) || 0), 0);

    // 결제 수단별 (이번 달 실입금 기준) — 미용 결제 + 정액권 충전 − 환불. 합계가 위 '실제 받은 돈'과 같다 (Prepaid.monthByMethod, 테스트 있음)
    // 정액권 사용·미수는 돈이 들어온 게 아니라 합계 밖 참고 줄로
    const byMethod = Prepaid.monthByMethod(records, prepaidAll, thisMonth);
    const methodName = { card: '카드', cash: '현금', transfer: '계좌이체', none: '수단 미선택' };
    const methodColor = { card: 'var(--primary)', cash: 'var(--success)', transfer: 'var(--info)', none: 'var(--text-muted)' };
    const payRows = [];
    ['card', 'cash', 'transfer', 'none'].forEach(m => { if (byMethod.records[m]) payRows.push({ label: methodName[m], amount: byMethod.records[m], color: methodColor[m] }); });
    ['card', 'cash', 'transfer', 'none'].forEach(m => { if (byMethod.charge[m]) payRows.push({ label: `정액권 충전 (${methodName[m]})`, amount: byMethod.charge[m], color: 'var(--warning)' }); });
    ['card', 'cash', 'transfer', 'none'].forEach(m => { if (byMethod.refund[m]) payRows.push({ label: `정액권 환불 (${m === 'card' ? '카드 취소' : methodName[m]})`, amount: -byMethod.refund[m], color: 'var(--danger)' }); });

    // 오늘 결제 수단 요약 (건수 + 금액)
    const todayPayment = { cash: { count: 0, amount: 0 }, card: { count: 0, amount: 0 }, transfer: { count: 0, amount: 0 }, prepaid: { count: 0, amount: 0 }, unpaid: { count: 0, amount: 0 } };
    todayRecords.forEach(r => {
      const sp = Prepaid.splitOf(r);
      if (sp.used > 0) { todayPayment.prepaid.count++; todayPayment.prepaid.amount += sp.used; }
      const m = r.paymentMethod || 'none';
      if (todayPayment[m] && m !== 'prepaid' && sp.rest > 0) {
        todayPayment[m].count++;
        todayPayment[m].amount += sp.rest;
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
    const pacingChange = lastMonthPacing > 0 ? Math.round(((monthRevenue - lastMonthPacing) / lastMonthPacing) * 100) : null;

    // 월 매출 목표
    const monthlyGoal = Number(await DB.getSetting('monthlyGoal')) || 0;

    // 미용사별 매출 — 미용사 2명 이상 등록 시에만 표시 (1인 살롱엔 의미 없음)
    const multiGroomer = await App.isMultiGroomer();
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
    records.forEach(r => {
      if (!r.date) return;
      const amt = App.getRecordAmount(r);
      const day = r.date;
      const mon = r.date.slice(0, 7);
      dailyRevMap[day] = (dailyRevMap[day] || 0) + amt;
      monthlyRevMap[mon] = (monthlyRevMap[mon] || 0) + amt;
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
    const variableCost = Number(variableCosts[thisMonth]) || 0; // 예전 저장값이 문자열이면 고정비와 이어붙지 않게 숫자로
    const totalCost = fixedCost + variableCost;
    const profit = monthRevenue - totalCost;
    const profitMargin = monthRevenue > 0 ? Math.round((profit / monthRevenue) * 100) : 0;

    // 지난달 비교
    const lastMonthDate = new Date(year, month - 1, 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const lastMonthRevenue = monthlyRevMap[lastMonth] || 0;
    const lastMonthVariableCost = Number(variableCosts[lastMonth]) || 0;
    const lastMonthProfit = lastMonthRevenue - fixedCost - lastMonthVariableCost;
    // 손익 카드의 '전월 대비'도 페이스 카드와 같은 정의(지난달 같은 일차까지)를 쓴다.
    // 예전엔 '이번 달 지금까지 vs 지난달 전체'라 5일엔 -85%, 상단엔 +10% 가 동시에 보였다.
    const monthChange = pacingChange;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthData = [];
    let monthMax = 1;
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rev = dailyRevMap[ds] || 0;
      monthData.push({ day: d, date: ds, rev });
      if (rev > monthMax) monthMax = rev;
    }

    // 이번 달 주별 합계 (1~7일 / 8~14일 / 15~21일 / 22~28일 / 29~말일)
    const weeklyData = [];
    for (let w = 0; w < 5; w++) {
      const sd = w * 7 + 1;
      if (sd > daysInMonth) break;
      const ed = Math.min(sd + 6, daysInMonth);
      const rev = monthData.slice(sd - 1, ed).reduce((s, d) => s + d.rev, 0);
      weeklyData.push({ label: `${w + 1}주`, startDay: sd, endDay: ed, rev });
    }
    const currentWeekIdx = Math.floor((todayDay - 1) / 7);

    const payBarBase = payRows.filter(r => r.amount > 0).reduce((a, r) => a + r.amount, 0) || 1;
    // 첫 달(지난달 기록이 하나도 없으면) — 비교·손익 카드는 숨기고 한 줄 안내만
    const hasPrevMonth = records.some(r => r.date && r.date < thisMonth + '-01');

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">${App.icon('coins')} 매출</h1>
          <p class="page-subtitle">매출 현황 및 통계</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" id="btn-revenue-daily-report">${App.icon('receipt')} 일일 정산표</button>
        </div>
      </div>

      <!-- 매출 탭 분리 (기본: 이번 달). 요일별·월별 추이 같은 분석 차트는 분석 화면에만 둔다 -->
      <div class="revenue-tabs" style="display:flex;gap:4px;margin-bottom:16px;background:var(--bg-white);border-radius:var(--radius);padding:4px;box-shadow:var(--shadow-xs)">
        <button class="revenue-tab" data-tab="today" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.93rem;cursor:pointer;background:transparent;color:var(--text-secondary)">오늘</button>
        <button class="revenue-tab active" data-tab="month" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.93rem;cursor:pointer;background:var(--primary);color:var(--text-on-primary, #fff)">이번 달</button>
      </div>

      <!-- 오늘 탭 -->
      <div class="revenue-tab-content" id="rev-tab-today" style="display:none">
        ${monthlyGoal > 0 ? (() => {
          const pct = Math.min(Math.round((monthRevenue / monthlyGoal) * 100), 100);
          const barColor = pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--primary)' : 'var(--warning)';
          // 미수금이 있으면 실입금액을 함께 보여준다 — 달성률은 청구 기준이라
          // 100% 여도 통장에 다 들어온 게 아닐 수 있다.
          const unpaidNote = monthUnpaid > 0
            ? '<div style="margin-top:6px;font-size:0.93rem;color:var(--text-muted);display:flex;justify-content:space-between;gap:8px"><span>이번 달 받은 돈 ' + App.formatCurrency(monthCollected) + '</span><span style="color:var(--danger)">미결제 ' + App.formatCurrency(monthUnpaid) + '</span></div>'
            : '';
          return '<div class="card" style="margin-bottom:16px"><div class="card-body" style="padding:16px 20px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-weight:700">이번 달 매출 목표</span><span style="font-weight:800;color:' + barColor + '">' + pct + '%</span></div><div style="height:10px;background:var(--border-light);border-radius:5px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:5px;transition:width 0.3s"></div></div><div style="display:flex;justify-content:space-between;margin-top:6px;font-size:0.93rem;color:var(--text-secondary)"><span>' + App.formatCurrency(monthRevenue) + '</span><span>목표: ' + App.formatCurrency(monthlyGoal) + '</span></div>' + unpaidNote + '</div></div>';
        })() : ''}

        ${unpaidRecs.length > 0 ? `
        <div class="card" style="margin-bottom:16px;border:1.5px solid var(--danger)">
          <div class="card-body" style="padding:16px 20px;display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,var(--danger-light),var(--danger-bg-soft))">
            <span style="font-size:1.5rem">${App.icon('cash')}</span>
            <div class="flex-1">
              <div style="font-weight:800;color:var(--danger);font-size:1rem">미결제</div>
              <div style="font-size:0.93rem;color:var(--danger-text-strong);margin-top:2px">총 ${unpaidRecs.length}건 &middot; ${App.formatCurrency(unpaidTotal)}</div>
            </div>
            <a href="#records" style="color:var(--danger);font-weight:600;font-size:0.93rem">기록에서 확인 &rarr;</a>
          </div>
        </div>
        ` : ''}

        <!-- 오늘 매출 내역 -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-header">
            <span class="card-title">${App.icon('list')} 오늘 매출 내역 (${todayRecords.length}건)</span>
          </div>
          <div class="card-body" style="padding:8px 16px">
            ${todayRecords.length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:12px 0">아직 오늘 기록이 없습니다</p>' :
              todayRecords.sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || ''))).slice(0, 10).map(r => {
                const c = customerMap[r.customerId];
                const p = petMap[r.petId];
                const payLabel = { cash: '현금', card: '카드', transfer: '계좌이체', unpaid: '미결제', prepaid: '정액권' };
                const time = r.createdAt ? new Date(r.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-';
                const isUnpaid = r.paymentMethod === 'unpaid';
                return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-light)${isUnpaid ? ';border-left:3px solid var(--danger);padding-left:10px' : ''}">
                  <span style="font-weight:700;color:var(--primary);min-width:42px;font-size:0.93rem">${time}</span>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:0.93rem;font-weight:600">${App.escapeHtml(p?.name || '-')} <span style="color:var(--text-muted);font-weight:400;font-size:0.93rem">${App.escapeHtml(App.getCustomerLabel(c))}</span></div>
                  </div>
                  <div style="text-align:right;flex-shrink:0">
                    <div style="font-weight:700;font-size:0.93rem">${App.formatCurrency(App.getRecordAmount(r))}</div>
                    <div style="font-size:0.93rem;color:${isUnpaid ? 'var(--danger)' : 'var(--text-muted)'}">${Number(r.prepaidUsed) > 0 && r.paymentMethod !== 'prepaid' ? '정액권+' : ''}${payLabel[r.paymentMethod] || '-'}</div>
                  </div>
                </div>`;
              }).join('') +
              (todayRecords.length > 10 ? '<div style="text-align:center;padding:8px;font-size:0.93rem;color:var(--text-muted)">최근 10건 표시 중</div>' : '')}
          </div>
        </div>

        <!-- 오늘 결제 수단 요약 (건수 + 금액) -->
        ${todayRecords.length > 0 ? `
        <div class="card" style="margin-bottom:16px">
          <div class="card-body" style="padding:12px 20px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap">
            ${todayPayment.card.count > 0 ? `<span style="font-size:0.93rem"><strong style="color:var(--primary)">카드</strong> ${todayPayment.card.count}건 · ${App.formatCurrency(todayPayment.card.amount)}</span>` : ''}
            ${todayPayment.cash.count > 0 ? `<span style="font-size:0.93rem"><strong style="color:var(--success)">현금</strong> ${todayPayment.cash.count}건 · ${App.formatCurrency(todayPayment.cash.amount)}</span>` : ''}
            ${todayPayment.transfer.count > 0 ? `<span style="font-size:0.93rem"><strong style="color:var(--info)">계좌이체</strong> ${todayPayment.transfer.count}건 · ${App.formatCurrency(todayPayment.transfer.amount)}</span>` : ''}
            ${todayPayment.prepaid.count > 0 ? `<span style="font-size:0.93rem"><strong style="color:var(--warning)">정액권</strong> ${todayPayment.prepaid.count}건 · ${App.formatCurrency(todayPayment.prepaid.amount)}</span>` : ''}
            ${todayPayment.unpaid.count > 0 ? `<span style="font-size:0.93rem"><strong style="color:var(--danger)">미결제</strong> ${todayPayment.unpaid.count}건 · ${App.formatCurrency(todayPayment.unpaid.amount)}</span>` : ''}
          </div>
        </div>
        ` : ''}

        <!-- 이번 주 일별 차트 -->
        <div class="card chart-card">
          <div class="card-header">
            <span class="card-title">${App.icon('chart')} 이번 주 매출 &middot; ${App.formatCurrency(weekRevenue)}</span>
          </div>
          <div class="card-body chart-wrapper">
            ${(() => {
              const niceMax = (v) => { if (v <= 0) return 100000; const mag = Math.pow(10, Math.floor(Math.log10(v))); const norm = v / mag; return Math.ceil(norm * 4) / 4 * mag; };
              const gMax = niceMax(weekMax);
              const weekAvgDays = weekData.filter(d => d.date <= today);
              const weekAvgOpen = weekAvgDays.filter(d => d.rev > 0);
              const weekAvgSum = weekAvgDays.reduce((s, d) => s + d.rev, 0);
              // 하루 평균은 지난 날 전체로 나눈다 (예전엔 매출 있는 날만으로 나눠 이틀 영업에 11만원이면 '일평균 11만원'이 됐다)
              const weekAvg = weekAvgDays.length > 0 && weekAvgSum > 0 ? Math.round(weekAvgSum / weekAvgDays.length) : 0;
              const weekAvgOpenAvg = weekAvgOpen.length > 0 ? Math.round(weekAvgSum / weekAvgOpen.length) : 0;
              const avgPct = weekAvg > 0 ? Math.round((weekAvg / gMax) * 90) : 0;
              return `<div style="position:relative;height:200px;padding:0 4px;margin-left:32px">
                <div style="position:absolute;left:0;right:0;bottom:45%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-34px;top:-8px;font-size:0.86rem;color:var(--text-muted)">${Math.round(gMax * 0.5 / 10000)}만</span></div>
                <div style="position:absolute;left:0;right:0;bottom:90%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-34px;top:-8px;font-size:0.86rem;color:var(--text-muted)">${Math.round(gMax / 10000)}만</span></div>
                <div style="display:flex;gap:6px;height:160px;position:relative;z-index:1">
                  ${weekData.map(d => {
                    const barH = d.rev > 0 ? Math.max(8, Math.round((d.rev / gMax) * 130)) : 4;
                    const isToday = d.date === today;
                    const barBg = d.rev === 0 ? 'var(--border-light)' : isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)';
                    const label = d.rev >= 10000 ? Math.round(d.rev / 10000) + '만' : d.rev > 0 ? App.formatCurrency(d.rev) : '';
                    return `<div style="flex:1;position:relative;text-align:center;min-width:0">
                      <span style="font-size:0.86rem;color:${isToday ? 'var(--success)' : 'var(--text-secondary)'};font-weight:800;position:absolute;top:0;left:0;right:0;overflow:hidden;text-overflow:clip;white-space:nowrap">${label}</span>
                      <div style="position:absolute;bottom:20px;left:8%;right:8%;height:${barH}px;background:${barBg};border-radius:6px 6px 0 0"></div>
                      <span style="font-size:0.93rem;font-weight:${isToday ? '800' : '600'};color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};position:absolute;bottom:0;left:0;right:0">${d.label}</span>
                    </div>`;
                  }).join('')}
                </div>
              </div>
              ${weekAvg > 0 ? `<div style="text-align:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-light);font-size:0.93rem;color:var(--text-secondary)">하루 평균 <strong style="color:var(--warning)">${App.formatCurrency(weekAvg)}</strong> <span style="color:var(--text-muted)">· 영업한 ${weekAvgOpen.length}일 평균 ${App.formatCurrency(weekAvgOpenAvg)}</span></div>` : ''}`;
            })()}
          </div>
        </div>
      </div>

      <!-- 이번 달 탭 (기본) -->
      <div class="revenue-tab-content" id="rev-tab-month" style="display:block">
        <div class="rev-grid">
        <!-- 매출 vs 실제 받은 돈 — 같은 크기로 나란히.
             매출은 미용한 날 기준(세금 신고 기준, 미수금 포함), 실입금은 이번 달 실제로 들어온 돈(지난달 미수금 수금 포함) -->
        <div class="card" style="margin-bottom:16px">
          <div class="card-body" style="padding:14px 16px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div>
                <div style="font-size:0.93rem;color:var(--text-secondary);font-weight:600">이번 달 매출</div>
                <div style="font-size:1.25rem;font-weight:800;margin-top:2px">${App.formatCurrency(monthRevenue)}</div>
                <div style="font-size:0.93rem;color:var(--text-muted);margin-top:2px">미용한 날 기준 · 미결제 포함</div>
              </div>
              <div>
                <div style="font-size:0.93rem;color:var(--text-secondary);font-weight:600">받은 돈</div>
                <div style="font-size:1.25rem;font-weight:800;margin-top:2px">${App.formatCurrency(monthCollected)}</div>
                <div style="font-size:0.93rem;color:var(--text-muted);margin-top:2px">이번 달에 들어온 돈${prepaidAll.length ? ' · 정액권 충전 포함' : ''}</div>
              </div>
            </div>
            ${prepaidAll.length ? `<div class="rev-prepaid-line">정액권: 이번 달 충전 ${App.formatCurrency(monthCharge)}${monthRefund ? ' · 환불 ' + App.formatCurrency(monthRefund) : ''}${byMethod.adjustOut ? ' · 조정으로 줄인 잔액 ' + App.formatCurrency(byMethod.adjustOut) + ' <span style="color:var(--text-muted)">(노쇼 예약금 등 — 돌려주지 않은 돈)</span>' : ''} · 남은 잔액 합계 ${App.formatCurrency(prepaidOutstanding)}</div>` : ''}
            ${monthComp > 0 ? `<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border-light);display:flex;justify-content:space-between;font-size:0.93rem;color:var(--text-secondary)"><span>서비스로 제공한 금액 <span style="color:var(--text-muted)">(매출 제외)</span></span><span>${App.formatCurrency(monthComp)}</span></div>` : ''}
            ${unpaidRecs.length > 0 ? `
            <a href="#dashboard" style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid var(--border-light);text-decoration:none;color:var(--danger);font-size:0.93rem;font-weight:700">
              <span>${App.icon('alert')} 미결제 ${unpaidRecs.length}건 · ${App.formatCurrency(unpaidTotal)}</span>
              <span style="font-weight:600">홈에서 보기 &rarr;</span>
            </a>` : ''}
          </div>
        </div>
        <!-- 이번 달 페이스 (지난달 기록이 있을 때만 — 첫 달엔 비교할 게 없다) -->
        ${!hasPrevMonth ? `<p class="rev-first-month" style="margin:0 0 16px;padding:12px 16px;background:var(--bg-white);border-radius:var(--radius);box-shadow:var(--shadow-xs);font-size:0.93rem;color:var(--text-muted);text-align:center">지난달과 비교·손익은 지난달 데이터가 쌓이면 보여요</p>` : `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('run')} 이번 달 페이스 (${todayDay}일차)</span>
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
              <span style="font-weight:700">지난달 이맘때보다</span>
              ${lastMonthPacing > 0 ? `<strong style="font-size:1.1rem;color:${pacingChange >= 0 ? 'var(--success)' : 'var(--danger)'}">${pacingChange >= 0 ? App.icon('arrow-up','ico-sm') : App.icon('arrow-down','ico-sm')} ${Math.abs(pacingChange)}% ${pacingChange >= 0 ? '앞서가는 중' : '뒤처지는 중'}</strong>` : '<span style="color:var(--text-muted)">비교 데이터 없음</span>'}
            </div>
          </div>
        </div>`}

        <!-- 이번 달 받은 돈 — 결제 수단별 (실입금 기준: 합계 = 위 '실제 받은 돈') -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('card')} 이번 달 받은 돈 · 결제 수단별</span>
          </div>
          <div class="card-body">
            <div style="font-size:0.93rem;color:var(--text-muted);margin:-4px 0 10px">돈을 받은 날 기준 — 정액권 충전도 충전한 날 받은 돈으로 셉니다</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${payRows.map(row => {
                const pct = row.amount > 0 ? Math.round((row.amount / payBarBase) * 100) : 0;
                return `<div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span style="font-weight:600;font-size:0.93rem">${row.label}</span>
                    <span style="font-weight:700;font-size:0.93rem${row.amount < 0 ? ';color:var(--danger)' : ''}">${row.amount < 0 ? '−' + App.formatCurrency(-row.amount) : App.formatCurrency(row.amount) + ' (' + pct + '%)'}</span>
                  </div>
                  ${row.amount > 0 ? `<div style="height:8px;background:var(--border-light);border-radius:4px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${row.color};border-radius:4px"></div>
                  </div>` : ''}
                </div>`;
              }).join('')}
              ${payRows.length === 0 ? '<p style="color:var(--text-muted);text-align:center">이번 달 받은 돈이 없습니다</p>' : `
              <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border);font-weight:800">
                <span>합계 (받은 돈)</span><span>${App.formatCurrency(byMethod.total)}</span>
              </div>`}
              ${byMethod.used || monthUnpaid ? `<div style="font-size:0.93rem;color:var(--text-secondary);display:flex;flex-direction:column;gap:4px">
                ${byMethod.used ? `<div style="display:flex;justify-content:space-between"><span>정액권 사용 <span style="color:var(--text-muted)">(매출엔 포함 · 돈은 충전 때 받음)</span></span><span>${App.formatCurrency(byMethod.used)}</span></div>` : ''}
                ${monthUnpaid ? `<div style="display:flex;justify-content:space-between;color:var(--danger)"><span>미결제 <span style="color:var(--text-muted)">(아직 안 받음)</span></span><span>${App.formatCurrency(monthUnpaid)}</span></div>` : ''}
              </div>` : ''}
            </div>
          </div>
        </div>

        <!-- 이번 달 일별 차트 -->
        <div class="card chart-card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('calendar')} 이번 달 일별 매출 (${year}년 ${month + 1}월)</span>
          </div>
          ${weeklyData.length > 0 ? `
          <div style="padding:8px 14px;background:var(--bg);border-bottom:1px solid var(--border-light);font-size:0.93rem;color:var(--text-secondary);overflow-x:auto;white-space:nowrap;-webkit-overflow-scrolling:touch">
            ${weeklyData.map((w, i) => {
              const isCurrent = i === currentWeekIdx;
              const labelTxt = w.rev >= 10000 ? Math.round(w.rev / 10000) + '만' : (w.rev > 0 ? App.formatCurrency(w.rev) : '0');
              return `<span style="${isCurrent ? 'color:var(--primary);font-weight:800' : ''}">${w.label} ${labelTxt}</span>`;
            }).join('<span style="color:var(--border);margin:0 8px"> · </span>')}
          </div>
          ` : ''}
          <div class="card-body chart-wrapper">
            ${(() => {
              const niceMax = (v) => { if (v <= 0) return 100000; const mag = Math.pow(10, Math.floor(Math.log10(v))); const norm = v / mag; return Math.ceil(norm * 4) / 4 * mag; };
              const mMax = niceMax(monthMax);
              const mAvgDays = monthData.filter(d => d.date <= today);
              const mAvgOpen = mAvgDays.filter(d => d.rev > 0);
              const mAvgSum = mAvgDays.reduce((s, d) => s + d.rev, 0);
              // 하루 평균은 지난 날 전체로 나눈다 (예전엔 매출 있는 날만으로 나눠 이틀 영업에 11만원이면 '일평균 11만원'이 됐다)
              const mAvg = mAvgDays.length > 0 && mAvgSum > 0 ? Math.round(mAvgSum / mAvgDays.length) : 0;
              const mAvgOpenAvg = mAvgOpen.length > 0 ? Math.round(mAvgSum / mAvgOpen.length) : 0;
              const todayDayNum = (monthData.find(d => d.date === today) || {}).day || 0;
              const mAvgPct = mAvg > 0 ? Math.round((mAvg / mMax) * 90) : 0;
              return `<div style="position:relative;height:200px;padding:0;overflow-x:auto;margin-left:32px">
                <div style="position:absolute;left:0;right:0;bottom:45%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-34px;top:-8px;font-size:0.86rem;color:var(--text-muted)">${Math.round(mMax * 0.5 / 10000)}만</span></div>
                <div style="position:absolute;left:0;right:0;bottom:90%;border-bottom:1px dashed var(--border-light)"><span style="position:absolute;left:-34px;top:-8px;font-size:0.86rem;color:var(--text-muted)">${Math.round(mMax / 10000)}만</span></div>
                <div style="display:flex;gap:2px;height:160px;position:relative;z-index:1">
                  ${monthData.map(d => {
                    const barH = d.rev > 0 ? Math.max(4, Math.round((d.rev / mMax) * 140)) : 2;
                    const isToday = d.date === today;
                    const isWeekStart = d.day === 8 || d.day === 15 || d.day === 22 || d.day === 29;
                    // 오늘 라벨과 붙어 있는 1·8·15·22·29일 라벨은 생략 (예전엔 '22'와 '23'이 겹쳐 '2223'으로 보였다)
                    const nearToday = !isToday && todayDayNum && Math.abs(d.day - todayDayNum) <= 2;
                    const showLabel = isToday || ((d.day === 1 || isWeekStart) && !nearToday);
                    const barBg = d.rev === 0 ? 'var(--border-light)' : isToday ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--primary),#818CF8)';
                    return `<div style="flex:1;min-width:10px;position:relative${isWeekStart ? ';border-left:1px dashed var(--border);margin-left:2px;padding-left:2px' : ''}" title="${d.date}: ${App.formatCurrency(d.rev)}">
                      <div style="position:absolute;bottom:16px;left:1px;right:1px;height:${barH}px;background:${barBg};border-radius:3px 3px 0 0"></div>
                      <span style="font-size:0.86rem;color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};font-weight:${isToday ? '800' : '500'};position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);white-space:nowrap">${showLabel ? d.day : ''}</span>
                    </div>`;
                  }).join('')}
                </div>
              </div>
              ${mAvg > 0 ? `<div style="text-align:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-light);font-size:0.93rem;color:var(--text-secondary)">하루 평균 <strong style="color:var(--warning)">${App.formatCurrency(mAvg)}</strong> <span style="color:var(--text-muted)">· 영업한 ${mAvgOpen.length}일 평균 ${App.formatCurrency(mAvgOpenAvg)}</span></div>` : ''}`;
            })()}
          </div>
        </div>

        <!-- 이번 달 손익 (첫 달엔 숨김 — 위 한 줄 안내) -->
        ${hasPrevMonth ? `
        <div class="card rev-profit" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('chart')} 이번 달 손익</span>
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
                <!-- 비어 있으면 '입력 안 함'(계산은 0원) — 예전엔 빈 칸 옆에 '원'만 보였다 -->
                <input type="number" id="r-variableCost" value="${variableCost > 0 ? variableCost : ''}"
                  placeholder="입력 안 함" min="0" step="10000" inputmode="numeric" aria-label="이번 달 변동비 (원)"
                  style="width:120px;min-height:44px;text-align:right;padding:4px 8px;font-size:1rem"
                  onchange="App.pages.revenue.saveVariableCost(this.value)">
                <span style="font-size:0.93rem;color:var(--text-muted)">원</span>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;padding:14px 0 ${monthUnpaid > 0 ? '4px' : '14px'};font-size:1.1rem">
              <span style="font-weight:700">순이익</span>
              <strong style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">
                ${profit >= 0 ? '+' : ''}${App.formatCurrency(profit)}
              </strong>
            </div>
            ${monthUnpaid > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:0 0 12px;font-size:0.93rem;color:var(--text-muted)">
              <span>받은 돈 기준</span>
              <span>${(monthCollected - totalCost) >= 0 ? '+' : ''}${App.formatCurrency(monthCollected - totalCost)}</span>
            </div>` : ''}
            <div style="background:var(--bg);border-radius:20px;height:28px;overflow:hidden;margin-top:8px;position:relative">
              <div style="height:100%;width:${Math.min(100, Math.max(0, profitMargin))}%;background:${profit >= 0 ? 'var(--success)' : 'var(--danger)'};border-radius:20px;transition:width 0.3s"></div>
              <span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:0.93rem;font-weight:700">
                이익률 ${profitMargin}%
              </span>
            </div>
            <!-- 지난달 비교 -->
            <div style="display:flex;gap:12px;margin-top:12px">
              <div style="flex:1;background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center">
                <div style="font-size:0.93rem;color:var(--text-muted)">지난달 매출</div>
                <div style="font-weight:700">${App.formatCurrency(lastMonthRevenue)}</div>
              </div>
              <div style="flex:1;background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center">
                <div style="font-size:0.93rem;color:var(--text-muted)">지난달 순이익</div>
                <div style="font-weight:700">${App.formatCurrency(lastMonthProfit)}</div>
              </div>
              <div style="flex:1;background:var(--bg);border-radius:var(--radius);padding:12px;text-align:center">
                <div style="font-size:0.93rem;color:var(--text-muted)">지난달 이맘때보다</div>
                <div style="font-weight:700;color:${monthChange === null ? 'var(--text-muted)' : monthChange >= 0 ? 'var(--success)' : 'var(--danger)'}">${monthChange === null ? '-' : (monthChange >= 0 ? App.icon('arrow-up','ico-sm') : App.icon('arrow-down','ico-sm')) + ' ' + Math.abs(monthChange) + '%'}</div>
              </div>
            </div>
          </div>
        </div>` : ''}

        <!-- 미용사별 매출 -->
        ${multiGroomer && groomerStatList.length > 0 ? `
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('list')} 이번 달 미용사별 매출</span>
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
                  <div style="display:flex;gap:16px;font-size:0.93rem;color:var(--text-secondary)">
                    <span>${App.icon('scissors')} ${stats.count}건</span>
                    <span>비율 ${sharePct}%</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}

        </div>
        <!-- 분석 화면·세무 자료 바로가기 (요일별·월별 추이는 분석 화면, 내보내기는 설정 > 데이터 한 곳에서) -->
        <a href="#analytics" style="display:block;text-align:center;padding:16px;background:var(--bg-white);border-radius:var(--radius);box-shadow:var(--shadow-xs);color:var(--primary);font-weight:700;font-size:0.93rem;text-decoration:none;margin:20px 0 8px">
          ${App.icon('chart')} 요일별·월별 추이 등 자세한 분석 보기 &rarr;
        </a>
        <div style="text-align:center;margin-bottom:20px">
          <a href="#settings" onclick="try{sessionStorage.setItem('settings-open-tab','data')}catch(e){}" style="font-size:0.93rem;color:var(--text-muted)">세무 자료 내보내기는 설정 &rsaquo; 데이터에서</a>
        </div>
      </div>
    `;
   } catch (err) {
    console.error('Revenue render error:', err);
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${App.icon('alert','ico-xl')}</div><div class="empty-state-text">매출 페이지 로드 중 오류<br><small style="color:var(--text-muted)">${err.message || ''}</small></div><button class="btn btn-primary" onclick="App.navigate('revenue')">다시 시도</button></div>`;
   }
  },

  async init() {
    // 탭 전환
    const activate = (tab) => {
      document.querySelectorAll('.revenue-tab').forEach(t => { t.style.background = 'transparent'; t.style.color = 'var(--text-secondary)'; t.classList.remove('active'); });
      tab.style.background = 'var(--primary)'; tab.style.color = 'var(--text-on-primary, #fff)'; tab.classList.add('active');
      document.querySelectorAll('.revenue-tab-content').forEach(c => c.style.display = 'none');
      const panel = document.getElementById('rev-tab-' + tab.dataset.tab);
      if (panel) panel.style.display = 'block';
      this._activeTab = tab.dataset.tab;
    };
    document.querySelectorAll('.revenue-tab').forEach(tab => tab.addEventListener('click', () => activate(tab)));
    // 변동비 저장 등으로 재렌더돼도 보고 있던 탭을 유지한다
    if (this._activeTab) {
      const prev = document.querySelector(`.revenue-tab[data-tab="${this._activeTab}"]`);
      if (prev) activate(prev);
    }

    // 일일 정산표
    document.getElementById('btn-revenue-daily-report')?.addEventListener('click', () => {
      App.pages.records?.showDailyReport();
    });
  },

  async saveVariableCost(value) {
    try {
      const thisMonth = App.getToday().slice(0, 7);
      const costs = await DB.getSetting('variableCosts') || {};
      costs[thisMonth] = Number(value) || 0;
      await DB.setSetting('variableCosts', costs);
      App.showToast('변동비가 저장되었습니다.');
    } catch (e) {
      console.error('variableCost save error:', e);
      App.showToast('변동비 저장 중 오류가 발생했습니다.', 'error');
      return;
    }
    App.handleRoute();
  }
};
