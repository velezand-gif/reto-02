# Agente Conversacional — Registro de Contratos Vigentes

**Prueba Técnica IA · Periferia IT Group**  
**Candidato:** Andrés Alberto Vélez Menco  
**Versión:** 1.0.0 (Octubre 2026)

---

## 1. Descripción del Proyecto

Este repositorio contiene la solución al Reto 02 del proceso de selección Perxia 2.0. Corresponde a un **agente conversacional completo** diseñado para actuar como punto único de recepción de contratos para Periferia IT Group.

El agente procesa un buzón simulado de mensajes (`fixtures/reto-02/buzon/`), extrae y clasifica metadatos de contratos con puntuaciones de confianza, requiere confirmación humana (HitL) en campos ambiguos, actualiza la base maestra simulada en SharePoint (`out/sharepoint/maestro-contratos.csv`), mantiene auditoría (`historial.jsonl`) y emite reportes de alertas de vencimientos y pólizas pendientes (`out/alertas.md`).

---

## 2. Requisitos Previos

* **Entorno de ejecución:** [Bun](https://bun.sh/) (v1.0+) o [Node.js](https://nodejs.org/) (v20+).
* **Gestor de paquetes:** `bun` o `npm`.
* **API Key de LLM:** Una clave válida para OpenAI, Anthropic o Google Gemini (solo requerida para el backend del chat interactivo; el script `demo.ts` no requiere clave API).

---

## 3. Instalación y Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd reto-02
   ```

2. **Instalar dependencias:**
   ```bash
   bun install
   # O si usas Node.js:
   # npm install
   ```

3. **Configurar variables de entorno:**
   Copia el archivo de ejemplo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
   Edita `.env` y configura la clave del proveedor de lenguaje que desees utilizar:
   ```env
   PORT=3000
   LLM_PROVIDER=openai # openai | anthropic | google
   OPENAI_API_KEY=tu_clave_aqui
   ```

---

## 4. Verificación Determinista (`demo.ts`)

Para probar la robustez de las herramientas sin consumir un modelo de lenguaje ni requerir variables de entorno o API Keys, ejecuta el script determinista de verificación:

```bash
bun run demo.ts
# O con Node.js:
# npx tsx demo.ts
```

### ¿Qué realiza `demo.ts`?
1. Limpia y reinicia el directorio `out/`.
2. Lee los 6 mensajes del buzón simulado (`msg-001` a `msg-006`).
3. Extrae metadatos y clasifica cada caso (`nuevo`, `actualizacion`, `duplicado`, `rechazado`).
4. Demuestra el bloqueo de seguridad para `msg-006` al detectar campos con confianza $< 0.8$.
5. Simula una confirmación humana explícita (`confirmado: true`) para registrar `msg-006`.
6. Genera el informe de alertas en `out/alertas.md` para la fecha `2026-09-03`.

---

## 5. Ejecución de la Aplicación (Servidor HTTP + Chat Frontend)

Para levantar el backend API y la interfaz web en entorno local:

```bash
bun run dev
# O con Node.js:
# npm run dev
```

La aplicación estará accesible en: `http://localhost:3000`

### Probar el Chat:
Ingresa una solicitud al agente en la interfaz:
> *"Procesa el buzón de contratos con fecha de hoy 2026-09-03. Registra lo que esté limpio, muéstrame lo que requiere revisión campo por campo y termina con el reporte de alertas."*

---

## 6. Estructura del Repositorio

```
reto-02/
├── agent/
│   └── prompt.md                        # System Prompt del agente
├── src/
│   ├── server.ts                        # Servidor HTTP API y ciclo del agente
│   ├── llm/                             # Adaptador del proveedor LLM
│   ├── tools/
│   │   └── contratos.ts                 # Herramientas tipadas con Zod
│   └── knowledge/
│       └── registro-contratos.md        # Reglas de negocio y taxonomía
├── modulo/                              # Bonus: Agente desacoplado reusable
│   ├── agent.md                         # Prompt con frontmatter
│   ├── tools/contratos.ts               # Herramientas exportables
│   └── skill/registro-contratos/
│       └── SKILL.md                     # Conocimiento del proceso
├── fixtures/                            # Insumos de prueba entregados
│   ├── buzon/                           # Escenarios msg-001 a msg-006
│   ├── comerciales.json                 # Catálogo de comerciales
│   └── maestro-contratos.csv            # Registro maestro base
├── out/                                 # Artefactos de salida (ignorado en git)
├── demo.ts                              # Script de verificación determinista
├── SOLUCION.md                          # Documentación técnica y Gobierno
├── .env.example
├── package.json
└── README.md
```

---

## 7. Despliegue en Vivo

* **URL de Producción:** `https://reto-02-contratos.vercel.app` *(o tu URL de despliegue activa)*
* **Clave de Acceso (si aplica):** No requiere autenticación previa.