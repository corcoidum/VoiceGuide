import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useVoiceGuide } from './hooks/useVoiceGuide';
import type { ChatMessage } from './hooks/useVoiceGuide';

const MODE_LABELS: Record<string, string> = {
  ask: 'Ask — 질문할 때만 응답',
  tutorial: 'Tutorial — 처음부터 단계별',
  coach: 'Coach — 진행 확인하며 안내',
  troubleshooting: 'Troubleshooting — 오류 해결',
  explore: 'Explore — 화면 기능 살펴보기',
};

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const level = value >= 0.7 ? 'high' : value >= 0.4 ? 'mid' : 'low';
  return <span className={`badge conf-${level}`}>확신도 {pct}%</span>;
}

function GuideMessage({ message }: { message: ChatMessage }) {
  const r = message.response;
  return (
    <div className="msg guide">
      {r?.step && !r.simplified ? (
        <div className="step-card">
          <p className="step-situation">{r.step.situation}</p>
          <p className="step-action">👉 {r.step.action}</p>
          <ul className="step-meta">
            <li>🔍 찾을 것: {r.step.uiHint}</li>
            <li>✅ 성공하면: {r.step.successCheck}</li>
            <li>🔁 잘 안 되면: {r.step.fallback}</li>
          </ul>
          <p className="step-confirm">{r.step.confirmQuestion}</p>
        </div>
      ) : (
        <p className="msg-text">{message.text}</p>
      )}
      {r?.safetyWarning && <p className="safety">⚠️ {r.safetyWarning}</p>}
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
      {/* ------------------------------ Status bar ------------------------ */}
      <header className="statusbar" role="banner">
        <h1>VoiceGuide</h1>
        <div className="status-items">
          <span className="badge" title={vg.detection.evidence.join('\n')}>
            🧭 {vg.detection.toolName}
          </span>
          <ConfidenceBadge value={vg.detection.confidence} />
          <span className={`badge ${vg.micOn ? 'on' : 'off'}`}>
            {vg.micOn ? '🎙️ 마이크 켜짐' : '🎙️ 마이크 꺼짐'}
          </span>
          <span className={`badge ${vg.screenshotName ? 'on' : 'off'}`}>
            {vg.screenshotName ? '🖥️ 화면 정보 있음' : '🖥️ 화면 공유 꺼짐'}
          </span>
          <span className="badge">🧩 {MODE_LABELS[vg.mode]?.split(' — ')[0]}</span>
          <span className="badge">🤖 LLM: {vg.serverLLM}</span>
          <span className="badge privacy">
            🔒 {vg.findings.length > 0
              ? `민감정보 ${vg.findings.reduce((s, f) => s + f.count, 0)}건 마스킹됨`
              : '민감정보 감지 없음'}
          </span>
        </div>
      </header>

      <main className="layout">
        {/* ------------------------------ Chat ----------------------------- */}
        <section className="chat" aria-label="대화">
          <div className="messages" aria-live="polite">
            {vg.messages.length === 0 && (
              <div className="empty">
                <p>배우고 싶은 것을 물어보세요. 예:</p>
                <div className="examples">
                  {[
                    '여기서 새 저장소를 만들려면 어떻게 해야 해?',
                    '처음부터 하나씩 알려줘',
                    '지금 화면에서 다음에 뭘 눌러야 해?',
                    '이 오류가 왜 발생한 거야?',
                  ].map((ex) => (
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
            {vg.busy && <div className="msg guide"><p className="msg-text">생각 중…</p></div>}
            {vg.interimText && (
              <div className="msg user interim"><p className="msg-text">{vg.interimText}…</p></div>
            )}
          </div>

          {vg.error && <p className="error" role="alert">{vg.error}</p>}

          {/* --------------------------- Input row -------------------------- */}
          <div className="input-row">
            <button
              type="button"
              className={`mic ${vg.micOn ? 'active' : ''}`}
              onClick={() => (vg.micOn ? vg.stopMic() : vg.startMic())}
              aria-pressed={vg.micOn}
              aria-label={vg.micOn ? '마이크 끄기' : '말하기 시작'}
            >
              {vg.micOn ? '⏹ 듣는 중… (끄기)' : '🎙️ 말하기'}
            </button>
            <form onSubmit={submitText} className="text-form">
              <input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="또는 텍스트로 질문하세요"
                aria-label="질문 입력"
              />
              <button type="submit" disabled={vg.busy || !textInput.trim()}>
                보내기
              </button>
            </form>
          </div>

          <div className="quick-row">
            <button type="button" onClick={() => void vg.ask('완료했어')}>✅ 완료했어</button>
            <button type="button" onClick={() => void vg.ask('못 찾겠어')}>🤔 못 찾겠어</button>
            <button type="button" onClick={() => void vg.ask('다시 설명해줘')}>🔁 다시 설명해줘</button>
            <button type="button" onClick={() => void vg.ask('더 쉽게 말해줘')}>🌱 더 쉽게</button>
            {vg.isSpeaking ? (
              <button type="button" className="danger" onClick={vg.stopSpeaking}>🔇 음성 중단</button>
            ) : (
              <button type="button" onClick={() => void vg.replayLast()}>🔊 다시 듣기</button>
            )}
          </div>
        </section>

        {/* ---------------------------- Side panel --------------------------- */}
        <aside className="side" aria-label="설정 및 컨텍스트">
          <section className="panel">
            <h2>학습할 도구</h2>
            <label className="row">
              <input
                type="checkbox"
                checked={vg.autoDetect}
                onChange={(e) => vg.setAutoDetect(e.target.checked)}
              />
              화면 정보로 자동 감지
            </label>
            {!vg.autoDetect && (
              <select
                value={vg.selectedToolId}
                onChange={(e) => vg.setSelectedToolId(e.target.value)}
                aria-label="도구 직접 선택"
              >
                <option value="">— 도구 선택 —</option>
                {vg.packs.map((p) => (
                  <option key={p.toolId} value={p.toolId}>
                    {p.toolName} (Guide Pack v{p.version})
                  </option>
                ))}
              </select>
            )}
            <p className="hint">
              Guide Pack: {vg.packs.map((p) => p.toolName).join(', ')} · 그 외 도구는
              Generic Guide Mode로 안내합니다. 모든 프로그램을 완벽히 지원하지는 않습니다.
            </p>
            <h2>가이드 모드</h2>
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
            <h2>화면 컨텍스트 (기본 OFF)</h2>
            <label className="row">
              <input
                type="checkbox"
                checked={vg.contextSharingOn}
                onChange={(e) => vg.setContextSharingOn(e.target.checked)}
              />
              수집된 컨텍스트를 AI에 전달
            </label>
            <div className="context-source">
              <h3>브라우저 확장</h3>
              {vg.extensionContext ? (
                <p className="ok">
                  ✅ {vg.extensionContext.title}
                  <br />
                  <small>{vg.extensionContext.url}</small>
                </p>
              ) : (
                <p className="hint">
                  확장 프로그램에서 "VoiceGuide로 보내기"를 누르면 현재 페이지의
                  URL·제목·DOM 요약이 여기 표시됩니다.
                </p>
              )}
            </div>
            <div className="context-source">
              <h3>화면 캡처 / 스크린샷 (동의 필요)</h3>
              <div className="btn-row">
                <button type="button" onClick={() => void vg.captureScreen()}>
                  🖥️ 화면 캡처 허용
                </button>
                <button type="button" onClick={() => fileRef.current?.click()}>
                  📷 스크린샷 업로드
                </button>
                {vg.screenshotName && (
                  <button type="button" className="danger" onClick={vg.stopScreenShare}>
                    즉시 중단/삭제
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
                  alt="공유된 화면 미리보기 (기기 내에만 저장됨)"
                />
              )}
              <p className="hint">
                캡처는 1프레임만 사용하며 즉시 공유가 종료됩니다. Mock Mode에서는
                픽셀 분석 없이 캡처 사실만 컨텍스트에 포함됩니다.
              </p>
            </div>
            <div className="context-source">
              <h3>말로 설명하기</h3>
              <textarea
                value={vg.manualDescription}
                onChange={(e) => vg.setManualDescription(e.target.value)}
                placeholder="예: 지금 관리자 페이지인데 왼쪽에 메뉴가 있고..."
                aria-label="현재 화면 설명"
              />
            </div>
          </section>

          <section className="panel">
            <h2>AI가 보는 정보 (전송 전 미리보기)</h2>
            {vg.redactedPreview ? (
              <>
                {vg.findings.length > 0 && (
                  <p className="privacy-note">
                    🔒 전송 전에 마스킹됨:{' '}
                    {vg.findings.map((f) => `${f.kind}×${f.count}`).join(', ')}
                  </p>
                )}
                <pre className="preview">
                  {JSON.stringify(vg.redactedPreview, null, 2)}
                </pre>
              </>
            ) : (
              <p className="hint">공유 중인 컨텍스트가 없습니다. AI는 화면을 보지 못합니다.</p>
            )}
            <div className="btn-row">
              <button type="button" className="danger" onClick={vg.clearContext}>
                컨텍스트 삭제
              </button>
              <button type="button" className="danger" onClick={vg.clearHistory}>
                대화 기록 삭제
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>음성 설정</h2>
            <label className="row">
              <input
                type="checkbox"
                checked={vg.voiceOutputOn}
                onChange={(e) => vg.setVoiceOutputOn(e.target.checked)}
              />
              음성으로도 답변 듣기
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={vg.handsFree}
                onChange={(e) => vg.setHandsFree(e.target.checked)}
              />
              핸즈프리 모드 (연속 인식)
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
        </aside>
      </main>
    </div>
  );
}
