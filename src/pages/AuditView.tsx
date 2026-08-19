import React, { useEffect, useState } from 'react';
import { FileClock, Search } from 'lucide-react';
import { Card, CardHeader, EmptyState, Input, Select, Table, Td, Th } from '../components/ui';
import { useToast } from '../components/ui/Toast';
import { addDays, formatDateTime, todayBusinessDate } from '../lib/dates';
import { COL, colRef, limit, orderBy, query } from '../services/db';
import { getDocs, where } from 'firebase/firestore';
import type { AuditLog } from '../types';
import { DeleteRecordButton } from '../components/DeleteRecordButton';

export const AuditView: React.FC = () => {
  const toast = useToast();
  const [from, setFrom] = useState(addDays(todayBusinessDate(), -7));
  const [to, setTo] = useState(todayBusinessDate());
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [items, setItems] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getDocs(
      query(colRef(COL.auditLogs), where('businessDate', '>=', from), where('businessDate', '<=', to), orderBy('businessDate', 'desc'), limit(800))
    )
      .then((snap) => {
        if (cancelled) return;
        setItems(snap.docs.map((d) => d.data() as AuditLog).sort((a, b) => b.seq - a.seq));
      })
      .catch((err) => toast.error(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const actions = [...new Set(items.map((i) => i.action))].sort();
  const entityTypes = [...new Set(items.map((i) => i.entityType))].sort();

  const filtered = items.filter((i) => {
    if (action !== 'all' && i.action !== action) return false;
    if (entityType !== 'all' && i.entityType !== entityType) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      i.summary.toLowerCase().includes(q) ||
      i.userName.toLowerCase().includes(q) ||
      i.action.toLowerCase().includes(q) ||
      (i.reason ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <Card>
      <CardHeader
        title="Audit Log"
        subtitle="უცვლელი ჟურნალი — ჩანაწერების რედაქტირება/წაშლა შეუძლებელია"
        icon={FileClock}
        actions={
          <>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ძებნა…" className="pl-9 w-48" />
            </div>
            <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-48">
              <option value="all">ყველა მოქმედება</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
            <Select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-40">
              <option value="all">ყველა ობიექტი</option>
              {entityTypes.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </>
        }
      />
      {loading ? (
        <div className="p-6 text-center text-xs text-slate-400">იტვირთება…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileClock} title="ჩანაწერი ვერ მოიძებნა" />
      ) : (
        <Table
          head={
            <tr>
              <Th>დრო</Th>
              <Th>მომხმარებელი</Th>
              <Th>მოქმედება</Th>
              <Th>ობიექტი</Th>
              <Th>აღწერა</Th>
              <Th>მიზეზი</Th>
              <Th />
            </tr>
          }
        >
          {filtered.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetail(a)}>
              <Td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(a.timestamp)}</Td>
              <Td className="text-xs font-semibold">{a.userName}</Td>
              <Td className="text-xs font-mono text-amber-700">{a.action}</Td>
              <Td className="text-xs text-slate-500">{a.entityType}</Td>
              <Td className="text-sm">{a.summary}</Td>
              <Td className="text-xs text-slate-500">{a.reason ?? '—'}</Td>
              <Td onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end">
                  <DeleteRecordButton
                    collection={COL.auditLogs}
                    id={a.id}
                    entityType="auditLog"
                    label={`ჟურნალის ჩანაწერი: ${a.action}`}
                    warning="⚠️ ეს ჟურნალის ჩანაწერია — სწორედ ის ინახავს ინფორმაციას, ვინ რა გააკეთა. წაშლის შემდეგ ეს კვალი აღარ იარსებებს."
                    onDeleted={() => setItems((prev) => prev.filter((x) => x.id !== a.id))}
                  />
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 mb-1">{detail.summary}</h3>
            <p className="text-xs text-slate-500 mb-4">
              {formatDateTime(detail.timestamp)} · {detail.userName} · {detail.action}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-bold text-slate-500 uppercase mb-1">იყო (before)</p>
                <pre className="bg-slate-50 rounded-xl p-3 overflow-x-auto max-h-72 text-[11px]">
                  {detail.before ? JSON.stringify(detail.before, null, 2) : '—'}
                </pre>
              </div>
              <div>
                <p className="font-bold text-slate-500 uppercase mb-1">გახდა (after)</p>
                <pre className="bg-slate-50 rounded-xl p-3 overflow-x-auto max-h-72 text-[11px]">
                  {detail.after ? JSON.stringify(detail.after, null, 2) : '—'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};
