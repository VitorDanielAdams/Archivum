---
id: doc-update-balance
title: Update Player Balance
type: mediator-request
tags: [player, balance, economy, write]
favorite: false
links: [doc-get-balance]
created: 2026-06-20T10:05:00Z
updated: 2026-06-20T10:05:00Z
---

# Update Player Balance

Credita ou debita o saldo do jogador.

## Request
- `playerId` (string, obrigatório)
- `amount` (number, obrigatório) — positivo credita, negativo debita

## Response
- `newBalance` (number)
