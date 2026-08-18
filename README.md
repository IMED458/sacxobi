# საცხობის მართვის სისტემა (sacxobi)

წარმოება · ნედლეული · ორსართულიანი მარაგი · POS · ფინანსები — ერთ სივრცეში.

სისტემა აღრიცხავს **რა გამოცხვა, სად, ვინ გამოაცხო, რა დაიხარჯა, რა ღირდა,
რამდენი აიტანეს ზედა სართულზე, რა გაიყიდა, ვინ გაყიდა, ვინ ჩაიბარა და რამდენი
დარჩა სუფთა მოგება** — ყველაფერი რეალურ დროში, Cloud Firestore-ში.

---

## 1. არქიტექტურა

| ფენა | ტექნოლოგია |
| --- | --- |
| UI | React 19 + TypeScript + Vite + Tailwind CSS v4 + lucide-react |
| მონაცემები | Cloud Firestore (client SDK, ატომური ტრანზაქციები) |
| ავტორიზაცია | Firebase Authentication (email/password) |
| ავტორიზება | Firestore Security Rules + `users/{uid}.permissions` |
| PDF | jsPDF + ჩაშენებული Noto Sans Georgian (Unicode) |
| ტესტები | Vitest |
| ჰოსტინგი | GitHub Pages (GitHub Actions) |

### კოდის სტრუქტურა

```
src/
  lib/           firebase, money (თეთრი), dates (Asia/Tbilisi), permissions, pdf
  types/         დომენის ტიპები
  services/      ბიზნეს-ლოგიკა დომენების მიხედვით
    db.ts            კოლექციები, ID/დოკუმენტის ნომრები, undefined-ის გასუფთავება
    auth.ts          login, bootstrap, პაროლები
    users.ts         მომხმარებლების ადმინისტრირება
    catalog.ts       პროდუქტები, მასალები, რეცეპტები, მომწოდებლები, seed
    inventory.ts     FIFO პარტიები, ნაშთები, მოძრაობები (StockOperation)
    purchases.ts     შესყიდვა / მარაგის შემოსვლა
    production.ts    ცხობა და თვითღირებულება
    transfers.ts     სართულებს შორის გადატანა
    sales.ts         POS გაყიდვა, გაუქმება, დაბრუნება
    expenses.ts      ხარჯები
    shifts.ts        ცვლის გახსნა/დახურვა, სალარო
    businessDays.ts  დღის დახურვა/გახსნა
    stocktake.ts     ინვენტარიზაცია
    reports.ts       აგრეგაცია და მოგების გამოთვლა
    audit.ts         უცვლელი Audit Log
  context/       AuthContext, DataContext (real-time master data)
  components/    ui კიტი, layout (Header, Sidebar)
  pages/         ეკრანები
scripts/         create-initial-owner.ts (Admin SDK)
```

### ფულის და თარიღების წესები

* ყველა ფულადი ველი ინახება **მთელ თეთრში** (`1.50 ₾ = 150`) — floating-point
  შეცდომების გარეშე. კონვერტაცია მხოლოდ UI-ში (`src/lib/money.ts`).
* ბიზნეს-დღე ყოველთვის **Asia/Tbilisi**-ის მიხედვით ითვლება (`src/lib/dates.ts`),
  timestamp კი ISO/UTC-ად ინახება.
* დოკუმენტის ნომერში წელი **არასდროს არ არის hardcoded** —
  `SAL-<მიმდინარე წელი>-000001`.

---

## 2. Prerequisites

* Node.js 20+ (რეკომენდებულია 22)
* Firebase პროექტი, სადაც ჩართულია:
  * **Authentication → Sign-in method → Email/Password**
  * **Firestore Database** (production mode)

---

## 3. ინსტალაცია

```bash
npm install
cp .env.example .env   # შეავსეთ VITE_FIREBASE_* (არასავალდებულო — იხ. ქვემოთ)
npm run dev
```

### Environment variables

`.env` არასავალდებულოა: თუ ცვლადები არ არის, გამოიყენება პროექტის ნაგულისხმევი
web-კონფიგურაცია. Firebase-ის web-config **საიდუმლო არ არის** — ის ბრაუზერშივე
ჩანს ნებისმიერ Firebase აპლიკაციაში; რეალურ დაცვას Security Rules იძლევა.

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

`.env` gitignore-შია. სერვის-ანგარიშის გასაღები (`serviceAccount*.json`) — ასევე.

---

## 4. Firebase-ის კონფიგურაცია

