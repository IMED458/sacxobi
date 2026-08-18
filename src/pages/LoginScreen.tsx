import React, { useState } from 'react';
import { AlertCircle, ChefHat, Lock, User as UserIcon } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { authMessage } from '../services/auth';

export const LoginScreen: React.FC = () => {
  const { login, configError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('შეიყვანეთ მომხმარებლის სახელი და პაროლი');
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 p-8 text-white text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-600 rounded-2xl mb-4 shadow-lg shadow-amber-600/30">
            <ChefHat className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">სისტემაში შესვლა</h1>
          <p className="text-slate-400 text-sm mt-1">საცხობის წარმოება, მარაგი და გაყიდვები</p>
        </div>

        <form onSubmit={submit} className="p-8 space-y-5">
          {configError && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-500" />
              <span>{configError}</span>
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <Field label="მომხმარებლის სახელი" required>
            <div className="relative">
              <UserIcon className="w-4.5 h-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                autoComplete="username"
                className="pl-10"
              />
            </div>
          </Field>

          <Field label="პაროლი" required>
            <div className="relative">
              <Lock className="w-4.5 h-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="pl-10"
              />
            </div>
          </Field>

          <Button type="submit" loading={loading} size="lg" className="w-full">
            შესვლა
          </Button>

          <p className="text-center text-[11px] text-slate-400">
            პაროლი დაგავიწყდათ? მიმართეთ მფლობელს — მას შეუძლია ახალი პაროლის დაყენება.
          </p>
        </form>
      </div>
    </div>
  );
};
