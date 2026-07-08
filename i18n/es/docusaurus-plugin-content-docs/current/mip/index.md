# MIP — Propuestas de Mejora de Mercado

:::info
**Estado.** MIP-1 implementado · MIP-2 en progreso · MIP-3 implementado · MIP-4 planificado (V2) · MIP-5 (Earn) planificado · MIP-6 diferido (V3).
:::

MetaFlux sigue un modelo numerado de propuestas de mejora (análogo a los esquemas de propuestas de mejora utilizados por los protocolos de contratos perpetuos on-chain establecidos) para los cambios a nivel de protocolo que afectan a los mercados listados, la liquidez nativa o los mecanismos de comisiones principales.

| MIP | Título | Estado |
|-----|--------|--------|
| [MIP-1](./mip-1.md) | Estándar de token spot + despliegue de mercado | Implementado |
| [MIP-2](./mip-2.md) | Metaliquidity — bóveda de liquidez del protocolo | En progreso |
| [MIP-3](./mip-3.md) | Despliegue de mercado perp sin permisos | Implementado |
| [MIP-4](./mip-4.md) | Agregador/internalizador de liquidez perp | Planificado (V2) |
| [MIP-5](./mip-5.md) | Earn — pool de préstamos spot | Planificado |
| [MIP-6](./mip-6.md) | Mercados de resultados / predicción | Diferido (V3) |

Las propuestas de despliegue separan el mercado spot del perp de la misma forma que hacen los exchanges establecidos: **MIP-1** es el despliegue sin permisos de token spot + mercado (la familia de acciones `spotDeploy`), **MIP-3** es el despliegue sin permisos de mercados perp por parte de constructores (la familia de acciones `perpDeploy` + gobernanza). Ambos utilizan los mismos tres flujos de subasta de gas. (La implementación actual aún agrupa ambas familias de acciones en un mismo módulo y etiqueta la ruta spot como "MIP-3"; esto está siendo realineado — el comportamiento no cambia.) **MIP-2 (Metaliquidity)** es la bóveda de liquidez nativa propiedad del protocolo. **MIP-4** es un agregador operado por MetaFlux que canaliza el flujo minorista, complementario a los mercados sin permisos. **MIP-6** (Resultados) anteriormente tenía el número MIP-4 y fue renumerado cuando MIP-4 se redefinió como el agregador. **MIP-5 (Earn)** es el lado de oferta del pool de préstamos — los depositantes obtienen rendimiento del interés que pagan los prestatarios de margen spot, reutilizando el modelo NAV/participación de MIP-2.

## Alcance de V1

V1 abarca MIP-1, MIP-2 y MIP-3. MIP-4 (agregador) está previsto para V2; MIP-6 (Resultados) se difiere a V3. MIP-5 (Earn) está planificado, como continuación del trabajo de margen spot sobre el que se apoya.
