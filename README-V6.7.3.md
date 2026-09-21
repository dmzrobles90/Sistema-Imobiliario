# V6.7.3 — Gestão de Repasses

- Prazo de repasse configurável por contrato (dias corridos após o recebimento).
- Novos repasses recebem data prevista calculada a partir da data real do pagamento.
- Central Financeira exibe a data prevista do repasse.
- Confirmação de repasse em modal próprio, com data efetiva, meio, observação e comprovante opcional.
- Comprovantes ficam no bucket privado `imob-documentos`.
- Mantém a regra do primeiro aluguel e taxa/repasse já validada.

Execute `supabase/migracao-v6.7.3-gestao-repasses.sql` antes de usar esta versão.
