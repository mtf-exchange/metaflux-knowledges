# WS 订阅频道

:::info
**状态。** `l2_book`、`bbo`、`trades`、`active_asset_ctx`、`all_mids`、`fills`、`user_events`、`candles`、`order_updates`、`notifications`、`ledger_updates`、`active_asset_data`、`user_fundings`、`user_twap_slice_fills`、`user_twap_history`、`account_state`、`spot_state` 和 `web_data2` 已上线，并按区块推送真实已提交数据。[路线图](#roadmap--not-yet-available)下的其他所有内容都未连接。连接生命周期和帧格式在 [WS README](./index.md) 中。按市场频道（`l2_book`、`bbo`、`trades`、`active_asset_ctx`）需要 `coin`；`candles` 需要 `coin` **和** `interval`；按账户频道（`fills`、`user_events`）需要 `user`（0x 地址）；`active_asset_data` 需要 **both** `user` 和 `coin`；`all_mids` 都不需要。
:::

:::info
**频道名称为 snake_case（MTF 原生）。** 这是 node `/ws` 原生接口，所以频道线路名称为 snake_case（`l2_book`、`user_events` 等）。需要 HL-camelCase 频道名称（`l2Book`、`userEvents`、`userFills`、`candle` 等）的客户端连接到网关的 **`/hl/ws`**（HL-compat），它在底层转换为这些原生 snake_case 频道。根据统一网关路由：`<net>-gateway.mtf.exchange/ws` = 原生 snake_case，`/hl/ws` = HL camelCase。
:::

帧协议镜像 HL 的；**频道名称为 MTF 原生 snake_case**。您使用以下方式订阅：

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

您会收到一个 ack（`subscriptionResponse`）、一个初始快照，然后是实时的 `{"channel":...,"data":...}` 推送。`coin` 对于按市场频道（`l2_book`、`bbo`）是**必需的**；请参阅 [Coin 参数](./index.md#coin-parameter)了解它如何被规范化（数字资产 id 或符号 → 资产-id 键）。

## 频道状态一览

| Channel | Status | key | Live source |
|---------|--------|:-------:|-------------|
| `l2_book` | **live** | `coin`（必需） | 已提交账本，每次提交 |
| `bbo` | **live** | `coin`（必需） | 已提交账本，每次提交 |
| `trades` | **live** | `coin`（必需） | 已提交区块成交，每次提交 |
| `active_asset_ctx` | **live** | `coin`（必需） | 按市场标记/预言机/融资/OI，每次提交 |
| `all_mids` | **live** | 无 | 按市场标记，每次提交 |
| `fills` | **live** | `user`/`address`（必需） | 该账户的已提交区块成交 |
| `user_events` | **live** | `user`/`address`（必需） | 该账户的已提交区块成交（更多事件类型即将推出） |
| `candles` | **live** | `coin` + `interval`（都必需） | 已提交区块成交折叠为 OHLCV 条形，每次提交 |
| `order_updates` | **live** | `user`/`address`（必需） | 按账户订单生命周期（下单/成交/取消/拒绝），每次提交 |
| `notifications` | **live** | `user`/`address`（必需） | 按账户保证金/清算通知，每次提交 |
| `ledger_updates` | **live** | `user`/`address`（必需） | 按账户资金流动（存入/提出/转账），每次提交 |
| `active_asset_data` | **live** | `user` **和** `coin`（都必需） | 按（用户、币种）杠杆/保证金模式/最大交易上下文，每次提交 |
| `user_fundings` | **live** | `user`/`address`（必需） | 按账户已实现融资支付，每次提交 |
| `user_twap_slice_fills` | **live** | `user`/`address`（必需） | 按账户 TWAP 片段成交（`{fill, twapId}`），每次提交 |
| `user_twap_history` | **live** | `user`/`address`（必需） | 按账户 TWAP 生命周期（`{time, state, status}`：已激活/已完成/已终止），每次提交 |
| `account_state` | **live** | `user`/`address`（必需） | 按账户永续清算所状态 — 保证金标量、头寸、余额 — 每次提交 |
| `spot_state` | **live** | `user`/`address`（必需） | 按账户现货清算所状态 — 按代币余额 — 每次提交 |
| `web_data2` | **live** | `user`/`address`（必需） | 按账户复合 UI 快照 — 清算所 + 现货余额 + 开仓订单 + 金库权益 + 交易所状态 — 每次提交 |

订阅任何其他 `type` 会返回 `{"channel":"error","data":{"error":"unknown channel: <name>"}}`.

---

## 实时频道

### `l2_book`

一个市场的聚合 L2 订单簿。**需要 `coin`。**

```json
{ "method": "subscribe", "subscription": { "type": "l2_book", "coin": "BTC" } }
```

初始快照和每次推送共享这个形状：

```json
{
  "channel": "l2_book",
  "data": {
    "coin": "BTC",
    "levels": [
      [ { "px": "10050000000", "sz": "12", "n": 2 }, { "px": "10049000000", "sz": "3", "n": 1 } ],
      [ { "px": "10051000000", "sz": "4", "n": 1 }, { "px": "10052000000", "sz": "6", "n": 1 } ]
    ],
    "time": 1735689600000
  }
}
```

- `levels` 是 `[bids, asks]`。出价从最优（最高）开始；要价从最优（最低）开始。
- 每一档都是 `{ px, sz, n }`：`px` / `sz` 是原始定点量级作为十进制**字符串**（按资产 tick 缩放在网关下游应用），`n` 是该价格的待成交订单数。
- 每一侧上限是 **20 个聚合档位**。
- `time` 是账本的 `last_trade_ms`（共识衍生）；`0` 直到账本有交易。

每次推送是前 20 档的**完整快照**，不是差异 — 没有 `is_snapshot` / `updates` / 差异帧。在每帧上替换您的本地账本。

频率：在该市场有实时订阅者的每个已提交区块中一帧。如果币种映射到无已知市场，您仍会得到 ack，但快照体是空账本（`"levels": [[], []]`、`"time": 0`），之后不会有推送。

### `bbo`

一个市场的最优买价/卖价。更瘦的 `l2_book`。**需要 `coin`。**

```json
{ "method": "subscribe", "subscription": { "type": "bbo", "coin": "BTC" } }
```

```json
{
  "channel": "bbo",
  "data": {
    "coin": "BTC",
    "time": 1735689600000,
    "bbo": [
      { "px": "10050000000", "sz": "12", "n": 2 },
      { "px": "10051000000", "sz": "4", "n": 1 }
    ]
  }
}
```

- `bbo` 是 `[best_bid, best_ask]`。每个条目是一个 `{ px, sz, n }` 档位，或当该侧为空时 `null`。
- `time` 是 `last_trade_ms`，与 `l2_book` 相同。

频率：在该市场有实时订阅者的每个已提交区块中一帧。

---

### `trades`

一个市场的公开交易记录 — 每次提交该市场的每笔成交一条记录。`px`/`sz` 是原始 **1e8 平面**整数字符串；`side` 是接盘方的一侧（`"B"` 买入 / `"A"` 卖出）；`time` 是共识区块时间戳（毫秒）；`tid` 是确定性交易 id；`users` 是 `[taker, maker]`（接盘方优先，激进方）。

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

```json
{ "channel": "trades", "data": { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": 1234567890, "users": ["0x..taker", "0x..maker"] } }
```

### `active_asset_ctx`

一个市场的按市场上下文 — 标记/预言机价格、融资和开仓利息 — 每次提交推送。**需要 `coin`。** 主体携带与 REST [`market_info`](../rest/info.md#market_info) 读相同的字段和单位：`mark_px` / `oracle_px` 是**整数 USDC**，tick 对齐（截断到市场的价格 tick），`funding` 区块镜像 `market_info.funding`。由与 REST 读相同的按市场记录构建器构建，所以 WS ctx 推送永不偏离 `market_info`。

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_ctx", "coin": "BTC" } }
```

```json
{
  "channel": "active_asset_ctx",
  "data": {
    "coin": "BTC",
    "mark_px": "66735.25",
    "oracle_px": "66700",
    "funding": {
      "rate_per_hr": "0",
      "cap_per_hr": "400",
      "interval_ms": 3600000,
      "next_payment_ts": 0
    },
    "open_interest": "5000000000"
  }
}
```

- `mark_px` / `oracle_px` — 整数 USDC，tick 对齐（未设置时为 `"0"`）。与 `market_info` 相同平面，**不是** 1e8 账本平面。
- `funding` — `{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`，与 REST `market_info.funding` 块相同（对于未知市场为 `null` — 见下文）。`rate_per_hr` 是最新的每小时融资利率样本（上限前）和 `cap_per_hr` 按市场利率上限，两者都是**基点字符串**，向零截断（例如 `"400"` = 0.04/小时）；`interval_ms` 是融资节奏（`3600000` = 1h）；`next_payment_ts` 是纪元毫秒，`0` 直到市场有其第一个融资样本。
- `open_interest` — 当前开仓利息，定点字符串（无账本时 `"0"`）。

频率：在该市场有实时订阅者的每个已提交区块中一帧。

如果币种映射到无已知市场，您仍会得到 ack，但快照是**坦诚-空的**主体 — 零价格 / OI 和 `null` 融资块 — 之后不会有推送（所以客户端反序列化固定 ctx 结构永不破裂）：

```json
{ "channel": "active_asset_ctx", "data": { "coin": "DOGE", "mark_px": "0", "oracle_px": "0", "funding": null, "open_interest": "0" } }
```

### `all_mids`

全局中点映射 — 每个市场的标记价格，每次提交推送。按币种键入；值是 REST [`markets`](../rest/info.md#markets) 读报告的 tick 对齐整数 USDC 标记。无 `coin` 参数。

```json
{ "method": "subscribe", "subscription": { "type": "all_mids" } }
```

```json
{ "channel": "all_mids", "data": { "mids": { "BTC": "66703.35", "ETH": "1856.49", "SOL": "73.95", "MTF": "5" } } }
```

### `fills` <a id="fills"></a>

按账户成交流。需要 `user`（0x 地址；`address` 也被接受）— 不是 `coin`。每个执行的匹配为双方各自提供一条记录，各自观点，具有相同的字段集 `{coin, side, px, sz, time, oid, cloid, tid, crossed}`：

- **接盘方**记录 — 接盘方自己的 `oid`、其 `cloid`（或 `null`）、接盘方一侧、`crossed: true`；
- **做市方**记录 — 做市方自己的 `oid`、`cloid: null`（待成交一侧不捕获 cloid）、**相反**一侧、`crossed: false`。

一个匹配的两条腿共享相同的 `tid`（公开 [`trades`](#trades) 记录带有的相同值）。`px`/`sz` 是 1e8 平面字符串。按账户成交记录**没有 `users` 数组** — 对手方地址仅出现在公开 [`trades`](#trades) 记录上，永不在账户范围内的信息源。

```json
{ "method": "subscribe", "subscription": { "type": "fills", "user": "0x<address>" } }
```

初始快照是空数组 `[]`；每次推送是一个数组，持有一条成交记录：

```json
{ "channel": "fills", "data": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] }
```

### `user_events` <a id="userevents"></a>

按账户事件源。需要 `user`（0x 地址）— 不是 `coin`。目前它标记 `fills`；清算/融资事件类型将作为兄弟键到来。

```json
{ "channel": "user_events", "data": { "fills": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] } }
```

原生频道名称是 `user_events`（snake_case）；在网关的 `/hl/ws`（HL-compat）上，等价的是 HL 的 `userEvents`。

:::warning
`user_events` 是按账户数据，但目前**没有身份验证** — 任何连接都可以订阅任何地址的信息源。在身份验证-在-订阅门落地前不要将其视为私有频道；对于已认证读/写使用 `post` 和签名的行为。
:::

### `candles`

一个市场在一个条形大小处的滚动 OHLCV 条形。**需要 `coin` 和 `interval`** — 它们一起形成路由键，所以同一市场上的 `1m` 和 `5m` 订阅是独立订阅，各自有其自己的快照和推送。

```json
{ "method": "subscribe", "subscription": { "type": "candles", "coin": "BTC", "interval": "1m" } }
```

- `interval` ∈ `1m` / `5m` / `15m` / `1h` / `4h` / `1d`。缺少或无法识别的 `interval` 被规范化为 **`1m`**（ack 回显实际使用的 interval）。
- ack 在订阅中回显 `interval`，以便客户端可以关联 `(coin, interval)`。

**初始快照**是最近条形（已收盘 + 开仓条形）的**数组**，最旧的在前 — `[]` 直到市场有交易：

```json
{ "channel": "candles", "data": [
  { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 }
] }
```

每个**推送**是一个**单一条形对象**（不是数组）— 该 `(coin, interval)` 的当前开仓条形，在该市场的成交降落在此区块中的每个已提交区块上重新发出：

```json
{ "channel": "candles", "data": { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 } }
```

- `t` / `T` — 条形开/收盘纪元毫秒（共识衍生）；条形覆盖 `[t, T]`，成交在其区块时间戳跨过 `T` 时滚入新条形。
- `s` — 币种/市场符号；`i` — interval 桶代币。
- `o` / `c` / `h` / `l` — 开/收/高/低，**十进制 USDC** 字符串（人类美元，例如 `"67002.50"`）。
- `v` — 折叠进条形的基础资产交易量（币种大小）。`q` — 报价（USD）交易量 = `Σ price × size` 遍历条形的成交。`n` — 条形中的成交数。

系列是**无间隙的**：没有交易的 interval 发出一个平坦条形，带着前面的收盘向前传递（`o = h = l = c = previous close`、`v = q = 0`、`n = 0`）。市场的第一笔交易前没有条形被发出 — 系列从第一个打印的桶开始。

存储保留最多 **1000 条每 `(coin, interval)`** 系列的条形；冷系列（无订阅者）被驱逐，所以一个无人观看的市场/interval 花费零开销。在网关的 `/hl/ws`（HL-compat）上，等价的频道名称是 HL 的 `candle`（单数）。

### `order_updates`

按账户订单生命周期。需要 `user`（0x 地址）。每次推送是该账户从刚刚提交的区块的订单更新记录的数组；初始快照是 `[]`。

```json
{ "method": "subscribe", "subscription": { "type": "order_updates", "user": "0x<address>" } }
```

```json
{ "channel": "order_updates", "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": "1000",
             "oid": 42, "cloid": "0x..", "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- `status` ∈ `open`（待成交；`sz` 是提交后账本剩余）/ `filled`（接盘方带累计 `filled_sz` + `avg_px`；做市方腿报告每笔匹配 `filled_sz`，同时 `status` 仍 `open`，任何大小待成交）/ `canceled` / `rejected`（+ `reason`，null `oid`）/ `cancel_rejected`（+ `reason`）。
- `limit_px` / `sz` / `orig_sz` / `avg_px` 是 1e8 平面十进制字符串；`time` 是共识毫秒；未知字段是 `null`。
- **不**目前发出：`modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / TWAP 转变和引擎启动（BOLE T0）取消 — 这些的调度观察是一个不透明的 ok/err，没有按订单负载。

### `notifications`

按账户保证金/清算通知，由连续提交状态的差异衍生。需要 `user`。每个受影响的提交一个数组框；初始快照 `[]`。

```json
{ "method": "subscribe", "subscription": { "type": "notifications", "user": "0x<address>" } }
```

```json
{ "channel": "notifications", "data": [
  { "kind": "yellow_card", "tier": "yellow_card", "message": "...", "time": 1735689600123 },
  { "kind": "forced_close_tier", "tier": "partial_market_50", "message": "...", "time": 1735689600123 },
  { "kind": "tier_cleared", "tier": null, "message": "...", "time": 1735689600123 },
  { "kind": "forced_close", "coin": "BTC", "side": "long", "closed_sz": "600", "message": "...", "time": 1735689600123 },
  { "kind": "backstop_residual", "coin": "BTC", "side": "long", "lots": "120", "message": "...", "time": 1735689600123 },
  { "kind": "backstop_residual_cleared", "coin": "BTC", "side": "long", "message": "...", "time": 1735689600123 } ] }
```

- `kind` 是机器标签；`message` 是人类可读文本。`tier` ∈ `yellow_card` / `partial_market_50` / `full_market` / `backstop_takeover`（或在清除时 `null`）。
- `yellow_card` 是单区块保证金预警宽限（[分级清算](../../concepts/tiered-liquidation.md) T0 合约）；`forced_close` 在清算实际对账户执行时触发。

### `ledger_updates`

按账户资金流动，归因于其**原因**（从已提交区块负载读取 — 记录仅在操作应用时出现）。需要 `user`；初始快照 `[]`。

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- `kind` ∈ `usd_send` / `usd_receive`、`spot_send` / `spot_receive`（+ `token`）、`asset_send` / `asset_receive`（+ `asset`、`to_perp`）、`withdraw`（`via`：`cctp` | `metabridge`）、`deposit`（`amount` 可能对入站 CCTP 信用为 `null`）、`system_credit`、`sub_account_transfer`、`sub_account_spot_transfer`、`vault_transfer`。转账为每一方发出一条记录（发送者 + 接收者）。
- 金额是整数代币十进制字符串，除了 `withdraw` via MetaBridge，其带 `amount_units`（原始基础单位）。入站桥接信用金额和 CoreWriter 延迟行为（在后期区块中调度）尚未归因。

### `active_asset_data`

按（用户、币种）交易上下文 — 杠杆、保证金模式和当前最大交易大小上限一个账户在一个市场。需要 **both** `user`（0x）和 `coin`。初始快照是实时上下文（账户没有头寸时为零配置默认值），不是空数组；推送在每个已提交区块上重新发出。

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "data": {
  "address": "0x<addr>", "asset_id": 0, "leverage": 7, "margin_mode": "isolated",
  "max_trade_size": "5000000000", "has_position": true } }
```

- `margin_mode` ∈ `cross` / `isolated` / `strict_iso`；`max_trade_size` 是 OI 上限衍生大小上限（原始盘数字符串）；字段与 REST [`active_asset_data`](../rest/info.md) 读相同。

在网关的 `/hl/ws`（HL-compat）上，等价的频道名称是 HL 的 `activeAssetData`，帧被转换为 HL 的 camelCase 形状：

```json
{ "channel": "activeAssetData", "data": {
  "user": "0x<address>", "coin": "BTC", "leverage": 7,
  "maxTradeSzs": ["5.0", "5.0"], "availableToTrade": ["35000.00", "35000.00"] } }
```

- `user` — 0x 账户地址；`coin` — 市场符号。
- `maxTradeSzs` — `[buy, sell]`：每一侧最大可交易**大小**（基础单位），作为十进制字符串。
- `availableToTrade` — `[buy, sell]`：每一侧可交易的**USD** 名义价值，作为十进制字符串。

### `account_state`

按账户**永续**清算所状态 — 保证金摘要、开仓头寸和一个账户的余额 — 每次提交推送。需要 `user`（0x 地址；`address` 也被接受）— 不是 `coin`。主体由与 REST 焦点账户读相同的记录构建器构建，所以 WS 推送永不偏离该读。初始快照是实时状态（对于无资金账户为零），不是空数组。

```json
{ "method": "subscribe", "subscription": { "type": "account_state", "user": "0x<address>" } }
```

```json
{
  "channel": "account_state",
  "data": {
    "address": "0x<addr>",
    "account_value": "10000", "free_collateral": "8500", "maint_margin": "300",
    "init_margin": "1500", "health": "0.97", "tier": 0,
    "mode": "cross", "pm_enabled": false,
    "positions": [
      { "asset": 0, "size": "600", "entry": "62000", "upnl": "441",
        "isolated": false, "lev": 7, "side": "long" }
    ],
    "balances": { "usdc": "10000", "spot": { "MTF": { "total": "12.5", "hold": "0" } } }
  }
}
```

- 保证金标量（`account_value` / `free_collateral` / `maint_margin` / `init_margin` / `health`）是**整数 USDC** 十进制字符串，与 REST 账户读的 `MarginScalars` 相同；`tier` 是清算级别索引，`mode` 账户默认，`pm_enabled` 投资组合保证金是否开启。
- `positions[]` — 每个开放永续头寸一项：`asset`（数字 id）、`size`（签名的 1e8 平面字符串）、`entry` / `upnl`（整数 USDC）、`isolated`、`lev` 和 `side`（`long` / `short`，在套期保值模式下呈现）。
- `balances` — `{usdc, spot}`：`usdc` 是报价抵押品（整数 USDC）；`spot` 映射代币 → `{total, hold}`。

频率：账户有实时订阅者时每个已提交区块一帧。

:::warning
`account_state` 是按账户数据，但目前**没有身份验证** — 任何连接都可以订阅任何地址。在身份验证-在-订阅门落地前不要将其视为私密。
:::

### `spot_state`

按账户**现货**清算所状态 — 一个账户的按代币现货余额 — 每次提交推送。需要 `user`。初始快照是实时余额集（对于无现货持有的账户为 `[]`）。

```json
{ "method": "subscribe", "subscription": { "type": "spot_state", "user": "0x<address>" } }
```

```json
{
  "channel": "spot_state",
  "data": {
    "address": "0x<addr>",
    "balances": [
      { "asset": 1, "name": "USDC", "total": "2500", "hold": "100" },
      { "asset": 2, "name": "MTF", "total": "12.5", "hold": "0" }
    ]
  }
}
```

- `balances[]` — 每个持有的现货代币一项：`asset`（数字 id）、`name`（代币符号）、`total`（整数代币十进制字符串）、`hold`（待成交现货订单保留金额）。与 REST 现货余额读相同。

频率：账户有实时订阅者时每个已提交区块一帧。

### `web_data2`

按账户**复合**"前端的一切" 快照 — 永续清算所摘要、现货余额、开仓订单、金库权益和一个账户的全球交易所状态，全部在一帧中，每次提交推送。需要 `user`（0x 地址；`address` 也被接受）— 不是 `coin`。主体是 REST [`web_data2`](../rest/info.md#web_data2) 读返回的字节相同复合（它组成相同的子读取器），所以 WS 推送永不偏离该读。初始快照是实时复合（当账户无资金/头寸/订单时为零配置默认值），不是空数组。

```json
{ "method": "subscribe", "subscription": { "type": "web_data2", "user": "0x<address>" } }
```

```json
{
  "channel": "web_data2",
  "data": {
    "address": "0x<addr>",
    "clearinghouse": {
      "account_value": "10000",
      "margin_used": "300",
      "positions": [
        { "asset": 0, "size": "600", "entry_ntl": "2500", "mode": "cross", "lev": 10 }
      ]
    },
    "spot_balances": [
      { "asset": 2, "name": "MTF", "total": "12.5", "hold": "0" }
    ],
    "open_orders": [
      { "oid": 42, "market_id": 0, "side": "bid", "px": "6700000000000", "size": "10000000",
        "tif": "gtc", "cloid": "0xab..", "trigger": null, "inserted_at_ms": 1735689600123 }
    ],
    "vault_equities": [
      { "vault_id": 1, "vault_address": "0x<vault>", "shares": "1000", "equity": "1050" }
    ],
    "exchange_status": {
      "spot_disabled": false,
      "post_only_until_time_ms": 0,
      "post_only_until_height": 0,
      "scheduled_freeze_height": null,
      "mip3_enabled": true,
      "frozen": false,
      "replay_complete": true
    }
  }
}
```

复合携带正好这些段（每个由匹配的子读取器组成，所以形状永不偏离独立读取）：

- `address` — 帧键入的规范小写 0x 地址。
- `clearinghouse` — 永续账户摘要：`account_value`（跨账户值，整数 USDC 十进制字符串）、`margin_used`（Σ 按资产维护保证金使用，整数 USDC）和 `positions[]`。每个头寸行是 `{asset, size, entry_ntl, mode, lev}`：`asset` 是数字市场 id，`size` 是签名的 1e8 平面大小字符串（每个非零腿一行，所以套期保值模式账户报告两条腿），`entry_ntl` 是整数 USDC，`mode` ∈ `cross` / `isolated` / `strict_iso`，`lev` 是头寸的最大杠杆。零大小腿被省略。
- `spot_balances` — 来自 [`spot_state`](#spot_state) / REST `spot_clearinghouse_state` 的 `balances` 数组：每个持有现货代币一项，`{asset, name, total, hold}`。
- `open_orders` — 来自 REST `frontend_open_orders` 的 `orders` 数组：每个待成交订单**和**每个停泊的止盈/止损/止损触发一项，`{oid, market_id, side, px, size, tif, cloid, trigger, inserted_at_ms}`。`side` ∈ `bid` / `ask`；`px` / `size` 是 1e8 平面十进制字符串；`tif` ∈ `alo` / `ioc` / `gtc`（或停泊停止的 `trigger`）；`cloid` 是客户订单 id 或 `null`；`trigger` 对于普通账本订单为 `null`，否则 `{trigger_px, trigger_above}`（停泊停止也带 `is_parked: true`）。
- `vault_equities` — 来自 REST `user_vault_equities` 的 `equities` 数组：账户在其中有份额的每个金库一项，`{vault_id, vault_address, shares, equity}`（`equity` 是整数 USDC，`shares` 是原始整数字符串）。账户不跟随金库时为空。
- `exchange_status` — 全球交易状态标量（与 REST `exchange_status` 相同主体）：`{spot_disabled, post_only_until_time_ms, post_only_until_height, scheduled_freeze_height, mip3_enabled, frozen, replay_complete}`。这个块对于给定提交上的每个订阅者是相同的。

频率：账户有实时订阅者时每个已提交区块一帧。在每个提交上，当前复合为每个已订阅账户重新发出。

:::warning
`web_data2` 是按账户数据，但目前**没有身份验证** — 任何连接都可以订阅任何地址。在身份验证-在-订阅门落地前不要将其视为私密；对于已认证读使用 `post` 和签名的行为。
:::

---

## `post` — WS 上的请求/响应

不是订阅频道，而是在同一套接字上进行一次性读取和签名写入的方式。`request` 是与 REST 路由相同的 `{type, payload}` 信封；它通过相同的处理器调度（`POST /info`、`POST /exchange`）。请参阅 [WS README 中的 `post`](./index.md#post-requestresponse-over-ws) 了解完整的请求/响应形状和签名规则。

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

这是今天 WS 上已认证读和提交签名行为的支持路径。

---

## 路线图 — 尚未可用

以下频道出现在早期草案中，但**未在 node WS 接口上实现**。它们不是已识别的频道名称；订阅返回 `unknown channel` 错误。列在这里，所以集成商不被较旧的 SDK 存根误导。

- **公开市场数据：** `meta`（交易宇宙元数据）、`mark`（标记/预言机价格）、`fundingTicks`（融资利率更新）。
- **按用户（需要身份验证）：** `vaultEvents`、`rfqEvents`。

同样今天未实现：

- **基于差异的 `l2_book`**（`is_snapshot` / `updates` 帧）— 当前 `l2_book` 总是发送完整前 20 档快照。
- **`seq` / `resume` / 恢复代币** — 每个（重新）订阅从新鲜快照开始。
- **私有频道的身份验证-在-订阅信封** — 使用 `post` 和签名的行为进行已认证操作。

---

## 排序与交付

- **按订阅**，帧以提交顺序到达（每个触及观看市场的已提交区块一帧）。没有 `seq`；排序隐含在单一套接字上的到达顺序中。
- **跨订阅**，没有排序保证 — 交错是任意的。在 `channel` + `data` 内的 `coin` 上解复用。
- 交付是**最多一次每提交**且**不为恢复缓冲**：落后超过 256 帧的订阅被掉落用 `lagged` 错误帧（参见[背压与滞后](./index.md#backpressure--lag)）。重新订阅恢复；您获得新鲜快照。

## 另见

- [WS README](./index.md) — 连接生命周期、帧、coin 参数、`post`、背压
- [`POST /info`](../rest/info.md) — REST 等价用于一次性读取（也可通过 `post` 到达）
- [`POST /exchange`](../rest/exchange.md) — 由 `post` 行为路径共享的签名行为信封
