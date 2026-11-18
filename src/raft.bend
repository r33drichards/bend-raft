# Pure fixed-membership Raft core. IDs are 0, 1, 2; terms/indexes are Nat.
# Host MUST durably persist term/vote/log before publishing any returned effect.
import Base


type Op is Data:
  Add{amount: Nat}
  Read{}
  Noop{}


type Entry is Data:
  Entry{term: Nat, client: Nat, seq: Nat, op: Op}


type Session is Data:
  Session{client: Nat, seq: Nat, result: Nat}


type Message is Data:
  Vote{term: Nat, candidate: Nat, last_index: Nat, last_term: Nat}
  Voted{term: Nat, voter: Nat, granted: Bool}
  Append{term: Nat, leader: Nat, prev_index: Nat, prev_term: Nat, entries: +List<Entry>, commit: Nat}
  Appended{term: Nat, follower: Nat, success: Bool, matched: Nat}


type RaftEvent is Data:
  Timeout{}
  Heartbeat{}
  Receive{from: Nat, message: Message}
  Request{client: Nat, seq: Nat, op: Op}


type Outgoing is Data:
  Send{to: Nat, message: Message}


type Reply is Data:
  Applied{client: Nat, seq: Nat, result: Nat}
  Retry{client: Nat, seq: Nat}
  Stale{client: Nat, seq: Nat}


type State is Data:
  State{id: Nat, term: Nat, vote: +Maybe<Nat>, log: +List<Entry>, role: Nat, votes: +List<Nat>, nexts: +List<Nat>, matches: +List<Nat>, commit: Nat, applied: Nat, value: Nat, sessions: +List<Session>}


type Output is Data:
  Output{state: State, sends: +List<Outgoing>, replies: +List<Reply>, reset_timer: Bool}


type Merge is Data:
  Merged{entries: +List<Entry>}
  Conflict{}



def choose_MaybeSession(b: Bool, yes: Unit -> +Maybe<Session>, no: Unit -> +Maybe<Session>) -> +Maybe<Session>:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

def choose_ListSession(b: Bool, yes: Unit -> +List<Session>, no: Unit -> +List<Session>) -> +List<Session>:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

def output_state(o: Output) -> State:
  match o:
    case Output{s,a,b,c}: s

def output_replies(o: Output) -> +List<Reply>:
  match o:
    case Output{s,a,b,c}: b

def get_id(s: State) -> Nat:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  id



def set_id(s: State, x: Nat) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{x, term, vote, log, role, votes, nexts, matches, commit, applied, value, sessions}



def get_term(s: State) -> Nat:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  term



def set_term(s: State, x: Nat) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, x, vote, log, role, votes, nexts, matches, commit, applied, value, sessions}



def get_vote(s: State) -> +Maybe<Nat>:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  vote



def set_vote(s: State, x: +Maybe<Nat>) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, x, log, role, votes, nexts, matches, commit, applied, value, sessions}



def get_log(s: State) -> +List<Entry>:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  log



def set_log(s: State, x: +List<Entry>) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, x, role, votes, nexts, matches, commit, applied, value, sessions}



def get_role(s: State) -> Nat:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  role



def set_role(s: State, x: Nat) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, log, x, votes, nexts, matches, commit, applied, value, sessions}



def get_votes(s: State) -> +List<Nat>:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  votes



def set_votes(s: State, x: +List<Nat>) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, log, role, x, nexts, matches, commit, applied, value, sessions}



def get_nexts(s: State) -> +List<Nat>:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  nexts



def set_nexts(s: State, x: +List<Nat>) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, log, role, votes, x, matches, commit, applied, value, sessions}



def get_matches(s: State) -> +List<Nat>:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  matches



def set_matches(s: State, x: +List<Nat>) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, log, role, votes, nexts, x, commit, applied, value, sessions}



def get_commit(s: State) -> Nat:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  commit



def set_commit(s: State, x: Nat) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, log, role, votes, nexts, matches, x, applied, value, sessions}



