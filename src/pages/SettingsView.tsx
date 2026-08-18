import React, { useEffect, useState } from 'react';
import { Building2, Plus, Settings as SettingsIcon, Wheat } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Modal, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { saveSettings } from '../services/settings';
import { deleteExpenseCategory, saveExpenseCategory } from '../services/catalog';
import { newId } from '../services/db';
import type { AppSettings } from '../types';

type Tab = 'company' | 'bakery' | 'expenses';

export const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const { settings, expenseCategories } = useData();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('company');
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [showCategory, setShowCategory] = useState(false);
  const [categoryName, setCategoryName] = useState('');

  useEffect(() => setDraft(settings), [settings]);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveSettings(user, draft, settings);
      toast.success('პარამეტრები შენახულია');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const addCategory = async () => {
    if (!user || !categoryName.trim()) return;
    setSaving(true);
    try {
      await saveExpenseCategory(user, {
        id: newId('exp'),
        name: categoryName.trim(),
        active: true,
        sortOrder: expenseCategories.length + 1
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

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'company', label: 'კომპანია', icon: Building2 },
    { id: 'bakery', label: 'საცხობი', icon: Wheat },
    { id: 'expenses', label: 'ხარჯის კატეგორიები', icon: SettingsIcon }
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="პარამეტრები"
          subtitle="ყველა ცვლილება აისახება Audit Log-ში"
          icon={SettingsIcon}
          actions={
            tab !== 'expenses' && (
              <Button onClick={() => void submit()} loading={saving}>
                შენახვა
              </Button>
            )
          }
        />
        <div className="px-5 pt-4 flex gap-2 flex-wrap">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                  tab === t.id ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'company' && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="კომპანიის დასახელება" required className="md:col-span-2">
              <Input value={draft.companyName} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} />
            </Field>
            <Field label="საიდენტიფიკაციო კოდი">
              <Input value={draft.taxId} onChange={(e) => setDraft({ ...draft, taxId: e.target.value })} />
            </Field>
            <Field label="ტელეფონი">
              <Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
            </Field>
            <Field label="მისამართი" className="md:col-span-2">
              <Input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
            </Field>
            <Field label="ელფოსტა">
              <Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </Field>
            <Field label="ბანკი">
              <Input value={draft.bankName ?? ''} onChange={(e) => setDraft({ ...draft, bankName: e.target.value })} />
            </Field>
            <Field label="IBAN" className="md:col-span-2">
              <Input value={draft.iban ?? ''} onChange={(e) => setDraft({ ...draft, iban: e.target.value })} />
            </Field>
            <Field label="დოკუმენტის ზედა ტექსტი" className="md:col-span-2">
              <Input value={draft.documentHeader ?? ''} onChange={(e) => setDraft({ ...draft, documentHeader: e.target.value })} />
            </Field>
            <Field label="დოკუმენტის ქვედა ტექსტი" className="md:col-span-2">
              <Textarea
                rows={2}
                value={draft.documentFooter ?? ''}
                onChange={(e) => setDraft({ ...draft, documentFooter: e.target.value })}
              />
            </Field>
          </div>
        )}

        {tab === 'bakery' && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="პატარა პურის გრამაჟი (გ)" required hint="ცვლილება ძველ ჩანაწერებს არ შეეხება — ისინი snapshot-ს ინახავენ">
                <Input
                  value={draft.smallBreadWeightGrams}
                  onChange={(e) => setDraft({ ...draft, smallBreadWeightGrams: Number(e.target.value) || 0 })}
                  type="number"
                />
              </Field>
              <Field label="დიდი პურის გრამაჟი (გ)" required>
                <Input
                  value={draft.largeBreadWeightGrams}
                  onChange={(e) => setDraft({ ...draft, largeBreadWeightGrams: Number(e.target.value) || 0 })}
                  type="number"
                />
              </Field>
            </div>
            <div className="space-y-3">
              <Checkbox
                checked={draft.allowAnonymousSale}
                onChange={(v) => setDraft({ ...draft, allowAnonymousSale: v })}
                label="ანონიმური გაყიდვის დაშვება"
                hint="თუ გამორთულია, მოლარემ ყოველთვის უნდა მიუთითოს ვინ ჩაიბარა"
              />
              <Checkbox
                checked={draft.allowNegativeStock}
                onChange={(v) => setDraft({ ...draft, allowNegativeStock: v })}
                label="უარყოფითი მარაგის დაშვება"
                hint="ნაგულისხმევად გამორთულია — მარაგზე მეტის გაყიდვა/ხარჯვა აკრძალულია"
              />
              <Checkbox
                checked={draft.requireShiftForSale}
                onChange={(v) => setDraft({ ...draft, requireShiftForSale: v })}
                label="გაყიდვისთვის გახსნილი ცვლა სავალდებულოა"
              />
              <Checkbox
                checked={draft.requireOpenBusinessDay}
                onChange={(v) => setDraft({ ...draft, requireOpenBusinessDay: v })}
                label="დახურულ დღეზე ჩანაწერის დამატება აკრძალულია"
              />
            </div>
          </div>
        )}

        {tab === 'expenses' && (
          <>
            <div className="px-5 py-3 flex justify-end">
              <Button size="sm" icon={Plus} onClick={() => setShowCategory(true)}>
                ახალი კატეგორია
              </Button>
            </div>
            <Table
              head={
                <tr>
                  <Th>დასახელება</Th>
                  <Th>სტატუსი</Th>
                  <Th />
                </tr>
              }
            >
              {expenseCategories.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <Td className="font-semibold">{c.name}</Td>
                  <Td>
                    <Badge tone={c.active ? 'green' : 'slate'}>{c.active ? 'აქტიური' : 'გათიშული'}</Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => user && void saveExpenseCategory(user, { ...c, active: !c.active })}
                      >
                        {c.active ? 'გათიშვა' : 'გააქტიურება'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => user && void deleteExpenseCategory(user, c)}>
                        წაშლა
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Card>

      <Modal
        open={showCategory}
        onClose={() => setShowCategory(false)}
        title="ახალი ხარჯის კატეგორია"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCategory(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void addCategory()} loading={saving} disabled={!categoryName.trim()}>
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
