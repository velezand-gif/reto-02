import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

export interface ToolContext {
  directory: string;
  sessionId: string;
}

// 1. LEER BUZÓN
export const leer_buzon = {
  description: "Lista todos los mensajes no procesados del buzón de entrada.",
  args: z.object({}),
  async execute(_args: {}, ctx: ToolContext): Promise<string> {
    try {
      const buzonPath = path.join(ctx.directory, "fixtures/reto-02/buzon");
      const outPath = path.join(ctx.directory, "out/procesados.json");

      let procesados: string[] = [];
      try {
        const raw = await fs.readFile(outPath, "utf-8");
        procesados = JSON.parse(raw);
      } catch {
        procesados = [];
      }

      const dirs = await fs.readdir(buzonPath);
      const mensajes = [];

      for (const dir of dirs) {
        if (procesados.includes(dir)) continue;
        const mailPath = path.join(buzonPath, dir, "correo.json");
        try {
          const rawMail = await fs.readFile(mailPath, "utf-8");
          const mail = JSON.parse(rawMail);

          const tieneContrato =
            mail.adjuntos &&
            mail.adjuntos.some(
              (adj: string) => adj.endsWith(".txt") || adj.endsWith(".pdf")
            );

          mensajes.push({
            id: mail.id || dir,
            de: mail.de,
            asunto: mail.asunto,
            fecha: mail.fecha,
            adjuntos: mail.adjuntos || [],
            tiene_contrato: tieneContrato,
          });
        } catch {
          continue;
        }
      }

      return JSON.stringify({ ok: true, data: { mensajes } });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  },
};

// 2. EXTRAER DATOS
export const extraer = {
  description:
    "Extrae metadatos estructurados de un contrato e indica el nivel de confianza por campo.",
  args: z.object({
    mensaje_id: z
      .string()
      .describe("ID del mensaje dentro del buzón (ej: msg-001)"),
  }),
  async execute(
    args: { mensaje_id: string },
    ctx: ToolContext
  ): Promise<string> {
    try {
      const msgDir = path.join(
        ctx.directory,
        "fixtures/reto-02/buzon",
        args.mensaje_id
      );
      const mailPath = path.join(msgDir, "correo.json");
      const mail = JSON.parse(await fs.readFile(mailPath, "utf-8"));

      const contratoAdj = mail.adjuntos?.find(
        (a: string) => a.includes("contrato") || a.includes("otrosi")
      );
      if (!contratoAdj) {
        return JSON.stringify({
          ok: true,
          data: {
            es_contrato_valido: false,
            motivo:
              "El mensaje no contiene ningún adjunto de contrato ni otrosí.",
          },
        });
      }

      const txtContent = await fs.readFile(
        path.join(msgDir, contratoAdj),
        "utf-8"
      );

      const idMatch = txtContent.match(/CT-\d{4}-\d{3}/i);
      const nitMatch = txtContent.match(/NIT[:\s]+(\d+)/i);
      const valorMatch = txtContent.match(/VALOR[:\s]+\$?([\d.,]+)/i);
      const porDemanda =
        txtContent.toLowerCase().includes("por demanda") ||
        txtContent.toLowerCase().includes("bolsa de horas");

      const confianza: Record<string, number> = {
        id_contrato: idMatch ? 1.0 : 0.0,
        nit_cliente: nitMatch ? 0.95 : 0.0,
        valor: porDemanda ? 0.5 : valorMatch ? 0.9 : 0.0,
        fecha_fin: txtContent.includes("meses") ? 0.6 : 0.9,
      };

      return JSON.stringify({
        ok: true,
        data: {
          mensaje_id: args.mensaje_id,
          id_contrato: idMatch ? idMatch[0] : null,
          nit_cliente: nitMatch ? nitMatch[1] : null,
          valor: valorMatch
            ? parseFloat(valorMatch[1].replace(/\./g, ""))
            : porDemanda
            ? 0
            : null,
          valor_indeterminado: porDemanda,
          texto_plano: txtContent,
          confianza,
        },
      });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  },
};

// 3. VALIDAR Y CLASIFICAR
export const validar = {
  description:
    "Valida y clasifica un contrato contra la base maestra en SharePoint simulado.",
  args: z.object({
    mensaje_id: z.string().describe("ID del mensaje"),
    contrato: z.any().describe("Objeto del contrato extraído"),
  }),
  async execute(
    args: { mensaje_id: string; contrato: any },
    ctx: ToolContext
  ): Promise<string> {
    try {
      const maestroPath = path.join(
        ctx.directory,
        "out/sharepoint/maestro-contratos.csv"
      );
      try {
        await fs.access(maestroPath);
      } catch {
        await fs.mkdir(path.dirname(maestroPath), { recursive: true });
        await fs.copyFile(
          path.join(ctx.directory, "fixtures/reto-02/maestro-contratos.csv"),
          maestroPath
        );
      }

      const csvData = await fs.readFile(maestroPath, "utf-8");
      const lineas = csvData.split("\n").filter((l) => l.trim() !== "");
      const headers = lineas[0].split(",");

      let clasificacion = "nuevo";
      let idExistente: string | null = null;
      const requiereRevision: string[] = [];

      if (args.contrato.confianza) {
        for (const [campo, score] of Object.entries(args.contrato.confianza)) {
          if ((score as number) < 0.8) {
            requiereRevision.push(campo);
          }
        }
      }

      for (let i = 1; i < lineas.length; i++) {
        const cols = lineas[i].split(",");
        const idIdx = headers.indexOf("id_contrato");

        if (cols[idIdx] === args.contrato.id_contrato) {
          idExistente = cols[idIdx];
          if (args.contrato.texto_plano?.toLowerCase().includes("otrosí")) {
            clasificacion = "actualizacion";
          } else {
            clasificacion = "duplicado";
          }
          break;
        }
      }

      return JSON.stringify({
        ok: true,
        data: {
          clasificacion,
          id_contrato_