export interface Message {
  role: "user" | "model" | "system" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface ToolCallRequest {
  tool: string;
  args: Record<string, any>;
}

export interface LLMResponse {
  text: string;
  toolCalls?: ToolCallRequest[];
}

export interface LLMAdapter {
  /**
   * Envía los mensajes y las herramientas disponibles al proveedor de LLM.
   * Cambiar de proveedor no afecta la lógica interna ni el bucle del agente.
   */
  enviar(
    mensajes: Message[],
    herramientas: ToolDefinition[]
  ): Promise<LLMResponse>;
}