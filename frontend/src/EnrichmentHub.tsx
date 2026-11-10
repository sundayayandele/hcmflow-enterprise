import { useEffect, useState } from 'react';
import {
  Plus,
  ArrowRight,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldCheck,
  FileCheck2,
} from 'lucide-react';

type Data = Record<string, unknown>;
type Person = {
  id: string;
  employee_code: string;
  full_name: string;
  email?: string;
  department?: string;
  monthly_gross?: string;
  effective_from?: string;
  source?: string;
  version?: number;
};
type Item = {
  id: string;
  kind: string;
  state: string;
  employee_id?: string;
  creator_id: string;
  version: number;
  data: Data;
};
type Props = {
  demo: boolean;
  roles: string[];
  actor: string;
  employees: Person[];
  runs: {
    id: string;
    snapshot: { totals: Record<string, string>; results: Data[]; calendar: { name: string } };
  }[];
  api: (path: string, options?: RequestInit) => Promise<Response>;
  onEmployeeAmended: (e: Person) => void;
};
const AREAS = [
  ['Payroll assurance', 'Rules, comparison & evidence'],
  ['People history', 'Effective-dated changes'],
  ['Daily HR', 'Leave, time & requests'],
  ['Employee lifecycle', 'Hiring, onboarding & exits'],
  ['Talent & learning', 'Goals and learning records'],
  ['Finance & benefits', 'Claims and enrollment requests'],
  ['Enterprise controls', 'Access policy & audit'],
  ['Insights & planning', 'Operational metrics & scenarios'],
];
const LABELS: Record<string, string> = {
  leave: 'Leave',
  time: 'Time entry',
  service: 'Service request',
  candidate: 'Candidate',
  onboarding: 'Onboarding',
  exit: 'Exit checklist',
  disciplinary: 'Restricted disciplinary case',
  goal: 'Goal',
  learning: 'Learning assignment',
  expense: 'Expense claim',
  benefit: 'Benefit request',
};
const READERS: Record<string, string[]> = {
  leave: ['admin', 'hr', 'approver'],
  time: ['admin', 'hr', 'approver'],
  service: ['admin', 'hr'],
  candidate: ['admin', 'hr', 'recruiter'],
  onboarding: ['admin', 'hr'],
  exit: ['admin', 'hr'],
  disciplinary: ['admin', 'hr'],
  goal: ['admin', 'hr', 'talent'],
  learning: ['admin', 'hr', 'talent'],
  expense: ['admin', 'finance', 'payroll', 'approver'],
  benefit: ['admin', 'hr', 'finance', 'approver'],
};
const NEXT: Record<string, Record<string, string[]>> = {
  leave: { submitted: ['approved', 'rejected'] },
  time: { submitted: ['approved', 'rejected'] },
  expense: { submitted: ['approved', 'rejected'] },
  benefit: { submitted: ['approved', 'rejected'] },
  candidate: {
    new: ['screening', 'rejected'],
    screening: ['interview', 'rejected'],
    interview: ['offer', 'rejected'],
    offer: ['hired', 'rejected'],
  },
  onboarding: { open: ['in_progress'], in_progress: ['completed'] },
  exit: { open: ['in_progress'], in_progress: ['completed'] },
  goal: { draft: ['active'], active: ['completed'] },
  learning: { assigned: ['completion_requested'], completion_requested: ['verified', 'assigned'] },
  service: { submitted: ['in_progress'], in_progress: ['resolved'] },
  disciplinary: { submitted: ['in_progress'], in_progress: ['resolved'] },
};
const KINDS: Record<number, string[]> = {
  2: ['leave', 'time', 'service'],
  3: ['candidate', 'onboarding', 'exit', 'disciplinary'],
  4: ['goal', 'learning'],
  5: ['expense', 'benefit'],
};
const INITIAL: Record<string, string> = {
  candidate: 'new',
  onboarding: 'open',
  exit: 'open',
  goal: 'draft',
  learning: 'assigned',
};
const str = (d: Data, k: string) => String(d[k] ?? '');
const ngn = (v: unknown) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
const title = (s: string) => s.replaceAll('_', ' ');
function seed(people: Person[]): Item[] {
  if (!people.length) return [];
  const id = people[0].id;
  return [
    {
      id: 'seed-goal',
      kind: 'goal',
      state: 'draft',
      employee_id: id,
      creator_id: 'demo-payroll',
      version: 1,
      data: {
        employee_id: id,
        title: 'Improve employee onboarding',
        due: '2026-12-31',
        success_measure: 'Complete the starter checklist within five days',
      },
    },
    {
      id: 'seed-learning',
      kind: 'learning',
      state: 'assigned',
      employee_id: id,
      creator_id: 'demo-payroll',
      version: 1,
      data: {
        employee_id: id,
        title: 'Data privacy induction',
        due: '2026-12-31',
        provider: 'Internal learning',
      },
    },
    {
      id: 'seed-expense',
      kind: 'expense',
      state: 'submitted',
      employee_id: id,
      creator_id: 'demo-payroll',
      version: 1,
      data: {
        employee_id: id,
        title: 'Synthetic training travel',
        amount: '35000.00',
        receipt_reference: 'DEMO-RECEIPT-001',
      },
    },
    {
      id: 'seed-onboard',
      kind: 'onboarding',
      state: 'open',
      employee_id: id,
      creator_id: 'demo-payroll',
      version: 1,
      data: {
        employee_id: id,
        title: 'New starter checklist',
        tasks: ['Acknowledge policies', 'Issue equipment'],
        completed_tasks: [],
      },
    },
    {
      id: 'seed-candidate',
      kind: 'candidate',
      state: 'new',
      creator_id: 'demo-payroll',
      version: 1,
      data: {
        title: 'Synthetic analyst candidate',
        email: 'candidate@example.invalid',
        role: 'Analyst',
      },
    },
  ];
}
export default function EnrichmentHub({
  demo,
  roles,
  actor,
  employees,
  runs,
  api,
  onEmployeeAmended,
}: Props) {
  const [area, setArea] = useState(0),
    [kind, setKind] = useState('leave'),
    [people, setPeople] = useState<Person[]>(employees),
    [items, setItems] = useState<Item[]>(demo ? seed(employees) : []),
    [balances, setBalances] = useState<Data[]>([]),
    [plans, setPlans] = useState<Data[]>([]),
    [rules, setRules] = useState<Data[]>([]),
    [policy, setPolicy] = useState<Data | null>(null),
    [events, setEvents] = useState<Data[]>([]),
    [insights, setInsights] = useState<Data | null>(null),
    [history, setHistory] = useState<Data | null>(null),
    [comparison, setComparison] = useState<Data | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [selectedPerson, setSelectedPerson] = useState(employees[0]?.id || '');
  const can = (...r: string[]) => roles.some((x) => r.includes(x));
  const privileged = (k: string) => can(...READERS[k]);
  const own = (r: Item) =>
    people.length === 1 && r.employee_id === people[0].id && !privileged(r.kind);
  const canCreate =
    can(...READERS[kind].filter((r) => r !== 'approver')) ||
    (['leave', 'time', 'expense', 'benefit', 'goal', 'service'].includes(kind) && can('employee'));
  async function json(path: string, options?: RequestInit) {
    return api(path, options).then((r) => r.json());
  }
  const post = (path: string, body: unknown) =>
    json(path, { method: 'POST', body: JSON.stringify(body) });
  async function refresh() {
    const tasks = [
      json('workforce/employees/lookup').then(setPeople),
      json('workplace/items').then(setItems),
      json('workplace/leave-balances').then(setBalances),
    ];
    if (can('admin', 'hr', 'finance', 'auditor'))
      tasks.push(json('workplace/plans').then(setPlans));
    if (can('admin', 'hr', 'finance', 'auditor', 'talent', 'recruiter'))
      tasks.push(json('workplace/insights').then(setInsights));
    if (can('admin', 'hr', 'auditor')) tasks.push(json('workplace/access-policy').then(setPolicy));
    if (can('admin', 'auditor', 'approver')) tasks.push(json('workplace/audit').then(setEvents));
    if (can('admin', 'payroll', 'approver', 'auditor'))
      tasks.push(json('payroll/rule-evidence').then(setRules));
    const results = await Promise.allSettled(tasks);
    const failed = results.find((r) => r.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  useEffect(() => {
    if (!demo) refresh().catch((e) => setMessage(e.message));
  }, []);
  useEffect(() => {
    if (!selectedPerson && people[0]) setSelectedPerson(people[0].id);
  }, [people]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function demoEvent(action: string, resource: string) {
    setEvents((old) => [{ action, resource, actor, at: new Date().toISOString() }, ...old]);
  }
  function changeArea(index: number) {
    setArea(index);
    if (KINDS[index]) setKind(KINDS[index][0]);
    setMessage('');
    setHistory(null);
  }
  function download(name: string, data: unknown) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    );
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>, type: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    await perform(async () => {
      if (type === 'workflow') {
        const data: Data = { ...fields };
        delete data.kind;
        const k = String(fields.kind);
        if (data.tasks)
          data.tasks = String(data.tasks)
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean);
        if (demo) {
          if (k === 'time' && (Number(data.hours) <= 0 || Number(data.hours) > 24))
            throw Error('Hours must be between 0 and 24');
          if (k === 'leave') {
            const start = String(data.start),
              end = String(data.end);
            const year = Number(start.slice(0, 4));
            const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
            if (days < 1 || days > 60 || end.slice(0, 4) !== start.slice(0, 4))
              throw Error('Use a same-year period of at most 60 calendar days');
            const b = balances.find(
              (b) => b.employee_id === data.employee_id && Number(b.year) === year,
            );
            if (!b) throw Error('Set a calendar-day leave balance first');
            if (Number(b.used) + days > Number(b.allowance))
              throw Error('Insufficient leave balance');
            if (
              items.some(
                (r) =>
                  r.kind === 'leave' &&
                  r.employee_id === data.employee_id &&
                  ['submitted', 'approved'].includes(r.state) &&
                  start <= str(r.data, 'end') &&
                  str(r.data, 'start') <= end,
              )
            )
              throw Error('Leave dates overlap an existing request');
            data.days = days;
            data.basis = 'calendar_days';
          }
          if (['onboarding', 'exit'].includes(k)) data.completed_tasks = [];
          const row: Item = {
            id: crypto.randomUUID(),
            kind: k,
            state: INITIAL[k] || 'submitted',
            employee_id: data.employee_id ? String(data.employee_id) : undefined,
            creator_id: actor,
            version: 1,
            data: { ...data, decisions: [] },
          };
          setItems((old) => [row, ...old]);
          demoEvent('workplace.created', row.id);
        } else {
          await post('workplace/items', { kind: k, data, request_key: crypto.randomUUID() });
          await refresh();
        }
      } else if (type === 'balance') {
        if (demo) {
          const old = balances.find(
            (b) => b.employee_id === fields.employee_id && Number(b.year) === Number(fields.year),
          );
          if (Number(fields.allowance) < Number(old?.used || 0))
            throw Error('Allowance cannot be below used days');
          setBalances((all) => [
            ...all.filter(
              (b) =>
                !(b.employee_id === fields.employee_id && Number(b.year) === Number(fields.year)),
            ),
            { ...fields, used: old?.used || 0, basis: 'calendar_days' },
          ]);
        } else {
          await post('workplace/leave-balances', fields);
          await refresh();
        }
      } else if (type === 'plan') {
        if (demo) {
          const projected =
            Number(fields.base_headcount) + Number(fields.hires) - Number(fields.exits);
          if (projected < 0) throw Error('Planned exits exceed available headcount');
          const monthly = projected * Number(fields.monthly_cost_per_employee);
          setPlans((all) => [
            ...all,
            {
              ...fields,
              id: crypto.randomUUID(),
              projected_headcount: projected,
              monthly_cost: monthly.toFixed(2),
              annualized_cost: (monthly * 12).toFixed(2),
              assumption: 'Uniform average cost; not a statutory forecast',
            },
          ]);
        } else {
          await post('workplace/plans', fields);
          await refresh();
        }
      } else if (type === 'rule') {
        if (String(fields.effective_from) > String(fields.effective_to))
          throw Error('Invalid effective dates');
        if (demo) {
          if (rules.some((r) => r.version === fields.version))
            throw Error('Version already exists');
          setRules((old) => [
            ...old,
            {
              ...fields,
              id: crypto.randomUUID(),
              state: 'draft',
              maker: actor,
              production_eligible: false,
            },
          ]);
        } else {
          await post('payroll/rule-evidence', fields);
          await refresh();
        }
      } else if (type === 'amend') {
        const person = people.find((p) => p.id === fields.employee_id);
        const original = employees.find((e) => e.id === fields.employee_id);
        if (!person || !original) throw Error('Select a permitted employee');
        if (original.source !== 'core_hr')
          throw Error(
            'Imported records require source reconciliation; source overwrite is blocked',
          );
        const record = {
          employee_code: original.employee_code,
          full_name: fields.full_name,
          email: fields.email,
          department: fields.department,
          monthly_gross: fields.monthly_gross,
          effective_from: fields.effective_from,
        };
        if (String(record.effective_from) <= String(original.effective_from))
          throw Error('Amendments must follow the original effective date');
        if (demo) {
          const rows = (
            history?.employee_id === person.id && Array.isArray(history.records)
              ? history.records
              : []
          ) as Data[];
          const initial = rows.length
            ? rows
            : [{ record_version: original.version, reason: 'Initial record', record: original }];
          const version = Number(original.version) + 1;
          const revised = { ...original, ...record, version } as Person;
          setHistory({
            employee_id: person.id,
            records: [...initial, { record_version: version, reason: fields.reason, record }],
          });
          onEmployeeAmended(
            String(fields.effective_from) <= new Date().toISOString().slice(0, 10)
              ? revised
              : { ...original, version },
          );
          demoEvent('employee.amended', person.id);
        } else {
          const result = await post('workforce/employees/' + person.id + '/amend', {
            expected_version: original.version,
            reason: fields.reason,
            record,
          });
          onEmployeeAmended(result);
          setHistory(await json('workforce/employees/' + person.id + '/history'));
          await refresh();
        }
      } else if (type === 'compare') {
        if (demo) {
          const a = runs.find((r) => r.id === fields.current),
            b = runs.find((r) => r.id === fields.baseline);
          if (!a || !b) throw Error('Select two runs');
          setComparison({
            simulation: true,
            current: a.id,
            baseline: b.id,
            net_before: b.snapshot.totals.net,
            net_after: a.snapshot.totals.net,
            net_delta: (Number(a.snapshot.totals.net) - Number(b.snapshot.totals.net)).toFixed(2),
          });
        } else
          setComparison(
            await json(`payroll/runs/${fields.current}/comparison?baseline_id=${fields.baseline}`),
          );
      }
      setMessage(demo ? 'Demo updated for this browser session.' : 'Saved successfully.');
    });
  }
  async function transition(row: Item, state: string) {
    await perform(async () => {
      if (demo) {
        if (
          ['leave', 'time', 'expense', 'benefit', 'disciplinary'].includes(row.kind) &&
          row.creator_id === actor
        )
          throw Error('Independent review required. Switch the demo profile to another reviewer.');
        if (
          row.kind === 'learning' &&
          state === 'verified' &&
          str(row.data, 'last_actor') === actor
        )
          throw Error('A different reviewer must verify completion');
        if (
          ['onboarding', 'exit'].includes(row.kind) &&
          state === 'completed' &&
          ((row.data.completed_tasks || []) as number[]).length !==
            (row.data.tasks as string[]).length
        )
          throw Error('Complete all checklist tasks first');
        if (row.kind === 'leave' && state === 'approved') {
          const b = balances.find(
            (b) =>
              b.employee_id === row.employee_id &&
              String(b.year) === str(row.data, 'start').slice(0, 4),
          );
          if (!b || Number(b.used) + Number(row.data.days) > Number(b.allowance))
            throw Error('Insufficient leave balance');
          setBalances((all) =>
            all.map((x) => (x === b ? { ...x, used: Number(x.used) + Number(row.data.days) } : x)),
          );
        }
        setItems((all) =>
          all.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  state,
                  version: r.version + 1,
                  data: {
                    ...r.data,
                    last_actor: actor,
                    decisions: [
                      ...((r.data.decisions || []) as Data[]),
                      { actor, state, note: 'Demo review' },
                    ],
                  },
                }
              : r,
          ),
        );
        demoEvent('workplace.transitioned', row.id);
      } else {
        await post('workplace/items/' + row.id + '/transition', {
          state,
          expected_version: row.version,
          note: 'Reviewed through the workspace',
        });
        await refresh();
      }
    });
  }
  async function task(row: Item, index: number, completed: boolean) {
    await perform(async () => {
      if (demo) {
        const done = new Set((row.data.completed_tasks || []) as number[]);
        if (completed) done.add(index);
        else done.delete(index);
        setItems((all) =>
          all.map((r) =>
            r.id === row.id
              ? { ...r, version: r.version + 1, data: { ...r.data, completed_tasks: [...done] } }
              : r,
          ),
        );
      } else {
        await post('workplace/items/' + row.id + '/tasks', {
          expected_version: row.version,
          index,
          completed,
        });
        await refresh();
      }
    });
  }
  function actions(row: Item) {
    return (NEXT[row.kind][row.state] || []).filter(
      (s) =>
        privileged(row.kind) ||
        (row.kind === 'goal' && own(row)) ||
        (row.kind === 'learning' && own(row) && s === 'completion_requested'),
    );
  }
  const visibleItems = items.filter((r) => (KINDS[area] || []).includes(r.kind));
  const selected = employees.find((p) => p.id === selectedPerson);
  const aggregated = demo
    ? {
        counts: Object.entries(
          items.reduce<Record<string, number>>((all, r) => {
            const key = r.kind + ' / ' + r.state;
            all[key] = (all[key] || 0) + 1;
            return all;
          }, {}),
        ).map(([key, count]) => ({ kind: key, count })),
        approved_expenses_NGN: items
          .filter((r) => r.kind === 'expense' && r.state === 'approved')
          .reduce((n, r) => n + Number(r.data.amount), 0),
        as_of: new Date().toISOString(),
      }
    : insights;
  return (
    <div className="enrichment-hub">
      <div className="enrichment-tabs" aria-label="Enrichment areas">
        {AREAS.map(([label, detail], i) => (
          <button
            key={label}
            onClick={() => changeArea(i)}
            className={area === i ? 'selected' : ''}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            <div>
              <strong>{label}</strong>
              <small>{detail}</small>
            </div>
          </button>
        ))}
      </div>
      <div className="inline-warning">
        <ShieldCheck size={20} />
        <p>
          First increments for review. Payroll remains synthetic; bank payments and provider
          enrollment are not enabled.{' '}
          {demo
            ? 'All changes stay in this browser session.'
            : 'Permissions and approvals are enforced by the services.'}
        </p>
      </div>
      {message && (
        <div className="notice" role="status">
          {message}
          <button onClick={() => setMessage('')}>Dismiss</button>
        </div>
      )}
      <div className="section-heading">
        <h3>{AREAS[area][0]}</h3>
        {!demo && (
          <button className="secondary" disabled={busy} onClick={() => perform(refresh)}>
            <RefreshCw size={15} />
            Refresh
          </button>
        )}
      </div>
      {area === 0 && (
        <>
          <div className="hub-columns">
            <section className="panel hub-form">
              <h3>Draft statutory evidence</h3>
              <p className="form-note">
                Capture a source, applicability and expected-result evidence. Independent metadata
                review does not certify rules or enable production payroll.
              </p>
              <form onSubmit={(e) => submit(e, 'rule')}>
                <fieldset disabled={busy || !can('admin', 'payroll')}>
                  <Field label="Evidence version" name="version" />
                  <Field label="Rule title" name="title" />
                  <Field label="Authority / reviewer to confirm" name="authority" />
                  <Field label="Source reference" name="source_reference" minLength={5} />
                  <Field label="Effective from" name="effective_from" type="date" />
                  <Field label="Effective to" name="effective_to" type="date" />
                  <Field label="Applicable population" name="applicability" />
                  <Field
                    label="Calculation specification"
                    name="calculation_specification"
                    minLength={5}
                  />
                  <Field label="Test evidence reference" name="test_evidence" minLength={5} />
                  <button className="primary">
                    Save evidence draft <Plus size={15} />
                  </button>
                </fieldset>
              </form>
            </section>
            <section className="panel hub-form">
              <h3>Compare payroll previews</h3>
              <p className="form-note">
                Create previews in Payroll, then compare net pay against a selected baseline.
              </p>
              <form onSubmit={(e) => submit(e, 'compare')}>
                <fieldset disabled={busy || runs.length < 2}>
                  <label>
                    Current run
                    <select required name="current">
                      <option value="">Select current</option>
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.snapshot.calendar.name} · {r.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Baseline run
                    <select required name="baseline">
                      <option value="">Select baseline</option>
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.snapshot.calendar.name} · {r.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="secondary">
                    Compare runs <ArrowRight size={15} />
                  </button>
                </fieldset>
              </form>
              {comparison && <pre className="hub-json">{JSON.stringify(comparison, null, 2)}</pre>}
              <h3 className="hub-subheading">Evidence packs</h3>
              {runs.length === 0 ? (
                <p className="muted">No payroll previews yet.</p>
              ) : (
                runs.map((r) => (
                  <button
                    key={r.id}
                    className="secondary evidence-download"
                    onClick={() =>
                      perform(async () =>
                        download(
                          'simulation-evidence-' + r.id + '.json',
                          demo
                            ? {
                                simulation: true,
                                run: r,
                                notice: 'Browser demonstration; not a statutory audit certificate',
                              }
                            : await json('payroll/runs/' + r.id + '/evidence-pack'),
                        ),
                      )
                    }
                  >
                    <Download size={14} />
                    {r.snapshot.calendar.name}
                  </button>
                ))
              )}
            </section>
          </div>
          <section className="panel hub-list">
            <h3>Rule evidence register</h3>
            {!rules.length && <p className="muted">No evidence versions captured.</p>}
            {rules.map((r) => (
              <div className="hub-register" key={str(r, 'id')}>
                <div>
                  <strong>
                    {str(r, 'title')} · {str(r, 'version')}
                  </strong>
                  <p>
                    {str(r, 'authority')} · {str(r, 'effective_from')} — {str(r, 'effective_to')}
                  </p>
                </div>
                <span className="pill amber">{title(str(r, 'state'))}</span>
                {r.state === 'draft' && (
                  <button
                    className="secondary"
                    disabled={busy || !can('approver')}
                    onClick={() =>
                      perform(async () => {
                        if (demo) {
                          if (r.maker === actor) throw Error('A different reviewer is required');
                          setRules((old) =>
                            old.map((x) =>
                              x.id === r.id
                                ? { ...x, state: 'evidence_reviewed', reviewer: actor }
                                : x,
                            ),
                          );
                        } else {
                          await post('payroll/rule-evidence/' + r.id + '/review', {});
                          await refresh();
                        }
                        setMessage(
                          'Evidence metadata reviewed. Production payroll remains disabled.',
                        );
                      })
                    }
                  >
                    Review evidence
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
      {area === 1 && (
        <div className="hub-columns">
          <section className="panel hub-form">
            <h3>Amend a Core HR record</h3>
            <p className="form-note">
              Previous values remain in history. Imported record updates require source
              reconciliation and are blocked in this increment.
            </p>
            <label>
              Select employee
              <select
                value={selectedPerson}
                onChange={(e) => {
                  setSelectedPerson(e.target.value);
                  setHistory(null);
                }}
              >
                {employees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · {p.source}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <form key={selected.id + ':' + selected.version} onSubmit={(e) => submit(e, 'amend')}>
                <fieldset disabled={busy || !can('admin', 'hr') || selected.source !== 'core_hr'}>
                  <input type="hidden" name="employee_id" value={selected.id} />
                  <Field label="Full name" name="full_name" defaultValue={selected.full_name} />
                  <Field label="Email" name="email" type="email" defaultValue={selected.email} />
                  <Field label="Department" name="department" defaultValue={selected.department} />
                  <Field
                    label="Monthly gross (NGN)"
                    name="monthly_gross"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={selected.monthly_gross}
                  />
                  <Field label="Change effective from" name="effective_from" type="date" />
                  <Field label="Reason for amendment" name="reason" />
                  <button className="primary">Save dated amendment</button>
                </fieldset>
              </form>
            ) : (
              <p className="muted">Create an employee in People first.</p>
            )}
          </section>
          <section className="panel hub-form">
            <h3>Employee history</h3>
            <button
              className="secondary"
              disabled={busy || !selected || !can('admin', 'hr', 'payroll', 'auditor')}
              onClick={() =>
                perform(async () => {
                  if (demo) {
                    if (history?.employee_id !== selectedPerson)
                      setHistory({
                        employee_id: selectedPerson,
                        records: [
                          {
                            record_version: selected?.version,
                            reason: 'Initial record',
                            record: selected,
                          },
                        ],
                      });
                  } else
                    setHistory(await json('workforce/employees/' + selectedPerson + '/history'));
                })
              }
            >
              <FileCheck2 size={15} />
              Load history
            </button>
            {history &&
              Array.isArray(history.records) &&
              history.records.map((h: Data, i: number) => {
                const r = h.record as Data;
                return (
                  <div className="config-item" key={i}>
                    <strong>
                      Version {String(h.record_version)} · {str(r, 'effective_from')}
                    </strong>
                    <small>
                      {str(r, 'department')} · {ngn(r.monthly_gross)}
                    </small>
                    <p>{str(h, 'reason')}</p>
                  </div>
                );
              })}
            <p className="form-note">
              Future-dated changes are selected when effective. Payroll snapshots use the period
              start and reject mid-period amendments until proration is implemented.
            </p>
          </section>
        </div>
      )}
      {KINDS[area] && (
        <>
          <div className="hub-columns">
            <section className="panel hub-form">
              <h3>Create a {LABELS[kind].toLowerCase()}</h3>
              <label>
                Workflow type
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {KINDS[area].map((k) => (
                    <option key={k} value={k}>
                      {LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              <form key={kind} onSubmit={(e) => submit(e, 'workflow')}>
                <fieldset disabled={busy || !canCreate}>
                  <input type="hidden" name="kind" value={kind} />
                  {kind !== 'candidate' && <EmployeeSelect people={people} />}
                  <Field label={kind === 'candidate' ? 'Candidate name' : 'Title'} name="title" />
                  {kind === 'leave' && (
                    <>
                      <Field label="Leave start" name="start" type="date" />
                      <Field label="Leave end" name="end" type="date" />
                      <p className="form-note">
                        This pilot uses explicitly allocated calendar days. Accruals, holiday and
                        working-day policies follow later.
                      </p>
                    </>
                  )}
                  {kind === 'time' && (
                    <>
                      <Field label="Work day" name="day" type="date" />
                      <Field
                        label="Hours"
                        name="hours"
                        type="number"
                        min="0.01"
                        max="24"
                        step="0.01"
                      />
                    </>
                  )}
                  {['service', 'disciplinary'].includes(kind) && (
                    <Field label="Description / synthetic evidence" name="description" />
                  )}
                  {kind === 'candidate' && (
                    <>
                      <Field label="Role applied for" name="role" />
                      <Field label="Candidate email" name="email" type="email" />
                    </>
                  )}
                  {['onboarding', 'exit'].includes(kind) && (
                    <label>
                      Checklist tasks (one per line)
                      <textarea name="tasks" required rows={4} />
                    </label>
                  )}
                  {kind === 'goal' && (
                    <>
                      <Field label="Goal due date" name="due" type="date" />
                      <Field label="Success measure" name="success_measure" />
                    </>
                  )}
                  {kind === 'learning' && (
                    <>
                      <Field label="Learning due date" name="due" type="date" />
                      <Field label="Course provider" name="provider" />
                    </>
                  )}
                  {kind === 'expense' && (
                    <>
                      <Field
                        label="Claim amount (NGN)"
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                      />
                      <Field
                        label="Receipt reference (no file upload yet)"
                        name="receipt_reference"
                      />
                    </>
                  )}
                  {kind === 'benefit' && (
                    <>
                      <Field label="Requested benefit plan" name="plan" />
                      <p className="form-note">
                        Approval records intent only. No provider enrollment or money movement
                        occurs.
                      </p>
                    </>
                  )}
                  <button className="primary">
                    Create {LABELS[kind].toLowerCase()} <Plus size={15} />
                  </button>
                </fieldset>
              </form>
            </section>
            <section className="panel hub-form">
              {area === 2 ? (
                <>
                  <h3>Calendar-day leave balances</h3>
                  <form onSubmit={(e) => submit(e, 'balance')}>
                    <fieldset disabled={busy || !can('admin', 'hr')}>
                      <EmployeeSelect people={people} />
                      <Field
                        label="Balance year"
                        name="year"
                        type="number"
                        min="2020"
                        max="2100"
                        defaultValue={new Date().getFullYear()}
                      />
                      <Field
                        label="Calendar-day allowance"
                        name="allowance"
                        type="number"
                        min="0"
                        max="366"
                      />
                      <button className="secondary">Set leave balance</button>
                    </fieldset>
                  </form>
                  {balances.map((b, i) => (
                    <div className="config-item" key={i}>
                      <strong>
                        {people.find((p) => p.id === b.employee_id)?.full_name ||
                          String(b.employee_id)}{' '}
                        · {String(b.year)}
                      </strong>
                      <small>
                        {Number(b.allowance) - Number(b.used)} available / {String(b.allowance)}{' '}
                        calendar days
                      </small>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <h3>
                    {area === 3
                      ? 'Connected lifecycle'
                      : area === 4
                        ? 'Development with evidence'
                        : 'Approvals before finance handoff'}
                  </h3>
                  <p className="form-note">
                    {area === 3
                      ? 'Move candidates through screening, interviews and offers. Complete onboarding and exit checklist tasks before closing. Candidate-to-employee conversion, notifications and final pay integration are later increments.'
                      : area === 4
                        ? 'Track goals and learning assignments. Learning completion requires a separate verifier. Full review cycles, skills and LMS integration follow later.'
                        : 'Submit claims and benefit requests for independent review. Provider enrollment, accounting posting and reimbursements remain separate release gates.'}
                  </p>
                  <div className="hub-status-grid">
                    {(KINDS[area] || []).map((k) => (
                      <div key={k}>
                        <strong>{items.filter((r) => r.kind === k).length}</strong>
                        <small>{LABELS[k]}</small>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
          <section className="hub-records" aria-label="Workflow records">
            {!visibleItems.length && (
              <div className="panel empty">
                <h3>No workflows yet.</h3>
                <p>Create the first record using the form above.</p>
              </div>
            )}
            {visibleItems.map((row) => (
              <article className="panel hub-record" key={row.id}>
                <div className="panel-title">
                  <div>
                    <span className="eyebrow">{LABELS[row.kind]}</span>
                    <h3>{str(row.data, 'title')}</h3>
                    <p>
                      {people.find((p) => p.id === row.employee_id)?.full_name ||
                        str(row.data, 'role') ||
                        'Candidate workflow'}{' '}
                      · version {row.version}
                    </p>
                  </div>
                  <span
                    className={
                      'pill ' +
                      (['approved', 'completed', 'verified', 'hired', 'resolved'].includes(
                        row.state,
                      )
                        ? 'mint'
                        : 'amber')
                    }
                  >
                    {title(row.state)}
                  </span>
                </div>
                <div className="hub-record-body">
                  {row.data.amount !== undefined && <strong>{ngn(row.data.amount)}</strong>}
                  {row.data.start !== undefined && (
                    <p>
                      {str(row.data, 'start')} — {str(row.data, 'end')} · {str(row.data, 'days')}{' '}
                      calendar days
                    </p>
                  )}
                  {row.data.day !== undefined && (
                    <p>
                      {str(row.data, 'day')} · {str(row.data, 'hours')} hours
                    </p>
                  )}
                  {row.data.due !== undefined && (
                    <p>
                      Due {str(row.data, 'due')} ·{' '}
                      {str(row.data, 'success_measure') || str(row.data, 'provider')}
                    </p>
                  )}
                  {row.data.plan !== undefined && (
                    <p>Plan: {str(row.data, 'plan')} · enrollment not transmitted</p>
                  )}
                  {row.data.description !== undefined && <p>{str(row.data, 'description')}</p>}
                  {Array.isArray(row.data.tasks) &&
                    row.data.tasks.map((label, index) => (
                      <label className="hub-task" key={index}>
                        <input
                          type="checkbox"
                          checked={((row.data.completed_tasks || []) as number[]).includes(index)}
                          disabled={
                            busy ||
                            !privileged(row.kind) ||
                            !['open', 'in_progress'].includes(row.state)
                          }
                          onChange={(e) => task(row, index, e.target.checked)}
                        />
                        {String(label)}
                      </label>
                    ))}
                </div>
                <div className="run-actions">
                  <small>Independent decisions and state history retained.</small>
                  <div className="toolbar">
                    {actions(row).map((state) => (
                      <button
                        className="secondary"
                        key={state}
                        disabled={busy}
                        onClick={() => transition(row, state)}
                      >
                        {title(state)} <ArrowRight size={13} />
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
      {area === 6 && (
        <div className="hub-columns">
          <section className="panel hub-form">
            <h3>Access and approval policy</h3>
            <p className="form-note">
              Tenant membership comes from the signed session. Employees receive own-record access;
              sensitive cases require HR access. Account linking is operator-managed in this
              increment.
            </p>
            <div className="config-item">
              <strong>Current roles</strong>
              <small>{roles.join(', ')}</small>
            </div>
            <div className="config-item">
              <strong>Independent review</strong>
              <small>
                Leave, time, expenses, benefits, disciplinary decisions and learning verification.
              </small>
            </div>
            {policy && (
              <details>
                <summary>View service policy</summary>
                <pre className="hub-json">{JSON.stringify(policy, null, 2)}</pre>
              </details>
            )}
            <div className="inline-warning">
              <p>
                OIDC/MFA, immediate session revocation, delegated team/entity grants and off-site
                recovery are still production gates.
              </p>
            </div>
          </section>
          <section className="panel hub-form">
            <h3>Workplace audit history</h3>
            <button
              className="secondary"
              disabled={!events.length}
              onClick={() => download('workplace-audit.json', events)}
            >
              <Download size={14} />
              Export visible audit records
            </button>
            {events.length ? (
              events.slice(0, 20).map((e, i) => (
                <div className="config-item" key={i}>
                  <strong>{str(e, 'action')}</strong>
                  <small>
                    {str(e, 'at')} · {str(e, 'actor').slice(0, 12)}
                  </small>
                </div>
              ))
            ) : (
              <p className="form-note">
                No visible workplace audit events yet. Create or review a workflow to populate
                history.
              </p>
            )}
          </section>
        </div>
      )}
      {area === 7 && (
        <>
          <div className="hub-columns">
            <section className="panel hub-form">
              <h3>Staffing cost scenario</h3>
              <p className="form-note">
                Explicit headcount and uniform average-cost assumptions. This is a planning
                scenario, not a salary or statutory forecast.
              </p>
              <form onSubmit={(e) => submit(e, 'plan')}>
                <fieldset disabled={busy || !can('admin', 'hr', 'finance')}>
                  <Field label="Scenario title" name="title" />
                  <Field
                    label="Base headcount"
                    name="base_headcount"
                    type="number"
                    min="0"
                    defaultValue={people.length}
                  />
                  <Field
                    label="Planned hires"
                    name="hires"
                    type="number"
                    min="0"
                    defaultValue="0"
                  />
                  <Field
                    label="Planned exits"
                    name="exits"
                    type="number"
                    min="0"
                    defaultValue="0"
                  />
                  <Field
                    label="Average monthly cost per employee (NGN)"
                    name="monthly_cost_per_employee"
                    type="number"
                    min="0"
                    step="0.01"
                  />
                  <button className="primary">
                    Save scenario <Plus size={15} />
                  </button>
                </fieldset>
              </form>
            </section>
            <section className="panel hub-form">
              <h3>Operational insights</h3>
              <p className="form-note">
                Live, role-filtered workflow records. These summaries are not a historical analytics
                warehouse.
              </p>
              <div className="hub-status-grid">
                <div>
                  <strong>{ngn(aggregated?.approved_expenses_NGN)}</strong>
                  <small>Approved expense claims · not paid</small>
                </div>
                <div>
                  <strong>{items.length}</strong>
                  <small>Visible workflow records</small>
                </div>
              </div>
              {aggregated &&
                Array.isArray(aggregated.counts) &&
                aggregated.counts.map((c: Data, i: number) => (
                  <div className="config-item" key={i}>
                    <strong>
                      {title(str(c, 'kind'))} {title(str(c, 'state'))}
                    </strong>
                    <small>{String(c.count)} records</small>
                  </div>
                ))}
              {aggregated && <small className="muted">As of {str(aggregated, 'as_of')}</small>}
            </section>
          </div>
          <section className="panel hub-list">
            <h3>Saved planning scenarios</h3>
            {!plans.length && <p className="muted">No planning scenarios yet.</p>}
            {plans.map((p, i) => (
              <div className="hub-register" key={i}>
                <div>
                  <strong>{str(p, 'title')}</strong>
                  <p>
                    {String(p.projected_headcount)} projected staff · {ngn(p.monthly_cost)} / month
                  </p>
                </div>
                <strong>{ngn(p.annualized_cost)} / year</strong>
              </div>
            ))}
          </section>
        </>
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
function EmployeeSelect({ people }: { people: Person[] }) {
  return (
    <label>
      Employee
      <select name="employee_id" required>
        <option value="">Select employee</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name} · {p.employee_code}
          </option>
        ))}
      </select>
    </label>
  );
}
