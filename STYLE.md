# Writing standard

The reference is read by integrators who want to find one thing and use it. Two
rules carry most of the value: **one approved term per concept**, and **no word
that does not change the meaning**.

`npm run lint:prose` enforces the machine-checkable part. It also runs in CI
before the build. `style-register.json` holds the rules; this page holds the
reasoning and the parts a script cannot check.

## The gate

```sh
npm run lint:prose          # the whole site
node scripts/check-prose.mjs docs/api    # one subtree
```

Every rule in `style-register.json` carries a **positive control** — a string the
rule must match. The checker asserts all controls before it scans. A rule whose
regex breaks reports itself as broken instead of reporting a clean scan, because
a zero from a dead rule reads exactly like a pass.

To add a rule, add its `pattern`, a `control` that the pattern matches, and a
`say` line that names the replacement. A rule with no replacement is a complaint,
not a standard.

## Approved terms

One term per concept. The left column is the only spelling that goes in a
document.

| Use | Not | Why |
|---|---|---|
| deposit / add margin | top up | "Top up" is consumer-app register. Say which one: you *deposit* USDC, you *add margin* to a bucket. |
| order book | orderbook | One spelling. |
| cancel | cancellation | The action is `cancel`; the noun form invites a second term for one concept. |
| testnet | devnet, test network | One hosted network, one name. `api.devnet.mtf.exchange` is a second chain that answers but cannot be traded on. |
| sub-account | sub-account wallet | A sub-account cannot sign, so calling it a wallet is wrong, not just inconsistent. |
| gateway | API server, front door | `gateway` is the component's name. |

These are distinct concepts and must **not** be collapsed into one term:

- **`market`** — a perpetual market id. **`pair`** — a spot pair. **`coin`** — the
  symbol a human reads. **`asset`** — the numeric id on the wire.
- **`fill`** — one execution leg on one account. **`trade`** — the print both legs
  share.
- **`validator`** — a consensus participant. **`node`** — the running binary.
  **`operator`** — the person who runs it.

## Banned constructions

**Postfix `live`.** Not "on-chain live", not "testnet live", not "node live".
Write "the node's live ring", or name the event: "the halt the 0.2.9 deploy
caused on testnet". Predicate and adverb uses are correct and stay: "keeps the
chain live", "follow the chain live", "chain liveness".

**Marketing adjectives** — powerful, robust, seamless, battle-tested,
cutting-edge, best-in-class. State the property instead. Not "a robust median",
but "a median that tolerates one outlier component". Not "battle-tested", but
"in production since <date>". An adjective a reader cannot verify is noise.

**Filler** — "simply", "note that", "please note", "it is worth noting", "of
course". "Note that X" is X. "It simply does not appear" is "it does not appear".

**Mannered prose** — "a dial worth turning", "under the hood", "the heavy
lifting", "the secret sauce". Write the plain thing: "a parameter worth
varying", "internally".

**"in order to"** — write "to".

**Exclamation marks.** A reference reads flat.

**Dead hosts.** The public endpoint is `api.testnet.mtf.exchange`. Do not name
`api.devnet.mtf.exchange` (it answers, but its faucet reserve is empty and its
books are one-sided), the `*-gateway.mtf.exchange` aliases, or
`status.mtf.exchange` — the last three do not resolve. `docs/networks.md` is the
one page allowed to name the dead endpoint, to say it is not the one to use.

`"Devnet"` stays where it is a **protocol value**: it is the signed
`metafluxChain` tag for chain id `31337`, so the typed-data table and the chain-id
tables are correct as written.

**"first-class"** — say what the thing actually has: "it has its own balance,
positions and orders". `concepts/sub-accounts.md` is the one exemption: it
defines the term there and the definition carries weight.

## What the script cannot check

- **Short sentences, one idea each** (ASD-STE100, aim for 20 words or fewer),
  active voice, present tense.
- **State the rule where the field is.** The rows integrators get wrong are the
  ones with a rule behind them — a sparse series with no bar in a quiet window, a
  payload that does not unwind its credit. A field row that lists the type and
  stops leaves the reader to discover the rule from a rejection.
- **Say when something is not live yet.** This reference is allowed to lead the
  code. It is never allowed to lag it. When it leads, say so in the page, the way
  an upgrade notice does — otherwise it instructs a caller to send something the
  chain refuses.
- **Flat and precise beats richer.** The failure mode of a copy pass is replacing
  a plain word with a jargon word and calling it an improvement.
