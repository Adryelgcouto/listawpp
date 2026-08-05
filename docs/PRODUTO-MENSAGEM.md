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

1. Hard refresh  
2. Deixe **Reescrever com Gemini desligado** (recomendado)  
3. Confira o preview em **Hoje** e o card em **Fila**  
4. Envie — a mensagem deve ser a do template inteira  
