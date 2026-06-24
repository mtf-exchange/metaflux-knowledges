# SDK Rust

:::info
**Aperçu.** La crate `metaflux-client` est publiée avant le lancement sur le réseau principal ; la forme de l'API ci-dessous est définitive.
:::

## En bref

```toml
[dependencies]
metaflux-client = "0.1"
```

Le client est `async` et fonctionne avec tout runtime Rust asynchrone moderne.

```rust
use metaflux_client::{Client, ClientOpts, OrderParams, Side, Tif};

async fn run() -> anyhow::Result<()> {
    let c = Client::new(ClientOpts {
        private_key: std::env::var("PRIVATE_KEY")?.parse()?,
        base_url:    "https://devnet-gateway.mtf.exchange".into(),  // MTF-native is the gateway default path
        chain_id:    31337,
        ..Default::default()
    })?;

    c.exchange.order(OrderParams {
        asset:   0,
        side:    Side::Buy,
        price:   "50000".into(),
        size:    "0.1".into(),
        tif:     Tif::Gtc,
        ..Default::default()
    }).await?;

    Ok(())
}
```

Le client est `Send + Sync` et fonctionne dans tout contexte asynchrone.

## ClientOpts

```rust
pub struct ClientOpts {
    /// 32-byte secp256k1 private key. Mutually exclusive with `signer`.
    pub private_key:    Option<PrivateKey>,

    /// Custom signer (HSM / hardware wallet). Mutually exclusive with `private_key`.
    pub signer:         Option<Box<dyn Signer + Send + Sync>>,

    /// Override `sender` address. Used for agent-wallet pattern.
    pub sender_address: Option<Address>,

    /// Gateway front door (`https://<net>-gateway.mtf.exchange`). The SDK speaks
    /// MTF-native, which is the gateway's default path (`/info` · `/exchange` ·
    /// `/ws`); HL-compat lives under `/hl/*`. Running the node yourself? Point at
    /// `http://localhost:8080`.
    pub base_url:       String,
    pub chain_id:       u64,
    pub timeout:        Duration,           // default 5s
    pub nonce_fn:       Option<NonceFn>,    // default: wall-clock-millis
}
```

## Modules

Le client expose trois modules : `info`, `exchange`, `ws`.

### `info`

```rust
c.info.meta().await?;
c.info.all_mids().await?;
c.info.l2_book(L2BookArgs { coin: "BTC".into(), depth: 20 }).await?;
c.info.clearinghouse_state().await?;  // self
c.info.open_orders().await?;
c.info.user_fills(UserFillsArgs { since_ts: 0, limit: 1000 }).await?;
c.info.funding_history(FundingHistoryArgs { asset: 0, since_ts: 0, limit: 1000 }).await?;
c.info.fee_schedule().await?;
c.info.vault_state(VaultStateArgs { vault: "0x...".parse()? }).await?;
c.info.sub_accounts().await?;
c.info.agents().await?;
c.info.user_fees().await?;
```

Toutes les méthodes renvoient des réponses fortement typées ; aucune manipulation de JSON brut n'est nécessaire.

### `exchange`

```rust
c.exchange.order(OrderParams { .. }).await?;
c.exchange.cancel(CancelParams { .. }).await?;
c.exchange.cancel_by_cloid(CancelByCloidParams { .. }).await?;
c.exchange.modify_order(ModifyOrderParams { .. }).await?;
c.exchange.batch_modify(BatchModifyParams { .. }).await?;
c.exchange.scale_order(ScaleOrderParams { .. }).await?;
c.exchange.twap_order(TwapOrderParams { .. }).await?;
c.exchange.twap_cancel(TwapCancelParams { .. }).await?;
c.exchange.trigger(TriggerParams { .. }).await?;

c.exchange.update_leverage(UpdateLeverageParams { .. }).await?;
c.exchange.update_isolated_margin(UpdateIsolatedMarginParams { .. }).await?;
c.exchange.update_margin_mode(UpdateMarginModeParams { .. }).await?;
c.exchange.user_portfolio_margin(UserPortfolioMarginParams { .. }).await?;
// Margin controls (update_leverage / update_isolated_margin / update_margin_mode)
// apply to perpetual positions only. Spot trading uses the reserved-balance
// escrow model and does not support leverage in V1.

c.exchange.approve_agent(ApproveAgentParams { .. }).await?;
c.exchange.create_sub_account(CreateSubAccountParams { .. }).await?;
c.exchange.sub_account_transfer(SubAccountTransferParams { .. }).await?;

c.exchange.usdc_transfer(UsdcTransferParams { .. }).await?;
c.exchange.withdraw_usdc(WithdrawUsdcParams { .. }).await?;

c.exchange.rfq_request(RfqRequestParams { .. }).await?;
c.exchange.rfq_quote(RfqQuoteParams { .. }).await?;
c.exchange.rfq_accept(RfqAcceptParams { .. }).await?;

c.exchange.fba_order(FbaOrderParams { .. }).await?;
```

:::warning
**Les contrôles de marge sont réservés aux contrats perpétuels.** `update_leverage`, `update_isolated_margin`
et `update_margin_mode` s'appliquent uniquement aux positions sur contrats perpétuels. Les positions au comptant ne
prennent pas en charge l'effet de levier ni la marge isolée en V1 — le trading au comptant utilise
le modèle d'entiercement à solde réservé via le chemin d'ordre au comptant.
:::

### `ws`

```rust
let ws = c.ws();

let mut stream = ws.subscribe_l2_book("BTC", 20).await?;
while let Some(event) = stream.next().await {
    println!("l2_book: {:?}", event?);
}

