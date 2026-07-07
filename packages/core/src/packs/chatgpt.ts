import type { GuidePack } from '../types.js';

export const chatgptPack: GuidePack = {
  toolId: 'chatgpt',
  toolName: 'ChatGPT',
  description: 'OpenAI의 대화형 AI 서비스 사용법 안내',
  supportedDomains: ['chatgpt.com', 'chat.openai.com'],
  supportedPlatforms: ['web', 'browser-extension'],
  version: '1.0.0',
  uiHints: {
    newChat: '왼쪽 사이드바 상단의 "새 채팅(New chat)" 버튼',
    inputBox: '화면 하단 중앙의 메시지 입력창',
    sidebar: '왼쪽의 대화 목록 사이드바',
    modelSelector: '화면 상단의 모델 이름 드롭다운',
  },
  commonTasks: [
    {
      taskId: 'new-chat',
      title: '새 대화 시작하기',
      keywords: ['새 채팅', '새 대화', '대화 시작', 'new chat', '채팅 시작'],
      steps: [
        {
          id: 'new-chat-1',
          instruction: '왼쪽 사이드바 맨 위의 "새 채팅" 버튼(연필/플러스 아이콘)을 눌러주세요.',
          uiHint: '화면 왼쪽 위, 로고 근처의 연필 모양 또는 "New chat" 아이콘',
          successCheck: '가운데에 빈 입력창과 인사말이 있는 새 화면이 나타납니다.',
          fallback: '사이드바가 접혀 있다면 왼쪽 위 ☰(햄버거) 아이콘을 먼저 눌러 펼쳐주세요.',
        },
        {
          id: 'new-chat-2',
          instruction: '화면 아래쪽 입력창에 질문을 입력하고 Enter를 눌러주세요.',
          uiHint: '"무엇이든 물어보세요" 같은 안내문이 있는 하단 입력창',
          successCheck: '내 메시지가 위로 올라가고 ChatGPT의 답변이 생성되기 시작합니다.',
          fallback: '입력창이 비활성화되어 있으면 페이지를 새로고침(F5)해보세요.',
        },
      ],
    },
    {
      taskId: 'upload-file',
      title: '파일 업로드해서 질문하기',
      keywords: ['파일', '업로드', '첨부', 'upload', 'file', '이미지 올리'],
      steps: [
        {
          id: 'upload-1',
          instruction: '입력창 왼쪽의 클립(+) 아이콘을 눌러주세요.',
          uiHint: '메시지 입력창 안쪽 왼편의 + 또는 📎 아이콘',
          successCheck: '"파일 업로드" 등의 메뉴가 나타납니다.',
          fallback: '아이콘이 없다면 파일을 입력창 위로 직접 드래그해도 됩니다.',
        },
        {
          id: 'upload-2',
          instruction: '"컴퓨터에서 업로드"를 선택하고 파일을 골라주세요.',
          uiHint: '열린 메뉴 안의 업로드 항목',
          successCheck: '입력창 위에 파일 이름이 붙은 미리보기가 표시됩니다.',
          fallback: '파일 형식이 지원되지 않으면 오류가 표시됩니다. PDF, 이미지, 텍스트 파일을 시도해보세요.',
        },
        {
          id: 'upload-3',
          instruction: '파일에 대해 물어볼 내용을 입력하고 전송해주세요.',
          uiHint: '하단 메시지 입력창',
          successCheck: 'ChatGPT가 파일 내용을 참고한 답변을 생성합니다.',
          fallback: '답변이 파일과 무관하면 "방금 올린 파일을 기준으로 답해줘"라고 다시 요청하세요.',
        },
      ],
    },
    {
      taskId: 'share-chat',
      title: '대화 공유하기',
      keywords: ['공유', 'share', '링크', '대화 보내'],
      steps: [
        {
          id: 'share-1',
          instruction: '화면 오른쪽 위의 공유 아이콘(위로 향한 화살표)을 눌러주세요.',
          uiHint: '대화 화면 우측 상단의 공유 버튼',
          successCheck: '"공유 링크 만들기" 창이 나타납니다.',
          fallback: '아이콘이 없으면 사이드바에서 대화 제목 옆 ... 메뉴를 눌러 "공유"를 찾아보세요.',
        },
        {
          id: 'share-2',
          instruction: '"링크 만들기"를 누르고, 만들어진 링크를 복사해주세요.',
          uiHint: '공유 창 안의 링크 생성/복사 버튼',
          successCheck: '"링크가 복사되었습니다" 안내가 표시됩니다.',
          fallback: '이 링크를 받은 사람은 대화 내용을 볼 수 있으니, 민감한 내용이 있는 대화는 공유하지 마세요.',
        },
      ],
    },
  ],
  troubleshooting: [
    {
      pattern: '로그인',
      cause: '세션이 만료되었거나 로그인이 필요한 상태입니다.',
      solution: 'chatgpt.com에서 "Log in"을 눌러 다시 로그인해주세요. 비밀번호는 VoiceGuide에 말하지 마세요.',
    },
    {
      pattern: '느려',
      cause: '서버 혼잡 또는 네트워크 문제일 수 있습니다.',
      solution: '잠시 기다렸다가 새로고침하거나, status.openai.com에서 서비스 상태를 확인해보세요.',
    },
    {
      pattern: '한도',
      cause: '무료 플랜의 사용량 한도에 도달했을 수 있습니다.',
      solution: '시간이 지나면 다시 사용할 수 있습니다. 더 많은 사용량이 필요하면 유료 플랜을 검토해보세요.',
    },
  ],
  docSources: [
    { title: 'OpenAI Help Center', url: 'https://help.openai.com' },
  ],
  safetyWarnings: [
    '대화 공유 링크는 누구나 열 수 있습니다. 개인정보가 담긴 대화는 공유하지 마세요.',
  ],
};
