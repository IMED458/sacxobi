import React, { useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  CreditCard,
  ImageIcon,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  PauseCircle,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  UserCheck,
  X
} from 'lucide-react';
import { Badge, Button, Card, Field, Input, Modal, MoneyInput, Textarea } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatMoney, formatQty, toTetri } from '../lib/money';
import { downloadBlob, generateReceiptPdf, generateWaybillPdf } from '../lib/pdf';
import { logAudit } from '../services/audit';
import { createSale, resolveSaleLocation, type CartLine } from '../services/sales';
import { createOrder } from '../services/orders';
import type { FinishedProduct, PaymentMethod, Sale, StockLocation } from '../types';

const HOLD_KEY = 'sacxobi_pos_hold';
type PriceType = 'RETAIL' | 'WHOLESALE';
type KeypadMode = 'qty' | 'discount' | 'price';

interface HeldCart {
  id: string;
  at: string;
  receivedByName: string;
  priceType: PriceType;
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
  const [selected, setSelected] = useState(-1);
  const [priceType, setPriceType] = useState<PriceType>('RETAIL');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [discountText, setDiscountText] = useState('');
  const [receivedByName, setReceivedByName] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const [keypadMode, setKeypadMode] = useState<KeypadMode>('qty');
  const [buffer, setBuffer] = useState('');

  const [held, setHeld] = useState<HeldCart[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showReceiver, setShowReceiver] = useState(false);

  const [payOpen, setPayOpen] = useState(false);
  const [cashText, setCashText] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [printReceipt, setPrintReceipt] = useState(false);
  const [receivedByPhone, setReceivedByPhone] = useState('');
  const [comment, setComment] = useState('');

  const [orderOpen, setOrderOpen] = useState(false);
  const [orderDue, setOrderDue] = useState('');
  const [orderPrepaid, setOrderPrepaid] = useState('');
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

  /* ------------------------------- ფასები ------------------------------- */

  const priceOf = (p: FinishedProduct, type: PriceType = priceType) =>
    type === 'WHOLESALE' ? p.wholesalePriceTetri ?? p.sellingPriceTetri : p.sellingPriceTetri;

  const switchPriceType = (type: PriceType) => {
    setPriceType(type);
    setCart((prev) => prev.map((l) => ({ ...l, priceTetri: priceOf(l.product, type) })));
  };

  /* ------------------------------ პროდუქტები ---------------------------- */

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

  const locationOf = (p: FinishedProduct): StockLocation =>
    resolveSaleLocation(p, (loc) => stockOf('PRODUCT', p.id, loc)?.quantity ?? 0);

  const availableOf = (p: FinishedProduct) => stockOf('PRODUCT', p.id, locationOf(p))?.quantity ?? 0;

