# 类型化数据签名

:::info
**状态：这是签名方案。** 每个 `/exchange` 操作都被签名为
**结构化 EIP-712 类型化数据** (`eth_signTypedData_v4`)。没有可选择的备用或遗留方案——钱包（MetaMask、Rabby、Ledger、WalletConnect）在其签名提示中按名称呈现每个操作字段。
:::

每个操作都有一个真实的按操作 EIP-712 类型，因此钱包向用户显示他们正在签名的实际字段——`destination`、`amount`、`agentName`——而不是一个不透明的 blob。服务器从 `action.type` + `action.params` 重构类型化结构，重新计算摘要，并恢复签名者。

## 工作原理

| | 类型化数据 |
|--|------------|
| 钱包提示 | 每个字段按名称呈现 |
| 主类型 | `MetaFluxTransaction:<Action>`（每个操作一个） |
| 哈希内容 | 结构化字段（原子 EIP-712 编码） |

用户在标准钱包中**看到他们签名的内容**——转账、提现、代理批准，以及账户/质押/金库/现货保证金/收益/跨链设置都携带具名字段。

## 线路形状

```json
{
  "signature": "0x…<65-byte hex>…1b",
  "nonce":     1735689600001,
  "action": {
    "type":   "send_asset",
    "params": { /* the action fields */ }
  }
}
```

| 字段 | 含义 |
|-------|---------|
| `nonce` | 单个信封 `nonce` **也是** 签名类型化结构内的 `nonce` 字段——它们必须匹配。 |
| `action.type` | `snake_case` 操作标签。 |
| `action.params` | 操作字段。必须携带**相同的值**（和相同的规范十进制字符串）你进行了哈希运算。 |

服务器从 `action.type` + `action.params` 重构类型化结构，重新计算 EIP-712 摘要，恢复签名者，并对其进行授权（签名者是账户或其批准的[代理](../concepts/agent-wallets.md)）。

:::info
**`sig_scheme` 已过时。** 早期版本在信封上携带一个 `sig_scheme` 选择器。它不再是必需的，服务器将其忽略——类型化数据恢复无条件运行。**省略它。** 如果你确实发送它，唯一接受的值是 `"typed"`。
:::

## EIP-712 domain

每个网络一个 domain，缓存它：

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name              = "MetaFlux"
  version           = "1"
  chainId           = <the node's chain id>   // 8964 mainnet · 114514 testnet · 31337 devnet
  verifyingContract = 0x0000000000000000000000000000000000000000
```

每条类型化消息也在其第一个字段中携带一个 **`metafluxChain`** 字符串。它是相同链 id 的人类可读标签，是签名结构的一部分：

| `chainId` | `metafluxChain` |
|-----------|-----------------|
| `8964` | `"Mainnet"` |
| `114514` | `"Testnet"` |
| `31337` | `"Devnet"` |
| 任何其他 | `"Devnet"` |

从 [`/info` `node_info`](../api/rest/info.md#node_info)（`data.chain_id`）查询节点的链 id 并使用匹配的标签。与节点不匹配的 `metafluxChain` 或 `chainId` 会恢复不同的签名者，请求被拒绝。

## 编码规则（原子 EIP-712）

标准 EIP-712 `hashStruct`：

```
typeHash    = keccak256(encodeType)
hashStruct  = keccak256( typeHash ‖ encodeData )
digest      = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct )
```

`encodeData` 是每个字段，按声明顺序，编码为一个 32 字节字：

| 字段类型 | 编码 |
|------------|----------|
| `address` | 20 字节，右对齐（左侧 12 个零字节）。 |
| `uintN` | 大端法，零左填充至 32 字节。 |
| `bool` | `uint8` `0` / `1`，零填充至 32 字节。 |
| `string` | `keccak256(utf8_bytes)`。 |
| `bytes` | `keccak256(raw_bytes)`。 |
| `T[]`（例如 `address[]`） | `keccak256(`每个元素的 32 字节字的连接`)。 |

