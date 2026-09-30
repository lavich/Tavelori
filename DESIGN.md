---
name: Lexi (Tavelori)
description: Греческий — к каждому занятию. Спокойный карманный репетитор для телефона и Telegram.
colors:
  aegean-blue: "#0d5eaf"
  aegean-blue-deep: "#0a4c8e"
  aegean-mist: "#e8effd"
  paper: "#f7f7f5"
  sheet: "#ffffff"
  stone: "#f0f0ec"
  ink: "#171717"
  hint-gray: "#6b7280"
  hairline: "#e9e9e4"
  track: "#e3e3dd"
  art-mist: "#eef2fa"
  speak-disabled: "#c9ced8"
  ok-green: "#15803d"
  ok-bg: "#ecfdf3"
  ok-fg: "#14532d"
  bad-red: "#b91c1c"
  bad-bg: "#fef2f2"
  bad-fg: "#7f1d1d"
  almost-bg: "#fffbeb"
  almost-fg: "#854d0e"
  same-bg: "#dcfce7"
  wrong-bg: "#fee2e2"
typography:
  brand:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    letterSpacing: "-0.04em"
  greek-display:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "19px"
    fontWeight: 600
  body-large:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 400
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
  note:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  nav-label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  hairline: "4px"
  focus: "8px"
  field: "12px"
  control: "14px"
  card: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.aegean-blue}"
    textColor: "{colors.sheet}"
    typography: "{typography.body-large}"
    rounded: "{rounded.control}"
    height: "54px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.aegean-blue-deep}"
  button-medium:
    backgroundColor: "{colors.aegean-blue}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    height: "46px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "54px"
  button-soft:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.aegean-blue}"
    rounded: "{rounded.control}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.hint-gray}"
    rounded: "{rounded.control}"
  answer-option:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    typography: "{typography.body-large}"
    rounded: "{rounded.control}"
    height: "56px"
    padding: "0 16px"
  answer-option-correct:
    backgroundColor: "{colors.ok-bg}"
    textColor: "{colors.ok-fg}"
  answer-option-wrong:
    backgroundColor: "{colors.bad-bg}"
    textColor: "{colors.bad-fg}"
  syllable-tile:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "48px"
    padding: "0 16px"
  syllable-tile-placed:
    backgroundColor: "{colors.stone}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "48px"
  speak-button:
    backgroundColor: "{colors.aegean-blue}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.pill}"
    size: "56px"
  card:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  panel-soft:
    backgroundColor: "{colors.aegean-mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "50px"
    padding: "10px 14px"
  badge-soft:
    backgroundColor: "{colors.aegean-mist}"
    textColor: "{colors.aegean-blue-deep}"
    rounded: "{rounded.pill}"
    height: "20px"
    padding: "2px 8px"
  nav-link:
    textColor: "{colors.hint-gray}"
    typography: "{typography.nav-label}"
    height: "60px"
  nav-link-active:
    textColor: "{colors.aegean-blue}"
---

# Design System: Lexi (Tavelori)

## Overview

**Creative North Star: "The Pocket Tutor"**

Lexi — спокойный репетитор в кармане: он говорит тихо, показывает одну вещь за раз и не торопит. Экран — это страница на тёплой бумаге (`paper`) с белыми листами (`sheet`) поверх. Акцентный цвет один — эгейский синий, и он отмечает только то, что ведёт дальше: главное действие, озвучку, ударную гласную, текущий раздел. Всё остальное — чернила и приглушённый серый.

Плотность низкая, цели для пальца крупные. Интерфейс рассчитан на телефон шириной 360–560 px, на короткий подход в Telegram, одной рукой. Главное действие стоит у нижнего края, чтобы до него не приходилось листать. Главный герой любого учебного экрана — греческое слово: это самый крупный текст на экране, рядом с ним плоская иллюстрация по стандарту `docs/art-standard.md` и круглая синяя кнопка звука.

Система наследует токены shadcn (base-nova) и переопределяет их палитрой Lexi. В Telegram те же семантические токены забирают цвета из темы клиента, поэтому вид следует за Telegram, а не спорит с ним. Геймификации, конфетти, стриков и восклицательной графики в системе нет: успех выражается спокойным зелёным фоном и текстом.

