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
            <button class="btn btn-primary" id="btn-save-settings">저장</button>
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
            <button class="btn btn-primary" id="btn-save-groomers">미용사 목록 저장</button>
          </div>
        </div>

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
      </div>

        <!-- 예약 알림 설정 -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">&#x1F514; 예약 알림 설정</span>
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
              <div class="form-hint">예약 시간 기준으로 미리 알림을 보냅니다</div>
            </div>
            <button class="btn btn-primary" id="btn-save-notif">알림 설정 저장</button>
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
    `;
  },

  async init() {
    // Save settings
    document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
      await DB.setSetting('shopName', document.getElementById('s-shopName').value.trim());
      await DB.setSetting('shopPhone', document.getElementById('s-shopPhone').value.trim());
      await DB.setSetting('shopAddress', document.getElementById('s-shopAddress').value.trim());
      await DB.setSetting('revisitDays', Number(document.getElementById('s-revisitDays').value) || 30);
      await App.applyShopName();
      App.showToast('설정이 저장되었습니다.');
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

    // Save notification settings
    document.getElementById('btn-save-notif')?.addEventListener('click', async () => {
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
      // 알림 체커 시작/중지
      App.setupNotificationChecker();
      App.showToast('알림 설정이 저장되었습니다.');
    });

    // Save groomers
    document.getElementById('btn-save-groomers')?.addEventListener('click', async () => {
      const inputs = document.querySelectorAll('.groomer-input');
      const groomers = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
      await DB.setSetting('groomers', groomers);
      App.showToast('미용사 목록이 저장되었습니다.');
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
        App.showToast('백업 파일이 다운로드되었습니다.');
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
};
