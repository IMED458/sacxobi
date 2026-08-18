import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, FileClock, Package, Snowflake, Warehouse } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { addDays, formatDateTime, todayBusinessDate } from '../lib/dates';
import { formatMoney, formatQty, safeDiv } from '../lib/money';
import { FLOOR_LABELS, LOCATION_LABELS } from '../lib/permissions';
import { fetchMovementsRange } from '../services/reports';
import { createStocktake, type StocktakeLineInput } from '../services/stocktake';
import type { MovementType, StockLocation, StockMovement } from '../types';

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  PURCHASE: 'შესყიდვა',
  PRODUCTION_CONSUMPTION: 'წარმოებაში დახარჯვა',
  PRODUCTION_OUTPUT: 'წარმოების გამოსავალი',
  TRANSFER_OUT: 'გადატანა (გასვლა)',
  TRANSFER_IN: 'გადატანა (შემოსვლა)',
  SALE: 'გაყიდვა',
  RETURN: 'დაბრუნება',
  WASTE: 'დანაკარგი',
  ADJUSTMENT: 'კორექტირება',
  INITIAL_STOCK: 'საწყისი ნაშთი'
};

/* ------------------------- მზა პროდუქტის მარაგი ------------------------ */

export const FinishedStockView: React.FC = () => {
  const { products, stockLevels } = useData();
  const { can } = useAuth();
  const showValue = can('inventory.view');

  const rows = products
    .filter((p) => p.active)
    .map((p) => {
      const lower = stockLevels.find((l) => l.id === `PRODUCT__${p.id}__LOWER_FLOOR`);
      const upper = stockLevels.find((l) => l.id === `PRODUCT__${p.id}__UPPER_FLOOR`);
      return {
        product: p,
        lowerQty: lower?.quantity ?? 0,
        upperQty: upper?.quantity ?? 0,
        valueTetri: (lower?.valueTetri ?? 0) + (upper?.valueTetri ?? 0)
      };
    });

  const totalValue = rows.reduce((s, r) => s + r.valueTetri, 0);

  return (
    <Card>
      <CardHeader
        title="მზა პროდუქტის მარაგი"
        subtitle="ორივე სართულის ნაშთი"
        icon={Package}
        actions={showValue && <Badge tone="amber">მარაგის ღირებულება: {formatMoney(totalValue)}</Badge>}
      />
      {rows.length === 0 ? (
        <EmptyState icon={Package} title="პროდუქტები ვერ მოიძებნა" />
      ) : (
        <Table
          head={
            <tr>
              <Th>პროდუქტი</Th>
              <Th>კოდი</Th>
              <Th>ტიპი</Th>
              <Th className="text-right">{FLOOR_LABELS.LOWER_FLOOR}</Th>
              <Th className="text-right">{FLOOR_LABELS.UPPER_FLOOR}</Th>
              <Th className="text-right">სულ</Th>
              <Th className="text-right">გასაყიდი ფასი</Th>
              {showValue && <Th className="text-right">ღირებულება</Th>}
            </tr>
          }
        >
          {rows.map((r) => (
            <tr key={r.product.id} className="hover:bg-slate-50">
              <Td className="font-semibold text-slate-800">{r.product.name}</Td>
              <Td className="text-xs text-slate-500">{r.product.code}</Td>
              <Td>
                <Badge tone={r.product.kind === 'PRODUCED' ? 'amber' : 'blue'}>
                  {r.product.kind === 'PRODUCED' ? 'ჩვენი წარმოება' : 'შესყიდული'}
                </Badge>
              </Td>
              <Td className="text-right">{formatQty(r.lowerQty)}</Td>
              <Td className="text-right font-bold">{formatQty(r.upperQty)}</Td>
              <Td className="text-right">{formatQty(r.lowerQty + r.upperQty)}</Td>
              <Td className="text-right">{formatMoney(r.product.sellingPriceTetri)}</Td>
              {showValue && <Td className="text-right text-slate-500">{formatMoney(r.valueTetri)}</Td>}
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
};

/* --------------------------- ნედლეულის მარაგი -------------------------- */

export const MaterialStockView: React.FC<{ location: 'WAREHOUSE' | 'FRIDGE' }> = ({ location }) => {
  const { materials, stockLevels } = useData();
  const [search, setSearch] = useState('');

  const rows = materials
    .filter((m) => m.active && (!search.trim() || m.name.toLowerCase().includes(search.trim().toLowerCase())))
    .map((m) => {
      const level = stockLevels.find((l) => l.id === `MATERIAL__${m.id}__${location}`);
      const quantity = level?.quantity ?? 0;
      const valueTetri = level?.valueTetri ?? 0;
      return {
        material: m,
        quantity,
        valueTetri,
        unitCostTetri: Math.round(safeDiv(valueTetri, quantity || 1)),
        low: m.minStock > 0 && quantity <= m.minStock
      };
    })
    .filter((r) => r.quantity !== 0 || r.material.defaultStorageLocation === location);

  const totalValue = rows.reduce((s, r) => s + r.valueTetri, 0);

  return (
    <Card>
      <CardHeader
        title={LOCATION_LABELS[location]}
        subtitle="ნედლეულის მიმდინარე ნაშთი და ღირებულება"
        icon={location === 'FRIDGE' ? Snowflake : Warehouse}
        actions={
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ძებნა…" className="w-48" />
            <Badge tone="amber">ღირებულება: {formatMoney(totalValue)}</Badge>
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Warehouse} title="მარაგი ცარიელია" description="დაამატეთ ნედლეული შესყიდვის დოკუმენტით" />
      ) : (
        <Table
          head={
            <tr>
              <Th>დასახელება</Th>
              <Th>კოდი</Th>
              <Th className="text-right">ნაშთი</Th>
              <Th>ერთეული</Th>
              <Th className="text-right">საშ. ფასი</Th>
              <Th className="text-right">ღირებულება</Th>
              <Th className="text-right">მინ. ნაშთი</Th>
              <Th />
            </tr>
          }
        >
          {rows.map((r) => (
            <tr key={r.material.id} className={`hover:bg-slate-50 ${r.low ? 'bg-red-50/40' : ''}`}>
              <Td className="font-semibold text-slate-800">{r.material.name}</Td>
              <Td className="text-xs text-slate-500">{r.material.code}</Td>
              <Td className="text-right font-bold">{formatQty(r.quantity)}</Td>
              <Td className="text-xs">{r.material.unitSymbol}</Td>
              <Td className="text-right">{formatMoney(r.unitCostTetri)}</Td>
              <Td className="text-right">{formatMoney(r.valueTetri)}</Td>
              <Td className="text-right text-slate-500">{formatQty(r.material.minStock)}</Td>
              <Td>{r.low && <Badge tone="red">დაბალი ნაშთი</Badge>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
};

/* ---------------------------- მოძრაობები ------------------------------ */

export const StockMovementsView: React.FC = () => {
  const toast = useToast();
  const [from, setFrom] = useState(addDays(todayBusinessDate(), -7));
  const [to, setTo] = useState(todayBusinessDate());
  const [type, setType] = useState<'all' | MovementType>('all');
  const [items, setItems] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMovementsRange(from, to)
      .then((data) => {
        if (!cancelled) setItems(data.sort((a, b) => b.seq - a.seq));
      })
      .catch((err) => toast.error(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const filtered = items.filter((m) => type === 'all' || m.movementType === type);

  return (
    <Card>
      <CardHeader
        title="მარაგის მოძრაობები"
        subtitle="ყველა ცვლილება — უცვლელი ჟურნალი"
        icon={FileClock}
        actions={
          <>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            <Select value={type} onChange={(e) => setType(e.target.value as MovementType | 'all')} className="w-52">
              <option value="all">ყველა ტიპი</option>
              {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </>
        }
      />
      {loading ? (
        <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileClock} title="მოძრაობა ვერ მოიძებნა" />
      ) : (
        <Table
          head={
            <tr>
              <Th>თარიღი</Th>
              <Th>დასახელება</Th>
              <Th>ადგილი</Th>
              <Th>ტიპი</Th>
              <Th className="text-right">ცვლილება</Th>
              <Th className="text-right">იყო</Th>
              <Th className="text-right">გახდა</Th>
              <Th className="text-right">ღირებულება</Th>
              <Th>დოკუმენტი</Th>
              <Th>მომხმარებელი</Th>
            </tr>
          }
        >
          {filtered.slice(0, 400).map((m) => (
            <tr key={m.id} className="hover:bg-slate-50">
              <Td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(m.timestamp)}</Td>
              <Td className="font-semibold text-slate-800">{m.itemName}</Td>
              <Td className="text-xs">{LOCATION_LABELS[m.location]}</Td>
              <Td className="text-xs">{MOVEMENT_LABELS[m.movementType]}</Td>
              <Td className={`text-right font-bold ${m.quantity < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {m.quantity > 0 ? '+' : ''}
                {formatQty(m.quantity)} {m.unitSymbol}
              </Td>
              <Td className="text-right text-slate-500">{formatQty(m.previousQuantity)}</Td>
              <Td className="text-right">{formatQty(m.newQuantity)}</Td>
              <Td className="text-right">{formatMoney(m.totalCostTetri)}</Td>
              <Td className="text-xs text-slate-500">{m.referenceNo ?? m.referenceType}</Td>
              <Td className="text-xs">{m.userName}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
};

/* -------------------------- ინვენტარიზაცია ---------------------------- */

export const StocktakeView: React.FC = () => {
  const { user } = useAuth();
  const { materials, products, stockLevels, settings } = useData();
  const toast = useToast();

  const [location, setLocation] = useState<StockLocation>('WAREHOUSE');
  const [reason, setReason] = useState('');
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isFloor = location === 'LOWER_FLOOR' || location === 'UPPER_FLOOR';

  const rows = useMemo(() => {
    if (isFloor) {
      return products
        .filter((p) => p.active)
        .map((p) => {
          const level = stockLevels.find((l) => l.id === `PRODUCT__${p.id}__${location}`);
          return {
            key: p.id,
            itemType: 'PRODUCT' as const,
            itemId: p.id,
            itemName: p.name,
            unitSymbol: p.unitSymbol,
            expected: level?.quantity ?? 0,
            valueTetri: level?.valueTetri ?? 0
          };
        });
    }
    return materials
      .filter((m) => m.active)
      .map((m) => {
        const level = stockLevels.find((l) => l.id === `MATERIAL__${m.id}__${location}`);
        return {
          key: m.id,
          itemType: 'MATERIAL' as const,
          itemId: m.id,
          itemName: m.name,
          unitSymbol: m.unitSymbol,
          expected: level?.quantity ?? 0,
          valueTetri: level?.valueTetri ?? 0
        };
      });
  }, [isFloor, materials, products, stockLevels, location]);

  const changed = rows.filter((r) => actuals[r.key] !== undefined && actuals[r.key] !== '' && Number(actuals[r.key]) !== r.expected);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const lines: StocktakeLineInput[] = changed.map((r) => ({
        itemType: r.itemType,
        itemId: r.itemId,
        itemName: r.itemName,
        unitSymbol: r.unitSymbol,
        location,
        expectedQuantity: r.expected,
        actualQuantity: Number(actuals[r.key]),
        currentValueTetri: r.valueTetri
      }));
      const doc = await createStocktake(user, settings, location, lines, reason);
      toast.success(`ინვენტარიზაცია დასრულდა — ${doc.documentNo}`);
      setActuals({});
      setReason('');
      setConfirmOpen(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="ინვენტარიზაცია"
        subtitle="ფაქტობრივი ნაშთის დაფიქსირება — განსხვავება ჩაიწერება კორექტირების მოძრაობად"
        icon={ClipboardList}
        actions={
          <>
            <Select value={location} onChange={(e) => setLocation(e.target.value as StockLocation)} className="w-52">
              <option value="WAREHOUSE">{LOCATION_LABELS.WAREHOUSE}</option>
              <option value="FRIDGE">{LOCATION_LABELS.FRIDGE}</option>
              <option value="LOWER_FLOOR">{LOCATION_LABELS.LOWER_FLOOR}</option>
              <option value="UPPER_FLOOR">{LOCATION_LABELS.UPPER_FLOOR}</option>
            </Select>
            <Button disabled={!changed.length} onClick={() => setConfirmOpen(true)}>
              დაფიქსირება ({changed.length})
            </Button>
          </>
        }
      />
      <Table
        head={
          <tr>
            <Th>დასახელება</Th>
            <Th className="text-right">სისტემური ნაშთი</Th>
            <Th className="text-right">ფაქტობრივი</Th>
            <Th className="text-right">სხვაობა</Th>
            <Th>ერთეული</Th>
          </tr>
        }
      >
        {rows.map((r) => {
          const actual = actuals[r.key];
          const diff = actual === undefined || actual === '' ? 0 : Number(actual) - r.expected;
          return (
            <tr key={r.key} className="hover:bg-slate-50">
              <Td className="font-semibold text-slate-800">{r.itemName}</Td>
              <Td className="text-right">{formatQty(r.expected)}</Td>
              <Td className="text-right">
                <input
                  value={actual ?? ''}
                  onChange={(e) => setActuals((prev) => ({ ...prev, [r.key]: e.target.value }))}
                  type="number"
                  step="0.001"
                  placeholder="—"
                  className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-amber-500"
                />
              </Td>
              <Td className={`text-right font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${formatQty(diff)}`}
              </Td>
              <Td className="text-xs">{r.unitSymbol}</Td>
            </tr>
          );
        })}
      </Table>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="ინვენტარიზაციის დაფიქსირება"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submit()} loading={saving} disabled={!reason.trim()}>
              დადასტურება
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              {changed.length} პოზიციაზე დაფიქსირდება განსხვავება. ცვლილება შეუქცევადია და აისახება Audit Log-ში.
            </p>
          </div>
          <Field label="საფუძველი / მიზეზი" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="მაგ: თვის ბოლოს ინვენტარიზაცია" />
          </Field>
        </div>
      </Modal>
    </Card>
  );
};
