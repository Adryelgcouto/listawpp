# Separação VSB × Lista Zap — Codex Sol (adversarial)

**Data:** 2026-08-05  
**Modelo:** gpt-5.6-sol (xhigh) + consolidação pós-sessão (sandbox read-only impediu o Sol de gravar o arquivo; conteúdo reconstruído a partir do veredito e evidências da sessão).  
**Escopo:** multi-produto, secrets, infra WhatsApp/Evolution, Gemini, risco legal.

---

## 1. Veredito

### **NO-GO para produção compartilhada**

Checklist de isolamento: **4 PASS / 18 FAIL** (sessão Sol).

Lista Zap **não** está isolado o suficiente do VSB para operar como produto separado em produção com a barra bancária+clínica do VSB. Instância `lista-zap` no **mesmo** container Evolution, com a **mesma master key**, no **mesmo** host/domínio, **não** é fronteira de autorização — é só um nome diferente sob o mesmo superusuário.

| Uso | Veredito |
|-----|----------|
| Demo / uso pessoal local do fundador | GO condicional (aceitar risco consciente) |
| Produção pública multi-usuário com Evolution VSB | **NO-GO** |
| Ship “produto separado” com master VSB no Vercel | **NO-GO** |

---

## 2. Mapa de acoplamento

| Camada | Estado atual | Risco |
|--------|--------------|--------|
| **Infra** | Mesmo container `wpp-evolution` / host `163.176.154.67` | Disponibilidade e blast radius compartilhados |
| **Secrets** | `EVOLUTION_API_KEY` no Vercel = master `AUTHENTICATION_API_KEY` / `EVOLUTION_API_AUTH_KEY` do VSB | Compromete **todas** as instâncias VSB se vazar |
| **Auth adapter VSB** | `EvolutionApiWhatsAppGateway` usa `masterApiKey` e **ignora** `apiKey` por instância no envio/status/QR | “Chave por instância” documentada ≠ real |
| **Domínio** | `adryel.giize.com/evolution` (path nginx) / defaults no app apontam VSB | Marca e superfície de ataque misturadas |
| **API pública Lista Zap** | `/api/wa/status`, `/qr`, `/send` usam env server-side **sem autenticar o chamador** | Qualquer um que ache a URL envia no número pareado |
| **Dados** | Lista Zap: browser localStorage; VSB: multi-tenant clínico | Isolamento de **dados de cliente** ok *hoje*; risco é **canal WhatsApp + secret** |
| **Marca / copy** | UI e defaults citam VSB, `wpp.viversemprebemvsb.com`, `EVOLUTION_API_AUTH_KEY` | Produto não “parece” separado |
| **Legal / billing** | Mesmo número/infra pode misturar outreach comercial Lista Zap com canais saúde/financeiro VSB | Contaminação reputacional e regulatória |
| **Gemini** | Key do usuário no browser; foto de lista pode ir ao Google (opt-in consciente) | LGPD transfer internacional — produto Lista Zap, **não** misturar com PHI VSB |

---

## 3. Findings (separação + superfície)

### CRITICAL

| ID | Finding | Evidência |
|----|---------|-----------|
| **S-C1** | Master key VSB reutilizada no Lista Zap (Vercel env + UI pede master) | `api/wa/*`, `ConfigScreen`, env `EVOLUTION_API_KEY` |
| **S-C2** | `/api/wa/send` (e status/qr) **sem auth do usuário** — send aberto se a URL for pública | `api/wa/send.ts`, `status.ts`, `qr.ts` |
| **S-C3** | Adapter VSB ignora `apiKey` de instância e manda com master | `EvolutionApiWhatsAppGateway.java` (header `apikey: masterApiKey`) |
| **S-C4** | Mesmo process/DB Evolution: logout/delete/create com master afeta o pool VSB | create/connect paths em lista-wpp |

### HIGH

| ID | Finding | Evidência |
|----|---------|-----------|
| **S-H1** | Proxy genérico `/api/evo/*` e `/evo` pode ampliar blast se mal configurado | `api/evo/[...path].ts`, Vite proxy |
| **S-H2** | Copy/defaults acoplam marca VSB ao produto Lista Zap | `types.ts` defaults, `ConfigScreen` |
| **S-H3** | Desconexão WA: poll chamava `/instance/connect` em loop (Baileys) — **corrigido nesta sessão** | `ConfigScreen` antigo + `api/wa/qr.ts` |
| **S-H4** | Gemini API key em localStorage em claro (aceito para ferramenta pessoal; documentar) | `settings.ts` partialize |

### MEDIUM

| ID | Finding | Evidência |
|----|---------|-----------|
| **S-M1** | Sem domínio próprio Evolution (`lista-zap.*`) | nginx só path `/evolution` no host VSB |
| **S-M2** | Sem billing/tenant isolation (OK se 1 usuário; fail se multi) | arquitetura atual |
| **S-M3** | Modelo Gemini era free-text — **corrigido** (listagem + select) | `gemini.ts` `listGeminiModels` |

---

## 4. Modelo alvo de separação (mínimo viável correto)

### Onda mínima (produto pessoal do fundador)

1. **Instância dedicada** `lista-zap` (já existe) — **não** basta sozinha.
2. **Chave por instância** Evolution (token da instância, não master).  
   - Master **só** no servidor VSB, never no Vercel Lista Zap.
