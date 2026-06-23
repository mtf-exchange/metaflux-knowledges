---
description: Devnet/testnet 测试水龙头 — 一次性授予测试 USDC + MTF。在主网上拒绝。
---

# `POST /faucet` — devnet/testnet 测试资金

:::warning
**仅限 Devnet / testnet。** 水龙头无中生有地铸造自由抵押品 + 现货代币。在主网上**结构性拒绝**（链 ID `8964`）：该路由在主网上根本不被挂载。不要在生产流程中依赖它。
:::

## 摘要

一次 `POST /faucet` 声明向任意地址授予 **3000 USDC** 跨抵押品 **和 10 MTF** 现货代币（代币 ID `104`）。**每个地址仅一次。** 响应为 `"queued"` — 信用额在约 1 个区块后到达（它们被注入为验证器系统操作，不是同步提交）。在网关前门上以 `POST /faucet` 方式提供，与原生 `/info` + `/exchange` 默认路径并存。

## URL

```
POST  https://<net>-gateway.mtf.exchange/faucet
```

自行运行节点时，相同的 `/faucet` 路由直接在 `http://localhost:8080` 处提供。

| 位置 | 已挂载？ |
|-------|----------|
| Devnet (`31337`) / testnet (`114514`)，水龙头已启用 | 是 |
| 主网 (`8964`) | **否** — 路由未被挂载；错误的请求从防御性处理程序守卫获得 `403` |
| 节点配置中水龙头已禁用 | 否 |

该路由仅在节点的水龙头配置**启用且不在主网上**时才被合并到主 API 路由器中。它持有自己的处理程序状态，在结构上无法从 `/exchange` 处理程序树访问。

## 请求

```json
{ "address": "0x00000000000000000000000000000000000ca11e" }
```

| 字段 | 类型 | 必需 | 描述 |
|-------|------|----------|-------------|
| `address` | `0x` 十六进制 20 字节地址 | 是 | 接收者。接受 40 或 42 个字符（`0x` 可选）。零地址被拒绝。 |
| `amount` | uint64（整数 USDC） | 否 | 可选的 USDC 授予；**向下限制**为配置的最大值 (3000) — 更大的值钳制为 3000，永远不会更高。`0` 被拒绝。MTF（10）固定不变。 |

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

| 字段 | 类型 | 描述 |
|-------|------|-------------|
| `address` | `0x` 十六进制字符串 | 回显的接收者，规范化为小写 |
| `usdc` | uint64 | 授予的 USDC（整数，在任何向下限制后） |
| `mtf` | uint64 | 授予的 MTF 现货代币（整数，固定为 10） |
| `status` | `"queued"` | 信用额**已暂存以用于下一个区块**，尚未提交 |

`"queued"` 是字面意思：授予是两个验证器注入的系统操作
（`SystemUserModify{AdjustCrossAccountValue}` 用于 USDC + `SystemSpotSend` 用于 MTF）
预先添加到下一个提议的区块中。在约 1 个区块后轮询 [`account_state`](./info.md#account_state)
（或 [`spot_clearinghouse_state`](./info.md#spot_clearinghouse_state)）以查看余额：

```json
// 信用提交后的 account_state：
{ "account_value": "3000", "balances": { "usdc": "3000", "spot": { "MTF": "10" } }, ... }
```

### 错误

| HTTP | 正文 | 原因 |
|------|------|-------|
| 400 | `{"error":"invalid address: <detail>"}` | `address` 不是有效的 `0x` 十六进制（例如长度错误） |
| 400 | `{"error":"zero address not allowed"}` | 接收者是零地址 |
| 400 | `{"error":"amount must be positive"}` | 显式 `amount` 为 `0` |
| 429 | `{"error":"address already funded"}` | 此地址之前已声明过（**仅一次**，对节点的生命周期永久） |
| 429 | `{"error":"rate limit: this IP requested too recently"}` | 源 IP 在每 IP 冷却时间内声明过（默认 1/分钟/IP） |
| 403 | `{"error":"faucet disabled on this network"}` | 防御性守卫（应该无法访问 — 主网根本不挂载该路由） |
| 503 | `{"error":"faucet backlog full; retry shortly"}` | 注入队列饱和（瞬间背压；请重试） |

```json
// 同一地址的第二次声明：
{ "error": "address already funded" }   // HTTP 429
```

## 限制

- **每个地址仅一次。** 在内存中集合中跟踪（节点重启时重置；devnet 是临时的）。同一地址的第二次声明 — 即使来自不同的 IP，即使间隔很久 — 返回 `429 address already funded`。一个*被拒绝的*请求不会消耗一次性槽位。
- **每 IP 节流。** 默认 1 个请求 / 分钟 / 源 IP。来自同一 IP 的不同地址在时间窗口内获得 `429 rate limit`。
- **USDC 限制。** 可选的 `amount` 仅向下限制；你永远不能获得超过配置的 3000 USDC。

## 为什么这不在 `/exchange` 上

水龙头的两个信用额是**系统 / 特权操作**
（`SystemUserModify`、`SystemSpotSend`）— 无中生有地铸造抵押品和现货。这些在系统操作 ID 范围内，**永远不是** `/exchange` 用户操作允许列表的一部分。水龙头将它们入队到一个**单独的仅验证器注入队列**（不是公共内存池）；运行时将其拖入区块有效负载中，就像预言机馈送一样，使用节点自己的验证器地址作为发送者，以便 `require_system_authority` 检查准许它们。从公共用户内存池到此队列没有代码路径。参见
[从不在 /exchange 上公开系统操作](./exchange.md#non-bridged-actions)。

## 确定性边界

水龙头 HTTP 边缘中的所有内容都是非确定性的（挂钟 IP 节流，主机本地已声明集合）。唯一跨越到共识的值是两个系统操作中的接收者 + 金额，它们通过未更改的确定性处理程序流动。主机本地速率限制 / 已声明集合状态从不哈希到 AppHash 中。

## 另请参见

- [`POST /info`](./info.md) — 读取 `account_state` / `spot_clearinghouse_state` 以确认信用额
- [`POST /exchange`](./exchange.md) — 用户操作写入路径（类似水龙头信用额的系统操作永远不会通过它）
- [网络](../../networks.md) — 每个网络的链 ID
