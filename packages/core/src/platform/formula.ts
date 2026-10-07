/**
 * Safe arithmetic formula evaluator for BOM quantities (no eval / Function).
 *   Grammar:  expr   := term (('+'|'-') term)*
 *             term   := factor (('*'|'/') factor)*
 *             factor := unary ('^' factor)?
 *             unary  := ('-'|'+') unary | primary
 *             primary:= number | ident | ident '(' args ')' | '(' expr ')'
 *   Functions: min, max, ceil, floor, round(x[, digits]), abs, sqrt
 *   Variables: W, H, T (mm), Q (quantity) and BOM rule keys.
 */
export class FormulaError extends Error {
  constructor(message: string, public position?: number) {
    super(message);
    this.name = "FormulaError";
  }
}

type Token = { kind: "num"; value: number; pos: number } | { kind: "id"; value: string; pos: number } | { kind: "op"; value: string; pos: number };

const FUNCS: Record<string, { arity: [number, number]; fn: (...a: number[]) => number }> = {
  min: { arity: [1, 20], fn: Math.min },
  max: { arity: [1, 20], fn: Math.max },
  ceil: { arity: [1, 1], fn: Math.ceil },
  floor: { arity: [1, 1], fn: Math.floor },
  abs: { arity: [1, 1], fn: Math.abs },
  sqrt: { arity: [1, 1], fn: Math.sqrt },
  round: { arity: [1, 2], fn: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d },
};

function tokenize(src: string): Token[] {
  if (src.length > 500) throw new FormulaError("formula too long");
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t") { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new FormulaError("invalid number", i);
      out.push({ kind: "num", value: Number(m[0]), pos: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ kind: "id", value: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if ("+-*/^(),".includes(c)) { out.push({ kind: "op", value: c, pos: i }); i++; continue; }
    throw new FormulaError(`unexpected character '${c}'`, i);
  }
  return out;
}

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; e: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; name: string; args: Node[] };

export function parseFormula(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.kind === "op" && peek()!.value === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new FormulaError(`expected '${v}'`, peek()?.pos ?? src.length);
    p++;
  };
  const expr = (): Node => {
    let n = term();
    while (isOp("+") || isOp("-")) { const op = (toks[p++] as { value: string }).value; n = { t: "bin", op, a: n, b: term() }; }
    return n;
  };
  const term = (): Node => {
    let n = factor();
    while (isOp("*") || isOp("/")) { const op = (toks[p++] as { value: string }).value; n = { t: "bin", op, a: n, b: factor() }; }
    return n;
  };
  const factor = (): Node => {
    const base = unary();
    if (isOp("^")) { p++; return { t: "bin", op: "^", a: base, b: factor() }; }
    return base;
  };
  const unary = (): Node => {
    if (isOp("-")) { p++; return { t: "neg", e: unary() }; }
    if (isOp("+")) { p++; return unary(); }
    return primary();
  };
  const primary = (): Node => {
    const tk = peek();
    if (!tk) throw new FormulaError("unexpected end", src.length);
    if (tk.kind === "num") { p++; return { t: "num", v: tk.value }; }
    if (tk.kind === "id") {
      p++;
      if (isOp("(")) {
        p++;
        const f = FUNCS[tk.value.toLowerCase()];
        if (!f) throw new FormulaError(`unknown function '${tk.value}'`, tk.pos);
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) { p++; args.push(expr()); }
        }
        expect(")");
        if (args.length < f.arity[0] || args.length > f.arity[1]) throw new FormulaError(`wrong number of arguments for '${tk.value}'`, tk.pos);
        return { t: "call", name: tk.value.toLowerCase(), args };
      }
      return { t: "var", name: tk.value };
    }
    if (tk.kind === "op" && tk.value === "(") { p++; const e = expr(); expect(")"); return e; }
    throw new FormulaError(`unexpected '${tk.value}'`, tk.pos);
  };
  const root = expr();
  if (p < toks.length) throw new FormulaError(`unexpected '${(toks[p] as { value: string | number }).value}'`, toks[p]!.pos);
  return root;
}

export function variablesOf(node: Node, acc = new Set<string>()): Set<string> {
  if (node.t === "var") acc.add(node.name);
  else if (node.t === "neg") variablesOf(node.e, acc);
  else if (node.t === "bin") { variablesOf(node.a, acc); variablesOf(node.b, acc); }
  else if (node.t === "call") node.args.forEach((a) => variablesOf(a, acc));
  return acc;
}

function evalNode(n: Node, vars: Record<string, number>): number {
  switch (n.t) {
    case "num": return n.v;
    case "var": {
      if (!(n.name in vars)) throw new FormulaError(`unknown variable '${n.name}'`);
      return vars[n.name]!;
    }
    case "neg": return -evalNode(n.e, vars);
    case "bin": {
      const a = evalNode(n.a, vars);
      const b = evalNode(n.b, vars);
      if (n.op === "+") return a + b;
      if (n.op === "-") return a - b;
      if (n.op === "*") return a * b;
      if (n.op === "/") { if (b === 0) throw new FormulaError("division by zero"); return a / b; }
      return a ** b;
    }
    case "call": return FUNCS[n.name]!.fn(...n.args.map((a) => evalNode(a, vars)));
  }
}

export function evaluateFormula(src: string, vars: Record<string, number>): number {
  const v = evalNode(parseFormula(src), vars);
  if (!Number.isFinite(v)) throw new FormulaError("result is not a finite number");
  return v;
}

export const BASE_VARIABLES = ["W", "H", "T", "Q"] as const;

/** Evaluates BOM rules in order; each rule may use base variables and previous rules. */
export function evaluateRules(rules: { key: string; expression: string }[], base: Record<string, number>): Record<string, number> {
  const vars = { ...base };
  for (const r of rules) vars[r.key] = evaluateFormula(r.expression, vars);
  return vars;
}
