# Reading experience research

## Decision

Lirna defaults to positive polarity throughout the application: dark text on a restrained warm
light surface. Running Source text targets approximately 88 characters per line, uses an 18.5px body size
on larger screens, and uses 1.68 line height. The annotation rail appears beside the text only
when the viewport can preserve that reading measure; otherwise it follows the document.

## Evidence

- Positive display polarity (dark text on a light background) improved visual acuity and
  proofreading performance for younger and older adults. This supports light as the ergonomic
  default, while not implying dark mode is never useful for an individual preference or dark
  environment. [Piepenbrock, Mayr, and Buchner, 2014](https://pubmed.ncbi.nlm.nih.gov/23654206/)
- WCAG 2.2's visual-presentation guidance identifies lines over 80 characters as a barrier for
  some readers, requires non-justified text in its adjustable presentation criteria, and names
  at least 1.5 line spacing as an achievable presentation. These are accessibility boundaries,
  not proof of a universal optimum.
  [W3C, Understanding SC 1.4.8](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)
- The GOV.UK Design System recommends no more than 75 characters per line and commonly uses a
  two-thirds content column. It also recommends starting with a single-column small-screen
  layout. [GOV.UK Design System, Layout](https://design-system.service.gov.uk/styles/layout/)
- WCAG AA requires at least 4.5:1 contrast for normal text. Lirna intentionally exceeds this
  instead of lowering contrast to make the palette look softer.
  [W3C, Understanding SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

## Limits

No strong evidence establishes a particular cream as the universally best background color.
The warm off-white is a tonal choice that avoids a glaring pure white canvas while maintaining
high contrast. Typography studies also vary by font, language, task, display, and participant;
The Source measure intentionally exceeds the researched 75-80 character guidance because Nathan
prefers using more of the available display. This is a product preference rather than an ergonomic
optimum; reflow and browser zoom remain supported. Future Reading workspace
preferences should permit light/dark polarity, text size, and measure adjustments.
