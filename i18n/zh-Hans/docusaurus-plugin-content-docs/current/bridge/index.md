# 跨链桥

:::info
**状态。** MetaBridge USDC 托管跨链桥**已在 Base Sepolia 测试网上线**（`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af)），Solana 托管程序同样以相同模型运行于 **devnet**。两个方向均已在 Base Sepolia 上完成端到端验证：实际充值流程（监听器 → 联署 → 自动注册联署方 → ⅔ 权重法定人数确认入账）和完整的提现往返流程（L1 联署 → 中继循环 → 链上 `batchWithdraw` → 争议窗口 → `claim`）。已加固项包括：Gas 分摊的 `batchWithdraw`/`batchClaim`、部分成功批处理、双重时间+区块数争议窗口、验证者热/冷密钥隔离、两阶段验证者轮换机制（窗口期内任意单一热验证者可 **cancel** 一票否决）、以及跨 EVM 合约、Solana 程序和 L1 精确到字节的域+纪元绑定签名（跨语言已知答案向量验证）。Arbitrum 上线和主网前安全审计仍在推进中。
:::

MetaFlux 通过 **MetaBridge** 完成**所有资产（包括 USDC）的跨链转移**。MetaBridge 是一个由 MetaFlux 验证者签名的托管式跨链桥（等同于 HL-Bridge2 模型）。关键路径上**不依赖任何第三方跨链桥，也不依赖 Circle CCTP**。

## 为什么选择托管模式而非 CCTP

CCTP 只能在 Circle 已纳入 CCTP *域*的链之间转移 USDC。MetaFlux 是一条独立 L1；能否被添加为 CCTP 域，取决于 Circle 的商业决策，这不是我们能控制的。一条充值路径若需要第三方的许可才能存在，就不是可靠的基础设施。因此，MetaFlux 运营自己的托管跨链桥，其**信任假设与链本身完全一致**——无需外部委员会、守护者网络或任何门卫角色。

## 模型

**源链上的托管 Bridge 合约**（首先在 Base 上线）持有用户存入的代币。MetaFlux 验证者监听存款事件并在 L1 上入账；提现则由合约通过 ⅔ 权重验证者联署集（须经过争议窗口）完成释放。

### 充值（源链 → MetaFlux）

```
Base:
  1. user.approve(USDC, bridge)
  2. bridge.deposit(mtfDest, amount)        // USDC pulled into custody
  3. bridge emits Deposit{user, mtfDest, amount, nonce, …}

MetaFlux:
  4. each validator observes the Deposit event and submits an mbAttest
     (an Inbound MetaBridgeMsg partial co-signature) — validator authority,
     NEVER the public /exchange path
  5. on ⅔ stake-weighted quorum the L1 credits the user's USDC cross-collateral
     (the same system-credit primitive the faucet uses); each deposit credits
     EXACTLY ONCE (idempotent by message id)
```

`Deposit` 事件与 L1 确定性 `message_id` 在字节层面完全兼容：
`keccak256(chain ‖ direction ‖ user ‖ asset ‖ amount ‖ dst ‖ nonce)`。

### 提现（MetaFlux → 源链）

```
MetaFlux:
  1. user submits a withdraw action (Outbound MetaBridgeMsg)
  2. validators co-sign it to ⅔ quorum; the L1 retains the signature set in
     meta_bridge.mb_outbox + finalized_cosignatures

Base (two-phase: request → claim):
  3. each validator's RELAY LOOP polls the committed L1 state and submits a
     batchWithdraw(...) tx — signed with the validator's OWN key, gas paid by the
     validator's EVM address (no separate relayer key). The contract recovers
     each entry's signers, sums HOT-set stake, requires ≥⅔, and QUEUES it into
     the dispute window. A bad/raced entry in the batch is skipped (FailedWithdrawal
     event), not reverted.
  4. after BOTH the dispute window (seconds) AND a minimum block count elapse,
     claim(id) / batchClaim(ids) releases USDC to the user. Any single validator
     can dispute(id) a queued withdrawal, or the COLD ⅔-quorum can
     invalidateWithdrawal(id), as an emergency revoke during the window.
```

## 安全模型

- **权威性** — ⅔ 权重的 MetaFlux 验证者多签（secp256k1，与保障共识的密钥相同；法定人数为 `6700` bps）。验证者多签 + 提现争议窗口是安全的核心支柱：一旦桥接密钥被攻破即意味着资金损失，因此合约将接受与共识/签名相同级别的审查，并在主网前完成安全审计。
- **防重放** — 每个 `message_id` 只被执行一次，通过链/源 nonce 经济标识进行唯一标记，确保即使经历验证者集轮换，每笔充值也只入账一次；L1 和合约两侧均强制执行（`withdrawalSeen` / Solana 永久消费标记）。签名绑定域和纪元，因此联署不能在不同的部署、链或验证者集纪元之间重放。
- **治理与轮换** — 无管理员账户；所有特权操作均需验证者联署。验证者集轮换采用两阶段机制（申请 → 在争议窗口后最终确认）；窗口期内任意**单一**热验证者均可 `pause`（受单个验证者冷却时间限制），或直接 **cancel** 待定的轮换，从而防止被攻破的治理法定人数悄无声息地替换验证者集。在 Solana 上，同一验证者集支持单一验证者 `pause`/`dispute` 和法定人数 `unpause` / `invalidateWithdrawal` 等紧急操作接口。
- **隔离于 `/exchange`** — 充值入账通过验证者系统路径注入，在结构上无法从面向用户的公开 `/exchange` 接口触达，且仅在活跃验证者集范围内进行统计。
- **托管注意事项** — MetaFlux 上的 USDC 是由源链合约余额背书的桥接凭证，并非 Circle 在 MetaFlux 上的原生 USDC（与 HL 模型相同）。

## 部署情况

| 网络 | 合约 | 地址 |
|---------|----------|---------|
| Base **Sepolia** | `MetaBridgeUSDC` (v3) | [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af) |
| Solana **devnet** | `metabridge-solana` | [`Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB`](https://solscan.io/account/Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB?cluster=devnet) |
| Base / Solana 主网 | — | （审计前） |

托管 Circle 的 Base Sepolia USDC（`0x036CbD…f3dCF7e`）；**⅔ 权重验证者集，无管理员**（所有特权操作均需验证者联署），300 秒 + 150 区块的双重争议窗口。域分离 + 纪元绑定签名。合约及部署操作手册存放于 [`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts) 仓库；L1 侧的联署/入账逻辑保留在节点中。目前为审计前测试网，**请勿用于承载真实价值的场景**。

