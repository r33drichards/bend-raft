// Ordered constructor/field schema; shared by generated Bend codec and JS host.
export const schema={
 Op:{Add:{amount:'Nat'},Read:{},Noop:{}},
 Entry:{Entry:{term:'Nat',client:'Nat',seq:'Nat',op:'Op'}},
 Session:{Session:{client:'Nat',seq:'Nat',result:'Nat'}},
 Nats:{Nil:{},Con:{head:'Nat',tail:'Nats'}},
 Entries:{Nil:{},Con:{head:'Entry',tail:'Entries'}},
 Sessions:{Nil:{},Con:{head:'Session',tail:'Sessions'}},
 MaybeNat:{None:{},Some:{value:'Nat'}},
 MaybeOp:{None:{},Some:{value:'Op'}},
 Message:{Vote:{term:'Nat',candidate:'Nat',last_index:'Nat',last_term:'Nat'},Voted:{term:'Nat',voter:'Nat',granted:'Bool'},Append:{term:'Nat',leader:'Nat',prev_index:'Nat',prev_term:'Nat',entries:'Entries',commit:'Nat'},Appended:{term:'Nat',follower:'Nat',success:'Bool',matched:'Nat'}},
 RaftEvent:{Timeout:{},Heartbeat:{},Receive:{from:'Nat',message:'Message'},Request:{client:'Nat',seq:'Nat',op:'Op'}},
 Outgoing:{Send:{to:'Nat',message:'Message'}},
 Reply:{Applied:{client:'Nat',seq:'Nat',result:'Nat'},Retry:{client:'Nat',seq:'Nat'},Stale:{client:'Nat',seq:'Nat'}},
 Sends:{Nil:{},Con:{head:'Outgoing',tail:'Sends'}},
 Replies:{Nil:{},Con:{head:'Reply',tail:'Replies'}},
 State:{State:{id:'Nat',term:'Nat',vote:'MaybeNat',log:'Entries',role:'Nat',votes:'Nats',nexts:'Nats',matches:'Nats',commit:'Nat',applied:'Nat',value:'Nat',sessions:'Sessions'}},
 Output:{Output:{state:'State',sends:'Sends',replies:'Replies',reset_timer:'Bool'}},
 Client:{Client:{id:'Nat',next_seq:'Nat',pending:'MaybeOp'}},
 MaybeEvent:{None:{},Some:{value:'RaftEvent'}},
 Call:{ServerInit:{id:'Nat'},ServerRestart:{state:'State'},ServerStep:{state:'State',event:'RaftEvent'},ClientInit:{id:'Nat'},ClientBegin:{client:'Client',op:'Op'},ClientRequest:{client:'Client'},ClientReply:{client:'Client',reply:'Reply'}},
 Answer:{ServerState:{state:'State'},ServerOutput:{output:'Output'},ClientState:{client:'Client'},ClientEvent:{event:'MaybeEvent'}}
};
export const bendType=t=>({Nats:'+List<Nat>',Entries:'+List<Entry>',Sessions:'+List<Session>',Sends:'+List<Outgoing>',Replies:'+List<Reply>',MaybeNat:'+Maybe<Nat>',MaybeOp:'+Maybe<Op>',MaybeEvent:'+Maybe<RaftEvent>'}[t]||t);
export function encode(type,value){
 if(type==='Nat'){if(!Number.isSafeInteger(value)||value<0||value>2**48-1)throw Error('invalid Nat');return [value];}
 if(type==='Bool'){if(typeof value!=='boolean')throw Error('invalid Bool');return [value?1:0];}
 const names=Object.keys(schema[type]),tag=names.indexOf(value?.$);if(tag<0)throw Error(`invalid ${type}`);
 const out=[tag];for(const [k,t]of Object.entries(schema[type][value.$])){const child=encode(t,value[k]);out.push(child.length,...child);}return out;
}
export function decode(type,xs){
 if(type==='Nat')return xs[0];if(type==='Bool')return !!xs[0];
 const name=Object.keys(schema[type])[xs[0]];if(!name)throw Error('invalid result constructor');const out={$:name};let p=1;
 for(const [k,t]of Object.entries(schema[type][name])){let n=xs[p++];out[k]=decode(t,xs.slice(p,p+n));p+=n;}if(p!==xs.length)throw Error('invalid result length');return out;
}
