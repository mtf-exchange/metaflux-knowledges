# Ganar

:::info
**Disponible en devnet (versión preliminar).** Un fondo de préstamos en USDC que genera rendimiento a partir de los prestatarios de [margen spot](../products/spot-margin.md). El suministro, el precio de las participaciones, el rescate con límite de liquidez inactiva Y el liquidador automático de margen spot que protege el fondo operan de extremo a extremo en **devnet hoy** (consulta la [interfaz de acciones](#deposit--withdraw) más abajo). Trátalo como una **versión preliminar**: los ratios de mantenimiento por par aún están siendo calibrados.
:::

## Resumen

Deposita USDC en el **fondo Earn** y obtén rendimiento. El fondo presta USDC a los prestatarios de [margen spot](../products/spot-margin.md), quienes pagan intereses; ese interés se acumula en el fondo y eleva el valor de tus **participaciones**. **No hay paso de reclamación** — el rendimiento se capitaliza continuamente en el valor de tus participaciones y lo realizas al retirar.

## Cómo funciona — modelo de participaciones / NAV

Cuando depositas recibes **participaciones** valoradas al valor neto del activo por participación (NAV) actual del fondo. Los intereses pagados por los prestatarios aumentan el valor total del fondo, por lo que cada participación vale progresivamente más USDC.

```
share_price        = pool_value / total_shares           # NAV por participación
deposit D USDC  →  mint  D / share_price  shares
withdraw S shares → receive  S × share_price  USDC
```

- `pool_value` comienza igual al total de depósitos y **crece en cada bloque** a medida que los intereses de los préstamos se acumulan en él.
- `total_shares` solo cambia con los depósitos (emisión) y los retiros (quema).
- El primer depósito establece `share_price = 1.0` (1 participación = 1 USDC).

Dado que los intereses inflan `pool_value` (no la cantidad de participaciones), `share_price` sube de forma monótona mientras los préstamos funcionan bien — las participaciones de todos los tenedores se aprecian a la misma tasa, sin carreras de reclamación ni contabilidad por usuario.

## El cálculo de ganancias

Tus ganancias son la apreciación de tus participaciones entre el depósito y el retiro:

```
your_yield = your_shares × (share_price_now − share_price_at_deposit)
```

Por bloque, el fondo crece en función de los intereses que adeudan los préstamos vigentes:

```
interest_this_block = total_borrowed × borrow_rate_per_ms × Δms
pool_value         += interest_this_block
share_price         = pool_value / total_shares          # recalculado
```

### APY efectivo

No todo el USDC depositado se presta de inmediato — solo la fracción **utilizada** gana la tasa de préstamo. Por ello, el rendimiento que percibe el depositante es la tasa de préstamo escalada por la utilización:

```
utilisation     = total_borrowed / pool_value            # 0 … 1
depositor_APY  ≈ borrow_APR × utilisation × (1 − protocol_fee)
```

| | Valor |
|---|---|
| `borrow_APR` | la tasa de préstamo fija de margen spot (por par) |
| `utilisation` | fracción del fondo actualmente prestada |
| `protocol_fee` | comisión opcional del protocolo sobre los intereses, si está configurada |

Ejemplo: una APR de préstamo del 12% con una utilización del 50% y sin comisión de protocolo → APY del depositante ≈ 6%. Toda la aritmética es de punto fijo (`Decimal`), sin punto flotante.

## Depositar / retirar

Ambas acciones están autorizadas por el remitente en la ruta pública
[`/exchange`](../api/rest/exchange.md#spot-margin--earn); `asset` es el
**id del activo de cotización prestable** (la clave del fondo — la cotización de un par spot registrado),
y `amount` / `shares` son decimales enviados como cadenas JSON. El fondo
**se crea automáticamente en el primer depósito** para cualquier activo prestable. Confirma las participaciones emitidas /
restantes y los totales del fondo mediante
[`/info` `earn_state`](../api/rest/info.md#earn_state).

```json
// supply 5,000 USDC into the Earn pool for asset 100
{ "type": "earn_deposit", "params": { "asset": 100, "amount": "5000" } }
```

```json
// redeem shares (receive shares × share_value), idle-bounded
{ "type": "earn_withdraw", "params": { "asset": 100, "shares": "1234.5" } }
```

| Acción | Efecto |
|---|---|
| [`earn_deposit`](../api/rest/exchange.md#earn_deposit) | Suministra la cotización → participaciones del fondo (1:1 en un fondo nuevo, de lo contrario valorado según el NAV) |
| [`earn_withdraw`](../api/rest/exchange.md#earn_withdraw) | Rescata participaciones → cotización, **limitado a la liquidez inactiva** |

**Límite de liquidez inactiva.** Un retiro es inmediato pero **está limitado por la liquidez inactiva**
(`total_supplied − total_borrowed`): un rescate mayor que la liquidez inactiva paga exactamente
la liquidez inactiva y quema proporcionalmente menos participaciones, y un fondo con **cero liquidez inactiva** (totalmente prestado) rechaza el retiro hasta que los prestatarios reembolsen. Esto garantiza que un proveedor siempre puede salir hasta el monto que no está prestado y nunca deja el libro de préstamos infracapitalizado.

## Riesgo

Earn **no está exento de riesgo**. Si una posición de [margen spot](../products/spot-margin.md) se cierra
con una pérdida que la garantía del prestatario no puede cubrir, el **déficit se socializa
entre los proveedores**: el `total_supplied` del fondo se reduce (con un mínimo de cero), lo que
reduce `share_value`. La protección del fondo es el **liquidador automático** (activo
en devnet): en cada bloque, las cuentas de margen con posiciones underwater se
[cierran forzosamente](../products/spot-margin.md#liquidation) en el mínimo de mantenimiento, por lo que
una posición se deshace mientras normalmente aún hay suficiente valor para reembolsar el préstamo.
El ratio de mantenimiento conservador por par (aún siendo calibrado) dimensiona ese
margen de seguridad; está previsto un cascada de reserva de seguro antes de que llegue a los proveedores, pero aún no está implementado. También existe **riesgo de liquidez**: los rescates están limitados por la liquidez inactiva,
por lo que no es posible salir de un fondo totalmente utilizado hasta que los prestatarios reembolsen.

## Ver también

- [Margen spot](../products/spot-margin.md) — los prestatarios cuyos intereses son tu rendimiento
- [Liquidación escalonada](./tiered-liquidation.md) — la cascada de seguro que protege el fondo
- [Vaults](./vaults.md) — un producto de rendimiento diferente (capital LP gestionado por estrategia), no un fondo de préstamos

## Preguntas frecuentes

<details>
<summary>Mostrar preguntas frecuentes</summary>

**P: ¿Tengo que reclamar mi rendimiento?**
R: No. El rendimiento se capitaliza continuamente en el valor de tus participaciones; lo realizas al retirar.

**P: ¿Por qué mi APY está por debajo de la tasa de préstamo?**
R: Solo la fracción prestada (utilizada) del fondo gana intereses. APY ≈ tasa de préstamo × utilización.

**P: ¿Puedo perder el capital?**
R: Sí, si una pérdida de margen spot supera la garantía del prestatario — el déficit no cubierto se socializa entre los proveedores y reduce el valor de las participaciones (está previsto un buffer de seguro antes de los proveedores, pero aún no está implementado). Está diseñado para ser infrecuente: el liquidador automático cierra forzosamente las posiciones underwater en el mínimo de mantenimiento, y el ratio por par se establece de forma conservadora. Earn tiene menor riesgo que un [vault](./vaults.md) de trading, pero no está exento de riesgo.

**P: ¿Por qué no puedo retirar todo mi saldo ahora mismo?**
R: Los rescates están limitados por la **liquidez inactiva** (`supplied − borrowed`). Si el fondo está totalmente prestado a prestatarios de margen spot, solo puedes retirar hasta el monto inactivo; el resto se desbloquea a medida que los prestatarios reembolsan.

**P: ¿En qué se diferencia Earn de un vault de Metaliquidity?**
R: Earn es un fondo de **préstamos** pasivo en USDC (rendimiento = intereses de préstamos). Un [vault](./vaults.md) es capital LP **gestionado activamente** (rendimiento/pérdida = el PnL de la estrategia). Perfiles de riesgo distintos.

</details>
