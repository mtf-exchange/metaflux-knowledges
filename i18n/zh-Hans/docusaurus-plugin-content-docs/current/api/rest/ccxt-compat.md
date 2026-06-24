# CCXT 兼容 REST 接口

:::info
**预览版。** 目前已挂载 **9 个 REST 方法子集**，每个方法均返回与 [CCXT](https://docs.ccxt.com/) 统一格式完全一致的响应体。**Symbol 解析、市场查询和 JWT 鉴权均已真实生效**；货币字段（`"0.0"` / 空数组 / `0` id）为占位存根，待网关 → 节点读取回传通道上线后将填入真实数据。CCXT Pro（WebSocket）正在规划中。
:::

## 快速概览

对于已集成 CCXT 协议的量化框架，只需将交易所 base URL 指向 MetaFlux 网关即可。已支持方法的响应格式与 CCXT 预期完全匹配。如果你已有 CCXT 集成，直接使用本接口；若是新客户端，建议从 [HL 兼容接口](./hl-compat.md) 或 [MTF 原生接口](./exchange.md) 开始。

与 [HL 兼容接口](./hl-compat.md) 类似，本接口**仅运行在网关层**——它将 MTF 原生节点数据转换为 CCXT 统一格式。节点本身采用 MTF 原生协议（参见 [`/info`](./info.md)）；CCXT 格式不会透传至节点。

## URL

```
https://<gateway>/ccxt/<path>
```

所有 CCXT 路由均挂载在 `/ccxt/` 前缀下（与 MTF 原生默认接口 `/info` + `/exchange` 及 HL 兼容接口 `/hl/*` 相互隔离）。不带前缀的请求（如 `/markets`）将返回 404——该前缀是必要的。

## CCXT 方法 → 路由 → MTF 原生节点读取

以下是目前已上线的 9 个 REST 方法及鉴权引导接口。**转换方向**为：CCXT 统一格式 ← MTF 原生节点数据，包括：snake_case → CCXT camelCase、`u32` 市场 id → CCXT `BASE/QUOTE:SETTLE` symbol、整数量级 → 十进制字符串。

| CCXT 方法 | 路由 | 鉴权 | 状态 | 节点 MTF 原生来源 |
|------------|------|------|------|-------------------|
| `fetchMarkets` | `GET /ccxt/markets` | 否 | 格式已生效；静态创世固定数据 | [`markets`](./info.md#markets) |
| `fetchTicker` | `GET /ccxt/ticker?symbol=` | 否 | 格式已生效；价格为占位存根 | [`market_info`](./info.md#market_info) + 中间价 |
| `fetchOrderBook` | `GET /ccxt/orderbook?symbol=&limit=` | 否 | 格式已生效；订单簿为空 | [`l2_book`](./info.md#l2_book) |
| `fetchOHLCV` | `GET /ccxt/ohlcv?symbol=&timeframe=&since=&limit=` | 否 | 暂未提供 | OHLCV 历史——网关索引器（规划中） |
| `createOrder` | `POST /ccxt/orders` | Bearer | 格式已生效 | → [`/exchange`](./exchange.md) |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` | Bearer | 格式已生效 | → [`/exchange`](./exchange.md) |
| `fetchBalance` | `GET /ccxt/balance` | Bearer | 格式已生效；余额为占位存根 | [`account_state`](./info.md#account_state) |
| `fetchPositions` | `GET /ccxt/positions` | Bearer | 格式已生效；持仓为占位存根 | [`account_state`](./info.md#account_state) |
| `fetchMyTrades` | `GET /ccxt/my-trades?symbol=` | Bearer | 节点数据已接入；格式已生效 | [`user_fills`](./info.md#user_fills) |
| — 鉴权引导 — | `POST /ccxt/auth` | 否 | 已上线 | EIP-712 登录 → JWT |

图例：**格式已生效** = 路由已挂载，返回 CCXT 正确格式，货币字段为占位存根，待读取回传通道上线 · **节点数据已接入** = 底层节点读取已正常运行 · **暂未提供** = 尚无节点数据支撑，由网关索引器提供（规划中）。

:::warning
**接口功能有意保持精简。** CCXT 定义但网关尚未挂载的方法——`fetchTickers`、`fetchTrades`（公开成交记录）、`fetchOrder`、`fetchOpenOrders`、`fetchClosedOrders`、`fetchOHLCV`（超出存根范围）、`setLeverage`、`setMarginMode`、`fetchFundingRate`、`cancelAllOrders`——均返回 404。随着读取回传通道的扩展，这些方法将陆续挂载到 `/ccxt/` 下。`fetchOpenOrders` / `fetchOrder` 将从节点 [`open_orders`](./info.md#open_orders) / [`order_status`](./info.md#order_status) 读取数据转换而来；`fetchTrades` 将从节点 [`recent_trades`](./info.md#recent_trades) 成交记录转换而来；`fetchOHLCV` / `fetchClosedOrders` 暂未提供（网关索引器规划中）。
:::

## Symbol 格式

CCXT 使用 `"BASE/QUOTE:SETTLE"` 表示衍生品。MetaFlux 永续合约市场的格式如下：

```
BTC/USDC:USDC      # perpetual, settled in USDC
ETH/USDC:USDC
```

现货市场（待现货品种上线后）使用 `"BASE/QUOTE"` 格式，不带 `:SETTLE` 后缀。目前市场注册表为**静态创世固定数据**（`with_genesis_markets`——即创世永续合约品种）；待读取回传通道上线后，将替换为从节点 [`markets`](./info.md#markets) 实时刷新的 gRPC 驱动注册表。Symbol 解析**真实有效**：格式错误的 symbol → 返回 400，未知 symbol → 返回 400。

## 时间周期

`fetchOHLCV` 支持 CCXT 标准时间周期标识：`"1m"`、`"5m"`、`"15m"`、`"30m"`、`"1h"`、`"4h"`、`"1d"`、`"1w"`。无效时间周期返回 400。OHLCV 历史数据暂未提供——目前返回格式正确的空数据（网关索引器规划中）；如需实时数据，请使用 WebSocket [`candle`](../ws/subscriptions.md) 频道。

## 鉴权

需要鉴权的方法（`createOrder`、`cancelOrder`、`fetchBalance`、`fetchPositions`、`fetchMyTrades`）须携带 **JWT Bearer 令牌**。目前**仅支持一种**鉴权方式——通过 EIP-712 登录信封铸造的 JWT。（不支持 HMAC `X-API-KEY` 方式。）

### 1. 登录——`POST /ccxt/auth`

提交经 EIP-712 签名的登录信封，获取会话 JWT。该信封结构与节点的 `SignedEnvelope` 一致——网关基于 `(address, nonce, expiry)` 重新推导 EIP-712 摘要并验证签名，然后铸造一个以地址为 `sub` 的 HS256 JWT。

```bash
curl -X POST https://gateway/ccxt/auth \
  -H 'content-type: application/json' \
  -d '{
    "address":   "0x<addr>",
    "nonce":     1735689600000,
    "expiry":    1735689660000,
    "signature": "<base64 65-byte r||s||v>"
  }'
```

```json
{ "token": "<jwt>", "expiresAt": 1735693200 }
```

| 信封字段 | 类型 | 说明 |
|----------|------|------|
| `address` | `0x` hex | 发起登录的 EVM 地址 |
| `nonce` | u64 | 防重放随机数（在节点层校验；JWT 为会话令牌） |
| `expiry` | u64 ms | 超过此时间戳后信封将被拒绝 |
| `signature` | base64 | 65 字节的 `r‖s‖v`（EVM 惯例），经 base64 编码 |

EIP-712 摘要的构造方法请参见[签名流程说明](../../integration/signing.md)。

### 2. 调用——`Authorization: Bearer <jwt>`

```bash
curl https://gateway/ccxt/balance -H "Authorization: Bearer $TOKEN"
```

缺失、已过期或签名错误的令牌将被拒绝，返回 `401`。JWT 的 `sub` 地址将所有经鉴权的读写操作限定在该账户范围内。

## 示例

### 查询市场列表

```bash
curl https://gateway/ccxt/markets
```

```json
[
  {
    "id":           "BTC-PERP",
    "symbol":       "BTC/USDC:USDC",
    "base":         "BTC",
    "quote":        "USDC",
    "settle":       "USDC",
    "type":         "swap",
    "swap":         true,
    "spot":         false,
    "linear":       true,
    "contract":     true,
    "contractSize": 1,
    "precision":    { "price": 8, "amount": 8 },
    "limits":       { "amount": { "min": 0.0001 }, "price": { "min": 0.01 } },
    "maker":        0.0002,
    "taker":        0.0005,
    "active":       true
  }
]
```

### 查询行情

```bash
curl 'https://gateway/ccxt/ticker?symbol=BTC/USDC:USDC'
```

```json
{
  "symbol":      "BTC/USDC:USDC",
  "bid":         "0.0",
  "ask":         "0.0",
  "last":        "0.0",
  "high":        "0.0",
  "low":         "0.0",
  "open":        "0.0",
  "close":       "0.0",
  "baseVolume":  "0.0",
  "quoteVolume": "0.0"
}
```

货币字段目前均为 `"0.0"` 占位存根；读取回传通道上线后，将从节点中间价 / [`market_info`](./info.md#market_info) 填入真实数据。CCXT 格式字节级正确，客户端现在即可正常反序列化，后续获取真实数值时无需任何改动。

### 查询订单簿

```bash
curl 'https://gateway/ccxt/orderbook?symbol=BTC/USDC:USDC&limit=50'
```

```json
{ "symbol": "BTC/USDC:USDC", "bids": [], "asks": [], "timestamp": 0, "nonce": 0 }
```

`bids` / `asks` 为 `[[price, amount], …]` 数组（CCXT 格式）。从 [`l2_book`](./info.md#l2_book) 获取真实深度数据后，`limit` 截断将自动生效。

### 下单

```bash
curl -X POST https://gateway/ccxt/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "symbol": "BTC/USDC:USDC",
    "type":   "limit",
    "side":   "buy",
    "amount": "1.0",
    "price":  "100.5",
    "params": { "timeInForce": "GTC", "reduceOnly": false }
  }'
```

响应（CCXT 订单对象）：

```json
{
  "id":            "12345",
  "clientOrderId": null,
  "symbol":        "BTC/USDC:USDC",
  "type":          "limit",
  "side":          "buy",
  "price":         100.5,
  "amount":        1.0,
  "filled":        0.0,
  "remaining":     1.0,
  "status":        "open",
  "timestamp":     1735689600000,
  "fee":           { "currency": "USDC", "cost": 0.0 },
  "info":          { /* raw chain response */ }
}
```

`createOrder` 将 CCXT 订单转换为 [`/exchange`](./exchange.md) 写入请求，提交到 JWT `sub` 对应的账户。

### 撤单

```bash
curl -X DELETE https://gateway/ccxt/orders/12345 -H "Authorization: Bearer $TOKEN"
```

## 错误处理

CCXT 兼容接口返回标准 HTTP 状态码（而非 HL 的 200 + `status` 字段惯例），错误响应体采用 CCXT 命名规范，便于客户端 SDK 路由至正确的异常类：

| HTTP 状态码 | 响应体 | 原因 |
|-------------|--------|------|
| 400 | `{"error":"<message>"}` | Symbol 格式错误/未知、参数无效、时间周期无效 |
| 401 | `{"error":"<message>"}` | Bearer 令牌缺失、已过期或签名错误 |
| 404 | — | 未知路由 / 未带前缀的路径 / 未挂载的方法 |

## CCXT Pro（WebSocket）——规划中

WebSocket 升级通道（`GET /ccxt/ws`）已搭建脚手架，计划覆盖 5 个频道，与 REST 接口对应：

- `watchTicker` ← `/ws bbo` + `/ws mark`
- `watchOrderBook` ← `/ws l2Book`
- `watchTrades` ← `/ws trades`
- `watchOHLCV` ← `/ws candle`
- `watchMyTrades` ← `/ws userFills`

底层频道详情请参见 [WebSocket 订阅](../ws/subscriptions.md)——CCXT Pro 对这些频道进行一一对应的转换。

## 与完整 CCXT 规范的差异

- **货币字段为占位存根**（`"0.0"` / 空数组 / `0` id）：在网关 → 节点读取回传通道上线前，所有"格式已生效"方法的数值均为占位数据。格式已定型，仅数值尚待填入。
- **`fetchMyTrades`** 已接入节点数据（账户维度的成交记录）。**OHLCV 历史**（`fetchOHLCV`）及未来的 `fetchClosedOrders` 暂未提供——计划由网关索引器支撑（规划中）。过渡期间请使用 WebSocket [`candle`](../ws/subscriptions.md) / [`userFills`](../ws/subscriptions.md) 频道获取实时数据。
- **不支持 HMAC API 密钥鉴权。** 仅支持上述 EIP-712 → JWT 方案。客户端自行保管密钥——网关不托管任何私密信息。

## 参见

- [HL 兼容接口](./hl-compat.md)——另一个兼容接口
- [`POST /exchange`](./exchange.md) · [`POST /info`](./info.md)——MTF 原生接口（本接口的数据来源）
- [WebSocket 订阅](../ws/subscriptions.md)——CCXT Pro 底层实现
- [签名流程说明](../../integration/signing.md)——EIP-712 登录信封
- [频率限制](../rate-limits.md)
