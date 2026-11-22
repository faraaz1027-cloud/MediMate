// Inspect the Git index, never private ignored configuration or matching values.
import {execFileSync} from 'node:child_process';
const git=args=>execFileSync('git',args,{maxBuffer:32*1024*1024});
const files=git(['ls-files','-z']).toString().split('\0').filter(Boolean);
const findings=[];
const syntheticTokens=new Set([
  '123456789:SYnthetic_Local_Only_Token_123456789',
  '123456789:SYnthetic_Inherited_Only_Token_12345',
]);
for(const name of files){
  if(/(^|\/)\.env(?:\.|$)/.test(name)&&!name.endsWith('.env.example')||/(^|\/)(?:node_modules|\.local-data|__pycache__)(\/|$)/.test(name)||/\.(?:pyc|har|heapsnapshot|key|pem|wt)$/.test(name)) findings.push({path:name,rule:'private/generated file'});
  const bytes=git(['show',':'+name]);if(bytes.includes(0))continue;
  const text=bytes.toString('utf8');
  const rules=[
    ['bot credential',/\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g],
    ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
    ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['database credential',/mongodb(?:\+srv)?:\/\/[^\s"'<>]*:[^\s"'<>]*@/g],
    ['session cookie',/medimate_session=[A-Za-z0-9_-]{20,}/g],
    ['conflict marker',/^(?:<<<<<<< |=======\s*$|>>>>>>> )/gm],
  ];
  for(const [rule,pattern] of rules)for(const match of text.matchAll(pattern)){
    if(rule==='bot credential'&&syntheticTokens.has(match[0])&&['server/test/local-telegram.test.js','verification/module1/startup-newman.mjs','scripts/check-publication.mjs'].includes(name))continue;
    findings.push({path:name,rule,line:text.slice(0,match.index).split('\n').length});
  }
}
if(findings.length){console.error(JSON.stringify({publicationCheck:'failed',findings},null,2));process.exitCode=1;}
else console.log(JSON.stringify({publicationCheck:'passed',indexedFiles:files.length,limits:'Pattern/index checks complement code and evidence review; not proof of absence of all private data.'}));
