# Revisão Adversarial de Segurança — Lista Zap

**Data:** 2026-08-04
**Escopo:** `src/` completo (stores, lib, screens, components), persistência, hydration, PWA, dependências
**Barra aplicada:** bancária + dado sensível (CPF / LGPD)
**Método:** leitura adversarial do código + execução de provas contra o pipeline real (`vitest`, probe descartável)

---

## 1. Resumo executivo

**Veredito: NO-GO para operação live com dados reais de clientes.**
**GO condicional apenas para modo demo** (`demoMode: true`, que é o default — `src/types.ts:88`).

A arquitetura de segurança está **desenhada certa e implementada errada nos pontos que importam**. Existe uma barreira fail-closed no envio (`assertSafeOutboundText`), existe sanitização de log em duas camadas, existe hash de PIN com PBKDF2 real. Nada disso é teatro. O problema é que:

1. **A regex que sustenta a regra "CPF nunca vai no WhatsApp" cobre 2 de pelo menos 6 formatos de CPF.** Confirmei por execução que um CPF separado por espaços dentro do campo `nome` atravessa as três camadas de defesa e chega ao payload da Evolution — e a asserção fail-closed declara o texto limpo. A regra número 1 do produto está quebrada.
2. **O botão "Apagar todos os dados locais" não apaga os dados.** Remove as chaves do `localStorage` mas deixa clientes, fila e settings vivos em memória — e o `persist` do Zustand regrava tudo em disco na próxima mutação. O único mecanismo de remediação para aparelho compartilhado é decorativo.
3. **CPF sai do aparelho.** A foto da lista de papel (nome + telefone + CPF) é enviada para `generativelanguage.googleapis.com`, e o prompt de visão **pede o CPF explicitamente**. O README e a UI afirmam o contrário ("Dados só no localStorage deste aparelho").

Nenhuma dessas três é hipotética. As duas primeiras foram verificadas rodando o código.

**Bloqueadores de ship:** C1, C2, H1, H2, H3, H4.

---

## 2. Tabela de findings

