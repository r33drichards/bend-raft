import fs from 'node:fs';import {createHash} from 'node:crypto';import path from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
const root=path.resolve(process.env.BEND_ROOT||'../raft-bend-upstream');
const tool=path.resolve(process.env.BEND_WASM_ROOT||'../raft-bend-toolchain');
const emcc=path.resolve(process.env.EMCC||'../emsdk/upstream/emscripten/emcc');
const {capabilities}=await import(pathToFileURL(path.join(tool,'src/compiler.mjs')));
const {adaptRuntime}=await import(pathToFileURL(path.join(tool,'src/runtime.mjs')));
const cap=capabilities(root,emcc);
await import('./generate-wire.mjs');
// Derived compiler copy, never modifying the verified upstream checkout. Two
// explicit changes retain the api_wire root in the C backend reachability graph.
let compiler=fs.readFileSync(path.join(root,'bend2/comp.ts'),'utf8');
function replace(a,b){if(compiler.split(a).length!==2)throw Error('compiler pin mismatch');compiler=compiler.replace(a,b);}
replace('"./bend.ts"',JSON.stringify(pathToFileURL(path.join(root,'bend2/bend.ts')).href));
replace('file_book(["main", ...RUNTIME_ADTS]);','file_book(["main", "api_wire", ...RUNTIME_ADTS]);');
replace('reach(["main", ...FL.fids].map(seg_fid))','reach(["main", "api_wire", ...FL.fids].map(seg_fid))');
fs.writeFileSync('build/compiler-abi.ts',compiler);
const B=await import(pathToFileURL(path.join(root,'bend2/bend.ts')));
const C=await import(pathToFileURL(path.resolve('build/compiler-abi.ts')));
const book=B.book_nil();try{await B.book_load(book,fs.realpathSync('build/wasm-source.bend'),'',new Map());B.book_valid(book);}catch(e){throw Error(B.err_show(e));}
if(book.hols)throw Error('holes');
let c=adaptRuntime(C.compile_book(book));
if(!c.includes('#define FID_api_wire '))throw Error('wire root missing');
// Scalarize the tail-dispatch Env argument: aggregate by-value Env under
// wasm32 musttail uses caller-stack storage that deep tail chains overwrite.
function patch(a,b){if(c.split(a).length!==2)throw Error('runtime ABI pin mismatch');c=c.replace(a,b);}
patch('#define WL_SIG Env e,', '#define WL_SIG u64* abi_mem, u64* abi_alc,');
patch('#define WL_ALL e, sp,', '#define WL_ALL e.mem, e.alc, sp,');
patch('#define WL_CASE(F) WL_FN WL_##F(WL_SIG) {', '#define WL_CASE(F) WL_FN WL_##F(WL_SIG) { Env e = {abi_mem,abi_alc};');
c=c.replace('int main(int argc, char** argv) {','int unused_cli_main(int argc, char** argv) {');
c+='\n'+fs.readFileSync('tools/wasm-bridge.c','utf8');
fs.writeFileSync('build/wasm-core.c',c);
fs.mkdirSync('build/wasm',{recursive:true});
const flags=['-O1','-mtail-call','-fsanitize-coverage=trace-pc-guard','-sALLOW_MEMORY_GROWTH=1','-sMAXIMUM_MEMORY=1073741824','-sSTACK_SIZE=8388608','-sENVIRONMENT=node','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORTED_FUNCTIONS=["_raft_call","_raft_out_ptr","_raft_out_len","_raft_cov_ptr","_raft_cov_len","_raft_cov_reset","_malloc","_free"]','-sEXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPU32"]','--no-entry','-o','build/wasm/raft.mjs'];
execFileSync(emcc,['build/wasm-core.c','tools/coverage.c',...flags],{stdio:'inherit',env:{...process.env,EM_CACHE:path.resolve('build/.emcache')}});
const {root:compilerPath,...versions}=cap;
const sha256=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const inputs=['src/raft.bend','src/wasm.bend','tools/generate-wire.mjs','tools/wire-schema.mjs','tools/wasm-bridge.c','tools/coverage.c'];
fs.writeFileSync('build/wasm/build.json',JSON.stringify({...versions,sha256:Object.fromEntries([...inputs,'build/wasm/raft.wasm'].map(f=>[f,sha256(f)])),abi:'raft-list-nat-v1',instrumentation:'LLVM trace-pc-guard, full C module incl runtime and codec',flags},null,2));
console.log('Built actual callable instrumented WebAssembly: build/wasm/raft.wasm');
