# Подписание типизированных данных

:::info
**Статус: это действующая схема подписания.** Каждое действие `/exchange` подписывается как
**структурированные типизированные данные EIP-712** (`eth_signTypedData_v4`). Альтернативных
или устаревших схем нет — кошелёк (MetaMask, Rabby, Ledger, WalletConnect) отображает
каждое поле действия по имени в запросе на подпись.
:::

Каждое действие имеет собственный тип EIP-712, поэтому кошелёк показывает пользователю
реальные поля, которые он подписывает: `destination`, `amount`, `agentName` — вместо
непрозрачного набора байт. Сервер восстанавливает типизированную структуру из `action.type`
+ `action.params`, пересчитывает дайджест и восстанавливает адрес подписанта.

## Принцип работы

| | Типизированные данные |
|--|------------|
| Запрос кошелька | Каждое поле отображается по имени |
| Основной тип | `MetaFluxTransaction:<Action>` (один на действие) |
| Что хешируется | Структурированные поля (атомарное кодирование EIP-712) |

Пользователи **видят, что подписывают**, в стандартном кошельке — переводы, вывод средств,
авторизации агентов, а также настройки аккаунта, стейкинга, хранилища, спот-маржи,
earn и бриджа — всё с именованными полями.

## Формат запроса

```json
{
  "signature": "0x…<65-byte hex>…1b",
  "nonce":     1735689600001,
  "action": {
    "type":   "send_asset",
    "params": { /* поля действия */ }
  }
}
```

| Поле | Значение |
|-------|---------|
| `nonce` | Единственный `nonce` конверта **совпадает** с полем `nonce` внутри подписанной типизированной структуры — они обязаны быть идентичны. |
| `action.type` | Тег действия в формате `snake_case`. |
| `action.params` | Поля действия. Должны содержать **те же значения** (и те же канонические строки десятичных чисел), что и хешированные. |

Сервер восстанавливает типизированную структуру из `action.type` + `action.params`,
пересчитывает EIP-712-дайджест, восстанавливает адрес подписанта и авторизует его
(подписант — это аккаунт или утверждённый [агент](../concepts/agent-wallets.md) аккаунта).

:::info
**`sig_scheme` — устаревшее поле.** В ранних версиях конверт мог содержать селектор `sig_scheme`.
Он больше не требуется и игнорируется сервером — восстановление подписи из типизированных данных
выполняется безусловно. **Не включайте его.** Если всё же отправляете, единственное допустимое
значение — `"typed"`.
:::

## Домен EIP-712

Один домен на сеть — кешируйте его:

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name              = "MetaFlux"
  version           = "1"
  chainId           = <chain id узла>   // 8964 mainnet · 114514 testnet · 31337 devnet
  verifyingContract = 0x0000000000000000000000000000000000000000
