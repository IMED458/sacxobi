import { describe, expect, it } from 'vitest';
import { hashPassword, normalizeUsername, stripSecret, verifyPassword } from './auth';
import type { AppUser } from '../types';

describe('პაროლები', () => {
  it('hash არასდროს ემთხვევა ღია პაროლს', () => {
    const hash = hashPassword('saperavi123');
    expect(hash).not.toContain('saperavi123');
    expect(hash.startsWith('$2')).toBe(true);
  });

  it('სწორ პაროლს ცნობს, არასწორს — არა', () => {
    const hash = hashPassword('saperavi123');
    expect(verifyPassword('saperavi123', hash)).toBe(true);
    expect(verifyPassword('Saperavi123', hash)).toBe(false);
    expect(verifyPassword('saperavi123', undefined)).toBe(false);
  });

  it('ერთი და იგივე პაროლი ორ განსხვავებულ hash-ს იძლევა (salt)', () => {
    expect(hashPassword('abc123')).not.toBe(hashPassword('abc123'));
  });
});

describe('normalizeUsername', () => {
  it('პატარა ასოებზე და trim-ზე მიჰყავს', () => {
    expect(normalizeUsername('  IMED  ')).toBe('imed');
  });
});

describe('stripSecret', () => {
  it('passwordHash-ს შლის', () => {
    const user = {
      id: 'u1',
      firstName: 'ა',
      lastName: 'ბ',
      username: 'test',
      passwordHash: '$2b$10$xxx',
      role: 'OWNER',
      permissions: [],
      status: 'active',
      createdAt: '',
      updatedAt: ''
    } as AppUser;
    const safe = stripSecret(user);
    expect(safe.passwordHash).toBeUndefined();
    expect(user.passwordHash).toBe('$2b$10$xxx');
  });
});
