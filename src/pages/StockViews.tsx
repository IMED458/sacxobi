import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, FileClock, Package, Snowflake, Trash2, Warehouse } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, MoneyInput, NumberInput, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { addDays, formatDateTime, todayBusinessDate } from '../lib/dates';
import { formatMoney, formatQty, safeDiv, tetriToInput, toTetri } from '../lib/money';
import { LOCATION_LABELS } from '../lib/permissions';
import { fetchMovementsRange } from '../services/reports';
import { createStocktake, type StocktakeLineInput } from '../services/stocktake';
import { deleteStockRecord, setStockQuantity } from '../services/opening';
import { DeleteRecordButton } from '../components/DeleteRecordButton';
import { COL } from '../services/db';
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

/* --------------------------- ერთიანი მარაგი ---------------------------- */

const LOCATIONS: StockLocation[] = ['WAREHOUSE', 'FRIDGE', 'LOWER_FLOOR', 'UPPER_FLOOR'];

interface StockRow {
  key: string;
  itemType: 'MATERIAL' | 'PRODUCT';
  itemId: string;
  name: string;
  code: string;
  unitSymbol: string;
  imageUrl?: string;
  quantity: number;
  valueTetri: number;
  minStock: number;
  sellingPriceTetri?: number;
}

/**
 * ერთი ადგილის სრული ნაშთი — ნედლეულიც და მზა/გასაყიდი პროდუქტიც.
 * (ადრე მაცივარში მხოლოდ ნედლეული ჩანდა და შესყიდული პროდუქტი „იკარგებოდა".)
 */
