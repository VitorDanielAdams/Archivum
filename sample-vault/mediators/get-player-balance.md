---
id: doc-get-balance
title: Get Player Balance
type: mediator-request
tags: [player, balance, economy]
favorite: true
links: [doc-update-balance]
created: 2026-06-20T10:00:00Z
updated: 2026-06-20T10:00:00Z
---

# Get Player Balance

Retorna o saldo atual do jogador (mediator request).

## Request
- `playerId` (string, obrigatório)

## Response
- `balance` (number)
- `currency` (string)

## Exemplo
```csharp
var result = await mediator.Send(new GetPlayerBalance { PlayerId = id });
Console.WriteLine(result.Balance);
```
