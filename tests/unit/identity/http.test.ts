// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assertSameOrigin, readJson } from '@/lib/http/request';

function expectDomainCode(operation: () => unknown, code: string) {
  let thrown: unknown;
  try {
    operation();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toMatchObject({ code });
}

describe('cookie-authenticated request boundary', () => {
  it('requires the configured origin rather than trusting a forwarded host', () => {
    const request = new Request('https://forged.example/api/v1/auth/login', {
      method: 'POST',
      headers: { origin: 'https://app.example', 'x-forwarded-host': 'forged.example' },
    });
    expect(() => assertSameOrigin(request, 'https://app.example')).not.toThrow();
    expectDomainCode(() => assertSameOrigin(request, 'https://other.example'), 'FORBIDDEN');
  });

  it('rejects missing and null origins for writes', () => {
    expectDomainCode(() => assertSameOrigin(new Request('https://app.example'), 'https://app.example'), 'FORBIDDEN');
    expectDomainCode(() => assertSameOrigin(new Request('https://app.example', { headers: { origin: 'null' } }), 'https://app.example'), 'FORBIDDEN');
  });

  it('accepts JSON and rejects malformed JSON or unsupported content types', async () => {
    await expect(readJson(new Request('https://app.example', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: '{"name":"Example"}',
    }))).resolves.toEqual({ name: 'Example' });
    await expect(readJson(new Request('https://app.example', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken',
    }))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(readJson(new Request('https://app.example', { method: 'POST', body: '{}' })))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('bounds bytes actually read when content-length is missing or false', async () => {
    const request = new Request('https://app.example', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '2' },
      body: `"${'x'.repeat(64)}"`,
    });
    await expect(readJson(request, 32)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
