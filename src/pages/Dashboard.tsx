import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CookingPot,
  Package,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, StatCard, Table, Td, Th } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatDateTime, todayBusinessDate } from '../lib/dates';
import { formatMoney, formatQty } from '../lib/money';
import { FLOOR_LABELS, LOCATION_LABELS } from '../lib/permissions';
import { computeDaySummary, fetchProductionRange, fetchSalesRange, groupSales } from '../services/reports';
import type { DaySummary, ProductionBatch, Sale } from '../types';

interface Props {
  onNavigate: (page: string) => void;
}

export const Dashboard: React.FC<Props> = ({ onNavigate }) => {
  const { user, can } = useAuth();
  const { transferRequests, materials, stockLevels, products, myShift } = useData();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [production, setProduction] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const today = todayBusinessDate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([fetchSalesRange(today, today), fetchProductionRange(today, today)]);
      setSales(s);
      setProduction(p);
      if (can('report.profit') || can('report.sales')) setSummary(await computeDaySummary(today));
    } catch {
      /* უფლების არქონისას უბრალოდ ვტოვებთ ცარიელს */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = transferRequests.filter((t) => t.status === 'PENDING' || t.status === 'PARTIAL');
  const myFloorPending = pending.filter((t) => !user?.assignedFloor || t.fromLocation === user.assignedFloor);

  const lowStock = materials
    .filter((m) => m.active && m.minStock > 0)
    .map((m) => ({
      material: m,
      warehouse: stockLevels.find((l) => l.id === `MATERIAL__${m.id}__WAREHOUSE`)?.quantity ?? 0,
      fridge: stockLevels.find((l) => l.id === `MATERIAL__${m.id}__FRIDGE`)?.quantity ?? 0
    }))
    .filter((x) => x.warehouse + x.fridge <= x.material.minStock);

  const mySales = sales.filter((s) => s.soldByUserId === user?.id && s.status !== 'cancelled');
  const topProducts = groupSales(sales, 'product').slice(0, 5);

  /* ------------------------- თანამშრომლის ხედი ------------------------- */
  if (user?.role === 'EMPLOYEE') {
    const floor = user.assignedFloor;
    const floorStock = products
      .filter((p) => p.active && p.kind === 'PRODUCED')
      .map((p) => ({ product: p, qty: stockLevels.find((l) => l.id === `PRODUCT__${p.id}__${floor}`)?.quantity ?? 0 }))
      .filter((x) => x.qty > 0 || x.product.productionFloor === floor);

    return (
      <div className="space-y-4">
        {myFloorPending.length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <ArrowRightLeft className="w-5 h-5 text-amber-700" />
                <h2 className="text-sm font-bold text-amber-900">ახალი მოთხოვნები — {myFloorPending.length}</h2>
              </div>
              <div className="space-y-2">
                {myFloorPending.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onNavigate('transfers')}
                    className="w-full bg-white border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between hover:shadow-md transition cursor-pointer"
                  >
                    <span className="text-left">
                      <span className="block text-sm font-bold text-slate-800">{t.productName}</span>
                      <span className="block text-[11px] text-slate-500">
                        {t.requestNo} · მოითხოვა {t.requestedByName}
                      </span>
                    </span>
                    <Badge tone="amber">
                      ასატანია {formatQty(t.remainingQuantity)} {t.unitSymbol}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="დღეს ცხობები" value={String(production.filter((p) => p.bakerId === user.id).length)} icon={CookingPot} tone="amber" />
          <StatCard
            label="დღეს გამომცხვარი"
            value={formatQty(production.filter((p) => p.bakerId === user.id).reduce((s, p) => s + p.producedGoodQty, 0))}
            tone="green"
          />
          <StatCard label="შესასრულებელი მოთხოვნები" value={String(myFloorPending.length)} icon={ArrowRightLeft} tone="blue" />
          <StatCard label="დაბალი ნაშთი" value={String(lowStock.length)} icon={AlertTriangle} tone={lowStock.length ? 'red' : 'slate'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader title={`მზა პროდუქტის მარაგი — ${floor ? FLOOR_LABELS[floor] : ''}`} icon={Package} />
            <Table
              head={
                <tr>
                  <Th>პროდუქტი</Th>
                  <Th className="text-right">ნაშთი</Th>
                </tr>
              }
            >
              {floorStock.map((x) => (
                <tr key={x.product.id}>
                  <Td className="font-semibold">{x.product.name}</Td>
                  <Td className="text-right font-bold">
                    {formatQty(x.qty)} {x.product.unitSymbol}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card>
            <CardHeader title="ნედლეულის ნაშთი" icon={Boxes} />
            <Table
              head={
                <tr>
                  <Th>მასალა</Th>
                  <Th className="text-right">{LOCATION_LABELS.WAREHOUSE}</Th>
                  <Th className="text-right">{LOCATION_LABELS.FRIDGE}</Th>
                </tr>
              }
            >
              {materials
                .filter((m) => m.active)
                .map((m) => {
                  const wh = stockLevels.find((l) => l.id === `MATERIAL__${m.id}__WAREHOUSE`)?.quantity ?? 0;
                  const fr = stockLevels.find((l) => l.id === `MATERIAL__${m.id}__FRIDGE`)?.quantity ?? 0;
                  return (
                    <tr key={m.id}>
                      <Td className="font-semibold">{m.name}</Td>
                      <Td className="text-right">
                        {formatQty(wh)} {m.unitSymbol}
                      </Td>
                      <Td className="text-right">
                        {formatQty(fr)} {m.unitSymbol}
                      </Td>
                    </tr>
                  );
                })}
            </Table>
          </Card>
        </div>

        <Button icon={CookingPot} size="lg" onClick={() => onNavigate('production')}>
          ახალი წარმოების დამატება
        </Button>
      </div>
    );
  }

  /* ---------------------------- მოლარის ხედი --------------------------- */
  if (user?.role === 'CASHIER') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="ჩემი გაყიდვები დღეს" value={String(mySales.length)} icon={ShoppingCart} tone="blue" />
          <StatCard
            label="ჩემი შემოსავალი"
            value={formatMoney(mySales.reduce((s, x) => s + x.grandTotalTetri, 0))}
            icon={TrendingUp}
            tone="green"
          />
          <StatCard label="ცვლა" value={myShift ? 'ღიაა' : 'დახურულია'} icon={Receipt} tone={myShift ? 'green' : 'red'} onClick={() => onNavigate('shift')} />
          <StatCard label="საწყისი ნაღდი" value={formatMoney(myShift?.openingCashTetri ?? 0)} icon={Wallet} />
        </div>

        <Button icon={ShoppingCart} size="lg" onClick={() => onNavigate('pos')}>
          POS — ახალი გაყიდვა
        </Button>

        <Card>
          <CardHeader title="ჩემი ბოლო გაყიდვები" icon={Receipt} />
          {mySales.length === 0 ? (
            <EmptyState title="დღეს გაყიდვა ჯერ არ დაფიქსირებულა" />
          ) : (
            <Table
              head={
                <tr>
                  <Th>დოკუმენტი</Th>
                  <Th>დრო</Th>
                  <Th>ჩაიბარა</Th>
                  <Th className="text-right">თანხა</Th>
                </tr>
              }
            >
              {mySales
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 15)
                .map((s) => (
                  <tr key={s.id}>
                    <Td className="font-bold">{s.saleNo}</Td>
                    <Td className="text-xs text-slate-500">{formatDateTime(s.date)}</Td>
                    <Td className="text-xs">{s.receivedByName}</Td>
                    <Td className="text-right font-bold">{formatMoney(s.grandTotalTetri)}</Td>
                  </tr>
                ))}
            </Table>
          )}
        </Card>
      </div>
    );
  }

  /* -------------------------- მფლობელის ხედი --------------------------- */
  return (
    <div className="space-y-4">
      {loading ? (
        <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="დღევანდელი გაყიდვები" value={formatMoney(summary?.grossSalesTetri ?? 0)} hint={`${summary?.salesCount ?? 0} დოკუმენტი`} icon={ShoppingCart} tone="green" />
          <StatCard label="გაყიდული ერთეული" value={formatQty(summary?.soldUnits ?? 0)} icon={Package} />
          <StatCard label="თვითღირებულება (COGS)" value={formatMoney(summary?.cogsTetri ?? 0)} tone="amber" />
          <StatCard label="მთლიანი მოგება" value={formatMoney(summary?.grossProfitTetri ?? 0)} icon={TrendingUp} tone="green" />
          <StatCard label="ხარჯები" value={formatMoney(summary?.expensesTetri ?? 0)} tone="red" />
          <StatCard
            label="სუფთა მოგება"
            value={formatMoney(summary?.netProfitTetri ?? 0)}
            tone={(summary?.netProfitTetri ?? 0) >= 0 ? 'green' : 'red'}
          />
          <StatCard label="დღევანდელი წარმოება" value={formatQty(summary?.producedUnits ?? 0)} hint={`დანაკარგი ${formatQty(summary?.wasteUnits ?? 0)}`} icon={CookingPot} tone="blue" />
          <StatCard label="მასალის ხარჯი" value={formatMoney(summary?.materialCostTetri ?? 0)} icon={Boxes} />
          <StatCard label="სალაროში მოსალოდნელი" value={formatMoney(summary?.expectedCashTetri ?? 0)} icon={Wallet} tone="amber" />
          <StatCard label="შესყიდვები დღეს" value={formatMoney(summary?.purchasesTetri ?? 0)} />
          <StatCard
            label="გადატანის მოთხოვნები"
            value={String(pending.length)}
            icon={ArrowRightLeft}
            tone={pending.length ? 'amber' : 'slate'}
            onClick={() => onNavigate('transfers')}
          />
          <StatCard
            label="დაბალი ნაშთი"
            value={String(lowStock.length)}
            icon={AlertTriangle}
            tone={lowStock.length ? 'red' : 'slate'}
            onClick={() => onNavigate('stock_warehouse')}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="დღეს ყველაზე გაყიდვადი" icon={TrendingUp} />
          {topProducts.length === 0 ? (
            <EmptyState title="დღეს გაყიდვა ჯერ არ დაფიქსირებულა" />
          ) : (
            <Table
              head={
                <tr>
                  <Th>პროდუქტი</Th>
                  <Th className="text-right">რაოდენობა</Th>
                  <Th className="text-right">ბრუნვა</Th>
                  <Th className="text-right">მოგება</Th>
                </tr>
              }
            >
              {topProducts.map((g) => (
                <tr key={g.key}>
                  <Td className="font-semibold">{g.label}</Td>
                  <Td className="text-right">{formatQty(g.quantity)}</Td>
                  <Td className="text-right font-bold">{formatMoney(g.revenueTetri)}</Td>
                  <Td className="text-right text-emerald-700">{formatMoney(g.profitTetri)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="დღევანდელი წარმოება" icon={CookingPot} />
          {production.length === 0 ? (
            <EmptyState title="დღეს ცხობა ჯერ არ დაფიქსირებულა" />
          ) : (
            <Table
              head={
                <tr>
                  <Th>პროდუქტი</Th>
                  <Th>სართული</Th>
                  <Th>მცხობელი</Th>
                  <Th className="text-right">რაოდენობა</Th>
                </tr>
              }
            >
              {production.map((p) => (
                <tr key={p.id}>
                  <Td className="font-semibold">{p.productName}</Td>
                  <Td className="text-xs">{FLOOR_LABELS[p.floor]}</Td>
                  <Td className="text-xs">{p.bakerName}</Td>
                  <Td className="text-right font-bold">{formatQty(p.producedGoodQty)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      {(pending.length > 0 || lowStock.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pending.length > 0 && (
            <Card>
              <CardHeader title="შესასრულებელი გადატანები" icon={ArrowRightLeft} />
              <Table
                head={
                  <tr>
                    <Th>დოკუმენტი</Th>
                    <Th>პროდუქტი</Th>
                    <Th className="text-right">დარჩენილი</Th>
                  </tr>
                }
              >
                {pending.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => onNavigate('transfers')}>
                    <Td className="font-bold">{t.requestNo}</Td>
                    <Td>{t.productName}</Td>
                    <Td className="text-right font-bold">
                      {formatQty(t.remainingQuantity)} {t.unitSymbol}
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
          {lowStock.length > 0 && (
            <Card>
              <CardHeader title="დაბალი ნაშთი" icon={AlertTriangle} />
              <Table
                head={
                  <tr>
                    <Th>მასალა</Th>
                    <Th className="text-right">ნაშთი</Th>
                    <Th className="text-right">მინიმუმი</Th>
                  </tr>
                }
              >
                {lowStock.map((x) => (
                  <tr key={x.material.id}>
                    <Td className="font-semibold">{x.material.name}</Td>
                    <Td className="text-right text-red-600 font-bold">
                      {formatQty(x.warehouse + x.fridge)} {x.material.unitSymbol}
                    </Td>
                    <Td className="text-right text-slate-500">{formatQty(x.material.minStock)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
