# Build tool concatenates this with raft.bend after renaming its main.

type Call is Data:
  ServerInit{id: Nat}
  ServerRestart{state: State}
  ServerStep{state: State, event: RaftEvent}
  ClientInit{id: Nat}
  ClientBegin{client: Client, op: Op}
  ClientRequest{client: Client}
  ClientReply{client: Client, reply: Reply}

type Answer is Data:
  ServerState{state: State}
  ServerOutput{output: Output}
  ClientState{client: Client}
  ClientEvent{event: +Maybe<RaftEvent>}

def api(call: Call) -> Answer:
  match call:
    case ServerInit{id}: ServerState{init(id)}
    case ServerRestart{s}: ServerState{restart(s)}
    case ServerStep{s,e}: ServerOutput{step(s,e)}
    case ClientInit{id}: ClientState{client_init(id)}
    case ClientBegin{c,o}: ClientState{client_begin(c,o)}
    case ClientRequest{c}: ClientEvent{client_request(c)}
    case ClientReply{c,r}: ClientState{client_reply(c,r)}

def main() -> Answer:
  api(ServerInit{0n})
