# 询价（RFQ）

:::info
**预览功能。**
:::

## 概述

RFQ 允许吃单方向一组注册做市商请求特定数量的私密报价，选择最优报价后按该价格结算 —— 全程无需将委托数量暴露在公开盘口。适用于可能显著影响可见盘口的大额委托。

## 为什么需要 RFQ

公开 CLOB 执行会泄露交易意图。在流动性较薄的资产上挂出一笔 500 万美元的委托，在第一笔成交完成之前就已经把所有信息都暴露出去了。RFQ 颠覆了这一模式：

- **吃单方**发布 RFQ，指定资产、方向、数量，以及可选的参考价格。
- **做市商**（已注册并针对该资产选择参与的）在时间窗口内（通常 1–5 秒）响应报价。
- **吃单方**接受最优报价 → 按该价格原子结算；其余报价自动过期。

报价仅对吃单方可见（不显示在公开盘口）。其他参与者可在事后通过 [`trades` WS 订阅](../api/ws/subscriptions.md#trades) 的 `kind: "rfq"` 标记看到该笔交易。

## 生命周期

```mermaid
sequenceDiagram
    participant taker
    participant makers
    taker->>makers: POST /exchange RfqRequest (creates rfq_id)
    Note over taker,makers: WS rfqEvents { rfqOpen, rfq_id } broadcast
    makers->>taker: quote — POST /exchange RfqQuote (per maker)
    makers->>taker: quote
    makers->>taker: quote
    makers-->>taker: WS rfqEvents { quotes:[…] }
    taker->>makers: POST /exchange RfqAccept (chooses one quote)
    Note over taker,makers: settle at quote price; notify maker (filled); expire other quotes
    makers-->>taker: WS userEvents { kind: "fill" }
```

## 操作流程

### 吃单方 — 发起 RFQ

`RfqRequest`（action 变体；结构与 [`submit_order`](../api/rest/exchange.md#submit_order) 一致）：

```json
{
  "type": "RfqRequest",
  "params": {
    "asset":          0,
    "side":           "Buy",
    "size":        "10000000000",
    "reference_px":"10050000000",
    "max_slippage_bps": 50,
    "ttl_ms":         5000
  }
}
```

| 字段 | 说明 |
|-------|---------|
| `reference_px` | 吃单方提供的参考价格（通常为公开标记价格），供做市商锚定报价使用 |
| `max_slippage_bps` | 价格偏离参考价格的上限；超出范围的报价将被丢弃 |
| `ttl_ms` | RFQ 在自动过期前保持开放的时长 |

响应：

```json
{ "accepted": true, "rfq_id": "0x<16 bytes>" }
```

RFQ 通过 [`userEvents` WS 频道](../api/ws/subscriptions.md#userevents) 广播给已选择参与的做市商（专用 `rfq*` 事件流已在路线图中）。

### 做市商 — 提交报价

`RfqQuote`：

```json
{
  "type": "RfqQuote",
  "params": {
    "rfq_id":       "0x<...>",
    "px":     "10049000000",
    "size":      "10000000000",
    "expires_at_ms":1735690000000
  }
}
```

做市商可在 RFQ 有效期内提交多笔报价（例如在不同价格上进行部分成交）。每个 `RfqQuote` 都是独立的 action，拥有各自的 `quote_id`。

### 吃单方 — 接受报价

`RfqAccept`：

```json
{
  "type": "RfqAccept",
  "params": { "rfq_id": "0x<...>", "quote_id": "0x<...>" }
}
```

结算在下一个区块中原子完成：
- 吃单方的持仓按 `px` 增加 `size`。
- 做市商的持仓按同一价格增加反方向的 `size`。
- 该 `rfq_id` 下的其他报价过期。
- 手续费结构：与公开盘口成交的做市商/吃单方分级标准相同（参见[手续费](./fees.md)）。

### 自动过期

`ttl_ms` 超时且未被接受时：

```json
{ "kind": "rfqExpired", "rfq_id": "0x<...>" }
```

不收取任何费用；所有已提交的报价均被丢弃。

## 做市商注册

要获得某资产的报价资格，做市商需通过 `RfqRegister` 进行注册：

```json
{
  "type": "RfqRegister",
  "params": { "asset": 0, "active": true, "min_size": "1000000000" }
}
```

`min_size` 允许做市商忽略不想响应的小额 RFQ。将 `active` 设为 `false` 即可取消注册。

已注册的做市商通过 `rfqEvents` 接收 RFQ 广播。做市商**无义务**进行报价 —— 是否报价由各做市商自行决定。

## 结算语义

| 属性 | RFQ 成交 |
|----------|----------|
| 价格 | 报价中的 `px`，与公开盘口无关 |
| 交易对手 | 仅一个做市商（被选中报价的签名方） |
| 盘口影响 | 无 —— 该笔交易不与挂单撮合 |
| 公开可见性 | 交易记录在结算后对外展示，标记为 `rfq` |
| 手续费 | 按标准手续费表的做市商/吃单方分级收取 |
| 保证金 | 与普通成交相同（双方均从 `init_margin` 中扣除） |
| 清算 | 相同 —— 结算后该持仓成为普通仓位 |

## RFQ 的局限性

- **不绕过保证金要求。** 吃单方必须拥有足够的保证金；保证金不足时将正常返回 `422` 错误。
- **事后不隐藏交易。** 交易在结算后发布到公开交易流，带有 `rfq` 标记。
- **不是荷兰式拍卖。** 报价不会随时间衰减；做市商提交固定价格报价；吃单方从中选择一个。
- **不支持多做市商分拆成交。** 单次 RFQ 接受只与一个做市商的报价全额撮合。如需拆分给多个做市商，需发起多次 RFQ。

## 查询开放中的 RFQ

RFQ 引擎状态通过节点 `/info` 读取路径对外暴露，提供两种查询类型 —— 完整响应结构和字段说明详见 [`rfq_open`](../api/rest/info.md#rfq_open) 和 [`rfq_user`](../api/rest/info.md#rfq_user)。`size` / `price` / `max_size` / `limit_px` 均为原始 **1e8 定点数**整数字符串（盘口/委托平面）。

`rfq_open` **无需参数**，返回所有开放中的 RFQ 请求及其做市商报价：

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"rfq_open"}'
```

若要查询特定账户参与的 RFQ，`rfq_user` 接受 `account_id`（u64）或 `address`（0x 十六进制），并将结果分为 `requested`（该账户发起的 RFQ）和 `quoted`（该账户参与报价的 RFQ）两部分：

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"rfq_user","address":"0x..."}'
```

如果该账户未参与任何 RFQ，将返回 200 且两个列表均为空。

## 边界情况

<details>
<summary>展开边界情况</summary>

- **同一做市商提交多笔报价。** 允许；吃单方选择最优报价。
- **吃单方接受后做市商报价才到达。** 该报价被静默丢弃，不返回错误。
- **吃单方正在签署接受时 RFQ 过期。** 接受返回 `{"error":"rfq expired"}`，请重新发起 `RfqRequest`。
- **吃单方账户在接受时不符合资格。** 若吃单方账户在请求和接受之间升级为 T1+，接受将被拒绝。做市商保留对未来 RFQ 进行报价的权利。
- **做市商在接受时保证金不足。** 接受被拒绝，返回 `{"error":"maker margin"}`。吃单方可尝试同一 RFQ 中的另一笔报价。

</details>

## 时序图 — 已接受的 RFQ

```mermaid
sequenceDiagram
    participant taker
    participant makerA as "maker A"
    participant makerB as "maker B"
    participant makerC as "maker C"
    Note over taker: T = 0 — taker sends RfqRequest, ttl=5000ms
    Note over taker,makerC: T = 0.1s — commit; rfq_id broadcast to makers
    makerA->>taker: T = 0.3s — quotes 10049
    makerB->>taker: T = 0.5s — quotes 10048 (best)
    makerC->>taker: T = 0.7s — quotes 10050
    Note over taker: T = 1.0s — taker sees the three quotes, picks B
    taker->>makerB: T = 1.1s — commit RfqAccept; settle 10000000000 @ 10048
    Note over taker,makerC: taker fills long 100 @ 10048; maker B fills short 100 @ 10048; quotes from A, C expire; public trade tape: "100 BTC @ 10048 rfq"
```

## 参考链接

- [订单类型](./order-types.md) — 公开盘口的替代方案
- [`/exchange` action 目录](../api/rest/exchange.md#action-catalog) — `RfqQuote` / `RfqAccept`（当前为已识别但未映射的存根）
- [`userEvents` WS](../api/ws/subscriptions.md#userevents) — RFQ 事件通过此频道推送
- [手续费](./fees.md) — RFQ 成交按标准分级收费

## 常见问题

<details>
<summary>展开常见问题</summary>

**Q：为什么不直接在盘口挂一个隐藏委托？**
A：隐藏委托仍然会通过成交泄露意图。RFQ 不会在任何地方挂单 —— 数量在结算前完全不可见。

**Q：RFQ 报价可以撤销吗？**
A：可以 —— 使用 `RfqCancelQuote { quote_id }`。当做市商在 RFQ 有效期间风险敞口发生变化时非常有用。

**Q：RFQ 成交是否有专属的撮合算法需要了解？**
A：没有 —— 吃单方一旦接受，结算直接在吃单方与被选中的做市商之间完成，不涉及 CLOB 引擎。

**Q：CLOB 流动性不足的市场也能有 RFQ 市场吗？**
A：可以 —— 已注册的做市商可以在任何市场上报价，不受盘口深度限制。RFQ 对于公开盘口无法承接大额委托的流动性较低 / 长尾资产尤为适用。

</details>
