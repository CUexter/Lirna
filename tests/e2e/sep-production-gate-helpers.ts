import AxeBuilder from "@axe-core/playwright";
import {
  type APIResponse,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";

export async function activateWithKeyboard(page: Page, control: Locator) {
  await control.focus();
  await expect(control).toBeFocused();
  await page.keyboard.press("Enter");
}

export async function expectNoSeriousAccessibilityViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter(({ impact }) =>
      impact ? ["serious", "critical"].includes(impact) : false,
    ),
  ).toEqual([]);
}

export async function expectOrpcPayload(
  response: APIResponse,
  expected: Record<string, unknown>,
) {
  expect(response.request().postDataJSON()).toMatchObject({ json: expected });
  expect(await response.json()).toMatchObject({ json: expected });
}

export async function expectResponsiveWorkspace(page: Page, mobile: boolean) {
  const columns = await page.getByRole("article").evaluate((article) => {
    let container = article.parentElement;
    while (container && getComputedStyle(container).display !== "grid")
      container = container.parentElement;
    return container
      ? getComputedStyle(container).gridTemplateColumns.trim().split(/\s+/)
          .length
      : 0;
  });
  expect(columns).toBe(mobile ? 1 : 2);
}

export async function hasRetainedCitationHighlight(page: Page, label: string) {
  return page.evaluate((expected) => {
    const highlights = (
      CSS as typeof CSS & { highlights?: Map<string, Iterable<Range>> }
    ).highlights;
    const citation = highlights?.get("lirna-citation-resolution");
    return citation
      ? [...citation].some((range) => range.toString() === expected)
      : false;
  }, label);
}
