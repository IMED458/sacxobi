import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Boxes, CookingPot, Download, TrendingUp, Truck } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Select, StatCard, Table, Td, Th } from '../components/ui';
import { Input } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { RANGE_LABELS, formatDate, formatDateTime, resolveRange, type RangePreset } from '../lib/dates';
import { formatMoney, formatQty, marginPercent, safeDiv } from '../lib/money';
import { FLOOR_LABELS, LOCATION_LABELS } from '../lib/permissions';
import {
  computeRangeReport,
  groupMaterialUsage,
  groupSales,
  type Grouped
} from '../services/reports';
import type { ProductionBatch, Purchase, Sale, SaleReturn, Expense, StockMovement } from '../types';

interface RangeData {
  sales: Sale[];
  returns: SaleReturn[];
  expenses: Expense[];
  purchases: Purchase[];
  production: ProductionBatch[];
  movements: StockMovement[];
  profit: ReturnType<typeof import('../services/reports').computeProfit>;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function downloadCsv(name: string, rows: (string | number)[][]): void {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

const RangeBar: React.FC<{
  preset: RangePreset;
  from: string;
  to: string;
  onPreset: (p: RangePreset) => void;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}> = ({ preset, from, to, onPreset, onFrom, onTo }) => (
  <>
    <Select value={preset} onChange={(e) => onPreset(e.target.value as RangePreset)} className="w-40">
      {Object.entries(RANGE_LABELS).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </Select>
    <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className="w-40" />
    <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} className="w-40" />
  </>
);

function useRangeData() {
  const toast = useToast();
  const [preset, setPreset] = useState<RangePreset>('this_month');
  const initial = resolveRange('this_month');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [data, setData] = useState<RangeData | null>(null);
  const [loading, setLoading] = useState(true);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') {
      const r = resolveRange(p);
      setFrom(r.from);
      setTo(r.to);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await computeRangeReport(from, to));
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    preset,
    from,
    to,
    data,
    loading,
    applyPreset,
    setFrom: (v: string) => {
      setPreset('custom');
      setFrom(v);
    },
    setTo: (v: string) => {
      setPreset('custom');
      setTo(v);
    }
  };
}

/* ---------------------------- გაყიდვების რეპორტი ---------------------- */

