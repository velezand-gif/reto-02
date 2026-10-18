# Documento de Solución: Agente Conversacional "Registro de Contratos Vigentes"

**Candidato:** Andrés Alberto Vélez Menco  
**Proceso:** Selección Equipo Perxia 2.0 · Periferia IT Group  
**Fecha:** Octubre de 2026  

---

## 1. Problema en una frase

El registro maestro de contratos de Periferia IT Group se encuentra desactualizado y descentralizado desde mayo de 2026, lo que genera opacidad sobre los contratos vigentes, pérdida de control sobre las pólizas de cumplimiento por vencer e ineficiencia operativa al depender de procesos manuales que no sobrevivieron a la rotación de personal.

---

## 2. Arquitectura de la Solución

### 2.1 Diagrama de Arquitectura

```
┌───────────────────────────────────────────────────────────────────────────┐
│ Front-end (Interfaz de Chat Web - React/Tailwind o HTML5/TS)               │
│ - Historial de conversación y visualización de tool calls                 │
│ - Indicador de pensamiento y solicitudes de confirmación humana (HitL)    │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │ HTTP / Server-Sent Events (SSE)
┌─────────────────────────────────────▼─────────────────────────────────────┐
│ Backend Node.js / Bun + TypeScript                                        │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Ciclo del Agente (Agent Loop & Session Engine)                       │  │
│  │ - Control de turnos y límite de iteraciones (máx. 25)               │  │
│  │ - Manejo de interrupciones para revisión humana                      │  │
│  └──────────────────────────────────┬──────────────────────────────────┘  │
│                                     │                                     │
│  ┌──────────────────────────────────▼──────────────────────────────────┐  │
│  │ Adaptador LLM (Interface unificada para el proveedor de IA)          │  │
│  └──────────────────────────────────┬──────────────────────────────────┘  │
│                                     │ Invocación tipada (Zod)             │
│  ┌──────────────────────────────────▼──────────────────────────────────┐  │
│  │ Herramientas Tipadas (src/tools/contratos.ts)                        │  │
│  │ - contratos_leer_buzon    - contratos_validar                        │  │
│  │ - contratos_extraer       - contratos_registrar                      │  │
│  │                           - contratos_alertas                          │  │
│  └──────────────────────────────────┬──────────────────────────────────┘  │
└─────────────────────────────────────┼─────────────────────────────────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
      fixtures/ (Lectura)                      out/ (Escritura / Persistencia)
      ├── buzon/ (msg-001 a msg-006)           ├── sharepoint/
      ├── comerciales.json                    │   ├── maestro-contratos.csv
      └── maestro-contratos.csv               │   ├── historial.jsonl
                                              │   └── Contratos/
                                              ├── procesados.json
                                              ├── log.jsonl
                                              └── alertas.md
```

### 2.2 Despliegue de Componentes
* **Comportamiento (System Prompt):** Ubicado en `agent/prompt.md`. Define el rol, restricciones operativas y tono del agente.
* **Conocimiento del Proceso:** Ubicado en `src/knowledge/registro-contratos.md` (o `modulo/skill/registro-contratos/SKILL.md`). Contiene las reglas de negocio, taxonomía de países y monedas.
* **Ejecución y Lógica de Negocio:** Ubicada en `src/tools/contratos.ts`. Herramientas deterministas validadas mediante la librería `zod`.

---

## 3. Ciclo del Agente

1. **Recepción del Mensaje:** El usuario solicita procesar el buzón desde la interfaz de chat.
2. **Ejecución del Bucle (Agent Loop):** El agente consulta las herramientas disponibles. En cada iteración decide invocar una herramienta o responder al usuario.
3. **Control de Iteraciones:** Se establece un tope determinista de máximo **25 iteraciones** por turno. Si se alcanza el límite, el agente retorna el avance actual y las tareas pendientes.
4. **Mecanismo de Confirmación Humana (HitL):** Cuando la herramienta `contratos_validar` retorna campos en `requiere_revision` (debido a confianza $< 0.8$ o conflictos):
   * La herramienta `contratos_registrar` bloquea el registro a menos que reciba el argumento `confirmado: true`.
   * El agente suspende la ejecución automática y formula una pregunta clara en el chat solicitando la validación explícita del analista.
   * El front-end resalta visualmente el estado de espera de confirmación.

---

## 4. Elección del Modelo de Lenguaje

* **Proveedor y Modelo Elegido:** `Claude 3.5 Sonnet` (o `GPT-4o` / `Gemini 1.5 Pro` según configuración en entorno `.env`).
* **Justificación:** Alta capacidad de razonamiento estructurado para la invocación de herramientas (*Tool Calling / Function Calling*), estricto apego al System Prompt y bajo nivel de alucinación en extracción de datos.
* **Análisis y Estimación de Costos:**
  * Promedio de entrada por mensaje del buzón: ~1,500 tokens (incluyendo contexto e historial de herramientas).
  * Promedio de salida por mensaje: ~300 tokens.
  * Costo estimado por caso procesado: **~$0.005 USD / correo**. El lote completo de 6 correos requiere un consumo aproximado de **~$0.03 USD**.

---

## 5. Estrategia de Extracción de Datos y Confianza

1. **Partes, Valor, Plazo y Póliza:** La extracción primaria se apoya en expresiones regulares y patrones estructurados sobre los textos planos (`contrato.txt` o `otrosi.txt`).
2. **Cálculo de Confianza ($[0, 1]$):**
   * Coincidencia exacta de `id_contrato` y `nit_cliente`: Confianza **$1.0$**.
   * Fechas explicitadas en formato ISO (`YYYY-MM-DD`): Confianza **$0.95$**.
   * Plazos expresados verbalmente (ej: "12 meses desde el acta de inicio") o valores por demanda ("bolsa de horas"): Confianza **$0.5 - 0.6$**.
