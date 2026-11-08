from datetime import date
from decimal import Decimal, ROUND_HALF_UP
import csv
import io
import os
import httpx
from fastapi import Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import String, JSON, UniqueConstraint, select
from sqlalchemy.orm import Mapped, mapped_column
from hcm.common import Base, TenantRow, application, principal, database, require, owned, audit, fingerprint

class Config(TenantRow,Base):
    __tablename__='configurations'
    kind: Mapped[str]=mapped_column(String(30))
    data: Mapped[dict]=mapped_column(JSON)
class Rule(TenantRow,Base):
    __tablename__='rules'
    data: Mapped[dict]=mapped_column(JSON)
class Run(TenantRow,Base):
    __tablename__='runs'
    __table_args__=(UniqueConstraint('tenant_id','idempotency_key'),)
    idempotency_key: Mapped[str]=mapped_column(String(80))
    request_hash: Mapped[str]=mapped_column(String(64))
    maker: Mapped[str]=mapped_column(String(36))
    checker: Mapped[str|None]=mapped_column(String(36),nullable=True)
    state: Mapped[str]=mapped_column(String(30),default='preview')
    snapshot: Mapped[dict]=mapped_column(JSON)

class CalendarInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    name: str=Field(min_length=2,max_length=80)
    frequency: str=Field(pattern='^(weekly|fortnightly|semi_monthly|monthly|custom)$')
    start: date
    end: date
    cutoff: date
    pay_date: date
    @model_validator(mode='after')
    def dates(self):
        if self.start>self.end or self.cutoff>self.pay_date or self.end>self.pay_date:
            raise ValueError('Invalid calendar date order')
        return self
class ElementInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    code: str=Field(pattern=r'^[A-Z][A-Z0-9_]{1,29}$')
    label: str=Field(min_length=2,max_length=80)
    kind: str=Field(pattern='^(earning|deduction|employer_cost|reimbursement)$')
    method: str=Field(pattern='^(fixed|percent_base)$')
    value: Decimal=Field(ge=0,le=100000000,max_digits=15,decimal_places=4)
    effective_from: date
    effective_to: date
    debit_account: str=Field(min_length=1,max_length=30,pattern=r'^[A-Za-z0-9_-]+$')
    credit_account: str=Field(min_length=1,max_length=30,pattern=r'^[A-Za-z0-9_-]+$')
    @model_validator(mode='after')
    def dates(self):
        if self.effective_from>self.effective_to: raise ValueError('Invalid effective dates')
        if self.method=='percent_base' and self.value>100: raise ValueError('Percentage exceeds 100')
        return self
class RuleInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    version: str=Field(min_length=1,max_length=50)
    effective_from: date
    effective_to: date
    source: str=Field(min_length=5,max_length=500)
    # Synthetic flat deductions only. Nigerian law is NOT represented by these fields.
    synthetic_tax_percent: Decimal=Field(ge=0,le=100,max_digits=7,decimal_places=4)
    synthetic_pension_percent: Decimal=Field(ge=0,le=100,max_digits=7,decimal_places=4)
    @model_validator(mode='after')
    def dates(self):
        if self.effective_from>self.effective_to: raise ValueError('Invalid effective dates')
        return self
class RunInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    calendar_id: str
    rule_id: str
    element_ids: list[str]=Field(default_factory=list,max_length=30)
    # Explicit per-period bases avoid inferring proration or annualization rules.
    employee_bases: dict[str,Decimal]=Field(min_length=1,max_length=200)
    idempotency_key: str=Field(min_length=8,max_length=80)
    @model_validator(mode='after')
    def bases(self):
        if len(self.element_ids)!=len(set(self.element_ids)): raise ValueError('Duplicate elements')
        for amount in self.employee_bases.values():
            if not amount.is_finite() or amount<0 or amount>1000000000 or amount.as_tuple().exponent < -2:
                raise ValueError('Base amounts must be non-negative currency values with at most two decimals')
        return self

