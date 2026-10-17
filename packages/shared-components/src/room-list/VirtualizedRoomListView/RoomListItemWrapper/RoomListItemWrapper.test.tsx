/*
 * Copyright 2026 Element Creations Ltd.
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
 * Please see LICENSE files in the repository root for full details.
 */

import React from "react";
import { render, screen } from "@test-utils";
import userEvent from "@testing-library/user-event";
import { composeStories } from "@storybook/react-vite";
import { describe, it, expect, vi } from "vitest";

import * as stories from "./RoomListItemWrapper.stories";

const { FlatList, Sections } = composeStories(stories);

describe("<RoomListItemWrapper /> room footer", () => {
    it.each([
        ["flat list", FlatList],
        ["sections", Sections],
    ])("renders the footer under the room in a %s", (_, Story) => {
        const renderRoomFooter = vi.fn(() => <div data-testid="footer">In a call</div>);
        render(<Story renderRoomFooter={renderRoomFooter} />);

        expect(screen.getByTestId("footer")).toBeInTheDocument();
        expect(renderRoomFooter).toHaveBeenCalledWith(expect.objectContaining({ name: "Room name" }));
    });

    it("renders nothing extra without a footer", () => {
        render(<FlatList />);
        expect(screen.queryByTestId("footer")).toBeNull();
    });
});

describe("<RoomListItemWrapper /> keyboard re-dispatch", () => {
    it("ArrowLeft on the first room of a section re-dispatches as ArrowUp", async () => {
        const user = userEvent.setup();
        const onKeyDown = vi.fn();
        render(
            <div onKeyDown={onKeyDown}>
                <Sections roomIndexInSection={0} isFocused={true} />
            </div>,
        );

        // Make sure the room's button is focused before sending the key event.
        const button = screen.getByRole("button", { name: /Room name/ });
        button.focus();

        await user.keyboard("{ArrowLeft}");

        const arrowUpEvents = onKeyDown.mock.calls.filter(([event]) => event.code === "ArrowUp");
        expect(arrowUpEvents).toHaveLength(1);
    });

    it("ArrowLeft on a non-first room of a section does NOT re-dispatch", async () => {
        const user = userEvent.setup();
        const onKeyDown = vi.fn();
        render(
            <div onKeyDown={onKeyDown}>
                <Sections roomIndexInSection={2} isFocused={true} />
            </div>,
        );

        const button = screen.getByRole("button", { name: /Room name/ });
        button.focus();

        await user.keyboard("{ArrowLeft}");

        const arrowUpEvents = onKeyDown.mock.calls.filter(([event]) => event.code === "ArrowUp");
        expect(arrowUpEvents).toHaveLength(0);

        // The original ArrowLeft event should still bubble (the handler is a no-op for non-first items).
        const arrowLeftEvents = onKeyDown.mock.calls.filter(([event]) => event.code === "ArrowLeft");
        expect(arrowLeftEvents.length).toBeGreaterThan(0);
    });
});
