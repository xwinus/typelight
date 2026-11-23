# Typelight business model

Product direction agreed on 23 November 2026: sell Typelight as a desktop
writing application with a one-time purchase. Use an interactive web demo on
the product website so visitors can experience the application before buying.
Keep a shared application core for both versions.

The immediate commercial objective is to validate a sustainable small product
for an independent developer. Pricing, demand, conversion, and repeat use are
hypotheses to test, not established results. Execution priorities and release
criteria are in [MVP.md](MVP.md).

## Audience and value

Typelight offers a quiet, tactile environment for writing first drafts. Its
identity comes from the paper, moving type head, warm light, authentic sounds,
and physical drawer of documents. The product should make writing inviting
while keeping the writer in control of their text.

Suggested positioning: **A quiet place for the first draft of your story.**

Start with an international audience and an English product website:

- Writers drafting short stories, poems, and early versions of longer work.
- People keeping a journal or practicing regular freewriting.
- People who enjoy typewriters and the ritual of writing.

The initial workflow is to draft in Typelight and, when needed, copy or export
the text for revision elsewhere. Extensive formatting, publishing, and team
collaboration are outside the initial product scope.

## Product and distribution

| Web demo | Paid desktop application |
| --- | --- |
| Immediate access without an account or download | Installation on a supported operating system |
| The real appearance, lighting, sound, and editing experience | The complete environment for regular writing |
| One personal draft | A library of personal documents in the drawer |
| Sample documents to demonstrate the drawer and page overview | Organization, naming, search, and recovery of personal documents |
| Copy and download the personal draft | Normal file operations, automatic backups, and version recovery |
| Clear explanation of where the draft is stored | Local documents and offline operation without a mandatory cloud account |

The demo should be limited in scope, not deliberately frustrating. Avoid short
session timers, disruptive purchase prompts, and paywalls on exporting text
the visitor has already written. Place purchase information outside the
writing flow.

The current `#demo` mode uses sample documents and disables persistence. A public
demo must distinguish those samples from a visitor's personal draft and handle
reloads without silently losing that draft. Desktop value must include reliable
daily use and file handling; packaging the existing page alone is insufficient.

macOS, Windows, and Linux are required desktop platforms. A single Electron
implementation shares the editor, storage, and platform integrations across
all three; native window controls and dialogs adapt to the operating system.
A translucent appearance is desirable, but native Liquid Glass is not a reason
to maintain a separate Mac application. Preserve static deployment for the
website and demo. Verify each desktop target before claiming release support.

## Pricing and revenue

Initial prices to test:

- EUR 19 introductory price for a clearly described, usable paid beta.
- EUR 29 standard price for the first stable desktop release.
- A one-time license for the purchased major version, including its fixes.
  Future major upgrades may be paid; do not promise all future development
  free forever.

Before checkout goes live, define the supported operating systems, device
allowance, update entitlement, final customer price, and refund terms. The
introductory price is not a commitment to deliver unspecified future features.

Do not launch with mandatory subscriptions, advertisements, or a cloud account.
Optional environment and sound packs at EUR 5–9 are a later pricing hypothesis.
An optional subscription for synchronization or cloud history should only be
considered after repeated demand and a sustainable service cost estimate.

The repository currently carries an MIT license. Build commercial value around
the maintained product, convenient installation, dependable behavior, and the
brand. Document how the distributed product and any future additions relate to
the existing license before selling them.

## Market context

The category includes both paid applications and strong free alternatives.
The following offers were reviewed on 23 November 2026; prices can change and
local prices can differ.

| Product | Observed offer | Implication |
| --- | --- | --- |
| [iA Writer](https://ia.net/writer/pricing) | One-time purchase; USD 49.99 for Mac and USD 39.99 for Windows | Focused writing software has established paid competitors. |
| [Calmly Writer](https://www.calmlywriter.com/buylicense.htm) | Paid desktop license alongside a free web editor | Browser discovery and desktop sales can coexist. |
| [Hanx Writer](https://apps.apple.com/us/app/hanx-writer/id868326899) | Free app with paid typewriters and collections | The typewriter experience can be part of a paid offer. |
| [Ulysses](https://ulysses.app/pricing/) | USD 39.99 annually or USD 5.99 monthly, including synchronization | A subscription competes with established ongoing utility. |
| [Midnight Muse](https://midnightmuse.ink/) | Free browser writing with atmospheric visuals, sound, and local storage | Atmosphere and privacy alone are not exclusive advantages. |

These offers establish competing business models, not their sales volume or
demand for Typelight. A particularly similar concept, Typelo, is described in
[AlternativeTo](https://alternativeto.net/software/typelo/about/); its listing
is a secondary source and its pricing has not been verified with the vendor.

## Acquisition and validation

The intended path is: short demonstration or recommendation, product website,
interactive demo, purchase, desktop download, and repeated writing sessions.

Start with communities around creative writing, journaling, and typewriters,
and small creators who discuss writing. Show actual writing, the light, sound,
and drawer in a short video. Avoid depending on paid advertising before the
purchase conversion and acquisition cost are understood.

Recruit 20–30 people from the target audience for a two-week beta. Ask them to
write their own material. Record repeat use, completed writing sessions,
export behavior, reasons for leaving, and concrete requests. Feedback can be
collected through interviews; collecting document contents is unnecessary.

Proposed decision criteria, not industry benchmarks:

- At least one third of testers write on three or more separate days during
  the two-week period.
- Obtain at least ten actual purchases from people outside the developer's
  personal circle during an initial paid beta, recruiting beyond the first
  cohort if needed.
- Investigate every report of lost text, failed recovery, or refund before
  increasing promotion.

If people enjoy the demonstration but do not return, investigate the writing
workflow before adding more visual themes. If they return but do not buy,
investigate the paid benefits and price. Interest forms and compliments are
weaker evidence than repeat use and completed purchases.

## Revenue scenarios

Illustrative arithmetic at EUR 29 per purchase, not a forecast:

| New purchases per year | Customer payments before deductions |
| --- | --- |
| 300 | EUR 8,700 |
| 1,000 | EUR 29,000 |
| 3,000 | EUR 87,000 |

These amounts precede taxes, payment and distribution fees, refunds, support,
development, and acquisition costs. At an assumed 2% visitor-to-purchase
conversion, 1,000 purchases would require 50,000 relevant website visits.
With one-time purchases, continued revenue depends on new customers and,
eventually, optional upgrades or additions.

## Decisions still to make

- Minimum supported OS versions and Linux distributions, based on testing.
- Release and support coverage across the three required desktop systems.
- License scope across devices and future operating systems.
- Payment and download delivery provider.
- Backup location and retention policy, including recovery limits.
- Whether additional architectures are justified by beta demand and support cost.
