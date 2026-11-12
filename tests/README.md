# 자동 테스트 (금액·가격 계산)

앱 코드를 바꿨을 때 금액이 조용히 달라지지 않았는지 1초 안에 확인합니다.
설치할 것 없음 — Node.js 18 이상만 있으면 됩니다 (내장 `node:test` 사용).

## 실행

```bash
node tests/run.js            # 전체
node tests/run.js pricing    # 파일 이름에 'pricing' 이 들어간 것만
```

끝에 `ℹ fail 0` 이면 통과. 실패하면 어떤 값이 기대와 달랐는지 출력되고 종료 코드가 1 입니다.
시간대는 한국(Asia/Seoul)으로 고정해서 실행합니다.

## 방식

- `helpers/load-app.js` 가 `js/app.js`(필요하면 `js/pages/records.js`)를 `node:vm` 에 그대로 올립니다. **앱 파일은 수정하지 않습니다.**
- `loadApp({ prepaid: true })` 는 `js/db.js` 의 정액권(`Prepaid`) 부분만 잘라 올리고 `Prepaid` 를 돌려줍니다 (DB 는 가짜 DB).
- 브라우저(document·localStorage)는 빈 껍데기, IndexedDB 는 메모리 가짜 DB(`createFakeDB`)로 바꿉니다.
- `loadApp({ now: '2026-11-05T10:00:00+09:00' })` 처럼 오늘 날짜를 고정할 수 있습니다.
- 화면 함수 `App.showToast`·`App.showModal` 은 호출 내용만 기록합니다 (영수증 테스트는 모달 HTML 에서 금액 줄을 뽑아 비교).

## 다루는 것