let mut user = ws.subscribe_user_events(c.address()).await?;
while let Some(event) = user.next().await {
    match event?.data {
        UserEvent::Fill(fill)       => { /* ... */ }
        UserEvent::OrderCancelled(o) => { /* ... */ }
        _ => {}
    }
}
```

Le client WS renvoie des handles d'abonnement de forme `Stream<Item = Result<Event<T>>>`. Relâcher le handle permet de se désabonner.

## Types numériques

Les entiers mis à l'échelle définis dans la spécification publique (prix et taille en virgule fixe, unités de base USDC) sont encapsulés dans des types dédiés qui empêchent toute arithmétique flottante accidentelle :

```rust
pub struct PriceE8(pub u128);     // price × 10^8
pub struct SizeE8(pub u128);      // size × 10^8
pub struct UsdcE6(pub u128);      // USDC × 10^6
```

Effectuez la conversion depuis/vers une chaîne de caractères au niveau du protocole filaire ; réalisez les calculs arithmétiques sur le `u128` brut :

```rust
let price = PriceE8::from_str("10050000000")?;
let notional = price.0 * size.0 / 10u128.pow(8);
```

## Gestion des erreurs

```rust
pub enum ClientError {
    Network(NetworkError),     // unknown outcome — reconcile
    Auth(AuthError),           // signing / chainId / agent — do not retry
    Logical(LogicalError),     // 422 — fix and retry
    RateLimit(RateLimitError), // 429 — backoff via retry_after_ms
    Commit(CommitError),       // post-admit state-machine error
    Other(anyhow::Error),
}

let result = c.exchange.order(p).await;
match result {
    Ok(r) => { /* admitted */ }
    Err(ClientError::RateLimit(rl)) => {
        sleep_async(rl.retry_after).await;
        // retry
    }
    Err(ClientError::Network(_)) => {
        // reconcile via cloid
    }
    Err(e) => return Err(e.into()),
}
```

Voir [gestion des erreurs](./error-handling.md).

## Signataire personnalisé

```rust
use metaflux_client::Signer;

struct HsmSigner;

#[async_trait::async_trait]
impl Signer for HsmSigner {
    async fn sign(&self, digest: &[u8; 32]) -> Result<[u8; 65]> {
        // Forward digest to HSM; return r||s||v
        todo!()
    }
    fn address(&self) -> Address { todo!() }
}

let c = Client::new(ClientOpts {
    signer: Some(Box::new(HsmSigner)),
    ..
})?;
```

## Client avec signature par agent

```rust
let agent_client = Client::new(ClientOpts {
    private_key:    Some(agent_priv),
    sender_address: Some(master_addr),    // ← master is sender
    base_url:       "https://devnet-gateway.mtf.exchange".into(),
    chain_id:       31337,
    ..Default::default()
})?;

// every action: sender = master_addr, signed by agent_priv
agent_client.exchange.order(p).await?;
```

## Concurrence

Le client est `Send + Sync` et est conçu pour être partagé entre les tâches via un `Arc<Client>`. Le pool de connexions interne gère la concurrence HTTP ; les abonnements WS sont par appel.

La génération des nonces est monotone — si vous souhaitez des nonces strictement déterministes entre de nombreuses tâches, fournissez une `nonce_fn` qui s'appuie sur un compteur externe (Redis, atomique).

## Journalisation

La crate émet des journaux structurés via l'écosystème standard de journalisation structurée. Définissez le souscripteur dans votre binaire ; le client n'impose pas de backend.

## Fonctionnalités

```toml
[dependencies]
metaflux-client = { version = "0.1", features = ["ws"] }
```

| Fonctionnalité | Par défaut | Description |
|----------------|:----------:|-------------|
| `ws` | oui | Support WebSocket |
| `secp256k1-pure` | oui | secp256k1 en Rust pur (sans liaisons natives) |
| `secp256k1-c` | non | Liaisons natives (plus rapide, nécessite une chaîne d'outils C) |
| `tls-pure` | oui | Backend TLS en Rust pur (par défaut) |
| `tls-native` | non | Backend TLS système |

## Exemples

Le dépôt `mtf-exchange/metaflux-client-rust` contient :

- `examples/quickstart.rs` — passer et annuler un ordre
- `examples/market_maker.rs` — coter des deux côtés sur BTC
- `examples/risk_watcher.rs` — modèle inspiré de [risk-watcher](./risk-watcher.md)
- `examples/agent_rotation.rs` — flux complet de rotation d'agent

## Voir aussi

- [Démarrage rapide](./quickstart.md)
- [Signature](./signing.md)
- [Guide des portefeuilles agents](./agent-wallets-howto.md)
- [SDK TypeScript](./typescript-sdk.md)

## FAQ

<details>
<summary>Afficher la FAQ</summary>

**Q : Le SDK est-il compatible no-std ?**
R : Pas en V1. Il nécessite un runtime asynchrone ainsi que des clients HTTP/WS. La couche de signature peut être extraite dans une crate compatible `no_std` si la demande se manifeste.

**Q : Quel est l'impact sur la taille du binaire ?**
R : `~1,5 Mo` ajoutés à un binaire de publication avec les fonctionnalités par défaut. `secp256k1-c` permet d'économiser environ 200 Ko.

**Q : Le SDK supporte-t-il WASM ?**
R : Partiellement — les modules info et exchange fonctionnent en WASM via le backend HTTP compatible WASM. Le support WS dépend des primitives WebSocket de la cible. WASM navigateur : prévu.

**Q : Puis-je l'utiliser depuis un contrat EVM ?**
R : Non. Il s'agit d'un client hors chaîne. Les interactions avec le pont on-chain passent par les primitives [bridge](../bridge/).

</details>
