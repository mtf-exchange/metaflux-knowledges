# 赚取收益

:::info
**在 devnet 上可用（预览版）。** 一个 USDC 借贷池，从
[现货杠杆](./spot-margin.md)借款者获得收益。供应、份额定价、空闲受限
赎回以及保护池的自动现货杠杆清算器均已在 **devnet 上端到端运行**（见下方
[操作表面](#存入--提取)）。将其视为**预览版**：
按交易对的维护比率仍在校准中。
:::

## 概要

将 USDC 存入**赚取收益池**并赚取收益。该池向[现货杠杆](./spot-margin.md)借款者借出 USDC，他们支付利息；该利息累积到池中并提升你的**份额**价值。**无需声明步骤** — 收益持续复利到你的份额价值中，你在提取时实现收益。

## 工作原理 — 份额 / 净资产价值模型

当你存入时，你收到按当前每份额净资产价值（NAV）定价的**份额**。借款者支付的利息提升了池的总价值，因此每份额的 USDC 价值逐步增加。

```
share_price        = pool_value / total_shares           # NAV per share
deposit D USDC  →  mint  D / share_price  shares
withdraw S shares → receive  S × share_price  USDC
```

- `pool_value` 初始等于总存款，**每个区块**随着借用利息累积而增长。
- `total_shares` 仅在存入（铸造）和提取（销毁）时更改。
- 首次存入设置 `share_price = 1.0`（1 份额 = 1 USDC）。

因为利息提升了 `pool_value`（而非份额数），`share_price` 在贷款表现良好时单调上升 — 每个持有者的份额以相同速率升值，无声明竞赛，无按用户计费。

## 收益计算

你的收益是从存入到提取期间份额的升值：

```
your_yield = your_shares × (share_price_now − share_price_at_deposit)
```

每个区块，池按未清偿贷款应付的利息增长：

```
interest_this_block = total_borrowed × borrow_rate_per_ms × Δms
pool_value         += interest_this_block
share_price         = pool_value / total_shares          # recomputed
```

### 有效年化收益率

并非所有存入的 USDC 都立即出借 — 仅**已用**部分以借用利率获利。因此存款人看到的收益是按使用率缩放的借用利率：

```
utilisation     = total_borrowed / pool_value            # 0 … 1
depositor_APY  ≈ borrow_APR × utilisation × (1 − protocol_fee)
```

| | 值 |
|---|---|
| `borrow_APR` | 固定现货杠杆借用利率（按交易对） |
| `utilisation` | 当前出借的池的部分 |
| `protocol_fee` | 可选的协议利息切割（如已配置） |

示例：12% 借用年利率、50% 使用率、无协议费用 → 存款人年化收益率 ≈ 6%。所有算术均为定点（`Decimal`），无浮点运算。

## 存入 / 提取

两种操作都在公共 [`/exchange`](../api/rest/exchange.md#spot-margin--earn) 路径上经过发送者授权；`asset` 是
**可借用的报价资产 id**（池键 — 已注册现货交易对的报价），
`amount` / `shares` 是作为 JSON 字符串发送的十进制数。池在第一次
为任何可借用的资产存入时**自动创建**。通过
[`/info` `earn_state`](../api/rest/info.md#earn_state) 确认铸造的 /
剩余份额和池总额。

```json
// supply 5,000 USDC into the Earn pool for asset 100
{ "type": "earn_deposit", "params": { "asset": 100, "amount": "5000" } }
```

```json
// redeem shares (receive shares × share_value), idle-bounded
{ "type": "earn_withdraw", "params": { "asset": 100, "shares": "1234.5" } }
```

| 操作 | 效果 |
|---|---|
| [`earn_deposit`](../api/rest/exchange.md#earn_deposit) | 提供报价 → 池份额（新池上为 1:1，否则按 NAV 定价） |
| [`earn_withdraw`](../api/rest/exchange.md#earn_withdraw) | 赎回份额 → 报价，**受限于空闲流动性** |

**空闲受限。** 提取是即时的但**受空闲流动性限制**
（`total_supplied − total_borrowed`）：大于空闲的赎回恰好支付
空闲并按比例销毁较少份额，而**零空闲的池**（完全出借）
拒绝提取直到借款人偿还。这保证供应商
可以随时退出未出借的部分，从不使借账
陷入抵押不足。

## 风险

赚取收益**并非无风险**。如果[现货杠杆](./spot-margin.md)头寸以借款人
抵押品无法覆盖的损失平仓，**不足部分会社会化给供应商**：池的
`total_supplied` 减少（底线为零），这降低了 `share_value`。池的保护是
**自动清算器**（在 devnet 上实时运行）：每个区块，水下保证金账户被
[强制平仓](./spot-margin.md#liquidation)在维护底线处，因此头寸在通常仍有足够
价值偿还贷款时展开。
保守的按交易对维护比率（仍在校准中）确定该缓冲；供应商前的保险缓冲阶梯已规划但尚未接通。还有**流动性风险**：赎回受空闲流动性限制，
因此完全使用的池在借款人偿还前无法退出。

## 另请参阅

- [现货杠杆](./spot-margin.md) — 借款人其利息是你的收益
- [分级清算](./tiered-liquidation.md) — 保护池的保险阶梯
- [金库](./vaults.md) — 不同的收益产品（策略交易的 LP 资本），不是借贷池

## 常见问题

<details>
<summary>显示常见问题</summary>

**Q: 我需要声明我的收益吗？**
A: 不需要。收益持续复利到你的份额价值中；你在提取时实现收益。

**Q: 为什么我的年化收益率低于借用利率？**
A: 仅池中出借（已用）部分赚取利息。年化收益率 ≈ 借用利率 × 使用率。

**Q: 我可能损失本金吗？**
A: 可以，如果现货杠杆损失超过借款人的抵押品 — 未覆盖的不足部分会社会化给供应商并降低份额价值（供应商前的保险缓冲已规划但尚未接通）。设计为罕见：自动清算器在维护底线处强制平仓水下头寸，且按交易对比率设置为保守值。赚取收益的风险低于交易[金库](./vaults.md)但并非无风险。

**Q: 为什么我现在无法提取全额余额？**
A: 赎回受**空闲流动性**限制（`supplied − borrowed`）。如果池完全出借给现货杠杆借款人，你只能提取至空闲额；其余部分在借款人偿还时解锁。

**Q: 赚取收益与 Metaliquidity 金库有何不同？**
A: 赚取收益是被动的 USDC **借贷**池（收益 = 借用利息）。[金库](./vaults.md)是**交易的** LP 资本（收益/损失 = 策略的损益）。不同的风险概况。

</details>
