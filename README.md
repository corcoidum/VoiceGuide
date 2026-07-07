# VoiceGuide

처음 접하는 프로그램이나 웹서비스를 사용하는 동안, 현재 화면을 이해하고
**백그라운드 음성 대화로 한 번에 한 단계씩** 사용법을 안내하는 AI 학습 도우미.

> ⚠️ VoiceGuide는 모든 프로그램을 완벽히 지원하지 않습니다. 전용 Guide Pack이
> 있는 도구(ChatGPT, GitHub, Google Docs)는 검증된 워크플로로, 그 외 도구는
> 화면에서 **실제로 확인된 요소만** 사용하는 Generic Guide Mode로 안내합니다.

## 빠른 시작 (API 키 불필요 — Mock Mode)

```bash
npm install          # 의존성 설치 (Node 20+)
npm run dev:server   # 터미널 1: API 서버 (http://localhost:8787)
npm run dev          # 터미널 2: 웹앱 (http://localhost:5173)
```

브라우저(Chrome/Edge 권장 — 음성 인식 지원)에서 http://localhost:5173 접속.
서버 없이 웹앱만 실행해도 로컬 Mock으로 완전히 동작합니다.

```bash
npm run test         # 단위 + 통합 테스트 (60개)
npm run typecheck    # 전체 워크스페이스 strict 타입체크
npm run build        # core → server → web → extension 빌드
npm run desktop:proto # Windows 활성 창 감지 prototype
```

### 브라우저 확장 설치 (개발자 모드)

1. `npm run build` 실행 (extension의 `dist/` 생성)
2. Chrome → `chrome://extensions` → 개발자 모드 ON
3. "압축해제된 확장 프로그램 로드" → `apps/extension` 폴더 선택
4. 배우고 싶은 사이트에서 확장 아이콘 클릭 → **1️⃣ 페이지 정보 수집(동의)**
   → 미리보기 확인 → **2️⃣ VoiceGuide로 보내기**

### 실제 LLM 연결 (선택)

```bash
cp .env.example .env
# VOICEGUIDE_LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY 설정 후 서버 재시작
```

API 키는 서버(`apps/server`)에만 존재하며 클라이언트 코드에 포함되지 않습니다.

## 기술 스택과 선택 이유

| 영역 | 선택 | 이유 |
|---|---|---|
| Monorepo | npm workspaces | 추가 도구 설치 없이 동작, 공유 타입 재사용 |
| 공유 로직 | TypeScript strict (`packages/core`) | DOM 의존 없는 순수 로직 → web/server/desktop/mobile 재사용 |
| Web | Vite + React 18 + PWA manifest | 빠른 개발, 접근성 있는 SPA |
| STT/TTS | Web Speech API | 무료·무키·온디바이스, provider 인터페이스 뒤에 격리 |
| LLM | Mock(기본) / Anthropic(선택) | `LLMProvider` 인터페이스로 공급자 교체 가능 |
| Extension | Manifest V3, `activeTab`+`scripting`만 | 전체 사이트 접근 권한 불요구 — 클릭한 탭만, 동의 후에만 |
| Server | Node 내장 http | 의존성 최소화, LLM 프록시 + 2차 마스킹만 담당 |
| Desktop | PowerShell 기반 prototype (Tauri 계획) | Rust 미설치 환경 고려, `apps/desktop/README.md` 참고 |
| 테스트 | Vitest | 워크스페이스 공용, 빠름 |

## 아키텍처

```
 사용자 음성/텍스트                    화면 컨텍스트 소스
 ─────────────────                    ──────────────────────────────
 Web Speech STT ─┐                    Browser Extension (URL·제목·DOM)
 텍스트 입력 ────┤                    화면 캡처/스크린샷 (동의 후 1프레임)
                 │                    말로 설명 / 활성 창 제목(desktop)
                 ▼                                  │
        ┌─ apps/web (React) ─────────────────────── ▼ ──┐
        │  useVoiceGuide ──▶ GuideOrchestrator (core)   │
        │                     │ PrivacyRedactor ◀━━ 항상 먼저 실행
        │                     │ ToolDetector (confidence+evidence)
        │                     │ IntentClassifier (완료/못찾음/다시/쉽게…)
        │                     ├─ Guide Pack 매칭 ──▶ StepPlanner (결정적)
        │                     └─ 매칭 없음 ──▶ LLMProvider
        │                           │   ├ MockLLMProvider (오프라인, DOM 근거만)
        │                           │   └ ServerLLMProvider ──▶ apps/server
        │  LearningProgressTracker (localStorage)        │      ├ 2차 마스킹
        │  WebSpeechTTSProvider (중단 가능)              │      └ Anthropic(선택)
        └────────────────────────────────────────────────┘
```

## 디렉터리 구조