def get_applied(s: State) -> Nat:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  applied



def set_applied(s: State, x: Nat) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, log, role, votes, nexts, matches, commit, x, value, sessions}



def get_value(s: State) -> Nat:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  value



def set_value(s: State, x: Nat) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, log, role, votes, nexts, matches, commit, applied, x, sessions}



def get_sessions(s: State) -> +List<Session>:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  sessions



def set_sessions(s: State, x: +List<Session>) -> State:
  State{+id, +term, +vote, +log, +role, +votes, +nexts, +matches, +commit, +applied, +value, +sessions} = s
  State{id, term, vote, log, role, votes, nexts, matches, commit, applied, value, x}



def init(id: Nat) -> State:
  State{id, 0n, None{}, [], 0n, [], [1n,1n,1n], [0n,0n,0n], 0n,0n,0n,[]}



def restart(+s: State) -> State:
  State{get_id(s),get_term(s),get_vote(s),get_log(s),0n,[],[1n,1n,1n],[0n,0n,0n],0n,0n,0n,[]}



def length(xs: +List<Entry>) -> Nat:
  List.length(&2, Entry, xs)



def maybe_nat(x: +Maybe<Nat>) -> Nat:
  match x:
    case None{}: 0n
    case Some{+x}: x



def at(xs: +List<Nat>, n: Nat) -> Nat:
  maybe_nat(List.get(&2, Nat, xs, n))



def put(xs: +List<Nat>, n: Nat, x: Nat) -> +List<Nat>:
  List.set(&2, Nat, xs, n, x)



def maybe_term(x: +Maybe<Entry>) -> Nat:
  match x:
    case None{}: 0n
    case Some{Entry{+t,+c,+q,+o}}: t



def term_at(xs: +List<Entry>, n: Nat) -> Nat:
  match n:
    case 0n: 0n
    case 1n+n:
      maybe_term(List.get(&2, Entry, xs, n))



def choose_Bool(b: Bool, yes: Unit -> Bool, no: Unit -> Bool) -> Bool:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})


def contains(xs: +List<Nat>, +n: Nat) -> Bool:
  match xs:
    case Nil{}: False{}
    case Con{+h,+t}:
      choose_Bool(Nat.is_eq(h,n), u =>
        True{}
      , u =>
        contains(t,n)

      )


def choose_Nats(b: Bool, yes: Unit -> +List<Nat>, no: Unit -> +List<Nat>) -> +List<Nat>:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})


def add_vote(+xs: +List<Nat>, +n: Nat) -> +List<Nat>:
  choose_Nats(contains(xs,n), u =>
    xs
  , u =>
    Con{n,xs}

  )


def valid_id(n: Nat) -> Bool:
  Nat.is_lt(n,3n)



def majority(xs: +List<Nat>) -> Bool:
  Nat.is_ge(List.length(&2,Nat,xs),2n)



def quiet(s: State) -> Output:
  Output{s,[],[],False{}}



def choose_State(b: Bool, yes: Unit -> State, no: Unit -> State) -> State:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})


def higher(+s: State, +t: Nat) -> State:
  choose_State(Nat.is_gt(t,get_term(s)), u =>
    set_votes(set_role(set_vote(set_term(s,t),None{}),0n),[])
  , u =>
    s

  )


def message_term(m: Message) -> Nat:
  match m:
    case Vote{+t,+c,+i,+l}: t
    case Voted{+t,+v,+g}: t
    case Append{+t,+l,+p,+pt,+e,+c}: t
    case Appended{+t,+f,+s,+m}: t



def choose_Sends(b: Bool, yes: Unit -> +List<Outgoing>, no: Unit -> +List<Outgoing>) -> +List<Outgoing>:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})


def send_all(+s: State, +m: Message, peers: +List<Nat>) -> +List<Outgoing>:
  match peers:
    case Nil{}: []
    case Con{+p,+ps}:
      choose_Sends(Nat.is_eq(p,get_id(s)), u =>
        send_all(s,m,ps)
      , u =>
        Con{Send{p,m},send_all(s,m,ps)}

      )


