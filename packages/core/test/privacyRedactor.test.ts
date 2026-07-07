import { describe, expect, it } from 'vitest';
import { PrivacyRedactor } from '../src/privacyRedactor.js';
import type { ScreenContext } from '../src/types.js';

const redactor = new PrivacyRedactor();

describe('PrivacyRedactor', () => {
  it('masks email addresses', () => {
    const r = redactor.redact('제 메일은 hong.gildong@example.com 입니다');
    expect(r.redacted).not.toContain('hong.gildong@example.com');
    expect(r.redacted).toContain('[REDACTED:EMAIL]');
    expect(r.findings).toContainEqual({ kind: 'email', count: 1 });
  });

  it('masks Korean mobile phone numbers', () => {
    const r = redactor.redact('연락처는 010-1234-5678 입니다');
    expect(r.redacted).not.toContain('010-1234-5678');
    expect(r.redacted).toContain('[REDACTED:PHONE]');
  });

  it('masks resident registration numbers (주민등록번호)', () => {
    const r = redactor.redact('주민번호 900101-1234567 확인');
    expect(r.redacted).not.toContain('900101-1234567');
    expect(r.redacted).toContain('[REDACTED:RRN]');
  });

  it('masks credit card numbers', () => {
    const r = redactor.redact('카드번호 1234-5678-9012-3456 으로 결제');
    expect(r.redacted).not.toContain('1234-5678-9012-3456');
    expect(r.redacted).toContain('[REDACTED:CARD]');
  });

  it('masks API keys of common formats', () => {
    const samples = [
      'sk-abcdefghijklmnop1234',
      'ghp_ABCDEFGHIJKLMNOPQRST12345',
      'AKIAIOSFODNN7EXAMPLE',
    ];
    for (const key of samples) {
      const r = redactor.redact(`token: ${key}`);
      expect(r.redacted, key).not.toContain(key);
      expect(r.redacted).toContain('[REDACTED:API_KEY]');
    }
  });

  it('masks bearer tokens', () => {
    const r = redactor.redact('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(r.redacted).toContain('Bearer [REDACTED:TOKEN]');
    expect(r.redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('masks password-looking key/value pairs (Korean and English)', () => {
    const r1 = redactor.redact('password: hunter2secret');
    expect(r1.redacted).not.toContain('hunter2secret');
    const r2 = redactor.redact('비밀번호: 내비밀1234!');
    expect(r2.redacted).not.toContain('내비밀1234!');
  });

  it('leaves normal text untouched', () => {
    const text = '오른쪽 위의 New Project 버튼을 눌러주세요.';
    const r = redactor.redact(text);
    expect(r.redacted).toBe(text);
    expect(r.findings).toHaveLength(0);
  });

  it('redacts every field of a ScreenContext including DOM summary', () => {
    const context: ScreenContext = {
      source: 'browser-extension',
      capturedAt: new Date().toISOString(),
      browser: {
        url: 'https://example.com/profile?email=a.b@test.com',
        title: '내 계정 — a.b@test.com',
        domSummary: {
          headings: ['계정 정보'],
          buttons: ['저장', '010-9999-8888로 인증'],
          links: [],
          inputs: ['이메일 주소'],
          landmarks: ['main'],
        },
      },
    };
    const { context: safe, findings } = redactor.redactContext(context);
    const flat = JSON.stringify(safe);
    expect(flat).not.toContain('a.b@test.com');
    expect(flat).not.toContain('010-9999-8888');
    expect(findings.some((f) => f.kind === 'email')).toBe(true);
    expect(findings.some((f) => f.kind === 'phone')).toBe(true);
  });
});
