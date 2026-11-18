function word_to_u32(w) {
  let x = 0;
  for (let i = 0; w.$ === "WCon"; i++) {
    x |= Number(w.head) << i;
    w = w.tail;
  }
  return x >>> 0;
}

function u32_to_word(x) {
  let w = {$: "WNil"};
  for (let i = 31; i >= 0; i--) {
    w = {$: "WCon", head: ((x >>> i) & 1) === 1, tail: w};
  }
  return w;
}

function cmp_new(a, b) {
  return {$: a < b ? "LT" : a === b ? "EQ" : "GT"};
}

function nat_divmod(a, b) {
  return b === 0 ? {$: "Tuple", fst: 0, snd: a}
    : {$: "Tuple", fst: Math.trunc(a / b), snd: a % b};
}

function nat_chk(n) {
  if (n > 281474976710655) {
    throw "bend: a Nat past the largest immediate 2^48-1";
  }
  return n;
}

function nat_in(n) {
  if (!Number.isInteger(n) || n < 0 || n > 2 ** 53) {
    throw "bend: expected a Nat host number: an integer from 0 to 2^53";
  }
  return n;
}

function f32_show(x) {
  let s = "nan";
  for (let p = 1; x === x && p <= 9 && f32_round(s) !== x; p += 1) {
    s = String(Number(x.toExponential(p - 1)));
  }
  return (Object.is(x, -0) ? "-0" : s).replace("Infinity", "inf");
}

function f32_bits(x) {
  return new Uint32Array(new Float32Array([x]).buffer)[0];
}

function f32_from_bits(u) {
  return new Float32Array(new Uint32Array([u]).buffer)[0];
}

function f32_read(s) {
  const re = /^[\t\n\v\f\r ]*[+-]?((\d+(?:\.\d*)?|\.\d+)(e[+-]?\d+)?|inf(inity)?|nan)$/i;
  const v = f32_round(s.replace(/inf\w*/i, "Infinity"));
  return re.test(s) ? {$: "Some", value: v} : {$: "None"};
}

const f32_round = function f32_round(s        )         {
  const d = Number(s);
  const a = Math.abs(d);
  const f = Math.fround(a);
  const g = 2 * a - Math.min(f, 2 ** 128);
  if (g === f || Math.fround(g) !== g || g === Infinity) {
    return Math.sign(d) * f;
  }
  let k = 0;
  while (a * 2 ** k % 1 !== 0) {
    k += 1;
  }
  const [, i, r, e] = /(\d*)\.?(\d*)(?:e([+-]?\d+))?$/i.exec(s) ;
  const n = Number(e ?? 0) - r.length;
  const x = BigInt(i + r) * 2n ** BigInt(k) * 10n ** BigInt(Math.max(n, 0));
  const y = BigInt(a * 2 ** k) * 10n ** BigInt(Math.max(-n, 0));
  return Math.sign(d) * (x === y || x > y !== g > f ? f : g);
};

const char_new = function char_new(c        )         {
  return c < 0xD800 || c >= 0xE000 && c <= 0x10FFFF ? String.fromCodePoint(c)
    : String.fromCharCode(0xDC00, c >>> 22, c >>> 11 & 0x7FF, c & 0x7FF);
};

function char_len(s, at = 0) {
  return s[at] === "\uDC00" ? 4 : s.codePointAt(at) > 0xFFFF ? 2 : 1;
}

function char_code(s) {
  return s.length < 4 ? s.codePointAt(0)
    : (s.charCodeAt(1) << 22 | s.charCodeAt(2) << 11 | s.charCodeAt(3)) >>> 0;
}

function string_contains(s, p) {
  // A match starts at a Char, not inside a packed U32 code.
  for (let at = 0; at <= s.length; at += char_len(s, at)) {
    if (s.startsWith(p, at)) {
      return true;
    }
  }
  return false;
}

function str_out(s) {
  return s.replace(/\uDC00[^]{3}/gu, "\uFFFD");
}

function str_in(s) {
  return s.replace(/\p{Cs}/gu, "\uFFFD");
}

// Array
// =====

function array_new(d, v) {
  if (d > 31) {
    throw "bend: an array past the deepest block class 31";
  }
  return Array(2 ** d).fill(v);
}

function array_node(a, b) {
  if (a.length !== b.length) {
    throw "bend: runtime fail-stop";
  }
  return a.concat(b);
}

function array_rmw(a, i, f) {
  const at = i % a.length;
  const old = a[at];
  a[at] = f(old);
  return {$: "Tuple", fst: a, snd: old};
}

// Run
// ===

function run_tail(f, x) {
  return {$: "$JMP", f: f.j?.f === f ? f.j : f, x};
}

function run_clo(j) {
  const f = (x) => run_loop(j(x));
  f.j = j;
  j.f = f;
  return f;
}

function run_loop(r) {
  while (r !== null && typeof r === "object" && r.$ === "$JMP") {
    r = r.f(r.x);
  }
  return r;
}

function run_lib(f, n) {
  return (...a) => a.length < n ? run_lib((...b) => f(...a, ...b), n - a.length)
    : run_loop(f(...a));
}

// Effect
// ======

const $0eff = Object.create(null);
const io_file_append = new Set();

function io_eff(k, run) {
  if (arguments.length > 2) {
    throw new Error("bend: " + k + " takes no need: an effect that waits parks itself");
  }
  if (k in $0eff) {
    throw new Error("bend: two effects register " + k);
  }
  $0eff[k] = run;
}
// Program
// =======

