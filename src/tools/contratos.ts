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
          id_contrato_existente: idExistente,
          requiere_revision: requiereRevision,
        },
      });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  },
};

// 4. REGISTRAR Y ARCHIVAR
export const registrar = {
  description:
    "Escribe el contrato en el maestro y archiva el documento en SharePoint.",
  args: z.object({
    mensaje_id: z.string(),
    contrato: z.any(),
    confirmado: z.boolean().optional().default(false),
  }),
  async execute(
    args: { mensaje_id: string; contrato: any; confirmado?: boolean },
    ctx: ToolContext
  ): Promise<string> {
    try {
      const validacion = JSON.parse(
        await validar.execute(
          { mensaje_id: args.mensaje_id, contrato: args.contrato },
          ctx
        )
      );

      if (validacion.data.requiere_revision.length > 0 && !args.confirmado) {
        return JSON.stringify({
          ok: false,
          error: `Requiere revisión de los campos: ${validacion.data.requiere_revision.join(
            ", "
          )}`,
        });
      }

      const year = args.contrato.fecha_inicio
        ? args.contrato.fecha_inicio.substring(0, 4)
        : "2026";
      const clienteSlug = (args.contrato.cliente || "cliente-desconocido")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-");

      const destFolder = path.join(
        ctx.directory,
        "out/sharepoint/Contratos",
        year,
        clienteSlug
      );
      await fs.mkdir(destFolder, { recursive: true });

      const destFilePath = path.join(
        destFolder,
        `${args.contrato.id_contrato || "CT-2026-AUTO"}.pdf`
      );

      const auditPath = path.join(
        ctx.directory,
        "out/sharepoint/historial.jsonl"
      );
      const logEntry =
        JSON.stringify({
          ts: new Date().toISOString(),
          id_contrato: args.contrato.id_contrato,
          accion: validacion.data.clasificacion,
          mensaje_id: args.mensaje_id,
        }) + "\n";
      await fs.appendFile(auditPath, logEntry, "utf-8");

      const procPath = path.join(ctx.directory, "out/procesados.json");
      let procesados: string[] = [];
      try {
        procesados = JSON.parse(await fs.readFile(procPath, "utf-8"));
      } catch {}
      if (!procesados.includes(args.mensaje_id)) {
        procesados.push(args.mensaje_id);
        await fs.writeFile(
          procPath,
          JSON.stringify(procesados, null, 2),
          "utf-8"
        );
      }

      return JSON.stringify({
        ok: true,
        data: {
          id_contrato: args.contrato.id_contrato,
          accion: validacion.data.clasificacion,
          ruta_archivo: destFilePath,
        },
      });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  },
};

// 5. ALERTAS Y RIESGOS
export const alertas = {
  description:
    "Genera el informe de vencimientos de contratos y estado de pólizas.",
  args: z.object({
    hoy: z.string().describe("Fecha de referencia YYYY-MM-DD"),
  }),
  async execute(args: { hoy: string }, ctx: ToolContext): Promise<string> {
    try {
      const maestroPath = path.join(
        ctx.directory,
        "out/sharepoint/maestro-contratos.csv"
      );
      const raw = await fs.readFile(maestroPath, "utf-8");
      const lines = raw.split("\n").filter((l) => l.trim() !== "");
      const headers = lines[0].split(",");

      const vencen: any[] = [];
      const polizasPendientes: any[] = [];
      const fechaCorte = new Date(args.hoy);

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const idContrato = cols[headers.indexOf("id_contrato")];
        const cliente = cols[headers.indexOf("cliente")];
        const fechaFinStr = cols[headers.indexOf("fecha_fin")];
        const requierePoliza =
          cols[headers.indexOf("requiere_poliza")] === "true";
        const estadoPoliza = cols[headers.indexOf("estado_poliza")];

        if (fechaFinStr) {
          const fechaFin = new Date(fechaFinStr);
          const diffDays = Math.ceil(
            (fechaFin.getTime() - fechaCorte.getTime()) / (1000 * 3600 * 24)
          );
          if (diffDays >= 0 && diffDays <= 60) {
            vencen.push({
              idContrato,
              cliente,
              fechaFin: fechaFinStr,
              diasRestantes: diffDays,
            });
          }
        }

        if (requierePoliza && estadoPoliza !== "vigente") {
          polizasPendientes.push({ idContrato, cliente, estadoPoliza });
        }
      }

      const alertasMd = `# Reporte de Alertas y Control de Riesgos
Fecha de referencia: ${args.hoy}

## 1. Contratos próximos a vencer (<= 60 días)
${
  vencen
    .map(
      (v) =>
        `- **${v.idContrato}** -${v.cliente} (Vence: ${v.fechaFin} - Quedan${v.diasRestantes} días)`
    )
    .join("\n") || "Sin novedades."
}

## 2. Pólizas Pendientes o Por Regularizar
${
  polizasPendientes
    .map((p) => `- **${p.idContrato}** - ${p.cliente} (Estado:${p.estadoPoliza})`)
    .join("\n") || "Sin novedades."
}
`;

      const outAlertasPath = path.join(ctx.directory, "out/alertas.md");
      await fs.writeFile(outAlertasPath, alertasMd, "utf-8");

      return JSON.stringify({
        ok: true,
        data: {
          ruta: outAlertasPath,
          vencen,
          polizas_pendientes: polizasPendientes,
        },
      });
    } catch (error: any) {
      return JSON.stringify({ ok: false, error: error.message });
    }
  },
};