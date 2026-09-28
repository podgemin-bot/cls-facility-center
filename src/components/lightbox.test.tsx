// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Lightbox } from "./lightbox";

const IMAGES = [
  { url: "/a.jpg", name: "room a" },
  { url: "/b.jpg", name: "room b" },
  { url: "/c.jpg", name: "room c" },
];

function renderLightbox(props: Partial<React.ComponentProps<typeof Lightbox>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Lightbox images={IMAGES} initialIndex={0} open onClose={onClose} {...props} />
  );
  return { onClose, ...utils };
}

describe("Lightbox", () => {
  it("renders nothing when closed", () => {
    render(<Lightbox images={IMAGES} initialIndex={0} open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the current image and counter", () => {
    renderLightbox({ initialIndex: 1 });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByAltText("room b")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  it("navigates next and wraps around past the end", () => {
    renderLightbox({ initialIndex: 2 });
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByAltText("room a")).toBeInTheDocument();
  });

  it("navigates prev and wraps around before the start", () => {
    renderLightbox({ initialIndex: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByAltText("room c")).toBeInTheDocument();
  });

  it("jumps to a specific image via dot buttons", () => {
    renderLightbox();
    fireEvent.click(screen.getByRole("button", { name: "Go to image 3" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByAltText("room c")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    const { onClose } = renderLightbox();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("advances with ArrowRight and goes back with ArrowLeft", () => {
    const { onClose } = renderLightbox();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", () => {
    const { onClose } = renderLightbox();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the image itself is clicked", () => {
    const { onClose } = renderLightbox();
    fireEvent.click(screen.getByAltText("room a"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the key listener on unmount", () => {
    const { onClose, unmount } = renderLightbox();
    unmount();
    cleanup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});