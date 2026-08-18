import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Field, Input, Modal } from './ui';
import { useToast } from './ui/Toast';
import { useAuth } from '../context/AuthContext';
import { adminDelete } from '../services/admin';

interface Props {
  collection: string;
  id: string;
  label: string;
  entityType?: string;
  /** დამატებითი გაფრთხილება (მაგ. მარაგზე გავლენა). */
  warning?: string;
  onDeleted?: () => void;
}

/**
 * ადმინისტრატორის წაშლის ღილაკი — ჩნდება მხოლოდ `admin.delete` უფლებით.
 * ყოველი წაშლა მოითხოვს მიზეზს და აისახება Audit Log-ში.
 */
export const DeleteRecordButton: React.FC<Props> = ({ collection, id, label, entityType, warning, onDeleted }) => {
  const { user, can } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (!can('admin.delete')) return null;

  const submit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await adminDelete(user, { collection, id, label, entityType }, reason);
      toast.success('ჩანაწერი წაიშალა');
      setOpen(false);
      setReason('');
      onDeleted?.();
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="წაშლა"
        className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="ჩანაწერის წაშლა"
        subtitle={label}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              გაუქმება
            </Button>
            <Button variant="danger" onClick={() => void submit()} loading={loading} disabled={!reason.trim()}>
              წაშლა
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {warning ?? 'ჩანაწერი სამუდამოდ წაიშლება. მარაგი და ფინანსური ნაშთები ავტომატურად არ კორექტირდება.'}
          </p>
          <Field label="წაშლის მიზეზი" required hint="ჩაიწერება Audit Log-ში">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </>
  );
};
