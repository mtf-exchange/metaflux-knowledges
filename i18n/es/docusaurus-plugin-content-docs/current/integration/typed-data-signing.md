# Firma de datos tipados

:::info
**Estado: este es el esquema de firma.** Cada acción de `/exchange` se firma como
**datos tipados estructurados EIP-712** (`eth_signTypedData_v4`). No existe ningún
esquema alternativo ni heredado entre los que elegir — una billetera (MetaMask, Rabby,
Ledger, WalletConnect) muestra cada campo de la acción por nombre en su prompt de firma.
:::

Cada acción tiene un tipo EIP-712 real por acción, por lo que la billetera le muestra al
usuario los campos reales que está firmando — `destination`, `amount`, `agentName` — en
lugar de un blob opaco. El servidor reconstruye el struct tipado a partir de `action.type`
+ `action.params`, recalcula el digest y recupera el firmante.

## Cómo funciona

| | Datos tipados |
|--|---------------|
| Prompt de la billetera | Cada campo se muestra por nombre |
| Tipo primario | `MetaFluxTransaction:<Action>` (uno por acción) |
| Qué se hashea | Los campos estructurados (codificación atómica EIP-712) |

Los usuarios **ven lo que firman** en una billetera estándar — transferencias, retiros,
aprobaciones de agentes y configuraciones de cuenta/staking/vault/margen spot/earn/bridge
incluyen todos campos con nombre.

## Formato de wire

```json
{
  "signature": "0x…<65-byte hex>…1b",
  "nonce":     1735689600001,
  "action": {
    "type":   "send_asset",
    "params": { /* los campos de la acción */ }
  }
}
```

| Campo | Significado |
|-------|-------------|
| `nonce` | El `nonce` del envelope es **también** el campo `nonce` dentro del struct tipado firmado — ambos deben coincidir. |
| `action.type` | Etiqueta de acción en `snake_case`. |
| `action.params` | Los campos de la acción. Deben contener los **mismos valores** (y las mismas cadenas decimales canónicas) que se usaron al hashear. |

El servidor reconstruye el struct tipado a partir de `action.type` + `action.params`,
recalcula el digest EIP-712, recupera el firmante y lo autoriza (el firmante es la
cuenta, o un [agente](../concepts/agent-wallets.md) aprobado de ella).

:::info
**`sig_scheme` es vestigial.** Las versiones anteriores incluían un selector `sig_scheme`
en el envelope. Ya no es necesario y el servidor lo ignora — la recuperación de datos
tipados se ejecuta incondicionalmente. **Omítelo.** Si lo envías, el único valor aceptado
es `"typed"`.
:::

## Dominio EIP-712

Un dominio por red; guárdalo en caché:

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name              = "MetaFlux"
  version           = "1"
  chainId           = <the node's chain id>   // 8964 mainnet · 114514 testnet · 31337 devnet
  verifyingContract = 0x0000000000000000000000000000000000000000
