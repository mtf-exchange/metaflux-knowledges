# 标志价格

:::tip
**稳定。**
:::

## 概述

**标志价格**是协议对每项资产的权威价格，用于保证金、清算、融资和触发评估。它是三个组成部分的中位数——预言机锚点（加上基差 EMA）、内部报价中点和外部永续中位数——持续重新计算。它不是最后交易价格。

## 为什么标志价≠最后交易价

使用最后交易价格来计算保证金存在风险：一个小的恶意交易可能以操纵价格将其他用户推向清算。标志价格是一个平滑的、多源组合，难以操纵。

## 组成结构

> 实现的标志价是下面的**3 组成部分中位数**（`mark_source: "MedianOfOraclesAndMid"`），而不是简单的 `median(mid, oracle, ema_mid)`。

### 计算方式

```
mark = median( present components of {C1, C2, C3} )
        # 3 present → median3   2 present → midpoint   1 present → that value
        # a lone C2 (no external anchor) yields no update — see below
```

包括三个组成部分：

| 组成部分 | 定义 |
|-----------|------------|
| **C1** (预言机锚点) | `C1 = oracle + EMA(quote_mid − oracle)` — 预言机加上永续合约**基差**的固定衰减 EMA（≈在重新计算频率下**150 秒**半衰期） |
| **C2** (内部订单簿) | `mid(best_bid, best_ask)` — 仅最佳买价/卖价。需要双向且不交叉的订单簿，否则为 `None`。它故意**排除最后交易**（将最后交易折回会使重新计算自我参考，可能冻结单侧薄订单簿）。 |
| **C3** (外部永续) | `median(external perp mids)` 超过**5 个永续交易所**（币安、OKX、Bybit、Gate、MEXC）；需要**≥ 2** 个交易所存在，否则为 `None` |

外层中位数对单个异常值具有鲁棒性。**缺失的组成部分会自动脱落** — 存在两个时标志价是它们的中点，存在一个时就是那个值。没有内部订单簿且没有外部永续时，`mark = C1 = oracle + EMA(basis)`，优雅地降级到现货预言机，而不是冻结。

**单独 C2 被拒绝。** 如果*唯一*存在的组成部分是内部报价中点（没有预言机、没有外部永续），标志价保持不变，而不是让单个静息差价——由对手控制——定义清算/融资价格。单独 C1（外部预言机）或单独 C3（已经是 ≥ 2-交易所中位数）是允许的。

- **C1 EMA** 是确定性安全的 `DeterministicEma`（定点 `(num, denom)`，固定衰减 `0.9548` ≈ 在 ~10 秒重新计算频率下 150 秒半衰期）。它仅在可用的双向报价和预言机都存在时才折合 `quote_mid − oracle`，所以空订单簿或单侧订单簿不会向其输入噪声。从未有可用报价的市场保持 `EMA = 0`，即 `C1 = 裸预言机`。
- EMA **按资产**（每个永续市场一个）。
- 计算的中位数被写入市场的**权威标志价**（每个消费者读取的值），所以普通成交戳记最后交易价不能掩盖它 — 中位数对活跃市场是权威的，不仅是安静的市场。

> ⚠️ **更正与先前文本。** 较早的文档将 C2 建模为 `median(bid, ask, last_trade)` 和 C3 为 7 交易所加权中位数。实际形状是：C2 = **双向报价中点**（仅最佳买价/卖价，排除最后交易），C3 = **5 个外部永续交易所的中位数**（≥ 2 必需），C1 = 预言机加上固定衰减（`0.9548`）永续基差的 EMA。缺失的组成部分从中位数中脱落（无 `unwrap_or(C1)` 替换），单独 C2 不产生更新。

### 两个价格平面（阅读任何数字前请先读这部分）

MTF 在**两个不同的数字平面**上携带价格 — 规模混淆的#1 来源：

| 平面 | 类型 | 规模 | 使用方 |
|-------|------|-------|---------|
| **订单簿 / 订单 / 标志价平面** | `FixedPrice` (`i128`) / `price_e8` | **1e8 定点**（原始整数 = 价格 × 10⁸） | 订单簿、`last_mark_px`、EVM 预编译（`mark_px_e8`、`entry_px_e8`）、`l2_book` 水平 `px`、订单 `limit_px`、`tick_size` |
| **预言机 / 名义 / 抵押平面** | `rust_decimal::Decimal` | **整数 USDC**（1 单位 = 1 USDC） | 预言机聚合器 + 标志价计算机（C1/C2/C3 都在 `Decimal` 中）、融资 `oracle_px`、PM 场景引擎、保证金/健康状况和人类 `market_info`/`markets` 读字段 `mark_px`/`oracle_px` |

标志价计算机和预言机聚合完全在**`Decimal` 整数 USDC 平面**中运行。结果在写入订单簿 / `last_mark_px` 时转换为**1e8 `FixedPrice` 平面**。然而，人类 `market_info` / `markets` 读已经将 `mark_px` 和 `oracle_px` 缩放回**整数 USDC 平面**（例如 `"67042.335"`，不是原始 1e8） — 仅订单/订单簿*提交*字段（`l2_book` 水平 px、订单 `limit_px`、`tick_size`）保持 1e8。PnL/融资*结算*运行在第三个小约定上 — USDC `1e6`（`mark_settle` 中的 `accumulated_funding_e6`）。在比较幅度前始终检查公式在哪个平面上。

