# Book worksheets and review links (not published: Jekyll skips files starting with "_")

## Worksheet page for a book: zerofluffguides.com/tools/<short-name>
- Copy `tools/debt-snowball.html` to `tools/<short-name>.html`.
- Edit only the JSON inside `<script id="zfg-book">`: slug (= short name), title, subtitle, author, niche, accent colour, and one section per chapter.
  - Section ids must be `ch1` ... `chN` and `conclusion`, matching the links printed in the book.
  - `title` = the chapter title, `step` = the chapter's Zero Fluff step (without "Zero Fluff:" and without the link).
- The shared template lives in `assets/worksheet/` (worksheet.js + worksheet.css). It is never copied per book.
- Field types: text, textarea, money, percent, number, date, monthYear, dayOfMonth, checkbox, choice, select, list, note,
  plus the finance widgets debts, debtsSorted, hybridPicks, debtSelect, baseline, monthlyTotal, goalProgress, projection, summary.
- Answers are stored only in the reader's browser (localStorage key `zfg-worksheet:<slug>`). Nothing is sent anywhere.

## Review link: zerofluffguides.com/review/<short-name>
- Copy `review/debt-snowball.html` to `review/<short-name>.html` and change the address on the three lines marked TARGET
  (homepage `/` until launch, then the book's Amazon review page).
