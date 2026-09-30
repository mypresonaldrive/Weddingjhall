export const integrationFields={
 razorpay:{label:'Payment gateway · Razorpay',hint:'Organization subscriptions and credit recharges. Saved credentials take effect after restarting all app instances. Do not switch Razorpay accounts with active mandates.',fields:[['keyId','Key ID'],['keySecret','Key secret',true],['webhookSecret','Webhook secret',true]]},
 email:{label:'Email · SMTP',hint:'Booking notifications only. Configure authentication email separately in Supabase. TLS is required.',fields:[['host','SMTP host'],['port','Port (465 or 587)'],['user','Username'],['password','Password',true],['from','Verified sender email']]},
 sms:{label:'SMS · MSG91',hint:'Use an approved Indian DLT flow with variables event, date, time, venue and organization (each capped at 30 characters). One credit per accepted API message; provider segment costs are separate.',fields:[['authKey','Auth key',true],['flowId','Approved flow ID'],['approved','I confirm this SMS template has provider / DLT approval',false,'checkbox']]},
 whatsapp:{label:'WhatsApp · Meta Cloud API',hint:'Approved utility template with one body parameter (message). Provider pricing is separate from your credit-pack prices.',fields:[['token','Permanent access token',true],['phoneId','Phone number ID'],['template','Approved template name'],['language','Template language (e.g. en)'],['approved','I confirm this WhatsApp utility template is approved',false,'checkbox']]},
 fcm:{label:'Push · Firebase Cloud Messaging',hint:'Platform push notifications for broadcasts and auto reminders. Device delivery additionally requires the web app to register browser tokens; in-app delivery works without it.',fields:[['projectId','Firebase project ID'],['senderId','Sender ID'],['serverKey','Server key / service credential',true],['vapidKey','Web push (VAPID) key — optional']]} 
};
export const channels=['email','sms','whatsapp'];

export const providerPlaceholders={projectId:'my-firebase-project',senderId:'123456789012',vapidKey:'Web push certificate key from Firebase console',keyId:'rzp_test_… or rzp_live_…',host:'smtp.your-provider.com',port:'587',user:'SMTP username from your provider',from:'bookings@your-domain.com',flowId:'MSG91 approved flow ID — not an email',phoneId:'Numeric Meta phone number ID',template:'booking_confirmation',language:'en or en_US'};
export function providerInputError(kind,key,value){
 if(!value)return '';
 if(kind==='razorpay'&&key==='keyId'&&!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(value))return 'Use a Razorpay API Key ID starting with rzp_test_ or rzp_live_, not your login email.';
 if(key==='phoneId'&&!/^\d+$/.test(value))return 'Use the numeric Phone Number ID from Meta, not your email or phone number.';
 if(key==='flowId'&&!/^[A-Za-z0-9]+$/.test(value))return 'Use the approved MSG91 Flow ID, not your login email.';
 if(key==='port'&&!['465','587'].includes(value))return 'Choose 465 (TLS) or 587 (STARTTLS).';
 if(key==='host'&&!/^[a-zA-Z0-9.-]+$/.test(value))return 'Enter a hostname only, without https:// or a port.';
 if(key==='from'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return 'Enter your verified sender email address.';
 if(key==='template'&&!/^[a-z0-9_]+$/.test(value))return 'Use the approved template name: lowercase letters, numbers and underscores.';
 if(key==='language'&&!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(value))return 'Use a language code such as en or en_US.';
 if(key==='projectId'&&!/^[a-z][a-z0-9-]{4,29}$/.test(value))return 'Use the Firebase project ID: lowercase letters, numbers and dashes.';
 if(key==='senderId'&&!/^\d{5,15}$/.test(value))return 'Use the numeric Firebase sender ID, not your email.';
 if(key==='vapidKey'&&value.length>200)return 'VAPID keys are under 200 characters; paste the web push certificate key only.';
 return '';
}
