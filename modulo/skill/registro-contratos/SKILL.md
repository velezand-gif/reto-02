---
name: registro-contratos
description: Guía de conocimiento normativo, reglas de negocio y taxonomía de datos para el registro de contratos en Periferia IT Group.
---

# Reglas de Negocio (RN1 - RN7)

- **RN1 (Duplicado):** Se da cuando coinciden el `id_contrato`, `valor`, `fecha_inicio` y `fecha_fin`. No se escribe un nuevo registro en la base maestra; se reporta la novedad.
- **RN2 (Actualización / Otrosí):** Coincide el `id_contrato` (o `nit_cliente` + `objeto` con similitud ≥ 0.9) pero existen variaciones en fechas o valores, o cuando el documento se identifica explícitamente como "Otrosí". Se debe actualizar la fila existente en el maestro y generar trazabilidad auditada en `out/sharepoint/historial.jsonl`.
- **RN3 (Registro Nuevo):** No existen coincidencias previas de número de contrato o NIT de cliente en la base maestra. Se inserta una nueva fila.
- **RN4 (Rechazo Operativo):** Aplica para correos sin archivos adjuntos de contrato/otrosí o cuyo texto carezca de partes u objeto comercial identificable.
- **RN5 (Human-In-The-Loop / Revisión Humana):** Todo campo con un nivel de confianza inferior a 0.8 (< 0.8) o con ambigüedades requiere la confirmación explícita del usuario desde la interfaz de chat antes de registrarse.
- **RN6 (Aislamiento de Fixtures):** El archivo `maestro-contratos.csv` original es de solo lectura. La primera ejecución crea una copia operativa en `out/sharepoint/maestro-contratos.csv`.
- **RN7 (Trazabilidad Global):** Toda invocación de herramientas debe registrar una entrada en `out/log.jsonl` con marca de tiempo, ID del mensaje y resultado.

# Taxonomía de Cobertura Geográfica y Monedas

- **Países Válidos:**
  - `CO` (Colombia)
  - `EC` (Ecuador)
  - `PE` (Perú)
  - `PA` (Panamá)
  - `HN` (Honduras)

- **Monedas Permitidas:**
  - `COP`
  - `USD`
  - `PEN`
  - `PAB`
  - `HNL`

# Definición de Estados de Póliza

- `vigente`: Póliza constituida y con cobertura activa.
- `pendiente`: Contrato requiere póliza pero aún no ha sido adjuntada o validada (estado por defecto para nuevos registros que requieran póliza).
- `vencida`: Póliza cuya fecha de vigencia ha expirado.
- `no_aplica`: El contrato no requiere póliza según sus cláusulas.