def money(v): return Decimal(str(v)).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
def calc(base,rule,elements):
    base=money(base); lines=[{'code':'BASE','label':'Period base','kind':'earning','amount':str(base),'basis':str(base),'rule':'explicit_operator_input'}]
    for e in elements:
        amount=money(e['value'] if e['method']=='fixed' else base*Decimal(e['value'])/100)
        lines.append({'code':e['code'],'label':e['label'],'kind':e['kind'],'amount':str(amount),'basis':str(base),'rule':e})
    gross=sum((Decimal(l['amount']) for l in lines if l['kind']=='earning'),Decimal(0))
    for code,field in [('SYNTHETIC_TAX','synthetic_tax_percent'),('SYNTHETIC_PENSION','synthetic_pension_percent')]:
        amount=money(gross*Decimal(rule[field])/100)
        lines.append({'code':code,'label':code.replace('_',' ').title(),'kind':'deduction','amount':str(amount),'basis':str(gross),'rate':rule[field],'rule_version':rule['version']})
    deductions=sum((Decimal(l['amount']) for l in lines if l['kind']=='deduction'),Decimal(0))
    reimbursements=sum((Decimal(l['amount']) for l in lines if l['kind']=='reimbursement'),Decimal(0))
    net=money(gross-deductions+reimbursements)
    if net<0: raise HTTPException(422,'Negative net pay; resolve input deductions')
    return {'gross':str(money(gross)),'deductions':str(money(deductions)),'reimbursements':str(money(reimbursements)),'net':str(net),'lines':lines}

app=application('HCMFlow Payroll & Nigeria Rule Registry')
@app.get('/readiness')
def readiness(p=Depends(principal)):
    return {'mode':'synthetic_only','production_enabled':False,'blockers':['Nigeria statutory specialist sign-off and independently tested country pack','HR and payroll reviewer sign-off','GTBank channel specification and acceptance tests','Production security and recovery rehearsal'],'jurisdiction':'Nigeria · Lagos pilot'}
@app.get('/config')
def configs(p=Depends(principal),db=Depends(database)):
    require(p,'admin','payroll','approver','auditor')
    return {'calendars':[{'id':r.id,**r.data} for r in db.scalars(select(Config).where(Config.tenant_id==p['tenant_id'],Config.kind=='calendar'))], 'elements':[{'id':r.id,**r.data} for r in db.scalars(select(Config).where(Config.tenant_id==p['tenant_id'],Config.kind=='element'))], 'rules':[{'id':r.id,**r.data} for r in db.scalars(select(Rule).where(Rule.tenant_id==p['tenant_id']))]}
@app.post('/calendars',status_code=201)
def calendar(data:CalendarInput,request:Request,p=Depends(principal),db=Depends(database)):
    require(p,'admin','payroll'); row=Config(tenant_id=p['tenant_id'],kind='calendar',data=data.model_dump(mode='json'))
    db.add(row); db.flush(); audit(db,p,'calendar.created',row.id,request); return {'id':row.id,**row.data}
@app.post('/elements',status_code=201)
def element(data:ElementInput,request:Request,p=Depends(principal),db=Depends(database)):
    require(p,'admin','payroll'); row=Config(tenant_id=p['tenant_id'],kind='element',data=data.model_dump(mode='json'))
    db.add(row); db.flush(); audit(db,p,'element.created',row.id,request); return {'id':row.id,**row.data}
@app.post('/rules',status_code=201)
def rule(data:RuleInput,request:Request,p=Depends(principal),db=Depends(database)):
    require(p,'admin','payroll')
    row=Rule(tenant_id=p['tenant_id'],data={**data.model_dump(mode='json'),'status':'synthetic_unapproved','reviewer':None,'evidence':None,'production_eligible':False})
    db.add(row); db.flush(); audit(db,p,'synthetic_rule.created',row.id,request); return {'id':row.id,**row.data}
@app.post('/runs',status_code=201)
def preview(data:RunInput,request:Request,p=Depends(principal),db=Depends(database)):
    require(p,'admin','payroll')
    digest=fingerprint(data.model_dump(mode='json'))
    existing=db.scalar(select(Run).where(Run.tenant_id==p['tenant_id'],Run.idempotency_key==data.idempotency_key))
    if existing:
        if existing.request_hash!=digest: raise HTTPException(409,'Idempotency key already used for different inputs')
        return existing
    calendar=owned(db,Config,data.calendar_id,p)
    if calendar.kind!='calendar': raise HTTPException(422,'Expected a pay calendar')
    rule=owned(db,Rule,data.rule_id,p)
    day=calendar.data['end']
    if not rule.data['effective_from']<=day<=rule.data['effective_to']: raise HTTPException(422,'Rule does not cover this period')
    elements=[]
    for id in data.element_ids:
        e=owned(db,Config,id,p)
        if e.kind!='element' or not e.data['effective_from']<=day<=e.data['effective_to']: raise HTTPException(422,'Pay element is not effective for this period')
        elements.append(e.data)
    if len({e['code'] for e in elements})!=len(elements): raise HTTPException(422,'Duplicate pay element codes')
    try:
        response=httpx.get(os.environ.get('WORKFORCE_URL','http://workforce:8000')+'/employees',headers={'Authorization':request.headers['authorization']},timeout=10)
        response.raise_for_status(); employees={e['id']:e for e in response.json()}
    except (httpx.HTTPError,ValueError): raise HTTPException(503,'Workforce snapshot unavailable; no run created')
    results=[]
    for id,base in data.employee_bases.items():
        if id not in employees: raise HTTPException(422,'Employee is not in the authorized workforce snapshot')
        e=employees[id]
        if e['effective_from']>calendar.data['start']: raise HTTPException(422,'Mid-period employment requires reviewed proration; not supported in this release')
        results.append({'employee_id':id,'employee_code':e['employee_code'],'employee_version':e['version'],'source':e['source'],**calc(base,rule.data,elements)})
    snap={'simulation':True,'currency':'NGN','calendar':calendar.data,'rule':{'id':rule.id,**rule.data},'elements':elements,'results':results,'totals':{k:str(sum((Decimal(r[k]) for r in results),Decimal(0))) for k in ['gross','deductions','reimbursements','net']}}
    snap['checksum']=fingerprint(snap)
    row=Run(tenant_id=p['tenant_id'],idempotency_key=data.idempotency_key,request_hash=digest,maker=p['sub'],snapshot=snap)
    db.add(row); db.flush(); audit(db,p,'payroll.previewed',row.id,request,checksum=snap['checksum'],employee_count=len(results)); return row
