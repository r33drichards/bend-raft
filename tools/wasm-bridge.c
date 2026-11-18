// Internal adapter for the pinned runtime. No consensus logic lives in C.
// ABI: uint64 little-endian Nat words; results owned until next raft_call.
static u64* raft_heap;
static u64* raft_output;
static u32 raft_output_len;
static u32 raft_output_cap;
#define RAFT_WORD_LIMIT 1048576u
int raft_call(const u64* words, u32 count) {
  if(count > RAFT_WORD_LIMIT) return 1;
  for(u32 i=0;i<count;i++) if(words[i]>NAT_IMM)return 2;
  if(!raft_heap){raft_heap=corpus_setup(false,1,0);io_stk=pool_stack();}
  Env e={raft_heap,ALC[0]};
  if(fid_arity(FID_api_wire)!=1)return 3;
  Term xs=term_pak(CID_Nil,0);
  for(u32 i=count;i>0;i--){
    u64 loc=heap_alloc(e,cls_fit(2));
    e.mem[loc]=words[i-1];e.mem[loc+1]=rfc_seal(e,xs);
    xs=term_ctr(CID_Con,loc);
  }
  u64 task=task_node(e,FID_api_wire,TERM_HOLE,0,0);e.mem[task]=xs;
  Term result=corpus_eval(raft_heap,term_tsk(FID_api_wire,task));
  raft_output_len=0;
  for(Term cur=result;term_aux(cur)==CID_Con;){
    if(raft_output_len==RAFT_WORD_LIMIT){term_drop(e,result);return 4;}
    if(raft_output_len==raft_output_cap){raft_output_cap=raft_output_cap?raft_output_cap*2:1024;raft_output=realloc(raft_output,raft_output_cap*sizeof(u64));if(!raft_output)abort();}
    u64 loc=term_peek(raft_heap,cur);raft_output[raft_output_len++]=raft_heap[loc];cur=raft_heap[loc+1];
  }
  term_drop(e,result);
  return 0;
}
u64* raft_out_ptr(void){return raft_output;}
u32 raft_out_len(void){return raft_output_len;}
