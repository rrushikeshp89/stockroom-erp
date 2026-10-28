import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Lock, PackageCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Avatar, RoleBadge } from '../components/ui';
import { BrandMark } from '../components/Layout';
import type { Role } from '../lib/types';

const DEMO: { name: string; email: string; password: string; role: Role; blurb: string }[] = [
  { name: 'Maya Okafor', email: 'admin@stockroom.app', password: 'admin123', role: 'admin', blurb: 'Owner · full access, manages team' },
  { name: 'Daniel Reyes', email: 'manager@stockroom.app', password: 'manager123', role: 'manager', blurb: 'Approves & receives orders, sees costs' },
  { name: 'Priya Nair', email: 'staff@stockroom.app', password: 'staff123', role: 'staff', blurb: 'Requests stock, receives assigned orders' },
];

function GlowIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="glow-icon">
      <span className="halo" />
      <i style={{ width: 6, height: 6, top: -2, left: 18 }} />
      <i style={{ width: 8, height: 8, bottom: 2, left: -4 }} />
      <i style={{ width: 4, height: 4, top: 10, right: -6 }} />
      <span className="core">{children}</span>
    </div>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e?: FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds?.email ?? email, creds?.password ?? password);
      navigate((location.state as { from?: string })?.from || '/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-form">
        <div className="brand">
          <BrandMark />
          <span className="brand-name">Stockroom</span>
        </div>

        <div className="inner">
          <h1>Welcome back</h1>
          <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
            Inventory and purchasing for Brew &amp; Co. Sign in to continue.
          </p>

          <form onSubmit={submit} className="stack" style={{ gap: 14, marginTop: 28 }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <div className="callout red" style={{ padding: '10px 12px' }}><AlertTriangle size={16} /> {error}</div>}
            <button className="btn primary lg block" disabled={busy}>
              {busy ? <span className="spinner" /> : <>Sign in <ArrowRight size={15} /></>}
            </button>
          </form>

          <div className="divider">or try a demo role</div>
          <div className="demo-accounts">
            {DEMO.map((d) => (
              <button key={d.email} type="button" className={`demo-account ${email === d.email ? 'selected' : ''}`} disabled={busy}
                onClick={() => { setEmail(d.email); setPassword(d.password); submit(undefined, d); }}>
                <Avatar name={d.name} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}><b style={{ fontWeight: 600 }}>{d.name}</b> <RoleBadge role={d.role} /></div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{d.blurb}</div>
                </div>
                <ArrowRight size={15} className="muted" />
              </button>
            ))}
          </div>
        </div>

        <p className="muted" style={{ fontSize: 12 }}>
          <Lock size={11} style={{ verticalAlign: -1 }} /> Every action is permission-checked on the server and written to the audit log.
        </p>
      </section>

      <section className="login-art" aria-hidden="true">
        <div className="grid-bg" />
        <div className="art-head">
          <span className="label">Inventory &amp; purchasing</span>
          <h2>Know what's in the back room.<br /><span className="muted">Reorder before it runs out.</span></h2>
        </div>
        <div className="feature-grid">
          <div className="feature wide" style={{ animationDelay: '60ms' }}>
            <GlowIcon><PackageCheck size={17} /></GlowIcon>
            <p><b>Stock moves only when goods arrive.</b> Marking an order received updates every line's stock, cost and ledger in a single transaction — or nothing at all.</p>
          </div>
          <div className="feature" style={{ animationDelay: '140ms' }}>
            <GlowIcon><ShieldCheck size={17} /></GlowIcon>
            <p><b>Role-based access</b> with row-level scope, field masking and separation of duties on approvals.</p>
          </div>
          <div className="feature" style={{ animationDelay: '220ms' }}>
            <GlowIcon><Sparkles size={17} /></GlowIcon>
            <p><b>Reorder suggestions</b> balance what's on hand, on order and your thresholds, so cash isn't tied up on shelves.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
