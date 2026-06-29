# 术语表

:::tip
**稳定版本。** 每次协议扩展时会新增术语。
:::

本文档中使用的术语定义。凡有专属页面的概念，均附交叉链接。

## A

**ADL — 自动减仓。** 当保险池无法弥补 T3 清算缺口时，从盈利对手方追回未实现盈亏的损失共担机制。参见 [ADL](./adl.md)。

**代理钱包（Agent wallet）。** 由主账户授权、代表主账户执行操作的签名密钥，**不具备**提款权限。参见[代理钱包](./agent-wallets.md)。

**ALO — 仅限挂单（Add-Limit-Only）。** 一种订单有效期（TIF）类型，若订单有任何部分会与当前挂单簿撮合，则整笔订单直接拒绝。保证以挂单方身份成交。参见[订单类型](./order-types.md#time-in-force)。

**资产 ID（Asset ID）。** 市场的规范整数标识符。不同网络上的值各不相同，可通过 `meta` 接口查询。

**动作（Action）。** 对 `POST /exchange` 的状态变更调用，是带标签的变体联合体，共约 30 种类型。参见 [exchange.md](../api/rest/exchange.md#action-catalog)。

## B

**兜底机制（T3）。** 当账户资产低于阈值时，协议将其仓位没收至保险池的清算层级。参见[分级清算](./tiered-liquidation.md#t3-backstop--netting-at-mark)。

**标记价格波动限幅（Band, mark-price）。** 每个区块内对标记价格涨跌幅的限制，防止预言机或中间价被操纵。参见[标记价格](./mark-prices.md#sanity-bands)。

**批次 ID（Batch ID）。** FBA 市场的拍卖批次标识符。参见 [FBA](./fba.md)。

**基点（bps）。** 0.01%（= `1e-4`）。费率以基点计价，`5 bps` = 0.05%。

**构建者返佣（Builder rebate）。** 支付给发起订单的地址（前端、聚合器、自动化服务）的费用分成。参见[费率](./fees.md#builder-rebate)。

## C

**CCTP — 跨链转账协议。** Circle 的跨链转账协议。MetaFlux **不使用** CCTP；USDC 通过 [MetaBridge](../bridge/)（基于验证者签名的托管跨链桥）进行跨链。

**chainId。** EIP-712 域字段，用于指定网络：`31337` 为开发网，`114514` 为测试网，`8964` 为主网。参见[网络](../networks.md)。

**客户端订单 ID（Cloid）。** 由客户端设置的 16 字节标识符，用于支持 `CancelByCloid` 和订单幂等性。参见 [exchange.md `submit_order`](../api/rest/exchange.md#submit_order)。

**清算价格（FBA）。** FBA 批次以统一单一价格结算的成交价。参见 [FBA](./fba.md)。

**全仓保证金（Cross margin）。** 所有仓位共享账户全部抵押品的保证金模式，资本效率高，非逐仓模式。参见[保证金模式](./margin-modes.md)。

## D

**委托（staking）。** 委托人将 MTF 质押分配至验证者质押池，可获得奖励，同时承担被惩罚的风险。参见[质押](./staking.md)。

**域分隔符（Domain separator）。** 每个网络专属的 EIP-712 32 字节常量，是签名哈希的输入之一。参见[签名](../integration/signing.md)。

## E

**EIP-712。** 以太坊结构化数据签名标准。MetaFlux 签名使用 EIP-712 封装格式（`0x1901 || domain || hash`）。参见[签名](../integration/signing.md)。

**EMA — 指数移动平均。** 用于标记价格计算中的中间价平滑处理。参见[标记价格](./mark-prices.md)。

## F

**FBA — 频繁批量拍卖（Frequent Batch Auction）。** 连续撮合 CLOB 的离散时间替代方案。参见 [FBA](./fba.md)。

**FIFO — 先进先出（First-In-First-Out）。** 连续 CLOB 中同一价格层级的订单撮合优先级规则。

**FOK — 全部成交或全部取消（Fill-or-Kill）。** 一种 TIF 类型，要求订单全部成交，否则全部撤销。参见[订单类型](./order-types.md#time-in-force)。

**资金费率（Funding rate）。** 每小时用户之间相互支付的费用，用于将永续合约价格锚定至底层预言机价格。参见[资金费率](./funding-rates.md)。

## G

**组合（Grouping）。** `Order` 参数，用于将多个订单腿关联为 OCO 组合（`NormalTpsl`）或仓位附属止盈止损对（`PositionTpsl`）。参见[订单类型](./order-types.md#grouping)。

**GTC — 撤销前有效（Good-Till-Cancelled）。** 默认 TIF 类型，订单在撤销前持续挂单。参见[订单类型](./order-types.md#time-in-force)。

## H

**健康度（Health ratio）。** `account_value / maint_margin`。驱动[分级清算](./tiered-liquidation.md)阶梯。

**最高水位线（High-water mark）。** 金库历史最高份额净值，用于门控绩效费累计。参见[金库](./vaults.md)。

## I

**IOC — 立即成交或取消（Immediate-Or-Cancel）。** TIF 类型，立即撮合可成交部分，未成交部分直接撤销。参见[订单类型](./order-types.md#time-in-force)。

**幂等性（Idempotency）。** 重复发送同一请求产生相同可观测结果的特性。参见[幂等性](../integration/idempotency.md)。

**保险池（Insurance pool）。** MFlux Vault 中专用于 T3 兜底赔付的资金子集。参见[金库](./vaults.md#insurance-pool)。

**逐仓保证金（Isolated margin）。** 每个资产设有独立保证金仓，亏损上限以该仓保证金为限。参见[保证金模式](./margin-modes.md)。

## L

**L2 订单簿（L2 book）。** 指定深度（每侧前 N 档）的订单簿快照。参见 [`l2_book` info](../api/rest/info/perpetuals.md#l2_book)。

**清算层级（Liquidation tier）。** [分级清算阶梯](./tiered-liquidation.md)中的各阶段：T0 黄牌警告、T1 部分清算、T2 全额清算、T3 兜底、T4 ADL 自动减仓。

**锁定期（Lock-up，质押/金库）。** 从发出解质押/提款信号到资金可用之间所需等待的时间。参见[质押](./staking.md)、[金库](./vaults.md)。

## M

**维持保证金（Maintenance margin）。** 保持仓位开立所需的最低抵押品。健康度 = `account_value / maint_margin`。参见[保证金模式](./margin-modes.md)。

**挂单方 / 吃单方（Maker / Taker）。** 挂单方提供流动性（挂单），吃单方消耗流动性（吃单成交），两者适用不同费率。参见[费率](./fees.md)。

**标记价格（Mark price）。** 协议用于计算保证金和清算的权威价格，由中间价、预言机价格和 EMA 的中位数合成。参见[标记价格](./mark-prices.md)。

**主账户（Master account）。** 动作执行时状态发生变更的账户，可由账户自身或已授权的代理钱包签名。参见[代理钱包](./agent-wallets.md)。

**MFlux Vault。** 协议运营的保险与做市资金池。参见[金库](./vaults.md#mflux-vault)。

**MIP — 市场改进提案（Market Improvement Proposal）。** 编号式协议改进提案（类似成熟链上永续合约协议采用的改进提案机制）。参见 [MIP](../mip/)。

**msgpack。** 二进制序列化格式。动作的签名载荷为 msgpack 字节。参见[签名](../integration/signing.md)。

**MTF。** MetaFlux 协议代币，用于质押、治理及费用销毁。

**多签（Multi-sig）。** 账户的 M-of-N 签名要求。参见[多签](./multi-sig.md)。

## N

**Nonce。** 每个发送方严格单调递增的 uint64，包含在每个动作中，用于防止重放攻击。参见[幂等性](../integration/idempotency.md)。

## O

**订单 ID（Oid）。** 服务端分配的 uint64，在 `Order` 响应及 `userEvents`/`orderEvents` 中返回。参见 [exchange.md](../api/rest/exchange.md)。

**预言机（Oracle）。** 通过时间加权平均从中心化交易所价格合成的外部价格源，作为标记价格和资金费率的输入。参见[标记价格](./mark-prices.md#the-oracle-c1-anchor)。

## P

**PnL。** 盈亏。分为未实现盈亏（持仓按标记价格盯市）和已实现盈亏（平仓成交后确认）。

**组合保证金（PM，Portfolio margin）。** 跨资产情景压力测试保证金模型，对对冲组合的资本利用率更高。参见[组合保证金](./portfolio-margin.md)。

**溢价指数（Premium index）。** `mid - oracle` 的 EMA，作为资金费率的计算输入。参见[资金费率](./funding-rates.md)。

## R

**只减仓（Reduce-only）。** 订单标志，若下单时会扩大仓位则直接拒绝。参见[订单类型](./order-types.md#reduce-only)。

**询价（RFQ — Request for Quote）。** 针对大额交易、不希望在公开订单簿上暴露的做市商报价流程。参见 [RFQ](./rfq.md)。

## S

**发送方（Sender）。** 在 `POST /exchange` 请求中状态发生变更的地址，可由地址本身或已授权的代理钱包签名。

**份额（Share，金库）。** 参与金库的计量单位；存款时按当前 `share_price` 铸造，提款时按当前 `share_price` 销毁。参见[金库](./vaults.md)。

**惩罚（Slashing）。** 验证者因双重签名或宕机而受到的惩处，将扣减验证者（及委托人）的质押量。参见[质押](./staking.md#slashing)。

**STP — 自成交预防（Self-Trade Prevention）。** 订单参数，用于设定当新订单与自身挂单发生撮合时的处理方式。参见[订单类型](./order-types.md#self-trade-prevention)。

**严格逐仓（Strict-Iso）。** 类似逐仓保证金模式，但额外将该仓位排除在任何组合保证金轧差之外。参见[保证金模式](./margin-modes.md)。

**子账户（Sub-account）。** 主账户下派生的账户，仓位与订单相互隔离，仅与主账户共享充值/提款通道。参见[子账户](./sub-accounts.md)。

## T

**吃单方（Taker）。** 流动性消耗方，即触发撮合、穿越订单簿的一侧。

**最小价格变动单位（Tick size）。** 市场价格的最小变动幅度，订单报价须与之对齐。

**TIF — 有效期类型（Time-In-Force）。** 订单参数：GTC / IOC / ALO / FOK。参见[订单类型](./order-types.md#time-in-force)。

**TPSL — 止盈止损（Take-Profit / Stop-Loss）。** 用于设置保护性止盈止损对的触发订单组合。参见[订单类型](./order-types.md#triggers)。

**TVL — 总锁仓量（Total Value Locked）。** 所有存款人在金库中的净资产总和。

**TWAP — 时间加权平均价格（Time-Weighted Average Price）。** 将大额订单按时间拆分执行的订单类型。参见[订单类型](./order-types.md#twap)。

## U

**市场列表（Universe）。** 协议当前活跃市场（永续合约 + 现货）的完整列表，由 `meta` 接口返回。

**未实现盈亏（Unrealised PnL）。** 持仓按标记价格盯市计算的盈亏，尚未通过平仓实现。

**USDC。** MetaFlux 市场的计价货币，通过 [MetaBridge](../bridge/) 进行跨链充提。

## V

**验证者（Validator）。** 共识参与者，负责提议区块并投票，从委托人奖励中抽取佣金，同时承担被惩罚的风险。

**金库（Vault）。** 由管理者签名权限控制的 USDC 资金池，采用份额铸造/销毁语义。参见[金库](./vaults.md)。

## W

**可提现余额（Withdrawable）。** 可从账户转出的空闲余额（不包括：作为持仓保证金占用的资金、逐仓仓位中锁定的资金、金库锁定的资金）。

## Y

**黄牌警告（T0）。** 第一清算层级。ALO 订单被取消，仓位保持不变，客户端收到通知。参见[分级清算](./tiered-liquidation.md#why-a-yellow-card)。
