// Read-only bot preflight. No getUpdates/sendMessage, webhook changes or raw
// upstream errors are printed. Token stays in the ignored private file/memory.
import fs from 'node:fs';
import {telegramSettings} from '../../scripts/local-telegram.mjs';
const output='docs/evidence/module1-telegram';fs.mkdirSync(output,{recursive:true});
try{
  const {token,username}=telegramSettings(fs.readFileSync('server/.env.telegram.local','utf8'));
  async function call(method){
    const response=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000)});
    const data=await response.json();
    if(!response.ok||data.ok!==true)throw Error('Telegram rejected the private bot configuration.');
    return data.result;
  }
  const me=await call('getMe');
  if(me.is_bot!==true||me.username?.toLowerCase()!==username.toLowerCase())throw Error('Configured bot username does not match the token.');
  const hook=await call('getWebhookInfo');
  const report={at:new Date().toISOString(),botUsername:me.username,tokenValidatedByGetMe:true,webhookConfigured:Boolean(hook.url),pendingUpdateCount:hook.pending_update_count,pollingReady:!hook.url,actualMessageDelivery:false,transport:'Actual Telegram HTTPS API; read-only getMe/getWebhookInfo only'};
  fs.writeFileSync(output+'/preflight.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
  if(hook.url){console.error('Existing webhook must be reviewed by the bot owner before polling; no webhook was changed.');process.exitCode=1;}
}catch{
  console.error('Bot preflight could not complete. Check private settings/network; no token or upstream error was printed.');process.exitCode=1;
}
