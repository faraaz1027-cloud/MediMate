import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const members=[
  {slug:'Ihfaz_Rashid_Sadat',short:'Sadat',id:'A1',port:1499,captures:10},
  {slug:'Faraaz_Jamil_Chowdhury',short:'Faraaz',id:'B1',port:1205,captures:11},
  {slug:'Sahir_Jawad_Chowdhury',short:'Sahir',id:'C1',port:1212,captures:14},
];
export function exportCollections(){
  const output=path.join(root,'postman/module1');fs.mkdirSync(output,{recursive:true});
  return members.map(member=>{
    const original=path.resolve(root,'../Members',member.slug,`MediMate_Assignment03_${member.slug}.postman_collection.json`);
    const collection=JSON.parse(fs.readFileSync(original,'utf8'));
    collection.item=collection.item.filter(item=>item.name.startsWith(member.id+' '));
    if(collection.item.length!==1)throw Error('Expected one complete Module 1 group for '+member.short);
    collection.info.name=`MediMate Module 1 ${member.short} ${member.id}`;
    collection.info.description=`Current Module 1-only export of the tested final Assignment 03 collection. All setup/intermediate requests in the ${member.id} folder are retained. Synthetic data; Telegram intentionally disabled in this collection; real receipt is a separate manual gate. Original full A1/A2, B1/B2 and C1/C2 collections remain unchanged.`;
    const filename=path.join(output,`MediMate_Module1_${member.short}.postman_collection.json`);
    fs.writeFileSync(filename,JSON.stringify(collection,null,2)+'\n');
    return {...member,filename,original,collection};
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(exportCollections().map(({short,filename,collection})=>({member:short,file:filename,requests:collection.item[0].item.length})),null,2));
