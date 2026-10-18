import express, { Request, Response } from "express";
import cors from "cors";
import * as fs from "fs/promises";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai"; // O la librería de tu proveedor (OpenAI / Anthropic)
import {
  leer_buzon,
  extraer,
  validar,
  registrar,
  alertas,
  ToolContext,
} from "./tools/contratos";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MAX_ITERATIONS = 25;

// Almacén de sesiones en memoria (para persistencia simple)
interface Message {
  role: "user" | "model" | "system" | "tool";
  content: string;
  toolCalls?: any[];
}

const sessionStore: Record<string, Message[]> = {};

// Inicializador del adaptador de LLM (usando Gemini / OpenAI / Anthropic según .env)
const apiKey = process.env.LLM_API_KEY || process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

// Mapeo de herramientas disponibles para el agente
const toolsMap: Record<string, any> = {
  contratos_leer_buzon: leer_buzon,
  contratos_extraer: extraer,
  contratos_validar: validar,
  contratos_registrar: registrar,
  contratos_alertas: alertas,
};

// Carga del System Prompt desde agent/prompt.md
async function getSystemPrompt(): Promise<string> {
  try {
    const promptPath = path.join(process.cwd(), "agent/prompt.md");
    return await fs.readFile(promptPath, "utf-8");
  } catch (error) {
    return "Eres un asistente experto en registro maestro de contratos de Periferia IT Group.";
  }
}

// 1. Healthcheck API Endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    provider: process.env.LLM_PROVIDER || "google",
    model: process.env.LLM_MODEL || "gemini-1.5-pro",
  });
});

// 2. Historial de Sesiones
app.get("/api/sessions/:id", (req: Request, res: Response) => {
  const sessionId = req.params.id;
  const history = sessionStore[sessionId] || [];
  res.json({ ok: true, sessionId, history });
});

// 3. Endpoint Principal del Chat y Bucle del Agente (Agent Loop)
app.post("/api/chat", async (req: Request, res: Response) => {
  const { sessionId = "default-session", message } = req.body;

  if (!message) {
    return res.status(400).json({ ok: false, error: "El mensaje es obligatorio." });
  }

  // Inicializar historial de la sesión si no existe
  if (!sessionStore[sessionId]) {
    const systemPrompt = await getSystemPrompt();
    sessionStore[sessionId] = [{ role: "system", content: systemPrompt }];
  }

  // Agregar el mensaje del usuario al historial
  sessionStore[sessionId].push({ role: "user", content: message });

  const ctx: ToolContext = {
    directory: process.cwd(),
    sessionId,
  };

  const executedToolCalls: any[] = [];
  let needsConfirmation = false;
  let currentIteration = 0;
  let finalReply = "";

  try {
    const model = genAI.getGenerativeModel({
      model: process.env.LLM_MODEL || "gemini-1.5-pro",
    });

    // CICLO/BUCLE DEL AGENTE (AGENT LOOP)
    while (currentIteration < MAX_ITERATIONS) {
      currentIteration++;

      // Formatear conversación para el SDK
      const historyForSdk = sessionStore[sessionId]
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "model" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      // Invocar al Modelo de Lenguaje
      const result = await model.generateContent({
        contents: historyForSdk,
        systemInstruction: sessionStore[sessionId][0].content,
      });

      const responseText = result.response.text();

      // Detección heurística/JSON de llamadas a herramientas desde la respuesta del modelo
      let toolCallRequested = null;
      try {
        if (responseText.includes("```json") || responseText.includes("contratos_")) {
          const jsonMatch = responseText.match(/\{[\s\S]*"tool"[\s\S]*\}/);
          if (jsonMatch) {
            toolCallRequested = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (e) {
        toolCallRequested = null;
      }

      // Si el modelo decide llamar a una herramienta
      if (toolCallRequested && toolCallRequested.tool) {
        const toolName = toolCallRequested.tool;
        const toolArgs = toolCallRequested.args || {};
        const toolInstance = toolsMap[toolName];

        if (toolInstance) {
          // Ejecutar herramienta tipada
          const toolRawResult = await toolInstance.execute(toolArgs, ctx);
          const toolParsed = JSON.parse(toolRawResult);

          executedToolCalls.push({
            tool: toolName,
            args: toolArgs,
            result: toolParsed,
          });

          // Registrar llamadas en out/log.jsonl
          const logPath = path.join(ctx.directory, "out/log.jsonl");
          await fs.mkdir(path.dirname(logPath), { recursive: true });
          await fs.appendFile(
            logPath,
            JSON.stringify({
              ts: new Date().toISOString(),
              sessionId,
              tool: toolName,
              ok: toolParsed.ok,
            }) + "\n"
          );

          // Verificar si requiere revisión/confirmación humana (HitL)
          if (
            toolParsed.data?.requiere_revision?.length > 0 ||
            (toolParsed.ok === false && toolParsed.error?.includes("requiere revisión"))
          ) {
            needsConfirmation = true;
          }

          // Agregar la respuesta de la herramienta al contexto del historial
          sessionStore[sessionId].push({
            role: "model",
            content: `Ejecuté ${toolName} con resultado: ${toolRawResult}`,
          });

          continue; // Continuar la siguiente iteración del ciclo
        }
      }

      // Si no hay más llamadas a herramientas, el modelo ha generado su respuesta final
      finalReply = responseText;
      sessionStore[sessionId].push({ role: "model", content: finalReply });
      break;
    }

    // Si se alcanzó el límite máximo de iteraciones
    if (currentIteration >= MAX_ITERATIONS && !finalReply) {
      finalReply =
        "Se alcanzó el límite máximo de iteraciones (25). A continuación te resumo los avances procesados hasta el momento.";
      sessionStore[sessionId].push({ role: "model", content: finalReply });
    }

    return res.json({
      ok: true,
      reply: finalReply,
      toolCalls: executedToolCalls,
      needsConfirmation,
      iterations: currentIteration,
    });
  } catch (error: any) {
    console.error("Error en el ciclo del agente:", error);
    return res.status(500).json({
      ok: false,
      error: `Error interno ejecutando el agente: ${error.message}`,
    });
  }
});

// Arrancar el servidor HTTP
app.listen(PORT, () => {
  console.log(`[SERVER] Agente de Contratos corriendo en http://localhost:${PORT}`);
  console.log(`[SERVER] Healthcheck disponible en http://localhost:${PORT}/api/health`);
});