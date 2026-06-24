# 签名流程概览

:::info
**本页已迁移。** `/exchange` 操作使用 **EIP-712 结构化类型数据**（`eth_signTypedData_v4`）进行签名，这是唯一的签名方案。完整的端到端说明——包括域定义、各操作的类型字符串、摘要计算、示例演示及本地验证方法——现已移至
[**类型化数据签名**](./typed-data-signing.md)。
:::

每个 `/exchange` 请求均采用 EIP-712 类型化数据签名：钱包按字段名逐一呈现每个操作字段，服务端根据 `action.type` 与 `action.params` 重建类型化结构体，重新计算摘要，并还原出签名方（即账户本身，或其授权的[代理钱包](../concepts/agent-wallets.md)）。此处不存在第二种可供选择的签名方案。

完整规范及可直接复用的 TypeScript / Python 示例，请前往[**类型化数据签名**](./typed-data-signing.md)。

## 参见

- [类型化数据签名](./typed-data-signing.md) — 签名方案的完整端到端说明
- [`POST /exchange`](../api/rest/exchange.md) — 该端点的接口文档
- [代理钱包](../concepts/agent-wallets.md) — 多签名者配置
- [幂等性](./idempotency.md) — nonce 策略与重试机制
- [错误码](../api/errors.md) — 签名接入过程中可能遇到的所有错误
- [网络](../networks.md) — 各网络对应的 chainId
