import React, { useMemo, useState } from 'react';
import { Boxes, Building2, PlayCircle, Wallet } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  MoneyInput,
  NumberInput,
  Select,
  Table,
  Td,
  Th
} from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatMoney, formatQty, safeDiv, tetriToInput, toTetri } from '../lib/money';
import { LOCATION_LABELS } from '../lib/permissions';
import { setOpeningCash, setOpeningStockBatch, setSupplierOpeningBalance, type StockSetInput } from '../services/opening';
import type { StockLocation } from '../types';

const LOCATIONS: StockLocation[] = ['WAREHOUSE', 'FRIDGE', 'LOWER_FLOOR', 'UPPER_FLOOR'];

/**
 * „საწყისი მდგომარეობა" — პროგრამაზე გადმოსვლისას არსებული რეალობის შეტანა:
 * ხელთ არსებული თანხა, მომწოდებლების ვალები და მარაგის ნაშთები.
 */
export const OpeningBalancesView: React.FC = () => {
  const { user } = useAuth();
  const { suppliers, materials, products, stockLevels, settings } = useData();
  const toast = useToast();

  const [saving, setSaving] = useState(false);

  // --- თანხა ---
  const [cashText, setCashText] = useState('');
  const [cashComment, setCashComment] = useState('');

  // --- მომწოდებლები ---
  const [debts, setDebts] = useState<Record<string, string>>({});

  // --- მარაგი ---
  const [location, setLocation] = useState<StockLocation>('WAREHOUSE');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [cost, setCost] = useState<Record<string, string>>({});
  const [stockReason, setStockReason] = useState('საწყისი ნაშთი');

  const stockRows = useMemo(() => {
    const rows: {
      key: string;
      itemType: 'MATERIAL' | 'PRODUCT';
      itemId: string;
      name: string;
      unitSymbol: string;
      current: number;
      currentCostTetri: number;
    }[] = [];

    materials
      .filter((m) => m.active)
      .forEach((m) => {
        const level = stockLevels.find((l) => l.id === `MATERIAL__${m.id}__${location}`);
        rows.push({
          key: `M-${m.id}`,
          itemType: 'MATERIAL',
          itemId: m.id,
          name: m.name,
          unitSymbol: m.unitSymbol,
          current: level?.quantity ?? 0,
          currentCostTetri: Math.round(safeDiv(level?.valueTetri ?? 0, level?.quantity || 1))
        });
      });

    products
      .filter((p) => p.active)
      .forEach((p) => {
        const level = stockLevels.find((l) => l.id === `PRODUCT__${p.id}__${location}`);
        rows.push({
          key: `P-${p.id}`,
          itemType: 'PRODUCT',
          itemId: p.id,
          name: p.name,
          unitSymbol: p.unitSymbol,
          current: level?.quantity ?? 0,
          currentCostTetri: Math.round(safeDiv(level?.valueTetri ?? 0, level?.quantity || 1))
        });
      });

    return rows.sort((a, b) => a.name.localeCompare(b.name, 'ka'));
  }, [materials, products, stockLevels, location]);

  const changedStock = stockRows.filter((r) => qty[r.key] !== undefined && qty[r.key] !== r.current);

  const submitCash = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setOpeningCash(user, toTetri(cashText), cashComment || undefined);
      toast.success('საწყისი თანხა დაფიქსირდა სალაროში');
      setCashText('');
      setCashComment('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitDebt = async (supplierId: string) => {
    if (!user) return;
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (!supplier) return;
    setSaving(true);
    try {
      await setSupplierOpeningBalance(user, supplier, toTetri(debts[supplierId] ?? '0'), 'საწყისი ვალი');
      toast.success(`${supplier.name}: ვალი განახლდა`);
      setDebts((prev) => {
        const next = { ...prev };
        delete next[supplierId];
        return next;
      });
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitStock = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const lines: StockSetInput[] = changedStock.map((r) => ({
        itemType: r.itemType,
        itemId: r.itemId,
        itemName: r.name,
        unitSymbol: r.unitSymbol,
        location,
        targetQuantity: qty[r.key],
        unitCostTetri: cost[r.key] ? toTetri(cost[r.key]) : r.currentCostTetri,
        currentQuantity: r.current,
        reason: stockReason
      }));
      const done = await setOpeningStockBatch(user, settings, lines);
      toast.success(`${done} პოზიციის ნაშთი შეტანილია`);
      setQty({});
      setCost({});
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/50">
        <div className="p-4 flex items-start gap-3">
          <PlayCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900">
            ეს გვერდი პროგრამაზე გადმოსვლისთვისაა — შეიტანეთ ხელთ არსებული თანხა, მომწოდებლების ვალები და მარაგის
            რეალური ნაშთები. ყველა ჩანაწერი მოძრაობებში და Audit Log-ში აისახება, ამიტომ მოგვიანებით ყოველთვის ჩანს,
            საიდან გაჩნდა ესა თუ ის ნაშთი.
          </p>
        </div>
      </Card>

      {/* ------------------------------ თანხა ------------------------------ */}
      <Card>
        <CardHeader title="საწყისი თანხა (ბრუნვა)" subtitle="ხელთ არსებული ნაღდი ფული — ჩაჯდება სალაროში" icon={Wallet} />
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <Field label="თანხა (₾)" required>
            <MoneyInput value={cashText} onChange={setCashText} />
          </Field>
          <Field label="კომენტარი">
            <Input value={cashComment} onChange={(e) => setCashComment(e.target.value)} placeholder="საწყისი ნაშთი" />
          </Field>
          <Button onClick={() => void submitCash()} loading={saving} disabled={!cashText.trim()}>
            თანხის შეტანა
          </Button>
        </div>
      </Card>

      {/* --------------------------- მომწოდებლები --------------------------- */}
      <Card>
        <CardHeader
          title="მომწოდებლების არსებული ვალი"
          subtitle="რომელ მომწოდებელს რამდენი გმართებთ დღეის მდგომარეობით"
          icon={Building2}
        />
        {suppliers.length === 0 ? (
          <EmptyState icon={Building2} title="ჯერ დაამატეთ მომწოდებლები" description="შესყიდვები → მომწოდებლები" />
        ) : (
          <Table
            head={
              <tr>
                <Th>მომწოდებელი</Th>
                <Th className="text-right">მიმდინარე ვალი</Th>
                <Th className="text-right">ახალი ვალი (₾)</Th>
                <Th />
              </tr>
            }
          >
            {suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td className="font-semibold">{s.name}</Td>
                <Td className={`text-right font-bold ${s.balanceTetri > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {formatMoney(s.balanceTetri)}
                </Td>
                <Td className="text-right">
                  <MoneyInput
                    value={debts[s.id] ?? ''}
                    onChange={(v) => setDebts((prev) => ({ ...prev, [s.id]: v }))}
                    placeholder={tetriToInput(s.balanceTetri)}
                    className="w-32 text-right"
                  />
                </Td>
                <Td>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={debts[s.id] === undefined || debts[s.id] === ''}
                      onClick={() => void submitDebt(s.id)}
                    >
                      შენახვა
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* ------------------------------ მარაგი ------------------------------ */}
      <Card>
        <CardHeader
          title="საწყისი მარაგი"
          subtitle="რა და რამდენი გაქვთ ამჟამად — ერთეულის ფასიც მიუთითეთ, რომ თვითღირებულება სწორად დაითვალოს"
          icon={Boxes}
          actions={
            <>
              <Select value={location} onChange={(e) => setLocation(e.target.value as StockLocation)} className="w-48">
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {LOCATION_LABELS[l]}
                  </option>
                ))}
              </Select>
              <Input value={stockReason} onChange={(e) => setStockReason(e.target.value)} className="w-52" />
              <Button onClick={() => void submitStock()} loading={saving} disabled={!changedStock.length}>
                შენახვა ({changedStock.length})
              </Button>
            </>
          }
        />
        <Table
          head={
            <tr>
              <Th>დასახელება</Th>
              <Th>ტიპი</Th>
              <Th className="text-right">მიმდინარე</Th>
              <Th className="text-right">ფაქტობრივი</Th>
              <Th className="text-right">ერთეულის ფასი (₾)</Th>
              <Th className="text-right">სხვაობა</Th>
            </tr>
          }
        >
          {stockRows.map((r) => {
            const target = qty[r.key];
            const diff = target === undefined ? 0 : target - r.current;
            return (
              <tr key={r.key} className="hover:bg-slate-50">
                <Td className="font-semibold text-slate-800">{r.name}</Td>
                <Td>
                  <Badge tone={r.itemType === 'MATERIAL' ? 'slate' : 'blue'}>
                    {r.itemType === 'MATERIAL' ? 'ნედლეული' : 'პროდუქტი'}
                  </Badge>
                </Td>
                <Td className="text-right text-slate-500">
                  {formatQty(r.current)} {r.unitSymbol}
                </Td>
                <Td className="text-right">
                  <NumberInput
                    value={target ?? 0}
                    onChange={(v) => setQty((prev) => ({ ...prev, [r.key]: v }))}
                    placeholder="—"
                    className="w-28 text-right"
                  />
                </Td>
                <Td className="text-right">
                  <MoneyInput
                    value={cost[r.key] ?? ''}
                    onChange={(v) => setCost((prev) => ({ ...prev, [r.key]: v }))}
                    placeholder={r.currentCostTetri ? tetriToInput(r.currentCostTetri) : '0.00'}
                    className="w-28 text-right"
                  />
                </Td>
                <Td className={`text-right font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-emerald-700' : 'text-slate-300'}`}>
                  {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${formatQty(diff)}`}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </div>
  );
};
