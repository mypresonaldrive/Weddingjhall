// UTC month buckets keep reports consistent across browser timezones.
export function platformSeries(data,months=6,now=new Date()){
 const rows=Array.from({length:months},(_,i)=>{const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months+1+i,1));return {key:date.toISOString().slice(0,7),label:date.toLocaleDateString('en-IN',{month:'short',timeZone:'UTC'}),full:date.toLocaleDateString('en-IN',{month:'long',year:'numeric',timeZone:'UTC'}),organizations:0,revenue:0};});
 const byMonth=new Map(rows.map(r=>[r.key,r]));
 for(const o of data.organizations||[]){const date=new Date(o.created_at);if(!Number.isFinite(+date)||date>now)continue;const row=byMonth.get(date.toISOString().slice(0,7));if(row)row.organizations++;}
 for(const p of data.payments||[]){const date=new Date(p.captured_at),amount=Number(p.amount_paise);if(!Number.isFinite(+date)||date>now||!Number.isFinite(amount)||amount<=0||p.currency!=='INR')continue;const row=byMonth.get(date.toISOString().slice(0,7));if(row)row.revenue+=amount;}
 return rows;
}
