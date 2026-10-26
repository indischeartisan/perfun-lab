# Frontend style boundaries

The customer shell is marked `customer-app`; the operational shell is marked
`workspace-app` for admin, vendor, and perfumer roles. Loading and role-error
screens use the appropriate shell as well. New customer-only rules should be
scoped with `:where(.customer-app)` so that the boundary does not increase
selector specificity. New workspace-only rules should use
`:where(.workspace-app)` where applicable.

This is an incremental boundary, not complete CSS isolation. The stylesheets
are still loaded together and the following existing dependencies are retained
to avoid changing operational or customer presentation:

| Area | Existing shared selectors or dependencies | Risk |
| --- | --- | --- |
| Document | `:root`, `body`, `*`, `button`, focus and reduced-motion rules in `styles.css`, `theme.css`, and `responsive.css` | Changes can affect every role. |
| Shell | `.app-shell`, `.product-app`, `.app-main`, `.wordmark`, and account styles | Workspace uses the same base shell and account menu. |
| Empty states | `.screen-empty` in `styles.css`, `theme.css`, and `admin.css` | Both customer and operational screens, including fixtures, use it. |
| Order cards | `.customer-order` and related selectors across `orders.css` and `admin.css` | Orders and operational pages share class names. |
| Actions | `.orders-build` in `admin.css` and shared presentation components | Customer account/payment and workspace actions can inherit the same rules. |
| Content layout | `.app-screen`, `.screen-title` and responsive rules | Used by customer screens and workspace pages. |
| Tokens | Global `--paper`, `--ink`, `--acid`, `--line`; workspace `--lab-*` | Workspace still inherits global defaults as well as workspace tokens. |

The initial customer boundary covers the theme rules for `.composer-card`,
`.composer-bottle`, and `.note-selector`. These selectors are used by the
customer builder; their declarations and specificity remain unchanged. Other
builder and shared rules remain global and must be inventoried and verified
before further scoping. Fixtures have their own shell and must be included when
evaluating changes to shared rules.

Before changing a shared selector, check all consumers and compare customer,
admin, vendor and perfumer screens at mobile and desktop sizes. Preserve the
current cascade until visual baselines are available.
