# Bridge

:::info
**Estado.** El puente de custodia USDC MetaBridge está **activo en Base Sepolia** (testnet,
`MetaBridgeUSDC` (MetaBridgeAlpha) [`0xA6c914Cd59F8B3A8551B5f24b047d78542063a00`](https://sepolia.basescan.org/address/0xA6c914Cd59F8B3A8551B5f24b047d78542063a00)),
y un programa de custodia en Solana está activo en **devnet** bajo el mismo modelo. Ambas
direcciones han sido verificadas de extremo a extremo en Base Sepolia: un depósito real
(watcher → cofirma → cosigner registrado automáticamente → crédito con quórum ⅔) y un
ciclo completo de retiro (cofirma L1 → bucle de relay → `batchWithdraw` on-chain →
ventana de disputa → `claim`). Mejoras de seguridad implementadas: `batchWithdraw`/`batchClaim`
con amortización de gas, lotes con éxito parcial, ventana de disputa dual por tiempo+bloque,
separación de claves de validador en caliente/frío, rotación de validadores en dos fases con
veto de **cancel** para un solo validador en caliente durante la ventana, y firmas vinculadas
por dominio y época fijadas byte a byte en el contrato EVM, el programa Solana y el L1
(vectores de respuesta conocida entre lenguajes). Pendiente: despliegue en Arbitrum y una
auditoría previa a mainnet.
:::

MetaFlux puentea **todos los activos — incluido USDC — a través de MetaBridge**, un puente
de custodia firmado por los validadores de MetaFlux (equivalente a HL-Bridge2). **No existe
ningún puente de terceros ni dependencia de Circle CCTP** en la ruta crítica.

## Por qué custodia y no CCTP

CCTP solo mueve USDC entre cadenas que Circle ha incorporado como *dominios* CCTP. MetaFlux
es un L1 independiente; ser añadido como dominio CCTP es una decisión comercial de Circle
que no controlamos. Una ruta de depósito que requiere la aprobación de un tercero para existir
no es una base sobre la que construir, por eso MetaFlux opera su propio puente de custodia bajo
la **misma suposición de confianza en el conjunto de validadores que la propia cadena** — sin
comité externo, red de guardianes ni intermediario.

## Modelo

Un **contrato Bridge en la cadena de origen** (primero Base) mantiene en custodia los tokens
depositados. Los validadores de MetaFlux observan los depósitos y acreditan el L1; los retiros
son liberados por el contrato mediante un conjunto de cofirmas ponderadas por stake de ⅔ de
validadores, tras una ventana de disputa.

### Depósito (cadena de origen → MetaFlux)

```
Base:
  1. user.approve(USDC, bridge)
  2. bridge.deposit(mtfDest, amount)        // USDC pulled into custody
  3. bridge emits Deposit{user, mtfDest, amount, nonce, …}

MetaFlux:
  4. each validator observes the Deposit event and submits an mbAttest
     (an Inbound MetaBridgeMsg partial co-signature) — validator authority,
     NEVER the public /exchange path
  5. on ⅔ stake-weighted quorum the L1 credits the user's USDC cross-collateral
     (the same system-credit primitive the faucet uses); each deposit credits
     EXACTLY ONCE (idempotent by message id)
```

El evento `Deposit` es compatible byte a byte con el `message_id` determinista del L1:
`keccak256(chain ‖ direction ‖ user ‖ asset ‖ amount ‖ dst ‖ nonce)`.

### Retiro (MetaFlux → cadena de origen)

```
MetaFlux:
  1. user submits a withdraw action (Outbound MetaBridgeMsg)
  2. validators co-sign it to ⅔ quorum; the L1 retains the signature set in
     meta_bridge.mb_outbox + finalized_cosignatures

Base (two-phase: request → claim):
  3. each validator's RELAY LOOP polls the committed L1 state and submits a
     batchWithdraw(...) tx — signed with the validator's OWN key, gas paid by the
     validator's EVM address (no separate relayer key). The contract recovers
     each entry's signers, sums HOT-set stake, requires ≥⅔, and QUEUES it into
     the dispute window. A bad/raced entry in the batch is skipped (FailedWithdrawal
     event), not reverted.
  4. after BOTH the dispute window (seconds) AND a minimum block count elapse,
     claim(id) / batchClaim(ids) releases USDC to the user. Any single validator
     can dispute(id) a queued withdrawal, or the COLD ⅔-quorum can
     invalidateWithdrawal(id), as an emergency revoke during the window.
```

## Modelo de seguridad

- **Autoridad** — Multifirma de validadores de MetaFlux ponderada por ⅔ del stake (secp256k1,
  las mismas claves que aseguran el consenso; quórum de `6700` bps). La multifirma de
  validadores y la ventana de disputa de retiros son elementos críticos: el compromiso de
  las claves del puente equivale a pérdida de fondos, por lo que los contratos reciben la
  misma revisión que el nivel de consenso/firma y una auditoría previa a mainnet.
- **Replay** — cada `message_id` se procesa una sola vez, identificado por la identidad
  económica de cadena/nonce-de-origen, de modo que un crédito se aplica exactamente una vez
  incluso tras una rotación del conjunto de validadores; se aplica tanto en el L1 como en
  el contrato (`withdrawalSeen` / un marcador permanente de uso en Solana). Las firmas están
  vinculadas por dominio y época, por lo que una cofirma no puede reutilizarse en un
  despliegue, cadena o época de conjunto de validadores distinto.
- **Gobernanza y rotación** — sin cuenta de administrador; toda operación privilegiada
  requiere cofirma de validadores. La rotación del conjunto de validadores es en dos fases
  (solicitud → finalización tras una ventana de disputa); durante esa ventana cualquier
  validador en caliente **individual** puede ejecutar `pause` (limitado por un tiempo de
  espera por validador) o **cancel** la rotación pendiente por completo, de modo que un
  quórum de gobernanza comprometido no pueda reemplazar el conjunto en silencio. En Solana,
  el mismo conjunto ofrece una superficie de emergencia con `pause`/`dispute` de un solo
  validador y `unpause` / `invalidateWithdrawal` de quórum.
- **Fuera de `/exchange`** — los créditos de depósito se inyectan a través de la ruta de
  sistema de validadores y son estructuralmente inaccesibles desde la superficie pública
  `/exchange` del usuario, contabilizados únicamente sobre el conjunto de validadores activos.
- **Advertencia sobre custodia** — el USDC en MetaFlux es una reclamación puenteada
  respaldada por el saldo del contrato en la cadena de origen, no es USDC canónico de
  Circle en MetaFlux (igual que el modelo HL).

## Despliegues

| Red | Contrato | Dirección |
|---------|----------|---------|
| Base **Sepolia** | `MetaBridgeUSDC` (v3) | [`0xA6c914Cd59F8B3A8551B5f24b047d78542063a00`](https://sepolia.basescan.org/address/0xA6c914Cd59F8B3A8551B5f24b047d78542063a00) |
| Solana **devnet** | `metabridge-solana` | [`8nahcGhCtXpsZ31mHmHinCRf5MX1qWQzruMj6E1KMCwi`](https://solscan.io/account/8nahcGhCtXpsZ31mHmHinCRf5MX1qWQzruMj6E1KMCwi?cluster=devnet) |
| Base / Solana mainnet | — | (pre-auditoría) |

Custodia el USDC de Circle en Base Sepolia (`0x036CbD…f3dCF7e`); **conjunto de validadores
ponderado por ⅔ del stake, sin administrador** (todas las operaciones privilegiadas requieren
cofirma de validadores), ventana de disputa dual de 300 s + 150 bloques. Firmas separadas por
dominio y vinculadas por época. Los contratos y el runbook de despliegue se encuentran en el
repositorio [`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts);
la lógica de cofirma/crédito del lado L1 permanece en el nodo. Testnet pre-auditoría —
no apto para uso con valor real.

## Métodos del contrato

### Base — `MetaBridgeUSDC` (EVM)

| Método | Autorización | Propósito |
|--------|---------------|---------|
| `deposit(mtfDest, amount)` | cualquiera (depositante) | Depositar USDC en custodia y emitir `Deposit` para que los validadores lo atestigüen |
| `withdraw(...)` / `batchWithdraw(reqs)` | cualquiera que retransmita un conjunto de cofirmas **HOT ⅔** | Verificar el quórum y encolar los retiros en la ventana de disputa |
| `claim(mid)` / `batchClaim(mids)` | cualquiera | Liberar el USDC madurado tras la ventana dual de tiempo + bloque (no pausable) |
| `dispute(mid)` | cualquier validador **HOT** individual | Cancelar un retiro en cola dentro de su ventana de disputa |
| `cancelValidatorSetUpdate()` | cualquier validador **HOT** individual | Vetar una rotación de conjunto de validadores pendiente dentro de su ventana |
| `pause()` | cualquier validador **HOT** individual | Congelar nuevos depósitos y el encolado de retiros (con tiempo de espera por validador) |
| `unpause(...)` | **COLD ⅔** | Levantar la pausa |
| `invalidateWithdrawal(mid, ...)` | **COLD ⅔** | Revocar un retiro en cola no reclamado y fraudulento |
| `requestValidatorSetUpdate(p, newEpoch, ...)` | **COLD ⅔** | Iniciar una rotación en dos fases del conjunto de validadores calientes y fríos |
| `finalizeValidatorSetUpdate()` | cualquiera (sin permisos) | Aplicar la rotación iniciada tras su ventana de disputa |
| `setDisputeWindow(...)` / `setMinDisputeBlocks(...)` | **COLD ⅔** | Ajustar la ventana de disputa (con mínimos y máximos acotados) |
| `computeMessageId(...)` / `computeGovDigest(...)` | view | Reproducir los bytes exactos que un validador cofirma |
| Getters `hot*/cold*` | view | Stake, miembros, recuento, total y quórum bps/necesario de validadores |

Todas las llamadas cofirmadas reciben `(uint8[] sigV, bytes32[] sigR, bytes32[] sigS)` ordenadas por firmante ascendente, S baja, `v ∈ {27,28}`.

### Solana — `metabridge-solana`

| Instrucción | Autorización | Propósito |
|-------------|---------------|---------|
| `initialize(params)` | desplegador (única vez) | Fijar el mint de USDC, el conjunto de validadores, el quórum y la ventana de disputa dual |
| `deposit(mtf_dest, amount)` | depositante (firmante) | Depositar SPL USDC en custodia y emitir `DepositEvent` |
| `withdraw(mid, user, amount, dst, nonce, cosigs)` | cualquiera que retransmita un conjunto de cofirmas **⅔** | Verificar el quórum y crear el PDA `PendingWithdrawal` (+ marcador permanente de uso) |
| `claim(message_id)` | cualquiera | Liberar el USDC en custodia tras la ventana dual de tiempo + slot |
| `dispute(mid, cosig)` | cualquier validador individual (1 cofirma) | Cancelar un retiro en cola dentro de su ventana |
| `pause(cosig)` | cualquier validador individual (1 cofirma) | Congelar depósito / retiro / finalización de rotación |
| `unpause(gov_nonce, cosigs)` | cofirma **⅔** | Levantar la pausa |
| `invalidate_withdrawal(mid, gov_nonce, cosigs)` | cofirma **⅔** | Revocar un retiro en cola |
| `request_validator_set_update(...)` | cofirma **⅔** | Iniciar una rotación del conjunto de validadores |
| `finalize_validator_set_update()` | cualquiera (sin permisos) | Aplicar la rotación iniciada tras su ventana |

Solana utiliza UN único conjunto de validadores (sin separación caliente/frío) y no dispone de `setDisputeWindow` ni de puntos de entrada por lotes; el id de recuperación es el `{0,1}` nativo de secp256k1 (frente a `{27,28}` de EVM). Ambas cadenas rechazan firmas con S alta y vinculan el id del programa/contrato y la época en cada digest cofirmado.

## Hoja de ruta

- Watcher de depósitos en Base real + relayer de retiros (el núcleo L1 determinista y el
  contrato Base están completados; los observadores off-chain están conectados y utilizan
  la etiqueta de bloque `finalized` de la cadena como protección ante reorgs).
- Despliegue en múltiples cadenas: el programa de custodia en Solana está activo en devnet
  bajo el mismo modelo; Arbitrum es el siguiente.
- Auditoría de seguridad antes de cualquier despliegue con valor real (mainnet).
- Composabilidad entre cadenas (invocar contratos de otras cadenas desde MTF) — V2.

## Véase también

- [Redes](../networks.md) — endpoints y chain IDs por red