```

Cada mensaje tipado también incluye una cadena **`metafluxChain`** como su primer campo.
Es una etiqueta legible por humanos del mismo chain id, y forma parte del struct firmado:

| `chainId` | `metafluxChain` |
|-----------|-----------------|
| `8964` | `"Mainnet"` |
| `114514` | `"Testnet"` |
| `31337` | `"Devnet"` |
| cualquier otro | `"Devnet"` |

Consulta el chain id del nodo desde [`/info` `node_info`](../api/rest/info.md#node_info)
(`data.chain_id`) y usa la etiqueta correspondiente. Un `metafluxChain` o `chainId` que
no coincida con el nodo recuperará un firmante diferente y la solicitud será rechazada.

## Reglas de codificación (EIP-712 atómico)

`hashStruct` estándar de EIP-712:

```
typeHash    = keccak256(encodeType)
hashStruct  = keccak256( typeHash ‖ encodeData )
digest      = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct )
```

`encodeData` corresponde a cada campo, en el orden declarado, codificado en una palabra de 32 bytes:

| Tipo de campo | Codificación |
|---------------|--------------|
| `address` | 20 bytes, alineado a la derecha (12 bytes cero a la izquierda). |
| `uintN` | big-endian, relleno de ceros a la izquierda hasta 32 bytes. |
| `bool` | `uint8` `0` / `1`, relleno de ceros hasta 32 bytes. |
| `string` | `keccak256(utf8_bytes)`. |
| `bytes` | `keccak256(raw_bytes)`. |
| `T[]` (p. ej. `address[]`) | `keccak256(` concatenación de la palabra de 32 bytes de cada elemento `)`. |

Firma el `digest` de 32 bytes con secp256k1 y serializa la firma como
`r ‖ s ‖ v` (65 bytes). Se aceptan tanto `v ∈ {27, 28}` (legacy) como `v ∈ {0, 1}`.

### Los decimales son cadenas canónicas — hashear y luego parsear

Cualquier campo de cantidad/importe es un **`string`** de EIP-712 que contiene el texto
decimal canónico (`"1500.5"`, `"750.25"`). El servidor hashea la **cadena verbatim** y
*luego* la parsea como número — por lo que los caracteres exactos importan:

:::warning
**`"1.0"` y `"1.00"` producen hashes diferentes** aunque representen el mismo número.
Elige **una** forma canónica por importe y envía la **misma** cadena en `action.params`
que usaste en el mensaje tipado que firmaste. Cualquier discrepancia (cero final, punto
decimal faltante, notación científica) recuperará un firmante diferente y será rechazada.
:::

Por esto la firma tipada lleva los decimales como cadenas en lugar de enteros escalados:
el prompt de la billetera muestra un importe legible por humanos, y la regla de
hashear-y-luego-parsear mantiene los bytes firmados sin ambigüedad.

## Cadenas de tipo de acción

Para cada acción, el **tipo primario** es `MetaFluxTransaction:<Action>` y la cadena
`encodeType` se indica a continuación (el orden de los campos es el orden de los campos
del mensaje). `action.type` es la etiqueta `snake_case` que se incluye en el POST.

### Transferencias

| `action.type` | `encodeType` |
|---------------|--------------|
| `send_asset` | `MetaFluxTransaction:SendAsset(string metafluxChain,uint32 sourceDex,uint32 destinationDex,uint32 asset,address destination,string amount,bool toPerp,uint64 nonce)` |
| `usd_class_transfer` | `MetaFluxTransaction:UsdClassTransfer(string metafluxChain,string ntl,bool toPerp,uint64 nonce)` |
| `withdraw` | `MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce)` |

### Cuenta, staking, vault y Metaliquidity

| `action.type` | `encodeType` |
|---------------|--------------|
| `approve_agent` | `MetaFluxTransaction:ApproveAgent(string metafluxChain,address agentAddress,string agentName,uint64 nonce)` |
| `set_referrer` | `MetaFluxTransaction:SetReferrer(string metafluxChain,address referrer,uint64 nonce)` |
| `approve_builder_fee` | `MetaFluxTransaction:ApproveBuilderFee(string metafluxChain,address builder,uint16 maxFeeBps,uint64 nonce)` |
| `set_display_name` | `MetaFluxTransaction:SetDisplayName(string metafluxChain,string displayName,uint64 nonce)` |
| `set_position_mode` | `MetaFluxTransaction:SetPositionMode(string metafluxChain,bool hedge,uint64 nonce)` |
| `user_portfolio_margin` | `MetaFluxTransaction:UserPortfolioMargin(string metafluxChain,bool enroll,uint64 nonce)` |
| `convert_to_multi_sig_user` | `MetaFluxTransaction:ConvertToMultiSigUser(string metafluxChain,address[] signers,uint32 threshold,uint64 nonce)` |
| `update_leverage` | `MetaFluxTransaction:UpdateLeverage(string metafluxChain,uint32 asset,uint32 leverage,bool isIsolated,uint64 nonce)` |
| `claim_rewards` | `MetaFluxTransaction:ClaimRewards(string metafluxChain,address validator,uint64 nonce)` |
| `link_staking_user` | `MetaFluxTransaction:LinkStakingUser(string metafluxChain,address target,uint64 nonce)` |
| `create_vault` | `MetaFluxTransaction:CreateVault(string metafluxChain,string name,uint64 lockPeriodSecs,uint8 kind,uint64 nonce)` |
| `vault_modify` | `MetaFluxTransaction:VaultModify(string metafluxChain,uint64 vaultId,string newName,uint64 nonce)` |
| `spot_margin_close` | `MetaFluxTransaction:SpotMarginClose(string metafluxChain,uint32 pair,uint64 limitPx,uint64 nonce)` |

Notas sobre campos específicos:

- `claim_rewards`: `validator` = la dirección cero significa **reclamar en todas las
  delegaciones**.
- `create_vault`: `kind` es `0` = Usuario, `1` = Metaliquidity.

### Margen

| `action.type` | `encodeType` |
|---------------|--------------|
| `update_isolated_margin` | `MetaFluxTransaction:UpdateIsolatedMargin(string metafluxChain,uint32 asset,string delta,uint64 nonce)` |
| `top_up_isolated_only_margin` | `MetaFluxTransaction:TopUpIsolatedOnlyMargin(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |

`delta` y `amount` son cadenas decimales canónicas (hashear y luego parsear).

### Staking

| `action.type` | `encodeType` |
|---------------|--------------|
| `token_delegate` | `MetaFluxTransaction:TokenDelegate(string metafluxChain,address validator,string amount,bool isUndelegate,uint64 nonce)` |

`amount` es una cadena decimal canónica. `isUndelegate` = `true` anula la delegación;
`false` delega.

### Vault

| `action.type` | `encodeType` |
|---------------|--------------|
| `vault_transfer` | `MetaFluxTransaction:VaultTransfer(string metafluxChain,uint64 vaultId,bool deposit,string amount,uint64 nonce)` |
| `vault_withdraw` | `MetaFluxTransaction:VaultWithdraw(string metafluxChain,uint64 vaultId,string shares,uint64 nonce)` |

`vault_transfer.deposit` = `true` deposita, `false` retira; `amount` es una cadena decimal
canónica. `vault_withdraw.shares` es una cadena decimal canónica.

### Margen spot

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_margin_deposit` | `MetaFluxTransaction:SpotMarginDeposit(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_withdraw` | `MetaFluxTransaction:SpotMarginWithdraw(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_open` | `MetaFluxTransaction:SpotMarginOpen(string metafluxChain,uint32 pair,uint64 size,uint64 limitPx,string borrow,uint64 nonce)` |

`amount` y `borrow` son cadenas decimales canónicas; `size` y `limitPx` son enteros.

### Earn

| `action.type` | `encodeType` |
|---------------|--------------|
| `earn_deposit` | `MetaFluxTransaction:EarnDeposit(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |
| `earn_withdraw` | `MetaFluxTransaction:EarnWithdraw(string metafluxChain,uint32 asset,string shares,uint64 nonce)` |

`amount` y `shares` son cadenas decimales canónicas.

### Abstracción de agente y bridge

| `action.type` | `encodeType` |
|---------------|--------------|
| `agent_set_abstraction` | `MetaFluxTransaction:AgentSetAbstraction(string metafluxChain,address user,uint8 kind,string value,uint64 nonce)` |
| `mb_withdraw` | `MetaFluxTransaction:MbWithdraw(string metafluxChain,uint8 chain,uint32 asset,uint64 amount,string dstAddr,uint64 nonce)` |

Notas sobre campos específicos:

- `agent_set_abstraction`: `value` es un **`string`** de EIP-712 — firma la cadena
  verbatim (no es un número; se hashea como `keccak256(utf8)`).
- `mb_withdraw`: el campo tipado `chain` es un **`uint8`** — `0` = Solana, `1` =
  Base, `2` = Arbitrum. Sin embargo, `action.params.chain` del POST es el **nombre en
  cadena de texto** (`"Solana"` / `"Base"` / `"Arbitrum"`). Por tanto, firma el `uint8`
  en el mensaje tipado y envía el nombre en cadena en `params`.
- `mb_withdraw`: `amount` es un **entero** `uint64` (no una cadena decimal);
  `dstAddr` es la cadena con la dirección de destino en la cadena de destino.

### Campos que *no* forman parte del digest tipado

Dos acciones tienen claves en `params` que la cadena de tipos **no** incluye, por lo que
el servidor las fuerza a su valor predeterminado:

- `approve_agent` — el tipo `ApproveAgent` **no tiene `expires_at_ms`**, por lo que
  `approve_agent` es **sin expiración**. **Omite** `expires_at_ms`.
- `create_vault` — el tipo `CreateVault` **no tiene `parent`**, por lo que `create_vault`
  es **de nivel superior** (sin padre). **Omite** `parent`.

## Ejemplo práctico — `send_asset` (una transferencia)

Transferencia de `"750.25"` del activo `2` desde el DEX spot `0` al DEX perp `1`, hacia
la billetera perp, en **Testnet** (`chainId = 114514`).

El objeto que se pasa a `eth_signTypedData_v4`:

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name",              "type": "string"  },
      { "name": "version",           "type": "string"  },
      { "name": "chainId",           "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "MetaFluxTransaction:SendAsset": [
      { "name": "metafluxChain",  "type": "string"  },
      { "name": "sourceDex",      "type": "uint32"  },
      { "name": "destinationDex", "type": "uint32"  },
      { "name": "asset",          "type": "uint32"  },
      { "name": "destination",    "type": "address" },
      { "name": "amount",         "type": "string"  },
      { "name": "toPerp",         "type": "bool"    },
      { "name": "nonce",          "type": "uint64"  }
    ]
  },
  "primaryType": "MetaFluxTransaction:SendAsset",
  "domain": {
    "name": "MetaFlux",
    "version": "1",
    "chainId": 114514,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
  },
  "message": {
    "metafluxChain":  "Testnet",
    "sourceDex":      0,
    "destinationDex": 1,
    "asset":          2,
    "destination":    "0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c",
    "amount":         "750.25",
    "toPerp":         true,
    "nonce":          28
  }
}
```

```javascript
// MetaMask / EIP-1193 provider
const signature = await window.ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [signerAddress, JSON.stringify(typedData)],
});

