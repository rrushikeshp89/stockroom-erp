import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Ban, Check, CheckCircle2, Lock, PackageCheck, Pencil, Send, Trash2, Undo2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { Person, POAction, PurchaseOrder } from '../lib/types';
import { fmtDate, fmtDateTime, fmtMoney, relativeDay } from '../lib/format';
import { Avatar, ConfirmDialog, Empty, PageSkeleton, POStatusPill, SupplierLogo, useToast } from '../components/ui';

const STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'pending', label: 'Approval' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'received', label: 'Received' },
] as const;

const EVENT_LABEL: Record<string, string> = {
  created: 'Order created', edited: 'Order edited', submitted: 'Submitted for approval', approved: 'Approved and sent to supplier',
  rejected: 'Sent back to draft', received: 'Goods received — stock updated', cancelled: 'Order cancelled', assigned: 'Receiver changed',
};

type Dialog = Exclude<POAction, 'edit' | 'assign'> | null;

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can, user } = useAuth();
  const finance = can('finance:view');
  const { data: po, error, setData } = useApi<PurchaseOrder>(`/purchase-orders/${id}`);
  const { data: people } = useApi<Person[]>(can('po:assign') ? '/meta/people' : null);
  const [dialog, setDialog] = useState<Dialog>(null);

  if (error) {
    return (
      <div className="section" style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        <Empty icon={<Lock size={20} />} title="Order not found" action={<Link className="btn" to="/purchase-orders">Back to orders</Link>}>
          It doesn't exist, or it's outside what your role can see.
        </Empty>
      </div>
    );
  }
  if (!po) return <PageSkeleton />;

  const allowed = (a: POAction) => po.allowed_actions.includes(a);
  const act = (action: string, success: string) => async (note: string) => {
    const r = await api.post<PurchaseOrder>(`/purchase-orders/${po.id}/${action}`, { note: note || undefined });
    setData(r);
    if (action === 'receive' && r.stock_changes) {
      toast({ kind: 'success', title: success, body: r.stock_changes.map((c) => `${c.name}: ${c.before} → ${c.after}`).join('\n') });
    } else {
      toast({ kind: 'success', title: success, body: po.number });
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.key === po.status);
  const blockers: string[] = [];
  if (po.status === 'pending' && can('po:approve') && !allowed('approve')) {
    blockers.push('Separation of duties: you raised this order, so another manager or the owner must approve it.');
  }
  if (po.status === 'ordered' && !allowed('receive')) {
    blockers.push(`Only ${po.assigned_to_name ?? 'the assigned receiver'} or a manager can mark this order received.`);
  }
  if (po.status === 'pending' && !can('po:approve')) blockers.push('Waiting for a manager to approve.');

  const assign = async (assigned_to: number | null) => {
    try {
      setData(await api.post<PurchaseOrder>(`/purchase-orders/${po.id}/assign`, { assigned_to }));
      toast({ kind: 'success', title: 'Receiver updated' });
    } catch (e) { toast({ kind: 'error', title: 'Could not reassign', body: (e as Error).message }); }
  };

  return (
    <div className="hairline detail">
      <div>
        <div className="section">
          <Link to="/purchase-orders" className="crumb"><ArrowLeft size={13} /> Purchase orders</Link>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div className="row" style={{ gap: 14 }}>
              <SupplierLogo name={po.supplier_name} color={po.supplier_color} size={44} />
              <div>
                <div className="row" style={{ gap: 10 }}>
                  <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em' }} className="num">{po.number}</h1>
                  <POStatusPill status={po.status} />
                </div>
                <p className="muted" style={{ marginTop: 3 }}>{po.supplier_name} · created {fmtDate(po.created_at, { month: 'short', day: 'numeric', year: 'numeric' })} by {po.created_by_name}</p>
              </div>
            </div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {allowed('delete') && <button className="btn ghost danger" onClick={() => setDialog('delete')}><Trash2 size={14} /> Delete</button>}
              {allowed('cancel') && <button className="btn" onClick={() => setDialog('cancel')}><Ban size={14} /> Cancel order</button>}
              {allowed('edit') && <button className="btn" onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}><Pencil size={14} /> Edit</button>}
              {allowed('reject') && <button className="btn" onClick={() => setDialog('reject')}><Undo2 size={14} /> Send back</button>}
              {allowed('submit') && <button className="btn primary" onClick={() => setDialog('submit')}><Send size={14} /> Submit for approval</button>}
              {allowed('approve') && <button className="btn primary" onClick={() => setDialog('approve')}><Check size={14} /> Approve &amp; order</button>}
              {allowed('receive') && <button className="btn green" onClick={() => setDialog('receive')}><PackageCheck size={15} /> Mark as received</button>}
            </div>
          </div>

          {po.status !== 'cancelled' ? (
            <div className="stepper" style={{ marginTop: 26, flexWrap: 'wrap' }}>
              {STEPS.map((s, i) => (
                <div key={s.key} className="row" style={{ gap: 0 }}>
                  {i > 0 && <span className={`line ${i <= stepIndex ? 'done' : ''}`} />}
                  <span className={`st ${i < stepIndex || po.status === 'received' ? 'done' : i === stepIndex ? 'current' : ''}`}>
                    <span className="c">{(i < stepIndex || po.status === 'received') ? <Check size={11} strokeWidth={3} /> : null}</span>{s.label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="callout red" style={{ marginTop: 22 }}>
              <Ban size={16} style={{ marginTop: 2 }} />
              <div><b>Cancelled by {po.cancelled_by_name}</b> · {fmtDateTime(po.cancelled_at)}{po.cancel_reason && <div style={{ marginTop: 3 }}>{po.cancel_reason}</div>}</div>
            </div>
          )}

          {blockers.map((b) => (
            <div key={b} className="callout amber" style={{ marginTop: 18 }}><Lock size={15} style={{ marginTop: 2 }} /><div>{b}</div></div>
          ))}
          {po.status === 'received' && (
            <div className="callout green" style={{ marginTop: 18 }}>
              <ShieldCheck size={16} color="var(--green-ink)" style={{ marginTop: 2 }} />
              <div><b>Received by {po.received_by_name}</b> · {fmtDateTime(po.received_at)}. Stock and the ledger were updated in one transaction; this order is now locked.</div>
            </div>
          )}
        </div>

        <div className="section" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="section-head" style={{ marginBottom: 10 }}>
            <h2 className="section-title" style={{ fontSize: 16 }}>Line items</h2>
            {po.status !== 'draft' && <span className="lock-note"><Lock size={12} /> Locked after submission</span>}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Quantity</th>
                  <th className="num hide-sm">{po.status === 'received' ? 'Stock now' : 'On hand → after receipt'}</th>
                  {finance && <th className="num">Unit cost</th>}
                  {finance && <th className="num">Total</th>}
                </tr>
              </thead>
              <tbody>
                {po.lines!.map((l) => (
                  <tr key={l.id}>
                    <td><div className="strong">{l.product_name}</div><div className="sub num">{l.sku}</div></td>
                    <td className="num strong">{l.quantity} <span className="muted" style={{ fontWeight: 400 }}>{l.unit}s</span></td>
                    <td className="num hide-sm">
                      {po.status === 'received' || po.status === 'cancelled'
                        ? l.stock
                        : <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>{l.stock} <ArrowRight size={12} className="muted" /> <b style={{ color: 'var(--green-ink)', fontWeight: 600 }}>{l.stock + l.quantity}</b></span>}
                    </td>
                    {finance && <td className="num">{fmtMoney(l.unit_cost)}</td>}
                    {finance && <td className="num strong">{fmtMoney(l.line_total)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {finance ? (
            <div className="totals">
              <div><span>Lines</span><span className="num">{po.line_count}</span></div>
              <div><span>Units</span><span className="num">{po.unit_count}</span></div>
              <div className="grand"><span>Order total</span><span className="num">{fmtMoney(po.total)}</span></div>
            </div>
          ) : (
            <p className="lock-note" style={{ marginTop: 16 }}><Lock size={12} /> Prices are visible to managers only.</p>
          )}
          {po.notes && (
            <div style={{ marginTop: 26 }}>
              <span className="label">Notes</span>
              <p style={{ marginTop: 8, color: 'var(--ink-2)' }}>{po.notes}</p>
            </div>
          )}
        </div>
      </div>

      <aside>
        <div className="section">
          <h2 className="section-title" style={{ fontSize: 16, marginBottom: 18 }}>Details</h2>
          <dl className="dl">
            <dt>Supplier</dt><dd>{po.supplier_name}</dd>
            <dt>Lead time</dt><dd>{po.lead_time_days} days</dd>
            <dt>Expected</dt><dd>{po.status === 'received' ? fmtDate(po.expected_at) : relativeDay(po.expected_at)}</dd>
            <dt>Requested by</dt><dd><Avatar name={po.created_by_name} size="xs" /> {po.created_by_name}</dd>
            <dt>Receiver</dt>
            <dd>
              {allowed('assign') && people ? (
                <select className="select sm" value={po.assigned_to ?? ''} onChange={(e) => assign(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Unassigned</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === user?.id ? ' (you)' : ''}</option>)}
                </select>
              ) : po.assigned_to_name ? <><Avatar name={po.assigned_to_name} size="xs" /> {po.assigned_to_name}</> : <span className="muted">Unassigned</span>}
            </dd>
            {po.approved_by_name && <><dt>Approved by</dt><dd><Avatar name={po.approved_by_name} size="xs" /> {po.approved_by_name}</dd></>}
            {po.received_by_name && <><dt>Received by</dt><dd><Avatar name={po.received_by_name} size="xs" /> {po.received_by_name}</dd></>}
          </dl>
        </div>
        <div className="section" style={{ borderTop: '1px solid var(--line)' }}>
          <h2 className="section-title" style={{ fontSize: 16, marginBottom: 18 }}>Timeline</h2>
          <ul className="timeline">
            {po.events!.map((e) => (
              <li key={e.id}>
                <span className={`t-dot ${e.action === 'received' ? 'green' : e.action === 'cancelled' || e.action === 'rejected' ? 'red' : e.action === 'approved' ? 'dark' : ''}`} />
                <div className="t-title">{EVENT_LABEL[e.action] ?? e.action}</div>
                <div className="t-meta">{e.user_name} · {fmtDateTime(e.created_at)}</div>
                {e.note && <div className="t-note">{e.note}</div>}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {dialog === 'submit' && <ConfirmDialog title="Submit for approval?" description="Line items lock once submitted. A manager will review it." confirmLabel="Submit" onClose={() => setDialog(null)} onConfirm={act('submit', 'Submitted for approval')} />}
      {dialog === 'approve' && <ConfirmDialog title={`Approve ${po.number}?`} description={`This places the order with ${po.supplier_name}.${finance ? ` Total ${fmtMoney(po.total)}.` : ''}`} confirmLabel="Approve & order" onClose={() => setDialog(null)} notePlaceholder="Anything the receiver should know?" onConfirm={act('approve', 'Order approved')} />}
      {dialog === 'reject' && <ConfirmDialog title="Send back to draft?" description="The requester can edit and resubmit." confirmLabel="Send back" requireNote notePlaceholder="What needs to change?" onClose={() => setDialog(null)} onConfirm={act('reject', 'Sent back to draft')} />}
      {dialog === 'cancel' && <ConfirmDialog title={`Cancel ${po.number}?`} description="Cancelled orders are closed for good. Stock is not affected." confirmLabel="Cancel order" tone="danger" notePlaceholder="Reason for cancelling" onClose={() => setDialog(null)} onConfirm={act('cancel', 'Order cancelled')} />}
      {dialog === 'delete' && <ConfirmDialog title="Delete this draft?" confirmLabel="Delete draft" tone="danger" onClose={() => setDialog(null)} onConfirm={async () => { await api.del(`/purchase-orders/${po.id}`); toast({ kind: 'success', title: 'Draft deleted' }); navigate('/purchase-orders'); }} />}
      {dialog === 'receive' && (
        <ConfirmDialog title="Mark as received?" tone="green" confirmLabel="Receive & update stock" onClose={() => setDialog(null)} notePlaceholder="e.g. 2 cartons dented, accepted"
          description="Confirm the delivery matches the order. This runs as one transaction: every line below is added to stock, or none are."
          onConfirm={act('receive', 'Delivery received · stock updated')}>
          <div className="change-list">
            {po.lines!.map((l) => (
              <div key={l.id}>
                <CheckCircle2 size={15} color="var(--green)" />
                <span className="grow">{l.product_name}</span>
                <span className="num muted">{l.stock}</span>
                <ArrowRight size={12} className="muted" />
                <b className="num" style={{ minWidth: 30, textAlign: 'right' }}>{l.stock + l.quantity}</b>
                <span className="pill green plain num" style={{ minWidth: 52, justifyContent: 'center' }}>+{l.quantity}</span>
              </div>
            ))}
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
