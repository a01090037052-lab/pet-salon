// ========== 동기화(Firebase) 연결 설정 ==========
// 이 값들은 비밀번호가 아니라 "어느 프로젝트에 붙을지"를 가리키는 주소다 (Firebase 웹 설정의 공개 값).
// 실제 보호는 Firestore 보안 규칙(허용 계정만 읽기/쓰기)과 Authentication 승인 도메인이 맡는다.
// 프로젝트: petsalon (Spark 무료 요금제, 카드 미등록) — 2026-10-23 생성
const SYNC_CONFIG = {
  firebase: {
    apiKey: "AIzaSyC8XtDaogiKB15wCuTOB47Fz3u9EGGCS7o",
    authDomain: "petsalon-d6d50.firebaseapp.com",
    projectId: "petsalon-d6d50",
    storageBucket: "petsalon-d6d50.firebasestorage.app",
    messagingSenderId: "659771520332",
    appId: "1:659771520332:web:ade98da9d103e8d58a4be9"
  },
  // 사진 공유 정책 (설계안 §2): 반려견 프로필은 400px 공유, 미용 전·후는 기본 끔
  photo: { profileMaxPx: 400, profileQuality: 0.7, shareGroomingPhotos: false, groomingKeepDays: 730 }
};
