import React, { useEffect, useState } from 'react';
import { FileClock, Plus, Trash2, Truck } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { addDays, formatDate, formatDateTime, todayBusinessDate } from '../lib/dates';
import { formatMoney, formatQty, toTetri } from '../lib/money';
import { LOCATION_LABELS } from '../lib/permissions';
import { createPurchase, type PurchaseItemInput } from '../services/purchases';
import { fetchPurchasesRange } from '../services/reports';
import type { PaymentMethod, Purchase, StockLocation } from '../types';
import { DeleteRecordButton } from '../components/DeleteRecordButton';
import { COL } from '../services/db';

interface DraftLine extends Omit<PurchaseItemInput, 'unitCostTetri'> {
  unitCostText: string;
}

export const PurchaseNewView: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { user } = useAuth();
  const { suppliers, materials, products, settings } = useData();
  const toast = useToast();

  const [supplierId, setSupplierId] = useState('');
  const [paidText, setPaidText] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [comment, setComment] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  const addMaterialLine = () => {
    const m = materials.find((x) => x.active);
    if (!m) {
      toast.warning('ჯერ დაამატეთ ნედლეული პარამეტრებში');
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        itemType: 'MATERIAL',
        itemId: m.id,
        itemName: m.name,
        itemCode: m.code,
        unitSymbol: m.unitSymbol,
        quantity: 0,
        unitCostText: '0',
        location: m.defaultStorageLocation
      }
    ]);
  };

  const addProductLine = () => {
    const p = products.find((x) => x.active && x.kind === 'RESALE') ?? products.find((x) => x.active);
    if (!p) {
      toast.warning('ჯერ დაამატეთ პროდუქტი');
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        itemType: 'PRODUCT',
        itemId: p.id,
        itemName: p.name,
        itemCode: p.code,
        unitSymbol: p.unitSymbol,
        quantity: 0,
        unitCostText: '0',
        location: p.salesLocation
      }
    ]);
  };

  const update = (idx: number, patch: Partial<DraftLine>) =>
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });

  const totalTetri = lines.reduce((s, l) => s + Math.round(toTetri(l.unitCostText) * l.quantity), 0);
  const paidTetri = toTetri(paidText || '0');

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const supplier = suppliers.find((s) => s.id === supplierId);
      const purchase = await createPurchase(user, settings, {
        supplierId,
        supplierName: supplier?.name ?? '',
        items: lines.map((l) => ({
          itemType: l.itemType,
          itemId: l.itemId,
          itemName: l.itemName,
          itemCode: l.itemCode,
          unitSymbol: l.unitSymbol,
          quantity: l.quantity,
          unitCostTetri: toTetri(l.unitCostText),
          location: l.location
        })),
        paidTetri,
        paymentMethod,
        comment: comment || undefined
      });
      toast.success(`შესყიდვა დაფიქსირდა — ${purchase.documentNo}`);
      setLines([]);
      setPaidText('0');
      setComment('');
      onDone();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="ახალი შემოსვლა / შესყიდვა"
        subtitle="ერთ დოკუმენტში შეიძლება რამდენიმე სხვადასხვა პოზიცია"
        icon={Truck}
        actions={
          <>
            <Button size="sm" variant="secondary" icon={Plus} onClick={addMaterialLine}>
              ნედლეული
            </Button>
            <Button size="sm" variant="secondary" icon={Plus} onClick={addProductLine}>
              მზა პროდუქტი
            </Button>
          </>
        }
      />
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="მომწოდებელი" required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— აირჩიეთ —</option>
              {suppliers
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="გადახდის ფორმა">
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              <option value="CASH">ნაღდი</option>
              <option value="CARD">ბარათი</option>
              <option value="BANK_TRANSFER">საბანკო გადარიცხვა</option>
              <option value="DEBT">დავალიანება</option>
            </Select>
          </Field>
          <Field label="კომენტარი">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>

        {lines.length === 0 ? (
          <EmptyState icon={Truck} title="დაამატეთ პოზიციები" description="ნედლეული საწყობში/მაცივარში ან მზა პროდუქტი გასაყიდად" />
        ) : (
          <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {lines.map((line, idx) => {
              const options = line.itemType === 'MATERIAL' ? materials.filter((m) => m.active) : products.filter((p) => p.active);
              return (
                <div key={idx} className="p-3 grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <Field label={line.itemType === 'MATERIAL' ? 'ნედლეული' : 'მზა პროდუქტი'}>
                      <Select
                        value={line.itemId}
                        onChange={(e) => {
                          const found = options.find((o) => o.id === e.target.value);
                          if (!found) return;
                          const unitSymbol = 'unitSymbol' in found ? found.unitSymbol : 'ცალი';
                          const location =
                            line.itemType === 'MATERIAL'
                              ? (found as { defaultStorageLocation: StockLocation }).defaultStorageLocation
                              : (found as { salesLocation: StockLocation }).salesLocation;
                          update(idx, { itemId: found.id, itemName: found.name, itemCode: found.code, unitSymbol, location });
                        }}
                      >
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label={`რაოდენობა (${line.unitSymbol})`}>
                      <Input
                        value={line.quantity}
                        onChange={(e) => update(idx, { quantity: Number(e.target.value) || 0 })}
                        type="number"
                        step="0.001"
                      />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="ფასი ერთეულზე (₾)">
                      <Input value={line.unitCostText} onChange={(e) => update(idx, { unitCostText: e.target.value })} inputMode="decimal" />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="სად შედის">
                      <Select value={line.location} onChange={(e) => update(idx, { location: e.target.value as StockLocation })}>
                        <option value="WAREHOUSE">{LOCATION_LABELS.WAREHOUSE}</option>
                        <option value="FRIDGE">{LOCATION_LABELS.FRIDGE}</option>
                        <option value="LOWER_FLOOR">{LOCATION_LABELS.LOWER_FLOOR}</option>
                        <option value="UPPER_FLOOR">{LOCATION_LABELS.UPPER_FLOOR}</option>
                      </Select>
                    </Field>
                  </div>
                  <div className="col-span-1 text-right text-sm font-bold text-slate-800 pb-2.5">
                    {formatMoney(Math.round(toTetri(line.unitCostText) * line.quantity), false)}
                  </div>
                  <div className="col-span-1 flex justify-end pb-2">
                    <button
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-slate-300 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4 pt-2 border-t border-slate-200">
          <div className="flex gap-4">
            <Field label="გადახდილი თანხა (₾)">
              <Input value={paidText} onChange={(e) => setPaidText(e.target.value)} inputMode="decimal" className="w-40" />
            </Field>
            <div className="pb-2.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase">დარჩენილი დავალიანება</p>
              <p className="text-lg font-bold text-red-600">{formatMoney(Math.max(0, totalTetri - paidTetri))}</p>
            </div>
          </div>
          <div className="flex items-end gap-4">
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-500 uppercase">სულ დოკუმენტი</p>
              <p className="text-2xl font-bold text-slate-900">{formatMoney(totalTetri)}</p>
            </div>
            <Button size="lg" onClick={() => void submit()} loading={saving} disabled={!supplierId || !lines.length}>
              შესყიდვის შენახვა
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export const PurchaseHistoryView: React.FC = () => {
  const toast = useToast();
  const { can } = useAuth();
  const [from, setFrom] = useState(addDays(todayBusinessDate(), -30));
  const [to, setTo] = useState(todayBusinessDate());
  const [items, setItems] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Purchase | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPurchasesRange(from, to)
      .then((data) => !cancelled && setItems(data.sort((a, b) => b.date.localeCompare(a.date))))
      .catch((err) => toast.error(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const showCost = can('purchase.view_cost');

  return (
    <Card>
      <CardHeader
        title="შესყიდვების ისტორია"
        icon={FileClock}
        actions={
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </>
        }
      />
      {loading ? (
        <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Truck} title="ამ პერიოდში შესყიდვა არ დაფიქსირებულა" />
      ) : (
        <Table
          head={
            <tr>
              <Th>დოკუმენტი</Th>
              <Th>თარიღი</Th>
              <Th>მომწოდებელი</Th>
              <Th className="text-right">პოზიციები</Th>
              {showCost && <Th className="text-right">ჯამი</Th>}
              {showCost && <Th className="text-right">გადახდილი</Th>}
              {showCost && <Th className="text-right">დავალიანება</Th>}
              <Th>შემქმნელი</Th>
              <Th />
            </tr>
          }
        >
          {items.map((p) => (
            <tr key={p.id} onClick={() => setDetail(p)} className="hover:bg-amber-50/50 cursor-pointer">
              <Td className="font-bold text-slate-900">{p.documentNo}</Td>
              <Td className="text-xs text-slate-500">{formatDateTime(p.date)}</Td>
              <Td>{p.supplierName}</Td>
              <Td className="text-right">{p.items.length}</Td>
              {showCost && <Td className="text-right font-bold">{formatMoney(p.totalTetri)}</Td>}
              {showCost && <Td className="text-right text-emerald-700">{formatMoney(p.paidTetri)}</Td>}
              {showCost && <Td className="text-right text-red-600">{formatMoney(p.balanceTetri)}</Td>}
              <Td className="text-xs">{p.createdByName}</Td>
              <Td onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end">
                  <DeleteRecordButton
                    collection={COL.purchases}
                    id={p.id}
                    entityType="purchase"
                    label={`შესყიდვა ${p.documentNo}`}
                    warning="დოკუმენტი წაიშლება, მაგრამ შემოსული მარაგი ავტომატურად არ ჩამოიწერება — საჭიროებისას გამოიყენეთ ინვენტარიზაცია."
                  />
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={`შესყიდვა ${detail?.documentNo ?? ''}`} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase">მომწოდებელი</p>
                <p className="font-semibold">{detail.supplierName}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase">თარიღი</p>
                <p className="font-semibold">{formatDate(detail.businessDate)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase">გადახდილი</p>
                <p className="font-semibold text-emerald-700">{formatMoney(detail.paidTetri)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase">დავალიანება</p>
                <p className="font-semibold text-red-600">{formatMoney(detail.balanceTetri)}</p>
              </div>
            </div>
            <Table
              head={
                <tr>
                  <Th>დასახელება</Th>
                  <Th>ადგილი</Th>
                  <Th className="text-right">რაოდენობა</Th>
                  <Th className="text-right">ფასი</Th>
                  <Th className="text-right">ჯამი</Th>
                </tr>
              }
            >
              {detail.items.map((i) => (
                <tr key={i.id}>
                  <Td className="font-semibold">
                    {i.itemName} <Badge tone={i.itemType === 'MATERIAL' ? 'slate' : 'blue'}>{i.itemType === 'MATERIAL' ? 'ნედლეული' : 'პროდუქტი'}</Badge>
                  </Td>
                  <Td className="text-xs">{LOCATION_LABELS[i.location]}</Td>
                  <Td className="text-right">
                    {formatQty(i.quantity)} {i.unitSymbol}
                  </Td>
                  <Td className="text-right">{formatMoney(i.unitCostTetri)}</Td>
                  <Td className="text-right font-bold">{formatMoney(i.totalCostTetri)}</Td>
                </tr>
              ))}
            </Table>
            <div className="text-right text-lg font-bold">სულ: {formatMoney(detail.totalTetri)}</div>
            {detail.comment && <p className="text-xs text-slate-500">კომენტარი: {detail.comment}</p>}
          </div>
        )}
      </Modal>
    </Card>
  );
};
