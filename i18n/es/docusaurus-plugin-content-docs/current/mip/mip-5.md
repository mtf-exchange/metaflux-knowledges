# MIP-5 — Earn

:::info
**Planificado.** MIP-5 asigna la ranura previamente reservada a **Earn** — un
fondo de préstamos donde los depositantes suministran activos y obtienen
rendimiento del interés que pagan los prestatarios de margen al contado.
La especificación y el despliegue seguirán al trabajo de margen al contado sobre
el que se construye.
:::

## Qué es Earn

Earn es el **lado de oferta del mercado de préstamos al contado de MetaFlux**.
Un depositante presta un activo (p. ej., USDC) a un fondo por activo y recibe
**participaciones** valoradas según el valor liquidativo neto (NAV) del fondo —
la misma contabilidad de NAV/participación que la
[bóveda Metaliquidity](./mip-2.md). Los operadores de margen al contado toman
prestado del fondo y pagan intereses; esos intereses se acumulan en el NAV del
fondo, de modo que cada participación se aprecia. El rendimiento de un
depositante es:

```
your_yield = shares × (share_price_now − share_price_at_deposit)
```

La tasa de interés es una función determinista de la **utilización** (prestado ÷
suministrado). La APY de suministro la sigue:

```
supply_APY ≈ borrow_APR × utilisation × (1 − reserve_factor)
```

## Dos caras de un mismo mercado

Earn (oferta) y el margen al contado (demanda) son las dos caras de un único
mercado de préstamos: el interés que pagan los prestatarios **es** el
rendimiento que obtienen los prestamistas.

- **Reutiliza la contabilidad NAV/participación de [MIP-2](./mip-2.md)** para
  depósitos y retiros (el depósito acuña participaciones al precio actual de
  participación; el retiro las canjea al NAV).
- Añade lo que una bóveda no tiene: una curva de tasa de interés
  utilización→APR y acumulación de intereses continua (por bloque).

## Estado

Planificado. Depende de que el trading al contado y el margen al contado se
completen primero; aún no forma parte del conjunto de funcionalidades terminadas
de la V1.

## Referencia normativa

- Consulta el [registro de MIP](./index.md) para el índice autoritativo y el
  estado de cada MIP.