**Key Characteristics:**
- Тёплая бумага, белые листы, один синий акцент.
- Плоско: глубина задаётся тоном, тень есть только у нижнего дока.
- Мягкие крупные формы: 14 px у контролов, 18 px у карточек, круг у кнопки звука.
- Системный шрифт; греческое слово набрано крупно и жирно.
- Статусы ответа — пары «фон + текст» и всегда со словом или значком.
- Семантические токены, которые Telegram может переопределить.

## Colors

Нейтральная тёплая бумага и один насыщенный эгейский синий. Статусные цвета появляются только в обратной связи на ответ.

### Primary
- **Aegean Blue** (`aegean-blue`): главное действие (`Начать занятие`, `Проверить`), кнопка озвучки, активная вкладка навигации, ударная гласная и целевое слово в примере, заполненная часть прогресса занятия, кольцо фокуса. В Telegram его заменяет `--tg-theme-button-color`.
- **Aegean Blue Deep** (`aegean-blue-deep`): наведение на синие элементы, текст на `aegean-mist`, подчёркнутые буквосочетания в разборе чтения.
- **Aegean Mist** (`aegean-mist`): мягкая синяя подложка. Панель «К среде, 30 сентября» на «Сегодня», блоки ударения и «В контексте» на карточке слова, мягкие бейджи набора. В Telegram — 12 % синего поверх фона.

### Neutral
- **Warm Paper** (`paper`): фон приложения, дока и шапки. Цвет `theme-color` в `index.html`.
- **Sheet White** (`sheet`): карточки, поля ввода, варианты ответа.
- **Stone** (`stone`): вторичные и приглушённые поверхности; уже поставленный слог в сборке.
- **Ink** (`ink`): основной текст и греческое слово.
- **Hint Gray** (`hint-gray`): подписи, IPA, счётчик занятия, неактивные вкладки. На подложке `aegean-mist` подписи идут чернилами на 75 %, а не серым: `hint-gray` на синем даёт 4.2:1.
- **Hairline** (`hairline`): границы карточек, полей, вариантов; пунктир области сборки.
- **Track** (`track`): дорожка полос прогресса.
- **Art Mist** (`art-mist`): подложка под иллюстрацию слова.
- **Speak Disabled** (`speak-disabled`): кнопка звука, когда озвучки нет.

### Status
- **Ok Green** (`ok-green`) с парой `ok-bg` / `ok-fg`: верный ответ, верный вариант.
- **Bad Red** (`bad-red`) с парой `bad-bg` / `bad-fg`: неверный ответ, «Не знаю», деструктивные действия (тоном 10 %, а не заливкой).
- **Almost** (`almost-bg` / `almost-fg`): «Почти» — написание верно без знака ударения.
- **Same / Wrong** (`same-bg` / `wrong-bg`): посимвольная подсветка совпавших и ошибочных букв в написании.

Тёмная тема существует только в Telegram (`data-theme="dark"`): фон по умолчанию `#17212b`, листы `#232e3c`, синий `#5288c1`; статусные пары инвертированы в тёмные фоны со светлым текстом.

### Named Rules
**The One Blue Rule.** На экране есть только один акцентный цвет — синий. Нельзя добавлять второй «брендовый» цвет для разнообразия; зелёный, красный и янтарный означают только результат ответа.

**The Telegram Yield Rule.** Цвет задаётся только через семантические переменные (`--primary`, `--card`, `--muted-foreground`…), никогда литералом в компоненте. Иначе в Telegram, где эти переменные переопределяются темой клиента, элемент выпадет из темы.

**The Never Color Alone Rule.** Статус никогда не передаётся одним цветом: у каждого индикатора есть текстовая подпись или значок с тем же значением.

## Typography

**Display Font:** system-ui (с -apple-system, Segoe UI, Roboto, sans-serif)
**Body Font:** тот же системный стек

**Character:** один системный шрифт — родной для телефона и Telegram, с хорошей кириллицей и греческим. Иерархия строится весом и размером, а не сменой гарнитуры.