## 预言机（C1 锚点）

`oracle` — C1 锚点 — 是最多 10 个外部现货交易所的**加权中位数**（币安 3、OKX 2、Bybit 2、Coinbase 2、Bitget / Kraken / KuCoin / Gate / MEXC / MetaFlux-spot 各 1；总计 15），每个区块发布一次并由预言机验证器签名。按符号权重是治理可设置的（`SetOracleWeights`、`ActionId 148`）；过期 > 60 秒或距离跨交易所中位数 > 5% 的信源被丢弃；如果 < 50% 的权重存在，插槽保持其最后的好值。

标志价的 **C3 组成部分是单独的信源集** — 来自**5 个永续交易所**（币安、OKX、Bybit、Gate、MEXC）的永续中点，而非现货预言机表。查看**[预言机价格](./oracle-prices.md)**了解完整组成、可靠性规则、按符号覆盖和 `oracle_sources` 读。

[`market_info`](../api/rest/info.md#market_info) 读暴露 `mark_source`（描述符 `"MedianOfOraclesAndMid"`）和组成的 `mark_px` / `oracle_px`；各个 C1/C2/C3 组成部分和加权源列表不作为线路字段分解。

## 标志价与预言机 — 为什么它们偏离

标志价距离预言机很远是**正常和预期的**。预言机跟踪**现货**；标志价跟踪**永续**交易的地方 — 永续可以持有持久的**基差**（相对于现货的溢价或折扣）：

- **C2** 是 MetaFlux 永续订单簿中点，**C3** 是外部*永续*中位数 — 两者都反映永续，不是现货。
- **C1** 是 `oracle + EMA(quote_mid − oracle)` — 基差 EMA 甚至将预言机锚点拉向永续的运行溢价，所以所有三个组成部分都跟踪永续。

所以当永续以，例如相对其现货指数的 30% 折扣交易时，`mark ≈ perp` 和 `oracle ≈ spot` 合法地因~30% 而偏离。这个差距正是**[融资](./funding-rates.md)**应该关闭的 — 并注意如果预言机本身不可靠，融资*被关闭并衰减到 0*，即使标志价/预言机差距很大（所以大差距加~0 融资意味着该市场的预言机不被信任，不是融资破损）。查看[融资关闭](./funding-rates.md#gating-when-the-oracle-is-untrusted)。

## 理智带

> **实现状态：** 3 组成部分中位数（缺失组成部分脱落、单独 C2 被拒）今天已实现。本部分描述的每区块夹紧（`clamp(candidate, prior ± max_step)` 在中位数之上的坡道）是**设计规范，还不是标志价计算机中的离散夹紧** — 结构中位数目前是主要操纵防守。最接近的实时保护将预言机复制到陈旧订单簿的 `last_mark_px` 而不是坡道。将下面的数字视为预期带设计；在依赖确切夹紧数字前验证实时值。

即使有组成，对手也可以同时推动三个源中的两个。标志价因此旨在每个区块强制实行**带**：

```
prior_mark   = mark at block T-1
band_pct     = market parameter, default 0.5% per second
max_step     = prior_mark * band_pct * (block_time_ms / 1000)

candidate    = median(...)
mark_T       = clamp(candidate, prior_mark - max_step, prior_mark + max_step)
```

| 默认 | 值 |
|---------|-------|
| `band_pct` | 每秒 0.5% |
| `block_time_ms` | 100 ms |
| `max_step_per_block` | ~0.05% |

在每 100 ms 0.05% 处，5% 的移动需要≈10 秒。真正的快速移动在少数几个块上追上；恶意尖峰被夹紧成短坡道。

如果候选者连续超过带 `band_violation_blocks` 次（默认 50 = ~5 秒），协议假设真实体制转变并将带加宽 2× 一个窗口。这在真实市场错配期间防止永久冻结。

## 什么使用标志价

| 消费者 | 为什么用标志价？ |
|----------|-----------|
| 保证金（初始 + 维持） | 稳定基差；抗操纵 |
| 清算阶级评估 | 相同 |
| 融资（相对预言机） | 融资公式需要 |
| 触发订单（止损 / 获利） | 抗单一交易尖峰 |
| PnL 显示（未实现） | 稳定用户面向数字 |
| 保险会计 | 稳定 |

使用**最后交易**而不是标志价的消费者：
- 订单簿上的成交价格（交易以实际订单簿价格成交）
- 做市商 / 接受方费用（根据成交价格计算，不是标志价）
- 已实现 PnL（在退出成交价格处计算）

## 查询

```bash
curl -X POST https://devnet-gateway.mtf.exchange/info \
  -H 'content-type: application/json' \
  -d '{"type":"market_info","asset_id":0}'
```

[`market_info`](../api/rest/info.md#market_info) 读报告 `mark_px` 和 `oracle_px` 在**整数 USDC 平面**上（例如 `"67042.335"`），加上 `mark_source` 描述符：

```json
{
  "type": "market_info",
  "data": {
    "asset_id":    0,
    "mark_source": "MedianOfOraclesAndMid",
    "mark_px":     "67042.335",
    "oracle_px":   "67042.335"
  }
}
```

三个内部组成部分 `C1`/`C2`/`C3`（预言机+EMA 锚点 / 内部订单簿中位数 / 外部永续加权中位数）和带状态（`Ok` / `Banded` / `Frozen`）存活在标志价计算机内；它们**今天不作为 `market_info` 线路字段分解** — 仅组成的 `mark_px` 被发布。Banded 意味着带在这个块中夹紧了候选者；Frozen 意味着所有源失败，协议保持先前标志价。

专用 `mark` WS 频道在 [WS 路线图](../api/ws/subscriptions.md#roadmap--not-yet-available)上（还未流式传输）；同时轮询 [`market_info`](../api/rest/info.md#market_info) 获取 `mark_px`。

## 边界情况

<details>
<summary>显示边界情况</summary>

- **1 秒内真正 5% 移动。** 带夹紧前 10 个块；标志价以~0.05% 每块追上，然后体制转变检测加宽带，标志价更快追上。总延迟是~1–2 秒；大但有界。
- **预言机中断 > 50% 权重丢失。** 当一个 tick 中存在 < 50% 的现货权重时，预言机插槽**不更新** — 先前的好 tick 持久。C1 继续使用最后的好预言机 + 其 EMA，所以标志价保持锚定。
- **空 / 单侧 MTF 订单簿。** C2 脱落。标志价 = `midpoint(C1, C3)`（或仅 `C1` 如果永续也下降）— 它跟踪预言机锚点混合外部永续。融资仍使用可用预言机；清算针对预言机锚定标志价进行。
- **所有外部永续下降。** C3 脱落。标志价 = `midpoint(C1, C2)` — 内部报价中点相对预言机锚点。
- **没有订单簿和没有永续。** 仅 C1 保留 ⇒ `mark = C1 = oracle + EMA(basis)`。纯预言机锚定。
- **只有单侧/空无预言机报价。** 单独 C2 被拒 ⇒ 无更新；标志价保持其最后值直到外部锚点（预言机或永续）返回。
- **陈旧 C1 EMA。** EMA 根据构造在至少一个内部中点曾经折合一次后始终被定义；当新中点到达时它保持其最后值（它仅在 C2 存在时被更新）。
- **冻结期间的触发订单。** 触发评估使用标志价；在冻结期间，无触发触发。静息订单坐直到真实标志价恢复。

</details>

## 序列 — 标志价带在尖峰上启动

3 组成部分中位数已经在任何带前中和单源尖峰：

```
block T-1   C2(book mid)=100.0  C1(oracle+EMA)=100.0  C3(perps)=100.0  →  median3 = 100.0

block T:    thin MTF book; adversary lifts the internal mid to 110.0
            C2 = 110.0,  C1 = 100.05,  C3 = 100.05   (external perps + oracle unmoved)
            mark = median3(100.05, 110.0, 100.05) = 100.05
            ↑ the adversarial C2 is the OUTLIER → median discards it; mark ≈ oracle anchor

block T+1:  adversary persists at 110.0; oracle/perps drift up slowly
            C2 = 110.0,  C1 = 100.10,  C3 = 100.10
            mark = median3(100.10, 110.0, 100.10) = 100.10

... mark tracks the (C1, C3) consensus; a single manipulated source never wins the median
```

防守是结构性的：为了移动中位数，对手必须移动三个组成部分中的至少**两个**，而 C1（预言机）+ C3（5 交易所外部永续中位数）正是难以移动的。下面的可选每块理智带是中位数之上的额外夹紧。

## 另见

- [融资率](./funding-rates.md) — 融资使用标志价相对预言机
- [分层清算](./tiered-liquidation.md) — 针对标志价的阶级评估
- [`mark` WS 频道（路线图）](../api/ws/subscriptions.md#roadmap--not-yet-available)
- [预言机价格](./oracle-prices.md) — 完整源列表、权重、可靠性规则

## 常见问题

<details>
<summary>显示常见问题</summary>

**Q: 为什么不直接使用预言机？**
A: 纯预言机标志价给予预言机运营者通过操纵信源来清算订单簿的能力。三中位数使信任表面多样化。

**Q: 我能看到带历史上做了什么吗？**
A: 带状态的标志价历史将在 `mark` WS 频道发货（路线图）和通过存档索引响应时暴露；它还不在实时读表面上。

**Q: 带会导致不公平清算吗？**
A: 带相对于底层缓减标志价 — 所以在真实崩溃期间，您的维持对一个额外~1 秒保持健康的时间比在使用最后交易的交易所更长。反向也是真实的（标志价缓慢展开）。净效果：清算行为更确定并且更难被武器化。

</details>
