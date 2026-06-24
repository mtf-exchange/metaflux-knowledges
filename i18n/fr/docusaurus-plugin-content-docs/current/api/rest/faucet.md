---
description: Robinet de test Devnet/testnet — attribution unique de USDC de test + MTF. Refusé sur le réseau principal.
---

# `POST /faucet` — fonds de test devnet/testnet

:::warning
**Devnet / testnet uniquement.** Le robinet crée librement des jetons de collatéral et de marché au comptant à partir de rien. Il est **structurellement refusé sur le réseau principal** (chain id `8964`) : la route n'y est même jamais montée. Ne vous y fiez jamais dans un flux de production.
:::

## En bref

Un seul appel `POST /faucet` attribue **3 000 USDC** en collatéral croisé **et 10 MTF** en jetons au comptant (token id `104`) à une adresse arbitraire. **Une seule fois par adresse, définitivement.** La réponse est `"queued"` — les crédits apparaissent après ~1 bloc (ils sont injectés en tant qu'actions système de validateur, non engagées de manière synchrone). Servi via `POST /faucet` à la porte d'entrée de la passerelle, aux côtés des chemins natifs `/info` + `/exchange`.

## URL

```
POST  https://<net>-gateway.mtf.exchange/faucet
```

Si vous exécutez le nœud vous-même, la même route `/faucet` est accessible directement à
`http://localhost:8080`.

| Environnement | Monté ? |
|---------------|---------|
| Devnet (`31337`) / testnet (`114514`), robinet activé | oui |
| Réseau principal (`8964`) | **non** — route jamais montée ; une requête égarée reçoit un `403` du gestionnaire de garde défensif |
| Robinet désactivé dans la configuration du nœud | non |

La route n'est intégrée au routeur principal de l'API que lorsque la configuration du robinet du nœud est **activée ET hors réseau principal**. Elle possède son propre état de gestionnaire et est structurellement inaccessible depuis l'arbre de gestionnaires `/exchange`.

## Requête

```json
{ "address": "0x00000000000000000000000000000000000ca11e" }
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `address` | adresse `0x`-hex de 20 octets | oui | Destinataire. Accepte 40 ou 42 caractères (`0x` facultatif). L'adresse zéro est rejetée. |
| `amount` | uint64 (USDC entier) | non | Montant USDC facultatif ; **plafonné vers le bas** à la valeur maximale configurée (3 000) — une valeur plus élevée est ramenée à 3 000, jamais au-delà. `0` est rejeté. MTF (10) est fixe quoi qu'il arrive. |

```bash
curl -s -X POST https://devnet-gateway.mtf.exchange/faucet \
  -H 'content-type: application/json' \
  -d '{"address":"0x00000000000000000000000000000000000ca11e"}'
```

## Réponse

### `200 OK` — en file d'attente

```json
{
  "address": "0x00000000000000000000000000000000000ca11e",
  "usdc":    3000,
  "mtf":     10,
  "status":  "queued"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `address` | chaîne `0x`-hex | Destinataire renvoyé en écho, normalisé en minuscules |
| `usdc` | uint64 | USDC accordés (entier, après tout plafonnement vers le bas) |
| `mtf` | uint64 | Jetons MTF au comptant accordés (entier, fixé à 10) |
| `status` | `"queued"` | Les crédits sont **préparés pour le prochain bloc**, pas encore engagés |

`"queued"` est littéral : l'attribution correspond à deux actions système injectées par le validateur
(`SystemUserModify{AdjustCrossAccountValue}` pour USDC + `SystemSpotSend` pour MTF)
prépendées au prochain bloc proposé. Interrogez [`account_state`](./info.md#account_state)
(ou [`spot_clearinghouse_state`](./info/spot.md#spot_clearinghouse_state)) ~1 bloc
plus tard pour consulter le solde :

```json
// account_state après l'engagement du crédit :
{ "account_value": "3000", "balances": { "usdc": "3000", "spot": { "MTF": "10" } }, ... }
```

### Erreurs

| HTTP | Corps | Cause |
|------|-------|-------|
| 400 | `{"error":"invalid address: <detail>"}` | `address` n'est pas un hexadécimal `0x` valide (ex. longueur incorrecte) |
| 400 | `{"error":"zero address not allowed"}` | Le destinataire est l'adresse zéro |
| 400 | `{"error":"amount must be positive"}` | `amount` explicite égal à `0` |
| 429 | `{"error":"address already funded"}` | Cette adresse a déjà réclamé (**une fois pour toutes**, permanent pour la durée de vie du nœud) |
| 429 | `{"error":"rate limit: this IP requested too recently"}` | L'IP source a effectué une demande dans la fenêtre de temporisation par IP (défaut : 1/min/IP) |
| 403 | `{"error":"faucet disabled on this network"}` | Garde défensive (normalement inaccessible — le réseau principal ne monte jamais la route) |
| 503 | `{"error":"faucet backlog full; retry shortly"}` | File d'injection saturée (contre-pression transitoire ; réessayez) |

```json
// deuxième demande pour la même adresse :
{ "error": "address already funded" }   // HTTP 429
```

## Limites

- **Une seule fois par adresse, définitivement.** Suivi dans un ensemble en mémoire (réinitialisé au redémarrage du nœud ; le devnet est éphémère). Une deuxième demande pour la même adresse — même depuis une IP différente, même bien plus tard — renvoie `429 address already funded`. Une requête *rejetée* ne consomme PAS le quota unique.
- **Limitation par IP.** Par défaut, 1 requête / minute / IP source. Des adresses distinctes depuis la même IP dans la même fenêtre reçoivent `429 rate limit`.
- **Plafond USDC.** Le champ `amount` facultatif ne plafonne que vers le bas ; vous ne pouvez jamais obtenir plus de 3 000 USDC configurés.

## Pourquoi ce n'est PAS sur `/exchange`

Les deux crédits du robinet sont des **actions système / privilégiées**
(`SystemUserModify`, `SystemSpotSend`) — créant du collatéral et des jetons au comptant à partir de rien. Ils se situent dans la plage d'identifiants d'actions système et ne font **jamais** partie de la liste blanche d'actions utilisateur de `/exchange`. Le robinet les place dans une **file d'injection réservée aux validateurs** (et non dans le mempool public) ; le runtime la vide dans la charge utile du bloc exactement comme le flux oracle, avec l'adresse du validateur du nœud lui-même comme émetteur, afin que la vérification `require_system_authority` les accepte. Il n'existe aucun chemin de code du mempool utilisateur public vers cette file. Voir
[never expose system actions on /exchange](./exchange.md#non-bridged-actions).

## Frontière de déterminisme

Tout ce qui se trouve à la périphérie HTTP du robinet est non déterministe (limitation par horloge murale, ensemble de demandes reçues propre à l'hôte). Les SEULES valeurs qui transitent dans le consensus sont le destinataire et les montants dans les deux actions système, qui passent par les gestionnaires déterministes inchangés. L'état de limitation par IP / ensemble des demandes reçues propre à l'hôte n'est jamais haché dans l'AppHash.

## Voir aussi

- [`POST /info`](./info.md) — lire `account_state` / `spot_clearinghouse_state` pour confirmer le crédit
- [`POST /exchange`](./exchange.md) — le chemin d'écriture des actions utilisateur (les actions système comme les crédits du robinet n'y transitent jamais)
- [Réseaux](../../networks.md) — identifiants de chaîne par réseau
