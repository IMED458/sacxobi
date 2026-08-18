import React, { useState } from 'react';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { authMessage, bootstrapOwner } from '../services/auth';

/**
 * ერთჯერადი საწყისი კონფიგურაცია — პირველი მფლობელის შექმნა.
 * ეს ეკრანი ხელმისაწვდომია მხოლოდ მაშინ, როცა `meta/bootstrap` ჯერ არ არსებობს;
 * Security Rules-იც ზუსტად ამ პირობით უშვებს ჩაწერას.
 */
export const BootstrapScreen: React.FC = () => {
  const { refreshBootstrap } = useAuth();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    repeat: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.repeat) {
      setError('პაროლები არ ემთხვევა');
      return;
    }
    setLoading(true);
    try {
      await bootstrapOwner(form);
      await refreshBootstrap();
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-8 text-white text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 rounded-2xl mb-4">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold">სისტემის საწყისი კონფიგურაცია</h1>
          <p className="text-slate-400 text-sm mt-1">შექმენით პირველი მფლობელის ანგარიში — ეს ერთხელ კეთდება</p>
        </div>

        <form onSubmit={submit} className="p-8 space-y-4">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="სახელი" required>
              <Input value={form.firstName} onChange={set('firstName')} required />
            </Field>
            <Field label="გვარი" required>
              <Input value={form.lastName} onChange={set('lastName')} required />
            </Field>
          </div>

          <Field label="მომხმარებლის სახელი (username)" required hint="ლათინური ასოები/ციფრები — ამით შეხვალთ სისტემაში">
            <Input value={form.username} onChange={set('username')} required autoComplete="username" />
          </Field>

          <Field label="ელფოსტა" required hint="საჭიროა პაროლის აღდგენისთვის">
            <Input type="email" value={form.email} onChange={set('email')} required />
          </Field>

          <Field label="ტელეფონი">
            <Input value={form.phone} onChange={set('phone')} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="პაროლი" required hint="მინიმუმ 8 სიმბოლო">
              <Input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" />
            </Field>
            <Field label="გაიმეორეთ პაროლი" required>
              <Input type="password" value={form.repeat} onChange={set('repeat')} required autoComplete="new-password" />
            </Field>
          </div>

          <Button type="submit" loading={loading} size="lg" className="w-full">
            მფლობელის შექმნა და დაწყება
          </Button>
        </form>
      </div>
    </div>
  );
};
