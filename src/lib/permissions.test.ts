import { describe, expect, it } from 'vitest';
import { assertPermission, DEFAULT_ROLE_PERMISSIONS, hasPermission, PermissionError } from './permissions';
import type { AppUser } from '../types';

const user = (over: Partial<AppUser>): AppUser => ({
  id: 'u1',
  firstName: 'ტესტ',
  lastName: 'მომხმარებელი',
  username: 'test',
  email: 'test@example.com',
  role: 'CASHIER',
  permissions: DEFAULT_ROLE_PERMISSIONS.CASHIER,
  status: 'active',
  createdAt: '',
  updatedAt: '',
  ...over
});

describe('hasPermission', () => {
  it('მფლობელს ყველა უფლება აქვს', () => {
    const owner = user({ role: 'OWNER', permissions: [] });
    expect(hasPermission(owner, 'settings.manage')).toBe(true);
    expect(hasPermission(owner, 'day.reopen')).toBe(true);
  });

  it('მოლარე ვერ ხედავს მოგებას და ვერ ცვლის ფასს', () => {
    const cashier = user({});
    expect(hasPermission(cashier, 'report.profit')).toBe(false);
    expect(hasPermission(cashier, 'price.manage')).toBe(false);
    expect(hasPermission(cashier, 'purchase.view_cost')).toBe(false);
    expect(hasPermission(cashier, 'user.manage')).toBe(false);
    expect(hasPermission(cashier, 'inventory.adjust')).toBe(false);
    expect(hasPermission(cashier, 'production.create')).toBe(false);
    expect(hasPermission(cashier, 'sale.create')).toBe(true);
    expect(hasPermission(cashier, 'pos.access')).toBe(true);
  });

  it('თანამშრომელი ვერ ხედავს ადმინისტრირებას და მოგებას', () => {
    const employee = user({ role: 'EMPLOYEE', permissions: DEFAULT_ROLE_PERMISSIONS.EMPLOYEE, assignedFloor: 'LOWER_FLOOR' });
    expect(hasPermission(employee, 'user.manage')).toBe(false);
    expect(hasPermission(employee, 'report.profit')).toBe(false);
    expect(hasPermission(employee, 'price.manage')).toBe(false);
    expect(hasPermission(employee, 'settings.manage')).toBe(false);
    expect(hasPermission(employee, 'production.create')).toBe(true);
    expect(hasPermission(employee, 'transfer.fulfill')).toBe(true);
  });

  it('გათიშულ მომხმარებელს არაფერი შეუძლია', () => {
    const disabled = user({ role: 'OWNER', status: 'disabled' });
    expect(hasPermission(disabled, 'sale.create')).toBe(false);
  });

  it('assertPermission აგდებს PermissionError-ს', () => {
    expect(() => assertPermission(user({}), 'day.close')).toThrow(PermissionError);
  });
});