def append_to(+s: State, +peer: Nat) -> Outgoing:
  +n = at(get_nexts(s),peer)
  +prev = Nat.sub(n,1n)
  Send{peer,Append{get_term(s),get_id(s),prev,term_at(get_log(s),prev),List.drop(&2,Entry,get_log(s),prev),get_commit(s)}}



def replicate(+s: State, peers: +List<Nat>) -> +List<Outgoing>:
  match peers:
    case Nil{}: []
    case Con{+p,+ps}:
      choose_Sends(Nat.is_eq(p,get_id(s)), u =>
        replicate(s,ps)
      , u =>
        Con{append_to(s,p),replicate(s,ps)}

      )


def start_election(+s: State) -> Output:
  +t = Nat.add(1n,get_term(s))
  +me = get_id(s)
  +s = set_votes(set_role(set_vote(set_term(s,t),Some{me}),1n),[me])
  +n = length(get_log(s))
  Output{s,send_all(s,Vote{t,me,n,term_at(get_log(s),n)},[0n,1n,2n]),[],True{}}



def become_leader(+s: State) -> Output:
  # A current-term no-op allows commitment of inherited entries.
  +old = length(get_log(s))
  +log = List.append(&2,Entry,get_log(s),[Entry{get_term(s),0n,0n,Noop{}}])
  +s = set_matches(set_nexts(set_role(set_log(s,log),2n),[1n+old,1n+old,1n+old]),put([0n,0n,0n],get_id(s),1n+old))
  Output{s,replicate(s,[0n,1n,2n]),[],True{}}



def vote_allowed(v: +Maybe<Nat>, +c: Nat) -> Bool:
  match v:
    case None{}: True{}
    case Some{+n}: Nat.is_eq(n,c)



def choose_Output(b: Bool, yes: Unit -> Output, no: Unit -> Output) -> Output:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})


def vote_request(+s: State, +t: Nat, +c: Nat, +i: Nat, +lt: Nat) -> Output:
  +ours = length(get_log(s))
  +ot = term_at(get_log(s),ours)
  +fresh = Bool.or(Nat.is_gt(lt,ot),Bool.and(Nat.is_eq(lt,ot),Nat.is_ge(i,ours)))
  +grant = Bool.and(Nat.is_eq(t,get_term(s)),Bool.and(vote_allowed(get_vote(s),c),fresh))
  choose_Output(grant, u =>
    Output{set_vote(s,Some{c}),[Send{c,Voted{get_term(s),get_id(s),True{}}}],[],True{}}
  , u =>
    Output{s,[Send{c,Voted{get_term(s),get_id(s),False{}}}],[],False{}}

  )


def vote_reply(+s: State, t: Nat, +v: Nat, g: Bool) -> Output:
  choose_Output(Bool.and(Nat.is_eq(get_role(s),1n),Bool.and(Nat.is_eq(t,get_term(s)),g)), u =>
    +s = set_votes(s,add_vote(get_votes(s),v))
    choose_Output(majority(get_votes(s)), u =>
      become_leader(s)
    , u =>
      quiet(s)
    )
  , u =>
    quiet(s)

  )
# Merge retains an existing suffix when incoming entries end. Only an actual
# term conflict removes a suffix. A conflict at/below commit is rejected.

def merge_cons(x: Entry, m: Merge) -> Merge:
  match m:
    case Merged{+rest}: Merged{Con{x,rest}}
    case Conflict{}: Conflict{}


def choose_Merge(b: Bool, yes: Unit -> Merge, no: Unit -> Merge) -> Merge:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})


