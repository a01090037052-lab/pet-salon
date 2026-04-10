// ========== Analytics (분석) Page ==========
App.pages.analytics = {
  _period: '1month',
  _customStart: '',
  _customEnd: '',

  async render(container) {
    const period = this._period;
    const today = App.getToday();
    const now = new Date();

    // 기간 계산 (월초 기준)
    let periodStart, periodEnd = today;
    if (period === 'custom' && this._customStart && this._customEnd) {
      periodStart = this._customStart;
      periodEnd = this._customEnd;
    } else {
      const d = new Date(now.getFullYear(), now.getMonth(), 1); // 이번 달 1일
      if (period === '1month') d.setMonth(d.getMonth() - 1);
      else if (period === '3months') d.setMonth(d.getMonth() - 3);
      else if (period === '6months') d.setMonth(d.getMonth() - 6);
      else if (period === '1year') d.setFullYear(d.getFullYear() - 1);
      else d.setMonth(d.getMonth()); // thisMonth - 이번 달 1일
      periodStart = App.formatLocalDate(d);
    }
    const periodLabels = { '1month': '최근 1개월', '3months': '최근 3개월', '6months': '최근 6개월', '1year': '최근 1년', 'custom': '직접 설정' };

    // 데이터 로드
    const [records, customers, pets, services] = await Promise.all([
      DB.getByDateRange('records', 'date', periodStart, periodEnd + 'z'),
      DB.getAllLight('customers', ['memo', 'address']),
      DB.getAllLight('pets', ['photo', 'temperament', 'healthNotes', 'preferredStyle']),
      DB.getAll('services')
    ]);
    const customerMap = {}; customers.forEach(c => { customerMap[c.id] = c; });
    const petMap = {}; pets.forEach(p => { petMap[p.id] = p; });
    const serviceNameMap = {}; services.forEach(s => { serviceNameMap[s.id] = s.name; });
    const thisMonth = today.slice(0, 7);

    // ===== 고객 분석 =====
    // 고객별 매출 TOP 10
    const customerRevMap = {};
    records.forEach(r => {
      if (!r.customerId) return;
      if (!customerRevMap[r.customerId]) customerRevMap[r.customerId] = { count: 0, revenue: 0 };
      customerRevMap[r.customerId].count++;
      customerRevMap[r.customerId].revenue += App.getRecordAmount(r);
    });
    const customerTop10 = Object.entries(customerRevMap)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([cid, stats]) => ({ name: App.getCustomerLabel(customerMap[cid] || {}), ...stats }));
    const topCustMax = customerTop10.length > 0 ? customerTop10[0].revenue || 1 : 1;

    // 신규 vs 재방문 (기간 내)
    const monthRecords = records.filter(r => r.date && r.date.startsWith(thisMonth));
    const monthCustomerIds = [...new Set(monthRecords.map(r => r.customerId).filter(Boolean))];
    let newCount = 0, returnCount = 0;
    const allRecordsForHistory = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo', 'serviceIds', 'serviceNames', 'groomer']);
    for (const cid of monthCustomerIds) {
      const hasHistory = allRecordsForHistory.some(r => r.customerId === cid && r.date < thisMonth + '-01');
      if (hasHistory) returnCount++; else newCount++;
    }

    // 고객당 평균 방문 주기
    let totalCycles = 0, cycleCount = 0;
    Object.entries(customerRevMap).forEach(([cid, stats]) => {
      if (stats.count >= 2) {
        const dates = records.filter(r => r.customerId === Number(cid)).map(r => r.date).sort();
        let sum = 0;
        for (let i = 1; i < dates.length; i++) {
          const diff = Math.round((new Date(dates[i] + 'T00:00:00') - new Date(dates[i-1] + 'T00:00:00')) / (1000*60*60*24));
          sum += diff;
        }
        totalCycles += sum / (dates.length - 1);
        cycleCount++;
      }
    });
    const avgCycle = cycleCount > 0 ? Math.round(totalCycles / cycleCount) : 0;

    // ===== 견종 분석 =====
    const breedRevMap = {};
    records.forEach(r => {
      const pet = petMap[r.petId];
      const breed = pet?.breed || '미입력';
      if (!breedRevMap[breed]) breedRevMap[breed] = { count: 0, revenue: 0, pets: new Set() };
      breedRevMap[breed].count++;
      breedRevMap[breed].revenue += App.getRecordAmount(r);
      if (r.petId) breedRevMap[breed].pets.add(r.petId);
    });
    const breedList = Object.entries(breedRevMap)
      .map(([name, stats]) => ({ name, count: stats.count, revenue: stats.revenue, petCount: stats.pets.size, avg: stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
    const breedMaxRev = breedList.length > 0 ? breedList[0].revenue || 1 : 1;
    const breedTotal = breedList.reduce((s, b) => s + b.count, 0) || 1;

    // ===== 서비스 분석 =====
    const serviceRevMap = {};
    records.forEach(r => {
      const sNames = (r.serviceNames && r.serviceNames.length > 0) ? r.serviceNames : (r.serviceIds || []).map(id => serviceNameMap[id]).filter(Boolean);
      sNames.forEach(name => {
        if (!serviceRevMap[name]) serviceRevMap[name] = { count: 0, revenue: 0 };
        serviceRevMap[name].count++;
      });
      if (sNames.length > 0) {
        const perService = Math.round(App.getRecordAmount(r) / sNames.length);
        sNames.forEach(name => { serviceRevMap[name].revenue += perService; });
      }
    });
    const serviceRevList = Object.entries(serviceRevMap).sort((a, b) => b[1].revenue - a[1].revenue);
    const serviceRevTotal = serviceRevList.reduce((s, [, v]) => s + v.revenue, 0) || 1;
    const serviceCntTotal = serviceRevList.reduce((s, [, v]) => s + v.count, 0) || 1;

    // ===== 매출 추이 =====
    // 객단가 추이 (월별)
    const monthlyRevMap = {};
    const monthlyCntMap = {};
    records.forEach(r => {
      if (!r.date) return;
      const mon = r.date.slice(0, 7);
      monthlyRevMap[mon] = (monthlyRevMap[mon] || 0) + App.getRecordAmount(r);
      monthlyCntMap[mon] = (monthlyCntMap[mon] || 0) + 1;
    });
    const months = period === '1year' ? 12 : period === '6months' ? 6 : period === '3months' ? 3 : period === 'custom' ? Math.max(1, Math.ceil((new Date(periodEnd) - new Date(periodStart)) / (1000*60*60*24*30))) : 1;
    const avgPriceByMonth = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mon = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const cnt = monthlyCntMap[mon] || 0;
      const rev = monthlyRevMap[mon] || 0;
      avgPriceByMonth.push({ label: `${d.getMonth() + 1}월`, avg: cnt > 0 ? Math.round(rev / cnt) : 0, month: mon });
    }
    const avgPriceMax = Math.max(...avgPriceByMonth.map(m => m.avg), 1);

    // 요일별 패턴
    const dayOfWeekStats = [0, 0, 0, 0, 0, 0, 0];
    const dowDateSet = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
    records.forEach(r => {
      if (!r.date) return;
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

    // 시간대별 분포
    const hourStats = {};
    records.forEach(r => {
      if (!r.createdAt) return;
      const h = new Date(r.createdAt).getHours();
      if (!hourStats[h]) hourStats[h] = { count: 0, revenue: 0 };
      hourStats[h].count++;
      hourStats[h].revenue += App.getRecordAmount(r);
    });
    const hours = [];
    for (let h = 9; h <= 20; h++) {
      hours.push({ hour: h, label: `${h}시`, count: hourStats[h]?.count || 0, revenue: hourStats[h]?.revenue || 0 });
    }
    const hourMax = Math.max(...hours.map(h => h.count), 1);

    // ===== 미용사 성과 =====
    const groomerStats = {};
    records.forEach(r => {
      const name = r.groomer || '미지정';
      if (!groomerStats[name]) groomerStats[name] = { count: 0, revenue: 0, customers: new Set() };
      groomerStats[name].count++;
      groomerStats[name].revenue += App.getRecordAmount(r);
      if (r.customerId) groomerStats[name].customers.add(r.customerId);
    });
    const groomerList = Object.entries(groomerStats).sort((a, b) => b[1].revenue - a[1].revenue);
    const groomerMaxRev = groomerList.length > 0 ? groomerList[0][1].revenue || 1 : 1;

    // ===== 렌더링 =====
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">&#x1F4CA; 분석</h1>
          <p class="page-subtitle">매출 데이터 상세 분석</p>
        </div>
      </div>

      <!-- 기간 선택 -->
      <div style="display:flex;gap:4px;margin-bottom:8px;background:var(--bg-white);border-radius:var(--radius);padding:4px;box-shadow:var(--shadow-xs)">
        <button class="analytics-period${period === '1month' ? ' active' : ''}" data-period="1month" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;background:${period === '1month' ? 'var(--primary)' : 'transparent'};color:${period === '1month' ? '#fff' : 'var(--text-secondary)'}">1개월</button>
        <button class="analytics-period${period === '3months' ? ' active' : ''}" data-period="3months" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;background:${period === '3months' ? 'var(--primary)' : 'transparent'};color:${period === '3months' ? '#fff' : 'var(--text-secondary)'}">3개월</button>
        <button class="analytics-period${period === '6months' ? ' active' : ''}" data-period="6months" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;background:${period === '6months' ? 'var(--primary)' : 'transparent'};color:${period === '6months' ? '#fff' : 'var(--text-secondary)'}">6개월</button>
        <button class="analytics-period${period === '1year' ? ' active' : ''}" data-period="1year" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;background:${period === '1year' ? 'var(--primary)' : 'transparent'};color:${period === '1year' ? '#fff' : 'var(--text-secondary)'}">1년</button>
        <button class="analytics-period${period === 'custom' ? ' active' : ''}" data-period="custom" style="flex:1;padding:10px;border:none;border-radius:8px;font-weight:600;font-size:0.82rem;cursor:pointer;background:${period === 'custom' ? 'var(--primary)' : 'transparent'};color:${period === 'custom' ? '#fff' : 'var(--text-secondary)'}">직접</button>
      </div>
      ${period === 'custom' ? `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;justify-content:center;flex-wrap:wrap">
        <input type="date" id="analytics-custom-start" value="${this._customStart || periodStart}" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:0.85rem">
        <span style="color:var(--text-muted)">~</span>
        <input type="date" id="analytics-custom-end" value="${this._customEnd || today}" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:0.85rem">
        <button class="btn btn-sm btn-primary" id="analytics-custom-apply">적용</button>
      </div>` : ''}

      <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:16px;text-align:center">${periodLabels[period]} (${periodStart} ~ ${periodEnd}) &middot; 총 ${records.length}건</div>

      <!-- 고객 분석 -->
      <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px;color:var(--text-primary)">&#x1F464; 고객 분석</h3>

      <!-- 신규 vs 재방문 + 방문 주기 -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-body">
          <div style="display:flex;gap:12px;margin-bottom:16px">
            <div style="flex:1;text-align:center;padding:14px;background:var(--bg);border-radius:var(--radius)">
              <div style="font-size:1.4rem;font-weight:800;color:var(--info)">${newCount}</div>
              <div style="font-size:0.82rem;color:var(--text-secondary)">신규 고객</div>
            </div>
            <div style="flex:1;text-align:center;padding:14px;background:var(--bg);border-radius:var(--radius)">
              <div style="font-size:1.4rem;font-weight:800;color:var(--success)">${returnCount}</div>
              <div style="font-size:0.82rem;color:var(--text-secondary)">재방문 고객</div>
            </div>
            <div style="flex:1;text-align:center;padding:14px;background:var(--bg);border-radius:var(--radius)">
              <div style="font-size:1.4rem;font-weight:800;color:var(--primary)">${monthCustomerIds.length > 0 ? Math.round((returnCount / monthCustomerIds.length) * 100) : 0}%</div>
              <div style="font-size:0.82rem;color:var(--text-secondary)">재방문율</div>
            </div>
          </div>
          ${monthCustomerIds.length > 0 ? `
          <div style="height:12px;border-radius:6px;overflow:hidden;display:flex;margin-bottom:8px">
            <div style="width:${Math.round((newCount / monthCustomerIds.length) * 100)}%;background:var(--info)"></div>
            <div style="width:${Math.round((returnCount / monthCustomerIds.length) * 100)}%;background:var(--success)"></div>
          </div>` : ''}
          ${avgCycle > 0 ? `<div style="text-align:center;font-size:0.88rem;color:var(--text-secondary);padding-top:8px;border-top:1px solid var(--border)">평균 방문 주기: <strong style="color:var(--primary)">${avgCycle}일</strong></div>` : ''}
        </div>
      </div>

      <!-- 고객별 매출 TOP 10 -->
      ${customerTop10.length > 0 ? `
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <span class="card-title">&#x1F451; 고객별 매출 TOP 10</span>
        </div>
        <div class="card-body" style="padding:12px 16px">
          ${customerTop10.map((c, i) => {
            const pct = Math.max(5, Math.round((c.revenue / topCustMax) * 100));
            return `<div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;margin-bottom:3px;align-items:center">
                <span style="font-weight:700;font-size:0.85rem"><span style="color:${i < 3 ? 'var(--warning)' : 'var(--text-muted)'};margin-right:4px">${i + 1}</span>${App.escapeHtml(c.name)}</span>
                <span style="font-size:0.82rem;color:var(--primary);font-weight:700">${App.formatCurrency(c.revenue)} <span style="font-weight:400;color:var(--text-muted)">(${c.count}회)</span></span>
              </div>
              <div style="height:5px;background:var(--border-light);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${i < 3 ? 'var(--warning)' : 'var(--primary)'};border-radius:3px"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- 견종 분석 -->
      <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px;color:var(--text-primary)">&#x1F436; 견종 분석</h3>

      ${breedList.length > 0 ? `
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <span class="card-title">견종별 매출/방문</span>
        </div>
        <div class="card-body" style="padding:12px 16px">
          ${breedList.slice(0, 10).map((b, i) => {
            const pct = Math.max(5, Math.round((b.revenue / breedMaxRev) * 100));
            const sharePct = Math.round((b.count / breedTotal) * 100);
            return `<div style="margin-bottom:14px;padding-bottom:14px;${i < breedList.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;align-items:center">
                <span style="font-weight:700;font-size:0.9rem"><span style="color:${i < 3 ? 'var(--warning)' : 'var(--text-muted)'};margin-right:4px">${i + 1}</span>${App.escapeHtml(b.name)}</span>
                <span style="font-size:0.82rem;font-weight:700;color:var(--primary)">${App.formatCurrency(b.revenue)}</span>
              </div>
              <div style="height:6px;background:var(--border-light);border-radius:3px;overflow:hidden;margin-bottom:6px">
                <div style="height:100%;width:${pct}%;background:${i < 3 ? 'var(--warning)' : 'var(--primary)'};border-radius:3px"></div>
              </div>
              <div style="display:flex;gap:12px;font-size:0.75rem;color:var(--text-muted)">
                <span>${b.petCount}마리</span>
                <span>${b.count}회 방문</span>
                <span>평균 ${App.formatCurrency(b.avg)}</span>
                <span>비중 ${sharePct}%</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      ` : ''}

      <!-- 서비스 분석 -->
      <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px;color:var(--text-primary)">&#x2702; 서비스 분석</h3>

      ${serviceRevList.length > 0 ? `
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <span class="card-title">서비스별 매출/건수</span>
        </div>
        <div class="card-body" style="padding:12px 16px">
          ${serviceRevList.map(([name, stats]) => {
            const revPct = Math.round((stats.revenue / serviceRevTotal) * 100);
            const cntPct = Math.round((stats.count / serviceCntTotal) * 100);
            return `<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <span style="font-weight:700;font-size:0.9rem">${App.escapeHtml(name)}</span>
                <span style="font-size:0.85rem;font-weight:700;color:var(--primary)">${App.formatCurrency(stats.revenue)}</span>
              </div>
              <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">
                <span style="font-size:0.72rem;color:var(--text-muted);width:28px">매출</span>
                <div style="flex:1;height:6px;background:var(--border-light);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${revPct}%;background:var(--primary);border-radius:3px"></div>
                </div>
                <span style="font-size:0.72rem;color:var(--text-muted);width:30px;text-align:right">${revPct}%</span>
              </div>
              <div style="display:flex;gap:8px;align-items:center">
                <span style="font-size:0.72rem;color:var(--text-muted);width:28px">건수</span>
                <div style="flex:1;height:6px;background:var(--border-light);border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${cntPct}%;background:var(--info);border-radius:3px"></div>
                </div>
                <span style="font-size:0.72rem;color:var(--text-muted);width:30px;text-align:right">${stats.count}건</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      ` : '<div class="card" style="margin-bottom:20px"><div class="card-body"><p style="color:var(--text-muted);text-align:center">기록이 없습니다</p></div></div>'}

      <!-- 매출 추이 -->
      <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px;color:var(--text-primary)">&#x1F4B5; 매출 추이</h3>

      <!-- 객단가 추이 -->
      ${avgPriceByMonth.length > 1 ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <span class="card-title">객단가 추이</span>
        </div>
        <div class="card-body">
          <div style="display:flex;gap:${avgPriceByMonth.length > 6 ? '4' : '10'}px;height:140px;position:relative">
            ${avgPriceByMonth.map((m, i) => {
              const barH = m.avg > 0 ? Math.max(8, Math.round((m.avg / avgPriceMax) * 100)) : 4;
              const isCurrent = i === avgPriceByMonth.length - 1;
              return `<div style="flex:1;position:relative;text-align:center">
                <span style="font-size:0.65rem;color:${isCurrent ? 'var(--success)' : 'var(--text-secondary)'};font-weight:700;position:absolute;top:0;left:0;right:0">${m.avg > 0 ? App.formatCurrency(m.avg) : ''}</span>
                <div style="position:absolute;bottom:18px;left:15%;right:15%;height:${barH}px;background:${isCurrent ? 'linear-gradient(to top,var(--success),#34D399)' : 'linear-gradient(to top,var(--info),#60A5FA)'};border-radius:6px 6px 0 0"></div>
                <span style="font-size:0.7rem;color:${isCurrent ? 'var(--primary)' : 'var(--text-muted)'};font-weight:${isCurrent ? '700' : '400'};position:absolute;bottom:0;left:0;right:0">${m.label}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      ` : ''}

      <!-- 요일별 패턴 -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <span class="card-title">요일별 평균 매출</span>
        </div>
        <div class="card-body">
          ${dowData.every(d => d.avg === 0) ? '<p style="color:var(--text-muted);text-align:center">데이터가 쌓이면 표시됩니다</p>' :
            `<div style="display:flex;flex-direction:column;gap:8px">
              ${dowData.map((d, i) => {
                const pct = Math.max(5, Math.round((d.avg / dowMax) * 100));
                const isTop = i === 0;
                return `<div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                    <span style="font-weight:${isTop ? '800' : '600'};font-size:0.88rem">${d.label}요일${isTop ? ' <span style="font-size:0.68rem;color:var(--success)">(최다)</span>' : ''}</span>
                    <span style="font-weight:700;font-size:0.85rem;color:${isTop ? 'var(--success)' : 'var(--text-secondary)'}">${d.avg >= 10000 ? Math.round(d.avg / 10000) + '만원' : App.formatCurrency(d.avg)}</span>
                  </div>
                  <div style="height:6px;background:var(--border-light);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:${isTop ? 'var(--success)' : 'var(--primary)'};border-radius:3px"></div>
                  </div>
                </div>`;
              }).join('')}
            </div>`}
        </div>
      </div>

      <!-- 시간대별 분포 -->
      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <span class="card-title">시간대별 미용 건수</span>
        </div>
        <div class="card-body">
          ${hours.every(h => h.count === 0) ? '<p style="color:var(--text-muted);text-align:center">데이터가 쌓이면 표시됩니다</p>' :
            `<div style="display:flex;gap:4px;height:120px;position:relative">
              ${hours.map(h => {
                const barH = h.count > 0 ? Math.max(6, Math.round((h.count / hourMax) * 90)) : 3;
                const isPeak = h.count === hourMax && h.count > 0;
                return `<div style="flex:1;position:relative;text-align:center" title="${h.label}: ${h.count}건 (${App.formatCurrency(h.revenue)})">
                  <span style="font-size:0.6rem;color:${isPeak ? 'var(--success)' : 'var(--text-muted)'};font-weight:700;position:absolute;top:0;left:0;right:0">${h.count > 0 ? h.count : ''}</span>
                  <div style="position:absolute;bottom:16px;left:10%;right:10%;height:${barH}px;background:${isPeak ? 'var(--success)' : 'var(--primary)'};border-radius:4px 4px 0 0"></div>
                  <span style="font-size:0.6rem;color:var(--text-muted);position:absolute;bottom:0;left:0;right:0">${h.hour}</span>
                </div>`;
              }).join('')}
            </div>`}
        </div>
      </div>

      <!-- 미용사 성과 -->
      <h3 style="font-size:1rem;font-weight:800;margin-bottom:12px;color:var(--text-primary)">&#x1F9D1; 미용사 성과</h3>

      ${groomerList.length > 0 ? `
      <div class="card" style="margin-bottom:20px">
        <div class="card-body" style="padding:12px 16px">
          ${groomerList.map(([name, stats]) => {
            const pct = Math.round((stats.revenue / groomerMaxRev) * 100);
            const avgPrice = stats.count > 0 ? Math.round(stats.revenue / stats.count) : 0;
            const totalRev = groomerList.reduce((s, [, st]) => s + st.revenue, 0);
            const sharePct = totalRev > 0 ? Math.round((stats.revenue / totalRev) * 100) : 0;
            return `
              <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <span style="font-weight:800;font-size:1rem">${App.escapeHtml(name)}</span>
                  <span style="font-weight:700;color:var(--primary);font-size:1rem">${App.formatCurrency(stats.revenue)}</span>
                </div>
                <div style="height:8px;background:var(--border-light);border-radius:4px;overflow:hidden;margin-bottom:10px">
                  <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--primary),#818CF8);border-radius:4px"></div>
                </div>
                <div style="display:flex;gap:12px;font-size:0.82rem;color:var(--text-secondary);flex-wrap:wrap">
                  <span>&#x2702; ${stats.count}건</span>
                  <span>건당 ${App.formatCurrency(avgPrice)}</span>
                  <span>비율 ${sharePct}%</span>
                  <span>고객 ${stats.customers.size}명</span>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>
      ` : '<div class="card" style="margin-bottom:20px"><div class="card-body"><p style="color:var(--text-muted);text-align:center">미용 기록이 없습니다</p></div></div>'}
    `;
  },

  async init() {
    // 기간 선택 이벤트
    document.querySelectorAll('.analytics-period').forEach(btn => {
      btn.addEventListener('click', () => {
        const newPeriod = btn.dataset.period;
        if (newPeriod !== 'custom') {
          this._customStart = '';
          this._customEnd = '';
        }
        this._period = newPeriod;
        App.handleRoute();
      });
    });

    // 커스텀 기간 적용
    document.getElementById('analytics-custom-apply')?.addEventListener('click', () => {
      const start = document.getElementById('analytics-custom-start').value;
      const end = document.getElementById('analytics-custom-end').value;
      if (!start || !end || start > end) {
        App.showToast('올바른 기간을 선택해주세요.', 'error');
        return;
      }
      this._customStart = start;
      this._customEnd = end;
      this._period = 'custom';
      App.handleRoute();
    });
  }
};
