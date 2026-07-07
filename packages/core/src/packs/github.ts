import type { GuidePack } from '../types.js';

export const githubPack: GuidePack = {
  toolId: 'github',
  toolName: 'GitHub',
  description: '코드 저장소 서비스 GitHub 사용법 안내',
  supportedDomains: ['github.com'],
  supportedPlatforms: ['web', 'browser-extension'],
  version: '1.0.0',
  uiHints: {
    newRepoButton: '오른쪽 위 + 아이콘 메뉴의 "New repository"',
    profileMenu: '오른쪽 맨 위의 프로필 사진',
    repoTabs: '저장소 상단의 Code / Issues / Pull requests 탭',
  },
  commonTasks: [
    {
      taskId: 'create-repo',
      title: '새 저장소(Repository) 만들기',
      keywords: ['저장소', '레포', 'repository', 'repo', '새 프로젝트', '리포지토리'],
      steps: [
        {
          id: 'repo-1',
          instruction: '화면 오른쪽 위의 + 아이콘을 눌러주세요.',
          uiHint: '프로필 사진 왼쪽에 있는 + 모양 아이콘',
          successCheck: '"New repository" 등이 있는 드롭다운 메뉴가 열립니다.',
          fallback: '+ 아이콘이 없으면 github.com/new 주소로 직접 이동해도 됩니다.',
        },
        {
          id: 'repo-2',
          instruction: '메뉴에서 "New repository"를 선택해주세요.',
          uiHint: '드롭다운 메뉴의 첫 번째 항목',
          successCheck: '"Create a new repository" 제목의 새 페이지가 열립니다.',
          fallback: '페이지가 열리지 않으면 로그인 상태를 확인해주세요.',
        },
        {
          id: 'repo-3',
          instruction: 'Repository name 칸에 저장소 이름을 입력해주세요. 영문, 숫자, 하이픈(-)을 사용할 수 있습니다.',
          uiHint: '페이지 상단의 "Repository name" 입력칸',
          successCheck: '이름 옆에 초록색 체크 표시가 나타납니다.',
          fallback: '빨간색 경고가 나오면 이미 같은 이름의 저장소가 있다는 뜻입니다. 다른 이름을 시도해보세요.',
        },
        {
          id: 'repo-4',
          instruction: 'Public(공개) 또는 Private(비공개)을 선택한 뒤, 아래의 초록색 "Create repository" 버튼을 눌러주세요.',
          uiHint: '페이지 맨 아래의 초록색 버튼',
          successCheck: '새 저장소 페이지가 열리고 안내 문구(Quick setup)가 보입니다.',
          fallback: '버튼이 흐리게 비활성화되어 있으면 저장소 이름이 아직 입력되지 않은 것입니다.',
        },
      ],
    },
    {
      taskId: 'create-issue',
      title: '이슈(Issue) 만들기',
      keywords: ['이슈', 'issue', '버그 신고', '버그 리포트'],
      steps: [
        {
          id: 'issue-1',
          instruction: '저장소 페이지 상단의 "Issues" 탭을 눌러주세요.',
          uiHint: 'Code 탭 오른쪽에 있는 Issues 탭',
          successCheck: '이슈 목록 화면이 나타납니다.',
          fallback: 'Issues 탭이 없으면 저장소 설정에서 이슈 기능이 꺼져 있는 것입니다. 저장소 관리자에게 문의하세요.',
        },
        {
          id: 'issue-2',
          instruction: '초록색 "New issue" 버튼을 눌러주세요.',
          uiHint: '이슈 목록 오른쪽 위의 초록색 버튼',
          successCheck: '제목과 내용을 입력하는 화면이 나타납니다.',
          fallback: '버튼이 안 보이면 로그인이 필요한 상태일 수 있습니다.',
        },
        {
          id: 'issue-3',
          instruction: '제목(Title)과 내용을 입력하고 "Submit new issue"(또는 "Create") 버튼을 눌러주세요.',
          uiHint: '입력 영역 아래의 초록색 제출 버튼',
          successCheck: '번호가 붙은 이슈 페이지(#1 같은)가 열립니다.',
          fallback: '제목이 비어 있으면 제출 버튼이 눌리지 않습니다.',
        },
      ],
    },
    {
      taskId: 'fork-repo',
      title: '다른 사람 저장소 복제(Fork)하기',
      keywords: ['포크', 'fork', '복제', '가져오기'],
      steps: [
        {
          id: 'fork-1',
          instruction: '복제하고 싶은 저장소 페이지 오른쪽 위의 "Fork" 버튼을 눌러주세요.',
          uiHint: 'Star 버튼 옆의 Fork 버튼',
          successCheck: '"Create a new fork" 페이지가 열립니다.',
          fallback: '버튼이 비활성화면 이미 내 계정에 같은 fork가 있는지 확인해보세요.',
        },
        {
          id: 'fork-2',
          instruction: '설정을 그대로 두고 초록색 "Create fork" 버튼을 눌러주세요.',
          uiHint: '페이지 하단의 초록색 버튼',
          successCheck: '내 계정 아래에 복제된 저장소 페이지가 열립니다. 주소가 내 아이디로 시작합니다.',
          fallback: '오류가 나면 잠시 후 다시 시도해보세요.',
        },
      ],
    },
  ],
  troubleshooting: [
    {
      pattern: '404',
      cause: '주소가 잘못되었거나 비공개 저장소에 접근 권한이 없는 경우입니다.',
      solution: '주소 철자를 확인하고, 비공개 저장소라면 소유자에게 초대(collaborator 추가)를 요청하세요.',
    },
    {
      pattern: 'permission',
      cause: '해당 저장소에 쓰기 권한이 없습니다.',
      solution: 'Fork한 뒤 내 저장소에서 작업하고 Pull Request를 보내는 방법을 사용하세요.',
    },
    {
      pattern: '로그인',
      cause: '로그인이 만료되었거나 2단계 인증이 필요합니다.',
      solution: '다시 로그인하세요. 인증 코드는 VoiceGuide에 말하지 말고 직접 입력하세요.',
    },
  ],
  docSources: [{ title: 'GitHub Docs', url: 'https://docs.github.com' }],
  safetyWarnings: [
    '저장소 삭제(Delete repository)는 되돌릴 수 없습니다. 삭제 전 반드시 백업하세요.',
    'API 토큰이나 비밀번호를 저장소 코드에 올리지 마세요.',
  ],
};