### 4.1 Authentication

Firebase Console → **Authentication → Sign-in method → Email/Password → Enable**.

პაროლი არასდროს ინახება Firestore-ში — არც ღიად, არც hash-ად. მას მთლიანად
Firebase Authentication მართავს.

### 4.2 Security Rules

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules --project <PROJECT_ID>
```

წესები (`firestore.rules`) რეალურად იცავს მონაცემებს:

* არსად არ არის `allow read, write: if true`;
* ყველა წვდომა მოითხოვს ავტორიზებულ და **აქტიურ** მომხმარებელს;
* უფლებები მოწმდება `users/{uid}.permissions`-იდან — ანუ **პირდაპირი API
  გამოძახებაც ვერ გვერდს ავლის შეზღუდვებს**, არა მხოლოდ ღილაკები იმალება;
* `auditLogs` — მხოლოდ `create`; `update`/`delete` არავის შეუძლია;
* `stockMovements`, `purchases`, `returns`, `stocktakes` — უცვლელი ჩანაწერები;
* მომხმარებელს საკუთარ დოკუმენტში მხოლოდ `lastLoginAt` / `mustChangePassword`
  ველების შეცვლა შეუძლია — **role/permissions-ის თვითგაზრდა შეუძლებელია**;
* `meta/bootstrap`-ის შექმნა შეიძლება მხოლოდ ერთხელ (პირველი მფლობელისთვის).

### 4.3 Firestore indexes

დამატებითი კომპოზიტური ინდექსი **არ სჭირდება** — ყველა query ერთ ველზე
ტოლობას ან ერთ დიაპაზონს იყენებს (`businessDate`, `openKey`, `shiftId`, `userId`).
`firestore.indexes.json` ცარიელია სწორედ ამიტომ.

```bash
firebase deploy --only firestore:indexes --project <PROJECT_ID>
```

---

## 5. პირველი მფლობელის (Owner) შექმნა

**პაროლი არასდროს არ არის კოდში და login გვერდზე არავითარი მინიშნება არ წერია.**

### ვარიანტი A — აპლიკაციიდან (რეკომენდებული)

პირველივე გახსნისას გამოჩნდება **„სისტემის საწყისი კონფიგურაცია"** — შეიყვანეთ
სახელი, username, ელფოსტა და პაროლი. Security Rules ამ ჩაწერას უშვებს მხოლოდ
მაშინ, სანამ `meta/bootstrap` არ არსებობს — ანუ ზუსტად ერთხელ. შემდეგ ეს გზა
სამუდამოდ იხურება.

### ვარიანტი B — server-side script (Admin SDK)

```bash
export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
export OWNER_USERNAME=imed
export OWNER_EMAIL=owner@example.com
export OWNER_PASSWORD='ძლიერი-პაროლი'
export OWNER_FIRST_NAME=გიორგი
export OWNER_LAST_NAME=იმედაშვილი
npm run create-owner
```

Credentials მხოლოდ environment-იდან მოდის და Git-ში არ ხვდება.

### პაროლების ნაკადები

1. **Owner → თანამშრომლის პაროლის აღდგენა** — „მომხმარებლები" გვერდზე
   🔑 ღილაკი აგზავნის Firebase-ის აღდგენის ბმულს მომხმარებლის ელფოსტაზე.
2. **მომხმარებელი → საკუთარი პაროლი** — header-ის 🔑 ღილაკი (მოითხოვს
   მიმდინარე პაროლს).
3. **„პაროლი დაგავიწყდათ?"** login გვერდზე — username → ელფოსტაზე ბმული.

Audit Log-ში ჩაიწერება მხოლოდ ის, რომ reset მოხდა — **არასდროს თვითონ პაროლი**.

---

## 6. გაშვება და build

```bash
npm run dev      # ლოკალური დეველოპმენტი
npm run lint     # tsc --noEmit (TypeScript შეცდომების გარეშე)
npm test         # Vitest — ბიზნეს-ლოგიკის იუნიტ-ტესტები
npm run build    # პროდაქშენ build → dist/
npm run preview
```

## 7. GitHub Pages Deploy

`.github/workflows/deploy.yml` `main`-ზე push-ისას ავტომატურად აწყობს და
აქვეყნებს `gh-pages` ბრენჩზე.

1. GitHub → **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root**
2. `vite.config.ts`-ში `base: '/sacxobi/'` — რეპოზიტორიის სახელს უნდა ემთხვეოდეს.
3. Firebase Console → **Authentication → Settings → Authorized domains** —
   დაამატეთ `<user>.github.io`.

---

## 8. ბიზნეს-ლოგიკის მოკლე აღწერა

### მარაგი — FIFO პარტიები

ყოველი შემოსვლა (შესყიდვა, ცხობა, გადატანა, დაბრუნება) ქმნის **პარტიას**
(`lots`) თავისი რეალური ღირებულებით. ჩამოწერა ყოველთვის ყველაზე ძველი
პარტიიდან იწყება. პარტიის ბოლო ერთეული იღებს ზუსტად დარჩენილ ღირებულებას,
ამიტომ დამრგვალების drift არ გროვდება.

გარდა ამისა ინახება:
* `stockLevels` — აგრეგირებული ნაშთი item + location ჭრილში;
* `stockMovements` — **უცვლელი** ჟურნალი (იყო → გახდა, ღირებულება, დოკუმენტი,
  მომხმარებელი, დრო).

მარაგის ადგილები: `WAREHOUSE` (საწყობი), `FRIDGE` (მაცივარი),
`LOWER_FLOOR`, `UPPER_FLOOR`.

### წარმოება

```
Production Material Cost = Σ(რეალურად დახარჯული × პარტიის რეალური ფასი)
Unit Production Cost     = Total Material Cost / კარგი პროდუქციის რაოდენობა
```

დანაკარგის (waste) ღირებულება ავტომატურად ნაწილდება კარგ პროდუქციაზე.
რეცეპტი მხოლოდ **წინასწარი შევსებაა** — თვითღირებულებაში მიდის მცხობლის
მიერ შეყვანილი **რეალური** ხარჯვა. batch-ში ინახება `weightGramsSnapshot`,
ამიტომ პარამეტრებში გრამაჟის შეცვლა ძველ ჩანაწერებს არ ცვლის.

### სართულებს შორის გადატანა

Owner ქმნის მოთხოვნას → ქვედა სართულის თანამშრომელი უთითებს **რეალურად
ატანილ** რაოდენობას → სტატუსი ხდება `PARTIAL` ან `COMPLETED`.
გადატანა **არ** ცვლის კომპანიის მარაგის ჯამურ ღირებულებას — მხოლოდ ადგილს
(`TRANSFER_OUT` + `TRANSFER_IN`, ღირებულების შენარჩუნებით).

### გაყიდვა და COGS

POS ყიდის იმ სართულის მარაგიდან, რომელიც პროდუქტზეა მითითებული (ჩვეულებრივ
`UPPER_FLOOR`). COGS ითვლება მზა პროდუქტის FIFO პარტიებიდან — ანუ სხვადასხვა
ცხობის სხვადასხვა თვითღირებულებით — და ინახება გაყიდვაზე **snapshot**-ად
(`costTotalSnapshot`), ამიტომ მოგვიანებით ინგრედიენტის ან რეცეპტის შეცვლა
ძველ მოგებას აღარ ცვლის.

### მოგება

```
Net Sales    = Gross Sales − ფასდაკლებები − დაბრუნებები
COGS         = გაყიდული მზა პროდუქციის რეალური საწარმოო თვითღირებულება
Gross Profit = Net Sales − COGS
Net Profit   = Gross Profit − საოპერაციო ხარჯები
```

**შესყიდვები პირდაპირ არ აკლდება მოგებას** — სანამ ნედლეული მარაგშია, ის
აქტივია; ხარჯად ის მხოლოდ მაშინ იქცევა, როცა წარმოებაში დაიხარჯება და
შესაბამისი პროდუქცია გაიყიდება. შესყიდვები ცალკე ჩანს როგორც მარაგში
ინვესტიცია.

### ცვლა და დღე

```
Expected Cash = საწყისი + ნაღდი გაყიდვები − ნაღდი დაბრუნებები
                − ნაღდი ხარჯები + შემოტანილი − გატანილი
