const fs=require('fs');
const lines=fs.readFileSync(process.argv[2],'utf8').split(/\r?\n/).map(l=>l.trim()).filter(l=>/^[a-z]/i.test(l)&&l.includes(':'));
const deps=lines.map(l=>{const p=l.split(':');return {g:p[0],a:p[1],v:p[3]}}).filter(d=>d.v);
const queries=deps.map(d=>({package:{ecosystem:'Maven',name:d.g+':'+d.a},version:d.v.replace(/[^0-9A-Za-z.\-]/g,'')}));
(async()=>{const r=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({queries})});
 const j=await r.json(); const hits=[]; j.results.forEach((x,i)=>{ if(x.vulns&&x.vulns.length) hits.push({dep:deps[i].g+':'+deps[i].a+':'+deps[i].v, ids:x.vulns.map(v=>v.id)}) });
 console.log('dependencies checked:',deps.length,'| with known advisories:',hits.length);
 for(const h of hits){ console.log(' -',h.dep); for(const id of h.ids.slice(0,6)){ const d=await (await fetch('https://api.osv.dev/v1/vulns/'+id)).json(); console.log('     ',id,(d.database_specific&&d.database_specific.severity)||'?','|',(d.summary||'').slice(0,90)) } }
})();