| ID | Sev | Arquivo:linha | Evidência | Impacto | Fix |
|---|---|---|---|---|---|
| **C1** | CRITICAL | `src/lib/security.ts:11-13`, `18-25`, `87-99` | Regexes cobrem só `529.982.247-25` e `52998224725`. Provado em execução: `529 982 247 25`, `529.982.247.25`, `529-982-247-25` e `doc529.982.247-25` passam intactos. O texto entra pelo campo `nome` (`src/lib/gemini.ts:80` não sanitiza `nome`; `src/stores/clients.ts:56`; `src/lib/queue-worker.ts:146`) e `assertSafeOutboundText` retorna **sem lançar** porque `containsCpf` usa as mesmas regexes cegas. | **CPF real no texto/caption enviado ao WhatsApp.** Violação direta da regra inegociável do produto. Um único erro de OCR juntando nome+documento numa linha manuscrita basta. | Trocar detecção por normalização: extrair dígitos de qualquer janela de 11+ chars com separadores `[.\-\s/]`, validar com dígito verificador de CPF, e redigir por posição. Remover `\b` (falha com `doc529...`). Sanitizar `nome` **na ingestão** (`gemini.ts` e `clients.ts`), não só na saída. Adicionar teste de tabela com ≥10 formatos. |
| **C2** | CRITICAL | `src/lib/security.ts:172-191`, `src/stores/auth.ts:114-124` | `wipeLocalAppData()` só faz `localStorage.removeItem` de 4 chaves. Os stores `clients`/`queue`/`settings` **não são resetados em memória**. `node_modules/zustand/esm/middleware.mjs:365-371` mostra `api.setState` envolvido para chamar `setItem()` em **toda** mutação → a próxima escrita ressuscita tudo em disco. Após o wipe o usuário clica "Voltar ao app" e a base inteira ainda está lá. | **O controle de remediação para aparelho compartilhado não funciona.** Usuário acredita ter apagado CPFs e chaves; ambos persistem. Falha silenciosa — a toast diz "Dados locais apagados". | `wipeAllData` deve resetar o estado de cada store (`useClientsStore.setState({clients:[]}, true)` etc.), parar o worker, limpar `sessionStorage`, e só então `removeItem`. Idealmente seguido de `location.reload()`. Teste: wipe → mutar settings → assertar que `lista-zap-clients` não reaparece. |
| **H1** | HIGH | `src/screens/LoginScreen.tsx:290-297`, `src/stores/auth.ts:114-123` | O botão "Apagar todos os dados locais" é renderizado **incondicionalmente**, inclusive com `lockEnabled && !unlocked` (tela de bloqueio). Não pede PIN. E `wipeAllData` seta `lockEnabled:false, unlocked:true` — desativa o bloqueio. | Quem pega o aparelho bloqueado destrói a base sem autenticação **e remove o lock**. Destruição de dados + desativação de controle de acesso por ator não autenticado. | Exigir PIN válido antes do wipe quando `lockEnabled`. Nunca desativar o lock como efeito colateral de um wipe. |
| **H2** | HIGH | `src/lib/gemini.ts:9-17`, `42-53`, `111-144` | `VISION_PROMPT` instrui: *"cpf: só dígitos se visível"*. A foto da lista completa (nome + telefone + CPF de N pessoas) vai em base64 para `generativelanguage.googleapis.com`. Além disso `rewriteMessage` envia o **nome de cada cliente** ao Google a cada mensagem, e `useGeminiRewrite` é `true` por default (`src/types.ts:103`). | Transferência internacional de dado pessoal (art. 33 LGPD) sem base legal declarada, sem consentimento, sem DPA. Contradiz o README (`"Dados só no localStorage deste aparelho"`) e a UI (`LoginScreen.tsx:147-149`). CPF **sai** do aparelho. | Decisão de produto explícita e documentada. Mínimo: remover `cpf` do `VISION_PROMPT` e descartar o campo na resposta; avisar no fluxo de Escanear que a imagem vai para o Google; tornar `useGeminiRewrite` opt-in; corrigir README/UI para parar de afirmar o falso. |
| **H3** | HIGH | `src/stores/settings.ts:65-83`, `src/screens/LoginScreen.tsx:147-149`, `src/screens/ConfigScreen.tsx:481-484` | `evolutionApiKey` e `geminiApiKey` são persistidos em texto claro no `localStorage`, junto com todos os CPFs (`clients.ts:189`). O PIN (`auth.ts`) protege **apenas o render** — não cifra nada. A UI instrui: *"use PIN em aparelho compartilhado"*, o que é falso: qualquer devtools, extensão ou script lê tudo com o app trancado. | Segredos + CPF em claro. O usuário é induzido a confiar num controle que não existe. Comprometimento total com acesso local trivial. | Ou (a) derivar chave do PIN via PBKDF2 e cifrar `clients`+`settings` com AES-GCM (WebCrypto) antes de persistir, ou (b) **parar de afirmar proteção que não existe** na UI. (a) é a barra bancária; (b) é o mínimo honesto. Não fazer nenhuma das duas é o estado atual. |
| **H4** | HIGH | `src/lib/evolution.ts:119-125`, `168-176`; `src/screens/ConfigScreen.tsx:235-250` | `getConnectionState` e `fetchQrCode` montam a string de erro **fora** do construtor `EvolutionError` e a devolvem crua em `{error}` — pulando `sanitizeErrorMessage`. `ConfigScreen` renderiza `{waError}` direto. Agravante: `API_KEYISH` (`security.ts:14-15`) só reconhece `AIza…`, `sk-…` e `Bearer …`; a apikey da Evolution é string arbitrária (UUID) e **não seria redigida nem se passasse pelo sanitizador**. | Corpo bruto de resposta de servidor externo renderizado na tela (até 120-160 chars). Proxy/gateway que ecoa headers → apikey da Evolution visível na UI e em screenshot. Disclosure de internals. | Passar `sanitizeErrorMessage` em **todo** retorno de erro de `evolution.ts`. Adicionar redação da `evolutionApiKey` corrente por valor (comparação literal), não por padrão. Nunca renderizar corpo de resposta upstream — só o status. |
| **H5** | HIGH | `src/screens/HojeScreen.tsx:47-63`, `src/stores/settings.ts:82` | Aceita imagem até 4 MB → dataURL base64 ≈ 5.5 MB → excede a cota típica de `localStorage` (~5 MB). `setItem` do persist **não tem try/catch** (`middleware.mjs:358-371`): lança `QuotaExceededError` **depois** de `savedSetState` já ter aplicado o estado. A toast `"Imagem comercial salva"` (linha 60) nem chega a rodar. | Estado em memória diverge do disco. A partir daí **toda** mutação de settings lança — incluindo salvar a apikey da Evolution, que nunca persiste. Falha silenciosa numa store que guarda segredos. | Limitar a ~600 KB, redimensionar via `canvas` antes de salvar, e mover a imagem para IndexedDB (não `localStorage`). Envolver a escrita em try/catch com toast de erro real. |
| **H6** | HIGH | `src/lib/phone.ts:48-51` (dead code), `src/stores/queue.ts:63-76`, `src/lib/queue-worker.ts:171-177` | `isValidBrPhone` existe e **nunca é chamado** (confirmado por grep). `normalizePhone` prefixa `55` em qualquer coisa de 10-11 dígitos e devolve lixo intacto fora dessa faixa. Nada valida antes de enfileirar ou enviar. | Erro de 1 dígito no OCR → mensagem contendo o **primeiro nome do cliente** entregue a um estranho. Vazamento de PII para terceiro não relacionado, em escala de lote. | Chamar `isValidBrPhone` em `upsertFromRows`, `addManual` e `enqueueClients`; bloquear (não só avisar) na tela de revisão do Escanear. |
| **M1** | MEDIUM | `src/stores/auth.ts:94-97`, `src/lib/queue-worker.ts:81-220` | `lock()` só escreve `sessionStorage` e seta `unlocked:false`. O loop do worker é módulo-level e **continua enviando** com a tela de bloqueio na frente. `wipeAllData` também não para o worker. | "Sair" não interrompe operação em nome do usuário. Envios continuam após bloqueio/wipe. | `lock()` e `wipeAllData()` devem chamar `stopQueueWorker()`. |
| **M2** | MEDIUM | `src/screens/LoginScreen.tsx:35-50`, `src/stores/auth.ts:61-67` | PIN mínimo 4 chars, sem throttle, sem lockout, sem contador de tentativas. `pinSalt`+`pinHash` legíveis em `lista-zap-auth`. PBKDF2 120k é honesto, mas o espaço de busca de um PIN de 4 dígitos é 10⁴. | Brute force offline do PIN em minutos; online sem nenhuma barreira. (Impacto atenuado por H3: os dados já estão em claro de qualquer forma.) | Exigir 6+ dígitos, backoff exponencial após 5 tentativas, contador persistido. |
| **M3** | MEDIUM | `index.html` (sem CSP), `index.html:17-22` | Nenhum CSP, nenhum header de segurança. Fontes carregadas de `fonts.googleapis.com` / `fonts.gstatic.com`. `connect-src` irrestrito. | Qualquer XSS ou comprometimento de dependência lê `localStorage` inteiro (CPF + 2 API keys) e exfiltra para qualquer destino sem obstáculo. Numa barra bancária, ausência de CSP com segredos em claro no mesmo storage é composição perigosa. | CSP com `connect-src` restrito à URL da Evolution + `generativelanguage.googleapis.com`; `object-src 'none'`; `base-uri 'self'`. Auto-hospedar as fontes. Sem CSP não há contenção pós-XSS. |
| **M4** | MEDIUM | `src/lib/queue-worker.ts:192-202` | O `catch` trata todo erro igual. `EvolutionError` já carrega `kind: 'config' \| 'cors' \| 'network' \| ...` (`evolution.ts:6`) e essa informação é **descartada**. Evolution fora do ar → todos os N itens tentam, falham, e cada cliente é marcado `contactStatus:'failed'` (`queue-worker.ts:200`). | Corrupção de dados em massa: base inteira marcada como "falha" por indisponibilidade de infra, não por número inválido. Log poluído. | Abortar a fila em `kind === 'config' | 'cors'` na primeira ocorrência; só marcar `failed` em erro HTTP específico do destinatário. |
| **M5** | MEDIUM | `src/stores/*.ts` (todos os `partialize`), `src/screens/HojeScreen.tsx:329`, `src/lib/evolution.ts:78` | Estado reidratado do `localStorage` sem validação de schema em nenhum dos 4 stores. `commercialImageDataUrl` vai direto em `<img src>`. `normalizeQrDataUrl` cai em `return s` e devolve string arbitrária, também usada como `<img src>` (`ConfigScreen.tsx:284`). | Storage adulterado → `evolutionUrl` apontando para servidor do atacante (exfiltra telefone + texto de toda mensagem + apikey). `<img src>` arbitrário → beacon de rastreamento. (Prototype pollution **não** se aplica: object spread cria própria propriedade — verificado.) | Validar com Zod no `merge`/`onRehydrateStorage` de cada store. Em `normalizeQrDataUrl`, retornar `null` no fallback em vez da string crua. |
| **M6** | MEDIUM | `src/types.ts:89`, `src/lib/evolution.ts:19-28` | `evolutionUrl` default `http://localhost:8081`, sem validação de esquema. Nada impede apontar para `http://` remoto. | apikey (header `apikey`), telefone e corpo da mensagem em texto claro na rede. | Rejeitar `http://` para host não-loopback, com aviso explícito na Config. |
| **M7** | MEDIUM | `src/components/layout/AuthGate.tsx:26`, `src/hooks/useHydrated.ts:36-39`, `src/stores/auth.ts:146-149` | Dois gates de hydration independentes. Se o browser bloqueia storage, o persist do Zustand retorna cedo (`middleware.mjs`, `if (!storage) return`) e `onRehydrateStorage` **nunca** roda → `auth.hydrated` fica `false` para sempre → `AuthGate` retorna `null`. O fallback de 800 ms do `useHydrated` cobre só o gate externo. | Tela branca permanente com cookies/storage bloqueados. Indisponibilidade total, sem mensagem. | Unificar num único gate; dar timeout de segurança ao `auth.hydrated` também; renderizar erro explícito quando o storage não está disponível. |
| **L1** | LOW | `src/lib/security.ts:51-57`, `src/stores/queue.ts:148`, `src/screens/FilaScreen.tsx:157` | `maskNameForLog` grava "Maria S." — nome próprio completo. 50 linhas de log persistem em `localStorage` (`queue.ts:192`). Toast `Pulado: ${firstPending.name}` mostra nome inteiro. | PII em log persistido além do necessário para operar. | Usar iniciais ou o `itemId` (já existe no log). Não persistir logs de operação. |
| **L2** | LOW | `src/lib/security.ts:12-13` | `CPF_BARE` é **código morto**: `CPF_FMT` tem todos os separadores opcionais, então já casa 11 dígitos nus. O guard `(?!55)` nunca tem efeito — verificado: `55512345678` é capturado por `CPF_FMT`. | Aparência de duas camadas onde há uma. Induz falsa confiança na revisão. | Remover `CPF_BARE` ao reescrever para C1. |
| **L3** | LOW | `src/lib/security.ts:60-69` | `stripCpfEverywhere` roda **antes** do mascaramento de telefone, e casa qualquer sequência de 11 dígitos → telefone local vira `[cpf-removido]` em vez de `***4321`. | Debug prejudicado; log mente sobre o que foi redigido. | Mascarar telefone primeiro, depois CPF. |
| **L4** | LOW | `src/screens/ClientesScreen.tsx:98-106`, `224` | "Revelar CPF" é global: revela **todos** os CPFs da lista de uma vez, sem step-up, sem timeout, sem registro. | Shoulder surfing revela a base inteira num toque. Sem trilha de acesso a dado sensível. | Revelar por linha, com timeout de 10s e log local do acesso. |
| **L5** | LOW | `phone.ts:48`, `cpf.ts:21,28`, `message.ts:51` | `isValidBrPhone`, `formatCpf`, `looksLikeCpf`, `stripCpfFromText` — nenhum é chamado (grep). | `looksLikeCpf`/`isValidBrPhone` são exatamente as validações que faltam em C1/H6. Código morto que parece cobertura. | Usar ou deletar. |
| **L6** | LOW | `package.json:7`, `startup.sh` | `vite --host 0.0.0.0`. | Dev server e código-fonte expostos na LAN. | `--host 127.0.0.1` como default. |
| **L7** | LOW | `src/lib/evolution.ts:44`, `src/lib/gemini.ts:43`, `src/screens/ConfigScreen.tsx:42-49` | Nenhum `fetch` tem `AbortController` nem timeout. `stopPolling` só marca uma flag; requisições em voo continuam. | Fila trava indefinidamente em servidor que não responde; `setState` após unmount. | `AbortSignal.timeout(15000)` em todos os fetch; abortar no `stopPolling`. |
| **I1** | INFO | — | `npm audit` (prod e dev): **0 vulnerabilidades**. Árvore enxuta: React 19, TanStack Router, Zustand, Sonner, Lucide. | — | Manter. |
| **I2** | INFO | `src/` | Zero `dangerouslySetInnerHTML`, zero `innerHTML`, zero `eval`/`new Function`, zero `console.*` (grep). | Sem sink de XSS no código próprio. | Manter — é o que torna M3 sobrevivível hoje. |

