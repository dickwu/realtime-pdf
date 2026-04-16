"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PDFViewer as EmbedPdfViewer,
  type PDFViewerRef,
  type PluginRegistry,
} from "@embedpdf/react-pdf-viewer";
import {
  clampZoom,
  MAX_ZOOM,
  MIN_ZOOM,
  normalizeScrollOffset,
  ZOOM_STEP,
} from "@/lib/pdf";
import type { ScrollOffset } from "@/lib/pdf";

type PdfViewerProps = {
  src: string;
  zoom: number;
  initialScrollOffset?: ScrollOffset;
  onLoadError?: (error: Error) => void;
  onScrollChange?: (offset: ScrollOffset) => void;
  onZoomChange?: (zoom: number) => void;
};

type DocumentManagerCapability = {
  getActiveDocumentId?: () => string | null;
  onDocumentOpened?: (
    listener: (document: { id?: string; pageCount?: number }) => void,
  ) => () => void;
  onDocumentError?: (
    listener: (event: { error?: Error; message?: string }) => void,
  ) => () => void;
};

type ZoomCapability = {
  requestZoom: (level: number) => void;
  onZoomChange?: (
    listener: (event: { newZoom: number }) => void,
  ) => () => void;
};

type ViewportCapability = {
  getMetrics: () => { width: number; height: number };
  forDocument?: (
    documentId: string,
  ) => {
    scrollTo: (position: { x: number; y: number; behavior?: "instant" | "smooth" | "auto" }) => void;
  };
  onViewportResize?: (
    listener: (event: { metrics: { width: number; height: number } }) => void,
  ) => () => void;
};

type ScrollCapability = {
  onScroll?: (
    listener: (event: { documentId: string; metrics: { scrollOffset: { x: number; y: number } } }) => void,
  ) => () => void;
};

function getDocumentManager(registry: PluginRegistry): DocumentManagerCapability | null {
  const plugin = registry.getPlugin("document-manager");
  return plugin?.provides?.() ?? null;
}

function getZoomCapability(registry: PluginRegistry): ZoomCapability | null {
  const plugin = registry.getPlugin("zoom");
  return plugin?.provides?.() ?? null;
}

function getViewportCapability(registry: PluginRegistry): ViewportCapability | null {
  const plugin = registry.getPlugin("viewport");
  return plugin?.provides?.() ?? null;
}

function getScrollCapability(registry: PluginRegistry): ScrollCapability | null {
  const plugin = registry.getPlugin("scroll");
  return plugin?.provides?.() ?? null;
}

function stripRevision(url: string): string {
  const [base, hash = ""] = url.split("#");

  try {
    const parsed = new URL(base);
    parsed.searchParams.delete("rev");
    const next = parsed.toString();
    return hash ? `${next}#${hash}` : next;
  } catch {
    const [pathname, search = ""] = base.split("?");
    const params = new URLSearchParams(search);
    params.delete("rev");
    const nextSearch = params.toString();
    const next = nextSearch ? `${pathname}?${nextSearch}` : pathname;
    return hash ? `${next}#${hash}` : next;
  }
}

