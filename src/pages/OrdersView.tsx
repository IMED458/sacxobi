import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus, Trash2, Truck, Wallet, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { addDays, formatDate, formatDateTime, todayBusinessDate } from '../lib/dates';
import { formatMoney, formatQty, toTetri } from '../lib/money';
import { COL, colRef, query } from '../services/db';
import { getDocs, where } from 'firebase/firestore';
import { adminDelete } from '../services/admin';
import {
  ORDER_STATUS_LABELS,
  addOrderPayment,
  cancelOrder,
  createOrder,
  fulfillOrder,
  updateOrderStatus,
  type OrderLineInput
} from '../services/orders';
import type { Order, OrderStatus, PaymentMethod } from '../types';

const TONES: Record<OrderStatus, 'amber' | 'blue' | 'green' | 'red' | 'slate'> = {
  NEW: 'amber',
  PREPARING: 'blue',
  READY: 'green',
  FULFILLED: 'slate',
  CANCELLED: 'red'
};

export const OrdersView: React.FC = () => {
  const { user, can } = useAuth();
  const { products, settings, myShift } = useData();
  const toast = useToast();

  const [from, setFrom] = useState(addDays(todayBusinessDate(), -30));
  const [to, setTo] = useState(addDays(todayBusinessDate(), 30));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | OrderStatus>('open');

  const [showNew, setShowNew] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [prepaid, setPrepaid] = useState('0');
  const [comment, setComment] = useState('');
  const [lines, setLines] = useState<OrderLineInput[]>([]);

  const [payTarget, setPayTarget] = useState<Order | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('CASH');

  const [fulfillTarget, setFulfillTarget] = useState<Order | null>(null);
  const [receivedByName, setReceivedByName] = useState('');
  const [fulfillMethod, setFulfillMethod] = useState<PaymentMethod>('CASH');

  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(colRef(COL.orders), where('businessDate', '>=', from), where('businessDate', '<=', to))
      );
      setOrders(snap.docs.map((d) => d.data() as Order).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const visible = orders.filter((o) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'open') return o.status !== 'FULFILLED' && o.status !== 'CANCELLED';
    return o.status === statusFilter;
  });

  const addLine = () => {
    const p = products.find((x) => x.active);
    if (!p) {
      toast.warning('ჯერ დაამატეთ პროდუქტი');
      return;
    }
    setLines((prev) => [
      ...prev,
      { productId: p.id, productName: p.name, unitSymbol: p.unitSymbol, quantity: 1, priceTetri: p.sellingPriceTetri }
    ]);
  };

  const total = lines.reduce((s, l) => s + Math.round(l.priceTetri * l.quantity), 0);

  const submitNew = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const order = await createOrder(user, {
        customerName,
        customerPhone: customerPhone || undefined,
        dueDate: dueDate || undefined,
        lines,
        prepaidTetri: toTetri(prepaid || '0'),
        paymentMethod: 'CASH',
        comment: comment || undefined
      });
      toast.success(`შეკვეთა შეიქმნა — ${order.orderNo}`);
      setShowNew(false);
      setCustomerName('');
      setCustomerPhone('');
      setDueDate('');
      setPrepaid('0');
      setComment('');
      setLines([]);
      void load();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const doAction = async (fn: () => Promise<unknown>, done: string) => {
    setSaving(true);
    try {
      await fn();
      toast.success(done);
      void load();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="შეკვეთები"
          subtitle="წინასწარი შეკვეთები, ავანსი და გაცემა — მარაგი ჩამოიწერება მხოლოდ გაცემისას"
          icon={ClipboardList}
          actions={
            <>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="w-40">
                <option value="open">აქტიური</option>
                <option value="all">ყველა</option>
                {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              {can('order.manage') && (
                <Button icon={Plus} onClick={() => setShowNew(true)}>
                  ახალი შეკვეთა
                </Button>
              )}
            </>
          }
        />
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
        ) : visible.length === 0 ? (
          <EmptyState icon={ClipboardList} title="შეკვეთა ვერ მოიძებნა" description="ახალი შეკვეთა შეგიძლიათ POS-იდანაც შექმნათ" />
        ) : (
          <Table
            head={
              <tr>
                <Th>დოკუმენტი</Th>
                <Th>შემკვეთი</Th>
                <Th>თარიღი</Th>
                <Th>როდისთვის</Th>
                <Th>პროდუქცია</Th>
                <Th className="text-right">ჯამი</Th>
                <Th className="text-right">გადახდილი</Th>
                <Th className="text-right">დარჩენილი</Th>
                <Th>სტატუსი</Th>
                <Th />
              </tr>
            }
          >
            {visible.map((o) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <Td className="font-bold text-slate-900">{o.orderNo}</Td>
                <Td>
                  <span className="font-semibold">{o.customerName}</span>
                  {o.customerPhone && <span className="block text-[11px] text-slate-400">{o.customerPhone}</span>}
                </Td>
                <Td className="text-xs text-slate-500">{formatDateTime(o.date)}</Td>
                <Td className="text-xs">{o.dueDate ? formatDate(o.dueDate) : '—'}</Td>
                <Td className="text-xs text-slate-500">
                  {o.items.map((i) => `${i.productName} × ${formatQty(i.quantity)}`).join(', ').slice(0, 55)}
                </Td>
                <Td className="text-right font-bold">{formatMoney(o.totalTetri)}</Td>
                <Td className="text-right text-emerald-700">{formatMoney(o.paidTetri)}</Td>
                <Td className="text-right text-red-600">{formatMoney(o.balanceDueTetri)}</Td>
                <Td>
                  <Badge tone={TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                  {o.saleNo && <span className="block text-[10px] text-slate-400 mt-0.5">{o.saleNo}</span>}
                </Td>
                <Td>
                  <div className="flex gap-1 justify-end flex-wrap">
                    {o.status !== 'FULFILLED' && o.status !== 'CANCELLED' && can('order.manage') && (
                      <>
                        <Select
                          value={o.status}
                          onChange={(e) => void doAction(() => updateOrderStatus(user!, o, e.target.value as OrderStatus), 'სტატუსი განახლდა')}
                          className="w-28 py-1 text-xs"
                        >
                          <option value="NEW">ახალი</option>
                          <option value="PREPARING">მზადდება</option>
                          <option value="READY">მზადაა</option>
                        </Select>
                        <button
                          onClick={() => {
                            setPayTarget(o);
                            setPayAmount('');
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          title="გადახდის დამატება"
                        >
                          <Wallet className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {o.status !== 'FULFILLED' && o.status !== 'CANCELLED' && can('order.fulfill') && (
                      <button
                        onClick={() => {
                          setFulfillTarget(o);
                          setReceivedByName(o.customerName);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 cursor-pointer"
                      >
                        გაცემა
                      </button>
                    )}
                    {o.status !== 'FULFILLED' && o.status !== 'CANCELLED' && can('order.manage') && (
                      <button
                        onClick={() => setCancelTarget(o)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        title="გაუქმება"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    {can('admin.delete') && (
                      <button
                        onClick={() => setDeleteTarget(o)}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        title="წაშლა"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* ახალი შეკვეთა */}
      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="ახალი შეკვეთა"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNew(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitNew()} loading={saving} disabled={!customerName.trim() || !lines.length}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="შემკვეთი" required className="md:col-span-2">
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </Field>
            <Field label="ტელეფონი">
              <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </Field>
            <Field label="როდისთვის">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">პოზიციები</span>
              <Button size="sm" variant="secondary" icon={Plus} onClick={addLine}>
                დამატება
              </Button>
            </div>
            {lines.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">დაამატეთ პროდუქცია</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {lines.map((line, idx) => (
                  <div key={idx} className="p-3 grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Field label="პროდუქტი">
                        <Select
                          value={line.productId}
                          onChange={(e) => {
                            const p = products.find((x) => x.id === e.target.value);
                            if (!p) return;
                            setLines((prev) => {
                              const next = [...prev];
                              next[idx] = {
                                ...next[idx],
                                productId: p.id,
                                productName: p.name,
                                unitSymbol: p.unitSymbol,
                                priceTetri: p.sellingPriceTetri
                              };
                              return next;
                            });
                          }}
                        >
                          {products
                            .filter((p) => p.active)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </Select>
                      </Field>
                    </div>
                    <div className="col-span-3">
                      <Field label={`რაოდენობა (${line.unitSymbol})`}>
                        <Input
                          value={line.quantity}
                          onChange={(e) =>
                            setLines((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], quantity: Number(e.target.value) || 0 };
                              return next;
                            })
                          }
                          type="number"
                          step="0.001"
                        />
                      </Field>
                    </div>
                    <div className="col-span-3">
                      <Field label="ფასი (₾)">
                        <Input
                          value={(line.priceTetri / 100).toFixed(2)}
                          onChange={(e) =>
                            setLines((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], priceTetri: toTetri(e.target.value) };
                              return next;
                            })
                          }
                          inputMode="decimal"
                        />
                      </Field>
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
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <Field label="ავანსი (₾)">
              <Input value={prepaid} onChange={(e) => setPrepaid(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="კომენტარი" className="md:col-span-1">
              <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-500 uppercase">შეკვეთის ჯამი</p>
              <p className="text-2xl font-bold text-slate-900">{formatMoney(total)}</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* გადახდა */}
      <Modal
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        title={`გადახდა — ${payTarget?.orderNo ?? ''}`}
        subtitle={payTarget ? `დარჩენილია ${formatMoney(payTarget.balanceDueTetri)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayTarget(null)}>
              გაუქმება
            </Button>
            <Button
              onClick={() =>
                void doAction(async () => {
                  await addOrderPayment(user!, payTarget!.id, toTetri(payAmount), payMethod);
                  setPayTarget(null);
                }, 'გადახდა დაფიქსირდა')
              }
              loading={saving}
              disabled={!payAmount}
            >
              დადასტურება
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="თანხა (₾)" required>
            <Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="გადახდის ფორმა">
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
              <option value="CASH">ნაღდი</option>
              <option value="CARD">ბარათი</option>
              <option value="BANK_TRANSFER">გადარიცხვა</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* გაცემა */}
      <Modal
        open={!!fulfillTarget}
        onClose={() => setFulfillTarget(null)}
        title={`შეკვეთის გაცემა — ${fulfillTarget?.orderNo ?? ''}`}
        subtitle="შეიქმნება გაყიდვა და მარაგი ჩამოიწერება"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFulfillTarget(null)}>
              გაუქმება
            </Button>
            <Button
              variant="success"
              onClick={() =>
                void doAction(async () => {
                  const res = await fulfillOrder(user!, settings, fulfillTarget!, products, {
                    receivedByName,
                    paymentMethod: fulfillMethod,
                    shiftId: myShift?.id
                  });
                  setFulfillTarget(null);
                  toast.info(`გაყიდვა ${res.saleNo} — ბეჭდვა შეგიძლიათ გაყიდვების ისტორიიდან`);
                }, 'შეკვეთა გაიცა')
              }
              loading={saving}
            >
              გაცემა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {fulfillTarget && fulfillTarget.balanceDueTetri > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              დარჩენილი გადასახდელი: <b>{formatMoney(fulfillTarget.balanceDueTetri)}</b>
            </div>
          )}
          <Field label="ვინ ჩაიბარებს" required>
            <Input value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} />
          </Field>
          <Field label="დარჩენილის გადახდის ფორმა">
            <Select value={fulfillMethod} onChange={(e) => setFulfillMethod(e.target.value as PaymentMethod)}>
              <option value="CASH">ნაღდი</option>
              <option value="CARD">ბარათი</option>
              <option value="BANK_TRANSFER">გადარიცხვა</option>
              <option value="DEBT">დავალიანება</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* გაუქმება */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="შეკვეთის გაუქმება"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              დახურვა
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                void doAction(async () => {
                  await cancelOrder(user!, cancelTarget!, cancelReason);
                  setCancelTarget(null);
                  setCancelReason('');
                }, 'შეკვეთა გაუქმდა')
              }
              loading={saving}
              disabled={!cancelReason.trim()}
            >
              გაუქმება
            </Button>
          </>
        }
      >
        <Field label="მიზეზი" required>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </Field>
      </Modal>

      {/* წაშლა (ადმინი) */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="შეკვეთის წაშლა"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              დახურვა
            </Button>
            <Button
              variant="danger"
              icon={Truck}
              onClick={() =>
                void doAction(async () => {
                  await adminDelete(
                    user!,
                    { collection: COL.orders, id: deleteTarget!.id, label: `შეკვეთა ${deleteTarget!.orderNo}`, entityType: 'order' },
                    deleteReason
                  );
                  setDeleteTarget(null);
                  setDeleteReason('');
                }, 'შეკვეთა წაიშალა')
              }
              loading={saving}
              disabled={!deleteReason.trim()}
            >
              წაშლა
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            ჩანაწერი სამუდამოდ წაიშლება. მარაგი ავტომატურად არ ბრუნდება — თუ შეკვეთა უკვე გაცემულია, ჯერ გაყიდვა დაუბრუნეთ.
          </p>
          <Field label="წაშლის მიზეზი" required>
            <Input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
};
