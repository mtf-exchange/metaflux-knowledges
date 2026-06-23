# 交互时序

:::tip
**在开发网上线运行。** 区块节奏和交互时序 — CoreWriter 操作延迟和 Core→EVM 额度实现 — 按照描述正常运行。
节奏和预算在启动前仍可调整。
:::

每个 EVM↔Core 交互耗时，以便机器人可以推理确认窗口。

## 区块节奏

一个统一区块每共识轮次，在**亚秒级**节奏 — 没有单独的慢通道，所以交易、转账、CoreWriter 调用、预编译读取和合约部署都在同一轮次确认。`block.timestamp` 来自共识（见[执行模型](execution-model.md)）。

## EVM → Core（CoreWriter）

1. 合约调用 `sendRawAction`；调用消耗 gas 并立即发出 `RawAction`。
2. L1 在短**操作延迟**后消费该操作（已排队，不在同一时刻应用），然后将其应用于 Core 状态。
3. **没有 EVM 端确认** — 合约必须在 Core 上观察结果（例如通过 API / 后续预编译读取），而不是从 `sendRawAction` 返回。

设计含义：将 CoreWriter 操作视为**发送后确认**，永远不要视为同步调用。

## Core → EVM（额度）

Core→EVM 额度（`SpotCredit` / `BridgeMint`）在**随后**区块上作为系统伪交易具体化，按 L1 轮次排序并由弹性每块系统 gas 切片限制（见[Core ↔ EVM 转账](core-evm-transfers.md)）。在触发它的同一区块中**不**可见；预期在少数几个区块内出现。

## 预编译读取

`staticcall` 预编译读取在调用块内返回。现在读取预编译是**无状态报价**辅助函数（它们在调用者提供的输入上计算）；**由 Core 状态支持的实时读取**（直接查询链自身的头寸 / 簿）即将推出，此时读取反映的是调用块时的 Core。

## 另见

- [执行模型](execution-model.md)
- [Core ↔ EVM 转账](core-evm-transfers.md)
- [与 Core 交互](interacting-with-core.md)
