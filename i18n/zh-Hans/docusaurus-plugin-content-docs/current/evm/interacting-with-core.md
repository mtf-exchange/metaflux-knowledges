# 与 Core 交互

:::tip
**已在 Devnet 上线。** CoreWriter 操作已可用，MTF 衍生品无状态预编译合约（`0x0900`–`0x0904`）也已就绪。基于 Core 状态的读取预编译——直接查询链上持仓与订单簿——以及跨链预编译即将推出。跨链桥（[Bridge](../bridge/)）已正式上线。
:::

MetaFlux EVM 上的合约通过两个方向与 **Core**（L1 永续合约清算中心 + 链上 CLOB）交互：

- **读取** — 通过 `staticcall` 调用系统**预编译合约**，获取 Core 派生的数据。
- **写入** — 调用 **CoreWriter** 系统合约，向 L1 提交操作指令。

读取预编译 / 写入合约的分层设计，让 EVM 合约可以直接与 L1 实时状态组合使用——基于链上原生公式进行报价，再将操作提交至清算中心，全程无需离开虚拟机。

## 向 Core 写入 — CoreWriter

通过调用地址 `0x3333333333333333333333333333333333333333` 处的 **CoreWriter**，可提交 L1 操作：

```solidity
interface ICoreWriter {
    /// Emitted on every successful call; the L1 scanner consumes this log.
    event RawAction(address indexed user, bytes data);

    /// selector = keccak256("sendRawAction(bytes)")[0..4] = 0x17938e13
    function sendRawAction(bytes calldata data) external;
}
```

`data` 是带有版本号和操作 ID 前缀的载荷：

```
data = abi.encodePacked(
    uint8(1),            // version (currently 1)
    uint24(actionId),    // action id, big-endian (1..=20)
    abi.encode(params)   // the action's ABI-encoded parameters
);
```

执行账户为 `msg.sender`（即调用方合约）。L1 在短暂的操作延迟后，会对解码后的操作进行分发处理。

:::info
**原子性说明。** `sendRawAction` 调用仅消耗 Gas 并触发 `RawAction` 事件。该调用**之后**发生的任何 L1 端失败都是静默的——**不会触发 EVM 回滚**。合约必须自行处理异常，并将 `RawAction` 事件视为 EVM 调用与 L1 执行结果之间唯一的因果链接。
:::

### 操作列表

CoreWriter 共暴露 20 个 L1 操作（ID 为大端序，填入上方 `uint24` 字段）：

| id | Action | Purpose |
|---:|--------|---------|
| 1 | `LimitOrder` | 在永续合约或现货市场挂限价单 |
| 2 | `VaultTransfer` | 向金库存入资金或从金库提取资金 |
| 3 | `TokenDelegate` | 将质押代币委托给验证节点 |
| 4 | `StakingDeposit` | 将代币转入质押余额 |
| 5 | `StakingWithdraw` | 将代币从质押余额中取出 |
| 6 | `SpotSend` | 将现货代币转账至另一账户 |
| 7 | `UsdClassTransfer` | 在永续合约账户与现货账户之间划转 USDC |
| 8 | `FinalizeEvmContract` | 将 EVM 合约与其 Core 代币 / 合约 ID 绑定 |
| 9 | `AddApiWallet` | 授权子密钥（代理钱包）进行交易 |
| 10 | `CancelByOid` | 按服务端订单 ID 撤销订单 |
| 11 | `CancelByCloid` | 按客户端订单 ID 撤销订单 |
| 12 | `ApproveBuilderFee` | 授权 builder 收取（上限内的）手续费 |
| 13 | `SendAsset` | 通用资产划转（永续合约 / 现货 / 金库） |
| 14 | `ReflectEvmSupplyChange` | 将 EVM 端 ERC-20 供应量变动同步至 Core |
| 15 | `BorrowLend` | 开立或平仓借贷头寸 |
| 16 | `PortfolioMarginEnroll` | 为发送方开启或关闭跨资产组合保证金模式 |
| 17 | `RfqSubmit` | 提交 RFQ 报价（ID、市场、方向、数量、限价） |
| 18 | `FbaConfigure` | 按市场配置高频批量拍卖参数 |
| 19 | `CrossChainSend` | 链无关的跨链转账（进入 [MetaBridge](../bridge/) 队列） |
| 20 | `EncryptedOrderSubmit` | 门限加密订单（承诺 + 密文） |

带类型的参数结构体及开箱即用的 Solidity 调用代码，均已收录于公开的
[`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) 仓库；
链上 CoreWriter（`0x3333…`）为生产环境目标地址（在测试环境中，一个确定性的 Solidity 替代实现会发出相同的 `RawAction` 载荷）。

## 读取 Core — 预编译合约

每个预编译合约均通过 `staticcall` 调用固定地址，使用手动构造的大端序**紧凑编码**输入（非 Solidity ABI 格式）。数量与价格均基于 **1e8 定点数**平面（`px_e8`、`size_e8`）；USDC 保证金精度为 **1e6**。

| Address | Precompile | Returns |
|---------|------------|---------|
| `0x0900` | `portfolio_margin_eval` | SPAN 类维持保证金要求、最差情景索引、集中度惩罚 |
| `0x0901` | `vault_nav` | 金库总 NAV、总份额、每份 NAV、未实现盈亏 |
| `0x0902` | `adl_pro_rata_price` | 按指定数量执行 ADL 时的 VWAP 成交价（按方向优先级逐级穿越队列） |
| `0x0903` | `mark_settle` | 各头寸盈亏变动、新累积资金费率、按标记价计算的未实现盈亏 |
| `0x0904` | `rfq_book_depth` | RFQ 订单簿深度（按方向过滤，深度上限截断） |
| `0x0906` | `clob_bbo` | 最优买价 / 最优卖价及其对应数量（盘口） |
| `0x0907` | `clob_l2_depth` | 每侧前 N 档聚合 `(price, size)` 价位数据 |
| `0x0908` | `inventory_risk` | 净/总名义价值、集中度、风险上限门控 |

目前这些均为**无状态报价**预编译：调用方传入输入参数（持仓、队列档位、报价等），预编译返回计算结果，从而让合约能够复现 Core 基于链上公式的计算逻辑。**基于 Core 实时状态的读取**（直接查询链上持仓与订单簿）即将推出。

## Core ↔ EVM 资产划转

- **从 EVM 合约转入 Core**：通过 CoreWriter 调用 `SpotSend` / `SendAsset` / `UsdClassTransfer` / `VaultTransfer`（见上文）。
- **跨链转账**：`CrossChainSend` 进入 [MetaBridge 托管跨链桥](../bridge/) 队列，在目标链上由 ⅔ 验证节点联署后释放资金。

## 延伸阅读

- [Bridge](../bridge/) — 跨链托管（`CrossChainSend` 的目标端）
- [标记价格](../concepts/mark-prices.md) — 预编译合约所使用的 1e8 定点数价格平面
- [组合保证金](../concepts/portfolio-margin.md) / [ADL](../concepts/adl.md) — `0x0900` / `0x0902` 预编译所引用的 Core 计算逻辑
