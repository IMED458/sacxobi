import React, { useState } from 'react';
import { Button, Field, Input, Modal } from './ui';
import { useToast } from './ui/Toast';
import { useAuth } from '../context/AuthContext';
import { authMessage, changeOwnPassword } from '../services/auth';

export const ChangePasswordModal: React.FC<{ open: boolean; onClose: () => void; forced?: boolean }> = ({
  open,
  onClose,
  forced
}) => {
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (next !== repeat) {
      toast.error(new Error('ახალი პაროლები არ ემთხვევა'));
      return;
    }
    setLoading(true);
    try {
      await changeOwnPassword(user, current, next);
      toast.success('პაროლი განახლდა');
      setCurrent('');
      setNext('');
      setRepeat('');
      onClose();
    } catch (err) {
      toast.error(new Error(authMessage(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={forced ? () => undefined : onClose}
      title="პაროლის შეცვლა"
      subtitle={forced ? 'უსაფრთხოებისთვის საჭიროა პაროლის განახლება' : undefined}
      size="sm"
      footer={
        <>
          {!forced && (
            <Button variant="secondary" onClick={onClose}>
              დახურვა
            </Button>
          )}
          <Button onClick={() => void submit()} loading={loading}>
            შენახვა
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="მიმდინარე პაროლი" required>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="ახალი პაროლი" required hint="მინიმუმ 6 სიმბოლო">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="გაიმეორეთ ახალი პაროლი" required>
          <Input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
    </Modal>
  );
};
