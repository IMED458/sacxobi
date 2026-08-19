import React, { useEffect, useState } from 'react';
import { FileDown, Printer, Receipt, RotateCcw, Search, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, NumberInput, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { addDays, formatDateTime, todayBusinessDate } from '../lib/dates';
import { formatMoney, formatQty } from '../lib/money';
import { downloadBlob, generateReceiptPdf, generateWaybillPdf, PAYMENT_LABELS } from '../lib/pdf';
import { logAudit } from '../services/audit';
import { cancelSale, createReturn, type ReturnLineInput } from '../services/sales';
import { DeleteRecordButton } from '../components/DeleteRecordButton';
import { COL } from '../services/db';
import { fetchSalesRange, fetchReturnsRange } from '../services/reports';
import type { Sale, SaleReturn } from '../types';

const STATUS_LABELS: Record<Sale['status'], { label: string; tone: 'green' | 'red' | 'amber' | 'slate' }> = {
  active: { label: 'აქტიური', tone: 'green' },
  cancelled: { label: 'გაუქმებული', tone: 'red' },
  returned: { label: 'დაბრუნებული', tone: 'amber' },
  partially_returned: { label: 'ნაწილ. დაბრუნებული', tone: 'amber' }
};

export const SalesHistoryView: React.FC<{ mode?: 'sales' | 'returns' }> = ({ mode = 'sales' }) => {
  const { user, can } = useAuth();
  const { settings } = useData();
  const toast = useToast();

  const [from, setFrom] = useState(addDays(todayBusinessDate(), -7));
  const [to, setTo] = useState(todayBusinessDate());
  const [search, setSearch] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Sale | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [restock, setRestock] = useState(false);
  const [returnTarget, setReturnTarget] = useState<Sale | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLineInput[]>([]);
  const [returnReason, setReturnReason] = useState('');
  const [saving, setSaving] = useState(false);

  const showProfit = can('sale.view_profit');

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([fetchSalesRange(from, to), fetchReturnsRange(from, to)]);
      setSales(s.sort((a, b) => b.date.localeCompare(a.date)));
      setReturns(r.sort((a, b) => b.date.localeCompare(a.date)));
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

  const visible = sales.filter((s) => {
    if (!can('sale.view_all') && s.soldByUserId !== user?.id) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.saleNo.toLowerCase().includes(q) ||
      s.receivedByName.toLowerCase().includes(q) ||
      s.soldByName.toLowerCase().includes(q) ||
      s.items.some((i) => i.productName.toLowerCase().includes(q))
    );
  });

  const printPdf = async (sale: Sale, kind: 'waybill' | 'receipt') => {
    try {
      const { blob, fileName } =
        kind === 'waybill' ? await generateWaybillPdf(sale, settings) : await generateReceiptPdf(sale, settings);
      downloadBlob(blob, fileName);
      if (user) {
        await logAudit(user, {
          action: 'PDF_GENERATED',
          entityType: 'sale',
          entityId: sale.id,
          summary: `${kind === 'waybill' ? 'ზედნადები' : 'ქვითარი'} PDF: ${sale.saleNo}`
        });
      }
    } catch (err) {
      toast.error(err);
    }
  };

  const submitCancel = async () => {
    if (!user || !cancelTarget) return;
    setSaving(true);
    try {
      await cancelSale(user, settings, cancelTarget.id, cancelReason, restock);
      toast.success('გაყიდვა გაუქმდა');
      setCancelTarget(null);
      setCancelReason('');
      void load();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const openReturn = (sale: Sale) => {
    setReturnTarget(sale);
    setReturnLines(sale.items.map((i) => ({ saleItemId: i.id, quantity: 0, disposition: 'WASTE' })));
    setReturnReason('');
  };

  const submitReturn = async () => {
    if (!user || !returnTarget) return;
    setSaving(true);
    try {
      const doc = await createReturn(user, settings, returnTarget.id, returnLines, returnReason, returnTarget.paymentMethod);
      toast.success(`დაბრუნება დაფიქსირდა — ${doc.returnNo}`);
      setReturnTarget(null);
      void load();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'returns') {
    return (
      <Card>
        <CardHeader
          title="დაბრუნებები"
          icon={RotateCcw}
          actions={
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </>
          }
        />
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
        ) : returns.length === 0 ? (
          <EmptyState icon={RotateCcw} title="ამ პერიოდში დაბრუნება არ დაფიქსირებულა" />
        ) : (
          <Table
            head={
              <tr>
                <Th>დოკუმენტი</Th>
                <Th>გაყიდვა</Th>
                <Th>თარიღი</Th>
                <Th>პოზიციები</Th>
                <Th className="text-right">დაბრუნებული თანხა</Th>
                <Th>მიზეზი</Th>
                <Th>ვინ</Th>
                <Th />
              </tr>
            }
          >
            {returns.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td className="font-bold">{r.returnNo}</Td>
                <Td className="text-xs">{r.saleNo}</Td>
                <Td className="text-xs text-slate-500">{formatDateTime(r.date)}</Td>
                <Td className="text-xs">
                  {r.items.map((i) => (
                    <div key={i.saleItemId}>
                      {i.productName} — {formatQty(i.quantity)} {i.unitSymbol}{' '}
                      <Badge tone={i.disposition === 'RESTOCK' ? 'green' : 'red'}>
                        {i.disposition === 'RESTOCK' ? 'მარაგში' : 'ჩამოწერა'}
                      </Badge>
                    </div>
                  ))}
                </Td>
                <Td className="text-right font-bold text-red-600">{formatMoney(r.totalRefundTetri)}</Td>
                <Td className="text-xs">{r.reason}</Td>
                <Td className="text-xs">{r.createdByName}</Td>
                <Td>
                  <div className="flex justify-end">
                    <DeleteRecordButton
                      collection={COL.returns}
                      id={r.id}
                      entityType="return"
                      label={`დაბრუნება ${r.returnNo}`}
                      warning="დაბრუნების დოკუმენტი წაიშლება. მარაგი ავტომატურად არ კორექტირდება — საჭიროებისას გამოიყენეთ მარაგის რედაქტირება."
                      onDeleted={load}
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="გაყიდვების ისტორია"
        subtitle="ვინ გაყიდა, ვინ ჩაიბარა, რა ფასად და როდის"
        icon={Receipt}
        actions={
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ძებნა…" className="pl-9 w-52" />
            </div>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </>
        }
      />
      {loading ? (
        <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Receipt} title="ამ პერიოდში გაყიდვა ვერ მოიძებნა" />
      ) : (
        <Table
          head={
            <tr>
              <Th>დოკუმენტი</Th>
              <Th>თარიღი</Th>
              <Th>მოლარე</Th>
              <Th>ჩაიბარა</Th>
              <Th>პროდუქცია</Th>
              <Th>გადახდა</Th>
              <Th className="text-right">თანხა</Th>
              {showProfit && <Th className="text-right">მოგება</Th>}
              <Th>სტატუსი</Th>
              <Th />
            </tr>
          }
        >
          {visible.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <Td className="font-bold text-slate-900 cursor-pointer" onClick={() => setDetail(s)}>
                {s.saleNo}
              </Td>
              <Td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(s.date)}</Td>
              <Td className="text-xs">{s.soldByName}</Td>
              <Td className="text-xs font-semibold">{s.receivedByName}</Td>
              <Td className="text-xs text-slate-500">
                {s.items.map((i) => `${i.productName} × ${formatQty(i.quantity)}`).join(', ').slice(0, 60)}
              </Td>
              <Td className="text-xs">{PAYMENT_LABELS[s.paymentMethod]}</Td>
              <Td className="text-right font-bold">{formatMoney(s.grandTotalTetri)}</Td>
              {showProfit && (
                <Td className={`text-right font-semibold ${s.grossProfitTetri >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatMoney(s.grossProfitTetri)}
                </Td>
              )}
              <Td>
                <Badge tone={STATUS_LABELS[s.status].tone}>{STATUS_LABELS[s.status].label}</Badge>
              </Td>
              <Td>
                <div className="flex gap-1 justify-end">
                  <button onClick={() => void printPdf(s, 'waybill')} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 cursor-pointer" title="ზედნადები PDF">
                    <FileDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => void printPdf(s, 'receipt')} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 cursor-pointer" title="ქვითარი">
                    <Printer className="w-4 h-4" />
                  </button>
                  {s.status === 'active' && can('sale.return') && (
                    <button onClick={() => openReturn(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer" title="დაბრუნება">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {s.status === 'active' && can('sale.cancel') && (
                    <button onClick={() => setCancelTarget(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer" title="გაუქმება">
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                  <DeleteRecordButton
                    collection={COL.sales}
                    id={s.id}
                    entityType="sale"
                    label={`გაყიდვა ${s.saleNo}`}
                    warning="გაყიდვა სამუდამოდ წაიშლება. მარაგი უკან არ ბრუნდება — მარაგის დასაბრუნებლად გამოიყენეთ გაუქმება ან დაბრუნება."
                    onDeleted={load}
                  />
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {/* დეტალები */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`გაყიდვა ${detail?.saleNo ?? ''}`} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase">მოლარე</p>
                <p className="font-semibold">{detail.soldByName}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase">ჩაიბარა</p>
                <p className="font-semibold">{detail.receivedByName}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase">თარიღი</p>
                <p className="font-semibold">{formatDateTime(detail.date)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 font-bold uppercase">გადახდა</p>
                <p className="font-semibold">{PAYMENT_LABELS[detail.paymentMethod]}</p>
              </div>
            </div>
            <Table
              head={
                <tr>
                  <Th>პროდუქტი</Th>
                  <Th className="text-right">რაოდ.</Th>
                  <Th className="text-right">ფასი</Th>
                  <Th className="text-right">ჯამი</Th>
                  {showProfit && <Th className="text-right">თვითღირებ.</Th>}
                  {showProfit && <Th className="text-right">მოგება</Th>}
                </tr>
              }
            >
              {detail.items.map((i) => (
                <tr key={i.id}>
                  <Td className="font-semibold">{i.productName}</Td>
                  <Td className="text-right">
                    {formatQty(i.quantity)} {i.unitSymbol}
                  </Td>
                  <Td className="text-right">{formatMoney(i.sellingPriceTetri)}</Td>
                  <Td className="text-right font-bold">{formatMoney(i.lineTotalTetri)}</Td>
                  {showProfit && <Td className="text-right text-slate-500">{formatMoney(i.costTotalTetri)}</Td>}
                  {showProfit && <Td className="text-right text-emerald-700">{formatMoney(i.profitTetri)}</Td>}
                </tr>
              ))}
            </Table>
            <div className="text-right space-y-1">
              <p className="text-sm text-slate-500">ჯამი: {formatMoney(detail.subtotalTetri)}</p>
              {detail.discountTetri > 0 && <p className="text-sm text-red-600">ფასდაკლება: − {formatMoney(detail.discountTetri)}</p>}
              <p className="text-lg font-bold">სულ: {formatMoney(detail.grandTotalTetri)}</p>
            </div>
            {detail.comment && <p className="text-xs text-slate-500">კომენტარი: {detail.comment}</p>}
          </div>
        )}
      </Modal>

      {/* გაუქმება */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title={`გაყიდვის გაუქმება — ${cancelTarget?.saleNo ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              დახურვა
            </Button>
            <Button variant="danger" onClick={() => void submitCancel()} loading={saving} disabled={!cancelReason.trim()}>
              გაუქმება
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="გაუქმების მიზეზი" required>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </Field>
          <Field label="პროდუქცია">
            <Select value={restock ? 'restock' : 'waste'} onChange={(e) => setRestock(e.target.value === 'restock')}>
              <option value="waste">ჩამოიწეროს (გაფუჭებულია)</option>
              <option value="restock">დაბრუნდეს მარაგში</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* დაბრუნება */}
      <Modal
        open={!!returnTarget}
        onClose={() => setReturnTarget(null)}
        title={`დაბრუნება — ${returnTarget?.saleNo ?? ''}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReturnTarget(null)}>
              დახურვა
            </Button>
            <Button onClick={() => void submitReturn()} loading={saving} disabled={!returnReason.trim()}>
              დაბრუნების დაფიქსირება
            </Button>
          </>
        }
      >
        {returnTarget && (
          <div className="space-y-4">
            <Field label="დაბრუნების მიზეზი" required>
              <Input value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
            </Field>
            <Table
              head={
                <tr>
                  <Th>პროდუქტი</Th>
                  <Th className="text-right">გაყიდული</Th>
                  <Th className="text-right">დასაბრუნებელი</Th>
                  <Th>რა ვუყოთ</Th>
                </tr>
              }
            >
              {returnTarget.items.map((item, idx) => (
                <tr key={item.id}>
                  <Td className="font-semibold">{item.productName}</Td>
                  <Td className="text-right">
                    {formatQty(item.quantity)} {item.unitSymbol}
                  </Td>
                  <Td className="text-right">
                    <NumberInput
                      value={returnLines[idx]?.quantity ?? 0}
                      onChange={(v) =>
                        setReturnLines((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], quantity: v };
                          return next;
                        })
                      }
                      placeholder="0"
                      className="w-24 text-right"
                    />
                  </Td>
                  <Td>
                    <Select
                      value={returnLines[idx]?.disposition ?? 'WASTE'}
                      onChange={(e) =>
                        setReturnLines((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], disposition: e.target.value as 'RESTOCK' | 'WASTE' };
                          return next;
                        })
                      }
                      className="w-44"
                    >
                      <option value="WASTE">ჩამოიწეროს (waste)</option>
                      <option value="RESTOCK">დაბრუნდეს მარაგში</option>
                    </Select>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Modal>
    </Card>
  );
};
