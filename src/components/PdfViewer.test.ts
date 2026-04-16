import React, { useEffect } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PdfViewer from "@/components/PdfViewer";
import { MAX_ZOOM } from "@/lib/pdf";

const viewerLifecycle = {
  mounts: 0,
  unmounts: 0,
};

type DocumentOpenedListener = ((document: { id?: string; pageCount?: number }) => void) | null;
type ZoomChangeListener = ((event: { newZoom: number }) => void) | null;
type ViewportResizeListener =
  | ((event: { metrics: { width: number; height: number } }) => void)
  | null;
type ScrollListener =
  | ((event: { documentId: string; metrics: { scrollOffset: { x: number; y: number } } }) => void)
  | null;

const zoomCapability = {
  requestZoom: vi.fn<(level: number) => void>(),
  onZoomChange: vi.fn<(listener: (event: { newZoom: number }) => void) => () => void>(),
};

const documentManager = {
  onDocumentOpened: vi.fn<
    (listener: (document: { pageCount?: number }) => void) => () => void
  >(),
  onDocumentError: vi.fn<
    (
      listener: (event: { error?: Error; message?: string }) => void,
    ) => () => void
  >(),
};

const viewportCapability = {
  getMetrics: vi.fn<() => { width: number; height: number }>(),
  forDocument: vi.fn<(documentId: string) => { scrollTo: (position: { x: number; y: number; behavior?: string }) => void }>(),
  onViewportResize: vi.fn<
    (
      listener: (event: { metrics: { width: number; height: number } }) => void,
    ) => () => void
  >(),
};

const viewportDocumentScope = {
  scrollTo: vi.fn<(position: { x: number; y: number; behavior?: string }) => void>(),
};

const scrollCapability = {
  onScroll: vi.fn<
    (
      listener: (event: {
        documentId: string;
        metrics: { scrollOffset: { x: number; y: number } };
      }) => void,
    ) => () => void
  >(),
};

let documentOpenedListener: DocumentOpenedListener = null;
let zoomChangeListener: ZoomChangeListener = null;
let viewportResizeListener: ViewportResizeListener = null;
let scrollListener: ScrollListener = null;
let lastViewerProps:
  | {
      config?: {
        disabledCategories?: string[];
        form?: {
          withForms?: boolean;
          withAnnotations?: boolean;
        };
      };
    }
  | null = null;

vi.mock("@embedpdf/react-pdf-viewer", () => {
  const ReactModule = require("react") as typeof import("react");

  const MockPDFViewer = ReactModule.forwardRef(function MockPDFViewer(
    {
      onReady,
    }: {
      onReady?: (registry: { getPlugin: (pluginId: string) => unknown }) => void;
    },
    ref: React.ForwardedRef<{
      container: null;
      registry: null;
    }>,
  ) {
    lastViewerProps = arguments[0];

    ReactModule.useImperativeHandle(ref, () => ({
      container: null,
      registry: null,
    }));

    useEffect(() => {
      viewerLifecycle.mounts += 1;
      onReady?.({
        getPlugin: (pluginId: string) => {
          if (pluginId === "zoom") {
            return {
              provides: () => zoomCapability,
            };
          }

          if (pluginId === "document-manager") {
            return {
              provides: () => documentManager,
            };
          }

          if (pluginId === "viewport") {
            return {
              provides: () => viewportCapability,
            };
          }

          if (pluginId === "scroll") {
            return {
              provides: () => scrollCapability,
            };
          }

          return null;
        },
      });

      return () => {
        viewerLifecycle.unmounts += 1;
      };
    }, []);

    return ReactModule.createElement("div", {
      "data-testid": "mock-embed-pdf-viewer",
    });
  });

  return {
    PDFViewer: MockPDFViewer,
  };
});

