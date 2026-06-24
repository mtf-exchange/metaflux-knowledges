---
description: Devnet/测试网测试水龙头 — 一次性发放测试 USDC + MTF。主网拒绝响应。
---

# `POST /faucet` — devnet/测试网测试资金

:::warning
**仅限 Devnet / 测试网。** 水龙头凭空铸造免费抵押品和现货代币。该接口**在主网上被结构性拒绝**（链 ID `8964`）：路由在主网上根本不会挂载。切勿在生产流程中依赖此接口。
:::

## 快速概览

每次 `POST /faucet` 请求可向任意地址发放 **3000 USDC** 跨账户抵押品**以及 10 MTF** 现货代币（代币 ID `104`）。**每个地址终身仅限一次。** 响应为 `"queued"` — 资金将在约 1 个区块后到账（以验证者系统动作的形式注入，非同步提交）。该接口作为 `POST /faucet` 挂载在网关入口，与原生的 `/info` 和 `/exchange` 默认路径并列提供服务。

## URL

```
POST  https://<net>-gateway.mtf.exchange/faucet
```

若自行运行节点，同一 `/faucet` 路由可直接通过 `http://localhost:8080` 访问。

| 环境 | 是否挂载 |
|-------|----------|
| Devnet（`31337`）/ 测试网（`114514`），水龙头已启用 | 是 |
| 主网（`8964`） | **否** — 路由从不挂载；误触将由防御性处理器守卫返回 `403` |
| 节点配置中水龙头已禁用 | 否 |

该路由仅在节点水龙头配置**启用且非主网**时才会被并入主 API 路由器。它拥有独立的处理器状态，从 `/exchange` 处理器树结构上无法访问到它。

## 请求

```json
{ "address": "0x00000000000000000000000000000000000ca11e" }
```

| 字段 | 类型 | 是否必填 | 说明 |
|-------|------|----------|-------------|
| `address` | `0x`-hex 20 字节地址 | 是 | 接收地址。接受 40 或 42 个字符（`0x` 前缀可选）。零地址会被拒绝。 |
| `amount` | uint64（整数 USDC） | 否 | 可选 USDC 发放量；**只能向下限制**，不超过配置的上限（3000）— 传入更大的值会被截断至 3000，不可超过上限。`0` 会被拒绝。MTF（10）为固定数量，不受影响。 |

```bash
curl -s -X POST https://devnet-gateway.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x00000000000000000000000000000000000ca11e"}'
```

## 响应

### `200 OK` — 已排队

```json
{
  "address": "0x00000000000000000000000000000000000ca11e",
  "usdc":    3000,
  "mtf":     10,
  "status":  "queued"
}
```

| 字段 | 类型 | 说明 |
|-------|------|-------------|
| `address` | `0x`-hex 字符串 | 回显的接收地址，已规范化为小写 |
| `usdc` | uint64 | 发放的 USDC 数量（整数，经向下截断后） |
| `mtf` | uint64 | 发放的 MTF 现货代币数量（整数，固定为 10） |
| `status` | `"queued"` | 资金已**暂存至下一个区块**，尚未提交 |

`"queued"` 是字面意思：发放操作为两个由验证者注入的系统动作（USDC 对应 `SystemUserModify{AdjustCrossAccountValue}`，MTF 对应 `SystemSpotSend`），会被预置到下一个待提议区块中。约 1 个区块后，可通过轮询 [`account_state`](./info.md#account_state)（或 [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state)）查看余额到账情况：

```json
// account_state after the credit commits:
{ "account_value": "3000", "balances": { "usdc": "3000", "spot": { "MTF": "10" } }, ... }
```

### 错误

| HTTP 状态码 | 响应体 | 原因 |
|------|------|-------|
| 400 | `{"error":"invalid address: <detail>"}` | `address` 不是合法的 `0x`-hex 地址（如长度不符） |
| 400 | `{"error":"zero address not allowed"}` | 接收地址为零地址 |
| 400 | `{"error":"amount must be positive"}` | 显式传入的 `amount` 为 `0` |
| 429 | `{"error":"address already funded"}` | 该地址已领取过（**终身仅限一次**，在节点生命周期内永久有效） |
| 429 | `{"error":"rate limit: this IP requested too recently"}` | 该来源 IP 在每 IP 冷却时间内已发起过请求（默认 1 次/分钟/IP） |
| 403 | `{"error":"faucet disabled on this network"}` | 防御性守卫触发（理论上不可到达 — 主网从不挂载该路由） |
| 503 | `{"error":"faucet backlog full; retry shortly"}` | 注入队列已满（瞬时背压，稍后重试） |

```json
// second claim for the same address:
{ "error": "address already funded" }   // HTTP 429
```

## 限制

- **每个地址终身仅限一次。** 通过内存集合追踪（节点重启后重置；Devnet 为临时环境）。同一地址的第二次请求 — 即使来自不同 IP、即使时隔很久 — 都会返回 `429 address already funded`。*被拒绝*的请求不会消耗终身配额。
- **按 IP 限流。** 默认每个来源 IP 每分钟最多 1 次请求。同一 IP 在时间窗口内使用不同地址请求，均会收到 `429 rate limit`。
- **USDC 上限。** 可选的 `amount` 参数只能向下限制；获得的 USDC 永远不会超过配置的 3000 上限。

## 为什么此接口不在 `/exchange` 上

水龙头的两个发放操作属于**系统/特权动作**（`SystemUserModify`、`SystemSpotSend`），凭空铸造抵押品和现货代币。这些操作属于系统动作 ID 范围，**从不**列入 `/exchange` 用户动作白名单。水龙头将它们加入一个**仅供验证者使用的独立注入队列**（而非公共内存池）；运行时将其像预言机数据一样排入区块载荷，并以节点自身的验证者地址作为发送方，以通过 `require_system_authority` 检查。公共用户内存池到该队列之间不存在任何代码路径。详见[不在 /exchange 上暴露系统动作](./exchange.md#non-bridged-actions)。

## 确定性边界

水龙头 HTTP 边缘层的所有逻辑均为非确定性的（挂钟时间 IP 限流、宿主本地的已领取集合）。唯一进入共识的数据是两个系统动作中的接收地址和金额，这些数据会流经不变的确定性处理器。宿主本地的限流状态和已领取集合状态永远不会被哈希进 AppHash。

## 参见

- [`POST /info`](./info.md) — 读取 `account_state` / `spot_clearinghouse_state` 以确认资金到账
- [`POST /exchange`](./exchange.md) — 用户动作写入路径（水龙头发放的系统动作永远不会经过此路径）
- [网络](../../networks.md) — 各网络的链 ID
