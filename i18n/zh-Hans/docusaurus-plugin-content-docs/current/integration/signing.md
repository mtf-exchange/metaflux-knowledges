# 签名演练

:::info
**本页已移动。** `/exchange` 操作使用 **结构化 EIP-712 类型数据** (`eth_signTypedData_v4`) 签署。这是唯一的签名方案。端到端演练——域、各操作类型字符串、摘要、实际工作示例和本地验证——现已移至 [**类型数据签名**](./typed-data-signing.md)。
:::

每个 `/exchange` 请求都是一个 EIP-712 类型数据签名：钱包按名称呈现每个操作字段，服务器从 `action.type` + `action.params` 重建类型化结构，重新计算摘要，并恢复签署者（帐户或其已批准的 [代理](../concepts/agent-wallets.md)）。没有第二种方案可供选择。

有关完整规范和可复制的 TypeScript / Python 示例，请转到 [**类型数据签名**](./typed-data-signing.md)。

## 另请参阅

- [类型数据签名](./typed-data-signing.md) — 签名方案，端到端
- [`POST /exchange`](../api/rest/exchange.md) — 端点
- [代理钱包](../concepts/agent-wallets.md) — 多签署者设置
- [幂等性](./idempotency.md) — nonce 策略 + 重试
- [错误](../api/errors.md) — 签名推出过程中可能遇到的每个错误
- [网络](../networks.md) — 每个网络的 chainId
