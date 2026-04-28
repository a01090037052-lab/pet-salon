// ========== Security: 마스터 코드 잠금 + 디바이스 영구 등록 ==========
// 사장이 마스터 코드를 설정하고, 본인이 직접 권한을 줄 디바이스에 등록함.
// 등록된 디바이스는 영구 사용 가능 (만료 없음).
// 마스터 코드 변경 시 모든 디바이스 재등록 필요.
// 데이터는 IndexedDB로 디바이스 단위 분리. URL 무단 공유 차단이 주 목적.

const Security = {
  TRUST_KEY: 'petsalon_deviceRegistration_v1',
  ATTEMPT_KEY: 'petsalon_codeAttempts',

  DEFAULTS: {
    enabled: false,
    pinHash: '',           // 마스터 코드의 SHA-256 해시 (필드명 호환 위해 유지)
    salt: '',
    recoveryHash: '',
    recoverySalt: '',
    pinLength: 6,          // 마스터 코드 길이 (4~8자리 숫자)
    maxAttempts: 5,
    lockoutSeconds: 30,
    pinChangedAt: ''       // 마스터 코드 변경 시각 — 모든 디바이스 재등록 트리거
  },

  // ----- Persistence -----
  async _load() {
    const stored = await DB.getSetting('security');
    return { ...this.DEFAULTS, ...(stored || {}) };
  },
  async _save(s) { await DB.setSetting('security', s); },

  // ----- Hashing (Web Crypto API, 보안 컨텍스트 필요) -----
  async _hash(text, salt) {
    const data = new TextEncoder().encode((text || '') + ':' + (salt || ''));
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  },
  _genSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  _genRecovery() {
    // 8자 영숫자 (혼동 방지: O, 0, I, 1, L 제외)
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[arr[i] % chars.length];
    return code.slice(0, 4) + '-' + code.slice(4);
  },

  // ----- Device Registration Token (localStorage, 기기별 영구) -----
  // 마스터 코드 통과 시 발급. 만료 없음.
  // 마스터 코드 변경 시 issuedAfter 불일치로 자동 무효화 → 모든 디바이스 재등록.
  async issueTrust() {
    const s = await this._load();
    localStorage.setItem(this.TRUST_KEY, JSON.stringify({
      registeredAt: new Date().toISOString(),
      issuedAfter: s.pinChangedAt
    }));
  },
  async isTrusted() {
    const s = await this._load();
    if (!s.enabled) return true;
    try {
      const raw = localStorage.getItem(this.TRUST_KEY);
      if (!raw) return false;
      const t = JSON.parse(raw);
      if (t.issuedAfter !== s.pinChangedAt) return false; // 마스터 코드 변경되면 무효
      return true;
    } catch (_) { return false; }
  },
  clearTrust() { localStorage.removeItem(this.TRUST_KEY); },

  // ----- Verification -----
  async verifyPin(pin) {
    const s = await this._load();
    if (!s.enabled) return false;
    return await this._hash(pin, s.salt) === s.pinHash;
  },
  async verifyRecovery(code) {
    const s = await this._load();
    if (!s.recoveryHash) return false;
    const norm = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (norm.length !== 8) return false;
    const formatted = norm.slice(0, 4) + '-' + norm.slice(4);
    return await this._hash(formatted, s.recoverySalt) === s.recoveryHash;
  },

  // ----- Setup / Change -----
  async enableWithPin(pin, length) {
    const s = await this._load();
    if (s.enabled) throw new Error('이미 PIN이 설정되어 있습니다.');
    if (!/^\d+$/.test(pin)) throw new Error('PIN은 숫자만 입력 가능합니다.');
    s.salt = this._genSalt();
    s.pinHash = await this._hash(pin, s.salt);
    s.pinLength = Math.max(4, Math.min(8, length || pin.length || 4));
    s.recoverySalt = this._genSalt();
    const recovery = this._genRecovery();
    s.recoveryHash = await this._hash(recovery, s.recoverySalt);
    s.pinChangedAt = new Date().toISOString();
    s.enabled = true;
    await this._save(s);
    await this.issueTrust();
    return recovery; // 한 번만 표시
  },

  async changePin(currentPin, newPin, length) {
    if (!await this.verifyPin(currentPin)) throw new Error('현재 PIN이 올바르지 않습니다.');
    if (!/^\d+$/.test(newPin)) throw new Error('PIN은 숫자만 입력 가능합니다.');
    const s = await this._load();
    s.salt = this._genSalt();
    s.pinHash = await this._hash(newPin, s.salt);
    s.pinLength = Math.max(4, Math.min(8, length || newPin.length || s.pinLength));
    s.pinChangedAt = new Date().toISOString(); // 다른 기기 토큰 자동 무효화
    await this._save(s);
    await this.issueTrust(); // 현재 기기는 새 토큰
  },

  async regenerateRecovery(currentPin) {
    if (!await this.verifyPin(currentPin)) throw new Error('현재 PIN이 올바르지 않습니다.');
    const s = await this._load();
    s.recoverySalt = this._genSalt();
    const recovery = this._genRecovery();
    s.recoveryHash = await this._hash(recovery, s.recoverySalt);
    await this._save(s);
    return recovery;
  },

  async resetPinWithRecovery(code, newPin, length) {
    if (!await this.verifyRecovery(code)) throw new Error('복구 코드가 올바르지 않습니다.');
    if (!/^\d+$/.test(newPin)) throw new Error('새 PIN은 숫자만 입력 가능합니다.');
    const s = await this._load();
    s.salt = this._genSalt();
    s.pinHash = await this._hash(newPin, s.salt);
    s.pinLength = Math.max(4, Math.min(8, length || newPin.length || s.pinLength));
    s.recoverySalt = this._genSalt();
    const newRecovery = this._genRecovery();
    s.recoveryHash = await this._hash(newRecovery, s.recoverySalt);
    s.pinChangedAt = new Date().toISOString();
    await this._save(s);
    await this.issueTrust();
    return newRecovery;
  },

  async disable(currentPin) {
    if (!await this.verifyPin(currentPin)) throw new Error('현재 PIN이 올바르지 않습니다.');
    await this._save({ ...this.DEFAULTS });
    this.clearTrust();
  },

  async updateOptions(opts) {
    const s = await this._load();
    if (!s.enabled) throw new Error('마스터 코드 설정 후 가능합니다.');
    if (opts.maxAttempts) s.maxAttempts = Math.max(3, Math.min(20, Number(opts.maxAttempts)));
    if (opts.lockoutSeconds) s.lockoutSeconds = Math.max(10, Math.min(600, Number(opts.lockoutSeconds)));
    await this._save(s);
  },

  // ----- Lock Screen UI -----
  // 잠금 켜져있고 신뢰 안 됐으면 PIN 요구. 통과 후 resolve.
  async showLockScreen() {
    const s = await this._load();
    if (!s.enabled) return;
    if (await this.isTrusted()) return;

    return new Promise((resolve) => {
      let pinBuf = '';

      const overlay = document.createElement('div');
      overlay.id = 'security-lock-overlay';
      overlay.innerHTML = `
        <div class="lock-screen">
          <div class="lock-icon">&#x1F512;</div>
          <div class="lock-title">펫살롱 — 등록되지 않은 기기</div>
          <div class="lock-subtitle" id="lock-subtitle">마스터 코드 ${s.pinLength}자리 입력</div>
          <div class="lock-dots" id="lock-dots"></div>
          <div class="lock-recovery-input" id="lock-recovery-input" style="display:none">
            <input type="text" id="lock-recovery-code" placeholder="복구 코드 (예: ABCD-2345)" maxlength="9" autocomplete="off" autocorrect="off" spellcheck="false" autocapitalize="characters">
            <input type="password" id="lock-recovery-newpin" placeholder="새 마스터 코드 ${s.pinLength}자리" inputmode="numeric" maxlength="${s.pinLength}">
            <button class="btn btn-primary" id="lock-recovery-submit">코드 재설정</button>
            <button class="btn btn-secondary btn-sm" id="lock-recovery-cancel">돌아가기</button>
          </div>
          <div class="lock-keypad" id="lock-keypad">
            ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="lock-key" data-k="${n}">${n}</button>`).join('')}
            <button class="lock-key lock-key-fn" data-k="recovery" title="복구 코드 사용">복구</button>
            <button class="lock-key" data-k="0">0</button>
            <button class="lock-key lock-key-fn" data-k="back" aria-label="지우기">&#9003;</button>
          </div>
          <div class="lock-hint">사장님께 등록 요청하세요. 등록 후 영구 사용 가능.</div>
        </div>
      `;
      document.body.appendChild(overlay);

      const $dots = overlay.querySelector('#lock-dots');
      const $sub = overlay.querySelector('#lock-subtitle');
      const $keypad = overlay.querySelector('#lock-keypad');
      const $recoveryArea = overlay.querySelector('#lock-recovery-input');

      const renderDots = () => {
        let html = '';
        for (let i = 0; i < s.pinLength; i++) {
          html += `<span class="lock-dot ${i < pinBuf.length ? 'filled' : ''}"></span>`;
        }
        $dots.innerHTML = html;
      };
      const showError = (msg) => {
        $sub.textContent = msg;
        $sub.classList.add('error');
        if (navigator.vibrate) navigator.vibrate(80);
        const lockEl = overlay.querySelector('.lock-screen');
        lockEl.classList.add('shake');
        setTimeout(() => lockEl.classList.remove('shake'), 350);
      };
      const resetPrompt = () => {
        $sub.classList.remove('error');
        $sub.textContent = `마스터 코드 ${s.pinLength}자리 입력`;
      };
      const getAttempts = () => {
        try { return JSON.parse(sessionStorage.getItem(this.ATTEMPT_KEY) || '{}'); }
        catch (_) { return {}; }
      };
      const setAttempts = (a) => sessionStorage.setItem(this.ATTEMPT_KEY, JSON.stringify(a));

      const submitPin = async () => {
        if (pinBuf.length < s.pinLength) return;
        const att = getAttempts();
        if (att.lockUntil && Date.now() < att.lockUntil) {
          const remain = Math.ceil((att.lockUntil - Date.now()) / 1000);
          showError(`${remain}초 후 다시 시도하세요`);
          pinBuf = ''; renderDots();
          return;
        }
        const ok = await this.verifyPin(pinBuf);
        if (ok) {
          // 마스터 코드 통과 = 이 디바이스 영구 등록
          await this.issueTrust();
          sessionStorage.removeItem(this.ATTEMPT_KEY);
          overlay.remove();
          resolve();
        } else {
          att.count = (att.count || 0) + 1;
          if (att.count >= s.maxAttempts) {
            att.lockUntil = Date.now() + s.lockoutSeconds * 1000;
            att.count = 0;
            const tick = () => {
              const remain = Math.ceil((att.lockUntil - Date.now()) / 1000);
              if (remain > 0) {
                $sub.textContent = `${s.lockoutSeconds}초 잠금 (${remain}s)`;
                $sub.classList.add('error');
                setTimeout(tick, 1000);
              } else {
                resetPrompt();
              }
            };
            tick();
          } else {
            showError(`PIN 불일치 (${s.maxAttempts - att.count}회 남음)`);
          }
          setAttempts(att);
          pinBuf = ''; renderDots();
        }
      };

      const showRecoveryMode = () => {
        $keypad.style.display = 'none';
        $dots.style.display = 'none';
        $recoveryArea.style.display = 'flex';
        $sub.textContent = '복구 코드 + 새 마스터 코드 입력';
        overlay.querySelector('#lock-recovery-code').focus();
      };
      const hideRecoveryMode = () => {
        $keypad.style.display = '';
        $dots.style.display = '';
        $recoveryArea.style.display = 'none';
        resetPrompt();
        pinBuf = '';
        renderDots();
      };

      $keypad.addEventListener('click', (e) => {
        const k = e.target?.dataset?.k;
        if (k === undefined) return;
        if (k === 'back') {
          pinBuf = pinBuf.slice(0, -1);
          renderDots();
        } else if (k === 'recovery') {
          showRecoveryMode();
        } else {
          if (pinBuf.length < s.pinLength) {
            pinBuf += k;
            renderDots();
            if (pinBuf.length === s.pinLength) setTimeout(submitPin, 80);
          }
        }
      });

      overlay.querySelector('#lock-recovery-cancel')?.addEventListener('click', hideRecoveryMode);
      overlay.querySelector('#lock-recovery-submit')?.addEventListener('click', async () => {
        const code = overlay.querySelector('#lock-recovery-code').value.trim();
        const newPin = overlay.querySelector('#lock-recovery-newpin').value.trim();
        if (!/^\d+$/.test(newPin) || newPin.length !== s.pinLength) {
          showError(`새 마스터 코드 ${s.pinLength}자리 숫자 입력`);
          return;
        }
        try {
          const newRecovery = await this.resetPinWithRecovery(code, newPin, s.pinLength);
          alert(`마스터 코드 재설정 완료.\n\n새 복구 코드:\n${newRecovery}\n\n반드시 안전한 곳에 보관하세요.\n\n※ 다른 모든 등록 디바이스는 새 코드로 재등록 필요합니다.`);
          sessionStorage.removeItem(this.ATTEMPT_KEY);
          overlay.remove();
          resolve();
        } catch (e) {
          showError(e.message);
        }
      });

      // 키보드 입력 지원 (PC)
      const keyHandler = (e) => {
        if ($recoveryArea.style.display !== 'none') return; // 복구 모드면 무시
        if (/^\d$/.test(e.key)) {
          if (pinBuf.length < s.pinLength) {
            pinBuf += e.key;
            renderDots();
            if (pinBuf.length === s.pinLength) setTimeout(submitPin, 80);
          }
          e.preventDefault();
        } else if (e.key === 'Backspace') {
          pinBuf = pinBuf.slice(0, -1);
          renderDots();
          e.preventDefault();
        }
      };
      document.addEventListener('keydown', keyHandler);
      // overlay 제거 시 listener 정리
      const _origRemove = overlay.remove.bind(overlay);
      overlay.remove = () => {
        document.removeEventListener('keydown', keyHandler);
        _origRemove();
      };

      renderDots();
    });
  }
};