await fetch(`${BASE_URL}/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    signature,
    nonce: 28,                       // MUST equal message.nonce
    action: {
      type: 'send_asset',
      params: {
        source_dex:      0,
        destination_dex: 1,
        asset:           2,
        destination:     '0x3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c',
        amount:          '750.25',   // SAME canonical string you signed
        to_perp:         true,
      },
    },
  }),
});
```

## Ejemplo práctico — `approve_agent` (una acción de cuenta)

Aprobación de un agente llamado `"trading-bot"` en **Testnet** (`chainId = 114514`).
Recuerda: el `approve_agent` tipado es sin expiración — no hay `expires_at_ms`.

```json
{
  "types": {
    "EIP712Domain": [
      { "name": "name",              "type": "string"  },
      { "name": "version",           "type": "string"  },
      { "name": "chainId",           "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "MetaFluxTransaction:ApproveAgent": [
      { "name": "metafluxChain", "type": "string"  },
      { "name": "agentAddress",  "type": "address" },
      { "name": "agentName",     "type": "string"  },
      { "name": "nonce",         "type": "uint64"  }
    ]
  },
  "primaryType": "MetaFluxTransaction:ApproveAgent",
  "domain": {
    "name": "MetaFlux",
    "version": "1",
    "chainId": 114514,
    "verifyingContract": "0x0000000000000000000000000000000000000000"
  },
  "message": {
    "metafluxChain": "Testnet",
    "agentAddress":  "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    "agentName":     "trading-bot",
    "nonce":         1
  }
}
```

```javascript
const signature = await window.ethereum.request({
  method: 'eth_signTypedData_v4',
  params: [signerAddress, JSON.stringify(typedData)],
});

await fetch(`${BASE_URL}/exchange`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    signature,
    nonce: 1,
    action: {
      type: 'approve_agent',
      params: {
        agent: '0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1',
        name:  'trading-bot',
        // no expires_at_ms — approve_agent is no-expiry
      },
    },
  }),
});
```

Consulta [billeteras de agente](../concepts/agent-wallets.md) para conocer el ciclo de
vida de la aprobación (una aprobación entra en vigor un bloque después del commit).

## Verificar tu codificación

Antes de enviar, recupera el firmante localmente a partir de tu propio digest ensamblado
y confirma que coincide con la dirección esperada — si no coincide, el error está en tu
ensamblado de datos tipados, no en la cadena. La codificación atómica descrita arriba es
la especificación completa; una prueba de respuesta conocida entre implementaciones ancla
el digest de cada acción byte a byte, de modo que cualquier implementación compatible de
`eth_signTypedData_v4` reproduce el mismo resultado.

## Órdenes y cancelaciones

Las órdenes y cancelaciones (`submit_order`, `batch_order`, `cancel_order`,
`batch_cancel`) se envían a través del mismo envelope `/exchange` y se firman de la misma
manera con datos tipados EIP-712. Las formas del cuerpo de acción se encuentran en el
[catálogo de acciones de `POST /exchange`](../api/rest/exchange.md#action-catalog).

## Véase también

- [`POST /exchange`](../api/rest/exchange.md) — el endpoint y el catálogo completo de acciones
- [Billeteras de agente](../concepts/agent-wallets.md) — ciclo de vida de la aprobación
- [Redes](../networks.md) — `chainId` por red