  /* -------------------------------- კალათა ------------------------------ */

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
      if (idx === -1) {
        setSelected(prev.length);
        return [
          ...prev,
          { product, quantity: 1, priceTetri: priceOf(product), location: locationOf(product) }
        ];
      }
      setSelected(idx);
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
      return next;
    });
    setBuffer('');
  };

  const setLineQuantity = (index: number, quantity: number) => {
    setCart((prev) => {
      const next = [...prev];
      const line = next[index];
      if (!line) return prev;
      const available = availableOf(line.product);
      if (!settings.allowNegativeStock && quantity > available) {
        toast.warning(`${line.product.name}: მარაგში დარჩა ${formatQty(available)} ${line.product.unitSymbol}`);
        return prev;
      }
      next[index] = { ...line, quantity: Math.max(0, quantity) };
      return next;
    });
  };

  const removeLine = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    setSelected(-1);
    setBuffer('');
  };

  const resetCart = () => {
    setCart([]);
    setSelected(-1);
    setBuffer('');
    setDiscountText('');
    setReceivedByName('');
    setReceivedByPhone('');
    setComment('');
    setCashText('');
    setPaymentMethod('CASH');
  };

  /* ------------------------------- კლავიატურა --------------------------- */

  const applyBuffer = (raw: string) => {
    setBuffer(raw);
    const value = raw === '' || raw === '.' ? 0 : parseFloat(raw.replace(',', '.'));
    const numeric = isNaN(value) ? 0 : value;
    if (keypadMode === 'discount') {
      setDiscountText(raw);
      return;
    }
    if (selected < 0 || !cart[selected]) return;
    if (keypadMode === 'qty') setLineQuantity(selected, numeric);
    else
      setCart((prev) => {
        const next = [...prev];
        next[selected] = { ...next[selected], priceTetri: Math.round(numeric * 100) };
        return next;
      });
  };

  const pressDigit = (d: string) => {
    if (keypadMode !== 'discount' && selected < 0) {
      toast.info('ჯერ აირჩიეთ პოზიცია კალათაში');
      return;
    }
    if (d === '.' && buffer.includes('.')) return;
    applyBuffer(buffer + d);
  };

  const pressBackspace = () => applyBuffer(buffer.slice(0, -1));
  const pressClear = () => applyBuffer('');

  const switchMode = (mode: KeypadMode) => {
    setKeypadMode(mode);
    setBuffer('');
  };

  /* ------------------------------ მოქმედებები --------------------------- */

  const holdCart = () => {
    if (!cart.length) return;
    persistHeld([
      {
        id: Math.random().toString(36).slice(2, 8),
        at: new Date().toISOString(),
        receivedByName,
        priceType,
        lines: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, priceTetri: l.priceTetri }))
      },
      ...held
    ]);
    resetCart();
    setShowMore(false);
    toast.info('კალათა შეჩერდა');
  };

  const restoreHeld = (entry: HeldCart) => {
    const lines: CartLine[] = [];
    entry.lines.forEach((l) => {
      const product = products.find((p) => p.id === l.productId);
      if (product) lines.push({ product, quantity: l.quantity, priceTetri: l.priceTetri, location: locationOf(product) });
    });
    setCart(lines);
    setPriceType(entry.priceType ?? 'RETAIL');
    setReceivedByName(entry.receivedByName);
    persistHeld(held.filter((h) => h.id !== entry.id));
    setShowHeld(false);
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

  const cashEntered = cashText.trim() !== '';
  const cashGivenTetri = toTetri(cashText || '0');
  // თუ მოლარემ მიღებული თანხა არ აკრიფა — ვთვლით, რომ ზუსტი თანხა გადაიხადეს.
  const changeTetri = cashEntered ? cashGivenTetri - grandTotalTetri : 0;

  const completeSale = async () => {
    if (!user) return;
    const lines = cart.filter((l) => l.quantity > 0);
    if (!lines.length) {
      toast.error(new Error('კალათაში ყველა რაოდენობა ნულია'));
      return;
    }
    setLoading(true);
    try {
      const sale = await createSale(user, settings, {
        lines,
        discountTetri,
        paymentMethod,
        priceType,
        paidTetri: paymentMethod === 'DEBT' ? Math.min(cashGivenTetri, grandTotalTetri) : grandTotalTetri,
        receivedByName,
        receivedByPhone: receivedByPhone || undefined,
        comment: comment || undefined,
        shiftId: myShift?.id
      });
      setLastSale(sale);
      resetCart();
      setPayOpen(false);
      toast.success(`გაყიდვა შესრულდა — ${sale.saleNo}`);
      if (printReceipt) await printPdf(sale, 'receipt');
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
      setOrderPrepaid('');
      setOrderPhone('');
      setOrderComment('');
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
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

  const keypadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9']
  ];

  const modeButton = (mode: KeypadMode, label: string) => (
    <button
      onClick={() => switchMode(mode)}
      className={`px-3 py-3 text-xs font-bold border-r border-b border-slate-200 transition cursor-pointer ${
        keypadMode === mode ? 'bg-amber-600 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-[calc(100vh-6.5rem)]">
      {/* ============================ მარცხენა ============================ */}
      <div className="w-full lg:w-[42%] lg:min-w-[420px] bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        {/* ფასის ტიპი + მიმღები */}
        <div className="p-2.5 border-b border-slate-200 flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-xl p-1 flex-shrink-0">
            <button
              onClick={() => switchPriceType('RETAIL')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                priceType === 'RETAIL' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
              }`}
            >
              ჩვეულებრივი
            </button>
            <button
              onClick={() => switchPriceType('WHOLESALE')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                priceType === 'WHOLESALE' ? 'bg-amber-600 shadow-sm text-white' : 'text-slate-500'
              }`}
            >
              გამტანი
            </button>
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <Input
              value={receivedByName}
              onChange={(e) => setReceivedByName(e.target.value)}
              placeholder={settings.allowAnonymousSale ? 'ვინ ჩაიბარებს' : 'ვინ ჩაიბარებს *'}
              className="py-1.5"
            />
          </div>
        </div>

        {/* კალათა */}
        <div className="flex-1 overflow-y-auto bg-slate-100/60">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
              <ShoppingCart className="w-14 h-14 stroke-[1.2]" />
              <p className="text-sm font-semibold">შეკვეთა ცარიელია</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 bg-white">
              {cart.map((line, idx) => (
                <div
                  key={line.product.id}
                  onClick={() => {
                    setSelected(idx);
                    setBuffer('');
                  }}
                  className={`p-2.5 flex items-center gap-2.5 cursor-pointer transition ${
                    selected === idx ? 'bg-amber-50 border-l-4 border-amber-500' : 'hover:bg-slate-50 border-l-4 border-transparent'
                  }`}
                >
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
                    <p className="text-[11px] text-slate-500">
                      {formatQty(line.quantity)} {line.product.unitSymbol} × {formatMoney(line.priceTetri)}
                      {priceType === 'WHOLESALE' && <span className="text-amber-700 font-bold"> · გამტანი</span>}
                    </p>
                  </div>
                  <div className="text-right text-sm font-bold text-slate-900 w-20">
                    {formatMoney(Math.round(line.priceTetri * line.quantity), false)}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLine(idx);
                    }}
                    className="p-1.5 text-slate-300 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* მუქი ზოლი */}
        <div className="bg-slate-800 text-white px-3 py-2.5 flex items-center gap-2">
          <button
            onClick={() => setShowMore(true)}
            title="დამატებითი მოქმედებები"
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          <button
            onClick={() => lastSale && void printPdf(lastSale, 'receipt')}
            disabled={!lastSale}
            title={lastSale ? `ბოლო ქვითრის ბეჭდვა (${lastSale.saleNo})` : 'ჯერ გაყიდვა არ შესრულებულა'}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
          </button>
          <div className="flex-1 text-right">
            <span className="text-xs text-slate-300">სულ გადასახდელი: </span>
            <span className="text-lg font-bold">{formatMoney(grandTotalTetri, false)}</span>
          </div>
        </div>

        {/* კლავიატურა */}
        <div className="grid grid-cols-5 border-t border-slate-200">
          <div className="col-span-1 flex flex-col">
            {modeButton('qty', 'რაოდენობა')}
            {modeButton('discount', 'ფასდაკლება')}
            {modeButton('price', 'ფასი')}
            <button
              onClick={() => setShowReceiver(true)}
              className="px-3 py-3 text-xs font-bold border-r border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              მიმღები
            </button>
          </div>

          <div className="col-span-2 grid grid-cols-3">
            {keypadKeys.flat().map((k) => (
              <button
                key={k}
                onClick={() => pressDigit(k)}
                className="py-3 text-base font-bold text-slate-700 border-r border-b border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                {k}
              </button>
            ))}
            <button
              onClick={pressBackspace}
              className="py-3 text-base font-bold text-slate-700 border-r border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              ⌫
            </button>
            <button
              onClick={() => pressDigit('0')}
              className="py-3 text-base font-bold text-slate-700 border-r border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              0
            </button>
            <button
              onClick={() => pressDigit('.')}
              className="py-3 text-base font-bold text-slate-700 border-r border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              .
            </button>
          </div>

          <div className="col-span-1 grid grid-rows-4">
            <button
              onClick={pressClear}
              className="row-span-3 text-base font-bold text-slate-700 border-r border-b border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              C
            </button>
            <button
              onClick={() => selected >= 0 && removeLine(selected)}
              disabled={selected < 0}
              className="text-[11px] font-bold text-red-600 border-r border-slate-200 hover:bg-red-50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              წაშლა
            </button>
          </div>

          <button
            onClick={() => setPayOpen(true)}
            disabled={!cart.length || (settings.requireShiftForSale && !myShift)}
            className="col-span-1 bg-amber-600 hover:bg-amber-700 text-white font-bold flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-5 h-5" />
            <span className="text-sm">გადახდა</span>
          </button>
        </div>

        {settings.requireShiftForSale && !myShift && (
          <button
            onClick={() => onNavigate('cash')}
            className="bg-amber-100 border-t border-amber-300 text-amber-800 px-3 py-2 text-xs font-bold cursor-pointer"
          >
            ⚠️ ცვლა არ არის გახსნილი — გასაყიდად ჯერ გახსენით ცვლა
          </button>
        )}
      </div>

      {/* ============================ მარჯვენა ============================ */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="პროდუქტის ძებნა" className="pl-9" />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setCategoryId('all')}
                className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
                  categoryId === 'all' ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                მთავარი
              </button>
              {productCategories
                .filter((c) => c.active)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategoryId(c.id)}
                    className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
                      categoryId === c.id ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
              <button
                onClick={() => setView('list')}
                className={`p-1.5 rounded-lg cursor-pointer ${view === 'list' ? 'bg-white shadow-sm text-amber-700' : 'text-slate-400'}`}
              >
                <ListIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('grid')}
                className={`p-1.5 rounded-lg cursor-pointer ${view === 'grid' ? 'bg-white shadow-sm text-amber-700' : 'text-slate-400'}`}
              >
                <LayoutGrid className="w-4 h-4" />
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
                    className={`text-left rounded-xl border overflow-hidden transition shadow-sm cursor-pointer disabled:cursor-not-allowed ${
                      out ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 hover:border-amber-400 hover:shadow-md'
                    }`}
                  >
                    <div className="relative h-28 bg-gradient-to-b from-slate-100 to-slate-200 flex items-center justify-center overflow-hidden">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" loading="lazy" />
                      ) : (
                        <ImageIcon className="w-9 h-9 text-slate-400 stroke-[1.2]" />
                      )}
                      <span className="absolute bottom-2 left-2 text-sm font-bold text-slate-900 bg-white/90 rounded-md px-1.5 py-0.5">
                        {formatMoney(priceOf(p), false)} ₾
                      </span>
                      <span
                        className={`absolute top-2 right-2 rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                          out ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {formatQty(available)}
                      </span>
                    </div>
                    <div className="p-2.5">
                      <p className="text-[13px] font-bold text-slate-800 leading-tight line-clamp-2 min-h-[2.2rem]">{p.name}</p>
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
                      <span className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-slate-800 truncate">{p.name}</span>
                      <span className="block text-[11px] text-slate-400 font-mono">{p.code}</span>
                    </span>
                    <Badge tone={out ? 'red' : 'green'}>{formatQty(available)}</Badge>
                    <span className="w-24 text-right text-sm font-bold text-slate-900">{formatMoney(priceOf(p))}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ------------------------- გადახდის ეკრანი ------------------------- */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="გადახდა" size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-xs font-bold text-slate-500">სულ გადასახდელი (₾)</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{formatMoney(grandTotalTetri, false)}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500">ხურდა (₾)</p>
                <p className={`text-3xl font-bold mt-1 ${changeTetri < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {formatMoney(changeTetri, false)}
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-600 mb-1.5">ნაღდი ანგარიშსწორება</p>
              <div className="flex gap-2">
                <MoneyInput value={cashText} onChange={setCashText} className="flex-1 text-lg font-bold" autoFocus />
                <Button variant="secondary" onClick={() => setCashText((grandTotalTetri / 100).toFixed(2))}>
                  ზუსტი თანხა
                </Button>
              </div>
            </div>

            <label className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 cursor-pointer">
              <span className="text-sm font-semibold text-slate-700">ქვითრის ამობეჭდვა</span>
              <input
                type="checkbox"
                checked={printReceipt}
                onChange={(e) => setPrintReceipt(e.target.checked)}
                className="w-10 h-5 accent-amber-600 cursor-pointer"
              />
            </label>

            <div>
              <p className="text-xs font-bold text-slate-600 mb-1.5">უნაღდო ანგარიშსწორება</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'CARD' as PaymentMethod, label: 'ბარათი' },
                    { id: 'BANK_TRANSFER' as PaymentMethod, label: 'გადარიცხვა' },
                    { id: 'DEBT' as PaymentMethod, label: 'დავალიანება' }
                  ]
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(paymentMethod === m.id ? 'CASH' : m.id)}
                    className={`py-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      paymentMethod === m.id
                        ? 'bg-amber-600 border-amber-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                {paymentMethod === 'CASH' ? 'არჩეულია: ნაღდი ანგარიშსწორება' : 'ხელახლა დაჭერით დაბრუნდება ნაღდზე'}
              </p>
            </div>

            <Field label="ვინ ჩაიბარებს" required={!settings.allowAnonymousSale}>
              <Input value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} />
            </Field>
            <Field label="კომენტარი">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              {['1', '2', '3'].map((k) => (
                <button
                  key={k}
                  onClick={() => setCashText((v) => v + k)}
                  className="py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg font-bold cursor-pointer"
                >
                  {k}
                </button>
              ))}
              <button
                onClick={() => setCashText(((toTetri(cashText || '0') + 1000) / 100).toFixed(2))}
                className="py-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold cursor-pointer"
              >
                +10
              </button>
              {['4', '5', '6'].map((k) => (
                <button
                  key={k}
                  onClick={() => setCashText((v) => v + k)}
                  className="py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg font-bold cursor-pointer"
                >
                  {k}
                </button>
              ))}
              <button
                onClick={() => setCashText(((toTetri(cashText || '0') + 2000) / 100).toFixed(2))}
                className="py-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold cursor-pointer"
              >
                +20
              </button>
              {['7', '8', '9'].map((k) => (
                <button
                  key={k}
                  onClick={() => setCashText((v) => v + k)}
                  className="py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg font-bold cursor-pointer"
                >
                  {k}
                </button>
              ))}
              <button
                onClick={() => setCashText(((toTetri(cashText || '0') + 5000) / 100).toFixed(2))}
                className="py-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold cursor-pointer"
              >
                +50
              </button>
              <button
                onClick={() => setCashText((v) => v.slice(0, -1))}
                className="py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg font-bold cursor-pointer"
              >
                ⌫
              </button>
              <button
                onClick={() => setCashText((v) => v + '0')}
                className="py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg font-bold cursor-pointer"
              >
                0
              </button>
              <button
                onClick={() => setCashText((v) => (v.includes('.') ? v : v + '.'))}
                className="py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg font-bold cursor-pointer"
              >
                .
              </button>
              <button
                onClick={() => setCashText('')}
                className="py-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-lg font-bold cursor-pointer"
              >
                C
              </button>
            </div>

            <Button
              size="lg"
              className="w-full mt-2"
              loading={loading}
              disabled={paymentMethod === 'CASH' && cashEntered && changeTetri < 0}
              onClick={() => void completeSale()}
            >
              დადასტურება
            </Button>
            {paymentMethod === 'CASH' && cashEntered && changeTetri < 0 && (
              <p className="text-[11px] text-red-600 text-center">მიღებული თანხა გადასახდელზე ნაკლებია</p>
            )}
            {paymentMethod === 'CASH' && !cashEntered && (
              <p className="text-[11px] text-slate-400 text-center">
                თუ მიღებულ თანხას არ აკრეფთ — ჩაითვლება, რომ ზუსტი თანხა გადაიხადეს
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* --------------------------- დამატებითი მენიუ ------------------------ */}
      <Modal open={showMore} onClose={() => setShowMore(false)} title="დამატებითი მოქმედებები" size="sm">
        <div className="space-y-2">
          <Button variant="secondary" icon={PauseCircle} className="w-full" onClick={holdCart} disabled={!cart.length}>
            შეჩერება
          </Button>
          <Button
            variant="secondary"
            icon={ClipboardList}
            className="w-full"
            onClick={() => {
              setShowMore(false);
              setShowHeld(true);
            }}
          >
            შეჩერებულები {held.length > 0 ? `(${held.length})` : ''}
          </Button>
          <Button
            variant="secondary"
            icon={ClipboardList}
            className="w-full"
            onClick={() => {
              setShowMore(false);
              setOrderOpen(true);
            }}
            disabled={!cart.length}
          >
            შეკვეთად გადაქცევა
          </Button>
          {lastSale && (
            <Button variant="secondary" icon={Printer} className="w-full" onClick={() => void printPdf(lastSale, 'waybill')}>
              ბოლო ზედნადების ბეჭდვა
            </Button>
          )}
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

      {/* ------------------------------ მიმღები ----------------------------- */}
      <Modal
        open={showReceiver}
        onClose={() => setShowReceiver(false)}
        title="ვინ ჩაიბარებს პროდუქციას"
        size="sm"
        footer={<Button onClick={() => setShowReceiver(false)}>დახურვა</Button>}
      >
        <div className="space-y-4">
          <Field label="სახელი, გვარი" required={!settings.allowAnonymousSale}>
            <Input value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} autoFocus />
          </Field>
          <Field label="ტელეფონი">
            <Input value={receivedByPhone} onChange={(e) => setReceivedByPhone(e.target.value)} />
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
            <MoneyInput value={orderPrepaid} onChange={setOrderPrepaid} />
          </Field>
          <Field label="კომენტარი">
            <Textarea rows={2} value={orderComment} onChange={(e) => setOrderComment(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* ბოლო გაყიდვის ზოლი */}
      {lastSale && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-3 z-40 no-print">
          <span className="text-xs font-bold">
            {lastSale.saleNo} · {formatMoney(lastSale.grandTotalTetri)}
          </span>
          <button onClick={() => void printPdf(lastSale, 'receipt')} className="text-xs font-bold underline cursor-pointer">
            ქვითარი
          </button>
          <button onClick={() => void printPdf(lastSale, 'waybill')} className="text-xs font-bold underline cursor-pointer">
            ზედნადები
          </button>
          <button onClick={() => setLastSale(null)} className="opacity-70 hover:opacity-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
