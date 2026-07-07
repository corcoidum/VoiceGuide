import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useVoiceGuide } from './hooks/useVoiceGuide';
import type { ChatMessage } from './hooks/useVoiceGuide';

const MODE_LABELS: Record<string, string> = {
  ask: '질문',
  tutorial: '처음부터',
  coach: '코치',
  troubleshooting: '문제 해결',
  explore: '살펴보기',
};

const EXAMPLE_QUESTIONS = [
  '지금 화면에서 다음에 뭘 해야 해?',
  '로그인하려면 어디를 눌러?',
  '설정 메뉴를 찾고 싶어',
  '이 오류를 해결하고 싶어',
];

type VoiceGuideState = ReturnType<typeof useVoiceGuide>;

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const level = value >= 0.7 ? 'high' : value >= 0.4 ? 'mid' : 'low';
  return <span className={`badge conf-${level}`}>확신도 {pct}%</span>;
}

function formatCapturedAt(value: string | null | undefined): string {
  if (!value) return '아직 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function compactUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return 'URL 없음';
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return rawUrl;
  }
}

function GuideMessage({ message }: { message: ChatMessage }) {
  const r = message.response;
  return (
    <div className="msg guide">
      {r?.step && !r.simplified ? (
        <article className="step-card">
          <p className="step-situation">{r.step.situation}</p>
          <p className="step-action">{r.step.action}</p>
          <dl className="step-meta">
            <div>
              <dt>찾을 것</dt>
              <dd>{r.step.uiHint}</dd>
            </div>
            <div>
              <dt>성공 조건</dt>
              <dd>{r.step.successCheck}</dd>
            </div>
            <div>
              <dt>대안</dt>
              <dd>{r.step.fallback}</dd>
            </div>
          </dl>
          <p className="step-confirm">{r.step.confirmQuestion}</p>
        </article>
      ) : (
        <p className="msg-text">{message.text}</p>
      )}
      {r?.safetyWarning && <p className="safety">{r.safetyWarning}</p>}
      {r && (
        <details className="evidence">
          <summary>
            <ConfidenceBadge value={r.confidence} />
            <span className="badge">
              {r.usedGuidePack ? `Guide Pack: ${r.usedGuidePack}` : 'Generic Guide Mode'}
            </span>
          </summary>
          <ul>
            {r.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DomGroup({ title, items }: { title: string; items: string[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="dom-group">
      <h3>{title}</h3>
      <div className="chips">
        {items.slice(0, 10).map((item) => (
          <span key={item} className="chip">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActiveTabPanel({ vg }: { vg: VoiceGuideState }) {
  const context = vg.extensionContext;
  const dom = context?.domSummary;
  return (
    <section className={`active-tab ${context ? 'connected' : 'empty'}`}>
      <div className="tab-main">
        <span className="eyebrow">Chrome Active Tab</span>
        <h2>{context?.title || 'Chrome 탭 연결 대기'}</h2>
        <p>{context ? compactUrl(context.url) : vg.extensionBridgeStatus.message}</p>
      </div>
      <div className="tab-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void vg.refreshActiveTabContext()}
          disabled={vg.extensionBridgeStatus.refreshing}
        >
          {vg.extensionBridgeStatus.refreshing ? '읽는 중' : '현재 탭 다시 읽기'}
        </button>
        <button type="button" onClick={() => void vg.loadStoredExtensionContext()}>
          연결 상태 확인
        </button>
      </div>
      <div className="tab-stats">
        <span>캡처 {formatCapturedAt(context?.capturedAt)}</span>
        <span>버튼 {dom?.buttons.length ?? 0}</span>
        <span>링크 {dom?.links.length ?? 0}</span>
        <span>입력칸 {dom?.inputs.length ?? 0}</span>
      </div>
    </section>
  );
}

function CurrentPageElements({ vg }: { vg: VoiceGuideState }) {
  const dom = vg.extensionContext?.domSummary;
  return (
    <section className="panel elements-panel">
      <h2>현재 탭에서 확인한 요소</h2>
      {dom ? (
        <>
          <DomGroup title="버튼" items={dom.buttons} />
          <DomGroup title="링크" items={dom.links} />
          <DomGroup title="입력칸" items={dom.inputs} />
          <DomGroup title="제목" items={dom.headings} />
          <DomGroup title="영역" items={dom.landmarks} />
        </>
      ) : (
        <p className="hint">연결된 Chrome 탭의 DOM 요약이 아직 없습니다.</p>
      )}
    </section>
  );
}

export default function App() {
  const vg = useVoiceGuide();
  const [textInput, setTextInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const submitText = (e: FormEvent): void => {
    e.preventDefault();
    void vg.ask(textInput);
    setTextInput('');
  };

  return (
    <div className="app">
      <header className="topbar" role="banner">
        <div className="brand">
          <span className="eyebrow">VoiceGuide</span>
          <h1>현재 Chrome 탭 음성가이드봇</h1>
        </div>
        <div className="status-items">
          <span className={`badge ${vg.extensionContext ? 'on' : 'off'}`}>
            {vg.extensionContext ? 'Chrome 탭 연결됨' : 'Chrome 탭 미연결'}
          </span>
          <span className="badge" title={vg.detection.evidence.join('\n')}>
            {vg.detection.toolName}
          </span>
          <ConfidenceBadge value={vg.detection.confidence} />
          <span className={`badge ${vg.micOn ? 'on' : 'off'}`}>
            {vg.micOn ? '마이크 듣는 중' : '마이크 꺼짐'}
          </span>
          <span className="badge">모드 {MODE_LABELS[vg.mode]}</span>
          <span className="badge">LLM {vg.serverLLM}</span>
        </div>
      </header>

      <main className="workspace">
        <section className="guide-column" aria-label="Chrome 탭 음성 가이드">
          <ActiveTabPanel vg={vg} />

          <section className="chat">
            <div className="messages" aria-live="polite">
              {vg.messages.length === 0 && (
                <div className="empty">
                  <p>말하거나 입력하면 현재 Chrome 탭 기준으로 한 단계만 안내합니다.</p>
                  <div className="examples">
                    {EXAMPLE_QUESTIONS.map((ex) => (
                      <button key={ex} type="button" onClick={() => void vg.ask(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {vg.messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="msg user">
                    <p className="msg-text">{m.text}</p>
                  </div>
                ) : (
                  <GuideMessage key={m.id} message={m} />
                ),
              )}
              {vg.busy && (
                <div className="msg guide">
                  <p className="msg-text">현재 탭을 확인하는 중입니다...</p>
                </div>
              )}
              {vg.interimText && (
                <div className="msg user interim">
                  <p className="msg-text">{vg.interimText}...</p>
                </div>
              )}
            </div>

            {vg.error && <p className="error" role="alert">{vg.error}</p>}

            <div className="input-row">
              <button
                type="button"
                className={`mic ${vg.micOn ? 'active' : ''}`}
                onClick={() => (vg.micOn ? vg.stopMic() : vg.startMic())}
                aria-pressed={vg.micOn}
              >
                {vg.micOn ? '듣기 중지' : '말하기'}
              </button>
              <form onSubmit={submitText} className="text-form">
                <input
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="현재 탭에서 하고 싶은 일을 입력하세요"
                  aria-label="질문 입력"
                />
                <button type="submit" disabled={vg.busy || !textInput.trim()}>
                  보내기
                </button>
              </form>
            </div>

            <div className="quick-row">
              <button type="button" onClick={() => void vg.ask('완료했어')}>완료했어</button>
              <button type="button" onClick={() => void vg.ask('못 찾겠어')}>못 찾겠어</button>
              <button type="button" onClick={() => void vg.ask('다시 설명해줘')}>다시 설명</button>
              <button type="button" onClick={() => void vg.ask('더 쉽게 말해줘')}>더 쉽게</button>
              {vg.isSpeaking ? (
                <button type="button" className="danger" onClick={vg.stopSpeaking}>음성 중단</button>
              ) : (
                <button type="button" onClick={() => void vg.replayLast()}>다시 듣기</button>
              )}
            </div>
          </section>
        </section>

        <aside className="side" aria-label="컨텍스트 및 설정">
          <CurrentPageElements vg={vg} />

          <section className="panel">
            <h2>가이드 설정</h2>
            <label className="row">
              <input
                type="checkbox"
                checked={vg.contextSharingOn}
                onChange={(e) => vg.setContextSharingOn(e.target.checked)}
              />
              컨텍스트 전달
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={vg.autoDetect}
                onChange={(e) => vg.setAutoDetect(e.target.checked)}
              />
              도구 자동 감지
            </label>
            {!vg.autoDetect && (
              <select
                value={vg.selectedToolId}
                onChange={(e) => vg.setSelectedToolId(e.target.value)}
                aria-label="도구 직접 선택"
              >
                <option value="">도구 선택</option>
                {vg.packs.map((p) => (
                  <option key={p.toolId} value={p.toolId}>
                    {p.toolName}
                  </option>
                ))}
              </select>
            )}
            <select
              value={vg.mode}
              onChange={(e) => vg.setMode(e.target.value as typeof vg.mode)}
              aria-label="가이드 모드"
            >
              {Object.entries(MODE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </section>

          <section className="panel">
            <h2>보조 컨텍스트</h2>
            <div className="btn-row">
              <button type="button" onClick={() => void vg.captureScreen()}>
                화면 캡처
              </button>
              <button type="button" onClick={() => fileRef.current?.click()}>
                스크린샷 업로드
              </button>
              {vg.screenshotName && (
                <button type="button" className="danger" onClick={vg.stopScreenShare}>
                  삭제
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) vg.uploadScreenshot(f);
              }}
            />
            {vg.screenshotPreview && (
              <img
                className="shot-preview"
                src={vg.screenshotPreview}
                alt="공유된 화면 미리보기"
              />
            )}
            <textarea
              value={vg.manualDescription}
              onChange={(e) => vg.setManualDescription(e.target.value)}
              placeholder="화면에 보이는 특이한 상태를 추가로 적어주세요"
              aria-label="현재 화면 설명"
            />
          </section>

          <section className="panel">
            <h2>음성</h2>
            <label className="row">
              <input
                type="checkbox"
                checked={vg.voiceOutputOn}
                onChange={(e) => vg.setVoiceOutputOn(e.target.checked)}
              />
              답변 읽어주기
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={vg.handsFree}
                onChange={(e) => vg.setHandsFree(e.target.checked)}
              />
              연속 듣기
            </label>
            <label className="row slider">
              말하기 속도 {vg.voiceRate.toFixed(1)}x
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={vg.voiceRate}
                onChange={(e) => vg.setVoiceRate(Number(e.target.value))}
              />
            </label>
          </section>

          <section className="panel preview-panel">
            <h2>AI가 보는 정보</h2>
            {vg.findings.length > 0 && (
              <p className="privacy-note">
                마스킹됨: {vg.findings.map((f) => `${f.kind} x ${f.count}`).join(', ')}
              </p>
            )}
            {vg.redactedPreview ? (
              <pre className="preview">
                {JSON.stringify(vg.redactedPreview, null, 2)}
              </pre>
            ) : (
              <p className="hint">전달 중인 컨텍스트가 없습니다.</p>
            )}
            <div className="btn-row">
              <button type="button" className="danger" onClick={vg.clearContext}>
                컨텍스트 삭제
              </button>
              <button type="button" className="danger" onClick={vg.clearHistory}>
                대화 삭제
              </button>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
