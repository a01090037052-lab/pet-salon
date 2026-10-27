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
  // 사진 공유 정책: 반려견 프로필 400px, 기록 사진(미용 전·후) 600px 축소본을 올린다.
  // 기록 사진은 반려견별 최근 N회(설정 recordPhotoKeep, 기본 3)만 남겨 무료 저장 한도(1GB) 안에서 고정된다.
  photo: { profileMaxPx: 400, profileQuality: 0.7, recordMaxPx: 600, recordQuality: 0.65 }
};
