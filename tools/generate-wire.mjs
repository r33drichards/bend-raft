import {schema,bendType} from './wire-schema.mjs';
import fs from 'node:fs';
const nat=n=>`${n}n`;
function fallback(t){if(t==='Nat')return '0n';if(t==='Bool')return 'False{}';const [k,fs]=Object.entries(schema[t])[0];return `${k}{${Object.values(fs).map(fallback).join(',')}}`;}
let code=`
def wire_head(xs: +List<Nat>) -> Nat:
  match xs:
    case Nil{}: 0n
    case Con{h,t}: h

def wire_field_at(n: Nat, xs: +List<Nat>) -> +List<Nat>:
  match n xs:
    case 0n Nil{}: []
    case 0n Con{len,tail}: List.take(&2,Nat,tail,len)
    case 1n+n Nil{}: []
    case 1n+n Con{len,tail}: wire_field_at(n,List.drop(&2,Nat,tail,len))

def wire_field(+xs: +List<Nat>, n: Nat) -> +List<Nat>:
  wire_field_at(n,List.drop(&2,Nat,xs,1n))

def wire_pack(+xs: +List<Nat>, tail: +List<Nat>) -> +List<Nat>:
  Con{List.length(&2,Nat,xs),List.append(&2,Nat,xs,tail)}

def encode_Nat(x: Nat) -> +List<Nat>:
  [x]

def encode_Bool(x: Bool) -> +List<Nat>:
  match x:
    case False{}: [0n]
    case True{}: [1n]

def decode_Nat(fuel: Nat, tag: Nat, xs: +List<Nat>) -> Nat:
  wire_head(xs)

def decode_Bool(fuel: Nat, tag: Nat, xs: +List<Nat>) -> Bool:
  Nat.is_ne(wire_head(xs),0n)
`;
for(const [t,ctors]of Object.entries(schema)){
 code+=`\ndef encode_${t}(x: ${bendType(t)}) -> +List<Nat>:\n  match x:\n`;
 Object.entries(ctors).forEach(([name,fields],tag)=>{
 const es=Object.entries(fields);let tail='[]';for(let i=es.length-1;i>=0;i--)tail=`wire_pack(encode_${es[i][1]}(f${i}),${tail})`;
 code+=`    case ${name}{${es.map((_,i)=>`f${i}`).join(',')}}: Con{${nat(tag)},${tail}}\n`;
 });
 code+=`\ndef decode_${t}(fuel: Nat, tag: Nat, +xs: +List<Nat>) -> ${bendType(t)}:\n  match fuel:\n    case 0n: ${fallback(t)}\n    case 1n++fuel:\n`;
 const addCases=(entries,depth)=>{
  const pad=' '.repeat(depth);code+=`${pad}match tag:\n`;
  const make=(name,fields)=>`${name}{${Object.values(fields).map((ty,i)=>`decode_${ty}(fuel,wire_head(wire_field(xs,${nat(i)})),wire_field(xs,${nat(i)}))`).join(',')}}`;
  const [[name,fields],...tail]=entries;
  code+=`${pad}  case 0n: ${make(name,fields)}\n`;
  code+=`${pad}  case 1n+tag:`;
  if(tail.length){code+='\n';addCases(tail,depth+4);}else code+=` ${fallback(t)}\n`;
 };
 addCases(Object.entries(ctors),6);
}
code+=`\ndef api_wire(+xs: +List<Nat>) -> +List<Nat>:\n  encode_Answer(api(decode_Call(List.length(&2,Nat,xs),wire_head(xs),xs)))\n`;
fs.mkdirSync('build',{recursive:true});
fs.writeFileSync('build/wasm-source.bend',fs.readFileSync('src/raft.bend','utf8').replace('def main()', 'def smoke_main()')+'\n'+fs.readFileSync('src/wasm.bend','utf8')+'\n'+code);