```

დღის დახურვისას ინახება სრული `summarySnapshot`. დახურულ დღეს ახალი
ფინანსური ჩანაწერი აღარ ემატება; Owner-ს შეუძლია გახსნა **მხოლოდ მიზეზის
მითითებით** — ეს აისახება Audit Log-ში.

### ატომურობა

შესყიდვა, წარმოება, გადატანა, გაყიდვა, დაბრუნება და ინვენტარიზაცია სრულდება
**ერთ Firestore ტრანზაქციაში**: ჯერ ყველა წაკითხვა → გამოთვლა → ჩაწერა.
თუ ერთი ნაწილი ჩავარდა, მთელი ოპერაცია rollback-დება.

---

## 9. როლები და უფლებები

| როლი | აღწერა |
| --- | --- |
| `OWNER` | სრული წვდომა (უფლებები ავტომატურად ყველა) |
| `MANAGER` | წარმოება, მარაგი, შესყიდვები, რეპორტები, დღის დახურვა |
| `CASHIER` | POS, გაყიდვები, ცვლა, სალარო — **ხედავს მხოლოდ გასაყიდ ფასს** |
| `EMPLOYEE` | თავისი სართულის წარმოება და გადატანის შესრულება |

როლი მხოლოდ ნაგულისხმევ ნაკრებს იძლევა — Owner-ს შეუძლია ყოველი უფლების
ინდივიდუალურად ჩართვა/გამორთვა (მათ შორის: ვის აქვს POS-ზე და სალაროზე
წვდომა, ვინ ხედავს თვითღირებულებას, ვის შეუძლია ფასის შეცვლა და ა.შ.).

თანამშრომელს ენიჭება `assignedFloor` (`LOWER_FLOOR` / `UPPER_FLOOR`) და მას
სხვა სართულზე წარმოების დაფიქსირება არ შეუძლია.

---

## 10. მონაცემთა კოლექციები

| კოლექცია | შიგთავსი |
| --- | --- |
| `users` | მომხმარებლის პროფილი, როლი, permissions, სართული, სტატუსი |
| `usernames` | `username → {email, uid}` (login-მდე წასაკითხი რუკა) |
| `products` | მზა/გასაყიდი პროდუქტები (`PRODUCED` ან `RESALE`) |
| `productCategories`, `units` | კატალოგის ცნობარები |
| `materials` | ნედლეული (ერთეული, საცავი, მინიმალური ნაშთი) |
| `recipes` | რეცეპტები (ვერსიით) |
| `suppliers` | მომწოდებლები და დავალიანება |
| `purchases` | შესყიდვის დოკუმენტები (მრავალპოზიციური) |
| `lots` | FIFO პარტიები (`openKey` — ღია პარტიების სწრაფი ძებნისთვის) |
| `stockLevels` | აგრეგირებული ნაშთი `itemType__itemId__location` |
| `stockMovements` | უცვლელი მოძრაობების ჟურნალი |
| `stocktakes` | ინვენტარიზაციის დოკუმენტები |
| `productionBatches` | ცხობები, ხარჯვა და თვითღირებულება |
| `transferRequests` | სართულებს შორის მოთხოვნები და შესრულებები |
| `sales`, `returns` | გაყიდვები და დაბრუნებები |
| `expenses`, `expenseCategories` | ხარჯები |
| `cashMovements` | სალაროში შემოტანა/გატანა |
| `shifts` | მოლარის ცვლები |
| `businessDays` | დღის სტატუსი და summary |
| `priceHistories` | გასაყიდი ფასის ცვლილებები |
| `auditLogs` | უცვლელი Audit Log |
| `meta/settings`, `meta/counters`, `meta/bootstrap` | პარამეტრები, ნუმერაცია, ინიციალიზაცია |

---

## 11. Backup / Restore

```bash
# ექსპორტი (საჭიროებს gcloud-ს და Blaze გეგმას)
gcloud firestore export gs://<BUCKET>/backups/$(date +%F) --project <PROJECT_ID>

# იმპორტი
gcloud firestore import gs://<BUCKET>/backups/<DATE> --project <PROJECT_ID>
```

რეპორტების ცხრილებიდან ასევე შესაძლებელია CSV-ის ჩამოტვირთვა.

---

## 12. PDF დოკუმენტები

* **A4 სასაქონლო ზედნადები** — კომპანიის რეკვიზიტები, დოკუმენტის ნომერი,
  მიმღები, პოზიციები, ჯამი, გადახდის ფორმა, ხელმოწერის ადგილი;
* **80mm ქვითარი**;
* **შიდა გადატანის ფურცელი**;
* **წარმოების ფურცელი** (თვითღირებულება მხოლოდ შესაბამისი უფლებით).

ფაილის სახელი: `waybill-2026-08-19-SAL-2026-000123.pdf`.
ქართული ტექსტი ჩაშენებული Noto Sans Georgian-ით იბეჭდება — კვადრატები არ
გამოჩნდება. ყოველი PDF-ის გენერაცია აისახება Audit Log-ში.
