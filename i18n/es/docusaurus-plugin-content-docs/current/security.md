# Modelo de seguridad

:::tip
**Estable.**
:::

Qué garantiza el protocolo, qué no garantiza y dónde recae el riesgo sobre el usuario.

## Resumen

- El protocolo garantiza: semántica determinista de máquina de estados, autorización vinculada a firma, auditabilidad en cadena de cada acción.
- El protocolo NO garantiza: la corrección del oráculo más allá de la composición publicada, el almacenamiento de tu clave privada ni la ausencia de riesgo de gobernanza.
- Los programas de recompensas por errores se ejecutan en plataformas de terceros; se espera divulgación coordinada.

## Superficie de confianza

### Lo que es responsabilidad del protocolo

| Capa | Garantía del protocolo |
|------|------------------------|
| Consenso | Acuerdo M-de-N entre validadores; transiciones de estado deterministas; bloques firmados |
| Máquina de estados | Ejecución idéntica entre validadores; tiempo determinista; aritmética solo de enteros |
| Recuperación de firma | EIP-712 sobre msgpack; recuperación secp256k1; mapa de aprobación de agentes |
| Precio de marcación | Fórmula de composición + banda de seguridad según se documenta en [precios de marcación](./concepts/mark-prices.md) |
| Liquidación | La escalera por niveles se activa de forma determinista sobre el estado comprometido |
| Cálculo de comisiones | Tabla de niveles + ratio de quema aplicados de forma idéntica por cada ejecución |

Un nodo que no siga estas reglas no es un validador válido; el consenso lo rechaza.

### Lo que es responsabilidad del usuario

| Capa | Responsabilidad del usuario |
|------|------------------------------|
| Almacenamiento de clave privada | Almacenamiento en frío para la clave maestra; almacenamiento en caliente para agentes; buenas prácticas de rotación |
| Lógica del bot fuera de cadena | Qué órdenes colocar, cuándo reponer margen, cuándo cerrar posiciones |
| Gestión de riesgo | Dimensionamiento de la posición en relación con el cupo / el patrimonio |
| Riesgo de contraparte en el puente | Elección de la wallet de la cadena de origen y la ruta del puente |

### Donde la confianza es compartida

| Capa | Supuesto de confianza |
|------|------------------------|
| Composición del oráculo | Confiar en el oráculo publicado por los validadores dentro de la composición documentada |
| MetaBridge | Confiar en la cofirma ponderada por participación ⅔ del conjunto de validadores de MetaFlux sobre TODAS las transferencias del puente — incluido USDC — sujeta a una ventana de disputa de retiro (mismas claves que el consenso; sin servicio de atestación de terceros; ver [puente](./bridge/)) |
| Gobernanza | Los cambios de parámetros están controlados por gobernanza; confiar en que la gobernanza actúa en interés del protocolo |

El principio: la confianza se minimiza, no se elimina. Donde la confianza compartida es inevitable (oráculos, servicios de atestación), la superficie de confianza está documentada y acotada.

## Modelo de amenazas

### Fuera del alcance del protocolo

- Un usuario firma una orden de la que luego se arrepiente.
- La clave en caliente de un usuario es robada y el ladrón firma operaciones (por eso los agentes no tienen autoridad de retiro).
- Un usuario no repone el margen y es liquidado según la escalera por niveles documentada.
- Un usuario acepta una cotización de RFQ a un precio desfavorable.
- Un usuario deposita en un vault que genera pérdidas.
- Un parámetro definido por gobernanza cambia dentro de sus límites y afecta la posición de un usuario.

Estos no son problemas de seguridad. Son riesgos operativos que asume el usuario.

### En el alcance (repórtelos)

- Falsificación de firma / aceptación de firmas inválidas.
- Ejecución no determinista de la máquina de estados (dos validadores discrepan sobre el estado comprometido).
- Repetición de firmas válidas entre redes (elusión del aislamiento de dominio chainId).
- Escalada de privilegios (un agente obtiene autoridad de retiro; una entidad no maestra activa una acción exclusiva del maestro).
- Pérdida de fondos fuera de la mecánica documentada de liquidación / ADL / comisiones.
- Fallos de integración del puente (cofirma de MetaBridge / verificación de quórum ⅔, repetición de message-id, elusión de la ventana de disputa).
- Elusión de autenticación WS (suscripción a canales privados sin autenticación).
- DoS que impida que acciones válidas sean admitidas dentro de los límites de tasa documentados.
- Invariantes documentados que no se cumplen (p. ej., elusión de la monotonicidad del nonce).

## Política de divulgación

Para vulnerabilidades de seguridad:

1. **No** abras un issue público en GitHub.
2. Envía un correo a `security@mtf.exchange` (clave PGP disponible en el sitio web antes del lanzamiento) con:
   - Una descripción de la vulnerabilidad
   - Pasos de reproducción
   - Tu evaluación del impacto
   - Tu contacto para el seguimiento
3. Espera una respuesta de acuse de recibo en un plazo de 48 horas.
4. Calendario de divulgación coordinada: 90 días desde el acuse de recibo, o antes si se parchea y despliega.

