# Modo cobertura (posiciones bidireccionales)

:::info
**Disponible.** El activador opcional, el enrutamiento explícito por dirección, el **margen independiente por tramo** y el **reporte de posición de doble tramo** están implementados: una cuenta puede cambiar al modo cobertura (cuando está plana), enrutar cada orden a un tramo explícito mediante `position_side`, y cada tramo registra su propio margen y se reporta como su propio objeto de posición. La **liquidación por tramo** está parcialmente implementada: cuando una cuenta es marcada para cierre forzado, ambos tramos son analizados y puntuados, y el orden de cierre determinista (el tramo con mayor mantenimiento primero) se calcula de forma idéntica en todos los validadores — la emisión efectiva de cierre por tramo contra el libro de órdenes aún está en despliegue. El comportamiento predeterminado y recomendado sigue siendo el unidireccional (una sola posición neta por mercado).
:::

## En resumen

Por defecto, una cuenta mantiene **una posición neta por mercado** (unidireccional): comprar mientras se está corto reduce y luego invierte esa misma posición. El **modo cobertura** permite que una cuenta mantenga **un tramo largo y un tramo corto en el mismo mercado al mismo tiempo**, rastreados de forma independiente.

El modo cobertura es **opcional por cuenta** y **sin umbral de saldo** — cualquier cuenta puede activarlo. Solo puede activarse o desactivarse mientras la cuenta está **plana en todos los mercados**.

## Unidireccional vs. cobertura

| | Unidireccional (predeterminado) | Cobertura |
|---|---|---|
| Posiciones por mercado | 1 neta (con signo) | hasta 2 (un tramo Long + un tramo Short) |
| "Comprar mientras se está corto" | reduce y luego invierte la posición neta | reduce únicamente el tramo **Short** (o abre/amplía el tramo **Long** — tú decides) |
| Selección de dirección de la orden | inferida de compra/venta | `position_side` **explícito** (`long` / `short`) requerido |
| Margen | un requisito neto | cada tramo con margen independiente |
| Liquidación | un precio de liquidación | cada tramo puntuado por su propio mantenimiento; orden de cierre determinista implementado, emisión de cierre por tramo en despliegue |
| Reporte | un objeto de posición neta | un objeto por tramo no nulo (cada uno etiquetado con `position_side`) |

El activador, el enrutamiento por dirección, el margen independiente por tramo y el reporte de doble tramo están disponibles; la selección de liquidación por tramo está implementada, y la emisión de cierre por tramo aún está en despliegue (consulta la nota de estado anterior).

## Cómo activarlo

Cambiar el modo de posición es una acción firmada; solo es válida cuando la cuenta está **plana en todos los mercados**.

```json
// activar modo cobertura (solo válido cuando estás plano en TODOS los mercados)
{ "type": "set_position_mode", "params": { "hedge": true } }
```

```json
// volver al modo unidireccional (también solo cuando estás plano)
{ "type": "set_position_mode", "params": { "hedge": false } }
```

`hedge` es un booleano: `true` = cobertura (bidireccional), `false` = unidireccional (el predeterminado).
La condición previa de **estar plano en todos los mercados** es una regla de seguridad — intentar cambiar mientras hay alguna posición abierta es rechazado (una operación sin efecto que no muta nada), de modo que una posición neta nunca pueda ser reinterpretada silenciosamente como un tramo huérfano. Establecer el modo al valor que ya tiene, estando plano, es una operación sin efecto exitosa.

