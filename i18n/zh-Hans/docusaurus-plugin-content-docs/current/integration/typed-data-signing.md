# 类型化数据签名

:::info
**状态：本文档描述当前使用的签名方案。** 所有 `/exchange` 操作均以**结构化 EIP-712 类型化数据**（`eth_signTypedData_v4`）进行签名。无需在多种签名方案之间做选择——钱包（MetaMask、Rabby、Ledger、WalletConnect）会在签名提示中按字段名逐一展示每个操作的内容。
:::

每个操作都有对应的 EIP-712 类型定义，因此钱包会向用户展示所签内容的实际字段——`destination`、`amount`、`agentName`——而非一段不透明的二进制数据。服务器根据 `action.type` 和 `action.params` 重建类型化结构体，重新计算摘要并还原签名者身份。

## 工作原理

| | 类型化数据 |
|--|------------|
| 钱包提示 | 按字段名逐一展示 |
| 主类型 | `MetaFluxTransaction:<Action>`（每个操作一个） |
| 哈希内容 | 结构化字段（原子 EIP-712 编码） |

用户在标准钱包中**看到的就是他们所签的内容**——转账、提现、代理授权以及账户/质押/金库/现货保证金/理财/跨链桥等所有操作均包含具名字段。

## 请求结构

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
| `nonce` | 信封层的 `nonce` 与已签类型化结构体中的 `nonce` 字段**必须相同**。 |
| `action.type` | `snake_case` 格式的操作标识符。 |
| `action.params` | 操作字段。所填值（包括规范化小数字符串）必须与哈希时使用的值**完全一致**。 |

服务器根据 `action.type` 和 `action.params` 重建类型化结构体，重新计算 EIP-712 摘要，还原签名者身份，并验证其权限（签名者须为账户本身，或该账户已授权的[代理](../concepts/agent-wallets.md)）。

:::info
**`sig_scheme` 已为历史遗留字段。** 早期版本的信封中包含 `sig_scheme` 选择器，现已不再需要，服务器会忽略该字段——类型化数据恢复始终无条件执行。**请省略此字段。** 若确实发送，唯一可接受的值为 `"typed"`。
:::

## EIP-712 域

每个网络对应一个域，请缓存：

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
  name              = "MetaFlux"
  version           = "1"
  chainId           = <the node's chain id>   // 8964 mainnet · 114514 testnet · 31337 devnet
  verifyingContract = 0x0000000000000000000000000000000000000000
