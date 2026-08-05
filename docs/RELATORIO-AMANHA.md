# Relatório — manhã seguinte (Lista Zap)

**Data do trabalho:** 2026-08-05 (noite)  
**Commits:** `ec33d6c` (Excel + Gemini), `340d147` (Onda 0 pós-Codex)  
**Auditoria Sol:** `docs/AUDITORIA-CODEX-SOL-SISTEMA-COMPLETO.md`

---

## O que está pronto pra você usar agora

1. **Excel / CSV** em **Escanear → Excel / CSV**  
   - Detecta colunas **Nome**, **Telefone**, **CPF**  
   - CPF fica só no aparelho (nunca no WhatsApp)

2. **Gemini rewrite** (toggle em Hoje)  
   - Prompt **conciso + assertivo**  
   - **Preserva identidade** da oferta (preço/data/nome/fatos)  
   - Mensagem em JSON separado (anti injection)  
   - Se o modelo inventar/sumir fato → **volta a frase original** (não muda o sentido)

3. **Gemini foto 404**  
   - Retry automático de modelos (2.5-flash etc.)  
   - Erro legível; **não injeta mais lista demo** se a IA falhar  
   - Demo só no botão **Lista demo**

4. **Build / typecheck / tests**  
   - `tsc` + `vitest` (29) + `vite build` verdes no commit da Onda 0

5. **WhatsApp server**  
   - `/api/wa/status` devolvendo JSON (crash FUNCTION_INVOCATION corrigido antes)

---

## Veredito Codex Sol (sistema inteiro)

**NO-GO para ship “produto público multi-usuário / live bancário”.**

Motivos estruturais (ainda válidos):
- `/api/wa/*` aberto se secret não configurado; `VITE_*` não é secret real  
- Master Evolution VSB no perímetro Lista Zap  
- PII/keys em localStorage em claro  
- Proxy `/api/evo` genérico  
- Dívida de multi-aba / idempotência na fila  

**Uso pessoal do fundador (demo + Excel + envio consciente):** operacional com ressalvas — ver checklist abaixo.

Relatório completo: **`docs/AUDITORIA-CODEX-SOL-SISTEMA-COMPLETO.md`**

---

## Checklist rápido ao acordar

| # | Ação | OK? |
|---|------|-----|
| 1 | Hard refresh em listawpp.vercel.app | |
| 2 | Ajustes → colar API key Gemini → escolher **2.5 Flash** → badge Salvo | |
| 3 | Escanear → **Excel/CSV** com Nome + Telefone | |
| 4 | Revisar linhas → Confirmar → Fila | |
| 5 | (Opcional) foto + Extrair IA — se falhar, use Excel | |
| 6 | Toggle “Reescrever com Gemini” só se quiser variação | |
| 7 | Conectar WhatsApp **uma vez** (não spammar botão) | |
| 8 | Permitir fora do horário se for de madrugada | |

---

## Onda 1 (ainda não feito — prioridade da semana)

1. Auth real `/api/wa/*` + desligar proxy `/api/evo` em prod  
2. Tirar master VSB; token só `lista-zap`  
3. Lock entre abas + abort de fetch no stop/wipe  
4. SheetJS ≥ 0.20.2 (versão atual vendored 0.18.5)  
5. Detector CPF Unicode unificado client/server  

---

Boa manhã. O produto **funciona** no fluxo Excel → fila → envio; o Sol diz **não** tratar isso como produção isolada do VSB sem a Onda 1.
