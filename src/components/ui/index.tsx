import React from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';

/* ------------------------------- ღილაკი ------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white shadow-sm shadow-amber-600/20',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300',
  danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/20',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20',
  ghost: 'text-slate-600 hover:bg-slate-100'
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    loading?: boolean;
    icon?: React.ElementType;
    size?: 'sm' | 'md' | 'lg';
  }
> = ({ variant = 'primary', loading, icon: Icon, size = 'md', className = '', children, disabled, ...rest }) => {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3.5 text-base' };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${BUTTON_STYLES[variant]} ${sizes[size]} rounded-xl font-bold transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : Icon ? <Icon className="w-4 h-4" /> : null}
      {children}
    </button>
  );
};

/* -------------------------------- ბარათი ----------------------------- */

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>{children}</div>
);

export const CardHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  actions?: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, actions }) => (
  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
    <div className="flex items-center gap-3">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5" />
        </div>
      )}
      <div>
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

/* -------------------------------- ველები ----------------------------- */

export const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, className = '', children }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="block text-xs font-bold text-slate-600">
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
    {children}
    {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
  </div>
);

const INPUT_CLASS =
  'w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-slate-100 disabled:text-slate-500';

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className = '', ...rest }) => (
  <input {...rest} className={`${INPUT_CLASS} ${className}`} />
);

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className = '', ...rest }) => (
  <textarea {...rest} className={`${INPUT_CLASS} ${className}`} />
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className = '', children, ...rest }) => (
  <select {...rest} className={`${INPUT_CLASS} bg-white ${className}`}>
    {children}
  </select>
);

export const Checkbox: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, hint, disabled }) => (
  <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 w-4 h-4 accent-amber-600 cursor-pointer"
    />
    <span>
      <span className="block text-sm font-semibold text-slate-700">{label}</span>
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </span>
  </label>
);

/* -------------------------------- მოდალი ----------------------------- */

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ open, onClose, title, subtitle, size = 'md', children, footer }) => {
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-start justify-center p-4 overflow-y-auto no-print">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${widths[size]} my-8`}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = 'დადასტურება', danger, loading, onConfirm, onCancel }) => (
  <Modal
    open={open}
    onClose={onCancel}
    title={title}
    size="sm"
    footer={
      <>
        <Button variant="secondary" onClick={onCancel}>
          გაუქმება
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="flex gap-3">
      {danger && <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />}
      <p className="text-sm text-slate-600 whitespace-pre-line">{message}</p>
    </div>
  </Modal>
);

/* ------------------------------- სხვადასხვა --------------------------- */

export const Badge: React.FC<{ children: React.ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }> = ({
  children,
  tone = 'slate'
}) => {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700'
  };
  return <span className={`${tones[tone]} px-2 py-0.5 rounded-lg text-[11px] font-bold whitespace-nowrap`}>{children}</span>;
};

export const StatCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  icon?: React.ElementType;
  tone?: 'amber' | 'green' | 'red' | 'blue' | 'slate' | 'violet';
  onClick?: () => void;
}> = ({ label, value, hint, icon: Icon, tone = 'slate', onClick }) => {
  const tones = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    slate: 'bg-white text-slate-700 border-slate-200'
  };
  return (
    <div
      onClick={onClick}
      className={`${tones[tone]} border rounded-2xl p-4 shadow-sm ${onClick ? 'cursor-pointer hover:shadow-md transition' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
          <p className="text-xl font-bold mt-1 text-slate-900 truncate">{value}</p>
          {hint && <p className="text-[11px] mt-0.5 opacity-70">{hint}</p>}
        </div>
        {Icon && <Icon className="w-5 h-5 opacity-60 flex-shrink-0" />}
      </div>
    </div>
  );
};

export const EmptyState: React.FC<{ icon?: React.ElementType; title: string; description?: string; action?: React.ReactNode }> = ({
  icon: Icon,
  title,
  description,
  action
}) => (
  <div className="py-14 text-center">
    {Icon && <Icon className="w-10 h-10 mx-auto text-slate-300 mb-3" />}
    <p className="text-sm font-bold text-slate-700">{title}</p>
    {description && <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const Spinner: React.FC<{ label?: string }> = ({ label }) => (
  <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
    <Loader2 className="w-7 h-7 animate-spin" />
    {label && <p className="text-xs font-semibold">{label}</p>}
  </div>
);

export const Table: React.FC<{ head: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  head,
  children,
  className = ''
}) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-y border-slate-200">{head}</thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table>
  </div>
);

export const Th: React.FC<{ children?: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <th className={`px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap ${className}`}>
    {children}
  </th>
);

export const Td: React.FC<{
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
}> = ({ children, className = '', colSpan, onClick }) => (
  <td colSpan={colSpan} onClick={onClick} className={`px-4 py-2.5 text-slate-700 ${className}`}>
    {children}
  </td>
);

export const SectionTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h3 className={`text-xs font-bold uppercase tracking-wide text-slate-400 ${className}`}>{children}</h3>
);

/* -------------------------------- ტაბები ------------------------------ */

export interface TabDef {
  id: string;
  label: string;
  icon?: React.ElementType;
  hidden?: boolean;
}

export const Tabs: React.FC<{ tabs: TabDef[]; active: string; onChange: (id: string) => void }> = ({
  tabs,
  active,
  onChange
}) => (
  <div className="flex items-center gap-1.5 flex-wrap mb-4">
    {tabs
      .filter((t) => !t.hidden)
      .map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
              active === t.id ? 'bg-slate-900 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            {t.label}
          </button>
        );
      })}
  </div>
);