Consulta [`set_position_mode`](../api/rest/exchange.md#set_position_mode) en la referencia de `/exchange` para obtener el detalle de solicitud/respuesta.

## Cómo colocar órdenes en modo cobertura

En modo cobertura, cada orden **debe incluir un `position_side` explícito** (`long` / `short`). Una cuenta unidireccional **no debe** enviar `position_side`; una cuenta en modo cobertura sí debe hacerlo. El campo se incluye en el cuerpo de la orden `submit_order` junto con `side`, `reduce_only`, etc.

```json
{
  "type": "submit_order",
  "order": {
    "owner": "0x...aa", "market": 0, "side": "bid",
    "kind": "limit", "size": 100000000, "limit_px": 5000000000,
    "tif": "gtc", "stp_mode": "cancel_oldest",
    "reduce_only": false,
    "position_side": "long"
  }
}
```

| Intención | `side` | `position_side` | `reduce_only` |
|---|---|---|---|
| Abrir / añadir al largo | `bid` | `long` | false |
| Reducir / cerrar largo | `ask` | `long` | true |
| Abrir / añadir al corto | `ask` | `short` | false |
| Reducir / cerrar corto | `bid` | `short` | true |

`position_side` es **explícito, nunca inferido** — de lo contrario, una compra destinada a *reducir un corto* podría abrir o aumentar erróneamente un largo. `reduce_only` se evalúa **únicamente contra el tramo especificado**: una orden `reduce_only` sobre el tramo `short` nunca puede tocar el tramo `long`.

En modo cobertura **no existe la "inversión"**. Cerrar el tramo largo nunca abre un corto — eso requiere una orden separada contra el tramo corto.

## Margen

Cada tramo se margina de forma **independiente** — el tramo largo y el tramo corto registran cada uno su propio margen inicial y de mantenimiento, sumados en el requisito total de la cuenta:

```
required_margin = init_margin(long_leg) + init_margin(short_leg)
```

Esto es intencionalmente conservador: un largo+corto en el mismo mercado es delta-neutral en términos de precio, pero cada tramo igualmente inmoviliza margen. (Una mejora futura puede ofrecer crédito de compensación para tramos opuestos bajo [margen de cartera](./portfolio-margin.md); hasta entonces, mantén ambos tramos solo si deseas exposiciones genuinamente separadas, p. ej., distintos precios de entrada que pretendes gestionar de forma independiente.)

Cada tramo conserva su propio [modo de margen](./margin-modes.md) — puedes, por ejemplo, ejecutar el tramo largo en modo aislado y el tramo corto en modo cruzado.

## Liquidación

Cuando una cuenta es marcada para cierre forzado, ambos tramos son analizados y puntuados según su propia contribución de mantenimiento, y el orden de cierre determinista — el **tramo con mayor mantenimiento primero** (empates: largo antes que corto), idéntico en todos los validadores — se calcula mediante la escalera estándar de [liquidación escalonada](./tiered-liquidation.md). La emisión efectiva de cierre por tramo contra el libro de órdenes aún está en despliegue; cuando esté disponible, liquidar un tramo no afectará al otro.

## Reporte

Con el modo cobertura activo, el estado de la cuenta y las lecturas de posición de `/info` devuelven **un objeto de posición por tramo no nulo** para un mercado con ambos tramos, cada uno etiquetado con su `position_side` (`"long"` / `"short"`). Una cuenta unidireccional devuelve una única posición *neta* **sin** campo `position_side`, exactamente como antes. El interés abierto a nivel de mercado sigue siendo una única cifra neta. Consulta [`account_state` positions](../api/rest/info.md#account_state).

## Véase también

- [Modos de margen](./margin-modes.md) — cruzado / aislado / iso-estricto, aplicado por tramo
- [Margen de cartera](./portfolio-margin.md) — donde viviría el crédito futuro de compensación de tramos
- [Liquidación escalonada](./tiered-liquidation.md) — escaleras por tramo
- [Referencia de `/exchange`](../api/rest/exchange.md#set_position_mode) — el formato de acción en protocolo

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Debo usar el modo cobertura?**
R: No. El modo unidireccional (neto) es el predeterminado y se comporta exactamente como antes; el modo cobertura es puramente opcional.

**P: ¿Hay un saldo mínimo para activarlo?**
R: Sin umbral — cualquier cuenta puede activar el modo cobertura mientras esté plana.

**P: ¿Por qué no puedo cambiarlo mientras tengo una posición abierta?**
R: Para evitar que una posición neta existente se convierta en un tramo ambiguo y huérfano. Cierra la posición y luego cambia el modo.

**P: ¿Un largo + corto de igual tamaño cuesta el doble de margen?**
R: Sí — los tramos se marginan de forma independiente, por lo que un largo+corto compensado inmoviliza el margen de ambos tramos. El crédito de compensación para tramos opuestos es una mejora futura (bajo [margen de cartera](./portfolio-margin.md)).

</details>