export const SalesReportView: React.FC = () => {
  const { preset, from, to, data, loading, applyPreset, setFrom, setTo } = useRangeData();
  const [groupBy, setGroupBy] = useState<'product' | 'cashier' | 'receiver' | 'payment'>('product');
  const { can } = useAuth();

  const grouped: Grouped[] = useMemo(() => (data ? groupSales(data.sales, groupBy) : []), [data, groupBy]);
  const showProfit = can('report.profit');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="გაყიდვების რეპორტი"
          subtitle={`${formatDate(from)} — ${formatDate(to)}`}
          icon={BarChart3}
          actions={<RangeBar preset={preset} from={from} to={to} onPreset={applyPreset} onFrom={setFrom} onTo={setTo} />}
        />
        {loading || !data ? (
          <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
        ) : (
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="გაყიდვების რაოდენობა" value={String(data.profit.salesCount)} tone="blue" />
            <StatCard label="გაყიდული ერთეული" value={formatQty(data.profit.soldUnits)} />
            <StatCard label="ბრუნვა" value={formatMoney(data.profit.grossSalesTetri)} tone="green" />
            <StatCard label="წმინდა გაყიდვა" value={formatMoney(data.profit.netSalesTetri)} tone="green" />
            <StatCard label="ნაღდი" value={formatMoney(data.profit.cashTetri)} />
            <StatCard label="ბარათი" value={formatMoney(data.profit.cardTetri)} />
            <StatCard label="გადარიცხვა" value={formatMoney(data.profit.transferTetri)} />
            <StatCard label="დავალიანება" value={formatMoney(data.profit.debtTetri)} tone="red" />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="დაჯგუფება"
          actions={
            <>
              <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className="w-48">
                <option value="product">პროდუქტის მიხედვით</option>
                <option value="cashier">მოლარის მიხედვით</option>
                <option value="receiver">მიმღების მიხედვით</option>
                <option value="payment">გადახდის მეთოდით</option>
              </Select>
              <Button
                size="sm"
                variant="secondary"
                icon={Download}
                onClick={() =>
                  downloadCsv(`sales-${from}_${to}.csv`, [
                    ['დასახელება', 'რაოდენობა', 'ბრუნვა', 'თვითღირებულება', 'მოგება'],
                    ...grouped.map((g) => [g.label, g.quantity, g.revenueTetri / 100, g.costTetri / 100, g.profitTetri / 100])
                  ])
                }
              >
                CSV
              </Button>
            </>
          }
        />
        {grouped.length === 0 ? (
          <EmptyState icon={BarChart3} title="ამ პერიოდში გაყიდვა არ დაფიქსირებულა" />
        ) : (
          <Table
            head={
              <tr>
                <Th>დასახელება</Th>
                <Th className="text-right">დოკუმენტები</Th>
                <Th className="text-right">რაოდენობა</Th>
                <Th className="text-right">ბრუნვა</Th>
                {showProfit && <Th className="text-right">თვითღირებულება</Th>}
                {showProfit && <Th className="text-right">მოგება</Th>}
                {showProfit && <Th className="text-right">მარჟა</Th>}
              </tr>
            }
          >
            {grouped.map((g) => (
              <tr key={g.key} className="hover:bg-slate-50">
                <Td className="font-semibold text-slate-800">{g.label}</Td>
                <Td className="text-right">{g.count}</Td>
                <Td className="text-right">{formatQty(g.quantity)}</Td>
                <Td className="text-right font-bold">{formatMoney(g.revenueTetri)}</Td>
                {showProfit && <Td className="text-right text-slate-500">{formatMoney(g.costTetri)}</Td>}
                {showProfit && (
                  <Td className={`text-right font-semibold ${g.profitTetri >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatMoney(g.profitTetri)}
                  </Td>
                )}
                {showProfit && <Td className="text-right text-slate-500">{marginPercent(g.profitTetri, g.revenueTetri)}%</Td>}
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};

/* ---------------------------- წარმოების რეპორტი ----------------------- */

export const ProductionReportView: React.FC = () => {
  const { preset, from, to, data, loading, applyPreset, setFrom, setTo } = useRangeData();
  const { can } = useAuth();
  const showCost = can('production.view_cost') || can('report.profit');

  const usage = useMemo(() => (data ? groupMaterialUsage(data.production) : []), [data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="წარმოების რეპორტი"
          subtitle={`${formatDate(from)} — ${formatDate(to)}`}
          icon={CookingPot}
          actions={<RangeBar preset={preset} from={from} to={to} onPreset={applyPreset} onFrom={setFrom} onTo={setTo} />}
        />
        {loading || !data ? (
          <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
        ) : data.production.length === 0 ? (
          <EmptyState icon={CookingPot} title="ამ პერიოდში წარმოება არ დაფიქსირებულა" />
        ) : (
          <>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="ცხობების რაოდენობა" value={String(data.production.length)} tone="blue" />
              <StatCard label="გამომცხვარი" value={formatQty(data.production.reduce((s, p) => s + p.producedGoodQty, 0))} tone="green" />
              <StatCard label="დანაკარგი" value={formatQty(data.production.reduce((s, p) => s + p.wasteQty, 0))} tone="red" />
              {showCost && (
                <StatCard
                  label="მასალის ღირებულება"
                  value={formatMoney(data.production.reduce((s, p) => s + p.totalMaterialCostTetri, 0))}
                  tone="amber"
                />
              )}
            </div>
            <Table
              head={
                <tr>
                  <Th>დოკუმენტი</Th>
                  <Th>თარიღი</Th>
                  <Th>პროდუქტი</Th>
                  <Th>სართული</Th>
                  <Th>მცხობელი</Th>
                  <Th className="text-right">კარგი</Th>
                  <Th className="text-right">დანაკარგი</Th>
                  {showCost && <Th className="text-right">ღირებულება</Th>}
                  {showCost && <Th className="text-right">ერთეული</Th>}
                </tr>
              }
            >
              {data.production
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <Td className="font-bold">{b.batchNo}</Td>
                    <Td className="text-xs text-slate-500">{formatDateTime(b.date)}</Td>
                    <Td>{b.productName}</Td>
                    <Td>
                      <Badge tone={b.floor === 'LOWER_FLOOR' ? 'blue' : 'amber'}>{FLOOR_LABELS[b.floor]}</Badge>
                    </Td>
                    <Td className="text-xs">{b.bakerName}</Td>
                    <Td className="text-right font-bold">{formatQty(b.producedGoodQty)}</Td>
                    <Td className="text-right text-red-600">{formatQty(b.wasteQty)}</Td>
                    {showCost && <Td className="text-right">{formatMoney(b.totalMaterialCostTetri)}</Td>}
                    {showCost && <Td className="text-right">{formatMoney(b.unitProductionCostTetri)}</Td>}
                  </tr>
                ))}
            </Table>
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title="მასალის ხარჯვის რეპორტი"
          subtitle="რომელი მასალა, რამდენი, რა ღირებულების და რომელ პროდუქტზე"
          icon={Boxes}
          actions={
            <Button
              size="sm"
              variant="secondary"
              icon={Download}
              onClick={() =>
                downloadCsv(`materials-${from}_${to}.csv`, [
                  ['მასალა', 'რაოდენობა', 'ერთეული', 'ღირებულება', 'პროდუქტები', 'მცხობლები'],
                  ...usage.map((u) => [
                    u.materialName,
                    u.quantity,
                    u.unitSymbol,
                    u.costTetri / 100,
                    Object.keys(u.products).join(' / '),
                    Object.keys(u.bakers).join(' / ')
                  ])
                ])
              }
            >
              CSV
            </Button>
          }
        />
        {usage.length === 0 ? (
          <EmptyState icon={Boxes} title="მასალის ხარჯვა არ დაფიქსირებულა" />
        ) : (
          <Table
            head={
              <tr>
                <Th>მასალა</Th>
                <Th className="text-right">დახარჯული</Th>
                {showCost && <Th className="text-right">ღირებულება</Th>}
                <Th>პროდუქტები</Th>
                <Th>მცხობლები</Th>
                <Th>სართულები</Th>
              </tr>
            }
          >
            {usage.map((u) => (
              <tr key={u.materialId} className="hover:bg-slate-50">
                <Td className="font-semibold">{u.materialName}</Td>
                <Td className="text-right font-bold">
                  {formatQty(u.quantity)} {u.unitSymbol}
                </Td>
                {showCost && <Td className="text-right">{formatMoney(u.costTetri)}</Td>}
                <Td className="text-xs text-slate-500">
                  {Object.entries(u.products)
                    .map(([k, v]) => `${k} (${formatQty(v)})`)
                    .join(', ')}
                </Td>
                <Td className="text-xs text-slate-500">{Object.keys(u.bakers).join(', ')}</Td>
                <Td className="text-xs text-slate-500">
                  {Object.keys(u.floors)
                    .map((f) => FLOOR_LABELS[f as keyof typeof FLOOR_LABELS])
                    .join(', ')}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};

/* ----------------------------- მარაგის რეპორტი ------------------------ */

export const InventoryReportView: React.FC = () => {
  const { stockLevels, transferRequests } = useData();
  const locations: (keyof typeof LOCATION_LABELS)[] = ['WAREHOUSE', 'FRIDGE', 'LOWER_FLOOR', 'UPPER_FLOOR'];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="მარაგის რეპორტი" subtitle="ნაშთი და ღირებულება ყველა ადგილას" icon={Boxes} />
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {locations.map((loc) => {
            const items = stockLevels.filter((l) => l.location === loc);
            return (
              <StatCard
                key={loc}
                label={LOCATION_LABELS[loc]}
                value={formatMoney(items.reduce((s, i) => s + i.valueTetri, 0))}
                hint={`${items.filter((i) => i.quantity > 0).length} პოზიცია`}
                tone={loc === 'FRIDGE' ? 'blue' : loc === 'WAREHOUSE' ? 'amber' : 'green'}
              />
            );
          })}
        </div>
        <Table
          head={
            <tr>
              <Th>დასახელება</Th>
              <Th>ტიპი</Th>
              <Th>ადგილი</Th>
              <Th className="text-right">ნაშთი</Th>
              <Th className="text-right">ღირებულება</Th>
              <Th className="text-right">საშ. ერთეულის ფასი</Th>
            </tr>
          }
        >
          {stockLevels
            .filter((l) => l.quantity !== 0)
            .sort((a, b) => b.valueTetri - a.valueTetri)
            .map((l) => (
              <tr key={l.id} className="hover:bg-slate-50">
                <Td className="font-semibold">{l.itemName}</Td>
                <Td>
                  <Badge tone={l.itemType === 'MATERIAL' ? 'slate' : 'blue'}>{l.itemType === 'MATERIAL' ? 'ნედლეული' : 'მზა პროდუქტი'}</Badge>
                </Td>
                <Td className="text-xs">{LOCATION_LABELS[l.location]}</Td>
                <Td className="text-right font-bold">{formatQty(l.quantity)}</Td>
                <Td className="text-right">{formatMoney(l.valueTetri)}</Td>
                <Td className="text-right text-slate-500">{formatMoney(Math.round(safeDiv(l.valueTetri, l.quantity || 1)))}</Td>
              </tr>
            ))}
        </Table>
      </Card>

      <Card>
        <CardHeader title="გადატანების რეპორტი" subtitle="ქვედა → ზედა სართული" icon={TrendingUp} />
        {transferRequests.length === 0 ? (
          <EmptyState title="გადატანა ჯერ არ დაფიქსირებულა" />
        ) : (
          <Table
            head={
              <tr>
                <Th>დოკუმენტი</Th>
                <Th>თარიღი</Th>
                <Th>პროდუქტი</Th>
                <Th className="text-right">მოთხოვნილი</Th>
                <Th className="text-right">ატანილი</Th>
                <Th>მოითხოვა</Th>
                <Th>შეასრულა</Th>
                <Th>სტატუსი</Th>
              </tr>
            }
          >
            {transferRequests.slice(0, 200).map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <Td className="font-bold">{t.requestNo}</Td>
                <Td className="text-xs text-slate-500">{formatDateTime(t.requestedAt)}</Td>
                <Td>{t.productName}</Td>
                <Td className="text-right">{formatQty(t.requestedQuantity)}</Td>
                <Td className="text-right font-bold">{formatQty(t.deliveredQuantity)}</Td>
                <Td className="text-xs">{t.requestedByName}</Td>
                <Td className="text-xs">{t.completedByName ?? '—'}</Td>
                <Td className="text-xs">{t.status}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};

/* ---------------------------- შესყიდვების რეპორტი --------------------- */

export const PurchaseReportView: React.FC = () => {
  const { preset, from, to, data, loading, applyPreset, setFrom, setTo } = useRangeData();

  const rows = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { name: string; unit: string; supplier: string; qty: number; total: number; last: number; count: number }>();
    data.purchases.forEach((p) =>
      p.items.forEach((i) => {
        const key = `${p.supplierId}__${i.itemId}`;
        const cur = map.get(key) ?? { name: i.itemName, unit: i.unitSymbol, supplier: p.supplierName, qty: 0, total: 0, last: 0, count: 0 };
        cur.qty += i.quantity;
        cur.total += i.totalCostTetri;
        cur.last = i.unitCostTetri;
        cur.count += 1;
        map.set(key, cur);
      })
    );
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <Card>
      <CardHeader
        title="შესყიდვების რეპორტი"
        subtitle={`${formatDate(from)} — ${formatDate(to)}`}
        icon={Truck}
        actions={<RangeBar preset={preset} from={from} to={to} onPreset={applyPreset} onFrom={setFrom} onTo={setTo} />}
      />
      {loading || !data ? (
        <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Truck} title="ამ პერიოდში შესყიდვა არ დაფიქსირებულა" />
      ) : (
        <>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="დოკუმენტები" value={String(data.purchases.length)} />
            <StatCard label="სულ შესყიდვა" value={formatMoney(data.purchases.reduce((s, p) => s + p.totalTetri, 0))} tone="amber" />
            <StatCard label="გადახდილი" value={formatMoney(data.purchases.reduce((s, p) => s + p.paidTetri, 0))} tone="green" />
            <StatCard label="დავალიანება" value={formatMoney(data.purchases.reduce((s, p) => s + p.balanceTetri, 0))} tone="red" />
          </div>
          <Table
            head={
              <tr>
                <Th>დასახელება</Th>
                <Th>მომწოდებელი</Th>
                <Th className="text-right">შესყიდვები</Th>
                <Th className="text-right">რაოდენობა</Th>
                <Th className="text-right">ბოლო ფასი</Th>
                <Th className="text-right">საშ. ფასი</Th>
                <Th className="text-right">ჯამი</Th>
              </tr>
            }
          >
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <Td className="font-semibold">{r.name}</Td>
                <Td className="text-xs">{r.supplier}</Td>
                <Td className="text-right">{r.count}</Td>
                <Td className="text-right">
                  {formatQty(r.qty)} {r.unit}
                </Td>
                <Td className="text-right">{formatMoney(r.last)}</Td>
                <Td className="text-right">{formatMoney(Math.round(safeDiv(r.total, r.qty || 1)))}</Td>
                <Td className="text-right font-bold">{formatMoney(r.total)}</Td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </Card>
  );
};

/* ------------------------------ მოგების რეპორტი ----------------------- */

export const ProfitReportView: React.FC = () => {
  const { preset, from, to, data, loading, applyPreset, setFrom, setTo } = useRangeData();
  const byProduct = useMemo(() => (data ? groupSales(data.sales, 'product') : []), [data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="მოგების რეპორტი"
          subtitle={`${formatDate(from)} — ${formatDate(to)} · სუფთა მოგება = მთლიანი მოგება − საოპერაციო ხარჯები`}
          icon={TrendingUp}
          actions={<RangeBar preset={preset} from={from} to={to} onPreset={applyPreset} onFrom={setFrom} onTo={setTo} />}
        />
        {loading || !data ? (
          <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="ბრუნვა (gross)" value={formatMoney(data.profit.grossSalesTetri)} tone="blue" />
              <StatCard label="ფასდაკლებები" value={formatMoney(data.profit.discountsTetri)} tone="red" />
              <StatCard label="დაბრუნებები" value={formatMoney(data.profit.returnsTetri)} tone="red" />
              <StatCard label="წმინდა გაყიდვა" value={formatMoney(data.profit.netSalesTetri)} tone="green" />
              <StatCard label="COGS (თვითღირებულება)" value={formatMoney(data.profit.cogsTetri)} tone="amber" />
              <StatCard label="მთლიანი მოგება" value={formatMoney(data.profit.grossProfitTetri)} tone="green" />
              <StatCard label="საოპერაციო ხარჯები" value={formatMoney(data.profit.expensesTetri)} tone="red" />
              <StatCard
                label="სუფთა მოგება"
                value={formatMoney(data.profit.netProfitTetri)}
                hint={`მარჟა ${marginPercent(data.profit.netProfitTetri, data.profit.netSalesTetri)}%`}
                tone={data.profit.netProfitTetri >= 0 ? 'green' : 'red'}
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-600 space-y-1">
              <p className="font-bold text-slate-700">როგორ ითვლება:</p>
              <p>წმინდა გაყიდვა = ბრუნვა − ფასდაკლება − დაბრუნებები</p>
              <p>COGS = გაყიდული მზა პროდუქციის რეალური საწარმოო თვითღირებულება (FIFO პარტიებიდან)</p>
              <p>მთლიანი მოგება = წმინდა გაყიდვა − COGS</p>
              <p>სუფთა მოგება = მთლიანი მოგება − საოპერაციო ხარჯები</p>
              <p className="text-slate-400">
                შესყიდვები ({formatMoney(data.purchases.reduce((s, p) => s + p.totalTetri, 0))}) ცალკე აღირიცხება როგორც მარაგში
                ინვესტიცია და პირდაპირ მოგებას არ აკლდება.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="მოგება პროდუქტების მიხედვით" />
        {byProduct.length === 0 ? (
          <EmptyState title="მონაცემი არ არის" />
        ) : (
          <Table
            head={
              <tr>
                <Th>პროდუქტი</Th>
                <Th className="text-right">გაყიდული</Th>
                <Th className="text-right">ბრუნვა</Th>
                <Th className="text-right">თვითღირებულება</Th>
                <Th className="text-right">მოგება</Th>
                <Th className="text-right">მარჟა</Th>
              </tr>
            }
          >
            {byProduct.map((g) => (
              <tr key={g.key} className="hover:bg-slate-50">
                <Td className="font-semibold">{g.label}</Td>
                <Td className="text-right">{formatQty(g.quantity)}</Td>
                <Td className="text-right">{formatMoney(g.revenueTetri)}</Td>
                <Td className="text-right text-slate-500">{formatMoney(g.costTetri)}</Td>
                <Td className={`text-right font-bold ${g.profitTetri >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatMoney(g.profitTetri)}
                </Td>
                <Td className="text-right text-slate-500">{marginPercent(g.profitTetri, g.revenueTetri)}%</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};
