# 频繁批量拍卖（FBA）

:::info
**预览版。** 通过 [MIP-3](../mip/mip-3.md) 按市场选择使用；并非所有市场都运行 FBA。
:::

## 快速总结

FBA 用离散拍卖批次替代连续匹配，每 `batch_interval_ms` 执行一次。在一个批次内排队的订单在单一统一清算价格处同时成交。这消除了基于延迟的 MEV：快一微秒没有任何好处。

## 连续 vs 批量

| 属性 | 连续 CLOB | FBA |
|----------|-----------------|-----|
| 匹配节奏 | 每个订单到达时 | 每 `batch_interval_ms` |
| 价格发现 | 逐交易 | 逐批次（单一清算价格） |
| 延迟价值 | 高（先到达者在同价格处赢得） | 批次内为零 |
| 延迟产生的盈利 | 由 HFT 捕获 | 通过统一价格返还参与者 |
| 公开订单可见性 | 交易前（挂单簿） | 批次前（可见队列） |

## 机制

```
批次 t:        在 [t, t + batch_interval_ms) 内接收订单
批次关闭 t:    冻结队列
                计算清算价格 p*：
                  p* = 聚合买方需求量 = 聚合卖方需求量 的价格
                在 p* 处成交所有对手订单
                将任何未成交订单滚动到批次 t+1（或按 TIF 取消）
批次 t+1:      开始
```

清算规则：
- 所有买入价格 ≥ p* 的订单在 p* 处成交。
- 所有卖出价格 ≤ p* 的订单在 p* 处成交。
- 单一清算价格 p* 最大化成交总量（等价于沿需求/供应曲线到交点）。

成交价格在批次内的所有参与者中都是**统一的**——没有人因为晚到达而被成交在更差的价格。

## 何时使用 FBA

| 资产类别 | 默认 | 原因 |
|-------------|---------|-----|
| 主要永续合约（BTC、ETH） | 连续 CLOB | 流动性好；延迟优势相对于买卖价差很小 |
| 长尾上市（MIP-3） | 可选 FBA | 薄簿；HFT 毒性大于流动性提供 |
| 现货对 | 连续 CLOB | 惯例 |
| 指数/结构化产品 | FBA | 复合定价需要同步清算 |

