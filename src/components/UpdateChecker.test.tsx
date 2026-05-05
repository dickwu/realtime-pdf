import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.1.10")),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(() => Promise.resolve()),
}));

import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import UpdateChecker from "./UpdateChecker";

describe("UpdateChecker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows current version + Check now when up to date", async () => {
    vi.mocked(check).mockResolvedValue(null);

    render(<UpdateChecker />);

    await waitFor(() => {
      expect(screen.getByText("v0.1.10")).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "Check now" })).toBeTruthy();
    expect(screen.queryByText(/Update to v/)).toBeNull();
  });

  it("transitions to 'Update to v<version>' and triggers downloadAndInstall + relaunch on click", async () => {
    const downloadAndInstall = vi.fn(
      async (cb?: (e: { event: string; data?: Record<string, number> }) => void) => {
        cb?.({ event: "Started", data: { contentLength: 1024 } });
        cb?.({ event: "Progress", data: { chunkLength: 1024 } });
        cb?.({ event: "Finished" });
      },
    );

    vi.mocked(check).mockResolvedValue({
      version: "0.1.11",
      currentVersion: "0.1.10",
      available: true,
      downloadAndInstall,
    } as never);

    render(<UpdateChecker />);

    const button = await screen.findByRole("button", {
      name: "Update to v0.1.11",
    });
    expect(button).toBeTruthy();

    fireEvent.click(button);

    await waitFor(() => {
      expect(downloadAndInstall).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(relaunch).toHaveBeenCalledTimes(1);
    });
  });
});
