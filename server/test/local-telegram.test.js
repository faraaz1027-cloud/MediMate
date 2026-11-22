import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {telegramSettings} from '../../scripts/local-telegram.mjs';

test('Explicit local Telegram startup accepts only valid Telegram fields and keeps errors free of secrets',()=>{
  const token='123456789:SYnthetic_Local_Only_Token_123456789';
  assert.deepEqual(telegramSettings(`TELEGRAM_BOT_TOKEN=${token}\nTELEGRAM_BOT_USERNAME=@medimate_test_bot\n`),{token,username:'medimate_test_bot'});
  for(const text of ['',`TELEGRAM_BOT_TOKEN=${token}\nTELEGRAM_BOT_USERNAME=bad!`,
    `TELEGRAM_BOT_TOKEN=${token}\nTELEGRAM_BOT_USERNAME=medimate_test_bot\nMONGODB_URI=mongodb://elsewhere/private`]) {
    assert.throws(()=>telegramSettings(text),error=>!error.message.includes(token));
  }
});

test('Private Telegram check CLI performs no transport/startup and masks invalid contents',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'medimate-telegram-'));
  const filename=path.join(dir,'private.env');
  const runner=fileURLToPath(new URL('../../scripts/local-telegram.mjs',import.meta.url));
  const token='123456789:SYnthetic_Local_Only_Token_123456789';
  try {
    writeFileSync(filename,`TELEGRAM_BOT_TOKEN=${token}\nTELEGRAM_BOT_USERNAME=medimate_test_bot\n`);
    const valid=spawnSync(process.execPath,[runner,filename,'check'],{encoding:'utf8',timeout:5000});
    assert.equal(valid.status,0,valid.stderr);assert.match(valid.stdout,/syntax validation only/);
    assert.ok(!valid.stdout.includes(token) && !valid.stderr.includes(token));
    writeFileSync(filename,`TELEGRAM_BOT_TOKEN=${token}\nTELEGRAM_BOT_USERNAME=invalid!\n`);
    const invalid=spawnSync(process.execPath,[runner,filename,'check'],{encoding:'utf8',timeout:5000});
    assert.equal(invalid.status,1);assert.ok(!invalid.stderr.includes(token));
    const missing=spawnSync(process.execPath,[runner,path.join(dir,'missing.env'),'check'],{encoding:'utf8',timeout:5000});
    assert.equal(missing.status,1);assert.match(missing.stderr,/missing or unreadable/);
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(tmpdir())+path.sep+'medimate-telegram-'));
    rmSync(dir,{recursive:true,force:true});
  }
});
