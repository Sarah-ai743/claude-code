import { randomUUID } from "node:crypto";

/**
 * A minimal in-memory stand-in for the Supabase JS query builder, covering
 * exactly the chain shapes this codebase uses (insert/select/update/delete,
 * eq/in/lte, order, limit, single/maybeSingle). It is NOT a Postgres
 * emulator — most importantly it does NOT enforce Row Level Security, so
 * it can verify our application-level org_id scoping logic, but the real
 * RLS policies in supabase/migrations/0001_init.sql still need to be
 * exercised against a live Supabase project before launch (see TODO.md).
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export class FakeSupabase {
  private tables = new Map<string, Row[]>();

  seed(table: string, rows: Row[]): void {
    this.tables.set(table, [...(this.tables.get(table) ?? []), ...rows]);
  }

  table(table: string): Row[] {
    return this.tables.get(table) ?? [];
  }

  from(table: string) {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return new FakeQueryBuilder(this.tables, table);
  }
}

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number }> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: Row | Row[] | undefined;
  private filters: Filter[] = [];
  private mode: "many" | "single" | "maybeSingle" = "many";
  private orderBy: { col: string; ascending: boolean } | undefined;
  private limitN: number | undefined;
  private wantCount = false;

  constructor(
    private readonly tables: Map<string, Row[]>,
    private readonly tableName: string,
  ) {}

  private get store(): Row[] {
    return this.tables.get(this.tableName) ?? [];
  }
  private setStore(rows: Row[]) {
    this.tables.set(this.tableName, rows);
  }

  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row) {
    this.op = "upsert";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  select(_cols?: string, opts?: { count?: "exact"; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push((r) => (r[col] as string) <= (val as string));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this;
  }

  private execute(): { data: unknown; error: { message: string } | null; count?: number } {
    switch (this.op) {
      case "insert": {
        const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
        const inserted = rows.map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r }));
        this.setStore([...this.store, ...inserted]);
        return this.finish(inserted);
      }
      case "update": {
        const matched: Row[] = [];
        const next = this.store.map((r) => {
          if (this.filters.every((f) => f(r))) {
            const merged = { ...r, ...this.payload };
            matched.push(merged);
            return merged;
          }
          return r;
        });
        this.setStore(next);
        return this.finish(matched);
      }
      case "delete": {
        const remaining: Row[] = [];
        const matched: Row[] = [];
        for (const r of this.store) {
          if (this.filters.every((f) => f(r))) matched.push(r);
          else remaining.push(r);
        }
        this.setStore(remaining);
        return this.finish(matched);
      }
      case "upsert": {
        const payload = this.payload as Row;
        const key = "org_id" in payload ? "org_id" : "id";
        const existingIndex = this.store.findIndex((r) => r[key] === payload[key]);
        if (existingIndex >= 0) {
          const next = [...this.store];
          next[existingIndex] = { ...next[existingIndex], ...payload };
          this.setStore(next);
          return this.finish([next[existingIndex]!]);
        }
        const inserted = { id: randomUUID(), created_at: new Date().toISOString(), ...payload };
        this.setStore([...this.store, inserted]);
        return this.finish([inserted]);
      }
      default: {
        let rows = this.store.filter((r) => this.filters.every((f) => f(r)));
        if (this.orderBy) {
          const { col, ascending } = this.orderBy;
          rows = [...rows].sort((a, b) => {
            const av = a[col] as string | number;
            const bv = b[col] as string | number;
            if (av < bv) return ascending ? -1 : 1;
            if (av > bv) return ascending ? 1 : -1;
            return 0;
          });
        }
        const count = rows.length;
        if (this.limitN !== undefined) rows = rows.slice(0, this.limitN);
        return this.finish(rows, count);
      }
    }
  }

  private finish(rows: Row[], count?: number) {
    if (this.mode === "single") {
      return { data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows returned" }, count };
    }
    if (this.mode === "maybeSingle") {
      return { data: rows[0] ?? null, error: null, count };
    }
    return { data: rows, error: null, count };
  }

  then<TResult1 = { data: unknown; error: { message: string } | null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    try {
      const result = this.execute();
      return Promise.resolve(onfulfilled ? onfulfilled(result) : (result as unknown as TResult1));
    } catch (error) {
      if (onrejected) return Promise.resolve(onrejected(error));
      throw error;
    }
  }
}
