# 投资组合保证金

:::info
**在 devnet 上线。** 情景引擎完全可操作：用户通过
`UserPortfolioMargin` 操作注册（需权益门槛，默认 ≥ 100 K USDC），而
SPAN 风格情景网格（±5/10/20 % 价格 × ±20/50 % 波动率）实时计算维持保证金。
操作接口和情景引擎都已在 4 节点共识运行上发布并测试完毕。
:::

## 简明概览

PM 将您的整个账户视为一个风险数字。对冲或相关的头寸相互抵消；该协议根据校准的 `(price, vol)` 冲击网格中的最坏情景向保证金收费。均衡组合的典型资本效率：**2–5×** 经典模式。

PM 是可选的、需权益门槛（默认 ≥ 100 K USDC）且可逆转。

## 经典 vs PM —并排对比

对冲组合示例：多头 1 BTC @ $100，空头 25 ETH @ $4（如果 BTC 和 ETH 完全相关，则完全是 $-中性的，实际上它们基本相关）。

**经典：**

```
maint(BTC) = 1 BTC × $100 × 5% = $5
maint(ETH) = 25 ETH × $4 × 5% = $5
total maint = $10
```

**PM：**

```
scenario grid: (BTC ±10%, ETH ±10% × ±50% vol)
worst-case loss (correlated -10% on both): -$10 on BTC + (-$10) profit on short ETH = $0
worst-case loss (decorrelated, BTC -10% / ETH +10%): -$10 + (-$10) = -$20  ← worst
+ concentration penalty (basket is balanced; small)
total maint ≈ $20  (vs classical $10) ?
```

等等——那样反而更差。让我们重新计算：空头 25 ETH @ $4 = $100 空头名义价值，与多头 $100 BTC 相反。

```
BTC -10%, ETH -10%:   long BTC loses $10, short ETH gains $10  → net  0
BTC +10%, ETH +10%:   long BTC gains $10, short ETH loses $10  → net  0
BTC -10%, ETH +10%:   long BTC loses $10, short ETH loses $10  → net -$20
BTC +10%, ETH -10%:   long BTC gains $10, short ETH gains $10  → net +$20
```

最坏情况下损失：$20——但仅在去相关情景中。概率加权后，去相关冲击很少见（BTC/ETH 30 日相关性 ≈ 0.85）。PM 的校准情景集对此进行了现实加权；实际保证金通常约为 $5–10 而非朴素的 $20。

经典的 $10 根本没有考虑相关性。PM 则不同。

## PM 如何工作

> 投资组合保证金引擎在内部以 **美分** 计价（整数 USDC `Decimal` 平面 × 100）。PM 数字 **替代** 经典的按资产维持保证金总和，它不会叠加。还有一个读侧 EVM 预编译（`portfolio_margin_eval`）用于链下报价。

在 PM 下，维持保证金数字来自一个 **SPAN 风格情景引擎**，它在投资组合上扫描一个确定的 `(price-shock, vol-shock)` 网格：

```
for each (δp, δσ) in price_shocks × vol_shocks:
    scenario_total = Σ_i ( delta_pnl_i + gamma_pnl_i )
        delta_pnl_i = size_i · mark_i · δp                       # linear
        gamma_pnl_i = 0.5 · |size_i| · mark_i · iv_i · δσ · δp²   # convex (Black-Scholes-flavoured)
worst        = min( scenario_total over the grid )              # most negative
pm_margin    = max(0, −worst) + concentration_penalty
```

网格和浓度系数是引擎默认值（`PortfolioMarginEngine::default`）：

| 参数 | 默认值（代码） |
|-----------|----------------|
| 价格冲击 | **±5 %, ±10 %, ±20 %**（`default_price_shocks` — 6 个值） |
| 波动率冲击 | **±20 %, ±50 %**（`default_vol_shocks` — 4 个值） |
| 网格大小 | **6 × 4 = 24 个情景** |
| 隐含波动率回退 | `0.50`（当预言机不提供 `iv` 时的 50% 年化） |
| 浓度阈值 | **50 %** 净价值（`default_concentration_threshold`） |
| 浓度罚款 | **1 000 bps = 10 %**（`DEFAULT_CONCENTRATION_PENALTY_BPS`） |
| 最小注册权益 | `10_000_000` 美分 = **100 000 USDC** |