---

## 3. O que já está bem feito (com evidência)

Não é elogio de cortesia — cada item abaixo foi verificado no código.

- **Fail-closed no envio existe como arquitetura.** `assertSafeOutboundText` (`security.ts:87-99`) lança em vez de degradar, e é chamado no ponto certo, antes de qualquer `sendText`/`sendMedia` (`queue-worker.ts:152`). O desenho está certo; só a detecção é rasa (C1). Corrigir C1 não exige mexer na arquitetura.
- **Sanitização de log em duas camadas independentes.** O worker chama `sanitizeLogLine` (`queue-worker.ts:57`) *e* o store re-sanitiza em `addLog` (`queue.ts:144`), `messagePreview` e `error` (`queue.ts:91-97`). Se um chamador esquecer, o store cobre. Isso é defesa em profundidade de verdade.
- **`unlocked` fora do `partialize`** (`auth.ts:139-145`, com comentário explícito). Sessão vive só em `sessionStorage` — a decisão certa.
- **`running` nunca persiste como `true` e `sending` volta para `pending` no reload** (`queue.ts:186-196`). Elimina worker fantasma e item preso após crash.
- **Sem retry automático.** `claimNextPending` só pega `pending` (`queue.ts:166-167`, com comentário adversarial). Retry é ação explícita do usuário. Evita loop infinito e flood.
- **PBKDF2 SHA-256 com 120k iterações, salt de 16 bytes via `getRandomValues`, comparação em tempo constante** (`security.ts:102-154`). Implementação correta, sem crypto caseira.
- **Anti-ban real em live:** janela de horário, tamanho de lote, pausa entre lotes e delay aleatório (`queue-worker.ts:103-127`, `206-212`), com presets honestos que dizem "reduz risco, não elimina" (`anti-ban.ts:22-26`). Demo encurta delays de forma isolada (`randomDelayMs`, linha 37) sem contaminar o caminho live.
- **`demoMode: true` por default** (`types.ts:88`) e `forceDemo` propagado corretamente em Escanear (`EscanearScreen.tsx:64`) e no rewrite (`gemini.ts:122-128`). O app não faz nada perigoso out of the box.
- **`MAX_QR_POLLS = 20`** com contador em ref e cleanup no unmount (`ConfigScreen.tsx:28`, `51`) — polling limitado, não infinito.
- **A saída do modelo Gemini não é confiada:** `stripCpfEverywhere` é aplicado no retorno (`gemini.ts:160`, comentário "never trust the model"). Postura certa.
- **Erros no caminho de *envio* passam pelo construtor sanitizador** do `EvolutionError` (`evolution.ts:12`). O furo (H4) está só no caminho de *status/QR*, não no de envio.

