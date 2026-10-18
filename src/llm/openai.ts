import { LLMAdapter, Message, ToolDefinition, LLMResponse } from "./adapter";

export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model: string = "gpt-4o") {
    this.apiKey = apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
    this.model = model;

    if (!this.apiKey) {
      throw new Error("No se ha configurado la clave API para OpenAI (LLM_API_KEY u OPENAI_API_KEY).");
    }
  }

  async enviar(
    mensajes: Message[],
    herramientas: ToolDefinition[]
  ): Promise<LLMResponse> {
    const formattedTools = herramientas.map((h) => ({
      type: "function",
      function: {
        name: h.name,
        description: h.description,
        parameters: h.parameters,
      },
    }));

    const formattedMessages = mensajes.map((m) => {
      if (m.role === "system") {
        return { role: "system", content: m.content };
      }
      if (m.role === "model") {
        return { role: "assistant", content: m.content };
      }
      if (m.role === "tool") {
        return {
          role: "tool",
          content: m.content,
          tool_call_id: m.toolCallId || "tool_call_id",
        };
      }
      return { role: "user", content: m.content };
    });

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: formattedMessages,
          tools: formattedTools.length > 0 ? formattedTools : undefined,
          temperature: 0.1, // Baja temperatura para mantener respuestas deterministas y objetivas
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error en el proveedor OpenAI (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const choice = data.choices[0].message;

      const toolCalls = choice.tool_calls?.map((tc: any) => ({
        tool: tc.function.name,
        args: JSON.parse(tc.function.arguments || "{}"),
        toolCallId: tc.id,
      }));

      return {
        text: choice.content || "",
        toolCalls: toolCalls || [],
      };
    } catch (error: any) {
      throw new Error(`Error invocando adaptador OpenAI: ${error.message}`);
    }
  }
}