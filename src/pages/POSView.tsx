import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CreditCard,
  Landmark,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  UserCheck,
  Wallet,
  X
} from 'lucide-react';
import { Button, Card, Field, Input, Modal, Select } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatMoney, formatQty, toGel, toTetri } from '../lib/money';
import { downloadBlob, generateReceiptPdf, generateWaybillPdf } from '../lib/pdf';
import { logAudit } from '../services/audit';
import { createSale, type CartLine } from '../services/sales';
import type { FinishedProduct, PaymentMethod, Sale } from '../types';

const PAYMENTS: { id: PaymentMethod; label: string; icon: React.ElementType }[] = [
  { id: 'CASH', label: 'ნაღდი', icon: Banknote },
  { id: 'CARD', label: 'ბარათი', icon: CreditCard },
  { id: 'BANK_TRANSFER', label: 'გადარიცხვა', icon: Landmark },
  { id: 'DEBT', label: 'დავალიანება', icon: Wallet }
];

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
  const [discountText, setDiscountText] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [receivedByName, setReceivedByName] = useState('');
  const [receivedByPhone, setReceivedByPhone] = useState('');
  const [comment, setComment] = useState('');
  const [paidText, setPaidText] = useState('0');
  const [loading, setLoading] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [priceEdit, setPriceEdit] = useState<{ index: number; value: string } | null>(null);

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

  const availableOf = (p: FinishedProduct) => stockOf('PRODUCT', p.id, p.salesLocation)?.quantity ?? 0;

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
      if (idx === -1) return [...prev, { product, quantity: 1, priceTetri: product.sellingPriceTetri }];
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
      toast.success(`გაყიდვა შესრულდა — ${sale.saleNo}`);
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
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-6.5rem)]">
      {/* ------------------------- კალათა ------------------------- */}
      <div className="w-full lg:w-[38%] lg:min-w-[380px] bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200 space-y-2">
          <div className="flex items-center gap-2">
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
          <div className="grid grid-cols-2 gap-2">
            <Input value={receivedByPhone} onChange={(e) => setReceivedByPhone(e.target.value)} placeholder="ტელეფონი" />
            <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="კომენტარი" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2 p-6">
              <ShoppingBag className="w-12 h-12" />
              <p className="text-xs font-semibold text-slate-400">კალათა ცარიელია — აირჩიეთ პროდუქტი</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {cart.map((line, idx) => (
                <div key={line.product.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{line.product.name}</p>
                    <button
                      onClick={() => setPriceEdit({ index: idx, value: toGel(line.priceTetri).toFixed(2) })}
                      className="text-[11px] text-slate-500 hover:text-amber-700 cursor-pointer"
                      title="ფასის შეცვლა ამ გაყიდვისთვის"
                    >
                      {formatMoney(line.priceTetri)} / {line.product.unitSymbol}
                      {line.priceTetri !== line.product.sellingPriceTetri && ' (შეცვლილი)'}
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

        <div className="border-t border-slate-200 p-3 space-y-3 bg-slate-50">
          {settings.requireShiftForSale && !myShift && (
            <button
              onClick={() => onNavigate('shift')}
              className="w-full bg-amber-100 border border-amber-300 text-amber-800 rounded-xl px-3 py-2 text-xs font-bold cursor-pointer"
            >
              ⚠️ ცვლა არ არის გახსნილი — გასაყიდად ჯერ გახსენით ცვლა
            </button>
          )}

          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENTS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => setPaymentMethod(p.id)}
                  className={`py-2 rounded-xl text-[11px] font-bold flex flex-col items-center gap-1 border transition cursor-pointer ${
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

          <div className="grid grid-cols-2 gap-2">
            <Field label="ფასდაკლება (₾)">
              <Input value={discountText} onChange={(e) => setDiscountText(e.target.value)} inputMode="decimal" />
            </Field>
            {paymentMethod === 'DEBT' && (
              <Field label="გადახდილი (₾)">
                <Input value={paidText} onChange={(e) => setPaidText(e.target.value)} inputMode="decimal" />
              </Field>
            )}
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>ჯამი</span>
              <span className="font-semibold">{formatMoney(subtotalTetri)}</span>
            </div>
            {discountTetri > 0 && (
              <div className="flex justify-between text-red-600">
                <span>ფასდაკლება</span>
                <span className="font-semibold">− {formatMoney(discountTetri)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold text-slate-900 pt-1 border-t border-slate-200">
              <span>სულ</span>
              <span>{formatMoney(grandTotalTetri)}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={resetCart} disabled={!cart.length} className="flex-1">
              გასუფთავება
            </Button>
            <Button
              onClick={() => void completeSale()}
              loading={loading}
              disabled={!cart.length || (settings.requireShiftForSale && !myShift)}
              className="flex-[2]"
              size="lg"
            >
              გაყიდვის დასრულება
            </Button>
          </div>
        </div>
      </div>

      {/* ------------------------ პროდუქტები ------------------------ */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="პროდუქტის ძებნა…"
              className="pl-9"
            />
          </div>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-48">
            <option value="all">ყველა კატეგორია</option>
            {productCategories
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {sellable.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
              <Package className="w-12 h-12" />
              <p className="text-xs font-semibold text-slate-400">პროდუქტი ვერ მოიძებნა</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {sellable.map((p) => {
                const available = availableOf(p);
                const out = available <= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={out && !settings.allowNegativeStock}
                    className={`text-left rounded-2xl border p-3 transition shadow-sm cursor-pointer disabled:cursor-not-allowed ${
                      out
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : 'bg-white border-slate-200 hover:border-amber-400 hover:shadow-md'
                    }`}
                  >
                    <div className="h-1.5 w-10 rounded-full mb-2" style={{ background: p.color || '#f59e0b' }} />
                    <p className="text-sm font-bold text-slate-800 leading-tight line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                    <p className="text-base font-bold text-amber-700 mt-1">{formatMoney(p.sellingPriceTetri)}</p>
                    <p className={`text-[11px] font-semibold mt-0.5 ${out ? 'text-red-500' : 'text-slate-400'}`}>
                      მარაგი: {formatQty(available)} {p.unitSymbol}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ფასის შეცვლა ერთი გაყიდვისთვის */}
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

      {/* დასრულებული გაყიდვა */}
      <Modal
        open={!!lastSale}
        onClose={() => setLastSale(null)}
        title={`გაყიდვა შესრულდა — ${lastSale?.saleNo ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => lastSale && void printPdf(lastSale, 'receipt')}>
              ქვითარი (80mm)
            </Button>
            <Button icon={Printer} onClick={() => lastSale && void printPdf(lastSale, 'waybill')}>
              ზედნადები PDF
            </Button>
          </>
        }
      >
        {lastSale && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">თანხა</span>
              <span className="font-bold">{formatMoney(lastSale.grandTotalTetri)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">ჩაიბარა</span>
              <span className="font-bold">{lastSale.receivedByName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">პოზიციები</span>
              <span className="font-bold">{lastSale.items.length}</span>
            </div>
            <button
              onClick={() => setLastSale(null)}
              className="w-full mt-3 text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer flex items-center justify-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> დახურვა და ახალი გაყიდვა
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
};