```
voiceguide/
├─ packages/core/          # 공유 타입 + 비즈니스 로직 (플랫폼 중립)
│  ├─ src/types.ts         # ScreenContext, GuideStep, GuidePack, …
│  ├─ src/privacyRedactor.ts      # 이메일·전화·주민번호·카드·API키·비밀번호 마스킹
│  ├─ src/intentClassifier.ts     # 발화 의도 분기 (오프라인)
│  ├─ src/toolDetector.ts         # confidence + evidence 기반 도구 감지
│  ├─ src/stepPlanner.ts          # Pack 단계 + Generic Guide Mode 플래너
│  ├─ src/guideOrchestrator.ts    # 대화 상태 머신
│  ├─ src/toolGuideRegistry.ts    # Guide Pack 플러그인 레지스트리 + 검증
│  ├─ src/learningProgressTracker.ts
│  ├─ src/providers.ts            # LLM/STT/TTS 인터페이스 + Mock 구현
│  ├─ src/packs/                  # chatgpt, github, googleDocs
│  └─ test/                       # 58개 단위·통합 테스트
├─ apps/web/               # Vite+React PWA (음성 UI, 프라이버시 제어)
├─ apps/server/            # LLM 프록시 (mock 기본, API 키 서버 보관)
├─ apps/extension/         # MV3 확장 (activeTab 최소 권한)
├─ apps/desktop/           # 활성 창 감지 prototype + Tauri 계획
└─ apps/mobile/            # Companion 구조 설계 (Phase 6)
```

## 지원되는 기능

- 음성(푸시투토크/핸즈프리) 및 텍스트 질문, 음성+텍스트 동시 응답
- TTS 즉시 중단, 다시 듣기, "더 쉽게" 단순화 설명, 속도 조절
- 도구 자동 감지(도메인 0.9 / 제목 0.6 / 수동 1.0 confidence) + 근거 표시
- 한 번에 1단계 안내: 상황 → 행동 → 찾을 UI → 성공 조건 → 대안 → 확인 질문
- "완료했어 / 못 찾겠어 / 다시 설명해줘 / 더 쉽게" 대화 분기
- Ask / Tutorial / Coach / Troubleshooting / Explore 모드
- Guide Pack 3개 내장 + 코드 변경 없는 플러그인 등록(`ToolGuideRegistry`)
- Generic Guide Mode: DOM에서 확인된 요소만 추천, 없으면 추측 대신 질문
- 민감정보 마스킹(이메일·전화·주민번호·카드·API키·토큰·비밀번호) — 클라이언트와 서버 이중 적용
- "AI가 보는 정보" 전송 전 미리보기, 컨텍스트/기록 즉시 삭제
- 학습 진행도 저장(localStorage), 이어하기, 반복 막힘 단계 복습 후보
- 파괴적 행동(삭제·결제·전송 등) 안내 시 자동 경고 + 자동 실행 없음

## 지원되지 않는 기능 (MVP 범위 밖)

- 자동 클릭·키 입력 대행 (의도적으로 제외 — 설명만 제공)
- 스크린샷 픽셀 분석(OCR/vision) — vision LLM 연결 전까지 캡처 사실만 전달
- 동의 없는 지속 화면 감시·녹음 (정책상 구현하지 않음)
- 모바일 앱 실행 바이너리 (구조 설계만: `apps/mobile/README.md`)
- Desktop tray/전역 단축키 (계획 문서화: `apps/desktop/README.md`)
- 사용자 계정/서버 동기화 (진행도는 온디바이스)

## 개인정보 보호 원칙

- 마이크·화면 공유는 **기본 OFF**, 상태는 항상 상단 배지에 표시
- 화면 캡처는 브라우저 동의 피커를 통해 1프레임만, 즉시 공유 종료
- 확장은 `activeTab` 권한만 사용 — 사용자가 클릭한 탭, 동의 버튼 이후에만 수집
- 비밀번호 입력 필드 값은 어떤 경로로도 수집하지 않음
- 모든 텍스트는 `PrivacyRedactor`를 거친 뒤에만 저장·전송·표시
- 서버는 요청 본문을 로그에 남기지 않음
- 원본 음성·화면은 저장하지 않음 (스크린샷 미리보기는 기기 내 메모리만)

## 플랫폼별 제한사항

| 플랫폼 | 제한 |
|---|---|
| Web | 음성 인식은 Chrome/Edge 필요 (Firefox/Safari는 텍스트 입력 사용) |
| Extension | `chrome://`, 웹스토어 등 특수 페이지에서는 수집 불가 |
| Windows | 활성 창 감지 OK, 정식 tray/hotkey는 Tauri 빌드 필요 |
| macOS | 창 제목=손쉬운 사용 권한, 화면 캡처=화면 기록 권한 필요 |
| Linux (Wayland) | 전역 활성 창 감지 제한 — portal 동의 플로우 필요 |
| Android/iOS | 타 앱 화면 감시 불가(정책) — 스크린샷 업로드·음성 질문 중심 |

## Guide Pack 추가하기

`packages/core/src/packs/`에 `GuidePack` 객체 하나를 추가하고
`packs/index.ts`의 `builtinPacks`에 넣으면 끝. 등록 시 구조 검증이 실행되어
필수 필드가 빠지면 명확한 오류로 거부됩니다. 스키마: `types.ts`의
`GuidePack` (toolId, supportedDomains, commonTasks[].steps[], troubleshooting,
docSources, safetyWarnings, version).

## 다음 Phase 권장사항

1. **Vision 연결**: 스크린샷을 vision LLM으로 분석하는 `ScreenshotAnalyzer`
   (인터페이스는 `ScreenContext.screenshotDescription`에 이미 연결점 존재)
2. **Tauri desktop**: prototype의 감지 로직 이식 + tray + 전역 단축키
3. **Expo mobile**: core 재사용, `expo-speech`로 provider 구현
4. **세션 동기화 서버**: 기기 간 이어하기 (지금은 온디바이스)
5. **Guide Pack 원격 레지스트리**: 서명된 팩 다운로드 + 버전 관리
6. **E2E 자동화**: Playwright로 웹 흐름 회귀 테스트
