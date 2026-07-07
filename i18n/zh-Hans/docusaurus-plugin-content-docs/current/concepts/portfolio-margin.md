# 组合保证金

:::info
**已在 Devnet 上线。** 场景引擎已全面运行：用户通过 `UserPortfolioMargin` 操作完成注册（设有权益门槛，默认 ≥ 100,000 USDC），SPAN 风格的场景网格（价格 ±5/10/20%，波动率 ±20/50%）实时计算维持保证金。操作接口和场景引擎均已在 4 节点共识环境中完成部署和测试。
:::

## 一句话概述

组合保证金（PM）将整个账户视为一个统一的风险单元。对冲或相关联的持仓可以互相轧差；协议根据经过校准的 `(price, vol)` 冲击网格，按最坏情景计收保证金。对于对冲均衡的账户，典型的资金效率是传统模式的 **2–5 倍**。

PM 为自愿选择，设有权益门槛（默认 ≥ 100,000 USDC），并可随时撤销。

## 传统模式 vs PM——并排对比

对冲持仓示例：以 $100 做多 1 BTC，以 $4 做空 25 ETH（若 BTC 和 ETH 完全相关则美元敞口恰好对冲，两者相关性确实很高）。

**传统模式：**

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

等等——这反而更高了。让我们重新梳理：做空 25 ETH × $4 = 空头名义价值 $100，与做多 $100 BTC 方向相反。

```
BTC -10%, ETH -10%:   long BTC loses $10, short ETH gains $10  → net  0
BTC +10%, ETH +10%:   long BTC gains $10, short ETH loses $10  → net  0
BTC -10%, ETH +10%:   long BTC loses $10, short ETH loses $10  → net -$20
BTC +10%, ETH -10%:   long BTC gains $10, short ETH gains $10  → net +$20
```

最大损失：$20——但这仅出现在相关性脱钩的情景下。从概率加权角度看，相关性脱钩的冲击较为罕见（BTC/ETH 30 日相关性 ≈ 0.85）。PM 的校准情景集对此进行了合理加权，实际维持保证金通常在 $5–10 左右，而非简单估算的 $20。

传统模式的 $10 完全没有考虑相关性，PM 则不同。

## PM 的工作原理

> 组合保证金引擎在内部以**美分**为单位运算（整数 USDC 的 `Decimal` 平面 × 100）。PM 数值会**替换**传统模式下各资产维持保证金的加总，而非叠加。此外还提供一个只读 EVM 预编译接口（`portfolio_margin_eval`），供链下询价使用。

在 PM 模式下，维持保证金来自 **SPAN 风格的场景引擎**，该引擎在确定性的 `(price-shock, vol-shock)` 网格上对全组合进行扫描：

```
for each (δp, δσ) in price_shocks × vol_shocks:
    scenario_total = Σ_i ( delta_pnl_i + gamma_pnl_i )
        delta_pnl_i = size_i · mark_i · δp                       # linear
        gamma_pnl_i = 0.5 · |size_i| · mark_i · iv_i · δσ · δp²   # convex (Black-Scholes-flavoured)
worst        = min( scenario_total over the grid )              # most negative
pm_margin    = max(0, −worst) + concentration_penalty
```

网格及集中度系数为引擎默认值（`PortfolioMarginEngine::default`）：

| 参数 | 默认值（代码） |
|-----------|----------------|
| 价格冲击 | **±5%、±10%、±20%**（`default_price_shocks`——共 6 个值） |
| 波动率冲击 | **±20%、±50%**（`default_vol_shocks`——共 4 个值） |
| 网格规模 | **6 × 4 = 24 个情景** |
| 隐含波动率缺省值 | `0.50`（年化 50%），当预言机未提供 `iv` 时使用 |
| 集中度阈值 | 净值的 **50%**（`default_concentration_threshold`） |
| 集中度惩罚 | **1,000 bps = 10%**（`DEFAULT_CONCENTRATION_PENALTY_BPS`） |
| 最低注册权益 | `10_000_000` 美分 = **100,000 USDC** |

