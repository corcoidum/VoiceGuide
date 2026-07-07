#!/usr/bin/env node
/**
 * VoiceGuide Desktop prototype — ActiveAppDetector (Windows).
 *
 * Polls the foreground window title + process name via PowerShell and prints
 * a detection event (with confidence + evidence) every time it changes.
 * This is the signal the desktop companion feeds into the shared
 * ToolDetector. Run explicitly with: npm run desktop:proto  (Ctrl+C to stop)
 *
 * Privacy: reads only the window TITLE and PROCESS NAME of the foreground
 * window. No screen pixels, no keystrokes, no other apps' data.
 */
import { execFile } from 'node:child_process';
import process from 'node:process';

if (process.platform !== 'win32') {
  console.error('This prototype supports Windows only. macOS/Linux: see apps/desktop/README.md');
  process.exit(1);
}

const PS_SCRIPT = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class VGFG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
'@
$h = [VGFG]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[VGFG]::GetWindowText($h, $sb, 512) | Out-Null
$procId = 0
[VGFG]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
$proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
@{ title = $sb.ToString(); process = if ($proc) { $proc.ProcessName } else { '' } } | ConvertTo-Json -Compress
`;

// Known desktop tools; everything else falls back to Generic Guide Mode.
const KNOWN = [
  { match: /chrome/i, toolName: 'Google Chrome' },
  { match: /msedge/i, toolName: 'Microsoft Edge' },
  { match: /firefox/i, toolName: 'Firefox' },
  { match: /Code/, toolName: 'Visual Studio Code' },
  { match: /excel/i, toolName: 'Microsoft Excel' },
  { match: /winword/i, toolName: 'Microsoft Word' },
  { match: /powerpnt/i, toolName: 'Microsoft PowerPoint' },
  { match: /notepad/i, toolName: '메모장' },
  { match: /explorer/i, toolName: 'Windows 탐색기' },
];

function detect(title, proc) {
  const known = KNOWN.find((k) => k.match.test(proc));
  if (known) {
    return {
      toolName: known.toolName,
      confidence: 0.8,
      evidence: [`실행 프로세스 이름(${proc})이 ${known.toolName}과 일치`, `창 제목: ${title}`],
    };
  }
  return {
    toolName: title || proc || '알 수 없음',
    confidence: title ? 0.3 : 0,
    evidence: [
      '전용 매핑이 없는 프로그램입니다. Generic Guide Mode로 안내합니다.',
      `프로세스: ${proc || '(없음)'}`,
    ],
  };
}

function poll() {
  execFile(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT],
    { windowsHide: true },
    (err, stdout) => {
      if (!err && stdout.trim()) {
        try {
          const { title, process: proc } = JSON.parse(stdout.trim());
          const key = `${proc}::${title}`;
          if (key !== poll.last) {
            poll.last = key;
            const detection = detect(title, proc);
            console.log(
              JSON.stringify(
                { type: 'active-window', at: new Date().toISOString(), title, process: proc, detection },
                null,
                2,
              ),
            );
          }
        } catch {
          /* transient PowerShell hiccup — skip this tick */
        }
      }
      setTimeout(poll, 2000);
    },
  );
}

console.log('[VoiceGuide desktop prototype] 활성 창 감지를 시작합니다. (Ctrl+C로 종료)');
console.log('창 제목과 프로세스 이름만 읽습니다. 화면 픽셀이나 키 입력은 수집하지 않습니다.\n');
poll();
