<!-- /docs/IDENTITY_TRANSFER.md -->
# Přenos identity mezi zařízeními

**Stav:** cílová specifikace; implementaci je nutné ověřit a dokončit.

## Cíl

Uživatel může používat jeden účet Člověče, nezlob se! na více vlastních zařízeních. Přidání dalšího zařízení nesmí odhlásit ani zneplatnit již připojená zařízení.

## Pravidla přenosového kódu

1. Přihlášené zařízení může vygenerovat více přenosových kódů.
2. Každý kód platí 15 minut od vytvoření.
3. Každý kód lze úspěšně použít pouze jednou.
4. Jeden kód připojí právě jedno nové zařízení k identitě/účtu, ze kterého byl vytvořen.
5. Vygenerování dalšího kódu nesmí zneplatnit žádný dosud platný kód.
6. Použití jednoho kódu nesmí zneplatnit ostatní dosud platné kódy.
7. Po vypršení platnosti nebo úspěšném použití je konkrétní kód neplatný.
8. Původní zařízení zůstává přihlášené; jeho identita se nepřevádí ani nemaže.
9. Přenos není omezen na jeden přenos za účet. Další zařízení lze přidávat i po týdnech, měsících nebo letech.

## Příklad

Na telefonu lze vygenerovat tři různé kódy a postupně je použít pro tablet, druhý telefon a počítač. Každý kód má vlastní patnáctiminutovou lhůtu. Vygenerování druhého a třetího kódu nesmí zneplatnit první.

Později lze na kterémkoli stále přihlášeném zařízení vygenerovat další kód a přidat další zařízení.

## Správa zařízení

- V profilu účtu bude seznam připojených zařízení.
- Uživatel může odebrat konkrétní zařízení.
- Odebrání zneplatní pouze přístupový token odebraného zařízení.
- Ostatní zařízení zůstanou přihlášená.
- Uživatel může přidat další zařízení, pokud má stále přístup k účtu.

## Bezpečnostní požadavky

- Databáze ukládá pouze hash přenosového kódu, nikoli jeho čitelnou podobu.
- Kód generuje kryptograficky bezpečný generátor náhodných hodnot.
- Kontrola platnosti, jednorázového použití a připojení zařízení proběhne atomicky v databázové transakci.
- Kódy se nesmějí zapisovat do aplikačních logů ani analytiky.
- Kód se předává pouze přes HTTPS.
- Chybný, expirovaný nebo použitý kód nesmí změnit identitu zařízení.
- Odebrání zařízení musí zneplatnit jeho token na serveru, nejen odstranit cookie.
- Přenos identity nesmí měnit heslo účtu ani bez ověření připojit zařízení k cizímu účtu.

## Požadavky na implementaci

- Každý kód má vlastní databázový záznam, hash, čas vytvoření, čas expirace a stav použití.
- Vytvoření nového kódu nesmí hromadně zneplatnit předchozí nepoužité kódy.
- Uplatnění kódu označí jako použitý pouze konkrétní uplatněný kód.
- Server odmítne kód po 15 minutách, i když jej klientská aplikace stále zobrazuje.
- Původní zařízení zůstane aktivní po vygenerování i po uplatnění kódu.

## Akceptační testy

1. Vygenerovat dva kódy na jednom zařízení; oba jsou současně platné.
2. Použít první kód na druhém zařízení; druhý kód zůstane platný.
3. Použít druhý kód na třetím zařízení; obě nová zařízení jsou připojena ke stejnému účtu.
4. Znovu použít první kód; server jej odmítne.
5. Použít kód po uplynutí 15 minut; server jej odmítne.
6. Vygenerovat nový kód po měsíci; lze jej normálně použít.
7. Ověřit, že původní zařízení zůstalo přihlášené.
8. Odebrat jedno zařízení; ostatní zařízení zůstanou přihlášená.
9. Současně uplatnit stejný kód na dvou zařízeních; uspěje nejvýše jedno.
10. Ověřit, že chybný nebo expirovaný kód nezmění identitu cílového zařízení.

## Aktuální technický stav

V aktuálním online-api.php je serverová expirace 15 minut již kontrolována při uplatnění kódu pomocí created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE). Uplatnění probíhá v databázové transakci se zámkem záznamu FOR UPDATE a po úspěchu se konkrétní kód zneplatní pomocí revoked_at. Původní zařízení zůstává připojené.

**Zjištěný nesoulad:** akce create_transfer_code před vytvořením nového kódu nejprve zneplatňuje všechny předchozí aktivní záznamy označené device_label = 'transfer'. Proto nyní nelze mít více současně platných kódů. Implementační změna musí odstranit pouze toto hromadné zneplatnění a zachovat kontrolu expirace, transakci a jednorázové uplatnění. Dokumentace popisuje požadovaný cílový stav; změna kódu zatím nebyla provedena.