用 secp256k1 对 32 字节的 `digest` 进行签名，并将签名序列化为`r ‖ s ‖ v`（65 字节）。传统 `v ∈ {27, 28}` 和 `v ∈ {0, 1}` 都被接受。

### 小数是规范字符串——先哈希再解析

任何金额/数量字段都是 EIP-712 **`string`**，携带规范十进制文本（`"1500.5"`、`"750.25"`）。服务器哈希**逐字字符串**然后*将其解析为数字——所以确切的字符很重要：

:::warning
**`"1.0"` 和 `"1.00"` 哈希不同**，尽管它们是相同的数字。为每个金额选择**一个**规范形式，并在 `action.params` 中发送**相同的**字符串，你在你签名的类型化消息中放置的内容。不匹配（尾部零、缺少小数点、科学记数法）会恢复不同的签名者并被拒绝。
:::

这就是为什么类型化签名将小数作为字符串而不是缩放整数来携带：钱包提示显示人类可读的金额，哈希然后解析规则保持签名字节明确。

## 操作类型字符串

对于每个操作，**主类型**为 `MetaFluxTransaction:<Action>`，`encodeType` 字符串如下所示（字段顺序是消息字段顺序）。`action.type` 是你在 POST 上放置的 `snake_case` 标签。

### 转账

| `action.type` | `encodeType` |
|---------------|--------------|
| `send_asset` | `MetaFluxTransaction:SendAsset(string metafluxChain,uint32 sourceDex,uint32 destinationDex,uint32 asset,address destination,string amount,bool toPerp,uint64 nonce)` |
| `usd_class_transfer` | `MetaFluxTransaction:UsdClassTransfer(string metafluxChain,string ntl,bool toPerp,uint64 nonce)` |
| `withdraw` | `MetaFluxTransaction:Withdraw(string metafluxChain,uint32 asset,string amount,uint32 destinationChainId,bool useCctp,uint64 nonce)` |

### 账户、质押、金库与 Metaliquidity

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

对于特定字段的注意事项：

- `claim_rewards`：`validator` = 零地址表示**跨所有委托声明**。
- `create_vault`：`kind` 是 `0` = User、`1` = Metaliquidity。

### 保证金

| `action.type` | `encodeType` |
|---------------|--------------|
| `update_isolated_margin` | `MetaFluxTransaction:UpdateIsolatedMargin(string metafluxChain,uint32 asset,string delta,uint64 nonce)` |
| `top_up_isolated_only_margin` | `MetaFluxTransaction:TopUpIsolatedOnlyMargin(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |

`delta` 和 `amount` 是规范十进制字符串（先哈希再解析）。

### 质押

| `action.type` | `encodeType` |
|---------------|--------------|
| `token_delegate` | `MetaFluxTransaction:TokenDelegate(string metafluxChain,address validator,string amount,bool isUndelegate,uint64 nonce)` |

`amount` 是规范十进制字符串。`isUndelegate` = `true` 取消委托，`false` 委托。

### 金库

| `action.type` | `encodeType` |
|---------------|--------------|
| `vault_transfer` | `MetaFluxTransaction:VaultTransfer(string metafluxChain,uint64 vaultId,bool deposit,string amount,uint64 nonce)` |
| `vault_withdraw` | `MetaFluxTransaction:VaultWithdraw(string metafluxChain,uint64 vaultId,string shares,uint64 nonce)` |

`vault_transfer.deposit` = `true` 存入，`false` 提取；`amount` 是规范十进制字符串。`vault_withdraw.shares` 是规范十进制字符串。

### 现货保证金

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_margin_deposit` | `MetaFluxTransaction:SpotMarginDeposit(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_withdraw` | `MetaFluxTransaction:SpotMarginWithdraw(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_open` | `MetaFluxTransaction:SpotMarginOpen(string metafluxChain,uint32 pair,uint64 size,uint64 limitPx,string borrow,uint64 nonce)` |

