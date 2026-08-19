import React, { useState } from 'react';
import { Boxes, ChefHat, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, Modal, Select, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatQty } from '../lib/money';
import { LOCATION_LABELS } from '../lib/permissions';
import { saveMaterial, saveRecipe, saveUnit, type MaterialInput } from '../services/catalog';
import { COL, newId } from '../services/db';
import { DeleteRecordButton } from '../components/DeleteRecordButton';
import type { Material, Recipe, RecipeIngredient, StorageLocation } from '../types';

const EMPTY: MaterialInput = {
  name: '',
  code: '',
  unitSymbol: 'კგ',
  defaultStorageLocation: 'WAREHOUSE',
  minStock: 0,
  active: true
};

export const MaterialsView: React.FC = () => {
  const { user, can } = useAuth();
  const { materials, units, recipes, products, stockLevels } = useData();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState<MaterialInput>({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const [showUnit, setShowUnit] = useState(false);
  const [unitForm, setUnitForm] = useState({ name: '', symbol: '', allowsDecimal: true });

  const [showRecipe, setShowRecipe] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [recipeProductId, setRecipeProductId] = useState('');
  const [outputQty, setOutputQty] = useState('100');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowForm(true);
  };

  const openEdit = (m: Material) => {
    setEditing(m);
    setForm({
      id: m.id,
      name: m.name,
      code: m.code,
      unitSymbol: m.unitSymbol,
      defaultStorageLocation: m.defaultStorageLocation,
      minStock: m.minStock,
      description: m.description,
      active: m.active
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveMaterial(user, form, editing ?? undefined);
      toast.success(editing ? 'მასალა განახლდა' : 'მასალა დაემატა');
      setShowForm(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitUnit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveUnit(user, {
        id: newId('unit'),
        name: unitForm.name.trim(),
        symbol: unitForm.symbol.trim(),
        allowsDecimal: unitForm.allowsDecimal,
        active: true
      });
      toast.success('ერთეული დაემატა');
      setUnitForm({ name: '', symbol: '', allowsDecimal: true });
      setShowUnit(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const openRecipe = (recipe?: Recipe) => {
    if (recipe) {
      setEditingRecipe(recipe);
      setRecipeProductId(recipe.productId);
      setOutputQty(String(recipe.outputQuantity));
      setIngredients(recipe.ingredients);
    } else {
      setEditingRecipe(null);
      setRecipeProductId('');
      setOutputQty('100');
      setIngredients([]);
    }
    setShowRecipe(true);
  };

  const submitRecipe = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const product = products.find((p) => p.id === recipeProductId);
      await saveRecipe(
        user,
        {
          id: editingRecipe?.id,
          productId: recipeProductId,
          productName: product?.name ?? '',
          outputQuantity: Number(outputQty) || 0,
          ingredients
        },
        editingRecipe ?? undefined
      );
      toast.success('რეცეპტი შენახულია');
      setShowRecipe(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addIngredient = () => {
    const m = materials.find((x) => x.active);
    if (!m) {
      toast.warning('ჯერ დაამატეთ ნედლეული');
      return;
    }
    setIngredients((prev) => [
      ...prev,
      { materialId: m.id, materialName: m.name, unitSymbol: m.unitSymbol, quantity: 0, location: m.defaultStorageLocation }
    ]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="ნედლეული / ინგრედიენტები"
          subtitle="სია სრულად თქვენ განსაზღვრავთ — ფქვილი, საფუარი, ყველი და ა.შ."
          icon={Boxes}
          actions={
            <>
              <Button variant="secondary" icon={Plus} onClick={() => setShowUnit(true)}>
                ერთეული
              </Button>
              {can('material.manage') && (
                <Button icon={Plus} onClick={openNew}>
                  ახალი მასალა
                </Button>
              )}
            </>
          }
        />
        {materials.length === 0 ? (
          <EmptyState icon={Boxes} title="ნედლეული ჯერ არ არის დამატებული" description="დაამატეთ მასალები, რომ წარმოებაში გამოიყენოთ" />
        ) : (
          <Table
            head={
              <tr>
                <Th>დასახელება</Th>
                <Th>კოდი</Th>
                <Th>ერთეული</Th>
                <Th>სად ინახება</Th>
                <Th className="text-right">საწყობი</Th>
                <Th className="text-right">მაცივარი</Th>
                <Th className="text-right">მინ. ნაშთი</Th>
                <Th>სტატუსი</Th>
                <Th />
              </tr>
            }
          >
            {materials.map((m) => {
              const wh = stockLevels.find((l) => l.id === `MATERIAL__${m.id}__WAREHOUSE`)?.quantity ?? 0;
              const fr = stockLevels.find((l) => l.id === `MATERIAL__${m.id}__FRIDGE`)?.quantity ?? 0;
              return (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="font-semibold text-slate-800">{m.name}</Td>
                  <Td className="text-xs text-slate-500">{m.code}</Td>
                  <Td className="text-xs">{m.unitSymbol}</Td>
                  <Td className="text-xs">{LOCATION_LABELS[m.defaultStorageLocation]}</Td>
                  <Td className="text-right">{formatQty(wh)}</Td>
                  <Td className="text-right">{formatQty(fr)}</Td>
                  <Td className="text-right text-slate-500">{formatQty(m.minStock)}</Td>
                  <Td>
                    <Badge tone={m.active ? 'green' : 'slate'}>{m.active ? 'აქტიური' : 'გათიშული'}</Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1 justify-end">
                      {can('material.manage') && (
                        <Button size="sm" variant="secondary" onClick={() => openEdit(m)}>
                          რედაქტირება
                        </Button>
                      )}
                      <DeleteRecordButton
                        collection={COL.materials}
                        id={m.id}
                        entityType="material"
                        label={`ნედლეული „${m.name}"`}
                        warning={
                          wh + fr > 0
                            ? `ყურადღება: მარაგში ჯერ კიდევ არის ${formatQty(wh + fr)} ${m.unitSymbol}. სასურველია ჯერ ინვენტარიზაციით განულება. ძველი წარმოება და შესყიდვები არ დაზიანდება.`
                            : 'ნედლეული სამუდამოდ წაიშლება. ძველი წარმოება და შესყიდვები არ დაზიანდება — ისინი დასახელებას snapshot-ად ინახავენ.'
                        }
                      />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="რეცეპტები"
          subtitle="სტანდარტული ხარჯვა — წარმოებაში ავტომატურად ჩაისმება, მაგრამ რეალური რაოდენობა მცხობელს შეაქვს"
          icon={ChefHat}
          actions={
            can('recipe.manage') && (
              <Button icon={Plus} onClick={() => openRecipe()}>
                ახალი რეცეპტი
              </Button>
            )
          }
        />
        {recipes.length === 0 ? (
          <EmptyState icon={ChefHat} title="რეცეპტი ჯერ არ არის შექმნილი" />
        ) : (
          <Table
            head={
              <tr>
                <Th>პროდუქტი</Th>
                <Th className="text-right">გამოსავალი</Th>
                <Th>ინგრედიენტები</Th>
                <Th className="text-right">ვერსია</Th>
                <Th />
              </tr>
            }
          >
            {recipes.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td className="font-semibold">{r.productName}</Td>
                <Td className="text-right">{formatQty(r.outputQuantity)}</Td>
                <Td className="text-xs text-slate-500">
                  {r.ingredients.map((i) => `${i.materialName} ${formatQty(i.quantity)} ${i.unitSymbol}`).join(', ')}
                </Td>
                <Td className="text-right">v{r.version}</Td>
                <Td>
                  <div className="flex gap-1 justify-end">
                    {can('recipe.manage') && (
                      <Button size="sm" variant="secondary" onClick={() => openRecipe(r)}>
                        რედაქტირება
                      </Button>
                    )}
                    <DeleteRecordButton
                      collection={COL.recipes}
                      id={r.id}
                      entityType="recipe"
                      label={`რეცეპტი „${r.productName}"`}
                      warning="რეცეპტი წაიშლება. უკვე დაფიქსირებული წარმოება არ შეიცვლება — მან რეალური ხარჯვა თავისთვის შეინახა."
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* მასალის ფორმა */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `რედაქტირება — ${editing.name}` : 'ახალი მასალა'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submit()} loading={saving} disabled={!form.name.trim()}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="დასახელება" required className="md:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="კოდი">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ავტომატური" />
          </Field>
          <Field label="ერთეული" required>
            <Select value={form.unitSymbol} onChange={(e) => setForm({ ...form, unitSymbol: e.target.value })}>
              {units
                .filter((u) => u.active)
                .map((u) => (
                  <option key={u.id} value={u.symbol}>
                    {u.name} ({u.symbol})
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="ნაგულისხმევი საცავი" required>
            <Select
              value={form.defaultStorageLocation}
              onChange={(e) => setForm({ ...form, defaultStorageLocation: e.target.value as StorageLocation })}
            >
              <option value="WAREHOUSE">{LOCATION_LABELS.WAREHOUSE}</option>
              <option value="FRIDGE">{LOCATION_LABELS.FRIDGE}</option>
            </Select>
          </Field>
          <Field label="მინიმალური ნაშთი">
            <Input
              value={form.minStock}
              onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) || 0 })}
              type="number"
              step="0.001"
            />
          </Field>
          <Field label="აღწერა" className="md:col-span-2">
            <Textarea rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Checkbox checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="აქტიური" />
          </div>
        </div>
      </Modal>

      {/* ერთეული */}
      <Modal
        open={showUnit}
        onClose={() => setShowUnit(false)}
        title="ახალი ერთეული"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowUnit(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitUnit()} loading={saving} disabled={!unitForm.name.trim() || !unitForm.symbol.trim()}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="დასახელება" required>
            <Input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} />
          </Field>
          <Field label="სიმბოლო" required>
            <Input value={unitForm.symbol} onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })} />
          </Field>
          <Checkbox
            checked={unitForm.allowsDecimal}
            onChange={(v) => setUnitForm({ ...unitForm, allowsDecimal: v })}
            label="იშვებს წილად რაოდენობას"
          />
        </div>
      </Modal>

      {/* რეცეპტი */}
      <Modal
        open={showRecipe}
        onClose={() => setShowRecipe(false)}
        title={editingRecipe ? `რეცეპტი — ${editingRecipe.productName}` : 'ახალი რეცეპტი'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowRecipe(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitRecipe()} loading={saving} disabled={!recipeProductId || !ingredients.length}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="პროდუქტი" required>
              <Select value={recipeProductId} onChange={(e) => setRecipeProductId(e.target.value)} disabled={!!editingRecipe}>
                <option value="">— აირჩიეთ —</option>
                {products
                  .filter((p) => p.kind === 'PRODUCED')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="გამოსავალი რაოდენობა" required hint="მაგ: 100 ცალი პური">
              <Input value={outputQty} onChange={(e) => setOutputQty(e.target.value)} type="number" step="0.001" />
            </Field>
          </div>

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">ინგრედიენტები</span>
              <Button size="sm" variant="secondary" icon={Plus} onClick={addIngredient}>
                დამატება
              </Button>
            </div>
            {ingredients.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">დაამატეთ ინგრედიენტები</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="p-3 grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Field label="მასალა">
                        <Select
                          value={ing.materialId}
                          onChange={(e) => {
                            const m = materials.find((x) => x.id === e.target.value);
                            if (!m) return;
                            setIngredients((prev) => {
                              const next = [...prev];
                              next[idx] = {
                                ...next[idx],
                                materialId: m.id,
                                materialName: m.name,
                                unitSymbol: m.unitSymbol,
                                location: m.defaultStorageLocation
                              };
                              return next;
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
                          value={ing.location}
                          onChange={(e) =>
                            setIngredients((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], location: e.target.value as StorageLocation };
                              return next;
                            })
                          }
                        >
                          <option value="WAREHOUSE">{LOCATION_LABELS.WAREHOUSE}</option>
                          <option value="FRIDGE">{LOCATION_LABELS.FRIDGE}</option>
                        </Select>
                      </Field>
                    </div>
                    <div className="col-span-3">
                      <Field label={`რაოდენობა (${ing.unitSymbol})`}>
                        <Input
                          value={ing.quantity}
                          onChange={(e) =>
                            setIngredients((prev) => {
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
                    <div className="col-span-1 flex justify-end pb-2">
                      <button
                        onClick={() => setIngredients((prev) => prev.filter((_, i) => i !== idx))}
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
        </div>
      </Modal>
    </div>
  );
};
