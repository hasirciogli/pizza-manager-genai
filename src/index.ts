import {
  GoogleGenAI,
  Type,
  FunctionCallingConfigMode,
  ContentListUnion,
} from "@google/genai";
import dotenv from "dotenv";
dotenv.config();
console.log(process.env.GOOGLE_API_KEY);
import { FileChatHistoryRepo, ChatMessage } from "./chat_history_repo";
import readline from "readline";
import { PizzaFileRepo, PizzaOrder } from "./pizza_file_repo";

// --- 1) Tool tanımları -----------------------------------------------------
const listStoresDecl = {
  name: "list_pizza_stores",
  description: "Returns nearby pizza stores.",
  parameters: {
    type: Type.OBJECT,
    properties: { location: { type: Type.STRING } },
    required: ["location"],
  },
};

const listOrdersDecl = {
  name: "list_pizza_orders",
  description: "Returns all pizza orders.",
  parameters: {
    type: Type.OBJECT,
  },
};

const placeOrderDecl = {
  name: "place_pizza_order",
  description: "Places a pizza order at a given store.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      store_id: { type: Type.STRING },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            sku: { type: Type.STRING },
            qty: { type: Type.NUMBER },
          },
          required: ["sku", "qty"],
        },
      },
      address: { type: Type.STRING },
    },
    required: ["store_id", "items", "address"],
  },
};

const trackOrderDecl = {
  name: "track_pizza_order",
  description: "Returns status + ETA for an order.",
  parameters: {
    type: Type.OBJECT,
    properties: { order_id: { type: Type.STRING } },
    required: ["order_id"],
  },
};

const cancelOrderDecl = {
  name: "cancel_pizza_order",
  description: "Cancels a pizza order by order_id.",
  parameters: {
    type: Type.OBJECT,
    properties: { order_id: { type: Type.STRING } },
    required: ["order_id"],
  },
};

const pizzaRepo = new PizzaFileRepo();

// Başlangıçta örnek mağazalar ekle (varsa tekrar eklemez)
(async () => {
  await pizzaRepo.loadDb();
  const stores = await pizzaRepo.listStores();
  if (stores.length === 0) {
    await pizzaRepo.addStore({ id: "s1", name: "Luigi’s", distance_km: 1.2 });
    await pizzaRepo.addStore({
      id: "s2",
      name: "SliceMaster",
      distance_km: 2.5,
    });
  }
})();

// --- 2) Gerçek (veya mock) implementasyonlar -------------------------------
async function list_pizza_stores({ location }: { location: string }) {
  // Dosyadan mağazaları getir
  const stores = await pizzaRepo.listStores();
  return { stores };
}

async function place_pizza_order(args: {
  store_id: string;
  items: { sku: string; qty: number }[];
  address: string;
}) {
  // Siparişi dosyaya ekle
  const order: PizzaOrder = {
    order_id: "ORD" + Math.floor(Math.random() * 100000),
    store_id: args.store_id,
    items: args.items,
    address: args.address,
    status: "Preparing",
    eta_min: 30,
    total_eur: 18.9,
  };
  await pizzaRepo.placeOrder(order);
  return { order_id: order.order_id, total_eur: order.total_eur };
}

async function track_pizza_order({ order_id }: { order_id: string }) {
  // Siparişi dosyadan bul
  const order = await pizzaRepo.getOrder(order_id);
  if (!order) return { status: "Not found", eta_min: 0 };
  return { status: order.status, eta_min: order.eta_min };
}

async function list_pizza_orders() {
  // Tüm siparişleri getir
  const orders = await pizzaRepo.listOrders();
  return { orders };
}

async function cancel_pizza_order({ order_id }: { order_id: string }) {
  const ok = await pizzaRepo.cancelOrder(order_id);
  return ok ? { status: "Cancelled" } : { status: "Not found" };
}

const toolFns: Record<string, (a: any) => Promise<any>> = {
  list_pizza_stores,
  place_pizza_order,
  track_pizza_order,
  list_pizza_orders,
  cancel_pizza_order,
};

const tools = [
  {
    functionDeclarations: [
      listStoresDecl,
      placeOrderDecl,
      trackOrderDecl,
      listOrdersDecl,
      cancelOrderDecl,
    ],
  },
];

