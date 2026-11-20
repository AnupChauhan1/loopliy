import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJwtSecret } from './jwt-secret';

describe('getJwtSecret', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires a configured secret in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', '');

    expect(() => getJwtSecret()).toThrow('JWT_SECRET must be configured in production.');
  });

  it('uses the configured secret', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('JWT_SECRET', 'test-secret');

    expect(getJwtSecret()).toBe('test-secret');
  });

  it('creates a stable per-process secret in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('JWT_SECRET', '');

    const secret = getJwtSecret();

    expect(secret).toBeTruthy();
    expect(getJwtSecret()).toBe(secret);
  });
});
