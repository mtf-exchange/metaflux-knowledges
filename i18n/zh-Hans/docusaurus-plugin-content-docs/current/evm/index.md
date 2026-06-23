# EVM

:::tip
**已在 devnet 上线。** EVM 执行和 CoreWriter 操作正常运行，无状态 MTF 衍生品预编译（`0x0900`–`0x0904`）也已启用。核心状态支持的读预编译（直接查询链上的仓位/订单簿）和跨链预编译即将上线。[bridge](../bridge/) 已上线。
:::

MetaFlux EVM 是一个基于 [revm](https://github.com/bluealloy/revm) 的**侧链**，可以运行普通的 Solidity 合约，并将 MetaFlux **Core** ——  L1 永续合约清算所和链上 CLOB —— 暴露给这些合约：一个直接连接到其清算的 L1 的 EVM 执行层。

## 与标准 EVM 的区别

- **统一区块、平行分层** —— 每个共识轮一个区块（亚秒级）；该区块的交易被分区到平行冲突分层中，因此吞吐量随着核心数扩展，甚至合约部署在下一个区块确认（没有 60 秒的重区块通道）。参见 [Execution model](execution-model.md)。
- **内置 Core 访问** —— 合约通过**系统预编译**读取 Core，通过 **CoreWriter** 系统合约写入 Core。参见 [Interacting with Core](interacting-with-core.md)。
- **确定性** —— 共识注入的时间戳，无浮点数，平行执行与顺序等价的提交状态。
- **EIP-1559 基础费用销毁**到销毁地址 coinbase。

## 页面

| 页面 | 说明 |
|------|------|
| [Execution model](execution-model.md) | 统一区块、平行冲突分层、gas/费用、抗 MEV 交易 |
| [Interacting with Core](interacting-with-core.md) | CoreWriter 写入路径（20 个操作）+ 读预编译 |
| [Core ↔ EVM transfers](core-evm-transfers.md) | 在 Core 和 EVM（及跨链）之间转移价值 |
| [Interaction timings](interaction-timings.md) | CoreWriter 操作/Core→EVM 额度何时实际到达 |

## 系统地址（概览）

| 地址 | 角色 |
|---------|------|
| `0x3333…3333` | **CoreWriter** —— 提交 L1 操作（`sendRawAction`）|
| `0x0900`–`0x0904` | 衍生品读预编译（保证金、NAV、ADL、mark-settle、RFQ）|
| `0x0906`–`0x0908` | 市场数据读预编译（BBO、L2 深度、库存风险）|
| `0x0a01`–`0x0a02` | 跨链预编译（send / verify）|

## JSON-RPC

标准 `eth_*` JSON-RPC 在网关的 `POST /evm`；链通过 `eth_chainId` 报告其自身 id（参见 [Networks & chain IDs](../networks.md)）。可部署的合约位于公开 [`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) repo 中。