// --- 3) Ajan döngüsü + tek stream -----------------------------------------
export async function* runPizzaAgent(userPrompt: string, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  let contents: ContentListUnion = [
    { role: "user", parts: [{ text: userPrompt }] },
  ];

  while (true) {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction:
          "Ve fake data ile sipariş oluşturabilirsin şuan debug moddasın Altyapn sahte file storage içinde kuruldu vereceğin siparişerlin bir anlamı yok. Test modundasın. You are a pizza delivery agent. You are responsible for delivering pizzas to customers. You can use the following tools to help you: list_pizza_stores, place_pizza_order, track_pizza_order, list_pizza_orders. DEBUG=TRUE, you can use tools to get information about the pizza orders and stores.",
        tools,
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO, // model ister tool ister NL döner
          },
        },
      },
    });

    // 1️⃣ Kullanıcıya assistant text parçalarını stream et
    if (res.text?.trim()) {
      yield { type: "assistant", text: res.text };
    }

    // 2️⃣ Tool call var mı?
    if (!res.functionCalls?.length) break;

    for (const fc of res.functionCalls) {
      const id = crypto.randomUUID();
      yield { type: "tool_call", id, name: fc.name, args: fc.args };

      const impl = toolFns[fc.name as keyof typeof toolFns];
      if (!impl) throw new Error(`Unknown tool ${fc.name}`);

      const toolResp = await impl(fc.args);
      yield { type: "tool_response", id, result: toolResp };

      // Model’e geri besle (MCP pattern)
      contents.push({
        role: "model",
        parts: [{ functionCall: { name: fc.name, args: fc.args, id } }],
      });
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              id,
              name: fc.name,
              response: toolResp,
            },
          },
        ],
      });
    }
  }
}

(async () => {
  console.log("Starting pizza agent...");
  const chatRepo = new FileChatHistoryRepo();
  await chatRepo.loadHistory();
  chatRepo.startPeriodicSave();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  async function askPrompt(): Promise<string> {
    return new Promise((resolve) => {
      rl.question("Sen: ", (answer) => {
        resolve(answer);
      });
    });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey)
    throw new Error("GOOGLE_API_KEY environment variable is not set!");

  while (true) {
    const userInput = await askPrompt();
    if (userInput.trim().toLowerCase() === "exit") break;
    await chatRepo.addMessage({
      role: "user",
      text: userInput,
      timestamp: Date.now(),
    });

    // Geçmişi prompt olarak birleştir
    const history = (await chatRepo.loadHistory())
      .map((m) => `${m.role}: ${m.text}`)
      .join("\n");
    const userPrompt = history + "\nuser: " + userInput;

    let isLoading = false;
    for await (const chunk of runPizzaAgent(userPrompt, apiKey)) {
      if (chunk.type === "assistant") {
        if (!isLoading) {
          isLoading = true;
          process.stdout.write(
            "\n[Assistant is thinking... Lütfen bekleyin]\n"
          );
        }
        if (typeof chunk.text === "string") {
          console.log("Assistant:", chunk.text);
          await chatRepo.addMessage({
            role: "assistant",
            text: chunk.text,
            timestamp: Date.now(),
          });
        } else {
          console.log("Assistant: [Yanıt alınamadı veya metin eksik]");
          await chatRepo.addMessage({
            role: "assistant",
            text: "[Yanıt alınamadı veya metin eksik]",
            timestamp: Date.now(),
          });
        }
      } else if (chunk.type === "tool_call") {
        console.log("Tool call:", chunk.name, chunk.args);
        await chatRepo.addMessage({
          role: "tool",
          text: `${chunk.name} ${JSON.stringify(chunk.args)}`,
          timestamp: Date.now(),
        });
      } else if (chunk.type === "tool_response") {
        console.log("Tool response:", chunk.result);
        await chatRepo.addMessage({
          role: "tool",
          text: `response: ${JSON.stringify(chunk.result)}`,
          timestamp: Date.now(),
        });
      }
    }
  }
  rl.close();
  chatRepo.stopPeriodicSave();
  console.log("Güle güle!");
})();
