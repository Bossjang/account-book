"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, type Expense } from "@/lib/supabase";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "안녕하세요! 지출을 말하거나 통계를 물어봐 주세요.\n예: \"오늘 점심 12,000원\" / \"이번 달 총 지출이 얼마야?\"",
};

export default function Home() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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

    loadExpenses();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const formatAmount = (value: number) =>
    new Intl.NumberFormat("ko-KR").format(value);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          expenses,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "요청에 실패했습니다.");
      }

      if (data.expense) {
        setExpenses((prev) => [data.expense as Expense, ...prev]);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.reply as string,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "죄송해요, 잠시 문제가 생겼어요. 다시 시도해 주세요.",
        },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <header className="shrink-0 border-b border-black/5 bg-white/80 px-4 py-3.5 backdrop-blur-md">
        <h1 className="text-center text-[17px] font-semibold tracking-tight text-foreground">
          AI 가계부 챗봇
        </h1>
      </header>

      <section className="shrink-0 border-b border-black/5 bg-white">
        <div className="mx-auto max-w-lg px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12px] font-medium tracking-wide text-muted uppercase">
              저장된 지출
            </h2>
            {!loading && expenses.length > 0 && (
              <p className="font-mono text-[13px] tabular-nums text-muted">
                총 ₩{formatAmount(expenses.reduce((s, e) => s + e.amount, 0))}
              </p>
            )}
          </div>

          {loading ? (
            <p className="py-2 text-[13px] text-muted">불러오는 중...</p>
          ) : expenses.length === 0 ? (
            <p className="py-2 text-[13px] text-muted">
              아직 기록된 지출이 없습니다.
            </p>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {expenses.map((expense) => (
                <article
                  key={expense.id}
                  className="w-[148px] shrink-0 rounded-2xl bg-surface px-3.5 py-3"
                >
                  <p className="text-[11px] text-muted">{expense.date}</p>
                  <p className="mt-1 font-mono text-[15px] font-semibold tabular-nums tracking-tight text-accent">
                    ₩{formatAmount(expense.amount)}
                  </p>
                  <p className="mt-1 truncate text-[13px] text-foreground">
                    {expense.description}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${
                  message.role === "user"
                    ? "rounded-br-md bg-accent text-white"
                    : "rounded-bl-md bg-white text-foreground shadow-sm ring-1 ring-black/5"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
                <div className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={handleSend}
          className="shrink-0 border-t border-black/5 bg-white px-3 py-3 safe-bottom"
        >
          <div className="flex items-end gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="지출 입력 또는 질문해 주세요"
              disabled={sending}
              className="min-h-[44px] flex-1 rounded-2xl bg-surface px-4 py-2.5 text-[15px] text-foreground outline-none placeholder:text-muted disabled:opacity-60"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="전송"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3.4 20.4 21 12 3.4 3.6 3 10.5l12 1.5L3 13.5l.4 6.9Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
