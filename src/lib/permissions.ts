import type { AppUser, Permission, UserRole } from '../types';

export const PERMISSION_LABELS: Record<Permission, string> = {
  'pos.access': 'POS-ზე წვდომა',
  'sale.create': 'გაყიდვის შექმნა',
  'sale.cancel': 'გაყიდვის გაუქმება',
  'sale.return': 'დაბრუნება',
  'sale.view_all': 'ყველა გაყიდვის ნახვა',
  'sale.view_profit': 'გაყიდვის მოგების ნახვა',
  'production.create': 'წარმოების დამატება',
  'production.edit': 'წარმოების რედაქტირება',
  'production.view_cost': 'წარმოების თვითღირებულების ნახვა',
  'transfer.create_request': 'გადატანის მოთხოვნის შექმნა',
  'transfer.fulfill': 'გადატანის შესრულება',
  'inventory.view': 'მარაგის ნახვა',
  'inventory.receive': 'მარაგის შემოსვლა',
  'inventory.adjust': 'მარაგის კორექტირება / ინვენტარიზაცია',
  'purchase.create': 'შესყიდვის შექმნა',
  'purchase.view_cost': 'შესყიდვის ფასების ნახვა',
  'supplier.manage': 'მომწოდებლების მართვა',
  'product.manage': 'პროდუქტების მართვა',
  'price.manage': 'ფასების მართვა',
  'recipe.manage': 'რეცეპტების მართვა',
  'material.manage': 'ნედლეულის კატალოგის მართვა',
  'expense.manage': 'ხარჯების მართვა',
  'cash.access': 'სალაროზე წვდომა',
  'shift.open': 'ცვლის გახსნა',
  'shift.close': 'ცვლის დახურვა',
  'shift.view_all': 'ყველა ცვლის ნახვა',
  'user.manage': 'მომხმარებლების მართვა',
  'password.reset': 'პაროლის აღდგენა',
  'report.sales': 'გაყიდვების რეპორტი',
  'report.production': 'წარმოების რეპორტი',
  'report.inventory': 'მარაგის რეპორტი',
  'report.profit': 'მოგების რეპორტი',
  'audit.view': 'Audit Log-ის ნახვა',
  'day.close': 'დღის დახურვა',
  'day.reopen': 'დღის ხელახლა გახსნა',
  'settings.manage': 'პარამეტრების მართვა'
};

export const PERMISSION_GROUPS: { title: string; items: Permission[] }[] = [
  {
    title: 'გაყიდვები / სალარო',
    items: [
      'pos.access',
      'sale.create',
      'sale.cancel',
      'sale.return',
      'sale.view_all',
      'sale.view_profit',
      'cash.access',
      'shift.open',
      'shift.close',
      'shift.view_all'
    ]
  },
  {
    title: 'წარმოება & გადატანა',
    items: [
      'production.create',
      'production.edit',
      'production.view_cost',
      'transfer.create_request',
      'transfer.fulfill'
    ]
  },
  {
    title: 'მარაგი & შესყიდვები',
    items: [
      'inventory.view',
      'inventory.receive',
      'inventory.adjust',
      'purchase.create',
      'purchase.view_cost',
      'supplier.manage'
    ]
  },
  {
    title: 'კატალოგი',
    items: ['product.manage', 'price.manage', 'recipe.manage', 'material.manage', 'expense.manage']
  },
  {
    title: 'რეპორტები',
    items: ['report.sales', 'report.production', 'report.inventory', 'report.profit']
  },
  {
    title: 'ადმინისტრირება',
    items: ['user.manage', 'password.reset', 'audit.view', 'day.close', 'day.reopen', 'settings.manage']
  }
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.items);

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'მფლობელი',
  MANAGER: 'მენეჯერი',
  CASHIER: 'მოლარე',
  EMPLOYEE: 'თანამშრომელი / მცხობელი'
};

export const FLOOR_LABELS = {
  LOWER_FLOOR: 'ქვედა სართული',
  UPPER_FLOOR: 'ზედა სართული'
} as const;

export const LOCATION_LABELS = {
  WAREHOUSE: 'საწყობი',
  FRIDGE: 'მაცივარი',
  LOWER_FLOOR: 'ქვედა სართული',
  UPPER_FLOOR: 'ზედა სართული'
} as const;

/** როლის ნაგულისხმევი უფლებები (Owner-ს შეუძლია ინდივიდუალურად შეცვალოს). */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  OWNER: [...ALL_PERMISSIONS],
  MANAGER: [
    'pos.access',
    'sale.create',
    'sale.return',
    'sale.view_all',
    'sale.view_profit',
    'production.create',
    'production.view_cost',
    'transfer.create_request',
    'transfer.fulfill',
    'inventory.view',
    'inventory.receive',
    'inventory.adjust',
    'purchase.create',
    'purchase.view_cost',
    'supplier.manage',
    'product.manage',
    'price.manage',
    'recipe.manage',
    'material.manage',
    'expense.manage',
    'cash.access',
    'shift.open',
    'shift.close',
    'shift.view_all',
    'report.sales',
    'report.production',
    'report.inventory',
    'day.close'
  ],
  CASHIER: ['pos.access', 'sale.create', 'sale.view_all', 'cash.access', 'shift.open', 'shift.close'],
  EMPLOYEE: ['production.create', 'transfer.fulfill', 'inventory.view']
};

export function hasPermission(user: AppUser | null, permission: Permission): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'OWNER') return true;
  return user.permissions?.includes(permission) ?? false;
}

export function hasAnyPermission(user: AppUser | null, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(user, p));
}

/** უფლების არარსებობისას გამოსატანი შეცდომა. */
export class PermissionError extends Error {
  constructor(permission: Permission) {
    super(`არ გაქვთ უფლება: ${PERMISSION_LABELS[permission] ?? permission}`);
    this.name = 'PermissionError';
  }
}

export function assertPermission(user: AppUser | null, permission: Permission): void {
  if (!hasPermission(user, permission)) throw new PermissionError(permission);
}
