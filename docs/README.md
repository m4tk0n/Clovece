# Dokumentace projektu

Technická a funkční dokumentace projektu Člověče, nezlob se! je soustředěna v tomto adresáři.

## Dokumenty

- [Pravidla hry](GAME_RULES.md) – jediný závazný zdroj herních pravidel.
- [Strategie AI](AI_STRATEGY.md) – taktika a rozhodování počítačových hráčů.
- [Přenos identity mezi zařízeními](IDENTITY_TRANSFER.md) – pravidla přenosových kódů a správy zařízení.
- [Pravidla herního chatu a logu](CHAT_LOG.md) – formát a seskupování událostí.
- [Diagnostika](DEBUG.md) – debug režim a diagnostické informace.
- [Automatické testování](TEST_RUNNER.md) – testovací laboratoř, scénáře a automatizace.
- [Databázový plán](DATABASE-PLAN.md) – databázová architektura a migrace.
- [Roadmapa](ROADMAP.md) – plán vývoje.
- [Historie verzí](VERSION_HISTORY.md) – chronologický přehled změn.

## Zásady

- Dokumentace se upravuje společně s příslušnou změnou aplikace.
- Závazná pravidla hry jsou pouze v GAME_RULES.md; ostatní dokumenty je mohou odkazovat, ale nesmějí je kopírovat ani měnit.
- Plánované chování musí být jasně odlišeno od skutečně implementovaného a otestovaného stavu.
- Soubory v docs/ se nenasazují na veřejný web přes FTP workflow.
- Hlavní README.md zůstává v kořeni repozitáře.