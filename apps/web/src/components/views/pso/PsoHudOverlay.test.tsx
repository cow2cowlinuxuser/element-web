/*
Copyright 2026 Element Creations Ltd.

SPDX-License-Identifier: AGPL-3.0-only OR GPL-3.0-only OR LicenseRef-Element-Commercial
Please see LICENSE files in the repository root for full details.
*/

// @vitest-environment happy-dom

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "test-utils-rtl";
import userEvent from "@testing-library/user-event";
import { stubClient, TestSDKContext, wrapInSdkContext } from "test-utils";

import { PsoHudOverlay as UnwrappedPsoHudOverlay } from "./PsoHudOverlay";
import { CallStore } from "../../../stores/CallStore";
import { OwnProfileStore } from "../../../stores/OwnProfileStore";

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
        expect(screen.getByTestId("pso-beat-time")).toHaveTextContent(/internet time/i);
        expect(document.body).toHaveClass("pso-hud-theme");

        // Clicking hex slot 1 triggers the Shichimiya Rappy Symbol Chat popup
        await userEvent.click(screen.getByTestId("pso-hex-slot-1"));
        expect(screen.getByTestId("pso-symbol-chat-toast")).toBeInTheDocument();
        expect(screen.getByText(/Shichimiya/i)).toBeInTheDocument();
    });

    it("toggles Episode IV Stream Overlay mode and reveals the compact top-left Hunter Status HUD", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        expect(screen.queryByTestId("pso-status-hud")).toBeNull();

        await userEvent.click(screen.getByTestId("pso-stream-overlay-toggle"));
        expect(document.body).toHaveClass("pso-stream-overlay-mode");
        expect(screen.getByTestId("pso-status-hud")).toBeInTheDocument();
        expect(screen.getByText("PING")).toBeInTheDocument();
        expect(screen.getByText("VOICE")).toBeInTheDocument();
    });

    it("shows the top-left player overlay in compact chat and allows hiding and restoring title bar and overlays", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        expect(screen.queryByTestId("pso-status-hud")).toBeNull();

        await userEvent.click(screen.getByTestId("pso-compact-chat-toggle"));
        expect(document.body).toHaveClass("pso-compact-chat-mode");
        expect(screen.getByTestId("pso-status-hud")).toBeInTheDocument();

        // Hide top title bar and overlays via title bar button
        await userEvent.click(screen.getByTestId("pso-compact-hide-overlays-btn"));
        expect(document.body).toHaveClass("pso-compact-overlays-hidden");
        expect(screen.queryByTestId("pso-status-hud")).toBeNull();
        expect(screen.queryByTestId("pso-hex-quickbar")).toBeNull();

        // Restore all compacted elements via bottom-right restore button below focused chat
        await userEvent.click(screen.getByTestId("pso-compact-restore-overlays-btn"));
        expect(document.body).not.toHaveClass("pso-compact-overlays-hidden");
        expect(screen.getByTestId("pso-status-hud")).toBeInTheDocument();
        expect(screen.getByTestId("pso-hex-quickbar")).toBeInTheDocument();
    });

    it("opens the HUD & Wallpaper Tuner popover to adjust glass opacity and CRT scanlines", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        await userEvent.click(screen.getByTestId("pso-tuner-toggle"));
        expect(screen.getByTestId("pso-tuner-popover")).toBeInTheDocument();
        expect(screen.getByText(/HUD & Wallpaper Tuner/i)).toBeInTheDocument();
    });

    it("opens the extracted PSOBB F12 Full Game Menu and navigates between Item Pack, Technique, Mag, Status, and Guild Card", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        expect(screen.queryByTestId("pso-full-game-menu")).toBeNull();

        await userEvent.click(screen.getByTestId("pso-titlebar-game-menu-btn"));
        expect(screen.getByTestId("pso-full-game-menu")).toBeInTheDocument();
        expect(screen.getAllByText(/MAIN MENU/i).length).toBeGreaterThan(0);

        // Navigate to Technique tab (`F3`)
        await userEvent.click(screen.getByTestId("pso-gamemenu-tab-technique"));
        expect(screen.getByText(/LEARNED PSOBB TECHNIQUES/i)).toBeInTheDocument();

        // Navigate to Status tab (`F10`)
        await userEvent.click(screen.getByTestId("pso-gamemenu-tab-status"));
        expect(screen.getByText(/MATRIX HOMESERVER PING/i)).toBeInTheDocument();

        // Close Full Game Menu
        await userEvent.click(screen.getByTestId("pso-full-game-menu-close"));
        expect(screen.queryByTestId("pso-full-game-menu")).toBeNull();
    });
});
