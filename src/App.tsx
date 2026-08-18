import React, { useEffect, useMemo, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { ToastProvider } from './components/ui/Toast';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { Spinner, Tabs, type TabDef } from './components/ui';
import { LoginScreen } from './pages/LoginScreen';
import { BootstrapScreen } from './pages/BootstrapScreen';
import { Dashboard } from './pages/Dashboard';
import { POSView } from './pages/POSView';
import { OrdersView } from './pages/OrdersView';
import { SalesHistoryView } from './pages/SalesHistoryView';
import { ProductionView } from './pages/ProductionView';
import { TransfersView } from './pages/TransfersView';
import { StockByLocationView, StockMovementsView, StockOverviewView, StocktakeView } from './pages/StockViews';
import { PurchaseHistoryView, PurchaseNewView } from './pages/PurchasesView';
import { SuppliersView } from './pages/SuppliersView';
import { ExpensesView, ShiftView, DayCloseView } from './pages/CashViews';
import {
  InventoryReportView,
  ProductionReportView,
  ProfitReportView,
  PurchaseReportView,
  SalesReportView
} from './pages/ReportsView';
import { UsersView } from './pages/UsersView';
import { CatalogView } from './pages/CatalogView';
import { MaterialsView } from './pages/MaterialsView';
import { AuditView } from './pages/AuditView';
import { SettingsView } from './pages/SettingsView';
import { fetchBusinessDay } from './services/businessDays';
import { todayBusinessDate } from './lib/dates';
import type { Permission } from './types';

const PAGE_PERMISSIONS: Record<string, Permission[]> = {
  pos: ['pos.access'],
  orders: ['order.manage', 'order.fulfill'],
  sales: ['sale.view_all', 'sale.create'],
  production: ['production.create', 'report.production'],
  transfers: ['transfer.create_request', 'transfer.fulfill'],
  stock: ['inventory.view'],
  purchases: ['purchase.create', 'purchase.view_cost'],
  expenses: ['expense.manage'],
  cash: ['cash.access', 'shift.open', 'day.close'],
  reports: ['report.sales', 'report.production', 'report.inventory', 'report.profit'],
  admin: ['user.manage', 'audit.view', 'settings.manage', 'product.manage', 'material.manage']
};

/** გვერდი შიდა ტაბებით — sidebar-ის გამარტივებისთვის. */
const TabbedPage: React.FC<{ storageKey: string; tabs: TabDef[]; render: (id: string) => React.ReactNode }> = ({
  storageKey,
  tabs,
  render
}) => {
  const available = tabs.filter((t) => !t.hidden);
  const [active, setActive] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`tab_${storageKey}`);
      if (saved && available.some((t) => t.id === saved)) return saved;
    } catch {
      /* ignore */
    }
    return available[0]?.id ?? '';
  });

  const current = available.some((t) => t.id === active) ? active : available[0]?.id ?? '';

  const change = (id: string) => {
    setActive(id);
    try {
      localStorage.setItem(`tab_${storageKey}`, id);
    } catch {
      /* ignore */
    }
  };

  if (!available.length) return null;

  return (
    <div>
      <Tabs tabs={available} active={current} onChange={change} />
      {render(current)}
    </div>
  );
};

