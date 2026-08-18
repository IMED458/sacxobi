/**
 * Audit Log — immutable. ჩანაწერები მხოლოდ იქმნება (rules კრძალავს
 * განახლებას/წაშლას). არასოდეს ვწერთ პაროლს ან მის hash-ს.
 */
import { setDoc, type Transaction, type WriteBatch } from 'firebase/firestore';
import { businessDateOf } from '../lib/dates';
import type { AppUser, AuditLog } from '../types';
import { COL, clean, docRef, newId } from './db';

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** პაროლის მსგავსი ველების ამოშლა before/after სნეპშოტებიდან. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/password|passwd|pwd|hash|token|secret/i.test(k)) {
        out[k] = '***';
        continue;
      }
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

export function buildAudit(user: Pick<AppUser, 'id' | 'firstName' | 'lastName'> | null, input: AuditInput): AuditLog {
  const now = new Date().toISOString();
  return clean({
    id: newId('audit'),
    timestamp: now,
    businessDate: businessDateOf(now),
    userId: user?.id ?? 'system',
    userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'სისტემა',
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    before: redact(input.before),
    after: redact(input.after),
    reason: input.reason,
    metadata: input.metadata,
    seq: Date.now()
  }) as AuditLog;
}

/** დამოუკიდებელი ჩაწერა (ტრანზაქციის გარეთ). */
export async function logAudit(
  user: Pick<AppUser, 'id' | 'firstName' | 'lastName'> | null,
  input: AuditInput
): Promise<void> {
  const entry = buildAudit(user, input);
  await setDoc(docRef(COL.auditLogs, entry.id), entry);
}

/** ტრანზაქციის შიგნით. */
export function logAuditTx(
  tx: Transaction,
  user: Pick<AppUser, 'id' | 'firstName' | 'lastName'> | null,
  input: AuditInput
): void {
  const entry = buildAudit(user, input);
  tx.set(docRef(COL.auditLogs, entry.id), entry);
}

/** batch-ის შიგნით. */
export function logAuditBatch(
  batch: WriteBatch,
  user: Pick<AppUser, 'id' | 'firstName' | 'lastName'> | null,
  input: AuditInput
): void {
  const entry = buildAudit(user, input);
  batch.set(docRef(COL.auditLogs, entry.id), entry);
}
