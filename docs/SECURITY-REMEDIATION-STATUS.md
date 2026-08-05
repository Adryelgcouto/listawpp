# Status da remediação — todas as ondas

**Data:** 2026-08-04  
**Base:** `docs/SECURITY-REVIEW-ADVERSARIAL.md` (Claude)

| ID | Sev | Status | Onde |
|----|-----|--------|------|
| C1 | CRITICAL | **FEITO** | `cpf.ts` strip com separadores + check digit; `sanitizePersonName` na ingestão; testes de tabela |
| C2 | CRITICAL | **FEITO** | `wipe.ts` hardWipe: worker stop + setState memória + clearStorage + reload |
| H1 | HIGH | **FEITO** | Wipe exige PIN se lock ativo; LoginScreen confirmação |
| H2 | HIGH | **FEITO** | Vision não pede CPF; discarta cpf do modelo; rewrite opt-in; UI avisa Google |
| H3 | HIGH | **PARCIAL** | UI honesta (PIN não cifra disco); wipe + secrets redaction. AES-GCM helpers em `security.ts` para onda futura de storage cifrado |
| H4 | HIGH | **FEITO** | Evolution não ecoa body; `registerRuntimeSecret` + sanitize; só status HTTP |
| H5 | HIGH | **FEITO** | `image-store.ts` IndexedDB + compress; settings não persiste dataURL |
| H6 | HIGH | **FEITO** | `isValidBrPhone` em upsert/add/enqueue/confirm |
| M1 | MEDIUM | **FEITO** | `lock()` e wipe chamam `stopQueueWorker` |
| M2 | MEDIUM | **FEITO** | PIN mín. 6; backoff 5 tentativas / 60s |
| M3 | MEDIUM | **FEITO** | CSP meta; system fonts (sem Google Fonts) |
| M4 | MEDIUM | **FEITO** | Circuit breaker config/cors na fila |
| M5 | MEDIUM | **FEITO** | Zod schemas no merge dos stores |
| M6 | MEDIUM | **FEITO** | `isSafeEvolutionUrl` — HTTP remoto bloqueado |
| M7 | MEDIUM | **FEITO** | AuthGate timeout + erro de storage |
| L1 | LOW | **FEITO** | `maskNameForLog` = iniciais; toast skip sem nome |
| L2–L3 | LOW | **FEITO** | strip unificado; phone antes de CPF no sanitize |
| L4 | LOW | **ADIADO** | Revelar CPF ainda global (UX); prioridade baixa |
| L5 | LOW | **FEITO** | Funções usadas (isValidBrPhone, strip) |
| L6 | LOW | **MANTIDO** | `0.0.0.0` exigido pelo ambiente de preview |
| L7 | LOW | **FEITO** | `AbortSignal.timeout` em Evolution/Gemini |

## Testes

```bash
npm test        # 21 testes (CPF formatos, wipe keys, phone, URL, secrets)
npm run typecheck
npm run build
```

## Veredito pós-remediação

- **Demo:** GO  
- **Live com dados reais:** GO condicional — ainda localStorage em claro (H3 parcial); ative PIN + HTTPS Evolution + Gemini consciente  
- **Não afirmamos** que PIN cifra o disco  
