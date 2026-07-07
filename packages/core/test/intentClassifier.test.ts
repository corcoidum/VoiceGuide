import { describe, expect, it } from 'vitest';
import { classifyIntent } from '../src/intentClassifier.js';

describe('classifyIntent', () => {
  it.each([
    ['완료했어', 'done'],
    ['버튼 눌렀어', 'done'],
    ['창이 열렸어', 'done'],
    ['못 찾겠어', 'not_found'],
    ['그 버튼이 안 보여', 'not_found'],
    ['다시 설명해줘', 'repeat'],
    ['더 쉽게 말해줘', 'simplify'],
    ['이 오류가 왜 생겼어?', 'error_help'],
    ['처음부터 하나씩 알려줘', 'start_tutorial'],
    ['내가 제대로 했는지 확인해줘', 'verify'],
    ['여기서 뭘 할 수 있어? 무슨 기능이 있어?', 'explore'],
    ['여기서 새 프로젝트는 어떻게 만들어?', 'ask_how'],
    ['how do I create a repository?', 'ask_how'],
    ["I can't find it", 'not_found'],
    ['done', 'done'],
  ] as const)('"%s" → %s', (utterance, expected) => {
    expect(classifyIntent(utterance)).toBe(expected);
  });

  it('returns unknown for empty input', () => {
    expect(classifyIntent('   ')).toBe('unknown');
  });
});
