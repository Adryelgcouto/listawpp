# Lista Zap

PWA mobile-first para vendedor solo: fotografe listas de clientes, revise, enfileire e envie WhatsApp via Evolution API (ou modo demo).

## Stack

React 19 · TypeScript · Vite · TanStack Router · Tailwind v4 · Zustand · Lucide · Sonner · PWA · Zod

## Rodar

```bash
npm i
bash startup.sh   # 0.0.0.0:8080
npm run typecheck
npm test
npm run build
```

## Segurança (resumo)

- **CPF** nunca no payload WhatsApp (strip + fail-closed + sanitização de nome na ingestão)
- **Logs** mascaram telefone e usam iniciais; secrets redigidos por valor
- **Wipe real**: zera stores em memória + localStorage + IndexedDB + reload
- **PIN** mín. 6, backoff, wipe exige PIN se lock ativo; lock para a fila
- **Gemini opt-in** para rewrite; visão **não pede CPF**; UI avisa que foto vai ao Google
- **Evolution**: HTTP remoto bloqueado; erros sem corpo upstream; timeout 15s
- **Imagem comercial** em IndexedDB (não estoura localStorage)
- **CSP** no `index.html`

Relatório adversarial: `docs/SECURITY-REVIEW-ADVERSARIAL.md`  
Status remediação: `docs/SECURITY-REMEDIATION-STATUS.md`

## Como testar (demo)

1. `http://localhost:8080` → **Lista demo**
2. Fila → **Iniciar**
3. Clientes → busca CPF mascarado
4. Login → criar PIN (6+) → Sair → desbloquear
5. Config → anti-ban 20/90/100%
