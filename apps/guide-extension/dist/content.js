"use strict";
(() => {
  // src/content.ts
  var FLAG = "__voiceguideLiveInjected";
  var w = window;
  if (!w[FLAG]) {
    w[FLAG] = true;
    init();
  }
  function init() {
    const INTERACTIVE = [
      "a[href]",
      "button",
      "input:not([type=hidden])",
      "select",
      "textarea",
      "summary",
      "[role=button]",
      "[role=link]",
      "[role=tab]",
      "[role=menuitem]",
      "[role=menuitemcheckbox]",
      "[role=menuitemradio]",
      "[role=option]",
      "[role=checkbox]",
      "[role=radio]",
      "[role=switch]",
      "[role=combobox]",
      "[contenteditable=true]"
    ].join(", ");
    let refMap = /* @__PURE__ */ new Map();
    let lastSignature = null;
    let lastUrl = "";
    let lastTitle = "";
    const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    function labelOf(el) {
      const he = el;
      const aria = clean(he.getAttribute("aria-label"));
      if (aria) return aria;
      const tag = he.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        const id = he.getAttribute("id");
        const forLabel = id ? clean(document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent) : "";
        return forLabel || clean(he.getAttribute("placeholder")) || clean(he.getAttribute("name")) || clean(he.getAttribute("title"));
      }
      const text = clean(he.innerText);
      if (text) return text;
      const img = he.querySelector("img[alt]");
      if (img) return clean(img.getAttribute("alt"));
      return clean(he.getAttribute("title"));
    }
    function roleOf(el) {
      const explicit = el.getAttribute("role");
      if (explicit) return explicit;
      const tag = el.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "input") {
        const t = el.type || "text";
        return ["submit", "button", "image"].includes(t) ? "button" : `input(${t})`;
      }
      if (tag === "textarea") return "input(textarea)";
      if (tag === "select") return "select";
      if (el.getAttribute("contenteditable") === "true") return "input(editor)";
      return tag;
    }
    function posOf(rect) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cy < 0) return "\uC704(\uC2A4\uD06C\uB864 \uD544\uC694)";
      if (cy > vh) return "\uC544\uB798(\uC2A4\uD06C\uB864 \uD544\uC694)";
      const h = cx < vw / 3 ? "\uC88C" : cx > vw * 2 / 3 ? "\uC6B0" : "";
      const v = cy < vh / 3 ? "\uC0C1\uB2E8" : cy > vh * 2 / 3 ? "\uD558\uB2E8" : "";
      if (!h && !v) return "\uC911\uC559";
      if (!h) return v;
      if (!v) return `${h}\uCE21`;
      return `${h}${v}`;
    }
    function stateOf(el) {
      const s = [];
      const he = el;
      if (he.disabled) s.push("\uBE44\uD65C\uC131");
      if (he.checked) s.push("\uCCB4\uD06C\uB428");
      const expanded = el.getAttribute("aria-expanded");
      if (expanded === "true") s.push("\uD3BC\uCCD0\uC9D0");
      else if (expanded === "false") s.push("\uC811\uD798");
      if (el.getAttribute("aria-selected") === "true") s.push("\uC120\uD0DD\uB428");
      if (el.getAttribute("aria-current")) s.push("\uD604\uC7AC \uC704\uCE58");
      if ((he.tagName === "INPUT" || he.tagName === "TEXTAREA") && typeof he.value === "string" && he.value.length > 0) {
        s.push("\uC785\uB825\uAC12 \uC788\uC74C");
      }
      return s;
    }
    function isVisible(el) {
      const he = el;
      const rect = he.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3) return false;
      if (typeof he.checkVisibility === "function") return he.checkVisibility();
      const style = getComputedStyle(he);
      return style.visibility !== "hidden" && style.display !== "none";
    }
    function collectInteractive(root, out, depth) {
      if (depth > 4 || out.length > 800) return;
      for (const el of Array.from(root.querySelectorAll("*"))) {
        if (out.length > 800) break;
        if (el.matches(INTERACTIVE)) out.push(el);
        const sr = el.shadowRoot;
        if (sr) collectInteractive(sr, out, depth + 1);
      }
    }
    function buildSnapshot() {
      refMap = /* @__PURE__ */ new Map();
      const raw = [];
      collectInteractive(document, raw, 0);
      const seen = /* @__PURE__ */ new Set();
      const inView = [];
      const outView = [];
      let counter = 0;
      for (const el of raw) {
        if (!isVisible(el)) continue;
        const label = labelOf(el);
        if (!label) continue;
        const rect = el.getBoundingClientRect();
        const pos = posOf(rect);
        const role = roleOf(el);
        const sig = `${role}|${label}|${pos}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const ref = `e${++counter}`;
        refMap.set(ref, el);
        const state = stateOf(el);
        const item = {
          ref,
          role,
          label,
          pos,
          ...state.length > 0 ? { state } : {}
        };
        const visible = rect.top < window.innerHeight && rect.bottom > 0;
        (visible ? inView : outView).push(item);
      }
      const MAX_IN = 90;
      const MAX_OUT = 30;
      const elements = [...inView.slice(0, MAX_IN), ...outView.slice(0, MAX_OUT)];
      const truncated = inView.length > MAX_IN || outView.length > MAX_OUT;
      const headings = [];
      for (const h of Array.from(document.querySelectorAll("h1, h2, h3"))) {
        if (headings.length >= 12) break;
        if (!isVisible(h)) continue;
        const t = clean(h.innerText);
        if (t && !headings.includes(t)) headings.push(t);
      }
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const scrollPercent = Math.round(window.scrollY / maxScroll * 100);
      return {
        url: location.href,
        title: document.title,
        headings,
        elements,
        scrollPercent: Math.min(100, Math.max(0, scrollPercent)),
        hasMoreBelow: doc.scrollHeight - window.innerHeight - window.scrollY > 200,
        iframes: document.querySelectorAll("iframe").length,
        truncated
      };
    }
    function makeDiff(current) {
      const signature = new Set(current.elements.map((e) => `${e.role}:${e.label}`));
      if (lastSignature === null) {
        lastSignature = signature;
        lastUrl = current.url;
        lastTitle = current.title;
        return null;
      }
      const appeared = [];
      const disappeared = [];
      for (const s of signature) {
        if (!lastSignature.has(s) && appeared.length < 10) appeared.push(s);
      }
      for (const s of lastSignature) {
        if (!signature.has(s) && disappeared.length < 10) disappeared.push(s);
      }
      const diff = {
        urlChanged: current.url !== lastUrl,
        titleChanged: current.title !== lastTitle,
        appeared,
        disappeared
      };
      lastSignature = signature;
      lastUrl = current.url;
      lastTitle = current.title;
      return diff;
    }
    let hlBox = null;
    let hlChip = null;
    let hlTarget = null;
    let hlTimer;
    let hlInterval;
    function clearHighlight() {
      hlBox?.remove();
      hlChip?.remove();
      hlBox = null;
      hlChip = null;
      hlTarget = null;
      if (hlTimer) window.clearTimeout(hlTimer);
      if (hlInterval) window.clearInterval(hlInterval);
    }
    function reposition() {
      if (!hlTarget || !hlBox || !hlChip) return;
      const rect = hlTarget.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        clearHighlight();
        return;
      }
      const pad = 5;
      hlBox.style.left = `${rect.left - pad}px`;
      hlBox.style.top = `${rect.top - pad}px`;
      hlBox.style.width = `${rect.width + pad * 2}px`;
      hlBox.style.height = `${rect.height + pad * 2}px`;
      const chipTop = rect.top - 38;
      hlChip.style.left = `${Math.max(8, rect.left)}px`;
      hlChip.style.top = `${chipTop < 4 ? rect.bottom + 10 : chipTop}px`;
    }
    function highlight(ref) {
      const el = refMap.get(ref);
      if (!el || !el.isConnected) return false;
      clearHighlight();
      hlTarget = el;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      hlBox = document.createElement("div");
      hlBox.style.cssText = [
        "position:fixed",
        "z-index:2147483647",
        "pointer-events:none",
        "border:3px solid #ff5a36",
        "border-radius:10px",
        "box-shadow:0 0 0 4px rgba(255,90,54,.25), 0 0 24px rgba(255,90,54,.45)",
        "transition:all .15s ease",
        "animation:vgpulse 1.2s ease-in-out infinite"
      ].join(";");
      hlChip = document.createElement("div");
      hlChip.textContent = "\u{1F446} \uC5EC\uAE30\uC608\uC694";
      hlChip.style.cssText = [
        "position:fixed",
        "z-index:2147483647",
        "pointer-events:none",
        "background:#ff5a36",
        "color:#fff",
        "font:600 13px/1 sans-serif",
        "padding:7px 10px",
        "border-radius:8px",
        "box-shadow:0 2px 8px rgba(0,0,0,.3)"
      ].join(";");
      if (!document.getElementById("vg-style")) {
        const style = document.createElement("style");
        style.id = "vg-style";
        style.textContent = "@keyframes vgpulse{0%,100%{opacity:1}50%{opacity:.45}}";
        document.documentElement.appendChild(style);
      }
      document.documentElement.appendChild(hlBox);
      document.documentElement.appendChild(hlChip);
      reposition();
      hlInterval = window.setInterval(reposition, 200);
      hlTimer = window.setTimeout(clearHighlight, 15e3);
      return true;
    }
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    window.addEventListener("resize", reposition, { passive: true });
    chrome.runtime.onMessage.addListener(
      (msg, _sender, sendResponse) => {
        try {
          switch (msg?.type) {
            case "vg:ping":
              sendResponse({ ok: true });
              break;
            case "vg:snapshot": {
              const snapshot = buildSnapshot();
              sendResponse({ ok: true, snapshot, diff: makeDiff(snapshot) });
              break;
            }
            case "vg:highlight":
              sendResponse({ ok: highlight(msg.ref) });
              break;
            case "vg:clearHighlight":
              clearHighlight();
              sendResponse({ ok: true });
              break;
            default:
              sendResponse({ ok: false, error: "unknown message" });
          }
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
        return false;
      }
    );
  }
})();