export const StockByLocationView: React.FC<{ location: StockLocation }> = ({ location }) => {
  const { materials, products, stockLevels, settings } = useData();
  const { user, can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const showValue = can('inventory.view');

  const [editRow, setEditRow] = useState<StockRow | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editCost, setEditCost] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState<StockRow | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const openEdit = (row: StockRow) => {
    setEditRow(row);
    setEditQty(row.quantity);
    setEditCost(row.quantity ? tetriToInput(Math.round(safeDiv(row.valueTetri, row.quantity))) : '');
    setEditReason('');
  };

  const submitEdit = async () => {
    if (!user || !editRow) return;
    setSaving(true);
    try {
      await setStockQuantity(user, settings, {
        itemType: editRow.itemType,
        itemId: editRow.itemId,
        itemName: editRow.name,
        unitSymbol: editRow.unitSymbol,
        location,
        targetQuantity: editQty,
        unitCostTetri: editCost ? toTetri(editCost) : Math.round(safeDiv(editRow.valueTetri, editRow.quantity || 1)),
        currentQuantity: editRow.quantity,
        reason: editReason
      });
      toast.success('ნაშთი განახლდა');
      setEditRow(null);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitDelete = async () => {
    if (!user || !deleteRow) return;
    setSaving(true);
    try {
      await deleteStockRecord(
        user,
        { itemType: deleteRow.itemType, itemId: deleteRow.itemId, itemName: deleteRow.name, location },
        deleteReason
      );
      toast.success('ნაშთის ჩანაწერი წაიშალა');
      setDeleteRow(null);
      setDeleteReason('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const rows: StockRow[] = useMemo(() => {
    const list: StockRow[] = [];

    materials
      .filter((m) => m.active)
      .forEach((m) => {
        const level = stockLevels.find((l) => l.id === `MATERIAL__${m.id}__${location}`);
        const quantity = level?.quantity ?? 0;
        if (quantity === 0 && m.defaultStorageLocation !== location) return;
        list.push({
          key: `M-${m.id}`,
          itemType: 'MATERIAL',
          itemId: m.id,
          name: m.name,
          code: m.code,
          unitSymbol: m.unitSymbol,
          imageUrl: m.imageUrl,
          quantity,
          valueTetri: level?.valueTetri ?? 0,
          minStock: m.minStock
        });
      });

    products
      .filter((p) => p.active)
      .forEach((p) => {
        const level = stockLevels.find((l) => l.id === `PRODUCT__${p.id}__${location}`);
        const quantity = level?.quantity ?? 0;
        const belongsHere = p.salesLocation === location || p.productionFloor === location;
        if (quantity === 0 && !belongsHere) return;
        list.push({
          key: `P-${p.id}`,
          itemType: 'PRODUCT',
          itemId: p.id,
          name: p.name,
          code: p.code,
          unitSymbol: p.unitSymbol,
          imageUrl: p.imageUrl,
          quantity,
          valueTetri: level?.valueTetri ?? 0,
          minStock: 0,
          sellingPriceTetri: p.sellingPriceTetri
        });
      });

    const q = search.trim().toLowerCase();
    return list
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'ka'));
  }, [materials, products, stockLevels, location, search]);

  const totalValue = rows.reduce((s, r) => s + r.valueTetri, 0);

  return (
    <Card>
      <CardHeader
        title={LOCATION_LABELS[location]}
        subtitle="ამ ადგილას არსებული ყველა ნივთი — ნედლეულიც და გასაყიდი პროდუქტიც"
        icon={location === 'FRIDGE' ? Snowflake : location === 'WAREHOUSE' ? Warehouse : Package}
        actions={
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ძებნა…" className="w-48" />
            {showValue && <Badge tone="amber">ღირებულება: {formatMoney(totalValue)}</Badge>}
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="აქ ჯერ არაფერია"
          description="მარაგი ჩნდება შესყიდვის, წარმოების ან გადატანის შემდეგ"
        />
      ) : (
        <Table
          head={
            <tr>
              <Th>დასახელება</Th>
              <Th>ტიპი</Th>
              <Th className="text-right">ნაშთი</Th>
              <Th>ერთეული</Th>
              {showValue && <Th className="text-right">საშ. ფასი</Th>}
              {showValue && <Th className="text-right">ღირებულება</Th>}
              <Th className="text-right">გასაყიდი ფასი</Th>
              <Th />
            </tr>
          }
        >
          {rows.map((r) => {
            const low = r.minStock > 0 && r.quantity <= r.minStock;
            return (
              <tr key={r.key} className={`hover:bg-slate-50 ${low ? 'bg-red-50/40' : ''}`}>
                <Td className="font-semibold text-slate-800">
                  <span className="flex items-center gap-2.5">
                    {r.imageUrl ? (
                      <img src={r.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200" />
                    ) : null}
                    <span>
                      {r.name}
                      <span className="block text-[11px] text-slate-400">{r.code}</span>
                    </span>
                  </span>
                </Td>
                <Td>
                  <Badge tone={r.itemType === 'MATERIAL' ? 'slate' : 'blue'}>
                    {r.itemType === 'MATERIAL' ? 'ნედლეული' : 'პროდუქტი'}
                  </Badge>
                </Td>
                <Td className="text-right font-bold">{formatQty(r.quantity)}</Td>
                <Td className="text-xs">{r.unitSymbol}</Td>
                {showValue && (
                  <Td className="text-right">{formatMoney(Math.round(safeDiv(r.valueTetri, r.quantity || 1)))}</Td>
                )}
                {showValue && <Td className="text-right">{formatMoney(r.valueTetri)}</Td>}
                <Td className="text-right">{r.sellingPriceTetri != null ? formatMoney(r.sellingPriceTetri) : '—'}</Td>
                <Td>
                  <div className="flex items-center gap-1 justify-end">
                    {low && <Badge tone="red">დაბალი</Badge>}
                    {can('inventory.adjust') && (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                        რედაქტირება
                      </Button>
                    )}
                    {can('admin.delete') && (
                      <button
                        onClick={() => setDeleteRow(r)}
                        title="ნაშთის ჩანაწერის წაშლა"
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}

      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title={`ნაშთის რედაქტირება — ${editRow?.name ?? ''}`}
        subtitle={LOCATION_LABELS[location]}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditRow(null)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitEdit()} loading={saving} disabled={!editReason.trim()}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
            მიმდინარე ნაშთი:{' '}
            <span className="font-bold text-slate-900">
              {formatQty(editRow?.quantity ?? 0)} {editRow?.unitSymbol}
            </span>
          </div>
          <Field label="ახალი რაოდენობა" required>
            <NumberInput value={editQty} onChange={setEditQty} autoFocus />
          </Field>
          <Field label="ერთეულის ფასი (₾)" hint="გამოიყენება მხოლოდ ნაშთის გაზრდისას">
            <MoneyInput value={editCost} onChange={setEditCost} />
          </Field>
          <Field label="საფუძველი" required hint="ჩაიწერება მოძრაობებში და Audit Log-ში">
            <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="მაგ. ხელით კორექტირება" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!deleteRow}
        onClose={() => setDeleteRow(null)}
        title="ნაშთის ჩანაწერის წაშლა"
        subtitle={deleteRow?.name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteRow(null)}>
              გაუქმება
            </Button>
            <Button variant="danger" onClick={() => void submitDelete()} loading={saving} disabled={!deleteReason.trim()}>
              წაშლა
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            წაიშლება ამ ადგილას არსებული ნაშთი და მისი ყველა პარტია. მოძრაობების ისტორია დარჩება.
          </p>
          <Field label="წაშლის მიზეზი" required>
            <Input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </Card>
  );
};

/** ყველა ადგილის მოკლე მიმოხილვა — რა სად დევს. */
export const StockOverviewView: React.FC = () => {
  const { stockLevels, products, materials } = useData();
  const { can } = useAuth();
  const showValue = can('inventory.view');

  const rows = useMemo(() => {
    const byItem = new Map<
      string,
      { name: string; unitSymbol: string; itemType: 'MATERIAL' | 'PRODUCT'; imageUrl?: string; per: Record<string, number>; valueTetri: number }
    >();
    stockLevels
      .filter((l) => l.quantity !== 0)
      .forEach((l) => {
        const key = `${l.itemType}-${l.itemId}`;
        const source =
          l.itemType === 'MATERIAL' ? materials.find((m) => m.id === l.itemId) : products.find((p) => p.id === l.itemId);
        const cur =
          byItem.get(key) ??
          {
            name: l.itemName,
            unitSymbol: (source as { unitSymbol?: string } | undefined)?.unitSymbol ?? '',
            itemType: l.itemType,
            imageUrl: (source as { imageUrl?: string } | undefined)?.imageUrl,
            per: {} as Record<string, number>,
            valueTetri: 0
          };
        cur.per[l.location] = (cur.per[l.location] ?? 0) + l.quantity;
        cur.valueTetri += l.valueTetri;
        byItem.set(key, cur);
      });
    return [...byItem.values()].sort((a, b) => a.name.localeCompare(b.name, 'ka'));
  }, [stockLevels, products, materials]);

  return (
    <Card>
      <CardHeader
        title="მარაგის მიმოხილვა"
        subtitle="რა სად დევს — ყველა ადგილი ერთ ცხრილში"
        icon={Package}
        actions={
          showValue && (
            <Badge tone="amber">სულ ღირებულება: {formatMoney(rows.reduce((s, r) => s + r.valueTetri, 0))}</Badge>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Package} title="მარაგი ჯერ ცარიელია" />
      ) : (
        <Table
          head={
            <tr>
              <Th>დასახელება</Th>
              <Th>ტიპი</Th>
              {LOCATIONS.map((l) => (
                <Th key={l} className="text-right">
                  {LOCATION_LABELS[l]}
                </Th>
              ))}
              <Th className="text-right">სულ</Th>
              {showValue && <Th className="text-right">ღირებულება</Th>}
            </tr>
          }
        >
          {rows.map((r) => {
            const total = LOCATIONS.reduce((s, l) => s + (r.per[l] ?? 0), 0);
            return (
              <tr key={r.name} className="hover:bg-slate-50">
                <Td className="font-semibold text-slate-800">
                  <span className="flex items-center gap-2.5">
                    {r.imageUrl ? (
                      <img src={r.imageUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200" />
                    ) : null}
                    {r.name}
                  </span>
                </Td>
                <Td>
                  <Badge tone={r.itemType === 'MATERIAL' ? 'slate' : 'blue'}>
                    {r.itemType === 'MATERIAL' ? 'ნედლეული' : 'პროდუქტი'}
                  </Badge>
                </Td>
                {LOCATIONS.map((l) => (
                  <Td key={l} className="text-right">
                    {r.per[l] ? formatQty(r.per[l]) : <span className="text-slate-300">—</span>}
                  </Td>
                ))}
                <Td className="text-right font-bold">
                  {formatQty(total)} {r.unitSymbol}
                </Td>
                {showValue && <Td className="text-right">{formatMoney(r.valueTetri)}</Td>}
              </tr>
            );
          })}
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
              <Th />
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
              <Td>
                <div className="flex justify-end">
                  <DeleteRecordButton
                    collection={COL.stockMovements}
                    id={m.id}
                    entityType="stockMovement"
                    label={`მოძრაობა: ${m.itemName}`}
                    warning="ჟურნალის ჩანაწერი წაიშლება. მიმდინარე ნაშთი არ შეიცვლება — ის ცალკე ინახება."
                  />
                </div>
              </Td>
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
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw !== '' && !/^\d*[.,]?\d*$/.test(raw)) return;
                    setActuals((prev) => ({ ...prev, [r.key]: raw }));
                  }}
                  inputMode="decimal"
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
