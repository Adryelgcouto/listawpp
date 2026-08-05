# Produto — mensagem WhatsApp confiável

**Decisão (2026-08-05):** o valor do Lista Zap é **lista → fila → envio completo com o nome certo**.  
Rewrite Gemini é **opcional** e **não bloqueia** o envio.

## Comportamento

| Rewrite | O que o WhatsApp recebe |
|---------|-------------------------|
| **Off** (default) | Template exato com `{nome}` do contato |
| **On** + Gemini OK e texto completo | Variação |
| **On** + Gemini falha/corta/troca nome | **Mesmo template completo** + log `template (fallback)` |

## UI

- **Hoje:** preview “Texto que vai sair” + contagem de chars  
- **Fila:** card “Próximo envio” com texto base/exato  
- **Log da fila:** `Texto N chars · template|rewrite|template (fallback) · motivo`

## Como usar no serviço

1. Hard refresh em https://listawpp.vercel.app  
2. Deixe **Reescrever com Gemini desligado** (recomendado)  
3. Confira o preview em **Hoje** e o card em **Fila**  
4. Envie **só em uma aba** (lock entre abas)  
5. A mensagem deve ser a do template inteira  

## Codex Sol (mensagem)

**GO** na decisão de produto · gaps fechados nesta onda:
- rewrite OFF forçado uma vez no load (legado com ON)
- preview completo no card (sem nowrap)
- `messageText` só em memória; não grava no localStorage
- `finishReason` só STOP
- Web Lock `lista-zap-queue-leader` (evita 2 abas)
