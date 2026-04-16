"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isNewerReleaseVersion, normalizeReleaseVersion } from "@/lib/update";

const RELEASES_ENDPOINT =
  "https://api.github.com/repos/dickwu/realtime-pdf/releases/latest";
const RELEASES_PAGE = "https://github.com/dickwu/realtime-pdf/releases/latest";

type ReleasePayload = {
  tag_name?: string;
  html_url?: string;
};

type UpdateState = {
  checking: boolean;
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  error?: string;
};

const INITIAL_STATE: UpdateState = {
  checking: false,
  available: false,
  currentVersion: "",
};

export default function UpdateChecker() {
  const [state, setState] = useState<UpdateState>(INITIAL_STATE);

  const checkForUpdates = useCallback(async (silent = false) => {
    setState((current) => ({
      ...current,
      checking: !silent,
      error: silent ? current.error : undefined,
    }));

    try {
      const [currentVersion, response] = await Promise.all([
        getVersion(),
        fetch(RELEASES_ENDPOINT, {
          headers: {
            Accept: "application/vnd.github+json",
          },
        }),
      ]);

      if (!response.ok) {
        throw new Error(`Update check failed with status ${response.status}.`);
      }

      const payload = (await response.json()) as ReleasePayload;
      const latestVersion = normalizeReleaseVersion(payload.tag_name ?? "");
      const available =
        latestVersion.length > 0 &&
        isNewerReleaseVersion(currentVersion, latestVersion);

      setState({
        checking: false,
        available,
        currentVersion,
        latestVersion: latestVersion || undefined,
        releaseUrl: payload.html_url || RELEASES_PAGE,
      });
    } catch (error) {
      setState((current) => ({
        checking: false,
        available: false,
        currentVersion: current.currentVersion,
        latestVersion: current.latestVersion,
        releaseUrl: current.releaseUrl,
        error:
          error instanceof Error
            ? error.message
            : "Failed to check for updates.",
      }));
    }
  }, []);

  useEffect(() => {
    let intervalId: number | undefined;
    let cancelled = false;

    const bootstrap = async () => {
      if (cancelled) return;
      await checkForUpdates(true);

      if (!cancelled) {
        intervalId = window.setInterval(() => {
          void checkForUpdates(true);
        }, 5 * 60 * 1000);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, [checkForUpdates]);

  const status = useMemo(() => {
    if (state.checking) {
      return "Checking for updates...";
    }

    if (state.error) {
      return state.error;
    }

    if (state.available && state.latestVersion) {
      return `Upgrade available: v${state.latestVersion}`;
    }

    if (state.currentVersion) {
      return `Up to date: v${state.currentVersion}`;
    }

    return "Update check ready.";
  }, [state]);

  const openRelease = () => {
    window.open(state.releaseUrl || RELEASES_PAGE, "_blank", "noopener,noreferrer");
  };

  const shouldShowCompactVersion =
    !state.checking && !state.available && !state.error && !!state.currentVersion;

  if (shouldShowCompactVersion) {
    return (
      <div className="update-checker update-checker--compact">
        <span className="update-checker__version">v{state.currentVersion}</span>
      </div>
    );
  }

  return (
    <div className="update-checker">
      <span
        className={[
          "status-pill",
          state.error
            ? "is-error"
            : state.available
              ? "is-running"
              : "is-idle",
        ].join(" ")}
      >
        {state.available ? "Upgrade" : state.error ? "Update error" : "Version"}
      </span>
      <span className="update-checker__message">{status}</span>
      <button
        className="update-checker__action"
        disabled={state.checking}
        onClick={() => {
          if (state.available) {
            openRelease();
            return;
          }

          void checkForUpdates(false);
        }}
        type="button"
      >
        {state.checking
          ? "Checking..."
          : state.available
            ? "Open release"
            : "Check updates"}
      </button>
    </div>
  );
}
