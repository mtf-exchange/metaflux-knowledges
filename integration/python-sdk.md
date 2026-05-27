# Python SDK

> Status: **planned**. The `metaflux-client` package ships before mainnet; the API shape below is committed.

## TL;DR

```bash
pip install metaflux-client
```

```python
import os
from metaflux import Client

c = Client(
    private_key=os.environ['PRIVATE_KEY'],
    base_url='https://gateway.devnet.metaflux.dev',
    chain_id=31337,
)

c.exchange.order(
    asset=0, is_buy=True,
    price='50000', size='0.1', tif='Gtc',
)
```

## Constructor

```python
Client(
    private_key:    str | bytes,           # required (unless `signer` set)
    signer:         Signer | None,          # required (unless `private_key` set)
    sender_address: str | None,             # for agent-wallet pattern
    base_url:       str,
    chain_id:       int,
    timeout:        float = 5.0,
    nonce_fn:       Callable[[], int] | None,
)
```

| Field | Type | Description |
|-------|------|-------------|
| `private_key` | hex string OR bytes | 32-byte secp256k1 private key |
| `signer` | `Signer` | Custom signer interface |
| `sender_address` | str | If set, used as `sender`; signer's address is the recovered signer |
| `base_url` | str | Gateway URL |
| `chain_id` | int | Per network — see [networks](../networks.md) |
| `timeout` | float | HTTP timeout in seconds |
| `nonce_fn` | callable | Custom nonce generator; default uses time-millis |

## Modules

The client exposes `info`, `exchange`, `ws`.

### `info`

```python
c.info.meta()
c.info.all_mids()
c.info.l2_book(coin='BTC', depth=20)
c.info.clearinghouse_state()                  # self
c.info.open_orders()
c.info.user_fills(since_ts=0, limit=1000)
c.info.funding_history(asset=0)
c.info.fee_schedule()
c.info.vault_state(vault='0x...')
c.info.sub_accounts()
c.info.agents()
c.info.user_fees()
```

Methods return `dict`s with typed contents (use `TypedDict` overloads in type-checked mode).

### `exchange`

```python
c.exchange.order(...)
c.exchange.cancel(...)
c.exchange.cancel_by_cloid(...)
c.exchange.modify_order(...)
c.exchange.batch_modify(...)
c.exchange.scale_order(...)
c.exchange.twap_order(...)
c.exchange.twap_cancel(...)
c.exchange.trigger(...)

c.exchange.update_leverage(...)
c.exchange.update_isolated_margin(...)
c.exchange.update_margin_mode(...)
c.exchange.user_portfolio_margin(...)

c.exchange.approve_agent(...)
c.exchange.create_sub_account(...)
c.exchange.sub_account_transfer(...)

c.exchange.usdc_transfer(...)
c.exchange.withdraw_usdc(...)

c.exchange.rfq_request(...)
c.exchange.rfq_quote(...)
c.exchange.rfq_accept(...)

c.exchange.fba_order(...)
```

### `ws`

```python
import threading

ws = c.ws()

def on_l2(event):
    print(event['data'])

ws.subscribe('l2_book', {'coin': 'BTC'}, on_l2)

# Block forever, or run in a thread
ws.run_forever()
```

`async` variant:

```python
import asyncio
from metaflux import AsyncClient

async def main():
    c = AsyncClient(private_key='...', base_url='...', chain_id=31337)
    ws = c.ws()

    async for event in ws.subscribe('l2_book', {'coin': 'BTC'}):
        print(event['data'])

asyncio.run(main())
```

## Error handling

```python
from metaflux.errors import (
    RateLimitError, AuthError, LogicalError, CommitError, NetworkError
)

try:
    c.exchange.order(...)
except RateLimitError as e:
    time.sleep(e.retry_after_ms / 1000)
    # retry
except AuthError as e:
    # signing / chainId / agent bug — escalate
    raise
except LogicalError as e:
    # 422 — caller can correct
    raise
except NetworkError as e:
    # unknown outcome — reconcile
    raise
except CommitError as e:
    # post-admit state-machine error
    raise
```

See [error handling](./error-handling.md).

## Custom signer

```python
from metaflux.signer import Signer

class HsmSigner(Signer):
    def sign(self, digest: bytes) -> bytes:
        # Forward 32-byte digest to HSM; return 65-byte r||s||v
        ...
    def address(self) -> str:
        return '0x...'

c = Client(signer=HsmSigner(), base_url='...', chain_id=31337)
```

## Agent-signing client

```python
agent_client = Client(
    private_key='<agent priv hex>',
    sender_address='<master address>',
    base_url='https://gateway',
    chain_id=31337,
)

# every action: sender = master, signed by agent_priv
agent_client.exchange.order(asset=0, is_buy=True, price='100', size='1', tif='Gtc')
```

## Numeric handling

All `_e8` / `_e6` fields are `str` in both inputs and outputs. Python ints are arbitrary-precision, so you can parse and arithmetic without loss:

```python
price_e8 = int('10050000000')   # 100.50 × 10^8
size_e8  = int('100000000')     # 1.0 × 10^8
notional = price_e8 * size_e8 // 10**8   # 100.5 × 10^6 (USDC base units)
```

The SDK accepts both `int` and `str` on input and normalises to `str` on the wire.

## Examples

Repository at `mtf-exchange/metaflux-client-py` will ship:

- `examples/quickstart.py`
- `examples/market_maker.py`
- `examples/risk_watcher.py` — pattern from [risk-watcher](./risk-watcher.md)
- `examples/agent_rotation.py`

## See also

- [Quickstart](./quickstart.md)
- [Signing](./signing.md) — Python crypto example included
- [Agent wallets howto](./agent-wallets-howto.md)
- [TypeScript SDK](./typescript-sdk.md)
- [Rust SDK](./rust-sdk.md)

## FAQ

**Q: Which Python versions?**
A: 3.10+ (uses modern typing features). 3.9 may work in degraded-typing mode.

**Q: Sync or async?**
A: Both. `metaflux.Client` is sync (uses `requests`); `metaflux.AsyncClient` is async (uses `httpx` / `aiohttp`).

**Q: Type-checked?**
A: Yes — full `py.typed` shipped. Runs clean on `mypy --strict`.

**Q: Lightweight transport (no SDK)?**
A: For one-shot scripts you can skip the SDK and use the snippets in [signing](./signing.md) directly — Python signing is ~30 lines of code.
