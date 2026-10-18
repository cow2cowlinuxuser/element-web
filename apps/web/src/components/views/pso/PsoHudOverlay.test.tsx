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
        expect(screen.getByText("Shichimiya")).toBeInTheDocument();
    });

    it("toggles Episode IV Stream Overlay mode and reveals the compact top-left Hunter Status HUD", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        expect(screen.queryByTestId("pso-status-hud")).toBeNull();

        await userEvent.click(screen.getByTestId("pso-stream-overlay-toggle"));
        expect(document.body).toHaveClass("pso-stream-overlay-mode");
        expect(screen.getByTestId("pso-status-hud")).toBeInTheDocument();
        expect(screen.getByText("1345/1345")).toBeInTheDocument();
        expect(screen.getByText("2698/2927")).toBeInTheDocument();
    });

    it("opens the HUD & Wallpaper Tuner popover to adjust glass opacity and CRT scanlines", async () => {
        const PsoHudOverlay = wrapInSdkContext(UnwrappedPsoHudOverlay, sdkContext);
        render(<PsoHudOverlay />);

        await userEvent.click(screen.getByTestId("pso-tuner-toggle"));
        expect(screen.getByTestId("pso-tuner-popover")).toBeInTheDocument();
        expect(screen.getByText(/HUD & Wallpaper Tuner/i)).toBeInTheDocument();
    });
});
