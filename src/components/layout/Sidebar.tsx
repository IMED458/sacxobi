import React, { useState } from 'react';
import {
  ArrowRightLeft,
  BarChart3,
  Boxes,
  ClipboardList,
  CookingPot,
  LayoutDashboard,
  Menu,
  Receipt,
  Settings as SettingsIcon,
  ShoppingCart,
  Truck,
  Wallet
} from 'lucide-react';
import type { Permission } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  permissions?: Permission[];
  badge?: number;
}

interface Props {
  activePage: string;
  onNavigate: (page: string) => void;
}

export const Sidebar: React.FC<Props> = ({ activePage, onNavigate }) => {
  const { user, can } = useAuth();
  const { transferRequests } = useData();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const pendingTransfers = transferRequests.filter((t) => t.status === 'PENDING' || t.status === 'PARTIAL').length;

  const menu: NavItem[] = [
    { id: 'dashboard', label: 'მთავარი', icon: LayoutDashboard },
    { id: 'pos', label: 'გაყიდვა (POS)', icon: ShoppingCart, permissions: ['pos.access'] },
    { id: 'orders', label: 'შეკვეთები', icon: ClipboardList, permissions: ['order.manage', 'order.fulfill'] },
    { id: 'sales', label: 'გაყიდვების ისტორია', icon: Receipt, permissions: ['sale.view_all', 'sale.create'] },
    { id: 'production', label: 'წარმოება', icon: CookingPot, permissions: ['production.create', 'report.production'] },
    {
      id: 'transfers',
      label: 'სართულებს შორის',
      icon: ArrowRightLeft,
      permissions: ['transfer.create_request', 'transfer.fulfill'],
      badge: pendingTransfers
    },
    { id: 'stock', label: 'მარაგი', icon: Boxes, permissions: ['inventory.view'] },
    { id: 'purchases', label: 'შესყიდვები', icon: Truck, permissions: ['purchase.create', 'purchase.view_cost'] },
    { id: 'expenses', label: 'ხარჯები', icon: Wallet, permissions: ['expense.manage'] },
    { id: 'cash', label: 'სალარო / დღე', icon: Receipt, permissions: ['cash.access', 'shift.open', 'day.close'] },
    {
      id: 'reports',
      label: 'რეპორტები',
      icon: BarChart3,
      permissions: ['report.sales', 'report.production', 'report.inventory', 'report.profit']
    },
    {
      id: 'admin',
      label: 'პარამეტრები',
      icon: SettingsIcon,
      permissions: ['user.manage', 'audit.view', 'settings.manage', 'product.manage', 'material.manage']
    }
  ];

  const visible = menu.filter((item) => !item.permissions || item.permissions.some((p) => can(p)));

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (!user) return null;

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-60'
      } bg-slate-900 border-r border-slate-800 flex flex-col h-[calc(100vh-4rem)] sticky top-16 select-none overflow-y-auto transition-[width] duration-200 no-print`}
    >
      <button
        onClick={toggleCollapsed}
        title={collapsed ? 'მენიუს გაშლა' : 'მენიუს შეკეცვა'}
        className="m-2 p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer flex items-center justify-center"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="px-2.5 pb-6 space-y-1">
        {visible.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              title={item.label}
              onClick={() => onNavigate(item.id)}
              className={`w-full px-3 py-2.5 rounded-xl text-[13px] font-semibold flex items-center transition cursor-pointer ${
                collapsed ? 'justify-center' : 'justify-between'
              } ${
                isActive
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                {!collapsed && <span>{item.label}</span>}
              </span>
              {!!item.badge && item.badge > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{item.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
};
