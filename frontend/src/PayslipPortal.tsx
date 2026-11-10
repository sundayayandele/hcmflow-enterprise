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
  employee_name?: string;
  bank_account?: {
    bank_name: string;
    account_name: string;
    account_number: string;
    demo?: boolean;
  };
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
function payRows(payload: Payload) {
  const r = payload.result;
  return [
    ...(r.lines || []).map((l) => [l.label, l.kind.replaceAll('_', ' '), amount(l.amount)]),
    ['Gross pay', 'Total', amount(r.gross)],
    ['Deductions', 'Total', amount(r.deductions)],
    ['Reimbursements', 'Total', amount(r.reimbursements || '0')],
    ['Net pay', 'Take home', amount(r.net)],
  ];
}
const demoBank = (person: (typeof demoEmployees)[number]) => ({
  bank_name: 'Example Demo Bank',
  account_name: person.full_name,
  account_number: `DEMO-${person.employee_code}`,
  demo: true,
});
// Vector PDF tables with wrapped cells, repeated headers and byte-accurate offsets.
function downloadPdf(payload: Payload) {
  const r = payload.result;
  const ascii = (text: string) => text.replace(/[^\x20-\x7E]/g, '?');
  const escape = (text: string) => ascii(text).replace(/([\\()])/g, '\\$1');
  const wrap = (text: string, width: number) => {
    const words = ascii(text).match(new RegExp(`.{1,${width}}(?:\\s|$)|.{1,${width}}`, 'g')) || [
      '',
    ];
    return words.map((w) => w.trim());
  };
  const streams: string[] = [];
  let content = '',
    y = 800;
  const text = (value: string, x: number, at: number, size = 10) => {
    content += `BT /F1 ${size} Tf ${x} ${at} Td (${escape(value)}) Tj ET\n`;
  };
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    content += `0.75 w ${x1} ${y1} m ${x2} ${y2} l S\n`;
  };
  const newPage = () => {
    if (content) streams.push(content);
    content = '';
    y = 800;
    for (const name of wrap(payload.company, 55)) {
      text(name, 40, y, 15);
      y -= 20;
    }
    text('EMPLOYEE PAYSLIP | SIMULATION - NOT FOR PAYMENT', 40, y);
    y -= 24;
    text(`Employee: ${payload.employee_name || r.employee_code} | ${r.employee_code}`, 40, y);
    y -= 18;
    text(`Period: ${payload.calendar.start} to ${payload.calendar.end}`, 40, y);
    y -= 18;
    text(`Payment date: ${payload.calendar.pay_date}`, 40, y);
    y -= 24;
    const bank = payload.bank_account;
    for (const detail of bank
      ? [
          `Salary bank: ${bank.bank_name}${bank.demo ? ' (FICTIONAL DEMO)' : ''}`,
          `Account name: ${bank.account_name}`,
          `Account number: ${bank.account_number}`,
        ]
      : ['Salary bank account: Not provided in archived payslip']) {
      for (const part of wrap(detail, 80)) {
        text(part, 40, y);
        y -= 16;
      }
    }
    y -= 15;
    text('SALARY BREAKDOWN AND DEDUCTIONS', 40, y);
    y -= 18;
  };
  const row = (cells: string[], header = false) => {
    const columns = [40, 345, 435, 555],
      widths = [48, 13, 17];
    const wrapped = cells.map((cell, i) => wrap(cell, widths[i]));
    const height = Math.max(...wrapped.map((c) => c.length)) * 14 + 16;
    if (header) content += `0.92 g 40 ${y - height} 515 ${height} re f 0 g\n`;
    for (let i = 0; i < columns.length; i++) line(columns[i], y, columns[i], y - height);
    line(40, y, 555, y);
    line(40, y - height, 555, y - height);
    wrapped.forEach((values, i) =>
      values.forEach((value, j) => text(value, columns[i] + 8, y - 17 - j * 14, 9)),
    );
    y -= height;
  };
  newPage();
  row(['Description', 'Type', 'Amount (NGN)'], true);
  for (const cells of payRows(payload)) {
    const required = Math.max(...cells.map((v, i) => wrap(v, [48, 13, 17][i]).length)) * 14 + 16;
    if (y - required < 95) {
      newPage();
      row(['Description', 'Type', 'Amount (NGN)'], true);
    }
    row(cells);
  }
  if (y < 110) newPage();
  y -= 25;
  text('Availability does not confirm bank payment.', 40, y);
  for (const part of wrap(`Snapshot checksum: ${payload.checksum}`, 85)) {
    y -= 14;
    text(part, 40, y, 8);
  }
  streams.push(content);
  const objects = ['', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const pages: number[] = [];
  streams.forEach((stream) => {
    const page = objects.length + 1;
    pages.push(page);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
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
        employee_name: person.full_name,
        bank_account: demoBank(person),
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
        employee_name: person.full_name,
        bank_account: demoBank(person),
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
          <header className="payslip-employer">
            <span className="payslip-monogram" aria-hidden="true">
              {selected.company.slice(0, 1)}
            </span>
            <div>
              <small>EMPLOYER</small>
              <h3>{selected.company}</h3>
            </div>
          </header>
          <p>
            Employee: {selected.employee_name || selected.result.employee_code} ·{' '}
            {selected.result.employee_code}
          </p>
          <p>
            Period: {selected.calendar.start} – {selected.calendar.end} · Payment date:{' '}
            {selected.calendar.pay_date}
          </p>
          <section className="payslip-bank" aria-label="Salary bank account">
            <h3>Salary bank account</h3>
            {selected.bank_account ? (
              <>
                <p>
                  <strong>Bank:</strong> {selected.bank_account.bank_name}
                </p>
                <p>
                  <strong>Account name:</strong> {selected.bank_account.account_name}
                </p>
                <p>
                  <strong>Account number:</strong> {selected.bank_account.account_number}
                </p>
                {selected.bank_account.demo && (
                  <small>Fictional demo account — not for payment.</small>
                )}
              </>
            ) : (
              <p>Not provided in this archived payslip.</p>
            )}
          </section>
          <div className="payslip-breakdown">
            <table aria-label="Salary breakdown and deductions">
              <caption>Salary breakdown and deductions</caption>
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col">Type</th>
                  <th scope="col">Amount (NGN)</th>
                </tr>
              </thead>
              <tbody>
                {payRows(selected).map((cells, i) => (
                  <tr key={i} className={cells[0] === 'Net pay' ? 'payslip-net' : ''}>
                    <th scope="row">{cells[0]}</th>
                    <td>{cells[1]}</td>
                    <td>{cells[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <small>Snapshot: {selected.checksum}. Availability does not confirm bank payment.</small>
        </article>
      )}
    </section>
  );
}
