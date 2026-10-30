# 리니지M 혈맹 보스탐 + Discord + Android

31종 기본 보스·맵 설정, 공동 컷/멍, 30분 자동 넘김, 관리자 초기화·이력 복구, PostgreSQL 영구 저장, 자동 백업, Android WebView APK 프로젝트입니다. 기본표는 혈맹 관리자가 확인해야 합니다. 정정표의 카스트(맵 46, 450분)·네크로맨서(맵 18)를 반영했습니다. 네크로맨서는 정확한 출현 분이 미확정이므로 설정 전 자동 계산하지 않습니다.

## 개발 실행

Node.js 22 이상. `npm ci --ignore-scripts`, `npm run check`, `npm test`.
`.env.example`의 환경변수를 실제 실행 환경에 설정하고 `npm start`를 실행하세요. .env를 자동으로 읽지 않습니다. 로컬 전용으로 DATABASE_URL을 생략하면 `data/state.json`을 사용하고, Bot-Hosting 운영 환경에서는 기존 PostgreSQL DATABASE_URL을 유지하세요.

## 기능과 운영

- 앱·Discord가 같은 DB와 시간 계산 함수를 사용합니다.
- 웹은 혈맹/관리자 키, Discord는 지정된 혈맹 서버와 관리자 권한을 검사합니다.
- 모든 변경 전 200개 백업, 최근 이력 1000개와 알림 재시도 큐를 보관합니다.
- `npm test`는 외부 DB 없이 핵심·HTTP·파일 저장을 검사합니다. `TEST_DATABASE_URL`을 지정하면 실제 PostgreSQL 동시성 검사도 실행합니다(CI에서 필수).
- Actions의 `Verify and Build Android APK`가 테스트 후 APK를 생성합니다.

[운영 전환·백업·무료 환경 한계·APK 안내](docs/OPERATIONS.ko.md)를 읽고 기존 서비스 데이터 내보내기와 검증을 완료한 뒤 배포하세요. 운영 봇은 Bot-Hosting 한 곳에서만 실행하고 중지된 Render 인스턴스를 재가동하지 마세요. APK는 실제 접속 가능한 HTTPS API 주소를 사용해야 하며, GitHub Actions 변수 BOSS_APP_URL에 해당 주소를 설정해야 합니다. 배포 전 `DATABASE_URL`, 웹 키, Discord 환경변수가 필요합니다. 토큰은 코드나 APK에 포함하지 마세요.
