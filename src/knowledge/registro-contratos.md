# Base de Conocimiento: Registro y Control de Contratos Vigentes

## 1. Misión del Proceso
Asegurar la trazabilidad, vigencia y control de riesgos de la totalidad de los contratos de Periferia IT Group mediante un punto único de recepción y un repositorio centralizado en SharePoint.

---

## 2. Reglas de Negocio Operativas (RN1 - RN7)

* **RN1 · Duplicado:**
  Se considera duplicado cuando un contrato entrante coincide con un registro existente en `id_contrato`, `valor`, `fecha_inicio` y `fecha_fin`.
  * *Acción:* No se escribe nada en la base maestra; se reporta la novedad en el informe de ejecución[cite: 3].

* **RN2 · Actualización / Otrosí:**
  Se configura cuando existe coincidencia en el `id_contrato` (o coincidencia alta en `nit_cliente` + `objeto`) pero con cambios en fechas o montos, o cuando el documento adjunto se identifica explícitamente como un "Otrosí"[cite: 3].
  * *Acción:* Se actualiza la fila existente en el maestro y se registra la trazabilidad detallada del cambio en `out/sharepoint/historial.jsonl`[cite: 3].

* **RN3 · Registro Nuevo:**
  Aplica cuando el documento no presenta coincidencias previas de número de contrato ni de cliente en la base histórica[cite: 3].
  * *Acción:* Se inserta un nuevo registro en la base maestra[cite: 3].

* **RN4 · Rechazado:**
  Aplica para mensajes sin adjuntos de contrato/otrosí o cuyo texto carezca de partes contratantes u objeto comercial identificable[cite: 3].
  * *Acción:* Se notifica el motivo de rechazo y no se inscribe en el maestro[cite: 3].

* **RN5 · Human-in-the-Loop (Revisión Humana):**
  Todo campo extraído que posea una puntuación de confianza inferior a **0.8 (< 0.8)** o que presente ambigüedades (ej. "valor por demanda", "bolsa de horas" o plazos no estandarizados) debe detener el registro automático[cite: 3].
  * *Acción:* El agente formula una solicitud de confirmación humana en el chat[cite: 3]. La herramienta `contratos_registrar` bloquea el registro a menos que reciba `confirmado: true`[cite: 3].

* **RN6 · Aislamiento de Fixtures:**
  El archivo `fixtures/reto-02/maestro-contratos.csv` es de solo lectura[cite: 3]. La primera ejecución debe copiarlo hacia `out/sharepoint/maestro-contratos.csv` y trabajar únicamente sobre esta copia operativa[cite: 3].

* **RN7 · Auditoría Técnica:**
  Cada llamada a herramienta debe registrarse en `out/log.jsonl` con la marca de tiempo, la herramienta ejecutada, el mensaje procesado y el resultado de la operación[cite: 3].

---

## 3. Taxonomía Estándar de Datos

### 3.1 Países Válidos (`pais`)
* `CO`: Colombia
* `EC`: Ecuador
* `PE`: Perú
* `PA`: Panamá
* `HN`: Honduras

### 3.2 Monedas Permitidas (`moneda`)
* `COP`: Peso Colombiano
* `USD`: Dólar Estadounidense
* `PEN`: Sol Peruano
* `PAB`: Balboa Panameño
* `HNL`: Lempira Hondureño

### 3.3 Estados de Póliza (`estado_poliza`)
* `vigente`: Póliza expedida y con cobertura activa.
* `pendiente`: Contrato requiere póliza (`requiere_poliza = true`) pero aún no ha sido regularizada (estado por defecto al registrar un contrato nuevo)[cite: 3].
* `vencida`: Póliza con fecha de cobertura expirada.
* `no_aplica`: El contrato no exige póliza según sus cláusulas[cite: 3].

---

## 4. Estructura de Archivo en SharePoint Simulado

Los documentos aprobados y registrados deben archivarse usando la siguiente estructura de rutas relativas[cite: 3]:

$$\text{out/sharepoint/Contratos/}\langle\text{año\_inicio}\rangle\text{/}\langle\text{cliente-slug}\rangle\text{/}\langle\text{id\_contrato}\rangle\text{.pdf}$$

*Ejemplo:* `out/sharepoint/Contratos/2026/industrias-delta/CT-2026-001.pdf`[cite: 3]