3. **Complementariedad Modelo vs. Herramienta:** El modelo analiza la semántica cuando el texto presenta ambigüedades, pero **únicamente las herramientas deterministas entregan y validan el valor definitivo que se inscribe en el archivo maestro**.

---

## 6. Propuesta de Regla de Gobierno (Gobierno Corporativo)

### 6.1 Canal Único de Recepción
Se establece `contratos@periferiaitgroup.com` como el único punto oficial para radicación de compromisos contractuales. Cualquier contrato recibido por cuentas personales carecerá de validez formal en el maestro.

### 6.2 Obligaciones del Equipo Comercial
* Remitir el contrato o otrosí firmado dentro de las **24 horas hábiles** posteriores a la firma.
* Formato de asunto obligatorio: `[TIPO_DOC] - [NIT CLIENTE] - [RAZÓN SOCIAL]`.
* Adjuntar archivo firmado en PDF nativo.

### 6.3 Acuse Automatizado
El agente emite un acuse de recibo en un plazo no mayor a **5 minutos**, entregando el ID de radicación y el estado del registro (*Registrado*, *Pendiente de Confirmación*, o *Rechazado*).

### 6.4 Excepciones y Escalamiento
Contratos sin firma o con campos obligatorios ausentes son clasificados como `rechazado` o bloqueados hasta confirmación y se escalan automáticamente a la Analista Administrativa y la Gerencia de Operaciones.

### 6.5 Reconstrucción del Histórico (Junio – Agosto 2026)
Se adelantará una campaña de conciliación cruzando las facturas emitidas en el ERP durante dicho trimestre contra el archivo maestro, solicitando a los comerciales la entrega del soporte contractual de aquellos clientes facturados que no figuren en el registro.

### 6.6 Indicador de Gestión (KPI)
$$\text{Cobertura del Maestro} = \left( \frac{\text{Contratos Registrados en Maestro}}{\text{Total Clientes Facturados en el Mes}} \right) \times 100 \quad (\text{Meta: } \ge 98\%)$$

---

## 7. Decisiones de Diseño y Trade-offs

| # | Decisión Adoptada | Alternativa Descartada | Justificación y Trade-off |
|---|---|---|---|
| 1 | **Persistencia plana en CSV/JSONL** | Base de datos relacional (PostgreSQL / SQLite) | El PRD especificaba simular SharePoint de manera local sin añadir dependencias pesadas. Menor complejidad de despliegue a costa de concurrencia. |
| 2 | **Validación estricta con Zod en backend** | Validación por prompts del LLM | Garantiza determinismo total y previene inyección de datos corruptos en el archivo CSV. |
| 3 | **Separación en módulo reutilizable (`modulo/`)** | Código empaquetado únicamente en la API HTTP | Permite reusar las herramientas y prompts en arquitecturas MCP o agentes de terceros. |

---

## 8. Supuestos Asumidos

1. Los archivos adjuntos en los escenarios del buzón corresponden a texto plano legibles sin necesidad de OCR.
2. La fecha actual de referencia para la verificación determinista y alertas es **2026-09-03**.
3. El archivo `comerciales.json` contiene la totalidad de los asesores autorizados para mapear las regiones y autorías.

---

## 9. Cobertura de Historias de Usuario

| Historia de Usuario | Estado | Observación / Pendiente para Producción |
|---|---|---|
| **HU-1: Leer el buzón** | **Hecho** | Implementado en `contratos_leer_buzon`. |
| **HU-2: Extraer datos** | **Hecho** | Extracción estructurada y puntuación de confianza en `contratos_extraer`. |
| **HU-3: Validar y clasificar** | **Hecho** | Clasificación en `nuevo`, `actualizacion`, `duplicado`, `rechazado` en `contratos_validar`. |
| **HU-4: Registrar y archivar** | **Hecho** | Generación de ruta en SharePoint, `historial.jsonl` y actualización del maestro. |
| **HU-5: Alertar** | **Hecho** | Generación del reporte `out/alertas.md` para vencimientos $\le 60$ días y pólizas. |
| **HU-6: Manejo de errores** | **Hecho** | Control de excepciones tipadas sin abortar el procesamiento del lote. |

*Para producción se requeriría conectar el agente con la API real de Microsoft Graph (Exchange y SharePoint) y agregar un motor de OCR para contratos escaneados en imagen.*

---

## 10. Uso de Asistentes de IA

* **Asistentes Utilizados:** ChatGPT / Claude / Gemini.
* **Tareas Desempeñadas:** Autocompletado de esquemas `zod`, estructuración de tipos en TypeScript y aceleración en la redacción de la propuesta de gobierno corporativo.
* **Descartes y Criterio:** Se descartaron propuestas de generación de código que intentaban realizar escritura directa sobre los archivos CSV desde el System Prompt del LLM, obligando a que toda modificación pase estrictamente por las herramientas tipadas.

---

## 11. Análisis de Riesgos y Mitigación

* **Riesgo:** Inconsistencias o duplicados por variaciones en la razón social del cliente.
  * *Mitigación:* Validación prioritaria por el número de `nit_cliente` antes que por la cadena de texto de la razón social.
* **Riesgo:** Infección de datos por interpretación errónea de montos o divisas por parte del LLM.
  * *Mitigación:* La herramienta de validación impone revisión humana automática cuando detecta monedas no estandarizadas o valores por demanda.