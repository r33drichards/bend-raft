import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.env.BEND_ROOT || '../raft-bend-upstream');
const B = await import(pathToFileURL(path.join(root,'bend2/bend.ts')));
const C = await import(pathToFileURL(path.join(root,'bend2/comp.ts')));
try {
 const book=B.book_nil(); await B.book_load(book,path.resolve(process.argv[2] || 'src/raft.bend'),'',new Map()); B.book_valid(book);
 if(book.hols) throw Error('Proof/program holes');
 fs.mkdirSync('build',{recursive:true}); fs.writeFileSync('build/raft.mjs',C.js_lib(book,true));
 console.log('Checked Bend program and emitted build/raft.mjs');
} catch(e) { console.error(e?.$==='Err'? B.err_show(e):e); process.exit(1); }
