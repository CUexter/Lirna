import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

test("renders a typed SEP Reading workspace without captured markup", async ({
  page,
}) => {
  await page.goto(`/sources/${sourceId}/${stateId}`);

  await expect(
    page.getByRole("heading", {
      name: "The Stanford Encyclopedia of Philosophy entry on Epistemology",
    }),
  ).toBeVisible();
  await expect(page.getByText("Matthias Steup, Ram Neta")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect(page.getByAltText("Retained semantic diagram")).toHaveAttribute(
    "src",
    /^data:image\/gif;base64,/,
  );
  await expect(
    page.getByRole("navigation", { name: "Component contents" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Notation" })).toHaveAttribute(
    "href",
    "#notation",
  );
  await expect(page.locator("sub")).toHaveText("2");
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(page.locator(".katex math").first()).toContainText("x");
  await expect(page.getByTitle("Original TeX source")).toHaveText(
    "\\unknown{x}",
  );
  await expect(page.locator('[data-rendering="degraded"]')).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Observed distinctions" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "safe link" })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await expect(
    page.getByRole("link", { name: "Source information", exact: true }),
  ).toHaveAttribute("href", /#source-information$/);

  await page
    .getByRole("button", { name: "Citation: (Steup, 2023) (resolved)" })
    .first()
    .click();
  await expect(page.getByRole("tab", { name: "Bibliography" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByText("Steup, Matthias. 2023. Epistemology.").locator(".."),
  ).toBeFocused();
  await page.getByLabel("Search bibliography").fill("Steup");
  await expect(
    page.getByText("Steup, Matthias. 2023. Epistemology."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Publisher page/ }),
  ).toHaveAttribute("href", "https://example.com/epistemology");
  await expect(page.getByText("online only")).toBeVisible();
  await page.getByText("Citation context", { exact: true }).first().click();
  await page.getByRole("button", { name: "Show in article" }).click();
  await expect(
    page
      .getByRole("button", {
        name: "Citation: (Steup, 2023) (resolved)",
      })
      .first(),
  ).toBeVisible();

  await expect(page.getByText("window.pwned = true")).toHaveCount(0);
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);

  await page.evaluate(() => {
    window.location.hash = "knowledge";
    document.body.style.minHeight = "3000px";
  });
  await expect(page).toHaveURL(/#knowledge$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).not.toBe(0);
  await page.evaluate(() => window.scrollTo(0, 240));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(240);
  const componentSelector = page.getByLabel("Source component", {
    exact: true,
  });
  if (await componentSelector.isVisible()) {
    await componentSelector.evaluate((element) => {
      const select = element as HTMLSelectElement;
      select.value = "active:/notes.html";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  } else {
    await page.getByRole("link", { name: "Note one" }).click();
  }
  await expect(page.getByText("Typed Notes content.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  const seriousViolations = accessibility.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousViolations).toEqual([]);
});

test("does not substitute the article for an unavailable component", async ({
  page,
}) => {
  await page.goto(
    `/sources/${sourceId}/${stateId}?component=${encodeURIComponent("active:/missing.html")}`,
  );
  await expect(
    page.getByRole("heading", { name: "Component unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("active:/missing.html", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Visible typed paragraph.")).toHaveCount(0);

  await page.getByRole("button", { name: "Open main article" }).click();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
});

test("keeps the reading workspace stable across page and tool scrollbar changes", async ({
  page,
}) => {
  for (const width of [768, 1024, 1280, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/sources/${sourceId}/${stateId}`);
    await expect(page.getByText("Visible typed paragraph.")).toBeVisible();

    const position = () =>
      page.evaluate(() => {
        const article = document.querySelector("article");
        const tools = document.querySelector('[aria-label="Reading tools"]');
        if (!(article && tools)) throw new Error("Reading workspace missing");
        const articleBox = article.getBoundingClientRect();
        const toolsBox = tools.getBoundingClientRect();
        return {
          articleLeft: articleBox.left,
          articleRight: articleBox.right,
          articleWidth: articleBox.width,
          toolsLeft: toolsBox.left,
          toolsRight: toolsBox.right,
          toolsWidth: toolsBox.width,
        };
      });

    const pageScrollbarState = () =>
      page.evaluate(() => ({
        hasScrollbar:
          getComputedStyle(document.documentElement).overflowY !== "hidden" &&
          document.documentElement.scrollHeight >
            document.documentElement.clientHeight,
        overflowY: getComputedStyle(document.documentElement).overflowY,
        scrollHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
      }));

    const switchComponent = async (value: string, text: string) => {
      await page.goto(
        value === "article"
          ? `/sources/${sourceId}/${stateId}`
          : `/sources/${sourceId}/${stateId}?component=${encodeURIComponent(value)}`,
      );
      await expect(
        page.getByText(text, { exact: false }).first(),
      ).toBeVisible();
    };

    const beforeComponentSwitch = await position();
    await page.evaluate(() => {
      document.body.style.minHeight = "2000px";
      document.documentElement.style.overflowY = "scroll";
    });
    const articleState = await pageScrollbarState();
    expect(articleState.hasScrollbar).toBe(true);
    await switchComponent("active:/notes.html", "Typed Notes content.");
    await page.evaluate(() => {
      document.body.style.minHeight = "0px";
      document.documentElement.style.overflowY = "hidden";
    });
    const notesState = await pageScrollbarState();
    expect(notesState.hasScrollbar).toBe(false);
    expect(notesState.scrollY).toBe(articleState.scrollY);
    await expect.poll(position).toEqual(beforeComponentSwitch);

    await switchComponent("article", "Visible typed paragraph.");
    await page.evaluate(() => {
      document.body.style.minHeight = "2000px";
      document.documentElement.style.overflowY = "scroll";
      window.scrollTo(0, 0);
    });
    await expect.poll(position).toEqual(beforeComponentSwitch);

    await page.evaluate(() => {
      document.documentElement.style.overflowY = "hidden";
    });
    const withoutPageScrollbar = await position();
    expect((await pageScrollbarState()).overflowY).toBe("hidden");

    await page.evaluate(() => {
      document.documentElement.style.overflowY = "scroll";
    });
    expect((await pageScrollbarState()).overflowY).toBe("scroll");
    await expect.poll(position).toEqual(withoutPageScrollbar);

    const withoutToolsScrollbar = await position();
    for (const tab of ["Contents", "Bibliography", "Notes", "Supplementary"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      const pageScrollYBeforeTools = (await pageScrollbarState()).scrollY;
      const container = page.locator(".reading-tools-scroll-container");
      await expect(container).toHaveCSS("overflow-y", "auto");
      await page.evaluate(() => {
        const container = document.querySelector<HTMLElement>(
          ".reading-tools-scroll-container",
        );
        if (!container)
          throw new Error("Reading tools scroll container missing");
        const spacer = document.createElement("div");
        spacer.dataset.scrollbarTestSpacer = "true";
        spacer.style.height = "2000px";
        container.append(spacer);
      });
      await expect
        .poll(() =>
          container.evaluate((element) => ({
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          })),
        )
        .toEqual(expect.objectContaining({ clientHeight: expect.any(Number) }));
      const scrollMetrics = await container.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      expect(scrollMetrics.scrollHeight).toBeGreaterThan(
        scrollMetrics.clientHeight,
      );
      await container.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect
        .poll(() => container.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
      expect((await pageScrollbarState()).scrollY).toBe(pageScrollYBeforeTools);
      await expect.poll(position).toEqual(withoutToolsScrollbar);
      await page.evaluate(() => {
        document.querySelector('[data-scrollbar-test-spacer="true"]')?.remove();
      });
    }
  }
});