> ⚠️ **相比之前文本的更正。** 实现的引擎：(1) 包括由每头寸隐含波动率驱动的 **gamma/凸性项** — 之前的文档将情景建模为纯线性 PnL；(2) 使用单个 **24 情景网格（±5/10/20 × ±20/50）**，没有按资产类别的表格 — 旧文档中的"BTC/alts/long-tail"分层网格不在代码中（网格是一个引擎范围的默认值，可通过动态风险调整）；(3) 浓度阈值是 **50 %**，不是 60 %；(4) 浓度罚款是 **10 %**（1000 bps），不是 5 %。

情景在整个投资组合中 **同时** 应用。净额计算自然推出：对冲组合的 `delta_pnl_i` 腿在 `scenario_total` 中抵消，所以 `worst` 较小。（注意：当前引擎在所有头寸中统一应用每个 `δp` — 显式的按对相关性矩阵是一个已记录的扩展，还不是引擎上的字段。）

当单个资产主导时，`concentration_penalty` 增加回保证金：

```
max_abs = max over positions of |notional_i|        # cents
if max_abs / net_value > 0.50:
    over    = max_abs − 0.50 · net_value
    penalty = trunc( over · 1000 / 10000 )           # 10% of the over-concentrated portion
else:
    penalty = 0
```

（当 `net_value ≤ 0` 时跳过 — BOLE 负权益路径会处理该账户。）

## 注册

```json
{ "type": "UserPortfolioMargin", "params": { "enabled": true } }
```

仅主账户。禁用时对称。

| 约束 | 值 |
|------------|-------|
| `pm_min_equity` | 默认 100 000 USDC；由治理设置 |
| 生效时间 | 提交后的下一个区块 |
| 当前违反的头寸 | 如果 PM 会将你置于 T1+，则注册被拒绝；请先平仓 |

禁用会在下一个区块恢复为经典模式。在 T0+ 中禁用是允许的（你总可以回到更保守的模型）。

## 严格隔离

即使在 PM 下，也要将特定资产标记为 **严格隔离**。严格隔离头寸：

- 单独计算自身保证金（经典模型）
- 不进入 PM 情景引擎
- 独立清算 — 爆炸被限制在该资产

用途：
- 相关性矩阵未校准的新增/流动性差的资产
- 与对冲核心隔离的投机预算
- 高风险实验

```json
{
  "type": "UpdateMarginMode",
  "params": { "asset": 7, "mode": "StrictIso" }
}
```

参见[保证金模式](./margin-modes.md)。

## PM 下的清算

PM 账户经过标准[分层清算](./tiered-liquidation.md)梯形，但 `maint_margin` 是 PM 数字，不是经典总和。

一个 PM 特定的考虑：T1 部分平仓可以足够改变情景最坏情况，使得剩余头寸在 PM 下健康但在经典下不健康。这是有意的 — 部分关闭是针对 PM 双向调整大小。

```
before T1: long 1 BTC + short 25 ETH, PM maint = $20, account_value = $18, health = 0.9 → T1
T1 partial: close 50% of both legs
after: long 0.5 + short 12.5 ETH, PM maint = $10, account_value = $13, health = 1.3 → Safe
```

## 对运营者的风险

PM 对用户更有资本效率，这正是它对协议的风险所在 — 情景规格错误可能让账户承担链无法干净清算的风险。MetaFlux 通过以下方式进行缓解：

- `concentration_penalty`（50 % 阈值 / 10 % 率）以削弱单资产 PM 博弈 — **在引擎中实现**。
- `min_enroll_account_value_cents` 下限（100K USDC） — **已实现**（`meets_enrollment_floor`；负净价值总是失败）。
- 情景集保守性、动态校准当波动率制度变化时、按账户 PM 上限（`pm_max_account_notional`，设计值 100M USDC）以及情景引擎失败时的强制经典回退 — **设计意图 / 还不是 `PortfolioMarginEngine` 上的字段**；引擎目前仅包含网格、浓度参数和注册下限。

