---
description: El calendario de tarifas de contratos perpetuos de MetaFlux — niveles de tarifa por volumen, niveles de rebate para maker y niveles de descuento por staking, y cómo se combinan los tres.
---

# Calendario de tarifas

:::info
**Resumen de tarifas.** Esta página es el calendario de tarifas de operaciones con contratos perpetuos dirigido al usuario.
Para conocer la mecánica subyacente — cómo se distribuye una tarifa, el flujo de recompra y distribución,
y los créditos para referidores y builders — consulta [Tarifas](./fees.md). Los valores de los niveles
son parámetros de red y pueden actualizarse mediante gobernanza.
:::

## Resumen rápido

Tu tarifa efectiva de operaciones con contratos perpetuos resulta de **tres sistemas de niveles independientes
que se combinan**:

1. **Niveles de tarifa** — tus tasas base de taker y maker, determinadas por tu volumen operado total
   durante los últimos 30 días.
2. **Niveles de rebate para maker** — un rebate adicional **que se resta de tu tasa maker**,
   determinado por tu participación en el volumen maker total del exchange. Puede llevar tu tasa
   maker neta a valores **negativos** (te pagan por aportar liquidez).
3. **Niveles de descuento por staking** — un descuento porcentual aplicado únicamente a tu **tasa
   taker**, determinado por la cantidad de MTF que tienes en staking.

Los tres se evalúan de forma continua y se aplican de manera conjunta. Los créditos por referido y
código de builder se aplican por separado, de forma adicional.

## 1. Niveles de tarifa (volumen)

Tus tasas base de taker y maker se determinan por tu **volumen operado total durante los últimos
30 días** (taker + maker, sumado en todos los mercados y en todas tus subcuentas).

| Volumen en 30 días | Taker | Maker |
|--------------------|------:|------:|
| `< $5M`       | 0.0350% | 0.0100% |
| `≥ $5M`       | 0.0300% | 0.0080% |
| `≥ $25M`      | 0.0270% | 0.0060% |
| `≥ $100M`     | 0.0250% | 0.0040% |
| `≥ $500M`     | 0.0220% | 0.0020% |
| `≥ $2B`       | 0.0200% | 0.0000% |

El volumen se mide en nocional USDC. La ventana avanza de forma continua — no existe un corte mensual,
por lo que una operación que cruce un umbral se aplica a partir de tu siguiente ejecución.

## 2. Niveles de rebate para maker (participación en volumen maker)

Además de tu tasa maker del nivel de tarifa, puedes obtener un **rebate maker adicional** determinado
por tu **participación en el volumen maker total del exchange** durante los últimos 30 días. El rebate
se **resta** de tu tasa maker y puede llevar tu tasa maker neta por debajo de cero — es decir, el
exchange te paga por aportar liquidez.

| Participación en volumen maker | Rebate maker adicional |
|--------------------------------|------------------------:|
| `≥ 0.5%`           | −0.0010% |
| `≥ 1.5%`           | −0.0020% |
| `≥ 3.0%`           | −0.0030% |

Este rebate se aplica únicamente a la **tasa maker**. No afecta tu tasa taker.

## 3. Niveles de descuento por staking (MTF en staking)

El staking de MTF genera un **descuento porcentual sobre tu tasa taker**. El descuento se aplica
únicamente a la tasa taker — nunca reduce tu tasa maker. La escala es un **grado administrativo de
diez peldaños** evaluado sobre tu **peso efectivo ponderado por tiempo** (no la cantidad bruta de
tokens — consulta [Staking](./staking.md) para el multiplicador).

| Grado | Peso efectivo | Descuento taker | Plazas |
|-------|-----------------:|---------------:|----------|
| Jefe de Sección (Alcalde de Township)        | `> 100`        | 5%  | sin límite |
| Subjefe de Sección                            | `> 500`        | 8%  | sin límite |
| Jefe de División (Jefe de Condado)            | `> 2,000`      | 12% | sin límite |
| Subjefe de División                           | `> 8,000`      | 15% | sin límite |
| Director General (Alcalde)                    | `> 30,000`     | 20% | sin límite |
| Subdirector General                           | `> 100,000`    | 25% | sin límite |
| Ministro (Gobernador)                         | `> 500,000`    | 32% | sin límite |
| Viceministro (Vicegobernador)                 | `> 1,500,000`  | 35% | sin límite |
| Consejero de Estado / Viceprimer Ministro     | `> 5,000,000`  | 40% | sin límite |
| Primer Ministro / Presidente / Secretario General | `> 10,000,000` **y clasificado #1 por peso** | 50% | **1 plaza** |

Los descuentos escalan de forma monotónicamente creciente de **5% a 50%**, y los umbrales de **100 a
10,000,000**.

### Dos vías: grados sin límite de plazas frente al único puesto con cupo

La escala funciona en **dos vías**:

- **Grados por umbral (sin límite de plazas).** Todos los grados excepto el grado superior son
  puramente por umbral: supera el nivel de peso efectivo requerido y mantienes el grado, sin límite
  en cuántas cuentas pueden acceder. Los grados **Sub-** y **Ministro (Gobernador)** son todos
  puramente por umbral y sin límite de plazas.
- **Plaza competitiva (con cupo).** Solo el grado superior tiene **cupo y es competitivo** —
  debes tanto superar el umbral **como** alcanzar la clasificación suficiente:
  - **Primer Ministro / Presidente / Secretario General** es la **única cuenta #1** por
    peso efectivo entre quienes superen `10,000,000`. Hay **1 plaza**.

  La plaza se asigna en **tiempo real**: si el titular pierde staking o su peso efectivo cae por
  debajo del de un contendiente, la plaza **pasa de inmediato a la siguiente cuenta calificada con
  mayor rango**. Una cuenta que supere el umbral de `> 10,000,000` pero no gane la plaza se
  mantiene en el **grado sin límite de plazas más alto para el que califica**
  (Consejero de Estado / Viceprimer Ministro).