3. **Auth nas rotas `/api/wa/*`**: secret de app ou Vercel Deployment Protection.
4. **URL**: preferir host próprio ou path que não vaze branding VSB no client.
5. **Copy**: zero menção a VSB / master key na UI pública.
6. **Gemini**: key do **usuário final** (Google AI Studio); nunca key VSB; nunca mandar PHI clínico VSB pelo Lista Zap.

### Onda correta (dois negócios)

| Item | Alvo |
|------|------|
| Evolution | **Container / deploy separado** OU no mínimo master distinta + network policy |
| Segredo | Instance token Lista Zap ≠ master VSB |
| Domínio | `api.listazap...` ou Evolution própria |
| Webhooks | Nenhum webhook VSB aponta pra Lista Zap e vice-versa |
| Legal | Termos e base legal Gemini/WhatsApp só do Lista Zap |
| Ops | Restart/quota Evolution Lista Zap não derruba VSB |

### O que **NUNCA** copiar do VSB

- `EVOLUTION_API_AUTH_KEY` / master  
- Instâncias `vsb-*-atd` / `vsb-*-txn` / FINANCEIRO  
- Credenciais tenant, PHI, webhooks de cobrança  
- Branding “Viver Sempre Bem” em produto comercial Lista Zap  
- Barra bancária diluída (“é só marketing”)  

---

## 5. Gemini — chave e uso (o que você precisa ao acordar)

### Onde pegar

1. https://aistudio.google.com/apikey  
2. **Create API key** → copiar `AIza…`  
3. Lista Zap → **Ajustes → Gemini** → colar  
4. **Modelo**: agora é **select** (lista da API + fallback). Preferir `gemini-2.0-flash`.

### O que a key faz

| Feature | Usa Gemini? | Dado que sai |
|---------|-------------|--------------|
| Escanear lista (foto) | Se key presente e não demo | **Imagem** da lista → Google |
| Rewrite de mensagem | Só se toggle “Reescrever com Gemini” ON | Texto da mensagem (sem CPF se sanitizers ok) |
| Envio WhatsApp | Não | — |

### Save

Não há botão “Salvar”: **auto-save no localStorage deste browser**.  
UI mostra badge **“Salvo”** / “auto-save” e texto “salva sozinho neste aparelho”.

### Riscos Gemini (honestos)

- Key em claro no browser (H3 residual).  
- Foto com possível PII → Google (avisar na tela Escanear).  
- Não usar key de projeto VSB / GCP clínico.  
- Rotacionar key se vazar screenshot/devtools.

---

## 6. Plano de remediação

### Onda 0 — esta noite (feita / em andamento no código)

- [x] Parar de spamar `/instance/connect` (throttle + skip se open)  
- [x] Status sticky em erro transitório  
- [x] Health check pós-open só com `connectionState`  
- [x] Select de modelos Gemini + listagem  
- [x] Feedback visual de auto-save  
- [x] Toggle “fora do horário”  
- [ ] **Auth em `/api/wa/*`** (secret) — **ainda aberto, bloqueador S-C2**  
- [ ] Remover master key da UI / defaults VSB  

### Onda 1 — esta semana

1. Gerar **token de instância** Evolution só para `lista-zap`; tirar master do Vercel.  
2. `WA_APP_SECRET` (ou Vercel Password Protection) em todas as rotas `/api/wa/*`.  
3. Domínio/path sem copy VSB.  
4. Codex Sol re-run com write permission; fechar FAIL do checklist.  
5. Opcional: Evolution dedicada se volume/risco subir.

### Onda 2 — produto real

- Evolution e conta WhatsApp 100% fora do perímetro VSB.  
- Multi-user: auth real, não localStorage master.  
- DPA Google + política de retenção de imagens.

---

## 7. Checklist de isolamento (pass/fail)

| # | Critério | Resultado |
|---|----------|-----------|
| 1 | Master VSB fora do Lista Zap | **FAIL** |
| 2 | Token só da instância lista-zap | **FAIL** |
| 3 | `/api/wa/*` autenticado | **FAIL** |
| 4 | Instância ≠ canais VSB (nome) | **PASS** (lista-zap) |
| 5 | Sem webhook cruzado | **PASS** (Lista Zap sem webhook VSB) |
| 6 | Dados de cliente Lista Zap ≠ DB VSB | **PASS** (local) |
| 7 | Domínio/marca separados na UI | **FAIL** |
| 8 | Restart Lista Zap não afeta VSB | **FAIL** (mesmo container) |
| 9 | Gemini key ≠ secrets VSB | **PASS** (user-owned) se o user não colar key VSB |
| 10 | Documentação de separação | **PASS** (este doc) |
| … | (Sol: 18 FAIL agregados incluindo subtensões) | **NO-GO** |

---

## 8. Ações para o fundador ao acordar

1. **Hard refresh** do app (Vercel após deploy).  
2. Ajustes → colar **Gemini** → escolher modelo no select → ver badge **Salvo**.  
3. **Conectar WhatsApp** uma vez; se cair, **não** spammar o botão (poll agora é seguro).  
4. Se for usar live de verdade: planejar Onda 1 (token de instância + auth `/api/wa`).  
5. Aceitar que **compartilhar Evolution VSB é dívida consciente**, não arquitetura final.

---

*Fim do relatório. Veredito Sol: NO-GO produção compartilhada.*