---

## 4. Plano de remediação priorizado

### Onda 0 — Bloqueia qualquer uso live (dias, não semanas)

1. **C1** — Reescrever a detecção de CPF: normalizar dígitos numa janela com separadores `[.\-\s/]`, validar dígito verificador, redigir por posição. Remover `\b`. Sanitizar `nome` na **ingestão** (`gemini.ts:79-87`, `clients.ts:56,79`). Suite de tabela com ≥10 formatos, incluindo os 4 que provei que vazam.
2. **C2** — `wipeAllData` reseta os 4 stores em memória, para o worker, limpa storage e recarrega. Teste de regressão: wipe → mutar settings → `lista-zap-clients` não pode reaparecer.
3. **H1** — Exigir PIN para o wipe quando `lockEnabled`. Wipe nunca desativa o lock.
4. **H4** — `sanitizeErrorMessage` em todo retorno de erro de `evolution.ts`; redigir a `evolutionApiKey` por valor literal; parar de renderizar corpo upstream.

### Onda 1 — Antes de tocar em base real de cliente

5. **H2** — Decisão documentada sobre o Google. Remover `cpf` do `VISION_PROMPT`, avisar no fluxo, `useGeminiRewrite` opt-in, corrigir README e UI.
6. **H3** — Cifrar `clients` e `settings` com AES-GCM derivado do PIN — **ou** remover da UI toda afirmação de proteção que não existe. Escolher uma.
7. **H6** — `isValidBrPhone` no caminho de ingestão e enfileiramento, bloqueante.
8. **H5** — Limitar/redimensionar a imagem comercial; mover para IndexedDB; try/catch com erro visível.

