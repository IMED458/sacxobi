import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { ToastProvider } from './components/ui/Toast';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { Spinner } from './components/ui';
import { LoginScreen } from './pages/LoginScreen';
import { BootstrapScreen } from './pages/BootstrapScreen';
import { Dashboard } from './pages/Dashboard';
import { POSView } from './pages/POSView';
import { SalesHistoryView } from './pages/SalesHistoryView';
import { ProductionView } from './pages/ProductionView';
import { TransfersView } from './pages/TransfersView';
import { FinishedStockView, MaterialStockView, StockMovementsView, StocktakeView } from './pages/StockViews';
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
  sales_history: ['sale.view_all', 'sale.create'],
  returns: ['sale.return'],
  production: ['production.create', 'report.production'],
  transfers: ['transfer.create_request', 'transfer.fulfill'],
  finished_stock: ['inventory.view', 'transfer.fulfill', 'pos.access'],
  stock_warehouse: ['inventory.view'],
  stock_fridge: ['inventory.view'],
  stock_movements: ['inventory.view'],
  stocktake: ['inventory.adjust'],
  purchase_new: ['purchase.create'],
  purchases_history: ['purchase.view_cost', 'purchase.create'],
  suppliers: ['supplier.manage', 'purchase.create'],
  expenses: ['expense.manage'],
  shift: ['shift.open', 'shift.close', 'cash.access'],
  day_close: ['day.close'],
  report_sales: ['report.sales'],
  report_production: ['report.production'],
  report_inventory: ['report.inventory'],
  report_purchases: ['purchase.view_cost'],
  report_profit: ['report.profit'],
  catalog: ['product.manage', 'price.manage'],
  materials: ['material.manage', 'recipe.manage'],
  users: ['user.manage'],
  audit: ['audit.view'],
  settings: ['settings.manage']
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

  // საწყისი გვერდი როლის მიხედვით
  useEffect(() => {
    if (!user) return;
    if (user.role === 'CASHIER' && can('pos.access')) setActivePage('pos');
    else setActivePage('dashboard');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!ready) return <Spinner label="მონაცემები იტვირთება…" />;

  const allowed = (page: string) => {
    const required = PAGE_PERMISSIONS[page];
    if (!required) return true;
    return required.some((p) => can(p));
  };

  const page = allowed(activePage) ? activePage : 'dashboard';

  const render = () => {
    switch (page) {
      case 'pos':
        return <POSView onNavigate={setActivePage} />;
      case 'sales_history':
        return <SalesHistoryView />;
      case 'returns':
        return <SalesHistoryView mode="returns" />;
      case 'production':
        return <ProductionView />;
      case 'transfers':
        return <TransfersView />;
      case 'finished_stock':
        return <FinishedStockView />;
      case 'stock_warehouse':
        return <MaterialStockView location="WAREHOUSE" />;
      case 'stock_fridge':
        return <MaterialStockView location="FRIDGE" />;
      case 'stock_movements':
        return <StockMovementsView />;
      case 'stocktake':
        return <StocktakeView />;
      case 'purchase_new':
        return <PurchaseNewView onDone={() => setActivePage('purchases_history')} />;
      case 'purchases_history':
        return <PurchaseHistoryView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'expenses':
        return <ExpensesView />;
      case 'shift':
        return <ShiftView />;
      case 'day_close':
        return <DayCloseView />;
      case 'report_sales':
        return <SalesReportView />;
      case 'report_production':
        return <ProductionReportView />;
      case 'report_inventory':
        return <InventoryReportView />;
      case 'report_purchases':
        return <PurchaseReportView />;
      case 'report_profit':
        return <ProfitReportView />;
      case 'catalog':
        return <CatalogView />;
      case 'materials':
        return <MaterialsView />;
      case 'users':
        return <UsersView />;
      case 'audit':
        return <AuditView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard onNavigate={setActivePage} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 antialiased">
      <Header onNavigate={setActivePage} dayClosed={dayClosed} />
      <div className="flex flex-1 w-full">
        <Sidebar activePage={page} onNavigate={setActivePage} />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
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
