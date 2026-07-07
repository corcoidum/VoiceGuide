import type { Intent } from './types.js';

interface IntentRule {
  intent: Intent;
  patterns: RegExp[];
}

/**
 * Lightweight keyword classifier for conversational branching
 * ("완료했어" / "못 찾겠어" / "다시 설명해줘" ...). Runs fully offline so the
 * conversation loop works in Mock Mode without any model call.
 */
const RULES: IntentRule[] = [
  {
    // Checked before "done": "안 보여" must not match done's "보여".
    intent: 'not_found',
    patterns: [
      /못\s*찾|없는데|안\s*보여|안\s*보이|어디에|어딨|can'?t find|not there|don'?t see|missing/i,
    ],
  },
  {
    intent: 'done',
    patterns: [
      /완료|됐어|했어요|했어\b|눌렀|열렸|보여|성공|찾았|done|did it|clicked|opened|it worked/i,
    ],
  },
  {
    intent: 'repeat',
    patterns: [/다시\s*(말|설명|들려)|한\s*번\s*더|repeat|again|say that again/i],
  },
  {
    intent: 'simplify',
    patterns: [/쉽게|천천히|초보|무슨\s*말|이해가\s*안|simpler|easier|explain like/i],
  },
  {
    intent: 'error_help',
    patterns: [/오류|에러|error|실패|안\s*되|안\s*돼|왜\s*이래|failed|exception|문제가/i],
  },
  {
    intent: 'start_tutorial',
    patterns: [/처음부터|기초부터|하나씩|튜토리얼|from the (start|beginning)|step by step|tutorial/i],
  },
  {
    intent: 'verify',
    patterns: [/제대로\s*했|맞게\s*했|확인해\s*줘|맞아\?|check my|did i do/i],
  },
  {
    intent: 'explore',
    patterns: [/뭐가\s*있|무슨\s*기능|둘러|살펴|what can|what does this|explore|features/i],
  },
  {
    intent: 'ask_how',
    patterns: [/어떻게|어떡|방법|하려면|만들|하는\s*법|how (do|can|to)|where (do|can)/i],
  },
];

export function classifyIntent(utterance: string): Intent {
  const text = utterance.trim();
  if (text.length === 0) return 'unknown';
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.intent;
  }
  return 'unknown';
}