export default function PdfViewer({
  src,
  zoom,
  initialScrollOffset,
  onLoadError,
  onScrollChange,
  onZoomChange,
}: PdfViewerProps) {
  const viewerRef = useRef<PDFViewerRef>(null);
  const zoomCapabilityRef = useRef<ZoomCapability | null>(null);
  const viewportCapabilityRef = useRef<ViewportCapability | null>(null);
  const unsubscribeRef = useRef<(() => void)[]>([]);
  const lastSrcRef = useRef<string | null>(null);
  const lastStableSrcRef = useRef<string | null>(null);
  const currentDocumentIdRef = useRef<string | null>(null);
  const savedScrollOffsetRef = useRef({ x: 0, y: 0 });
  const pendingVisualRefreshRef = useRef(true);
  const documentOpenedRef = useRef(false);
  const viewportReadyRef = useRef(false);
  const syntheticZoomEventsRef = useRef(0);
  const suppressScrollEventsRef = useRef(false);
  const reloadTimerRef = useRef<number | null>(null);
  const scrollRestoreTimerRef = useRef<number | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [viewerKey, setViewerKey] = useState(0);

  const clampedZoom = useMemo(() => clampZoom(zoom), [zoom]);
  const normalizedInitialScrollOffset = normalizeScrollOffset(initialScrollOffset);
  const initialScrollX = normalizedInitialScrollOffset.x;
  const initialScrollY = normalizedInitialScrollOffset.y;

  useEffect(() => {
    setLoadError(null);
    pendingVisualRefreshRef.current = true;
    documentOpenedRef.current = false;
    viewportReadyRef.current = false;
    currentDocumentIdRef.current = null;

    const stableSrc = stripRevision(src);

    if (lastSrcRef.current === null) {
      savedScrollOffsetRef.current = { x: initialScrollX, y: initialScrollY };
      lastSrcRef.current = src;
      lastStableSrcRef.current = stableSrc;
      return;
    }

    if (lastStableSrcRef.current !== stableSrc) {
      savedScrollOffsetRef.current = { x: initialScrollX, y: initialScrollY };
      suppressScrollEventsRef.current = false;
    }

    if (lastSrcRef.current !== src) {
      lastSrcRef.current = src;
      lastStableSrcRef.current = stableSrc;
      setViewerKey((current) => current + 1);
    }
  }, [initialScrollX, initialScrollY, src]);

  useEffect(() => {
    if (!zoomCapabilityRef.current) return;
    zoomCapabilityRef.current.requestZoom(clampedZoom);
  }, [clampedZoom, viewerKey]);

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current !== null) {
        window.clearTimeout(reloadTimerRef.current);
      }
      if (scrollRestoreTimerRef.current !== null) {
        window.clearTimeout(scrollRestoreTimerRef.current);
      }
      for (const unsubscribe of unsubscribeRef.current) {
        unsubscribe();
      }
      unsubscribeRef.current = [];
      suppressScrollEventsRef.current = false;
    };
  }, []);

  const requestReloadRefresh = (targetZoom: number) => {
    const zoomCapability = zoomCapabilityRef.current;
    if (!zoomCapability) return;

    if (reloadTimerRef.current !== null) {
      window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
    if (scrollRestoreTimerRef.current !== null) {
      window.clearTimeout(scrollRestoreTimerRef.current);
      scrollRestoreTimerRef.current = null;
    }

    const targetScroll = {
      x: savedScrollOffsetRef.current.x,
      y: savedScrollOffsetRef.current.y,
    };
    suppressScrollEventsRef.current = true;

    const restoreScroll = () => {
      const documentId = currentDocumentIdRef.current;
      const viewport = viewportCapabilityRef.current?.forDocument?.(documentId ?? "");

      if (documentId && viewport) {
        viewport.scrollTo({
          x: targetScroll.x,
          y: targetScroll.y,
          behavior: "instant",
        });
      }

      savedScrollOffsetRef.current = targetScroll;
      suppressScrollEventsRef.current = false;
      scrollRestoreTimerRef.current = null;
    };

    const zoomIn = clampZoom(targetZoom + ZOOM_STEP);
    const refreshZoom =
      Math.abs(zoomIn - targetZoom) > 0.001
        ? zoomIn
        : clampZoom(targetZoom - ZOOM_STEP);

    if (Math.abs(refreshZoom - targetZoom) <= 0.001) {
      zoomCapability.requestZoom(targetZoom);
      scrollRestoreTimerRef.current = window.setTimeout(restoreScroll, 16);
      return;
    }

    syntheticZoomEventsRef.current = 2;
    zoomCapability.requestZoom(refreshZoom);
    reloadTimerRef.current = window.setTimeout(() => {
      zoomCapability.requestZoom(targetZoom);
      scrollRestoreTimerRef.current = window.setTimeout(restoreScroll, 16);
      reloadTimerRef.current = null;
    }, 16);
  };

  const handleReady = (registry: PluginRegistry) => {
    for (const unsubscribe of unsubscribeRef.current) {
      unsubscribe();
    }
    unsubscribeRef.current = [];

    const documentManager = getDocumentManager(registry);
    const zoomCapability = getZoomCapability(registry);
    const viewportCapability = getViewportCapability(registry);
    const scrollCapability = getScrollCapability(registry);

    zoomCapabilityRef.current = zoomCapability;
    viewportCapabilityRef.current = viewportCapability;
    zoomCapability?.requestZoom(clampedZoom);

    const maybeRefreshViewer = () => {
      if (!pendingVisualRefreshRef.current) return;
      if (!documentOpenedRef.current) return;
      if (viewportCapability && !viewportReadyRef.current) return;

      pendingVisualRefreshRef.current = false;
      requestReloadRefresh(clampedZoom);
    };

    if (viewportCapability) {
      const metrics = viewportCapability.getMetrics();
      viewportReadyRef.current = metrics.width > 0 && metrics.height > 0;

      if (viewportCapability.onViewportResize) {
        const unsubscribe = viewportCapability.onViewportResize((event) => {
          const { width, height } = event.metrics;
          if (width > 0 && height > 0) {
            viewportReadyRef.current = true;
            maybeRefreshViewer();
          }
        });
        unsubscribeRef.current.push(unsubscribe);
      }
    } else {
      viewportReadyRef.current = true;
    }

    if (documentManager?.onDocumentOpened) {
      const unsubscribe = documentManager.onDocumentOpened((document) => {
        setLoadError(null);
        currentDocumentIdRef.current =
          document.id ??
          documentManager.getActiveDocumentId?.() ??
          currentDocumentIdRef.current;
        documentOpenedRef.current = true;
        const wasPendingRefresh = pendingVisualRefreshRef.current;
        maybeRefreshViewer();

        if (wasPendingRefresh) return;
        zoomCapabilityRef.current?.requestZoom(clampedZoom);
      });
      unsubscribeRef.current.push(unsubscribe);
    } else {
      documentOpenedRef.current = true;
      maybeRefreshViewer();
    }

    if (scrollCapability?.onScroll) {
      const unsubscribe = scrollCapability.onScroll((event) => {
        if (suppressScrollEventsRef.current) {
          return;
        }

        if (
          currentDocumentIdRef.current !== null &&
          event.documentId !== currentDocumentIdRef.current
        ) {
          return;
        }

        const nextScrollOffset = normalizeScrollOffset(event.metrics.scrollOffset);
        savedScrollOffsetRef.current = nextScrollOffset;
        onScrollChange?.(nextScrollOffset);
      });
      unsubscribeRef.current.push(unsubscribe);
    }

    if (zoomCapability?.onZoomChange) {
      const unsubscribe = zoomCapability.onZoomChange((event) => {
        if (syntheticZoomEventsRef.current > 0) {
          syntheticZoomEventsRef.current -= 1;
          return;
        }

        onZoomChange?.(event.newZoom);
      });
      unsubscribeRef.current.push(unsubscribe);
    }

    if (documentManager?.onDocumentError) {
      const unsubscribe = documentManager.onDocumentError((event) => {
        const error =
          event.error ?? new Error(event.message || "Failed to load the PDF viewer.");
        setLoadError(error);
        onLoadError?.(error);
      });
      unsubscribeRef.current.push(unsubscribe);
    }
  };

  if (loadError) {
    return (
      <div className="viewer-error">
        <h2>Unable to load PDF</h2>
        <p>{loadError.message}</p>
      </div>
    );
  }

  return (
    <div className="viewer-canvas">
      <EmbedPdfViewer
        key={viewerKey}
        ref={viewerRef}
        className="embed-pdf-viewer"
        config={{
          src,
          theme: { preference: "light" },
          tabBar: "never",
          disabledCategories: [
            "panel",
            "annotation",
            "redaction",
            "insert",
            "form",
            "document-open",
            "document-export",
            "document-print",
            "document-capture",
            "history",
            "tools",
            "menu",
            "toolbar-menu",
            "document-menu",
          ],
          zoom: {
            defaultZoomLevel: clampedZoom,
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
          },
          form: {
            withForms: false,
            withAnnotations: false,
          },
        }}
        onReady={handleReady}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