## 合约方法

### Base — `MetaBridgeUSDC`（EVM）

| 方法 | 授权方 | 用途 |
|--------|---------------|---------|
| `deposit(mtfDest, amount)` | 任意账户（存款方） | 将 USDC 拉入托管，触发 `Deposit` 事件供验证者进行证明 |
| `withdraw(...)` / `batchWithdraw(reqs)` | 任意中继方（须提供**热 ⅔** 联署集） | 验证法定人数并将提现请求加入争议窗口队列 |
| `claim(mid)` / `batchClaim(mids)` | 任意账户 | 在双重时间+区块窗口到期后释放已成熟的 USDC（不可暂停） |
| `dispute(mid)` | 任意单一**热**验证者 | 在争议窗口内取消已排队的提现 |
| `cancelValidatorSetUpdate()` | 任意单一**热**验证者 | 在窗口期内否决待定的验证者集轮换 |
| `pause()` | 任意单一**热**验证者 | 冻结新充值和提现排队（受单个验证者冷却时间限制） |
| `unpause(...)` | **冷 ⅔** | 解除暂停 |
| `invalidateWithdrawal(mid, ...)` | **冷 ⅔** | 吊销已排队但未领取的欺诈性提现 |
| `requestValidatorSetUpdate(p, newEpoch, ...)` | **冷 ⅔** | 提交两阶段热+冷验证者集轮换申请 |
| `finalizeValidatorSetUpdate()` | 任意账户（无需许可） | 在争议窗口后应用已提交的轮换 |
| `setDisputeWindow(...)` / `setMinDisputeBlocks(...)` | **冷 ⅔** | 调整争议窗口（有上下限约束） |
| `computeMessageId(...)` / `computeGovDigest(...)` | view | 还原验证者联署的精确字节内容 |
| `hot*/cold*` getters | view | 验证者权益、成员列表、数量、总量、法定人数 bps / 所需数量 |

所有联署调用均接受 `(uint8[] sigV, bytes32[] sigR, bytes32[] sigS)`，按签名者地址升序排列，低 S 值，`v ∈ {27,28}`。

### Solana — `metabridge-solana`

| 指令 | 授权方 | 用途 |
|-------------|---------------|---------|
| `initialize(params)` | 部署者（一次性） | 固定 USDC mint、验证者集、法定人数、双重争议窗口 |
| `deposit(mtf_dest, amount)` | 存款方（签名者） | 将 SPL USDC 拉入托管，触发 `DepositEvent` |
| `withdraw(mid, user, amount, dst, nonce, cosigs)` | 任意中继方（须提供 **⅔** 联署集） | 验证法定人数并创建 `PendingWithdrawal` PDA（+ 永久消费标记） |
| `claim(message_id)` | 任意账户 | 在双重时间+槽位窗口到期后释放托管 USDC |
| `dispute(mid, cosig)` | 任意单一验证者（1 个联署） | 在窗口期内取消已排队的提现 |
| `pause(cosig)` | 任意单一验证者（1 个联署） | 冻结存款、提现及轮换最终确认 |
| `unpause(gov_nonce, cosigs)` | **⅔** 联署 | 解除暂停 |
| `invalidate_withdrawal(mid, gov_nonce, cosigs)` | **⅔** 联署 | 吊销已排队的提现 |
| `request_validator_set_update(...)` | **⅔** 联署 | 提交验证者集轮换申请 |
| `finalize_validator_set_update()` | 任意账户（无需许可） | 在窗口期后应用已提交的轮换 |

Solana 使用**单一验证者集**（无热/冷区分），且没有 `setDisputeWindow` / 批量入口点；恢复 ID 为原始 secp256k1 `{0,1}`（而非 EVM 的 `{27,28}`）。两条链均拒绝高 S 值签名，并在每个联署摘要中绑定程序/合约 ID 和纪元。

## 路线图

- 真实的 Base 充值监听器 + 提现中继器（确定性 L1 核心和 Base 合约已完成；链下观察器已接入，并通过 `finalized` 区块标签防范重组）。
- 多链扩展：Solana 托管程序已在 devnet 上线，采用相同模型；Arbitrum 是下一步计划。
- 在任何承载真实价值的主网部署前完成安全审计。
- 跨链可组合性（从 MTF 调用其他链上的合约）——V2 规划。

## 另请参阅

- [网络](../networks.md) — 各网络 RPC 端点及链 ID
