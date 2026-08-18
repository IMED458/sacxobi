import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  ClipboardList,
  CreditCard,
  ImageIcon,
  Landmark,
  LayoutGrid,
  List as ListIcon,
  Minus,
  PauseCircle,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  UserCheck,
  Wallet,
  X
} from 'lucide-react';
import { Badge, Button, Card, Field, Input, Modal, Textarea } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatMoney, formatQty, toGel, toTetri } from '../lib/money';
import { downloadBlob, generateReceiptPdf, generateWaybillPdf } from '../lib/pdf';
import { logAudit } from '../services/audit';
import { createSale, resolveSaleLocation, type CartLine } from '../services/sales';
import { createOrder } from '../services/orders';
import type { FinishedProduct, PaymentMethod, Sale, StockLocation } from '../types';

const PAYMENTS: { id: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { id: 'CASH', label: 'ნაღდი', icon: Banknote },
  { id: 'CARD', label: 'ბარათი', icon: CreditCard },
  { id: 'BANK_TRANSFER', label: 'გადარიცხვა', icon: Landmark },
  { id: 'DEBT', label: 'დავალიანება', icon: Wallet }
];

const HOLD_KEY = 'sacxobi_pos_hold';

interface HeldCart {
  id: string;
  at: string;
  receivedByName: string;
  lines: { productId: string; quantity: number; priceTetri: number }[];
}

interface Props {
  onNavigate: (page: string) => void;
}