def merge_entries(xs: +List<Entry>, ys: +List<Entry>, +index: Nat, +commit: Nat) -> Merge:
  match xs ys:
    case xs Nil{}: Merged{xs}
    case Nil{} ys: Merged{ys}
    case Con{Entry{+a,+c,+q,+o},+xt} Con{Entry{+b,+d,+r,+p},+yt}:
      +x = {Entry{a,c,q,o} : Entry}
      +y = {Entry{b,d,r,p} : Entry}
      choose_Merge(Nat.is_eq(a,b), u =>
        merge_cons(x,merge_entries(xt,yt,1n+index,commit))
      , u =>
        choose_Merge(Nat.is_le(index,commit), u =>
          Conflict{}
        , u =>
          Merged{Con{y,yt}}

        )
      )


def append_fail(+s: State, l: Nat, reset: Bool) -> Output:
  Output{s,[Send{l,Appended{get_term(s),get_id(s),False{},0n}}],[],reset}



def session_find(xs: +List<Session>, +c: Nat) -> +Maybe<Session>:
  match xs:
    case Nil{}: None{}
    case Con{+h,+t}:
      Session{+id,+q,+r} = h
      choose_MaybeSession(Nat.is_eq(id,c), u =>
        Some{h}
      , u =>
        session_find(t,c)

      )


def session_put(xs: +List<Session>, +x: Session) -> +List<Session>:
  match xs:
    case Nil{}: [x]
    case Con{+h,+t}:
      Session{+a,+q,+r} = h
      Session{+b,+j,+z} = x
      choose_ListSession(Nat.is_eq(a,b), u =>
        Con{x,t}
      , u =>
        Con{h,session_put(t,x)}

      )


def do_op(op: Op, value: Nat) -> Nat:
  match op:
    case Add{+a}: Nat.add(value,a)
    case Read{}: value
    case Noop{}: value



def apply_session(+s: State, +c: Nat, +q: Nat, +op: Op, session: +Maybe<Session>) -> Output:
  match session:
    case Some{Session{+id,+old,+result}}:
      choose_Output(Nat.is_le(q,old), u =>
        choose_Output(Nat.is_eq(q,old), u =>
          Output{s,[],[Applied{c,q,result}],False{}}
        , u =>
          Output{s,[],[Stale{c,q}],False{}}
        )
      , u =>
        +value = do_op(op,get_value(s))
        +s = set_sessions(set_value(s,value),session_put(get_sessions(s),Session{c,q,value}))
        Output{s,[],[Applied{c,q,value}],False{}}
      )
    case None{}:
      +value = do_op(op,get_value(s))
      +s = set_sessions(set_value(s,value),session_put(get_sessions(s),Session{c,q,value}))
      Output{s,[],[Applied{c,q,value}],False{}}



def apply_one(+s: State, +e: Entry) -> Output:
  Entry{+t,+c,+q,+op} = e
  match op:
    case Noop{}: quiet(s)
    case op:
      apply_session(s,c,q,op,session_find(get_sessions(s),c))



def apply_next(+s: State, entry: +Maybe<Entry>) -> Output:
  match entry:
    case None{}: quiet(s)
    case Some{+e}: apply_one(set_applied(s,1n+get_applied(s)),e)



def apply_committed(fuel: Nat, +s: State) -> Output:
  match fuel:
    case 0n: quiet(s)
    case 1n+fuel:
      choose_Output(Nat.is_lt(get_applied(s),get_commit(s)), u =>
        +out = apply_next(s,List.get(&2,Entry,get_log(s),get_applied(s)))
        +s = output_state(out)
        +rs = output_replies(out)
        +out2 = apply_committed(fuel,s)
        +s = output_state(out2)
        +tail = output_replies(out2)
        Output{s,[],List.append(&2,Reply,rs,tail),False{}}
      , u =>
        quiet(s)

      )


