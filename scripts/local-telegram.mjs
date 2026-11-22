// Explicit local-only bridge: read just the two Telegram settings, then run the
// real API/worker with the database/origin already selected by local.ps1.
import fs from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {createTelegram} from '../server/v1/telegram.js';

export function telegramSettings(text) {
  let parsed;
  try { parsed=parseEnv(text); } catch { throw Error('Invalid private Telegram environment file.'); }
  const allowed=['TELEGRAM_BOT_TOKEN','TELEGRAM_BOT_USERNAME'];
  if(Object.keys(parsed).some(key=>!allowed.includes(key)))
    throw Error('The Telegram-only environment file may contain only TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME.');
  const token=(parsed.TELEGRAM_BOT_TOKEN||'').trim();
  const username=(parsed.TELEGRAM_BOT_USERNAME||'').trim().replace(/^@/,'');
  if(!createTelegram({token,username}).enabled)
    throw Error('Set a valid test bot token and username in the private Telegram environment file.');
  return {token,username};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [filename,mode,...extra]=process.argv.slice(2);
    if(!filename || !['server','worker','check'].includes(mode) || extra.length)
      throw Error('Usage: node scripts/local-telegram.mjs <private-env-file> server|worker|check');
    let raw;
    try {raw=fs.readFileSync(filename,'utf8');} catch {throw Error('Private Telegram environment file is missing or unreadable.');}
    const settings=telegramSettings(raw);
    if(mode==='check') {
      console.log('Private Telegram settings passed syntax validation only. No database or Telegram request was made; bot ownership and delivery are unverified.');
    } else {
      process.env.TELEGRAM_BOT_TOKEN=settings.token;
      process.env.TELEGRAM_BOT_USERNAME=settings.username;
      await import(new URL(mode==='worker'?'../server/worker.js':'../server/index.js',import.meta.url));
    }
  } catch(error) {
    // Never echo file contents, a token, upstream URLs containing tokens, or a stack.
    console.error(error.message);
    process.exitCode=1;
  }
}
