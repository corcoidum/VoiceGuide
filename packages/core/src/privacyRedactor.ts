import type {
  RedactionFinding,
  RedactionResult,
  ScreenContext,
  SensitiveKind,
} from './types.js';

interface Rule {
  kind: SensitiveKind;
  pattern: RegExp;
  replacement: string;
}

/**
 * Order matters: longer / more specific patterns run first so that, for
 * example, a resident registration number is not partially matched as a
 * phone number.
 */
const RULES: Rule[] = [
  {
    kind: 'api-key',
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\b/g,
    replacement: '[REDACTED:API_KEY]',
  },
  {
    kind: 'api-key',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g,
    replacement: 'Bearer [REDACTED:TOKEN]',
  },
  {
    kind: 'password',
    // No \b before the group: word boundaries do not fire next to Hangul.
    pattern: /(password|passwd|pwd|비밀번호|암호)\s*[:=]\s*\S+/gi,
    replacement: '$1: [REDACTED:PASSWORD]',
  },
  {
    kind: 'rrn',
    // Korean resident registration number: 6 digits, separator, 7 digits.
    pattern: /\b\d{6}[-\s]?[1-4]\d{6}\b/g,
    replacement: '[REDACTED:RRN]',
  },
  {
    kind: 'card',
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    replacement: '[REDACTED:CARD]',
  },
  {
    kind: 'phone',
    // Korean mobile and landline formats.
    pattern: /\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b|\b0\d{1,2}-\d{3,4}-\d{4}\b/g,
    replacement: '[REDACTED:PHONE]',
  },
  {
    kind: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED:EMAIL]',
  },
];

/**
 * Masks sensitive data before any text leaves the device toward an AI
 * model, a server, or a log.
 */
export class PrivacyRedactor {
  redact(text: string): RedactionResult {
    let redacted = text;
    const counts = new Map<SensitiveKind, number>();

    for (const rule of RULES) {
      redacted = redacted.replace(rule.pattern, (...args) => {
        counts.set(rule.kind, (counts.get(rule.kind) ?? 0) + 1);
        // Support the one rule that keeps its capture group prefix.
        const match = args[0] as string;
        if (rule.replacement.includes('$1')) {
          const group = (args[1] as string | undefined) ?? '';
          return rule.replacement.replace('$1', group);
        }
        if (rule.replacement.startsWith('Bearer')) return rule.replacement;
        return rule.replacement.length > 0 ? rule.replacement : match;
      });
    }

    const findings: RedactionFinding[] = [...counts.entries()].map(
      ([kind, count]) => ({ kind, count }),
    );
    return { redacted, findings };
  }

  /** Redacts every text field of a ScreenContext, returning a safe copy. */
  redactContext(context: ScreenContext): {
    context: ScreenContext;
    findings: RedactionFinding[];
  } {
    const all: RedactionFinding[] = [];
    const merge = (r: RedactionResult): string => {
      for (const f of r.findings) {
        const existing = all.find((x) => x.kind === f.kind);
        if (existing) existing.count += f.count;
        else all.push({ ...f });
      }
      return r.redacted;
    };

    const safe: ScreenContext = {
      ...context,
      activeWindowTitle: context.activeWindowTitle
        ? merge(this.redact(context.activeWindowTitle))
        : undefined,
      screenshotDescription: context.screenshotDescription
        ? merge(this.redact(context.screenshotDescription))
        : undefined,
      browser: context.browser
        ? {
            url: context.browser.url
              ? merge(this.redact(context.browser.url))
              : undefined,
            title: context.browser.title
              ? merge(this.redact(context.browser.title))
              : undefined,
            domSummary: context.browser.domSummary
              ? {
                  headings: context.browser.domSummary.headings.map((t) =>
                    merge(this.redact(t)),
                  ),
                  buttons: context.browser.domSummary.buttons.map((t) =>
                    merge(this.redact(t)),
                  ),
                  links: context.browser.domSummary.links.map((t) =>
                    merge(this.redact(t)),
                  ),
                  inputs: context.browser.domSummary.inputs.map((t) =>
                    merge(this.redact(t)),
                  ),
                  landmarks: context.browser.domSummary.landmarks.map((t) =>
                    merge(this.redact(t)),
                  ),
                }
              : undefined,
          }
        : undefined,
    };

    return { context: safe, findings: all };
  }
}
