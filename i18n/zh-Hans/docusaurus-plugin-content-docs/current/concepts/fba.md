# 频繁批量拍卖（FBA）

:::info
**预览功能。** 各市场可通过 [MIP-3](../mip/mip-3.md) 单独选择启用；并非所有市场都运行 FBA。
:::

## 概述

FBA 将连续撮合替换为每隔 `batch_interval_ms` 执行一次的离散拍卖批次。同一批次内排队的订单在单一统一结算价格下同时成交。这从根本上消除了基于延迟的 MEV：快一微秒毫无优势。

## 连续撮合 vs 批量拍卖

| 属性 | 连续 CLOB | FBA |
|----------|-----------------|-----|
| 撮合节奏 | 每笔订单到达时 | 每隔 `batch_interval_ms` |
| 价格发现 | 逐笔成交 | 逐批次（单一结算价） |
| 延迟价值 | 高（同价位先到先得） | 批次内为零 |
| 延迟套利收益 | 被高频交易者截取 | 通过统一价格返还给参与者 |
| 订单公开可见性 | 成交前（挂单簿可见） | 批次结束前（队列可见） |

## 机制

```
batch t:        accept orders during [t, t + batch_interval_ms)
batch close t:  freeze the queue
                compute clearing price p*:
                  p* = price at which |aggregated buy demand| = |aggregated sell demand|
                fill all crossing orders at p*
                roll any non-crossing orders into batch t+1 (or cancel per TIF)
batch t+1:      open
```

结算规则：
- 所有报价 ≥ p* 的买单均以 p* 成交。
- 所有报价 ≤ p* 的卖单均以 p* 成交。
- 单一结算价 p* 使总成交量最大化（等价于在需求/供应曲线的交叉点处结算）。

同一批次内所有参与者的成交价格**统一**——不会因为下单晚了就以更差的价格成交。

## 适用场景

| 资产类别 | 默认模式 | 原因 |
|-------------|---------|-----|
| 主流永续合约（BTC、ETH） | 连续 CLOB | 流动性充足；延迟优势相对于买卖价差较小 |
| 长尾上架品种（MIP-3） | 可选 FBA | 订单簿较薄；高频交易毒性大于其提供的流动性 |
| 现货交易对 | 连续 CLOB | 行业惯例 |
| 指数 / 结构化产品 | FBA | 合成定价需要同步结算 |

