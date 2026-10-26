export {}

const selectors = {
  header: '.customer-app .site-header',
  main: '.customer-app .app-main',
  screen: '.customer-app .build-screen',
  builder: '.customer-app .build-screen .builder-core',
  heading: '.customer-app .build-screen .builder-core-title',
  workspace: '.customer-app .build-screen .composer-card',
  bottle: '.customer-app .build-screen .composer-bottle .bottle',
  notes: '.customer-app .build-screen .note-selector',
  summary: '.customer-app .build-screen .builder-core > :is(.scent-story, .prediction-panel, .play-set-summary, .added-confirmation)',
  cta: '.customer-app .build-screen .get-this-mix',
  bottomNav: '.customer-app .bottom-nav',
}

function measure(element: Element) {
  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return {
    rect: { x: rect.x, y: rect.y, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
    style: {
      display: style.display, position: style.position, height: style.height, minHeight: style.minHeight,
      margin: style.margin, padding: style.padding, flex: style.flex, gridTemplateRows: style.gridTemplateRows,
      alignContent: style.alignContent, justifyContent: style.justifyContent, overflow: style.overflow,
    },
  }
}

Object.assign(window, {
  __perfunLayoutDebug: () => {
    const elements = Object.fromEntries(Object.entries(selectors).map(([name, selector]) => [
      name, Array.from(document.querySelectorAll(selector), measure),
    ]))
    const workspace = elements.workspace[0]?.rect
    const summary = elements.summary[0]?.rect
    const nav = elements.bottomNav[0]
    return {
      viewport: { width: innerWidth, height: innerHeight, scrollY, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      gaps: {
        workspaceToSummary: workspace && summary ? summary.top - workspace.bottom : null,
        summaryToViewportBottom: summary ? innerHeight - summary.bottom : null,
        summaryToBottomNav: summary && nav && nav.style.display !== 'none' ? nav.rect.top - summary.bottom : null,
      },
      elements,
    }
  },
})
