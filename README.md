# 어썸 캡처 모아

내 컴퓨터에 저장된 스크린샷을 날짜별로 모아 보는 **Windows 로컬 데스크톱 갤러리 앱**입니다.
Electron 기반이며 **외부 AI API · 서버 · 네트워크 연결 없이 로컬 파일만 읽습니다.**

## 실행 방법

```bash
cd E:\HermesProjects\ScreenshotHistory
npm install        # 최초 1회 (electron 다운로드)
npm start          # 앱 실행
```

## Windows 설치 파일 만들기

x64용 NSIS 설치 프로그램을 빌드하려면:

```bash
npm run dist:win
```

완성된 설치 파일은 `dist/어썸 캡처 모아 Setup 1.0.0.exe`에 생성됩니다. 설치 중 경로를 선택할 수 있고, 바탕 화면 및 시작 메뉴 바로가기가 만들어집니다.

단위 테스트 (그룹화·스캔 진행률):

```bash
npm test
```

UI 통합 스모크 테스트 (픽스처 이미지로 실제 화면 렌더링 검증 + QA 스크린샷 저장):

```bash
npm run test:fixtures   # 픽스처 PNG 생성 (최초 1회)
npm run test:smoke      # 갤러리/라이트박스/빈 상태 검증 → docs/qa/ 에 스크린샷 저장
npm run test:features   # 스캔 진행률/선택/복사/삭제/드래그 스크롤 통합 검증
npm run test:gallery    # 9,206장 기준 가상 스크롤/DOM 제한 검증
npx electron tests/smoke.js --reveal   # '파일 위치 열기' 실제 탐색기 열림 검증
```

## 주요 기능 (v1.1)

| 기능 | 설명 |
|------|------|
| 이미지 스캔 | PNG · JPG · JPEG · WEBP (하위 폴더 포함, 숨김 파일 제외), 진행률 표시 |
| 날짜 그룹화 | 파일 생성일 우선, 없으면 수정일 기준 |
| 섹션 | 오늘 / 어제 / 이번 주(월요일 시작) / 이번 달 / 이전 항목 |
| 썸네일 그리드 | 반응형 가상 스크롤, 화면 주변 카드만 DOM에 유지, 이미지 지연 로딩 |
| 큰 미리보기 | 클릭 시 확대, ←/→ 이동, Esc 닫기, 파일명·날짜·크기 표시 |
| 단건·다중 선택 | 체크박스, Ctrl/⌘ 클릭, Shift 범위 선택, 모두 선택/해제 |
| 삭제 | 확인 대화상자 후 휴지통으로 이동 (복구 가능), 여러 이미지 일괄 삭제 |
| 이미지 복사 | 선택한 이미지 1개를 PNG 형식으로 시스템 클립보드에 복사 (Ctrl+C 지원) |
| 드래그 스크롤 | 본문을 마우스로 끌어 세로 스크롤; 짧은 클릭은 미리보기로 처리 |
| 파일 위치 열기 | 미리보기에서 탐색기로 해당 파일 위치 열기 |
| 폴더 변경 | 사이드바 또는 빈 상태 화면에서 다른 폴더 선택 |
| 새로고침 | 현재 폴더 재스캔 |
| 기본 폴더 자동 탐지 | 첫 실행 시 `Pictures\Screenshots`, OneDrive 스크린샷 폴더, `Pictures` 순으로 탐색 |
| 빈 상태 화면 | 이미지가 없을 때 안내 + 폴더 선택 버튼 |

마지막으로 본 폴더는 `%APPDATA%\Screenshot Timeline\settings.json`에만 저장됩니다. 앱 이름을 변경해도 기존 설정 위치는 유지됩니다.

## 코드 구조

```
src/
  main/                  # Electron 메인 프로세스
    index.js             # 창 생성, IPC 등록
    ipc.js               # 렌더러와의 계약 (파일 접근 경계)
    services/
      scanner.js         # 로컬 폴더 스캔 → 이미지 메타데이터
      grouping.js        # 날짜 섹션 그룹화 (순수 함수)
      folderDetector.js  # 기본 스크린샷 폴더 자동 탐지
      shellActions.js    # 파일 위치 열기 / 휴지통 이동 / 이미지 클립보드 복사
      settings.js        # 마지막 폴더 기억 (로컬 JSON)
  preload.js             # contextBridge API 정의
  renderer/
    index.html
    styles.css           # 다크 테마
    app.js               # 화면 오케스트레이션
    modules/
      api.js             # IPC 래퍼
      state.js           # 전역 상태 (필터 확장 지점)
      sidebar.js         # 날짜 필터
      gallery.js         # 썸네일 그리드
      lightbox.js        # 큰 미리보기
      format.js          # 날짜/용량 표시
tests/
  grouping.test.js       # 그룹화 단위 테스트
  features-smoke.js      # 선택/복사/단건·다중 삭제/드래그 스크롤 통합 테스트
```

## 나중에 확장하기 (v1.1에서 의도적으로 제외)

검색 · 태그 · 중복 찾기 · 이름 변경 · OCR 은 넣지 않았습니다.
위 구조에서 확장할 때는:

- **검색/필터**: `renderer/modules/state.js`에 필터 상태를 추가하고 `gallery.js` 렌더링 전에 걸러내기
- **태그**: `main/services/`에 태그 저장소(예: JSON 사이드카) 추가 후 `ipc.js`에 핸들러 노출
- **중복 찾기**: `scanner.js`가 이미 크기·경로를 수집하므로 해시 계산 모듈을 추가해 비교

## 요구 사항

- Windows 10/11
- Node.js 18 이상 (설치 시에만 필요, 실행은 electron 번들로 동작)
