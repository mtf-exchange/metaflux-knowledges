# Bridge

:::info
**状态.** MetaBridge USDC 托管桥 **在 Base Sepolia 上线**（测试网，
`MetaBridgeUSDC` v3 [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af)），
以及一个 Solana 托管程序在 **devnet** 上线，采用相同的模式。两个方向都在 Base Sepolia 上经过验证端到端：真实存款
（观察者 → 共签 → 自动注册共签者 → ⅔-法定人数信用）以及完整的取款往返（L1 共签 → 中继循环 → 链上 `batchWithdraw` →
争议窗口 → `claim`）。加强措施：气体摊销的 `batchWithdraw`/`batchClaim`，
部分成功批次，双重时间+区块争议窗口，热/冷验证器密钥
分离，带有单热验证器 **cancel**
否决权的两阶段验证器轮换，以及在 EVM 合约、Solana 程序和 L1 中按字节固定的域+纪元绑定签名（跨语言
已知答案向量）。Arbitrum 推出 + 主网前审计正在进行中。
:::

MetaFlux 通过 MetaBridge **桥接所有资产 — 包括 USDC — **，一个
MetaFlux 验证器签名的托管桥（HL-Bridge2 等价物）。在关键路径上**没有
第三方桥也没有 Circle CCTP 依赖**。

## 为什么选择托管而不是 CCTP

CCTP 仅在 Circle 注册为 CCTP *domains* 的链之间移动 USDC。MetaFlux
是一个独立的 L1；被添加为 CCTP 域是一个我们
无法控制的 Circle 商业决定。需要第三方批准才能存在的存款路径不是一个
可以构建的基础，所以 MetaFlux 在**相同的
验证器集信任假设下运行自己的托管桥，就像链本身一样** — 没有外部委员会，
监护人网络或看门人。

## 模型

一个托管 **源链上的 Bridge 合约**（首先是 Base）持有存入的
代币。MetaFlux 验证器观察存款并在 L1 上记入贷方；取款由
合约在 ⅔ 股权加权验证器共签集后的争议窗口内释放。

### 存款（源链 → MetaFlux）

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

`Deposit` 事件与 L1 确定性 `message_id` 字节兼容：
`keccak256(chain ‖ direction ‖ user ‖ asset ‖ amount ‖ dst ‖ nonce)`。

### 取款（MetaFlux → 源链）

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

- **权限** — ⅔ 股权加权 MetaFlux 验证器多签（secp256k1，保护共识的相同
  密钥；法定人数 `6700` bps）。验证器多签 + 
  取款争议窗口是关键：桥密钥泄露 = 基金损失，所以
  合约获得共识/签名审查层级和主网前审计。
- **重放** — 每个 `message_id` 被荣幸使用一次，以链/源-nonce
  经济身份为钥匙，以便信用在验证器集
  轮换期间精确落地一次；在 L1 和合约上都强制执行（`withdrawalSeen` / 永久
  Solana 花费标记）。签名被域和纪元绑定，所以共签
  无法在不同的部署、链或验证器集纪元中重放。
- **治理与轮换** — 没有管理员账户；每个特权操作都由
  验证器共签。验证器集轮换是两阶段（请求 → 在
  争议窗口后完成）；在那个窗口内任何**单个**热验证器可以 `pause`
  （受单个验证器冷却时间限制）或**cancel**待处理的轮换，
  所以一个被攻击的治理法定人数无法悄悄交换集合。在 Solana 上相同的
  集合承载单个验证器 `pause`/`dispute` 和法定人数 `unpause` /
  `invalidateWithdrawal` 紧急表面。
- **关闭 `/exchange`** — 存款信用通过验证器系统路径注入，在结构上
  无法从公共用户 `/exchange` 表面到达，仅在
  活跃验证器集上计数。
- **托管警告** — MetaFlux 上的 USDC 是由源
  合约余额支持的桥接声明，不是 Circle-canonical on MetaFlux（与 HL 模式相同）。

## 部署

