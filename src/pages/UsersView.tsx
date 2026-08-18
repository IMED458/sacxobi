import React, { useState } from 'react';
import { KeyRound, Plus, ShieldCheck, UserCog, UserX } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, Modal, Select, Table, Td, Textarea, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { formatDateTime } from '../lib/dates';
import {
  DEFAULT_ROLE_PERMISSIONS,
  FLOOR_LABELS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
  ROLE_LABELS
} from '../lib/permissions';
import { createUser, resetUserPassword, setUserStatus, updateUser } from '../services/users';
import type { AppUser, Floor, Permission, UserRole } from '../types';

const EMPTY = {
  firstName: '',
  lastName: '',
  username: '',
  password: '',
  phone: '',
  position: '',
  role: 'CASHIER' as UserRole,
  assignedFloor: '' as '' | Floor,
  comment: '',
  mustChangePassword: true
};

export const UsersView: React.FC = () => {
  const { user } = useAuth();
  const { users } = useData();
  const toast = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [permissions, setPermissions] = useState<Permission[]>(DEFAULT_ROLE_PERMISSIONS.CASHIER);
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetForceChange, setResetForceChange] = useState(true);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setPermissions(DEFAULT_ROLE_PERMISSIONS.CASHIER);
    setShowForm(true);
  };

  const openEdit = (target: AppUser) => {
    setEditing(target);
    setForm({
      firstName: target.firstName,
      lastName: target.lastName,
      username: target.username,
      password: '',
      phone: target.phone ?? '',
      position: target.position ?? '',
      role: target.role,
      assignedFloor: target.assignedFloor ?? '',
      comment: target.comment ?? '',
      mustChangePassword: !!target.mustChangePassword
    });
    setPermissions(target.permissions ?? []);
    setShowForm(true);
  };

  const applyRoleDefaults = (role: UserRole) => {
    setForm((prev) => ({ ...prev, role }));
    setPermissions(DEFAULT_ROLE_PERMISSIONS[role]);
  };

  const togglePermission = (permission: Permission) =>
    setPermissions((prev) => (prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]));

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (editing) {
        await updateUser(user, editing, {
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone || undefined,
          position: form.position || undefined,
          role: form.role,
          assignedFloor: form.assignedFloor || undefined,
          permissions,
          comment: form.comment || undefined
        });
        toast.success('მომხმარებელი განახლდა');
      } else {
        await createUser(user, {
          firstName: form.firstName,
          lastName: form.lastName,
          username: form.username,
          password: form.password,
          phone: form.phone || undefined,
          position: form.position || undefined,
          role: form.role,
          assignedFloor: form.assignedFloor || undefined,
          permissions,
          comment: form.comment || undefined,
          mustChangePassword: form.mustChangePassword
        });
        toast.success('მომხმარებელი დაემატა');
      }
      setShowForm(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (target: AppUser) => {
    if (!user) return;
    try {
      await setUserStatus(user, target, target.status === 'active' ? 'disabled' : 'active');
      toast.success(target.status === 'active' ? 'მომხმარებელი გაითიშა' : 'მომხმარებელი გააქტიურდა');
    } catch (err) {
      toast.error(err);
    }
  };

  const doReset = async () => {
    if (!user || !resetTarget) return;
    setSaving(true);
    try {
      await resetUserPassword(user, resetTarget, resetPassword, resetForceChange);
      toast.success(`${resetTarget.username}: ახალი პაროლი დაყენებულია`);
      setResetTarget(null);
      setResetPassword('');
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
          title="მომხმარებლები & უფლებები"
          subtitle="ვის რაზე აქვს წვდომა — POS, სალარო, წარმოება, რეპორტები"
          icon={UserCog}
          actions={
            <Button icon={Plus} onClick={openNew}>
              ახალი მომხმარებელი
            </Button>
          }
        />
        {users.length === 0 ? (
          <EmptyState icon={UserCog} title="მომხმარებლები ვერ ჩაიტვირთა" />
        ) : (
          <Table
            head={
              <tr>
                <Th>სახელი</Th>
                <Th>username</Th>
                <Th>როლი</Th>
                <Th>სართული</Th>
                <Th>ტელეფონი</Th>
                <Th className="text-right">უფლებები</Th>
                <Th>ბოლო შესვლა</Th>
                <Th>სტატუსი</Th>
                <Th />
              </tr>
            }
          >
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <Td className="font-semibold text-slate-800">
                  {u.firstName} {u.lastName}
                  {u.position && <span className="block text-[11px] text-slate-400">{u.position}</span>}
                </Td>
                <Td className="text-xs">{u.username}</Td>
                <Td>
                  <Badge tone={u.role === 'OWNER' ? 'amber' : u.role === 'CASHIER' ? 'blue' : 'slate'}>{ROLE_LABELS[u.role]}</Badge>
                </Td>
                <Td className="text-xs">{u.assignedFloor ? FLOOR_LABELS[u.assignedFloor] : '—'}</Td>
                <Td className="text-xs">{u.phone ?? '—'}</Td>
                <Td className="text-right text-xs">{u.role === 'OWNER' ? 'ყველა' : u.permissions?.length ?? 0}</Td>
                <Td className="text-xs text-slate-500">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</Td>
                <Td>
                  <Badge tone={u.status === 'active' ? 'green' : 'red'}>{u.status === 'active' ? 'აქტიური' : 'გათიშული'}</Badge>
                </Td>
                <Td>
                  <div className="flex gap-1 justify-end">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(u)}>
                      რედაქტირება
                    </Button>
                    <button
                      onClick={() => setResetTarget(u)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-700 hover:bg-amber-50 cursor-pointer"
                      title="პაროლის აღდგენა"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {u.id !== user?.id && (
                      <button
                        onClick={() => void toggleStatus(u)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        title={u.status === 'active' ? 'გათიშვა' : 'გააქტიურება'}
                      >
                        <UserX className="w-4 h-4" />
                      </button>
                    )}
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
        title={editing ? `რედაქტირება — ${editing.username}` : 'ახალი მომხმარებელი'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              გაუქმება
            </Button>
            <Button onClick={() => void submit()} loading={saving}>
              შენახვა
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="სახელი" required>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="გვარი" required>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
            <Field label="ტელეფონი">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="username" required hint={editing ? 'შეცვლა შეუძლებელია' : 'ლათინური ასოები/ციფრები'}>
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!editing} />
            </Field>
            <Field label="პოზიცია">
              <Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </Field>
            {!editing && (
              <Field label="პაროლი" required hint="მინიმუმ 6 სიმბოლო — გადაეცით თანამშრომელს">
                <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            )}
            <Field label="როლი" required>
              <Select value={form.role} onChange={(e) => applyRoleDefaults(e.target.value as UserRole)}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="სართული" hint="თანამშრომლისთვის სავალდებულოა">
              <Select value={form.assignedFloor} onChange={(e) => setForm({ ...form, assignedFloor: e.target.value as '' | Floor })}>
                <option value="">— არ არის —</option>
                <option value="LOWER_FLOOR">{FLOOR_LABELS.LOWER_FLOOR}</option>
                <option value="UPPER_FLOOR">{FLOOR_LABELS.UPPER_FLOOR}</option>
              </Select>
            </Field>
          </div>

          <Field label="კომენტარი">
            <Textarea rows={2} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          </Field>

          {!editing && (
            <Checkbox
              checked={form.mustChangePassword}
              onChange={(v) => setForm({ ...form, mustChangePassword: v })}
              label="პირველივე შესვლისას პაროლის შეცვლა სავალდებულოა"
            />
          )}

          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-slate-600">დეტალური უფლებები</span>
              {form.role === 'OWNER' && <Badge tone="amber">მფლობელს ყოველთვის ყველა უფლება აქვს</Badge>}
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-5">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <p className="text-[11px] font-bold uppercase text-slate-400">{group.title}</p>
                  {group.items.map((p) => (
                    <Checkbox
                      key={p}
                      checked={form.role === 'OWNER' || permissions.includes(p)}
                      disabled={form.role === 'OWNER'}
                      onChange={() => togglePermission(p)}
                      label={PERMISSION_LABELS[p]}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`ახალი პაროლი — ${resetTarget?.username ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>
              გაუქმება
            </Button>
            <Button onClick={() => void doReset()} loading={saving} disabled={resetPassword.length < 6}>
              პაროლის დაყენება
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="ახალი პაროლი" required hint="მინიმუმ 6 სიმბოლო — გადაეცით თანამშრომელს">
            <Input value={resetPassword} onChange={(e) => setResetPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Checkbox
            checked={resetForceChange}
            onChange={setResetForceChange}
            label="შემდეგ შესვლაზე პაროლის შეცვლა სავალდებულოა"
          />
          <p className="text-[11px] text-slate-400">
            Audit Log-ში ჩაიწერება მხოლოდ ის, რომ პაროლი განულდა — თვითონ პაროლი არსად არ ინახება ღიად.
          </p>
        </div>
      </Modal>
    </div>
  );
};
