import { useEffect, useState } from 'react';
import { demoEmployees } from './demo';

type Slip = {
  id: string;
  employee_code: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  available?: boolean;
};
type Payload = {
  simulation: boolean;
  company: string;
  calendar: { start: string; end: string; pay_date: string };
  checksum: string;
  result: {
    employee_code: string;
    gross: string;
    deductions: string;
    net: string;
    reimbursements?: string;
    lines?: { label: string; kind: string; amount: string }[];
  };
};
type Run = {
  id: string;
  state: string;
  snapshot: {
    calendar: { start: string; end: string; pay_date: string };
    checksum: string;
    results: (Payload['result'] & { employee_id: string })[];
  };
};
const todayLagos = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const amount = (value: string) =>
  `NGN ${Number(value).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
// ASCII PDF with byte-accurate cross-reference offsets; no third-party PDF runtime.
function downloadPdf(payload: Payload) {
  const r = payload.result;
  const text = [
    'HCMFLOW - EMPLOYEE PAYSLIP',
    'SIMULATION - NOT FOR PAYMENT',
    payload.company,
    `Employee: ${r.employee_code}`,
    `Period: ${payload.calendar.start} to ${payload.calendar.end}`,
    `Payment date: ${payload.calendar.pay_date}`,
    '',
    ...(r.lines || []).map((l) => `${l.label} (${l.kind}): ${amount(l.amount)}`),
    '',
    `Gross: ${amount(r.gross)}`,
    `Deductions: ${amount(r.deductions)}`,
    `Reimbursements: ${amount(r.reimbursements || '0')}`,
    `Net pay: ${amount(r.net)}`,
    '',
    'Availability does not confirm bank payment.',
    `Snapshot checksum: ${payload.checksum}`,
  ];
  const lines = text.flatMap((t) => t.replace(/[^\x20-\x7E]/g, '?').match(/.{1,85}/g) || ['']);
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += 44) chunks.push(lines.slice(i, i + 44));
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'];
  const pages: number[] = [];
  chunks.forEach((chunk) => {
    const page = objects.length + 1,
      stream = page + 1;
    pages.push(page);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${stream} 0 R >>`,
    );
    const content = `BT /F1 10 Tf 40 790 Td 16 TL ${chunk.map((l) => `(${l.replace(/([\\()])/g, '\\$1')}) Tj T*`).join('\n')} ET`;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pages.map((p) => `${p} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `payslip-${r.employee_code}-${payload.calendar.start}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function PayslipPortal({
  demo,
  api,
  runs,
}: {
  demo: boolean;
  api: (path: string, options?: RequestInit) => Promise<Response>;
  runs: Run[];
}) {
  const [employee, setEmployee] = useState(demoEmployees[0].id);
  const [day, setDay] = useState(25),
    [date, setDate] = useState(todayLagos());
  const [live, setLive] = useState<Slip[]>([]),
    [serverDate, setServerDate] = useState('');
  const [selected, setSelected] = useState<Payload | null>(null),
    [error, setError] = useState('');
  async function refresh() {
    try {
      const response = await api('payroll/payslips');
      if (!response.ok) throw new Error('Unable to load your payslip archive.');
      const data = await response.json();
      setLive(data.slips);
      setServerDate(data.today);
      setSelected(null);
      setError('');
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (!demo) void refresh();
  }, [demo]);
  const person = demoEmployees.find((e) => e.id === employee)!;
  const payloads = new Map<string, Payload>();
  const seeded: Slip[] = [];
  if (demo) {
    const [year, month] = todayLagos().split('-').map(Number);
    for (let offset = -5; offset <= 1; offset++) {
      const first = new Date(Date.UTC(year, month - 1 + offset, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      const start = first.toISOString().slice(0, 10),
        end = last.toISOString().slice(0, 10);
      const pay = `${start.slice(0, 8)}${String(Math.min(day, last.getUTCDate())).padStart(2, '0')}`;
      const id = `sample-${employee}-${start}`;
      const deduction = '15000.00';
      payloads.set(id, {
        simulation: true,
        company: 'HCMFlow Demo Company',
        calendar: { start, end, pay_date: pay },
        checksum: 'SYNTHETIC-SAMPLE',
        result: {
          employee_code: person.employee_code,
          gross: person.monthly_gross,
          deductions: deduction,
          net: (Number(person.monthly_gross) - Number(deduction)).toFixed(2),
          lines: [
            { label: 'Sample salary', kind: 'earning', amount: person.monthly_gross },
            {
              label: 'Invented demonstration deduction (not a tax rate)',
              kind: 'deduction',
              amount: deduction,
            },
          ],
        },
      });
      seeded.push({
        id,
        employee_code: person.employee_code,
        period_start: start,
        period_end: end,
        pay_date: pay,
      });
    }
    for (const run of runs.filter((r) => r.state === 'approved_simulation')) {
      const result = run.snapshot.results.find((r) => r.employee_id === employee);
      if (!result) continue;
      const id = `run-${run.id}-${employee}`;
      payloads.set(id, {
        simulation: true,
        company: 'HCMFlow Demo Company',
        calendar: run.snapshot.calendar,
        checksum: run.snapshot.checksum,
        result,
      });
      seeded.push({
        id,
        employee_code: result.employee_code,
        period_start: run.snapshot.calendar.start,
        period_end: run.snapshot.calendar.end,
        pay_date: run.snapshot.calendar.pay_date,
      });
    }
  }
  const slips = demo
    ? seeded
        .sort((a, b) => b.period_start.localeCompare(a.period_start))
        .map((s) => ({ ...s, available: s.pay_date <= date }))
    : live;
  const next = slips
    .filter((s) => !s.available)
    .map((s) => s.pay_date)
    .sort()[0];
  async function view(slip: Slip) {
    if (!slip.available) return;
    try {
      if (demo) setSelected(payloads.get(slip.id)!);
      else {
        const response = await api(`payroll/payslips/${slip.id}`);
        if (!response.ok) throw new Error('This payslip is unavailable. Refresh your archive.');
        setSelected(await response.json());
      }
      setError('');
    } catch (e) {
      setSelected(null);
      setError(String(e));
    }
  }
  return (
    <section className="payslip-portal">
      <div className="section-head">
        <div>
          <span className="eyebrow">EMPLOYEE SELF-SERVICE</span>
          <h2>My payslips</h2>
          <p>Your monthly archive. Released on your scheduled salary payment date.</p>
        </div>
      </div>
      {demo ? (
        <div className="payslip-controls">
          <label>
            Demo employee
            <select
              aria-label="Demo employee"
              value={employee}
              onChange={(e) => {
                setEmployee(e.target.value);
                setSelected(null);
              }}
            >
              {demoEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} · {e.employee_code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sample salary day
            <input
              type="number"
              min="1"
              max="31"
              value={day}
              onChange={(e) => {
                setDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)));
                setSelected(null);
              }}
            />
          </label>
          <label>
            Demo viewing date
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value || todayLagos());
                setSelected(null);
              }}
            />
          </label>
          <button
            className="primary"
            disabled={!next}
            onClick={() => {
              setDate(next);
              setSelected(null);
            }}
          >
            Simulate payment day
          </button>
          <button
            onClick={() => {
              setDate(todayLagos());
              setSelected(null);
            }}
          >
            Reset to today
          </button>
        </div>
      ) : (
        <button onClick={() => void refresh()}>Refresh my archive</button>
      )}
      <div className="inline-warning">
        <p>
          {demo
            ? `Viewing ${person.full_name}'s synthetic archive. Sample day changes apply only to sample slips; approved payroll keeps its original dates. `
            : 'Your signed employee identity determines which payslips you can access. '}
          Release is at 00:00 Africa/Lagos on the payment date. Availability does not confirm bank
          payment. All current slips are simulations; production payroll awaits statutory
          validation.
        </p>
      </div>
      <p>
        Archive date: <strong>{demo ? date : serverDate || 'Loading…'}</strong> · Africa/Lagos ·{' '}
        {slips.filter((s) => s.available).length} available
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="panel payslip-list">
        <table>
          <thead>
            <tr>
              <th>Salary period</th>
              <th>Employee</th>
              <th>Payment date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {slips.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.period_start} – {s.period_end}
                  {s.id.startsWith('run-') && <small>Approved payroll</small>}
                </td>
                <td>{s.employee_code}</td>
                <td>{s.pay_date}</td>
                <td>
                  <span className={`pill ${s.available ? 'mint' : ''}`}>
                    {s.available ? 'Available' : 'Scheduled'}
                  </span>
                </td>
                <td>
                  <button disabled={!s.available} onClick={() => void view(s)}>
                    {s.available ? 'View payslip' : 'Available on payment day'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!slips.length && (
          <p>
            No archived payslips yet. Payroll approval saves them here automatically. Ask HR to link
            your account to your employee record if needed.
          </p>
        )}
      </div>
      {selected && (
        <article className="panel payslip-document" aria-label="Payslip document">
          <div className="section-head">
            <h2>Monthly payslip · {selected.result.employee_code}</h2>
            <button className="primary" onClick={() => downloadPdf(selected)}>
              Download PDF
            </button>
            <button onClick={() => setSelected(null)}>Close payslip</button>
          </div>
          <p className="pill">SIMULATION — NOT FOR PAYMENT</p>
          <h3>{selected.company}</h3>
          <p>
            Period: {selected.calendar.start} – {selected.calendar.end} · Payment date:{' '}
            {selected.calendar.pay_date}
          </p>
          <dl>
            {(selected.result.lines || []).map((l, i) => (
              <div key={i}>
                <dt>
                  {l.label} ({l.kind})
                </dt>
                <dd>{amount(l.amount)}</dd>
              </div>
            ))}
            <div>
              <dt>Gross pay</dt>
              <dd>{amount(selected.result.gross)}</dd>
            </div>
            <div>
              <dt>Deductions</dt>
              <dd>{amount(selected.result.deductions)}</dd>
            </div>
            <div>
              <dt>Reimbursements</dt>
              <dd>{amount(selected.result.reimbursements || '0')}</dd>
            </div>
            <div className="payslip-net">
              <dt>Net pay</dt>
              <dd>{amount(selected.result.net)}</dd>
            </div>
          </dl>
          <small>Snapshot: {selected.checksum}. Availability does not confirm bank payment.</small>
        </article>
      )}
    </section>
  );
}
