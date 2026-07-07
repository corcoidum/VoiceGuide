# VoiceGuide Desktop Companion (구조 + 실행 가능한 prototype)

데스크톱 백그라운드 앱의 목표: system tray 상주, 전역 단축키, 활성 창 감지,
사용자 동의 기반 화면 캡처, 백그라운드 TTS.

## 지금 실행 가능한 것 (prototype)

```bash
npm run desktop:proto   # Windows에서 활성 창 감지 (ActiveAppDetector)
```

- 포그라운드 창의 **제목과 프로세스 이름만** 2초 간격으로 읽어,
  변경될 때마다 confidence·evidence가 포함된 감지 이벤트를 출력합니다.
- 화면 픽셀·키 입력·다른 앱 내부 데이터는 절대 수집하지 않습니다.
- 이 출력이 공유 core의 `ToolDetector`/`ScreenContext`(`activeWindowTitle`)에
  그대로 매핑됩니다.

## 정식 구현 계획 (Phase 4)

**Tauri 우선** (Rust 필요) — Electron 대비 메모리·배포 크기에서 유리:

| 기능 | Tauri API | 비고 |
|---|---|---|
| System tray | `tauri::tray` | 녹음/공유 상태를 트레이 아이콘으로 항상 표시 |
| 전역 단축키 | `tauri-plugin-global-shortcut` | 기본 `Ctrl+Shift+Space` |
| 활성 창 감지 | 이 prototype의 PowerShell 로직을 Rust `windows` crate로 이식 |
| 화면 캡처 | OS 캡처 API + 사용자 동의 다이얼로그 필수 |
| WebView UI | `apps/web`을 그대로 로드 (코드 재사용) |
| 백그라운드 TTS | WebView의 speechSynthesis 또는 OS TTS |

## OS별 권한 제한 (문서화)

- **Windows**: 활성 창 제목·프로세스 읽기는 별도 권한 불필요. 화면 캡처는
  Graphics Capture API 사용 시 시스템 피커(=동의 UI)가 표시됨.
- **macOS**: 창 제목 읽기에 손쉬운 사용(Accessibility) 권한, 화면 캡처에
  Screen Recording 권한 필요 — 시스템 설정에서 사용자가 직접 허용해야 함.
- **Linux (Wayland)**: 전역 활성 창 감지가 제한됨. xdg-desktop-portal의
  스크린캐스트 동의 플로우 사용. X11은 제약 적음.

Rust toolchain이 설치되어 있지 않은 환경을 위해 MVP에서는 Tauri 빌드를
포함하지 않고, 위 prototype과 이 문서로 구조를 제공합니다.