Consulta [Staking](./staking.md) para saber cómo hacer staking de MTF y cómo se calcula el peso
efectivo. **El staking flexible (sin bloqueo) tiene un peso de 0×** y, por tanto, solo alcanza el
**grado más bajo** (Jefe de Sección) y **no genera dividendos** — es la vía diseñada deliberadamente
para los creadores de mercado.

## Cómo se combinan los tres

El nivel de tarifa establece tus tasas base de taker y maker según tu volumen. Los otros dos niveles
ajustan esas bases:

**Tasa taker efectiva** — el descuento por staking escala la tasa taker del nivel de tarifa:

```text
effective_taker = fee_tier_taker × (1 − staking_discount)
```

**Tasa maker efectiva** — el rebate maker se resta de la tasa maker del nivel de tarifa (el descuento
por staking **no** se aplica al maker):

```text
effective_maker = fee_tier_maker − maker_rebate
```

Un `effective_maker` negativo es un rebate que se te **paga a ti**.

| Componente | ¿Afecta al taker? | ¿Afecta al maker? |
|------------|:-----------------:|:-----------------:|
| Nivel de tarifa (volumen)              | tasa base | tasa base |
| Rebate maker (participación maker)     | — | se resta |
| Descuento por staking (MTF en staking) | se multiplica | — |

## Ejemplos prácticos

**Un staker de Consejero de Estado / Viceprimer Ministro en el nivel de volumen base.**
Tu peso efectivo supera `> 5,000,000` (Consejero de Estado / Viceprimer Ministro, 40%
de descuento taker), pero tu volumen en 30 días es inferior a $5M (nivel de tarifa base: taker 0.0350%,
maker 0.0100%).

```text
effective_taker = 0.0350% × (1 − 0.40) = 0.0210%
effective_maker = 0.0100% − 0.0000%    = 0.0100%
```

Pagas **0.0210% de taker** y **0.0100% de maker**.

**Un top maker en el nivel de volumen más alto.**
Tu volumen en 30 días es `≥ $2B` (nivel de tarifa: taker 0.0200%, maker 0.0000%) y tu
participación en volumen maker es `≥ 3.0%` (rebate −0.0030%).

```text
effective_maker = 0.0000% − 0.0030% = −0.0030%
```

Tu tasa maker neta es **−0.0030%** — el exchange **te paga el 0.0030%** del nocional
en cada ejecución maker. Tu tasa taker permanece en 0.0200% (menos cualquier descuento por staking).

**Combinando los tres niveles.**
Volumen `≥ $100M` (taker 0.0250%, maker 0.0040%), participación maker `≥ 1.5%` (rebate
−0.0020%), y staking de Director General (Alcalde) (20% de descuento taker):

```text
effective_taker = 0.0250% × (1 − 0.20) = 0.0200%
effective_maker = 0.0040% − 0.0020%    = 0.0020%
```

Pagas **0.0200% de taker** y **0.0020% de maker**.

## Además del calendario

Los créditos por referido y código de builder se aplican **por separado**, en adición a tus
tasas efectivas anteriores:

- **Referido** — cuando tienes un referidor asignado, una parte de tu tarifa taker se le destina
  a él del margen del protocolo; no es un cargo adicional para ti.
- **Códigos de builder** — un originador de flujo de órdenes (frontend, agregador) puede reclamar una
  parte cuando su dirección está asignada a la orden.

Consulta [Tarifas](./fees.md) para conocer la mecánica completa — cómo se distribuyen los créditos y
cómo las tarifas recaudadas financian la recompra de MTF que se quema y distribuye a los stakers.

## Casos extremos

<details>
<summary>Mostrar casos extremos</summary>

- **Volumen entre subcuentas.** Una cuenta principal y todas sus subcuentas comparten un único
  volumen en 30 días y, por tanto, un único nivel de tarifa. Una mesa de operaciones que ejecuta
  muchas estrategias bajo una misma cuenta principal obtiene el nivel agregado.
- **Evaluación continua.** Los tres niveles se reevalúan en una ventana móvil de 30 días —
  no hay corte mensual. Cruzar un umbral se aplica a partir de tu siguiente ejecución.
- **El rebate maker se financia con las tarifas taker.** Una tasa maker neta negativa se paga con
  las tarifas taker recaudadas en el mismo flujo. El exchange nunca paga en rebates maker más de
  lo que ingresa.
- **Descuento por staking y tasa maker.** El descuento por staking se aplica únicamente al taker. Un
  staker de Primer Ministro / Presidente / Secretario General sigue pagando (o cobrando) la tasa maker
  completa; solo el lado taker tiene descuento.
- **El grado superior es competitivo.** Solo el grado superior (Primer Ministro / Presidente /
  Secretario General, 1 plaza) se otorga por **clasificación**, no solo por umbral. Superar el
  umbral es necesario pero no suficiente — si la plaza está ocupada, mantienes el grado sin límite
  de plazas más alto para el que calificas hasta que quede libre. La plaza se reasigna en tiempo
  real a medida que cambian los pesos efectivos.

</details>

## Véase también

- [Tarifas](./fees.md) — mecánica de tarifas, flujo de recompra y distribución, créditos por referido y builder
- [Staking](./staking.md) — haz staking de MTF para desbloquear los niveles de descuento taker
- [Operaciones al contado](../products/spot.md) — las ejecuciones al contado tienen sus propias tasas por par
