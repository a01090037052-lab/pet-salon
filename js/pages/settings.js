// ========== Settings Page ==========
App.pages.settings = {
  async render(container) {
    const shopName = await DB.getSetting('shopName') || '';
    const shopPhone = await DB.getSetting('shopPhone') || '';
    const shopAddress = await DB.getSetting('shopAddress') || '';
    const revisitDays = await DB.getSetting('revisitDays') || 30;
    const groomers = await DB.getSetting('groomers') || [];

    const notifEnabled = await DB.getSetting('notifEnabled');
    const notifMinutes = await DB.getSetting('notifMinutes');
    const closedDays = await DB.getSetting('closedDays') || [];
    const themeColor = await DB.getSetting('themeColor') || '#6366F1';

    const DEFAULT_TEMPLATES = {
      revisit: '[{매장명}] {고객명}님 안녕하세요! {반려견명}의 마지막 미용 후 {경과일수}일이 지났습니다. 예약 문의: {전화번호}',
      appointment: '[{매장명}] {고객명}님, {날짜} {시간}에 {반려견명} 예약이 확인되었습니다. 담당: {미용사}. 문의: {전화번호}',
      birthday: '[{매장명}] {고객명}님! {반려견명}의 생일을 축하합니다! 🎂 생일 기념 특별 할인을 준비했어요. 문의: {전화번호}',
      complete: '[{매장명}] {고객명}님, {반려견명}의 미용이 완료되었습니다! 서비스: {서비스}, 금액: {금액}원. 감사합니다! 💕'
    };
    const savedTemplates = await DB.getSetting('messageTemplates') || {};
    const revisitTpl = savedTemplates.revisit || DEFAULT_TEMPLATES.revisit;
    const appointmentTpl = savedTemplates.appointment || DEFAULT_TEMPLATES.appointment;
    const birthdayTpl = savedTemplates.birthday || DEFAULT_TEMPLATES.birthday;
    const completeTpl = savedTemplates.complete || DEFAULT_TEMPLATES.complete;

    const [customers, pets, appointments, records, services] = await Promise.all([
      DB.count('customers'),
      DB.count('pets'),
      DB.count('appointments'),
      DB.count('records'),
      DB.count('services')
    ]);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">설정</h1>
          <p class="page-subtitle">매장 정보 및 데이터 관리</p>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="settings-tabs" id="settings-tabs">
        <button class="settings-tab active" data-tab="shop">&#x1F3EA; 매장 관리</button>
        <button class="settings-tab" data-tab="operation">&#x2699; 운영 설정</button>
        <button class="settings-tab" data-tab="data">&#x1F4BE; 데이터</button>
      </div>

      <!-- Tab 1: 매장 관리 -->
      <div class="settings-tab-content" id="tab-shop">
        <div class="grid-2">
          <!-- Shop Info -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">&#x1F3EA; 매장 정보</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">매장 이름</label>
                <input type="text" id="s-shopName" value="${App.escapeHtml(shopName)}" placeholder="매장 이름">
              </div>
              <div class="form-group">
                <label class="form-label">연락처</label>
                <input type="tel" id="s-shopPhone" value="${App.escapeHtml(shopPhone)}" placeholder="매장 전화번호">
              </div>
              <div class="form-group">
                <label class="form-label">주소</label>
                <input type="text" id="s-shopAddress" value="${App.escapeHtml(shopAddress)}" placeholder="매장 주소">
              </div>
              <div class="form-group">
                <label class="form-label">재방문 알림 기준 (일)</label>
                <input type="number" id="s-revisitDays" value="${revisitDays}" min="1" max="365" placeholder="30">
                <div class="form-hint">마지막 미용 후 이 기간이 지나면 대시보드에 알림이 표시됩니다</div>
              </div>
            </div>
          </div>

          <!-- Groomer Management -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">&#x1F4C7; 미용사 관리</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">등록된 미용사</label>
                <div id="groomer-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
                  ${(groomers || []).map((g, i) => `
                    <div style="display:flex;align-items:center;gap:8px">
                      <input type="text" class="groomer-input" value="${App.escapeHtml(g)}" style="flex:1">
                      <button class="btn btn-sm btn-danger btn-remove-groomer" data-index="${i}">삭제</button>
                    </div>
                  `).join('')}
                </div>
                <div style="display:flex;gap:8px">
                  <input type="text" id="new-groomer" placeholder="새 미용사 이름" style="flex:1">
                  <button class="btn btn-sm btn-primary" id="btn-add-groomer">추가</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 영업 설정 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">&#x1F4C5; 영업 설정</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">정기 휴무일</label>
                <div id="closed-days" style="display:flex;gap:8px;flex-wrap:wrap">
                  <label class="checkbox-label" style="min-width:auto;padding:6px 12px"><input type="checkbox" name="closedDay" value="1" ${closedDays.includes(1) ? 'checked' : ''}> 월</label>
                  <label class="checkbox-label" style="min-width:auto;padding:6px 12px"><input type="checkbox" name="closedDay" value="2" ${closedDays.includes(2) ? 'checked' : ''}> 화</label>
                  <label class="checkbox-label" style="min-width:auto;padding:6px 12px"><input type="checkbox" name="closedDay" value="3" ${closedDays.includes(3) ? 'checked' : ''}> 수</label>
                  <label class="checkbox-label" style="min-width:auto;padding:6px 12px"><input type="checkbox" name="closedDay" value="4" ${closedDays.includes(4) ? 'checked' : ''}> 목</label>
                  <label class="checkbox-label" style="min-width:auto;padding:6px 12px"><input type="checkbox" name="closedDay" value="5" ${closedDays.includes(5) ? 'checked' : ''}> 금</label>
                  <label class="checkbox-label" style="min-width:auto;padding:6px 12px"><input type="checkbox" name="closedDay" value="6" ${closedDays.includes(6) ? 'checked' : ''}> 토</label>
                  <label class="checkbox-label" style="min-width:auto;padding:6px 12px"><input type="checkbox" name="closedDay" value="0" ${closedDays.includes(0) ? 'checked' : ''}> 일</label>
                </div>
                <div class="form-hint">선택한 요일은 캘린더에 휴무로 표시되고, 예약 시 경고가 나타납니다</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Theme Color -->
        <div class="card" style="margin-top:16px">
          <div class="card-header">
            <span class="card-title">&#x1F3A8; 테마 색상</span>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">매장 테마 컬러</label>
              <div id="theme-color-picker" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
                ${['#6366F1','#EC4899','#10B981','#F59E0B','#3B82F6','#8B5CF6','#EF4444','#14B8A6'].map(c => `
                  <button type="button" class="theme-color-btn${(themeColor || '#6366F1') === c ? ' active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>
                `).join('')}
              </div>
              <div class="form-hint">선택한 색상이 앱 전체 테마에 적용됩니다</div>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-lg" id="btn-save-tab-shop" style="width:100%;margin-top:20px">매장 관리 설정 저장</button>
      </div>

      <!-- Tab 2: 운영 설정 -->
      <div class="settings-tab-content" id="tab-operation" style="display:none">
        <div class="grid-2">
          <!-- 예약 알림 설정 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">&#x1F514; 알림 설정</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="s-notifEnabled" ${notifEnabled ? 'checked' : ''}>
                  예약 알림 활성화
                </label>
                <div class="form-hint">브라우저 알림을 사용하여 예약 전 알림을 보냅니다</div>
              </div>
              <div class="form-group">
                <label class="form-label">알림 시간</label>
                <select id="s-notifMinutes">
                  <option value="10" ${notifMinutes == 10 ? 'selected' : ''}>10분 전</option>
                  <option value="30" ${notifMinutes == 30 || !notifMinutes ? 'selected' : ''}>30분 전</option>
                  <option value="60" ${notifMinutes == 60 ? 'selected' : ''}>1시간 전</option>
                  <option value="120" ${notifMinutes == 120 ? 'selected' : ''}>2시간 전</option>
                </select>
              </div>
            </div>
          </div>

          <!-- 매출 목표 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">&#x1F3AF; 매출 목표</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">일일 매출 목표</label>
                <input type="number" id="s-dailyGoal" value="${(await DB.getSetting('dailyGoal')) || ''}" placeholder="예: 500000" min="0" step="10000">
                <div class="form-hint">대시보드에 목표 대비 달성률이 표시됩니다</div>
              </div>
            </div>
          </div>

          <!-- 매장 고정비 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">&#x1F4B0; 고정비</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">월 고정비 (만원)</label>
                <input type="number" id="s-fixedCost" value="${Math.round((Number(await DB.getSetting('monthlyFixedCost')) || 0) / 10000)}" placeholder="예: 350" min="0" step="10">
                <div class="form-hint">임대료 + 인건비 + 공과금 + 보험 등 합산 금액</div>
              </div>
            </div>
          </div>

        </div>

        <!-- 메시지 템플릿 (접이식) -->
        <div class="card" style="margin-top:20px">
          <div class="card-header" style="cursor:pointer" onclick="this.parentElement.querySelector('.card-body').classList.toggle('hidden');this.querySelector('.toggle-icon').textContent=this.parentElement.querySelector('.card-body').classList.contains('hidden')?'&#x25B6;':'&#x25BC;'">
            <span class="card-title">&#x1F4AC; 메시지 템플릿 <span class="toggle-icon" style="font-size:0.75rem">&#x25B6;</span></span>
          </div>
          <div class="card-body hidden">
            <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">
              문자 발송 시 사용되는 메시지를 수정할 수 있습니다.<br>
              사용 가능한 변수: <code>{매장명}</code> <code>{고객명}</code> <code>{반려견명}</code> <code>{경과일수}</code> <code>{날짜}</code> <code>{시간}</code> <code>{서비스}</code> <code>{금액}</code> <code>{미용사}</code> <code>{전화번호}</code>
            </p>
            <div class="form-group">
              <label class="form-label">재방문 알림 문자</label>
              <textarea id="tpl-revisit" rows="3">${App.escapeHtml(revisitTpl)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">예약 확인 문자</label>
              <textarea id="tpl-appointment" rows="3">${App.escapeHtml(appointmentTpl)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">생일 축하 문자</label>
              <textarea id="tpl-birthday" rows="3">${App.escapeHtml(birthdayTpl)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">미용 완료 안내 문자</label>
              <textarea id="tpl-complete" rows="3">${App.escapeHtml(completeTpl)}</textarea>
            </div>
            <button class="btn btn-secondary" id="btn-reset-templates">기본값 복원</button>
          </div>
        </div>

        <button class="btn btn-primary btn-lg" id="btn-save-tab-operation" style="width:100%;margin-top:20px">운영 설정 저장</button>
      </div>

      <!-- Tab 3: 데이터 -->
      <div class="settings-tab-content" id="tab-data" style="display:none">
        <div class="grid-2">
          <!-- Data Stats -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">&#x1F4CA; 데이터 현황</span>
            </div>
            <div class="card-body">
              <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                  <span>고객</span><strong>${customers}명</strong>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                  <span>반려견</span><strong>${pets}마리</strong>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                  <span>예약</span><strong>${appointments}건</strong>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
                  <span>미용 기록</span><strong>${records}건</strong>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0">
                  <span>서비스 메뉴</span><strong>${services}개</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- 세무 자료 내보내기 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">&#x1F4C4; 세무 자료 내보내기</span>
            </div>
            <div class="card-body">
              <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:12px">
                기간별 매출 내역을 CSV 파일로 내보냅니다. 세무사에게 제출하거나 엑셀에서 열 수 있습니다.
              </p>
              <button class="btn btn-success" id="btn-export-revenue-csv">&#x1F4C4; 세무 자료 내보내기</button>
            </div>
          </div>
        </div>

        <!-- Backup & Restore -->
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4BE; 데이터 백업 및 복원</span>
          </div>
          <div class="card-body">
            <div class="grid-2" style="gap:24px">
              <div>
                <h4 style="margin-bottom:8px">백업 (내보내기)</h4>
                <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:12px">
                  모든 데이터를 JSON 파일로 저장합니다. 정기적으로 백업하는 것을 권장합니다.
                </p>
                <button class="btn btn-success" id="btn-export">&#x1F4E5; 데이터 백업하기</button>
              </div>
              <div>
                <h4 style="margin-bottom:8px">복원 (가져오기)</h4>
                <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:12px">
                  백업 파일에서 데이터를 복원합니다. 기존 데이터는 덮어쓰기됩니다.
                </p>
                <input type="file" id="import-file" accept=".json" style="display:none">
                <button class="btn btn-warning" id="btn-import">&#x1F4E4; 데이터 복원하기</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="card" style="margin-top:20px;border:1px solid var(--danger)">
          <div class="card-header" style="background:var(--danger-light)">
            <span class="card-title" style="color:var(--danger)">&#x26A0; 위험 영역</span>
          </div>
          <div class="card-body">
            <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:12px">
              모든 데이터를 삭제합니다. 이 작업은 되돌릴 수 없으니 반드시 백업 후 실행해주세요.
            </p>
            <button class="btn btn-danger" id="btn-clear-all">&#x1F5D1; 전체 데이터 초기화</button>
          </div>
        </div>
      </div>
    `;
  },

  async init() {
    // Tab switching with unsaved changes warning
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        // Check for unsaved changes in current tab
        const currentTab = document.querySelector('.settings-tab-content:not([style*="display: none"])') || document.querySelector('.settings-tab-content:not([style*="display:none"])');
        if (currentTab && currentTab._modified) {
          const proceed = await App.confirm('저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?');
          if (!proceed) return;
          currentTab._modified = false;
        }
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const tabId = 'tab-' + tab.dataset.tab;
        document.getElementById(tabId).style.display = 'block';
      });
    });

    // Mark tab as modified when any input changes
    document.querySelectorAll('.settings-tab-content input, .settings-tab-content select, .settings-tab-content textarea').forEach(el => {
      el.addEventListener('change', () => {
        const tabContent = el.closest('.settings-tab-content');
        if (tabContent) tabContent._modified = true;
      });
      el.addEventListener('input', () => {
        const tabContent = el.closest('.settings-tab-content');
        if (tabContent) tabContent._modified = true;
      });
    });

    // Tab 1: 매장 관리 전체 저장
    document.getElementById('btn-save-tab-shop')?.addEventListener('click', async () => {
      // 매장 정보
      await DB.setSetting('shopName', document.getElementById('s-shopName').value.trim());
      await DB.setSetting('shopPhone', document.getElementById('s-shopPhone').value.trim());
      await DB.setSetting('shopAddress', document.getElementById('s-shopAddress').value.trim());
      await DB.setSetting('revisitDays', Number(document.getElementById('s-revisitDays').value) || 30);
      await App.applyShopName();
      // 미용사 목록
      const inputs = document.querySelectorAll('.groomer-input');
      const groomers = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
      await DB.setSetting('groomers', groomers);
      // 휴무일
      const checks = document.querySelectorAll('input[name="closedDay"]:checked');
      const closedDays = Array.from(checks).map(cb => Number(cb.value));
      await DB.setSetting('closedDays', closedDays);
      // 테마 색상
      const activeColor = document.querySelector('.theme-color-btn.active');
      if (activeColor) {
        await DB.setSetting('themeColor', activeColor.dataset.color);
        App.applyTheme(activeColor.dataset.color);
      }
      const currentTabShop = document.getElementById('tab-shop');
      if (currentTabShop) currentTabShop._modified = false;
      App.showToast('매장 관리 설정이 저장되었습니다.');
    });

    // Add groomer
    document.getElementById('btn-add-groomer')?.addEventListener('click', () => {
      const input = document.getElementById('new-groomer');
      const name = input.value.trim();
      if (!name) return;
      const list = document.getElementById('groomer-list');
      const index = list.querySelectorAll('.groomer-input').length;
      list.insertAdjacentHTML('beforeend', `
        <div style="display:flex;align-items:center;gap:8px">
          <input type="text" class="groomer-input" value="${App.escapeHtml(name)}" style="flex:1">
          <button class="btn btn-sm btn-danger btn-remove-groomer" data-index="${index}">삭제</button>
        </div>
      `);
      input.value = '';
      // Re-bind remove buttons
      this.bindGroomerRemove();
    });

    this.bindGroomerRemove();

    // Theme color picker
    document.querySelectorAll('.theme-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Tab 2: 운영 설정 전체 저장
    document.getElementById('btn-save-tab-operation')?.addEventListener('click', async () => {
      // 알림 설정
      const enabled = document.getElementById('s-notifEnabled').checked;
      const minutes = Number(document.getElementById('s-notifMinutes').value) || 30;
      await DB.setSetting('notifEnabled', enabled);
      await DB.setSetting('notifMinutes', minutes);
      if (enabled && 'Notification' in window && Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          App.showToast('브라우저 알림 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.', 'warning');
        }
      }
      App.setupNotificationChecker();
      // 메시지 템플릿
      const tplRevisit = document.getElementById('tpl-revisit');
      const tplAppointment = document.getElementById('tpl-appointment');
      const tplBirthday = document.getElementById('tpl-birthday');
      const tplComplete = document.getElementById('tpl-complete');
      if (tplRevisit && tplAppointment && tplBirthday && tplComplete) {
        await DB.setSetting('messageTemplates', {
          revisit: tplRevisit.value,
          appointment: tplAppointment.value,
          birthday: tplBirthday.value,
          complete: tplComplete.value
        });
      }
      // 매출 목표
      const goal = Number(document.getElementById('s-dailyGoal').value) || 0;
      await DB.setSetting('dailyGoal', goal);
      // 월 고정비
      const fixedCostMan = Number(document.getElementById('s-fixedCost').value) || 0;
      await DB.setSetting('monthlyFixedCost', fixedCostMan * 10000);
      const currentTabOp = document.getElementById('tab-operation');
      if (currentTabOp) currentTabOp._modified = false;
      App.showToast('운영 설정이 저장되었습니다.');
    });

    // Reset templates to defaults
    document.getElementById('btn-reset-templates')?.addEventListener('click', async () => {
      const defaults = {
        revisit: '[{매장명}] {고객명}님 안녕하세요! {반려견명}의 마지막 미용 후 {경과일수}일이 지났습니다. 예약 문의: {전화번호}',
        appointment: '[{매장명}] {고객명}님, {날짜} {시간}에 {반려견명} 예약이 확인되었습니다. 담당: {미용사}. 문의: {전화번호}',
        birthday: '[{매장명}] {고객명}님! {반려견명}의 생일을 축하합니다! 🎂 생일 기념 특별 할인을 준비했어요. 문의: {전화번호}',
        complete: '[{매장명}] {고객명}님, {반려견명}의 미용이 완료되었습니다! 서비스: {서비스}, 금액: {금액}원. 감사합니다! 💕'
      };
      await DB.setSetting('messageTemplates', defaults);
      document.getElementById('tpl-revisit').value = defaults.revisit;
      document.getElementById('tpl-appointment').value = defaults.appointment;
      document.getElementById('tpl-birthday').value = defaults.birthday;
      document.getElementById('tpl-complete').value = defaults.complete;
      App.showToast('기본값으로 복원되었습니다.');
    });

    // Revenue CSV export
    document.getElementById('btn-export-revenue-csv')?.addEventListener('click', () => {
      App.pages.records?.showExportModal();
    });

    // Export
    document.getElementById('btn-export')?.addEventListener('click', async () => {
      try {
        const data = await DB.exportAll();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = App.getToday();
        a.href = url;
        const backupName = await DB.getSetting('shopName') || '펫살롱';
        a.download = `${backupName}_백업_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        App.showToast('백업 완료! 이전 백업 파일은 삭제해도 됩니다.', 'info');
        await DB.setSetting('lastBackupDate', App.getToday());
      } catch (err) {
        console.error('Export error:', err);
        App.showToast('백업 중 오류가 발생했습니다.', 'error');
      }
    });

    // Import
    document.getElementById('btn-import')?.addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const confirmed = await App.confirm('데이터를 복원하면 현재 데이터가 모두 덮어쓰기됩니다.<br>계속하시겠습니까?');
      if (!confirmed) {
        e.target.value = '';
        return;
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data._version && !data.customers) {
          App.showToast('올바른 백업 파일이 아닙니다.', 'error');
          return;
        }

        await DB.importAll(data);
        App.showToast('데이터가 복원되었습니다.');
        App.handleRoute();
      } catch (err) {
        console.error('Import error:', err);
        App.showToast('복원 중 오류가 발생했습니다. 파일을 확인해주세요.', 'error');
      }
      e.target.value = '';
    });

    // Clear all
    document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
      const confirmed = await App.confirm('정말로 모든 데이터를 삭제하시겠습니까?<br><strong>이 작업은 되돌릴 수 없습니다!</strong>');
      if (!confirmed) return;

      const doubleConfirm = await App.confirm('마지막 확인입니다.<br>모든 고객, 반려견, 예약, 미용 기록, 서비스 메뉴가 삭제됩니다.');
      if (!doubleConfirm) return;

      try {
        await DB.clearAll();
        App.showToast('모든 데이터가 초기화되었습니다.');
        App.handleRoute();
      } catch (err) {
        console.error('Clear error:', err);
        App.showToast('초기화 중 오류가 발생했습니다.', 'error');
      }
    });
  },

  bindGroomerRemove() {
    document.querySelectorAll('.btn-remove-groomer').forEach(btn => {
      btn.onclick = () => btn.parentElement.remove();
    });
  },

  async directBackup() {
    try {
      const data = await DB.exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = App.getToday();
      a.href = url;
      const backupName = await DB.getSetting('shopName') || '펫살롱';
      a.download = `${backupName}_백업_${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await DB.setSetting('lastBackupDate', App.getToday());
      App.showToast('백업 완료! 이전 백업 파일은 삭제해도 됩니다.', 'info');
    } catch (err) {
      App.showToast('백업 중 오류가 발생했습니다.', 'error');
    }
  }

};
