# 术语表

:::tip
**稳定版。** 每个协议扩展时添加新术语。
:::

整个文档中使用的定义术语。如果主题有自己的页面，则交叉链接。

## A

**ADL — Auto-deleverage。** 损失互助机制，当保险池无法覆盖 T3 清算缺口时，从盈利交易对手那里收回未实现 PnL。参见 [ADL](./adl.md)。

**Agent wallet。** 经主账户批准代表其行动的签名密钥，**无**提取权限。参见 [agent wallets](./agent-wallets.md)。

**ALO — Add-Limit-Only。** 订单 TIF，如果任何部分会穿越挂单簿，则完全拒绝该订单。保证做市商。参见 [order types](./order-types.md#time-in-force)。

**Asset ID。** 市场的规范整数标识符。在不同网络上不同；通过 `meta` 信息查找。

**Action。** 对 `POST /exchange` 的状态改变调用。标记变体联合，约有 30 种类型。参见 [exchange.md](../api/rest/exchange.md#action-catalog)。

## B

**Backstop (T3)。** 清算层级，协议将低于阈值的账户头寸收归保险池。参见 [tiered liquidation](./tiered-liquidation.md#t3-backstop--netting-at-mark)。

**Band, mark-price。** 每个区块对标记价格移动幅度的限制。防御预言机/中点操纵。参见 [mark prices](./mark-prices.md#sanity-bands)。

**Batch ID。** FBA 市场的拍卖批次标识符。参见 [FBA](./fba.md)。

**bps — Basis point。** 0.01%（= `1e-4`）。费率以 bps 计算；`5 bps` = 0.05%。

**Builder rebate。** 费用分成，支付给发起订单的地址（前端、聚合器、自动化服务）。参见 [fees](./fees.md#builder-rebate)。

## C

**CCTP — Cross-Chain Transfer Protocol。** Circle 的跨链转移协议。MetaFlux **不**使用 CCTP；而是通过 [MetaBridge](../bridge/)（验证者签名的托管桥）桥接 USDC。

**chainId。** EIP-712 域字段，选择网络。`31337` devnet，`114514` testnet，`8964` mainnet。参见 [networks](../networks.md)。

**Cloid — Client Order ID。** 16 字节标识符，由客户端设置；启用 `CancelByCloid` 和订单幂等性。参见 [exchange.md `submit_order`](../api/rest/exchange.md#submit_order)。

**Clearing price (FBA)。** FBA 批次结算的单一统一价格。参见 [FBA](./fba.md)。

**Cross margin。** 边际模式，其中所有头寸共享账户范围内的抵押品。资本效率高；非隔离。参见 [margin modes](./margin-modes.md)。

## D

**Delegation (staking)。** 委托人的 MTF 权益分配给验证者的池。赚取奖励，面临削减风险。参见 [staking](./staking.md)。

**Domain separator。** EIP-712 32 字节常数，每个网络一个；签名哈希的输入之一。参见 [signing](../integration/signing.md)。

## E

**EIP-712。** 用于类型化结构签名数据的以太坊标准。MetaFlux 签名使用 EIP-712 封装（`0x1901 || domain || hash`）。参见 [signing](../integration/signing.md)。

**EMA — Exponential Moving Average。** 用于中点价格平滑以计算标记价格。参见 [mark prices](./mark-prices.md)。

## F

**FBA — Frequent Batch Auction。** 连续 CLOB 的离散时间匹配替代方案。参见 [FBA](./fba.md)。

**FIFO — First-In-First-Out。** 连续 CLOB 中相同价格水平的订单匹配优先级。

**FOK — Fill-or-Kill。** TIF，填充整个订单或取消所有订单。参见 [order types](./order-types.md#time-in-force)。

**Funding rate。** 每小时用户间支付，将永续价格钉住基础预言机。参见 [funding rates](./funding-rates.md)。

## G

**Grouping。** `Order` 参数，将腿链接到 OCO 族（`NormalTpsl`）或头寸附加支架（`PositionTpsl`）。参见 [order types](./order-types.md#grouping)。

**GTC — Good-Till-Cancelled。** 默认 TIF；订单无限期地停留在挂单簿上。参见 [order types](./order-types.md#time-in-force)。

## H

**Health ratio。** `account_value / maint_margin`。驱动 [tiered liquidation](./tiered-liquidation.md) 梯队。

**High-water mark。** 保险库的最高历史份额价格，用于控制表现费的应计。参见 [vaults](./vaults.md)。

**HL-compat。** 网关的协议表面，镜像 HL 的连线形状（URL、JSON、签名）。参见 [hl-compat](../api/rest/hl-compat.md)。

## I

**IOC — Immediate-Or-Cancel。** TIF；匹配可用的，取消任何未填充的余额。参见 [order types](./order-types.md#time-in-force)。

**Idempotency。** 属性，重试请求会导致相同的可观测效果。参见 [idempotency](../integration/idempotency.md)。

**Insurance pool。** MFlux Vault 的子集，预留用于 T3 backstop 覆盖。参见 [vaults](./vaults.md#insurance-pool)。

**Isolated margin。** 边际模式，其中按资产的桶对该资产的损失设置上限。参见 [margin modes](./margin-modes.md)。

## L

**L2 book。** 给定深度的挂单簿（每侧前 N 个水平面）。参见 [`l2_book` info](../api/rest/info.md#l2_book)。

**Liquidation tier。** [tiered ladder](./tiered-liquidation.md) 中的阶段：T0 黄牌、T1 部分、T2 完全、T3 backstop、T4 ADL。

**Lock-up (staking / vault)。** 解除质押/提取信号和资金可用性之间所需的时间。参见 [staking](./staking.md)、[vaults](./vaults.md)。

## M

**Maintenance margin。** 保持头寸开放所需的最低抵押品。Health = `account_value / maint_margin`。参见 [margin modes](./margin-modes.md)。

**Maker / Taker。** Maker 提供流动性（停留订单）；Taker 移除流动性（穿越订单）。不同的费率。参见 [fees](./fees.md)。

**Mark price。** 协议用于保证金/清算的权威价格。中点 + 预言机 + EMA 的中位数合成。参见 [mark prices](./mark-prices.md)。

**Master account。** 其状态被操作改变的账户；可以由自身签名或由已批准的代理签名。参见 [agent wallets](./agent-wallets.md)。

**MFlux Vault。** 协议运营的保险 + 做市池。参见 [vaults](./vaults.md#mflux-vault)。

**MIP — Market Improvement Proposal。** 编号的协议改进（类似于成熟的链上永续协议使用的改进提案方案）。参见 [MIP](../mip/)。

**msgpack。** 二进制序列化格式。操作的签名负载是 msgpack 字节。参见 [signing](../integration/signing.md)。

**MTF。** MetaFlux 协议代币。用于质押、治理、费用销毁。

**Multi-sig。** M-of-N 签名要求账户。参见 [multi-sig](./multi-sig.md)。

## N

**Nonce。** 每个发送者严格单调的 uint64，包含在每个操作中；重放保护。参见 [idempotency](../integration/idempotency.md)。

## O

**Oid — Order ID。** 服务器分配的 uint64；在 `Order` 响应和 `userEvents`/`orderEvents` 中返回。参见 [exchange.md](../api/rest/exchange.md)。

**Oracle。** 由 CEX 价格组成的外部价格源，通过 TWA。标记价格 + 融资费的输入。参见 [mark prices](./mark-prices.md#the-oracle-c1-anchor)。

## P

**PnL。** 损益。未实现（开仓头寸的按市价计算）与已实现（在平仓填充处平仓）。

**Portfolio margin (PM)。** 跨资产情景基础边际模型；对冲账簿资本效率高。参见 [portfolio margin](./portfolio-margin.md)。

**Premium index。** `mid - oracle` 的 EMA；融资费的输入。参见 [funding rates](./funding-rates.md)。

## R

**Reduce-only。** 订单标志，如果订单会增加头寸规模，则在入场时拒绝该订单。参见 [order types](./order-types.md#reduce-only)。

**RFQ — Request for Quote。** 做市商报价工作流程，用于不想在公共挂单簿上宣传的规模。参见 [RFQ](./rfq.md)。

## S

**Sender。** 其状态在 `POST /exchange` 请求中改变的地址。可以由自身签名或由已批准的代理签名。

**Share (vault)。** 保险库参与的单位；在当前 `share_price` 处的存款时铸币，在当前 `share_price` 处的提取时销毁。参见 [vaults](./vaults.md)。

**Slashing。** 验证者因双签或停机时间而受到的惩罚；减少验证者（和委托人）的权益。参见 [staking](./staking.md#slashing)。

**STP — Self-Trade Prevention。** 订单参数，选择新订单与自己停留的订单匹配时会发生的情况。参见 [order types](./order-types.md#self-trade-prevention)。

**Strict-Iso。** 边际模式，类似于隔离，具有额外属性，即头寸被排除在任何投资组合-边际净额计算之外。参见 [margin modes](./margin-modes.md)。

**Sub-account。** 主账户下的衍生账户；隔离的头寸和订单，仅与主账户共享存款/提取。参见 [sub-accounts](./sub-accounts.md)。

## T

**Taker。** 流动性移除者；穿越挂单簿一侧的填充方。

**Tick size。** 市场的最小价格增量。订单必须对齐。

**TIF — Time-In-Force。** 订单参数：GTC / IOC / ALO / FOK。参见 [order types](./order-types.md#time-in-force)。

**TPSL — Take-Profit / Stop-Loss。** 触发订单分组以保护支架。参见 [order types](./order-types.md#triggers)。

**TVL — Total Value Locked。** 所有存款人的保险库 NAV 总和。

**TWAP — Time-Weighted Average Price。** 订单原语，在一段时间内分割大订单。参见 [order types](./order-types.md#twap)。

## U

**Universe。** 协议上活跃市场列表（永续 + 现货）。由 `meta` 信息返回。

**Unrealised PnL。** 开仓头寸的按市价计算损益。尚未通过平仓实现。

**USDC。** MetaFlux 市场的报价货币；通过 [MetaBridge](../bridge/) 桥接进出。

## V

**Validator。** 共识参与者；提议区块并投票。赚取委托人奖励的佣金；需要承担削减风险。

**Vault。** USDC 池，在经理的签名权限下，具有铸币/销毁份额语义。参见 [vaults](./vaults.md)。

## W

**Withdrawable。** 可以离开账户的自由余额（不被持有作为开仓头寸的边际、不在隔离桶中、不被保险库锁定）。

## Y

**Yellow card (T0)。** 第一个清算层级。ALO 订单被取消；头寸未受影响；客户端通知。参见 [tiered liquidation](./tiered-liquidation.md#why-a-yellow-card)。
