#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#define NO_COV __attribute__((no_sanitize("coverage")))
#define COV_MAX (1u<<20)
static uint8_t coverage[COV_MAX];
static uint32_t guards;
NO_COV void __sanitizer_cov_trace_pc_guard_init(uint32_t* start,uint32_t* stop){
  if(start==stop||*start)return;
  for(uint32_t* p=start;p<stop;p++){if(guards+1>=COV_MAX)abort();*p=++guards;}
}
NO_COV void __sanitizer_cov_trace_pc_guard(uint32_t* guard){if(*guard)coverage[*guard]=1;}
NO_COV uint8_t* raft_cov_ptr(void){return coverage;}
NO_COV uint32_t raft_cov_len(void){return guards+1;}
NO_COV void raft_cov_reset(void){memset(coverage,0,sizeof(coverage));}