Un programa de recompensas por errores con recompensas escalonadas se ejecuta en una plataforma de terceros; los detalles se publicarán antes del lanzamiento.

## Auditabilidad en cadena

Cada acción queda permanentemente registrada en cadena. Las herramientas forenses pueden reconstruir:

- El historial completo de acciones por dirección (firmante, action_hash, bloque de compromiso).
- El historial completo de liquidaciones (cuenta, nivel, precio de marcación, pérdida realizada).
- El ciclo de vida de la aprobación de agentes (maestro, agente, eventos de aprobación / vencimiento / reaprobación).
- La trayectoria del NAV del vault y la tabla de depositantes.

Los exploradores exponen estos datos; los indexadores los sirven en formato consultable.

## Ejecución determinista

La máquina de estados es una función pura:

```
state_{t+1} = apply(state_t, ordered_actions_in_block)
```

Los validadores que discrepan sobre `state_{t+1}` no son conformes. Las fuentes de no determinismo (punto flotante, iteración sobre mapas desordenados, tiempo del sistema) están prohibidas en la ruta de consenso. Las auditorías apuntan explícitamente a esta propiedad.

Si tu bot calcula un valor de estado futuro (p. ej., el margen PM esperado tras una orden), puede calcularlo de forma idéntica a como lo haría la cadena, dados los mismos inputs. La especificación de wire contiene todo lo que necesitas.

## Recomendaciones de seguridad operacional

Para usuarios institucionales o en producción:

| Recomendación | Por qué |
|---------------|---------|
| Usa multi-sig para la cuenta maestra | La vulneración de una sola clave es un único punto de fallo |
| Un agente por host / estrategia | El radio de impacto en caso de vulneración queda acotado |
| Vencimientos de agente ajustados (≤ 30 d) | Cadencia de rotación forzada |
| HSM / wallet de hardware para el maestro y el maestro de subcuenta | Superficie de firma en almacenamiento frío |
| Limita la tasa de salida de tu propio bot | Evita que bucles descontrolados agoten el presupuesto por cuenta |
| Mantén un agente vigilante de riesgo independiente | Reposición de margen independiente de la lógica de trading |
| Ejecuta nodos duales para los feeds WS | Resiliencia ante latencia y reconexiones |
| Suscríbete a alertas de estado | Los incidentes del lado del operador afectan tu latencia / disponibilidad |
| Audita la reconciliación action_hash → commit | Detecta caídas silenciosas |
| Prueba las migraciones con cambios disruptivos contra testnet con 60 días de antelación | Evita sorpresas el día del despliegue en mainnet |

## Qué ocurre si la cadena falla

Las detenciones del consenso (p. ej., una partición que impide el quórum) son operacionalmente poco frecuentes pero posibles. Durante una detención:

- `/info` sigue sirviendo desde el último estado comprometido.
- `/exchange` rechaza con `503 chain_unavailable`.
- WS mantiene el keep-alive; no hay nuevas notificaciones hasta que se reanude.
- Las liquidaciones se detienen: el precio de marcación permanece en el último valor; no hay transiciones de nivel durante la detención.

Al reanudarse, la cadena reproduce desde el último bloque comprometido. No se pierde ningún estado. El tiempo avanza según el tiempo de bloque derivado del consenso, no el reloj de pared; los pagos de financiación se encolan y se ejecutan al reanudarse.

Si un nodo detecta una detención del consenso, cambia a otro nodo / pasarela (el conjunto de validadores está distribuido). El diseño del protocolo asume que ≥ 2/3 de los validadores son honestos y están en línea; las detenciones transitorias por debajo del umbral de fallo de esa fracción son esperadas.

## Véase también

- [Puente](./bridge/) — superficie de confianza de custodia de MetaBridge
- [Versionado](./versioning.md) — política de cambios
- [Redes](./networks.md) — puntos de acceso operativos
- [Multi-sig](./concepts/multi-sig.md) — custodia institucional

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Está el consenso formalmente verificado?**
R: El modelo de consenso está formalmente especificado; la verificación formal (TLA+ / Stateright) cubre los invariantes de seguridad + vivacidad. La implementación en producción es auditada contra la especificación.

**P: ¿Pueden ser penalizados los oráculos?**
R: Los datos del oráculo son firmados por el conjunto de validadores. Un validador que publique datos de oráculo demostrablemente incorrectos (fuera de las bandas de seguridad de forma reiterada) es susceptible de penalización según las reglas de [staking](./concepts/staking.md).

**P: ¿Cuál es la pérdida máxima para un usuario ante un error conocido del protocolo?**
R: Depende del error. La arquitectura limita el radio de impacto — aislamiento de subcuentas, bloqueo de retiros por agentes, límites por corredor en el puente, fondo de seguro — pero un error profundo en la máquina de estados podría en principio vaciar cuentas. Por eso la divulgación importa y las auditorías son continuas.

**P: ¿Puede el protocolo revertir el estado?**
R: No de forma unilateral. Una reversión requiere una decisión coordinada del conjunto de validadores y se trata como un hard fork. La política estándar es: nunca revertir por pérdidas individuales de usuarios; revertir solo ante errores de protocolo que comprometan la corrección del consenso. El umbral exacto lo determina la gobernanza.

</details>
