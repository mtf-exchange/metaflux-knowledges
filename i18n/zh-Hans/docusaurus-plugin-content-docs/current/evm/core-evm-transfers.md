# Core ↔ EVM 转账

:::tip
**在 devnet 上线。** EVM→Core 的价值转移操作（`SpotSend`、`SendAsset`、
`UsdClassTransfer`、`VaultTransfer` via CoreWriter）和 Core→EVM 信用
实现已可运行并已测试。[bridge](../bridge/)（跨链托管）已上线。
:::

价值在两个方向上的 **Core**（L1 清算所 / 现货账本）和 **EVM**
端之间流动。两者都是确定性的且账户作用域的。

## EVM → Core（via CoreWriter）

合约通过 [CoreWriter](interacting-with-core.md#writing-to-core--corewriter)（`0x3333…3333`）提交 L1 操作来将价值推入 Core。
执行账户是调用合约（`msg.sender`）：

| 操作 | 效果 |
|--------|--------|
| `SpotSend` | 将现货代币转移到 Core 上的另一个账户 |
| `SendAsset` | 通用资产转移（perp / spot / vault 类） |
| `UsdClassTransfer` | 在 perp 和 spot 类账户之间移动 USDC |
| `VaultTransfer` | 存入 / 从保险库中取出 |

这些操作受 CoreWriter 原子性规则的约束：调用会燃烧 gas + 发出
`RawAction`；之后任何 L1 端失败都是**无声的**（无 EVM 回滚）。

## Core → EVM（系统伪交易）

当 L1 begin-block 效果需要在 EVM 端落地时——例如 recipient 是 EVM 端地址的现货发送，或者桥接入站 mint——它会被排队
并在**下一个 EVM 区块上实现为确定性系统伪交易**：

| 操作 | 来源 | 金额标度 |
|----|--------|--------------|
| `SpotCredit` | 记入到 20 字节 EVM recipient 的 L1 现货余额 | `1e8` 定点 |
| `BridgeMint` | [MetaBridge](../bridge/) 入站 mint（例如 USDC） | `1e6`（USDC 原生） |

排序 + 吞吐量：

- 由 **L1 轮次** 排队，按升序轮次顺序、轮次内 FIFO 的顺序排出——
  因此两个验证者以相同的顺序实现相同的操作（确定性）。
- 每个操作都要计入 **system-gas** 成本，并根据 **弹性
  per-block system-gas 片段** 排出（它随区块 gas 预算缩放）；剩余操作
  进入下一个区块。预计 Core→EVM 信用将在几个
  区块内落地，而不是在触发它们的同一个区块中立即落地。

## 跨链（不同的表面）

`CrossChainSend`（CoreWriter 操作 19）**不**将价值转移到本地 EVM——
它将撤回排队到 [MetaBridge 托管桥接](../bridge/)，在目标链（Base / Solana）上由 ⅔ 验证者共同签名
在争议窗口后释放。

## 另请参阅

- [与 Core 交互](interacting-with-core.md)
- [交互时序](interaction-timings.md)
- [Bridge](../bridge/)
