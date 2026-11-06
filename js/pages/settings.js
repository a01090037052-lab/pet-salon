// ========== Settings Page ==========
const DEFAULT_SMS_TEMPLATES = {
  revisit: '[{매장명}] {고객명}님 안녕하세요! {반려견명}의 마지막 미용 후 {경과일수}일이 지났습니다. 예약 문의: {전화번호}',
  atRisk: '[{매장명}] {고객명}님, {반려견명}이(가) 보고 싶어요! 미용 시기가 많이 지났는데 괜찮으신가요? 예약 문의: {전화번호}',
  churned: '[{매장명}] {고객명}님 안녕하세요! 오랫동안 뵙지 못했네요. {반려견명} 잘 지내고 있나요? 다시 방문해주시면 특별 케어 해드릴게요! 문의: {전화번호}',
  appointment: '[{매장명}] {고객명}님, {날짜} {시간}에 {반려견명} 예약이 확인되었습니다. {담당}문의: {전화번호}',
  reminder: '[{매장명}] {고객명}님, {시점} {날짜} {시간}에 {반려견명} 미용 예약이 있습니다. 변경/취소는 {전화번호}로 연락 부탁드립니다.',
  birthday: '[{매장명}] {고객명}님! {반려견명}의 생일을 축하합니다! 🎂 생일 기념 특별 할인을 준비했어요. 문의: {전화번호}',
  complete: '[{매장명}] {고객명}님, {반려견명}의 미용이 완료되었습니다! 서비스: {서비스}, 금액: {금액}원. 감사합니다! 💕',
  cardSend: '[{매장명}] {고객명}님, 오늘 {반려견명} 미용 사진이에요! 예쁘게 다녀갔어요. 감사합니다 ♥',
  reportSend: '[{매장명}] {고객명}님, 오늘 {반려견명} 미용 리포트예요. 사진과 오늘 상태, 집에서 관리법을 담았어요. 감사합니다 ♥ {리뷰링크}',
  unpaid: '[{매장명}] {고객명}님 안녕하세요. {날짜} {반려견명} 미용 금액 {금액}원이 아직 결제되지 않아 안내드려요. 편하실 때 결제 부탁드립니다. 감사합니다. 문의: {전화번호}'
};

// 템플릿별 설명·쓸 수 있는 변수 — 화면에서 변수 버튼과 미리보기를 만든다.
// (예전엔 모든 변수를 한 줄로 안내해서, 재방문 문자에 {금액}을 넣으면 조용히 빠졌다)
const SMS_DATE_VARS = ['시점', '날짜', '시간', '담당'];
const SMS_TEMPLATE_META = [
  { key: 'reminder', label: '예약 재확인', when: '예약 전날 · 예약 카드의 재확인 문자', vars: ['고객명', '반려견명', ...SMS_DATE_VARS, '매장명', '전화번호'] },
  { key: 'appointment', label: '예약 확인', when: '예약을 저장한 직후', vars: ['고객명', '반려견명', ...SMS_DATE_VARS, '매장명', '전화번호'] },
  { key: 'complete', label: '미용 완료', when: '미용 기록을 저장한 직후', vars: ['고객명', '반려견명', '서비스', '금액', '매장명', '전화번호', '리뷰링크'] },
  { key: 'reportSend', label: '리포트 전송', when: '미용 리포트(이미지)를 보호자에게 보낼 때', vars: ['고객명', '반려견명', '다음방문일', '매장명', '전화번호', '리뷰링크'] },
  { key: 'cardSend', label: '사진 카드', when: '사진 카드를 손님에게 보낼 때', vars: ['고객명', '반려견명', '매장명', '전화번호', '리뷰링크'] },
  { key: 'revisit', label: '올 때 됨', when: '홈 \'연락할 손님\'(올 때 됨·늦음) · 고객 화면', vars: ['고객명', '반려견명', '경과일수', '마지막방문일', '매장명', '전화번호'] },
  { key: 'atRisk', label: '많이 늦음', when: '홈 \'연락할 손님\'(올 때 됨·늦음) 중 주기가 많이 지난 손님', vars: ['고객명', '반려견명', '경과일수', '마지막방문일', '매장명', '전화번호'] },
  { key: 'churned', label: '오래 안 옴', when: '홈 \'연락할 손님\'(오래 안 옴)', vars: ['고객명', '반려견명', '경과일수', '마지막방문일', '매장명', '전화번호'] },
  { key: 'birthday', label: '생일 축하', when: '홈의 생일 알림', vars: ['고객명', '반려견명', '매장명', '전화번호'] },
  { key: 'unpaid', label: '미결제 안내', when: '홈 \'미결제\' 카드의 문자 버튼', vars: ['고객명', '반려견명', '날짜', '금액', '매장명', '전화번호'] }
];

