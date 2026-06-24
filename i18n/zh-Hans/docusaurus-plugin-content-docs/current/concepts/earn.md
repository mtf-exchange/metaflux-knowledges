# 收益赚取

:::info
**已在 Devnet 上线（预览版）。** 这是一个 USDC 借贷池，通过向[现货保证金](../products/spot-margin.md)借款方收取利息来产生收益。供款、份额定价、闲置流动性限额赎回，以及保护资金池安全的自动现货保证金清算机制，均已在 **Devnet 上端到端运行**（详见下方[操作说明](#deposit--withdraw)）。请将其视为**预览版**：各交易对的维持保证金比率仍在校准中。
:::

## 概述

将 USDC 存入 **Earn 池**即可赚取收益。该资金池将 USDC 借给[现货保证金](../products/spot-margin.md)借款方，借款方支付利息；利息持续累积至资金池，从而提升你的**份额**价值。**无需手动领取收益** — 收益会自动复利到你的份额价值中，在提款时一并兑现。

## 运作原理 — 份额 / NAV 模型

存款时，你将获得按资金池当前每份净资产价值（NAV）定价的**份额**。借款方支付的利息会提升资金池的总价值，因此每份额随之能兑换更多 USDC。

```
share_price        = pool_value / total_shares           # NAV per share
deposit D USDC  →  mint  D / share_price  shares
withdraw S shares → receive  S × share_price  USDC
```

- `pool_value` 初始值等于总存款额，并随着借款利息的累积**每个区块持续增长**。
- `total_shares` 仅在存款（铸造）和提款（销毁）时发生变化。
- 首笔存款将 `share_price` 设为 1.0（1 份额 = 1 USDC）。

由于利息使 `pool_value` 增长（而非份额数量增加），`share_price` 在贷款正常运行期间单调递升 — 所有持有人的份额以相同速率增值，无需抢先领取，也无需逐用户记账。

## 收益计算

你的收益等于份额在存款与提款之间的价值升幅：

```
your_yield = your_shares × (share_price_now − share_price_at_deposit)
```

每个区块，资金池按未偿贷款应付的利息增长：

```
interest_this_block = total_borrowed × borrow_rate_per_ms × Δms
pool_value         += interest_this_block
share_price         = pool_value / total_shares          # recomputed
```

### 实际 APY

并非所有存入的 USDC 都会立即出借 — 只有**已使用**的部分才能赚取借款利率。因此存款人实际获得的收益率，是借款利率按资金利用率缩放后的结果：

```
utilisation     = total_borrowed / pool_value            # 0 … 1
depositor_APY  ≈ borrow_APR × utilisation × (1 − protocol_fee)
```

| | 说明 |
|---|---|
| `borrow_APR` | 固定的现货保证金借款利率（按交易对） |
| `utilisation` | 资金池当前已出借的比例 |
| `protocol_fee` | 协议从利息中抽取的费用（如已配置） |

示例：借款年化利率 12%，资金利用率 50%，无协议费 → 存款人 APY ≈ 6%。所有计算均使用定点数（`Decimal`），不使用浮点数。

## 存款 / 提款

两种操作均通过发送方签名授权，在公开的 [`/exchange`](../api/rest/exchange.md#spot-margin--earn) 接口提交；`asset` 为**可出借的计价资产 ID**（即资金池键 — 已注册现货交易对的报价资产），`amount` / `shares` 以 JSON 字符串形式传入十进制数。资金池会在**任何可出借资产的首次存款时自动创建**。可通过 [`/info` `earn_state`](../api/rest/info/spot.md#earn_state) 查询已铸造份额、剩余份额及资金池总量。

```json
// supply 5,000 USDC into the Earn pool for asset 100
{ "type": "earn_deposit", "params": { "asset": 100, "amount": "5000" } }
```

```json
// redeem shares (receive shares × share_value), idle-bounded
{ "type": "earn_withdraw", "params": { "asset": 100, "shares": "1234.5" } }
```

| 操作 | 说明 |
|---|---|
| [`earn_deposit`](../api/rest/exchange.md#earn_deposit) | 存入计价资产 → 换取资金池份额（全新资金池按 1:1 兑换，否则按 NAV 定价） |
| [`earn_withdraw`](../api/rest/exchange.md#earn_withdraw) | 赎回份额 → 换回计价资产，**上限为闲置流动性** |

**闲置流动性限额。** 提款即时到账，但**受闲置流动性**（`total_supplied − total_borrowed`）限额约束：若赎回金额超过闲置部分，则仅支付闲置金额并按比例销毁较少的份额；若资金池**闲置为零**（全部已出借），则提款将被拒绝，直至借款方还款。这一机制保证供款人始终可以提取未出借的部分，同时确保借款账本不会出现抵押不足的情况。

## 风险

Earn **并非无风险**。若某[现货保证金](../products/spot-margin.md)头寸亏损平仓，且借款方的抵押品不足以弥补损失，则**差额将由供款人共同承担**：资金池的 `total_supplied` 将被扣减（下限为零），从而导致 `share_value` 下降。资金池的保护机制是**自动清算器**（已在 Devnet 上线）：每个区块都会对水下保证金账户执行[强制平仓](../products/spot-margin.md#liquidation)，即在维持保证金水平时强制解除头寸，通常此时仍有足够价值偿还贷款。保守设定的各交易对维持保证金比率（仍在校准中）决定了这一缓冲空间；在供款人之前生效的保险缓冲瀑布机制已在规划中，但尚未接入。此外还存在**流动性风险**：赎回受闲置流动性限额约束，资金利用率为 100% 时无法提款，需等待借款方还款。

## 参阅

- [现货保证金](../products/spot-margin.md) — 为你带来利息收益的借款方
- [分级清算](./tiered-liquidation.md) — 保护资金池的保险瀑布机制
- [金库](./vaults.md) — 另一种收益产品（策略交易的 LP 资本），非借贷池

## 常见问题

<details>
<summary>展开常见问题</summary>

**Q：我需要手动领取收益吗？**
A：不需要。收益会持续自动复利到你的份额价值中，提款时一并兑现。

**Q：为什么我的 APY 低于借款利率？**
A：只有已出借（已使用）部分的资金才能赚取利息。APY ≈ 借款利率 × 资金利用率。

**Q：我的本金会亏损吗？**
A：有可能。若现货保证金亏损超过借款方的抵押品，未覆盖的差额将由供款人共同承担，导致份额价值下降（面向供款人的保险缓冲机制已在规划中，但尚未接入）。该情况在设计上属于罕见场景：自动清算器会在维持保证金水平强制平仓水下头寸，且各交易对比率设定保守。Earn 的风险低于交易[金库](./vaults.md)，但并非零风险。

**Q：为什么我现在无法提取全部余额？**
A：赎回受**闲置流动性**（`supplied − borrowed`）限额约束。若资金池已全部出借给现货保证金借款方，你只能提取闲置部分；其余部分须等借款方还款后方可解锁。

**Q：Earn 与 Metaliquidity 金库有何不同？**
A：Earn 是被动的 USDC **借贷**池（收益 = 借款利息）。[金库](./vaults.md)是**主动交易**的 LP 资本（收益/亏损 = 策略的盈亏）。两者风险特征不同。

</details>
