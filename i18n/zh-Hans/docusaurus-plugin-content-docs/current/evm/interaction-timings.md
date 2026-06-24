# 交互时序

:::tip
**已在 devnet 上线。** 区块节奏与交互时序——CoreWriter action 延迟，以及 Core→EVM 资产到账——均按本文所述正常运行。节奏参数和配额在正式上线前可能仍会调整。
:::

本文说明 EVM↔Core 各类交互所需的时间，帮助机器人合理推断确认窗口。

## 区块节奏

每轮共识产出一个统一区块，节奏达到**亚秒级**——不存在单独的慢速通道，因此交易、转账、CoreWriter 调用、预编译读取以及合约部署均在同一轮次内确认。`block.timestamp` 由共识层衍生（参见[执行模型](execution-model.md)）。

## EVM → Core（CoreWriter）

1. 合约调用 `sendRawAction`，该调用立即消耗 gas 并触发 `RawAction` 事件。
2. L1 在短暂的 **action-delay** 后消费该 action（action 会先进入队列，不会在同一时刻立即生效），随后将其应用到 Core 状态。
3. **EVM 侧不会返回确认**——合约必须通过 Core 侧观察执行结果（例如通过 API 或后续的预编译读取），而不能依赖 `sendRawAction` 的返回值。

设计含义：请将 CoreWriter action 视为**发出即等后续确认**的异步操作，切勿当作同步调用处理。

## Core → EVM（资产到账）

Core→EVM 到账（`SpotCredit` / `BridgeMint`）以系统伪交易的形式在**后续**区块中落账，按 L1 轮次排序，并受每块弹性系统 gas 配额限制（参见 [Core ↔ EVM 转账](core-evm-transfers.md)）。到账结果**不会**出现在触发它的同一区块中，预计在若干个区块内完成。

## 预编译读取

`staticcall` 预编译读取在当前调用区块内返回结果。目前预编译读取功能均为**无状态报价**辅助接口（基于调用方传入的参数进行计算）；**基于 Core 实时状态的读取**（直接查询链上持仓/订单簿）即将上线，届时读取结果将反映调用区块对应的 Core 状态。

## 另请参阅

- [执行模型](execution-model.md)
- [Core ↔ EVM 转账](core-evm-transfers.md)
- [与 Core 交互](interacting-with-core.md)
