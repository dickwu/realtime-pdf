"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const TIMESTAMP_TICK_MS = 30 * 1000;

type CheckerState = {
  checking: boolean;
  currentVersion: string;
  update: Update | null;
  lastCheckedAt: number | null;
  installing: boolean;
  downloadedBytes: number;
  totalBytes: number | null;
  error?: string;
};

const INITIAL_STATE: CheckerState = {
  checking: false,
  currentVersion: "",
  update: null,
  lastCheckedAt: null,
  installing: false,
  downloadedBytes: 0,
  totalBytes: null,
};

function formatRelative(timestamp: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 30) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  return `${diffHour}h ago`;
}

function formatProgress(downloaded: number, total: number | null): string {
  if (total && total > 0) {
    const percent = Math.min(100, Math.floor((downloaded / total) * 100));
    return `${percent}%`;
  }
  return `${(downloaded / 1024 / 1024).toFixed(1)} MB`;
}

export default function UpdateChecker() {
  const [state, setState] = useState<CheckerState>(INITIAL_STATE);
  const [now, setNow] = useState<number>(() => Date.now());

  const runCheck = useCallback(async (silent: boolean) => {
    setState((prev) => ({
      ...prev,
      checking: !silent,
      error: silent ? prev.error : undefined,
    }));
    try {
      const [currentVersion, update] = await Promise.all([
        getVersion(),
        check(),
      ]);
      setState((prev) => ({
        ...prev,
        checking: false,
        currentVersion,
        update,
        lastCheckedAt: Date.now(),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        checking: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to check for updates.",
      }));
    }
  }, []);

  const installUpdate = useCallback(async (update: Update) => {
    setState((prev) => ({
      ...prev,
      installing: true,
      downloadedBytes: 0,
      totalBytes: null,
      error: undefined,
    }));
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setState((prev) => ({
            ...prev,
            totalBytes: event.data.contentLength ?? null,
            downloadedBytes: 0,
          }));
        } else if (event.event === "Progress") {
          setState((prev) => ({
            ...prev,
            downloadedBytes: prev.downloadedBytes + event.data.chunkLength,
          }));
        }
      });
      await relaunch();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        installing: false,
        error: error instanceof Error ? error.message : "Update failed.",
      }));
    }
  }, []);

  useEffect(() => {
    void runCheck(true);
    const intervalId = window.setInterval(() => {
      void runCheck(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [runCheck]);

  useEffect(() => {
    const tickId = window.setInterval(
      () => setNow(Date.now()),
      TIMESTAMP_TICK_MS,
    );
    return () => window.clearInterval(tickId);
  }, []);

  const lastCheckedLabel = useMemo(() => {
    if (!state.lastCheckedAt) return null;
    return `Last checked ${formatRelative(state.lastCheckedAt, now)}`;
  }, [state.lastCheckedAt, now]);

  const handlePrimary = useCallback(() => {
    if (state.installing) return;
    if (state.update) {
      void installUpdate(state.update);
      return;
    }
    void runCheck(false);
  }, [installUpdate, runCheck, state.installing, state.update]);

  const message = useMemo(() => {
    if (state.installing) {
      return `Downloading ${formatProgress(state.downloadedBytes, state.totalBytes)}…`;
    }
    if (state.checking) return "Checking for updates…";
    if (state.error) return state.error;
    if (state.update) return `Update to v${state.update.version} available`;
    if (state.currentVersion) return `Up to date: v${state.currentVersion}`;
    return "Update check ready.";
  }, [
    state.checking,
    state.currentVersion,
    state.downloadedBytes,
    state.error,
    state.installing,
    state.totalBytes,
    state.update,
  ]);

  const buttonLabel = useMemo(() => {
    if (state.installing) return "Installing…";
    if (state.checking) return "Checking…";
    if (state.update) return `Update to v${state.update.version}`;
    return "Check now";
  }, [state.checking, state.installing, state.update]);

  const showCompactVersion =
    !state.checking &&
    !state.installing &&
    !state.update &&
    !state.error &&
    !!state.currentVersion;

  if (showCompactVersion) {
    return (
      <div className="rtpdf-update-checker">
        <span className="rtpdf-update-checker__version">
          v{state.currentVersion}
        </span>
        <button
          className="rtpdf-update-checker__action"
          type="button"
          onClick={handlePrimary}
        >
          Check now
        </button>
        {lastCheckedLabel ? (
          <span className="rtpdf-update-checker__meta">{lastCheckedLabel}</span>
        ) : null}
      </div>
    );
  }

  const actionClassName = state.update
    ? "rtpdf-update-checker__action rtpdf-update-checker__action--primary"
    : "rtpdf-update-checker__action";

  return (
    <div className="rtpdf-update-checker">
      <span className="rtpdf-update-checker__message">{message}</span>
      <button
        className={actionClassName}
        type="button"
        disabled={state.installing}
        onClick={handlePrimary}
      >
        {buttonLabel}
      </button>
      {lastCheckedLabel ? (
        <span className="rtpdf-update-checker__meta">{lastCheckedLabel}</span>
      ) : null}
    </div>
  );
}
