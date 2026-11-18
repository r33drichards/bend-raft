import core from '../build/raft.mjs';
export function listToArray(xs) { const out=[];for(;xs.$==='Con';xs=xs.tail)out.push(xs.head);return out; }
// This is an in-process trusted-ADT adapter, NOT a wire parser. Authenticate peers,
// decode/validate every constructor, enforce payload limits before dispatch.
// Storage must atomically and durably save this full state before resolving.
export function server({state,persist,send,reply,resetTimer}) {
  if(![0,1,2].includes(state.id))throw Error('fixed voter IDs are 0, 1, 2');
  // Construction is always a process boot/recovery, never a live-state attach.
  // Ignore saved volatile leadership, replication progress and applied state.
  state=core.restart(structuredClone(state));
  let queue=Promise.resolve(),failed=false;
  return {
    dispatch(event) {
      const result=queue.then(async()=>{
        if(failed)throw Error('server stopped after host failure');
        const output=core.step(state,event);
        // No effects escape if persistence fails. Serial dispatch ensures no
        // intervening event can observe an unpersisted transition.
        await persist(structuredClone(output.state));
        state=output.state;
        for(const m of listToArray(output.sends))await send(m.to,structuredClone(m.message));
        for(const r of listToArray(output.replies))await reply(structuredClone(r));
        if(output.reset_timer)await resetTimer();
        return structuredClone(state);
      });
      queue=result.catch(()=>{failed=true;});
      return result;
    },
    snapshot(){return structuredClone(state);}
  };
}
export {core};
