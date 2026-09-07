import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import type { Expense } from "@/lib/supabase";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type GeminiResult = {
  reply: string;
  action: "save" | "none";
  expense: {
    date: string;
    amount: number;
    description: string;
  } | null;
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

function todayKST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 금액이 포함되면 지출 입력으로 간주 */
function hasAmount(message: string): boolean {
  return (
    /\d[\d,]*\s*원/.test(message) ||
    /\d+\.?\d*\s*만\s*원?/.test(message) ||
    /\d{4,}/.test(message)
  );
}

/** 의문사·질문 표현이면 통계/조회 질문으로 간주 */
function isQuestion(message: string): boolean {
  return /얼마|뭐|뭘|무엇|어떻게|어디|언제|왜|누가|몇|어떤|총\s*지출|가장\s*많이|\?|인가요|나요|까요|더라|어때|알려\s*줘|알려줘/.test(
    message,
  );
}

function classifyIntent(message: string): "question" | "expense" {
  // 금액이 있으면 지출 입력 우선, 없으면 의문사로 질문 판별
  if (hasAmount(message)) return "expense";
  if (isQuestion(message)) return "question";
  return "expense";
}

function formatExpenseList(expenses: Expense[]): string {
  if (expenses.length === 0) return "저장된 지출 없음";
  return expenses
    .map(
      (e) =>
        `- ${e.date} / ₩${e.amount.toLocaleString("ko-KR")} / ${e.description}`,
    )
    .join("\n");
}

async function fetchAllExpenses(): Promise<Expense[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    console.error("Supabase fetch error:", error);
    throw error;
  }

  return (data ?? []) as Expense[];
}

async function handleQuestion(
  apiKey: string,
  message: string,
  history: ChatMessage[],
) {
  const expenses = await fetchAllExpenses();
  const expenseSummary = formatExpenseList(expenses);
  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const historyText =
    history.length === 0
      ? "(없음)"
      : history
          .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`)
          .join("\n");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          reply: {
            type: SchemaType.STRING,
            description: "사용자에게 보여줄 친근한 한국어 답변",
          },
        },
        required: ["reply"],
      },
    },
  });

  const prompt = `당신은 친근한 한국어 가계부 챗봇입니다.
사용자가 지출 통계·내역에 대해 물었습니다. 아래 전체 지출 데이터를 분석해 자연스럽고 친근하게 답하세요.

오늘 날짜(KST): ${todayKST()}

규칙:
1. 반드시 아래 지출 데이터만 근거로 답하세요. 없는 내용은 지어내지 마세요.
2. 기간(이번 달, 지난주, 어제 등)은 오늘(${todayKST()}) 기준으로 해석하세요.
3. 금액은 천 단위 쉼표를 넣어 읽기 쉽게 표기하세요. 예: 12,000원
4. 데이터가 없거나 해당 기간·항목이 없으면 솔직히 알려 주세요.
5. reply는 자연스럽고 친근한 한국어로, 필요하면 2~4문장 정도까지 써도 됩니다.
6. 총합·최다 항목·기간별 합계 등 질문에 맞게 직접 계산해서 답하세요.
7. 지출을 새로 저장하지 마세요. 질문에만 답하세요.

전체 지출 건수: ${expenses.length}건
전체 합계: ₩${total.toLocaleString("ko-KR")}

전체 지출 내역:
${expenseSummary}

최근 대화:
${historyText}

사용자 질문:
${message}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(text) as { reply: string };

  return Response.json({
    reply: parsed.reply || "데이터를 살펴봤는데, 딱 맞는 답을 못 찾았어요.",
    expense: null,
  });
}

