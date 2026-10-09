// Standard Web Push (VAPID) sender. Browsers register PushSubscriptions and the
// worker delivers standard-encrypted payloads — no client SDK or extra config needed.
import webpush from 'web-push';

// Sends one payload to every subscription. Returns {ok, invalid:[endpoint]}.
export async function sendWebPush(cfg,subscriptions,notification){
 let send;try{webpush.setVapidDetails(cfg.subject,cfg.vapidPublic,cfg.vapidPrivate);send=webpush.sendNotification;}catch{throw Error('Push credentials are invalid. Regenerate the VAPID key pair.');}
 const payload=JSON.stringify({title:String(notification.title||'Gatherhall').slice(0,120),body:String(notification.body||'').slice(0,900),url:notification.url||'/'});
 const invalid=[];let ok=false;
 for(const sub of subscriptions.slice(0,500)){
  try{await send(sub,payload,{TTL:3600});ok=true;}
  catch(error){const code=error?.statusCode;if(code===404||code===410)invalid.push(sub.endpoint);}
 }
 return {ok,invalid};
}
