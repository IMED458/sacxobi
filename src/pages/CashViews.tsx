import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CalendarCheck, Lock, LockOpen, Plus, Wallet } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, StatCard, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { addDays, formatDate, formatDateTime, todayBusinessDate } from '../lib/dates';
import { formatMoney, toTetri } from '../lib/money';
import { createExpense } from '../services/expenses';
import { addCashMovement, closeShift, computeShiftTotals, fetchShiftsForDate, openShift, type ShiftTotals } from '../services/shifts';
import { closeBusinessDay, fetchBusinessDay, fetchOpenShifts, reopenBusinessDay } from '../services/businessDays';
import { computeDaySummary, fetchExpensesRange } from '../services/reports';
import type { BusinessDay, CashierShift, DaySummary, Expense, PaymentMethod } from '../types';

/* ------------------------------- ხარჯები ------------------------------ */

export const ExpensesView: React.FC = () => {
  const { user } = useAuth();
  const { expenseCategories, settings, myShift } = useData();
  const toast = useToast();

  const [from, setFrom] = useState(addDays(todayBusinessDate(), -30));
  const [to, setTo] = useState(todayBusinessDate());
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    categoryId: '',
    amount: '',
    reason: '',
    recipient: '',
    paymentMethod: 'CASH' as PaymentMethod,
    comment: ''
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchExpensesRange(from, to);
      setItems(data.sort((a, b) => b.date.localeCompare(a.date)));
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

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const cat = expenseCategories.find((c) => c.id === form.categoryId);
      await createExpense(user, settings, {
        categoryId: form.categoryId,
        categoryName: cat?.name ?? '',
        amountTetri: toTetri(form.amount),
        reason: form.reason,
        recipient: form.recipient || undefined,
        paymentMethod: form.paymentMethod,
        comment: form.comment || undefined,
        shiftId: myShift?.id
      });
      toast.success('ხარჯი დაფიქსირდა');
      setShowForm(false);
      setForm({ categoryId: '', amount: '', reason: '', recipient: '', paymentMethod: 'CASH', comment: '' });
      void load();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const total = items.reduce((s, e) => s + e.amountTetri, 0);

  return (
    <Card>
      <CardHeader
        title="ხარჯები"
        subtitle="საოპერაციო ხარჯები — სუფთა მოგების გამოსათვლელად"
        icon={Wallet}
        actions={
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <Badge tone="red">სულ: {formatMoney(total)}</Badge>
            <Button icon={Plus} onClick={() => setShowForm(true)}>
              ახალი ხარჯი
            </Button>
          </>
        }
      />
      {loading ? (
        <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Wallet} title="ამ პერიოდში ხარჯი არ დაფიქსირებულა" />
      ) : (
        <Table
          head={
            <tr>
              <Th>დოკუმენტი</Th>
              <Th>თარიღი</Th>
              <Th>კატეგორია</Th>
              <Th>საფუძველი</Th>
              <Th>მიმღები</Th>
              <Th>გადახდა</Th>
              <Th className="text-right">თანხა</Th>
              <Th>შემქმნელი</Th>
            </tr>
          }
        >
          {items.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <Td className="font-bold">{e.documentNo}</Td>
              <Td className="text-xs text-slate-500">{formatDateTime(e.date)}</Td>
              <Td>{e.categoryName}</Td>
              <Td className="text-xs">{e.reason}</Td>
              <Td className="text-xs">{e.recipient ?? '—'}</Td>
              <Td className="text-xs">{e.paymentMethod === 'CASH' ? 'ნაღდი' : e.paymentMethod === 'CARD' ? 'ბარათი' : 'გადარიცხვა'}</Td>
              <Td className="text-right font-bold text-red-600">{formatMoney(e.amountTetri)}</Td>
              <Td className="text-xs">{e.createdByName}</Td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="ახალი ხარჯი"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submit()} loading={saving} disabled={!form.categoryId || !form.amount || !form.reason.trim()}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="კატეგორია" required>
            <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">— აირჩიეთ —</option>
              {expenseCategories
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="თანხა (₾)" required>
            <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" />
          </Field>
          <Field label="საფუძველი" required className="md:col-span-2">
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <Field label="მიმღები">
            <Input value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
          </Field>
          <Field label="გადახდის ფორმა">
            <Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}>
              <option value="CASH">ნაღდი</option>
              <option value="CARD">ბარათი</option>
              <option value="BANK_TRANSFER">საბანკო გადარიცხვა</option>
            </Select>
          </Field>
          <Field label="კომენტარი" className="md:col-span-2">
            <Textarea rows={2} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
};

/* --------------------------------- ცვლა ------------------------------- */

export const ShiftView: React.FC = () => {
  const { user, can } = useAuth();
  const { myShift } = useData();
  const toast = useToast();

  const [totals, setTotals] = useState<ShiftTotals | null>(null);
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [openingCash, setOpeningCash] = useState('0');
  const [actualCash, setActualCash] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [cashModal, setCashModal] = useState<'CASH_IN' | 'CASH_OUT' | null>(null);
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');

  const refresh = useCallback(async () => {
    try {
      setShifts(await fetchShiftsForDate(todayBusinessDate()));
      if (myShift) setTotals(await computeShiftTotals(myShift));
      else setTotals(null);
    } catch {
      /* ignore */
    }
  }, [myShift]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const doOpen = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await openShift(user, toTetri(openingCash));
      toast.success('ცვლა გაიხსნა');
      void refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const doClose = async () => {
    if (!user || !myShift) return;
    setSaving(true);
    try {
      const closed = await closeShift(user, myShift, toTetri(actualCash), comment || undefined);
      toast.success(`ცვლა დაიხურა — სხვაობა ${formatMoney(closed.differenceTetri ?? 0)}`);
      setCloseOpen(false);
      setActualCash('');
      setComment('');
      void refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const doCashMovement = async () => {
    if (!user || !cashModal) return;
    setSaving(true);
    try {
      await addCashMovement(user, cashModal, toTetri(cashAmount), cashReason, myShift?.id);
      toast.success('სალაროს ოპერაცია დაფიქსირდა');
      setCashModal(null);
      setCashAmount('');
      setCashReason('');
      void refresh();
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
          title="ჩემი ცვლა"
          subtitle={myShift ? `გახსნილია ${formatDateTime(myShift.openedAt)}` : 'ცვლა დახურულია'}
          icon={Wallet}
          actions={
            myShift ? (
              <>
                {can('cash.access') && (
                  <>
                    <Button size="sm" variant="secondary" icon={ArrowDownCircle} onClick={() => setCashModal('CASH_IN')}>
                      თანხის შეტანა
                    </Button>
                    <Button size="sm" variant="secondary" icon={ArrowUpCircle} onClick={() => setCashModal('CASH_OUT')}>
                      თანხის გატანა
                    </Button>
                  </>
                )}
                {can('shift.close') && (
                  <Button icon={Lock} onClick={() => setCloseOpen(true)}>
                    ცვლის დახურვა
                  </Button>
                )}
              </>
            ) : null
          }
        />

        {!myShift ? (
          <div className="p-6 max-w-sm space-y-4">
            <Field label="საწყისი ნაღდი ფული (₾)" required>
              <Input value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} inputMode="decimal" />
            </Field>
            <Button icon={LockOpen} onClick={() => void doOpen()} loading={saving} disabled={!can('shift.open')}>
              ცვლის გახსნა
            </Button>
          </div>
        ) : (
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="საწყისი ნაღდი" value={formatMoney(myShift.openingCashTetri)} />
            <StatCard label="ნაღდი გაყიდვები" value={formatMoney(totals?.cashSalesTetri ?? 0)} tone="green" />
            <StatCard label="ბარათი / გადარიცხვა" value={formatMoney((totals?.cardSalesTetri ?? 0) + (totals?.transferSalesTetri ?? 0))} tone="blue" />
            <StatCard label="ნაღდი ხარჯები" value={formatMoney(totals?.cashExpensesTetri ?? 0)} tone="red" />
            <StatCard label="დაბრუნებები (ნაღდი)" value={formatMoney(totals?.cashRefundsTetri ?? 0)} tone="red" />
            <StatCard label="შემოტანილი" value={formatMoney(totals?.cashInTetri ?? 0)} />
            <StatCard label="გატანილი" value={formatMoney(totals?.cashOutTetri ?? 0)} />
            <StatCard label="მოსალოდნელი ნაღდი" value={formatMoney(totals?.expectedCashTetri ?? 0)} tone="amber" />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="დღევანდელი ცვლები" />
        {shifts.length === 0 ? (
          <EmptyState title="დღეს ცვლა არ გახსნილა" />
        ) : (
          <Table
            head={
              <tr>
                <Th>მოლარე</Th>
                <Th>გახსნა</Th>
                <Th>დახურვა</Th>
                <Th className="text-right">საწყისი</Th>
                <Th className="text-right">მოსალოდნელი</Th>
                <Th className="text-right">ფაქტობრივი</Th>
                <Th className="text-right">სხვაობა</Th>
                <Th>სტატუსი</Th>
              </tr>
            }
          >
            {shifts.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td className="font-semibold">{s.userName}</Td>
                <Td className="text-xs text-slate-500">{formatDateTime(s.openedAt)}</Td>
                <Td className="text-xs text-slate-500">{s.closedAt ? formatDateTime(s.closedAt) : '—'}</Td>
                <Td className="text-right">{formatMoney(s.openingCashTetri)}</Td>
                <Td className="text-right">{s.expectedClosingCashTetri != null ? formatMoney(s.expectedClosingCashTetri) : '—'}</Td>
                <Td className="text-right">{s.actualClosingCashTetri != null ? formatMoney(s.actualClosingCashTetri) : '—'}</Td>
                <Td className={`text-right font-bold ${(s.differenceTetri ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {s.differenceTetri != null ? formatMoney(s.differenceTetri) : '—'}
                </Td>
                <Td>
                  <Badge tone={s.status === 'open' ? 'green' : 'slate'}>{s.status === 'open' ? 'ღია' : 'დახურული'}</Badge>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title="ცვლის დახურვა"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseOpen(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void doClose()} loading={saving} disabled={!actualCash}>
              დახურვა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">მოსალოდნელი ნაღდი</span>
              <span className="font-bold">{formatMoney(totals?.expectedCashTetri ?? 0)}</span>
            </div>
            {actualCash && (
              <div className="flex justify-between mt-1">
                <span className="text-slate-500">სხვაობა</span>
                <span className="font-bold">{formatMoney(toTetri(actualCash) - (totals?.expectedCashTetri ?? 0))}</span>
              </div>
            )}
          </div>
          <Field label="ფაქტობრივი ნაღდი (₾)" required>
            <Input value={actualCash} onChange={(e) => setActualCash(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="კომენტარი">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!cashModal}
        onClose={() => setCashModal(null)}
        title={cashModal === 'CASH_IN' ? 'თანხის შეტანა სალაროში' : 'თანხის გატანა სალაროდან'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCashModal(null)}>
              გაუქმება
            </Button>
            <Button onClick={() => void doCashMovement()} loading={saving} disabled={!cashAmount || !cashReason.trim()}>
              დადასტურება
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="თანხა (₾)" required>
            <Input value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="საფუძველი" required>
            <Input value={cashReason} onChange={(e) => setCashReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
};

/* ----------------------------- დღის დახურვა ---------------------------- */

export const DayCloseView: React.FC = () => {
  const { user, can } = useAuth();
  const toast = useToast();
  const [businessDate, setBusinessDate] = useState(todayBusinessDate());
  const [day, setDay] = useState<BusinessDay | null>(null);
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [openShifts, setOpenShifts] = useState<CashierShift[]>([]);
  const [actualCash, setActualCash] = useState('');
  const [comment, setComment] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, shifts] = await Promise.all([fetchBusinessDay(businessDate), fetchOpenShifts(businessDate)]);
      setDay(d);
      setOpenShifts(shifts);
      setSummary(d?.summarySnapshot ?? (await computeDaySummary(businessDate)));
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const doClose = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await closeBusinessDay(user, businessDate, toTetri(actualCash || '0'), comment || undefined);
      toast.success('დღე დაიხურა');
      setConfirmClose(false);
      void load();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const doReopen = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await reopenBusinessDay(user, businessDate, reopenReason);
      toast.success('დღე ხელახლა გაიხსნა');
      setConfirmReopen(false);
      setReopenReason('');
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
          title="დღის დახურვა"
          subtitle={`ბიზნეს-დღე: ${formatDate(businessDate)} (თბილისის დრო)`}
          icon={CalendarCheck}
          actions={
            <>
              <Input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} className="w-44" />
              {day?.status === 'CLOSED' ? (
                can('day.reopen') && (
                  <Button variant="secondary" icon={LockOpen} onClick={() => setConfirmReopen(true)}>
                    დღის გახსნა
                  </Button>
                )
              ) : (
                can('day.close') && (
                  <Button icon={Lock} onClick={() => setConfirmClose(true)}>
                    დღის დახურვა
                  </Button>
                )
              )}
            </>
          }
        />

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={day?.status === 'CLOSED' ? 'red' : 'green'}>{day?.status === 'CLOSED' ? 'დახურული' : 'ღია'}</Badge>
              {day?.closedByName && <span className="text-xs text-slate-500">დახურა: {day.closedByName} · {formatDateTime(day.closedAt)}</span>}
              {day?.reopenReason && <span className="text-xs text-amber-700">ხელახლა გაიხსნა: {day.reopenReason}</span>}
              {openShifts.length > 0 && <Badge tone="amber">ღია ცვლები: {openShifts.length}</Badge>}
            </div>

            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="გაყიდვები" value={formatMoney(summary.grossSalesTetri)} hint={`${summary.salesCount} დოკუმენტი`} tone="green" />
                <StatCard label="გაყიდული ერთეული" value={String(summary.soldUnits)} />
                <StatCard label="დაბრუნებები" value={formatMoney(summary.returnsTetri)} tone="red" />
                <StatCard label="წმინდა გაყიდვა" value={formatMoney(summary.netSalesTetri)} />
                <StatCard label="COGS" value={formatMoney(summary.cogsTetri)} tone="amber" />
                <StatCard label="მთლიანი მოგება" value={formatMoney(summary.grossProfitTetri)} tone="green" />
                <StatCard label="ხარჯები" value={formatMoney(summary.expensesTetri)} tone="red" />
                <StatCard label="სუფთა მოგება" value={formatMoney(summary.netProfitTetri)} tone={summary.netProfitTetri >= 0 ? 'green' : 'red'} />
                <StatCard label="ნაღდი" value={formatMoney(summary.cashTetri)} />
                <StatCard label="ბარათი" value={formatMoney(summary.cardTetri)} />
                <StatCard label="გადარიცხვა" value={formatMoney(summary.transferTetri)} />
                <StatCard label="დავალიანება" value={formatMoney(summary.debtTetri)} />
                <StatCard label="წარმოება" value={`${summary.producedUnits} ერთ.`} hint={`${summary.productionBatches} ცხობა · დანაკარგი ${summary.wasteUnits}`} tone="blue" />
                <StatCard label="მასალის ხარჯი" value={formatMoney(summary.materialCostTetri)} />
                <StatCard label="შესყიდვები" value={formatMoney(summary.purchasesTetri)} />
                <StatCard label="მოსალოდნელი ნაღდი" value={formatMoney(summary.expectedCashTetri)} tone="amber" />
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="დღის დახურვა"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClose(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void doClose()} loading={saving}>
              დახურვა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {openShifts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              ⚠️ არსებობს {openShifts.length} დაუხურავი ცვლა: {openShifts.map((s) => s.userName).join(', ')}
            </div>
          )}
          <Field label="ფაქტობრივი ნაღდი სალაროში (₾)">
            <Input value={actualCash} onChange={(e) => setActualCash(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="კომენტარი">
            <Input value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={confirmReopen}
        onClose={() => setConfirmReopen(false)}
        title="დღის ხელახლა გახსნა"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReopen(false)}>
              გაუქმება
            </Button>
            <Button variant="danger" onClick={() => void doReopen()} loading={saving} disabled={!reopenReason.trim()}>
              გახსნა
            </Button>
          </>
        }
      >
        <Field label="გახსნის მიზეზი" required hint="მიზეზი ჩაიწერება Audit Log-ში">
          <Input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
};