### Hierarchy
- **Brand** (800, 26 px, −0.04em): словесный знак «lexi» в шапке «Сегодня», рядом с флагом.
- **Greek Display** (700, 40 px, 1.1, −0.01em): греческое слово на карточке и в упражнении; в тесных местах 30 px. Переносится где угодно (`overflow-wrap: anywhere`), чтобы длинные слова не ломали ширину.
- **Headline** (700, 30 px, 1.15, −0.02em): заголовок экрана (`h1`); на «Сегодня» он называет объём дня: «12 новых карточек».
- **Title** (600, 19 px): заголовок раздела (`h2`: «Мои занятия»); `h3` — 600, 16 px.
- **Body Large** (17 px): варианты ответа, поля ввода, кнопки `xl`, перевод слова. Кнопки `md` (46 px) — 15 px.
- **Body** (400, 16 px, 1.45): основной текст.
- **Note** (14 px, `hint-gray`): самая частая роль — подписи, подсказки, метаданные («59 карточек · предстоит»).
- **Nav Label** (12 px): подписи нижней навигации; у активной вкладки — 600.

IPA — 19 px `hint-gray` под словом. В ответах на написание — 24 px, в посимвольной обратной связи — 26 px с разрядкой 0.02em. Счётчики используют табличные цифры.

### Named Rules
**The Greek Leads Rule.** Греческое слово — самый крупный текст на учебном экране. Заголовки интерфейса не должны быть крупнее его.

**The No Webfont Rule.** Только системный стек: приложение работает офлайн и открывается мгновенно в Telegram, и шрифт не должен это ломать.

## Layout

Одна колонка шириной до 560 px по центру, боковые поля 16 px, минимальная поддерживаемая ширина 360 px. На широком экране колонка не растягивается. Экран отступает сверху на системную строку (`--inset-top`), снизу — на нижнюю навигацию и безопасную зону (104 px + `--inset-bottom`). В Telegram эти отступы и высоту (`--app-height`) задаёт адаптер.

Ритм кратен 4: 4 / 8 / 12 / 16 / 24 px. Внутри стопки элементы разделены 10–12 px, пара плиток статистики стоит в две колонки с зазором 12 px.

Занятие — отдельная полноэкранная раскладка без нижней навигации: сверху строка «закрыть + прогресс + счётчик», посередине прокручиваемое тело с содержимым по центру, снизу закреплённый док с действиями. В полноэкранном режиме Telegram строка прогресса встаёт между нативными кнопками «Назад» и «…».

### Named Rules
**The Thumb Dock Rule.** Главное действие учебного экрана закреплено у нижнего края в доке и не уезжает при прокрутке. Нельзя ставить «Проверить» или «Дальше» в поток контента.

## Elevation & Depth

Система плоская. Глубину задаёт тон: белый лист на тёплой бумаге, граница `hairline` в 1 px, синяя подложка `aegean-mist` у выделенных блоков. Тень одна, и она структурная: мягкая верхняя тень дока занятия отделяет закреплённые действия от прокручиваемого контента. Нижняя навигация отделена границей и лёгким размытием полупрозрачного фона.

### Shadow Vocabulary
- **Dock Lift** (`box-shadow: 0 -14px 18px -14px var(--shadow)`): только над нижним доком занятия.

### Named Rules
**The Flat Paper Rule.** У карточек, кнопок и плиток нет теней. Если элементу нужно выделиться, для этого есть тон или граница.

## Shapes

Мягкие и крупные формы. Базовый радиус 14 px — у крупных кнопок, вариантов ответа, иллюстраций и обратной связи. Карточки и панели скруглены сильнее, на 18 px, поля ввода и слоговые плитки — на 12 px. Полосы прогресса, бейджи и кнопка звука — полностью круглые. Мелкая подсветка букв в написании — 4 px.

Линии используются для структуры, а не для украшения: сплошная граница 1 px у листов, пунктир 2 px у пустой области сборки слова, пунктирное подчёркивание у интерактивных буквосочетаний и точечное — у размеченных слов примера.

## Components

### Buttons
Крупные, спокойные, одного синего.
- **Shape:** мягкое скругление (14 px) у размеров `xl` (54 px) и `md` (46 px); мелкие служебные размеры наследуют shadcn.
- **Primary:** заливка `aegean-blue`, белый текст 17 px, на всю ширину, часто со стрелкой справа. Наведение — `aegean-blue-deep` (`--primary-hover`), нажатие — сдвиг на 1 px вниз, недоступная — прозрачность 50 %.
- **Outline:** фон бумаги, граница `hairline`; второе действие в доке («Не знаю»).
- **Soft:** белый лист с синим текстом и синей границей 25 %; альтернативное действие, которое должно быть заметно.
- **Quiet / Ghost:** серый текст без заливки, для третьестепенных действий и иконок в шапке.
- **Destructive:** не заливка, а 10 % красного фоном с красным текстом.
- **Focus:** кольцо 3 px цвета `ring` на 50 %; глобально — обводка 3 px `aegean-blue` со смещением 2 px.

