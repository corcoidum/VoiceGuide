import type { GuidePack } from '../types.js';

export const googleDocsPack: GuidePack = {
  toolId: 'google-docs',
  toolName: 'Google Docs',
  description: 'Google 문서(구글 독스) 사용법 안내',
  supportedDomains: ['docs.google.com'],
  supportedPlatforms: ['web', 'browser-extension'],
  version: '1.0.0',
  uiHints: {
    newDocButton: '시작 화면의 "내용 없음(빈 문서)" + 타일',
    shareButton: '문서 오른쪽 위의 파란색 "공유" 버튼',
    menuBar: '문서 상단의 파일/수정/보기 메뉴 바',
  },
  commonTasks: [
    {
      taskId: 'create-doc',
      title: '새 문서 만들기',
      keywords: ['새 문서', '문서 만들', '빈 문서', 'new document', '문서 생성'],
      steps: [
        {
          id: 'doc-1',
          instruction: 'docs.google.com 시작 화면에서 "내용 없음(빈 문서)"이라고 적힌 + 모양 타일을 눌러주세요.',
          uiHint: '"새 문서 시작" 아래 첫 번째의 알록달록한 + 타일',
          successCheck: '흰 종이 모양의 빈 문서 편집 화면이 열립니다.',
          fallback: '이미 문서 편집 화면이라면, 왼쪽 위 "파일" 메뉴에서 "새 문서 > 문서"를 선택하세요.',
        },
        {
          id: 'doc-2',
          instruction: '왼쪽 위의 "제목 없는 문서"를 눌러 문서 이름을 입력해주세요.',
          uiHint: '화면 왼쪽 맨 위 로고 옆의 제목 영역',
          successCheck: '입력한 이름이 제목 자리에 표시됩니다. 저장은 자동으로 됩니다.',
          fallback: '제목이 눌리지 않으면 문서 본문을 한 번 클릭한 뒤 다시 시도해보세요.',
        },
      ],
    },
    {
      taskId: 'share-doc',
      title: '문서 공유하기',
      keywords: ['공유', 'share', '같이 편집', '협업', '링크 보내'],
      steps: [
        {
          id: 'share-1',
          instruction: '문서 오른쪽 위의 파란색 "공유" 버튼을 눌러주세요.',
          uiHint: '프로필 사진 왼쪽의 자물쇠/공유 버튼',
          successCheck: '"사용자 및 그룹과 공유" 창이 나타납니다.',
          fallback: '버튼이 안 보이면 창을 넓히거나, 파일 메뉴에서 "공유"를 찾아보세요.',
        },
        {
          id: 'share-2',
          instruction: '공유할 사람의 이메일을 입력하고, 오른쪽에서 권한(뷰어/댓글 작성자/편집자)을 선택해주세요.',
          uiHint: '공유 창 상단의 이메일 입력칸과 권한 드롭다운',
          successCheck: '입력한 이메일이 목록에 추가됩니다.',
          fallback: '이메일 대신 "링크가 있는 모든 사용자"로 바꾸면 링크만으로 공유할 수도 있습니다. 단, 링크를 아는 누구나 열 수 있으니 주의하세요.',
        },
        {
          id: 'share-3',
          instruction: '"보내기" 버튼을 눌러 공유를 완료해주세요.',
          uiHint: '공유 창 오른쪽 아래의 파란색 버튼',
          successCheck: '창이 닫히고 상대방에게 초대 메일이 발송됩니다.',
          fallback: '보내기가 안 되면 이메일 주소 형식을 확인해주세요.',
        },
      ],
    },
    {
      taskId: 'export-pdf',
      title: 'PDF로 내려받기',
      keywords: ['pdf', '다운로드', '내려받', '변환', '저장하기'],
      steps: [
        {
          id: 'pdf-1',
          instruction: '왼쪽 위의 "파일" 메뉴를 눌러주세요.',
          uiHint: '문서 상단 메뉴 바의 첫 번째 항목',
          successCheck: '파일 메뉴가 아래로 펼쳐집니다.',
          fallback: '메뉴 바가 안 보이면 오른쪽 위의 ∨(메뉴 표시) 아이콘을 눌러보세요.',
        },
        {
          id: 'pdf-2',
          instruction: '"다운로드"에 마우스를 올린 뒤 "PDF 문서(.pdf)"를 선택해주세요.',
          uiHint: '파일 메뉴 중간의 "다운로드" 하위 메뉴',
          successCheck: '브라우저가 PDF 파일을 다운로드합니다. 보통 다운로드 폴더에 저장됩니다.',
          fallback: '다운로드가 차단되면 브라우저 주소창 근처의 차단 알림을 확인해 허용해주세요.',
        },
      ],
    },
  ],
  troubleshooting: [
    {
      pattern: '권한',
      cause: '문서에 대한 접근 권한이 없습니다.',
      solution: '"액세스 권한 요청" 버튼을 누르거나, 문서 소유자에게 공유를 요청하세요.',
    },
    {
      pattern: '저장',
      cause: 'Google Docs는 자동 저장되므로 별도 저장 버튼이 없습니다.',
      solution: '상단에 "Drive에 저장됨" 표시가 보이면 저장된 것입니다. 오프라인이면 연결 후 자동 동기화됩니다.',
    },
    {
      pattern: '오프라인',
      cause: '인터넷 연결이 끊겼습니다.',
      solution: '연결을 확인하세요. 자주 끊긴다면 설정에서 오프라인 모드를 켜두면 편집을 계속할 수 있습니다.',
    },
  ],
  docSources: [
    { title: 'Google Docs 고객센터', url: 'https://support.google.com/docs' },
  ],
  safetyWarnings: [
    '"링크가 있는 모든 사용자" 공유는 링크를 아는 누구나 문서를 볼 수 있게 합니다. 민감한 문서에는 사용하지 마세요.',
  ],
};
