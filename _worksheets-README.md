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

### Print layout: the default for every new worksheet page (rule from 2026-11-17, first new book: Task Batching)
Put both of these lines in the JSON, right after `"planSection"` (or after `"accentSoft"` if the book has no plan section):
```
 "printLayout": 2,
 "printExtras": { "notes": true, "checkboxes": "box", "lists": "numbered" },
```
This gives the paper printout: blank ruled rows and write-in lines when empty, every label on the same row as its own line,
tick boxes for checklist items, notes (safety notes included) printed, and full-width numbered lines for lists.
It is print only: the on-screen page and any calculator are not affected. Home Winter Proofing (`tools/winter-proofing.html`)
is the reference page with both lines. (Debt Snowball predates this rule: it uses `"printLayout": 2` without printExtras,
so its one checkbox prints as a write-in line. Leave it as it is.)
A page's own script can add rows to the printout with `window.ZFGWorksheet.afterPrint` (see the Ch 10 payback lines in
`tools/winter-proofing.html`).

### Build checklist (nothing goes live until the user approves)
1. Build the page as above, with the print layout lines.
2. Test locally (test tools in ~/kdp-automation/site-drafts/worksheets-2026-10-15/test-tools/ and the print tools in
   ~/kdp-automation/site-drafts/hwp-print-2026-11-17/).
3. Put it on a hidden test page first (`tools/<name>-test-<random>.html`, noindex).
4. Print-preview the test page to PDF, EMPTY and FILLED (with the book's own example answers), on Letter paper. Check that
   nothing is cut off at the right margin and that no chapter is split across pages. Upload both PDFs to Drive
   KDP Claude Drafts/Final Reads/Print Tests (folder 1CxgvTaxm8mth9m6lN5nAowfzsGlovLWo) for the user to review.
5. Publish only after the user approves the page and both PDFs. Remove the hidden test page in the same commit.
6. After it is live: save the exact live page to Drive KDP Claude Drafts/Metadata as '<Book> worksheet page.html'
   (archive any older copy via zfg-archive-old-version), and upload the live empty + filled PDFs to Print Tests.

## Review link: zerofluffguides.com/review/<short-name>
- Copy `review/debt-snowball.html` to `review/<short-name>.html` and change the address on the three lines marked TARGET
  (homepage `/` until launch, then the book's Amazon review page).
