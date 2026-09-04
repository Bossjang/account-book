"use client";

import { useEffect, useState } from "react";
import { supabase, type Expense } from "@/lib/supabase";

export default function Home() {
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setExpenses(data);
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !amount || !description.trim()) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        date,
        amount: Number(amount),
        description: description.trim(),
      })
      .select()
      .single();

    setSaving(false);

    if (!error && data) {
      setExpenses((prev) => [data, ...prev]);
      setAmount("");
      setDescription("");
    }
  }

  const formatAmount = (value: number) =>
    new Intl.NumberFormat("ko-KR").format(value);

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

  const inputClassName =
    "w-full rounded-xl bg-surface px-4 py-3.5 text-[15px] text-foreground outline-none transition placeholder:text-muted focus:bg-white md:py-3 md:text-sm";

  const labelClassName =
    "text-[13px] font-medium tracking-wide text-muted uppercase";

  return (
    <div className="min-h-full w-full bg-background">
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 py-12 sm:px-8 sm:py-16">
        <header className="mb-12">
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground sm:text-[32px]">
            나의 스마트 가계부
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            오늘의 지출을 기록해 보세요
          </p>
        </header>

        <section className="w-full rounded-2xl bg-surface p-6 sm:p-7">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label htmlFor="date" className={labelClassName}>
                날짜
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="amount" className={labelClassName}>
                금액
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-[15px] text-muted md:text-sm">
                  ₩
                </span>
                <input
                  id="amount"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={`${inputClassName} pl-9 font-mono tabular-nums`}
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="description" className={labelClassName}>
                내용
              </label>
              <input
                id="description"
                type="text"
                placeholder="예: 점심 식사, 교통비"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={inputClassName}
                required
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-2 w-full rounded-xl bg-accent py-3.5 text-[15px] font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 md:py-3 md:text-sm"
            >
              {saving ? "저장 중..." : "저장하기"}
            </button>
          </form>
        </section>

        <section className="mt-14 w-full">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">
              지출 내역
            </h2>
            {!loading && expenses.length > 0 && (
              <p className="font-mono text-[22px] font-semibold tabular-nums tracking-tight text-foreground sm:text-2xl">
                ₩{formatAmount(totalAmount)}
              </p>
            )}
          </div>

          {loading ? (
            <p className="py-8 text-center text-[15px] text-muted">
              불러오는 중...
            </p>
          ) : expenses.length === 0 ? (
            <p className="py-8 text-center text-[15px] text-muted">
              아직 기록된 지출이 없습니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {expenses.map((expense) => (
                <li
                  key={expense.id}
                  className="flex items-center justify-between gap-4 rounded-xl px-4 py-4 transition hover:bg-surface sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-foreground">
                      {expense.description}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      {expense.date}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[17px] font-medium tabular-nums tracking-tight text-accent sm:text-lg">
                    ₩{formatAmount(expense.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
