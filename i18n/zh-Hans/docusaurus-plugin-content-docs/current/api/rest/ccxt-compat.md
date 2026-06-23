# CCXT 兼容 REST 接口

:::info
**预览版。** 目前挂载了 **9 个 REST 方法子集**，每个都返回完全相同的 [CCXT](https://docs.ccxt.com/) 统一形式。**符号解析、市场查询和 JWT 认证是真实的**；货币字段被填充为占位符（`"0.0"` / 空数组 / `0` id），直到网关 → 节点读回传完成。CCXT Pro（WebSocket）即将推出。
:::

## TL;DR

对于已经支持 CCXT 协议的量化框架，只需将交易所的基础 URL 指向 MetaFlux 的网关。协议形式与 CCXT 对支持的方法的预期相匹配。如果你已经有 CCXT 集成，可以使用此服务；对于新客户端，请从 [HL-compat](./hl-compat.md) 或 [MTF-native](./exchange.md) 开始。

与 [HL-compat](./hl-compat.md) 类似，此接口 **仅在网关上** — 它将 MTF 原生节点读取转换为 CCXT 的统一形式。节点本身是 MTF 原生的（参见 [`/info`](./info.md)）；CCXT 形式永远不会接触节点。

## URL

```
https://<gateway>/ccxt/<path>
```

所有 CCXT 路由都挂载在 `/ccxt/` 前缀下（与 MTF 原生默认的 `/info` + `/exchange` 接口和 HL-compat 的 `/hl/*` 接口区分）。对未加前缀的路径（`/markets`）的请求返回 404 — 前缀是必需的。

## CCXT 方法 → 路由 → MTF 原生节点读取

今天发布的 9 个 REST 方法，加上认证引导。**转换**是 CCXT 统一形式 ← 节点 MTF 原生：snake_case → CCXT camelCase，`u32` 市场 id → CCXT `BASE/QUOTE:SETTLE` 符号，整数幅度 → 十进制字符串。

| CCXT 方法 | 路由 | 认证 | 状态 | 节点 MTF 原生来源 |
|-------------|-------|------|--------|------------------------|
| `fetchMarkets` | `GET /ccxt/markets` | 否 | 形式已上线；静态创世夹具 | [`markets`](./info.md#markets) |
| `fetchTicker` | `GET /ccxt/ticker?symbol=` | 否 | 形式已上线；价格已填充 | [`market_info`](./info.md#market_info) + mid |
| `fetchOrderBook` | `GET /ccxt/orderbook?symbol=&limit=` | 否 | 形式已上线；空订单簿 | [`l2_book`](./info.md#l2_book) |
| `fetchOHLCV` | `GET /ccxt/ohlcv?symbol=&timeframe=&since=&limit=` | 否 | 未提供 | OHLCV 历史 — 网关索引器（路线图） |
| `createOrder` | `POST /ccxt/orders` | Bearer | 形式已上线 | → [`/exchange`](./exchange.md) |
| `cancelOrder` | `DELETE /ccxt/orders/{id}` | Bearer | 形式已上线 | → [`/exchange`](./exchange.md) |
| `fetchBalance` | `GET /ccxt/balance` | Bearer | 形式已上线；余额已填充 | [`account_state`](./info.md#account_state) |
| `fetchPositions` | `GET /ccxt/positions` | Bearer | 形式已上线；头寸已填充 | [`account_state`](./info.md#account_state) |
| `fetchMyTrades` | `GET /ccxt/my-trades?symbol=` | Bearer | 节点支持；形式已上线 | [`user_fills`](./info.md#user_fills) |
| — 认证引导 — | `POST /ccxt/auth` | 否 | 真实 | EIP-712 登录 → JWT |

说明：**形式已上线** = 路由已挂载，返回 CCXT 正确的形式，货币字段是占位符等待读回传 · **节点支持** = 基础节点读取已上线 · 未提供 = 尚无节点支持，由网关索引器提供（路线图）。

:::warning
**接口刻意最小化。** CCXT 定义但网关 **尚未** 挂载的方法 — `fetchTickers`、`fetchTrades`（公共成交记录）、`fetchOrder`、`fetchOpenOrders`、`fetchClosedOrders`、`fetchOHLCV` 超过存根、`setLeverage`、`setMarginMode`、`fetchFundingRate`、`cancelAllOrders` — 返回 404。随着读回传的扩展，它们将在 `/ccxt/` 下挂载。`fetchOpenOrders` / `fetchOrder` 将从节点 [`open_orders`](./info.md#open_orders) / [`order_status`](./info.md#order_status) 读取转换；`fetchTrades` 将从节点 [`recent_trades`](./info.md#recent_trades) 成交记录转换；`fetchOHLCV` / `fetchClosedOrders` 尚未提供（网关索引器路线图）。
:::

## 符号格式

CCXT 对衍生品使用 `"BASE/QUOTE:SETTLE"`。MetaFlux 永续市场呈现为：

```
BTC/USDC:USDC      # perpetual, settled in USDC
ETH/USDC:USDC
```

现货市场（一旦现货宇宙推出）使用 `"BASE/QUOTE"`，不带 `:SETTLE` 后缀。市场注册表目前是 **静态创世夹具**（`with_genesis_markets` — 创世永续）；带有 gRPC 的注册表将从节点的 [`markets`](./info.md#markets) 读取刷新，在读回传时交换。符号解析是 **真实的**：格式错误的符号 → 400，未知符号 → 400。

## 时间周期

`fetchOHLCV` 接受 CCXT 的标准代币：`"1m"`、`"5m"`、`"15m"`、`"30m"`、`"1h"`、`"4h"`、`"1d"`、`"1w"`。无效的时间周期返回 400。OHLCV 历史尚未提供 — 形式正确但空（网关索引器路线图）；同时使用 WebSocket [`candle`](../ws/subscriptions.md) 频道获取实时数据。

## 认证

认证方法（`createOrder`、`cancelOrder`、`fetchBalance`、`fetchPositions`、`fetchMyTrades`）需要 **JWT Bearer 令牌**。只有 **一种** 认证方案 — 从 EIP-712 登录信封生成的 JWT。（没有 HMAC `X-API-KEY` 方案。）

### 1. 登录 — `POST /ccxt/auth`

发送 EIP-712 签名的登录信封；接收会话 JWT。信封镜像节点的 `SignedEnvelope` — 网关在 `(address, nonce, expiry)` 上重新推导 EIP-712 摘要并验证签名，然后生成 HS256 JWT，其 `sub` 是地址。

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
|----------------|------|-------|
| `address` | `0x` hex | 声称登录的 EVM 地址 |
| `nonce` | u64 | 重放保护随机数（在节点层验证；JWT 是会话令牌） |
| `expiry` | u64 ms | 超过此时间信封被拒绝 |
| `signature` | base64 | 65 字节 `r‖s‖v`（EVM 约定），base64 编码 |

参见 [签名演练](../../integration/signing.md) 了解 EIP-712 摘要构造。

### 2. 调用 — `Authorization: Bearer <jwt>`

```bash
curl https://gateway/ccxt/balance -H "Authorization: Bearer $TOKEN"
```

缺失 / 过期 / 签名错误的令牌被拒绝为 `401`。JWT 的 `sub` 地址将每次认证读/写都限定到该账户。

## 示例

### 获取市场

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

### 获取行情

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

货币字段目前是 `"0.0"` 占位符；读回传从节点 mid / [`market_info`](./info.md#market_info) 填充它们。CCXT 形式是字节正确的，所以客户端现在可以干净地反序列化，稍后透明地获得实数。

### 获取订单簿

```bash
curl 'https://gateway/ccxt/orderbook?symbol=BTC/USDC:USDC&limit=50'
```

```json
{ "symbol": "BTC/USDC:USDC", "bids": [], "asks": [], "timestamp": 0, "nonce": 0 }
```

`bids` / `asks` 是 `[[price, amount], …]` 数组（CCXT 形式）。一旦从 [`l2_book`](./info.md#l2_book) 获得真实水平，`limit` 截断就会应用。

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

`createOrder` 将 CCXT 订单转换为 JWT 的 `sub` 账户下的 [`/exchange`](./exchange.md) 写入。

### 取消订单

```bash
curl -X DELETE https://gateway/ccxt/orders/12345 -H "Authorization: Bearer $TOKEN"
```

## 错误

CCXT 兼容返回适当的 HTTP 状态码（不是 HL 的 200-with-`status` 约定），带有 CCXT 命名的错误体，以便客户端 SDK 将它们路由到正确的异常类：

| HTTP | 正文 | 原因 |
|------|------|-------|
| 400 | `{"error":"<message>"}` | 格式错误/未知符号、错误的参数、错误的时间周期 |
| 401 | `{"error":"<message>"}` | 缺失 / 过期 / 签名错误的 Bearer 令牌 |
| 404 | — | 未知路由 / 未加前缀的路径 / 未挂载的方法 |

## CCXT Pro（WebSocket）— 计划中

5 频道 WebSocket 升级（`GET /ccxt/ws`）已搭建框架；完整覆盖镜像 REST：

- `watchTicker` ← `/ws bbo` + `/ws mark`
- `watchOrderBook` ← `/ws l2Book`
- `watchTrades` ← `/ws trades`
- `watchOHLCV` ← `/ws candle`
- `watchMyTrades` ← `/ws userFills`

参见 [WebSocket 订阅](../ws/subscriptions.md) 了解基础频道 — CCXT Pro 逐一转换这些。

## 与完整 CCXT 规范的限制

- **货币字段是占位符**（`"0.0"` / 空数组 / `0` id）在每个形式已上线的方法上，直到网关 → 节点读回传完成。形式是最终的；只有值是待定的。
- **`fetchMyTrades`** 现在由节点支持（提交的每账户成交记录）。**OHLCV 历史**（`fetchOHLCV`）和未来的 `fetchClosedOrders` 尚未提供 — 计划用于网关索引器（路线图）。同时使用 WebSocket [`candle`](../ws/subscriptions.md) / [`userFills`](../ws/subscriptions.md) 频道获取实时数据。
- **没有 HMAC API 密钥认证。** 仅上述 EIP-712 → JWT 方案。客户端保持密钥保管 — 网关不托管任何秘密。

## 另见

- [HL-compat](./hl-compat.md) — 另一个兼容接口
- [`POST /exchange`](./exchange.md) · [`POST /info`](./info.md) — MTF 原生（这些转换的来源）
- [WebSocket 订阅](../ws/subscriptions.md) — CCXT Pro 基础
- [签名演练](../../integration/signing.md) — EIP-712 登录信封
- [速率限制](../rate-limits.md)
