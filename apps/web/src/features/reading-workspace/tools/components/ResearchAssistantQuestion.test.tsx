import { afterEach, expect, test } from "bun:test";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";
import { ResearchAssistantQuestion } from "./ResearchAssistantQuestion";

afterEach(cleanup);

test("edits a complete question by pointer or double click and cancels without writing", async () => {
  const user = userEvent.setup();
  const revisions: string[] = [];
  render(
    <ResearchAssistantQuestion
      message={question()}
      onRevise={async (value) => {
        revisions.push(value);
        return true;
      }}
      pending={false}
      text={"First line\nSecond line"}
    />,
  );

  await user.dblClick(view().getByText(/First line/));
  const editor = view().getByRole<HTMLTextAreaElement>("textbox", {
    name: "Revised question",
  });
  expect(editor.value).toBe("First line\nSecond line");
  expect(document.activeElement).toBe(editor);
  expect(
    view().getByRole<HTMLButtonElement>("button", {
      name: "Regenerate from here",
    }).disabled,
  ).toBe(true);
  await user.clear(editor);
  expect(
    view().getByRole<HTMLButtonElement>("button", {
      name: "Regenerate from here",
    }).disabled,
  ).toBe(true);
  await user.type(editor, "Discarded revision");
  await user.click(view().getByRole("button", { name: "Cancel" }));
  expect(revisions).toEqual([]);
  expect(view().getByText(/First line/)).toBeTruthy();

  const edit = view().getByRole("button", { name: "Edit question" });
  edit.focus();
  await user.keyboard("{Enter}");
  const reopened = view().getByRole<HTMLTextAreaElement>("textbox", {
    name: "Revised question",
  });
  expect(reopened.value).toBe("First line\nSecond line");
  await user.clear(reopened);
  await user.type(reopened, "Revised complete question");
  await user.click(
    view().getByRole("button", { name: "Regenerate from here" }),
  );
  await waitFor(() => expect(revisions).toEqual(["Revised complete question"]));
});

test("cancels editing with Escape without closing the surrounding surface", async () => {
  const user = userEvent.setup();
  let bubbled = false;
  const recordBubble = () => {
    bubbled = true;
  };
  document.addEventListener("keydown", recordBubble);
  render(
    <ResearchAssistantQuestion
      message={question()}
      onRevise={async () => true}
      pending={false}
      text="Original question"
    />,
  );
  await user.click(view().getByRole("button", { name: "Edit question" }));
  await user.keyboard("{Escape}");
  expect(
    view().queryByRole("textbox", { name: "Revised question" }),
  ).toBeNull();
  expect(bubbled).toBe(false);
  document.removeEventListener("keydown", recordBubble);
});

test("offers edited history separately from regeneration and cancellation", async () => {
  const user = userEvent.setup();
  const actions: string[] = [];
  render(
    <ResearchAssistantQuestion
      message={question()}
      onRevise={async () => {
        actions.push("regenerate");
        return true;
      }}
      onUseEditedHistory={async (value) => {
        actions.push(`history:${value}`);
        return true;
      }}
      pending={false}
      text="Original question"
    />,
  );

  await user.click(view().getByRole("button", { name: "Edit question" }));
  const editor = view().getByRole("textbox", { name: "Revised question" });
  await user.clear(editor);
  await user.type(editor, "Edited question");
  expect(
    view().getByRole("button", { name: "Use edited history" }),
  ).toBeTruthy();
  expect(
    view().getByRole("button", { name: "Regenerate from here" }),
  ).toBeTruthy();
  expect(view().getByRole("button", { name: "Cancel" })).toBeTruthy();
  await user.click(view().getByRole("button", { name: "Use edited history" }));

  await waitFor(() => expect(actions).toEqual(["history:Edited question"]));
  expect(
    view().queryByRole("textbox", { name: "Revised question" }),
  ).toBeNull();
});

test("renders question alternatives beside the question and selects them", async () => {
  const user = userEvent.setup();
  const selected: string[] = [];
  render(
    <ResearchAssistantQuestion
      message={question({
        position: 2,
        total: 3,
        previousQuestionId: "previous-question",
        nextQuestionId: "next-question",
      })}
      onSelect={(id) => selected.push(id)}
      pending={false}
      text="Selected revision"
    />,
  );
  expect(
    view().getByRole("group", { name: "Question alternatives" }),
  ).toBeTruthy();
  expect(view().getByText("Question 2 of 3")).toBeTruthy();
  await user.click(
    view().getByRole("button", { name: "Previous question alternative" }),
  );
  await user.click(
    view().getByRole("button", { name: "Next question alternative" }),
  );
  expect(selected).toEqual(["previous-question", "next-question"]);
});

test("does not edit an ineligible question by double click", async () => {
  const user = userEvent.setup();
  render(
    <ResearchAssistantQuestion
      message={question()}
      pending={false}
      text="Ineligible question"
    />,
  );
  await user.dblClick(view().getByText("Ineligible question"));
  expect(
    view().queryByRole("textbox", { name: "Revised question" }),
  ).toBeNull();
  expect(view().queryByRole("button", { name: "Edit question" })).toBeNull();
});

function question(
  alternatives?: NonNullable<
    ResearchAssistantMessage["metadata"]
  >["questionAlternatives"],
): ResearchAssistantMessage {
  return {
    id: "question-id",
    role: "user",
    parts: [{ type: "text", text: "Question" }],
    ...(alternatives
      ? { metadata: { questionAlternatives: alternatives } }
      : {}),
  };
}

function view() {
  return within(document.body);
}