async function handleExpense(
  apiKey: string,
  message: string,
  history: ChatMessage[],
  clientExpenses: Expense[],
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.6-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          reply: {
            type: SchemaType.STRING,
            description: "사용자에게 보여줄 한국어 응답",
          },
          action: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["save", "none"],
            description: "지출 저장 여부",
          },
          expense: {
            type: SchemaType.OBJECT,
            nullable: true,
            properties: {
              date: {
                type: SchemaType.STRING,
                description: "YYYY-MM-DD 형식의 날짜",
              },
              amount: {
                type: SchemaType.NUMBER,
                description: "원화 금액 (숫자)",
              },
              description: {
                type: SchemaType.STRING,
                description: "지출 내용",
              },
            },
            required: ["date", "amount", "description"],
          },
        },
        required: ["reply", "action", "expense"],
      },
    },
  });

  const expenseSummary = formatExpenseList(clientExpenses.slice(0, 30));

  const historyText =
    history.length === 0
      ? "(없음)"
      : history
          .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`)
          .join("\n");

  const prompt = `당신은 친근한 한국어 가계부 챗봇입니다.
사용자가 자연어로 지출을 말하면 날짜·금액·내용을 추출해 저장하세요.

오늘 날짜(KST): ${todayKST()}

규칙:
1. 날짜가 명시되지 않으면 오늘(${todayKST()})로 처리하세요. "어제", "그제", "지난주 월요일" 등은 오늘 기준 상대 날짜로 YYYY-MM-DD로 계산하세요.
2. 금액은 원화 숫자만 사용하세요. "2만 원" → 20000, "1.5만" → 15000.
3. 내용은 짧게 요약하세요. 예: "택시 탔는데" → "택시".
4. 저장할 지출의 금액이 파악되지 않으면 action="none", expense=null로 두고 reply에서 금액을 다시 물어보세요.
5. 날짜를 전혀 추정할 수 없으면(예: "저번에") action="none", expense=null로 두고 reply에서 날짜를 다시 물어보세요.
6. 날짜·금액·내용이 모두 명확하면 action="save"와 expense를 채우세요.
7. 저장 성공 시 reply 예시: "12월 29일 택시 20,000원을 저장했어요!"
8. 지출 저장이 아닌 일반 인사면 action="none", expense=null.
9. reply는 짧고 친절한 한국어 한두 문장.

최근 지출 내역:
${expenseSummary}

최근 대화:
${historyText}

사용자 메시지:
${message}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const parsed = JSON.parse(text) as GeminiResult;

  let savedExpense: Expense | null = null;

  if (
    parsed.action === "save" &&
    parsed.expense &&
    isValidDate(parsed.expense.date) &&
    parsed.expense.description?.trim() &&
    Number(parsed.expense.amount) > 0
  ) {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("expenses")
      .insert({
        date: parsed.expense.date,
        amount: Math.round(Number(parsed.expense.amount)),
        description: parsed.expense.description.trim(),
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return Response.json(
        {
          reply:
            "지출을 저장하는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
          expense: null,
        },
        { status: 200 },
      );
    }

    savedExpense = data;
  } else if (parsed.action === "save") {
    return Response.json({
      reply:
        parsed.reply ||
        '날짜나 금액을 정확히 파악하지 못했어요. 예: "오늘 점심 15,000원"처럼 알려 주세요.',
      expense: null,
    });
  }

  return Response.json({
    reply: parsed.reply || "알겠어요!",
    expense: savedExpense,
  });
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "GEMINI_API_KEY가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history.slice(-10)
      : [];
    const expenses: Expense[] = Array.isArray(body.expenses)
      ? body.expenses.slice(0, 30)
      : [];

    if (!message) {
      return Response.json(
        { error: "메시지를 입력해 주세요." },
        { status: 400 },
      );
    }

    const intent = classifyIntent(message);

    if (intent === "question") {
      return await handleQuestion(apiKey, message, history);
    }

    return await handleExpense(apiKey, message, history, expenses);
  } catch (error) {
    console.error("Chat API error:", error);
    return Response.json(
      {
        error:
          "AI 응답을 생성하는 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