### Answer Options
Белые плитки 56 px высотой, 14 px скругление, граница `hairline`, текст 17 px слева. Наведение темнит границу до `hint-gray`. После ответа верный вариант получает зелёную пару, выбранный неверный — красную; остальные не меняются.

### Syllable Tiles
Сборка слова: плитки слогов 48 px высотой, 12 px скругление, греческий текст 19 px. Свободные плитки — outline, поставленные — `stone`; использованная плитка в пуле остаётся на месте полупрозрачной, чтобы раскладка не прыгала. Область сборки — пунктирная рамка 2 px с подсказкой «Нажимай слоги по порядку».

### Speak Button
Сигнатурный элемент: синий круг 56 px с иконкой громкости справа от слова. Недоступная — `speak-disabled`. Малая версия — синяя иконка без круга (озвучка примера).

### Cards / Containers
- **Corner Style:** 18 px.
- **Background:** `sheet` с кольцом `hairline` 1 px; выделенные — `aegean-mist` без границы.
- **Shadow Strategy:** без теней (см. Elevation & Depth).
- **Internal Padding:** 16 px (малая — 12 px).
- Строка урока — карточка со значком документа, заголовком «1.1 · К среде, 30 сентября», подписью и шевроном справа. Под ней полоса освоенности 4 px: сначала зелёные устойчивые, затем синие в повторении, остаток — дорожка без заливки.

### Inputs / Fields
- **Style:** белый лист, граница `hairline`, скругление 12 px, высота от 50 px, текст 17 px. Подпись над полем 14 px `hint-gray`.
- **Focus:** кольцо `ring`.
- **Writing field:** в упражнении написания поле маскировано: текст и каретка скрыты, набранное показывают ячейки-буквы с линейкой снизу, каретку рисует сама маска синим. У ячеек запас по высоте под хвосты γ, η, μ, φ, χ, ψ.

### Feedback
Блок под ответом, скругление 14 px, отступы 14×16 px, фон и текст из статусной пары (`ok`, `bad`, `almost`). Посимвольный разбор подсвечивает совпавшие буквы `same-bg`, ошибочные — `wrong-bg`, без зачёркивания.

### Navigation
Нижняя панель из четырёх равных вкладок (Сегодня, Уроки, Слова, Ещё): значок над подписью 12 px, высота 60 px, фон бумаги на 96 % с размытием 8 px и границей сверху. Активная вкладка — синий и 600. На время занятия панель скрыта. Шапка экрана липкая, на фоне бумаги; во вложенных экранах — стрелка «Назад», заголовок 17 px по центру и действия справа.

### Progress
Прогресс занятия — дорожка 8 px с синей заливкой и плавным изменением ширины (0.25 s), рядом счётчик табличными цифрами. Полоса освоенности урока — 4 px, сегментированная, с зазором 2 px.

## Do's and Don'ts

### Do:
- **Do** брать цвета только из семантических переменных, чтобы Telegram мог их переопределить (The Telegram Yield Rule).
- **Do** закреплять главное действие учебного экрана в нижнем доке, кнопкой `xl` 54 px на всю ширину.
- **Do** делать греческое слово самым крупным текстом экрана (40 px, 700) и ставить рядом кнопку звука.
- **Do** подписывать каждый статус словом или значком, а не только цветом.
- **Do** держать цели касания не меньше 44 px и проверять раскладку на 360 и 390 px с экранной клавиатурой.
- **Do** выделять блок синей подложкой `aegean-mist` или белым листом, а не тенью.

### Don't:
- **Don't** вводить второй акцентный цвет или градиенты: синий — единственный голос.
- **Don't** добавлять тени карточкам и кнопкам; тень есть только у дока.
- **Don't** подключать веб-шрифты: только системный стек.
- **Don't** использовать геймификацию: стрики, конфетти, очки и восклицательные баннеры противоречат спокойному тону.
- **Don't** красить остаток полосы освоенности: непрошедшее — это видимая дорожка, а не цвет.
- **Don't** заливать деструктивные кнопки сплошным красным; только тон 10 % и красный текст.
- **Don't** рисовать иллюстрации вне `docs/art-standard.md`: холст 320×220, палитра `content/art/palette.json`, без текста и растра.
