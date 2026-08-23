import { describe, expect, test } from "bun:test";

import { createReadingNavigation } from "./reading-navigation";

describe("ReadingNavigation", () => {
  test("only the newest same-owner intent can commit", () => {
    const navigation = createReadingNavigation();
    const movements: string[] = [];
    const stale = navigation.request({
      owner: "article",
      cause: "resume",
      target: "article:640",
    });
    const winner = navigation.request({
      owner: "article",
      cause: "component-transition",
      target: "component:identity",
    });

    expect(stale.commit(() => movements.push("stale"))).toBe(false);
    expect(winner.commit(() => movements.push("winner"))).toBe(true);
    expect(movements).toEqual(["winner"]);
  });

  test("an active explicit fragment outranks resume in either request order", () => {
    const navigation = createReadingNavigation();
    const fragment = navigation.request({
      owner: "article",
      cause: "explicit-fragment-arrival",
      target: "fragment:notation",
    });
    const delayedResume = navigation.request({
      owner: "article",
      cause: "resume",
      target: "article:640",
    });

    expect(delayedResume.active()).toBe(false);
    expect(fragment.commit(() => undefined)).toBe(true);

    const navigationWithResumeFirst = createReadingNavigation();
    const resume = navigationWithResumeFirst.request({
      owner: "article",
      cause: "resume",
      target: "article:640",
    });
    const laterFragment = navigationWithResumeFirst.request({
      owner: "article",
      cause: "explicit-fragment-arrival",
      target: "fragment:notation",
    });

    expect(resume.active()).toBe(false);
    expect(laterFragment.active()).toBe(true);
  });

  test("a committed explicit fragment still rejects an asynchronous resume", () => {
    const navigation = createReadingNavigation();
    const fragment = navigation.request({
      owner: "article",
      cause: "explicit-fragment-arrival",
      target: "fragment:notation",
    });

    expect(fragment.commit(() => undefined)).toBe(true);

    const resume = navigation.request({
      owner: "article",
      cause: "resume",
      target: "article:640",
    });
    expect(resume.active()).toBe(false);
  });

  test("a winning intent commits at most once", () => {
    const navigation = createReadingNavigation();
    const handle = navigation.request({
      owner: "article",
      cause: "resume",
      target: "article:640",
    });
    let movements = 0;

    expect(handle.commit(() => movements++)).toBe(true);
    expect(handle.commit(() => movements++)).toBe(false);
    expect(movements).toBe(1);
  });

  test("article and reading-tools owners arbitrate independently", () => {
    const navigation = createReadingNavigation();
    const article = navigation.request({
      owner: "article",
      cause: "resume",
      target: "article:640",
    });
    const tools = navigation.request({
      owner: "reading-tools",
      cause: "reference-opening",
      target: "reference:42",
    });

    expect(article.active()).toBe(true);
    expect(tools.active()).toBe(true);
    expect(article.commit(() => undefined)).toBe(true);
    expect(tools.commit(() => undefined)).toBe(true);
  });

  test("owner cancellation does not affect another owner", () => {
    const navigation = createReadingNavigation();
    const article = navigation.request({
      owner: "article",
      cause: "resume",
      target: "article:640",
    });
    const tools = navigation.request({
      owner: "reading-tools",
      cause: "reference-opening",
      target: "reference:42",
    });

    navigation.cancel("article");

    expect(article.active()).toBe(false);
    expect(tools.active()).toBe(true);
  });

  test("canceling a stale handle cannot cancel its newer winner", () => {
    const navigation = createReadingNavigation();
    const stale = navigation.request({
      owner: "article",
      cause: "resume",
      target: "article:640",
    });
    const winner = navigation.request({
      owner: "article",
      cause: "explicit-fragment-arrival",
      target: "fragment:notation",
    });

    stale.cancel();

    expect(winner.active()).toBe(true);
  });

  test("releasing explicit-fragment authority allows a later resume", () => {
    const navigation = createReadingNavigation();
    const fragment = navigation.request({
      owner: "article",
      cause: "explicit-fragment-arrival",
      target: "fragment:notation",
    });
    expect(fragment.commit(() => undefined)).toBe(true);

    fragment.cancel();

    const resume = navigation.request({
      owner: "article",
      cause: "resume",
      target: "article:900",
    });
    expect(resume.active()).toBe(true);
  });
});
