// ========== 매장 마스터 코드 설정 (사장 직접 편집) ==========
// URL 무단 공유 차단을 위해 모든 디바이스가 공유하는 마스터 코드 해시.
// 사장이 보안 탭에서 마스터 코드 설정 후, 표시되는 값을 여기에 붙여넣고 GitHub 에 push.
//
// 설정/변경 시점에 SW 캐시 버전(sw.js의 CACHE_NAME)도 함께 bump 해야 즉시 반영됩니다.
//
// enabled 가 false 면 잠금 비활성 (누구나 사용 가능 — 초기 상태).

const MASTER_CONFIG = {
  enabled: false
  // 마스터 코드 설정 후 보안 탭에서 복사한 값으로 아래 항목 채우세요:
  // pinHash: "...",
  // salt: "...",
  // recoveryHash: "...",
  // recoverySalt: "...",
  // pinLength: 6,
  // pinChangedAt: "..."
};