@app.get('/runs')
def runs(p=Depends(principal),db=Depends(database)):
    require(p,'admin','payroll','approver','auditor')
    return db.scalars(select(Run).where(Run.tenant_id==p['tenant_id']).order_by(Run.id)).all()
@app.post('/runs/{id}/approve')
def approve(id:str,request:Request,p=Depends(principal),db=Depends(database)):
    require(p,'approver'); row=owned(db,Run,id,p,True)
    if row.maker==p['sub']: raise HTTPException(403,'Maker cannot approve their own payroll')
    if row.state!='preview': raise HTTPException(409,'Run is no longer awaiting review')
    row.checker=p['sub']; row.state='approved_simulation'; audit(db,p,'payroll.simulation_approved',id,request,checksum=row.snapshot['checksum']); return row
@app.post('/runs/{id}/finalize')
def finalize(id:str,p=Depends(principal),db=Depends(database)):
    require(p,'approver'); owned(db,Run,id,p,True)
    raise HTTPException(409,'Production finalization is disabled: statutory and reviewer validation outstanding')
@app.get('/runs/{id}/exports/{kind}')
def export(id:str,kind:str,request:Request,p=Depends(principal),db=Depends(database)):
    require(p,'admin','payroll','approver','auditor','employee'); row=owned(db,Run,id,p)
    privileged=bool(set(p['roles']).intersection({'admin','payroll','approver','auditor'}))
    if not privileged and kind!='payslips': raise HTTPException(403,'Only your own payslip is available')
    if kind in ['gtbank','statutory']: raise HTTPException(409,'Output blocked pending current specification, specialist sign-off and acceptance tests')
    if row.state!='approved_simulation': raise HTTPException(409,'Independent review required before simulation export')
    buf=io.StringIO(); w=csv.writer(buf)
    if kind in ['register','payslips']:
        w.writerow(['SIMULATION — NOT FOR PAYMENT','employee_code','gross_NGN','deductions_NGN','net_NGN','rule_version','checksum'])
        for r in row.snapshot['results']:
            if privileged or r['employee_id']==p.get('employee_id'):
                w.writerow(['SYNTHETIC',r['employee_code'],r['gross'],r['deductions'],r['net'],row.snapshot['rule']['version'],row.snapshot['checksum']])
    elif kind=='journal':
        w.writerow(['SIMULATION — NOT FOR POSTING','account','debit_NGN','credit_NGN','checksum'])
        # Synthetic control accounts; customer GL mapping must be reconciled before production.
        totals=row.snapshot['totals']; checksum=row.snapshot['checksum']
        w.writerow(['SYNTHETIC','SIM_PAYROLL_EXPENSE',totals['gross'],'0.00',checksum])
        w.writerow(['SYNTHETIC','SIM_REIMBURSEMENT',totals['reimbursements'],'0.00',checksum])
        w.writerow(['SYNTHETIC','SIM_DEDUCTION_PAYABLE','0.00',totals['deductions'],checksum])
        w.writerow(['SYNTHETIC','SIM_NET_PAYABLE','0.00',totals['net'],checksum])
    else: raise HTTPException(404,'Unknown export')
    audit(db,p,'payroll.simulation_exported',id,request,kind=kind)
    return Response(buf.getvalue(),media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="simulation-{kind}-{id}.csv"'})
