import { useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Info, Lock, PackageCheck, RotateCw, ShieldCheck, Sparkles, WifiOff } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Avatar, Field, RoleBadge, useValidation } from '../components/ui';
import { BrandMark } from '../components/Layout';
import type { Role } from '../lib/types';

const DEMO: { name: string; email: string; password: string; role: Role; blurb: string }[] = [
  { name: 'Maya Okafor', email: 'admin@stockroom.app', password: 'admin123', role: 'admin', blurb: 'Owner · full access, manages team' },
  { name: 'Daniel Reyes', email: 'manager@stockroom.app', password: 'manager123', role: 'manager', blurb: 'Approves & receives orders, sees costs' },
  { name: 'Priya Nair', email: 'staff@stockroom.app', password: 'staff123', role: 'staff', blurb: 'Requests stock, receives assigned orders' },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/** Shown while a saved session is being restored but the server can't be reached. */
export function Reconnecting({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="login" style={{ gridTemplateColumns: '1fr' }}>
      <section className="login-form" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }} role="status" aria-live="polite">
        <WifiOff size={22} className="muted" />
        <h1 style={{ fontSize: 22, marginTop: 14 }}>Reconnecting to Stockroom…</h1>
        <p className="muted" style={{ marginTop: 8, maxWidth: 360 }}>The server isn't responding yet. You're still signed in — this page will continue automatically.</p>
        <button className="btn" style={{ marginTop: 18 }} onClick={onRetry}><RotateCw size={14} /> Try now</button>
      </section>
    </div>
  );
}

export default function Login() {
  const { user, login, sessionEnded } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const form = useRef<HTMLFormElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<{ field: 'email' | 'password' | 'form'; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const v = useValidation({ email, password }, {
    email: (x) => (!EMAIL.test(x.trim()) ? 'Enter the email you sign in with' : null),
    password: (x) => (!x ? 'Enter your password' : null),
  });

  if (user) return <Navigate to={(location.state as { from?: string })?.from || '/'} replace />;

  const signIn = async (creds: { email: string; password: string }, key: string) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await login(creds.email, creds.password);
      navigate((location.state as { from?: string })?.from || '/', { replace: true });
    } catch (err) {
      const e = err as ApiError;
      // Wrong credentials point at the password field; outages and lockouts are about the whole form.
      setError({ field: e.status === 401 ? 'password' : 'form', message: e.message });
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    // Read straight from the form so browser/password-manager autofill always counts,
    // even when it didn't fire React's change events.
    const data = new FormData(form.current!);
    const creds = { email: String(data.get('email') ?? '').trim(), password: String(data.get('password') ?? '') };
    setEmail(creds.email);
    setPassword(creds.password);
    v.touchAll();
    if (!EMAIL.test(creds.email) || !creds.password) return;
    signIn(creds, 'form');
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

          {/* One reserved line for session/outage notices, so the centred form never moves. */}
          <div className={`login-notice ${error?.field === 'form' ? 'error' : ''}`} role={error?.field === 'form' ? 'alert' : 'status'} aria-live="polite">
            {error?.field === 'form'
              ? <><WifiOff size={14} /> {error.message}</>
              : sessionEnded ? <><Info size={14} /> Your session ended. Sign in again to continue.</> : null}
          </div>

          <form ref={form} onSubmit={submit} noValidate className="stack" style={{ gap: 8 }}>
            <Field label="Email" htmlFor="email" error={v.error('email')}>
              <input className="input" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false}
                value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} placeholder="you@company.com" {...v.bind('email', 'email')} />
            </Field>
            <Field label="Password" htmlFor="password" error={error?.field === 'password' ? error.message : v.error('password')}>
              <div className="password-field">
                <input className="input" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                  value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} placeholder="••••••••" {...v.bind('password', 'password')} />
                <button type="button" className="icon-btn" onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <button className="btn primary lg block" aria-busy={busy === 'form'} disabled={!!busy}>
              <span>Sign in</span> <ArrowRight size={15} />
            </button>
          </form>

          <div className="divider">or try a demo role</div>
          <div className="demo-accounts">
            {DEMO.map((d) => (
              <button key={d.email} type="button" className={`demo-account ${busy === d.email ? 'selected' : ''}`} disabled={!!busy}
                aria-label={`Sign in as ${d.name}, ${d.role}`}
                onClick={() => { setEmail(d.email); setPassword(d.password); signIn(d, d.email); }}>
                <Avatar name={d.name} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}><b style={{ fontWeight: 600 }}>{d.name}</b> <RoleBadge role={d.role} /></div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{d.blurb}</div>
                  <div className="demo-creds">{d.email} · {d.password}</div>
                </div>
                {busy === d.email ? <span className="spinner" style={{ width: 15, height: 15 }} aria-hidden="true" /> : <ArrowRight size={15} className="muted" />}
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