def append_merge(+s: State, l: Nat, +pi: Nat, es: +List<Entry>, lc: Nat, merged: Merge) -> Output:
  match merged:
    case Conflict{}: append_fail(s,l,True{})
    case Merged{+tail}:
      +matched = Nat.add(pi,length(es))
      +log = List.append(&2,Entry,List.take(&2,Entry,get_log(s),pi),tail)
      +s = set_commit(set_log(s,log),Nat.max(get_commit(s),Nat.min(lc,matched)))
      +s = output_state(apply_committed(length(get_log(s)),s))
      Output{s,[Send{l,Appended{get_term(s),get_id(s),True{},matched}}],[],True{}}



def append_request(+s: State, +t: Nat, +l: Nat, +pi: Nat, +pt: Nat, +es: +List<Entry>, +lc: Nat) -> Output:
  choose_Output(Nat.is_lt(t,get_term(s)), u =>
    append_fail(s,l,False{})
  , u =>
    +s = set_role(s,0n)
    choose_Output(Bool.and(Nat.is_le(pi,length(get_log(s))),Nat.is_eq(pt,term_at(get_log(s),pi))), u =>
      append_merge(s,l,pi,es,lc,merge_entries(List.drop(&2,Entry,get_log(s),pi),es,1n+pi,get_commit(s)))
    , u =>
      append_fail(s,l,True{})

    )
  )


def quorum_at(+s: State, +i: Nat) -> Bool:
  +a = Nat.is_ge(at(get_matches(s),0n),i)
  +b = Nat.is_ge(at(get_matches(s),1n),i)
  +c = Nat.is_ge(at(get_matches(s),2n),i)
  Bool.or(Bool.and(a,b),Bool.or(Bool.and(a,c),Bool.and(b,c)))



def choose_Nat(b: Bool, yes: Unit -> Nat, no: Unit -> Nat) -> Nat:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})


def find_commit(i: Nat, +s: State) -> Nat:
  match i:
    case 0n: get_commit(s)
    case 1n++p:
      choose_Nat(Nat.is_le(1n+p,get_commit(s)), u =>
        get_commit(s)
      , u =>
        choose_Nat(Bool.and(Nat.is_eq(term_at(get_log(s),1n+p),get_term(s)),quorum_at(s,1n+p)), u =>
          1n+p
        , u =>
          find_commit(p,s)

        )
      )


def append_reply(+s: State, t: Nat, +f: Nat, ok: Bool, +m: Nat) -> Output:
  choose_Output(Bool.and(Nat.is_eq(get_role(s),2n),Nat.is_eq(t,get_term(s))), u =>
    choose_Output(ok, u =>
      choose_Output(Nat.is_le(m,length(get_log(s))), u =>
        +m = Nat.max(m,at(get_matches(s),f))
        +s = set_matches(set_nexts(s,put(get_nexts(s),f,1n+m)),put(get_matches(s),f,m))
        +s = set_commit(s,find_commit(length(get_log(s)),s))
        +out = apply_committed(length(get_log(s)),s)
        +s = output_state(out)
        +rs = output_replies(out)
        Output{s,[],rs,False{}}
      , u =>
        quiet(s)
      )
    , u =>
      +next = Nat.max(1n+at(get_matches(s),f),Nat.sub(at(get_nexts(s),f),1n))
      +s = set_nexts(s,put(get_nexts(s),f,next))
      Output{s,[append_to(s,f)],[],False{}}
    )
  , u =>
    quiet(s)

  )


def receive_inner(+s: State, +from: Nat, m: Message) -> Output:
  match m:
    case Vote{+t,+c,+i,+l}:
      choose_Output(Nat.is_eq(from,c), u =>
        vote_request(s,t,c,i,l)
      , u =>
        quiet(s)
      )
    case Voted{+t,+v,+g}:
      choose_Output(Nat.is_eq(from,v), u =>
        vote_reply(s,t,v,g)
      , u =>
        quiet(s)
      )
    case Append{+t,+l,+p,+pt,+e,+c}:
      choose_Output(Nat.is_eq(from,l), u =>
        append_request(s,t,l,p,pt,e,c)
      , u =>
        quiet(s)
      )
    case Appended{+t,+f,+ok,+m}:
      choose_Output(Nat.is_eq(from,f), u =>
        append_reply(s,t,f,ok,m)
      , u =>
        quiet(s)
      )

