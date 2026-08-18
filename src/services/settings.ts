import { getDoc, setDoc } from 'firebase/firestore';
import type { AppSettings, AppUser } from '../types';
import { clean, settingsRef } from './db';
import { logAudit } from './audit';

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'საცხობი',
  taxId: '',
  address: '',
  phone: '',
  email: '',
  bankName: '',
  iban: '',
  documentHeader: '',
  documentFooter: 'პროდუქცია ჩაბარებულია სრულად და გამართულ მდგომარეობაში.',
  smallBreadWeightGrams: 400,
  largeBreadWeightGrams: 650,
  allowNegativeStock: false,
  allowAnonymousSale: false,
  requireShiftForSale: true,
  requireOpenBusinessDay: true,
  currencySymbol: '₾'
};

export async function fetchSettings(): Promise<AppSettings> {
  const snap = await getDoc(settingsRef);
  return snap.exists() ? { ...DEFAULT_SETTINGS, ...(snap.data() as AppSettings) } : { ...DEFAULT_SETTINGS };
}

export async function saveSettings(user: AppUser, next: AppSettings, before: AppSettings): Promise<void> {
  await setDoc(settingsRef, clean(next));
  await logAudit(user, {
    action: 'SETTINGS_UPDATED',
    entityType: 'settings',
    entityId: 'settings',
    summary: 'პარამეტრები განახლდა',
    before,
    after: next
  });
}
