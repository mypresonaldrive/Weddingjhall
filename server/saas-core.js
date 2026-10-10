import { createHmac, timingSafeEqual } from 'node:crypto';
export function equalSignature(value,expected){if(typeof value!=='string'||!/^[a-f\d]{64}$/i.test(value))return false;return timingSafeEqual(Buffer.from(value,'hex'),Buffer.from(expected,'hex'));}
export function verifyCheckout(paymentId,subscriptionId,signature,secret){return equalSignature(signature,createHmac('sha256',secret).update(paymentId+'|'+subscriptionId).digest('hex'));}
export function verifyWebhook(raw,signature,secret){return equalSignature(signature,createHmac('sha256',secret).update(raw).digest('hex'));}
export function entitlement(organization,subscription,now=Date.now()){
 const paid=subscription?.paid_through&&Date.parse(subscription.paid_through)>now;
 const trial=subscription?.trial_until&&Date.parse(subscription.trial_until)>now;
 return {active:organization?.status==='active'&&!!(paid||trial),readOnly:organization?.status!=='active'||(!paid&&!trial),reason:organization?.status==='suspended'?'Organization suspended':paid?'Paid subscription':trial?'Free trial':'Subscription inactive',expiresAt:paid?subscription.paid_through:subscription?.trial_until||null};
}
export function publicPlan(plan){return {id:plan.id,name:plan.name,description:plan.description,monthly_paise:Number(plan.monthly_paise),yearly_paise:Number(plan.yearly_paise),max_halls:plan.max_halls,max_staff:plan.max_staff,trial_days:plan.trial_days,published:plan.published,version:plan.version};}
export function billingMetrics(organizations,subscriptions,payments,now=Date.now()){
 const active=subscriptions.filter(s=>s.paid_through&&Date.parse(s.paid_through)>now);
 return {organizations:organizations.length,activeSubscriptions:active.length,trials:subscriptions.filter(s=>!(s.paid_through&&Date.parse(s.paid_through)>now)&&Date.parse(s.trial_until)>now).length,suspended:organizations.filter(o=>o.status==='suspended').length,mrrPaise:Math.round(active.reduce((sum,s)=>sum+Number(s.plan_snapshot[s.interval==='yearly'?'yearly_paise':'monthly_paise'])/(s.interval==='yearly'?12:1),0)),grossCollectedPaise:payments.reduce((sum,p)=>sum+Number(p.amount_paise),0)};
}
