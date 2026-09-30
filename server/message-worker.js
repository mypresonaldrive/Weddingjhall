// Standalone notification worker process (recommended for production).
// Run exactly the instances you need: message_claim uses SELECT ... FOR UPDATE SKIP LOCKED,
// so concurrent workers are safe. Graceful stop waits for any in-flight provider send.
import {createClient} from '@supabase/supabase-js';
import {startMessageWorker} from './messaging.js';
const env=process.env;
if(env.MESSAGE_WORKER_ENABLED!=='true'){
 console.error('Set MESSAGE_WORKER_ENABLED=true for the dedicated worker process. Keep it unset on web replicas unless this deployment runs the worker in-process.');
 process.exit(1);
}
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']){
 if(!env[key]){console.error('Missing required environment variable: '+key);process.exit(1);}
}
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const result=async query=>{const {data,error}=await query;if(error)throw Error(error.message);return data;};
const rpc=(name,args)=>result(admin.rpc(name,args));
const stop=startMessageWorker({admin,result,rpc,keepAlive:true});
console.log('Gatherhall notification worker started; draining queued jobs every 5 seconds.');
for(const signal of ['SIGTERM','SIGINT']){
 process.on(signal,async()=>{
  console.log(signal+' received: finishing in-flight work before exit.');
  try{await stop();}catch{}
  process.exit(0);
 });
}
