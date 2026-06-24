# EVM

:::tip
**已在 Devnet 上线。** EVM 执行与 CoreWriter 操作均已可用，无状态 MTF 衍生品预编译合约（`0x0900`–`0x0904`）同样可用。基于链上状态的读取预编译（直接查询链上持仓与订单簿）以及跨链预编译即将推出。[跨链桥](../bridge/) 已上线。
:::

MetaFlux EVM 是一条基于 [revm](https://github.com/bluealloy/revm) 的**侧链**，可运行普通 Solidity 合约，并将 MetaFlux **Core**（L1 永续合约清算中心与链上 CLOB）暴露给这些合约使用——这是一套直接与其结算的 L1 相连的 EVM 执行层。

## 与标准 EVM 的区别

- **统一区块，并行分层** — 每个共识轮次生成一个区块（亚秒级）；区块内的交易被拆分为并行冲突分层（conflict-strata），吞吐量随 CPU 核心数线性扩展，即便是合约部署也能在下一个区块内确认（无需等待 60 秒的重型区块通道）。详见[执行模型](execution-model.md)。
- **内置 Core 访问** — 合约通过**系统预编译**读取 Core，通过 **CoreWriter** 系统合约写入 Core。详见[与 Core 交互](interacting-with-core.md)。
- **确定性执行** — 时间戳由共识层注入，无浮点运算，并行执行并提交与顺序执行等价的最终状态。
- **EIP-1559 基础费销毁** — 基础费销毁至销毁地址 coinbase。

## 文档页面

| 页面 | 内容 |
|------|------|
| [执行模型](execution-model.md) | 统一区块、并行冲突分层、Gas 与费用、抗 MEV 交易机制 |
| [与 Core 交互](interacting-with-core.md) | CoreWriter 写入路径（20 种操作）及读取预编译 |
| [Core ↔ EVM 资金划转](core-evm-transfers.md) | 在 Core 与 EVM 之间转移资金（含跨链） |
| [交互时序](interaction-timings.md) | CoreWriter 操作与 Core→EVM 入账的实际生效时机 |

## 系统地址（速查）

| 地址 | 用途 |
|---------|------|
| `0x3333…3333` | **CoreWriter** — 提交 L1 操作（`sendRawAction`） |
| `0x0900`–`0x0904` | 衍生品读取预编译（保证金、净资产值、ADL、标记结算价、RFQ） |
| `0x0906`–`0x0908` | 行情数据读取预编译（最优买卖价、L2 深度、库存风险） |
| `0x0a01`–`0x0a02` | 跨链预编译（发送 / 验证） |

## JSON-RPC

通过网关的 `POST /evm` 端点访问标准 `eth_*` JSON-RPC 接口；链自身的 ID 可通过 `eth_chainId` 查询（详见[网络与链 ID](../networks.md)）。可部署的合约示例存放于公开的 [`metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) 仓库。
