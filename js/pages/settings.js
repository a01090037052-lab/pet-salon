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

    const rewardSettings = await DB.getSetting('rewardSettings') || { type: 'stamp', stampGoal: 10, pointRate: 5, minUsePoints: 1000 };
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
        <button class="settings-tab active" data-tab="shop">🏪 매장 관리</button>
        <button class="settings-tab" data-tab="notify">💬 알림·메시지</button>
        <button class="settings-tab" data-tab="marketing">🎯 마케팅</button>
        <button class="settings-tab" data-tab="photocard">🖼 사진 카드</button>
        <button class="settings-tab" data-tab="data">💾 데이터</button>
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
        <button class="btn btn-primary btn-lg" id="btn-save-tab-shop" style="width:100%;margin-top:20px">매장 관리 설정 저장</button>
      </div>

      <!-- Tab 2: 알림·메시지 -->
      <div class="settings-tab-content" id="tab-notify" style="display:none">
        <div class="grid-2">
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
            </div>
          </div>
        </div>

        <!-- 메시지 템플릿 관리 -->
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">&#x1F4AC; 메시지 템플릿 관리</span>
          </div>
          <div class="card-body">
            <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">
              문자 발송 시 사용되는 메시지를 수정할 수 있습니다.<br>
              사용 가능한 변수: <code>{매장명}</code> <code>{고객명}</code> <code>{반려견명}</code> <code>{경과일수}</code> <code>{날짜}</code> <code>{시간}</code> <code>{서비스}</code> <code>{금액}</code> <code>{미용사}</code> <code>{전화번호}</code>            </p>
            <div class="form-group">
              <label class="form-label">재방문 알림 문자</label>
              <textarea id="tpl-revisit" rows="3">${App.escapeHtml(revisitTpl)}</textarea>
              <div class="form-hint">재방문 알림에서 "문자" 버튼 클릭 시 사용</div>
            </div>
            <div class="form-group">
              <label class="form-label">예약 확인 문자</label>
              <textarea id="tpl-appointment" rows="3">${App.escapeHtml(appointmentTpl)}</textarea>
              <div class="form-hint">예약 등록 후 고객에게 확인 문자 발송 시 사용</div>
            </div>
            <div class="form-group">
              <label class="form-label">생일 축하 문자</label>
              <textarea id="tpl-birthday" rows="3">${App.escapeHtml(birthdayTpl)}</textarea>
              <div class="form-hint">생일 알림에서 "축하 문자" 버튼 클릭 시 사용</div>
            </div>
            <div class="form-group">
              <label class="form-label">미용 완료 안내 문자</label>
              <textarea id="tpl-complete" rows="3">${App.escapeHtml(completeTpl)}</textarea>
              <div class="form-hint">미용 기록 저장 후 고객에게 안내 문자 발송 시 사용</div>
            </div>
            <button class="btn btn-secondary" id="btn-reset-templates">기본값 복원</button>
          </div>
        </div>
        <button class="btn btn-primary btn-lg" id="btn-save-tab-notify" style="width:100%;margin-top:20px">알림·메시지 설정 저장</button>
      </div>

      <!-- Tab 3: 마케팅 -->
      <div class="settings-tab-content" id="tab-marketing" style="display:none">
        <!-- 일일 매출 목표 -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">&#x1F3AF; 일일 매출 목표</span>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">일일 매출 목표</label>
              <input type="number" id="s-dailyGoal" value="${(await DB.getSetting('dailyGoal')) || ''}" placeholder="예: 500000" min="0" step="10000">
              <div class="form-hint">대시보드에 목표 대비 달성률이 표시됩니다</div>
            </div>
          </div>
        </div>

        <!-- 스탬프 적립 설정 -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">&#x2B50; 스탬프 적립 설정</span>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">무료 서비스 기준 (N회 방문)</label>
              <input type="number" id="s-stampGoal" value="${rewardSettings.stampGoal || 10}" min="2" max="50" placeholder="10">
              <div class="form-hint">이 횟수만큼 스탬프가 모이면 무료 서비스가 제공됩니다</div>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="s-stampEnabled" ${rewardSettings.type !== 'none' ? 'checked' : ''}>
                스탬프 적립 사용
              </label>
            </div>
          </div>
        </div>

        <!-- 고객 자동 분류 설정 -->
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">&#x1F3F7; 고객 자동 분류</span>
          </div>
          <div class="card-body">
            <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">
              미용 기록 저장 시 방문 횟수에 따라 고객 분류를 자동으로 업데이트합니다.<br>
              VIP와 주의 태그는 수동으로만 지정됩니다.
            </p>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" id="s-autoTagEnabled" ${(await DB.getSetting('autoTagEnabled')) ? 'checked' : ''}>
                자동 분류 사용
              </label>
            </div>
            <div class="form-row three">
              <div class="form-group">
                <label class="form-label">신규 기준 (최대 방문 수)</label>
                <input type="number" id="s-autoTagNew" value="${(await DB.getSetting('autoTagNewMax')) || 2}" min="0" max="100" placeholder="2">
                <div class="form-hint">0~이 횟수까지 '신규' 태그</div>
              </div>
              <div class="form-group">
                <label class="form-label">일반 기준 (최대 방문 수)</label>
                <input type="number" id="s-autoTagNormal" value="${(await DB.getSetting('autoTagNormalMax')) || 9}" min="1" max="200" placeholder="9">
                <div class="form-hint">신규 초과~이 횟수까지 '일반' 태그</div>
              </div>
              <div class="form-group">
                <label class="form-label">단골 기준 (최소 방문 수)</label>
                <input type="number" id="s-autoTagRegular" value="${(await DB.getSetting('autoTagRegularMin')) || 10}" min="2" max="200" placeholder="10">
                <div class="form-hint">이 횟수 이상이면 '단골' 태그</div>
              </div>
            </div>
          </div>
        </div>
        <button class="btn btn-primary btn-lg" id="btn-save-tab-marketing" style="width:100%;margin-top:20px">마케팅 설정 저장</button>
      </div>

      <!-- Tab 4: 사진 카드 -->
      <div class="settings-tab-content" id="tab-photocard" style="display:none">
        <!-- 사진 카드 디자인 -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">&#x1F5BC; 사진 카드 디자인</span>
          </div>
          <div class="card-body" id="card-design-body">
            <p style="color:var(--text-secondary);font-size:0.85rem;margin-bottom:16px">
              미용 전후 사진 카드의 디자인을 자유롭게 커스터마이징할 수 있습니다.
            </p>

            <!-- 레이아웃 선택 -->
            <div class="form-group">
              <label class="form-label">레이아웃</label>
              <div id="card-layout-list" class="card-design-grid"></div>
            </div>

            <!-- 시즌 테마 -->
            <div class="form-group">
              <label class="form-label">시즌 테마</label>
              <div id="card-template-list" class="card-template-grid"></div>
            </div>

            <!-- 메인 색상 -->
            <div class="form-group">
              <label class="form-label">메인 색상</label>
              <div style="display:flex;align-items:center;gap:12px">
                <input type="color" id="card-color" value="#6366F1" style="width:60px;height:40px;padding:2px;cursor:pointer">
                <span id="card-color-hex" style="font-size:0.85rem;color:var(--text-secondary)">#6366F1</span>
              </div>
            </div>

            <!-- 표시 정보 -->
            <div class="form-group">
              <label class="form-label">표시 정보</label>
              <div id="card-info-toggles" style="display:flex;flex-wrap:wrap;gap:6px"></div>
            </div>

            <!-- 매장 로고 -->
            <div class="form-group">
              <label class="form-label">매장 로고</label>
              <div style="display:flex;align-items:center;gap:12px">
                <div id="card-logo-preview" style="width:60px;height:60px;border-radius:8px;border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:0.75rem;color:var(--text-muted);flex-shrink:0">없음</div>
                <div style="display:flex;flex-direction:column;gap:6px">
                  <input type="file" id="card-logo-input" accept="image/*" style="display:none">
                  <button class="btn btn-sm btn-secondary" id="btn-upload-logo">업로드</button>
                  <button class="btn btn-sm btn-ghost" id="btn-remove-logo" style="display:none;font-size:0.75rem;color:var(--danger)">삭제</button>
                </div>
              </div>
            </div>

            <!-- 하단 인사말 -->
            <div class="form-group">
              <label class="form-label">하단 인사말</label>
              <input type="text" id="card-footer-msg" value="" placeholder="감사합니다 ♥">
            </div>

            <div style="display:flex;gap:10px;margin-top:8px">
              <button class="btn btn-primary" id="btn-save-card-settings">저장</button>
              <button class="btn btn-secondary" id="btn-preview-card">미리보기</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 5: 데이터 -->
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
    // Tab switching
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const tabId = 'tab-' + tab.dataset.tab;
        document.getElementById(tabId).style.display = 'block';
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

    // Tab 2: 알림·메시지 전체 저장
    document.getElementById('btn-save-tab-notify')?.addEventListener('click', async () => {
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
      const tpls = {
        revisit: document.getElementById('tpl-revisit').value,
        appointment: document.getElementById('tpl-appointment').value,
        birthday: document.getElementById('tpl-birthday').value,
        complete: document.getElementById('tpl-complete').value
      };
      await DB.setSetting('messageTemplates', tpls);
      App.showToast('알림·메시지 설정이 저장되었습니다.');
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

    // Tab 3: 마케팅 전체 저장
    document.getElementById('btn-save-tab-marketing')?.addEventListener('click', async () => {
      // 일일 매출 목표
      const goal = Number(document.getElementById('s-dailyGoal').value) || 0;
      await DB.setSetting('dailyGoal', goal);
      // 스탬프 설정
      const stampEnabled = document.getElementById('s-stampEnabled')?.checked;
      const stampGoal = Number(document.getElementById('s-stampGoal')?.value) || 10;
      const stampType = stampEnabled ? 'stamp' : 'none';
      await DB.setSetting('rewardSettings', { type: stampType, stampGoal });
      // 고객 자동 분류
      await DB.setSetting('autoTagEnabled', document.getElementById('s-autoTagEnabled').checked);
      await DB.setSetting('autoTagNewMax', Number(document.getElementById('s-autoTagNew').value) || 2);
      await DB.setSetting('autoTagNormalMax', Number(document.getElementById('s-autoTagNormal').value) || 9);
      await DB.setSetting('autoTagRegularMin', Number(document.getElementById('s-autoTagRegular').value) || 10);
      App.showToast('마케팅 설정이 저장되었습니다.');
    });

    // 사진 카드 템플릿 설정
    this.setupCardTemplates();

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

  // ========== 사진 카드 디자인 설정 ==========
  CARD_TEMPLATES: {
    default: { name: '기본', color: '#6366F1', bgColor: '#F8FAFC', emoji: '\u2702', footerBg: '#6366F1' },
    spring: { name: '봄 \uD83C\uDF38', color: '#EC4899', bgColor: '#FDF2F8', emoji: '\uD83C\uDF38', footerBg: '#EC4899' },
    summer: { name: '여름 \uD83C\uDF0A', color: '#06B6D4', bgColor: '#ECFEFF', emoji: '\uD83C\uDF0A', footerBg: '#06B6D4' },
    autumn: { name: '가을 \uD83C\uDF42', color: '#D97706', bgColor: '#FFFBEB', emoji: '\uD83C\uDF42', footerBg: '#D97706' },
    winter: { name: '겨울 \u2744', color: '#3B82F6', bgColor: '#EFF6FF', emoji: '\u2744', footerBg: '#3B82F6' },
    minimal: { name: '미니멀', color: '#374151', bgColor: '#FFFFFF', emoji: '\u2702', footerBg: '#374151' },
    cute: { name: '귀여운 \uD83D\uDC3E', color: '#F472B6', bgColor: '#FFF1F2', emoji: '\uD83D\uDC3E', footerBg: '#F472B6' }
  },

  CARD_LAYOUTS: {
    vertical: { name: '\uC138\uB85C\uD615 (\uAE30\uBCF8)', desc: 'Before\u2192After \uC138\uB85C \uBC30\uCE58', icon: '\u2B07' },
    photobooth4: { name: '\uC778\uC0DD\uB124\uCEF7 (4\uCEF7)', desc: '4\uCEF7 \uD3EC\uD1A0\uBD80\uC2A4 \uC2A4\uD0C0\uC77C', icon: '\uD83C\uDFAC' },
    minimal: { name: '\uBBF8\uB2C8\uB9D0', desc: '\uC0AC\uC9C4\uB9CC \uAE54\uB054\uD558\uAC8C', icon: '\u2728' }
  },

  _cardDesignLogo: null,
  _cardDesignBg: null,

  async setupCardTemplates() {
    // Load combined settings (backward compatible)
    const oldSettings = await DB.getSetting('cardTemplateSettings') || {};
    const designSettings = await DB.getSetting('cardDesignSettings') || {};
    const settings = {
      layout: designSettings.layout || 'vertical',
      template: designSettings.template || oldSettings.template || 'default',
      mainColor: designSettings.mainColor || oldSettings.mainColor || '#6366F1',
      showService: designSettings.showService !== false,
      showPrice: designSettings.showPrice !== false,
      showGroomer: designSettings.showGroomer !== false,
      showNextVisit: designSettings.showNextVisit !== false,
      showDate: designSettings.showDate !== false,
      showPetInfo: designSettings.showPetInfo !== false,
      showShopPhone: designSettings.showShopPhone !== false,
      footerMessage: designSettings.footerMessage || oldSettings.footerMessage || '\uAC10\uC0AC\uD569\uB2C8\uB2E4 \u2665',
      logo: designSettings.logo || null
    };

    this._cardDesignLogo = settings.logo;
    this._cardDesignBg = settings.bgImage;

    const body = document.getElementById('card-design-body');
    if (!body) return;

    // -- Layout selection --
    const layoutList = document.getElementById('card-layout-list');
    if (layoutList) {
      let lhtml = '';
      for (const [key, lay] of Object.entries(this.CARD_LAYOUTS)) {
        const sel = settings.layout === key;
        lhtml += '<div class="card-design-item' + (sel ? ' selected' : '') + '" data-key="' + key + '">'
          + '<span class="card-design-item-icon">' + lay.icon + '</span>'
          + '<span class="card-design-item-name">' + lay.name + '</span>'
          + '</div>';
      }
      layoutList.innerHTML = lhtml;
      this._bindSelectionGroup(layoutList, '.card-design-item', 'data-key');
    }

    // -- Season theme --
    const tplList = document.getElementById('card-template-list');
    if (tplList) {
      let thtml = '';
      for (const [key, tpl] of Object.entries(this.CARD_TEMPLATES)) {
        const sel = settings.template === key;
        thtml += '<div class="card-tpl-item' + (sel ? ' selected' : '') + '" data-template="' + key + '" style="background:' + tpl.bgColor + '">'
          + '<span class="tpl-emoji">' + tpl.emoji + '</span>'
          + '<span style="color:' + tpl.color + '">' + tpl.name + '</span>'
          + '</div>';
      }
      tplList.innerHTML = thtml;
      const colorInput = document.getElementById('card-color');
      tplList.querySelectorAll('.card-tpl-item').forEach(item => {
        item.addEventListener('click', () => {
          tplList.querySelectorAll('.card-tpl-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          const tplKey = item.dataset.template;
          const tpl = this.CARD_TEMPLATES[tplKey];
          if (tpl && colorInput) {
            colorInput.value = tpl.color;
            const hex = document.getElementById('card-color-hex');
            if (hex) hex.textContent = tpl.color;
          }
        });
      });
    }

    // -- Color --
    const colorInput = document.getElementById('card-color');
    const colorHex = document.getElementById('card-color-hex');
    if (colorInput) {
      colorInput.value = settings.mainColor;
      if (colorHex) colorHex.textContent = settings.mainColor;
      colorInput.addEventListener('input', () => {
        if (colorHex) colorHex.textContent = colorInput.value;
      });
    }

    // -- Info toggles --
    const infoToggles = document.getElementById('card-info-toggles');
    if (infoToggles) {
      const infos = [
        { key: 'showService', label: '\uC11C\uBE44\uC2A4 \uB0B4\uC5ED' },
        { key: 'showPrice', label: '\uAE08\uC561' },
        { key: 'showGroomer', label: '\uB2F4\uB2F9 \uBBF8\uC6A9\uC0AC' },
        { key: 'showNextVisit', label: '\uB2E4\uC74C \uBC29\uBB38 \uAD8C\uC7A5\uC77C' },
        { key: 'showDate', label: '\uBBF8\uC6A9 \uB0A0\uC9DC' },
        { key: 'showPetInfo', label: '\uBC18\uB824\uACAC \uC815\uBCF4' },
        { key: 'showShopPhone', label: '\uB9E4\uC7A5 \uC804\uD654\uBC88\uD638' }
      ];
      infoToggles.innerHTML = infos.map(i =>
        '<label class="checkbox-label" style="min-width:auto;padding:6px 12px"><input type="checkbox" name="cardInfo" value="' + i.key + '"' + (settings[i.key] !== false ? ' checked' : '') + '> ' + i.label + '</label>'
      ).join('');
    }

    // -- Logo upload --
    const logoPreview = document.getElementById('card-logo-preview');
    const logoInput = document.getElementById('card-logo-input');
    const removeLogoBtn = document.getElementById('btn-remove-logo');
    if (settings.logo && logoPreview) {
      logoPreview.innerHTML = '<img src="' + settings.logo + '" style="width:100%;height:100%;object-fit:contain">';
      if (removeLogoBtn) removeLogoBtn.style.display = 'inline-flex';
    }
    document.getElementById('btn-upload-logo')?.addEventListener('click', () => logoInput?.click());
    logoInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const base64 = await this._compressImage(file, 200, 0.8);
      this._cardDesignLogo = base64;
      if (logoPreview) logoPreview.innerHTML = '<img src="' + base64 + '" style="width:100%;height:100%;object-fit:contain">';
      if (removeLogoBtn) removeLogoBtn.style.display = 'inline-flex';
      e.target.value = '';
    });
    removeLogoBtn?.addEventListener('click', () => {
      this._cardDesignLogo = null;
      if (logoPreview) logoPreview.innerHTML = '\uC5C6\uC74C';
      removeLogoBtn.style.display = 'none';
    });

    // -- Footer message --
    const footerInput = document.getElementById('card-footer-msg');
    if (footerInput) footerInput.value = settings.footerMessage;

    // -- Save --
    document.getElementById('btn-save-card-settings')?.addEventListener('click', async () => {
      const data = this._collectCardDesignSettings();
      // Also keep backward compat with old key
      await DB.setSetting('cardDesignSettings', data);
      await DB.setSetting('cardTemplateSettings', { template: data.template, mainColor: data.mainColor, footerMessage: data.footerMessage });
      App.showToast('\uC0AC\uC9C4 \uCE74\uB4DC \uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
    });

    // -- Preview --
    document.getElementById('btn-preview-card')?.addEventListener('click', async () => {
      await this._showCardPreview();
    });
  },

  _bindSelectionGroup(container, selector, attrName) {
    container.querySelectorAll(selector).forEach(item => {
      item.addEventListener('click', () => {
        container.querySelectorAll(selector).forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
      });
    });
  },

  _collectCardDesignSettings() {
    const layoutEl = document.querySelector('#card-layout-list .card-design-item.selected');
    const tplEl = document.querySelector('#card-template-list .card-tpl-item.selected');
    const colorInput = document.getElementById('card-color');
    const footerInput = document.getElementById('card-footer-msg');

    const infoChecks = {};
    document.querySelectorAll('input[name="cardInfo"]').forEach(cb => {
      infoChecks[cb.value] = cb.checked;
    });

    return {
      layout: layoutEl ? layoutEl.dataset.key : 'vertical',
      template: tplEl ? tplEl.dataset.template : 'default',
      mainColor: colorInput ? colorInput.value : '#6366F1',
      showService: infoChecks.showService !== false,
      showPrice: infoChecks.showPrice !== false,
      showGroomer: infoChecks.showGroomer !== false,
      showNextVisit: infoChecks.showNextVisit !== false,
      showDate: infoChecks.showDate !== false,
      showPetInfo: infoChecks.showPetInfo !== false,
      showShopPhone: infoChecks.showShopPhone !== false,
      footerMessage: footerInput ? footerInput.value.trim() : '\uAC10\uC0AC\uD569\uB2C8\uB2E4 \u2665',
      logo: this._cardDesignLogo || null
    };
  },

  async _compressImage(file, maxSize, quality) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) {
            if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
            else { w = Math.round(w * maxSize / h); h = maxSize; }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(null);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  },

  async _showCardPreview() {
    const data = this._collectCardDesignSettings();
    // Build dummy record data for preview
    const shopName = await DB.getSetting('shopName') || '\uD3AB\uC0B4\uB871';
    const shopPhone = await DB.getSetting('shopPhone') || '010-1234-5678';
    const dummyRecord = {
      date: App.getToday(),
      photoBefore: null,
      photoAfter: null,
      serviceIds: [],
      groomer: '\uBC15\uBBF8\uC6A9',
      nextVisitDate: (() => { const d = new Date(); d.setDate(d.getDate() + 28); return App.formatLocalDate(d); })(),
      totalPrice: 50000,
      finalPrice: 50000
    };
    const dummyPet = { name: '\uCF54\uCF54', breed: '\uD478\uB4E4' };
    const dummyCustomer = { name: '\uD64D\uAE38\uB3D9' };
    const dummyServiceNames = '\uC804\uCCB4\uBBF8\uC6A9';

    // Generate the card using records.js generatePhotoCard logic
    if (App.pages.records && App.pages.records._generateCardCanvas) {
      try {
        const canvas = await App.pages.records._generateCardCanvas(dummyRecord, dummyCustomer, dummyPet, shopName, shopPhone, dummyServiceNames, data);
        const dataUrl = canvas.toDataURL('image/png');
        App.showModal({
          title: '\uC0AC\uC9C4 \uCE74\uB4DC \uBBF8\uB9AC\uBCF4\uAE30',
          hideFooter: true,
          content: '<div style="text-align:center"><img src="' + dataUrl + '" style="max-width:100%;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15)"><p style="margin-top:12px;font-size:0.85rem;color:var(--text-secondary)">\uC2E4\uC81C \uCE74\uB4DC\uC5D0\uB294 \uBBF8\uC6A9 \uC804\uD6C4 \uC0AC\uC9C4\uC774 \uD3EC\uD568\uB429\uB2C8\uB2E4</p></div>'
        });
      } catch (err) {
        console.error('Preview error:', err);
        App.showToast('\uBBF8\uB9AC\uBCF4\uAE30 \uC0DD\uC131 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.', 'error');
      }
    } else {
      App.showToast('\uBBF8\uB9AC\uBCF4\uAE30 \uAE30\uB2A5\uC744 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.', 'error');
    }
  },

  // setupRewardSettings is now handled by btn-save-tab-marketing

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
      App.showToast('백업 파일이 다운로드되었습니다.');
    } catch (err) {
      App.showToast('백업 중 오류가 발생했습니다.', 'error');
    }
  }

};
