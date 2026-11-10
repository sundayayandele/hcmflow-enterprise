import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard,
  Users,
  Wallet,
  Layers,
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  Search,
  Bell,
  ChevronDown,
  Plus,
  Upload,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Download,
  LogOut,
  Menu,
  AlertCircle,
  Settings2,
  X,
} from 'lucide-react';
import { demoEmployees, capabilities } from './demo';
import './style.css';
import EnrichmentHub from './EnrichmentHub';
import PayslipPortal from './PayslipPortal';

type Employee = (typeof demoEmployees)[number];
type Run = {
  id: string;
  state: string;
  maker: string;
  snapshot: {
    simulation: boolean;
    calendar: { name: string; start: string; end: string; pay_date: string };
    totals: Record<string, string>;
    results: {
      employee_code: string;
      gross: string;
      deductions: string;
      net: string;
      employee_id: string;
    }[];
    checksum: string;
  };
};
type Config = {
  calendars: Record<string, string>[];
  elements: Record<string, string>[];
  rules: Record<string, string>[];
};
const DEMO = import.meta.env.VITE_DEMO === 'true';
const money = (v: string | number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(Number(v));
function App() {
  const [page, setPage] = useState('Overview'),
    [token, setToken] = useState(''),
    [user, setUser] = useState<{ tenant_name: string; roles: string[]; sub: string } | null>(null),
    [employees, setEmployees] = useState<Employee[]>(DEMO ? demoEmployees : []),
    [runs, setRuns] = useState<Run[]>([]),
    [config, setConfig] = useState<Config>({ calendars: [], elements: [], rules: [] }),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(''),
    [search, setSearch] = useState(''),
    [mobile, setMobile] = useState(false),
    [batch, setBatch] = useState<{
      id: string;
      errors: { row: number; field: string; reason: string }[];
      count: number;
    } | null>(null);
  const [demoRole, setDemoRole] = useState('payroll');
  const roles = DEMO ? [demoRole] : user?.roles || [];
  const can = (...r: string[]) => roles.some((x) => r.includes(x));
  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch('/api/' + path, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        Authorization: 'Bearer ' + token,
        ...options.headers,
      },
    });
    if (!response.ok) {
      const e = await response.json().catch(() => ({ detail: 'Service unavailable' }));
      if (response.status === 401) {
        setToken('');
        setUser(null);
      }
      throw Error(typeof e.detail === 'string' ? e.detail : 'Check the form values and try again');
    }
    return response;
  }
  async function refresh() {
    const payrollAccess = user?.roles.some((r) =>
      ['admin', 'payroll', 'approver', 'auditor'].includes(r),
    );
    const [e, r, c] = await Promise.all([
      user?.roles.some((r) =>
        ['admin', 'hr', 'payroll', 'approver', 'auditor', 'employee'].includes(r),
      )
        ? api('workforce/employees').then((r) => r.json())
        : Promise.resolve([]),
      payrollAccess ? api('payroll/runs').then((r) => r.json()) : Promise.resolve([]),
      payrollAccess
        ? api('payroll/config').then((r) => r.json())
        : Promise.resolve({ calendars: [], elements: [], rules: [] }),
    ]);
    setEmployees(e);
    setRuns(r);
    setConfig(c);
  }
  useEffect(() => {
    if (token) refresh().catch((e) => setNotice(e.message));
  }, [token]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await action(async () => {
      const r = await fetch('/api/identity/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.detail || 'Sign in failed');
      setToken(j.access_token);
      setUser(j.user);
    });
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData);
    await action(async () => {
      if (modal === 'employee') {
        if (DEMO) {
          if (employees.some((x) => x.employee_code === data.employee_code))
            throw Error('Employee code already exists');
          setEmployees([
            ...employees,
            { ...data, id: crypto.randomUUID(), source: 'core_hr', version: 1 } as Employee,
          ]);
        } else await api('workforce/employees', { method: 'POST', body: JSON.stringify(data) });
      } else if (modal === 'calendar' || modal === 'element' || modal === 'rule') {
        if (
          modal === 'calendar' &&
          (String(data.start) > String(data.end) ||
            String(data.cutoff) > String(data.pay_date) ||
            String(data.end) > String(data.pay_date))
        )
          throw Error('Invalid calendar date order');
        if (modal !== 'calendar' && String(data.effective_from) > String(data.effective_to))
          throw Error('Invalid effective dates');
        if (DEMO) {
          const key =
            modal === 'calendar' ? 'calendars' : modal === 'element' ? 'elements' : 'rules';
          setConfig({
            ...config,
            [key]: [...config[key], { ...data, id: crypto.randomUUID() } as Record<string, string>],
          });
        } else
          await api(
            'payroll/' +
              (modal === 'calendar' ? 'calendars' : modal === 'element' ? 'elements' : 'rules'),
            { method: 'POST', body: JSON.stringify(data) },
          );
      } else if (modal === 'run') {
        const calendar = config.calendars.find((c) => c.id === data.calendar_id);
        if (!calendar) throw Error('Choose a calendar');
        const selectedElements = formData.getAll('element_ids').map(String);
        const bases = Object.fromEntries(
          employees.map((e) => [e.id, String(formData.get('base:' + e.id) || e.monthly_gross)]),
        );
        if (DEMO) {
          const rule = config.rules.find((r) => r.id === data.rule_id);
          if (!rule) throw Error('Choose a synthetic rule');
          if (calendar.end < rule.effective_from || calendar.end > rule.effective_to)
            throw Error('Rule does not cover this period');
          if (employees.some((e) => e.effective_from > calendar.start))
            throw Error('Mid-period employment requires reviewed proration');
          if (
            config.elements.some(
              (e) =>
                selectedElements.includes(e.id) &&
                (calendar.end < e.effective_from || calendar.end > e.effective_to),
            )
          )
            throw Error('Pay element is not effective for this period');
          const results = employees.map((e) => {
            const base = Number(bases[e.id]);
            const amounts = config.elements
              .filter((x) => selectedElements.includes(x.id))
              .map((x) => ({
                kind: x.kind,
                amount:
                  Math.round(
                    (x.method === 'fixed' ? Number(x.value) : (base * Number(x.value)) / 100) * 100,
                  ) / 100,
              }));
            const gross =
              base + amounts.filter((x) => x.kind === 'earning').reduce((s, x) => s + x.amount, 0);
            const deductions =
              Math.round(gross * Number(rule.synthetic_tax_percent)) / 100 +
              Math.round(gross * Number(rule.synthetic_pension_percent)) / 100 +
              amounts.filter((x) => x.kind === 'deduction').reduce((s, x) => s + x.amount, 0);
            const reimbursement = amounts
              .filter((x) => x.kind === 'reimbursement')
              .reduce((s, x) => s + x.amount, 0);
            if (gross - deductions + reimbursement < 0)
              throw Error('Negative net pay; resolve input deductions');
            return {
              employee_id: e.id,
              employee_code: e.employee_code,
              gross: gross.toFixed(2),
              deductions: deductions.toFixed(2),
              net: (gross - deductions + reimbursement).toFixed(2),
            };
          });
          setRuns([
            ...runs,
            {
              id: crypto.randomUUID(),
              maker: 'demo-payroll',
              state: 'preview',
              snapshot: {
                simulation: true,
                calendar: calendar as Run['snapshot']['calendar'],
                results,
                checksum: 'browser-demo-' + crypto.randomUUID(),
                totals: Object.fromEntries(
                  ['gross', 'deductions', 'net'].map((k) => [
                    k,
                    results.reduce((s, r) => s + Number(r[k as 'gross']), 0).toFixed(2),
                  ]),
                ),
              },
            },
          ]);
        } else
          await api('payroll/runs', {
            method: 'POST',
            body: JSON.stringify({
              calendar_id: data.calendar_id,
              rule_id: data.rule_id,
              element_ids: selectedElements,
              employee_bases: bases,
              idempotency_key: crypto.randomUUID(),
            }),
          });
      }
      if (!DEMO) await refresh();
      setModal('');
      setNotice(
        DEMO
          ? 'Demo updated in this browser session. Refresh resets all changes.'
          : 'Saved successfully.',
      );
    });
  }
  async function previewImport(file: File) {
    await action(async () => {
      if (DEMO)
        throw Error(
          'File import requires the connected staging backend. Use Add employee to explore this demo.',
        );
      const form = new FormData();
      form.append('file', file);
      const result = await api('workforce/imports/preview', { method: 'POST', body: form }).then(
        (r) => r.json(),
      );
      setBatch(result);
      setModal('import');
    });
  }
  async function approve(run: Run) {
    await action(async () => {
      if (DEMO) {
        if (demoRole !== 'approver')
          throw Error('Switch to the independent reviewer to approve this preview.');
        setRuns(runs.map((r) => (r.id === run.id ? { ...r, state: 'approved_simulation' } : r)));
      } else {
        await api('payroll/runs/' + run.id + '/approve', { method: 'POST' });
        await refresh();
      }
      setNotice('Simulation approved. Production finalization remains blocked.');
    });
  }
  async function download(run: Run, kind: string) {
    await action(async () => {
      let blob: Blob;
      if (DEMO) {
        if (run.state !== 'approved_simulation')
          throw Error('Independent review is required before export');
        if (['gtbank', 'statutory'].includes(kind))
          throw Error('Blocked pending specifications and specialist validation');
        blob = new Blob(
          [
            'SIMULATION — NOT FOR PAYMENT\nemployee_code,gross_NGN,deductions_NGN,net_NGN\n' +
              run.snapshot.results
                .map((r) => [r.employee_code, r.gross, r.deductions, r.net].join(','))
                .join('\n'),
          ],
          { type: 'text/csv' },
        );
      } else blob = await api(`payroll/runs/${run.id}/exports/${kind}`).then((r) => r.blob());
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `simulation-${kind}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }
  const gross = employees.reduce((s, e) => s + Number(e.monthly_gross), 0);
  const nav = [
    ['Overview', LayoutDashboard],
    ['People', Users],
    ['Payroll', Wallet],
    ['Payslips', Download],
    ['Configuration', Settings2],
    ['Enrichment hub', FileCheck2],
    ['Capability map', Layers],
    ['Readiness', ShieldCheck],
  ] as const;
  const last = runs.at(-1);
  if (!DEMO && !token)
    return (
      <div className="login">
        <div className="login-brand">
          <span className="brand-icon">h</span>
          <h1>
            People first.
            <br />
            Payroll with confidence.
          </h1>
          <p>A connected workspace for your people and payroll.</p>
          <span>NIGERIA PILOT · HCMFLOW ENTERPRISE</span>
        </div>
        <form onSubmit={login} className="login-form">
          <p className="eyebrow">WELCOME TO HCMFLOW</p>
          <h2>Sign in to your workspace</h2>
          <p>Use the credentials provisioned by your administrator.</p>
          <label>
            Tenant slug
            <input name="tenant" required autoComplete="organization" />
          </label>
          <label>
            Email
            <input name="email" type="email" required autoComplete="username" />
          </label>
          <label>
            Password
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          {notice && (
            <div role="alert" className="notice">
              {notice}
            </div>
          )}
          <button className="primary" disabled={busy}>
            Sign in <ArrowRight size={16} />
          </button>
          <small>Staging payroll uses synthetic rules. Not for live payments.</small>
        </form>
      </div>
    );
  return (
    <div className="app">
      <aside className={mobile ? 'sidebar open' : 'sidebar'}>
        <a className="brand" href="#">
          <span className="brand-icon">h</span>hcmflow<span className="brand-dot">•</span>
        </a>
        <div className="workspace">
          <span className="workspace-avatar">LP</span>
          <div>
            <strong>{DEMO ? 'Lagos Pilot' : user?.tenant_name}</strong>
            <small>Enterprise workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? 'active' : ''}
              onClick={() => {
                setPage(label);
                setMobile(false);
                setSearch('');
              }}
            >
              <Icon size={19} />
              {label}
              {label === 'Payroll' && <span className="nav-badge">NG</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="pilot-card">
            <span className="pilot-spark">✧</span>
            <strong>Built for your next chapter</strong>
            <p>
              Your people. Your processes.
              <br />
              One connected workspace.
            </p>
            <button onClick={() => setPage('Capability map')}>
              Explore the roadmap <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className="profile"
            onClick={() => {
              if (DEMO) setDemoRole(demoRole === 'payroll' ? 'approver' : 'payroll');
              else {
                setToken('');
                setUser(null);
              }
            }}
          >
            <span className="avatar">{DEMO ? 'DE' : 'ME'}</span>
            <div>
              <strong>
                {DEMO ? (demoRole === 'payroll' ? 'Demo operator' : 'Demo reviewer') : 'My account'}
              </strong>
              <small>{DEMO ? 'Click to switch role' : 'Sign out of workspace'}</small>
            </div>
            {DEMO ? <ChevronDown size={15} /> : <LogOut size={15} />}
          </button>
        </div>
      </aside>
      <div className="shell">
        <header>
          <div className="breadcrumb">
            <button
              className="mobile-toggle"
              aria-label="Toggle navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <span>/</span>
            <strong>{page}</strong>
          </div>
          <div className="header-right">
            <span className="region">
              <i /> Lagos, Nigeria · NGN
            </span>
            <button
              title="No notifications configured"
              onClick={() =>
                setNotice('Notifications will be enabled with workflow delivery in Phase 1.')
              }
              aria-label="Notifications"
            >
              <Bell size={19} />
            </button>
            <span className="avatar small">DE</span>
          </div>
        </header>
        <div className="demo-banner">
          <span>
            <span className="live-dot" />
            {DEMO ? 'INTERACTIVE DEMO' : 'STAGING WORKSPACE'}
          </span>
          <p>
            {DEMO
              ? 'Synthetic people and payroll. Changes reset on refresh.'
              : 'Synthetic payroll only. No live employee or banking data.'}
          </p>
          <button onClick={() => setPage('Readiness')}>
            View release gates <ArrowRight size={13} />
          </button>
        </div>
        <main>
          {notice && (
            <div className="notice" role="status">
              <AlertCircle size={16} />
              {notice}
              <button aria-label="Dismiss message" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {page === 'Overview' ? 'YOUR PEOPLE, AT A GLANCE' : 'HCMFLOW ENTERPRISE'}
              </p>
              <h1>
                {page === 'Payslips'
                  ? 'Your payslips, always within reach.'
                  : page === 'Enrichment hub'
                    ? 'Eight areas. One connected workspace.'
                    : page === 'Overview'
                      ? 'A good day starts with your people.'
                      : page === 'People'
                        ? 'Your people. All in one place.'
                        : page === 'Payroll'
                          ? 'Payroll, with a clear view.'
                          : page === 'Configuration'
                            ? 'Make payroll work your way.'
                            : page === 'Readiness'
                              ? 'A responsible path to launch.'
                              : 'Room to grow. A plan to get there.'}
              </h1>
              <p>
                {page === 'Overview'
                  ? 'Here’s what’s happening across your Lagos pilot workspace.'
                  : page === 'People'
                    ? 'A trusted employee record, wherever your data comes from.'
                    : page === 'Payroll'
                      ? 'Prepare, preview and independently review each pay period.'
                      : page === 'Configuration'
                        ? 'Configure calendars, pay elements and synthetic rule versions.'
                        : 'A focused first release, with clear ownership of what comes next.'}
              </p>
            </div>
            {page === 'Overview' ? (
              <button className="secondary" onClick={() => setPage('Payroll')}>
                View payroll <ArrowUpRight size={16} />
              </button>
            ) : page === 'People' && can('admin', 'hr', 'payroll') ? (
              <button
                className="primary"
                disabled={busy || (!DEMO && !can('admin', 'hr'))}
                onClick={() => setModal('employee')}
              >
                <Plus size={17} />
                Add employee
              </button>
            ) : null}
          </div>
          {page === 'Overview' && (
            <>
              <section className="stats">
                <Stat
                  icon={<Users size={19} />}
                  title="People in your workspace"
                  value={String(employees.length).padStart(2, '0')}
                  detail="Across Core HR and imported records"
                />
                <Stat
                  icon={<Wallet size={19} />}
                  title="Monthly base payroll"
                  value={money(gross)}
                  detail="NGN · before adjustments and deductions"
                />
                <Stat
                  icon={<FileCheck2 size={19} />}
                  title="Awaiting payroll review"
                  value={String(runs.filter((r) => r.state === 'preview').length).padStart(2, '0')}
                  detail="Independent checker approval required"
                />
                <Stat
                  icon={<ShieldCheck size={19} />}
                  title="Production readiness"
                  value="In review"
                  detail="Specialist validation outstanding"
                  amber
                />
              </section>
              <section className="overview-grid">
                <div className="panel payroll-feature">
                  <div className="panel-top">
                    <span className="pill mint">NIGERIA PAYROLL</span>
                    <span className="pill outline">Lagos pilot</span>
                  </div>
                  <h2>
                    From preparation
                    <br />
                    to peace of mind.
                  </h2>
                  <p>
                    One clear workflow. Every input traceable.
                    <br />
                    Every payroll independently reviewed.
                  </p>
                  <div className="payroll-progress">
                    {['Prepare', 'Preview', 'Review', 'Finalize'].map((s, i) => (
                      <div key={s} className={i < 2 ? 'done' : ''}>
                        <span>{i === 0 ? <CheckCircle2 size={15} /> : i + 1}</span>
                        <small>{s}</small>
                      </div>
                    ))}
                  </div>
                  <div className="feature-bottom">
                    <span>
                      <i /> {last ? 'Latest preview ready' : 'Ready for your first preview'}
                    </span>
                    <button onClick={() => setPage('Payroll')}>
                      Open payroll <ArrowRight size={17} />
                    </button>
                  </div>
                </div>
                <div className="panel attention">
                  <div className="panel-title">
                    <h3>On your radar</h3>
                    <span className="count">3</span>
                  </div>
                  <Radar
                    icon={<ShieldCheck size={18} />}
                    title="Statutory rules need validation"
                    text="Nigerian tax and payroll specialist sign-off."
                    label="Release gate"
                    onClick={() => setPage('Readiness')}
                  />
                  <Radar
                    icon={<FileCheck2 size={18} />}
                    title="GTBank specification pending"
                    text="Confirm channel, format and control totals."
                    label="Release gate"
                    onClick={() => setPage('Readiness')}
                  />
                  <Radar
                    icon={<Users size={18} />}
                    title="Bring your people together"
                    text="Core HR, imports, or a mix of both."
                    label="Get started"
                    onClick={() => setPage('People')}
                  />
                </div>
              </section>
              <section className="panel">
                <div className="panel-title">
                  <div>
                    <h3>Your workforce at a glance</h3>
                    <p>A connected view of your employee records.</p>
                  </div>
                  <button className="text-button" onClick={() => setPage('People')}>
                    View all people <ArrowRight size={15} />
                  </button>
                </div>
                <PeopleTable employees={employees.slice(0, 4)} />
              </section>
              <div className="bottom-note">
                <ShieldCheck size={16} />
                Private by design. Tenant-scoped access, protected records and an auditable payroll
                workflow.
              </div>
            </>
          )}
          {page === 'People' && (
            <section className="panel">
              <div className="panel-title">
                <div>
                  <h3>
                    Employee directory <span className="count">{employees.length}</span>
                  </h3>
                  <p>Source ownership is preserved for every employee.</p>
                </div>
                <div className="toolbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search employees"
                      placeholder="Search people…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <label className="secondary upload">
                    <Upload size={16} />
                    Import records
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xml,.json"
                      aria-label="Import employee file"
                      onChange={(e) => {
                        if (e.target.files?.[0]) previewImport(e.target.files[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
              <PeopleTable
                employees={employees.filter((e) =>
                  (e.full_name + ' ' + e.employee_code + ' ' + e.department)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )}
              />
              <div className="table-foot">
                CSV, XLSX, XML & JSON · Validate before commit · No silent source overwrites
              </div>
            </section>
          )}
          {page === 'Payroll' && (
            <>
              <div className="inline-warning">
                <ShieldCheck size={20} />
                <div>
                  <strong>Preview safely. Validate before production.</strong>
                  <p>
                    All calculations are synthetic demonstrations. Finalization, statutory schedules
                    and GTBank files are blocked.
                  </p>
                </div>
              </div>
              <div className="section-heading">
                <h3>
                  Pay runs <span className="count">{runs.length}</span>
                </h3>
                <button
                  className="primary"
                  disabled={busy || !can('admin', 'payroll')}
                  onClick={() => setModal('run')}
                >
                  <Plus size={16} />
                  New preview
                </button>
              </div>
              {runs.length === 0 ? (
                <div className="panel empty">
                  <Wallet size={38} />
                  <h3>Your first pay run starts here.</h3>
                  <p>
                    Add a calendar and synthetic rule in Configuration,
                    <br />
                    then preview your employee pay inputs.
                  </p>
                  <button className="secondary" onClick={() => setPage('Configuration')}>
                    Set up payroll <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                runs.map((run) => (
                  <section className="panel run" key={run.id}>
                    <div className="panel-title">
                      <div>
                        <h3>{run.snapshot.calendar.name}</h3>
                        <p>
                          {run.snapshot.calendar.start} — {run.snapshot.calendar.end} · NGN ·
                          Synthetic
                        </p>
                      </div>
                      <span className={'pill ' + (run.state === 'preview' ? 'amber' : 'mint')}>
                        {run.state === 'preview'
                          ? 'Awaiting independent review'
                          : 'Simulation approved'}
                      </span>
                    </div>
                    <div className="run-totals">
                      {['gross', 'deductions', 'net'].map((k) => (
                        <div key={k}>
                          <small>
                            {k === 'net' ? 'Net pay' : k === 'gross' ? 'Gross pay' : 'Deductions'}
                          </small>
                          <strong>{money(run.snapshot.totals[k])}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Employee</th>
                            <th>Gross pay</th>
                            <th>Deductions</th>
                            <th>Net pay</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.snapshot.results.map((r) => (
                            <tr key={r.employee_id}>
                              <td>{r.employee_code}</td>
                              <td>{money(r.gross)}</td>
                              <td>{money(r.deductions)}</td>
                              <td>{money(r.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="run-actions">
                      <small>Immutable snapshot · {run.snapshot.checksum.slice(0, 18)}…</small>
                      {run.state === 'preview' ? (
                        <button
                          className="primary"
                          disabled={busy || !can('approver')}
                          onClick={() => approve(run)}
                        >
                          Approve simulation <CheckCircle2 size={16} />
                        </button>
                      ) : (
                        <div className="toolbar">
                          {['register', 'payslips', ...(!DEMO ? ['journal'] : [])].map((k) => (
                            <button className="secondary" key={k} onClick={() => download(run, k)}>
                              <Download size={14} />
                              {k}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                ))
              )}
            </>
          )}
          {page === 'Configuration' && (
            <>
              <div className="config-grid">
                {(
                  [
                    [
                      'Pay calendars',
                      'calendar',
                      'calendars',
                      'Define periods, cutoffs and pay dates.',
                    ],
                    ['Pay elements', 'element', 'elements', 'Fixed or percentage-of-base amounts.'],
                    [
                      'Synthetic rules',
                      'rule',
                      'rules',
                      'Versioned and effective-dated. Never statutory.',
                    ],
                  ] as const
                ).map(([title, mode, key, description]) => (
                  <section className="panel config-card" key={mode}>
                    <span className="tile-icon">
                      <Settings2 size={21} />
                    </span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                    {config[key].length ? (
                      config[key].map((c) => (
                        <div className="config-item" key={c.id}>
                          <strong>{c.name || c.label || c.version}</strong>
                          <small>{c.frequency || c.kind || 'Unapproved synthetic example'}</small>
                        </div>
                      ))
                    ) : (
                      <div className="config-item muted">No configuration yet</div>
                    )}
                    <button
                      className="secondary"
                      disabled={!can('admin', 'payroll')}
                      onClick={() => setModal(mode)}
                    >
                      <Plus size={15} />
                      Add {mode}
                    </button>
                  </section>
                ))}
              </div>
              <div className="inline-warning">
                <AlertCircle size={20} />
                <p>
                  Preview currently uses explicitly confirmed period base amounts. UI defaults to
                  monthly salary and monthly calendars. Select configured pay elements when creating
                  a preview. Complex formulas follow in a later iteration. No Nigerian tax or
                  pension rate is prefilled.
                </p>
              </div>
            </>
          )}
          {page === 'Payslips' && <PayslipPortal demo={DEMO} api={api} runs={runs} />}
          <div hidden={page !== 'Enrichment hub'}>
            <EnrichmentHub
              demo={DEMO}
              roles={
                DEMO
                  ? demoRole === 'payroll'
                    ? ['admin', 'hr', 'payroll', 'finance', 'recruiter', 'talent']
                    : ['hr', 'approver', 'finance', 'talent']
                  : roles
              }
              actor={DEMO ? (demoRole === 'payroll' ? 'demo-payroll' : 'demo-reviewer') : user!.sub}
              employees={employees}
              runs={runs}
              api={api}
              onEmployeeAmended={(e) =>
                setEmployees((old) => old.map((p) => (p.id === e.id ? { ...p, ...e } : p)))
              }
            />
          </div>
          {page === 'Capability map' && (
            <>
              <div className="roadmap-intro">
                <span className="pill mint">FOCUSED NOW. EXPANDABLE BY DESIGN.</span>
                <p>
                  HCMFlow’s full solution family is mapped below. Each phase needs its own
                  acceptance criteria and review; listed capabilities are not a claim of delivery.
                </p>
              </div>
              <div className="capability-grid">
                {capabilities.map(([title, phase, text], i) => (
                  <section className="panel capability" key={title}>
                    <span className="cap-number">{String(i + 1).padStart(2, '0')}</span>
                    <span className={'pill ' + (i < 2 ? 'mint' : 'outline')}>{phase}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </section>
                ))}
              </div>
            </>
          )}
          {page === 'Readiness' && (
            <>
              <div className="inline-warning">
                <ShieldCheck size={24} />
                <div>
                  <strong>Production payroll is disabled in this release.</strong>
                  <p>
                    The supplied review form contains no completed approvals. Expert validation
                    remains outstanding.
                  </p>
                </div>
              </div>
              <section className="panel readiness">
                {[
                  [
                    '01',
                    'Nigeria statutory pack',
                    'Tax adviser + payroll accountant',
                    'Current authorities, effective dates, eligibility, bases, reliefs, rounding, annualization, and independently verified scenarios.',
                  ],
                  [
                    '02',
                    'HR and operating acceptance',
                    'HR lead + product owner',
                    'Employee source reconciliation, joiners/leavers, calendars, proration, corrections and parallel-run acceptance.',
                  ],
                  [
                    '03',
                    'GTBank payment integration',
                    'Customer bank contact + finance',
                    'Current corporate channel specification, synthetic acceptance files, control totals, duplicate prevention and transmission controls.',
                  ],
                  [
                    '04',
                    'Security and recovery',
                    'Engineering + operations',
                    'OIDC/MFA, scoped permissions, key rotation, off-site backups, restore rehearsal and production host confirmation.',
                  ],
                ].map(([n, title, owner, text]) => (
                  <div className="gate" key={n}>
                    <span>{n}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                      <small>Owner: {owner}</small>
                    </div>
                    <span className="pill amber">Outstanding</span>
                  </div>
                ))}
              </section>
              <p className="bottom-note">
                GitHub runners validate a temporary staging stack. They do not provide a persistent
                application or database.
              </p>
            </>
          )}
        </main>
        <footer>
          <span>© {new Date().getFullYear()} HCMFlow Enterprise</span>
          <span>People at the heart of every process.</span>
          <span className="footer-tag">PILOT / v0.1</span>
        </footer>
      </div>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal('')}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={'Configure ' + modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-title">
              <h2>
                {modal === 'employee'
                  ? 'Add employee'
                  : modal === 'run'
                    ? 'Create a payroll preview'
                    : modal === 'import'
                      ? 'Import validation'
                      : 'Add ' + modal}
              </h2>
              <button aria-label="Close dialog" onClick={() => setModal('')}>
                <X size={21} />
              </button>
            </div>
            {notice && (
              <p className="notice" role="alert">
                {notice}
              </p>
            )}
            {modal === 'import' && batch ? (
              <>
                <p>
                  {batch.count} rows · {batch.errors.length} validation errors
                </p>
                {batch.errors.map((e, i) => (
                  <p key={i}>
                    Row {e.row} · {e.field}: {e.reason}
                  </p>
                ))}
                <button
                  className="primary"
                  disabled={busy || batch.errors.length > 0}
                  onClick={() =>
                    action(async () => {
                      await api(`workforce/imports/${batch.id}/commit`, { method: 'POST' });
                      await refresh();
                      setModal('');
                      setNotice('Import committed atomically.');
                    })
                  }
                >
                  Commit validated import
                </button>
              </>
            ) : (
              <form onSubmit={submit}>
                {modal === 'employee' && (
                  <>
                    <Field label="Employee code" name="employee_code" pattern="[A-Za-z0-9_-]+" />
                    <Field label="Full name" name="full_name" />
                    <Field label="Email" name="email" type="email" />
                    <Field label="Department" name="department" />
                    <Field
                      label="Monthly gross (NGN)"
                      name="monthly_gross"
                      type="number"
                      min="0"
                      step="0.01"
                    />
                    <Field label="Effective from" name="effective_from" type="date" />
                  </>
                )}
                {modal === 'calendar' && (
                  <>
                    <Field label="Calendar name" name="name" />
                    <label>
                      Frequency
                      <select name="frequency">
                        <option value="monthly">Monthly</option>
                        <option value="weekly">Weekly</option>
                        <option value="fortnightly">Fortnightly</option>
                        <option value="semi_monthly">Semi-monthly</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                    {['start', 'end', 'cutoff', 'pay_date'].map((n) => (
                      <Field key={n} label={n.replace('_', ' ')} name={n} type="date" />
                    ))}
                  </>
                )}
                {modal === 'element' && (
                  <>
                    <Field label="Code (uppercase)" name="code" pattern="[A-Z][A-Z0-9_]+" />
                    <Field label="Payslip label" name="label" />
                    <label>
                      Type
                      <select name="kind">
                        {['earning', 'deduction', 'employer_cost', 'reimbursement'].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Calculation
                      <select name="method">
                        <option value="fixed">Fixed amount</option>
                        <option value="percent_base">Percentage of period base</option>
                      </select>
                    </label>
                    <Field label="Value" name="value" type="number" min="0" step="0.0001" />
                    {['effective_from', 'effective_to'].map((n) => (
                      <Field key={n} label={n.replace('_', ' ')} name={n} type="date" />
                    ))}
                    <Field label="Debit GL account" name="debit_account" />
                    <Field label="Credit GL account" name="credit_account" />
                  </>
                )}
                {modal === 'rule' && (
                  <>
                    <p className="form-note">
                      Synthetic demonstration only. Enter invented test values, never assume
                      Nigerian statutory rates.
                    </p>
                    <Field label="Version" name="version" />
                    <Field label="Synthetic source / test reference" name="source" minLength={5} />
                    {['effective_from', 'effective_to'].map((n) => (
                      <Field key={n} label={n.replace('_', ' ')} name={n} type="date" />
                    ))}
                    <Field
                      label="Invented test tax percentage"
                      name="synthetic_tax_percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.0001"
                    />
                    <Field
                      label="Invented test pension percentage"
                      name="synthetic_pension_percent"
                      type="number"
                      min="0"
                      max="100"
                      step="0.0001"
                    />
                  </>
                )}
                {modal === 'run' && (
                  <>
                    <p className="form-note">
                      Monthly preview uses each employee’s monthly gross as the explicit period
                      base. No proration. Select effective pay elements and confirm each employee’s
                      period base below.
                    </p>
                    <label>
                      Monthly calendar
                      <select name="calendar_id" required>
                        <option value="">Select a monthly calendar</option>
                        {config.calendars
                          .filter((c) => c.frequency === 'monthly')
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Synthetic rule version
                      <select name="rule_id" required>
                        <option value="">Select a synthetic rule</option>
                        {config.rules.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.version}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Pay elements (optional; hold Ctrl/Cmd to select multiple)
                      <select name="element_ids" multiple>
                        {config.elements.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label} · {c.kind}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {employees.length} employees · monthly reference total {money(gross)}
                    </p>
                    <div className="base-inputs">
                      {employees.map((e) => (
                        <Field
                          key={e.id}
                          label={e.full_name + ' · period base (NGN)'}
                          name={'base:' + e.id}
                          type="number"
                          min="0"
                          step="0.01"
                          defaultValue={e.monthly_gross}
                        />
                      ))}
                    </div>
                  </>
                )}
                <button className="primary" disabled={busy}>
                  {busy
                    ? 'Saving…'
                    : modal === 'run'
                      ? 'Confirm period inputs & preview'
                      : 'Save ' + modal}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <input required {...props} />
    </label>
  );
}
function Stat({
  icon,
  title,
  value,
  detail,
  amber = false,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  amber?: boolean;
}) {
  return (
    <div className="panel stat">
      <div>
        <span className={'stat-icon ' + (amber ? 'amber' : '')}>{icon}</span>
        <span className="stat-label">{title}</span>
      </div>
      <strong className={amber ? 'status-value' : ''}>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Radar({
  icon,
  title,
  text,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="radar" onClick={onClick}>
      <span className="radar-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
        <small>{label}</small>
      </div>
      <ArrowUpRight size={16} />
    </button>
  );
}
function PeopleTable({ employees }: { employees: Employee[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Department</th>
            <th>Data source</th>
            <th>Monthly gross</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e, i) => (
            <tr key={e.id}>
              <td>
                <div className="person">
                  <span className={'person-avatar color-' + (i % 4)}>
                    {e.full_name
                      .split(' ')
                      .map((x) => x[0])
                      .slice(0, 2)
                      .join('')}
                  </span>
                  <div>
                    <strong>{e.full_name}</strong>
                    <small>{e.employee_code}</small>
                  </div>
                </div>
              </td>
              <td>{e.department}</td>
              <td>
                <span className="source">
                  <i className={e.source === 'import' ? 'blue' : ''} />
                  {e.source === 'import' ? 'Imported' : 'Core HR'}
                </span>
              </td>
              <td className="money">{money(e.monthly_gross)}</td>
              <td>
                <span className="pill mint">
                  <i />
                  Effective record
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!employees.length && (
        <div className="empty small-empty">No employee records match this view.</div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