### Onda 2 — Endurecimento

9. **M1** (lock/wipe param o worker) · **M4** (circuit breaker por `kind`) · **M3** (CSP + fontes self-hosted) · **M6** (bloquear `http://` remoto).

### Onda 3 — Higiene

10. **M2** (PIN 6+ com backoff) · **M5** (Zod na reidratação) · **M7** (gate único de hydration) · **L1-L7**.

---

## 5. Testes que faltam

A suíte atual tem **6 testes, um único arquivo** (`src/lib/security.test.ts`), todos passando — e todos passam *apesar* de C1 estar aberto. É o retrato de uma suíte que testa o caminho feliz da própria implementação.

Ausente e necessário:

**Segurança de CPF (bloqueante)**
- Tabela de formatos: `529.982.247-25`, `52998224725`, `529 982 247 25`, `529.982.247.25`, `529-982-247-25`, `529.982.24725`, `doc529.982.247-25`, `CPF:529982247-25`, com e sem contexto. Hoje 4 desses vazam.
- Teste end-to-end do pipeline real (`applyTemplate` → `localRewrite` → `assertSafeOutboundText`) com CPF injetado via **`nome`**, não só via template. Foi assim que encontrei C1.
- Teste do caminho Gemini: mock de resposta contendo CPF em todos os formatos.
- Property test: para qualquer CPF válido gerado, em qualquer formatação, o payload de saída não pode conter 11 dígitos do documento em nenhuma ordem contígua.

