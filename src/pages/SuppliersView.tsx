import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Plus, TrendingDown, Wallet } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatDate } from '../lib/dates';
import { formatMoney, formatQty, toTetri } from '../lib/money';
import { saveSupplier } from '../services/catalog';
import { paySupplier } from '../services/purchases';
import { fetchAll } from '../services/db';
import { COL } from '../services/db';
import { DeleteRecordButton } from '../components/DeleteRecordButton';
import type { Purchase, Supplier } from '../types';

interface PriceRow {
  itemName: string;
  unitSymbol: string;
  count: number;
  lastTetri: number;
  minTetri: number;
  maxTetri: number;
  avgTetri: number;
  totalQty: number;
  history: { date: string; documentNo: string; quantity: number; unitCostTetri: number }[];
}

export const SuppliersView: React.FC = () => {
  const { user, can } = useAuth();
  const { suppliers } = useData();
  const toast = useToast();

  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Supplier | null>(null);
  const [paying, setPaying] = useState<Supplier | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', taxId: '', contactPerson: '', phone: '', address: '', comment: '' });

  useEffect(() => {
    fetchAll<Purchase>(COL.purchases)
      .then(setPurchases)
      .catch(() => setPurchases([]));
  }, []);

  const openForm = (supplier?: Supplier) => {
    if (supplier) {
      setEditing(supplier);
      setForm({
        name: supplier.name,
        taxId: supplier.taxId ?? '',
        contactPerson: supplier.contactPerson ?? '',
        phone: supplier.phone ?? '',
        address: supplier.address ?? '',
        comment: supplier.comment ?? ''
      });
    } else {
      setEditing(null);
      setForm({ name: '', taxId: '', contactPerson: '', phone: '', address: '', comment: '' });
    }
    setCreating(true);
  };

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveSupplier(
        user,
        {
          id: editing?.id ?? '',
          name: form.name,
          taxId: form.taxId || undefined,
          contactPerson: form.contactPerson || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
          comment: form.comment || undefined,
          active: true
        },
        editing ?? undefined
      );
      toast.success(editing ? 'მომწოდებელი განახლდა' : 'მომწოდებელი დაემატა');
      setCreating(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitPayment = async () => {
    if (!user || !paying) return;
    setSaving(true);
    try {
      await paySupplier(user, paying.id, toTetri(payAmount));
      toast.success('გადახდა დაფიქსირდა');
      setPaying(null);
      setPayAmount('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const priceRows = useMemo<PriceRow[]>(() => {
    if (!detail) return [];
    const map = new Map<string, PriceRow>();
    purchases
      .filter((p) => p.supplierId === detail.id && p.status === 'completed')
      .forEach((p) =>
        p.items.forEach((i) => {
          const row =
            map.get(i.itemId) ??
            ({
              itemName: i.itemName,
              unitSymbol: i.unitSymbol,
              count: 0,
              lastTetri: 0,
              minTetri: Number.MAX_SAFE_INTEGER,
              maxTetri: 0,
              avgTetri: 0,
              totalQty: 0,
              history: []
            } as PriceRow);
          row.count += 1;
          row.minTetri = Math.min(row.minTetri, i.unitCostTetri);
          row.maxTetri = Math.max(row.maxTetri, i.unitCostTetri);
          row.totalQty += i.quantity;
          row.history.push({ date: p.businessDate, documentNo: p.documentNo, quantity: i.quantity, unitCostTetri: i.unitCostTetri });
          map.set(i.itemId, row);
        })
      );
    return [...map.values()].map((row) => {
      row.history.sort((a, b) => b.date.localeCompare(a.date));
      row.lastTetri = row.history[0]?.unitCostTetri ?? 0;
      const totalCost = row.history.reduce((s, h) => s + h.unitCostTetri * h.quantity, 0);
      const totalQty = row.history.reduce((s, h) => s + h.quantity, 0);
      row.avgTetri = totalQty ? Math.round(totalCost / totalQty) : 0;
      return row;
    });
  }, [detail, purchases]);

  const totalDebt = suppliers.reduce((s, x) => s + Math.max(0, x.balanceTetri), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="მომწოდებლები"
          subtitle="ვისგან ვყიდულობთ და რა დავალიანება გვაქვს"
          icon={Building2}
          actions={
            <>
              <Badge tone="red">სულ დავალიანება: {formatMoney(totalDebt)}</Badge>
              {can('supplier.manage') && (
                <Button icon={Plus} onClick={() => openForm()}>
                  ახალი მომწოდებელი
                </Button>
              )}
            </>
          }
        />
        {suppliers.length === 0 ? (
          <EmptyState icon={Building2} title="მომწოდებელი არ არის დამატებული" />
        ) : (
          <Table
            head={
              <tr>
                <Th>დასახელება</Th>
                <Th>ს/კ</Th>
                <Th>საკონტაქტო</Th>
                <Th>ტელეფონი</Th>
                <Th className="text-right">დავალიანება</Th>
                <Th />
              </tr>
            }
          >
            {suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td className="font-semibold text-slate-800 cursor-pointer" onClick={() => setDetail(s)}>
                  {s.name}
                </Td>
                <Td className="text-xs text-slate-500">{s.taxId ?? '—'}</Td>
                <Td className="text-xs">{s.contactPerson ?? '—'}</Td>
                <Td className="text-xs">{s.phone ?? '—'}</Td>
                <Td className={`text-right font-bold ${s.balanceTetri > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {formatMoney(s.balanceTetri)}
                </Td>
                <Td>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="secondary" onClick={() => setDetail(s)}>
                      ისტორია
                    </Button>
                    {can('supplier.manage') && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => openForm(s)}>
                          რედაქტირება
                        </Button>
                        {s.balanceTetri > 0 && (
                          <Button size="sm" icon={Wallet} onClick={() => setPaying(s)}>
                            გადახდა
                          </Button>
                        )}
                      </>
                    )}
                    <DeleteRecordButton
                      collection={COL.suppliers}
                      id={s.id}
                      entityType="supplier"
                      label={`მომწოდებელი „${s.name}"`}
                      warning={
                        s.balanceTetri > 0
                          ? `ყურადღება: ამ მომწოდებელს ერიცხება დავალიანება ${formatMoney(s.balanceTetri)}. წაშლის შემდეგ ეს ინფორმაცია დაიკარგება.`
                          : 'მომწოდებელი წაიშლება. შესყიდვების ისტორია არ დაზიანდება — დოკუმენტები დასახელებას snapshot-ად ინახავენ.'
                      }
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={editing ? 'მომწოდებლის რედაქტირება' : 'ახალი მომწოდებელი'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submit()} loading={saving} disabled={!form.name.trim()}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="დასახელება" required className="md:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="საიდენტიფიკაციო კოდი">
            <Input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </Field>
          <Field label="საკონტაქტო პირი">
            <Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
          </Field>
          <Field label="ტელეფონი">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label="მისამართი">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          <Field label="კომენტარი" className="md:col-span-2">
            <Textarea rows={2} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name ?? ''} subtitle="მოწოდებული პროდუქცია და ფასების ისტორია" size="lg">
        {priceRows.length === 0 ? (
          <EmptyState icon={TrendingDown} title="ამ მომწოდებლისგან შესყიდვა ჯერ არ დაფიქსირებულა" />
        ) : (
          <div className="space-y-5">
            <Table
              head={
                <tr>
                  <Th>დასახელება</Th>
                  <Th className="text-right">შესყიდვები</Th>
                  <Th className="text-right">სულ რაოდ.</Th>
                  <Th className="text-right">ბოლო ფასი</Th>
                  <Th className="text-right">მინ.</Th>
                  <Th className="text-right">მაქს.</Th>
                  <Th className="text-right">საშუალო</Th>
                </tr>
              }
            >
              {priceRows.map((r) => (
                <tr key={r.itemName}>
                  <Td className="font-semibold">{r.itemName}</Td>
                  <Td className="text-right">{r.count}</Td>
                  <Td className="text-right">
                    {formatQty(r.totalQty)} {r.unitSymbol}
                  </Td>
                  <Td className="text-right font-bold">{formatMoney(r.lastTetri)}</Td>
                  <Td className="text-right text-emerald-700">{formatMoney(r.minTetri)}</Td>
                  <Td className="text-right text-red-600">{formatMoney(r.maxTetri)}</Td>
                  <Td className="text-right">{formatMoney(r.avgTetri)}</Td>
                </tr>
              ))}
            </Table>

            {priceRows.map((r) => (
              <div key={`h-${r.itemName}`}>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">{r.itemName} — ფასების ისტორია</p>
                <div className="flex flex-wrap gap-2">
                  {r.history.map((h, i) => (
                    <span key={i} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px]">
                      {formatDate(h.date)} · {formatMoney(h.unitCostTetri)} / {r.unitSymbol} · {formatQty(h.quantity)}
                      <span className="text-slate-400"> ({h.documentNo})</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={!!paying}
        onClose={() => setPaying(null)}
        title="მომწოდებლისთვის გადახდა"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPaying(null)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitPayment()} loading={saving}>
              დადასტურება
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            მიმდინარე დავალიანება: <span className="font-bold">{formatMoney(paying?.balanceTetri ?? 0)}</span>
          </p>
          <Field label="თანხა (₾)" required>
            <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
      </Modal>
    </div>
  );
};