| 网络 | 合约 | 地址 |
|---------|----------|---------|
| Base **Sepolia** | `MetaBridgeUSDC` (v3) | [`0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af`](https://sepolia.basescan.org/address/0xaCF3d88013b6Bd5022cF8e8259Bd1326Ee8B73Af) |
| Solana **devnet** | `metabridge-solana` | [`Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB`](https://solscan.io/account/Db5KYqPTFv3naxWTx83EzXQaZPMmbbAbaWHbZxK71sLB?cluster=devnet) |
| Base / Solana 主网 | — | (主网前审计) |

托管 Circle 的 Base Sepolia USDC (`0x036CbD…f3dCF7e`)；**⅔ 股权加权
验证器集，没有管理员**（所有特权操作都由验证器共签），300 秒 +
150-块双重争议窗口。域分离 + 纪元绑定签名。
合约 + 部署手册在
[`mtf-exchange/metaflux-contracts`](https://github.com/mtf-exchange/metaflux-contracts)
仓库中；L1 端共签 / 信用逻辑保留在节点上。主网前审计测试网 —
不用于有价值承载的用途。

## 合约方法

### Base — `MetaBridgeUSDC` (EVM)

| 方法 | 授权 | 用途 |
|--------|---------------|---------|
| `deposit(mtfDest, amount)` | 任何人（存款人） | 将 USDC 拉入托管，发出 `Deposit` 供验证器证明 |
| `withdraw(...)` / `batchWithdraw(reqs)` | 任何人中继 **热 ⅔** 共签集 | 验证法定人数 + 将取款入队到争议窗口 |
| `claim(mid)` / `batchClaim(mids)` | 任何人 | 在双重时间 + 块窗口后释放成熟的 USDC（不可暂停） |
| `dispute(mid)` | 任何单个 **热** 验证器 | 在其争议窗口内取消已排队的取款 |
| `cancelValidatorSetUpdate()` | 任何单个 **热** 验证器 | 否决其窗口内的待处理验证器集轮换 |
| `pause()` | 任何单个 **热** 验证器 | 冻结新存款 + 取款排队（单个验证器冷却时间） |
| `unpause(...)` | **冷 ⅔** | 解除暂停 |
| `invalidateWithdrawal(mid, ...)` | **冷 ⅔** | 撤销已排队的、未认领的欺诈性取款 |
| `requestValidatorSetUpdate(p, newEpoch, ...)` | **冷 ⅔** | 提交两阶段热+冷验证器集轮换 |
| `finalizeValidatorSetUpdate()` | 任何人（无许可） | 在其争议窗口后应用提交的轮换 |
| `setDisputeWindow(...)` / `setMinDisputeBlocks(...)` | **冷 ⅔** | 调整争议窗口（受限最小/最大值） |
| `computeMessageId(...)` / `computeGovDigest(...)` | view | 重现验证器共签的精确字节 |
| `hot*/cold*` getters | view | 验证器股份、成员、计数、总数、法定人数 bps / 需要 |

所有共签调用按升序签者、low-S、`v ∈ {27,28}` 取 `(uint8[] sigV, bytes32[] sigR, bytes32[] sigS)`。

### Solana — `metabridge-solana`

| 指令 | 授权 | 用途 |
|-------------|---------------|---------|
| `initialize(params)` | 部署者（一次性） | 固定 USDC mint、验证器集、法定人数、双重争议窗口 |
| `deposit(mtf_dest, amount)` | 存款人（签者） | 将 SPL USDC 拉入托管，发出 `DepositEvent` |
| `withdraw(mid, user, amount, dst, nonce, cosigs)` | 任何人中继 **⅔** 共签集 | 验证法定人数 + 创建 `PendingWithdrawal` PDA（+ 永久花费标记） |
| `claim(message_id)` | 任何人 | 在双重时间 + 槽窗口后释放托管 USDC |
| `dispute(mid, cosig)` | 任何单个验证器（1 共签） | 在其窗口内取消已排队的取款 |
| `pause(cosig)` | 任何单个验证器（1 共签） | 冻结存款 / 取款 / 轮换-完成 |
| `unpause(gov_nonce, cosigs)` | **⅔** 共签 | 解除暂停 |
| `invalidate_withdrawal(mid, gov_nonce, cosigs)` | **⅔** 共签 | 撤销已排队的取款 |
| `request_validator_set_update(...)` | **⅔** 共签 | 提交验证器集轮换 |
| `finalize_validator_set_update()` | 任何人（无许可） | 在其窗口后应用提交的轮换 |

Solana 使用一个验证器集（没有热/冷分离）且没有 `setDisputeWindow` / 批处理入点；recovery-id 是原始 secp256k1 `{0,1}`（vs EVM `{27,28}`）。两个链都拒绝高-S 签名并将 program/contract id + epoch 绑定到每个共签摘要中。

## 路线图

- 真实的 Base 存款观察者 + 取款中继（确定性 L1 核心 +
  Base 合约已完成；离链观察者已接入并使用
  链的 `finalized` 块标签来防止重组）。
- 多链推出：Solana 托管程序在 devnet 上线采用相同的
  模式；Arbitrum 是下一个。
- 主网前任何有价值承载的（主网）部署前的安全审计。
- 跨链可组合性（从 MTF 调用其他链合约）— V2。

## 另请参阅

- [Networks](../networks.md) — 每个网络端点 + 链 ID
