import React, { useState } from 'react';
import { Package, Plus, Tag, TrendingUp } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, Modal, MoneyInput, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatMoney, formatQty, tetriToInput, toTetri } from '../lib/money';
import { FLOOR_LABELS, LOCATION_LABELS } from '../lib/permissions';
import { changeProductPrice, saveProduct, saveProductCategory, type ProductInput } from '../services/catalog';
import { COL, newId } from '../services/db';
import { DeleteRecordButton } from '../components/DeleteRecordButton';
import type { FinishedProduct, Floor, StockLocation } from '../types';

const EMPTY: ProductInput = {
  name: '',
  code: '',
  kind: 'PRODUCED',
  productionFloor: 'UPPER_FLOOR',
  salesLocation: 'UPPER_FLOOR',
  unitSymbol: 'ცალი',
  sellingPriceTetri: 0,
  active: true
};

export const CatalogView: React.FC = () => {
  const { user, can } = useAuth();
  const { products, productCategories, units, settings, stockLevels } = useData();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FinishedProduct | null>(null);
  const [form, setForm] = useState<ProductInput>({ ...EMPTY });
  const [priceText, setPriceText] = useState('');
  const [wholesaleText, setWholesaleText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [weightText, setWeightText] = useState('');
  const [saving, setSaving] = useState(false);

  const [priceTarget, setPriceTarget] = useState<FinishedProduct | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [priceReason, setPriceReason] = useState('');

  const [showCategory, setShowCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');

  /** რამდენი აქვს ამ პროდუქტს ყველა ადგილას ჯამში. */
  const remainingStock = (productId: string) =>
    stockLevels.filter((l) => l.itemType === 'PRODUCT' && l.itemId === productId).reduce((sum, l) => sum + l.quantity, 0);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setPriceText('');
    setWholesaleText('');
    setWeightText('');
    setImageUrl('');
    setShowForm(true);
  };

  const openEdit = (p: FinishedProduct) => {
    setEditing(p);
    setForm({
      id: p.id,
      name: p.name,
      code: p.code,
      kind: p.kind,
      productionFloor: p.productionFloor ?? 'UPPER_FLOOR',
      salesLocation: p.salesLocation,
      unitSymbol: p.unitSymbol,
      weightGrams: p.weightGrams,
      weightSettingKey: p.weightSettingKey,
      sellingPriceTetri: p.sellingPriceTetri,
      categoryId: p.categoryId,
      color: p.color,
      imageUrl: p.imageUrl,
      active: p.active
    });
    setImageUrl(p.imageUrl ?? '');
    setPriceText(tetriToInput(p.sellingPriceTetri));
    setWholesaleText(p.wholesalePriceTetri != null ? tetriToInput(p.wholesalePriceTetri) : '');
    setWeightText(p.weightGrams ? String(p.weightGrams) : '');
    setShowForm(true);
  };

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveProduct(
        user,
        {
          ...form,
          imageUrl: imageUrl.trim() || undefined,
          sellingPriceTetri: toTetri(priceText),
          wholesalePriceTetri: wholesaleText.trim() ? toTetri(wholesaleText) : undefined,
          weightGrams: form.weightSettingKey ? undefined : weightText ? Number(weightText) : undefined
        },
        editing ?? undefined
      );
      toast.success(editing ? 'პროდუქტი განახლდა' : 'პროდუქტი დაემატა');
      setShowForm(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitPrice = async () => {
    if (!user || !priceTarget) return;
    setSaving(true);
    try {
      await changeProductPrice(user, priceTarget, toTetri(newPrice), priceReason || undefined);
      toast.success('ფასი განახლდა — ძველი გაყიდვები არ შეცვლილა');
      setPriceTarget(null);
      setNewPrice('');
      setPriceReason('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitCategory = async () => {
    if (!user || !categoryName.trim()) return;
    setSaving(true);
    try {
      await saveProductCategory(user, {
        id: newId('cat'),
        name: categoryName.trim(),
        sortOrder: productCategories.length + 1,
        active: true
      });
      toast.success('კატეგორია დაემატა');
      setCategoryName('');
      setShowCategory(false);
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
          title="მზა პროდუქტები & ფასები"
          subtitle="რაც POS-ში გამოჩნდება — პური, გამომცხვარი პროდუქცია, წვენები და სხვა"
          icon={Package}
          actions={
            <>
              <Button variant="secondary" icon={Tag} onClick={() => setShowCategory(true)}>
                კატეგორია
              </Button>
              {can('product.manage') && (
                <Button icon={Plus} onClick={openNew}>
                  ახალი პროდუქტი
                </Button>
              )}
            </>
          }
        />
        {products.length === 0 ? (
          <EmptyState icon={Package} title="პროდუქტი არ არის დამატებული" />
        ) : (
          <Table
            head={
              <tr>
                <Th>დასახელება</Th>
                <Th>კოდი</Th>
                <Th>ტიპი</Th>
                <Th>წარმოების სართული</Th>
                <Th>იყიდება</Th>
                <Th>გრამაჟი</Th>
                <Th className="text-right">ჩვეულებრივი</Th>
                <Th className="text-right">გამტანის</Th>
                <Th>სტატუსი</Th>
                <Th />
              </tr>
            }
          >
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <Td className="font-semibold text-slate-800">
                  <span className="flex items-center gap-2.5">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200" />
                    ) : (
                      <span
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: p.color || '#f59e0b' }}
                      >
                        {p.name.slice(0, 2)}
                      </span>
                    )}
                    {p.name}
                  </span>
                </Td>
                <Td className="text-xs text-slate-500">{p.code}</Td>
                <Td>
                  <Badge tone={p.kind === 'PRODUCED' ? 'amber' : 'blue'}>{p.kind === 'PRODUCED' ? 'ჩვენი წარმოება' : 'შესყიდული'}</Badge>
                </Td>
                <Td className="text-xs">{p.productionFloor ? FLOOR_LABELS[p.productionFloor] : '—'}</Td>
                <Td className="text-xs">{LOCATION_LABELS[p.salesLocation]}</Td>
                <Td className="text-xs">
                  {p.weightSettingKey
                    ? `${settings[p.weightSettingKey]} გ (პარამეტრებიდან)`
                    : p.weightGrams
                      ? `${p.weightGrams} გ`
                      : '—'}
                </Td>
                <Td className="text-right font-bold">{formatMoney(p.sellingPriceTetri)}</Td>
                <Td className="text-right text-slate-500">
                  {p.wholesalePriceTetri != null ? formatMoney(p.wholesalePriceTetri) : '—'}
                </Td>
                <Td>
                  <Badge tone={p.active ? 'green' : 'slate'}>{p.active ? 'აქტიური' : 'გათიშული'}</Badge>
                </Td>
                <Td>
                  <div className="flex gap-1 justify-end">
                    {can('price.manage') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={TrendingUp}
                        onClick={() => {
                          setPriceTarget(p);
                          setNewPrice(tetriToInput(p.sellingPriceTetri));
                        }}
                      >
                        ფასი
                      </Button>
                    )}
                    {can('product.manage') && (
                      <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                        რედაქტირება
                      </Button>
                    )}
                    <DeleteRecordButton
                      collection={COL.products}
                      id={p.id}
                      entityType="product"
                      label={`პროდუქტი „${p.name}"`}
                      warning={
                        remainingStock(p.id) > 0
                          ? `ყურადღება: ამ პროდუქტს მარაგში ჯერ კიდევ აქვს ${formatQty(remainingStock(p.id))} ${p.unitSymbol}. სასურველია ჯერ ინვენტარიზაციით განულება, თორემ ნაშთი „უპატრონოდ" დარჩება. ძველი გაყიდვები და წარმოება არ დაზიანდება — ისინი დასახელებასა და ფასს snapshot-ად ინახავენ.`
                          : 'პროდუქტი სამუდამოდ წაიშლება და POS-იდან გაქრება. ძველი გაყიდვები, წარმოება და რეპორტები არ დაზიანდება — ისინი დასახელებასა და ფასს snapshot-ად ინახავენ. თუ მხოლოდ დროებით გინდათ დამალვა, ჯობია „აქტიური"-ს გამორთვა.'
                      }
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? `რედაქტირება — ${editing.name}` : 'ახალი მზა პროდუქტი'}
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
          <Field label="ტიპი" required>
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProductInput['kind'] })}>
              <option value="PRODUCED">ჩვენ ვაცხობთ (წარმოება)</option>
              <option value="RESALE">ვყიდულობთ და ვყიდით (წვენი, წყალი…)</option>
            </Select>
          </Field>
          {form.kind === 'PRODUCED' && (
            <Field label="წარმოების სართული" required>
              <Select
                value={form.productionFloor}
                onChange={(e) => setForm({ ...form, productionFloor: e.target.value as Floor })}
              >
                <option value="LOWER_FLOOR">{FLOOR_LABELS.LOWER_FLOOR}</option>
                <option value="UPPER_FLOOR">{FLOOR_LABELS.UPPER_FLOOR}</option>
              </Select>
            </Field>
          )}
          <Field label="საიდან იყიდება" required hint="სად ინახება გასაყიდი მარაგი">
            <Select
              value={form.salesLocation}
              onChange={(e) => setForm({ ...form, salesLocation: e.target.value as StockLocation })}
            >
              <option value="UPPER_FLOOR">{LOCATION_LABELS.UPPER_FLOOR}</option>
              <option value="LOWER_FLOOR">{LOCATION_LABELS.LOWER_FLOOR}</option>
              <option value="FRIDGE">{LOCATION_LABELS.FRIDGE}</option>
              <option value="WAREHOUSE">{LOCATION_LABELS.WAREHOUSE}</option>
            </Select>
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
          <Field label="ჩვეულებრივი ფასი (₾)" required hint="ცალობით მყიდველისთვის">
            <MoneyInput value={priceText} onChange={setPriceText} />
          </Field>
          <Field label="გამტანის ფასი (₾)" hint="დიდი რაოდენობით წამღებზე — ცარიელი = იგივე ფასი">
            <MoneyInput value={wholesaleText} onChange={setWholesaleText} />
          </Field>
          <Field label="კატეგორია">
            <Select value={form.categoryId ?? ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value || undefined })}>
              <option value="">— არ არის —</option>
              {productCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="გრამაჟის წყარო">
            <Select
              value={form.weightSettingKey ?? ''}
              onChange={(e) =>
                setForm({ ...form, weightSettingKey: (e.target.value || undefined) as ProductInput['weightSettingKey'] })
              }
            >
              <option value="">ფიქსირებული / არ აქვს</option>
              <option value="smallBreadWeightGrams">პარამეტრები: პატარა პური</option>
              <option value="largeBreadWeightGrams">პარამეტრები: დიდი პური</option>
            </Select>
          </Field>
          {!form.weightSettingKey && (
            <Field label="გრამაჟი (გ)">
              <Input value={weightText} onChange={(e) => setWeightText(e.target.value)} inputMode="numeric" />
            </Field>
          )}
          <Field label="ფერი (თუ სურათი არ არის)">
            <Input type="color" value={form.color ?? '#f59e0b'} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          </Field>
          <Field
            label="სურათის ბმული (URL)"
            className="md:col-span-2"
            hint="ჩასვით ფოტოს პირდაპირი ბმული — Google-ში სურათზე მარჯვენა ღილაკი → Copy image address"
          >
            <div className="flex gap-3 items-start">
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
              {imageUrl.trim() && (
                <img
                  src={imageUrl}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover border border-slate-200 flex-shrink-0"
                  onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.2')}
                />
              )}
            </div>
          </Field>
          <div className="md:col-span-2">
            <Checkbox
              checked={form.active}
              onChange={(v) => setForm({ ...form, active: v })}
              label="აქტიური"
              hint="გათიშული პროდუქტი POS-ში აღარ გამოჩნდება, ისტორია კი შენარჩუნდება"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!priceTarget}
        onClose={() => setPriceTarget(null)}
        title={`ფასის შეცვლა — ${priceTarget?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPriceTarget(null)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitPrice()} loading={saving}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            მიმდინარე ფასი: <span className="font-bold text-slate-900">{formatMoney(priceTarget?.sellingPriceTetri ?? 0)}</span>
          </p>
          <Field label="ახალი ფასი (₾)" required>
            <MoneyInput value={newPrice} onChange={setNewPrice} autoFocus />
          </Field>
          <Field label="მიზეზი">
            <Input value={priceReason} onChange={(e) => setPriceReason(e.target.value)} />
          </Field>
        </div>
      </Modal>

      {productCategories.length > 0 && (
        <Card>
          <CardHeader title="კატეგორიები" subtitle="POS-ის ტაბები ამ სიის მიხედვით იწყობა" icon={Tag} />
          <Table
            head={
              <tr>
                <Th>დასახელება</Th>
                <Th>სტატუსი</Th>
                <Th />
              </tr>
            }
          >
            {productCategories.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <Td className="font-semibold">{c.name}</Td>
                <Td>
                  <Badge tone={c.active ? 'green' : 'slate'}>{c.active ? 'აქტიური' : 'გათიშული'}</Badge>
                </Td>
                <Td>
                  <div className="flex gap-1 justify-end">
                    {can('product.manage') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => user && void saveProductCategory(user, { ...c, active: !c.active })}
                      >
                        {c.active ? 'გათიშვა' : 'გააქტიურება'}
                      </Button>
                    )}
                    <DeleteRecordButton
                      collection={COL.productCategories}
                      id={c.id}
                      entityType="productCategory"
                      label={`კატეგორია „${c.name}"`}
                      warning="კატეგორია წაიშლება. პროდუქტები არ წაიშლება — უბრალოდ კატეგორიის გარეშე დარჩებიან."
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal
        open={showCategory}
        onClose={() => setShowCategory(false)}
        title="ახალი კატეგორია"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCategory(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitCategory()} loading={saving} disabled={!categoryName.trim()}>
              შენახვა
            </Button>
          </>
        }
      >
        <Field label="დასახელება" required>
          <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
};