App.pages.settings = {
  async render(container) {
    const shopName = await DB.getSetting('shopName') || '';
    const shopPhone = await DB.getSetting('shopPhone') || '';
    const shopAddress = await DB.getSetting('shopAddress') || '';
    const shopReviewLink = await DB.getSetting('shopReviewLink') || '';
    const revisitDays = await DB.getSetting('revisitDays') || 30;
    const groomers = await DB.getSetting('groomers') || [];

    const notifEnabled = await DB.getSetting('notifEnabled');
    const notifMinutes = await DB.getSetting('notifMinutes');
    const closedDays = await DB.getSetting('closedDays') || [];
    const themeColor = await DB.getSetting('themeColor') || '#6366F1';

    const savedTemplates = await DB.getSetting('messageTemplates') || {};
    // 사용자가 템플릿 수정했는지 (기본 펼침 판단)
    const hasCustomTemplate = Object.keys(savedTemplates).length > 0;

    const [customers, pets, appointments, records, services, prepaidRows] = await Promise.all([
      DB.count('customers'),
      DB.count('pets'),
      DB.count('appointments'),
      DB.count('records'),
      DB.count('services'),
      DB.count('prepaid').catch(() => 0)
    ]);
    // 정액권은 쓰는 매장만 한 줄 (잔액 있는 손님 수 · 잔액 합계)
    let prepaidSummary = null;
    if (prepaidRows > 0) {
      const bm = Prepaid.balanceMap(await Prepaid.getAllEntries());
      const vals = Object.values(bm).filter(v => v !== 0);
      prepaidSummary = { rows: prepaidRows, holders: vals.filter(v => v > 0).length, total: vals.reduce((a, b) => a + b, 0) };
    }
    // 직전 복원 취소용 메타 (사본 본문은 크므로 메타만 읽는다)
    let undoMeta = await DB.getSetting('_autoBackupBeforeImportMeta');
    // 되돌리기 사본은 7일만 보관 — 오래된 사본으로 되돌리면 그 뒤에 쌓인 예약·기록이 (동기화 시 모든 기기에서) 사라진다
    if (undoMeta && undoMeta.date && (Date.now() - Date.parse(undoMeta.date)) > 7 * 86400000) {
      try { await DB.delete('settings', '_autoBackupBeforeImport'); await DB.delete('settings', '_autoBackupBeforeImportMeta'); } catch (_) {}
      undoMeta = null;
    }
    const recordPhotoKeep = await App.getRecordPhotoKeep();
    const priceTable = await App.getPriceBands();

    // 보안 설정 로드
    const sec = (typeof Security !== 'undefined') ? await Security._load() : { enabled: false, pinLength: 6, maxAttempts: 5, lockoutSeconds: 30 };
    const isLockOn = !!sec.enabled;
    const isThisDeviceRegistered = (typeof Security !== 'undefined') ? await Security.isTrusted() : true;
    // 이 기기에선 껐지만 GitHub(master-config.js)에는 잠금이 남아 있는 상태
    const isOffHereOnly = !isLockOn && typeof Security !== 'undefined' && Security.masterConfigEnabled();

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">설정</h1>
          <p class="page-subtitle">매장 정보 및 데이터 관리</p>
        </div>
        <div class="page-actions">
          <a href="./guide.html" class="btn btn-secondary">${App.icon('book')} 사용 가이드</a>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="settings-tabs" id="settings-tabs">
        <button class="settings-tab active" data-tab="shop">${App.icon('store')} 매장 관리</button>
        <button class="settings-tab" data-tab="operation">${App.icon('settings')} 운영 설정</button>
        <button class="settings-tab" data-tab="data">${App.icon('save')} 데이터</button>
        <button class="settings-tab" data-tab="security">${App.icon('lock')} 보안</button>
      </div>

      <!-- Tab 1: 매장 관리 -->
      <div class="settings-tab-content" id="tab-shop">
        <div class="grid-2">
          <!-- Shop Info -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">${App.icon('store')} 매장 정보</span>
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
                <label class="form-label">리뷰 링크 <span style="font-size:0.93rem;color:var(--text-muted);font-weight:400">(선택)</span></label>
                <input type="url" id="s-shopReviewLink" value="${App.escapeHtml(shopReviewLink)}" placeholder="https://naver.me/... (네이버 플레이스·카카오맵 리뷰 주소)" inputmode="url">
                <div class="form-hint">넣으면 미용 리포트 하단에 "리뷰 남겨주시면 큰 힘이 돼요"가 붙고, 문자 템플릿의 {리뷰링크}에 들어가요. 비우면 둘 다 빠져요.</div>
              </div>
              <div class="form-group">
                <label class="form-label">매장 로고 <span style="font-size:0.93rem;color:var(--text-muted);font-weight:400">(사진 카드·미용 리포트에 표시)</span></label>
                <div style="display:flex;align-items:center;gap:12px">
                  <div id="s-logo-preview" style="width:48px;height:48px;border-radius:8px;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">${await (async () => { const logo = await DB.getSetting('shopLogo'); return logo ? `<img src="${logo}" style="width:100%;height:100%;object-fit:contain">` : '<span style="color:var(--text-muted);font-size:0.93rem">없음</span>'; })()}</div>
                  <input type="file" id="s-logo-file" accept="image/*" style="display:none">
                  <button type="button" class="btn btn-sm btn-secondary" id="s-logo-upload">로고 선택</button>
                  <button type="button" class="btn btn-sm btn-danger" id="s-logo-remove" style="display:${await DB.getSetting('shopLogo') ? '' : 'none'}">제거</button>
                </div>
                <div class="form-hint">PNG 투명 배경 권장. 사진 카드 상단에 매장명 대신 로고가 표시됩니다.</div>
              </div>
              <div class="form-group">
                <label class="form-label">재방문 알림 기준 (일)</label>
                <input type="number" id="s-revisitDays" value="${revisitDays}" min="1" max="365" placeholder="30">
                <div class="form-hint">마지막 미용 후 이 기간이 지나면 홈에 알림이 표시됩니다</div>
              </div>
            </div>
          </div>

          <!-- Groomer Management -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">${App.icon('users')} 미용사 관리</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">등록된 미용사 <span style="font-size:0.93rem;color:var(--text-muted);font-weight:400">(선택)</span></label>
                <div class="form-hint" style="margin-bottom:8px">혼자 운영하면 비워두거나 본인 1명만 적으세요. 직원을 2명 이상 등록하면 예약 화면에 담당 미용사·미용사별 타임테이블이, 매출·분석 화면에 미용사별 실적이 나타납니다.</div>
                <div id="groomer-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
                  ${(groomers || []).map((g, i) => `
                    <div style="display:flex;align-items:center;gap:8px">
                      <input type="text" class="groomer-input flex-1" value="${App.escapeHtml(g)}">
                      <button class="btn btn-sm btn-danger btn-remove-groomer" data-index="${i}">삭제</button>
                    </div>
                  `).join('')}
                </div>
                <div style="display:flex;gap:8px">
                  <input type="text" id="new-groomer" placeholder="새 미용사 이름" class="flex-1">
                  <button class="btn btn-sm btn-primary" id="btn-add-groomer">추가</button>
                </div>
              </div>
            </div>
          </div>

          <!-- 영업 설정 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">${App.icon('calendar')} 영업 설정</span>
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
            <span class="card-title">${App.icon('palette')} 테마 색상</span>
          </div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">매장 테마 컬러</label>
              <div id="theme-color-picker" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
                ${[
                  { c: '#6366F1', name: '보라' },
                  { c: '#EC4899', name: '핑크' },
                  { c: '#10B981', name: '그린' },
                  { c: '#F59E0B', name: '오렌지' },
                  { c: '#3B82F6', name: '블루' },
                  { c: '#9F1239', name: '버건디' },
                  { c: '#EF4444', name: '레드' },
                  { c: '#14B8A6', name: '틸' }
                ].map(({c, name}) => `
                  <button type="button" class="theme-color-btn${(themeColor || '#6366F1') === c ? ' active' : ''}" data-color="${c}" style="background:${c}" title="${name} (${c})" aria-label="테마 색상: ${name}"></button>
                `).join('')}
              </div>
              <div class="form-hint">선택한 색상이 앱 전체 테마에 적용됩니다</div>
            </div>
          </div>
        </div>

        <!-- 내 프레임 라이브러리 (사진 카드 시즌·이벤트별 프레임 관리) -->
        <div class="card" style="margin-top:16px">
          <div class="card-header">
            <span class="card-title">${App.icon('image')} 내 프레임 라이브러리</span>
            <span style="font-size:0.93rem;color:var(--text-muted)" id="frame-lib-count"></span>
          </div>
          <div class="card-body">
            <div id="frame-library-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div>
            <button type="button" id="btn-add-frame" class="btn btn-secondary" style="width:100%;min-height:44px">${App.icon('plus')} 새 프레임 추가</button>
            <div class="form-hint" style="margin-top:8px">시즌·이벤트별 프레임을 만들어 사진 카드 생성 시 선택할 수 있어요. 최대 5개.</div>
          </div>
        </div>

        <button class="btn btn-primary btn-lg settings-save-btn" id="btn-save-tab-shop">매장 관리 설정 저장</button>
      </div>

      <!-- Tab 2: 운영 설정 -->
      <div class="settings-tab-content" id="tab-operation" style="display:none">
        <!-- 가격 구간 (몸무게) — 서비스 가격이 이 구간표를 따른다 -->
        <div class="card" id="price-band-card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('coins')} 가격 구간 (몸무게)</span>
          </div>
          <div class="card-body" id="price-band-summary">${this._priceBandSummaryHtml(priceTable)}</div>
        </div>
        <div class="grid-2">
          <!-- 예약 알림 설정 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">${App.icon('bell')} 알림 설정</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" id="s-notifEnabled" ${notifEnabled ? 'checked' : ''}>
                  예약 알림 활성화
                </label>
                <div class="form-hint">예약 전에 알림을 띄웁니다. <strong>앱이 열려 있을 때만 알림이 와요(아이폰)</strong> — 앱을 닫으면 오지 않아요. 알림에는 반려견 이름과 시간만 보여요.</div>
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
              <!-- 푸시 알림 시험 (임시 — 시험이 끝나면 지우거나 정식 기능으로 바꾼다) -->
              <div class="form-group">
                <button type="button" class="btn btn-secondary btn-sm" id="btn-push-test">앱 닫아도 오는 알림 시험</button>
                <div class="form-hint" id="push-test-msg">시험 중인 기능이에요. 누른 뒤 앱을 완전히 닫고 1~2분 기다려 보세요. 손님 정보는 보내지 않아요.</div>
              </div>
            </div>
          </div>

          <!-- 매출 목표 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">${App.icon('target')} 매출 목표</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">월 매출 목표 (원)</label>
                <input type="number" id="s-monthlyGoal" value="${(await DB.getSetting('monthlyGoal')) || ''}" placeholder="예: 5000000 (500만원)" min="0" step="100000">
                <div class="form-hint">매출 페이지와 홈에 목표 달성률이 표시됩니다</div>
              </div>
            </div>
          </div>

          <!-- 매장 고정비 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">${App.icon('coins')} 고정비</span>
            </div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">월 고정비 (만원)</label>
                <input type="number" id="s-fixedCost" value="${Math.round((Number(await DB.getSetting('monthlyFixedCost')) || 0) / 10000)}" data-original="${Math.round((Number(await DB.getSetting('monthlyFixedCost')) || 0) / 10000)}" placeholder="예: 350" min="0" step="10">
                <div class="form-hint">임대료 + 인건비 + 공과금 + 보험 등 합산 금액</div>
              </div>
            </div>
          </div>

        </div>

        <!-- 메시지 템플릿 (접이식) — 수정된 템플릿 있으면 자동 펼침 -->
        <div class="card" style="margin-top:20px">
          <div class="card-header" style="cursor:pointer" onclick="this.parentElement.querySelector('.card-body').classList.toggle('hidden');this.querySelector('.toggle-icon').style.transform=this.parentElement.querySelector('.card-body').classList.contains('hidden')?'rotate(-90deg)':''">
            <span class="card-title">${App.icon('message')} 메시지 템플릿 <span class="toggle-icon" style="font-size:0.93rem;display:inline-block;transition:transform .15s${hasCustomTemplate ? '' : ';transform:rotate(-90deg)'}">${App.icon('chevron-down')}</span></span>
          </div>
          <div class="card-body${hasCustomTemplate ? '' : ' hidden'}">
            <p style="color:var(--text-secondary);font-size:0.93rem;margin-bottom:12px">
              문자를 보낼 때 쓰는 문구입니다. 아래 버튼을 누르면 손님마다 바뀌는 값(반려견 이름 등)이 커서 자리에 들어갑니다. 고치면 바로 저장됩니다.
            </p>
            <div class="tpl-tabs" role="tablist">
              ${SMS_TEMPLATE_META.map((m, i) => `<button type="button" class="tpl-tab${i === 0 ? ' active' : ''}" data-key="${m.key}" role="tab">${m.label}</button>`).join('')}
            </div>
            ${SMS_TEMPLATE_META.map((m, i) => `
            <div class="tpl-panel" data-key="${m.key}"${i === 0 ? '' : ' hidden'}>
              <div class="tpl-when">${App.icon('info')} ${m.when}</div>
              <div class="tpl-vars">${m.vars.map(v => `<button type="button" class="tpl-var" data-key="${m.key}" data-var="${v}">${v}</button>`).join('')}</div>
              <textarea id="tpl-${m.key}" class="tpl-input" data-key="${m.key}" rows="4">${App.escapeHtml(savedTemplates[m.key] || DEFAULT_SMS_TEMPLATES[m.key])}</textarea>
              <div class="tpl-preview-label">손님에게 보이는 모양 (예시)</div>
              <div class="tpl-preview" id="tpl-prev-${m.key}"></div>
            </div>`).join('')}
            <div id="tpl-saved-note" class="form-hint" style="min-height:1.2em;margin:4px 0 8px"></div>
            <button class="btn btn-secondary" id="btn-reset-templates" style="margin-bottom:8px">기본값 복원</button>
          </div>
        </div>

        <div style="height:80px"></div>
        <button class="btn btn-primary btn-lg settings-save-btn" id="btn-save-tab-operation">운영 설정 저장</button>
      </div>

      <!-- Tab 3: 데이터 -->
      <div class="settings-tab-content" id="tab-data" style="display:none">
        <!-- Backup & Restore — 데이터 탭 맨 위 (가장 자주 쓰고, 동기화보다 먼저 챙겨야 할 안전장치) -->
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('save')} 데이터 백업 및 복원</span>
          </div>
          <div class="card-body">
            <div class="grid-2" style="gap:24px">
              <div>
                <h4 style="margin-bottom:8px">백업 (내보내기)</h4>
                <p style="color:var(--text-secondary);font-size:0.93rem;margin-bottom:12px">
                  데이터를 JSON 파일로 저장합니다. 사진 제외 시 파일 크기가 대폭 줄어 빠르고 안전합니다.
                </p>
                <div style="display:flex;flex-direction:column;gap:8px">
                  <button class="btn btn-success" id="btn-export">${App.icon('download')} 백업 (사진 제외 · 권장)</button>
                  <button class="btn btn-secondary" id="btn-export-full" style="font-size:0.93rem">${App.icon('camera')} 사진 포함 백업 (용량 주의)</button>
                </div>
              </div>
              <div>
                <h4 style="margin-bottom:8px">복원 (가져오기)</h4>
                <p style="color:var(--text-secondary);font-size:0.93rem;margin-bottom:12px">
                  백업 파일에서 데이터를 복원합니다. 기존 데이터는 덮어쓰기되고, 동기화가 켜져 있으면 다른 기기에도 그대로 반영됩니다.
                </p>
                <input type="file" id="import-file" accept=".json" style="display:none">
                <button class="btn btn-warning" id="btn-import">${App.icon('upload')} 데이터 복원하기</button>
                ${undoMeta && undoMeta.date ? `
                <div id="undo-import-box" style="margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg)">
                  <div style="font-size:0.93rem;color:var(--text-secondary);margin-bottom:8px">
                    ${App.formatDateTime(undoMeta.date)} 복원 직전 상태가 보관되어 있습니다.<br>
                    <span style="color:var(--text-muted)">고객 ${undoMeta.customers ?? '-'}명 · 기록 ${undoMeta.records ?? '-'}건 · 사진 제외</span>
                    ${undoMeta.photosReplaced ? `<br><span style="color:var(--danger)">복원 파일에 사진이 포함되어 있어 기기 사진은 이미 교체됐습니다. 되돌려도 사진은 복구되지 않습니다.</span>` : ''}
                  </div>
                  <button class="btn btn-secondary" id="btn-undo-import" style="width:100%">복원 전 상태로 되돌리기</button>
                </div>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- 기기 간 동기화 -->
        ${typeof Sync !== 'undefined' ? `
        <div class="card" style="margin-bottom:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('refresh')} 기기 간 동기화</span>
          </div>
          <div class="card-body" id="sync-card-body">${this.syncCardHtml()}</div>
        </div>` : ''}

        <div class="grid-2">
          <!-- Data Stats -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">${App.icon('chart')} 데이터 현황</span>
            </div>
            <div class="card-body">
              <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">
                <a href="#customers" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--border);color:inherit;text-decoration:none">
                  <span>고객</span><span><strong>${customers}명</strong> <span style="color:var(--text-muted);margin-left:6px">&rsaquo;</span></span>
                </a>
                <a href="#pets" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--border);color:inherit;text-decoration:none">
                  <span>반려견</span><span><strong>${pets}마리</strong> <span style="color:var(--text-muted);margin-left:6px">&rsaquo;</span></span>
                </a>
                <a href="#appointments" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--border);color:inherit;text-decoration:none">
                  <span>예약</span><span><strong>${appointments}건</strong> <span style="color:var(--text-muted);margin-left:6px">&rsaquo;</span></span>
                </a>
                <a href="#records" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;border-bottom:1px solid var(--border);color:inherit;text-decoration:none">
                  <span>미용 기록</span><span><strong>${records}건</strong> <span style="color:var(--text-muted);margin-left:6px">&rsaquo;</span></span>
                </a>
                <a href="#services" style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px;color:inherit;text-decoration:none${prepaidSummary ? ';border-bottom:1px solid var(--border)' : ''}">
                  <span>서비스 메뉴</span><span><strong>${services}개</strong> <span style="color:var(--text-muted);margin-left:6px">&rsaquo;</span></span>
                </a>
                ${prepaidSummary ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 4px">
                  <span>정액권</span><span><strong>${prepaidSummary.rows}건</strong> <span style="color:var(--text-muted);font-size:0.93rem">· 잔액 ${prepaidSummary.holders}명 ${App.formatCurrency(prepaidSummary.total)}</span></span>
                </div>` : ''}
              </div>
            </div>
          </div>

          <!-- 세무 자료 내보내기 -->
          <div class="card">
            <div class="card-header">
              <span class="card-title">${App.icon('file')} 세무 자료 내보내기</span>
            </div>
            <div class="card-body">
              <p style="color:var(--text-secondary);font-size:0.93rem;margin-bottom:12px">
                기간별 매출 내역을 CSV 파일로 내보냅니다. 세무사에게 제출하거나 엑셀에서 열 수 있습니다.
              </p>
              <button class="btn btn-success" id="btn-export-revenue-csv">${App.icon('file')} 세무 자료 내보내기</button>
            </div>
          </div>
        </div>

        <!-- 저장 공간 최적화 -->
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">${App.icon('sparkle')} 저장 공간 최적화</span>
          </div>
          <div class="card-body">
            <p style="color:var(--text-secondary);font-size:0.93rem;margin-bottom:12px">
              사진 데이터를 최적화하여 저장 공간을 확보합니다. 반려견·기록에 저장된 큰 사진을 압축 분리합니다.
            </p>
            <button class="btn btn-primary" id="btn-optimize-storage">${App.icon('sparkle')} 저장 공간 최적화</button>
            <div id="optimize-result" style="margin-top:8px"></div>
            <div class="form-group" style="margin:16px 0 0;padding-top:14px;border-top:1px dashed var(--border)">
              <label class="form-label" for="s-record-photo-keep">기록 사진 보관</label>
              <select id="s-record-photo-keep" class="form-control" style="max-width:220px">
                ${[[2, '반려견별 최근 2회'], [3, '반려견별 최근 3회 (기본)'], [5, '반려견별 최근 5회'], [0, '전부 보관 (용량 계속 늘어남)']]
                  .map(([v, t]) => `<option value="${v}" ${Number(recordPhotoKeep) === v ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
              <small style="display:block;margin-top:6px;color:var(--text-muted);line-height:1.5">
                미용 기록의 전·후 사진은 반려견마다 최근 몇 회만 남기고 오래된 사진을 자동으로 지웁니다 (글 기록은 남습니다).
                폰과 데스크탑이 같은 기준을 쓰고, 사진은 600px 축소본으로 기기 간에 함께 보입니다.
              </small>
              <div id="record-photo-keep-result" style="margin-top:6px;font-size:0.93rem"></div>
            </div>
          </div>
        </div>

        <!-- Danger Zone -->
        <div class="card" style="margin-top:20px;border:1px solid var(--danger)">
          <div class="card-header" style="background:var(--danger-light)">
            <span class="card-title text-danger">${App.icon('alert')} 위험 영역</span>
          </div>
          <div class="card-body">
            <p style="color:var(--text-secondary);font-size:0.93rem;margin-bottom:12px">
              모든 데이터를 삭제합니다. 이 작업은 되돌릴 수 없으니 반드시 백업 후 실행해주세요.
            </p>
            <button class="btn btn-danger" id="btn-clear-all">${App.icon('trash')} 전체 데이터 초기화</button>
          </div>
        </div>
      </div>

      <!-- Tab 4: 보안 -->
      <div class="settings-tab-content" id="tab-security" style="display:none">
        <div class="card">
          <div class="card-header">
            <span class="card-title">${App.icon('lock')} 마스터 코드 잠금</span>
          </div>
          <div class="card-body">
            <p style="color:var(--text-secondary);font-size:0.93rem;margin-bottom:14px">
              <strong>처음 보는 기기에서 앱을 열면 코드를 묻는 가림막</strong>이에요. 앱 주소를 알게 된 사람이 바로 들어오지 못하게 막는 정도이고, 데이터를 암호화하지는 않아요.<br>
              <span style="font-size:0.93rem;color:var(--text-muted)">고객 데이터를 실제로 지켜 주는 건 기기마다 따로 저장되는 구조와 Google 로그인(클라우드 백업)이에요. 휴대폰 자체 잠금도 꼭 켜 두세요.</span>
            </p>
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg);border-radius:var(--radius);margin-bottom:16px">
              <span style="font-size:1.4rem">${App.icon(isLockOn ? 'lock' : 'unlock')}</span>
              <div class="flex-1">
                <div style="font-weight:700">${isLockOn ? '마스터 코드 잠금 사용 중' : isOffHereOnly ? '이 기기에서는 꺼짐' : '잠금 비활성'}</div>
                <div style="font-size:0.93rem;color:var(--text-muted)">${isLockOn ? `${sec.pinLength}자리 코드 · 등록된 기기만 사용` : isOffHereOnly ? '새 기기 잠금은 GitHub 설정에 남아 있음' : '누구나 접근 가능'}</div>
              </div>
              ${isLockOn
                ? `<button class="btn btn-danger btn-sm" id="btn-sec-disable">잠금 해제</button>`
                : `<button class="btn btn-primary btn-sm" id="btn-sec-enable">잠금 설정</button>`}
            </div>
            ${isOffHereOnly ? `
            <div class="form-group" style="margin-top:12px">
              <button class="btn btn-warning" id="btn-sec-show-off-config" style="width:100%;min-height:44px">${App.icon('globe')} 모든 기기 잠금 끄기 (GitHub 설정)</button>
              <div class="form-hint">GitHub 의 master-config.js 를 고쳐야 새 기기에서도 잠금이 꺼져요.</div>
            </div>` : ''}

            ${isLockOn ? `
            <div class="form-group" style="margin-top:12px">
              <button class="btn btn-warning" id="btn-sec-show-config" style="width:100%;min-height:44px">${App.icon('globe')} GitHub 배포 설정 보기</button>
              <div class="form-hint">${App.icon('alert')} 다른 디바이스 잠금 작동을 위해 GitHub 에 master-config.js push 필요. 첫 설정 또는 변경 시에만 실행.</div>
            </div>
            <div class="form-group" style="margin-top:12px">
              <button class="btn btn-secondary" id="btn-sec-change-pin" style="width:100%;min-height:44px">마스터 코드 변경</button>
              <div class="form-hint">${App.icon('alert')} 변경 시 다른 모든 등록 디바이스가 재등록 필요합니다</div>
            </div>
            <div class="form-group">
              <button class="btn btn-secondary" id="btn-sec-regen-recovery" style="width:100%;min-height:44px">복구 코드 재발급</button>
              <div class="form-hint">이 기기에선 바로 바뀌어요. 새 기기에서 예전 코드를 막으려면 이어서 나오는 GitHub 설정을 올려 주세요</div>
            </div>
            <hr style="border:none;border-top:1px solid var(--border);margin:18px 0">
            <div class="form-group">
              <label class="form-label">잠금 시도 한도</label>
              <select id="sec-max-attempts" style="width:100%;min-height:44px">
                <option value="3" ${sec.maxAttempts == 3 ? 'selected' : ''}>3회</option>
                <option value="5" ${sec.maxAttempts == 5 ? 'selected' : ''}>5회 (추천)</option>
                <option value="10" ${sec.maxAttempts == 10 ? 'selected' : ''}>10회</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">한도 초과 시 잠금 시간</label>
              <select id="sec-lockout-seconds" style="width:100%;min-height:44px">
                <option value="30" ${sec.lockoutSeconds == 30 ? 'selected' : ''}>30초</option>
                <option value="60" ${sec.lockoutSeconds == 60 ? 'selected' : ''}>1분</option>
                <option value="300" ${sec.lockoutSeconds == 300 ? 'selected' : ''}>5분</option>
              </select>
            </div>
            <button class="btn btn-primary" id="btn-sec-save-options" style="width:100%;min-height:44px;margin-top:8px">옵션 저장</button>
            <hr style="border:none;border-top:1px solid var(--border);margin:18px 0">
            <div class="form-group">
              <button class="btn btn-secondary" id="btn-sec-untrust-this" style="width:100%;min-height:44px">이 기기 등록 해제</button>
              <div class="form-hint">이 디바이스를 등록 해제 후 다음 접속 시 마스터 코드 재입력 필요</div>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="card" style="margin-top:16px">
          <div class="card-body">
            <div style="font-size:0.93rem;color:var(--text-secondary);line-height:1.6">
              <div style="font-weight:700;color:var(--text-primary);margin-bottom:6px">${App.icon('info')} 운영 안내 — 마스터 코드 사용법</div>
              <ul style="margin:0;padding-left:18px">
                <li><strong>코드 비공개</strong>: 마스터 코드는 사장님만 알고 있어야 합니다</li>
                <li><strong>새 디바이스 등록</strong>: 직원·가족 폰을 받아서 사장님이 직접 코드 입력 (5초)</li>
                <li><strong>원격 등록</strong>: 카톡 영상통화·화면공유로 사장님이 직접 입력</li>
                <li><strong>등록 후 영구 사용</strong>: 한 번 등록된 디바이스는 영구 사용 가능 (재인증 X)</li>
                <li><strong>그만둔 직원 차단</strong>: 마스터 코드 변경 → 모든 디바이스 재등록</li>
                <li><strong>코드 분실 시</strong>: 복구 코드로 재설정 또는 백업 파일로 복원</li>
                <li><strong>본인 데이터</strong>: 이 기기 브라우저에만 저장 (다른 사람 절대 못 봄)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

    `;
  },

  // 이메일·비밀번호 로그인/설정 모달 (아이폰 Safari 등 구글 로그인이 막히는 기기용)
  // ========== 가격 구간 (몸무게) ==========
  _priceBandSummaryHtml(table) {
    const chips = table.bands.map((b, i) => `<span class="badge badge-info" style="padding:6px 10px;font-size:0.93rem">${App.escapeHtml(App.getBandLabel(table, i))}</span>`).join(' ');
    const ok = table.overKg;
    if (table.bandsOff) return `
      <div style="font-size:0.93rem;color:var(--text-secondary);margin-bottom:10px"><strong>몸무게 구간 사용 안 함</strong> — 모든 서비스를 단일가로 받아요. 예전에 적은 구간 가격은 지우지 않고 보관해요 (다시 켜면 그대로 돌아와요).</div>
      <button type="button" class="btn btn-secondary" id="btn-edit-price-bands" style="min-height:44px">${App.icon('edit')} 구간 설정</button>
      <a href="#services" class="btn btn-ghost" style="min-height:44px">서비스 가격 보기</a>`;
    return `
      <div style="font-size:0.93rem;color:var(--text-secondary);margin-bottom:10px">서비스 가격을 몸무게 구간별로 정해요. 경계 몸무게는 아래 구간에 들어가요 (예: 5kg → 3~5kg).</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${chips}</div>
      <div style="font-size:0.93rem;margin-bottom:12px">${ok
        ? `큰 아이 추가 요금: <strong>${App.escapeHtml(App.describeOverKgRule({ from: App.overKgFrom(table), perKg: ok.perKg }))}</strong> <span style="color:var(--text-muted)">(소수 kg 올림 · 서비스마다 바꿀 수 있음)</span>`
        : '<span style="color:var(--text-muted)">초과 kg 추가 요금 꺼짐</span>'} · 반올림 ${App.formatCurrency(table.rounding)}</div>
      <button type="button" class="btn btn-secondary" id="btn-edit-price-bands" style="min-height:44px">${App.icon('edit')} 구간 편집</button>
      <a href="#services" class="btn btn-ghost" style="min-height:44px">서비스 가격 보기</a>`;
  },

  // 구간표 편집 모달. 가격은 구간 id 에 붙어 있어 경계만 바꾸면 가격은 그대로다.
  // 새로 생긴 구간(추가·프리셋)은 copyFrom 구간의 가격을 복사해 시작한다.
  async showPriceBandEditor() {
    const orig = await App.getPriceBands();
    const services = await DB.getAll('services');
    const state = {
      bands: orig.bands.map(b => ({ id: b.id, upTo: b.upTo })),
      overKg: orig.overKg ? { ...orig.overKg } : null,
      rounding: orig.rounding,
      bandsOff: !!orig.bandsOff,
      nextId: orig.nextId // 새 구간 id 카운터 (지운 id 를 다시 쓰지 않는다)
    };
    const lastOverKg = orig.overKg ? { ...orig.overKg } : { from: 10, perKg: 5000, ceil: true };
    // 이 구간에 가격이 있는 (구간 가격) 서비스 수
    const countPriced = (bandId) => services.filter(s => {
      const p = App.getServicePricing(s, orig);
      return p.mode === 'weight' && Number(p.prices[bandId]) > 0;
    }).length;

    App.showModal({
      title: '가격 구간 편집',
      saveText: '구간 저장',
      noAutoFocus: true, // 열자마자 숫자 키패드가 올라와 화면을 가리지 않게
      content: `
        <div class="form-group" style="background:var(--bg);border-radius:var(--radius);padding:12px">
          <label class="checkbox-label" style="font-weight:700">
            <input type="checkbox" id="pb-off" ${state.bandsOff ? 'checked' : ''}> 몸무게 구간 사용 안 함 (모든 서비스 단일가)
          </label>
          <div class="form-hint" id="pb-off-hint" style="margin-top:6px">${state.bandsOff ? '' : '체크하면 구간 칸이 모든 화면에서 숨겨져요.'}</div>
        </div>
        <div id="pb-band-ui" style="display:${state.bandsOff ? 'none' : 'block'}">
        <div class="form-group">
          <label class="form-label">빠른 설정</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${['three', 'five'].map(k => {
              const pb = App.PRICE_BAND_PRESETS[k].bands;
              const txt = pb.map((b, i) => b.upTo != null ? '~' + b.upTo : (i > 0 ? pb[i - 1].upTo : 0) + 'kg~').join(' / ');
              return `<button type="button" class="payment-chip" data-preset="${k}">${pb.length}단계 (${txt})</button>`;
            }).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">구간 <span style="color:var(--text-muted);font-size:0.93rem;font-weight:400">(각 구간의 최대 몸무게 kg — 그 몸무게까지 포함)</span></label>
          <div id="pb-rows"></div>
          <button type="button" class="btn btn-secondary btn-sm" id="pb-add" style="margin-top:8px;min-height:44px">+ 구간 추가</button>
        </div>
        <div class="form-group" style="background:var(--bg);border-radius:var(--radius);padding:12px">
          <label class="checkbox-label" style="font-weight:700">
            <input type="checkbox" id="pb-over-on" ${state.overKg ? 'checked' : ''}> 큰 아이 초과 kg 추가 요금
          </label>
          <div id="pb-over-fields" style="display:${state.overKg ? 'flex' : 'none'};gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:0.93rem">
            <input type="number" id="pb-over-from" value="${lastOverKg.from}" min="1" step="0.5" inputmode="decimal" style="width:80px"> kg 넘으면
            1kg당 + <input type="number" id="pb-over-per" value="${lastOverKg.perKg}" min="0" step="1000" inputmode="numeric" style="width:110px"> 원
          </div>
          <div class="form-hint" style="margin-top:6px">소수 kg 은 올려서 계산해요 (10.3kg → 1kg 추가). 서비스마다 '매장 기본 / 없음 / 따로'를 고를 수 있어요 (서비스 › 더 보기).</div>
        </div>
        </div>
        <div class="form-group">
          <label class="form-label">반올림 단위 <span style="color:var(--text-muted);font-size:0.93rem;font-weight:400">(초과 요금·일괄 조정·자동 채움)</span></label>
          <select id="pb-rounding">
            ${[100, 500, 1000, 5000, 10000].map(v => `<option value="${v}" ${state.rounding === v ? 'selected' : ''}>${v.toLocaleString('ko-KR')}원</option>`).join('')}
          </select>
        </div>
        <div id="pb-preview" class="form-hint"></div>
      `,
      onSave: () => this._savePriceBands(orig, state)
    });

    const offHint = () => document.getElementById('pb-off-hint');
    document.getElementById('pb-off')?.addEventListener('change', (e) => {
      document.getElementById('pb-band-ui').style.display = e.target.checked ? 'none' : 'block';
      const h = offHint();
      if (h) h.innerHTML = e.target.checked
        ? '모든 서비스가 <strong>단일가</strong>로 계산돼요. 구간 가격 서비스는 단일가가 적혀 있으면 그 값, 없으면 <strong>첫(가장 가벼운) 구간 가격</strong>을 써요. 구간 가격은 지우지 않고 보관해요 — 다시 켜면 그대로 돌아와요.'
        : '체크하면 구간 칸이 모든 화면에서 숨겨져요.';
    });
    const rowsEl = document.getElementById('pb-rows');
    const labelOf = (i) => App.getBandLabel({ bands: state.bands.map(b => ({ ...b, upTo: b.upTo })) }, i);
    const render = () => {
      rowsEl.innerHTML = state.bands.map((b, i) => {
        const isLast = i === state.bands.length - 1;
        return `<div class="pb-row" data-i="${i}" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light)">
          <span style="flex:1;font-weight:700">${App.escapeHtml(labelOf(i) || '-')}</span>
          ${isLast ? '<span style="color:var(--text-muted);font-size:0.93rem;width:110px;text-align:right">그 이상 전부</span>'
                   : `<span style="display:flex;align-items:center;gap:4px"><input type="number" class="pb-upto" data-i="${i}" value="${b.upTo ?? ''}" min="0.5" step="0.5" inputmode="decimal" style="width:80px"> kg 까지</span>`}
          <button type="button" class="btn btn-ghost btn-sm pb-del" data-i="${i}" ${state.bands.length <= 1 ? 'disabled' : ''} aria-label="구간 삭제" style="min-width:44px;min-height:44px">${App.icon('trash')}</button>
        </div>`;
      }).join('');
      const pv = document.getElementById('pb-preview');
      if (pv) pv.textContent = '미리보기: ' + state.bands.map((b, i) => labelOf(i)).join(' / ');
      syncOverFrom();
    };
    // 초과 kg 기준은 마지막 구간 시작보다 낮을 수 없다. 마지막 구간 시작이 바뀌면 기준도 그 값으로 맞춘다 (고칠 수는 있음)
    const lastLower = () => state.bands.length > 1 ? Number(state.bands[state.bands.length - 2].upTo) || 0 : 0;
    let trackedLower = lastLower();
    const syncOverFrom = () => {
      const fromEl = document.getElementById('pb-over-from');
      if (!fromEl) return;
      const lb = lastLower();
      fromEl.min = String(lb || 1);
      if (lb !== trackedLower) {
        trackedLower = lb;
        if (lb > 0) fromEl.value = lb;
      }
    };
    render();
    document.getElementById('pb-over-from')?.addEventListener('change', (e) => {
      const lb = lastLower();
      const v = parseFloat(e.target.value);
      if (lb > 0 && !(v >= lb)) { e.target.value = lb; App.showToast(`초과 kg 기준은 마지막 구간 시작(${App.formatKg(lb)}kg)보다 낮을 수 없어요.`, 'info'); }
    });

    rowsEl.addEventListener('input', (e) => {
      const inp = e.target.closest('.pb-upto');
      if (!inp) return;
      const v = parseFloat(inp.value);
      state.bands[Number(inp.dataset.i)].upTo = v > 0 ? v : null;
      syncOverFrom();
      // 이름만 다시 (입력 중인 칸은 그대로)
      rowsEl.querySelectorAll('.pb-row').forEach(row => {
        const i = Number(row.dataset.i);
        const span = row.querySelector('span');
        if (span) span.textContent = labelOf(i) || '-';
      });
      const pv = document.getElementById('pb-preview');
      if (pv) pv.textContent = '미리보기: ' + state.bands.map((b, i) => labelOf(i)).join(' / ');
    });
    rowsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.pb-del');
      if (!btn || btn.disabled) return;
      const i = Number(btn.dataset.i);
      const b = state.bands[i];
      const n = orig.bands.some(x => x.id === b.id) ? countPriced(b.id) : 0;
      const label = labelOf(i);
      if (n > 0) {
        const ok = await App.confirm(`<strong>${App.escapeHtml(label)}</strong> 구간에 가격이 있는 서비스가 <strong>${n}개</strong> 있어요.<br>삭제하면 그 가격은 지워지고, 이 몸무게는 ${i === state.bands.length - 1 ? '바로 앞(더 가벼운)' : '다음(더 무거운)'} 구간 가격을 따라요. 삭제할까요?`, { okLabel: '구간 삭제' });
        if (!ok) return;
      }
      state.bands.splice(i, 1);
      if (state.bands.length) state.bands[state.bands.length - 1].upTo = null; // 마지막은 항상 '그 이상'
      render();
    });
    document.getElementById('pb-add')?.addEventListener('click', () => {
      // 마지막('그 이상') 구간 앞에 새 경계를 하나 추가 — 가격은 바로 앞(더 가벼운) 구간에서 복사.
      // 새 구간이 맨 앞이 되면(구간이 하나뿐) 원래 첫 구간에서 복사
      const n = state.bands.length;
      const src = n > 1 ? state.bands[n - 2] : state.bands[0];
      const prevUp = n > 1 ? Number(state.bands[n - 2].upTo) || 0 : 0;
      const nb = { id: App._newBandId({ bands: state.bands.concat(orig.bands), nextId: state.nextId }), upTo: prevUp + 5, copyFrom: src.copyFrom || src.id };
      state.nextId = Number(nb.id.slice(1)) + 1;
      state.bands.splice(state.bands.length - 1, 0, nb);
      render();
    });
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const preset = App.PRICE_BAND_PRESETS[btn.dataset.preset];
        const ok = services.length === 0 || await App.confirm('구간을 프리셋으로 바꿀까요?<br><small style="color:var(--text-muted)">새 구간 가격은 지금 구간표에서 같은 몸무게가 속한 구간 가격을 복사해요. 저장 전엔 바뀌지 않아요.</small>', { okLabel: '바꾸기', danger: false });
        if (!ok) return;
        const idState = { bands: orig.bands.concat(state.bands), nextId: state.nextId };
        state.bands = preset.bands.map((pb, i) => {
          const lower = i > 0 ? preset.bands[i - 1].upTo : 0;
          const rep = pb.upTo != null ? pb.upTo : lower + 0.1; // 그 구간 대표 몸무게
          const src = App.resolveBand(orig, rep).band.id;
          const nb = { id: App._newBandId(idState), upTo: pb.upTo, copyFrom: src };
          return nb;
        });
        state.nextId = idState.nextId;
        state.overKg = preset.overKg ? { ...preset.overKg } : null;
        const on = document.getElementById('pb-over-on');
        if (on) on.checked = !!state.overKg;
        document.getElementById('pb-over-fields').style.display = state.overKg ? 'flex' : 'none';
        if (state.overKg) {
          document.getElementById('pb-over-from').value = state.overKg.from;
          document.getElementById('pb-over-per').value = state.overKg.perKg;
        }
        trackedLower = lastLower(); // 프리셋의 기준값을 그대로 쓴다
        render();
      });
    });
    document.getElementById('pb-over-on')?.addEventListener('change', (e) => {
      document.getElementById('pb-over-fields').style.display = e.target.checked ? 'flex' : 'none';
      if (e.target.checked) {
        const fromEl = document.getElementById('pb-over-from');
        const lb = lastLower();
        const v = parseFloat(fromEl.value);
        if (!(v > 0) || v < lb) fromEl.value = lb || 10;
      }
    });
  },

  async _savePriceBands(orig, state) {
    const bands = state.bands.map(b => ({ ...b }));
    if (bands.length === 0) { App.showToast('구간이 하나 이상 있어야 해요.', 'error'); return; }
    bands[bands.length - 1].upTo = null;
    for (let i = 0; i < bands.length - 1; i++) {
      const up = Number(bands[i].upTo);
      if (!(up > 0)) { App.showToast(`${i + 1}번째 구간의 최대 몸무게를 입력하세요.`, 'error'); return; }
      if (i > 0 && !(up > Number(bands[i - 1].upTo))) { App.showToast('구간 몸무게는 위에서 아래로 커져야 해요.', 'error'); return; }
    }
    const overOn = document.getElementById('pb-over-on')?.checked;
    let overKg = null;
    if (overOn) {
      const from = parseFloat(document.getElementById('pb-over-from')?.value);
      const perKg = Number(document.getElementById('pb-over-per')?.value);
      if (!(from > 0) || !(perKg > 0)) { App.showToast('초과 kg 기준과 1kg당 금액을 입력하세요.', 'error'); return; }
      const lb = bands.length > 1 ? Number(bands[bands.length - 2].upTo) || 0 : 0;
      overKg = { from: Math.max(from, lb), perKg, ceil: true }; // 마지막 구간 시작보다 낮으면 올린다
    }
    const rounding = Number(document.getElementById('pb-rounding')?.value) || 1000;
    const bandsOff = !!document.getElementById('pb-off')?.checked;
    // 경계만 바꿨는지 (같은 구간 id·순서, 추가 요금·반올림·사용 여부 그대로) — 가격은 구간 id 에 붙어 있어 그대로다
    const sameIds = bands.length === orig.bands.length && bands.every((b, i) => b.id === orig.bands[i].id);
    const sameOver = JSON.stringify(overKg && { f: overKg.from, p: overKg.perKg }) === JSON.stringify(orig.overKg && { f: orig.overKg.from, p: orig.overKg.perKg });
    const boundaryOnly = sameIds && sameOver && rounding === orig.rounding && bandsOff === !!orig.bandsOff
      && bands.some((b, i) => (b.upTo ?? null) !== (orig.bands[i].upTo ?? null));
    if (bandsOff && !orig.bandsOff) {
      // '구간 사용 안 함'을 켜기 전에: 서비스마다 가격이 어떻게 바뀌는지 보여 주고 확인
      const offTable = { ...orig, bandsOff: true };
      const all = (await DB.getAll('services')).filter(s => s.isActive !== false);
      const rows = all.map(s => {
        const p = App.getServicePricing(s, orig);
        const r = App.calcServicePrice(s, null, offTable);
        const rule = App.getOverKgRule(s, offTable, p);
        const before = p.free ? '무료' : App.formatServicePrice(s, orig);
        const after = r.free ? '무료' : r.price > 0 ? App.formatCurrency(r.price) + ' 단일가' : '가격 미입력';
        return `<div style="padding:3px 0;border-bottom:1px solid var(--border-light);font-size:0.93rem"><strong>${App.escapeHtml(s.name)}</strong> ${App.escapeHtml(before)} → <strong>${App.escapeHtml(after)}</strong>${rule ? `<div style="color:var(--warning-text-strong, #b45309);font-size:0.93rem">+ 이 서비스만 따로: ${App.escapeHtml(App.describeOverKgRule(rule))} (계속 붙어요)</div>` : ''}</div>`;
      }).join('');
      const ok = await App.confirm(`모든 서비스를 단일가로 받아요. 가격은 이렇게 바뀌어요:<div style="max-height:40vh;overflow-y:auto;margin:8px 0;text-align:left">${rows || '<div style="color:var(--text-muted)">서비스가 아직 없어요</div>'}</div><small style="color:var(--text-muted)">구간 가격은 보관돼요 — 다시 켜면 돌아와요. 매장 기본 kg당 요금은 쓰지 않아요.</small>`, { okLabel: '단일가로 바꾸기', danger: false });
      if (!ok) return;
    }
    const table = App.normalizePriceBands({ version: 1, nextId: state.nextId, bands: bands.map(b => ({ id: b.id, upTo: b.upTo })), overKg, rounding, bandsOff });
    // 서비스 1개의 새 pricing — 가격은 구간 id 에 붙어 있고, 새 구간은 copyFrom 구간 가격으로 시작 (미리보기·저장 공통)
    const nextPricing = (svc) => {
      const p = svc.pricing ? JSON.parse(JSON.stringify(svc.pricing)) : App.legacyToPricing(svc, orig);
      let priceMoved = false;
      if (p.mode === 'weight') {
        // 이 서비스 가격이 (옛 구간 id 로 남아) 지금 구간표와 안 맞으면 먼저 대표 몸무게로 옮겨 놓는다
        let src = p.prices || {};
        if (App._pricingTable(p, orig) !== orig) {
          src = {};
          App.getServiceBandRows({ ...svc, pricing: p }, orig).forEach(r => { if (r.price > 0) src[r.id] = r.price; });
        }
        const next = {};
        bands.forEach(b => {
          const v = Number(src[b.id]) || (b.copyFrom ? Number(src[b.copyFrom]) || 0 : 0);
          if (v > 0) next[b.id] = v;
        });
        const hadAny = Object.values(p.prices || {}).some(v => Number(v) > 0);
        if (Object.keys(next).length > 0 || !hadAny) {
          const kept = Object.fromEntries(Object.entries(src).filter(([k]) => next[k] != null || bands.some(b => b.id === k)));
          priceMoved = JSON.stringify(next) !== JSON.stringify(kept);
          p.prices = next;
        } // 옮길 가격이 하나도 안 나오면(있을 수 없는 경우) 원래 가격·bandsAt 을 그대로 둔다
      }
      return { p, priceMoved };
    };
    if (!bandsOff) {
      // 구간 가격이 실제로 바뀌는 서비스가 있으면 '이전 → 이후'를 보여 주고 확인 (경계만 옮긴 경우·서비스 0개면 묻지 않는다)
      const onOrig = { ...orig, bandsOff: false };
      const inv = App.pages.services._bandInversions.bind(App.pages.services);
      const rowsTxt = (rows) => rows.map(v => v ? App.formatManwon(v) : '-').join(' / ');
      const changed = (await DB.getAll('services')).filter(s => s.isActive !== false).map(s => {
        const p0 = App.getServicePricing(s, orig);
        if (p0.free || p0.mode !== 'weight') return null;
        const p1 = nextPricing(s).p;
        const s1 = { ...s, pricing: p1 };
        const before = App.getServiceBandRows(s, onOrig).map(r => r.price);
        const after = App.getServiceBandRows(s1, table).map(r => r.price);
        if (!before.some(v => v > 0) && !after.some(v => v > 0)) return null; // 가격 미입력 서비스
        const range0 = App.formatServicePrice(s, onOrig), range1 = App.formatServicePrice(s1, table);
        if (range0 === range1 && JSON.stringify(before) === JSON.stringify(after)) return null;
        const oldInv = inv(p0, onOrig).length;
        const newInv = inv(p1, table);
        return { name: s.name, before: rowsTxt(before), after: rowsTxt(after), inv: newInv.length > oldInv ? newInv : [] };
      }).filter(Boolean);
      if (changed.length) {
        const labels = (t) => t.bands.map((b, i) => App.escapeHtml(App.getBandLabel(t, i))).join(' / ');
        const rows = changed.map(c => `<div style="padding:3px 0;border-bottom:1px solid var(--border-light);font-size:0.93rem"><strong>${App.escapeHtml(c.name)}</strong> ${App.escapeHtml(c.before)} → <strong>${App.escapeHtml(c.after)}</strong>${c.inv.length ? `<div style="color:var(--danger);font-size:0.93rem">${App.icon('alert')} 무거운 구간이 더 싸져요: ${App.escapeHtml(c.inv.join(', '))}</div>` : ''}</div>`).join('');
        const ok = await App.confirm(`서비스 ${changed.length}개의 구간 가격이 이렇게 바뀌어요:<div style="font-size:0.93rem;color:var(--text-muted);margin-top:6px;text-align:left">이전 구간: ${labels(onOrig)}<br>이후 구간: ${labels(table)}</div><div style="max-height:40vh;overflow-y:auto;margin:8px 0;text-align:left">${rows}</div><small style="color:var(--text-muted)">새 구간은 바로 앞(더 가벼운) 구간 가격으로 시작해요. 저장 뒤 서비스 메뉴에서 고칠 수 있어요.</small>`, { okLabel: '구간 저장', danger: false });
        if (!ok) return;
      }
    }
    try {
      // 구버전 기기에서 고친 가격을 먼저 반영 (덮어쓰지 않게)
      await App.migratePriceBands();
      // 구간표를 먼저 저장한다 — 서비스부터 쓰면 그 사이(또는 도중 실패 시) 다른 기기가 모르는 구간 id 로 0원을 계산했다.
      // 서비스에는 가격을 적을 때의 구간 경계(bandsAt)가 남아, 구간표와 서비스가 잠깐 어긋나도 가격이 계산된다.
      await App.savePriceBands(table);
      const services = await DB.getAll('services');
      const now = new Date().toISOString();
      let updated = 0;
      for (const svc of services) {
        const before = JSON.stringify([svc.pricing || null, svc.priceSmall, svc.priceMedium, svc.priceLarge]);
        const { p, priceMoved } = nextPricing(svc);
        if (priceMoved) svc.priceChangedAt = now;
        svc.pricing = p;
        App.applyLegacyPrices(svc, table);
        // 실제로 바뀐 서비스만 쓴다 (동기화 쓰기 최소화)
        if (JSON.stringify([svc.pricing, svc.priceSmall, svc.priceMedium, svc.priceLarge]) !== before) {
          await DB.update('services', svc);
          updated++;
        }
      }
      if (boundaryOnly) App.showToast('구간 경계를 저장했어요 (가격은 그대로)');
      else if (bandsOff !== !!orig.bandsOff) App.showToast(bandsOff ? '이제 모든 서비스를 단일가로 받아요. 구간 가격은 보관돼요.' : '몸무게 구간을 다시 써요.' + (services.length ? ' 서비스 가격을 확인하세요.' : ''), 'info', { duration: 6000 });
      else App.showToast(`가격 구간을 저장했어요${updated ? ' (서비스 ' + updated + '개 가격 갱신)' : ''}${services.length ? '. 서비스 가격을 확인하세요.' : ''}`);
      App.closeModal();
      App.handleRoute();
    } catch (e) {
      console.error('가격 구간 저장 실패:', e);
      App.showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  },

  _syncPasswordModal(mode) {
    const st = Sync.getStatus();
    const title = mode === 'set' ? '다른 기기용 비밀번호' : '이메일·비밀번호로 로그인';
    const hint = mode === 'set'
      ? `지금 로그인한 구글 계정(${App.escapeHtml(st.email)})에 비밀번호를 연결합니다. 아이폰처럼 구글 로그인이 안 되는 기기에서 이 이메일과 비밀번호로 로그인하세요. 6자 이상.`
      : '컴퓨터에서 먼저 <strong>다른 기기용 비밀번호 설정</strong>을 해 두어야 합니다. 같은 구글 이메일과 그 비밀번호를 입력하세요.';
    App.showModal({
      title,
      saveText: mode === 'set' ? '비밀번호 저장' : '로그인',
      content: `
        <p style="font-size:0.93rem;color:var(--text-secondary);margin:0 0 12px">${hint}</p>
        ${mode === 'set' ? '' : `<div class="form-group"><label class="form-label">이메일</label>
          <input type="email" id="sync-pw-email" autocomplete="username" autocapitalize="off" value="${App.escapeHtml(st.email || '')}" placeholder="example@gmail.com"></div>`}
        <div class="form-group"><label class="form-label">비밀번호</label>
          <input type="password" id="sync-pw-pass" autocomplete="${mode === 'set' ? 'new-password' : 'current-password'}" minlength="6" placeholder="6자 이상"></div>`,
      onSave: async () => {
        const pass = document.getElementById('sync-pw-pass').value;
        if (!pass || pass.length < 6) { App.showToast('비밀번호는 6자 이상이어야 합니다.', 'error'); App.highlightField('sync-pw-pass'); return; }
        let ok = false;
        if (mode === 'set') ok = await Sync.setPassword(pass);
        else {
          const email = (document.getElementById('sync-pw-email').value || '').trim();
          if (!email) { App.showToast('이메일을 입력해주세요.', 'error'); return; }
          App.closeModal();
          await new Promise(r => setTimeout(r, 200));
          ok = mode === 'enable' ? await Sync.enableWithPassword(email, pass) : await Sync.signInWithPassword(email, pass);
          const el = document.getElementById('sync-card-body');
          if (el) el.innerHTML = this.syncCardHtml();
          return;
        }
        if (ok) { App.closeModal(); App.showToast('비밀번호를 저장했습니다. 다른 기기에서 이 이메일과 비밀번호로 로그인하세요.', 'success', { duration: 6000 }); }
        const el = document.getElementById('sync-card-body');
        if (el) el.innerHTML = this.syncCardHtml();
      }
    });
  },

  // ========== 기기 간 동기화 카드 ==========
  syncCardHtml() {
    const st = Sync.getStatus();
    const dotCls = { synced: 'synced', pending: 'pending', error: 'error', offline: 'offline', signin: 'offline', off: 'offline' }[st.state];
    const label = {
      off: '꺼짐',
      signin: '로그인 필요',
      offline: `오프라인 — 대기 ${st.pending}건`,
      error: '오류',
      pending: `동기화 중 · 대기 ${st.pending}건`,
      synced: '동기화됨'
    }[st.state];
    const btn = (id, icon, text, cls = 'btn-secondary') => `<button class="btn ${cls}" id="${id}">${App.icon(icon)} ${text}</button>`;
    let actions;
    if (st.state === 'off') actions = btn('btn-sync-enable', 'refresh', '구글로 동기화 켜기', 'btn-primary') + btn('btn-sync-enable-pw', 'lock', '이메일·비밀번호로 켜기');
    else if (st.state === 'signin' || (st.state === 'error' && !st.signedIn)) actions = btn('btn-sync-signin', 'user', '구글로 다시 로그인', 'btn-primary') + btn('btn-sync-signin-pw', 'lock', '이메일·비밀번호로 로그인') + btn('btn-sync-disable', 'close', '동기화 끄기');
    else actions = btn('btn-sync-now', 'refresh', '지금 동기화', 'btn-primary') + btn('btn-sync-resync', 'copy', '전체 다시 맞추기') + btn('btn-sync-setpw', 'lock', st.hasPassword ? '다른 기기용 비밀번호 변경' : '다른 기기용 비밀번호 설정') + btn('btn-sync-disable', 'close', '동기화 끄기');
    return `
      <p style="color:var(--text-secondary);font-size:0.93rem;margin-bottom:12px">
        휴대폰과 컴퓨터에서 같은 예약·고객·기록을 봅니다. 기록 사진은 600px 축소본으로 함께 보이고, 원본은 찍은 기기에만 남습니다.
      </p>
      ${st.state === 'off' ? `<p class="sync-owner-note">동기화는 등록된 매장 계정만 사용할 수 있습니다. 동기화 없이도 이 기기에서 모든 기능을 쓸 수 있으며, 데이터는 이 기기에만 저장되니 정기 백업을 해주세요.</p>` : ''}
      <div class="sync-status-line"><span class="sync-dot ${dotCls}"></span>${App.escapeHtml(label)}</div>
      ${st.error ? `<div style="color:var(--danger);font-size:0.93rem;margin-bottom:6px">${App.escapeHtml(st.error)}</div>` : ''}
      ${st.enabled && st.email ? `<div style="color:var(--text-muted);font-size:0.93rem">계정: ${App.escapeHtml(st.email)}</div>` : ''}
      ${st.enabled && st.lastSyncAt ? `<div style="color:var(--text-muted);font-size:0.93rem">마지막 동기화: ${App.escapeHtml(App.formatDateTime(new Date(st.lastSyncAt).toISOString()))}</div>` : ''}
      <div class="sync-actions">${actions}</div>
    `;
  },

  bindSyncCard() {
    const body = document.getElementById('sync-card-body');
    if (!body || typeof Sync === 'undefined') return;
    body.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.id === 'btn-sync-enable') {
        b.disabled = true;
        await Sync.enable();
      } else if (b.id === 'btn-sync-signin') {
        b.disabled = true;
        await Sync.signIn();
      } else if (b.id === 'btn-sync-enable-pw' || b.id === 'btn-sync-signin-pw') {
        this._syncPasswordModal(b.id === 'btn-sync-enable-pw' ? 'enable' : 'signin');
        return;
      } else if (b.id === 'btn-sync-setpw') {
        this._syncPasswordModal('set');
        return;
      } else if (b.id === 'btn-sync-now') {
        b.disabled = true;
        await Sync.syncNow();
        App.showToast('동기화를 확인했습니다.', 'info', { duration: 2000 });
      } else if (b.id === 'btn-sync-resync') {
        const ok = await App.confirm('이 기기와 클라우드를 하나씩 비교해 서로 빠진 데이터를 채웁니다.<br><small style="color:var(--text-muted)">지우는 데이터는 없습니다. 양쪽에 다 있으면 더 최근에 고친 쪽으로 맞춥니다. 다른 기기에서 예약에 반려견 이름이 ?로 보일 때 그 정보가 있는 기기에서 눌러주세요.</small>', { okLabel: '다시 맞추기', danger: false });
        if (!ok) return;
        b.disabled = true;
        await Sync.resync();
      } else if (b.id === 'btn-sync-disable') {
        const ok = await App.confirm('동기화를 끕니다.<br><small style="color:var(--text-muted)">이 기기의 데이터는 그대로 남습니다. 아직 보내지 못한 변경은 보내지 않습니다.</small>', { okLabel: '동기화 끄기' });
        if (!ok) return;
        await Sync.disable();
        App.showToast('동기화를 껐습니다.', 'info');
      }
      const el = document.getElementById('sync-card-body');
      if (el) el.innerHTML = this.syncCardHtml();
    };
    // 상태가 바뀌면 카드만 다시 그린다 (페이지 전체를 다시 그리지 않음) — 리스너는 한 번만 등록
    if (!this._syncStatusBound) {
      this._syncStatusBound = true;
      window.addEventListener('sync:status', () => {
        const el = document.getElementById('sync-card-body');
        if (el && !el.querySelector('button:disabled')) el.innerHTML = this.syncCardHtml();
      });
    }
  },

  // 푸시 알림 시험 (임시). 시험 서버는 정해진 시험 문구만 보낸다 — 손님 정보는 보내지 않는다.
  _PUSH_TEST_URL: 'https://petsalon-push-test.a01090037052.workers.dev',
  async _runPushTest() {
    const msg = document.getElementById('push-test-msg');
    const btn = document.getElementById('btn-push-test');
    const say = (t) => { if (msg) msg.textContent = t; };
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        say('이 기기에서는 푸시 알림을 쓸 수 없어요. 아이폰은 홈 화면에 추가한 앱에서만 됩니다(iOS 16.4 이상).');
        return;
      }
      btn.disabled = true;
      const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') { say('알림 권한이 꺼져 있어요. 아이폰 설정 › 알림에서 이 앱을 허용해 주세요.'); return; }
      const st = await (await fetch(this._PUSH_TEST_URL + '/status')).json();
      const reg = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(st.vapid.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((st.vapid.length + 3) % 4)), c => c.charCodeAt(0));
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const r1 = await fetch(this._PUSH_TEST_URL + '/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      if (!r1.ok) { say('구독 등록 실패 (' + r1.status + ')'); return; }
      const r2 = await fetch(this._PUSH_TEST_URL + '/test?delay=90', { method: 'POST' });
      if (!r2.ok) { say(r2.status === 429 ? '이미 기다리는 시험 알림이 있어요. 잠시 뒤 다시 눌러 주세요.' : '시험 예약 실패 (' + r2.status + ')'); return; }
      say('준비됐어요. 지금 앱을 완전히 닫고(위로 쓸어 올리기) 2~3분 안에 "펫살롱 시험 알림"이 오는지 봐 주세요.');
    } catch (e) {
      say('시험 중 오류: ' + (e && e.message ? e.message : e));
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async init() {
    // 그려진 직후 값을 '저장된 값'으로 기억 — 나갈 때(다른 메뉴·홈·탭) 비교한다
    this._saved = {};
    this._markSaved('shop');
    this._markSaved('operation');
    App.leaveGuard = async () => {
      if (!document.getElementById('settings-tabs')) { App.leaveGuardDirty = false; return true; } // 이미 다른 화면
      const dirty = this._dirtyTabs();
      return !dirty.length || this._confirmUnsaved(dirty);
    };
    this.bindSyncCard();
    document.getElementById('btn-edit-price-bands')?.addEventListener('click', () => this.showPriceBandEditor());
    // Tab switching with unsaved changes warning
    document.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        // 현재 보이는 탭 감지 — getComputedStyle로 견고하게
        const currentTab = Array.from(document.querySelectorAll('.settings-tab-content'))
          .find(el => getComputedStyle(el).display !== 'none');
        const curKey = currentTab ? currentTab.id.replace('tab-', '') : '';
        if (curKey && curKey !== tab.dataset.tab && this._dirtyTabs().includes(curKey)) {
          if (!(await this._confirmUnsaved([curKey]))) return;
        }
        document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.settings-tab-content').forEach(c => c.style.display = 'none');
        tab.classList.add('active');
        const tabId = 'tab-' + tab.dataset.tab;
        document.getElementById(tabId).style.display = 'block';
      });
    });
    // 다른 화면의 바로가기(예: 매출 > '세무 자료 내보내기는 설정 › 데이터에서')가 특정 탭을 열어 달라고 남긴 표시
    try {
      const openTab = sessionStorage.getItem('settings-open-tab');
      if (openTab) {
        sessionStorage.removeItem('settings-open-tab');
        document.querySelector(`.settings-tab[data-tab="${openTab}"]`)?.click();
      }
    } catch (e) { /* ignore */ }

    // 저장 안 한 입력 추적 — 저장된 값(스냅샷)과 지금 값을 비교한다.
    // 코드가 값을 넣는 건 이벤트가 안 뜨고, 고쳤다가 되돌리면 다시 '깨끗함'이 된다.
    ['tab-shop', 'tab-operation'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => this._updateDirty());
      el.addEventListener('change', () => this._updateDirty());
    });

    // Tab 1: 매장 관리 전체 저장 (취소하면 false)
    const saveShop = async () => {
      // 매장 정보
      await DB.setSetting('shopName', document.getElementById('s-shopName').value.trim());
      await DB.setSetting('shopPhone', document.getElementById('s-shopPhone').value.trim());
      await DB.setSetting('shopAddress', document.getElementById('s-shopAddress').value.trim());
      await DB.setSetting('shopReviewLink', (document.getElementById('s-shopReviewLink')?.value || '').trim());
      await DB.setSetting('revisitDays', Number(document.getElementById('s-revisitDays').value) || 30);
      await App.applyShopName();
      // 미용사 목록 (삭제된 미용사가 기존 기록에 있으면 경고)
      const inputs = document.querySelectorAll('.groomer-input');
      const groomers = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
      const prevGroomers = await DB.getSetting('groomers') || [];
      const removed = prevGroomers.filter(g => !groomers.includes(g));
      if (removed.length > 0) {
        const records = await DB.getAllLight('records', ['photoBefore', 'photoAfter', 'memo']);
        const usedRemoved = removed.filter(g => records.some(r => r.groomer === g));
        if (usedRemoved.length > 0) {
          const ok = await App.confirm(`"${App.escapeHtml(usedRemoved.join(', '))}" 미용사가 기존 기록에 사용 중입니다.<br>목록에서 빼도 기존 기록에는 이름이 남아요.`, { okLabel: '빼고 저장', danger: false });
          if (!ok) return false;
        }
      }
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
      this._markSaved('shop');
      App.showToast('매장 관리 설정이 저장되었습니다.');
      return true;
    };
    document.getElementById('btn-save-tab-shop')?.addEventListener('click', () => saveShop());

    // 로고 업로드/제거
    document.getElementById('s-logo-upload')?.addEventListener('click', () => document.getElementById('s-logo-file')?.click());
    document.getElementById('s-logo-file')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = ''; // 같은 파일을 다시 골라도 change 가 뜨게
      if (!file) return;
      if (file.type && !file.type.startsWith('image/')) { App.showToast('사진(이미지) 파일만 올릴 수 있어요.', 'error'); return; }
      // 너무 큰 원본은 폰 메모리 부족으로 멈출 수 있어 막는다 (작게 줄여서 저장하므로 보통 사진은 충분)
      if (file.size > 20 * 1024 * 1024) { App.showToast('파일이 너무 커요 (20MB 이하만).', 'error'); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        // 200px 로 줄여 저장 (용량 작게)
        App.resizeImage(ev.target.result, async (compressed) => {
          await DB.setSetting('shopLogo', compressed);
          const preview = document.getElementById('s-logo-preview');
          if (preview) preview.innerHTML = `<img src="${compressed}" style="width:100%;height:100%;object-fit:contain">`;
          document.getElementById('s-logo-remove').style.display = '';
          App.showToast('로고가 저장되었습니다.');
        }, 200, 0.9);
      };
      reader.readAsDataURL(file);
    });
    document.getElementById('s-logo-remove')?.addEventListener('click', async () => {
      await DB.setSetting('shopLogo', null);
      const preview = document.getElementById('s-logo-preview');
      if (preview) preview.innerHTML = '<span style="color:var(--text-muted);font-size:0.93rem">없음</span>';
      document.getElementById('s-logo-remove').style.display = 'none';
      App.showToast('로고가 제거되었습니다.');
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
          <input type="text" class="groomer-input flex-1" value="${App.escapeHtml(name)}">
          <button class="btn btn-sm btn-danger btn-remove-groomer" data-index="${index}">삭제</button>
        </div>
      `);
      input.value = '';
      // Re-bind remove buttons
      this.bindGroomerRemove();
      this._updateDirty();
    });

    this.bindGroomerRemove();

    // Theme color picker
    document.querySelectorAll('.theme-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._updateDirty();
      });
    });

    // Tab 2: 운영 설정 전체 저장
    const saveOperation = async () => {
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
      // 메시지 템플릿 (입력하면 자동 저장되지만, 이 버튼으로도 한 번 더 저장)
      await this._saveSmsTemplates();
      // 매출 목표
      const goal = Number(document.getElementById('s-monthlyGoal').value) || 0;
      await DB.setSetting('monthlyGoal', goal);
      // 월 고정비
      // 입력란은 만원 단위로 반올림된 값을 보여준다. 사용자가 건드리지 않았는데도
      // 그대로 저장하면 원 단위 정밀도가 날아간다 (3,456,789 → 3,460,000).
      // 알림 시간만 바꾸고 저장해도 매번 반복되므로, 실제로 바뀐 경우에만 쓴다.
      const fcEl = document.getElementById('s-fixedCost');
      if (fcEl) {
        const fixedCostMan = Number(fcEl.value) || 0;
        if (String(fixedCostMan) !== String(fcEl.dataset.original ?? '')) {
          await DB.setSetting('monthlyFixedCost', fixedCostMan * 10000);
          fcEl.dataset.original = String(fixedCostMan);
        }
      }
      this._markSaved('operation');
      App.showToast('운영 설정이 저장되었습니다.');
      return true;
    };
    document.getElementById('btn-save-tab-operation')?.addEventListener('click', () => saveOperation());
    document.getElementById('btn-push-test')?.addEventListener('click', () => this._runPushTest());
    this._tabSavers = { shop: saveShop, operation: saveOperation };

    // Reset templates to defaults
    document.getElementById('btn-reset-templates')?.addEventListener('click', async () => {
      const ok = await App.confirm('메시지 문구를 모두 처음 상태로 되돌릴까요?<br><small style="color:var(--text-muted)">직접 고친 문구는 사라집니다.</small>', { okLabel: '기본값 복원' });
      if (!ok) return;
      await DB.setSetting('messageTemplates', { ...DEFAULT_SMS_TEMPLATES });
      Object.entries(DEFAULT_SMS_TEMPLATES).forEach(([key, val]) => {
        const el = document.getElementById('tpl-' + key);
        if (el) el.value = val;
      });
      this._refreshSmsPreviews();
      App.showToast('기본값으로 복원되었습니다.');
    });
    this._bindSmsTemplateEditor();

    // 저장 공간 최적화
    // 기록 사진 보관 횟수 — 줄이면 바로 정리할지 묻는다 (되돌릴 수 없으므로)
    document.getElementById('s-record-photo-keep')?.addEventListener('change', async (e) => {
      const sel = e.target;
      const prev = await App.getRecordPhotoKeep();
      const next = Number(sel.value) || 0;
      const out = document.getElementById('record-photo-keep-result');
      if (next && (!prev || next < prev)) {
        const ok = await App.confirm(`반려견별 최근 <strong>${next}회</strong>만 남기고 그보다 오래된 기록의 사진을 지웁니다.<br>글 기록은 남지만 사진은 되돌릴 수 없습니다. 계속할까요?`, { okLabel: '정리하고 저장' });
        if (!ok) { sel.value = String(prev); return; }
      }
      await DB.setSetting('recordPhotoKeep', next);
      let n = 0;
      if (next) { try { n = await App.pruneAllRecordPhotos(); } catch (err) { console.warn('prune error:', err); } }
      if (out) out.innerHTML = `<span style="color:var(--success)">${App.icon('check')} 저장됨${n ? ` · 사진 ${n}장 정리` : ''}</span>`;
    });

    document.getElementById('btn-optimize-storage')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-optimize-storage');
      const result = document.getElementById('optimize-result');
      btn.disabled = true;
      btn.textContent = '최적화 중...';
      try {
        const { migratedCount, savedMB } = await DB.optimizeStorage();
        if (migratedCount === 0) {
          result.innerHTML = '<div style="color:var(--success);font-size:0.93rem">이미 최적화되어 있습니다.</div>';
        } else {
          result.innerHTML = `<div style="color:var(--success);font-size:0.93rem;font-weight:600">${App.icon('check-circle')} ${migratedCount}장 사진 최적화 완료 (약 ${savedMB}MB 절약)</div>`;
        }
      } catch (e) {
        console.error('Storage optimize error:', e);
        result.innerHTML = '<div style="color:var(--danger);font-size:0.93rem">최적화 중 오류가 발생했습니다.</div>';
      }
      btn.disabled = false;
      btn.innerHTML = App.icon('sparkle') + ' 저장 공간 최적화';
    });

    // Revenue CSV export
    document.getElementById('btn-export-revenue-csv')?.addEventListener('click', () => {
      App.pages.records?.showExportModal();
    });

    // Export (directBackup 재사용으로 중복 제거)
    document.getElementById('btn-export')?.addEventListener('click', () => this.directBackup(false));
    document.getElementById('btn-export-full')?.addEventListener('click', async () => {
      const ok = await App.confirm('사진까지 넣은 백업 파일을 만듭니다.<br>파일이 매우 클 수 있어요 (수백 MB). 기기 저장 공간을 확인해 주세요.', { okLabel: '백업 만들기', danger: false });
      if (ok) this.directBackup(true);
    });

    // Import
    document.getElementById('btn-import')?.addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const confirmed = await App.confirm('고른 백업 파일로 <strong>지금 데이터를 모두 바꿉니다.</strong><br>바꾸기 전에 지금 데이터를 자동으로 따로 보관해요. <small style="color:var(--text-muted)">(사진 제외)</small>', { okLabel: '복원' });
      if (!confirmed) {
        e.target.value = '';
        return;
      }

      // ===== 1단계: 파일 읽기·파싱·검증 =====
      // 이 단계 실패는 DB를 전혀 건드리지 않았다는 뜻이므로 '되돌리기'를 제안하면 안 된다.
      // (기존에는 단일 catch라서, 손상된 파일을 고른 것만으로 되돌리기를 제안하고
      //  사장님이 '예'를 누르면 수개월 전 자동 백업으로 전체가 덮어써졌다.)
      let data;
      try {
        const text = await file.text();
        data = JSON.parse(text);
      } catch (parseErr) {
        console.error('Import parse error:', parseErr);
        App.showToast('파일을 읽을 수 없습니다. 올바른 백업 JSON 파일인지 확인해주세요. (현재 데이터는 그대로입니다)', 'error');
        e.target.value = '';
        return;
      }

      const validationError = DB.validateBackup(data);
      if (validationError) {
        App.showToast(validationError + ' (현재 데이터는 그대로입니다)', 'error');
        e.target.value = '';
        return;
      }

      // ===== 2단계: 자동 백업 =====
      // 사진 포함으로 export 하면 수백MB 객체가 만들어지고, DB.importAll 의
      // 인-플라이트 스냅샷이 이를 다시 JSON.stringify 하면서 모바일에서 OOM 크래시가 난다.
      // (= 사진 많은 기기에서 복원 기능 자체를 쓸 수 없었다)
      try {
        const currentData = await DB.exportAll({ excludePhotos: true });
        const backupDate = new Date().toISOString();
        await DB.setSetting('_autoBackupBeforeImport', {
          data: currentData,
          date: backupDate,
          reason: 'before-import'
        });
        await DB.setSetting('_autoBackupBeforeImportMeta', {
          date: backupDate,
          customers: (currentData.customers || []).length,
          records: (currentData.records || []).length,
          // 복원 파일에 사진이 들어 있으면 기기 사진이 통째로 교체된다 — 되돌려도 사진은 못 돌아온다
          photosReplaced: !(data._excludePhotos === true || !Array.isArray(data.photos) || data.photos.length === 0)
        });
      } catch (backupErr) {
        console.warn('Auto-backup before import failed:', backupErr);
        const proceed = await App.confirm('지금 데이터를 따로 보관하지 못했어요. 그래도 복원하면 <strong>되돌릴 수 없어요.</strong>', { okLabel: '그래도 복원' });
        if (!proceed) { e.target.value = ''; return; }
        // 이전 복원의 사본이 남아 있으면 '방금 복원 직전'으로 오해되므로 지운다
        try { await DB.delete('settings', '_autoBackupBeforeImport'); await DB.delete('settings', '_autoBackupBeforeImportMeta'); } catch (_) {}
      }

      // ===== 3단계: 실제 복원 =====
      // 여기서 실패한 경우에만 DB가 변경됐을 수 있으므로 되돌리기를 제안한다.
      try {
        await DB.importAll(data);
        // 구버전 백업엔 반려견 방문 통계가 없을 수 있다 → 즉시 재계산 (목록·분석이 이 값을 읽는다)
        if (App.migratePetVisitStats) await App.migratePetVisitStats(true);
        // 구버전 백업(사이즈 가격)이면 몸무게 구간 가격으로 다시 변환
        if (App.migratePriceBands) await App.migratePriceBands(true);
        App.showToast('데이터가 복원되었습니다. (이전 데이터 자동 백업 완료)');
        App.handleRoute();
      } catch (err) {
        console.error('Import error:', err);
        // importAll 이 DB 상태를 알려준다:
        //  untouched   — clear 단계 실패, 기존 데이터 그대로
        //  rolled-back — insert 실패 후 snapshot 으로 자동 복구 완료
        //  dirty       — 자동 복구까지 실패 → 이때만 자동 백업으로 되돌리기 제안
        // (예전엔 어느 경우든 되돌리기를 제안해서, 이미 정상인 DB를 사진 없는 사본으로 덮어썼다)
        if (err.dbState === 'untouched' || err.dbState === 'rolled-back') {
          App.showToast(err.message || '복원 중 오류가 발생했습니다. 파일을 확인해주세요.', 'error');
        } else {
          const autoBackup = await DB.getSetting('_autoBackupBeforeImport');
          if (autoBackup && autoBackup.data) {
            const restore = await App.confirm('복원에 실패했고 자동 복구도 되지 않았습니다. 복원 직전 사본으로 되돌립니다.<br><small style="color:var(--text-muted)">사진은 건드리지 않습니다.</small>', { okLabel: '직전 상태로 되돌리기', danger: false });
            if (restore) await this._undoImport(autoBackup);
          } else {
            App.showToast(err.message || '복원 중 오류가 발생했습니다. 파일을 확인해주세요.', 'error');
          }
        }
      }
      e.target.value = '';
    });

    // 복원 전 상태로 되돌리기 (직전 복원이 잘못된 파일이었을 때)
    document.getElementById('btn-undo-import')?.addEventListener('click', async () => {
      const meta = await DB.getSetting('_autoBackupBeforeImportMeta');
      const when = meta && meta.date ? App.formatDateTime(meta.date) : '보관 시점';
      const syncOn = typeof Sync !== 'undefined' && Sync.isEnabled && Sync.isEnabled();
      const ok = await App.confirm(`현재 데이터를 지우고 <strong>${App.escapeHtml(when)} 상태</strong>로 되돌립니다.<br><strong style="color:var(--danger)">그 뒤에 추가·수정한 예약과 기록은 사라집니다${syncOn ? ' (동기화 중이라 다른 기기에서도 사라집니다)' : ''}.</strong><br><small style="color:var(--text-muted)">사진은 건드리지 않습니다.</small>`, { okLabel: '되돌리기' });
      if (!ok) return;
      const autoBackup = await DB.getSetting('_autoBackupBeforeImport');
      if (!autoBackup || !autoBackup.data) { App.showToast('보관된 사본이 없습니다.', 'error'); return; }
      await this._undoImport(autoBackup);
    });

    // Clear all
    document.getElementById('btn-clear-all')?.addEventListener('click', async () => {
      const confirmed = await App.confirm('이 기기의 모든 데이터를 지웁니다.<br><strong>되돌릴 수 없습니다!</strong><br><small style="color:var(--text-muted)">지우기 전에 위의 백업을 먼저 받아 두세요.</small>', { okLabel: '다음 (마지막 확인)' });
      if (!confirmed) return;

      const doubleConfirm = await App.confirm('마지막 확인입니다. 이 기기에서 아래가 모두 지워집니다.<br>' +
        '• 고객, 반려견, 예약, 미용 기록, 사진, 서비스 메뉴<br>' +
        '• <strong>매장 설정, 문자 템플릿, 로고, 잠금 설정</strong>도 함께<br>' +
        '<small style="color:var(--text-muted)">클라우드(Google 로그인)에 올라간 데이터는 지워지지 않아요. 동기화 연결만 끊깁니다.</small>', { okLabel: '모두 삭제' });
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

    // ========== 보안 탭 핸들러 ==========
    this.bindSecurityHandlers();

    // ========== 프레임 라이브러리 ==========
    await this._renderFrameLibrary();
    document.getElementById('btn-add-frame')?.addEventListener('click', () => this._showFrameEditor());
  },

  // ========== 저장 안 한 입력 ==========
  // 저장 버튼이 있는 탭(매장 관리·운영 설정)만 본다 — 데이터·보안 탭은 누르면 바로 반영되고,
  // 문자 템플릿(tpl-*)은 입력하면 자동 저장된다.
  _UNSAVED_FIELDS: {
    shop: ['s-shopName', 's-shopPhone', 's-shopAddress', 's-shopReviewLink', 's-revisitDays'],
    operation: ['s-notifEnabled', 's-notifMinutes', 's-monthlyGoal', 's-fixedCost']
  },
  _UNSAVED_TAB_LABELS: { shop: '매장 관리', operation: '운영 설정' },

  _formState(tab) {
    const fields = {};
    (this._UNSAVED_FIELDS[tab] || []).forEach(id => {
      const el = document.getElementById(id);
      if (el) fields[id] = el.type === 'checkbox' ? el.checked : String(el.value).trim();
    });
    if (tab !== 'shop') return { fields };
    return {
      fields,
      groomers: Array.from(document.querySelectorAll('#groomer-list .groomer-input')).map(i => i.value.trim()),
      closedDays: Array.from(document.querySelectorAll('input[name="closedDay"]')).map(cb => cb.checked),
      theme: document.querySelector('.theme-color-btn.active')?.dataset.color || ''
    };
  },

  _markSaved(tab) {
    if (!this._saved) this._saved = {};
    const state = this._formState(tab);
    this._saved[tab] = { state, key: JSON.stringify(state) };
    this._updateDirty();
  },

  _dirtyTabs() {
    if (!this._saved) return [];
    return Object.keys(this._UNSAVED_FIELDS).filter(t =>
      this._saved[t] && document.getElementById('tab-' + t) && JSON.stringify(this._formState(t)) !== this._saved[t].key);
  },

  _updateDirty() {
    App.leaveGuardDirty = this._dirtyTabs().length > 0;
  },

  // 화면을 저장된 값으로 되돌린다 ('저장하지 않고 나가기' — 탭만 바꿀 때 고친 값이 남아 헷갈리지 않게)
  _restoreSaved(tab) {
    const saved = this._saved && this._saved[tab];
    if (!saved) return;
    const st = saved.state;
    Object.entries(st.fields).forEach(([id, v]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = v; else el.value = v;
    });
    if (tab === 'shop') {
      const list = document.getElementById('groomer-list');
      if (list) {
        list.innerHTML = st.groomers.map((g, i) => `
          <div style="display:flex;align-items:center;gap:8px">
            <input type="text" class="groomer-input flex-1" value="${App.escapeHtml(g)}">
            <button class="btn btn-sm btn-danger btn-remove-groomer" data-index="${i}">삭제</button>
          </div>`).join('');
        this.bindGroomerRemove();
      }
      document.querySelectorAll('input[name="closedDay"]').forEach((cb, i) => { cb.checked = !!st.closedDays[i]; });
      document.querySelectorAll('.theme-color-btn').forEach(b => b.classList.toggle('active', b.dataset.color === st.theme));
    }
    this._updateDirty();
  },

  // 저장 안 한 탭이 있을 때: 저장하고 나가기 / 저장하지 않고 나가기 / 돌아가기(머무름). 나가도 되면 true
  async _confirmUnsaved(tabs) {
    const names = tabs.map(t => this._UNSAVED_TAB_LABELS[t]).join(', ');
    const pick = await App.choose(
      `<strong>${App.escapeHtml(names)}</strong>에 저장하지 않은 내용이 있어요.`,
      [{ value: 'save', label: '저장하고 나가기' }, { value: 'discard', label: '저장하지 않고 나가기' }],
      { cancelLabel: '돌아가기' }
    );
    if (pick === 'save') {
      // 고르기 창을 닫는 history.back() 이 끝나기 전에 저장 중 확인창(미용사 빼기 등)을 열면 그 창이 바로 닫힌다
      await new Promise(r => setTimeout(r, 180));
      for (const t of tabs) {
        const saver = this._tabSavers && this._tabSavers[t];
        let ok = false;
        try { ok = saver ? await saver() : true; } catch (err) {
          console.error('settings save error:', err);
          App.showToast('저장하지 못했어요. 다시 눌러 주세요.', 'error');
        }
        if (!ok) return false;
      }
      return true;
    }
    if (pick === 'discard') {
      tabs.forEach(t => this._restoreSaved(t));
      App.leaveGuardDirty = false;
      return true;
    }
    return false;
  },

  // ========== 메시지 템플릿 편집 ==========
  async _saveSmsTemplates() {
    const out = {};
    let any = false;
    SMS_TEMPLATE_META.forEach(m => {
      const el = document.getElementById('tpl-' + m.key);
      if (el) { out[m.key] = el.value; any = true; }
    });
    if (!any) return;
    const prev = (await DB.getSetting('messageTemplates')) || {};
    await DB.setSetting('messageTemplates', { ...prev, ...out });
  },

  async _refreshSmsPreviews() {
    const shopName = (await DB.getSetting('shopName')) || '펫살롱';
    const shopPhone = (await DB.getSetting('shopPhone')) || '010-1234-5678';
    const sample = {
      '매장명': shopName, '전화번호': shopPhone, '고객명': '김민지', '반려견명': '콩이',
      '경과일수': '35', '마지막방문일': '9월 18일', '시점': '내일', '날짜': '10월 24일(금)', '시간': '14:00',
      '담당': '담당: 원장. ', '미용사': '원장', '서비스': '전체미용', '금액': '55,000',
      '다음방문일': '11월 20일', '리뷰링크': (await DB.getSetting('shopReviewLink')) || ''
    };
    SMS_TEMPLATE_META.forEach(m => {
      const el = document.getElementById('tpl-' + m.key);
      const prev = document.getElementById('tpl-prev-' + m.key);
      if (!el || !prev) return;
      // 이 템플릿에서 쓸 수 없는 변수는 실제 발송처럼 빠진다 — 미리보기에서 바로 보이게
      const vars = {};
      m.vars.forEach(v => { vars[v] = sample[v]; });
      prev.textContent = App.fillSmsTemplate(el.value, vars);
      const unknown = [...el.value.matchAll(/\{([^{}]{1,12})\}/g)].map(x => x[1]).filter(v => !m.vars.includes(v) && !(v === '미용사' && m.vars.includes('담당')));
      prev.dataset.warn = unknown.length ? `이 문자에서는 {${[...new Set(unknown)].join('}, {')}}를 쓸 수 없어 빠집니다.` : '';
    });
  },

  _bindSmsTemplateEditor() {
    const tabs = document.querySelectorAll('.tpl-tab');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tpl-panel').forEach(p => { p.hidden = p.dataset.key !== tab.dataset.key; });
    }));
    document.querySelectorAll('.tpl-var').forEach(btn => btn.addEventListener('click', () => {
      const ta = document.getElementById('tpl-' + btn.dataset.key);
      if (!ta) return;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      ta.setRangeText('{' + btn.dataset.var + '}', start, end, 'end');
      ta.focus();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }));
    let timer = null;
    document.querySelectorAll('.tpl-input').forEach(ta => ta.addEventListener('input', () => {
      this._refreshSmsPreviews();
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await this._saveSmsTemplates();
        const note = document.getElementById('tpl-saved-note');
        if (note) note.textContent = '저장됨 · ' + new Date().toTimeString().slice(0, 5);
      }, 700);
    }));
    this._refreshSmsPreviews();
  },

  // 프레임 라이브러리 렌더링
  async _renderFrameLibrary() {
    const frames = (await DB.getSetting('customFrames')) || [];
    const listEl = document.getElementById('frame-library-list');
    const countEl = document.getElementById('frame-lib-count');
    const addBtn = document.getElementById('btn-add-frame');
    if (!listEl) return;
    if (countEl) countEl.textContent = `${frames.length}/5`;
    if (addBtn) addBtn.disabled = frames.length >= 5;
    if (frames.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center;padding:28px 16px;background:var(--bg);border-radius:var(--radius);border:2px dashed var(--border)">
          <div style="font-size:2rem;margin-bottom:8px">${App.icon('image')}</div>
          <div style="font-weight:700;font-size:0.95rem;margin-bottom:4px">등록된 프레임이 없습니다</div>
          <div style="font-size:0.93rem;color:var(--text-muted);line-height:1.5">시즌·이벤트별 프레임을 만들면<br>사진 카드 생성 시 1탭으로 선택 가능합니다</div>
        </div>
      `;
      return;
    }
    listEl.innerHTML = frames.map(f => `
      <div class="frame-lib-row" data-id="${App.escapeHtml(f.id)}" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border-light);border-left:4px solid ${f.enabled === false ? 'var(--border)' : (f.accentColor || 'var(--primary)')};border-radius:var(--radius);background:var(--bg-white);box-shadow:var(--shadow-xs);cursor:pointer;position:relative;overflow:hidden${f.enabled === false ? ';opacity:0.6' : ''}">
        <div style="width:100px;height:100px;border-radius:10px;background:${f.image ? '#fff' : (f.accentColor || 'var(--border)')};flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid var(--border-light);box-shadow:inset 0 0 0 1px rgba(0,0,0,0.04)">
          ${f.image ? `<img src="${f.image}" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain" alt="${App.escapeHtml(f.name)}">` : '<span style="font-size:2rem;opacity:0.5">' + App.icon('image') + '</span>'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:1rem;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px">${App.escapeHtml(f.name)}${f.mode === 'overlay' ? ' <small style="font-weight:600;color:var(--text-muted)">· 덮기</small>' : ''}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${f.accentColor || 'var(--border)'};border:1px solid var(--border-light);flex-shrink:0"></span>
            <span style="font-size:0.93rem;color:var(--text-muted)">${f.accentColor || '-'}</span>
          </div>
          <label class="frame-toggle-label" data-id="${App.escapeHtml(f.id)}" style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:0.93rem;color:${f.enabled === false ? 'var(--text-muted)' : 'var(--success)'};font-weight:700;cursor:pointer">
            <input type="checkbox" class="frame-toggle-cb" data-id="${App.escapeHtml(f.id)}" ${f.enabled !== false ? 'checked' : ''} onclick="event.stopPropagation()" style="cursor:pointer">
            ${f.enabled === false ? '비활성' : '활성'}
          </label>
        </div>
        <button type="button" class="frame-delete-btn" data-id="${App.escapeHtml(f.id)}" title="삭제" aria-label="삭제" style="flex-shrink:0;background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--danger);padding:8px;width:44px;height:44px;border-radius:8px">${App.icon('trash')}</button>
      </div>
    `).join('');
    // 행 전체 클릭 = 편집 (자식 버튼은 stopPropagation)
    listEl.querySelectorAll('.frame-lib-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.frame-delete-btn') || e.target.closest('.frame-toggle-label') || e.target.closest('.frame-toggle-cb')) return;
        this._showFrameEditor(row.dataset.id);
      });
    });
    // 삭제 버튼
    listEl.querySelectorAll('.frame-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteFrame(btn.dataset.id);
      });
    });
    // 활성/비활성 토글 (편집 모달 없이 즉시 변경)
    listEl.querySelectorAll('.frame-toggle-cb').forEach(cb => {
      cb.addEventListener('change', async (e) => {
        e.stopPropagation();
        const all = (await DB.getSetting('customFrames')) || [];
        const f = all.find(x => x.id === cb.dataset.id);
        if (f) {
          f.enabled = cb.checked;
          await DB.setSetting('customFrames', all);
          await this._renderFrameLibrary();
        }
      });
    });
  },

  // 프레임 추가/편집 모달
  async _showFrameEditor(frameId) {
    const frames = (await DB.getSetting('customFrames')) || [];
    const frame = frameId ? frames.find(f => f.id === frameId) : { id: 'f' + Date.now(), name: '', image: '', accentColor: '#6366F1', textColor: '#1A1A1A', enabled: true };
    if (!frame) return;
    App.showModal({
      title: frameId ? '프레임 편집' : '새 프레임 추가',
      saveText: '저장',
      content: `
        <div class="form-group">
          <label class="form-label">프레임 이름 <span class="required">*</span></label>
          <input type="text" id="f-frame-name" value="${App.escapeHtml(frame.name)}" placeholder="예: 봄 시즌 2026, 크리스마스" maxlength="30">
        </div>
        <div class="form-group">
          <label class="form-label">배경 이미지 <span style="color:var(--text-muted);font-weight:400">(피그마·캔바로 만든 PNG/JPG)</span></label>
          <div id="f-frame-preview" style="margin-bottom:8px">${frame.image ? `<img src="${frame.image}" style="max-width:200px;border-radius:8px;border:1px solid var(--border)">` : '<div style="color:var(--text-muted);font-size:0.93rem">이미지 미선택</div>'}</div>
          <input type="file" id="f-frame-image" accept="image/*">
          <div class="form-hint">카드 크기: 피드 1080×1350 · 스토리 1080×1920 · 네컷 1080×3267. 배경은 JPG, 덮기는 투명 PNG.</div>
        </div>
        <div class="form-group">
          <label class="form-label">방식</label>
          <div class="frame-mode-row">
            <label class="card-toggle"><input type="radio" name="f-frame-mode" value="bg" ${frame.mode !== 'overlay' ? 'checked' : ''}> 배경 (사진 뒤에 깔기)</label>
            <label class="card-toggle"><input type="radio" name="f-frame-mode" value="overlay" ${frame.mode === 'overlay' ? 'checked' : ''}> 덮기 (사진 위에 얹기)</label>
          </div>
          <div class="form-hint">덮기: 사진이 보일 칸을 투명하게 뚫은 PNG. 아래 가이드를 받아 그 위에 디자인하면 칸 위치가 정확히 맞아요.</div>
          <div class="frame-guide-row">
            <select id="f-frame-guide-layout" aria-label="가이드 레이아웃">
              ${(() => {
                // 기본은 '피드 4:5' — 사진 4장이면 자동으로 4칸 모양이라 예전 '피드 4컷'(feed4)과 같은 가이드가 나온다.
                // 예전에 feed4·story4 로 저장된 프레임은 가장 가까운 새 레이아웃(feed·story)으로 이어받는다.
                const R = App.pages.records;
                const cur = (R._CARD_LAYOUT_MIGRATE || {})[frame.guideLayout] || frame.guideLayout || 'feed';
                return Object.entries(R._CARD_LAYOUTS).filter(([, l]) => !l.legacy).map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l.name}</option>`).join('');
              })()}
            </select>
            <button type="button" class="btn btn-secondary" id="f-frame-guide">${App.icon('download')} 칸 위치 가이드 저장</button>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">포인트 색</label>
            <input type="color" id="f-frame-accent" value="${frame.accentColor || '#6366F1'}" style="width:100%;height:40px;border-radius:6px">
          </div>
          <div class="form-group">
            <label class="form-label">글자 색</label>
            <input type="color" id="f-frame-text" value="${frame.textColor || '#1A1A1A'}" style="width:100%;height:40px;border-radius:6px">
          </div>
        </div>
        <div class="form-group">
          <label class="checkbox-label"><input type="checkbox" id="f-frame-enabled" ${frame.enabled !== false ? 'checked' : ''}> 활성 (사진 카드 생성 시 노출)</label>
        </div>
      `,
      onSave: async () => {
        const name = document.getElementById('f-frame-name').value.trim();
        if (!name) { App.showToast('프레임 이름을 입력해주세요.', 'error'); return; }
        let image = frame.image || '';
        const fileInput = document.getElementById('f-frame-image');
        if (fileInput.files[0]) {
          image = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(fileInput.files[0]);
          });
          // 원본(수 MB)을 그대로 두면 백업 파일·복원 사본이 매번 커진다 → 긴 변 2400px 로 줄인다 (투명 PNG 는 PNG 유지)
          image = await new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
              const max = document.querySelector('input[name="f-frame-mode"]:checked')?.value === 'overlay' ? 3300 : 2400;
              const r = Math.min(1, max / Math.max(img.width, img.height));
              if (r >= 1) { resolve(image); return; }
              const cv = document.createElement('canvas');
              cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
              cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
              const isPng = /^data:image\/png/i.test(image);
              const out = isPng ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
              cv.width = cv.height = 0;
              resolve(out.length < image.length ? out : image);
            };
            img.onerror = () => resolve(image);
            img.src = image;
          });
        }
        const updated = {
          id: frame.id,
          name,
          image,
          accentColor: document.getElementById('f-frame-accent').value,
          textColor: document.getElementById('f-frame-text').value,
          enabled: document.getElementById('f-frame-enabled').checked,
          mode: document.querySelector('input[name="f-frame-mode"]:checked')?.value === 'overlay' ? 'overlay' : 'bg',
          guideLayout: document.getElementById('f-frame-guide-layout')?.value || frame.guideLayout || 'feed',
          createdAt: frame.createdAt || new Date().toISOString()
        };
        const all = (await DB.getSetting('customFrames')) || [];
        const idx = all.findIndex(f => f.id === updated.id);
        if (idx >= 0) all[idx] = updated;
        else {
          if (all.length >= 5) { App.showToast('프레임은 최대 5개까지 등록 가능합니다.', 'error'); return; }
          all.push(updated);
        }
        await DB.setSetting('customFrames', all);
        App.closeModal();
        App.showToast(frameId ? '프레임이 수정되었습니다.' : '새 프레임이 추가되었습니다.');
        await this._renderFrameLibrary();
      }
    });
    // 칸 위치 가이드 저장 — 지금 사진 카드 설정 그대로 그린 이미지 (사진 칸에 1~4 번호)
    document.getElementById('f-frame-guide')?.addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        const layout = document.getElementById('f-frame-guide-layout')?.value || 'feed';
        const cv = await App.pages.records.makeFrameGuide(layout);
        const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
        const fileName = `프레임가이드_${layout}_${cv.width}x${cv.height}.png`;
        cv.width = cv.height = 0;
        if (!blob) throw new Error('이미지를 만들지 못했습니다');
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
          await navigator.share({ files: [file], title: '프레임 가이드' }).catch(() => {});
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        App.showToast('가이드를 저장했어요. 번호 칸을 투명하게 지운 PNG 로 만들어 올리세요.', 'info', { duration: 6000 });
      } catch (e) {
        console.warn('프레임 가이드 실패:', e);
        App.showToast('가이드를 만들지 못했습니다.', 'error');
      } finally { btn.disabled = false; }
    });
  },

  // 프레임 삭제
  async _deleteFrame(frameId) {
    const frames = (await DB.getSetting('customFrames')) || [];
    const frame = frames.find(f => f.id === frameId);
    if (!frame) return;
    const ok = await App.confirm(`"${App.escapeHtml(frame.name)}" 프레임을 삭제할까요?`, { okLabel: '삭제' });
    if (!ok) return;
    await DB.setSetting('customFrames', frames.filter(f => f.id !== frameId));
    App.showToast('프레임이 삭제되었습니다.');
    await this._renderFrameLibrary();
  },

  // GitHub master-config.js 스니펫 표시 (배포 시 적용 필수)
  // mode: 'off' = 잠금 끄기용 내용, 'recovery' = 복구 코드 재발급 후
  async _showMasterConfigModal(mode) {
    if (typeof Security === 'undefined') return;
    const isOff = mode === 'off';
    const snippet = isOff ? Security.getMasterConfigOffSnippet() : await Security.getMasterConfigSnippet();
    if (!snippet) {
      App.showToast('마스터 코드 설정 후 사용 가능합니다', 'warning');
      return;
    }
    const repoEditUrl = 'https://github.com/a01090037052-lab/pet-salon/edit/main/js/master-config.js';
    setTimeout(() => {
    App.showModal({
      title: isOff ? 'GitHub 설정 (모든 기기 잠금 끄기)' : 'GitHub 배포 설정 (다른 디바이스 잠금 활성화)',
      saveText: '닫기',
      onSave: () => { App.closeModal(); },
      content: `
        <div style="font-size:0.93rem;color:var(--text-secondary);line-height:1.6;margin-bottom:14px">
          ${isOff ? `<strong style="color:var(--danger)">${App.icon('alert')} 이 기기에서는 잠금이 꺼졌어요. 하지만 GitHub 설정에 잠금이 남아 있어서, 새 기기에서는 여전히 코드를 물어요.</strong><br>
          모든 기기에서 끄려면 아래 내용으로 GitHub 의 master-config.js 를 바꿔 주세요.`
          : mode === 'recovery' ? `<strong style="color:var(--danger)">${App.icon('alert')} 새 복구 코드는 지금은 이 기기에만 저장됐어요.</strong><br>
          아래 내용을 GitHub 에 올려야 새 기기에서도 새 복구 코드가 통하고, <strong>예전 복구 코드는 더 이상 안 통해요.</strong>`
          : `<strong style="color:var(--danger)">${App.icon('alert')} 다른 디바이스에서도 잠금이 작동하려면 아래 내용을 GitHub에 push 해야 합니다.</strong><br>
          이 작업은 <strong>매장 첫 설정 시 한 번</strong>, <strong>마스터 코드 변경</strong>, <strong>복구 코드 재발급</strong> 때 필요합니다.`}
        </div>

        <div style="margin-bottom:14px">
          <div style="font-weight:700;margin-bottom:6px">1단계 — 아래 내용 복사</div>
          <textarea id="master-config-code" readonly style="width:100%;height:180px;font-family:monospace;font-size:max(16px,0.78rem);padding:10px;border:1.5px solid var(--border);border-radius:6px;background:var(--bg);resize:vertical">${snippet}</textarea>
          <button class="btn btn-secondary btn-sm" id="master-config-copy" style="margin-top:6px;width:100%">${App.icon('copy')} 전체 복사</button>
        </div>

        <div style="margin-bottom:14px">
          <div style="font-weight:700;margin-bottom:6px">2단계 — GitHub에서 편집</div>
          <a href="${repoEditUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm" style="width:100%;text-decoration:none;display:block;text-align:center">${App.icon('edit')} GitHub 편집 페이지 열기</a>
          <div style="font-size:0.93rem;color:var(--text-muted);margin-top:6px">
            • 페이지 열림 → 기존 내용 전체 지우기 → 복사한 내용 붙여넣기<br>
            • 우측 상단 [Commit changes] → 메시지 "마스터 코드 업데이트" → Commit
          </div>
        </div>

        <div style="margin-bottom:14px">
          <div style="font-weight:700;margin-bottom:6px">3단계 — sw.js 캐시 버전 bump (선택, 빠른 반영)</div>
          <div style="font-size:0.93rem;color:var(--text-muted)">
            <code>sw.js</code>의 <code>CACHE_NAME</code> 값에서 v92 → v93 같이 숫자 1 올림.<br>
            안 해도 1~2일 안에 자동 반영되지만 즉시 반영하려면 함께 commit.
          </div>
        </div>

        <div style="background:var(--bg);padding:10px;border-radius:6px;font-size:0.93rem;color:var(--text-secondary)">
          <strong>적용 후</strong>: 1~2분 안에 GitHub Pages 배포 → ${isOff ? '새 기기에서도 잠금 화면이 뜨지 않습니다.' : '모든 디바이스에서 잠금 화면 표시됩니다.'}
        </div>
      `
    });
    setTimeout(() => {
      document.getElementById('master-config-copy')?.addEventListener('click', () => {
        const ta = document.getElementById('master-config-code');
        if (!ta) return;
        ta.select();
        navigator.clipboard?.writeText(snippet).then(() => {
          App.showToast('GitHub 설정 코드 복사됨');
        }).catch(() => {
          try { document.execCommand('copy'); App.showToast('복사됨'); }
          catch (_) { App.showToast('복사 실패. 수동 선택 후 복사', 'warning'); }
        });
      });
    }, 100);
    }, 0); // _showMasterConfigModal popstate race 회피용 setTimeout 닫기
  },

  // 복구 코드 표시 모달 (한 번만 노출) — popstate race 회피 위해 setTimeout 으로 defer
  _showRecoveryModal(code, isReissue) {
    setTimeout(() => {
    App.showModal({
      title: isReissue ? '새 복구 코드' : '복구 코드 (한 번만 표시됩니다!)',
      hideFooter: false,
      saveText: '메모 완료',
      onSave: () => { App.closeModal(); },
      content: `
        <div style="text-align:center">
          <div style="background:var(--warning-light);border:2px solid var(--warning);border-radius:var(--radius);padding:20px;margin-bottom:16px">
            <div style="font-size:0.93rem;color:var(--text-secondary);margin-bottom:8px">마스터 코드 분실 시 사용할 복구 코드</div>
            <div id="recovery-code-display" style="font-size:1.6rem;font-weight:800;letter-spacing:2px;font-family:monospace;color:var(--danger);margin-bottom:12px">${code}</div>
            <button class="btn btn-secondary btn-sm" id="recovery-copy">${App.icon('copy')} 복사</button>
          </div>
          <div style="font-size:0.93rem;color:var(--text-secondary);text-align:left;background:var(--bg);padding:12px;border-radius:var(--radius)">
            <div style="font-weight:700;margin-bottom:4px">${App.icon('alert')} 중요</div>
            <ul style="margin:0;padding-left:18px;line-height:1.6">
              <li>이 코드는 다시 표시되지 않습니다</li>
              <li>종이에 적거나 안전한 곳에 따로 보관하세요</li>
              <li>분실 시 백업 파일로만 복원 가능합니다</li>
            </ul>
          </div>
        </div>
      `
    });
    setTimeout(() => {
      document.getElementById('recovery-copy')?.addEventListener('click', () => {
        navigator.clipboard?.writeText(code).then(() => {
          App.showToast('복구 코드가 복사되었습니다');
        }).catch(() => {
          App.showToast('복사 실패. 직접 적어주세요', 'warning');
        });
      });
    }, 100);
    }, 0); // _showRecoveryModal popstate race 회피용 setTimeout 닫기
  },

  // PIN 입력 받는 헬퍼 (4~8자리 숫자, 2회 일치 확인 옵션)
  _promptPin(title, message, opts = {}) {
    return new Promise((resolve) => {
      const requireConfirm = opts.requireConfirm !== false;
      let resolved = false;

      // 직전에 다른 모달/confirm이 닫혔다면 그 popstate 이벤트가 미처리 상태일 수 있음.
      // setTimeout(0)으로 다음 task로 넘겨 popstate를 먼저 소화한 뒤 새 모달을 연다.
      setTimeout(() => {
      // 모달 닫힘 시 null resolve
      App._modalOnClose = () => { if (!resolved) { resolved = true; resolve(null); } };

      App.showModal({
        title,
        saveText: '확인',
        content: `
          <p style="color:var(--text-secondary);margin-bottom:14px">${message}</p>
          <div class="form-group">
            <label class="form-label">${requireConfirm ? '새 ' : ''}코드 (4~8자리 숫자)</label>
            <input type="password" id="prompt-pin" inputmode="numeric" maxlength="8" placeholder="숫자만" style="text-align:center;letter-spacing:6px;font-size:1.2rem">
          </div>
          ${requireConfirm ? `
          <div class="form-group">
            <label class="form-label">코드 확인</label>
            <input type="password" id="prompt-pin2" inputmode="numeric" maxlength="8" placeholder="다시 입력" style="text-align:center;letter-spacing:6px;font-size:1.2rem">
          </div>` : ''}
          <div id="prompt-pin-error" style="color:var(--danger);font-size:0.93rem;margin-top:6px;display:none"></div>
        `,
        onSave: () => {
          const pin = document.getElementById('prompt-pin').value.trim();
          const err = document.getElementById('prompt-pin-error');
          const showErr = (msg) => { if (err) { err.textContent = msg; err.style.display = 'block'; } };
          if (!/^\d{4,8}$/.test(pin)) { showErr('4~8자리 숫자만 입력 가능합니다'); return; }
          if (requireConfirm) {
            const pin2 = document.getElementById('prompt-pin2').value.trim();
            if (pin !== pin2) { showErr('코드가 일치하지 않습니다'); return; }
          }
          resolved = true;
          App._modalOnClose = null;
          App.closeModal();
          resolve(pin);
        }
      });
      setTimeout(() => document.getElementById('prompt-pin')?.focus(), 100);
      }, 0); // setTimeout 닫기 (popstate race condition 회피)
    });
  },

  bindSecurityHandlers() {
    if (typeof Security === 'undefined') return;

    // 잠금 설정 (최초)
    document.getElementById('btn-sec-enable')?.addEventListener('click', async () => {
      const newPin = await this._promptPin('마스터 코드 설정', '4~8자리 숫자 코드를 설정하세요. 사장님만 아는 코드여야 합니다. 설정 후 복구 코드가 발급됩니다.');
      if (!newPin) return;
      try {
        const recovery = await Security.enableWithPin(newPin, newPin.length);
        this._showRecoveryModal(recovery, false);
        App.showToast('마스터 코드 잠금 활성화됨');
        // 복구 코드 모달 닫히면 → GitHub 배포 설정 모달 → 그 모달 닫히면 페이지 새로고침
        App._modalOnClose = () => {
          App._modalOnClose = () => { App.handleRoute(); App._modalOnClose = null; };
          this._showMasterConfigModal();
        };
      } catch (e) {
        App.showToast(e.message, 'error');
      }
    });

    // 이 기기에서만 꺼진 상태 → 모든 기기 잠금 끄기용 GitHub 설정
    document.getElementById('btn-sec-show-off-config')?.addEventListener('click', () => {
      this._showMasterConfigModal('off');
    });

    // GitHub 배포 설정 보기 (이미 마스터 코드 설정된 사용자용 — 언제든 다시 볼 수 있게)
    document.getElementById('btn-sec-show-config')?.addEventListener('click', () => {
      this._showMasterConfigModal();
    });

    // 마스터 코드 변경
    document.getElementById('btn-sec-change-pin')?.addEventListener('click', async () => {
      const warn = await App.confirm('마스터 코드를 바꾸면 <strong>다른 모든 등록 기기</strong>에서 다음에 열 때 새 코드를 입력해야 해요.', { okLabel: '코드 변경', danger: false });
      if (!warn) return;
      const currentPin = await this._promptPin('마스터 코드 변경 — 현재 코드', '현재 마스터 코드를 입력하세요', { requireConfirm: false });
      if (!currentPin) return;
      const newPin = await this._promptPin('마스터 코드 변경 — 새 코드', '새 마스터 코드를 설정하세요');
      if (!newPin) return;
      try {
        await Security.changePin(currentPin, newPin, newPin.length);
        App.showToast('마스터 코드 변경 완료. GitHub 에 배포 설정 push 필요');
        // GitHub 배포 설정 모달 표시 → 닫히면 페이지 새로고침
        App._modalOnClose = () => { App.handleRoute(); App._modalOnClose = null; };
        this._showMasterConfigModal();
      } catch (e) {
        App.showToast(e.message, 'error');
      }
    });

    // 복구 코드 재발급
    document.getElementById('btn-sec-regen-recovery')?.addEventListener('click', async () => {
      const currentPin = await this._promptPin('복구 코드 재발급', '현재 마스터 코드 확인', { requireConfirm: false });
      if (!currentPin) return;
      try {
        const newRecovery = await Security.regenerateRecovery(currentPin);
        this._showRecoveryModal(newRecovery, true);
        // 복구 코드 모달을 닫으면 → GitHub 설정 안내 (안 올리면 새 기기에선 옛 복구 코드가 계속 통한다)
        App._modalOnClose = () => {
          App._modalOnClose = null;
          this._showMasterConfigModal('recovery');
        };
      } catch (e) {
        App.showToast(e.message, 'error');
      }
    });

    // 옵션 저장
    document.getElementById('btn-sec-save-options')?.addEventListener('click', async () => {
      try {
        await Security.updateOptions({
          maxAttempts: document.getElementById('sec-max-attempts')?.value,
          lockoutSeconds: document.getElementById('sec-lockout-seconds')?.value
        });
        App.showToast('보안 옵션 저장됨');
      } catch (e) {
        App.showToast(e.message, 'error');
      }
    });

    // 이 기기 등록 해제
    document.getElementById('btn-sec-untrust-this')?.addEventListener('click', async () => {
      const ok = await App.confirm('이 기기의 등록을 해제하면 다음에 열 때 마스터 코드를 다시 입력해야 해요.', { okLabel: '등록 해제' });
      if (!ok) return;
      Security.clearTrust();
      App.showToast('이 기기 등록 해제됨. 다음 접속 시 마스터 코드 필요');
    });

    // 잠금 해제 (마스터 코드 비활성화)
    document.getElementById('btn-sec-disable')?.addEventListener('click', async () => {
      const warn = await App.confirm('마스터 코드 잠금을 완전히 해제하면 <strong>주소(URL)를 아는 누구나</strong> 앱을 열 수 있어요.', { okLabel: '잠금 해제' });
      if (!warn) return;
      const currentPin = await this._promptPin('잠금 해제 — 현재 마스터 코드 확인', '마스터 코드 확인 후 잠금을 해제합니다', { requireConfirm: false });
      if (!currentPin) return;
      try {
        const masterStillOn = await Security.disable(currentPin);
        if (masterStillOn) {
          App.showToast('이 기기에서 잠금을 껐어요');
          // GitHub 설정에 잠금이 남아 있으니 모든 기기 끄기 안내 → 닫히면 화면 새로고침
          App._modalOnClose = () => { App.handleRoute(); App._modalOnClose = null; };
          this._showMasterConfigModal('off');
        } else {
          App.showToast('마스터 코드 잠금 해제됨');
          App.handleRoute();
        }
      } catch (e) {
        App.showToast(e.message, 'error');
      }
    });
  },

  // 복원 직전 사본(_autoBackupBeforeImport)으로 되돌리기. 사본은 사진 제외로 저장되어
  // photos: [] 이지만 importAll 이 빈 photos 를 건너뛰므로 기기 사진은 보존된다.
  async _undoImport(autoBackup) {
    try {
      const btn = document.getElementById('btn-undo-import');
      if (btn) { btn.disabled = true; btn.textContent = '되돌리는 중...'; }
      await DB.importAll(autoBackup.data);
      if (App.migratePetVisitStats) await App.migratePetVisitStats(true);
      if (App.migratePriceBands) await App.migratePriceBands(true);
      App.showToast('복원 직전 상태로 되돌렸습니다.');
      App.handleRoute();
    } catch (restoreErr) {
      console.error('undo import error:', restoreErr);
      App.showToast('되돌리기에 실패했습니다. 수동 백업 파일을 사용해주세요.', 'error');
      const btn = document.getElementById('btn-undo-import');
      if (btn) { btn.disabled = false; btn.textContent = '복원 전 상태로 되돌리기'; }
    }
  },

  bindGroomerRemove() {
    document.querySelectorAll('.btn-remove-groomer').forEach(btn => {
      btn.onclick = async () => {
        const input = btn.parentElement.querySelector('.groomer-input');
        const name = input?.value?.trim();
        if (name) {
          const ok = await App.confirm(`"${App.escapeHtml(name)}" 미용사를 목록에서 뺄까요?<br><small style="color:var(--text-muted)">아래 저장 버튼을 눌러야 실제로 빠져요.</small>`, { okLabel: '빼기' });
          if (!ok) return;
        }
        btn.parentElement.remove();
        this._updateDirty();
      };
    });
  },

  async directBackup(includePhotos = false) {
    try {
      // 사진 포함 백업 — 큰 데이터 안전망 (100장 이상 시 경고)
      if (includePhotos) {
        const photosLight = await DB.getAllLight('photos', ['data']);
        const photoCount = photosLight.length;
        if (photoCount >= 100) {
          const estimatedMB = Math.round(photoCount * 0.4); // 평균 사진 ~300KB raw + base64 33% 증가
          const ok = await App.confirm(
            `사진 ${photoCount}장을 포함한 백업은 약 ${estimatedMB}MB 이상이 됩니다.<br>` +
            `폰 메모리 부담으로 실패할 수 있어요.<br><br>` +
            `<strong>권장:</strong> 사진 제외 백업을 정기적으로, 사진 포함은 가끔만.`,
            { okLabel: '백업 만들기', danger: false }
          );
          if (!ok) return;
        }
      }
      // 진행 toast (백업이 길어질 때 사장님 안심)
      if (includePhotos) App.showToast('백업 생성 중... (사진 포함이라 1~2분 소요)', 'info');
      const data = await DB.exportAll({ excludePhotos: !includePhotos });
      const json = JSON.stringify(data); // pretty-print 제거 — 메모리 30% 절감
      const blob = new Blob([json], { type: 'application/json' });
      const now = new Date();
      const date = App.getToday();
      const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const backupName = await DB.getSetting('shopName') || '펫살롱';
      const fileName = `${backupName}_백업_${date}_${time}.json`;

      // iOS 홈 화면 앱에서는 <a download> 가 조용히 아무 일도 안 할 수 있다.
      // 공유 시트(파일에 저장 / 카톡 / AirDrop)로 넘기고, 사용자가 실제로 보낸 뒤에만 백업 완료로 기록한다.
      const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
      if (isIOS && navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'application/json' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: fileName });
          } catch (shareErr) {
            if (shareErr && shareErr.name === 'AbortError') {
              App.showToast('백업이 취소되었습니다. (파일이 저장되지 않았습니다)', 'info');
              return;
            }
            throw shareErr;
          }
          await DB.setSetting('lastBackupDate', date);
          App.showToast('백업 완료! 보낸 파일을 iCloud/Drive 또는 카톡(나에게)에 보관하세요.', 'info');
          return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // iOS Safari / 일부 안드로이드 WebView는 click() 이후 다운로드가 비동기로
      // 시작된다. 즉시 revoke 하면 URL이 먼저 무효화되어 다운로드가 조용히 실패하고,
      // 사장님은 "백업 완료" 토스트만 보고 없는 백업을 믿게 된다.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      await DB.setSetting('lastBackupDate', date);
      App.showToast('백업 완료! 다운로드 폴더의 파일을 카톡(자기 자신) 또는 iCloud/Drive에 보관하세요.', 'info');
    } catch (err) {
      console.error('Backup error:', err);
      App.showToast('백업 중 오류가 발생했습니다.', 'error');
    }
  }

};
