# 与 Core 交互

:::tip
**已在 devnet 上线。** CoreWriter 操作已可用，无状态 MTF 衍生品预编译(`0x0900`–`0x0904`) 也已可用。Core 状态支持的读预编译（直接查询链上自身头寸/订单簿）和跨链预编译即将推出。网桥（[Bridge](../bridge/)）已上线。
:::

MetaFlux EVM 上的合约在两个方向上与 **Core**（L1 永续期货清算所 + 链上 CLOB）通信：

- **读取** — `staticcall` 系统**预编译**以获取 Core 衍生值。
- **写入** — 调用 **CoreWriter** 系统合约以提交 L1 操作。

读预编译/写合约的分离使 EVM 合约能够直接与实时 L1 状态组合 — 针对链自身公式进行报价，然后对清算所采取行动 — 无需离开虚拟机。

## 写入 Core — CoreWriter

通过调用位于 `0x3333333333333333333333333333333333333333` 的 **CoreWriter** 来提交 L1 操作：

```solidity
interface ICoreWriter {
    /// 每次成功调用时触发；L1 扫描器会处理此日志。
    event RawAction(address indexed user, bytes data);

    /// selector = keccak256("sendRawAction(bytes)")[0..4] = 0x17938e13
    function sendRawAction(bytes calldata data) external;
}
```

`data` 是一个版本和 id 前缀的有效载荷：

```
data = abi.encodePacked(
    uint8(1),            // version (currently 1)
    uint24(actionId),    // action id, big-endian (1..=20)
    abi.encode(params)   // the action's ABI-encoded parameters
);
```

执行账户是 `msg.sender`（调用合约）。经过短暂的操作延迟后，L1 将分派解码的操作。

:::info
**原子性。** `sendRawAction` 调用只是消耗 gas 并触发 `RawAction`。任何 L1 端在之后**之后**的失败都是无声的 — **没有 EVM 回滚**。合约必须自我恢复，并将 `RawAction` 事件视为 EVM 调用与 L1 结果之间的唯一因果链接。
:::

### 操作

CoreWriter 公开 20 个 L1 操作（id，大端序，在上面的 `uint24` 插槽中）：

| id | 操作 | 用途 |
|---:|--------|---------|
| 1 | `LimitOrder` | 在永续/现货市场上放置限价单 |
| 2 | `VaultTransfer` | 存入/从保险库提取 |
| 3 | `TokenDelegate` | 将权益委托给验证者 |
| 4 | `StakingDeposit` | 将代币移入质押余额 |
| 5 | `StakingWithdraw` | 将代币从质押余额中移出 |
| 6 | `SpotSend` | 将现货代币转移到另一个账户 |
| 7 | `UsdClassTransfer` | 在永续和现货类账户之间移动 USDC |
| 8 | `FinalizeEvmContract` | 将 EVM 合约链接到其 Core 代币/合约 id |
| 9 | `AddApiWallet` | 授权子密钥（代理钱包）用于交易 |
| 10 | `CancelByOid` | 按服务器订单 id 取消订单 |
| 11 | `CancelByCloid` | 按客户端订单 id 取消订单 |
| 12 | `ApproveBuilderFee` | 授权生成者收取（受限）费用 |
| 13 | `SendAsset` | 通用资产转移（永续/现货/保险库） |
| 14 | `ReflectEvmSupplyChange` | 将 EVM 端 ERC-20 供应变化同步到 Core |
| 15 | `BorrowLend` | 开启/关闭借贷头寸 |
| 16 | `PortfolioMarginEnroll` | 选择加入/退出跨资产投资组合保证金 |
| 17 | `RfqSubmit` | 提交 RFQ 报价（id、市场、方向、规模、限价） |
| 18 | `FbaConfigure` | 每市场频繁批处理拍卖配置 |
| 19 | `CrossChainSend` | 链无关的跨链转移（排队到 [MetaBridge](../bridge/)） |
| 20 | `EncryptedOrderSubmit` | 阈值加密订单（承诺 + 密文） |

类型化参数结构和易用的 Solidity 调用方位于公共 [`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) 仓库；链上 `0x3333…` 处的 CoreWriter 是生产目标（在测试中，确定性 Solidity 替代品触发相同的 `RawAction` 有效载荷）。

## 读取 Core — 预编译

每个预编译是到固定地址的 `staticcall`，包含手工编制的、大端序的**打包**输入（不是 Solidity ABI）。大小和价格在 **1e8 定点**平面上（`px_e8`, `size_e8`）；USDC 保证金为 **1e6**。

| 地址 | 预编译 | 返回值 |
|---------|------------|---------|
| `0x0900` | `portfolio_margin_eval` | SPAN 类似的所需维持保证金、最坏情况场景指数、集中度惩罚 |
| `0x0901` | `vault_nav` | 保险库总净资产、总份额、每份净资产、未实现损益 |
| `0x0902` | `adl_pro_rata_price` | 给定规模的 ADL 成交的 VWAP，按方向优先级遍历队列 |
| `0x0903` | `mark_settle` | 每头寸损益增量、新累积资金费率、以标记价格计的未实现损益 |
| `0x0904` | `rfq_book_depth` | RFQ 订单簿深度（按方向过滤、受限深度） |
| `0x0906` | `clob_bbo` | 最佳买价/最佳卖价 + 规模（订单簿顶部） |
| `0x0907` | `clob_l2_depth` | 每方向的前 N 个聚合 `(price, size)` 水平 |
| `0x0908` | `inventory_risk` | 净/总名义价值、集中度、风险上限门 |

这些是**无状态报价**预编译：调用方传递输入（头寸、队列水平、报价等），预编译返回计算结果，因此合约可以使用链自身公式离线复现 Core 计算。**实时 Core 状态支持的读取**（直接查询链自身头寸/订单簿）即将推出。

## Core ↔ EVM 价值转移

- **进入 Core** 来自 EVM 合约：`SpotSend` / `SendAsset` / `UsdClassTransfer` / `VaultTransfer` 通过 CoreWriter（见上）。
- **跨链**：`CrossChainSend` 排队到 [MetaBridge 托管网桥](../bridge/)，在 ⅔ 验证者共同签名后在目标链上释放。

## 另见

- [Bridge](../bridge/) — 跨链托管（`CrossChainSend` 目标）
- [Mark prices](../concepts/mark-prices.md) — 预编译使用的 1e8 定点价格平面
- [Portfolio margin](../concepts/portfolio-margin.md) / [ADL](../concepts/adl.md) — `0x0900` / `0x0902` 预编译引用的 Core 数学
