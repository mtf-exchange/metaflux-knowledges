# Core ↔ EVM 资产转移

:::tip
**已在 Devnet 上线。** EVM→Core 资产转移操作（通过 CoreWriter 发起的 `SpotSend`、`SendAsset`、`UsdClassTransfer`、`VaultTransfer`）以及 Core→EVM 的余额充值均已上线并完成测试。[跨链桥](../bridge/)（跨链托管）已同步上线。
:::

资产在 **Core**（L1 清算所 / 现货账本）与 **EVM** 侧之间双向流动，两个方向均为确定性操作，且均以账户为作用域。

## EVM → Core（通过 CoreWriter）

合约通过 [CoreWriter](interacting-with-core.md#writing-to-core--corewriter)（`0x3333…3333`）提交 L1 操作，将资产推送到 Core。操作发起方为调用合约自身（`msg.sender`）：

| 操作 | 效果 |
|--------|--------|
| `SpotSend` | 向 Core 上的另一账户转移现货代币 |
| `SendAsset` | 通用资产转移（适用于永续合约、现货、金库等资产类别） |
| `UsdClassTransfer` | 在永续合约账户与现货账户之间划转 USDC |
| `VaultTransfer` | 向金库充值或从金库提取资产 |

上述操作均受 CoreWriter 原子性规则约束：调用将消耗 gas 并触发 `RawAction` 事件；L1 侧的后续处理失败为**静默失败**（不会触发 EVM 回滚）。

## Core → EVM（系统伪交易）

当 L1 区块初始化阶段产生的结算效果需要落地到 EVM 侧时——例如，现货转账的接收方为 EVM 侧地址，或跨链桥入金铸造——该操作将被加入队列，并在**下一个 EVM 区块中以确定性系统伪交易**的形式执行：

| 操作 | 来源 | 金额精度 |
|----|--------|--------------|
| `SpotCredit` | L1 现货余额充值至 20 字节的 EVM 接收方地址 | `1e8` 定点数 |
| `BridgeMint` | [MetaBridge](../bridge/) 入金铸造（例如 USDC） | `1e6`（USDC 原生精度） |

排序与吞吐量说明：

- 按 **L1 轮次**入队，依轮次升序依次消费，同一轮次内按先进先出（FIFO）顺序处理——两个验证节点以相同顺序执行相同操作，确保确定性。
- 每笔操作均计算**系统 gas** 成本，并从**弹性的单区块系统 gas 配额**中扣除（该配额随区块 gas 上限动态调整）；未处理完的操作将顺延至下一区块。Core→EVM 充值预计在数个区块内到账，不会在触发的同一区块内即时生效。

## 跨链转账（独立的操作界面）

`CrossChainSend`（CoreWriter 操作码 19）**不会**将资产转移到本地 EVM——它将提款请求加入 [MetaBridge 托管跨链桥](../bridge/)的队列，目标链（Base / Solana）的资产释放需经过 ⅔ 验证节点联合签名，并须通过一段争议窗口期。

## 参见

- [与 Core 交互](interacting-with-core.md)
- [交互时序](interaction-timings.md)
- [跨链桥](../bridge/)