| 파일 | 내용 |
|---|---|
| `pricing.test.js` | 구간표 정규화, 구간 경계(3.0/3.1/7.0/10.0/10.3kg), 몸무게 없음·사이즈만, 초과 kg 올림·시작점 하한, inherit/off/custom, 무료·단일가·구간 사용 안 함, 빈 칸 대체(prev/next/min), 구간 id 불일치 + bandsAt, 가격 문구, 목록 가격 글자, 구버전 가격 변환·호환가·구버전 수정 반영 |
| `migration.test.js` | v182 → 구간 가격 변환(목욕 등 추가 요금 없는 서비스의 무거운 구간 = 대형가), 두 번째 실행 시 쓰기 없음, 구버전 기기 수정 반영, 서버 모드 |
| `menu-price.test.js` | 메뉴 가격 조회(이름 정규화·사용 중 메뉴 우선), 기록 폼 자동 가격(협의가 유지 조건, 자유 입력 서비스) |
| `records.test.js` | 받은 금액(finalPrice/totalPrice), 전월 동기 비교, 영수증(소계·할인·기타 추가·합계, 서비스(무료) 항목, 초과 kg 줄 분리, 추가 옵션 줄 나누기) |
| `format.test.js` | 금액 표시, 전화번호(+82, 02, 0505), 문자 템플릿(빈 변수·'문의:' 줄 제거·'$' 안전), 반려견 사이즈/가격 기준 |
| `money.test.js` | 기록 합계 `calcRecordTotals`(할인·추가 요금·할인 초과 차단·기본가/추가 옵션 서비스(무료)), 정액권 나누기 `calcPrepaidUse`(전액·일부+나머지 수단·잔액 0/마이너스·수정 시 금액 증감), 미수금 `getUnpaidAmount` |
| `prepaid.test.js` | 정액권 잔액(충전·사용·환불·조정), `splitOf`, 기록 수정 시 쓸 수 있는 금액(`availableIn`/`availableFor`), 저장 뒤 장부 맞추기(`syncRecordUse`), 영수증 사용 후 잔액(`balanceAfterIn`/`balanceAfter`), 이번 달 실입금 `monthCollected` |
| `style.test.js` | 스타일 칩으로 고른 스타일이 서비스 표시에 두 번 나오지 않음, 추가로 붙는 분류(스타일·추가 옵션·단독 케어), 추가 항목 값 정하기 `resolveExtraPrice`(코스 포함 0원 → 이 아이 가격 → 코스별 다른 값 → 메뉴 값), 이 아이 가격 `getPetPrice` |
| `length.test.js` | 미용 코스 길이 옵션 정리 `lengthOptionsOf`(빈 값 0원·이름 없음/중복/음수 버림), 예약의 길이 `apptLengthOf`(코스를 빼면 없음), 예약 서비스 이름 뒤 길이(`apptServiceNames`) |
| `service-pick.test.js` | 서비스 빨리 고르기: 최근 90일 사용 횟수 `serviceUseCounts`(예약·기록 이름 맞추기, 취소·노쇼·완료 예약 제외), 많이 쓴 순 정렬 `sortServicesByUse`, '지난번처럼' `lastServicePick`(최근 예약·기록 중 늦은 것, 길이 포함), 예약 서비스 칩 순서·작은 칩·8개 더보기 |
| `backup-export.test.js` | 사진 포함 백업 조각 만들기(exportAllBlob — 사진은 맨 뒤 한 줄에 한 장), 조각으로 읽기(readBackupFile — 새 모양·아주 작은 조각·옛 모양·사진 제외·사진 0장) |
| `dates.test.js` | 오늘(KST), 날짜 파싱·포맷, 월·연 경계 남은 일수, 시점 표현, 생일 기준 나이, 오래 안 온 반려견 기준(2년 전 날짜·판정) |
| `contact-alerts.test.js` | 홈 연락할 손님: 마지막 방문 뒤 연락 횟수(예전 lastContactedAt 호환), 두 번 연락해도 안 오면 오래 안 옴으로, 올 때 됨 순서(오래 안 옴까지 남은 날 → 방문 많은 순), 연락 기록 쌓기·취소·최근 5번 |
| `cycle-rules.test.js` | 미용 주기 한 기준: 기록 '다음 미용' 추천 순서(이 아이 → 스타일·코스 → 견종 → 매장), 가장 최근 기록 값이 반려견 주기(옛 기록 수정·최근 기록 삭제·같은 날 기록), 직접 정한 값과 날짜 비교, 실제 평균(3번 이상), 이상한 값·옛 데이터·백업 복원, 고객 목록 연락 두 번 규칙·VIP 반려견별 주기, 주기를 정해진 함수 밖에서 계산하지 않는지 소스 감시 |
| `card-frame.test.js` | 사진 카드: 내 프레임 투명 칸 자동 찾기(네컷·2×2 순서, 작은 점·가는 선 무시, JPG, 가장자리 칸), 사진 느낌 필터(흑백·따뜻하게·시원하게·넘침 없음), 프레임 칸 수에 맞춘 사진 장수 |

다루지 않는 것: 기록 저장 폼의 화면 흐름(입력값 읽기·확인창 — 금액 식 자체는 `calcRecordTotals` 로 테스트), 매출 화면(`revenue.js`), 동기화(`sync.js`). 이 부분 계산은 화면 없이 부를 수 있는 함수로 빼면 테스트를 붙일 수 있습니다.

## 케이스 추가하기

1. 알맞은 `*.test.js` 의 `describe` 안에 `test('설명 — 기대 결과', () => { ... })` 를 추가합니다.
2. **기대값은 손으로 계산해 숫자로 적습니다** (앱 함수를 불러 기대값을 만들면 버그도 같이 통과합니다). 설명에 계산식을 적어 두면 좋습니다. 예: `'12kg = 60,000 + 2kg × 5,000 = 70,000원'`.
3. DB 가 필요하면 `loadApp({ db: createFakeDB({ stores: { services: [...] }, settings: {...} }) })`.
4. 앱이 만든 객체를 `deepEqual` 로 비교할 때는 `plain(값)` 으로 감쌉니다 (vm 안의 객체라 프로토타입이 다름).
5. 새 파일은 이름을 `*.test.js` 로 만들면 `run.js` 가 자동으로 실행합니다.
6. `test.skip`·`test.only`·`test.todo` 는 남기지 않습니다.
