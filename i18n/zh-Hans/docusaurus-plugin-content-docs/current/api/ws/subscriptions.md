# WS 订阅频道

:::info
**状态说明。** `l2_book`、`bbo`、`trades`、`active_asset_ctx`、`all_mids`、`fills`、`user_events`、`candles`、`order_updates`、`notifications`、`ledger_updates`、`active_asset_data`、`user_fundings`、`user_twap_slice_fills`、`user_twap_history`、`account_state`、`spot_state` 和 `web_data2` 均已上线，实时推送已确认的链上数据——以变更驱动为原则，只有频道状态在上一次提交后实际发生变化时才会发出帧。[路线图](#roadmap--not-yet-available) 中列出的其他频道尚未接入。连接生命周期与帧格式请参阅 [WS 概述](./index.md)。按市场订阅的频道（`l2_book`、`bbo`、`trades`、`active_asset_ctx`）必须传入 `coin`；`candles` 同时需要 `coin` **和** `interval`；按账户订阅的频道（`fills`、`user_events`）需要传入 `user`（0x 地址）；`active_asset_data` 同时需要 `user` 和 `coin`；`all_mids` 两者均不需要。
:::

:::info
**频道名称采用 snake_case（MTF 原生格式）。** 这是节点 `/ws` 原生接口，因此频道名称均为 snake_case（如 `l2_book`、`user_events` 等）。希望使用 HL 风格 camelCase 频道名称（`l2Book`、`userEvents`、`userFills`、`candle` 等）的客户端，请连接网关的 **`/hl/ws`**（HL 兼容模式），该端点会在底层将请求转译为这些原生 snake_case 频道。按统一网关路由规则：`<net>-gateway.mtf.exchange/ws` 为原生 snake_case，`/hl/ws` 为 HL camelCase。
:::

帧协议与 HL 一致；**频道名称采用 MTF 原生 snake_case**。订阅方式如下：

```json
{ "method": "subscribe", "subscription": { "type": "<channel>", "coin": "<coin>" } }
```

订阅后，您将依次收到：确认回复（`subscriptionResponse`）、初始快照（`is_snapshot: true`），以及后续以变更驱动的实时推送（`{"channel":...,"data":...}`，`is_snapshot: false`）。仅当频道状态在上次提交后实际发生变化时才会推送；未变更的频道不会发出任何帧。按市场频道（`l2_book`、`bbo`）**必须**传入 `coin`；关于 `coin` 参数的规范化方式（数字资产 ID 或符号 → 资产 ID 键），请参阅 [Coin 参数](./index.md#coin-parameter)。

## 频道状态一览

| 频道 | 状态 | 键 | 实时数据来源 |
|---------|--------|:-------:|-------------|
| `l2_book` | **已上线** | `coin`（必填） | 已确认的订单簿，有变更时推送 |
| `bbo` | **已上线** | `coin`（必填） | 已确认的订单簿，有变更时推送 |
| `trades` | **已上线** | `coin`（必填） | 已确认区块的成交，有新成交时推送 |
| `active_asset_ctx` | **已上线** | `coin`（必填） | 单市场标记价/预言机价/资金费率/未平仓量，有变更时推送 |
| `all_mids` | **已上线** | 无 | 各市场标记价，有变更时推送 |
| `fills` | **已上线** | `user`/`address`（必填） | 该账户在已确认区块中的成交记录 |
| `user_events` | **已上线** | `user`/`address`（必填） | 该账户在已确认区块中的成交记录（后续将支持更多事件类型） |
| `candles` | **已上线** | `coin` + `interval`（均必填） | 已确认区块的成交聚合为 OHLCV K 线，有变更时推送 |
| `order_updates` | **已上线** | `user`/`address`（必填） | 账户级订单生命周期（挂单 / 成交 / 撤单 / 拒绝），有变更时推送 |
| `notifications` | **已上线** | `user`/`address`（必填） | 账户级保证金 / 清算通知，有变更时推送 |
| `ledger_updates` | **已上线** | `user`/`address`（必填） | 账户级资金变动（充值 / 提现 / 划转），有变更时推送 |
| `active_asset_data` | **已上线** | `user` **和** `coin`（均必填） | 单（用户, 币种）的杠杆 / 保证金模式 / 最大交易规模上限，有变更时推送 |
| `user_fundings` | **已上线** | `user`/`address`（必填） | 账户级已实现资金费用，有变更时推送 |
| `user_twap_slice_fills` | **已上线** | `user`/`address`（必填） | 账户级 TWAP 分片成交（`{fill, twapId}`），有变更时推送 |
| `user_twap_history` | **已上线** | `user`/`address`（必填） | 账户级 TWAP 生命周期（`{time, state, status}`：已激活 / 已完成 / 已终止），有变更时推送 |
| `account_state` | **已上线** | `user`/`address`（必填） | 账户级永续合约清算所状态——保证金标量、持仓、余额——有变更时推送 |
| `spot_state` | **已上线** | `user`/`address`（必填） | 账户级现货清算所状态——各代币余额——有变更时推送 |
| `web_data2` | **已上线** | `user`/`address`（必填） | 账户级综合 UI 快照——清算所状态 + 现货余额 + 挂单 + 金库权益 + 交易所状态——有变更时推送 |

订阅任何其他 `type` 将返回 `{"channel":"error","data":{"error":"unknown channel: <name>"}}`。

---

## 实时频道

### `l2_book`

某一市场的聚合二级订单簿（L2）。**必须传入 `coin`。**

```json
{ "method": "subscribe", "subscription": { "type": "l2_book", "coin": "BTC" } }
```

初始快照与后续每次推送的数据结构如下：

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

- `levels` 为 `[bids, asks]`。买单按价格从高到低排列（最优先），卖单按价格从低到高排列（最优先）。
- 每个价位的格式为 `{ px, sz, n }`：`px` / `sz` 为原始定点数量，以十进制**字符串**表示（每个资产的价格刻度缩放由网关下游处理），`n` 为该价格上的挂单数量。
- 每一侧最多返回 **20 个聚合价位**。
- `time` 为订单簿的 `last_trade_ms`（共识推导值）；在有成交之前为 `0`。

每次推送均为**完整的前 20 档快照**，而非增量差分。帧信封携带 `is_snapshot` 布尔值——初始订阅快照为 `true`，后续变更驱动推送为 `false`——但**无论哪种情况，消息体均为完整的前 20 档订单簿**，因此该字段仅供参考：每次收到帧时直接替换本地订单簿即可保持数据正确。

推送频率：变更驱动——仅当订单簿在上次提交后实际发生变化时才发送帧；若某次提交未影响该订单簿，则不发出任何帧。如果 `coin` 对应的市场不存在，您仍会收到确认回复，但快照消息体为空订单簿（`"levels": [[], []]`，`"time": 0`），且不会有后续推送。

### `bbo`

某一市场的盘口最优买/卖价。是 `l2_book` 的精简版。**必须传入 `coin`。**

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

- `bbo` 为 `[best_bid, best_ask]`。每个条目均为 `{ px, sz, n }` 格式的价位；当某一侧无挂单时，该条目为 `null`。
- `time` 为 `last_trade_ms`，与 `l2_book` 相同。

推送频率：变更驱动——仅当盘口在上次提交后实际发生变化时才发送帧；若本次提交盘口未变化，则不发出任何帧。

---

### `trades`

某一市场的公开逐笔成交流——每笔成交对应一条记录，仅在该市场实际发生交易的提交区块上推送。`px`/`sz` 为原始 **1e8 精度**整数字符串；`side` 为吃单方方向（`"B"` 买 / `"A"` 卖）；`time` 为共识区块时间戳（毫秒）；`tid` 为确定性交易 ID；`users` 为 `[taker, maker]`（吃单方在前，即主动成交方）。

```json
{ "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
```

```json
{ "channel": "trades", "data": { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "tid": 1234567890, "users": ["0x..taker", "0x..maker"] } }
```

### `active_asset_ctx`

某一市场的实时行情上下文——标记价 / 预言机价、资金费率及未平仓量——有变更时推送。**必须传入 `coin`。** 消息体的字段及单位与 REST [`market_info`](../rest/info.md#market_info) 接口一致：`mark_px` / `oracle_px` 为**整 USDC 单位**，并按市场价格刻度截断对齐；`funding` 字段块与 `market_info.funding` 保持完全一致。该频道与 REST 接口共用同一套每市场记录构建逻辑，因此 WS 推送的行情上下文永远不会与 `market_info` 产生偏差。

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

- `mark_px` / `oracle_px`——整 USDC 单位，按价格刻度截断（未设置时为 `"0"`）。与 `market_info` 保持相同精度，**不是** 1e8 精度的订单簿平面。
- `funding`——`{rate_per_hr, cap_per_hr, interval_ms, next_payment_ts}`，与 REST `market_info.funding` 字段块完全一致（未知市场时为 `null`，见下文）。`rate_per_hr` 为最新每小时资金费率样本（未限幅前），`cap_per_hr` 为单市场费率上限，两者均为向零截断的 **bps 字符串**（如 `"400"` = 每小时 0.04%）；`interval_ms` 为资金费率结算周期（`3600000` = 1 小时）；`next_payment_ts` 为 epoch 毫秒时间戳，在市场产生首个资金费率样本之前为 `0`。
- `open_interest`——当前未平仓量，定点数字符串（无订单簿时为 `"0"`）。

推送频率：变更驱动——仅当该市场的上下文在上次提交后实际发生变化时才发送帧；若本次提交该上下文未变化，则不发出任何帧。

如果 `coin` 对应的市场不存在，您仍会收到确认回复，但快照消息体为**诚实的空值**——价格与未平仓量均为零，`funding` 字段块为 `null`——且不会有后续推送（确保客户端在反序列化固定上下文结构体时不会报错）：

```json
{ "channel": "active_asset_ctx", "data": { "coin": "DOGE", "mark_px": "0", "oracle_px": "0", "funding": null, "open_interest": "0" } }
```

### `all_mids`

全局中间价映射——每个市场的标记价，有变更时推送。以币种为键，值为 REST [`markets`](../rest/info.md#markets) 接口返回的经价格刻度截断的整 USDC 标记价。无需传入 `coin` 参数。

```json
{ "method": "subscribe", "subscription": { "type": "all_mids" } }
```

```json
{ "channel": "all_mids", "data": { "mids": { "BTC": "66703.35", "ETH": "1856.49", "SOL": "73.95", "MTF": "5" } } }
```

### `fills` <a id="fills"></a>

账户级成交流。需要传入 `user`（0x 地址；也接受 `address`）——**不需要** `coin`。每笔撮合成交时，双方各自从自身视角收到一条记录，字段集相同：`{coin, side, px, sz, time, oid, cloid, tid, crossed}`：

- **吃单方**记录——吃单方自身的 `oid`、其 `cloid`（若无则为 `null`）、吃单方方向，`crossed: true`；
- **挂单方**记录——挂单方自身的 `oid`、`cloid: null`（挂单侧不记录 cloid）、**相反**方向，`crossed: false`。

同一笔撮合的双方共享相同的 `tid`（与公开 `trades` 流携带的值一致）。`px`/`sz` 为 1e8 精度字符串。账户级成交记录**不包含 `users` 数组**——对手方地址仅出现在公开的 [`trades`](#trades) 流中，不会出现在账户级订阅中。

```json
{ "method": "subscribe", "subscription": { "type": "fills", "user": "0x<address>" } }
```

初始快照为空数组 `[]`；每次推送为包含一条成交记录的数组：

```json
{ "channel": "fills", "data": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] }
```

### `user_events` <a id="userevents"></a>

账户级事件流。需要传入 `user`（0x 地址）——**不需要** `coin`。目前包含 `fills` 事件；清算 / 资金费率等事件类型将作为并列字段陆续添加。

```json
{ "channel": "user_events", "data": { "fills": [ { "coin": "BTC", "side": "B", "px": "6700000000000", "sz": "10000000", "time": 1735689600123, "oid": 42, "cloid": "0xab..", "tid": 1234567890, "crossed": true } ] } }
```

原生频道名称为 `user_events`（snake_case）；通过网关 `/hl/ws`（HL 兼容模式）访问时，对应的 HL 频道名称为 `userEvents`。

:::warning
`user_events` 是账户级私有数据，但目前**没有任何认证机制**——任意连接均可订阅任意地址的事件流。在订阅认证门控功能上线之前，请勿将其视为私有频道；如需进行已认证的读写操作，请使用 `post` 配合签名 action。
:::

### `candles`

某一市场在某一周期下的滚动 OHLCV K 线。**`coin` 和 `interval` 均必填**——两者共同构成路由键，因此同一市场上的 `1m` 和 `5m` 订阅是相互独立的，各有自己的快照和推送。

```json
{ "method": "subscribe", "subscription": { "type": "candles", "coin": "BTC", "interval": "1m" } }
```

- `interval` 可选值：`1m` / `5m` / `15m` / `1h` / `4h` / `1d`。缺失或无法识别的 `interval` 将被标准化为 **`1m`**（确认回复会回显实际使用的 interval）。
- 确认回复会在 subscription 中回显 `interval`，方便客户端关联 `(coin, interval)`。

**初始快照**为一个**数组**，包含最近的 K 线（已收盘 + 当前未收盘的 K 线），按时间从旧到新排列——在市场有成交之前为 `[]`：

```json
{ "channel": "candles", "data": [
  { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 }
] }
```

每次**推送**为一个**单根 K 线对象**（不是数组）——当前 `(coin, interval)` 的未收盘 K 线，在每个有该市场成交的已确认区块上重新推送：

```json
{ "channel": "candles", "data": { "t": 1735689600000, "T": 1735689659999, "s": "BTC", "i": "1m", "o": "67000.00", "c": "67002.50", "h": "67005.00", "l": "66990.00", "v": "12.5", "q": "837843.75", "n": 8 } }
```

- `t` / `T`——K 线开盘 / 收盘 epoch 毫秒时间戳（共识推导值）；K 线覆盖区间为 `[t, T]`，当区块时间戳超过 `T` 时，成交将滚入新的 K 线。
- `s`——币种 / 市场符号；`i`——周期标识符。
- `o` / `c` / `h` / `l`——开盘价 / 收盘价 / 最高价 / 最低价，均为**十进制 USDC 字符串**（人类可读格式，如 `"67002.50"`）。
- `v`——K 线内标的资产成交量（基础资产数量）。`q`——报价（USD）成交额 = K 线内各笔成交的 `Σ 价格 × 数量`。`n`——K 线内的成交笔数。

K 线序列**无缺口**：无成交的周期会发出一根平线 K 线，以前一根收盘价填充（`o = h = l = c = previous close`，`v = q = 0`，`n = 0`）。在市场首次成交之前不会发出任何 K 线——序列从首笔成交所在的周期开始。

每个 `(coin, interval)` 序列最多缓存 **1000 根 K 线**；无订阅者的冷序列会被淘汰，因此无人关注的市场/周期不消耗任何资源。通过网关 `/hl/ws`（HL 兼容模式）访问时，对应的频道名称为 HL 的 `candle`（单数形式）。

### `order_updates`

账户级订单生命周期。需要传入 `user`（0x 地址）。每次推送为该账户在刚提交区块中的订单更新记录数组；初始快照为 `[]`。

```json
{ "method": "subscribe", "subscription": { "type": "order_updates", "user": "0x<address>" } }
```

```json
{ "channel": "order_updates", "data": [ {
  "order": { "coin": "BTC", "side": "B", "limit_px": "100", "sz": "600", "orig_sz": "1000",
             "oid": 42, "cloid": "0x..", "tif": "GTC", "reduce_only": false },
  "status": "open", "filled_sz": null, "avg_px": null, "reason": null, "time": 1735689600123 } ] }
```

- `status` 可选值：`open`（挂单中；`sz` 为本次提交后订单簿中的剩余量）/ `filled`（吃单方携带累计的 `filled_sz` + `avg_px`；挂单方腿在仍有剩余量时，`status` 保持 `open`，并报告每次撮合的 `filled_sz`）/ `canceled` / `rejected`（附带 `reason`，`oid` 为 null）/ `cancel_rejected`（附带 `reason`）。
- `limit_px` / `sz` / `orig_sz` / `avg_px` 为 1e8 精度十进制字符串；`time` 为共识毫秒时间戳；未知字段为 `null`。
- **目前不推送**的操作：`modify` / `batchModify` / `scheduleCancel` / `cancelAllOrders` / TWAP 状态转换以及引擎发起（BOLE T0）的撤单——这些操作的分发观测结果为不透明的 ok/err，不携带逐单详情。

### `notifications`

账户级保证金 / 清算通知，通过对比连续已确认状态差异派生得出。需要传入 `user`。每次受影响的提交发出一个数组帧；初始快照为 `[]`。

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

- `kind` 为机器可读标签；`message` 为人类可读的通知文本。`tier` 可选值：`yellow_card` / `partial_market_50` / `full_market` / `backstop_takeover`（清除时为 `null`）。
- `yellow_card` 为单区块保证金预警宽限（即[分级清算](../../concepts/tiered-liquidation.md) T0 合约）；`forced_close` 在清算实际执行于该账户时触发。

### `ledger_updates`

账户级资金变动记录，按**原因**归因（从已提交区块的负载中读取——仅当操作实际生效时才产生记录）。需要传入 `user`；初始快照为 `[]`。

```json
{ "method": "subscribe", "subscription": { "type": "ledger_updates", "user": "0x<address>" } }
```

```json
{ "channel": "ledger_updates", "data": [ { "kind": "usd_send", "destination": "0x..", "amount": "25.5", "time": 1735689600123 } ] }
```

- `kind` 可选值：`usd_send` / `usd_receive`、`spot_send` / `spot_receive`（附带 `token`）、`asset_send` / `asset_receive`（附带 `asset`、`to_perp`）、`withdraw`（`via`: `cctp` | `metabridge`）、`deposit`（入账 CCTP 信用时 `amount` 可能为 `null`）、`system_credit`、`sub_account_transfer`、`sub_account_spot_transfer`、`vault_transfer`。一笔划转会为双方（发送方 + 接收方）各生成一条记录。
- 金额为整代币十进制字符串，但通过 MetaBridge 提现时携带 `amount_units`（原始基础单位）。入账跨链信用金额及经 CoreWriter 延迟处理的操作（在后续区块中分发）尚未进行归因。

### `active_asset_data`

单（用户, 币种）的交易上下文——某账户在某市场上的杠杆、保证金模式及当前最大交易规模上限。同时需要传入 `user`（0x 地址）和 `coin`。初始快照为实时上下文（账户无持仓时返回默认零值配置），而非空数组；仅当该上下文发生变化时才重新推送。

```json
{ "method": "subscribe", "subscription": { "type": "active_asset_data", "user": "0x<address>", "coin": "BTC" } }
```

```json
{ "channel": "active_asset_data", "data": {
  "address": "0x<addr>", "asset_id": 0, "leverage": 7, "margin_mode": "isolated",
  "max_trade_size": "5000000000", "has_position": true } }
```

- `margin_mode` 可选值：`cross` / `isolated` / `strict_iso`；`max_trade_size` 为基于未平仓量上限推导的规模上限（原始手数字符串）；各字段与 REST [`active_asset_data`](../rest/info.md) 接口完全一致。

通过网关 `/hl/ws`（HL 兼容模式）访问时，对应的频道名称为 HL 的 `activeAssetData`，且帧会被转换为 HL 的 camelCase 结构：

```json
{ "channel": "activeAssetData", "data": {
  "user": "0x<address>", "coin": "BTC", "leverage": 7,
  "maxTradeSzs": ["5.0", "5.0"], "availableToTrade": ["35000.00", "35000.00"] } }
```

- `user`——0x 账户地址；`coin`——市场符号。
- `maxTradeSzs`——`[buy, sell]`：各方向可交易的最大**数量**（基础单位），以十进制字符串表示。
- `availableToTrade`——`[buy, sell]`：各方向可交易的 **USD 名义金额**，以十进制字符串表示。

### `account_state`

账户级**永续合约**清算所状态——某账户的保证金汇总、持仓及余额——有变更时推送。需要传入 `user`（0x 地址；也接受 `address`）——**不需要** `coin`。消息体与 REST 聚焦账户读取接口共用同一套记录构建逻辑，因此 WS 推送永远不会与该接口产生偏差。初始快照为实时状态（账户无资金时返回零值），而非空数组。

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

- 保证金标量（`account_value` / `free_collateral` / `maint_margin` / `init_margin` / `health`）为**整 USDC** 十进制字符串，与 REST 账户读取接口的 `MarginScalars` 完全一致；`tier` 为清算层级索引，`mode` 为账户默认模式，`pm_enabled` 表示是否开启组合保证金。
- `positions[]`——每个未平仓的永续合约仓位对应一条记录：`asset`（数字 ID）、`size`（有符号 1e8 精度字符串）、`entry` / `upnl`（整 USDC）、`isolated`、`lev`，以及对冲模式下的 `side`（`long` / `short`）。
- `balances`——`{usdc, spot}`：`usdc` 为报价品种抵押品（整 USDC）；`spot` 映射代币 → `{total, hold}`。

推送频率：变更驱动——仅当账户状态在上次提交后实际发生变化时才发送帧；本次提交该账户状态未变化时不发出任何帧。

:::warning
`account_state` 是账户级私有数据，但目前**没有任何认证机制**——任意连接均可订阅任意地址。在订阅认证门控功能上线之前，请勿将其视为私有频道。
:::

### `spot_state`

账户级**现货**清算所状态——某账户各代币的现货余额——有变更时推送。需要传入 `user`。初始快照为实时余额集（账户无现货持仓时为 `[]`）。

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

- `balances[]`——每个持有的现货代币对应一条记录：`asset`（数字 ID）、`name`（代币符号）、`total`（整代币十进制字符串）、`hold`（被现货挂单占用的锁定数量）。与 REST 现货余额读取接口完全一致。

推送频率：变更驱动——仅当现货余额在上次提交后实际发生变化时才发送帧；本次提交账户余额未变化时不发出任何帧。

### `web_data2`

账户级**综合**"前端所需的一切"快照——永续合约清算所汇总、现货余额、挂单、金库权益及全局交易所状态，合并在一帧中，有变更时推送。需要传入 `user`（0x 地址；也接受 `address`）——**不需要** `coin`。消息体与 REST [`web_data2`](../rest/info.md#web_data2) 接口的返回结果字节完全一致（两者组合自相同的子读取器），因此 WS 推送永远不会与该接口产生偏差。初始快照为实时综合数据（账户无资金 / 持仓 / 挂单时返回零值默认配置），而非空数组。

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

综合数据包含以下各节（每节均由对应子读取器组合而来，结构永远不会偏离独立接口）：

- `address`——帧所对应账户的规范化小写 0x 地址。
- `clearinghouse`——永续合约账户汇总：`account_value`（全仓账户价值，整 USDC 十进制字符串）、`margin_used`（各资产维持保证金之和，整 USDC），以及 `positions[]`。每个仓位行的格式为 `{asset, size, entry_ntl, mode, lev}`：`asset` 为数字市场 ID，`size` 为有符号 1e8 精度规模字符串（每条非零腿对应一行，因此对冲模式账户会上报两条腿），`entry_ntl` 为整 USDC，`mode` 可选值为 `cross` / `isolated` / `strict_iso`，`lev` 为仓位最大杠杆。规模为零的腿将被省略。
- `spot_balances`——来自 [`spot_state`](#spot_state) / REST `spot_clearinghouse_state` 的 `balances` 数组：每个持有现货代币对应一条记录，格式为 `{asset, name, total, hold}`。
- `open_orders`——来自 REST `frontend_open_orders` 的 `orders` 数组：每个挂单**及**每个已停放的 TP/SL / 止损触发单对应一条记录，格式为 `{oid, market_id, side, px, size, tif, cloid, trigger, inserted_at_ms}`。`side` 可选值为 `bid` / `ask`；`px` / `size` 为 1e8 精度十进制字符串；`tif` 可选值为 `alo` / `ioc` / `gtc`（已停放止损单为 `trigger`）；`cloid` 为客户端订单 ID 或 `null`；普通订单簿订单的 `trigger` 为 `null`，否则为 `{trigger_px, trigger_above}`（已停放止损单额外携带 `is_parked: true`）。
- `vault_equities`——来自 REST `user_vault_equities` 的 `equities` 数组：账户持有份额的每个金库对应一条记录，格式为 `{vault_id, vault_address, shares, equity}`（`equity` 为整 USDC，`shares` 为原始整数字符串）。账户未跟随任何金库时为空。
- `exchange_status`——全局交易状态标量（与 REST `exchange_status` 消息体相同）：`{spot_disabled, post_only_until_time_ms, post_only_until_height, scheduled_freeze_height, mip3_enabled, frozen, replay_complete}`。在同一次提交中，所有订阅者收到的该字段块完全一致。

推送频率：变更驱动——仅当综合数据在上次提交后实际发生变化时才发送帧；若本次提交该账户的综合数据未发生变化，则不发出任何帧。

:::warning
`web_data2` 是账户级私有数据，但目前**没有任何认证机制**——任意连接均可订阅任意地址。在订阅认证门控功能上线之前，请勿将其视为私有频道；如需进行已认证的读取操作，请使用 `post` 配合签名 action。
:::

---

## `post` — 通过 WS 进行请求/响应

这不是订阅频道，而是通过同一 WebSocket 连接发起一次性读取或已签名写入操作的方式。`request` 与 REST 路由相同的 `{type, payload}` 信封；请求会被分发至相同的处理器（`POST /info`、`POST /exchange`）。完整的请求/响应结构及签名规则请参阅 [WS 概述中的 `post`](./index.md#post-requestresponse-over-ws)。

```json
{ "method": "post", "id": 1, "request": { "type": "info", "payload": { "type": "l2_book", "coin": "BTC" } } }
```

这是目前通过 WS 进行已认证读取及提交签名 action 的标准路径。

---

## 路线图——尚未上线

以下频道出现在早期草稿中，但**尚未在节点 WS 接口上实现**。它们不是有效的频道名称；订阅时将返回 `unknown channel` 错误。此处列出是为了避免集成商被旧版 SDK 存根误导。

- **公开市场数据：** `meta`（市场元数据）、`mark`（标记/预言机价格）、`fundingTicks`（资金费率更新）。
- **按用户（需要认证）：** `vaultEvents`、`rfqEvents`。

此外，以下功能今日同样尚未实现：

- **基于差分的 `l2_book`**（增量 `updates` 帧）——当前 `l2_book` 始终发送完整的前 20 档消息体。帧确实携带 `is_snapshot` 标志（初始快照为 `true`，变更驱动推送为 `false`），但每次消息体均为完整快照——不存在增量差分的 `updates` 帧。
- **`seq` / `resume` / 续传令牌**——每次（重新）订阅均从全新快照开始。
- **私有频道的订阅时认证信封**——如需已认证操作，请使用 `post` 配合签名 action。

---

## 顺序与投递保证

- **按订阅**，帧按提交顺序到达（仅在被监听频道的状态发生变化的提交上才会发出帧）。不存在 `seq`；顺序由单一 socket 上的到达顺序隐式保证。
- **跨订阅**，不保证帧的到达顺序——交错顺序是任意的。请根据 `channel` 加 `data` 中的 `coin` 进行多路解复用。
- 投递保证为**每次变更至多一次**，且**不会为续传而缓冲**：若某订阅落后超过 256 帧，将以 `lagged` 错误帧断开（详见[背压与延迟](./index.md#backpressure--lag)）。重新订阅以恢复；届时将收到全新快照。

## 另请参阅

- [WS 概述](./index.md) — 连接生命周期、帧格式、coin 参数、`post`、背压机制
- [`POST /info`](../rest/info.md) — 一次性读取的 REST 等价接口（也可通过 `post` 访问）
- [`POST /exchange`](../rest/exchange.md) — `post` action 路径共用的签名 action 信封