def receive(+s: State, +from: Nat, +m: Message) -> Output:
  choose_Output(Bool.and(valid_id(from),Nat.is_ne(from,get_id(s))), u =>
    receive_inner(higher(s,message_term(m)),from,m)
  , u => quiet(s))

def request_leader(+s: State, +c: Nat, +q: Nat, op: Op) -> Output:
  match op:
    case Noop{}: Output{s,[],[Retry{c,q}],False{}}
    case op:
      +log = List.append(&2,Entry,get_log(s),[Entry{get_term(s),c,q,op}])
      +s = set_matches(set_log(s,log),put(get_matches(s),get_id(s),length(log)))
      Output{s,replicate(s,[0n,1n,2n]),[],False{}}

def request(+s: State, +c: Nat, +q: Nat, +op: Op) -> Output:
  choose_Output(Nat.is_eq(get_role(s),2n), u => request_leader(s,c,q,op), u => Output{s,[],[Retry{c,q}],False{}})

def step(+s: State, e: RaftEvent) -> Output:
  match e:
    case Timeout{}: start_election(s)
    case Heartbeat{}:
      choose_Output(Nat.is_eq(get_role(s),2n), u =>
        Output{s,replicate(s,[0n,1n,2n]),[],False{}}
      , u =>
        quiet(s)
      )
    case Receive{+from,+m}: receive(s,from,m)
    case Request{+c,+q,+op}: request(s,c,q,op)



def main() -> Nat:
  +s = output_state(step(init(0n),Timeout{}))
  +s = output_state(step(s,Receive{1n,Voted{1n,1n,True{}}}))
  +s = output_state(step(s,Request{7n,1n,Add{7n}}))
  +s = output_state(step(s,Receive{1n,Appended{1n,1n,True{},2n}}))
  get_value(s)



def choose_Outgoing(b: Bool, yes: Unit -> Outgoing, no: Unit -> Outgoing) -> Outgoing:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})



# Sequential client model. Keep this state durably if reusing a client id.
# One outstanding operation; retries retain the identical id/sequence/op.
type Client is Data:
  Client{id: Nat, next_seq: Nat, pending: +Maybe<Op>}

def client_init(id: Nat) -> Client:
  Client{id,1n,None{}}

def client_begin(c: Client, op: Op) -> Client:
  match c:
    case Client{id,q,None{}}: Client{id,q,Some{op}}
    case Client{id,q,Some{old}}: Client{id,q,Some{old}}

def client_request(c: Client) -> +Maybe<RaftEvent>:
  match c:
    case Client{id,q,None{}}: None{}
    case Client{id,q,Some{op}}: Some{Request{id,q,op}}

def choose_Client(b: Bool, yes: Unit -> Client, no: Unit -> Client) -> Client:
  match b:
    case True{}: yes(Unit{})
    case False{}: no(Unit{})

def client_reply(c: Client, r: Reply) -> Client:
  match c r:
    case Client{+id,+q,+p} Applied{who,seq,result}:
      choose_Client(Bool.and(Nat.is_eq(id,who),Nat.is_eq(q,seq)), u => Client{id,1n+q,None{}}, u => Client{id,q,p})
    case c Retry{who,seq}: c
    case c Stale{who,seq}: c

# Checked definitional equalities about the actual implementation, not a
# complete distributed safety proof.
def proof_restart_term(+s: State) -> {get_term(restart(s)) == get_term(s) : Nat}:
  {==}

def proof_restart_log(+s: State) -> {get_log(restart(s)) == get_log(s) : +List<Entry>}:
  {==}

def proof_restart_vote(+s: State) -> {get_vote(restart(s)) == get_vote(s) : +Maybe<Nat>}:
  {==}

def proof_sentinel(xs: +List<Entry>) -> {term_at(xs,0n) == 0n : Nat}:
  {==}
