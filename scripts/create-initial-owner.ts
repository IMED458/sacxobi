/**
 * პირველი მფლობელის (Owner) შექმნა Firebase Admin SDK-ით.
 *
 * გამოყენება (credentials მხოლოდ environment-იდან, არასდროს კოდში):
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
 *   export OWNER_USERNAME=imed
 *   export OWNER_EMAIL=owner@example.com
 *   export OWNER_PASSWORD='...'
 *   export OWNER_FIRST_NAME=გიორგი
 *   export OWNER_LAST_NAME=იმედაშვილი
 *   npm run create-owner
 *
 * ალტერნატივა: აპლიკაციის პირველი გაშვებისას გამოჩნდება „საწყისი
 * კონფიგურაციის" ეკრანი, რომელიც იმავეს აკეთებს (Security Rules უშვებს
 * მხოლოდ მაშინ, სანამ `meta/bootstrap` არ არსებობს).
 */
import { cert, initializeApp, applicationDefault, type AppOptions } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

const ALL_PERMISSIONS = [
  'pos.access', 'sale.create', 'sale.cancel', 'sale.return', 'sale.view_all', 'sale.view_profit',
  'production.create', 'production.edit', 'production.view_cost',
  'transfer.create_request', 'transfer.fulfill',
  'inventory.view', 'inventory.receive', 'inventory.adjust',
  'purchase.create', 'purchase.view_cost', 'supplier.manage',
  'product.manage', 'price.manage', 'recipe.manage', 'material.manage', 'expense.manage',
  'cash.access', 'shift.open', 'shift.close', 'shift.view_all',
  'user.manage', 'password.reset',
  'report.sales', 'report.production', 'report.inventory', 'report.profit',
  'audit.view', 'day.close', 'day.reopen', 'settings.manage'
];

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ ცვლადი ${name} არ არის მითითებული`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const options: AppOptions = keyPath
    ? { credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))) }
    : { credential: applicationDefault() };

  initializeApp(options);
  const auth = getAuth();
  const db = getFirestore();

  const username = required('OWNER_USERNAME').trim().toLowerCase();
  const email = required('OWNER_EMAIL').trim();
  const password = required('OWNER_PASSWORD');
  const firstName = process.env.OWNER_FIRST_NAME ?? 'მფლობელი';
  const lastName = process.env.OWNER_LAST_NAME ?? '';

  if (password.length < 8) {
    console.error('❌ პაროლი უნდა შეიცავდეს მინიმუმ 8 სიმბოლოს');
    process.exit(1);
  }

  const bootstrap = await db.doc('meta/bootstrap').get();
  if (bootstrap.exists) {
    console.error('❌ სისტემა უკვე ინიციალიზებულია — მფლობელი შექმნილია');
    process.exit(1);
  }

  const user = await auth.createUser({ email, password, displayName: `${firstName} ${lastName}`.trim() });
  const now = new Date().toISOString();

  await db.doc(`users/${user.uid}`).set({
    id: user.uid,
    firstName,
    lastName,
    username,
    email,
    position: 'მფლობელი',
    role: 'OWNER',
    permissions: ALL_PERMISSIONS,
    status: 'active',
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now
  });
  await db.doc(`usernames/${username}`).set({ username, email, uid: user.uid });
  await db.doc('meta/bootstrap').set({ initializedAt: now, ownerUid: user.uid });
  await db.collection('auditLogs').add({
    id: `audit_${Date.now()}`,
    timestamp: now,
    businessDate: now.slice(0, 10),
    userId: user.uid,
    userName: `${firstName} ${lastName}`.trim(),
    action: 'OWNER_BOOTSTRAPPED',
    entityType: 'user',
    entityId: user.uid,
    summary: `სისტემის პირველი მფლობელი შეიქმნა: ${username}`,
    seq: Date.now()
  });

  console.log(`✅ მფლობელი შეიქმნა: ${username} (${email})`);
  console.log('   პაროლი არსად არ ინახება — მას მხოლოდ Firebase Authentication მართავს.');
}

main().catch((err) => {
  console.error('❌ შეცდომა:', err);
  process.exit(1);
});