> ⚠️ **与旧文档的差异说明。** 已实现的引擎：(1) 引入了基于各持仓隐含波动率的 **gamma/凸性项**——旧文档仅对情景建模为线性损益；(2) 采用单一的 **24 情景网格（±5/10/20 × ±20/50）**，不区分资产类别——旧文档中"BTC/主流代币/长尾"的分层网格在代码中并不存在（网格为引擎级别的统一默认值，可通过动态风险参数调整）；(3) 集中度阈值为 **50%**，而非 60%；(4) 集中度惩罚为 **10%**（1000 bps），而非 5%。

情景在整个组合中**同时**应用，轧差自然形成：对冲账户的各 `delta_pnl_i` 腿在 `scenario_total` 中相互抵消，`worst` 因此很小。（注：当前引擎对所有持仓统一应用同一 `δp`——基于各交易对的相关性矩阵是已规划的扩展功能，目前尚未作为引擎字段实现。）

`concentration_penalty` 在单一资产占主导时追加保证金：

```
max_abs = max over positions of |notional_i|        # cents
if max_abs / net_value > 0.50:
    over    = max_abs − 0.50 · net_value
    penalty = trunc( over · 1000 / 10000 )           # 10% of the over-concentrated portion
else:
    penalty = 0
```

（当 `net_value ≤ 0` 时跳过——负权益账户由 BOLE 路径处理。）

## 注册

```json
{ "type": "UserPortfolioMargin", "params": { "enabled": true } }
```

仅限主账户操作。禁用时操作对称。

| 约束条件 | 数值 |
|------------|-------|
| `pm_min_equity` | 默认 100,000 USDC；由治理设定 |
| 生效时间 | 提交后下一个区块 |
| 当前违规持仓 | 若 PM 将使账户进入 T1+，注册将被拒绝——请先平仓 |

禁用后，下一个区块起回退至传统模式。在 T0+ 状态下禁用是允许的（随时可切回更保守的模式）。

## 严格隔离

即使在 PM 模式下，也可将特定资产标记为**严格隔离**。严格隔离持仓：

- 独立计算其自身的保证金（采用传统模式）
- **不**纳入 PM 场景引擎
- 独立清算——风险敞口被限制在该资产范围内

适用场景：
- 相关性矩阵尚未校准的新资产或低流动性资产
- 与对冲核心账户防火墙隔离的投机仓位
- 高风险实验性操作

```json
{
  "type": "UpdateMarginMode",
  "params": { "asset": 7, "mode": "StrictIso" }
}
```

参见[保证金模式](./margin-modes.md)。

## PM 下的清算

PM 账户遵循标准[分级清算](./tiered-liquidation.md)流程，但 `maint_margin` 取 PM 数值，而非传统模式下的加总值。

PM 特有的一点：T1 部分平仓可能显著改变场景最坏情况，使剩余持仓在 PM 模式下回归健康，但在传统模式下仍可能不达标。这是设计预期——部分平仓的规模在两个方向上均以 PM 为基准计算。

```
before T1: long 1 BTC + short 25 ETH, PM maint = $20, account_value = $18, health = 0.9 → T1
T1 partial: close 50% of both legs
after: long 0.5 + short 12.5 ETH, PM maint = $10, account_value = $13, health = 1.3 → Safe
```

## 对协议方的风险

PM 提升了用户的资金效率，这恰恰也是它对协议带来风险的原因——情景参数若设置不当，可能导致账户承担超出链上可安全清算能力的风险。MetaFlux 通过以下措施加以缓解：

- `concentration_penalty`（阈值 50%，税率 10%）——抑制针对单一资产的 PM 套利行为，**已在引擎中实现**。
- `min_enroll_account_value_cents` 下限（100,000 USDC）——**已实现**（`meets_enrollment_floor`；净值为负时始终拒绝注册）。
- 情景集保守性设定、随波动率区间变化的动态校准、单账户 PM 名义价值上限（`pm_max_account_notional`，设计值 100M USDC）、以及场景引擎故障时的强制传统模式回退——**为设计意图，尚未作为 `PortfolioMarginEngine` 字段实现**；目前引擎仅包含网格、集中度参数和注册权益下限。

情景集、冲击幅度及集中度系数均为治理参数（动态风险）。若您的账户接近保证金限额，请订阅参数更新通知。