const Workspace: React.FC = () => {
  const { user, can } = useAuth();
  const { ready } = useData();
  const [activePage, setActivePage] = useState('dashboard');
  const [dayClosed, setDayClosed] = useState(false);

  useEffect(() => {
    fetchBusinessDay(todayBusinessDate())
      .then((d) => setDayClosed(d?.status === 'CLOSED'))
      .catch(() => setDayClosed(false));
  }, [activePage]);

  useEffect(() => {
    if (!user) return;
    setActivePage(user.role === 'CASHIER' && can('pos.access') ? 'pos' : 'dashboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const allowed = (page: string) => {
    const required = PAGE_PERMISSIONS[page];
    return !required || required.some((p) => can(p));
  };

  const page = allowed(activePage) ? activePage : 'dashboard';

  const stockTabs: TabDef[] = useMemo(
    () => [
      { id: 'overview', label: 'მიმოხილვა' },
      { id: 'WAREHOUSE', label: 'საწყობი' },
      { id: 'FRIDGE', label: 'მაცივარი' },
      { id: 'LOWER_FLOOR', label: 'ქვედა სართული' },
      { id: 'UPPER_FLOOR', label: 'ზედა სართული' },
      { id: 'movements', label: 'მოძრაობები' },
      { id: 'stocktake', label: 'ინვენტარიზაცია', hidden: !can('inventory.adjust') }
    ],
    [can]
  );

  const render = () => {
    switch (page) {
      case 'pos':
        return <POSView onNavigate={setActivePage} />;
      case 'orders':
        return <OrdersView />;
      case 'sales':
        return (
          <TabbedPage
            storageKey="sales"
            tabs={[
              { id: 'sales', label: 'გაყიდვები' },
              { id: 'returns', label: 'დაბრუნებები', hidden: !can('sale.return') }
            ]}
            render={(id) => (id === 'returns' ? <SalesHistoryView mode="returns" /> : <SalesHistoryView />)}
          />
        );
      case 'production':
        return <ProductionView />;
      case 'transfers':
        return <TransfersView />;
      case 'stock':
        return (
          <TabbedPage
            storageKey="stock"
            tabs={stockTabs}
            render={(id) => {
              if (id === 'overview') return <StockOverviewView />;
              if (id === 'movements') return <StockMovementsView />;
              if (id === 'stocktake') return <StocktakeView />;
              return <StockByLocationView location={id as 'WAREHOUSE'} />;
            }}
          />
        );
      case 'purchases':
        return (
          <TabbedPage
            storageKey="purchases"
            tabs={[
              { id: 'new', label: 'ახალი შემოსვლა', hidden: !can('purchase.create') },
              { id: 'history', label: 'ისტორია' },
              { id: 'suppliers', label: 'მომწოდებლები' }
            ]}
            render={(id) => {
              if (id === 'new') return <PurchaseNewView onDone={() => undefined} />;
              if (id === 'suppliers') return <SuppliersView />;
              return <PurchaseHistoryView />;
            }}
          />
        );
      case 'expenses':
        return <ExpensesView />;
      case 'cash':
        return (
          <TabbedPage
            storageKey="cash"
            tabs={[
              { id: 'shift', label: 'ჩემი ცვლა' },
              { id: 'day', label: 'დღის დახურვა', hidden: !can('day.close') }
            ]}
            render={(id) => (id === 'day' ? <DayCloseView /> : <ShiftView />)}
          />
        );
      case 'reports':
        return (
          <TabbedPage
            storageKey="reports"
            tabs={[
              { id: 'sales', label: 'გაყიდვები', hidden: !can('report.sales') },
              { id: 'production', label: 'წარმოება & მასალები', hidden: !can('report.production') },
              { id: 'inventory', label: 'მარაგი', hidden: !can('report.inventory') },
              { id: 'purchases', label: 'შესყიდვები', hidden: !can('purchase.view_cost') },
              { id: 'profit', label: 'მოგება', hidden: !can('report.profit') }
            ]}
            render={(id) => {
              if (id === 'production') return <ProductionReportView />;
              if (id === 'inventory') return <InventoryReportView />;
              if (id === 'purchases') return <PurchaseReportView />;
              if (id === 'profit') return <ProfitReportView />;
              return <SalesReportView />;
            }}
          />
        );
      case 'admin':
        return (
          <TabbedPage
            storageKey="admin"
            tabs={[
              { id: 'catalog', label: 'პროდუქტები & ფასები', hidden: !can('product.manage') && !can('price.manage') },
              { id: 'materials', label: 'ნედლეული & რეცეპტები', hidden: !can('material.manage') && !can('recipe.manage') },
              { id: 'users', label: 'მომხმარებლები', hidden: !can('user.manage') },
              { id: 'audit', label: 'Audit Log', hidden: !can('audit.view') },
              { id: 'settings', label: 'კომპანია & პარამეტრები', hidden: !can('settings.manage') }
            ]}
            render={(id) => {
              if (id === 'materials') return <MaterialsView />;
              if (id === 'users') return <UsersView />;
              if (id === 'audit') return <AuditView />;
              if (id === 'settings') return <SettingsView />;
              return <CatalogView />;
            }}
          />
        );
      default:
        return <Dashboard onNavigate={setActivePage} />;
    }
  };

  if (!ready) return <Spinner label="მონაცემები იტვირთება…" />;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 antialiased">
      <Header onNavigate={setActivePage} dayClosed={dayClosed} />
      <div className="flex flex-1 w-full">
        <Sidebar activePage={page} onNavigate={setActivePage} />
        <main className="flex-1 p-4 md:p-5 overflow-x-hidden">
          {dayClosed && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2.5 text-xs font-bold">
              დღე დახურულია — ახალი ფინანსური ჩანაწერების დამატება შეზღუდულია
            </div>
          )}
          {render()}
        </main>
      </div>
      <ChangePasswordModal open={!!user?.mustChangePassword} onClose={() => undefined} forced />
    </div>
  );
};

const Root: React.FC = () => {
  const { user, loading, bootstrapped } = useAuth();

  if (bootstrapped === null || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Spinner label="იტვირთება…" />
      </div>
    );
  }
  if (!bootstrapped) return <BootstrapScreen />;
  if (!user) return <LoginScreen />;

  return (
    <DataProvider>
      <Workspace />
    </DataProvider>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </ToastProvider>
);

export default App;
