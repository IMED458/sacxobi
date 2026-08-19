import React, { useState } from 'react';
import { ArrowRightLeft, CheckCircle2, FileDown, Plus, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatDateTime } from '../lib/dates';
import { formatQty } from '../lib/money';
import { FLOOR_LABELS } from '../lib/permissions';
import { downloadBlob, generateTransferSheetPdf } from '../lib/pdf';
import { cancelTransferRequest, createTransferRequest, fulfillTransferRequest } from '../services/transfers';
import type { TransferRequest, TransferStatus } from '../types';
import { DeleteRecordButton } from '../components/DeleteRecordButton';
import { COL } from '../services/db';

const STATUS: Record<TransferStatus, { label: string; tone: 'amber' | 'blue' | 'green' | 'red' }> = {
  PENDING: { label: 'მოლოდინში', tone: 'amber' },
  PARTIAL: { label: 'ნაწილობრივ', tone: 'blue' },
  COMPLETED: { label: 'შესრულებული', tone: 'green' },
  CANCELLED: { label: 'გაუქმებული', tone: 'red' }
};

export const TransfersView: React.FC = () => {
  const { user, can } = useAuth();
  const { products, transferRequests, settings, stockOf } = useData();
  const toast = useToast();

  const [showNew, setShowNew] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const [fulfilling, setFulfilling] = useState<TransferRequest | null>(null);
  const [fulfillQty, setFulfillQty] = useState('');
  const [fulfillNote, setFulfillNote] = useState('');

  const [cancelling, setCancelling] = useState<TransferRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const transferable = products.filter((p) => p.active && p.kind === 'PRODUCED');
  const open = transferRequests.filter((t) => t.status === 'PENDING' || t.status === 'PARTIAL');
  const history = transferRequests.filter((t) => t.status === 'COMPLETED' || t.status === 'CANCELLED');

  const submitRequest = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const req = await createTransferRequest(user, { productId, quantity: Number(quantity) || 0, note: note || undefined });
      toast.success(`მოთხოვნა შეიქმნა — ${req.requestNo}`);
      setShowNew(false);
      setProductId('');
      setQuantity('');
      setNote('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitFulfill = async () => {
    if (!user || !fulfilling) return;
    setSaving(true);
    try {
      const next = await fulfillTransferRequest(user, settings, fulfilling.id, Number(fulfillQty) || 0, fulfillNote || undefined);
      toast.success(next.status === 'COMPLETED' ? 'მოთხოვნა სრულად შესრულდა' : 'ნაწილობრივ შესრულდა');
      setFulfilling(null);
      setFulfillQty('');
      setFulfillNote('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const submitCancel = async () => {
    if (!user || !cancelling) return;
    setSaving(true);
    try {
      await cancelTransferRequest(user, cancelling.id, cancelReason);
      toast.success('მოთხოვნა გაუქმდა');
      setCancelling(null);
      setCancelReason('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const exportSheet = async (request: TransferRequest) => {
    try {
      const { blob, fileName } = await generateTransferSheetPdf(request, settings);
      downloadBlob(blob, fileName);
    } catch (err) {
      toast.error(err);
    }
  };

  const renderRows = (list: TransferRequest[]) =>
    list.map((t) => {
      const lowerStock = stockOf('PRODUCT', t.productId, t.fromLocation)?.quantity ?? 0;
      return (
        <tr key={t.id} className="hover:bg-slate-50">
          <Td className="font-bold text-slate-900">{t.requestNo}</Td>
          <Td className="text-xs text-slate-500">{formatDateTime(t.requestedAt)}</Td>
          <Td>{t.productName}</Td>
          <Td className="text-xs">
            {FLOOR_LABELS[t.fromLocation]} → {FLOOR_LABELS[t.toLocation]}
          </Td>
          <Td className="text-right">{formatQty(t.requestedQuantity)}</Td>
          <Td className="text-right text-emerald-700 font-semibold">{formatQty(t.deliveredQuantity)}</Td>
          <Td className="text-right font-bold">{formatQty(t.remainingQuantity)}</Td>
          <Td className="text-xs">{t.requestedByName}</Td>
          <Td className="text-xs">{t.completedByName ?? '—'}</Td>
          <Td>
            <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
          </Td>
          <Td>
            <div className="flex items-center gap-1 justify-end">
              {(t.status === 'PENDING' || t.status === 'PARTIAL') && can('transfer.fulfill') && (
                <button
                  onClick={() => {
                    setFulfilling(t);
                    setFulfillQty(String(Math.min(t.remainingQuantity, lowerStock || t.remainingQuantity)));
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 cursor-pointer"
                >
                  შესრულება
                </button>
              )}
              {(t.status === 'PENDING' || t.status === 'PARTIAL') && can('transfer.create_request') && (
                <button
                  onClick={() => setCancelling(t)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  title="გაუქმება"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => void exportSheet(t)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 cursor-pointer"
                title="PDF"
              >
                <FileDown className="w-4 h-4" />
              </button>
              <DeleteRecordButton
                collection={COL.transferRequests}
                id={t.id}
                entityType="transferRequest"
                label={`გადატანა ${t.requestNo}`}
                warning="მოთხოვნა წაიშლება. უკვე გადატანილი პროდუქცია მარაგში რჩება — საჭიროებისას შეასწორეთ ნაშთი."
              />
            </div>
          </Td>
        </tr>
      );
    });

  const head = (
    <tr>
      <Th>დოკუმენტი</Th>
      <Th>თარიღი</Th>
      <Th>პროდუქტი</Th>
      <Th>მიმართულება</Th>
      <Th className="text-right">მოთხოვნილი</Th>
      <Th className="text-right">ატანილი</Th>
      <Th className="text-right">დარჩენილი</Th>
      <Th>მოითხოვა</Th>
      <Th>შეასრულა</Th>
      <Th>სტატუსი</Th>
      <Th />
    </tr>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="აქტიური მოთხოვნები"
          subtitle="ქვედა სართულიდან ზედა სართულზე ასატანი პროდუქცია"
          icon={ArrowRightLeft}
          actions={
            can('transfer.create_request') && (
              <Button icon={Plus} onClick={() => setShowNew(true)}>
                ახალი მოთხოვნა
              </Button>
            )
          }
        />
        {open.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="შესასრულებელი მოთხოვნა არ არის" />
        ) : (
          <Table head={head}>{renderRows(open)}</Table>
        )}
      </Card>

      <Card>
        <CardHeader title="ისტორია" subtitle="შესრულებული და გაუქმებული მოთხოვნები" />
        {history.length === 0 ? (
          <EmptyState title="ისტორია ცარიელია" />
        ) : (
          <Table head={head}>{renderRows(history.slice(0, 100))}</Table>
        )}
      </Card>

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="ახალი გადატანის მოთხოვნა"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNew(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submitRequest()} loading={saving} disabled={!productId || !quantity}>
              მოთხოვნის შექმნა
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="პროდუქტი" required>
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— აირჩიეთ —</option>
              {transferable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (ქვედაზე: {formatQty(stockOf('PRODUCT', p.id, 'LOWER_FLOOR')?.quantity ?? 0)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="რაოდენობა" required>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="decimal" placeholder="მაგ. 10" />
          </Field>
          <Field label="შენიშვნა">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!fulfilling}
        onClose={() => setFulfilling(null)}
        title={`მოთხოვნის შესრულება — ${fulfilling?.requestNo ?? ''}`}
        subtitle={fulfilling ? `${fulfilling.productName} · დარჩენილია ${formatQty(fulfilling.remainingQuantity)} ${fulfilling.unitSymbol}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFulfilling(null)}>
              დახურვა
            </Button>
            <Button variant="success" onClick={() => void submitFulfill()} loading={saving}>
              დადასტურება
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
            ქვედა სართულზე არსებული მარაგი:{' '}
            <span className="font-bold text-slate-900">
              {fulfilling ? formatQty(stockOf('PRODUCT', fulfilling.productId, fulfilling.fromLocation)?.quantity ?? 0) : 0}{' '}
              {fulfilling?.unitSymbol}
            </span>
          </div>
          <Field label="რეალურად ატანილი რაოდენობა" required>
            <Input value={fulfillQty} onChange={(e) => setFulfillQty(e.target.value)} inputMode="decimal" autoFocus />
          </Field>
          <Field label="კომენტარი">
            <Input value={fulfillNote} onChange={(e) => setFulfillNote(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="მოთხოვნის გაუქმება"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              დახურვა
            </Button>
            <Button variant="danger" onClick={() => void submitCancel()} loading={saving} disabled={!cancelReason.trim()}>
              გაუქმება
            </Button>
          </>
        }
      >
        <Field label="გაუქმების მიზეზი" required>
          <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
};
