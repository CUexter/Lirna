import { afterEach, expect, test } from "bun:test";
import { cleanup, render, within } from "@testing-library/react";

import { AssistantMarkdown } from "./AssistantMarkdown";

afterEach(cleanup);

test("renders supported Markdown as semantic elements", () => {
  const view = render(
    <AssistantMarkdown>{`# First
## Second
### Third

> Quoted **evidence**

- one
- two

1. first
2. second

\`inline\` and *emphasis* plus __strong__

\`\`\`
const value = "safe";
\`\`\``}</AssistantMarkdown>,
  );

  expect(view.getByRole("heading", { level: 1 }).textContent).toBe("First");
  expect(view.getByRole("heading", { level: 2 }).textContent).toBe("Second");
  expect(view.getByRole("heading", { level: 3 }).textContent).toBe("Third");
  expect(view.getByText("evidence").tagName).toBe("STRONG");
  expect(view.getByText("emphasis").tagName).toBe("EM");
  expect(view.getByText("inline").tagName).toBe("CODE");
  expect(view.getByText('const value = "safe";').tagName).toBe("CODE");
  const lists = view.getAllByRole("list");
  expect(lists).toHaveLength(2);
  expect(within(lists[0] as HTMLElement).getAllByRole("listitem")).toHaveLength(
    2,
  );
  expect(within(lists[1] as HTMLElement).getAllByRole("listitem")).toHaveLength(
    2,
  );
});

test("allows web links without interpreting raw or unsafe HTML", () => {
  const view = render(
    <AssistantMarkdown>
      {
        "[Safe](https://example.com/path) [Unsafe](javascript:alert(1)) [Broken](relative) <script>bad()</script>"
      }
    </AssistantMarkdown>,
  );

  expect(view.getByRole("link", { name: "Safe" }).getAttribute("href")).toBe(
    "https://example.com/path",
  );
  expect(view.queryByRole("link", { name: "Unsafe" })).toBeNull();
  expect(view.queryByRole("link", { name: "Broken" })).toBeNull();
  expect(view.container.querySelector("script")).toBeNull();
  expect(view.container.textContent).toContain("<script>bad()</script>");
});