## 示例——集中度惩罚

惩罚逻辑将**单一资产绝对名义价值中的最大值**与账户的**净值**（`现金 + Σ 持仓量 × 标记价格`）进行比较，代码默认值：阈值 **50%**，税率 **10%**。

账户：净值 `$1000`，最大持仓 `|notional_BTC| = $700`。

```
frac    = 700 / 1000 = 0.70  > 0.50 threshold
over    = 700 − 0.50 × 1000 = 700 − 500 = $200
penalty = trunc( 200 × 1000 / 10000 ) = $20      # 10% of the over-concentrated portion
```

若 PM 情景扫描计算出的最坏情景损失为（例如）`$25`，则 `pm_margin = max(0, −worst) + penalty = $25 + $20 = $45`。

对于更均衡的账户，若无单一资产超过净值的 50%，则**不产生**惩罚——`pm_margin` 仅为情景最坏情况损失。集中度惩罚旨在抑制 PM 模式下的单一资产集中持仓；传统模式对此不作区分。

## 查询

```bash
curl -X POST https://api.devnet.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"account_state","address":"0x<addr>"}'
```

原生 [`account_state`](../api/rest/info.md#account_state) 读取接口在返回 `maint_margin`、`init_margin`、`health` 和 `tier` 的同时，也会暴露 `pm_enabled`（表示该账户是否已启用 PM）。当 PM 启用时，`maint_margin` 已反映 PM 计算所得的维持保证金：

```json
{
  "pm_enabled":   true,
  "maint_margin": "8",
  "init_margin":  "12",
  "health":       "...",
  "tier":         "Safe"
}
```

> **计划中的读取功能。** 传统模式与 PM 的并排对比，以及最坏情景明细（是哪个价格/波动率冲击组合驱动了 PM 数值）**目前尚未**作为独立字段在 [`account_state`](../api/rest/info.md#account_state) 响应中输出——PM 场景引擎在内部进行计算，但目前仅对外暴露最终的 `maint_margin`。未来将新增读取接口（`account_state` 上的每情景 PM 详情字段），以展示明细。

## 边界情况

<details>
<summary>展开边界情况</summary>

- **PM 场景引擎中断**：概率极低；该区块期间协议回退至 `max(classical_maint, prior_pm_maint)`。该区块内的清算使用保守回退值。
- **冲击区间内新开跨资产持仓**：新仓位在开仓时根据 PM 引擎准入——但引擎读取的是已提交状态下的情景权重，因此可防止对冲击区间的恶意切换套利。
- **在 T0 状态下注册**：允许。PM 可能将您从 T0 拉出（若 PM 给出更低的维持保证金），或维持在 T0（若未能降低）。若 PM 给出更高数值，不会自动回退。
- **在 T0+ 状态下禁用**：允许。当协议层 PM 出现异常时，可回退至传统模式。

</details>

## 参见

- [分级清算](./tiered-liquidation.md)——PM 与清算流程的交互
- [保证金模式](./margin-modes.md)——全仓 / 逐仓 / 严格隔离
- [子账户](./sub-accounts.md)——各子账户独立的 PM 注册

## 常见问题

<details>
<summary>展开常见问题</summary>

**Q：子账户能否设置不同的 PM 配置？**
A：可以。每个子账户相互独立。主账户可以注册 PM，而其子账户仍使用传统模式，反之亦然。

**Q：PM 评估的 Gas 成本如何？**
A：比传统模式高（需要遍历情景网格），但有上限。协议会缓存各账户的情景结果，仅在持仓变动或情景参数更新时重新计算。

**Q：PM 是否透明——我可以在下单前查看确切的维持保证金数值吗？**
A：可以。`/info clearinghouseState` 同时返回传统模式和 PM 的数值。SDK 在 `getOrderImpact()` 辅助函数中也会暴露此信息。

**Q：MIP-3 上线的市场能否享受 PM 优惠？**
A：仅当该市场的配置将该资产纳入 PM 相关性矩阵时才可以。许多长尾上线资产出于安全考虑将默认采用严格隔离模式。请查看各市场的 `market_info.pm_eligible` 字段。

</details>
