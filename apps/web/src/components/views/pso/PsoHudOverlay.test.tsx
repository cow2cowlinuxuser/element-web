/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React, { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { stubClient, TestSDKContext, wrapInSdkContext } from "test-utils";

import { PsoHudOverlay as UnwrappedPsoHudOverlay } from "./PsoHudOverlay";
import { CallStore } from "../../../stores/CallStore";
import { OwnProfileStore } from "../../../stores/OwnProfileStore";
import RightPanelStore from "../../../stores/right-panel/RightPanelStore";

vi.mock("./PsoLobby3dLayer", () => ({ PsoLobby3dLayer: () => null }));

describe("PsoHudOverlay", () => {
    let sdkContext: TestSDKContext;

    beforeEach(() => {
        localStorage.clear();
        document.body.className = "";
        const client = stubClient();
        sdkContext = new TestSDKContext();
        sdkContext._client = client;

        vi.spyOn(OwnProfileStore.instance, "displayName", "get").mockReturnValue("Shichimiya");
        vi.spyOn(CallStore.instance, "connectedCalls", "get").mockReturnValue(new Set());
    });

    it("renders the Pioneer 2 orbital backdrop, Episode IV 1-0 hex quickbar, and @beat time", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        expect(screen.getByTestId("pso-hud-backdrop")).toBeInTheDocument();
        expect(screen.getByTestId("pso-hex-quickbar")).toBeInTheDocument();
        expect(document.body).toHaveClass("pso-hud-theme");

        // Clicking hex slot 1 triggers the Shichimiya Rappy Symbol Chat popup
        await userEvent.click(screen.getByTestId("pso-hex-slot-1"));
        expect(screen.getByTestId("pso-symbol-chat-toast")).toBeInTheDocument();
        expect(screen.getByText(/Shichimiya/i)).toBeInTheDocument();
    });

    it("toggles Episode IV Stream Overlay mode and reveals the compact top-left Hunter Status HUD", async () => {
        let hudEvent: ((ev: unknown, payload: { type: string }) => void) | undefined;
        (window as unknown as { electron?: unknown }).electron = {
            on: (channel: string, listener: typeof hudEvent) => {
                if (channel === "psoHudEvent") hudEvent = listener;
            },
            send: () => {},
        };
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        expect(screen.queryByTestId("pso-status-hud")).toBeNull();

        // Alt+O arrives from the main process as a psoHudEvent
        act(() => hudEvent?.(undefined, { type: "toggleStreamOverlay" }));
        delete (window as unknown as { electron?: unknown }).electron;
        expect(document.body).toHaveClass("pso-stream-overlay-mode");
        expect(screen.getByTestId("pso-status-hud")).toBeInTheDocument();
        expect(screen.getByText("PING")).toBeInTheDocument();
        expect(screen.getByText("VOICE")).toBeInTheDocument();
    });

    it("enters compact chat showing only the compact hex cluster, folds the chat away and restores", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        await userEvent.click(screen.getByTestId("pso-compact-chat-toggle"));
        expect(document.body).toHaveClass("pso-compact-chat-mode");
        expect(document.body).toHaveClass("pso-compact-unfolding");
        expect(screen.queryByTestId("pso-status-hud")).toBeNull();
        expect(screen.queryByTestId("pso-titlebar-compact-chat-btn")).toBeNull();
        expect(screen.queryByTestId("pso-hex-slot-1")).toBeNull();
        expect(screen.getByTestId("pso-compact-hex-cluster")).toBeInTheDocument();
        expect(screen.getByTestId("pso-compact-hex-refresh")).toBeInTheDocument();

        // The chat hex folds the chat box upward and away
        await userEvent.click(screen.getByTestId("pso-compact-hex-chat"));
        expect(document.body).toHaveClass("pso-compact-folding");
        await waitFor(() => expect(document.body).toHaveClass("pso-compact-chat-hidden"));
        expect(document.body).not.toHaveClass("pso-compact-folding");

        // The arrow-to-line hex restores the full window
        await userEvent.click(screen.getByTestId("pso-compact-hex-restore"));
        await waitFor(() => expect(document.body).not.toHaveClass("pso-compact-chat-mode"));
        expect(document.body).not.toHaveClass("pso-compact-chat-hidden");
        expect(screen.queryByTestId("pso-compact-hex-restore")).toBeNull();
        expect(screen.getByTestId("pso-compact-chat-toggle")).toBeInTheDocument();
    });

    it("puts the compact chat box back where it was last dragged to", async () => {
        localStorage.setItem("pso_hud_compact_chat_pos", JSON.stringify({ x: 40, y: 60 }));
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);
        expect(document.body).not.toHaveClass("pso-compact-chat-placed");

        await userEvent.click(screen.getByTestId("pso-compact-chat-toggle"));
        expect(document.body).toHaveClass("pso-compact-chat-placed");
        expect(document.body.style.getPropertyValue("--pso-compact-chat-left")).toBe("40px");
        expect(document.body.style.getPropertyValue("--pso-compact-chat-top")).toBe("60px");

        await userEvent.click(screen.getByTestId("pso-compact-hex-restore"));
        await waitFor(() => expect(document.body).not.toHaveClass("pso-compact-chat-placed"));
    });

    it("enters compact chat from the title bar button and opens the main menu there with F12", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        await userEvent.click(screen.getByTestId("pso-titlebar-compact-chat-btn"));
        expect(document.body).toHaveClass("pso-compact-chat-mode");

        await userEvent.keyboard("{F12}");
        expect(screen.getByTestId("pso-full-game-menu")).toBeInTheDocument();

        await userEvent.click(screen.getByTestId("pso-compact-hex-restore"));
        await waitFor(() => expect(document.body).not.toHaveClass("pso-compact-chat-mode"));
        await waitFor(() => expect(screen.queryByTestId("pso-full-game-menu")).toBeNull());
    });

    it("closes the right panel when entering compact chat and reopens it on restore", async () => {
        sdkContext.roomViewStore.getRoomId = () => "!room:example.org";
        const isOpen = vi.spyOn(RightPanelStore.instance, "isOpenForRoom").mockReturnValue(true);
        const hide = vi.spyOn(RightPanelStore.instance, "hide").mockImplementation(() => {});
        const show = vi.spyOn(RightPanelStore.instance, "show").mockImplementation(() => {});
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        await userEvent.click(screen.getByTestId("pso-compact-chat-toggle"));
        expect(hide).toHaveBeenCalledWith("!room:example.org");

        isOpen.mockReturnValue(false);
        await userEvent.click(screen.getByTestId("pso-compact-hex-restore"));
        await waitFor(() => expect(show).toHaveBeenCalledWith("!room:example.org"));
    });

    it("opens the HUD & Wallpaper Tuner popover to adjust glass opacity and CRT scanlines", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        await userEvent.click(screen.getByTestId("pso-tuner-toggle"));
        expect(screen.getByTestId("pso-tuner-popover")).toBeInTheDocument();
        expect(screen.getByText(/HUD & Wallpaper Tuner/i)).toBeInTheDocument();
    });

    it("ignores F12 on the normal chat screen", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        await userEvent.keyboard("{F12}");
        expect(screen.queryByTestId("pso-full-game-menu")).toBeNull();
        expect(screen.queryByTestId("pso-titlebar-game-menu-btn")).toBeNull();
    });

    it("opens the PSOBB main menu with F12 in the lobby and drives it with the keyboard", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);
        await userEvent.click(screen.getByRole("button", { name: "Toggle 3D Pioneer 2 Lobby" }));

        expect(screen.queryByTestId("pso-full-game-menu")).toBeNull();

        await userEvent.keyboard("{F12}");
        expect(screen.getByTestId("pso-full-game-menu")).toBeInTheDocument();
        expect(document.body).toHaveClass("pso-gamemenu-open");
        expect(screen.getByTestId("pso-gm-help")).toHaveTextContent("Equip weapons or use items here.");

        // Rows are revealed one at a time by the opening animation.
        expect(await screen.findByTestId("pso-gamemenu-tab-quit")).toBeInTheDocument();
        expect(screen.getByTestId("pso-gamemenu-tab-item_pack")).toHaveClass("pso-gm-row--active");

        await userEvent.keyboard("{ArrowDown}");
        expect(screen.getByTestId("pso-gamemenu-tab-customize")).toHaveClass("pso-gm-row--active");
        await userEvent.keyboard("{ArrowUp}{Enter}");
        expect(screen.getByTestId("pso-gm-sub-menu")).toBeInTheDocument();
        await userEvent.keyboard("{Enter}");
        expect(screen.getByTestId("pso-gm-detail-equip")).toBeInTheDocument();

        expect(screen.getByTestId("pso-gm-status-page")).toHaveTextContent("1/7");
        await userEvent.click(screen.getByTestId("pso-gm-status-next"));
        expect(screen.getByTestId("pso-gm-status-page")).toHaveTextContent("2/7");

        await userEvent.keyboard("{Escape}{Escape}");
        expect(screen.queryByTestId("pso-gm-sub-menu")).toBeNull();
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByTestId("pso-full-game-menu")).toBeNull());
        expect(document.body).not.toHaveClass("pso-gamemenu-open");
    });

    it("opens the menu at a section from the function key bar", async () => {
        localStorage.setItem("pso_hud_show_fkey_bar", "true");
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);
        await userEvent.click(screen.getByRole("button", { name: "Toggle 3D Pioneer 2 Lobby" }));

        expect(screen.getByTestId("pso-fkey-strip")).toBeInTheDocument();
        await userEvent.keyboard("{F3}");
        expect(await screen.findByTestId("pso-gm-detail-technique")).toBeInTheDocument();
        expect(screen.getByText("Foie")).toBeInTheDocument();
    });
});
