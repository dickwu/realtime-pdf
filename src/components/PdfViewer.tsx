"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PDFViewer as EmbedPdfViewer,
  type PDFViewerRef,
  type PluginRegistry,
} from "@embedpdf/react-pdf-viewer";
import { clampZoom, MAX_ZOOM, MIN_ZOOM } from "@/lib/pdf";

type PdfViewerProps = {
  src: string;
  zoom: number;
  onLoadError?: (error: Error) => void;
  onZoomChange?: (zoom: number) => void;
};

type DocumentManagerCapability = {
  onDocumentOpened?: (listener: (document: { pageCount?: number }) => void) => () => void;
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

function getDocumentManager(registry: PluginRegistry): DocumentManagerCapability | null {
  const plugin = registry.getPlugin("document-manager");
  return plugin?.provides?.() ?? null;
}

function getZoomCapability(registry: PluginRegistry): ZoomCapability | null {
  const plugin = registry.getPlugin("zoom");
  return plugin?.provides?.() ?? null;
}

export default function PdfViewer({
  src,
  zoom,
  onLoadError,
  onZoomChange,
}: PdfViewerProps) {
  const viewerRef = useRef<PDFViewerRef>(null);
  const zoomCapabilityRef = useRef<ZoomCapability | null>(null);
  const unsubscribeRef = useRef<(() => void)[]>([]);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [viewerKey, setViewerKey] = useState(0);

  const clampedZoom = useMemo(() => clampZoom(zoom), [zoom]);

  useEffect(() => {
    setLoadError(null);
    setViewerKey((current) => current + 1);
  }, [src]);

  useEffect(() => {
    if (!zoomCapabilityRef.current) return;
    zoomCapabilityRef.current.requestZoom(clampedZoom);
  }, [clampedZoom, viewerKey]);

  useEffect(() => {
    return () => {
      for (const unsubscribe of unsubscribeRef.current) {
        unsubscribe();
      }
      unsubscribeRef.current = [];
    };
  }, []);

  const handleReady = (registry: PluginRegistry) => {
    for (const unsubscribe of unsubscribeRef.current) {
      unsubscribe();
    }
    unsubscribeRef.current = [];

    const documentManager = getDocumentManager(registry);
    const zoomCapability = getZoomCapability(registry);

    zoomCapabilityRef.current = zoomCapability;
    zoomCapability?.requestZoom(clampedZoom);

    if (documentManager?.onDocumentOpened) {
      const unsubscribe = documentManager.onDocumentOpened(() => {
        setLoadError(null);
        zoomCapabilityRef.current?.requestZoom(clampedZoom);
      });
      unsubscribeRef.current.push(unsubscribe);
    }

    if (zoomCapability?.onZoomChange) {
      const unsubscribe = zoomCapability.onZoomChange((event) => {
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
        }}
        onReady={handleReady}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
