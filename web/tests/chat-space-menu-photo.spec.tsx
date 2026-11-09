import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ChatSpaceMenu from "@/components/chat/space/ChatSpaceMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const COUNTS = {
  attachments: 0,
  knowledge: 0,
  chatHistory: 0,
  myAgents: 0,
  books: 0,
  reading: 0,
  notebooks: 0,
  questionBank: 0,
  persona: 0,
  memory: 0,
};

it("adds a camera row under the attachment row when it is wired", () => {
  const onCapturePhoto = vi.fn();
  const onSelectItem = vi.fn();
  render(
    <ChatSpaceMenu
      variant="resources"
      selectedCounts={COUNTS}
      onCapturePhoto={onCapturePhoto}
      onSelectItem={onSelectItem}
    />,
  );

  fireEvent.click(screen.getByText("Take photo"));

  expect(onCapturePhoto).toHaveBeenCalledTimes(1);
  // The camera is a direct action, not a second-level picker.
  expect(onSelectItem).not.toHaveBeenCalled();
});

it("keeps the row inert on surfaces that do not wire a camera", () => {
  render(
    <ChatSpaceMenu
      variant="resources"
      selectedCounts={COUNTS}
      onSelectItem={() => {}}
    />,
  );

  expect(screen.queryByText("Take photo")).toBeNull();
  expect(screen.getByText("Attach files")).toBeTruthy();
});