每个市场的撮合模式可通过 [`market_info.fba_enabled`](../api/rest/info.md#market_info) 查看。启用 FBA 的市场同时接受 `FbaOrder`（直接指定批次）和 [`submit_order`](../api/rest/exchange.md#submit_order)（作为 FBA 订单处理，进入下一批次）。参见 [`/exchange` 操作目录](../api/rest/exchange.md#action-catalog)——`FbaOrder` 目前是已识别但尚未映射的占位类型。

## 批次间隔

默认值：1 秒（以 100 ms 出块时间计为 10 个区块）。由治理在 `market_info.fba_batch_interval_ms` 中按市场设定，典型范围为 100 ms 至 5 秒。

间隔越短，等待时间越少，但计算开销越大。1 秒的默认值在消除高频交易优势与用户体验之间取得平衡。

## 订单格式

```json
{
  "type": "FbaOrder",
  "params": {
    "asset":     42,
    "side":      "Buy",
    "px":  "10050000000",
    "size":   "100000000",
    "batch_id":  9876,
    "cloid":     "0x..."
  }
}
```

`batch_id` 指定订单加入的批次。当前批次 ID 可从 [`market_info`](../api/rest/info.md#market_info) 的 `fba_current_batch_id` 字段获取。`batch_id < current` 的订单会被拒绝（`{"error":"batch already closed"}`）；`batch_id` 大于当前值的订单会排入对应的未来批次。

省略 `batch_id` 则自动加入下一批次——服务端会选择当前正在接受订单的批次。

## 示例演算

批次 t 包含资产 42 的以下订单：

```
buys:
  bob:    5 @ 100.10
  alice:  3 @ 100.05
  carol:  2 @ 100.00

sells:
  dave:   3 @ 99.95
  eve:    4 @ 100.00
  frank:  2 @ 100.05
```

统计买方累计需求（各价格及以上的累计数量）：

```
buy-side  cumulative at price ≥ p:
  100.10:  5
  100.05:  5+3 = 8
  100.00:  8+2 = 10
  99.95:   10  (none here)
```

统计卖方累计供应（各价格及以下的累计数量）：

```
sell-side cumulative at price ≤ p:
  99.95:   3
  100.00:  3+4 = 7
  100.05:  7+2 = 9
  100.10:  9   (none here)
```

交叉点分析：p = 100.00 时，买方累计 = 10，卖方累计 = 7；p = 100.05 时，买方累计 = 8，卖方累计 = 9。交叉点位于 100.00 至 100.05 之间。

结算规则选取成交量最大的价格：

| p | min(buy, sell) |
|---|----------------|
| 99.95  | min(10, 3) = 3 |
| 100.00 | min(10, 7) = 7 |
| 100.05 | min(8, 9)  = 8 |
| 100.10 | min(5, 9)  = 5 |

最大成交量为 8，对应 `p* = 100.05`。因此：

- 报价 ≥ 100.05 的所有买单成交：bob（5）+ alice（3）= 8 BTC，均以 100.05 买入。
- 报价 ≤ 100.05 的所有卖单成交：dave（3）+ eve（4）+ frank（2）= 9 BTC 参与供应。按比例分配：8/9 = 88.9%，各方成交 → dave 2.67、eve 3.56、frank 1.78。
- Carol（买 2 @ 100.00）未能成交——滚入 t+1 批次或按 TIF 规则到期取消。

所有成交方均以 100.05 成交。Bob 不会因为"下单更早"而获得更好的价格——FBA 中不存在"更早"这一概念。

## 结算公平性

当 p* 处供大于求时，数量较多的一侧按**比例**分配成交——每位卖家获得相同的成交比例。超额供应方之间没有先进先出（FIFO）也没有价格优先（所有人的报价都已达到或优于 p*）。

这正是 FBA 的公平性保证：在结算价格上，所有参与者的成交条件完全一致。

## 边界情况

<details>
<summary>展开查看边界情况</summary>

- **空批次。** 无订单 → 不触发结算。下一批次立即开始。
- **单边批次。** 只有买单（或只有卖单）。不触发结算——所有订单滚入下一批次（Gtc）或取消（Ioc）。
- **结算价格并列。** 当两个价格同时使成交量最大时，协议选取更接近前一标记价的价格（减少标记价跳动的歧义）。
- **FBA 中的市价单。** 以极端价格作为 IOC 提交；参与当前批次，若可撮合则以 p* 成交。
- **FBA 中的只减仓单。** 在批次关闭时检查，依据同一批次内前序成交后的持仓状态判断。原子化清算。

</details>

## 时序示例

```
t=0.0s   batch_id = 9876 opens
t=0.2s   bob:    FbaOrder buy 5 @ 100.10, batch 9876
t=0.4s   alice:  FbaOrder buy 3 @ 100.05, batch 9876
t=0.5s   carol:  FbaOrder buy 2 @ 100.00, batch 9876
t=0.6s   dave:   FbaOrder sell 3 @ 99.95, batch 9876
t=0.7s   eve:    FbaOrder sell 4 @ 100.00, batch 9876
t=0.8s   frank:  FbaOrder sell 2 @ 100.05, batch 9876
t=1.0s   batch_id 9876 closes; clearing fires
         p* = 100.05; 8 BTC clears
         fills published on `trades` WS with batch_id and "kind":"fba"
t=1.0s   batch_id = 9877 opens
```

## 查询接口

实时 FBA 池状态及指示性结算价格通过节点 `/info` 只读路径的 [`fba_batch_state`](../api/rest/info.md#fba_batch_state) 接口获取——详细响应结构和字段说明请参见该条目。接口参数为 `market_id`（u32）。由于 FBA 是按市场选择启用的，未注册的市场**不会返回 404**——而是返回 200，但所有字段清零（`enabled:false`，`orders` 为空，`indicative:null`）。

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"fba_batch_state","market_id":42}'
```

```json
{
  "type": "fba_batch_state",
  "data": {
    "market_id":      42,
    "enabled":        true,
    "period_ms":      1000,
    "min_lot":        "1",
    "last_settle_ms": 1735689600000,
    "next_settle_ms": 1735689601000,
    "order_count":    11,
    "bid_count":      5,
    "ask_count":      6,
    "bid_size":       "1000000000",
    "ask_size":       "900000000",
    "orders":         [ /* {oid, owner, side, price, size, stp_group, submitted_at_ms} */ ],
    "indicative":     { "clearing_px": "10050000000", "matched_size": "800000000" }
  }
}
```

价格和数量均为**1e8 定点数**整数字符串（订单簿/订单平面的原始精度）。`next_settle_ms` 由 `last_settle_ms + period_ms` **推算得出**。`indicative` 字段是在当前窗口下，**下一**批次若立即关闭所得到的最大成交量对应的统一价格与匹配数量——仅为只读计算，尚未实际结算——当不存在可撮合订单（单边或空窗口）时为 `null`。即当前 p\* 的预估值，便于交易者判断是否值得向批次中补充订单。

## 相关文档

- [订单类型](./order-types.md)
- [`/exchange` 操作目录](../api/rest/exchange.md#action-catalog) — `FbaOrder`（目前为已识别但尚未映射的占位类型）
- [MIP-3](../mip/mip-3.md) — 市场在部署时选择启用 FBA
- [`market_info`](../api/rest/info.md#market_info) — 查看各市场的 `fba_enabled` 状态

## 常见问题

<details>
<summary>展开查看常见问题</summary>

**问：FBA 会影响价格发现吗？**
答：不会。在每个批次内，协议依然通过参与者的订单发现 `p*`。价格发现的过程是一样的，只是以固定节奏进行，而非连续进行。

**问：为什么选择 1 秒批次间隔而不是 100 ms？**
答：100 ms 太短，无法从实质意义上消除延迟优势——即便在 100 ms 内，处理速度更快的机器依然可以重新提交订单。1 秒的缓冲足以让物理网络延迟主导批次内部的延迟差异，从而消除高频交易的边际优势。

**问：FBA 市场和 CLOB 市场可以并存吗？**
答：可以——每个市场独立选择使用 FBA 或 CLOB。同一账户可以同时持有两种模式下的仓位。

**问：FBA 能降低撮合的 gas / 计算成本吗？**
答：大致相当。连续撮合每笔订单到达时做 O(1) 的工作；FBA 在批次关闭时做 O(N log N) 的计算。对于每批次 N 笔订单而言，FBA 的总开销相近，但优势在于每个区块的计算成本更可预测。

</details>
