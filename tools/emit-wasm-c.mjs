import path from 'node:path';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const tool=path.resolve(process.env.BEND_WASM_ROOT||'../raft-bend-toolchain');
const {capabilities,emit}=await import(pathToFileURL(path.join(tool,'src/compiler.mjs')));
const cap=capabilities(path.resolve(process.env.BEND_ROOT||'../raft-bend-upstream'),null);
fs.mkdirSync('build',{recursive:true});
fs.writeFileSync('build/program.c',await emit(cap.root,'src/raft.bend'));
console.log('Pinned bend-wasm C emission PASS (not a Wasm execution test)');
