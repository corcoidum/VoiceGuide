/** Shared domain types for every VoiceGuide platform. */

export type Platform =
  | 'web'
  | 'browser-extension'
  | 'windows'
  | 'macos'
  | 'linux'
  | 'android'
  | 'ios';

export type GuideMode =
  | 'ask'
  | 'tutorial'
  | 'coach'
  | 'troubleshooting'
  | 'explore';

/** Classified meaning of a user utterance. */
export type Intent =
  | 'ask_how'
  | 'done'
  | 'not_found'
  | 'repeat'
  | 'simplify'
  | 'error_help'
  | 'start_tutorial'
  | 'explore'
  | 'verify'
  | 'unknown';

/** Compact, privacy-reviewed summary of the page DOM. */
export interface DomSummary {
  headings: string[];
  buttons: string[];
  links: string[];
  inputs: string[];
  landmarks: string[];
}

export interface BrowserContext {
  url?: string;
  title?: string;
  domSummary?: DomSummary;
}

export type ContextSource =
  | 'browser-extension'
  | 'manual'
  | 'screenshot'
  | 'active-window';

/**
 * Everything the AI is allowed to see about the user's screen.
 * Must pass through PrivacyRedactor before leaving the device.
 */
export interface ScreenContext {
  source: ContextSource;
  browser?: BrowserContext;
  activeWindowTitle?: string;
  screenshotProvided?: boolean;
  /** User-visible note about what a screenshot contains (never raw pixels in logs). */
  screenshotDescription?: string;
  capturedAt: string;
}

export interface ToolDetection {
  toolId: string | null;
  toolName: string;
  /** 0..1 */
  confidence: number;
  /** Human-readable reasons for the detection. */
  evidence: string[];
}

/** One actionable step. Never more than one step is given at a time. */
export interface GuideStep {
  situation: string;
  action: string;
  uiHint: string;
  successCheck: string;
  fallback: string;
  confirmQuestion: string;
}

export interface GuideResponse {
  mode: GuideMode;
  /** toolId of the Guide Pack used, or null when Generic Guide Mode answered. */
  usedGuidePack: string | null;
  step?: GuideStep;
  /** Full message to show and speak. */
  message: string;
  /** 0..1 — how sure the guide is about the current screen state. */
  confidence: number;
  evidence: string[];
  needsUserConfirmation: boolean;
  safetyWarning?: string;
  /** True when the guide could not verify the UI and asks the user instead of guessing. */
  askedForClarification?: boolean;
  /** True when the message uses the simplified ("더 쉽게") rendering. */
  simplified?: boolean;
}

export interface ConversationTurn {
  role: 'user' | 'guide';
  text: string;
  at: string;
}

/* ----------------------------- Guide Packs ----------------------------- */

export interface GuidePackTaskStep {
  id: string;
  instruction: string;
  uiHint: string;
  successCheck: string;
  fallback: string;
}

export interface GuidePackTask {
  taskId: string;
  title: string;
  /** Keywords matched against the user's goal utterance. */
  keywords: string[];
  steps: GuidePackTaskStep[];
}

export interface TroubleshootingRule {
  /** Substring or keyword expected in the user's error description. */
  pattern: string;
  cause: string;
  solution: string;
}

export interface GuidePack {
  toolId: string;
  toolName: string;
  description: string;
  supportedDomains: string[];
  supportedPlatforms: Platform[];
  uiHints: Record<string, string>;
  commonTasks: GuidePackTask[];
  troubleshooting: TroubleshootingRule[];
  docSources: { title: string; url: string }[];
  safetyWarnings: string[];
  version: string;
}

/* ------------------------- Learning progress -------------------------- */

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced';

export interface ToolProgress {
  toolId: string;
  completedTaskIds: string[];
  completedStepIds: string[];
  /** stepId -> number of times the user got stuck on it. */
  stuckCounts: Record<string, number>;
  lastTaskId?: string;
  lastStepIndex?: number;
  skillLevel: SkillLevel;
  updatedAt: string;
}

export interface ProgressData {
  tools: Record<string, ToolProgress>;
}

/* ------------------------------ Redaction ------------------------------ */

export type SensitiveKind =
  | 'email'
  | 'phone'
  | 'rrn'
  | 'card'
  | 'api-key'
  | 'password';

export interface RedactionFinding {
  kind: SensitiveKind;
  count: number;
}

export interface RedactionResult {
  redacted: string;
  findings: RedactionFinding[];
}
