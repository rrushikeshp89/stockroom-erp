import { useMemo, useRef, useState } from 'react';
import { Archive, ArrowDownRight, ArrowUpRight, ClipboardCheck, Lock, Minus, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useApi, useQueryState, useSearchHotkey } from '../lib/hooks';
import type { Movement, Product, Supplier } from '../lib/types';
import { fmtDateTime, fmtMoney, fmtMoney0, fmtNum } from '../lib/format';
import {
  ConfirmDialog, Drawer, Empty, ErrorState, Field, FillerRows, FootError, Modal, Pagination, SearchInput, SegTabs, Sk, SkeletonRows, StockPill, SupplierLogo, TableEmpty, usePaged, useToast, useValidation,
} from '../components/ui';
import RowMenu from '../components/RowMenu';

type Filter = 'all' | 'attention' | 'ok';

export default function Products() {
  const { can } = useAuth();
  const finance = can('finance:view');
  const { data: products, error, reload } = useApi<Product[]>('/products');
  const [status, setStatus] = useQueryState('status', 'all');
  const filter = status as Filter;
  // Filters live in the URL: back/forward and refresh keep them.
  const [category, setCategory] = useQueryState('category');
  const [q, setQ] = useQueryState('q');
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchHotkey(searchRef);

  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [stockFor, setStockFor] = useState<{ product: Product; type: 'usage' | 'waste' | 'adjustment' } | null>(null);
  const [archiving, setArchiving] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const toast = useToast();

  const categories = useMemo(() => [...new Set((products ?? []).map((p) => p.category))].sort(), [products]);
  const rows = useMemo(() => (products ?? []).filter((p) =>
    (filter === 'all' || (filter === 'attention' ? p.status !== 'ok' : p.status === 'ok')) &&
    (!category || p.category === category) &&
    (!q || `${p.name} ${p.sku} ${p.supplier_name}`.toLowerCase().includes(q.toLowerCase()))), [products, filter, category, q]);
  const { slice, props } = usePaged(rows, 10);

  const attention = products?.filter((p) => p.status !== 'ok').length ?? 0;
  const value = products?.reduce((s, p) => s + (p.stock_value ?? 0), 0) ?? 0;
  const onOrder = products?.reduce((s, p) => s + p.on_order, 0) ?? 0;
  const cols = finance ? ['22%', '9%', '15%', '15%', '7%', '7%', '8%', '7%', '10%', 52] : ['26%', '11%', '17%', '17%', '8%', '8%', '13%', 52];
  const kpi = (v: React.ReactNode) => (products ? v : <Sk w={40} />);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p>What you sell and use, how much is in the back room, and when it needs reordering.</p>
        </div>
        <div className="row">
          {can('products:manage')
            ? <button className="btn primary" onClick={() => setEditing('new')}><Plus size={15} /> Add product</button>
            : <span className="lock-note"><Lock size={12} /> Read-only for your role</span>}
        </div>
      </div>

      <div className="kpi-strip">
        <div><span className="label">Active SKUs</span><div className="kpi-value" style={{ marginTop: 6 }}>{kpi(products?.length)}</div></div>
        <div><span className="label">Low stock</span><div className="kpi-value" style={{ marginTop: 6 }}>{kpi(products?.filter((p) => p.status === 'low').length)}</div></div>
        <div><span className="label">Out of stock</span><div className="kpi-value" style={{ marginTop: 6, color: 'var(--red-ink)' }}>{kpi(products?.filter((p) => p.status === 'out').length)}</div></div>
        <div>
          <span className="label">{finance ? 'Stock value' : 'Units on order'}</span>
          <div className="kpi-value" style={{ marginTop: 6 }}>{kpi(finance ? fmtMoney0(value) : fmtNum(onOrder))}</div>
        </div>
      </div>

      <section className="section" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="toolbar">
          <SegTabs<Filter> value={filter} onChange={(v) => setStatus(v, { push: true })} options={[
            { value: 'all', label: 'All', count: products?.length ?? null },
            { value: 'attention', label: 'Needs attention', count: products ? attention : null },
            { value: 'ok', label: 'Healthy', count: products ? products.length - attention : null },
          ]} />
          <span className="grow" />
          <select className="select toolbar-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <SearchInput ref={searchRef} value={q} onChange={setQ} placeholder="Search name, SKU, supplier" width={240} />
        </div>

        {error && !products ? <ErrorState message={error} onRetry={reload} /> : (
          <>
            <div className="table-wrap">
              <table className="table fixed" style={{ minWidth: finance ? 980 : 820 }}>
                <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Supplier</th>
                    <th>On hand</th>
                    <th className="num">Reorder at</th>
                    <th className="num">On order</th>
                    {finance && <th className="num">Unit cost</th>}
                    {finance && <th className="num">Value</th>}
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody key={`${filter}|${category}|${q}|${props.page}|${props.pageSize}`}>
                  {!products ? <SkeletonRows rows={10} cols={finance ? ['70%', 50, '70%', 110, 20, 20, 40, 40, 70, 0] : ['70%', 50, '70%', 110, 20, 20, 70, 0]} /> : rows.length === 0 ? (
                    <TableEmpty cols={cols.length} rows={10}>
                      <Empty icon={<Package size={20} />} title="No products match">Clear the filters or search for something else.</Empty>
                    </TableEmpty>
                  ) : (
                    <>
                      {slice.map((p) => {
                        const max = Math.max(p.reorder_point * 2, p.stock, 1);
                        return (
                          <tr key={p.id} className="clickable" onClick={() => setViewing(p.id)}>
                            <td>
                              <button type="button" className="cell-button strong" title={p.name} onClick={(e) => { e.stopPropagation(); setViewing(p.id); }}>{p.name}</button>
                              <div className="sub">{p.sku}</div>
                            </td>
                            <td><span className="tag">{p.category}</span></td>
                            <td>
                              <div className="cell-main"><SupplierLogo name={p.supplier_name} color={p.supplier_color} size={22} /><span className="ellipsis" title={p.supplier_name ?? undefined}>{p.supplier_name ?? '—'}</span></div>
                            </td>
                            <td>
                              <div className="row" style={{ gap: 12 }}>
                                <span className="strong" style={{ minWidth: 28, textAlign: 'right' }}>{p.stock}</span>
                                <span className={`meter ${p.status === 'ok' ? '' : p.status}`} title={`Reorder point ${p.reorder_point}`}>
                                  <span style={{ width: `${(p.stock / max) * 100}%` }} />
                                  <i style={{ left: `${(p.reorder_point / max) * 100}%` }} />
                                </span>
                                <span className="muted" style={{ fontSize: 12 }}>{p.unit}s</span>
                              </div>
                            </td>
                            <td className="num">{p.reorder_point}</td>
                            <td className="num">{p.on_order ? <span className="strong">{p.on_order}</span> : <span className="muted">—</span>}</td>
                            {finance && <td className="num">{fmtMoney(p.unit_cost)}</td>}
                            {finance && <td className="num strong">{fmtMoney0(p.stock_value)}</td>}
                            <td><StockPill status={p.status} /></td>
                            <td className="right actions">
                              <RowMenu label={`Actions for ${p.name}`} items={[
                                { label: 'Record usage', icon: <Minus size={15} />, onClick: () => setStockFor({ product: p, type: 'usage' }), hidden: !can('stock:record_usage') },
                                { label: 'Record waste', icon: <Trash2 size={15} />, onClick: () => setStockFor({ product: p, type: 'waste' }), hidden: !can('stock:record_usage') },
                                { label: 'Stock count correction', icon: <ClipboardCheck size={15} />, onClick: () => setStockFor({ product: p, type: 'adjustment' }), hidden: !can('stock:adjust') },
                                { label: 'Edit product', icon: <Pencil size={15} />, onClick: () => setEditing(p), hidden: !can('products:manage') },
                                { label: 'Archive', icon: <Archive size={15} />, onClick: () => setArchiving(p), danger: true, hidden: !can('products:delete') },
                              ]} />
                            </td>
                          </tr>
                        );
                      })}
                      <FillerRows count={props.pageSize - slice.length} cols={cols.length} />
                    </>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination {...props} />
          </>
        )}
      </section>

      {editing && <ProductForm product={editing === 'new' ? null : editing} categories={categories} onClose={() => setEditing(null)} onSaved={reload} />}
      {stockFor && <StockModal {...stockFor} onClose={() => setStockFor(null)} onSaved={reload} />}
      {viewing && <ProductDrawer id={viewing} onClose={() => setViewing(null)} />}
      {archiving && (
        <ConfirmDialog title={`Archive ${archiving.name}?`} description="It will be hidden from lists and can't be added to new orders. Its stock history is kept."
          confirmLabel="Archive" tone="danger" onClose={() => setArchiving(null)}
          onConfirm={async () => {
            await api.del(`/products/${archiving.id}`);
            toast({ kind: 'success', title: `${archiving.name} archived` });
            reload();
          }} />
      )}
    </>
  );
}

// ── Product form ─────────────────────────────────────────────────────────────

function ProductForm({ product, categories, onClose, onSaved }: {
  product: Product | null; categories: string[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const { data: suppliers } = useApi<Supplier[]>('/suppliers');
  const [form, setForm] = useState({
    sku: product?.sku ?? '', name: product?.name ?? '', category: product?.category ?? categories[0] ?? '',
    unit: product?.unit ?? 'unit', reorder_point: product?.reorder_point ?? 5, reorder_qty: product?.reorder_qty ?? 10,
    unit_cost: product?.unit_cost ?? 0, price: product?.price ?? 0, supplier_id: product?.supplier_id ?? null as number | null,
    opening_stock: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value });
  const wholeNumber = (v: number) => (!Number.isInteger(v) || v < 0 ? 'Enter a whole number, 0 or more' : null);
  const v = useValidation(form, {
    name: (x) => (x.trim().length < 2 ? 'Enter a product name' : null),
    sku: (x) => (x.trim().length < 2 ? 'Enter a SKU (at least 2 characters)' : null),
    category: (x) => (x.trim().length < 2 ? 'Enter a category' : null),
    unit: (x) => (!x.trim() ? 'Enter a unit, e.g. bag or case' : null),
    reorder_point: wholeNumber,
    reorder_qty: wholeNumber,
    unit_cost: (x) => (Number.isNaN(x) || x < 0 ? 'Cost can’t be negative' : null),
    opening_stock: wholeNumber,
  });

  const save = async () => {
    v.touchAll();
    if (!v.valid || busy) return;
    setBusy(true); setError(null);
    try {
      const { opening_stock, ...rest } = form;
      if (product) await api.patch(`/products/${product.id}`, rest);
      else await api.post('/products', { ...rest, opening_stock });
      toast({ kind: 'success', title: product ? 'Product updated' : 'Product added', body: form.name });
      onSaved(); onClose();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <Modal wide title={product ? 'Edit product' : 'Add product'} description={product ? product.sku : 'Stock can only change through the ledger, so new products start from an opening balance.'} onClose={onClose}
      footer={<><FootError error={error} /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" aria-busy={busy} disabled={busy} onClick={save}><span>Save product</span></button></>}>
      <form className="form-grid" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field className="span-2" label="Name" htmlFor="p-name" error={v.error('name')}>
          <input className="input" value={form.name} onChange={set('name')} autoFocus {...v.bind('name', 'p-name')} />
        </Field>
        <Field label="SKU" htmlFor="p-sku" error={v.error('sku')}>
          <input className="input" value={form.sku} onChange={set('sku')} {...v.bind('sku', 'p-sku')} />
        </Field>
        <Field label="Category" htmlFor="p-category" error={v.error('category')}>
          <input className="input" list="categories" value={form.category} onChange={set('category')} {...v.bind('category', 'p-category')} />
          <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Supplier" htmlFor="p-supplier">
          <select id="p-supplier" className="select" value={form.supplier_id ?? ''} onChange={(e) => setForm({ ...form, supplier_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">No supplier</option>
            {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Unit" htmlFor="p-unit" error={v.error('unit')}>
          <input className="input" value={form.unit} onChange={set('unit')} placeholder="bag, case, bottle…" {...v.bind('unit', 'p-unit')} />
        </Field>
        <Field label="Reorder point" htmlFor="p-rp" error={v.error('reorder_point')} hint="Flag as low at or below this.">
          <input className="input" type="number" inputMode="numeric" min={0} value={form.reorder_point} onChange={set('reorder_point')} {...v.bind('reorder_point', 'p-rp')} />
        </Field>
        <Field label="Reorder quantity" htmlFor="p-rq" error={v.error('reorder_qty')} hint="Typical batch to order.">
          <input className="input" type="number" inputMode="numeric" min={0} value={form.reorder_qty} onChange={set('reorder_qty')} {...v.bind('reorder_qty', 'p-rq')} />
        </Field>
        <Field label="Unit cost ($)" htmlFor="p-cost" error={v.error('unit_cost')}>
          <input className="input" type="number" inputMode="decimal" min={0} step="0.01" value={form.unit_cost} onChange={set('unit_cost')} {...v.bind('unit_cost', 'p-cost')} />
        </Field>
        {!product ? (
          <Field label="Opening stock" htmlFor="p-open" error={v.error('opening_stock')}>
            <input className="input" type="number" inputMode="numeric" min={0} value={form.opening_stock} onChange={set('opening_stock')} {...v.bind('opening_stock', 'p-open')} />
          </Field>
        ) : (
          <Field label="On hand" htmlFor="p-onhand" hint="Changes only through the stock ledger.">
            <div id="p-onhand" className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)' }}><span>{product.stock}</span><span className="lock-note" style={{ marginLeft: 'auto' }}><Lock size={11} /> ledger only</span></div>
          </Field>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ── Usage / waste / count correction ────────────────────────────────────────

function StockModal({ product, type, onClose, onSaved }: {
  product: Product; type: 'usage' | 'waste' | 'adjustment'; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [qty, setQty] = useState(type === 'adjustment' ? product.stock : 1);
  const after = type === 'adjustment' ? qty : product.stock - qty;
  const titles = { usage: 'Record usage', waste: 'Record waste', adjustment: 'Stock count correction' };
  return (
    <ConfirmDialog title={titles[type]} description={`${product.name} · ${product.stock} ${product.unit}s on hand`}
      confirmLabel="Save to ledger" onClose={onClose} requireNote={type === 'adjustment'}
      notePlaceholder={type === 'adjustment' ? 'e.g. Weekly count, found damaged stock' : type === 'waste' ? 'e.g. Past best-before' : 'e.g. Catering order'}
      onConfirm={async (note) => {
        await api.post(`/products/${product.id}/stock`, { type, quantity: qty, note });
        toast({ kind: 'success', title: titles[type], body: `${product.name}: ${product.stock} → ${after}` });
        onSaved();
      }}>
      <div className="field">
        <label>{type === 'adjustment' ? 'Counted on hand' : 'Quantity'}</label>
        <input className="input" type="number" min={type === 'adjustment' ? 0 : 1} value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value)))} />
      </div>
      <div className="change-list">
        <div><span className="grow muted">Before</span><b className="num">{product.stock}</b></div>
        <div>
          <span className="grow muted">After</span>
          <b className="num" style={{ color: after < 0 ? 'var(--red-ink)' : undefined }}>{after}</b>
          {after < 0 && <span className="pill red">Not enough stock</span>}
        </div>
      </div>
    </ConfirmDialog>
  );
}

// ── Product drawer with ledger ───────────────────────────────────────────────

const MOVE_LABEL: Record<Movement['type'], string> = {
  opening: 'Opening balance', po_receipt: 'Received', usage: 'Used', waste: 'Wasted', adjustment: 'Count correction',
};

function ProductDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { can } = useAuth();
  const { data } = useApi<Product & { movements: Movement[] }>(`/products/${id}`);
  return (
    <Drawer onClose={onClose} label={data ? data.name : "Loading"} header={data ? (
      <>
        <div className="row" style={{ gap: 10 }}><StockPill status={data.status} /><span className="muted num" style={{ fontSize: 12 }}>{data.sku}</span></div>
        <h2 className="section-title" style={{ marginTop: 10 }}>{data.name}</h2>
        <p className="section-sub">{data.category} · {data.supplier_name ?? 'No supplier'}</p>
      </>
    ) : <div className="skeleton" style={{ height: 60 }} />}>
      {data && (
        <>
          <div className="kpis" style={{ gridTemplateColumns: can('finance:view') ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)' }}>
            <div className="kpi"><span className="label">On hand</span><div className="kpi-value num">{data.stock} <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{data.unit}s</span></div></div>
            <div className="kpi"><span className="label">Reorder at</span><div className="kpi-value num">{data.reorder_point}</div></div>
            {can('finance:view') && <div className="kpi"><span className="label">Avg. cost</span><div className="kpi-value num">{fmtMoney(data.unit_cost)}</div></div>}
          </div>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 30, marginBottom: 4 }}>Stock ledger</h3>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Append-only. The on-hand number is always the sum of these entries.</p>
          <div className="list">
            {data.movements.map((m) => (
              <div key={m.id} className="list-row">
                <span className="glyph" style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: m.quantity > 0 ? 'var(--green-soft)' : m.type === 'waste' ? 'var(--red-soft)' : 'var(--surface-2)', color: m.quantity > 0 ? 'var(--green-ink)' : m.type === 'waste' ? 'var(--red-ink)' : 'var(--ink-2)' }}>
                  {m.quantity > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                </span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{MOVE_LABEL[m.type]}{m.po_number && <span className="muted"> · {m.po_number}</span>}</div>
                  <div className="meta ellipsis">{fmtDateTime(m.created_at)}{m.user_name && ` · ${m.user_name}`}{m.note && m.note !== m.po_number && ` · ${m.note}`}</div>
                </div>
                <div className="right">
                  <div className="num" style={{ fontWeight: 600, color: m.quantity > 0 ? 'var(--green-ink)' : 'var(--ink)' }}>{m.quantity > 0 ? '+' : ''}{m.quantity}</div>
                  <div className="meta num">bal {m.balance_after}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}