```

每条类型化消息的第一个字段都包含 **`metafluxChain`** 字符串，作为同一 chain id 的可读标签，并纳入已签结构体：

| `chainId` | `metafluxChain` |
|-----------|-----------------|
| `8964` | `"Mainnet"` |
| `114514` | `"Testnet"` |
| `31337` | `"Devnet"` |
| 其他值 | `"Devnet"` |

通过 [`/info` 的 `node_info`](../api/rest/info.md#node_info)（`data.chain_id`）查询节点的 chain id，并使用对应的标签。若 `metafluxChain` 或 `chainId` 与节点不匹配，将还原出错误的签名者，请求将被拒绝。

## 编码规则（原子 EIP-712）

标准 EIP-712 `hashStruct`：

```
typeHash    = keccak256(encodeType)
hashStruct  = keccak256( typeHash ‖ encodeData )
digest      = keccak256( 0x19 0x01 ‖ domainSeparator ‖ hashStruct )
```

`encodeData` 按字段声明顺序，将每个字段编码为一个 32 字节的字：

| 字段类型 | 编码方式 |
|------------|----------|
| `address` | 20 字节，右对齐（左侧补 12 个零字节）。 |
| `uintN` | 大端序，左侧补零至 32 字节。 |
| `bool` | `uint8` 的 `0` / `1`，补零至 32 字节。 |
| `string` | `keccak256(utf8_bytes)`。 |
| `bytes` | `keccak256(raw_bytes)`。 |
| `T[]`（如 `address[]`） | `keccak256(` 每个元素 32 字节表示的拼接 `)`。 |

使用 secp256k1 对 32 字节的 `digest` 进行签名，并将签名序列化为 `r ‖ s ‖ v`（65 字节）。`v ∈ {27, 28}` 和 `v ∈ {0, 1}` 均可接受。

### 小数使用规范字符串——先哈希再解析

所有金额/数量字段均为 EIP-712 的 **`string`** 类型，承载规范化小数文本（如 `"1500.5"`、`"750.25"`）。服务器对**原始字符串**进行哈希，*然后*再将其解析为数值——因此字符的精确写法至关重要：

:::warning
**`"1.0"` 与 `"1.00"` 的哈希结果不同**，尽管它们在数值上相等。请为每个金额选定**一种**规范形式，并确保 `action.params` 中发送的字符串与签名时类型化消息里的字符串**完全一致**。任何不一致（尾随零、缺少小数点、科学计数法）都会还原出不同的签名者，请求将被拒绝。
:::

这也是类型化签名使用字符串而非整数缩放值来表示小数的原因：钱包提示中可直接展示人类可读的金额，而"先哈希再解析"规则确保已签字节无歧义。

## 操作类型字符串

每个操作的**主类型**为 `MetaFluxTransaction:<Action>`，`encodeType` 字符串如下所示（字段顺序即消息字段顺序）。`action.type` 是 POST 请求中使用的 `snake_case` 标识符。

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

特定字段说明：

- `claim_rewards`：`validator` 为零地址时，表示**领取所有委托的奖励**。
- `create_vault`：`kind` 取值为 `0` = 用户金库，`1` = Metaliquidity 金库。

### 保证金

| `action.type` | `encodeType` |
|---------------|--------------|
| `update_isolated_margin` | `MetaFluxTransaction:UpdateIsolatedMargin(string metafluxChain,uint32 asset,string delta,uint64 nonce)` |
| `top_up_isolated_only_margin` | `MetaFluxTransaction:TopUpIsolatedOnlyMargin(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |

`delta` 和 `amount` 均为规范化小数字符串（先哈希再解析）。

### 质押

| `action.type` | `encodeType` |
|---------------|--------------|
| `token_delegate` | `MetaFluxTransaction:TokenDelegate(string metafluxChain,address validator,string amount,bool isUndelegate,uint64 nonce)` |

`amount` 为规范化小数字符串。`isUndelegate` = `true` 表示取消委托，`false` 表示委托。

### 金库

| `action.type` | `encodeType` |
|---------------|--------------|
| `vault_transfer` | `MetaFluxTransaction:VaultTransfer(string metafluxChain,uint64 vaultId,bool deposit,string amount,uint64 nonce)` |
| `vault_withdraw` | `MetaFluxTransaction:VaultWithdraw(string metafluxChain,uint64 vaultId,string shares,uint64 nonce)` |

`vault_transfer.deposit` = `true` 表示存入，`false` 表示取出；`amount` 为规范化小数字符串。`vault_withdraw.shares` 为规范化小数字符串。

### 现货保证金

| `action.type` | `encodeType` |
|---------------|--------------|
| `spot_margin_deposit` | `MetaFluxTransaction:SpotMarginDeposit(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_withdraw` | `MetaFluxTransaction:SpotMarginWithdraw(string metafluxChain,uint32 pair,string amount,uint64 nonce)` |
| `spot_margin_open` | `MetaFluxTransaction:SpotMarginOpen(string metafluxChain,uint32 pair,uint64 size,uint64 limitPx,string borrow,uint64 nonce)` |

`amount` 和 `borrow` 为规范化小数字符串；`size` 和 `limitPx` 为整数。

### 理财

| `action.type` | `encodeType` |
|---------------|--------------|
| `earn_deposit` | `MetaFluxTransaction:EarnDeposit(string metafluxChain,uint32 asset,string amount,uint64 nonce)` |
| `earn_withdraw` | `MetaFluxTransaction:EarnWithdraw(string metafluxChain,uint32 asset,string shares,uint64 nonce)` |

`amount` 和 `shares` 均为规范化小数字符串。

### 代理抽象与跨链桥

| `action.type` | `encodeType` |
|---------------|--------------|
| `agent_set_abstraction` | `MetaFluxTransaction:AgentSetAbstraction(string metafluxChain,address user,uint8 kind,string value,uint64 nonce)` |
| `mb_withdraw` | `MetaFluxTransaction:MbWithdraw(string metafluxChain,uint8 chain,uint32 asset,uint64 amount,string dstAddr,uint64 nonce)` |

特定字段说明：

- `agent_set_abstraction`：`value` 是 EIP-712 的 **`string`** 类型——对原始字符串进行签名（此字段非数值，以 `keccak256(utf8)` 方式哈希）。
- `mb_withdraw`：类型化消息中的 `chain` 字段为 **`uint8`**——`0` = Solana，`1` = Base，`2` = Arbitrum。但 POST 请求的 `action.params.chain` 为**链名字符串**（`"Solana"` / `"Base"` / `"Arbitrum"`）。因此，类型化消息中签 `uint8`，`params` 中发送字符串名称。
- `mb_withdraw`：`amount` 为 `uint64` **整数**（非小数字符串）；`dstAddr` 为目标链的地址字符串。

### 不纳入类型化摘要的字段

以下两个操作的 `params` 中包含类型化类型字符串**未覆盖**的键，服务器会将其强制设为默认值：

- `approve_agent` — `ApproveAgent` 类型**不包含 `expires_at_ms`**，因此 `approve_agent` 默认**永不过期**。**请省略** `expires_at_ms`。
- `create_vault` — `CreateVault` 类型**不包含 `parent`**，因此 `create_vault` 默认为**顶层金库**（无父级）。**请省略** `parent`。

## 完整示例 — `send_asset`（转账操作）

将资产 `2` 的 `"750.25"` 份额从现货 DEX `0` 转至永续合约 DEX `1` 的合约钱包，网络为 **Testnet**（`chainId = 114514`）。

传入 `eth_signTypedData_v4` 的对象：

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

## 完整示例 — `approve_agent`（账户操作）

在 **Testnet**（`chainId = 114514`）上授权名为 `"trading-bot"` 的代理。注意：类型化的 `approve_agent` 永不过期——无 `expires_at_ms` 字段。

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

有关授权的完整生命周期，请参阅[代理钱包](../concepts/agent-wallets.md)（授权在提交后下一个区块生效）。

## 验证编码正确性

在提交之前，请先在本地对自行组装的摘要还原签名者，确认其与预期地址一致——若不一致，问题出在类型化数据的组装逻辑，而非链本身。上述原子编码规则即为完整规范；跨实现的已知答案测试可对每个操作的摘要进行逐字节比对，因此任何符合规范的 `eth_signTypedData_v4` 实现均应产生相同结果。

## 订单与撤单

订单与撤单操作（`submit_order`、`batch_order`、`cancel_order`、`batch_cancel`）通过相同的 `/exchange` 信封提交，并以同样的 EIP-712 类型化数据方式签名。其操作体结构详见 [`POST /exchange` 操作目录](../api/rest/exchange.md#action-catalog)。

## 延伸阅读

- [`POST /exchange`](../api/rest/exchange.md) — 接口说明及完整操作目录
- [代理钱包](../concepts/agent-wallets.md) — 授权生命周期
- [网络](../networks.md) — 各网络对应的 `chainId`
