import React, { useEffect, useMemo, useState } from 'react';
import { CookingPot, FileDown, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatDateTime, todayBusinessDate, addDays } from '../lib/dates';
import { formatMoney, formatQty } from '../lib/money';
import { FLOOR_LABELS, LOCATION_LABELS } from '../lib/permissions';
import { downloadBlob, generateProductionSheetPdf } from '../lib/pdf';
import { createProductionBatch, resolveWeightGrams, scaleRecipe, type ConsumptionInput } from '../services/production';
import { fetchProductionRange } from '../services/reports';
import type { Floor, ProductionBatch, StorageLocation } from '../types';

export const ProductionView: React.FC = () => {
  const { user, can } = useAuth();
  const { products, materials, recipes, settings, stockOf } = useData();
  const toast = useToast();

  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [from, setFrom] = useState(addDays(todayBusinessDate(), -7));
  const [to, setTo] = useState(todayBusinessDate());
  const [showForm, setShowForm] = useState(false);

  const defaultFloor: Floor = user?.assignedFloor ?? 'LOWER_FLOOR';
  const [floor, setFloor] = useState<Floor>(defaultFloor);
  const [productId, setProductId] = useState('');
  const [goodQty, setGoodQty] = useState('');
  const [wasteQty, setWasteQty] = useState('0');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<ConsumptionInput[]>([]);
  const [saving, setSaving] = useState(false);

  const showCost = can('production.view_cost');

  const load = async () => {
    setLoadingList(true);
    try {
      const data = await fetchProductionRange(from, to);
      setBatches(data.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      toast.error(err);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const floorProducts = useMemo(
    () => products.filter((p) => p.active && p.kind === 'PRODUCED' && p.productionFloor === floor),
    [products, floor]
  );

  const selectedProduct = products.find((p) => p.id === productId);
  const recipe = recipes.find((r) => r.productId === productId && r.active);

  const applyRecipe = () => {
    if (!recipe) return;
    const qty = Number(goodQty) || 0;
    if (qty <= 0) {
      toast.warning('ჯერ მიუთითეთ გამომცხვარი რაოდენობა');
      return;
    }
    setLines(scaleRecipe(recipe, qty));
    toast.info('რეცეპტი ჩაისვა — საჭიროებისამებრ შეასწორეთ რეალური რაოდენობები');
  };

  const addLine = () => {
    const first = materials.find((m) => m.active);
    if (!first) {
      toast.warning('ჯერ დაამატეთ ნედლეული პარამეტრებში');
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        materialId: first.id,
        materialName: first.name,
        unitSymbol: first.unitSymbol,
        location: first.defaultStorageLocation,
        quantity: 0
      }
    ]);
  };

  const updateLine = (idx: number, patch: Partial<ConsumptionInput>) => {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const resetForm = () => {
    setProductId('');
    setGoodQty('');
    setWasteQty('0');
    setNote('');
    setLines([]);
  };

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const batch = await createProductionBatch(user, settings, {
        productId,
        floor,
        producedGoodQty: Number(goodQty) || 0,
        wasteQty: Number(wasteQty) || 0,
        consumptions: lines,
        recipeId: recipe?.id,
        recipeVersion: recipe?.version,
        note: note || undefined
      });
      toast.success(`წარმოება დაფიქსირდა — ${batch.batchNo}`);
      resetForm();
      setShowForm(false);
      void load();
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const exportSheet = async (batch: ProductionBatch) => {
    try {
      const { blob, fileName } = await generateProductionSheetPdf(batch, settings, showCost);
      downloadBlob(blob, fileName);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="წარმოება / ცხობა"
          subtitle="რა გამოცხვა, სად, ვინ გამოაცხო და რა ნედლეული დაიხარჯა"
          icon={CookingPot}
          actions={
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              {can('production.create') && (
                <Button icon={Plus} onClick={() => setShowForm(true)}>
                  ახალი ცხობა
                </Button>
              )}
            </>
          }
        />
        {loadingList ? (
          <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
        ) : batches.length === 0 ? (
          <EmptyState icon={CookingPot} title="ამ პერიოდში წარმოება არ დაფიქსირებულა" />
        ) : (
          <Table
            head={
              <tr>
                <Th>დოკუმენტი</Th>
                <Th>თარიღი</Th>
                <Th>პროდუქტი</Th>
                <Th>სართული</Th>
                <Th>მცხობელი</Th>
                <Th className="text-right">გამოცხვა</Th>
                <Th className="text-right">დანაკარგი</Th>
                {showCost && <Th className="text-right">მასალის ღირებ.</Th>}
                {showCost && <Th className="text-right">ერთეულის ღირებ.</Th>}
                <Th />
              </tr>
            }
          >
            {batches.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <Td className="font-bold text-slate-900">{b.batchNo}</Td>
                <Td className="text-xs text-slate-500">{formatDateTime(b.date)}</Td>
                <Td>
                  {b.productName}
                  {b.weightGramsSnapshot ? <span className="text-[11px] text-slate-400"> · {b.weightGramsSnapshot} გ</span> : null}
                </Td>
                <Td>
                  <Badge tone={b.floor === 'LOWER_FLOOR' ? 'blue' : 'amber'}>{FLOOR_LABELS[b.floor]}</Badge>
                </Td>
                <Td className="text-xs">{b.bakerName}</Td>
                <Td className="text-right font-bold">{formatQty(b.producedGoodQty)}</Td>
                <Td className="text-right text-red-600">{b.wasteQty ? formatQty(b.wasteQty) : '—'}</Td>
                {showCost && <Td className="text-right">{formatMoney(b.totalMaterialCostTetri)}</Td>}
                {showCost && <Td className="text-right font-semibold">{formatMoney(b.unitProductionCostTetri)}</Td>}
                <Td>
                  <button
                    onClick={() => void exportSheet(b)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 cursor-pointer"
                    title="PDF"
                  >
                    <FileDown className="w-4 h-4" />
                  </button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="ახალი წარმოება"
        subtitle="მიუთითეთ რეალურად დახარჯული ნედლეული — თვითღირებულება ამის მიხედვით დაითვლება"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submit()} loading={saving} disabled={!productId || !lines.length}>
              წარმოების დაფიქსირება
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="სართული" required>
              <Select
                value={floor}
                onChange={(e) => {
                  setFloor(e.target.value as Floor);
                  setProductId('');
                }}
                disabled={user?.role === 'EMPLOYEE' && !!user.assignedFloor}
              >
                <option value="LOWER_FLOOR">{FLOOR_LABELS.LOWER_FLOOR}</option>
                <option value="UPPER_FLOOR">{FLOOR_LABELS.UPPER_FLOOR}</option>
              </Select>
            </Field>
            <Field label="პროდუქტი" required>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">— აირჩიეთ —</option>
                {floorProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="გამომცხვარი (კარგი)"
              required
              hint={
                selectedProduct && resolveWeightGrams(selectedProduct, settings)
                  ? `გრამაჟი: ${resolveWeightGrams(selectedProduct, settings)} გ`
                  : undefined
              }
            >
              <Input value={goodQty} onChange={(e) => setGoodQty(e.target.value)} inputMode="decimal" placeholder="0" />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="გაფუჭებული / დანაკარგი">
              <Input value={wasteQty} onChange={(e) => setWasteQty(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="შენიშვნა" className="md:col-span-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="არასავალდებულო" />
            </Field>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-600">დახარჯული ნედლეული</span>
              <div className="flex gap-2">
                {recipe && (
                  <Button size="sm" variant="secondary" onClick={applyRecipe}>
                    რეცეპტიდან შევსება
                  </Button>
                )}
                <Button size="sm" variant="secondary" icon={Plus} onClick={addLine}>
                  მასალის დამატება
                </Button>
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">დაამატეთ მინიმუმ ერთი მასალა</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {lines.map((line, idx) => {
                  const material = materials.find((m) => m.id === line.materialId);
                  const available = stockOf('MATERIAL', line.materialId, line.location)?.quantity ?? 0;
                  return (
                    <div key={idx} className="p-3 grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <Field label="მასალა">
                          <Select
                            value={line.materialId}
                            onChange={(e) => {
                              const m = materials.find((x) => x.id === e.target.value);
                              if (!m) return;
                              updateLine(idx, {
                                materialId: m.id,
                                materialName: m.name,
                                unitSymbol: m.unitSymbol,
                                location: m.defaultStorageLocation
                              });
                            }}
                          >
                            {materials
                              .filter((m) => m.active)
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                          </Select>
                        </Field>
                      </div>
                      <div className="col-span-3">
                        <Field label="საიდან">
                          <Select
                            value={line.location}
                            onChange={(e) => updateLine(idx, { location: e.target.value as StorageLocation })}
                          >
                            <option value="WAREHOUSE">{LOCATION_LABELS.WAREHOUSE}</option>
                            <option value="FRIDGE">{LOCATION_LABELS.FRIDGE}</option>
                          </Select>
                        </Field>
                      </div>
                      <div className="col-span-3">
                        <Field label={`რაოდენობა (${material?.unitSymbol ?? ''})`} hint={`ხელმისაწვდომია ${formatQty(available)}`}>
                          <Input
                            value={line.quantity}
                            onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) || 0 })}
                            inputMode="decimal"
                            type="number"
                            step="0.001"
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
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