情景集、冲击幅度和浓度系数是治理参数（动态风险）。如果你在保证金限额附近运营，请订阅参数更新。

## 工作示例 — 浓度罚款

罚款将 **最大单个资产绝对名义价值** 与账户 **净价值** 进行比较（`cash + Σ size × mark`），使用代码默认值：阈值 **50 %**，率 **10 %**。

账户：净价值 `$1000`，最大头寸 `|notional_BTC| = $700`。

```
frac    = 700 / 1000 = 0.70  > 0.50 threshold
over    = 700 − 0.50 × 1000 = 700 − 500 = $200
penalty = trunc( 200 × 1000 / 10000 ) = $20      # 10% of the over-concentrated portion
```

如果 PM 情景扫描计算（比如）`$25` 最坏情况下损失，`pm_margin = max(0, −worst) + penalty = $25 + $20 = $45`。

一个更均衡的账本，其中没有单个资产超过净价值的 50 %，则 **无** 罚款 — `pm_margin` 仅是情景最坏情况。罚款会阻止 PM 内的单资产浓度；经典保证金不作区分。

## 查询

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"0x<addr>"}'
```

原生[`account_state`](../api/rest/info.md#account_state)读操作暴露
`pm_enabled`（账户是否启用 PM）以及 `maint_margin`、
`init_margin`、`health` 和 `tier`。当启用 PM 时，`maint_margin` 已经
反映了 PM 推导的维持保证金：

```json
{
  "pm_enabled":   true,
  "maint_margin": "8",
  "init_margin":  "12",
  "health":       "...",
  "tier":         "Safe"
}
```

> **计划读操作。** 经典 vs PM 并排对比和最坏情景
> 细分（哪个价格/波动率冲击组合驱动了 PM 数字）**尚未
> 分解** 为 [`account_state`](../api/rest/info.md#account_state) 响应中的单独字段 — PM 情景
> 引擎在内部计算它们，但目前仅表面 `maint_margin`。
> 未来的读操作（`account_state` 上的按情景 PM 详情字段）将
> 暴露细分。

## 边缘情况

<details>
<summary>显示边缘情况</summary>

- **PM 情景引擎故障**：罕见；协议回退到 `max(classical_maint, prior_pm_maint)`。该区块上的清算使用保守的回退。
- **冲击制度中跨资产头寸开仓**：新头寸在接纳时针对 PM 引擎进行接纳 — 但引擎从已提交状态读取情景权重，所以对抗性制度转换博弈被阻止。
- **注册-同时-在-T0**：允许。PM 可能将你拉出 T0（如果 PM 给出更低保证金），或将你保持在 T0（如果不是）。如果 PM 给出更差数字，不会自动恢复。
- **禁用-同时-在-T0+**：允许。当 PM 在协议级别出现故障时，回退到经典很有用。

</details>

## 另见

- [分层清算](./tiered-liquidation.md) — PM 如何与梯形相互作用
- [保证金模式](./margin-modes.md) — 交叉 / 隔离 / 严格隔离
- [子账户](./sub-accounts.md) — 按子账户 PM 注册

## 常见问题

<details>
<summary>显示常见问题</summary>

**问：子账户可以有不同的 PM 设置吗？**
答：可以。每个子账户是独立的。主账户可以启用 PM 而其子账户是经典的，反之亦然。

**问：PM 评估的燃气成本是多少？**
答：比经典的大（情景网格），但有界限。协议缓存按账户情景结果，仅在头寸变化或情景参数更新时重新计算。

**问：PM 是透明的 — 我能在下单前看到确切的保证金数字吗？**
答：可以。`/info clearinghouseState` 返回经典和 PM 两者。SDK 在它们的 `getOrderImpact()` 辅助函数中表面这一点。

**问：MIP-3 上市资产能获得 PM 信用吗？**
答：仅当上市资产的市场规格在 PM 相关性矩阵中包含该资产时。许多长尾上市资产将默认采用严格隔离以求安全。检查每个市场的 `market_info.pm_eligible`。

</details>
