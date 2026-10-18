import { leer_buzon, extraer, validar, registrar, alertas, ToolContext } from "./src/tools/contratos";

async function runDemo() {
  console.log("==================================================");
  console.log("   INICIANDO VERIFICACIÓN DETERMINISTA - DEMO.TS  ");
  console.log("==================================================\n");

  const ctx: ToolContext = {
    directory: process.cwd(),
    sessionId: "demo-session-local"
  };

  // 1. Leer buzón de entrada
  const buzonRes = JSON.parse(await leer_buzon.execute({}, ctx));
  if (!buzonRes.ok) {
    console.error("Error leyendo buzón:", buzonRes.error);
    return;
  }

  const mensajes = buzonRes.data.mensajes;
  console.log(`[INFO] Mensajes detectados en buzón: ${mensajes.length}\n`);

  // 2. Procesar primera pasada de cada mensaje
  for (const msg of mensajes) {
    console.log(`--------------------------------------------------`);
    console.log(`Procesando Mensaje: ${msg.id} | Asunto: "${msg.asunto}"`);

    if (!msg.tiene_contrato) {
      console.log(`-> Clasificación: RECHAZADO (Sin contrato adjunto)`);
      continue;
    }

    const extRes = JSON.parse(await extraer.execute({ mensaje_id: msg.id }, ctx));
    if (!extRes.ok || extRes.data?.es_contrato_valido === false) {
      console.log(`-> Clasificación: RECHAZADO (${extRes.data?.motivo || extRes.error})`);
      continue;
    }

    const valRes = JSON.parse(await validar.execute({ mensaje_id: msg.id, contrato: extRes.data }, ctx));
    console.log(`-> Clasificación: ${valRes.data.clasificacion.toUpperCase()}`);

    if (valRes.data.requiere_revision.length > 0) {
      console.log(`-> ESTADO: DETENIDO (Requiere Revisión Humana)`);
      console.log(`   Campos pendientes: ${valRes.data.requiere_revision.join(", ")}`);

      // Intentar registro sin confirmación para demostrar bloqueo de seguridad
      const regFail = JSON.parse(await registrar.execute({ mensaje_id: msg.id, contrato: extRes.data, confirmado: false }, ctx));
      console.log(`   Resultado intento registro automático: ${regFail.error}`);

      // Simular confirmación explícita para demostrar registro seguro (ejemplo en msg-006)
      if (msg.id === "msg-006") {
        console.log(`\n   [SIMULACIÓN HITL] Confirmando datos para ${msg.id}...`);
        const regOk = JSON.parse(await registrar.execute({ mensaje_id: msg.id, contrato: extRes.data, confirmado: true }, ctx));
        console.log(`   Resultado post-confirmación: REGISTRADO CON ÉXITO -> ${regOk.data.ruta_archivo}`);
      }
    } else {
      const regRes = JSON.parse(await registrar.execute({ mensaje_id: msg.id, contrato: extRes.data, confirmado: false }, ctx));
      if (regRes.ok) {
        console.log(`-> ESTADO: REGISTRADO -> ${regRes.data.ruta_archivo}`);
      } else {
        console.log(`-> ESTADO: NO REGISTRADO -> ${regRes.error}`);
      }
    }
  }

  // 3. Emitir reporte de alertas con fecha determinista de prueba
  console.log(`\n==================================================`);
  console.log("  GENERANDO REPORTE DE ALERTAS (Fecha: 2026-09-03)  ");
  console.log("==================================================");
  const alertRes = JSON.parse(await alertas.execute({ hoy: "2026-09-03" }, ctx));
  console.log(`Reporte emitido en: ${alertRes.data.ruta}`);
  console.log(`Contratos próximos a vencer: ${alertRes.data.vencen.length}`);
  console.log(`Pólizas pendientes: ${alertRes.data.polizas_pendientes.length}`);
}

runDemo().catch(console.error);