`amount` 和 `borrow` 是规范十进制字符串；`size` 和 `limitPx` 是整数。

### 收益

| `action.type` | `encodeType` |
|---------------|--------------|
| `earn_deposit` | `MetaFluxTransaction:EarnDeposit(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |
| `earn_withdraw` | `MetaFluxTransaction:EarnWithdraw(string metafluxChain,uint32 asset,string shares,uint64 nonce)` |

`amount` 和 `shares` 是规范十进制字符串。

### 代理抽象与跨链

| `action.type` | `encodeType` |
|---------------|--------------|
| `agent_set_abstraction` | `MetaFluxTransaction:AgentSetAbstraction(string metafluxChain,address user,uint8 kind,string value,uint64 nonce)` |
| `mb_withdraw` | `MetaFluxTransaction:MbWithdraw(string metafluxChain,uint8 chain,uint32 asset,uint64 amount,string dstAddr,uint64 nonce)` |

对于特定字段的注意事项：

- `agent_set_abstraction`：`value` 是 EIP-712 **`string`**——签名逐字字符串（它不是数字；哈希为 `keccak256(utf8)`）。
- `mb_withdraw`：类型化 `chain` 字段是 **`uint8`**——`0` = Solana、`1` = Base、`2` = Arbitrum。但 POST `action.params.chain` 是**字符串名称**（`"Solana"` / `"Base"` / `"Arbitrum"`）。所以在类型化消息中签名 `uint8`，在 `params` 中发送字符串名称。
- `mb_withdraw`：`amount` 是 `uint64` **整数**（不是十进制字符串）；`dstAddr` 是目标链地址字符串。

### 不在类型化摘要中的字段

两个操作有 `params` 键，类型化类型字符串**不**覆盖，所以服务器强制将它们设置为其默认值：

- `approve_agent` — `ApproveAgent` 类型**没有 `expires_at_ms`**，所以 `approve_agent` 是**无过期**。**省略** `expires_at_ms`。
- `create_vault` — `CreateVault` 类型**没有 `parent`**，所以 `create_vault` 是**顶级**（无父级）。**省略** `parent`。

## 工作示例—— `send_asset`（一个转账）

转账 `"750.25"` 资产 `2` 从现货 DEX `0` 到永续 DEX `1`，进入永续钱包，在**Testnet**（`chainId = 114514`）。

你交给 `eth_signTypedData_v4` 的对象：

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

## 工作示例—— `approve_agent`（一个账户操作）

在**Testnet**（`chainId = 114514`）批准一个名为 `"trading-bot"` 的代理。记住：类型化 `approve_agent` 是无过期——没有 `expires_at_ms`。

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

查看[代理钱包](../concepts/agent-wallets.md)获取批准生命周期（批准在提交后一个区块后生效）。

## 验证您的编码

在提交之前，根据您自己组装的摘要在本地恢复签名者，并确认它与预期地址匹配——如果不匹配，bug 在您的类型化数据组装中，而不是链中。上面的原子编码是完整的规范；跨实现的已知答案测试逐字节固定每个操作的摘要，所以任何兼容的 `eth_signTypedData_v4` 实现都会重现相同的结果。

## 订单和取消

订单和取消（`submit_order`、`batch_order`、`cancel_order`、`batch_cancel`）通过相同的 `/exchange` 信封提交，并以相同的 EIP-712 类型化数据方式签名。它们的操作体形状在[`POST /exchange` 操作目录](../api/rest/exchange.md#action-catalog)中。

## 另见

- [`POST /exchange`](../api/rest/exchange.md) — 端点和完整操作目录
- [代理钱包](../concepts/agent-wallets.md) — 批准生命周期
- [网络](../networks.md) — 每个网络的 `chainId`
