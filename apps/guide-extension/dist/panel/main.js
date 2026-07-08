"use strict";
(() => {
  // ../../packages/core/src/privacyRedactor.ts
  var RULES = [
    {
      kind: "api-key",
      pattern: /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b/g,
      replacement: "[REDACTED:API_KEY]"
    },
    {
      kind: "api-key",
      pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
      replacement: "Bearer [REDACTED:TOKEN]"
    },
    {
      kind: "password",
      // No \b before the group: word boundaries do not fire next to Hangul.
      pattern: /(password|passwd|pwd|비밀번호|암호)\s*[:=]\s*\S+/gi,
      replacement: "$1: [REDACTED:PASSWORD]"
    },
    {
      kind: "rrn",
      // Korean resident registration number: 6 digits, separator, 7 digits.
      pattern: /\b\d{6}[-\s]?[1-4]\d{6}\b/g,
      replacement: "[REDACTED:RRN]"
    },
    {
      kind: "card",
      pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      replacement: "[REDACTED:CARD]"
    },
    {
      kind: "phone",
      // Korean mobile and landline formats.
      pattern: /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b|\b0\d{1,2}-\d{3,4}-\d{4}\b/g,
      replacement: "[REDACTED:PHONE]"
    },
    {
      kind: "email",
      pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
      replacement: "[REDACTED:EMAIL]"
    }
  ];
  var PrivacyRedactor = class {
    redact(text) {
      let redacted = text;
      const counts = /* @__PURE__ */ new Map();
      for (const rule of RULES) {
        redacted = redacted.replace(rule.pattern, (...args) => {
          counts.set(rule.kind, (counts.get(rule.kind) ?? 0) + 1);
          const match = args[0];
          if (rule.replacement.includes("$1")) {
            const group = args[1] ?? "";
            return rule.replacement.replace("$1", group);
          }
          if (rule.replacement.startsWith("Bearer")) return rule.replacement;
          return rule.replacement.length > 0 ? rule.replacement : match;
        });
      }
      const findings = [...counts.entries()].map(
        ([kind, count]) => ({ kind, count })
      );
      return { redacted, findings };
    }
    /** Redacts every text field of a ScreenContext, returning a safe copy. */
    redactContext(context) {
      const all = [];
      const merge = (r) => {
        for (const f of r.findings) {
          const existing = all.find((x) => x.kind === f.kind);
          if (existing) existing.count += f.count;
          else all.push({ ...f });
        }
        return r.redacted;
      };
      const safe = {
        ...context,
        activeWindowTitle: context.activeWindowTitle ? merge(this.redact(context.activeWindowTitle)) : void 0,
        screenshotDescription: context.screenshotDescription ? merge(this.redact(context.screenshotDescription)) : void 0,
        browser: context.browser ? {
          url: context.browser.url ? merge(this.redact(context.browser.url)) : void 0,
          title: context.browser.title ? merge(this.redact(context.browser.title)) : void 0,
          domSummary: context.browser.domSummary ? {
            headings: context.browser.domSummary.headings.map(
              (t) => merge(this.redact(t))
            ),
            buttons: context.browser.domSummary.buttons.map(
              (t) => merge(this.redact(t))
            ),
            links: context.browser.domSummary.links.map(
              (t) => merge(this.redact(t))
            ),
            inputs: context.browser.domSummary.inputs.map(
              (t) => merge(this.redact(t))
            ),
            landmarks: context.browser.domSummary.landmarks.map(
              (t) => merge(this.redact(t))
            )
          } : void 0
        } : void 0
      };
      return { context: safe, findings: all };
    }
  };

  // src/panel/llm.ts
  var MODELS = [
    { id: "claude-sonnet-5", label: "Sonnet (\uAD8C\uC7A5 \u2014 \uD488\uC9C8/\uC18D\uB3C4 \uADE0\uD615)" },
    { id: "claude-haiku-4-5-20251001", label: "Haiku (\uBE60\uB974\uACE0 \uC800\uB834)" },
    { id: "claude-opus-4-8", label: "Opus (\uCD5C\uACE0 \uD488\uC9C8, \uB290\uB9BC/\uBE44\uC308)" }
  ];
  var redactor = new PrivacyRedactor();
  var SYSTEM_PROMPT = `\uB2F9\uC2E0\uC740 VoiceGuide \u2014 \uC0AC\uC6A9\uC790\uAC00 \uC9C0\uAE08 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uBCF4\uACE0 \uC788\uB294 \uC6F9\uD398\uC774\uC9C0\uC758 \uC0AC\uC6A9\uBC95\uC744 \uC74C\uC131\uC73C\uB85C \uC548\uB0B4\uD558\uB294 \uD55C\uAD6D\uC5B4 \uAC00\uC774\uB4DC\uC785\uB2C8\uB2E4.

\uB9E4 \uD134\uB9C8\uB2E4 \uC0AC\uC6A9\uC790\uC758 \uB9D0\uACFC \uD568\uAED8 \uD604\uC7AC \uD398\uC774\uC9C0\uC758 \uB77C\uC774\uBE0C \uC2A4\uB0C5\uC0F7(URL, \uC81C\uBAA9, \uD654\uBA74 \uC694\uC18C \uBAA9\uB85D)\uC774 \uC8FC\uC5B4\uC9D1\uB2C8\uB2E4.
\uC694\uC18C\uB294 "[e12] button "\uC800\uC7A5" (\uC6B0\uC0C1\uB2E8)" \uD615\uC2DD\uC774\uBA70, ref(e12)\uB85C \uC9C0\uCE6D\uD569\uB2C8\uB2E4.
"\uC9C1\uC804 \uB300\uBE44 \uBCC0\uD654" \uC815\uBCF4\uAC00 \uC788\uC73C\uBA74 \uC0AC\uC6A9\uC790\uC758 \uC774\uC804 \uD589\uB3D9\uC774 \uC131\uACF5\uD588\uB294\uC9C0 \uD310\uB2E8\uD558\uB294 \uADFC\uAC70\uB85C \uC0AC\uC6A9\uD558\uC138\uC694.

\uADDC\uCE59:
1. \uD55C \uBC88\uC5D0 \uB531 \uD55C \uB2E8\uACC4\uB9CC \uC548\uB0B4\uD569\uB2C8\uB2E4. \uC5EC\uB7EC \uB2E8\uACC4\uB97C \uB098\uC5F4\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.
2. \uC2A4\uB0C5\uC0F7\uC5D0 \uC2E4\uC81C\uB85C \uC874\uC7AC\uD558\uB294 \uC694\uC18C\uB9CC \uC9C0\uBAA9\uD569\uB2C8\uB2E4. \uCD94\uCE21\uC740 \uAE08\uC9C0\uC785\uB2C8\uB2E4.
   \uD544\uC694\uD55C \uC694\uC18C\uAC00 \uBAA9\uB85D\uC5D0 \uC5C6\uC73C\uBA74 \uC194\uC9C1\uD788 \uC5C6\uB2E4\uACE0 \uB9D0\uD558\uACE0 \u2014 \uC2A4\uD06C\uB864\uC774\uB098 \uBA54\uB274 \uC5F4\uAE30\uB97C \uC548\uB0B4\uD558\uAC70\uB098, need_screenshot\uC744 true\uB85C \uC124\uC815\uD574 \uD654\uBA74 \uCEA1\uCC98\uB97C \uC694\uCCAD\uD558\uC138\uC694.
3. speak\uB294 TTS\uB85C \uC77D\uD790 \uBB38\uC7A5\uC785\uB2C8\uB2E4. \uC9E7\uACE0 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uAD6C\uC5B4\uCCB4 \uD55C\uAD6D\uC5B4 1~3\uBB38\uC7A5, \uB9C8\uD06C\uB2E4\uC6B4\xB7\uD2B9\uC218\uAE30\uD638\xB7\uC601\uC5B4 \uC57D\uC5B4 \uB0A8\uBC1C \uAE08\uC9C0.
4. \uC0AC\uC6A9\uC790\uAC00 "\uC644\uB8CC\uD588\uC5B4"\uB77C\uACE0 \uD558\uBA74 \uBCC0\uD654 \uC815\uBCF4\uC640 \uC0C8 \uC2A4\uB0C5\uC0F7\uC73C\uB85C \uC2E4\uC81C \uC131\uACF5 \uC5EC\uBD80\uB97C \uD655\uC778\uD55C \uB4A4 \uB2E4\uC74C \uB2E8\uACC4\uB85C \uB118\uC5B4\uAC00\uC138\uC694. \uD654\uBA74\uC774 \uC548 \uBC14\uB00C\uC5C8\uC73C\uBA74 \uC194\uC9C1\uD788 \uB9D0\uD558\uC138\uC694.
5. \uC0AD\uC81C\xB7\uACB0\uC81C\xB7\uC804\uC1A1\xB7\uAC8C\uC2DC\uCC98\uB7FC \uB418\uB3CC\uB9AC\uAE30 \uC5B4\uB824\uC6B4 \uD589\uB3D9\uC740 warning\uC5D0 \uACBD\uACE0\uB97C \uC801\uC73C\uC138\uC694. \uB2F9\uC2E0\uC740 \uC124\uBA85\uB9CC \uD558\uACE0 \uC808\uB300 \uB300\uC2E0 \uC2E4\uD589\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.
6. \uC0AC\uC6A9\uC790\uAC00 "\uB354 \uC27D\uAC8C"\uB77C\uACE0 \uD558\uBA74 \uAC19\uC740 \uB2E8\uACC4\uB97C \uB354 \uC26C\uC6B4 \uB9D0\uB85C, "\uBABB \uCC3E\uACA0\uC5B4"\uB77C\uACE0 \uD558\uBA74 \uC704\uCE58 \uBB18\uC0AC\uB97C \uB354 \uAD6C\uCCB4\uC801\uC73C\uB85C + \uB300\uC548 \uACBD\uB85C\uB97C \uC81C\uC2DC\uD558\uC138\uC694.

\uBC18\uB4DC\uC2DC \uC544\uB798 JSON \uD615\uC2DD\uC73C\uB85C\uB9CC \uC751\uB2F5\uD558\uC138\uC694 (\uCF54\uB4DC\uD39C\uC2A4 \uC5C6\uC774):
{"speak":"\uC74C\uC131\uC73C\uB85C \uC77D\uC744 \uBB38\uC7A5","detail":"\uD654\uBA74\uC5D0\uB9CC \uD45C\uC2DC\uD560 \uBD80\uAC00 \uC124\uBA85 \uB610\uB294 null","target_ref":"\uC9C0\uBAA9\uD560 \uC694\uC18C ref \uB610\uB294 null","success_check":"\uC774 \uB2E8\uACC4\uAC00 \uC131\uACF5\uD558\uBA74 \uBCF4\uC77C \uAC83 \uB610\uB294 null","warning":"\uACBD\uACE0 \uB610\uB294 null","need_screenshot":false}`;
  function serializeSnapshot(snap, diff) {
    const lines = [];
    lines.push(`URL: ${snap.url}`);
    lines.push(`\uC81C\uBAA9: ${snap.title}`);
    lines.push(
      `\uC2A4\uD06C\uB864: ${snap.scrollPercent}%${snap.hasMoreBelow ? " (\uC544\uB798\uC5D0 \uB354 \uC788\uC74C)" : ""}`
    );
    if (snap.headings.length > 0) lines.push(`\uC81C\uBAA9 \uC694\uC18C: ${snap.headings.join(" | ")}`);
    if (snap.iframes > 0)
      lines.push(`iframe ${snap.iframes}\uAC1C \u2014 \uB0B4\uBD80 \uB0B4\uC6A9\uC740 \uC774 \uBAA9\uB85D\uC5D0 \uC5C6\uC74C`);
    if (diff && (diff.urlChanged || diff.appeared.length || diff.disappeared.length)) {
      lines.push("--- \uC9C1\uC804 \uB300\uBE44 \uBCC0\uD654 ---");
      if (diff.urlChanged) lines.push("\xB7 URL\uC774 \uBC14\uB01C");
      if (diff.titleChanged) lines.push("\xB7 \uD398\uC774\uC9C0 \uC81C\uBAA9\uC774 \uBC14\uB01C");
      if (diff.appeared.length) lines.push(`\xB7 \uC0C8\uB85C \uB098\uD0C0\uB0A8: ${diff.appeared.join(", ")}`);
      if (diff.disappeared.length) lines.push(`\xB7 \uC0AC\uB77C\uC9D0: ${diff.disappeared.join(", ")}`);
    }
    lines.push("--- \uD654\uBA74 \uC694\uC18C ---");
    for (const e of snap.elements) {
      const state = e.state?.length ? ` [${e.state.join(", ")}]` : "";
      lines.push(`[${e.ref}] ${e.role} "${e.label}" (${e.pos})${state}`);
    }
    if (snap.truncated) lines.push("(\uC694\uC18C\uAC00 \uB9CE\uC544 \uC77C\uBD80 \uC0DD\uB7B5\uB428)");
    return lines.join("\n");
  }
  var SNAPSHOT_MARKER = "\n[\uD604\uC7AC \uD654\uBA74 \uC2A4\uB0C5\uC0F7]\n";
  function buildUserText(utterance, snapshotText) {
    return `[\uC0AC\uC6A9\uC790] ${utterance}${SNAPSHOT_MARKER}${snapshotText}`;
  }
  function stripOldSnapshots(history2) {
    const lastUserIdx = history2.map((h) => h.role).lastIndexOf("user");
    return history2.map((h, i) => {
      if (h.role !== "user" || i === lastUserIdx) return h;
      const cut = h.text.indexOf(SNAPSHOT_MARKER);
      return {
        role: h.role,
        text: cut === -1 ? h.text : h.text.slice(0, cut)
      };
    });
  }
  async function callGuide(apiKey, model, history2) {
    const trimmed = stripOldSnapshots(history2.slice(-16));
    const allFindings = [];
    const messages = trimmed.map((h) => {
      const { redacted, findings } = redactor.redact(h.text);
      allFindings.push(...findings);
      const content = [{ type: "text", text: redacted }];
      if (h.imageBase64) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: "image/jpeg", data: h.imageBase64 }
        });
      }
      return { role: h.role, content };
    });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages
      })
    });
    if (!res.ok) {
      const status = res.status;
      let detail = "";
      try {
        const body2 = await res.json();
        detail = body2.error?.message ?? "";
      } catch {
      }
      if (status === 401) throw new Error("API \uD0A4\uAC00 \uC798\uBABB\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC124\uC815\uC5D0\uC11C \uD655\uC778\uD574\uC8FC\uC138\uC694.");
      if (status === 429) throw new Error("\uC694\uCCAD \uD55C\uB3C4 \uCD08\uACFC\uC785\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");
      if (status === 529) throw new Error("Anthropic \uC11C\uBC84\uAC00 \uD63C\uC7A1\uD569\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.");
      throw new Error(`API \uC624\uB958 (${status}) ${detail}`.trim());
    }
    const body = await res.json();
    const raw = body.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
    return { raw, turn: parseTurn(raw), findings: allFindings };
  }
  function parseTurn(raw) {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence?.[1]) text = fence[1].trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (typeof parsed.speak === "string" && parsed.speak.trim()) {
          return {
            speak: parsed.speak.trim(),
            detail: parsed.detail ?? null,
            target_ref: parsed.target_ref ?? null,
            success_check: parsed.success_check ?? null,
            warning: parsed.warning ?? null,
            need_screenshot: parsed.need_screenshot === true
          };
        }
      } catch {
      }
    }
    return { speak: raw.trim() || "\uC751\uB2F5\uC744 \uC774\uD574\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uB9D0\uC500\uD574\uC8FC\uC138\uC694." };
  }

  // src/panel/voice.ts
  var ERROR_MESSAGES = {
    "not-allowed": "\uB9C8\uC774\uD06C \uAD8C\uD55C\uC774 \uAC70\uBD80\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC8FC\uC18C\uCC3D\uC758 \uC0AC\uC774\uD2B8 \uC124\uC815\uC5D0\uC11C \uB9C8\uC774\uD06C\uB97C \uD5C8\uC6A9\uD574\uC8FC\uC138\uC694.",
    "no-speech": "\uC74C\uC131\uC774 \uAC10\uC9C0\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.",
    "audio-capture": "\uB9C8\uC774\uD06C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC5F0\uACB0 \uC0C1\uD0DC\uB97C \uD655\uC778\uD574\uC8FC\uC138\uC694.",
    network: "\uC74C\uC131 \uC778\uC2DD \uB124\uD2B8\uC6CC\uD06C \uC624\uB958\uC785\uB2C8\uB2E4. \uC778\uD130\uB137 \uC5F0\uACB0\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.",
    aborted: ""
  };
  var PushToTalk = class {
    rec = null;
    listening = false;
    static isSupported() {
      return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
    }
    start(onInterim, onFinal, onError, onEnd) {
      const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!Ctor) {
        onError("\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 \uC74C\uC131 \uC778\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uD14D\uC2A4\uD2B8\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
        return;
      }
      this.stop();
      const rec = new Ctor();
      rec.lang = "ko-KR";
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r) continue;
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (interim) onInterim(interim);
        if (final.trim()) onFinal(final.trim());
      };
      rec.onerror = (e) => {
        const msg = ERROR_MESSAGES[e.error];
        if (msg !== "") onError(msg ?? `\uC74C\uC131 \uC778\uC2DD \uC624\uB958: ${e.error}`);
      };
      rec.onend = () => {
        this.listening = false;
        this.rec = null;
        onEnd();
      };
      this.rec = rec;
      this.listening = true;
      rec.start();
    }
    stop() {
      this.rec?.stop();
      this.rec = null;
      this.listening = false;
    }
  };
  var Speaker = class {
    speaking = false;
    onStateChange;
    constructor(onStateChange) {
      this.onStateChange = onStateChange;
    }
    speak(text, rate) {
      this.stop();
      this.speaking = true;
      this.onStateChange(true);
      chrome.tts.speak(text, {
        lang: "ko-KR",
        rate,
        enqueue: false,
        onEvent: (event) => {
          if (["end", "interrupted", "cancelled", "error"].includes(event.type)) {
            this.speaking = false;
            this.onStateChange(false);
          }
        }
      });
    }
    stop() {
      chrome.tts.stop();
      if (this.speaking) {
        this.speaking = false;
        this.onStateChange(false);
      }
    }
  };
  async function ensureMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  // src/panel/main.ts
  var $ = (id) => document.getElementById(id);
  var chatEl = $("chat");
  var emptyEl = $("empty-state");
  var errorEl = $("error");
  var privacyEl = $("privacy");
  var tabTitleEl = $("tab-title");
  var tabDotEl = $("tab-dot");
  var settingsEl = $("settings");
  var keyInput = $("set-key");
  var modelSelect = $("set-model");
  var ttsCheck = $("set-tts");
  var rateInput = $("set-rate");
  var rateVal = $("set-rate-val");
  var textInput = $("text-input");
  var pttBtn = $("ptt");
  var sendBtn = $("btn-send");
  var shotBtn = $("btn-shot");
  var replayBtn = $("btn-replay");
  var stopTtsBtn = $("btn-stop-tts");
  var settings = {
    apiKey: "",
    model: MODELS[0].id,
    ttsOn: true,
    rate: 1
  };
  var history = [];
  var busy = false;
  var guidedTabId = null;
  var lastSpoken = "";
  var includeShotNext = false;
  var interimEl = null;
  var ptt = new PushToTalk();
  var speaker = new Speaker((speaking) => {
    stopTtsBtn.classList.toggle("hidden", !speaking);
    replayBtn.classList.toggle("hidden", speaking);
  });
  for (const m of MODELS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  }
  async function loadSettings() {
    const stored = await chrome.storage.local.get("settings");
    if (stored["settings"]) settings = { ...settings, ...stored["settings"] };
    keyInput.value = settings.apiKey;
    modelSelect.value = settings.model;
    ttsCheck.checked = settings.ttsOn;
    rateInput.value = String(settings.rate);
    rateVal.textContent = `${settings.rate.toFixed(1)}x`;
    settingsEl.classList.toggle("hidden", Boolean(settings.apiKey));
  }
  $("set-save").addEventListener("click", () => {
    settings = {
      apiKey: keyInput.value.trim(),
      model: modelSelect.value,
      ttsOn: ttsCheck.checked,
      rate: Number(rateInput.value)
    };
    void chrome.storage.local.set({ settings });
    settingsEl.classList.add("hidden");
    if (!settings.apiKey) showError("API \uD0A4\uAC00 \uC5C6\uC73C\uBA74 \uAC00\uC774\uB4DC\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    else clearError();
  });
  $("btn-settings").addEventListener(
    "click",
    () => settingsEl.classList.toggle("hidden")
  );
  rateInput.addEventListener("input", () => {
    rateVal.textContent = `${Number(rateInput.value).toFixed(1)}x`;
  });
  function isGuidablUrl(url) {
    return Boolean(url && /^https?:/.test(url));
  }
  async function refreshTabInfo() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;
    guidedTabId = tab.id;
    tabTitleEl.textContent = tab.title ?? "(\uC81C\uBAA9 \uC5C6\uC74C)";
    tabTitleEl.title = tab.url ?? "";
    const ok = isGuidablUrl(tab.url);
    tabDotEl.className = `dot ${ok ? "ok" : "bad"}`;
    return tab;
  }
  chrome.tabs.onActivated.addListener(() => void refreshTabInfo());
  chrome.tabs.onUpdated.addListener((_id, info) => {
    if (info.title || info.url || info.status === "complete") void refreshTabInfo();
  });
  async function sendToContent(tabId, msg) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["dist/content.js"]
      });
      return await chrome.tabs.sendMessage(tabId, msg);
    }
  }
  async function captureShot(windowId) {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 60
    });
    return shrinkImage(dataUrl, 1200);
  }
  async function shrinkImage(dataUrl, maxW) {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("\uC774\uBBF8\uC9C0 \uB85C\uB4DC \uC2E4\uD328"));
      img.src = dataUrl;
    });
    let out = dataUrl;
    if (img.width > maxW) {
      const canvas = document.createElement("canvas");
      canvas.width = maxW;
      canvas.height = Math.round(img.height / img.width * maxW);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      out = canvas.toDataURL("image/jpeg", 0.7);
    }
    return out.replace(/^data:image\/jpeg;base64,/, "");
  }
  function scrollChat() {
    chatEl.scrollTop = chatEl.scrollHeight;
  }
  function addUserMsg(text) {
    emptyEl.classList.add("hidden");
    const div = document.createElement("div");
    div.className = "msg user";
    div.textContent = text;
    chatEl.appendChild(div);
    scrollChat();
  }
  function addGuideMsg(turn) {
    const div = document.createElement("div");
    div.className = "msg guide";
    const speak = document.createElement("p");
    speak.className = "speak";
    speak.textContent = turn.speak;
    speak.style.margin = "0";
    div.appendChild(speak);
    if (turn.detail) {
      const d = document.createElement("p");
      d.className = "detail";
      d.textContent = turn.detail;
      d.style.margin = "6px 0 0";
      div.appendChild(d);
    }
    if (turn.success_check) {
      const s = document.createElement("p");
      s.className = "success";
      s.textContent = `\u2705 \uC131\uACF5\uD558\uBA74: ${turn.success_check}`;
      s.style.margin = "6px 0 0";
      div.appendChild(s);
    }
    if (turn.warning) {
      const wd = document.createElement("div");
      wd.className = "warning";
      wd.textContent = `\u26A0\uFE0F ${turn.warning}`;
      div.appendChild(wd);
    }
    if (turn.target_ref) {
      const btn = document.createElement("button");
      btn.className = "target-btn";
      btn.textContent = "\u{1F4CD} \uD654\uBA74\uC5D0\uC11C \uB2E4\uC2DC \uAC00\uB9AC\uD0A4\uAE30";
      btn.addEventListener("click", () => {
        if (guidedTabId !== null && turn.target_ref) {
          void sendToContent(guidedTabId, {
            type: "vg:highlight",
            ref: turn.target_ref
          });
        }
      });
      div.appendChild(btn);
    }
    if (turn.need_screenshot) {
      const badges = document.createElement("div");
      badges.className = "badge-row";
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = "\u{1F4F7} \uD654\uBA74 \uCEA1\uCC98\uAC00 \uC788\uC73C\uBA74 \uB354 \uC815\uD655\uD788 \uC548\uB0B4\uD560 \uC218 \uC788\uC5B4\uC694 \u2014 \uCE74\uBA54\uB77C \uBC84\uD2BC\uC744 \uB20C\uB7EC\uC8FC\uC138\uC694";
      badges.appendChild(b);
      div.appendChild(badges);
    }
    chatEl.appendChild(div);
    scrollChat();
  }
  function addThinking() {
    const div = document.createElement("div");
    div.className = "msg guide thinking";
    div.textContent = "\uD654\uBA74\uC744 \uC77D\uACE0 \uC0DD\uAC01\uD558\uB294 \uC911\u2026";
    chatEl.appendChild(div);
    scrollChat();
    return div;
  }
  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  }
  function clearError() {
    errorEl.classList.add("hidden");
  }
  async function ask(utterance) {
    const text = utterance.trim();
    if (!text || busy) return;
    if (!settings.apiKey) {
      settingsEl.classList.remove("hidden");
      showError("\uBA3C\uC800 Anthropic API \uD0A4\uB97C \uC124\uC815\uD574\uC8FC\uC138\uC694.");
      return;
    }
    clearError();
    speaker.stop();
    busy = true;
    sendBtn.disabled = true;
    addUserMsg(text);
    const thinking = addThinking();
    try {
      const tab = await refreshTabInfo();
      if (!tab?.id || !isGuidablUrl(tab.url)) {
        thinking.remove();
        addGuideMsg({
          speak: "\uC774 \uD398\uC774\uC9C0\uB294 \uC548\uB0B4\uD560 \uC218 \uC5C6\uC5B4\uC694. \uD06C\uB86C \uC124\uC815 \uD398\uC774\uC9C0\uB098 \uC6F9\uC2A4\uD1A0\uC5B4\uAC00 \uC544\uB2CC \uC77C\uBC18 \uC6F9\uC0AC\uC774\uD2B8 \uD0ED\uC744 \uC5F4\uC5B4\uC8FC\uC138\uC694."
        });
        return;
      }
      const snapRes = await sendToContent(tab.id, { type: "vg:snapshot" });
      if (!snapRes.ok || !snapRes.snapshot) {
        throw new Error(snapRes.error ?? "\uD398\uC774\uC9C0 \uC815\uBCF4\uB97C \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      }
      const snapshotText = serializeSnapshot(snapRes.snapshot, snapRes.diff ?? null);
      let imageBase64;
      if (includeShotNext) {
        try {
          imageBase64 = await captureShot(tab.windowId);
        } catch {
        }
        includeShotNext = false;
        shotBtn.classList.remove("armed");
      }
      const entry = {
        role: "user",
        text: buildUserText(text, snapshotText),
        ...imageBase64 ? { imageBase64 } : {}
      };
      history.push(entry);
      const result = await callGuide(settings.apiKey, settings.model, history);
      history.push({ role: "assistant", text: result.raw });
      thinking.remove();
      addGuideMsg(result.turn);
      if (result.findings.length > 0) {
        privacyEl.textContent = `\u{1F512} \uC804\uC1A1 \uC804 \uB9C8\uC2A4\uD0B9\uB428: ${result.findings.map((f) => `${f.kind}\xD7${f.count}`).join(", ")}`;
        privacyEl.classList.remove("hidden");
      } else {
        privacyEl.classList.add("hidden");
      }
      if (result.turn.target_ref) {
        void sendToContent(tab.id, {
          type: "vg:highlight",
          ref: result.turn.target_ref
        });
      }
      lastSpoken = result.turn.speak;
      if (settings.ttsOn) speaker.speak(result.turn.speak, settings.rate);
    } catch (err) {
      thinking.remove();
      showError(err.message);
      if (history[history.length - 1]?.role === "user") history.pop();
    } finally {
      busy = false;
      sendBtn.disabled = false;
    }
  }
  sendBtn.addEventListener("click", () => {
    void ask(textInput.value);
    textInput.value = "";
  });
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      void ask(textInput.value);
      textInput.value = "";
    }
  });
  for (const btn of Array.from(document.querySelectorAll("[data-say]"))) {
    btn.addEventListener("click", () => void ask(btn.dataset["say"] ?? ""));
  }
  for (const btn of Array.from(document.querySelectorAll(".example"))) {
    btn.addEventListener("click", () => void ask(btn.textContent ?? ""));
  }
  shotBtn.addEventListener("click", () => {
    includeShotNext = !includeShotNext;
    shotBtn.classList.toggle("armed", includeShotNext);
    if (includeShotNext) {
      showError(
        "\u{1F4F7} \uB2E4\uC74C \uC9C8\uBB38\uC5D0 \uD654\uBA74 \uC2A4\uD06C\uB9B0\uC0F7\uC774 \uD3EC\uD568\uB429\uB2C8\uB2E4. \uC2A4\uD06C\uB9B0\uC0F7\uC740 \uB9C8\uC2A4\uD0B9\uB418\uC9C0 \uC54A\uC73C\uB2C8 \uBBFC\uAC10\uD55C \uD654\uBA74\uC774\uBA74 \uCDE8\uC18C\uD558\uC138\uC694."
      );
    } else {
      clearError();
    }
  });
  replayBtn.addEventListener("click", () => {
    if (lastSpoken) speaker.speak(lastSpoken, settings.rate);
  });
  stopTtsBtn.addEventListener("click", () => speaker.stop());
  $("btn-new").addEventListener("click", () => {
    history = [];
    chatEl.querySelectorAll(".msg").forEach((m) => m.remove());
    emptyEl.classList.remove("hidden");
    privacyEl.classList.add("hidden");
    clearError();
    speaker.stop();
    if (guidedTabId !== null) {
      void sendToContent(guidedTabId, { type: "vg:clearHighlight" }).catch(() => void 0);
    }
  });
  function setPttUi(listening) {
    pttBtn.classList.toggle("listening", listening);
    pttBtn.textContent = listening ? "\u23F9" : "\u{1F399}\uFE0F";
  }
  pttBtn.addEventListener("click", () => {
    if (ptt.listening) {
      ptt.stop();
      setPttUi(false);
      interimEl?.remove();
      interimEl = null;
      return;
    }
    speaker.stop();
    void ensureMicPermission().then((granted) => {
      if (!granted) {
        showError(
          "\uB9C8\uC774\uD06C \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. \uBE0C\uB77C\uC6B0\uC800 \uC8FC\uC18C\uCC3D \uC67C\uCABD \uC544\uC774\uCF58\uC5D0\uC11C \uC774 \uD655\uC7A5\uC758 \uB9C8\uC774\uD06C\uB97C \uD5C8\uC6A9\uD574\uC8FC\uC138\uC694."
        );
        return;
      }
      if (!PushToTalk.isSupported()) {
        showError("\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 \uC74C\uC131 \uC778\uC2DD\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uD14D\uC2A4\uD2B8\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694.");
        return;
      }
      setPttUi(true);
      ptt.start(
        (interim) => {
          if (!interimEl) {
            interimEl = document.createElement("div");
            interimEl.className = "msg user interim";
            chatEl.appendChild(interimEl);
          }
          interimEl.textContent = `${interim}\u2026`;
          scrollChat();
        },
        (final) => {
          interimEl?.remove();
          interimEl = null;
          void ask(final);
        },
        (message) => {
          if (message) showError(message);
        },
        () => {
          setPttUi(false);
          interimEl?.remove();
          interimEl = null;
        }
      );
    });
  });
  void loadSettings();
  void refreshTabInfo();
})();
