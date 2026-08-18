import React, { useState } from 'react';
import {
  ArrowRightLeft,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CookingPot,
  FileClock,
  LayoutDashboard,
  Menu,
  Package,
  Receipt,
  Settings as SettingsIcon,
  ShoppingCart,
  Snowflake,
  Truck,
  Users,
  Wallet,
  Warehouse
} from 'lucide-react';
import type { Permission } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export interface NavChild {
  id: string;
  label: string;
  icon?: React.ElementType;
  permissions?: Permission[];
  badge?: number;
}

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  permissions?: Permission[];
  children?: NavChild[];
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
  const [openSection, setOpenSection] = useState<string | null>('sales');

  const pendingTransfers = transferRequests.filter((t) => t.status === 'PENDING' || t.status === 'PARTIAL').length;

  const menu: NavItem[] = [
    { id: 'dashboard', label: 'მთავარი', icon: LayoutDashboard },
    {
      id: 'sales',
      label: 'გაყიდვები / POS',
      icon: ShoppingCart,
      permissions: ['pos.access', 'sale.create', 'sale.view_all'],
      children: [
        { id: 'pos', label: 'ახალი გაყიდვა / POS', icon: ShoppingCart, permissions: ['pos.access'] },
        { id: 'sales_history', label: 'გაყიდვების ისტორია', icon: FileClock, permissions: ['sale.view_all', 'sale.create'] },
        { id: 'returns', label: 'დაბრუნებები', icon: Receipt, permissions: ['sale.return'] }
      ]
    },
    { id: 'production', label: 'წარმოება / ცხობა', icon: CookingPot, permissions: ['production.create', 'report.production'] },
    {
      id: 'transfers',
      label: 'სართულებს შორის',
      icon: ArrowRightLeft,
      permissions: ['transfer.create_request', 'transfer.fulfill'],
      children: [
        { id: 'transfers', label: 'მოთხოვნები', icon: ArrowRightLeft, badge: pendingTransfers },
        { id: 'finished_stock', label: 'მზა პროდუქტის მარაგი', icon: Package }
      ]
    },
    {
      id: 'inventory',
      label: 'ნედლეულის მარაგი',
      icon: Boxes,
      permissions: ['inventory.view'],
      children: [
        { id: 'stock_warehouse', label: 'საწყობი', icon: Warehouse },
        { id: 'stock_fridge', label: 'მაცივარი', icon: Snowflake },
        { id: 'stock_movements', label: 'მოძრაობები', icon: FileClock },
        { id: 'stocktake', label: 'ინვენტარიზაცია', icon: ClipboardList, permissions: ['inventory.adjust'] }
      ]
    },
    {
      id: 'purchases',
      label: 'შესყიდვები',
      icon: Truck,
      permissions: ['purchase.create', 'purchase.view_cost'],
      children: [
        { id: 'purchase_new', label: 'ახალი შემოსვლა', permissions: ['purchase.create'] },
        { id: 'purchases_history', label: 'შესყიდვების ისტორია' }
      ]
    },
    { id: 'suppliers', label: 'მომწოდებლები', icon: Building2, permissions: ['supplier.manage', 'purchase.create'] },
    { id: 'expenses', label: 'ხარჯები', icon: Wallet, permissions: ['expense.manage'] },
    {
      id: 'cash',
      label: 'ცვლა / დღის დახურვა',
      icon: Receipt,
      permissions: ['cash.access', 'shift.open', 'day.close'],
      children: [
        { id: 'shift', label: 'ჩემი ცვლა', permissions: ['shift.open', 'shift.close', 'cash.access'] },
        { id: 'day_close', label: 'დღის დახურვა', permissions: ['day.close'] }
      ]
    },
    {
      id: 'reports',
      label: 'რეპორტები',
      icon: BarChart3,
      permissions: ['report.sales', 'report.production', 'report.inventory', 'report.profit'],
      children: [
        { id: 'report_sales', label: 'გაყიდვები', permissions: ['report.sales'] },
        { id: 'report_production', label: 'წარმოება & მასალები', permissions: ['report.production'] },
        { id: 'report_inventory', label: 'მარაგი & გადატანები', permissions: ['report.inventory'] },
        { id: 'report_purchases', label: 'შესყიდვები', permissions: ['purchase.view_cost'] },
        { id: 'report_profit', label: 'მოგება', permissions: ['report.profit'] }
      ]
    },
    {
      id: 'admin',
      label: 'ადმინისტრაცია',
      icon: SettingsIcon,
      permissions: ['user.manage', 'audit.view', 'settings.manage', 'product.manage', 'material.manage'],
      children: [
        { id: 'catalog', label: 'პროდუქტები & ფასები', icon: Package, permissions: ['product.manage', 'price.manage'] },
        { id: 'materials', label: 'ნედლეული & რეცეპტები', icon: Boxes, permissions: ['material.manage', 'recipe.manage'] },
        { id: 'users', label: 'მომხმარებლები', icon: Users, permissions: ['user.manage'] },
        { id: 'audit', label: 'Audit Log', icon: FileClock, permissions: ['audit.view'] },
        { id: 'settings', label: 'პარამეტრები', icon: SettingsIcon, permissions: ['settings.manage'] }
      ]
    }
  ];

  const allowed = (permissions?: Permission[]) => !permissions || permissions.some((p) => can(p));

  const visibleMenu = menu
    .map((item) => ({
      ...item,
      children: item.children?.filter((c) => allowed(c.permissions))
    }))
    .filter((item) => allowed(item.permissions) && (!item.children || item.children.length > 0));

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
        collapsed ? 'w-16' : 'w-64'
      } bg-slate-900 border-r border-slate-800 flex flex-col h-[calc(100vh-4rem)] sticky top-16 select-none overflow-y-auto transition-[width] duration-200 no-print`}
    >
      <button
        onClick={toggleCollapsed}
        title={collapsed ? 'მენიუს გაშლა' : 'მენიუს შეკეცვა'}
        className="m-2 p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition cursor-pointer flex items-center justify-center"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="px-3 pb-6 space-y-1">
        {visibleMenu.map((item) => {
          const Icon = item.icon;
          const hasChildren = !!item.children?.length;
          const isOpen = openSection === item.id;
          const isDirectActive = activePage === item.id;
          const childActive = hasChildren && item.children!.some((c) => c.id === activePage);
          const sectionBadge = hasChildren ? item.children!.reduce((s, c) => s + (c.badge ?? 0), 0) : 0;

          return (
            <div key={item.id} className="space-y-1">
              <button
                title={item.label}
                onClick={() => {
                  if (collapsed) onNavigate(hasChildren ? item.children![0].id : item.id);
                  else if (hasChildren) setOpenSection(isOpen ? null : item.id);
                  else onNavigate(item.id);
                }}
                className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition cursor-pointer ${
                  isDirectActive || (collapsed && childActive)
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                } ${collapsed ? 'justify-center' : ''}`}
              >
                <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isDirectActive ? 'text-white' : 'text-slate-400'}`} />
                  {!collapsed && <span>{item.label}</span>}
                </div>
                {!collapsed && (
                  <div className="flex items-center gap-1.5">
                    {sectionBadge > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{sectionBadge}</span>
                    )}
                    {hasChildren &&
                      (isOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      ))}
                  </div>
                )}
                {collapsed && sectionBadge > 0 && (
                  <span className="absolute ml-6 -mt-5 bg-red-500 text-white text-[9px] font-bold px-1 rounded">{sectionBadge}</span>
                )}
              </button>

              {!collapsed && hasChildren && isOpen && (
                <div className="pl-4 border-l border-slate-800 ml-3 space-y-1 py-1">
                  {item.children!.map((child) => {
                    const ChildIcon = child.icon;
                    const isChildActive = activePage === child.id;
                    return (
                      <button
                        key={child.id}
                        onClick={() => onNavigate(child.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer flex items-center justify-between gap-2 ${
                          isChildActive
                            ? 'bg-amber-500/10 text-amber-400 font-bold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          {ChildIcon && <ChildIcon className="w-3.5 h-3.5" />}
                          <span>{child.label}</span>
                        </span>
                        {!!child.badge && child.badge > 0 && (
                          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">{child.badge}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
