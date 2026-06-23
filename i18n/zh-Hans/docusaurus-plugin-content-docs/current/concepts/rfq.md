# 询价单 (RFQ)

:::info
**预览功能。**
:::

## 简要说明

RFQ 允许接单方从一组已注册的做市商处请求私有询价单，接受最优报价，并以该价格结算 — 无需先将规模暴露在公开簿上。适用于会影响可见簿的大规模交易。

## 为什么要用 RFQ

公开 CLOB 执行会泄露意图。在薄流动性资产上下达 500 万美元的订单会在第一笔成交结清前就暴露一切。RFQ 翻转了这个模式：

- **接单方**发布 RFQ，包括资产、方向、规模、可选的参考价格。
- **做市商**（已注册且为该资产启用）在时间窗口内（通常 1-5 秒）回应报价。
- **接单方**接受最优报价 → 以该价格原子结算；其余报价失效。

报价仅对接单方可见（不在公开簿上）。其他参与者在 [`trades` WS 源](../api/ws/subscriptions.md#trades)上看到成交后的交易，标记为 `kind: "rfq"`。

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

### 接单方 — 请求 RFQ

`RfqRequest`（操作变体；镜像 [`submit_order`](../api/rest/exchange.md#submit_order) 形状）：

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

| 字段 | 含义 |
|-------|---------|
| `reference_px` | 接单方的提示价格（通常是公开标记价）；做市商用来锚定报价 |
| `max_slippage_bps` | 价格相对于参考价的最大偏差上限；超出的报价会被丢弃 |
| `ttl_ms` | RFQ 保持打开状态直到自动过期的时间 |

响应：

```json
{ "accepted": true, "rfq_id": "0x<16 bytes>" }
```

RFQ 通过 [`userEvents` WS 频道](../api/ws/subscriptions.md#userevents)广播到已启用的做市商（专用 `rfq*` 事件流在规划中）。

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

做市商可以在 RFQ 的生命周期内提交多个报价（例如不同价格的部分成交）。每个 `RfqQuote` 是单独的操作，并获得自己的 `quote_id`。

### 接单方 — 接受

`RfqAccept`：

```json
{
  "type": "RfqAccept",
  "params": { "rfq_id": "0x<...>", "quote_id": "0x<...>" }
}
```

结算在下一个区块中是原子的：
- 接单方的头寸按 `px` 增加 `size`。
- 做市商的头寸在相同价格下按相反方向增加 `size`。
- 此 `rfq_id` 的其他报价失效。
- 费用结构：与公开簿成交相同的做市商/接单方等级（[费用](./fees.md)）。

### 自动过期

当 `ttl_ms` 在没有接受的情况下消逝时：

```json
{ "kind": "rfqExpired", "rfq_id": "0x<...>" }
```

无需收费；所有提交的报价都被丢弃。

## 做市商注册

要符合资产报价资格，做市商通过 `RfqRegister` 注册：

```json
{
  "type": "RfqRegister",
  "params": { "asset": 0, "active": true, "min_size": "1000000000" }
}
```

`min_size` 让做市商忽略他们不想被分页的小 RFQ。使用 `active: false` 注销。

已注册的做市商在 `rfqEvents` 上接收 RFQ 广播。他们无义务报价 — 报价是每个 RFQ 的选择加入。

## 结算语义

| 属性 | RFQ 成交 |
|----------|----------|
| 价格 | 报价的 `px`，与公开簿无关 |
| 交易对方 | 仅一个做市商（所选报价的签署者） |
| 簿面影响 | 无 — 交易不与挂单匹配 |
| 公开可见性 | 交易纪录在成交后显示，标记为 `rfq` |
| 费用 | 按费用表的标准做市商/接单方 |
| 保证金 | 与常规成交相同（从双方扣除 `init_margin`） |
| 清算 | 相同 — 结算后该头寸成为常规头寸 |

## RFQ 不做什么

- **不绕过保证金。**接单方必须有头寸的保证金；因保证金不足而无法承认会返回正常的 `422`。
- **不隐藏事后。**交易在结算后发布在公开交易源上，带有 `rfq` 标记。
- **非荷兰式拍卖。**报价不会衰减；做市商提交固定价格报价；接单方选择一个。
- **非多做市商成交。**单个 RFQ 接受仅完全匹配一个做市商的报价。要跨做市商拆分，请运行多个 RFQ。

## 查询开放 RFQ

RFQ 引擎状态通过两种查询类型在节点 `/info` 读路径上暴露 — 查看 [`rfq_open`](../api/rest/info.md#rfq_open) 和 [`rfq_user`](../api/rest/info.md#rfq_user) 以获取完整响应形状和字段表。`size` / `price` / `max_size` / `limit_px` 是原始 **1e8 定点**整数字符串（簿 / 订单平面）。

`rfq_open` 不取任何参数，返回每个打开的 RFQ 请求及其做市商报价：

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"rfq_open"}'
```

对于特定账户参与的 RFQ，`rfq_user` 取 `account_id`（u64）或 `address`（0x 十六进制），并将结果分成 `requested`（账户开启的 RFQ）和 `quoted`（它报价的 RFQ）：

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"rfq_user","address":"0x..."}'
```

参与无内容的账户返回 200，两个列表均为空。

## 边界情况

<details>
<summary>显示边界情况</summary>

- **来自同一做市商的多个报价。**允许；接单方选择最优。
- **做市商报价在接单方接受后到达。**报价被静默丢弃；无错误。
- **RFQ 在接单方签署接受时过期。**接受返回 `{"error":"rfq expired"}`。使用新的 `RfqRequest` 重试。
- **接单方账户在接受时不符合条件。**如果接单方的账户在请求和接受之间移动到 T1+，接受被拒绝。做市商保留对未来 RFQ 报价的权利。
- **做市商在接受时保证金不足。**接受被拒绝，返回 `{"error":"maker margin"}`。接单方可尝试同一 RFQ 的不同报价。

</details>

## 序列 — 已接受的 RFQ

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

## 另见

- [订单类型](./order-types.md) — 公开簿替代方案
- [`/exchange` 操作目录](../api/rest/exchange.md#action-catalog) — `RfqQuote` / `RfqAccept`（当前识别但未映射的存根）
- [`userEvents` WS](../api/ws/subscriptions.md#userevents) — RFQ 事件在此频道上传输
- [费用](./fees.md) — RFQ 成交按标准等级计费

## 常见问题解答

<details>
<summary>显示常见问题解答</summary>

**问：为什么不只是在簿上放置隐藏订单？**
答：隐藏订单仍会通过成交泄露。RFQ 不会发布在任何地方 — 规模在结算前是不可见的。

**问：RFQ 报价可以取消吗？**
答：可以 — `RfqCancelQuote { quote_id }`。当做市商的风险在 RFQ 中期变化时很有用。

**问：是否有我应该知道的 RFQ 专用成交匹配算法？**
答：没有 — 一旦接单方接受，结算是接单方和所选做市商之间的直接交易。CLOB 引擎不参与。

**问：流动性不多的市场仍然可以有 RFQ 市场吗？**
答：可以 — 已注册的做市商可以对任何市场报价，无论簿深度如何。RFQ 特别适用于薄 / 长尾资产，其中公开簿无法承载规模。

</details>
