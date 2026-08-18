import React, { useState } from 'react';
import { AlertTriangle, Bell, ChefHat, KeyRound, LogOut, Receipt, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { formatMoney } from '../../lib/money';
import { formatDate, todayBusinessDate } from '../../lib/dates';
import { ROLE_LABELS, FLOOR_LABELS } from '../../lib/permissions';
import { Badge } from '../ui';
import { ChangePasswordModal } from '../ChangePasswordModal';

interface Props {
  onNavigate: (page: string) => void;
  dayClosed: boolean;
}

export const Header: React.FC<Props> = ({ onNavigate, dayClosed }) => {
  const { user, logout } = useAuth();
  const { myShift, transferRequests, stockLevels, materials, settings } = useData();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!user) return null;

  const pending = transferRequests.filter((t) => t.status === 'PENDING' || t.status === 'PARTIAL');
  const lowStock = materials
    .filter((m) => m.active && m.minStock > 0)
    .map((m) => {
      const total = stockLevels
        .filter((l) => l.itemType === 'MATERIAL' && l.itemId === m.id)
        .reduce((s, l) => s + l.quantity, 0);
      return { material: m, total };
    })
    .filter((x) => x.total <= x.material.minStock);

  const notificationCount = pending.length + lowStock.length + (dayClosed ? 0 : 0);

  return (
    <header className="h-16 bg-slate-900 text-white flex items-center justify-between px-4 sticky top-0 z-40 no-print">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center flex-shrink-0">
          <ChefHat className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold truncate">{settings.companyName || 'საცხობი'}</p>
          <p className="text-[11px] text-slate-400">{formatDate(todayBusinessDate())} · თბილისის დრო</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {myShift ? (
          <button
            onClick={() => onNavigate('shift')}
            className="hidden md:flex items-center gap-2 bg-emerald-600/15 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer hover:bg-emerald-600/25"
          >
            <Receipt className="w-3.5 h-3.5" />
            ცვლა ღიაა · {formatMoney(myShift.openingCashTetri)}
          </button>
        ) : (
          <button
            onClick={() => onNavigate('shift')}
            className="hidden md:flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer hover:bg-slate-700"
          >
            <Receipt className="w-3.5 h-3.5" />
            ცვლა დახურულია
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className="relative p-2 rounded-xl hover:bg-slate-800 cursor-pointer"
            title="შეტყობინებები"
          >
            <Bell className="w-5 h-5 text-slate-300" />
            {notificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full">
                {notificationCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">შეტყობინებები</div>
              <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                {pending.length === 0 && lowStock.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">ახალი შეტყობინება არ არის</p>
                )}
                {pending.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setShowNotifications(false);
                      onNavigate('transfers');
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer"
                  >
                    <p className="text-xs font-bold text-slate-800">გადატანის მოთხოვნა · {t.requestNo}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t.productName} — დარჩენილია {t.remainingQuantity} {t.unitSymbol}
                    </p>
                  </button>
                ))}
                {lowStock.map((x) => (
                  <button
                    key={x.material.id}
                    onClick={() => {
                      setShowNotifications(false);
                      onNavigate(x.material.defaultStorageLocation === 'FRIDGE' ? 'stock_fridge' : 'stock_warehouse');
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 cursor-pointer flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span>
                      <span className="block text-xs font-bold text-slate-800">დაბალი ნაშთი: {x.material.name}</span>
                      <span className="block text-[11px] text-slate-500">
                        დარჩა {x.total} {x.material.unitSymbol} (მინ. {x.material.minStock})
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="hidden sm:flex flex-col items-end mr-1">
          <span className="text-xs font-bold leading-tight">
            {user.firstName} {user.lastName}
          </span>
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            {ROLE_LABELS[user.role]}
            {user.assignedFloor && ` · ${FLOOR_LABELS[user.assignedFloor]}`}
          </span>
        </div>

        {user.role === 'OWNER' && (
          <span className="hidden lg:block">
            <Badge tone="amber">
              <ShieldCheck className="w-3 h-3 inline mr-1" />
              სრული წვდომა
            </Badge>
          </span>
        )}

        <button
          onClick={() => setShowPassword(true)}
          title="პაროლის შეცვლა"
          className="p-2 rounded-xl hover:bg-slate-800 cursor-pointer text-slate-300"
        >
          <KeyRound className="w-5 h-5" />
        </button>
        <button onClick={() => void logout()} title="გასვლა" className="p-2 rounded-xl hover:bg-red-600/20 cursor-pointer text-red-300">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <ChangePasswordModal open={showPassword} onClose={() => setShowPassword(false)} />
    </header>
  );
};