function $choose_MaybeSession(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $choose_ListSession(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $output_state(_o_0) {
  const _s_0 = _o_0["state"];
  return _s_0;
}

function $output_replies(_o_0) {
  const _b_0 = _o_0["replies"];
  return _b_0;
}

function $get_id(_s_0) {
  const _id_0 = _s_0["id"];
  return _id_0;
}

function $set_id(_s_0, _x_0) {
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _x_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_term(_s_0) {
  const _term_0 = _s_0["term"];
  return _term_0;
}

function $set_term(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _x_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_vote(_s_0) {
  const _vote_0 = _s_0["vote"];
  return _vote_0;
}

function $set_vote(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _x_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_log(_s_0) {
  const _log_0 = _s_0["log"];
  return _log_0;
}

function $set_log(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _x_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_role(_s_0) {
  const _role_0 = _s_0["role"];
  return _role_0;
}

function $set_role(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _x_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_votes(_s_0) {
  const _votes_0 = _s_0["votes"];
  return _votes_0;
}

function $set_votes(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _x_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_nexts(_s_0) {
  const _nexts_0 = _s_0["nexts"];
  return _nexts_0;
}

function $set_nexts(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _x_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_matches(_s_0) {
  const _matches_0 = _s_0["matches"];
  return _matches_0;
}

function $set_matches(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _x_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_commit(_s_0) {
  const _commit_0 = _s_0["commit"];
  return _commit_0;
}

function $set_commit(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _x_0, "applied": _applied_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_applied(_s_0) {
  const _applied_0 = _s_0["applied"];
  return _applied_0;
}

function $set_applied(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _value_0 = _s_0["value"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _x_0, "value": _value_0, "sessions": _sessions_0};
}

function $get_value(_s_0) {
  const _value_0 = _s_0["value"];
  return _value_0;
}

function $set_value(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _sessions_0 = _s_0["sessions"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _x_0, "sessions": _sessions_0};
}

function $get_sessions(_s_0) {
  const _sessions_0 = _s_0["sessions"];
  return _sessions_0;
}

function $set_sessions(_s_0, _x_0) {
  const _id_0 = _s_0["id"];
  const _term_0 = _s_0["term"];
  const _vote_0 = _s_0["vote"];
  const _log_0 = _s_0["log"];
  const _role_0 = _s_0["role"];
  const _votes_0 = _s_0["votes"];
  const _nexts_0 = _s_0["nexts"];
  const _matches_0 = _s_0["matches"];
  const _commit_0 = _s_0["commit"];
  const _applied_0 = _s_0["applied"];
  const _value_0 = _s_0["value"];
  return {$: "State", "id": _id_0, "term": _term_0, "vote": _vote_0, "log": _log_0, "role": _role_0, "votes": _votes_0, "nexts": _nexts_0, "matches": _matches_0, "commit": _commit_0, "applied": _applied_0, "value": _value_0, "sessions": _x_0};
}

function $init(_id_0) {
  return {$: "State", "id": _id_0, "term": 0, "vote": {$: "None"}, "log": {$: "Nil"}, "role": 0, "votes": {$: "Nil"}, "nexts": {$: "Con", "head": 1, "tail": {$: "Con", "head": 1, "tail": {$: "Con", "head": 1, "tail": {$: "Nil"}}}}, "matches": {$: "Con", "head": 0, "tail": {$: "Con", "head": 0, "tail": {$: "Con", "head": 0, "tail": {$: "Nil"}}}}, "commit": 0, "applied": 0, "value": 0, "sessions": {$: "Nil"}};
}

function $restart(_s_0) {
  return {$: "State", "id": $$get_id(_s_0), "term": $$get_term(_s_0), "vote": $$get_vote(_s_0), "log": $$get_log(_s_0), "role": 0, "votes": {$: "Nil"}, "nexts": {$: "Con", "head": 1, "tail": {$: "Con", "head": 1, "tail": {$: "Con", "head": 1, "tail": {$: "Nil"}}}}, "matches": {$: "Con", "head": 0, "tail": {$: "Con", "head": 0, "tail": {$: "Con", "head": 0, "tail": {$: "Nil"}}}}, "commit": 0, "applied": 0, "value": 0, "sessions": {$: "Nil"}};
}

function $length(_xs_0) {
  return $List_length(_xs_0);
}

function $maybe_nat(_x_0) {
  if (_x_0.$ === "None") {
    return 0;
  } else {
    const _x_1 = _x_0["value"];
    return _x_1;
  }
}

function $at(_xs_0, _n_0) {
  return $maybe_nat($$List_get(_xs_0, _n_0));
}

function $put(_xs_0, _n_0, _x_0) {
  return $List_set(_xs_0, _n_0, _x_0);
}

function $maybe_term(_x_0) {
  if (_x_0.$ === "None") {
    return 0;
  } else {
    const _t_0 = _x_0["value"];
    const _t_1 = _t_0["term"];
    return _t_1;
  }
}

function $term_at(_xs_0, _n_0) {
  if (_n_0 == 0) {
    return 0;
  } else {
    const _n_1 = (_n_0 - 1);
    return $maybe_term($$List_get(_xs_0, _n_1));
  }
}

function $choose_Bool(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $contains(_xs_0, _n_0) {
  if (_xs_0.$ === "Nil") {
    return false;
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return $choose_Bool($$Nat_is_eq(_h_0, _n_0), run_clo($contains_c0()), run_clo($contains_c1(_t_0,_n_0)));
  }
}

function $contains_c0() {
  return (_x_0) => {
    return true;
  }
}
function $contains_c1(_t_0,_n_0) {
  return (_x_1) => {
    return $contains(_t_0, _n_0);
  }
}
function $choose_Nats(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $add_vote(_xs_0, _n_0) {
  return $choose_Nats($$contains(_xs_0, _n_0), run_clo($add_vote_c0(_xs_0)), run_clo($add_vote_c1(_xs_0,_n_0)));
}

function $add_vote_c0(_xs_0) {
  return (_x_0) => {
    return _xs_0;
  }
}
function $add_vote_c1(_xs_0,_n_0) {
  return (_x_1) => {
    return {$: "Con", "head": _n_0, "tail": _xs_0};
  }
}
function $valid_id(_n_0) {
  return (_n_0 < 3);
}

function $majority(_xs_0) {
  return $Nat_is_ge($$List_length(_xs_0), 2);
}

function $quiet(_s_0) {
  return {$: "Output", "state": _s_0, "sends": {$: "Nil"}, "replies": {$: "Nil"}, "reset_timer": false};
}

function $choose_State(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $higher(_s_0, _t_0) {
  return $choose_State($$Nat_is_gt(_t_0, $$get_term(_s_0)), run_clo($higher_c0(_t_0,_s_0)), run_clo($higher_c1(_s_0)));
}

function $higher_c0(_t_0,_s_0) {
  return (_x_0) => {
    return $set_votes($$set_role($$set_vote($$set_term(_s_0, _t_0), {$: "None"}), 0), {$: "Nil"});
  }
}
function $higher_c1(_s_0) {
  return (_x_1) => {
    return _s_0;
  }
}
function $message_term(_m_0) {
  if (_m_0.$ === "Vote") {
    const _t_0 = _m_0["term"];
    return _t_0;
  } else if (_m_0.$ === "Voted") {
    const _t_1 = _m_0["term"];
    return _t_1;
  } else if (_m_0.$ === "Append") {
    const _t_2 = _m_0["term"];
    return _t_2;
  } else {
    const _t_3 = _m_0["term"];
    return _t_3;
  }
}

function $choose_Sends(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $send_all(_s_0, _m_0, _peers_0) {
  if (_peers_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _p_0 = _peers_0["head"];
    const _ps_0 = _peers_0["tail"];
    return $choose_Sends($$Nat_is_eq(_p_0, $$get_id(_s_0)), run_clo($send_all_c0(_s_0,_m_0,_ps_0)), run_clo($send_all_c1(_s_0,_p_0,_m_0,_ps_0)));
  }
}

function $send_all_c0(_s_0,_m_0,_ps_0) {
  return (_x_0) => {
    return $send_all(_s_0, _m_0, _ps_0);
  }
}
function $send_all_c1(_s_0,_p_0,_m_0,_ps_0) {
  return (_x_1) => {
    return {$: "Con", "head": {$: "Send", "to": _p_0, "message": _m_0}, "tail": $$send_all(_s_0, _m_0, _ps_0)};
  }
}
function $append_to(_s_0, _peer_0) {
  const _n_0 = $$at($$get_nexts(_s_0), _peer_0);
  const _prev_0 = (_n_0 < 1 ? 0 : _n_0 - 1);
  return {$: "Send", "to": _peer_0, "message": {$: "Append", "term": $$get_term(_s_0), "leader": $$get_id(_s_0), "prev_index": _prev_0, "prev_term": $$term_at($$get_log(_s_0), _prev_0), "entries": $$List_drop($$get_log(_s_0), _prev_0), "commit": $$get_commit(_s_0)}};
}

function $replicate(_s_0, _peers_0) {
  if (_peers_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _p_0 = _peers_0["head"];
    const _ps_0 = _peers_0["tail"];
    return $choose_Sends($$Nat_is_eq(_p_0, $$get_id(_s_0)), run_clo($replicate_c0(_s_0,_ps_0)), run_clo($replicate_c1(_s_0,_ps_0,_p_0)));
  }
}

function $replicate_c0(_s_0,_ps_0) {
  return (_x_0) => {
    return $replicate(_s_0, _ps_0);
  }
}
function $replicate_c1(_s_0,_ps_0,_p_0) {
  return (_x_1) => {
    return {$: "Con", "head": $$append_to(_s_0, _p_0), "tail": $$replicate(_s_0, _ps_0)};
  }
}
function $start_election(_s_0) {
  const _x_0 = $$get_term(_s_0);
  const _t_0 = nat_chk(1 + _x_0);
  const _me_0 = $$get_id(_s_0);
  const _s_1 = $$set_votes($$set_role($$set_vote($$set_term(_s_0, _t_0), {$: "Some", "value": _me_0}), 1), {$: "Con", "head": _me_0, "tail": {$: "Nil"}});
  const _n_0 = $$length($$get_log(_s_1));
  return {$: "Output", "state": _s_1, "sends": $$send_all(_s_1, {$: "Vote", "term": _t_0, "candidate": _me_0, "last_index": _n_0, "last_term": $$term_at($$get_log(_s_1), _n_0)}, {$: "Con", "head": 0, "tail": {$: "Con", "head": 1, "tail": {$: "Con", "head": 2, "tail": {$: "Nil"}}}}), "replies": {$: "Nil"}, "reset_timer": true};
}

function $become_leader(_s_0) {
  const _old_0 = $$length($$get_log(_s_0));
  const _log_0 = $$List_append($$get_log(_s_0), {$: "Con", "head": {$: "Entry", "term": $$get_term(_s_0), "client": 0, "seq": 0, "op": {$: "Noop"}}, "tail": {$: "Nil"}});
  const _s_1 = $$set_matches($$set_nexts($$set_role($$set_log(_s_0, _log_0), 2), {$: "Con", "head": nat_chk(_old_0 + 1), "tail": {$: "Con", "head": nat_chk(_old_0 + 1), "tail": {$: "Con", "head": nat_chk(_old_0 + 1), "tail": {$: "Nil"}}}}), $$put({$: "Con", "head": 0, "tail": {$: "Con", "head": 0, "tail": {$: "Con", "head": 0, "tail": {$: "Nil"}}}}, $$get_id(_s_0), nat_chk(_old_0 + 1)));
  return {$: "Output", "state": _s_1, "sends": $$replicate(_s_1, {$: "Con", "head": 0, "tail": {$: "Con", "head": 1, "tail": {$: "Con", "head": 2, "tail": {$: "Nil"}}}}), "replies": {$: "Nil"}, "reset_timer": true};
}

function $vote_allowed(_v_0, _c_0) {
  if (_v_0.$ === "None") {
    return true;
  } else {
    const _n_0 = _v_0["value"];
    return $Nat_is_eq(_n_0, _c_0);
  }
}

function $choose_Output(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $vote_request(_s_0, _t_0, _c_0, _i_0, _lt_0) {
  const _ours_0 = $$length($$get_log(_s_0));
  const _ot_0 = $$term_at($$get_log(_s_0), _ours_0);
  const _x_0 = $$Nat_is_gt(_lt_0, _ot_0);
  const _x_1 = $$Bool_and($$Nat_is_eq(_lt_0, _ot_0), $$Nat_is_ge(_i_0, _ours_0));
  const _fresh_0 = (_x_0 || _x_1);
  const _grant_0 = $$Bool_and($$Nat_is_eq(_t_0, $$get_term(_s_0)), $$Bool_and($$vote_allowed($$get_vote(_s_0), _c_0), _fresh_0));
  return $choose_Output(_grant_0, run_clo($vote_request_c0(_c_0,_s_0)), run_clo($vote_request_c1(_c_0,_s_0)));
}

function $vote_request_c0(_c_0,_s_0) {
  return (_x_2) => {
    return {$: "Output", "state": $$set_vote(_s_0, {$: "Some", "value": _c_0}), "sends": {$: "Con", "head": {$: "Send", "to": _c_0, "message": {$: "Voted", "term": $$get_term(_s_0), "voter": $$get_id(_s_0), "granted": true}}, "tail": {$: "Nil"}}, "replies": {$: "Nil"}, "reset_timer": true};
  }
}
function $vote_request_c1(_c_0,_s_0) {
  return (_x_3) => {
    return {$: "Output", "state": _s_0, "sends": {$: "Con", "head": {$: "Send", "to": _c_0, "message": {$: "Voted", "term": $$get_term(_s_0), "voter": $$get_id(_s_0), "granted": false}}, "tail": {$: "Nil"}}, "replies": {$: "Nil"}, "reset_timer": false};
  }
}
function $vote_reply(_s_0, _t_0, _v_0, _g_0) {
  return $choose_Output($$Bool_and($$Nat_is_eq($$get_role(_s_0), 1), $$Bool_and($$Nat_is_eq(_t_0, $$get_term(_s_0)), _g_0)), run_clo($vote_reply_c0(_s_0,_v_0)), run_clo($vote_reply_c3(_s_0)));
}

function $vote_reply_c0(_s_0,_v_0) {
  return (_x_0) => {
    const _s_1 = $$set_votes(_s_0, $$add_vote($$get_votes(_s_0), _v_0));
    return $choose_Output($$majority($$get_votes(_s_1)), run_clo($vote_reply_c1(_s_1)), run_clo($vote_reply_c2(_s_1)));
  }
}
function $vote_reply_c1(_s_1) {
  return (_x_1) => {
    return $become_leader(_s_1);
  }
}
function $vote_reply_c2(_s_1) {
  return (_x_2) => {
    return $quiet(_s_1);
  }
}
function $vote_reply_c3(_s_0) {
  return (_x_3) => {
    return $quiet(_s_0);
  }
}
function $merge_cons(_x_0, _m_0) {
  if (_m_0.$ === "Merged") {
    const _rest_0 = _m_0["entries"];
    return {$: "Merged", "entries": {$: "Con", "head": _x_0, "tail": _rest_0}};
  } else {
    return {$: "Conflict"};
  }
}

function $choose_Merge(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $merge_entries(_xs_0, _ys_0, _index_0, _commit_0) {
  if (_xs_0.$ === "Nil") {
    if (_ys_0.$ === "Nil") {
      return {$: "Merged", "entries": {$: "Nil"}};
    } else {
      return {$: "Merged", "entries": _ys_0};
    }
  } else {
    const _t_0 = _xs_0["head"];
    const _a_0 = _t_0["term"];
    const _c_0 = _t_0["client"];
    const _q_0 = _t_0["seq"];
    const _o_0 = _t_0["op"];
    const _xt_0 = _xs_0["tail"];
    if (_ys_0.$ === "Nil") {
      return {$: "Merged", "entries": {$: "Con", "head": {$: "Entry", "term": _a_0, "client": _c_0, "seq": _q_0, "op": _o_0}, "tail": _xt_0}};
    } else {
      const _t_1 = _ys_0["head"];
      const _b_0 = _t_1["term"];
      const _d_0 = _t_1["client"];
      const _r_0 = _t_1["seq"];
      const _p_0 = _t_1["op"];
      const _yt_0 = _ys_0["tail"];
      const _x_0 = {$: "Entry", "term": _a_0, "client": _c_0, "seq": _q_0, "op": _o_0};
      const _y_0 = {$: "Entry", "term": _b_0, "client": _d_0, "seq": _r_0, "op": _p_0};
      return $choose_Merge($$Nat_is_eq(_a_0, _b_0), run_clo($merge_entries_c0(_index_0,_xt_0,_x_0,_commit_0,_yt_0)), run_clo($merge_entries_c1(_index_0,_commit_0,_y_0,_yt_0)));
    }
  }
}

function $merge_entries_c0(_index_0,_xt_0,_x_0,_commit_0,_yt_0) {
  return (_x_1) => {
    return $merge_cons(_x_0, $$merge_entries(_xt_0, _yt_0, nat_chk(_index_0 + 1), _commit_0));
  }
}
function $merge_entries_c1(_index_0,_commit_0,_y_0,_yt_0) {
  return (_x_2) => {
    return $choose_Merge($$Nat_is_le(_index_0, _commit_0), run_clo($merge_entries_c2()), run_clo($merge_entries_c3(_y_0,_yt_0)));
  }
}
function $merge_entries_c2() {
  return (_x_3) => {
    return {$: "Conflict"};
  }
}
function $merge_entries_c3(_y_0,_yt_0) {
  return (_x_4) => {
    return {$: "Merged", "entries": {$: "Con", "head": _y_0, "tail": _yt_0}};
  }
}
function $append_fail(_s_0, _l_0, _reset_0) {
  return {$: "Output", "state": _s_0, "sends": {$: "Con", "head": {$: "Send", "to": _l_0, "message": {$: "Appended", "term": $$get_term(_s_0), "follower": $$get_id(_s_0), "success": false, "matched": 0}}, "tail": {$: "Nil"}}, "replies": {$: "Nil"}, "reset_timer": _reset_0};
}

function $session_find(_xs_0, _c_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "None"};
  } else {
    const _t_0 = _xs_0["head"];
    const _id_0 = _t_0["client"];
    const _q_0 = _t_0["seq"];
    const _r_0 = _t_0["result"];
    const _t_1 = _xs_0["tail"];
    return $choose_MaybeSession($$Nat_is_eq(_id_0, _c_0), run_clo($session_find_c0(_r_0,_id_0,_q_0)), run_clo($session_find_c1(_c_0,_t_1)));
  }
}

function $session_find_c0(_r_0,_id_0,_q_0) {
  return (_x_0) => {
    return {$: "Some", "value": {$: "Session", "client": _id_0, "seq": _q_0, "result": _r_0}};
  }
}
function $session_find_c1(_c_0,_t_1) {
  return (_x_1) => {
    return $session_find(_t_1, _c_0);
  }
}
function $session_put(_xs_0, _x_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Con", "head": _x_0, "tail": {$: "Nil"}};
  } else {
    const _t_0 = _xs_0["head"];
    const _a_0 = _t_0["client"];
    const _q_0 = _t_0["seq"];
    const _r_0 = _t_0["result"];
    const _t_1 = _xs_0["tail"];
    const _b_0 = _x_0["client"];
    const _j_0 = _x_0["seq"];
    const _z_0 = _x_0["result"];
    return $choose_ListSession($$Nat_is_eq(_a_0, _b_0), run_clo($session_put_c0(_z_0,_b_0,_t_1,_j_0)), run_clo($session_put_c1(_r_0,_z_0,_b_0,_a_0,_t_1,_j_0,_q_0)));
  }
}

function $session_put_c0(_z_0,_b_0,_t_1,_j_0) {
  return (_x_1) => {
    return {$: "Con", "head": {$: "Session", "client": _b_0, "seq": _j_0, "result": _z_0}, "tail": _t_1};
  }
}
function $session_put_c1(_r_0,_z_0,_b_0,_a_0,_t_1,_j_0,_q_0) {
  return (_x_2) => {
    return {$: "Con", "head": {$: "Session", "client": _a_0, "seq": _q_0, "result": _r_0}, "tail": $$session_put(_t_1, {$: "Session", "client": _b_0, "seq": _j_0, "result": _z_0})};
  }
}
function $do_op(_op_0, _value_0) {
  if (_op_0.$ === "Add") {
    const _a_0 = _op_0["amount"];
    return nat_chk(_value_0 + _a_0);
  } else if (_op_0.$ === "Read") {
    return _value_0;
  } else {
    return _value_0;
  }
}

function $apply_session(_s_0, _c_0, _q_0, _op_0, _session_0) {
  if (_session_0.$ === "Some") {
    const _t_0 = _session_0["value"];
    const _old_0 = _t_0["seq"];
    const _result_0 = _t_0["result"];
    return $choose_Output($$Nat_is_le(_q_0, _old_0), run_clo($apply_session_c0(_old_0,_c_0,_result_0,_q_0,_s_0)), run_clo($apply_session_c3(_c_0,_op_0,_q_0,_s_0)));
  } else {
    const _value_1 = $$do_op(_op_0, $$get_value(_s_0));
    const _s_2 = $$set_sessions($$set_value(_s_0, _value_1), $$session_put($$get_sessions(_s_0), {$: "Session", "client": _c_0, "seq": _q_0, "result": _value_1}));
    return {$: "Output", "state": _s_2, "sends": {$: "Nil"}, "replies": {$: "Con", "head": {$: "Applied", "client": _c_0, "seq": _q_0, "result": _value_1}, "tail": {$: "Nil"}}, "reset_timer": false};
  }
}

function $apply_session_c0(_old_0,_c_0,_result_0,_q_0,_s_0) {
  return (_x_0) => {
    return $choose_Output($$Nat_is_eq(_q_0, _old_0), run_clo($apply_session_c1(_c_0,_result_0,_q_0,_s_0)), run_clo($apply_session_c2(_c_0,_q_0,_s_0)));
  }
}
function $apply_session_c1(_c_0,_result_0,_q_0,_s_0) {
  return (_x_1) => {
    return {$: "Output", "state": _s_0, "sends": {$: "Nil"}, "replies": {$: "Con", "head": {$: "Applied", "client": _c_0, "seq": _q_0, "result": _result_0}, "tail": {$: "Nil"}}, "reset_timer": false};
  }
}
function $apply_session_c2(_c_0,_q_0,_s_0) {
  return (_x_2) => {
    return {$: "Output", "state": _s_0, "sends": {$: "Nil"}, "replies": {$: "Con", "head": {$: "Stale", "client": _c_0, "seq": _q_0}, "tail": {$: "Nil"}}, "reset_timer": false};
  }
}
function $apply_session_c3(_c_0,_op_0,_q_0,_s_0) {
  return (_x_3) => {
    const _value_0 = $$do_op(_op_0, $$get_value(_s_0));
    const _s_1 = $$set_sessions($$set_value(_s_0, _value_0), $$session_put($$get_sessions(_s_0), {$: "Session", "client": _c_0, "seq": _q_0, "result": _value_0}));
    return {$: "Output", "state": _s_1, "sends": {$: "Nil"}, "replies": {$: "Con", "head": {$: "Applied", "client": _c_0, "seq": _q_0, "result": _value_0}, "tail": {$: "Nil"}}, "reset_timer": false};
  }
}
function $apply_one(_s_0, _e_0) {
  const _c_0 = _e_0["client"];
  const _q_0 = _e_0["seq"];
  const _t_1 = _e_0["op"];
  if (_t_1.$ === "Noop") {
    return $quiet(_s_0);
  } else {
    return $apply_session(_s_0, _c_0, _q_0, _t_1, $$session_find($$get_sessions(_s_0), _c_0));
  }
}

function $apply_next(_s_0, _entry_0) {
  if (_entry_0.$ === "None") {
    return $quiet(_s_0);
  } else {
    const _e_0 = _entry_0["value"];
    return $apply_one($$set_applied(_s_0, nat_chk($$get_applied(_s_0) + 1)), _e_0);
  }
}

function $apply_committed(_fuel_0, _s_0) {
  if (_fuel_0 == 0) {
    return $quiet(_s_0);
  } else {
    const _fuel_1 = (_fuel_0 - 1);
    const _x_0 = $$get_applied(_s_0);
    const _x_1 = $$get_commit(_s_0);
    return $choose_Output((_x_0 < _x_1), run_clo($apply_committed_c0(_fuel_1,_s_0)), run_clo($apply_committed_c1(_s_0)));
  }
}

function $apply_committed_c0(_fuel_1,_s_0) {
  return (_x_2) => {
    const _out_0 = $$apply_next(_s_0, $$List_get($$get_log(_s_0), $$get_applied(_s_0)));
    const _s_1 = $$output_state(_out_0);
    const _rs_0 = $$output_replies(_out_0);
    const _out2_0 = $$apply_committed(_fuel_1, _s_1);
    const _s_2 = $$output_state(_out2_0);
    const _tail_0 = $$output_replies(_out2_0);
    return {$: "Output", "state": _s_2, "sends": {$: "Nil"}, "replies": $$List_append(_rs_0, _tail_0), "reset_timer": false};
  }
}
function $apply_committed_c1(_s_0) {
  return (_x_3) => {
    return $quiet(_s_0);
  }
}
function $append_merge(_s_0, _l_0, _pi_0, _es_0, _lc_0, _merged_0) {
  if (_merged_0.$ === "Conflict") {
    return $append_fail(_s_0, _l_0, true);
  } else {
    const _tail_0 = _merged_0["entries"];
    const _x_0 = $$length(_es_0);
    const _matched_0 = nat_chk(_pi_0 + _x_0);
    const _log_0 = $$List_append($$List_take($$get_log(_s_0), _pi_0), _tail_0);
    const _x_1 = $$get_commit(_s_0);
    const _x_2 = (_lc_0 < _matched_0 ? _lc_0 : _matched_0);
    const _s_1 = $$set_commit($$set_log(_s_0, _log_0), (_x_1 > _x_2 ? _x_1 : _x_2));
    const _s_2 = $$output_state($$apply_committed($$length($$get_log(_s_1)), _s_1));
    return {$: "Output", "state": _s_2, "sends": {$: "Con", "head": {$: "Send", "to": _l_0, "message": {$: "Appended", "term": $$get_term(_s_2), "follower": $$get_id(_s_2), "success": true, "matched": _matched_0}}, "tail": {$: "Nil"}}, "replies": {$: "Nil"}, "reset_timer": true};
  }
}

function $append_request(_s_0, _t_0, _l_0, _pi_0, _pt_0, _es_0, _lc_0) {
  const _x_0 = $$get_term(_s_0);
  return $choose_Output((_t_0 < _x_0), run_clo($append_request_c0(_s_0,_l_0)), run_clo($append_request_c1(_pt_0,_s_0,_lc_0,_l_0,_es_0,_pi_0)));
}

function $append_request_c0(_s_0,_l_0) {
  return (_x_1) => {
    return $append_fail(_s_0, _l_0, false);
  }
}
function $append_request_c1(_pt_0,_s_0,_lc_0,_l_0,_es_0,_pi_0) {
  return (_x_2) => {
    const _s_1 = $$set_role(_s_0, 0);
    return $choose_Output($$Bool_and($$Nat_is_le(_pi_0, $$length($$get_log(_s_1))), $$Nat_is_eq(_pt_0, $$term_at($$get_log(_s_1), _pi_0))), run_clo($append_request_c2(_lc_0,_l_0,_es_0,_s_1,_pi_0)), run_clo($append_request_c3(_l_0,_s_1)));
  }
}
function $append_request_c2(_lc_0,_l_0,_es_0,_s_1,_pi_0) {
  return (_x_3) => {
    return $append_merge(_s_1, _l_0, _pi_0, _es_0, _lc_0, $$merge_entries($$List_drop($$get_log(_s_1), _pi_0), _es_0, nat_chk(_pi_0 + 1), $$get_commit(_s_1)));
  }
}
function $append_request_c3(_l_0,_s_1) {
  return (_x_4) => {
    return $append_fail(_s_1, _l_0, true);
  }
}
function $quorum_at(_s_0, _i_0) {
  const _a_0 = $$Nat_is_ge($$at($$get_matches(_s_0), 0), _i_0);
  const _b_0 = $$Nat_is_ge($$at($$get_matches(_s_0), 1), _i_0);
  const _c_0 = $$Nat_is_ge($$at($$get_matches(_s_0), 2), _i_0);
  const _x_0 = $$Bool_and(_a_0, _c_0);
  const _x_1 = $$Bool_and(_b_0, _c_0);
  const _x_2 = $$Bool_and(_a_0, _b_0);
  const _x_3 = (_x_0 || _x_1);
  return (_x_2 || _x_3);
}

function $choose_Nat(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $find_commit(_i_0, _s_0) {
  if (_i_0 == 0) {
    return $get_commit(_s_0);
  } else {
    const _p_0 = (_i_0 - 1);
    return $choose_Nat($$Nat_is_le(_i_0, $$get_commit(_s_0)), run_clo($find_commit_c0(_s_0)), run_clo($find_commit_c1(_p_0,_i_0,_s_0)));
  }
}

function $find_commit_c0(_s_0) {
  return (_x_0) => {
    return $get_commit(_s_0);
  }
}
function $find_commit_c1(_p_0,_i_0,_s_0) {
  return (_x_1) => {
    return $choose_Nat($$Bool_and($$Nat_is_eq($$term_at($$get_log(_s_0), _i_0), $$get_term(_s_0)), $$quorum_at(_s_0, _i_0)), run_clo($find_commit_c2(_i_0)), run_clo($find_commit_c3(_p_0,_s_0)));
  }
}
function $find_commit_c2(_i_0) {
  return (_x_2) => {
    return _i_0;
  }
}
function $find_commit_c3(_p_0,_s_0) {
  return (_x_3) => {
    return $find_commit(_p_0, _s_0);
  }
}
function $append_reply(_s_0, _t_0, _f_0, _ok_0, _m_0) {
  return $choose_Output($$Bool_and($$Nat_is_eq($$get_role(_s_0), 2), $$Nat_is_eq(_t_0, $$get_term(_s_0))), run_clo($append_reply_c0(_s_0,_m_0,_f_0,_ok_0)), run_clo($append_reply_c5(_s_0)));
}

function $append_reply_c0(_s_0,_m_0,_f_0,_ok_0) {
  return (_x_0) => {
    return $choose_Output(_ok_0, run_clo($append_reply_c1(_s_0,_m_0,_f_0)), run_clo($append_reply_c4(_s_0,_f_0)));
  }
}
function $append_reply_c1(_s_0,_m_0,_f_0) {
  return (_x_1) => {
    return $choose_Output($$Nat_is_le(_m_0, $$length($$get_log(_s_0))), run_clo($append_reply_c2(_s_0,_m_0,_f_0)), run_clo($append_reply_c3(_s_0)));
  }
}
function $append_reply_c2(_s_0,_m_0,_f_0) {
  return (_x_2) => {
    const _x_3 = $$at($$get_matches(_s_0), _f_0);
    const _m_1 = (_m_0 > _x_3 ? _m_0 : _x_3);
    const _s_1 = $$set_matches($$set_nexts(_s_0, $$put($$get_nexts(_s_0), _f_0, nat_chk(_m_1 + 1))), $$put($$get_matches(_s_0), _f_0, _m_1));
    const _s_2 = $$set_commit(_s_1, $$find_commit($$length($$get_log(_s_1)), _s_1));
    const _out_0 = $$apply_committed($$length($$get_log(_s_2)), _s_2);
    const _s_3 = $$output_state(_out_0);
    const _rs_0 = $$output_replies(_out_0);
    return {$: "Output", "state": _s_3, "sends": {$: "Nil"}, "replies": _rs_0, "reset_timer": false};
  }
}
function $append_reply_c3(_s_0) {
  return (_x_4) => {
    return $quiet(_s_0);
  }
}
function $append_reply_c4(_s_0,_f_0) {
  return (_x_5) => {
    const _x_6 = $$at($$get_nexts(_s_0), _f_0);
    const _x_7 = nat_chk($$at($$get_matches(_s_0), _f_0) + 1);
    const _x_8 = (_x_6 < 1 ? 0 : _x_6 - 1);
    const _next_0 = (_x_7 > _x_8 ? _x_7 : _x_8);
    const _s_4 = $$set_nexts(_s_0, $$put($$get_nexts(_s_0), _f_0, _next_0));
    return {$: "Output", "state": _s_4, "sends": {$: "Con", "head": $$append_to(_s_4, _f_0), "tail": {$: "Nil"}}, "replies": {$: "Nil"}, "reset_timer": false};
  }
}
function $append_reply_c5(_s_0) {
  return (_x_9) => {
    return $quiet(_s_0);
  }
}
function $receive_inner(_s_0, _from_0, _m_0) {
  if (_m_0.$ === "Vote") {
    const _t_0 = _m_0["term"];
    const _c_0 = _m_0["candidate"];
    const _i_0 = _m_0["last_index"];
    const _l_0 = _m_0["last_term"];
    return $choose_Output($$Nat_is_eq(_from_0, _c_0), run_clo($receive_inner_c0(_l_0,_c_0,_t_0,_s_0,_i_0)), run_clo($receive_inner_c1(_s_0)));
  } else if (_m_0.$ === "Voted") {
    const _t_1 = _m_0["term"];
    const _v_0 = _m_0["voter"];
    const _g_0 = _m_0["granted"];
    return $choose_Output($$Nat_is_eq(_from_0, _v_0), run_clo($receive_inner_c2(_v_0,_t_1,_s_0,_g_0)), run_clo($receive_inner_c3(_s_0)));
  } else if (_m_0.$ === "Append") {
    const _t_2 = _m_0["term"];
    const _l_1 = _m_0["leader"];
    const _p_0 = _m_0["prev_index"];
    const _pt_0 = _m_0["prev_term"];
    const _e_0 = _m_0["entries"];
    const _c_1 = _m_0["commit"];
    return $choose_Output($$Nat_is_eq(_from_0, _l_1), run_clo($receive_inner_c4(_e_0,_t_2,_p_0,_c_1,_l_1,_s_0,_pt_0)), run_clo($receive_inner_c5(_s_0)));
  } else {
    const _t_3 = _m_0["term"];
    const _f_0 = _m_0["follower"];
    const _ok_0 = _m_0["success"];
    const _m_1 = _m_0["matched"];
    return $choose_Output($$Nat_is_eq(_from_0, _f_0), run_clo($receive_inner_c6(_ok_0,_t_3,_m_1,_f_0,_s_0)), run_clo($receive_inner_c7(_s_0)));
  }
}

function $receive_inner_c0(_l_0,_c_0,_t_0,_s_0,_i_0) {
  return (_x_0) => {
    return $vote_request(_s_0, _t_0, _c_0, _i_0, _l_0);
  }
}
function $receive_inner_c1(_s_0) {
  return (_x_1) => {
    return $quiet(_s_0);
  }
}
function $receive_inner_c2(_v_0,_t_1,_s_0,_g_0) {
  return (_x_2) => {
    return $vote_reply(_s_0, _t_1, _v_0, _g_0);
  }
}
function $receive_inner_c3(_s_0) {
  return (_x_3) => {
    return $quiet(_s_0);
  }
}
function $receive_inner_c4(_e_0,_t_2,_p_0,_c_1,_l_1,_s_0,_pt_0) {
  return (_x_4) => {
    return $append_request(_s_0, _t_2, _l_1, _p_0, _pt_0, _e_0, _c_1);
  }
}
function $receive_inner_c5(_s_0) {
  return (_x_5) => {
    return $quiet(_s_0);
  }
}
function $receive_inner_c6(_ok_0,_t_3,_m_1,_f_0,_s_0) {
  return (_x_6) => {
    return $append_reply(_s_0, _t_3, _f_0, _ok_0, _m_1);
  }
}
function $receive_inner_c7(_s_0) {
  return (_x_7) => {
    return $quiet(_s_0);
  }
}
function $receive(_s_0, _from_0, _m_0) {
  return $choose_Output($$Bool_and($$valid_id(_from_0), $$Nat_is_ne(_from_0, $$get_id(_s_0))), run_clo($receive_c0(_m_0,_s_0,_from_0)), run_clo($receive_c1(_s_0)));
}

function $receive_c0(_m_0,_s_0,_from_0) {
  return (_x_0) => {
    return $receive_inner($$higher(_s_0, $$message_term(_m_0)), _from_0, _m_0);
  }
}
function $receive_c1(_s_0) {
  return (_x_1) => {
    return $quiet(_s_0);
  }
}
function $request_leader(_s_0, _c_0, _q_0, _op_0) {
  if (_op_0.$ === "Noop") {
    return {$: "Output", "state": _s_0, "sends": {$: "Nil"}, "replies": {$: "Con", "head": {$: "Retry", "client": _c_0, "seq": _q_0}, "tail": {$: "Nil"}}, "reset_timer": false};
  } else {
    const _log_0 = $$List_append($$get_log(_s_0), {$: "Con", "head": {$: "Entry", "term": $$get_term(_s_0), "client": _c_0, "seq": _q_0, "op": _op_0}, "tail": {$: "Nil"}});
    const _s_1 = $$set_matches($$set_log(_s_0, _log_0), $$put($$get_matches(_s_0), $$get_id(_s_0), $$length(_log_0)));
    return {$: "Output", "state": _s_1, "sends": $$replicate(_s_1, {$: "Con", "head": 0, "tail": {$: "Con", "head": 1, "tail": {$: "Con", "head": 2, "tail": {$: "Nil"}}}}), "replies": {$: "Nil"}, "reset_timer": false};
  }
}

function $request(_s_0, _c_0, _q_0, _op_0) {
  return $choose_Output($$Nat_is_eq($$get_role(_s_0), 2), run_clo($request_c0(_c_0,_op_0,_q_0,_s_0)), run_clo($request_c1(_c_0,_q_0,_s_0)));
}

function $request_c0(_c_0,_op_0,_q_0,_s_0) {
  return (_x_0) => {
    return $request_leader(_s_0, _c_0, _q_0, _op_0);
  }
}
function $request_c1(_c_0,_q_0,_s_0) {
  return (_x_1) => {
    return {$: "Output", "state": _s_0, "sends": {$: "Nil"}, "replies": {$: "Con", "head": {$: "Retry", "client": _c_0, "seq": _q_0}, "tail": {$: "Nil"}}, "reset_timer": false};
  }
}
function $step(_s_0, _e_0) {
  if (_e_0.$ === "Timeout") {
    return $start_election(_s_0);
  } else if (_e_0.$ === "Heartbeat") {
    return $choose_Output($$Nat_is_eq($$get_role(_s_0), 2), run_clo($step_c0(_s_0)), run_clo($step_c1(_s_0)));
  } else if (_e_0.$ === "Receive") {
    const _from_0 = _e_0["from"];
    const _m_0 = _e_0["message"];
    return $receive(_s_0, _from_0, _m_0);
  } else {
    const _c_0 = _e_0["client"];
    const _q_0 = _e_0["seq"];
    const _op_0 = _e_0["op"];
    return $request(_s_0, _c_0, _q_0, _op_0);
  }
}

function $step_c0(_s_0) {
  return (_x_0) => {
    return {$: "Output", "state": _s_0, "sends": $$replicate(_s_0, {$: "Con", "head": 0, "tail": {$: "Con", "head": 1, "tail": {$: "Con", "head": 2, "tail": {$: "Nil"}}}}), "replies": {$: "Nil"}, "reset_timer": false};
  }
}
function $step_c1(_s_0) {
  return (_x_1) => {
    return $quiet(_s_0);
  }
}
function $main() {
  const _s_0 = $$output_state($$step($$init(0), {$: "Timeout"}));
  const _s_1 = $$output_state($$step(_s_0, {$: "Receive", "from": 1, "message": {$: "Voted", "term": 1, "voter": 1, "granted": true}}));
  const _s_2 = $$output_state($$step(_s_1, {$: "Request", "client": 7, "seq": 1, "op": {$: "Add", "amount": 7}}));
  const _s_3 = $$output_state($$step(_s_2, {$: "Receive", "from": 1, "message": {$: "Appended", "term": 1, "follower": 1, "success": true, "matched": 2}}));
  return $get_value(_s_3);
}

function $choose_Outgoing(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $client_init(_id_0) {
  return {$: "Client", "id": _id_0, "next_seq": 1, "pending": {$: "None"}};
}

function $client_begin(_c_0, _op_0) {
  const _id_0 = _c_0["id"];
  const _q_0 = _c_0["next_seq"];
  const _t_0 = _c_0["pending"];
  if (_t_0.$ === "None") {
    return {$: "Client", "id": _id_0, "next_seq": _q_0, "pending": {$: "Some", "value": _op_0}};
  } else {
    const _old_0 = _t_0["value"];
    return {$: "Client", "id": _id_0, "next_seq": _q_0, "pending": {$: "Some", "value": _old_0}};
  }
}

function $client_request(_c_0) {
  const _id_0 = _c_0["id"];
  const _q_0 = _c_0["next_seq"];
  const _t_0 = _c_0["pending"];
  if (_t_0.$ === "None") {
    return {$: "None"};
  } else {
    const _op_0 = _t_0["value"];
    return {$: "Some", "value": {$: "Request", "client": _id_0, "seq": _q_0, "op": _op_0}};
  }
}

function $choose_Client(_b_0, _yes_0, _no_0) {
  if (_b_0) {
    return run_tail(_yes_0, {$: "Unit"});
  } else {
    return run_tail(_no_0, {$: "Unit"});
  }
}

function $client_reply(_c_0, _r_0) {
  const _id_0 = _c_0["id"];
  const _q_0 = _c_0["next_seq"];
  const _p_0 = _c_0["pending"];
  if (_r_0.$ === "Applied") {
    const _who_0 = _r_0["client"];
    const _seq_0 = _r_0["seq"];
    return $choose_Client($$Bool_and($$Nat_is_eq(_id_0, _who_0), $$Nat_is_eq(_q_0, _seq_0)), run_clo($client_reply_c0(_id_0,_q_0)), run_clo($client_reply_c1(_p_0,_id_0,_q_0)));
  } else if (_r_0.$ === "Retry") {
    return {$: "Client", "id": _id_0, "next_seq": _q_0, "pending": _p_0};
  } else {
    return {$: "Client", "id": _id_0, "next_seq": _q_0, "pending": _p_0};
  }
}

function $client_reply_c0(_id_0,_q_0) {
  return (_x_0) => {
    return {$: "Client", "id": _id_0, "next_seq": nat_chk(_q_0 + 1), "pending": {$: "None"}};
  }
}
function $client_reply_c1(_p_0,_id_0,_q_0) {
  return (_x_1) => {
    return {$: "Client", "id": _id_0, "next_seq": _q_0, "pending": _p_0};
  }
}
function $proof_restart_term(_s_0) {
  return null;
}

function $proof_restart_log(_s_0) {
  return null;
}

function $proof_restart_vote(_s_0) {
  return null;
}

function $proof_sentinel(_xs_0) {
  return null;
}

function $List_length(_xs_0) {
  if (_xs_0.$ === "Nil") {
    return 0;
  } else {
    const _t_0 = _xs_0["tail"];
    return nat_chk($$List_length(_t_0) + 1);
  }
}

function $List_get($0, $1) {
  for (;;) {
    {
      const _xs_0 = $0;
      const _n_0 = $1;
      if (_xs_0.$ === "Nil") {
        return {$: "None"};
      } else {
        const _h_0 = _xs_0["head"];
        const _t_0 = _xs_0["tail"];
        if (_n_0 == 0) {
          return {$: "Some", "value": _h_0};
        } else {
          const _p_0 = (_n_0 - 1);
          $0 = _t_0;
          $1 = _p_0;
          continue;
        }
      }
    }
  }
}

function $List_set(_xs_0, _n_0, _x_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    if (_n_0 == 0) {
      return {$: "Con", "head": _x_0, "tail": _t_0};
    } else {
      const _p_0 = (_n_0 - 1);
      return {$: "Con", "head": _h_0, "tail": $$List_set(_t_0, _p_0, _x_0)};
    }
  }
}

function $Nat_is_eq(_a_0, _b_0) {
  return $Cmp_is_eq(cmp_new(_a_0, _b_0));
}

function $Nat_is_ge(_a_0, _b_0) {
  return $Cmp_is_ge(cmp_new(_a_0, _b_0));
}

function $Nat_is_gt(_a_0, _b_0) {
  return $Cmp_is_gt(cmp_new(_a_0, _b_0));
}

function $List_drop($0, $1) {
  for (;;) {
    {
      const _xs_0 = $0;
      const _n_0 = $1;
      if (_xs_0.$ === "Nil") {
        return {$: "Nil"};
      } else {
        const _h_0 = _xs_0["head"];
        const _t_0 = _xs_0["tail"];
        if (_n_0 == 0) {
          return {$: "Con", "head": _h_0, "tail": _t_0};
        } else {
          const _p_0 = (_n_0 - 1);
          $0 = _t_0;
          $1 = _p_0;
          continue;
        }
      }
    }
  }
}

function $List_append(_xs_0, _ys_0) {
  if (_xs_0.$ === "Nil") {
    return _ys_0;
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    return {$: "Con", "head": _h_0, "tail": $$List_append(_t_0, _ys_0)};
  }
}

function $Bool_and(_a_0, _b_0) {
  if (!_a_0) {
    return false;
  } else {
    return _b_0;
  }
}

function $Nat_is_le(_a_0, _b_0) {
  return $Cmp_is_le(cmp_new(_a_0, _b_0));
}

function $List_take(_xs_0, _n_0) {
  if (_xs_0.$ === "Nil") {
    return {$: "Nil"};
  } else {
    const _h_0 = _xs_0["head"];
    const _t_0 = _xs_0["tail"];
    if (_n_0 == 0) {
      return {$: "Nil"};
    } else {
      const _p_0 = (_n_0 - 1);
      return {$: "Con", "head": _h_0, "tail": $$List_take(_t_0, _p_0)};
    }
  }
}

function $Nat_is_ne(_a_0, _b_0) {
  return $Bool_not($$Cmp_is_eq(cmp_new(_a_0, _b_0)));
}

function $Cmp_is_eq(_c_0) {
  if (_c_0.$ === "EQ") {
    return true;
  } else {
    return false;
  }
}

function $Cmp_is_ge(_c_0) {
  if (_c_0.$ === "LT") {
    return false;
  } else {
    return true;
  }
}

function $Cmp_is_gt(_c_0) {
  if (_c_0.$ === "GT") {
    return true;
  } else {
    return false;
  }
}

function $Cmp_is_le(_c_0) {
  if (_c_0.$ === "GT") {
    return false;
  } else {
    return true;
  }
}

function $Bool_not(_b_0) {
  if (!_b_0) {
    return true;
  } else {
    return false;
  }
}

const $$get_id = $get_id;
const $$get_term = $get_term;
const $$get_vote = $get_vote;
const $$get_log = $get_log;
const $$List_get = $List_get;
const $$Nat_is_eq = $Nat_is_eq;
const $$contains = (a0,a1) => run_loop($contains(a0,a1));
const $$List_length = $List_length;
const $$Nat_is_gt = $Nat_is_gt;
const $$set_term = $set_term;
const $$set_vote = $set_vote;
const $$set_role = $set_role;
const $$send_all = (a0,a1,a2) => run_loop($send_all(a0,a1,a2));
const $$get_nexts = $get_nexts;
const $$at = $at;
const $$term_at = $term_at;
const $$List_drop = $List_drop;
const $$get_commit = $get_commit;
const $$append_to = $append_to;
const $$replicate = (a0,a1) => run_loop($replicate(a0,a1));
const $$set_votes = $set_votes;
const $$length = $length;
const $$List_append = $List_append;
const $$set_log = $set_log;
const $$set_nexts = $set_nexts;
const $$put = $put;
const $$set_matches = $set_matches;
const $$Nat_is_ge = $Nat_is_ge;
const $$Bool_and = $Bool_and;
const $$vote_allowed = $vote_allowed;
const $$get_role = $get_role;
const $$get_votes = $get_votes;
const $$add_vote = (a0,a1) => run_loop($add_vote(a0,a1));
const $$majority = $majority;
const $$merge_entries = (a0,a1,a2,a3) => run_loop($merge_entries(a0,a1,a2,a3));
const $$Nat_is_le = $Nat_is_le;
const $$session_put = (a0,a1) => run_loop($session_put(a0,a1));
const $$get_value = $get_value;
const $$do_op = $do_op;
const $$set_value = $set_value;
const $$get_sessions = $get_sessions;
const $$set_sessions = $set_sessions;
const $$session_find = (a0,a1) => run_loop($session_find(a0,a1));
const $$get_applied = $get_applied;
const $$set_applied = $set_applied;
const $$apply_next = (a0,a1) => run_loop($apply_next(a0,a1));
const $$output_state = $output_state;
const $$output_replies = $output_replies;
const $$apply_committed = (a0,a1) => run_loop($apply_committed(a0,a1));
const $$List_take = $List_take;
const $$set_commit = $set_commit;
const $$get_matches = $get_matches;
const $$quorum_at = $quorum_at;
const $$find_commit = (a0,a1) => run_loop($find_commit(a0,a1));
const $$valid_id = $valid_id;
const $$Nat_is_ne = $Nat_is_ne;
const $$message_term = $message_term;
const $$higher = (a0,a1) => run_loop($higher(a0,a1));
const $$init = $init;
const $$step = (a0,a1) => run_loop($step(a0,a1));
const $$List_set = $List_set;
const $$Cmp_is_eq = $Cmp_is_eq;export default {
  "choose_MaybeSession": run_lib((a0,a1,a2) => run_loop($choose_MaybeSession(a0,a1,a2)), 3),
  "choose_ListSession": run_lib((a0,a1,a2) => run_loop($choose_ListSession(a0,a1,a2)), 3),
  "output_state": run_lib((a0) => run_loop($output_state(a0)), 1),
  "output_replies": run_lib((a0) => run_loop($output_replies(a0)), 1),
  "get_id": run_lib((a0) => run_loop($get_id(a0)), 1),
  "set_id": run_lib((a0,a1) => run_loop($set_id(a0,nat_in(a1))), 2),
  "get_term": run_lib((a0) => run_loop($get_term(a0)), 1),
  "set_term": run_lib((a0,a1) => run_loop($set_term(a0,nat_in(a1))), 2),
  "get_vote": run_lib((a0) => run_loop($get_vote(a0)), 1),
  "set_vote": run_lib((a0,a1) => run_loop($set_vote(a0,a1)), 2),
  "get_log": run_lib((a0) => run_loop($get_log(a0)), 1),
  "set_log": run_lib((a0,a1) => run_loop($set_log(a0,a1)), 2),
  "get_role": run_lib((a0) => run_loop($get_role(a0)), 1),
  "set_role": run_lib((a0,a1) => run_loop($set_role(a0,nat_in(a1))), 2),
  "get_votes": run_lib((a0) => run_loop($get_votes(a0)), 1),
  "set_votes": run_lib((a0,a1) => run_loop($set_votes(a0,a1)), 2),
  "get_nexts": run_lib((a0) => run_loop($get_nexts(a0)), 1),
  "set_nexts": run_lib((a0,a1) => run_loop($set_nexts(a0,a1)), 2),
  "get_matches": run_lib((a0) => run_loop($get_matches(a0)), 1),
  "set_matches": run_lib((a0,a1) => run_loop($set_matches(a0,a1)), 2),
  "get_commit": run_lib((a0) => run_loop($get_commit(a0)), 1),
  "set_commit": run_lib((a0,a1) => run_loop($set_commit(a0,nat_in(a1))), 2),
  "get_applied": run_lib((a0) => run_loop($get_applied(a0)), 1),
  "set_applied": run_lib((a0,a1) => run_loop($set_applied(a0,nat_in(a1))), 2),
  "get_value": run_lib((a0) => run_loop($get_value(a0)), 1),
  "set_value": run_lib((a0,a1) => run_loop($set_value(a0,nat_in(a1))), 2),
  "get_sessions": run_lib((a0) => run_loop($get_sessions(a0)), 1),
  "set_sessions": run_lib((a0,a1) => run_loop($set_sessions(a0,a1)), 2),
  "init": run_lib((a0) => run_loop($init(nat_in(a0))), 1),
  "restart": run_lib((a0) => run_loop($restart(a0)), 1),
  "length": run_lib((a0) => run_loop($length(a0)), 1),
  "maybe_nat": run_lib((a0) => run_loop($maybe_nat(a0)), 1),
  "at": run_lib((a0,a1) => run_loop($at(a0,nat_in(a1))), 2),
  "put": run_lib((a0,a1,a2) => run_loop($put(a0,nat_in(a1),nat_in(a2))), 3),
  "maybe_term": run_lib((a0) => run_loop($maybe_term(a0)), 1),
  "term_at": run_lib((a0,a1) => run_loop($term_at(a0,nat_in(a1))), 2),
  "choose_Bool": run_lib((a0,a1,a2) => run_loop($choose_Bool(a0,a1,a2)), 3),
  "contains": run_lib((a0,a1) => run_loop($contains(a0,nat_in(a1))), 2),
  "choose_Nats": run_lib((a0,a1,a2) => run_loop($choose_Nats(a0,a1,a2)), 3),
  "add_vote": run_lib((a0,a1) => run_loop($add_vote(a0,nat_in(a1))), 2),
  "valid_id": run_lib((a0) => run_loop($valid_id(nat_in(a0))), 1),
  "majority": run_lib((a0) => run_loop($majority(a0)), 1),
  "quiet": run_lib((a0) => run_loop($quiet(a0)), 1),
  "choose_State": run_lib((a0,a1,a2) => run_loop($choose_State(a0,a1,a2)), 3),
  "higher": run_lib((a0,a1) => run_loop($higher(a0,nat_in(a1))), 2),
  "message_term": run_lib((a0) => run_loop($message_term(a0)), 1),
  "choose_Sends": run_lib((a0,a1,a2) => run_loop($choose_Sends(a0,a1,a2)), 3),
  "send_all": run_lib((a0,a1,a2) => run_loop($send_all(a0,a1,a2)), 3),
  "append_to": run_lib((a0,a1) => run_loop($append_to(a0,nat_in(a1))), 2),
  "replicate": run_lib((a0,a1) => run_loop($replicate(a0,a1)), 2),
  "start_election": run_lib((a0) => run_loop($start_election(a0)), 1),
  "become_leader": run_lib((a0) => run_loop($become_leader(a0)), 1),
  "vote_allowed": run_lib((a0,a1) => run_loop($vote_allowed(a0,nat_in(a1))), 2),
  "choose_Output": run_lib((a0,a1,a2) => run_loop($choose_Output(a0,a1,a2)), 3),
  "vote_request": run_lib((a0,a1,a2,a3,a4) => run_loop($vote_request(a0,nat_in(a1),nat_in(a2),nat_in(a3),nat_in(a4))), 5),
  "vote_reply": run_lib((a0,a1,a2,a3) => run_loop($vote_reply(a0,nat_in(a1),nat_in(a2),a3)), 4),
  "merge_cons": run_lib((a0,a1) => run_loop($merge_cons(a0,a1)), 2),
  "choose_Merge": run_lib((a0,a1,a2) => run_loop($choose_Merge(a0,a1,a2)), 3),
  "merge_entries": run_lib((a0,a1,a2,a3) => run_loop($merge_entries(a0,a1,nat_in(a2),nat_in(a3))), 4),
  "append_fail": run_lib((a0,a1,a2) => run_loop($append_fail(a0,nat_in(a1),a2)), 3),
  "session_find": run_lib((a0,a1) => run_loop($session_find(a0,nat_in(a1))), 2),
  "session_put": run_lib((a0,a1) => run_loop($session_put(a0,a1)), 2),
  "do_op": run_lib((a0,a1) => run_loop($do_op(a0,nat_in(a1))), 2),
  "apply_session": run_lib((a0,a1,a2,a3,a4) => run_loop($apply_session(a0,nat_in(a1),nat_in(a2),a3,a4)), 5),
  "apply_one": run_lib((a0,a1) => run_loop($apply_one(a0,a1)), 2),
  "apply_next": run_lib((a0,a1) => run_loop($apply_next(a0,a1)), 2),
  "apply_committed": run_lib((a0,a1) => run_loop($apply_committed(nat_in(a0),a1)), 2),
  "append_merge": run_lib((a0,a1,a2,a3,a4,a5) => run_loop($append_merge(a0,nat_in(a1),nat_in(a2),a3,nat_in(a4),a5)), 6),
  "append_request": run_lib((a0,a1,a2,a3,a4,a5,a6) => run_loop($append_request(a0,nat_in(a1),nat_in(a2),nat_in(a3),nat_in(a4),a5,nat_in(a6))), 7),
  "quorum_at": run_lib((a0,a1) => run_loop($quorum_at(a0,nat_in(a1))), 2),
  "choose_Nat": run_lib((a0,a1,a2) => run_loop($choose_Nat(a0,a1,a2)), 3),
  "find_commit": run_lib((a0,a1) => run_loop($find_commit(nat_in(a0),a1)), 2),
  "append_reply": run_lib((a0,a1,a2,a3,a4) => run_loop($append_reply(a0,nat_in(a1),nat_in(a2),a3,nat_in(a4))), 5),
  "receive_inner": run_lib((a0,a1,a2) => run_loop($receive_inner(a0,nat_in(a1),a2)), 3),
  "receive": run_lib((a0,a1,a2) => run_loop($receive(a0,nat_in(a1),a2)), 3),
  "request_leader": run_lib((a0,a1,a2,a3) => run_loop($request_leader(a0,nat_in(a1),nat_in(a2),a3)), 4),
  "request": run_lib((a0,a1,a2,a3) => run_loop($request(a0,nat_in(a1),nat_in(a2),a3)), 4),
  "step": run_lib((a0,a1) => run_loop($step(a0,a1)), 2),
  "main": run_lib(() => run_loop($main()), 0),
  "choose_Outgoing": run_lib((a0,a1,a2) => run_loop($choose_Outgoing(a0,a1,a2)), 3),
  "client_init": run_lib((a0) => run_loop($client_init(nat_in(a0))), 1),
  "client_begin": run_lib((a0,a1) => run_loop($client_begin(a0,a1)), 2),
  "client_request": run_lib((a0) => run_loop($client_request(a0)), 1),
  "choose_Client": run_lib((a0,a1,a2) => run_loop($choose_Client(a0,a1,a2)), 3),
  "client_reply": run_lib((a0,a1) => run_loop($client_reply(a0,a1)), 2),
  "proof_restart_term": run_lib((a0) => run_loop($proof_restart_term(a0)), 1),
  "proof_restart_log": run_lib((a0) => run_loop($proof_restart_log(a0)), 1),
  "proof_restart_vote": run_lib((a0) => run_loop($proof_restart_vote(a0)), 1),
  "proof_sentinel": run_lib((a0) => run_loop($proof_sentinel(a0)), 1),
};