export const POSView: React.FC<Props> = ({ onNavigate }) => {
  const { user, can } = useAuth();
  const { products, productCategories, settings, myShift, stockOf } = useData();
  const toast = useToast();

  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [discountText, setDiscountText] = useState('0');
  const [receivedByName, setReceivedByName] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ index: number; value: string } | null>(null);
  const [held, setHeld] = useState<HeldCart[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  // გადახდის ფანჯარა
  const [payOpen, setPayOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [receivedByPhone, setReceivedByPhone] = useState('');
  const [comment, setComment] = useState('');
  const [paidText, setPaidText] = useState('0');

  // შეკვეთის ფანჯარა
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderDue, setOrderDue] = useState('');
  const [orderPrepaid, setOrderPrepaid] = useState('0');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderComment, setOrderComment] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HOLD_KEY);
      if (raw) setHeld(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persistHeld = (next: HeldCart[]) => {
    setHeld(next);
    try {
      localStorage.setItem(HOLD_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const sellable = useMemo(
    () =>
      products.filter(
        (p) =>
          p.active &&
          (categoryId === 'all' || p.categoryId === categoryId) &&
          (!search.trim() ||
            p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
            p.code.toLowerCase().includes(search.trim().toLowerCase()))
      ),
    [products, categoryId, search]
  );

  /** სად დევს რეალურად — თუ გასაყიდ ადგილას არაფერია, ვიღებთ იქიდან, სადაც მარაგია. */
  const locationOf = (p: FinishedProduct): StockLocation =>
    resolveSaleLocation(p, (loc) => stockOf('PRODUCT', p.id, loc)?.quantity ?? 0);

  const availableOf = (p: FinishedProduct) => stockOf('PRODUCT', p.id, locationOf(p))?.quantity ?? 0;

  const subtotalTetri = cart.reduce((s, l) => s + Math.round(l.priceTetri * l.quantity), 0);
  const discountTetri = Math.max(0, toTetri(discountText || '0'));
  const grandTotalTetri = Math.max(0, subtotalTetri - discountTetri);

  const addToCart = (product: FinishedProduct) => {
    const available = availableOf(product);
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.product.id === product.id);
      const currentQty = idx === -1 ? 0 : prev[idx].quantity;
      if (!settings.allowNegativeStock && currentQty + 1 > available) {
        toast.warning(`${product.name}: მარაგში დარჩა ${formatQty(available)} ${product.unitSymbol}`);
        return prev;
      }
      if (idx === -1)
        return [...prev, { product, quantity: 1, priceTetri: product.sellingPriceTetri, location: locationOf(product) }];
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
      return next;
    });
  };

  const setQuantity = (index: number, quantity: number) => {
    setCart((prev) => {
      const next = [...prev];
      const line = next[index];
      const available = availableOf(line.product);
      if (quantity <= 0) return prev.filter((_, i) => i !== index);
      if (!settings.allowNegativeStock && quantity > available) {
        toast.warning(`${line.product.name}: მარაგში დარჩა ${formatQty(available)} ${line.product.unitSymbol}`);
        return prev;
      }
      next[index] = { ...line, quantity };
      return next;
    });
  };

  const resetCart = () => {
    setCart([]);
    setDiscountText('0');
    setReceivedByName('');
    setReceivedByPhone('');
    setComment('');
    setPaidText('0');
    setPaymentMethod('CASH');
  };

  const holdCart = () => {
    if (!cart.length) return;
    const entry: HeldCart = {
      id: Math.random().toString(36).slice(2, 8),
      at: new Date().toISOString(),
      receivedByName,
      lines: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, priceTetri: l.priceTetri }))
    };
    persistHeld([entry, ...held]);
    resetCart();
    toast.info('კალათა შეჩერდა — შეგიძლიათ ნებისმიერ დროს დააბრუნოთ');
  };

  const restoreHeld = (entry: HeldCart) => {
    const lines: CartLine[] = [];
    entry.lines.forEach((l) => {
      const product = products.find((p) => p.id === l.productId);
      if (product) lines.push({ product, quantity: l.quantity, priceTetri: l.priceTetri, location: locationOf(product) });
    });
    setCart(lines);
    setReceivedByName(entry.receivedByName);
    persistHeld(held.filter((h) => h.id !== entry.id));
    setShowHeld(false);
  };

  const completeSale = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const sale = await createSale(user, settings, {
        lines: cart,
        discountTetri,
        paymentMethod,
        paidTetri: paymentMethod === 'DEBT' ? toTetri(paidText || '0') : grandTotalTetri,
        receivedByName,
        receivedByPhone: receivedByPhone || undefined,
        comment: comment || undefined,
        shiftId: myShift?.id
      });
      setLastSale(sale);
      resetCart();
      setPayOpen(false);
      toast.success(`გაყიდვა შესრულდა — ${sale.saleNo}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  const submitOrder = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const order = await createOrder(user, {
        customerName: receivedByName,
        customerPhone: orderPhone || undefined,
        dueDate: orderDue || undefined,
        lines: cart.map((l) => ({
          productId: l.product.id,
          productName: l.product.name,
          unitSymbol: l.product.unitSymbol,
          quantity: l.quantity,
          priceTetri: l.priceTetri
        })),
        prepaidTetri: toTetri(orderPrepaid || '0'),
        paymentMethod: 'CASH',
        comment: orderComment || undefined
      });
      toast.success(`შეკვეთა შეიქმნა — ${order.orderNo}`);
      resetCart();
      setOrderOpen(false);
      setOrderDue('');
      setOrderPrepaid('0');
      setOrderPhone('');
      setOrderComment('');
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

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

  if (!can('pos.access') || !can('sale.create')) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-bold text-slate-700">POS-ზე წვდომა არ გაქვთ</p>
        <p className="text-xs text-slate-500 mt-1">მიმართეთ მფლობელს უფლების მისანიჭებლად</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-6.5rem)]">
      {/* ბოლო გაყიდვა — ბეჭდვა მხოლოდ სურვილისამებრ, ავტომატურად არაფერი იხსნება */}
      {lastSale && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-bold text-emerald-800">
            ბოლო გაყიდვა: {lastSale.saleNo} · {formatMoney(lastSale.grandTotalTetri)} · ჩაიბარა {lastSale.receivedByName}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon={Printer} onClick={() => void printPdf(lastSale, 'receipt')}>
              ქვითარი
            </Button>
            <Button size="sm" variant="secondary" icon={Printer} onClick={() => void printPdf(lastSale, 'waybill')}>
              ზედნადები
            </Button>
            <button onClick={() => setLastSale(null)} className="p-1.5 text-emerald-700/60 hover:text-emerald-900 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">
        {/* ============================ კალათა ============================ */}
        <div className="w-full lg:w-[38%] lg:min-w-[360px] bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-200 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <Input
              value={receivedByName}
              onChange={(e) => setReceivedByName(e.target.value)}
              placeholder={settings.allowAnonymousSale ? 'ვინ ჩაიბარებს (არასავალდებულო)' : 'ვინ ჩაიბარებს პროდუქციას *'}
              className="flex-1"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 p-6">
                <ShoppingBag className="w-12 h-12" />
                <p className="text-xs font-semibold text-slate-400">კალათა ცარიელია</p>
                <p className="text-[11px] text-slate-400">აირჩიეთ პროდუქტი მარჯვენა მხრიდან</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {cart.map((line, idx) => (
                  <div key={line.product.id} className="p-3 flex items-center gap-2">
                    {line.product.imageUrl ? (
                      <img src={line.product.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                    ) : (
                      <span
                        className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: line.product.color || '#f59e0b' }}
                      >
                        {line.product.name.slice(0, 2)}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{line.product.name}</p>
                      <button
                        onClick={() => setPriceEdit({ index: idx, value: toGel(line.priceTetri).toFixed(2) })}
                        className="text-[11px] text-slate-500 hover:text-amber-700 cursor-pointer"
                        title="ფასის შეცვლა ამ გაყიდვისთვის"
                      >
                        {formatMoney(line.priceTetri)} / {line.product.unitSymbol}
                        {line.priceTetri !== line.product.sellingPriceTetri && ' ✎'}
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQuantity(idx, Math.round((line.quantity - 1) * 1000) / 1000)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        value={line.quantity}
                        onChange={(e) => setQuantity(idx, Number(e.target.value) || 0)}
                        type="number"
                        step="0.001"
                        className="w-14 text-center text-sm font-bold border border-slate-200 rounded-lg py-1 outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        onClick={() => setQuantity(idx, Math.round((line.quantity + 1) * 1000) / 1000)}
                        className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="w-20 text-right text-sm font-bold text-slate-900">
                      {formatMoney(Math.round(line.priceTetri * line.quantity), false)}
                    </div>
                    <button
                      onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-300 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 p-3 space-y-2.5 bg-slate-50">
            {settings.requireShiftForSale && !myShift && (
              <button
                onClick={() => onNavigate('cash')}
                className="w-full bg-amber-100 border border-amber-300 text-amber-800 rounded-xl px-3 py-2 text-xs font-bold cursor-pointer"
              >
                ⚠️ ცვლა არ არის გახსნილი — გასაყიდად ჯერ გახსენით ცვლა
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={PauseCircle} onClick={holdCart} disabled={!cart.length}>
                შეჩერება{held.length > 0 ? ` (${held.length})` : ''}
              </Button>
              <Button
                variant="secondary"
                icon={ClipboardList}
                onClick={() => (cart.length ? setOrderOpen(true) : setShowHeld(true))}
              >
                {cart.length ? 'შეკვეთა' : 'შეჩერებულები'}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-600">ფასდაკლება (₾):</span>
              <Input
                value={discountText}
                onChange={(e) => setDiscountText(e.target.value)}
                inputMode="decimal"
                className="w-32 text-right"
              />
            </div>

            <div className="bg-slate-900 text-white rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold">სულ გადასახდელი:</span>
              <span className="text-xl font-bold text-emerald-400">{formatMoney(grandTotalTetri)}</span>
            </div>

            <Button
              onClick={() => setPayOpen(true)}
              disabled={!cart.length || (settings.requireShiftForSale && !myShift)}
              className="w-full"
              size="lg"
            >
              გადახდა / გაყიდვის დასრულება
            </Button>
          </div>
        </div>

        {/* ========================== პროდუქტები ========================== */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-200 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="პროდუქტის ძებნა…" className="pl-9" />
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setCategoryId('all')}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                    categoryId === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  ყველა
                </button>
                {productCategories
                  .filter((c) => c.active)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCategoryId(c.id)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                        categoryId === c.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => setView('grid')}
                  className={`p-1.5 rounded-lg cursor-pointer ${view === 'grid' ? 'bg-white shadow-sm text-amber-700' : 'text-slate-400'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`p-1.5 rounded-lg cursor-pointer ${view === 'list' ? 'bg-white shadow-sm text-amber-700' : 'text-slate-400'}`}
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {sellable.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                <ImageIcon className="w-12 h-12" />
                <p className="text-xs font-semibold text-slate-400">პროდუქტი ვერ მოიძებნა</p>
              </div>
            ) : view === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {sellable.map((p) => {
                  const available = availableOf(p);
                  const out = available <= 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={out && !settings.allowNegativeStock}
                      className={`relative text-left rounded-2xl border overflow-hidden transition shadow-sm cursor-pointer disabled:cursor-not-allowed ${
                        out ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 hover:border-amber-400 hover:shadow-md'
                      }`}
                    >
                      <div className="relative h-28 bg-slate-50 flex items-center justify-center overflow-hidden">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" loading="lazy" />
                        ) : (
                          <span
                            className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white"
                            style={{ background: p.color || '#f59e0b' }}
                          >
                            {p.name.slice(0, 2)}
                          </span>
                        )}
                        <span className="absolute top-2 left-2 bg-white/95 border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-900">
                          {formatMoney(p.sellingPriceTetri)}
                        </span>
                        <span
                          className={`absolute top-2 right-2 rounded-lg px-2 py-0.5 text-[11px] font-bold ${
                            out ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {formatQty(available)}
                        </span>
                      </div>
                      <div className="p-2.5">
                        <p className="text-sm font-bold text-slate-800 leading-tight line-clamp-2">{p.name}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{p.code}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                {sellable.map((p) => {
                  const available = availableOf(p);
                  const out = available <= 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      disabled={out && !settings.allowNegativeStock}
                      className={`w-full flex items-center gap-3 p-2.5 text-left hover:bg-amber-50/50 cursor-pointer disabled:cursor-not-allowed ${
                        out ? 'opacity-60' : ''
                      }`}
                    >
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-slate-200" />
                      ) : (
                        <span
                          className="w-11 h-11 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: p.color || '#f59e0b' }}
                        >
                          {p.name.slice(0, 2)}
                        </span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-bold text-slate-800 truncate">{p.name}</span>
                        <span className="block text-[11px] text-slate-400 font-mono">{p.code}</span>
                      </span>
                      <Badge tone={out ? 'red' : 'green'}>{formatQty(available)}</Badge>
                      <span className="w-24 text-right text-sm font-bold text-slate-900">{formatMoney(p.sellingPriceTetri)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------- გადახდის ფანჯარა ------------------------- */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="გადახდა"
        subtitle={`სულ გადასახდელი: ${formatMoney(grandTotalTetri)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)}>
              დახურვა
            </Button>
            <Button onClick={() => void completeSale()} loading={loading}>
              დადასტურება
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENTS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => setPaymentMethod(p.id)}
                  className={`py-2.5 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
                    paymentMethod === p.id
                      ? 'bg-amber-600 border-amber-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {p.label}
                </button>
              );
            })}
          </div>

          <Field label="ვინ ჩაიბარებს" required={!settings.allowAnonymousSale}>
            <Input value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ტელეფონი">
              <Input value={receivedByPhone} onChange={(e) => setReceivedByPhone(e.target.value)} />
            </Field>
            {paymentMethod === 'DEBT' && (
              <Field label="გადახდილი (₾)">
                <Input value={paidText} onChange={(e) => setPaidText(e.target.value)} inputMode="decimal" />
              </Field>
            )}
          </div>
          <Field label="კომენტარი">
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* --------------------------- ახალი შეკვეთა -------------------------- */}
      <Modal
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        title="კალათიდან შეკვეთის შექმნა"
        subtitle={`ჯამი: ${formatMoney(subtotalTetri)} · მარაგი ჩამოიწერება მხოლოდ გაცემისას`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOrderOpen(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitOrder()} loading={loading} disabled={!receivedByName.trim()}>
              შეკვეთის შენახვა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="შემკვეთი" required>
            <Input value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ტელეფონი">
              <Input value={orderPhone} onChange={(e) => setOrderPhone(e.target.value)} />
            </Field>
            <Field label="როდისთვის">
              <Input type="date" value={orderDue} onChange={(e) => setOrderDue(e.target.value)} />
            </Field>
          </div>
          <Field label="ავანსი (₾)">
            <Input value={orderPrepaid} onChange={(e) => setOrderPrepaid(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="კომენტარი">
            <Textarea rows={2} value={orderComment} onChange={(e) => setOrderComment(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* ------------------------- შეჩერებული კალათები ---------------------- */}
      <Modal open={showHeld} onClose={() => setShowHeld(false)} title="შეჩერებული კალათები" size="sm">
        {held.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">შეჩერებული კალათა არ არის</p>
        ) : (
          <div className="space-y-2">
            {held.map((h) => (
              <div key={h.id} className="border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{h.receivedByName || 'უსახელო'}</p>
                  <p className="text-[11px] text-slate-500">{h.lines.length} პოზიცია</p>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" onClick={() => restoreHeld(h)}>
                    დაბრუნება
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => persistHeld(held.filter((x) => x.id !== h.id))}>
                    წაშლა
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ---------------------------- ფასის შეცვლა -------------------------- */}
      <Modal
        open={!!priceEdit}
        onClose={() => setPriceEdit(null)}
        title="ფასის შეცვლა ამ გაყიდვისთვის"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPriceEdit(null)}>
              გაუქმება
            </Button>
            <Button
              onClick={() => {
                if (!priceEdit) return;
                const tetri = toTetri(priceEdit.value);
                if (tetri < 0) {
                  toast.error(new Error('ფასი არ შეიძლება იყოს უარყოფითი'));
                  return;
                }
                setCart((prev) => {
                  const next = [...prev];
                  next[priceEdit.index] = { ...next[priceEdit.index], priceTetri: tetri };
                  return next;
                });
                setPriceEdit(null);
              }}
            >
              შენახვა
            </Button>
          </>
        }
      >
        <Field label="ფასი (₾)" required>
          <Input
            value={priceEdit?.value ?? ''}
            onChange={(e) => setPriceEdit((prev) => (prev ? { ...prev, value: e.target.value } : prev))}
            inputMode="decimal"
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  );
};