describe("PdfViewer", () => {
  beforeEach(() => {
    viewerLifecycle.mounts = 0;
    viewerLifecycle.unmounts = 0;
    documentOpenedListener = null;
    zoomChangeListener = null;
    viewportResizeListener = null;
    scrollListener = null;
    lastViewerProps = null;
    vi.useFakeTimers();

    zoomCapability.requestZoom.mockReset();
    zoomCapability.onZoomChange.mockReset();
    zoomCapability.onZoomChange.mockImplementation((listener) => {
      zoomChangeListener = listener;
      return () => {
        if (zoomChangeListener === listener) {
          zoomChangeListener = null;
        }
      };
    });

    documentManager.onDocumentOpened.mockReset();
    documentManager.onDocumentOpened.mockImplementation((listener) => {
      documentOpenedListener = listener;
      return () => {
        if (documentOpenedListener === listener) {
          documentOpenedListener = null;
        }
      };
    });

    documentManager.onDocumentError.mockReset();
    documentManager.onDocumentError.mockImplementation(() => () => {});

    viewportCapability.getMetrics.mockReset();
    viewportCapability.getMetrics.mockReturnValue({ width: 0, height: 0 });
    viewportCapability.forDocument.mockReset();
    viewportCapability.forDocument.mockReturnValue(viewportDocumentScope);
    viewportCapability.onViewportResize.mockReset();
    viewportCapability.onViewportResize.mockImplementation((listener) => {
      viewportResizeListener = listener;
      return () => {
        if (viewportResizeListener === listener) {
          viewportResizeListener = null;
        }
      };
    });
    viewportDocumentScope.scrollTo.mockReset();

    scrollCapability.onScroll.mockReset();
    scrollCapability.onScroll.mockImplementation((listener) => {
      scrollListener = listener;
      return () => {
        if (scrollListener === listener) {
          scrollListener = null;
        }
      };
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
  });

  it("does not remount the embedded viewer on the first src render", () => {
    render(React.createElement(PdfViewer, { src: "file:///initial.pdf", zoom: 1 }));

    expect(viewerLifecycle.mounts).toBe(1);
    expect(viewerLifecycle.unmounts).toBe(0);
  });

  it("disables insert and form editing features in the embedded viewer config", () => {
    render(React.createElement(PdfViewer, { src: "file:///initial.pdf", zoom: 1 }));

    expect(lastViewerProps?.config?.disabledCategories).toEqual(
      expect.arrayContaining(["insert", "form"]),
    );
    expect(lastViewerProps?.config?.form).toEqual({
      withForms: false,
      withAnnotations: false,
    });
  });

  it("remounts the embedded viewer when the src changes later", () => {
    const view = render(
      React.createElement(PdfViewer, { src: "file:///initial.pdf", zoom: 1 }),
    );

    view.rerender(
      React.createElement(PdfViewer, { src: "file:///updated.pdf", zoom: 1 }),
    );

    expect(viewerLifecycle.mounts).toBe(2);
    expect(viewerLifecycle.unmounts).toBe(1);
  });

  it("nudges zoom after a document reload and restores the target zoom", () => {
    const view = render(
      React.createElement(PdfViewer, { src: "file:///initial.pdf", zoom: 1 }),
    );

    zoomCapability.requestZoom.mockClear();

    view.rerender(
      React.createElement(PdfViewer, { src: "file:///updated.pdf", zoom: 1 }),
    );

    zoomCapability.requestZoom.mockClear();

    act(() => {
      documentOpenedListener?.({});
      viewportResizeListener?.({ metrics: { width: 1200, height: 900 } });
      vi.runAllTimers();
    });

    expect(zoomCapability.requestZoom).toHaveBeenNthCalledWith(1, 1.1);
    expect(zoomCapability.requestZoom).toHaveBeenNthCalledWith(2, 1);
  });

  it("waits for a non-zero viewport before forcing the first-load redraw", () => {
    render(React.createElement(PdfViewer, { src: "file:///initial.pdf", zoom: 1 }));

    zoomCapability.requestZoom.mockClear();

    act(() => {
      documentOpenedListener?.({});
    });

    expect(zoomCapability.requestZoom).not.toHaveBeenCalled();

    act(() => {
      viewportResizeListener?.({ metrics: { width: 1280, height: 960 } });
      vi.runAllTimers();
    });

    expect(zoomCapability.requestZoom).toHaveBeenNthCalledWith(1, 1.1);
    expect(zoomCapability.requestZoom).toHaveBeenNthCalledWith(2, 1);
  });

  it("suppresses synthetic reload zoom events but keeps real zoom changes", () => {
    const onZoomChange = vi.fn();
    const view = render(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf",
        zoom: 1,
        onZoomChange,
      }),
    );

    view.rerender(
      React.createElement(PdfViewer, {
        src: "file:///updated.pdf",
        zoom: 1,
        onZoomChange,
      }),
    );

    act(() => {
      documentOpenedListener?.({});
      viewportResizeListener?.({ metrics: { width: 1200, height: 900 } });
      zoomChangeListener?.({ newZoom: 1.1 });
      vi.runAllTimers();
      zoomChangeListener?.({ newZoom: 1 });
      zoomChangeListener?.({ newZoom: 1.2 });
    });

    expect(onZoomChange).toHaveBeenCalledTimes(1);
    expect(onZoomChange).toHaveBeenCalledWith(1.2);
  });

  it("restores the previous scroll offset after a document reload", () => {
    const view = render(
      React.createElement(PdfViewer, { src: "file:///initial.pdf?rev=1", zoom: 1 }),
    );

    act(() => {
      documentOpenedListener?.({ id: "doc-initial" });
      scrollListener?.({
        documentId: "doc-initial",
        metrics: { scrollOffset: { x: 18, y: 420 } },
      });
    });

    view.rerender(
      React.createElement(PdfViewer, { src: "file:///initial.pdf?rev=2", zoom: 1 }),
    );

    viewportDocumentScope.scrollTo.mockClear();

    act(() => {
      documentOpenedListener?.({ id: "doc-updated" });
      viewportResizeListener?.({ metrics: { width: 1200, height: 900 } });
      vi.runAllTimers();
    });

    expect(viewportCapability.forDocument).toHaveBeenCalledWith("doc-updated");
    expect(viewportDocumentScope.scrollTo).toHaveBeenCalledWith({
      x: 18,
      y: 420,
      behavior: "instant",
    });
  });

  it("ignores synthetic scroll events fired during the reload nudge window", () => {
    const onScrollChange = vi.fn();

    const view = render(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf?rev=1",
        zoom: 1,
        onScrollChange,
      }),
    );

    act(() => {
      documentOpenedListener?.({ id: "doc-initial" });
      scrollListener?.({
        documentId: "doc-initial",
        metrics: { scrollOffset: { x: 18, y: 420 } },
      });
    });

    view.rerender(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf?rev=2",
        zoom: 1,
        onScrollChange,
      }),
    );

    viewportDocumentScope.scrollTo.mockClear();
    onScrollChange.mockClear();

    act(() => {
      documentOpenedListener?.({ id: "doc-updated" });
      viewportResizeListener?.({ metrics: { width: 1200, height: 900 } });
      // Simulate EmbedPDF emitting a reset scroll event during the nudge window.
      scrollListener?.({
        documentId: "doc-updated",
        metrics: { scrollOffset: { x: 0, y: 0 } },
      });
      vi.runAllTimers();
    });

    expect(viewportDocumentScope.scrollTo).toHaveBeenCalledWith({
      x: 18,
      y: 420,
      behavior: "instant",
    });
    expect(onScrollChange).not.toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it("resumes reporting real scroll events after the restore completes", () => {
    const onScrollChange = vi.fn();

    const view = render(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf?rev=1",
        zoom: 1,
        onScrollChange,
      }),
    );

    act(() => {
      documentOpenedListener?.({ id: "doc-initial" });
      scrollListener?.({
        documentId: "doc-initial",
        metrics: { scrollOffset: { x: 18, y: 420 } },
      });
    });

    view.rerender(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf?rev=2",
        zoom: 1,
        onScrollChange,
      }),
    );

    act(() => {
      documentOpenedListener?.({ id: "doc-updated" });
      viewportResizeListener?.({ metrics: { width: 1200, height: 900 } });
      vi.runAllTimers();
    });

    onScrollChange.mockClear();

    act(() => {
      scrollListener?.({
        documentId: "doc-updated",
        metrics: { scrollOffset: { x: 40, y: 800 } },
      });
    });

    expect(onScrollChange).toHaveBeenCalledWith({ x: 40, y: 800 });
  });

  it("restores the previous scroll offset even when zoom is pinned at MAX_ZOOM", () => {
    const view = render(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf?rev=1",
        zoom: MAX_ZOOM,
      }),
    );

    act(() => {
      documentOpenedListener?.({ id: "doc-initial" });
      scrollListener?.({
        documentId: "doc-initial",
        metrics: { scrollOffset: { x: 10, y: 200 } },
      });
    });

    view.rerender(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf?rev=2",
        zoom: MAX_ZOOM,
      }),
    );

    viewportDocumentScope.scrollTo.mockClear();

    act(() => {
      documentOpenedListener?.({ id: "doc-updated" });
      viewportResizeListener?.({ metrics: { width: 1200, height: 900 } });
      vi.runAllTimers();
    });

    expect(viewportDocumentScope.scrollTo).toHaveBeenCalledWith({
      x: 10,
      y: 200,
      behavior: "instant",
    });
  });

  it("restores the provided initial scroll offset on the first document load", () => {
    render(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf",
        zoom: 1,
        initialScrollOffset: { x: 24, y: 360 },
      }),
    );

    viewportDocumentScope.scrollTo.mockClear();

    act(() => {
      documentOpenedListener?.({ id: "doc-initial" });
      viewportResizeListener?.({ metrics: { width: 1200, height: 900 } });
      vi.runAllTimers();
    });

    expect(viewportDocumentScope.scrollTo).toHaveBeenCalledWith({
      x: 24,
      y: 360,
      behavior: "instant",
    });
  });

  it("reports scroll changes to the parent callback", () => {
    const onScrollChange = vi.fn();

    render(
      React.createElement(PdfViewer, {
        src: "file:///initial.pdf",
        zoom: 1,
        onScrollChange,
      }),
    );

    act(() => {
      documentOpenedListener?.({ id: "doc-initial" });
      scrollListener?.({
        documentId: "doc-initial",
        metrics: { scrollOffset: { x: 12, y: 240 } },
      });
    });

    expect(onScrollChange).toHaveBeenCalledWith({ x: 12, y: 240 });
  });
});
