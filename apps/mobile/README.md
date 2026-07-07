# VoiceGuide Mobile Companion (구조 설계)

모바일 OS는 다른 앱 화면의 지속 감시를 허용하지 않으므로(정책상 구현하지 않음),
companion 앱은 다음 기능에 집중합니다.

## 기능 범위

1. 음성 질문·답변 — 데스크톱과 동일한 `/api/llm` + 공유 core 로직 사용
2. 스크린샷 업로드 — 사진첩/공유 시트에서 선택한 이미지만 (동의 = 선택 행위)
3. 세션 이어보기 — 데스크톱에서 진행 중인 가이드 확인
4. 학습 기록 확인 — `LearningProgressTracker` 데이터 동기화
5. QR/로그인 기반 데스크톱 세션 연결

## 기술 선택

- **React Native + Expo**: `@voiceguide/core`가 순수 TypeScript(DOM 의존
  없음)라서 그대로 import 가능. STT/TTS는 `expo-speech`,
  `@react-native-voice/voice`로 `STTProvider`/`TTSProvider` 인터페이스를 구현.

## 구조 (Phase 6에서 생성)

```
apps/mobile/
  app.json            # Expo 설정
  src/
    providers/
      nativeSpeech.ts # STTProvider/TTSProvider 네이티브 구현
    screens/
      HomeScreen.tsx  # 음성 질문 + 답변
      SessionScreen.tsx # 진행 중 가이드 이어보기
      HistoryScreen.tsx # 학습 기록
    api/
      client.ts       # /api/* 호출 (데스크톱 서버 또는 클라우드)
```

## 시작 방법 (Phase 6)

```bash
npx create-expo-app apps/mobile --template blank-typescript
# 이후 @voiceguide/core를 workspace 의존성으로 추가
```

MVP 범위에서는 무거운 네이티브 의존성 설치를 피하기 위해 구조와 인터페이스
설계만 제공합니다. core의 provider 인터페이스가 이미 플랫폼 중립적이므로
구현 시 core 코드 변경은 필요 없습니다.
