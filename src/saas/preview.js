// Clearly labelled design-preview fixtures. These never activate subscriptions or mutate production records.
const now=Date.now(),ago=days=>new Date(now-days*86400000).toISOString(),ahead=days=>ago(-days);
export const previewPlans=[
 {id:'starter',name:'Starter',description:'Everything an independent venue needs to get organized.',monthly_paise:99900,yearly_paise:999000,max_halls:1,max_staff:2,trial_days:14,published:true,version:1},
 {id:'growth',name:'Growth',description:'For growing teams and multiple celebration spaces.',monthly_paise:249900,yearly_paise:2499000,max_halls:3,max_staff:10,trial_days:14,published:true,version:1},
 {id:'scale',name:'Scale',description:'A single home for a multi-location venue business.',monthly_paise:499900,yearly_paise:4999000,max_halls:10,max_staff:30,trial_days:14,published:false,version:1},
];
const names=['The Grand Estate','Ganga Convention','Mithila Banquets','Royal Orchard','Lotus Palace','Suryavanshi Gardens','The Ivory Hall','Willow & Co.'];
export const previewOverview={
 organizations:names.map((name,i)=>({id:'org-'+i,name,billing_email:`owner${i+1}@example.test`,city:['Patna','Lucknow','Gaya','Delhi'][i%4],status:i===5?'suspended':'active',created_at:ago(3+i*9)})),
 subscriptions:names.map((_,i)=>({tenant_id:'org-'+i,plan_id:previewPlans[i%3].id,plan_snapshot:previewPlans[i%3],interval:i===2?'yearly':'monthly',status:i<4?'active':i<6?'trialing':'pending',paid_through:i<4?ahead(9+i*4):null,trial_until:i>=4&&i<6?ahead(7):null,checkout_state:'ready',provider_subscription_id:'preview_subscription_'+i})),
 usage:names.map((_,i)=>({tenant_id:'org-'+i,halls:i%3+1,staff:i%3+1})),
 plans:previewPlans,
 payments:names.slice(0,4).map((_,i)=>({tenant_id:'org-'+i,provider_payment_id:'preview_payment_'+i,amount_paise:previewPlans[i%3][i===2?'yearly_paise':'monthly_paise'],currency:'INR',captured_at:ago(i*5),created_at:ago(i*5)})),
 audit:[{id:1,action:'organization.created',tenant_id:'org-0',actor_id:'preview-owner',created_at:ago(0),details:{plan:'Starter'}},{id:2,action:'subscription.synced',tenant_id:'org-1',actor_id:null,created_at:ago(1),details:{status:'active'}},{id:3,action:'tenant.status',tenant_id:'org-5',actor_id:'preview-admin',created_at:ago(2),details:{status:'suspended',reason:'Example administrative review'}}],
 metrics:{organizations:8,activeSubscriptions:4,trials:2,suspended:1,mrrPaise:866283,grossCollectedPaise:5448700},
 setup:{database:false,mfa:false,billing:false,billingMode:'test',https:false,email:'Connect and verify your email provider',environment:'preview'},
};