**Wipe e persistência**
- Wipe → mutação em cada store → assertar que nenhuma chave reaparece no `localStorage`.
- Wipe com fila rodando → worker parado.
- `QuotaExceededError` simulado → erro visível, estado consistente.

**Auth**
- Wipe a partir da tela bloqueada deve ser rejeitado sem PIN.
- `lock()` para o worker.
- Reidratação com `localStorage` indisponível → app renderiza erro, não tela branca.

**Fila**
- Erro `kind:'config'` aborta a fila e não marca clientes como `failed`.
- Fora da janela de horário: nenhum `sendText` é chamado (spy).
- `demoMode: true`: zero chamadas de rede (spy em `fetch` global) — hoje isso não é verificado por nenhum teste.

**Evolution**
- Resposta com corpo malicioso/ecoando header → apikey não aparece na string de erro.

**Infra de teste**
- `vitest.config.ts` usa `environment: 'node'` e `include: ['src/**/*.test.ts']` — exclui `.tsx`, então **nenhum componente é testável hoje**. Precisa de `jsdom` + `.tsx` no include para cobrir AuthGate, LoginScreen e o gate de hydration.
- Sem E2E. Playwright já está no `devDependencies` e não é usado.

---

## 6. Nota de método

As afirmações "confirmado por execução" nesta revisão vêm de:
- probe descartável em `src/lib/` importando os módulos reais de produção, executado com `vitest run` e **removido em seguida** — nenhum arquivo de produção foi alterado;
- inspeção direta de `node_modules/zustand/esm/middleware.mjs:358-371` para o comportamento de escrita do `persist`;
- `npm audit` (prod e completo) e greps de sinks (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `console.*`, `localStorage`).

Não há nesta lista nenhum finding especulativo apresentado como confirmado. Onde o impacto depende de configuração do usuário (M5, M6), isso está dito no texto.