```

Каждое типизированное сообщение также содержит строку **`metafluxChain`** в качестве первого поля.
Это человекочитаемое обозначение того же chain id; оно является частью подписанной структуры:

| `chainId` | `metafluxChain` |
|-----------|-----------------|
| `8964` | `"Mainnet"` |
| `114514` | `"Testnet"` |
| `31337` | `"Devnet"` |
| любой другой | `"Devnet"` |

Запросите chain id узла из [`/info` `node_info`](../api/rest/info.md#node_info)
(`data.chain_id`) и используйте соответствующий тег. Если `metafluxChain` или `chainId`
не совпадают с узлом, будет восстановлен другой адрес подписанта и запрос будет отклонён.

## Правила кодирования (атомарный EIP-712)

Стандартный `hashStruct` из EIP-712:

```
typeHash    = keccak256(encodeType)
hashStruct  = keccak256( typeHash ‖ encodeData )
digest      = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct )
```

`encodeData` — каждое поле в порядке объявления, закодированное в одно 32-байтовое слово:

| Тип поля | Кодирование |
|------------|----------|
| `address` | 20 байт, выровнено вправо (12 нулевых байт слева). |
| `uintN` | Big-endian, дополненное нулями слева до 32 байт. |
| `bool` | `uint8` `0` / `1`, дополненное нулями до 32 байт. |
| `string` | `keccak256(utf8_bytes)`. |
| `bytes` | `keccak256(raw_bytes)`. |
| `T[]` (напр. `address[]`) | `keccak256(` конкатенация 32-байтового слова каждого элемента `)`. |

Подпишите 32-байтовый `digest` с помощью secp256k1 и сериализуйте подпись как
`r ‖ s ‖ v` (65 байт). Принимаются оба варианта: устаревший `v ∈ {27, 28}` и `v ∈ {0, 1}`.

### Десятичные числа — это канонические строки: сначала хеш, потом разбор

Любое поле суммы или количества является EIP-712-типом **`string`**, содержащим
канонический десятичный текст (`"1500.5"`, `"750.25"`). Сервер хеширует **дословную строку**
и *затем* разбирает её в число — поэтому точное содержание символов имеет значение:

:::warning
**`"1.0"` и `"1.00"` дают разные хеши**, несмотря на то что представляют одно и то же число.
Выберите **одну** каноническую форму для каждой суммы и отправляйте **идентичную** строку
в `action.params`, которую вы указали в подписанном типизированном сообщении. Любое
расхождение (лишний ноль, отсутствие десятичной точки, научная нотация) приведёт к
восстановлению другого адреса подписанта и отклонению запроса.
:::

Именно поэтому типизированное подписание использует строки для десятичных чисел, а не
масштабированные целые: кошелёк отображает человекочитаемую сумму, а правило «хеш-затем-разбор»
делает подписанные байты однозначными.

## Строки типов действий

Для каждого действия **основной тип** — `MetaFluxTransaction:<Action>`, а строка
`encodeType` приведена ниже (порядок полей соответствует порядку в сообщении).
`action.type` — это тег в формате `snake_case`, указываемый в POST-запросе.

### Переводы

| `action.type` | `encodeType` |
|---------------|--------------|
| `send_asset` | `MetaFluxTransaction:SendAsset(string metafluxChain,uint32 sourceDex,uint32 destinationDex,uint32 asset,address destination,string amount,bool toPerp,uint64 nonce)` |
| `usd_class_transfer` | `MetaFluxTransaction:UsdClassTransfer(string metafluxChain,string ntl,bool toPerp,uint64 nonce)` |
| `withdraw` | `MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce)` |

### Аккаунт, стейкинг, хранилище и Metaliquidity

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
| `set_metaliquidity_set` | `MetaFluxTransaction:SetMetaliquiditySet(string metafluxChain,address account,bool allowed,uint64 nonce)` |
| `register_metaliquidity_operator` | `MetaFluxTransaction:RegisterMetaliquidityOperator(string metafluxChain,uint64 vaultId,address operator,bool allowed,uint64 expiresAtMs,uint64 nonce)` |

Примечания по отдельным полям:

- `claim_rewards`: `validator` = нулевой адрес означает **получение вознаграждений по всем
  делегациям**.
- `create_vault`: `kind` — `0` = User, `1` = Metaliquidity.

### Маржа

| `action.type` | `encodeType` |
|---------------|--------------|
| `update_isolated_margin` | `MetaFluxTransaction:UpdateIsolatedMargin(string metafluxChain,uint32 asset,string delta,uint64 nonce)` |
| `top_up_isolated_only_margin` | `MetaFluxTransaction:TopUpIsolatedOnlyMargin(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |

`delta` и `amount` — канонические строки десятичных чисел (хеш-затем-разбор).

### Стейкинг

| `action.type` | `encodeType` |
|---------------|--------------|
| `token_delegate` | `MetaFluxTransaction:TokenDelegate(string metafluxChain,address validator,string amount,bool isUndelegate,uint64 nonce)` |

`amount` — каноническая строка десятичного числа. `isUndelegate` = `true` отменяет делегирование,
`false` — делегирует.

### Хранилище

| `action.type` | `encodeType` |
|---------------|--------------|
| `vault_transfer` | `MetaFluxTransaction:VaultTransfer(string metafluxChain,uint64 vaultId,bool deposit,string amount,uint64 nonce)` |
| `vault_withdraw` | `MetaFluxTransaction:VaultWithdraw(string metafluxChain,uint64 vaultId,string shares,uint64 nonce)` |

`vault_transfer.deposit` = `true` — пополнение, `false` — вывод; `amount` — каноническая строка
десятичного числа. `vault_withdraw.shares` — каноническая строка десятичного числа.

### Спот-маржа

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_margin_deposit` | `MetaFluxTransaction:SpotMarginDeposit(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_withdraw` | `MetaFluxTransaction:SpotMarginWithdraw(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_open` | `MetaFluxTransaction:SpotMarginOpen(string metafluxChain,uint32 pair,uint64 size,uint64 limitPx,string borrow,uint64 nonce)` |

`amount` и `borrow` — канонические строки десятичных чисел; `size` и `limitPx` — целые числа.

### Earn

| `action.type` | `encodeType` |
|---------------|--------------|
| `earn_deposit` | `MetaFluxTransaction:EarnDeposit(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |
| `earn_withdraw` | `MetaFluxTransaction:EarnWithdraw(string metafluxChain,uint32 asset,string shares,uint64 nonce)` |

`amount` и `shares` — канонические строки десятичных чисел.

### Абстракция агента и бридж

| `action.type` | `encodeType` |
|---------------|--------------|
| `agent_set_abstraction` | `MetaFluxTransaction:AgentSetAbstraction(string metafluxChain,address user,uint8 kind,string value,uint64 nonce)` |
| `mb_withdraw` | `MetaFluxTransaction:MbWithdraw(string metafluxChain,uint8 chain,uint32 asset,uint64 amount,string dstAddr,uint64 nonce)` |

Примечания по отдельным полям:

- `agent_set_abstraction`: `value` — EIP-712-тип **`string`** — подписывайте дословную
  строку (это не число; хешируется как `keccak256(utf8)`).
- `mb_withdraw`: типизированное поле `chain` — **`uint8`**: `0` = Solana, `1` =
  Base, `2` = Arbitrum. Однако в `action.params` POST-запроса поле `chain` является
  **строковым именем** (`"Solana"` / `"Base"` / `"Arbitrum"`). Таким образом, в
  типизированном сообщении подписывается `uint8`, а в `params` отправляется строковое имя.
- `mb_withdraw`: `amount` — **целое** `uint64` (не строка десятичного числа);
  `dstAddr` — строка с адресом в целевой сети.

### Поля, *не включённые* в типизированный дайджест

Два действия содержат ключи в `params`, которые строка типа **не охватывает** —
сервер принудительно устанавливает для них значения по умолчанию:

- `approve_agent` — тип `ApproveAgent` **не содержит `expires_at_ms`**, поэтому
  `approve_agent` является **бессрочным**. **Не указывайте** `expires_at_ms`.
- `create_vault` — тип `CreateVault` **не содержит `parent`**, поэтому `create_vault`
  создаёт хранилище **верхнего уровня** (без родителя). **Не указывайте** `parent`.

## Практический пример — `send_asset` (перевод)

Перевод `"750.25"` актива `2` со спот-DEX `0` на перп-DEX `1`, в перп-кошелёк,
в сети **Testnet** (`chainId = 114514`).

Объект, передаваемый в `eth_signTypedData_v4`:

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

## Практический пример — `approve_agent` (действие с аккаунтом)

Авторизация агента с именем `"trading-bot"` в сети **Testnet** (`chainId = 114514`).
Помните: типизированный `approve_agent` — бессрочный, поле `expires_at_ms` отсутствует.

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

Подробнее о жизненном цикле авторизации см. в разделе [кошельки-агенты](../concepts/agent-wallets.md)
(авторизация вступает в силу через один блок после фиксации).

## Проверка кодирования

Перед отправкой восстановите адрес подписанта локально по собственноручно собранному дайджесту
и убедитесь, что он совпадает с ожидаемым адресом — если нет, ошибка в сборке типизированных
данных, а не в сети. Атомарное кодирование, описанное выше, является полной спецификацией;
тест с известным ответом для каждой реализации фиксирует дайджест каждого действия побайтово,
поэтому любая совместимая реализация `eth_signTypedData_v4` даёт тот же результат.

## Ордера и отмены

Ордера и отмены (`submit_order`, `batch_order`, `cancel_order`, `batch_cancel`) отправляются
через тот же конверт `/exchange` и подписываются тем же способом — типизированными данными
EIP-712. Форматы тела действий описаны в
[каталоге действий `POST /exchange`](../api/rest/exchange.md#action-catalog).

## См. также

- [`POST /exchange`](../api/rest/exchange.md) — эндпоинт и полный каталог действий
- [Кошельки-агенты](../concepts/agent-wallets.md) — жизненный цикл авторизации
- [Сети](../networks.md) — `chainId` для каждой сети