每个市场的匹配模式在 [`market_info.fba_enabled`](../api/rest/info.md#market_info)。启用 FBA 的市场接受 `FbaOrder`（批次定向）和 [`submit_order`](../api/rest/exchange.md#submit_order)（对下一批次视为 FBA 订单）。参考 [`/exchange` 操作目录](../api/rest/exchange.md#action-catalog)—— `FbaOrder` 是公认但未映射的存根。

## 批次间隔

默认值：1 秒（100 毫秒区块时间下的 10 个区块）。治理在 `market_info.fba_batch_interval_ms` 中按市场设置。典型范围：100 毫秒–5 秒。

更快的间隔减少等待但增加计算成本。1 秒的默认值平衡 HFT 中立化和用户体验。

## 订单形状

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

`batch_id` 选择订单加入的批次。当前批次 id 在 [`market_info`](../api/rest/info.md#market_info) 中的 `fba_current_batch_id` 下。`batch_id < current` 的订单被拒绝（`{"error":"batch already closed"}`）；`batch_id` > current 的订单排队等待该未来批次。

省略 `batch_id` 将针对下一个批次——服务器选择当前接受订单的批次。

## 实际示例

批次 t 对资产 42 有以下订单：

```
买单：
  bob:    5 @ 100.10
  alice:  3 @ 100.05
  carol:  2 @ 100.00

卖单：
  dave:   3 @ 99.95
  eve:    4 @ 100.00
  frank:  2 @ 100.05
```

遍历需求（每个价格 ≥ 候选价的累积量）：

```
买方累积量于价格 ≥ p：
  100.10:  5
  100.05:  5+3 = 8
  100.00:  8+2 = 10
  99.95:   10  （此处无）
```

遍历供应（每个价格 ≤ 候选价的累积量）：

```
卖方累积量于价格 ≤ p：
  99.95:   3
  100.00:  3+4 = 7
  100.05:  7+2 = 9
  100.10:  9   （此处无）
```

交点：在 p = 100.00，买方累积量 = 10，卖方累积量 = 7。在 p = 100.05，买方累积量 = 8，卖方 = 9。交点在 100.00 和 100.05 之间。

清算规则最大化成交量：

| p | min(买, 卖) |
|---|----------------|
| 99.95  | min(10, 3) = 3 |
| 100.00 | min(10, 7) = 7 |
| 100.05 | min(8, 9)  = 8 |
| 100.10 | min(5, 9)  = 5 |

最大成交量是 8（在 `p* = 100.05`）。因此：

- 所有买单 ≥ 100.05 成交：bob (5) + alice (3) = 8 BTC 以 100.05 买入。
- 所有卖单 ≤ 100.05 成交：dave (3) + eve (4) + frank (2) = 9 BTC 挂价。按比例分配：8/9 = 88.9% 的每一个 → dave 2.67、eve 3.56、frank 1.78。
- Carol（买 2 @ 100.00）不成交——滚到 t+1 或按 TIF 过期。

所有成交者在 100.05 成交。Bob 不会因为"更早"而获得更差的价格——FBA 中没有更早。

## 清算中的公平性

当供应 > p* 处的需求时，较大的一方被**按比例**成交——每个卖方都获得相同的成交比例。买方中没有 FIFO，没有价格优先级（每个人已经在或优于 p*）。

这是 FBA 的公平性属性：在清算价格处，没有参与者获得比另一个更好的交易。

## 边界情况

<details>
<summary>显示边界情况</summary>

- **空批次。** 无订单 → 无清算事件。下一批次立即开始。
- **单边批次。** 仅买单（或仅卖单）。无清算——所有订单滚动到下一批次（Gtc）或取消（Ioc）。
- **清算时打平。** 当两个价格都最大化成交量时，协议选择更接近先前标记的价格（减少标记步长歧义）。
- **FBA 中的市场订单。** 以极端价格作为 IOC 提交；参与批次并在 p* 处成交（如果对手）。
- **FBA 中仅减少头寸。** 在批次关闭时检查，针对同一批次内先前成交后的头寸状态。原子清算。

</details>

## 时序

```
t=0.0s   batch_id = 9876 开始
t=0.2s   bob:    FbaOrder 买 5 @ 100.10，批次 9876
t=0.4s   alice:  FbaOrder 买 3 @ 100.05，批次 9876
t=0.5s   carol:  FbaOrder 买 2 @ 100.00，批次 9876
t=0.6s   dave:   FbaOrder 卖 3 @ 99.95，批次 9876
t=0.7s   eve:    FbaOrder 卖 4 @ 100.00，批次 9876
t=0.8s   frank:  FbaOrder 卖 2 @ 100.05，批次 9876
t=1.0s   批次 id 9876 关闭；清算触发
         p* = 100.05；8 BTC 成交
         成交在 `trades` WS 上发布，带 batch_id 和 "kind":"fba"
t=1.0s   批次 id = 9877 开始
```

## 查询

实时 FBA 池 + 指示清算通过 [`fba_batch_state`](../api/rest/info.md#fba_batch_state) 在节点 `/info` 读路径上暴露——参考该条目以了解完整响应形状和字段表。它接收 `market_id` (u32)。FBA 是按市场选择，所以未注册的市场**不是 404**——它返回 200，字段为零（`enabled:false`、空 `orders`、`indicative:null`）。

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

价格/大小是原始 **1e8 定点** 整数字符串（簿/订单平面）。`next_settle_ms` **派生自** `last_settle_ms + period_ms`。`indicative` 块是体积最大化统一价格 + 匹配大小，**下一个**批次会*否则*清算给定当前窗口——只读计算，尚未结算——当无交叉时为 `null`（单边或空窗口）。这是如果批次现在关闭 p\* 会是什么，对决定是否添加到批次的交易者有用。

## 另见

- [订单类型](./order-types.md)
- [`/exchange` 操作目录](../api/rest/exchange.md#action-catalog)—— `FbaOrder`（公认但未映射的存根）
- [MIP-3](../mip/mip-3.md)——市场在部署时选择使用 FBA
- [`market_info`](../api/rest/info.md#market_info)——检查每个市场的 `fba_enabled`

## 常见问题

<details>
<summary>显示常见问题</summary>

**问：FBA 不是放弃了价格发现吗？**
答：不是——在批次内协议仍然从参与者的订单中发现 `p*`。发现以固定节奏而不是连续地发生。

**问：为什么是 1 秒批次而不是 100 毫秒？**
答：100 毫秒太紧以至于不能以任何有意义的方式中立化延迟——即使在 100 毫秒内，更快的机器也能重新提交。1 秒提供足够的缓冲，使物理网络延迟在批次内延迟中占主导地位，消除 HFT 优势。

**问：FBA 市场能与 CLOB 市场共存吗？**
答：可以——每个市场独立地是 FBA 或 CLOB。一个账户可以同时持有两者的头寸。

**问：FBA 会降低匹配的 gas/计算成本吗？**
答：大致会。连续匹配对每个到达做 O(1) 工作；FBA 在批次关闭时做 O(N log N)。对于每个批次 N 个订单，FBA 是可比的，优势是更可预测的每块成本。

</details>
