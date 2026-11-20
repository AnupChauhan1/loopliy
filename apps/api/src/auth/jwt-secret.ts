import { randomBytes } from 'crypto';

let developmentSecret: string | undefined;

export function getJwtSecret(): string {
  const configuredSecret = process.env.JWT_SECRET;
  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production.');
  }

  if (!developmentSecret) {
    developmentSecret = randomBytes(32).toString('hex');
  }

  return developmentSecret;
}
